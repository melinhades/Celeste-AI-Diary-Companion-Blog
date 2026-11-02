package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ChatMessageMapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.mapper.ProactiveLogMapper;
import com.mszlu.blog.dao.mapper.SysUserMapper;
import com.mszlu.blog.dao.pojo.ChatMessage;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.Persona;
import com.mszlu.blog.dao.pojo.ProactiveLog;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.service.ProactiveService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

@Service
@Slf4j
public class ProactiveServiceImpl implements ProactiveService {

    private static final long DAY_MILLIS = 24 * 60 * 60 * 1000L;
    private static final long ACTIVE_WINDOW = 2 * DAY_MILLIS;
    private static final long SSE_TIMEOUT_MS = 30 * 60 * 1000L;
    private static final long HEARTBEAT_SECONDS = 25;

    @Autowired
    private SysUserMapper sysUserMapper;
    @Autowired
    private ChatMessageMapper chatMessageMapper;
    @Autowired
    private MemoryMapper memoryMapper;
    @Autowired
    private ProactiveLogMapper proactiveLogMapper;
    @Autowired
    private PersonaService personaService;
    @Autowired
    private AiClient aiClient;

    /** SSE 订阅管理：userId -> List<SseEmitter> */
    private final Map<String, List<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final Map<SseEmitter, ScheduledExecutorService> heartbeats = new ConcurrentHashMap<>();

    @Override
    @Scheduled(cron = "0 30 9 * * ?")
    public void dailyReachOut() {
        long now = System.currentTimeMillis();
        LambdaQueryWrapper<SysUser> userWrapper = new LambdaQueryWrapper<>();
        userWrapper.gt(SysUser::getLastLogin, now - ACTIVE_WINDOW);
        List<SysUser> activeUsers = sysUserMapper.selectList(userWrapper);
        log.info("主动关怀：本次共 {} 个活跃用户待决策", activeUsers.size());

        for (SysUser user : activeUsers) {
            try {
                decideForUser(user, now);
            } catch (Exception e) {
                log.error("主动关怀决策失败, userId={}", user.getId(), e);
            }
        }
    }

    private void decideForUser(SysUser user, long now) {
        String userId = user.getId();
        Persona persona = personaService.getActive(userId);

        LambdaQueryWrapper<Memory> memWrapper = new LambdaQueryWrapper<>();
        memWrapper.eq(Memory::getUserId, userId);
        memWrapper.eq(Memory::getStatus, "open");
        memWrapper.orderByDesc(Memory::getImportance);
        memWrapper.last("limit 10");
        List<Memory> openMemories = memoryMapper.selectList(memWrapper);

        long lastSpeakTime = lastUserSpeakTime(userId);
        long silentDays = lastSpeakTime == 0 ? 7 : (now - lastSpeakTime) / DAY_MILLIS;
        String mood = silentDays < 1 ? "casual" : (silentDays <= 3 ? "concerned" : "miss");
        boolean reachedOutYesterday = reachedOutWithin(userId, now - DAY_MILLIS);

        StringBuilder emotionSummary = new StringBuilder();
        for (Memory m : openMemories) {
            if ("emotion".equals(m.getType())) {
                emotionSummary.append(m.getContent()).append("；");
            }
        }
        if (emotionSummary.length() == 0) {
            emotionSummary.append("无明显记录");
        }

        String prompt = PromptBuilder.proactiveDecision(
                persona, openMemories, emotionSummary.toString(),
                silentDays, reachedOutYesterday, mood);
        String json = aiClient.chat(Arrays.asList(new AiMessage("user", prompt)), true);

        ProactiveLog proactiveLog = new ProactiveLog();
        proactiveLog.setUserId(userId);
        proactiveLog.setMood(mood);
        proactiveLog.setIsRead(0);
        proactiveLog.setCreateDate(now);

        if (json != null) {
            JSONObject decision = JSON.parseObject(json);
            boolean shouldReach = decision.getBooleanValue("shouldReachOut");
            proactiveLog.setShouldReachOut(shouldReach ? 1 : 0);
            proactiveLog.setDecisionReason(decision.getString("reason"));
            String message = decision.getString("message");
            proactiveLog.setMessage(message);
            
            // 新增：如果决定说话，立即推送给已订阅用户
            if (shouldReach && message != null && !message.isEmpty()) {
                pushToUser(userId, message, mood);
            }
        } else {
            proactiveLog.setShouldReachOut(0);
            proactiveLog.setDecisionReason("AI 调用失败，默认沉默");
        }
        proactiveLogMapper.insert(proactiveLog);
    }

    @Override
    public Result latestUnread() {
        SysUser user = UserThreadLocal.get();
        LambdaQueryWrapper<ProactiveLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProactiveLog::getUserId, user.getId());
        wrapper.eq(ProactiveLog::getShouldReachOut, 1);
        wrapper.eq(ProactiveLog::getIsRead, 0);
        wrapper.isNotNull(ProactiveLog::getMessage);
        wrapper.orderByDesc(ProactiveLog::getCreateDate);
        wrapper.last("limit 1");
        ProactiveLog log0 = proactiveLogMapper.selectOne(wrapper);
        if (log0 == null) {
            return Result.success(null);
        }

        ProactiveLog update = new ProactiveLog();
        update.setIsRead(1);
        LambdaQueryWrapper<ProactiveLog> updateWrapper = new LambdaQueryWrapper<>();
        updateWrapper.eq(ProactiveLog::getId, log0.getId());
        proactiveLogMapper.update(update, updateWrapper);

        ChatMessage message = new ChatMessage();
        message.setUserId(user.getId());
        message.setRole("assistant");
        message.setContent(log0.getMessage());
        message.setCreateDate(System.currentTimeMillis());
        chatMessageMapper.insert(message);

        return Result.success(log0.getMessage());
    }

    @Override
    public SseEmitter subscribe(String userId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        subscribers.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "proactive-heartbeat-" + userId);
            t.setDaemon(true);
            return t;
        });
        heartbeats.put(emitter, heartbeat);

        heartbeat.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitter.complete();
            }
        }, HEARTBEAT_SECONDS, HEARTBEAT_SECONDS, TimeUnit.SECONDS);

        emitter.onCompletion(() -> removeSubscriber(userId, emitter));
        emitter.onTimeout(() -> {
            emitter.complete();
            removeSubscriber(userId, emitter);
        });
        emitter.onError(e -> removeSubscriber(userId, emitter));

        log.info("用户 {} 订阅主动消息推送", userId);
        return emitter;
    }

    @Override
    public void pushToUser(String userId, String message, String emotion) {
        List<SseEmitter> emitters = subscribers.get(userId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("用户 {} 当前无订阅连接，消息未推送", userId);
            return;
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("message", message);
        payload.put("emotion", emotion != null ? emotion : "默认");
        payload.put("ts", System.currentTimeMillis());

        for (SseEmitter emitter : new ArrayList<>(emitters)) {
            try {
                emitter.send(SseEmitter.event().name("bubble").data(payload));
                log.info("主动消息已推送给用户 {}", userId);
            } catch (IOException e) {
                log.warn("推送失败，移除连接: userId={}", userId);
                removeSubscriber(userId, emitter);
            }
        }
    }

    private void removeSubscriber(String userId, SseEmitter emitter) {
        List<SseEmitter> emitters = subscribers.get(userId);
        if (emitters != null) {
            emitters.remove(emitter);
            if (emitters.isEmpty()) {
                subscribers.remove(userId);
            }
        }
        ScheduledExecutorService heartbeat = heartbeats.remove(emitter);
        if (heartbeat != null) {
            heartbeat.shutdownNow();
        }
    }

    private long lastUserSpeakTime(String userId) {
        LambdaQueryWrapper<ChatMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ChatMessage::getUserId, userId);
        wrapper.eq(ChatMessage::getRole, "user");
        wrapper.orderByDesc(ChatMessage::getCreateDate);
        wrapper.last("limit 1");
        ChatMessage last = chatMessageMapper.selectOne(wrapper);
        return last == null ? 0 : last.getCreateDate();
    }

    private boolean reachedOutWithin(String userId, long since) {
        LambdaQueryWrapper<ProactiveLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProactiveLog::getUserId, userId);
        wrapper.eq(ProactiveLog::getShouldReachOut, 1);
        wrapper.gt(ProactiveLog::getCreateDate, since);
        return proactiveLogMapper.selectCount(wrapper) > 0;
    }
}
