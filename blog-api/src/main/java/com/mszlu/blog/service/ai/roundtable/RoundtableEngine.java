package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;

/**
 * 圆桌讨论引擎（demo 版）。
 *
 * 职责：按轮次驱动 5 个 AI 角色依次发言 → 接收人类插话 → 主持人开场/收尾 → 评审打分，
 * 全程通过 SSE 事件推给前端。单个角色的 AI 调用是非流式的（复用现有 AiClient），
 * 拿到完整发言后在服务端切片 + delta 事件做「逐字浮现」效果（伪流式）。
 *
 * 上下文策略：滑动窗口（最近 12 条发言）。后续可在此基础上叠加滚动摘要。
 */
@Component
@Slf4j
public class RoundtableEngine {

    @Autowired
    private AiClient aiClient;

    @Autowired
    private TurnScheduler turnScheduler;

    @Autowired
    private ConsensusTracker consensusTracker;

    @Autowired
    @Qualifier("aiExecutor")
    private Executor aiExecutor;

    /** 带入下一位发言者上下文的最近发言条数（滑动窗口） */
    private static final int CONTEXT_SPEECHES = 12;
    /** 单条发言伪流式切片字符数 */
    private static final int CHUNK_CHARS = 8;
    /** 切片推送间隔（毫秒），营造打字感 */
    private static final long CHUNK_INTERVAL_MS = 24L;
    /** owner 连接抖动后等待 SSE 自动重连的宽限期（毫秒），宽限内恢复则会议继续且事件补发 */
    private static final long OWNER_RECONNECT_GRACE_MS = 3000L;
    /** 每次间隙最多吐出的人类插话条数，防止刷屏 */
    private static final int MAX_INTERJECTIONS_PER_DRAIN = 3;

    /** 每 N 条发言推送一次共识/分歧 pulse */
    private static final int PULSE_EVERY = 2;
    /** 第几条发言起开始触发评审 */
    private static final int REVIEW_START = 12;
    /** 评审间隔 */
    private static final int REVIEW_EVERY = 6;
    /** 评审均分 ≥ 此阈值视为达成共识，自动收尾 */
    private static final int COMPLETE_AVG_THRESHOLD = 75;
    /** 硬上限发言条数（防烧 token） */
    private static final int MAX_SPEECHES = 120;

    /** 六个评分维度，顺序即前端展示顺序 */
    private static final String[] SCORE_KEYS = {"conclusion", "evidence", "diversity", "focus", "interaction", "practical"};

    /** 在 aiExecutor 线程上跑完一整场会议 */
    public void run(RoundtableSession session) {
        aiExecutor.execute(() -> {
            // 幂等闸门：SSE 自动重连可能让同一场会议的 stream 被请求多次，
            // 但引擎只能有一个，否则整场讨论会重播。
            if (!session.tryStartEngine()) {
                log.info("圆桌会议引擎已在运行，忽略重复触发 sessionId={}", session.getId());
                return;
            }
            try {
                emitMeta(session);

                // 1. 主持人开场
                String open = callHost(session,
                        "会议刚开始。请用一两句话点题、说明讨论规则（每人简短发言，讨论会持续到众人形成共识为止，议题主人也可随时要求结束），并请 Madeline 先发言。称呼其他角色时一律用英文名。");
                if (pushSpeech(session, RoundtablePersonas.HOST, "host", open)) return;

                // 2. 自主调度循环：TurnScheduler 选下一位发言者，
                //    每 2 条发言推一次共识 pulse，第 12 条起每 6 条评审一次，达成共识自动收尾。
                Map<String, Object> finalScore = null;
                int speechCount = session.getSpeechCount();
                int round = 0;
                while (!session.isStopRequested() && session.isOwnerConnected() && speechCount < MAX_SPEECHES) {
                    round++;

                    // 处理人类插话
                    List<String> userSaid = drainInterjections(session);
                    if (userSaid == null) return;
                    String forcedId = null;
                    String addressedQuestion = null;
                    for (String text : userSaid) {
                        RoundtablePersonas m = RoundtablePersonas.matchMention(text);
                        if (m != null) { forcedId = m.getId(); addressedQuestion = text; }
                    }

                    // 调度下一位发言者
                    TurnScheduler.ScheduleResult sched = turnScheduler.schedule(session, forcedId);
                    RoundtablePersonas target = RoundtablePersonas.byId(sched.getSpeakerId());
                    if (target == null) {
                        Thread.sleep(200);
                        speechCount = session.getSpeechCount();
                        continue;
                    }

                    if (broadcast(session, "turn_prepare", mapOf(
                            "speakerId", target.getId(), "action", sched.getAction(),
                            "publicNote", sched.getPublicNote()))) return;

                    String question = (forcedId != null && forcedId.equals(target.getId())) ? addressedQuestion : null;
                    String content = callSpeaker(session, target, round, question);
                    if (content == null || content.trim().isEmpty()) {
                        // 调度/生成过程属于内部事件，不在 transcript 展示（FR-8），静默跳过
                        speechCount = session.getSpeechCount();
                        continue;
                    }
                    if (pushSpeech(session, target, "ai", content.trim())) return;
                    speechCount = session.getSpeechCount();

                    // pulse：每 PULSE_EVERY 条发言
                    if (speechCount % PULSE_EVERY == 0) {
                        Map<String, Object> pulse = consensusTracker.update(session);
                        if (broadcast(session, "pulse", pulse)) return;
                    }

                    // 评审：第 REVIEW_START 条起每 REVIEW_EVERY 条
                    if (speechCount >= REVIEW_START && (speechCount - REVIEW_START) % REVIEW_EVERY == 0) {
                        Map<String, Object> score = judge(session);
                        if (score != null && !Boolean.TRUE.equals(score.get("fallback"))) {
                            int avg = (int) score.get("avg");
                            if (avg >= COMPLETE_AVG_THRESHOLD) {
                                finalScore = score;
                                break;
                            }
                        }
                    }
                }
                session.setRounds(round);

                drainInterjections(session);

                String closing = callHost(session,
                        "讨论结束。请用口语化的一小段做总结：共识是什么、主要分歧是什么、给用户的可行建议是什么。不要分点、不要 JSON。");
                if (closing != null && !closing.trim().isEmpty()) {
                    if (pushSpeech(session, RoundtablePersonas.HOST, "host", closing.trim())) return;
                }

                if (finalScore == null) {
                    // 评审过程是内部事件，不向前端广播 notice（FR-8）
                    finalScore = judge(session);
                }
                session.setScore(finalScore);
                broadcast(session, "score", finalScore);

                session.setStatus(session.isStopRequested() ? "ABORTED" : "FINISHED");
                Map<String, Object> done = new LinkedHashMap<>();
                done.put("sessionId", session.getId());
                done.put("topic", session.getTopic());
                done.put("status", session.getStatus());
                done.put("rounds", round);
                done.put("transcript", session.getTranscript());
                done.put("score", finalScore);
                broadcast(session, "done", done);
            } catch (Exception e) {
                log.warn("圆桌会议异常 sessionId={}, userId={}", session.getId(), session.getUserId(), e);
                broadcast(session, "error", mapOf("text", "会议中断：" + e.getMessage()));
            }
        });
    }

    // ==================== 发言调用 ====================

    /**
     * 调某个 AI 角色，返回纯文本发言（失败返回 null）。
     * @param addressedQuestion 非空表示人类用户刚刚点名叫这个角色，必须直接回答该问题
     */
    private String callSpeaker(RoundtableSession session, RoundtablePersonas p, int round, String addressedQuestion) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", p.systemPrompt()));

        StringBuilder user = new StringBuilder();
        user.append("议题：").append(session.getTopic()).append("\n");
        user.append("这是第 ").append(round).append(" 轮发言（讨论会持续到达成共识为止）。\n");
        String record = recentRecord(session);
        if (addressedQuestion != null) {
            // 点名插队：最后一条就是人类的问题，要求直接回应
            user.append("目前为止的讨论记录：\n").append(record).append("\n");
            user.append("注意：人类用户刚刚点名叫你（").append(p.getEnName()).append("）发言，原话是：「")
                .append(addressedQuestion).append("」\n");
            user.append("你必须直接回答 TA 的问题或回应 TA 的观点，不许回避、不许转给别人。直接说内容：\n");
        } else if (record.isEmpty()) {
            user.append("目前还没有人发言，你是第一个，请直接针对议题亮明你的态度和理由。\n");
        } else {
            user.append("目前为止的讨论记录：\n").append(record).append("\n");
            user.append("现在轮到你（").append(p.getEnName())
                .append("）发言。请围绕议题给出新的推进：没人提过的角度、具体理由、反例、可执行建议，" +
                        "或推动大家走向结论。只讲一个你认为最关键的点，不许罗列两三条建议；" +
                        "直接开口说你的内容，不要先总结别人说过什么，严禁复述原话。" +
                        "1~2 句话、不超过 60 个字，直接说：\n");
        }
        msgs.add(new AiMessage("user", user.toString()));
        return aiClient.chat(msgs, false);
    }

    /** 调主持人 */
    private String callHost(RoundtableSession session, String instruction) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", RoundtablePersonas.hostPrompt(session.getTopic())));
        StringBuilder user = new StringBuilder();
        String record = recentRecord(session);
        if (!record.isEmpty()) {
            user.append("讨论记录：\n").append(record).append("\n\n");
        }
        user.append(instruction);
        msgs.add(new AiMessage("user", user.toString()));
        return aiClient.chat(msgs, false);
    }

    /** 滑动窗口：最近 N 条发言，压成纯文本；人类发言特殊标注，让 AI 识别其权重 */
    private String recentRecord(RoundtableSession session) {
        List<Map<String, Object>> all = session.getTranscript();
        int from = Math.max(0, all.size() - CONTEXT_SPEECHES);
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < all.size(); i++) {
            Map<String, Object> m = all.get(i);
            if ("user".equals(m.get("role"))) {
                sb.append("【你（议题主人·人类）】").append(m.get("content")).append("\n");
            } else {
                sb.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
            }
        }
        return sb.toString().trim();
    }

    // ==================== 评审 ====================

    private Map<String, Object> judge(RoundtableSession session) {
        Map<String, Object> fallback = fallbackScore("评审服务暂时不可用，以下为占位评分。");
        StringBuilder record = new StringBuilder();
        for (Map<String, Object> m : session.getTranscript()) {
            record.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
        }
        if (record.length() > 6000) {
            record.setLength(6000);
        }
        String raw = aiClient.chat(java.util.Collections.singletonList(
                new AiMessage("user", PromptBuilder.roundtableJudgePrompt(session.getTopic(), record.toString()))), true);
        if (raw == null) return fallback;
        try {
            JSONObject json = JSON.parseObject(raw);
            JSONObject scores = json.getJSONObject("scores");
            Map<String, Integer> scoreMap = new LinkedHashMap<>();
            int sum = 0;
            for (String key : SCORE_KEYS) {
                int v = clamp(scores == null ? null : scores.getInteger(key), 0, 100);
                scoreMap.put(key, v);
                sum += v;
            }
            int avg = Math.round(sum / (float) SCORE_KEYS.length);
            List<String> todos = new ArrayList<>();
            JSONArray arr = json.getJSONArray("todos");
            if (arr != null) {
                for (int i = 0; i < arr.size() && todos.size() < 4; i++) {
                    String t = arr.getString(i);
                    if (t != null && !t.trim().isEmpty()) todos.add(t.trim());
                }
            }
            String comment = json.getString("comment");
            if (comment == null || comment.trim().isEmpty()) comment = "（评审未给出综评）";

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("scores", scoreMap);
            out.put("avg", avg);
            out.put("grade", gradeOf(avg));
            out.put("comment", comment.trim());
            out.put("todos", todos);
            return out;
        } catch (Exception e) {
            log.warn("圆桌评审 JSON 解析失败，使用占位评分: {}", e.getMessage());
            return fallback;
        }
    }

    /** AI 评审不可用时的兜底：保证评级卡片永远能渲染 */
    private Map<String, Object> fallbackScore(String comment) {
        Map<String, Integer> scoreMap = new LinkedHashMap<>();
        int sum = 0;
        for (String key : SCORE_KEYS) {
            scoreMap.put(key, 75);
            sum += 75;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scores", scoreMap);
        out.put("avg", 75);
        out.put("grade", "B");
        out.put("comment", comment);
        out.put("todos", new ArrayList<String>());
        out.put("fallback", true);
        return out;
    }

    private String gradeOf(int avg) {
        if (avg >= 90) return "S";
        if (avg >= 80) return "A";
        if (avg >= 70) return "B";
        return "C";
    }

    private int clamp(Integer v, int min, int max) {
        if (v == null) return 70;
        return Math.max(min, Math.min(max, v));
    }

    // ==================== SSE 推送 ====================

    /**
     * 实时发言事件的统一出口：广播失败（owner 连接刚断）时先给一个重连宽限期，
     * 宽限内连接恢复则把该事件补发给新订阅者并继续会议；宽限后仍断线才终止。
     * 这样网络瞬断 / EventSource 自动重连既不会重播整场，也不会丢失当前发言。
     */
    private boolean sendEvent(RoundtableSession session, String eventName, Object payload)
            throws InterruptedException {
        if (broadcast(session, eventName, payload)) {
            Thread.sleep(OWNER_RECONNECT_GRACE_MS);
            if (!session.isOwnerConnected()) return true;
            broadcast(session, eventName, payload);   // 重连已恢复：向新 emitter 补发
        }
        return false;
    }

    /** 一条发言：turn_start → 若干 delta（伪流式逐字）→ turn_end，同时入逐字稿 */
    private boolean pushSpeech(RoundtableSession session,
                               RoundtablePersonas persona, String role, String content) throws InterruptedException {
        long ts = System.currentTimeMillis();
        if (sendEvent(session, "turn_start", mapOf(
                "speakerId", persona.getId(), "role", role, "name", persona.getEnName(),
                "color", persona.getColor(), "ts", ts))) return true;

        int len = content.length();
        for (int i = 0; i < len; i += CHUNK_CHARS) {
            int end = Math.min(i + CHUNK_CHARS, len);
            if (sendEvent(session, "delta", mapOf("speakerId", persona.getId(), "text", content.substring(i, end))))
                return true;
            Thread.sleep(CHUNK_INTERVAL_MS);
        }

        session.addSpeech(persona.getId(), persona.getEnName(), persona.getColor(), role, content);
        return sendEvent(session, "turn_end", mapOf("speakerId", persona.getId(), "ts", ts));
    }

    private List<String> drainInterjections(RoundtableSession session) throws InterruptedException {
        List<String> pending = new ArrayList<>();
        session.getInterjections().drainTo(pending, MAX_INTERJECTIONS_PER_DRAIN);
        for (String text : pending) {
            long ts = System.currentTimeMillis();
            if (sendEvent(session, "turn_start", mapOf(
                    "speakerId", "user", "role", "user", "name", session.getUserNickname(),
                    "color", RoundtablePersonas.USER.getColor(), "ts", ts))) return null;
            if (sendEvent(session, "delta", mapOf("speakerId", "user", "text", text))) return null;
            session.addSpeech("user", session.getUserNickname(),
                    RoundtablePersonas.USER.getColor(), "user", text);
            if (sendEvent(session, "turn_end", mapOf("speakerId", "user", "ts", ts))) return null;
        }
        return pending;
    }

    private void emitMeta(RoundtableSession session) {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("sessionId", session.getId());
        meta.put("topic", session.getTopic());
        meta.put("rounds", 0);
        meta.put("speakers", RosterBuilder.build(session));
        broadcast(session, "meta", meta);
    }

    /** 广播一个事件到总线；owner 已断连返回 true */
    private boolean broadcast(RoundtableSession session, String eventName, Object payload) {
        session.getBus().broadcast(eventName, payload);
        return !session.isOwnerConnected();
    }

    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }
}
