package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.ai.roundtable.RoundtableEngine;
import com.mszlu.blog.service.ai.roundtable.RoundtableSession;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
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

        RoundtableSession session = new RoundtableSession();
        session.setId(UUID.randomUUID().toString().replace("-", ""));
        session.setUserId(String.valueOf(user.getId()));
        session.setUserNickname(user.getNickname() != null && !user.getNickname().isEmpty()
                ? user.getNickname() : user.getAccount());
        session.setTopic(topic);
        session.setRounds(0); // 0 = 无限模式进行中
        session.setCreatedAt(System.currentTimeMillis());
        sessions.put(session.getId(), session);
        evictIfNeeded();

        // SSE 响应头：禁止 Nginx/反向代理缓冲与压缩——20s 心跳注释帧必须实时穿透，
        // 否则第一轮结束后的 AI 思考空档里浏览器长时间收不到字节，代理会在第二轮前掐断连接
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Cache-Control", "no-cache, no-transform");

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(exec -> {
            Thread t = new Thread(exec, "roundtable-heartbeat");
            t.setDaemon(true);
            return t;
        });
        heartbeat.scheduleAtFixedRate(() -> {
            try {
                // 注释帧保活：AI 发言间隔较长，防止代理/Nginx 掐断空闲连接
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitter.complete();
            }
        }, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);
        emitter.onCompletion(() -> heartbeat.shutdownNow());
        emitter.onTimeout(() -> {
            heartbeat.shutdownNow();
            emitter.complete();
        });
        emitter.onError(e -> heartbeat.shutdownNow());

        engine.run(session, emitter);
        return emitter;
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
