package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.mapper.RoundtableSessionMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.RoundtableSessionEntity;
import com.mszlu.blog.service.AgentTraceService;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.vo.ContextChunk;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadLocalRandom;

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
    private MemoryService memoryService;

    @Autowired
    private MemoryMapper memoryMapper;

    @Autowired
    private RoundtableSessionMapper sessionMapper;

    @Autowired
    private AgentTraceService agentTraceService;

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
    /** 第几条发言起开始触发评审（足够多轮后再评审，保证每人多次表达） */
    private static final int REVIEW_START = 20;
    /** 评审间隔 */
    private static final int REVIEW_EVERY = 8;
    /** 评审均分 ≥ 此阈值视为达成共识，自动收尾 */
    private static final int COMPLETE_AVG_THRESHOLD = 80;
    /** 硬上限发言条数（防烧 token） */
    private static final int MAX_SPEECHES = 120;
    /** 上一位发言动作偏对抗（反驳/追问）时的插话触发概率（%） */
    private static final int INTERJECT_AGGRESSIVE_PCT = 55;
    /** 普通发言后的插话触发概率（%） */
    private static final int INTERJECT_NORMAL_PCT = 25;
    /** 滑动窗口外每新增 N 条未摘要发言，触发一次增量滚动摘要 */
    private static final int SUMMARY_EVERY = 6;
    /** 滚动摘要总体积上限，超过则整体再压缩 */
    private static final int SUMMARY_MAX_CHARS = 400;
    /** 评审均分低于此值触发主持人反思追问 */
    private static final int REFLECT_BELOW = 70;

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

                // 0. 知识库检索：议题主人相关记忆/日记 + Celeste 公共设定，供全场引用
                List<ContextChunk> refs = retrieveReferences(session);

                // 1. 主持人开场
                String open = callHost(session, refs,
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
                    String content = callSpeaker(session, target, round, question, refs);
                    if (content == null || content.trim().isEmpty()) {
                        // 调度/生成过程属于内部事件，不在 transcript 展示（FR-8），静默跳过
                        speechCount = session.getSpeechCount();
                        continue;
                    }
                    if (pushSpeech(session, target, "ai", content.trim())) return;
                    speechCount = session.getSpeechCount();

                    // 自由插话：别人听完可以忍不住插一句（反驳/追问后概率更高）
                    if (speechCount < MAX_SPEECHES - 1) {
                        RoundtablePersonas interjector = pickInterjector(session, target, sched.getAction());
                        if (interjector != null) {
                            String inter = callInterjection(session, interjector, target, content.trim(), refs);
                            if (inter != null && !inter.trim().isEmpty()) {
                                if (pushSpeech(session, interjector, "ai", inter.trim())) return;
                                speechCount = session.getSpeechCount();
                            }
                        }
                    }

                    // 滚动摘要：旧发言掉出滑动窗口攒够一批就压一次，防止长会失忆
                    maybeUpdateSummary(session);

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
                            // 自我反思：分数不达标时主持人当众点短板并追问，推着讨论补课
                            if (avg < REFLECT_BELOW) {
                                String weak = String.valueOf(score.get("weakest"));
                                String reflect = callHost(session, refs,
                                        "刚结束的内部评审里，「" + dimLabel(weak) + "」这一项最弱（均分只有 " + avg + "）。"
                                        + "请用一两句话当众点出讨论在这个维度上的具体不足，并向最相关的人追问一句，"
                                        + "把讨论往实处推。这是中场追问，不是总结，不许收尾。称呼用英文名。");
                                if (reflect != null && !reflect.trim().isEmpty()) {
                                    if (pushSpeech(session, RoundtablePersonas.HOST, "host", reflect.trim())) return;
                                    trace(session, "reflect", "avg=" + avg + " weakest=" + weak, reflect.trim(), 0);
                                }
                            }
                        }
                    }
                }
                session.setRounds(round);

                drainInterjections(session);

                String closing = callHost(session, refs,
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

                // 散会收尾：落库 + 记忆沉淀（失败不影响已播完的会议）
                persistSession(session);
                extractMemories(session);
            } catch (Exception e) {
                log.warn("圆桌会议异常 sessionId={}, userId={}", session.getId(), session.getUserId(), e);
                broadcast(session, "error", mapOf("text", "会议中断：" + e.getMessage()));
                persistSession(session);
            }
        });
    }

    // ==================== 发言调用 ====================

    /**
     * 调某个 AI 角色，返回纯文本发言（失败返回 null）。
     * @param addressedQuestion 非空表示人类用户刚刚点名叫这个角色，必须直接回答该问题
     */
    private String callSpeaker(RoundtableSession session, RoundtablePersonas p, int round,
                               String addressedQuestion, List<ContextChunk> refs) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", p.systemPrompt()));

        StringBuilder user = new StringBuilder();
        user.append("议题：").append(session.getTopic()).append("\n");
        user.append("这是第 ").append(round).append(" 轮发言（讨论会持续到达成共识为止）。\n");
        String refBlock = referenceBlock(refs);
        if (!refBlock.isEmpty()) user.append(refBlock).append("\n");
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
                        "如果你不同意前面某位的观点，直接点名 TA（用英文名）反驳；想追问谁就向 TA 提问；" +
                        "直接开口说你的内容，不要先总结别人说过什么，严禁复述原话。" +
                        "1~2 句话、不超过 60 个字，直接说：\n");
        }
        msgs.add(new AiMessage("user", user.toString()));
        return aiClient.chat(msgs, false);
    }

    /**
     * 自由插话：某位角色听完上一位发言后忍不住快速插一句（一句、超短）。
     */
    private String callInterjection(RoundtableSession session, RoundtablePersonas interjector,
                                    RoundtablePersonas lastSpeaker, String lastContent, List<ContextChunk> refs) {
        try {
            List<AiMessage> msgs = new ArrayList<>();
            msgs.add(new AiMessage("system", interjector.systemPrompt()));
            StringBuilder user = new StringBuilder();
            user.append("议题：").append(session.getTopic()).append("\n");
            String refBlock = referenceBlock(refs);
            if (!refBlock.isEmpty()) user.append(refBlock).append("\n");
            user.append("刚刚 ").append(lastSpeaker.getEnName()).append(" 说：「").append(lastContent).append("」\n");
            user.append("自由讨论阶段，你听了没忍住要插一句话，不用等主持人点名。\n");
            user.append("只说一句、不超过 30 个字：可以点名反驳（用英文名）、追问一个细节、或顺着补一句关键的；" +
                    "不许重复任何人说过的观点。直接说：");
            msgs.add(new AiMessage("user", user.toString()));
            String out = aiClient.chat(msgs, false);
            return (out == null || out.trim().isEmpty()) ? null : out.trim();
        } catch (Exception e) {
            log.warn("插话生成失败（跳过本次插话）: {}", e.getMessage());
            return null;
        }
    }

    /** 调主持人 */
    private String callHost(RoundtableSession session, List<ContextChunk> refs, String instruction) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", RoundtablePersonas.hostPrompt(session.getTopic())));
        StringBuilder user = new StringBuilder();
        String refBlock = referenceBlock(refs);
        if (!refBlock.isEmpty()) user.append(refBlock).append("\n\n");
        String record = recentRecord(session);
        if (!record.isEmpty()) {
            user.append("讨论记录：\n").append(record).append("\n\n");
        }
        user.append(instruction);
        msgs.add(new AiMessage("user", user.toString()));
        return aiClient.chat(msgs, false);
    }

    // ==================== 知识库检索 ====================

    /** 会议开场时按议题做一次 RAG 检索（记忆 + 日记分片 + Celeste 设定），失败静默降级为空 */
    private List<ContextChunk> retrieveReferences(RoundtableSession session) {
        long t0 = System.currentTimeMillis();
        try {
            List<ContextChunk> refs = memoryService.searchContext(session.getUserId(), session.getTopic(), 6);
            refs = refs == null ? new ArrayList<>() : refs;
            StringBuilder labels = new StringBuilder();
            for (ContextChunk c : refs) labels.append("[").append(c.sourceLabel()).append("]");
            trace(session, "retrieve", "query=" + session.getTopic(),
                    refs.size() + "条 " + labels, System.currentTimeMillis() - t0);
            return refs;
        } catch (Exception e) {
            log.warn("圆桌知识库检索失败，跳过背景资料 sessionId={}: {}", session.getId(), e.getMessage());
            trace(session, "retrieve", "query=" + session.getTopic(), "error: " + e.getMessage(),
                    System.currentTimeMillis() - t0);
            return new ArrayList<>();
        }
    }

    /** 把检索结果压成 prompt 里的背景资料块；无结果返回空串 */
    private String referenceBlock(List<ContextChunk> refs) {
        if (refs == null || refs.isEmpty()) return "";
        StringBuilder sb = new StringBuilder("【背景资料】以下是从议题主人的记忆、日记和 Celeste 设定中检索到的相关真实素材，" +
                "引用时可以据此论证，但别逐字照搬、别报出处文件名；与议题无关的部分直接忽略：\n");
        for (ContextChunk c : refs) {
            sb.append("- [").append(c.sourceLabel()).append("] ").append(c.getText()).append("\n");
        }
        return sb.toString();
    }

    // ==================== 插话调度 ====================

    /**
     * 决定要不要在刚结束的发言后来一次插话，并选出插话人（发言次数最少的非上一发言人）。
     * 上一位动作是反驳/追问时概率更高，其余小概率随机。
     */
    private RoundtablePersonas pickInterjector(RoundtableSession session, RoundtablePersonas last, String action) {
        boolean aggressive = "反驳".equals(action) || "追问".equals(action);
        int pct = aggressive ? INTERJECT_AGGRESSIVE_PCT : INTERJECT_NORMAL_PCT;
        if (ThreadLocalRandom.current().nextInt(100) >= pct) {
            trace(session, "interject", "action=" + action + " pct=" + pct, "skip", 0);
            return null;
        }

        Map<String, Integer> counts = new HashMap<>();
        for (RoundtablePersonas p : RoundtablePersonas.aiSpeakers()) counts.put(p.getId(), 0);
        for (Map<String, Object> m : session.getTranscript()) {
            String rid = (String) m.get("speakerId");
            if (counts.containsKey(rid)) counts.put(rid, counts.get(rid) + 1);
        }
        RoundtablePersonas best = null;
        int bestCount = Integer.MAX_VALUE;
        for (RoundtablePersonas p : RoundtablePersonas.aiSpeakers()) {
            if (p.getId().equals(last.getId())) continue;
            int c = counts.get(p.getId());
            if (c < bestCount) { bestCount = c; best = p; }
        }
        trace(session, "interject", "action=" + action + " pct=" + pct,
                best == null ? "none" : best.getId(), 0);
        return best;
    }

    /** 滑动窗口：最近 N 条发言，压成纯文本；人类发言特殊标注，让 AI 识别其权重 */
    private String recentRecord(RoundtableSession session) {
        List<Map<String, Object>> all = session.getTranscript();
        int from = Math.max(0, all.size() - CONTEXT_SPEECHES);
        StringBuilder sb = new StringBuilder();
        String summary = session.getRollingSummary();
        if (!summary.isEmpty() && from > 0) {
            sb.append("（此前讨论的滚动摘要）\n").append(summary).append("\n\n");
        }
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

    // ==================== 滚动摘要 ====================

    /**
     * 旧发言掉出滑动窗口攒够 SUMMARY_EVERY 条就压一次增量摘要。
     * 只在 engine 线程调用（每轮一次），LLM 失败静默跳过，不影响发言。
     */
    private void maybeUpdateSummary(RoundtableSession session) {
        List<Map<String, Object>> all = session.getTranscript();
        int overflow = all.size() - CONTEXT_SPEECHES;
        if (overflow <= 0) return;
        if (overflow - session.getSummarizedUpTo() < SUMMARY_EVERY) return;

        long t0 = System.currentTimeMillis();
        try {
            StringBuilder older = new StringBuilder();
            for (int i = session.getSummarizedUpTo(); i < overflow; i++) {
                Map<String, Object> m = all.get(i);
                older.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
            }
            String raw = aiClient.chat(Collections.singletonList(new AiMessage("user",
                    PromptBuilder.roundtableSummaryPrompt(session.getTopic(), older.toString()))), false);
            if (raw != null && !raw.trim().isEmpty()) {
                String fresh = raw.trim();
                String prev = session.getRollingSummary();
                String merged = prev.isEmpty() ? fresh : prev + "\n" + fresh;
                if (merged.length() > SUMMARY_MAX_CHARS) {
                    String re = aiClient.chat(Collections.singletonList(new AiMessage("user",
                            "把下面的圆桌讨论摘要整体压缩到 " + SUMMARY_MAX_CHARS + " 字以内，"
                                    + "优先保留未解决的分歧、关键决定和用户的实际处境，只输出压缩结果：\n" + merged)), false);
                    merged = (re != null && !re.trim().isEmpty()) ? re.trim()
                            : merged.substring(merged.length() - SUMMARY_MAX_CHARS);
                }
                session.setRollingSummary(merged);
                session.setSummarizedUpTo(overflow);
                trace(session, "summary", older.toString(), merged, System.currentTimeMillis() - t0);
            }
        } catch (Exception e) {
            log.warn("圆桌滚动摘要失败（跳过）: {}", e.getMessage());
        }
    }

    // ==================== 落库与记忆沉淀 ====================

    /** 会议结束（含异常中断）整体落库；幂等：已存在则更新 */
    private void persistSession(RoundtableSession session) {
        try {
            if (sessionMapper.selectById(session.getId()) != null) return; // 正常路径只落一次
            RoundtableSessionEntity e = new RoundtableSessionEntity();
            e.setId(session.getId());
            e.setUserId(session.getUserId());
            e.setTopic(session.getTopic());
            e.setStatus(session.getStatus());
            e.setRounds(session.getRounds());
            e.setSpeechCount(session.getSpeechCount());
            e.setScore(session.getScore() == null ? null : JSON.toJSONString(session.getScore()));
            e.setTranscript(JSON.toJSONString(session.getTranscript()));
            e.setCreateDate(session.getCreatedAt());
            e.setFinishDate(System.currentTimeMillis());
            sessionMapper.insert(e);
            trace(session, "persist",
                    "topic=" + session.getTopic() + " speeches=" + session.getSpeechCount(),
                    session.getStatus(), 0);
        } catch (Exception ex) {
            log.warn("圆桌会议落库失败 sessionId={}: {}", session.getId(), ex.getMessage());
        }
    }

    /** 散会后把"用户自己的处境/决定/打算"提取成记忆条目（带向量），下次任何对话可 RAG 命中 */
    private void extractMemories(RoundtableSession session) {
        long t0 = System.currentTimeMillis();
        try {
            List<Map<String, Object>> all = session.getTranscript();
            if (all.size() < 6 || session.getUserId() == null) return;
            String digest = transcriptDigest(session, 3500);
            String raw = aiClient.chat(Collections.singletonList(new AiMessage("user",
                    PromptBuilder.roundtableMemoryPrompt(session.getTopic(), digest))), true);
            if (raw == null) return;
            JSONArray arr = JSON.parseObject(raw).getJSONArray("memories");
            if (arr == null || arr.isEmpty()) return;
            int saved = 0;
            for (int i = 0; i < arr.size() && saved < 3; i++) {
                JSONObject m = arr.getJSONObject(i);
                String content = m == null ? null : m.getString("content");
                if (content == null || content.trim().isEmpty()) continue;
                content = content.trim();
                Memory mem = new Memory();
                mem.setUserId(session.getUserId());
                mem.setContent(content);
                mem.setType("event");
                mem.setStatus("open");
                Integer imp = m.getInteger("importance");
                mem.setImportance(imp == null ? 6 : Math.max(1, Math.min(10, imp)));
                mem.setCreateDate(System.currentTimeMillis());
                float[] vec = aiClient.embed(content);
                if (vec != null) mem.setEmbedding(JSON.toJSONString(vec));
                memoryMapper.insert(mem);
                saved++;
            }
            trace(session, "memory_extract", digest, "saved=" + saved, System.currentTimeMillis() - t0);
        } catch (Exception e) {
            log.warn("圆桌记忆提取失败 sessionId={}: {}", session.getId(), e.getMessage());
        }
    }

    // ==================== 追踪与辅助 ====================

    private void trace(RoundtableSession session, String event, String input, String output, long latencyMs) {
        agentTraceService.record("roundtable", session.getId(), session.getUserId(),
                event, input, output, latencyMs);
    }

    /** 全量逐字稿压成纯文本，超长取尾部（结论集中在末尾） */
    private String transcriptDigest(RoundtableSession session, int maxChars) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, Object> m : session.getTranscript()) {
            sb.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
        }
        String s = sb.toString();
        return s.length() <= maxChars ? s : s.substring(s.length() - maxChars);
    }

    private static final Map<String, String> DIM_LABELS = Map.of(
            "conclusion", "结论达成度", "evidence", "论证充分度", "diversity", "视角多样性",
            "focus", "聚焦度", "interaction", "互动性", "practical", "实用性");

    private String dimLabel(String key) {
        return DIM_LABELS.getOrDefault(key, key);
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
        long t0 = System.currentTimeMillis();
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
            out.put("weakest", weakestOf(scoreMap));
            out.put("comment", comment.trim());
            out.put("todos", todos);
            trace(session, "judge", "transcript=" + session.getSpeechCount() + "条",
                    "avg=" + avg + " weakest=" + out.get("weakest") + " " + comment.trim(),
                    System.currentTimeMillis() - t0);
            return out;
        } catch (Exception e) {
            log.warn("圆桌评审 JSON 解析失败，使用占位评分: {}", e.getMessage());
            return fallback;
        }
    }

    /** 六个维度里得分最低的那个（反思追问的靶子） */
    private String weakestOf(Map<String, Integer> scoreMap) {
        String weak = SCORE_KEYS[0];
        int min = Integer.MAX_VALUE;
        for (String k : SCORE_KEYS) {
            int v = scoreMap.getOrDefault(k, 0);
            if (v < min) { min = v; weak = k; }
        }
        return weak;
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
