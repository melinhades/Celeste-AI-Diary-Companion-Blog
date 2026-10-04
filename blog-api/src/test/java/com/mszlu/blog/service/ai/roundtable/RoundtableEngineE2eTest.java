package com.mszlu.blog.service.ai.roundtable;

import com.mszlu.blog.dao.controller.RoundtableController;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.servlet.http.HttpServletResponse;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Task 10：圆桌 SSE 端到端集成测试。
 *
 * 用脚本化 AiClient（按 prompt 内容区分：调度 JSON / 发言纯文本 / pulse JSON / 评审 JSON）
 * 驱动真实 RoundtableEngine + TurnScheduler + ConsensusTracker + SessionBus，
 * 在 SseEmitter 边界收集事件并断言：
 *  1) 事件序列：meta → host 开场 → 多组 turn_prepare/turn_start/delta/turn_end
 *     → host 总结 → score → done；pulse ≥2；无 round；AI 不会连续同一人发言
 *  2) 主持开场/总结是纯口语（无 JSON 字符），总结先于 score
 *  3) 两场会议并行时事件按 sessionId 隔离
 *  4) 人类点名时被点角色立即发言
 *  5) 观察者：先收回放（replay:true）再收实时事件，最后收到 score/done
 */
class RoundtableEngineE2eTest {

    private static final String[] AI_IDS = {"madeline", "theo", "granny", "badeline", "oshiro"};

    // ==================== 脚本化 AiClient ====================

    static class ScriptedAiClient extends AiClient {
        private final String tag;
        private int scheduleTurn = 0;
        private int speakerTurn = 0;
        private int judgeCount = 0;

        ScriptedAiClient(String tag) {
            this.tag = tag;
        }

        @Override
        public String chat(List<AiMessage> messages, boolean jsonMode) {
            String sys = messages.isEmpty() ? "" : String.valueOf(messages.get(0).getContent());
            String all = joinText(messages);

            // 调度器：固定轮换，保证不与上一发言人重复
            if (sys.contains("圆桌讨论的调度器")) {
                String id = AI_IDS[scheduleTurn++ % AI_IDS.length];
                return "{\"speakerId\":\"" + id + "\",\"action\":\"补充\",\"publicNote\":\""
                        + tag + "-" + id + " 正在组织语言\"}";
            }
            // 共识 pulse
            if (sys.contains("圆桌讨论的共识分析师")) {
                return "{\"consensus\":[\"" + tag + "-共识甲\",\"" + tag + "-共识乙\"],"
                        + "\"disagreements\":[\"" + tag + "-分歧甲\"],"
                        + "\"focusPoint\":\"" + tag + "-当前焦点\",\"consensusScore\":"
                        + Math.min(55 + scheduleTurn, 90) + "}";
            }
            // 评审：只有一条 user 消息且 jsonMode
            if (jsonMode && messages.size() == 1) {
                judgeCount++;
                int v = judgeCount == 1 ? 55 : 82;   // 第一次评审不收尾，第二次 avg≥75 自动收尾
                return "{\"scores\":{\"conclusion\":" + v + ",\"evidence\":" + v
                        + ",\"diversity\":" + v + ",\"focus\":" + v
                        + ",\"interaction\":" + v + ",\"practical\":" + v + "},"
                        + "\"comment\":\"" + tag + "-评审意见\",\"todos\":[\"先试一小步\"]}";
            }
            // 主持人开场/总结：纯口语，不含任何 JSON 字符
            if (sys.contains("圆桌讨论的主持人")) {
                return all.contains("会议刚开始")
                        ? tag + "主持人开场：各位好，今天聊的议题很有意思，玛德琳你先来。"
                        : tag + "主持人总结：大家意见收拢了，先迈出一小步试试看。";
            }
            // 角色发言：从 prompt 里识别被轮到的是谁
            String id = detectPersona(all);
            speakerTurn++;
            return tag + "观点" + speakerTurn + "：" + id + " 觉得这事可以边走边看。";
        }

        private static String joinText(List<AiMessage> messages) {
            StringBuilder sb = new StringBuilder();
            for (AiMessage m : messages) sb.append(String.valueOf(m.getContent())).append('\n');
            return sb.toString();
        }

        private static String detectPersona(String prompt) {
            if (prompt.contains("暗面琳")) return "badeline";
            if (prompt.contains("玛德琳")) return "madeline";
            if (prompt.contains("奶奶")) return "granny";
            if (prompt.contains("西奥")) return "theo";
            if (prompt.contains("大崎先生")) return "oshiro";
            return AI_IDS[0];
        }
    }

    // ==================== SSE 事件收集 ====================

    static class Ev {
        final String name;
        final Map<String, Object> data;
        Ev(String name, Map<String, Object> data) { this.name = name; this.data = data; }
    }

    static class Speech {
        String speakerId;
        String role;
        final StringBuilder text = new StringBuilder();
    }

    /** 从 SseEventBuilder 解析出事件名与 payload（Spring 5.3：event:name 为 TEXT_PLAIN 段，data 为 Map 段） */
    @SuppressWarnings("unchecked")
    static Ev parse(SseEmitter.SseEventBuilder builder) {
        String name = null;
        Map<String, Object> data = null;
        for (ResponseBodyEmitter.DataWithMediaType part : builder.build()) {
            Object o = part.getData();
            if (o instanceof String && ((String) o).startsWith("event:")) {
                // Spring 5.3 文本段形如 "event:done\ndata:"，需在换行处截断
                String raw = ((String) o).substring("event:".length());
                int nl = raw.indexOf('\n');
                name = (nl >= 0 ? raw.substring(0, nl) : raw).trim();
            } else if (o instanceof Map) {
                data = (Map<String, Object>) o;
            }
        }
        return new Ev(name, data);
    }

    /** 给 Mockito mock 的 SseEmitter 装上事件收集；收到 done 时放行 latch */
    static void wireCapture(SseEmitter emitter, List<Ev> sink, CountDownLatch doneLatch) throws Exception {
        doAnswer(inv -> {
            Ev ev = parse(inv.getArgument(0));
            sink.add(ev);
            if ("done".equals(ev.name) || "error".equals(ev.name)) {
                doneLatch.countDown();
            }
            return null;
        }).when(emitter).send(any(SseEmitter.SseEventBuilder.class));
    }

    /** 把 turn_start/delta/turn_end 事件流切成完整发言 */
    static List<Speech> toSpeeches(List<Ev> evs) {
        List<Speech> out = new ArrayList<>();
        Speech cur = null;
        for (Ev ev : evs) {
            if ("turn_start".equals(ev.name)) {
                cur = new Speech();
                cur.speakerId = (String) ev.data.get("speakerId");
                cur.role = (String) ev.data.get("role");
                out.add(cur);
            } else if ("delta".equals(ev.name) && cur != null) {
                cur.text.append(String.valueOf(ev.data.get("text")));
            } else if ("turn_end".equals(ev.name)) {
                cur = null;
            }
        }
        return out;
    }

    static List<String> names(List<Ev> evs) {
        List<String> out = new ArrayList<>();
        for (Ev ev : evs) out.add(ev.name);
        return out;
    }

    static boolean hasJsonChars(String s) {
        return s != null && s.codePoints().anyMatch(c -> c == '{' || c == '}' || c == '[' || c == ']' || c == '"');
    }

    // ==================== 引擎装配 ====================

    private static void setField(Object target, Class<?> type, String name, Object value) throws Exception {
        Field f = type.getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }

    private static RoundtableEngine newEngine(String tag, Executor executor) {
        ScriptedAiClient ai = new ScriptedAiClient(tag);
        RoundtableEngine engine = new RoundtableEngine();
        try {
            setField(engine, RoundtableEngine.class, "aiClient", ai);
            setField(engine, RoundtableEngine.class, "turnScheduler", new TurnScheduler(ai));
            setField(engine, RoundtableEngine.class, "consensusTracker", new ConsensusTracker(ai));
            setField(engine, RoundtableEngine.class, "aiExecutor", executor);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return engine;
    }

    private static RoundtableSession newSession(String id, String topic) {
        RoundtableSession s = new RoundtableSession();
        s.setId(id);
        s.setUserId("u-" + id);
        s.setUserNickname("山友-" + id);
        s.setTopic(topic);
        s.setCreatedAt(System.currentTimeMillis());
        return s;
    }

    private static List<Ev> runSync(RoundtableEngine engine, RoundtableSession session) throws Exception {
        List<Ev> evs = new ArrayList<>();
        CountDownLatch done = new CountDownLatch(1);
        SseEmitter owner = mock(SseEmitter.class);
        wireCapture(owner, evs, done);
        session.getBus().subscribe(owner, false);
        engine.run(session);   // 同步 Executor：调用线程内跑完整场
        if (!done.await(30, TimeUnit.SECONDS)) {
            StringBuilder dbg = new StringBuilder();
            dbg.append("speechCount=").append(session.getSpeechCount())
               .append(" status=").append(session.getStatus())
               .append(" events=").append(evs.size()).append('\n');
            for (int i = Math.max(0, evs.size() - 12); i < evs.size(); i++) {
                dbg.append(evs.get(i).name).append(' ').append(evs.get(i).data).append('\n');
            }
            fail(dbg.toString());
        }
        return evs;
    }

    // ==================== 测试 ====================

    @Test
    void eventSequence_isMetaHostSpeechesPulseHostCloseScoreDone_withNoRoundOrNotice() throws Exception {
        RoundtableSession session = newSession("seq-1", "议题：要不要先试一小步");
        List<Ev> evs = runSync(newEngine("SEQ", Runnable::run), session);
        List<String> names = names(evs);

        assertEquals("meta", names.get(0));
        assertFalse(names.contains("round"), "已删除 round 事件");
        assertFalse(names.contains("notice"), "内部 notice 不再广播");
        assertEquals("done", names.get(names.size() - 1));
        assertEquals("score", names.get(names.size() - 2));

        // meta 带 6 席阵容
        Object speakers = evs.get(0).data.get("speakers");
        assertTrue(speakers instanceof List && ((List<?>) speakers).size() == 6, "meta.speakers 必须为 6 席");

        List<Speech> speeches = toSpeeches(evs);
        // host 开场 → 17 条 AI 发言（第 12/18 条 speechCount 触发评审，第二次收尾）→ host 总结
        assertEquals("host", speeches.get(0).role);
        assertEquals("host", speeches.get(speeches.size() - 1).role);

        List<Speech> aiTurns = new ArrayList<>();
        for (Speech sp : speeches) if ("ai".equals(sp.role)) aiTurns.add(sp);
        assertTrue(aiTurns.size() >= 12, "AI 发言应覆盖两次评审点，实际 " + aiTurns.size());
        for (int i = 1; i < aiTurns.size(); i++) {
            assertNotEquals(aiTurns.get(i - 1).speakerId, aiTurns.get(i).speakerId,
                    "AI 不应连续两次选同一发言者");
            assertTrue(List.of(AI_IDS).contains(aiTurns.get(i).speakerId));
        }

        // turn_prepare 三件套齐全
        List<Ev> prepares = new ArrayList<>();
        for (Ev ev : evs) if ("turn_prepare".equals(ev.name)) prepares.add(ev);
        assertEquals(aiTurns.size(), prepares.size(), "每条 AI 发言前都有 turn_prepare");
        for (Ev ev : prepares) {
            assertTrue(List.of(AI_IDS).contains(ev.data.get("speakerId")));
            assertTrue(String.valueOf(ev.data.get("action")).length() > 0);
            String note = String.valueOf(ev.data.get("publicNote"));
            assertFalse(note.isBlank(), "publicNote 必须下发给状态小窗");
            assertFalse(ev.data.containsKey("note"), "旧字段 note 必须已改名为 publicNote");
        }

        // pulse ≥2，结构完整
        List<Ev> pulses = new ArrayList<>();
        for (Ev ev : evs) if ("pulse".equals(ev.name)) pulses.add(ev);
        assertTrue(pulses.size() >= 2, "pulse 至少 2 次，实际 " + pulses.size());
        for (Ev ev : pulses) {
            assertTrue(ev.data.get("consensus") instanceof List);
            assertTrue(ev.data.get("disagreements") instanceof List);
            assertNotNull(ev.data.get("focusPoint"));
            assertTrue(ev.data.get("consensusScore") instanceof Number);
        }

        // 主持开场/总结无 JSON 字符，总结在 score 之前
        Speech opening = speeches.get(0);
        Speech closing = speeches.get(speeches.size() - 1);
        assertFalse(hasJsonChars(opening.text.toString()));
        assertFalse(hasJsonChars(closing.text.toString()));
        int lastHostStart = names.lastIndexOf("turn_start");
        int scoreIdx = names.indexOf("score");
        assertTrue(lastHostStart < scoreIdx, "host 总结 turn_start 必须先于 score");

        // score 与 done 契约
        Ev score = evs.get(scoreIdx);
        assertEquals(82, ((Number) score.data.get("avg")).intValue());
        Ev done = evs.get(evs.size() - 1);
        assertEquals("seq-1", done.data.get("sessionId"));
        assertEquals(session.getTopic(), done.data.get("topic"));
        assertEquals("FINISHED", done.data.get("status"));
        assertTrue(((Number) done.data.get("rounds")).intValue() >= 1);
        assertTrue(done.data.get("transcript") instanceof List);
        assertNotNull(done.data.get("score"));
        assertEquals("FINISHED", session.getStatus());
    }

    @Test
    void humanMention_forcesMentionedPersonaToSpeakNext() throws Exception {
        RoundtableSession session = newSession("mention-1", "点名插队场景");
        // 会议开始前挂上一条点名玛德琳的插话
        session.getInterjections().offer("玛德琳，你具体打算怎么做？");

        List<Ev> evs = runSync(newEngine("MEN", Runnable::run), session);
        List<Speech> speeches = toSpeeches(evs);

        // host 开场之后先广播用户插话，紧接着是被点的玛德琳
        assertEquals("host", speeches.get(0).role);
        assertEquals("user", speeches.get(1).role);
        assertEquals("madeline", speeches.get(2).speakerId);

        // 对应 turn_prepare 是「回应」动作
        Ev prepare = null;
        for (Ev ev : evs) if ("turn_prepare".equals(ev.name)) { prepare = ev; break; }
        assertEquals("madeline", prepare.data.get("speakerId"));
        assertEquals("回应", prepare.data.get("action"));
    }

    @Test
    void twoParallelSessions_eventsAreIsolatedBySession() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            RoundtableSession sa = newSession("parallel-A", "Alpha 场议题");
            RoundtableSession sb = newSession("parallel-B", "Beta 场议题");
            RoundtableEngine ea = newEngine("ALPHA", pool);
            RoundtableEngine eb = newEngine("BETA", pool);

            List<Ev> evsA = new ArrayList<>();
            List<Ev> evsB = new ArrayList<>();
            CountDownLatch doneA = new CountDownLatch(1);
            CountDownLatch doneB = new CountDownLatch(1);
            SseEmitter oa = mock(SseEmitter.class);
            SseEmitter ob = mock(SseEmitter.class);
            wireCapture(oa, evsA, doneA);
            wireCapture(ob, evsB, doneB);
            sa.getBus().subscribe(oa, false);
            sb.getBus().subscribe(ob, false);

            ea.run(sa);
            eb.run(sb);
            assertTrue(doneA.await(30, TimeUnit.SECONDS));
            assertTrue(doneB.await(30, TimeUnit.SECONDS));

            // meta/done 各自带自己的 sessionId/topic
            assertEquals("parallel-A", evsA.get(0).data.get("sessionId"));
            assertEquals("parallel-B", evsB.get(0).data.get("sessionId"));
            assertEquals("FINISHED", evsA.get(evsA.size() - 1).data.get("status"));
            assertEquals("FINISHED", evsB.get(evsB.size() - 1).data.get("status"));

            // 文本级隔离：A 场只有 ALPHA 台词，B 场只有 BETA 台词
            String textA = allText(evsA);
            String textB = allText(evsB);
            assertTrue(textA.contains("ALPHA") && !textA.contains("BETA观点"), "A 场混入了 B 场发言");
            assertTrue(textB.contains("BETA") && !textB.contains("ALPHA观点"), "B 场混入了 A 场发言");

            // 任一事件 payload 序列化后都不出现对方的 sessionId
            assertFalse(joinData(evsA).contains("parallel-B"));
            assertFalse(joinData(evsB).contains("parallel-A"));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void observer_getsReplayThenLiveEvents_thenScoreAndDone() throws Exception {
        ExecutorService pool = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "rt-e2e-observer");
            t.setDaemon(true);
            return t;
        });
        try {
            RoundtableSession session = newSession("obs-1", "观察者加入场景");
            RoundtableEngine engine = newEngine("OBS", pool);

            List<Ev> ownerEvs = new ArrayList<>();
            CountDownLatch ownerDone = new CountDownLatch(1);
            SseEmitter owner = mock(SseEmitter.class);
            wireCapture(owner, ownerEvs, ownerDone);
            session.getBus().subscribe(owner, false);
            engine.run(session);

            // 等主持人开场 + 至少 3 条发言落 transcript 后再加入观察者
            long deadline = System.currentTimeMillis() + 10000;
            int transcriptAtJoin = 0;
            while (System.currentTimeMillis() < deadline) {
                transcriptAtJoin = session.getBus().snapshot().getTranscript().size();
                if (transcriptAtJoin >= 4) break;
                Thread.sleep(50);
            }
            assertTrue(transcriptAtJoin >= 4, "会前先攒够快照内容");

            // 通过真实 controller 的 observe() 加入（mock 登录态）
            LoginService loginService = mock(LoginService.class);
            SysUser watcher = new SysUser();
            watcher.setId("777");
            watcher.setNickname("观察者");
            when(loginService.checkToken(anyString())).thenReturn(watcher);

            RoundtableController controller = new RoundtableController();
            setField(controller, RoundtableController.class, "loginService", loginService);
            Map<String, RoundtableSession> sessions = new ConcurrentHashMap<>();
            sessions.put(session.getId(), session);
            setField(controller, RoundtableController.class, "sessions", sessions);

            SseEmitter observer = controller.observe(session.getId(), "tok", mock(HttpServletResponse.class));
            assertNotNull(observer);

            assertTrue(ownerDone.await(30, TimeUnit.SECONDS), "整场会议应跑完");

            // observe 期间 handler 未初始化，每次 send 的 event 段（event:name 字符串 + payload Map）
            // 都按顺序攒进了 earlySendAttempts
            Field f = ResponseBodyEmitter.class.getDeclaredField("earlySendAttempts");
            f.setAccessible(true);
            @SuppressWarnings("unchecked")
            Set<ResponseBodyEmitter.DataWithMediaType> early =
                    (Set<ResponseBodyEmitter.DataWithMediaType>) f.get(observer);
            assertNotNull(early);
            List<Ev> evs = new ArrayList<>();
            String pendingName = null;
            for (ResponseBodyEmitter.DataWithMediaType part : early) {
                Object o = part.getData();
                if (o instanceof String && ((String) o).startsWith("event:")) {
                    String raw = ((String) o).substring("event:".length());
                    int nl = raw.indexOf('\n');
                    pendingName = (nl >= 0 ? raw.substring(0, nl) : raw).trim();
                } else if (o instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = (Map<String, Object>) o;
                    evs.add(new Ev(pendingName, payload));
                    pendingName = null;
                }
            }

            // 第一条：observer meta（带阵容）
            Ev meta = evs.get(0);
            assertEquals("meta", meta.name);
            assertEquals(Boolean.TRUE, meta.data.get("observer"));
            assertEquals(6, ((List<?>) meta.data.get("speakers")).size());

            // 回放段：所有 replay:true 事件只允许是 turn_start/delta/turn_end
            int replayStarts = 0, replayDeltas = 0, replayEnds = 0, lastReplayIdx = -1;
            for (int i = 0; i < evs.size(); i++) {
                Ev ev = evs.get(i);
                if (Boolean.TRUE.equals(ev.data.get("replay"))) {
                    assertTrue(List.of("turn_start", "delta", "turn_end").contains(ev.name),
                            "回放事件类型非法: " + ev.name);
                    lastReplayIdx = i;
                    if ("turn_start".equals(ev.name)) replayStarts++;
                    if ("delta".equals(ev.name)) replayDeltas++;
                    if ("turn_end".equals(ev.name)) replayEnds++;
                }
            }
            assertTrue(replayStarts >= transcriptAtJoin, "至少回放加入时刻的全部发言");
            assertEquals(replayStarts, replayEnds, "回放 turn_start/turn_end 配对");
            assertTrue(replayDeltas >= replayStarts, "每段回放至少一个 delta");

            // 实时段：回放之后出现无 replay 标记的 turn_prepare/turn_start，最后 score→done
            List<Ev> live = evs.subList(lastReplayIdx + 1, evs.size());
            assertTrue(live.stream().anyMatch(e -> "turn_prepare".equals(e.name)
                    && e.data.get("publicNote") != null), "回放后必须接到实时 prepare");
            assertTrue(live.stream().anyMatch(e -> "turn_start".equals(e.name)
                    && !Boolean.TRUE.equals(e.data.get("replay"))), "回放后必须接到实时发言");
            List<String> liveNames = names(live);
            assertEquals("score", liveNames.get(liveNames.size() - 2));
            assertEquals("done", liveNames.get(liveNames.size() - 1));
            assertEquals("obs-1", live.get(live.size() - 1).data.get("sessionId"));
        } finally {
            pool.shutdownNow();
        }
    }

    private static String allText(List<Ev> evs) {
        StringBuilder sb = new StringBuilder();
        for (Speech sp : toSpeeches(evs)) sb.append(sp.text).append('\n');
        return sb.toString();
    }

    private static String joinData(List<Ev> evs) {
        StringBuilder sb = new StringBuilder();
        for (Ev ev : evs) sb.append(new LinkedHashMap<>(ev.data)).append('\n');
        return sb.toString();
    }
}
