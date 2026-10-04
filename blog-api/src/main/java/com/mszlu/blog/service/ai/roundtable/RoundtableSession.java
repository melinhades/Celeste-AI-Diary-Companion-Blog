package com.mszlu.blog.service.ai.roundtable;

import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 一场圆桌会议的运行时状态（demo：纯内存，不落库）。
 * 由引擎线程驱动，SseEmitter 只负责把事件推给浏览器。
 */
@Data
public class RoundtableSession {

    /** 会议 id（前端插话/终止时带回） */
    private String id;
    /** 发起人用户 id（鉴权：只有本人能插话/终止） */
    private String userId;
    /** 发起人昵称（人类插话时显示的名字） */
    private String userNickname;
    private String topic;
    private int rounds;
    private long createdAt;

    /** RUNNING / FINISHED / ABORTED */
    private volatile String status = "RUNNING";

    /** owner 的 SSE 连接是否还活着（断连则引擎停止） */
    private volatile boolean ownerConnected = true;

    /**
     * 引擎单次启动闸门：一场会议无论被多少个 SSE 连接（含浏览器自动重连）触发，
     * {@link RoundtableEngine#run} 只允许成功进入一次，杜绝重连导致整场讨论重播。
     */
    private final AtomicBoolean engineStarted = new AtomicBoolean(false);

    /** owner 连接代际：每次（重）连接 +1，旧连接的 cleanup 只有代际匹配才有权宣告 owner 断线 */
    private final AtomicInteger ownerGen = new AtomicInteger(0);

    /** 尝试成为本场引擎的唯一驱动者；返回 true 表示本次调用获得驱动权 */
    public boolean tryStartEngine() {
        return engineStarted.compareAndSet(false, true);
    }

    /** 登记一次新的 owner 连接，返回它的代际号（cleanup 时据此判断自己是否仍是当前连接） */
    public int attachOwner() {
        ownerConnected = true;
        return ownerGen.incrementAndGet();
    }

    /** 旧 owner 连接死亡时调用：只有它仍是最新连接才宣告断线，避免重连后被旧连接的 onError 误杀 */
    public void detachOwner(int gen) {
        if (gen == ownerGen.get()) ownerConnected = false;
    }

    /** 用户插话队列：引擎在每个发言间隙 drain */
    private final LinkedBlockingQueue<String> interjections = new LinkedBlockingQueue<>();

    /** 用户要求提前收尾：引擎在当前发言结束后进入主持总结 */
    private final AtomicBoolean stopRequested = new AtomicBoolean(false);

    /** 手写布尔 getter：Lombok 对 AtomicBoolean 字段只会生成 getStopRequested() */
    public boolean isStopRequested() {
        return stopRequested.get();
    }

    /** 逐字稿（按时间顺序，含主持/AI/人类） */
    private final List<Map<String, Object>> transcript = new ArrayList<>();

    /** 最终评分结果（finish 前填充） */
    private Map<String, Object> score;

    /** 事件扇出总线：owner + 观察者订阅 */
    private final SessionBus bus = new SessionBus(this);

    /** 累计发言数（含主持/AI/人类） */
    private int speechCount;

    /** 最近一次共识/分歧 pulse payload */
    private volatile Map<String, Object> lastPulse;

    public void addSpeech(String speakerId, String name, String color, String role, String content) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("speakerId", speakerId);
        m.put("name", name);
        m.put("color", color);
        m.put("role", role); // host / ai / user
        m.put("content", content);
        m.put("ts", System.currentTimeMillis());
        transcript.add(m);
        speechCount++;
    }
}
