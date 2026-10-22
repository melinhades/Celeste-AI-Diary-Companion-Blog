package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.dao.mapper.DiaryChatSessionMapper;
import com.mszlu.blog.dao.pojo.DiaryChatSession;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * Madeline 日记多轮反应 · 会话记忆层（手写，无 Spring AI 依赖）
 * <p>
 * 内存：ConcurrentHashMap<userId, ConcurrentMap<sessionId, SessionBuffer>> —— 每个会话保留最近 5 轮
 * MySQL：每 3 轮用小模型压缩成 ≤ 100 字摘要，写入 diary_chat_session.summary
 * 会话隔离：userId + sessionId 双 key，不同用户/不同会话绝不串
 * 过期清理：companionStream 入口检查 lastActiveAt，> 30 分钟则新开会话
 */
@Component
@Slf4j
public class DiaryChatMemory {

    /** 内存缓冲结构：一个会话的最近 N 轮 user/madeline 交替对话 */
    public static class SessionBuffer {
        public final String sessionId;
        public final String userId;
        public final Deque<AiMessage> turns = new ArrayDeque<>(); // 交替 user/madeline
        public String summary = "";                                // MySQL 里存的累计摘要，启动时加载
        public int turnCount = 0;                                  // 已完成的总轮次（含已压缩的）
        public LocalDateTime lastActiveAt = LocalDateTime.now();

        SessionBuffer(String sessionId, String userId) {
            this.sessionId = sessionId;
            this.userId = userId;
        }
    }

    /** 每会话最多保留的完整轮次（最近 N 轮） */
    private static final int MAX_RECENT_TURNS = 5;
    /** 每积累多少轮压缩一次摘要 */
    private static final int COMPRESS_EVERY = 3;
    /** 会话过期阈值（分钟） */
    private static final int SESSION_EXPIRE_MIN = 30;

    private final ConcurrentMap<String, ConcurrentMap<String, SessionBuffer>> sessions = new ConcurrentHashMap<>();

    @Autowired private DiaryChatSessionMapper sessionMapper;
    @Autowired private AiClient aiClient;

    // ========================= 公共 API =========================

    /** 获取或创建会话缓冲（入口点，companionStream 第一行调） */
    public SessionBuffer getOrCreate(String userId, String sessionId) {
        ConcurrentMap<String, SessionBuffer> byUser = sessions.computeIfAbsent(userId, k -> new ConcurrentHashMap<>());
        SessionBuffer buf = byUser.computeIfAbsent(sessionId, id -> loadFromDbOrCreate(userId, id));

        // 过期检测：lastActiveAt 距今 > 30 分钟则新开（生成新 sessionId）
        if (buf.lastActiveAt.isBefore(LocalDateTime.now().minusMinutes(SESSION_EXPIRE_MIN))) {
            log.info("会话 {} 过期（最后活跃 {} 前），新开会话", sessionId, buf.lastActiveAt);
            SessionBuffer fresh = new SessionBuffer(UUID.randomUUID().toString().replace("-", "").substring(0, 16), userId);
            byUser.put(fresh.sessionId, fresh);
            return fresh;
        }

        buf.lastActiveAt = LocalDateTime.now();
        // 异步写 DB（不阻塞主链路）
        new Thread(() -> saveToDb(buf)).start();
        return buf;
    }

    /** 追加一轮对话 → 触发摘要压缩检查 */
    public void appendTurn(SessionBuffer buf, String userText, String madelineReply) {
        buf.turns.add(new AiMessage("user", userText));
        buf.turns.add(new AiMessage("assistant", madelineReply));
        buf.turnCount++;
        buf.lastActiveAt = LocalDateTime.now();

        // 超过 MAX_RECENT_TURNS：淘汰最旧的一轮（一 user + 一 assistant）
        while (buf.turns.size() > MAX_RECENT_TURNS * 2) {
            buf.turns.pollFirst();
            buf.turns.pollFirst();
        }

        // 压缩检查：每 COMPRESS_EVERY 轮触发一次
        if (buf.turnCount % COMPRESS_EVERY == 0) {
            new Thread(() -> tryCompress(buf)).start();
        }

        new Thread(() -> saveToDb(buf)).start();
    }

    /** 组装 prompt 的消息列表（system + summary + 最近 N 轮 + 当前 user） */
    public List<AiMessage> buildMessages(SessionBuffer buf, AiMessage systemPrompt, AiMessage currentUserMessage) {
        List<AiMessage> messages = new ArrayList<>();
        messages.add(systemPrompt);

        if (buf.summary != null && !buf.summary.isBlank()) {
            messages.add(new AiMessage("system", "以下是之前对话的简要摘要（≤ 100 字）：\n" + buf.summary));
        }

        for (AiMessage m : buf.turns) messages.add(m);
        messages.add(currentUserMessage);
        return messages;
    }

    // ========================= 内部实现 =========================

    private SessionBuffer loadFromDbOrCreate(String userId, String sessionId) {
        DiaryChatSession entity = sessionMapper.selectById(sessionId);
        if (entity != null) {
            SessionBuffer buf = new SessionBuffer(sessionId, userId);
            buf.summary = entity.getSummary() == null ? "" : entity.getSummary();
            buf.turnCount = entity.getTurnCount() == null ? 0 : entity.getTurnCount();
            buf.lastActiveAt = entity.getLastActiveAt() == null ? LocalDateTime.now() : entity.getLastActiveAt();
            return buf;
        }
        return new SessionBuffer(sessionId, userId);
    }

    private void saveToDb(SessionBuffer buf) {
        try {
            DiaryChatSession entity = sessionMapper.selectById(buf.sessionId);
            if (entity == null) {
                entity = new DiaryChatSession();
                entity.setSessionId(buf.sessionId);
                entity.setUserId(buf.userId);
                entity.setSummary(buf.summary);
                entity.setTurnCount(buf.turnCount);
                entity.setLastActiveAt(buf.lastActiveAt);
                entity.setCreatedAt(LocalDateTime.now());
                sessionMapper.insert(entity);
            } else {
                entity.setSummary(buf.summary);
                entity.setTurnCount(buf.turnCount);
                entity.setLastActiveAt(buf.lastActiveAt);
                sessionMapper.updateById(entity);
            }
        } catch (Exception e) {
            log.warn("会话记忆落库失败 sessionId={}: {}", buf.sessionId, e.getMessage());
        }
    }

    /** 用 aiClient.chat（小模型，便宜快速）把最近 3 轮压缩成 ≤ 100 字摘要，累加到已有 summary 后面 */
    private void tryCompress(SessionBuffer buf) {
        try {
            List<AiMessage> recent = buf.turns.stream()
                    .skip(Math.max(0, buf.turns.size() - COMPRESS_EVERY * 2))
                    .collect(Collectors.toList());

            StringBuilder sb = new StringBuilder();
            sb.append("请将以下对话压缩成不超过 100 字的中文摘要，保留关键信息（讨论的主题、情绪、关键观点），" +
                    "不要添加任何说明性文字，直接输出摘要文本。\n\n");
            for (AiMessage m : recent) {
                sb.append((m.role.equals("user") ? "用户：" : "Madeline：")).append(m.content).append('\n');
            }
            sb.append("\n压缩后的摘要（≤ 100 字）：");

            List<AiMessage> msgs = new ArrayList<>();
            msgs.add(new AiMessage("system", "你是一个对话摘要器，输出 ≤ 100 字的中文摘要，保留关键信息。"));
            msgs.add(new AiMessage("user", sb.toString()));

            String compressed = aiClient.chat(msgs);
            if (compressed == null || compressed.isBlank()) return;
            compressed = compressed.trim().replaceAll("\\s+", " ").length() > 100
                    ? compressed.trim().substring(0, 100) + "…"
                    : compressed.trim();

            buf.summary = (buf.summary.isBlank() ? "" : buf.summary + " ") + compressed;
            if (buf.summary.length() > 300) buf.summary = buf.summary.substring(buf.summary.length() - 300);
            log.debug("会话 {} 摘要压缩完成，当前长度 {} 字", buf.sessionId, buf.summary.length());
        } catch (Exception e) {
            log.warn("会话摘要压缩失败 sessionId={}: {}", buf.sessionId, e.getMessage());
        }
    }
}
