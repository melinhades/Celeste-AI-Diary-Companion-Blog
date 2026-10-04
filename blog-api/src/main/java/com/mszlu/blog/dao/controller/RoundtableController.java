package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.ai.roundtable.RoundtableEngine;
import com.mszlu.blog.service.ai.roundtable.RoundtableSession;
import com.mszlu.blog.service.ai.roundtable.RoundtableTopicService;
import com.mszlu.blog.service.ai.roundtable.RosterBuilder;
import com.mszlu.blog.service.ai.roundtable.SessionBus;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * AI 圆桌会议 demo。
 *
 *   GET  /roundtable/stream?token=&topic=&rounds=  SSE 开始并订阅整场会议（token 走 query 手验）
 *   POST /roundtable/{id}/interject                人类插话 {content}（登录拦截器保护）
 *   POST /roundtable/{id}/stop                     提前收尾（登录拦截器保护）
 *
 * 会议状态纯内存（demo，不落库），历史/回放由前端 localStorage 承载。
 */
@RestController
@RequestMapping("roundtable")
@Slf4j
public class RoundtableController {

    @Autowired
    private LoginService loginService;
    @Autowired
    private RoundtableEngine engine;
    @Autowired
    private RoundtableTopicService topicService;

    /** 最多保留最近 100 场（含进行中），超出清理最旧已结束的 */
    private static final int MAX_SESSIONS = 100;
    private static final long SSE_TIMEOUT_MS = 20 * 60 * 1000L;
    private static final long HEARTBEAT_SECONDS = 20L;

    private final Map<String, RoundtableSession> sessions = new ConcurrentHashMap<>();

    @GetMapping(value = "stream")
    public SseEmitter stream(@RequestParam(value = "token", required = false) String token,
                             @RequestParam(value = "topic", required = false) String topic,
                             @RequestParam(value = "rounds", required = false) Integer rounds,
                             HttpServletResponse response) throws IOException {
        SysUser user = (token == null || token.isEmpty()) ? null : loginService.checkToken(token);
        if (user == null) {
            // EventSource 只接受 text/event-stream，不能返回 Result 对象（406），手写 401
            response.setStatus(401);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":401,\"msg\":\"未登录\"}");
            return null;
        }

        if (topic == null || topic.trim().isEmpty()) {
            response.setStatus(400);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":400,\"msg\":\"议题不能为空\"}");
            return null;
        }
        topic = topic.trim();
        if (topic.length() > 200) topic = topic.substring(0, 200);
        // rounds 参数已废弃：会议改为无限讨论直到达成共识或用户主动结束，
        // 实际跑了多少轮由引擎在结束时回写 session.rounds。

        // 幂等关键：EventSource 网络抖动时浏览器会自动用原 URL（含 topic）重连本端点。
        // 若不加判断，每次重连都会新建 session 并重跑引擎，整场讨论从头再播一遍。
        // 同一用户、同一议题、仍在进行中的会议一律复用原 session：只挂新连接，不再启动引擎。
        RoundtableSession existing = findReusableSession(String.valueOf(user.getId()), topic);
        if (existing != null) {
            return attachOwnerEmitter(existing, response, true);
        }

        RoundtableSession session = new RoundtableSession();
        session.setId(UUID.randomUUID().toString().replace("-", ""));
        session.setUserId(String.valueOf(user.getId()));
        session.setUserNickname(user.getNickname() != null && !user.getNickname().isEmpty()
                ? user.getNickname() : user.getAccount());
        session.setTopic(topic);
        session.setRounds(0);
        session.setCreatedAt(System.currentTimeMillis());
        sessions.put(session.getId(), session);
        evictIfNeeded();

        SseEmitter emitter = attachOwnerEmitter(session, response, false);
        if (emitter == null) return null;
        engine.run(session);
        return emitter;
    }

    /** 查找可复用的进行中会议：同用户、同议题、RUNNING、创建于 2 小时内 */
    private RoundtableSession findReusableSession(String userId, String topic) {
        long cutoff = System.currentTimeMillis() - 2 * 60 * 60 * 1000L;
        for (RoundtableSession s : sessions.values()) {
            if ("RUNNING".equals(s.getStatus())
                    && userId.equals(s.getUserId())
                    && topic.equals(s.getTopic())
                    && s.getCreatedAt() >= cutoff) {
                return s;
            }
        }
        return null;
    }

    /**
     * 把一个 SSE 连接挂到会议上作为 owner。
     * @param reconnect true=断线重连：只补 meta/最近 pulse，不回放 transcript（前端现场 DOM 还在），
     *                  更不会重新启动引擎；false=首场连接，meta 由引擎开场时广播。
     */
    private SseEmitter attachOwnerEmitter(RoundtableSession session, HttpServletResponse response,
                                          boolean reconnect) throws IOException {
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");

        int gen = session.attachOwner();

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(exec -> {
            Thread t = new Thread(exec, "roundtable-heartbeat");
            t.setDaemon(true);
            return t;
        });
        heartbeat.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitter.complete();
            }
        }, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
        Runnable cleanup = () -> {
            heartbeat.shutdownNow();
            session.detachOwner(gen);
        };
        emitter.onCompletion(cleanup);
        emitter.onTimeout(() -> { heartbeat.shutdownNow(); session.detachOwner(gen); emitter.complete(); });
        emitter.onError(e -> cleanup.run());

        // owner 订阅总线（非观察者身份，不占用观察者计数）
        session.getBus().subscribe(emitter, false);

        if (reconnect) {
            // 重连追赶：meta（让前端确认仍是同一场会议）+ 最近一次 pulse；
            // transcript 不回放，避免把现场已经播出的发言重复显示。
            try {
                java.util.Map<String, Object> meta = new java.util.LinkedHashMap<>();
                meta.put("sessionId", session.getId());
                meta.put("topic", session.getTopic());
                meta.put("rounds", session.getRounds());
                meta.put("reconnect", true);
                meta.put("speakers", RosterBuilder.build(session));
                emitter.send(SseEmitter.event().name("meta").data(meta));
                if (session.getLastPulse() != null) {
                    emitter.send(SseEmitter.event().name("pulse").data(session.getLastPulse()));
                }
            } catch (IOException e) {
                emitter.complete();
            }
        }
        return emitter;
    }

    /** 全站进行中的讨论列表（登录用户可见） */
    @GetMapping("live")
    public Result live() {
        SysUser me = UserThreadLocal.get();
        if (me == null) return Result.fail(401, "未登录");
        List<Map<String, Object>> list = new java.util.ArrayList<>();
        for (RoundtableSession s : sessions.values()) {
            if (!"RUNNING".equals(s.getStatus())) continue;
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("topic", s.getTopic());
            m.put("userNickname", s.getUserNickname());
            m.put("startedAt", s.getCreatedAt());
            m.put("speechCount", s.getSpeechCount());
            m.put("observerCount", s.getBus().observerCount());
            list.add(m);
        }
        return Result.success(list);
    }

    /** 观察者订阅：先回放快照，再实时跟随（EventSource 带不了 Header，token 走 query 手验） */
    @GetMapping(value = "observe/{id}")
    public SseEmitter observe(@PathVariable("id") String id,
                              @RequestParam(value = "token", required = false) String token,
                              HttpServletResponse response) throws IOException {
        SysUser me = (token == null || token.isEmpty()) ? null : loginService.checkToken(token);
        if (me == null) {
            response.setStatus(401);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":401,\"msg\":\"未登录\"}");
            return null;
        }
        RoundtableSession session = sessions.get(id);
        if (session == null || !"RUNNING".equals(session.getStatus())) {
            response.setStatus(404);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":404,\"msg\":\"会议不存在或已结束\"}");
            return null;
        }

        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        session.getBus().subscribe(emitter, true);

        // 回放：meta（含阵容，observer 标记）+ 最近 pulse + transcript 快照（回放事件带 replay 标记）
        try {
            SessionBus.BusSnapshot snap = session.getBus().snapshot();
            java.util.Map<String, Object> meta = new java.util.LinkedHashMap<>();
            meta.put("sessionId", snap.getSessionId());
            meta.put("topic", snap.getTopic());
            meta.put("rounds", 0);
            meta.put("observer", true);
            meta.put("isOwner", String.valueOf(me.getId()).equals(session.getUserId()));
            meta.put("speakers", RosterBuilder.build(session));
            emitter.send(SseEmitter.event().name("meta").data(meta));
            if (snap.getLastPulse() != null) {
                emitter.send(SseEmitter.event().name("pulse").data(snap.getLastPulse()));
            }
            for (Map<String, Object> sp : snap.getTranscript()) {
                Map<String, Object> start = new java.util.LinkedHashMap<>(sp);
                start.remove("ts");
                start.put("ts", sp.get("ts"));
                start.put("replay", true);
                emitter.send(SseEmitter.event().name("turn_start").data(start));
                emitter.send(SseEmitter.event().name("delta").data(
                        java.util.Map.of("speakerId", sp.get("speakerId"), "text", sp.get("content"),
                                "replay", true)));
                emitter.send(SseEmitter.event().name("turn_end").data(
                        java.util.Map.of("speakerId", sp.get("speakerId"), "ts", sp.get("ts"),
                                "replay", true)));
            }
        } catch (IOException e) {
            emitter.complete();
        }
        return emitter;
    }

    /** 议题推荐：日记困境 / 我的文章 / 点赞文章取材，返回 6 个可直接开会议题 */
    @GetMapping("suggestions")
    public Result suggestions() {
        SysUser me = UserThreadLocal.get();
        return Result.success(topicService.suggest(String.valueOf(me.getId())));
    }

    /** 人类插话：只入队列，引擎在下一个发言间隙统一广播 */
    @PostMapping("{id}/interject")
    public Result interject(@PathVariable("id") String id, @RequestBody Map<String, String> body) {
        RoundtableSession session = sessions.get(id);
        if (session == null) {
            return Result.fail(404, "会议不存在或已结束");
        }
        SysUser me = UserThreadLocal.get();
        if (!session.getUserId().equals(String.valueOf(me.getId()))) {
            return Result.fail(403, "只能在自己的会议里插话");
        }
        if (!"RUNNING".equals(session.getStatus())) {
            return Result.fail(400, "会议已结束");
        }
        String content = body == null ? null : body.get("content");
        if (content == null || content.trim().isEmpty()) {
            return Result.fail(400, "内容不能为空");
        }
        content = content.trim();
        if (content.length() > 300) content = content.substring(0, 300);
        // 每场最多挂 20 条待发言，防止异常刷入
        if (session.getInterjections().size() >= 20) {
            return Result.fail(429, "你攒的发言有点多，等他们说完再发");
        }
        session.getInterjections().offer(content);
        return Result.success(null);
    }

    /** 提前收尾：当前发言结束后进入主持总结 + 评分 */
    @PostMapping("{id}/stop")
    public Result stop(@PathVariable("id") String id) {
        RoundtableSession session = sessions.get(id);
        if (session == null) {
            return Result.fail(404, "会议不存在或已结束");
        }
        SysUser me = UserThreadLocal.get();
        if (!session.getUserId().equals(String.valueOf(me.getId()))) {
            return Result.fail(403, "只能结束自己的会议");
        }
        session.getStopRequested().set(true);
        return Result.success(null);
    }

    /** 简单有界清理：超过上限时删除最早的非进行中会议 */
    private void evictIfNeeded() {
        if (sessions.size() <= MAX_SESSIONS) return;
        sessions.entrySet().stream()
                .filter(e -> !"RUNNING".equals(e.getValue().getStatus()))
                .min(Map.Entry.comparingByValue((a, b) -> Long.compare(a.getCreatedAt(), b.getCreatedAt())))
                .ifPresent(e -> sessions.remove(e.getKey()));
    }
}
