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
    }
}
