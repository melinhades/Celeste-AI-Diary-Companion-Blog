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

import java.util.Arrays;
import java.util.List;

@Service
@Slf4j
public class ProactiveServiceImpl implements ProactiveService {

    private static final long DAY_MILLIS = 24 * 60 * 60 * 1000L;
    /** 只处理 48h 内登录过的用户，避免对僵尸用户白调 LLM */
    private static final long ACTIVE_WINDOW = 2 * DAY_MILLIS;

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

    @Override
    @Scheduled(cron = "0 30 9 * * ?")  // 每天 9:30
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
                // 单个用户失败不影响其他人
                log.error("主动关怀决策失败, userId={}", user.getId(), e);
            }
        }
    }

    private void decideForUser(SysUser user, long now) {
        String userId = user.getId();
        Persona persona = personaService.getActive(userId);

        // 1. 收集上下文
        LambdaQueryWrapper<Memory> memWrapper = new LambdaQueryWrapper<>();
        memWrapper.eq(Memory::getUserId, userId);
        memWrapper.eq(Memory::getStatus, "open");
        memWrapper.orderByDesc(Memory::getImportance);
        memWrapper.last("limit 10");
        List<Memory> openMemories = memoryMapper.selectList(memWrapper);

        // 沉默天数：用户最后一条 role=user 的消息距今天数
        long lastSpeakTime = lastUserSpeakTime(userId);
        long silentDays = lastSpeakTime == 0 ? 7 : (now - lastSpeakTime) / DAY_MILLIS;

        // 语气档位由后端状态机决定，不让 LLM 自由发挥
        String mood = silentDays < 1 ? "casual" : (silentDays <= 3 ? "concerned" : "miss");

        boolean reachedOutYesterday = reachedOutWithin(userId, now - DAY_MILLIS);

        // 最近情绪走向：open 的 emotion 记忆拼成一句话
        StringBuilder emotionSummary = new StringBuilder();
        for (Memory m : openMemories) {
            if ("emotion".equals(m.getType())) {
                emotionSummary.append(m.getContent()).append("；");
            }
        }
        if (emotionSummary.length() == 0) {
            emotionSummary.append("无明显记录");
        }

        // 2. LLM 决策
        String prompt = PromptBuilder.proactiveDecision(
                persona, openMemories, emotionSummary.toString(),
                silentDays, reachedOutYesterday, mood);
        String json = aiClient.chat(Arrays.asList(new AiMessage("user", prompt)), true);

        // 3. 落库（包括"决定不说"，方便回看决策质量）
        ProactiveLog proactiveLog = new ProactiveLog();
        proactiveLog.setUserId(userId);
        proactiveLog.setMood(mood);
        proactiveLog.setIsRead(0);
        proactiveLog.setCreateDate(now);

        if (json != null) {
            JSONObject decision = JSON.parseObject(json);
            proactiveLog.setShouldReachOut(decision.getBooleanValue("shouldReachOut") ? 1 : 0);
            proactiveLog.setDecisionReason(decision.getString("reason"));
            proactiveLog.setMessage(decision.getString("message"));
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

        // 同时写入聊天记录，让它出现在对话流里
        ChatMessage message = new ChatMessage();
        message.setUserId(user.getId());
        message.setRole("assistant");
        message.setContent(log0.getMessage());
        message.setCreateDate(System.currentTimeMillis());
        chatMessageMapper.insert(message);

        return Result.success(log0.getMessage());
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
