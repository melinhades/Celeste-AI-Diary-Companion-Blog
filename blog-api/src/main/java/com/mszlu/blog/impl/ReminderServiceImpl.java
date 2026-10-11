package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ChatMessageMapper;
import com.mszlu.blog.dao.mapper.ReminderMapper;
import com.mszlu.blog.dao.pojo.ChatMessage;
import com.mszlu.blog.dao.pojo.Reminder;
import com.mszlu.blog.service.AgentTraceService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 提醒派发：每分钟扫一遍到点的提醒，写成一条 assistant 聊天消息。
 * 用户下次打开 messages 页（或历史刷新）自然看到——到点有人在耳边说了一句。
 */
@Service
@Slf4j
public class ReminderServiceImpl {

    private static final long LATE_GRACE_MS = 24 * 60 * 60 * 1000L; // 超过1天的陈年提醒不再派发

    @Autowired
    private ReminderMapper reminderMapper;
    @Autowired
    private ChatMessageMapper chatMessageMapper;
    @Autowired
    private AgentTraceService agentTraceService;

    @Scheduled(cron = "0 * * * * ?")
    public void dispatchDue() {
        long now = System.currentTimeMillis();
        try {
            LambdaQueryWrapper<Reminder> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Reminder::getStatus, 0);
            wrapper.le(Reminder::getRemindAt, now);
            wrapper.ge(Reminder::getRemindAt, now - LATE_GRACE_MS);
            wrapper.last("limit 50");
            List<Reminder> due = reminderMapper.selectList(wrapper);
            for (Reminder r : due) {
                dispatchOne(r, now);
            }
        } catch (Exception e) {
            log.warn("提醒派发扫描失败: {}", e.getMessage());
        }
    }

    private void dispatchOne(Reminder r, long now) {
        long t0 = System.currentTimeMillis();
        try {
            ChatMessage msg = new ChatMessage();
            msg.setUserId(r.getUserId());
            msg.setRole("assistant");
            msg.setContent("⏰ 到点了——你之前让我提醒你：" + r.getContent() + "。别糊弄过去，就现在。");
            msg.setCreateDate(now);
            chatMessageMapper.insert(msg);

            Reminder update = new Reminder();
            update.setId(r.getId());
            update.setStatus(1);
            reminderMapper.updateById(update);

            agentTraceService.record("reminder", r.getId(), r.getUserId(), "dispatch",
                    "text=" + r.getContent(), "delivered as chat message",
                    System.currentTimeMillis() - t0);
        } catch (Exception e) {
            log.warn("提醒派发失败 reminderId={}: {}", r.getId(), e.getMessage());
        }
    }
}
