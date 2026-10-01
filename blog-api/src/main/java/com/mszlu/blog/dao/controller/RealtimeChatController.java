package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 实时聊天 demo：SSE 单向推送 + POST 发送，纯内存存储（重启即清空，不落库）。
 *
 * 端点：
 *   GET  /realtime-chat/stream?token=xxx  SSE 订阅（EventSource 无法带 Header，token 走 query，手动鉴权）
 *   POST /realtime-chat/send              发送消息 {content}（登录拦截器保护）
 *   GET  /realtime-chat/history           最近 50 条历史（登录拦截器保护）
 *
 * SSE 事件：
 *   chat     一条聊天消息
 *   presence 在线连接数
 *   ping     心跳注释（: 注释帧，前端 EventSource 自动忽略）
 */
@RestController
@RequestMapping("realtime-chat")
@Slf4j
public class RealtimeChatController {

    @Autowired
    private LoginService loginService;

    /** 单条消息最长 500 字 */
    private static final int MAX_CONTENT_LEN = 500;
    /** 内存中最多保留 100 条 */
    private static final int HISTORY_LIMIT = 100;
    /** 历史接口返回最近 50 条 */
    private static final int HISTORY_RETURN = 50;
    /** SSE 连接 30 分钟超时（浏览器会自动重连） */
    private static final long SSE_TIMEOUT_MS = 30 * 60 * 1000L;
    /** 25 秒一个心跳，防止代理/Nginx 掐断空闲连接 */
    private static final long HEARTBEAT_SECONDS = 25;

    /** 消息自增 id（demo 内存版，重启归零） */
    private final AtomicLong idGen = new AtomicLong(1);
    /** 最近消息（有界，超出丢弃最旧） */
    private final CopyOnWriteArrayList<Map<String, Object>> history = new CopyOnWriteArrayList<>();
    /** 在线连接：emitter -> 心跳任务（移除时用来取消定时任务） */
    private final Map<SseEmitter, ScheduledExecutorService> clients = new ConcurrentHashMap<>();
    /** 每个 emitter 独立的心跳调度器（连接关闭即 shutdown） */
    private final ScheduledExecutorService cleaner = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "realtime-chat-cleaner");
        t.setDaemon(true);
        return t;
    });

    /** SSE 订阅。token 通过 query 传递，未登录直接 401 JSON（EventSource 侧会走 onerror 重连） */
    @GetMapping(value = "stream")
    public SseEmitter stream(@RequestParam(value = "token", required = false) String token,
                             javax.servlet.http.HttpServletResponse response) throws java.io.IOException {
        SysUser user = (token == null || token.isEmpty()) ? null : loginService.checkToken(token);
        if (user == null) {
            // EventSource 的 Accept 只认 text/event-stream，不能返回 Result 对象（会触发 406），
            // 直接手写 401 JSON：浏览器侧只表现为 onerror 并自动重连
            response.setStatus(401);
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().write("{\"success\":false,\"code\":401,\"msg\":\"未登录\"}");
            return null;
        }

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "realtime-chat-heartbeat");
            t.setDaemon(true);
            return t;
        });
        clients.put(emitter, heartbeat);

        // 连上立刻推一条 presence，让新客户端知道当前在线数
        try {
            emitter.send(SseEmitter.event().name("presence").data(onlinePayload()));
        } catch (IOException e) {
            removeClient(emitter);
            return emitter;
        }
        broadcastPresence();

        heartbeat.scheduleAtFixedRate(() -> {
            try {
                // 注释帧：前端 EventSource 不产生 message 事件，仅保活
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitter.complete();
            }
        }, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);

        emitter.onCompletion(() -> removeClient(emitter));
        emitter.onTimeout(() -> {
            emitter.complete();
            removeClient(emitter);
        });
        emitter.onError(e -> removeClient(emitter));

        return emitter;
    }

    /** 发送消息并向所有连接广播 */
    @PostMapping("send")
    public Result send(@RequestBody Map<String, String> body) {
        SysUser user = UserThreadLocal.get();
        String content = body == null ? null : body.get("content");
        if (content == null || content.trim().isEmpty()) {
            return Result.fail(400, "内容不能为空");
        }
        content = content.trim();
        if (content.length() > MAX_CONTENT_LEN) {
            content = content.substring(0, MAX_CONTENT_LEN);
        }

        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("id", idGen.getAndIncrement());
        msg.put("userId", String.valueOf(user.getId()));
        msg.put("name", user.getNickname() != null && !user.getNickname().isEmpty()
                ? user.getNickname() : user.getAccount());
        msg.put("content", content);
        msg.put("ts", System.currentTimeMillis());

        history.add(msg);
        while (history.size() > HISTORY_LIMIT) {
            history.remove(0);
        }

        broadcast("chat", msg);
        return Result.success(msg);
    }

    /** 最近历史消息（早 -> 晚） */
    @GetMapping("history")
    public Result history() {
        int size = history.size();
        List<Map<String, Object>> recent = history.subList(Math.max(0, size - HISTORY_RETURN), size);
        return Result.success(new ArrayList<>(recent));
    }

    // ===== 内部实现 =====

    private Map<String, Object> onlinePayload() {
        Map<String, Object> m = new HashMap<>();
        m.put("online", clients.size());
        m.put("ts", System.currentTimeMillis());
        return m;
    }

    private void broadcastPresence() {
        broadcast("presence", onlinePayload());
    }

    private void broadcast(String eventName, Object payload) {
        for (SseEmitter emitter : clients.keySet()) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(payload));
            } catch (Exception e) {
                removeClient(emitter);
            }
        }
    }

    private void removeClient(SseEmitter emitter) {
        ScheduledExecutorService heartbeat = clients.remove(emitter);
        if (heartbeat != null) {
            heartbeat.shutdownNow();
        }
        // 延迟 100ms 再广播在线数，等本次遍历中的其他移除也完成
        cleaner.schedule(this::broadcastPresence, 100, TimeUnit.MILLISECONDS);
    }
}
