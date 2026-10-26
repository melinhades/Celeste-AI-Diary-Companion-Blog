package com.mszlu.blog.service.diarychat;

import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Madeline 日记多轮反应 · 中断管理器
 * <p>
 * 设计：按 sessionId 维护一个 volatile boolean，前端点击中断按钮 → POST /diary/companion（带 interrupt=true）
 * → 本管理器把 sessionId 标记为 interrupted → streamChat 的 onDelta 回调里检查，若已中断则抛 RuntimeException
 * → AiClient.streamChat 会把客户端断开当正常终止返回 null，不落库。
 * <p>
 * 注意：中断标志在 companionStream 入口消费后立即 remove，避免内存泄漏；会话结束（30 分钟无活动）也清理。
 */
@Component
public class DiaryChatInterruptManager {

    private final ConcurrentMap<String, Boolean> flags = new ConcurrentHashMap<>();

    /** 回复锁：sessionId → 本轮开始回复的时间戳。同一会话同一时刻只允许一轮回复在跑。 */
    private final ConcurrentMap<String, Long> replying = new ConcurrentHashMap<>();
    /** 锁失效时长：防止异常路径漏释放导致会话永久卡住 */
    private static final long REPLY_LOCK_TTL_MS = 90_000L;

    /** 标记中断（前端调用 interrupt 接口，或 companionStream 在入口检测到 interrupt=true） */
    public void markInterrupted(String sessionId) {
        flags.put(sessionId, Boolean.TRUE);
    }

    /** 检查是否已中断：在 streamChat 的 onDelta 回调里调用，若已中断则抛 RuntimeException 终止流 */
    public boolean isInterrupted(String sessionId) {
        return Boolean.TRUE.equals(flags.get(sessionId));
    }

    /** 消费并清理中断标志（companionStream 入口处调一次，避免后续正常请求误触发中断） */
    public boolean consumeAndClear(String sessionId) {
        return Boolean.TRUE.equals(flags.remove(sessionId));
    }

    /** 会话结束清理（companionStream 正常收尾时调用，或定时任务清理过期 session） */
    public void clear(String sessionId) {
        flags.remove(sessionId);
        replying.remove(sessionId);
    }

    /**
     * 尝试进入「专心回复」状态。
     * 成功返回 true（调用方必须在 finally 里 releaseReply）；
     * 同会话已有一轮在回复中则返回 false，调用方直接回 busy 帧，不再调用 LLM。
     * 超过 TTL 的脏锁视为已释放，允许抢占。
     */
    public boolean tryAcquireReply(String sessionId) {
        long now = System.currentTimeMillis();
        boolean[] acquired = {false};
        replying.compute(sessionId, (key, since) -> {
            if (since != null && now - since < REPLY_LOCK_TTL_MS) {
                return since;
            }
            acquired[0] = true;
            return now;
        });
        return acquired[0];
    }

    /** 回复结束（含异常/中断）必须调用，否则要等 TTL 到期才会自动释放 */
    public void releaseReply(String sessionId) {
        replying.remove(sessionId);
    }

    /** 当前会话是否正在回复（供排查/未来做“别打断她”的 UI 提示用） */
    public boolean isReplying(String sessionId) {
        Long since = replying.get(sessionId);
        return since != null && System.currentTimeMillis() - since < REPLY_LOCK_TTL_MS;
    }
}
