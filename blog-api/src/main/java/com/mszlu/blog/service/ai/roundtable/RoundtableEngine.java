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
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
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
    @Qualifier("aiExecutor")
    private Executor aiExecutor;

    /** 带入下一位发言者上下文的最近发言条数（滑动窗口） */
    private static final int CONTEXT_SPEECHES = 12;
    /** 单条发言伪流式切片字符数 */
    private static final int CHUNK_CHARS = 8;
    /** 切片推送间隔（毫秒），营造打字感 */
    private static final long CHUNK_INTERVAL_MS = 24L;
    /** 每次间隙最多吐出的人类插话条数，防止刷屏 */
    private static final int MAX_INTERJECTIONS_PER_DRAIN = 3;

    /** 无限讨论：至少跑这么多轮才允许判定达成共识（避免第一轮就草草收场） */
    private static final int MIN_ROUNDS_BEFORE_JUDGE = 2;
    /** 无限讨论：综合均分达到此阈值视为达成共识，自动收尾 */
    private static final int COMPLETE_AVG_THRESHOLD = 75;
    /** 无限讨论：硬上限轮数，超过强制收尾（防烧 token） */
    private static final int MAX_ROUNDS = 20;

    /** 六个评分维度，顺序即前端展示顺序 */
    private static final String[] SCORE_KEYS = {"conclusion", "evidence", "diversity", "focus", "interaction", "practical"};

    /** 在 aiExecutor 线程上跑完一整场会议 */
    public void run(RoundtableSession session, SseEmitter emitter) {
        aiExecutor.execute(() -> {
            boolean dead = false;
            try {
                emitMeta(session, emitter);

                // 1. 主持人开场
                String open = callHost(session,
                        "会议刚开始。请用一两句话点题、说明讨论规则（每人简短发言，讨论会持续到众人形成共识为止，议题主人也可随时要求结束），并请玛德琳先发言。");
                dead = pushSpeech(emitter, session, RoundtablePersonas.HOST, "host", open);
                if (dead) return;

                // 2. 无限讨论：每轮 5 个 AI 依次发言 → 第 2 轮起每轮结束评审一次，
                //    综合均分 ≥ 阈值则视为达成共识自动收尾；硬上限 MAX_ROUNDS 兜底。
                int round = 0;
                Map<String, Object> finalScore = null;
                while (!session.isStopRequested() && round < MAX_ROUNDS) {
                    round++;
                    dead = emit(emitter, "round", mapOf("round", round, "rounds", 0));
                    if (dead) return;

                    for (RoundtablePersonas p : RoundtablePersonas.aiSpeakers()) {
                        if (session.isStopRequested()) break;
                        List<String> userSaid = drainInterjections(emitter, session);
                        if (userSaid == null) return; // 连接已死

                        // 点名规则：人类插话里点名了某角色，该角色「额外插队」立即回应（不顶替本轮正常席位）
                        RoundtablePersonas forced = null;
                        for (String text : userSaid) {
                            RoundtablePersonas m = RoundtablePersonas.matchMention(text);
                            if (m != null) forced = m;
                        }
                        String addressedQuestion = forced == null ? null : userSaid.get(userSaid.size() - 1);

                        List<RoundtablePersonas> turnTargets = new ArrayList<>();
                        if (forced != null && forced != p) turnTargets.add(forced);
                        turnTargets.add(p);
                        for (int ti = 0; ti < turnTargets.size(); ti++) {
                            if (session.isStopRequested()) break;
                            RoundtablePersonas target = turnTargets.get(ti);
                            // 只有插队的那次是"回答点名"；后面正常轮转走普通发言指令
                            String question = (forced != null && target == forced && ti == 0) ? addressedQuestion : null;

                            // 准备发言：前端把该角色卡片切成「准备发言」
                            dead = emit(emitter, "turn_prepare", mapOf("speakerId", target.getId()));
                            if (dead) return;

                            String content = callSpeaker(session, target, round, question);
                            if (content == null || content.trim().isEmpty()) {
                                // 单个角色失败不毁掉整场：提示后跳过
                                dead = emit(emitter, "notice", mapOf("text", target.getName() + " 这轮没接上话，先跳过。"));
                                if (dead) return;
                                continue;
                            }
                            dead = pushSpeech(emitter, session, target, "ai", content.trim());
                            if (dead) return;
                        }
                    }

                    // 第 2 轮起，每轮结束评审一次：均分达标 → 达成共识，复用本次评审结果收尾
                    if (round >= MIN_ROUNDS_BEFORE_JUDGE && !session.isStopRequested()) {
                        Map<String, Object> score = judge(session);
                        if (score != null && !Boolean.TRUE.equals(score.get("fallback"))) {
                            int avg = (int) score.get("avg");
                            if (avg >= COMPLETE_AVG_THRESHOLD) {
                                finalScore = score;
                                break;
                            }
                        }
                        // 未达标则丢弃本次评审，继续下一轮
                    }
                }
                session.setRounds(round);

                // 3. 收尾前再放一批人类插话
                drainInterjections(emitter, session);

                // 4. 主持人自然语言总结（禁止 JSON 原文展示：总结本身就是自然语言）
                String closing = callHost(session,
                        "讨论结束。请用口语化的一小段做总结：共识是什么、主要分歧是什么、给用户的可行建议是什么。不要分点、不要 JSON。");
                if (closing != null && !closing.trim().isEmpty()) {
                    dead = pushSpeech(emitter, session, RoundtablePersonas.HOST, "host", closing.trim());
                    if (dead) return;
                }

                // 5. 评审打分：若循环内已因达成共识拿到评分则复用，否则（stop / 到上限）现评一次
                if (finalScore == null) {
                    emit(emitter, "notice", mapOf("text", "评审中…"));
                    finalScore = judge(session);
                }
                session.setScore(finalScore);
                dead = emit(emitter, "score", finalScore);
                if (dead) return;

                session.setStatus(session.isStopRequested() ? "ABORTED" : "FINISHED");
                Map<String, Object> done = new LinkedHashMap<>();
                done.put("sessionId", session.getId());
                done.put("topic", session.getTopic());
                done.put("status", session.getStatus());
                done.put("rounds", round);
                done.put("transcript", session.getTranscript());
                done.put("score", finalScore);
                emit(emitter, "done", done);
            } catch (Exception e) {
                log.warn("圆桌会议异常 sessionId={}, userId={}", session.getId(), session.getUserId(), e);
                emit(emitter, "error", mapOf("text", "会议中断：" + e.getMessage()));
            } finally {
                emitter.complete();
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
            user.append("注意：人类用户刚刚点名叫你（").append(p.getName()).append("）发言，原话是：「")
                .append(addressedQuestion).append("」\n");
            user.append("你必须直接回答 TA 的问题或回应 TA 的观点，不许回避、不许转给别人。直接说内容：\n");
        } else if (record.isEmpty()) {
            user.append("目前还没有人发言，你是第一个，请直接针对议题亮明你的态度。\n");
        } else {
            user.append("目前为止的讨论记录：\n").append(record).append("\n");
            user.append("现在轮到你（").append(p.getName()).append("）发言。针对上面某人的观点回应，1~3 句话，直接说内容：\n");
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

    /** 一条发言：turn_start → 若干 delta（伪流式逐字）→ turn_end，同时入逐字稿 */
    private boolean pushSpeech(SseEmitter emitter, RoundtableSession session,
                               RoundtablePersonas persona, String role, String content) throws InterruptedException {
        long ts = System.currentTimeMillis();
        boolean dead = emit(emitter, "turn_start", mapOf(
                "speakerId", persona.getId(), "role", role, "name", persona.getName(),
                "color", persona.getColor(), "ts", ts));
        if (dead) return true;

        // 切片推送
        int len = content.length();
        for (int i = 0; i < len; i += CHUNK_CHARS) {
            int end = Math.min(i + CHUNK_CHARS, len);
            dead = emit(emitter, "delta", mapOf("speakerId", persona.getId(), "text", content.substring(i, end)));
            if (dead) return true;
            Thread.sleep(CHUNK_INTERVAL_MS);
        }

        session.addSpeech(persona.getId(), persona.getName(), persona.getColor(), role, content);
        dead = emit(emitter, "turn_end", mapOf("speakerId", persona.getId(), "ts", ts));
        return dead;
    }

    /**
     * 人类插话：队列里的内容作为 user 发言广播并入逐字稿（不切片，本身就是完整文本）。
     * @return 本次吐出的插话文本（空列表=没有）；null 表示 SSE 连接已死
     */
    private List<String> drainInterjections(SseEmitter emitter, RoundtableSession session) {
        List<String> pending = new ArrayList<>();
        session.getInterjections().drainTo(pending, MAX_INTERJECTIONS_PER_DRAIN);
        for (String text : pending) {
            long ts = System.currentTimeMillis();
            boolean dead = emit(emitter, "turn_start", mapOf(
                    "speakerId", "user", "role", "user", "name", session.getUserNickname(),
                    "color", RoundtablePersonas.USER.getColor(), "ts", ts));
            if (dead) return null;
            dead = emit(emitter, "delta", mapOf("speakerId", "user", "text", text));
            if (dead) return null;
            session.addSpeech("user", session.getUserNickname(),
                    RoundtablePersonas.USER.getColor(), "user", text);
            dead = emit(emitter, "turn_end", mapOf("speakerId", "user", "ts", ts));
            if (dead) return null;
        }
        return pending;
    }

    private void emitMeta(RoundtableSession session, SseEmitter emitter) {
        List<Map<String, Object>> seats = new ArrayList<>();
        for (RoundtablePersonas p : RoundtablePersonas.seats()) {
            seats.add(p.toMeta());
        }
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("sessionId", session.getId());
        meta.put("topic", session.getTopic());
        meta.put("rounds", 0); // 0 = 无限模式，实际轮数在 done 事件里返回
        meta.put("speakers", seats);
        emit(emitter, "meta", meta);
    }

    /** 发一个 SSE 事件；IOException 说明连接已死，返回 true */
    private boolean emit(SseEmitter emitter, String eventName, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
            return false;
        } catch (IOException | IllegalStateException e) {
            log.debug("圆桌 SSE 发送失败 event={}, err={}", eventName, e.getMessage());
            return true;
        }
    }

    private static Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }
}
