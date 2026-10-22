package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.dao.mapper.DiaryChatLogMapper;
import com.mszlu.blog.dao.pojo.DiaryChatLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Madeline 日记多轮反应 · 全链路日志写入（每轮必写，不可省略）
 * <p>
 * 设计：每轮 companionStream 收尾时调用 write()，异步落库（@Async 或新 Thread）；
 * 所有字段在 companionStream 内部各步骤填充，本类只负责接收并批量写。
 */
@Component
@Slf4j
public class DiaryChatLogService {

    @Autowired private DiaryChatLogMapper logMapper;

    /** 每轮 companionStream 收尾时调一次，异步落库 */
    public void write(DiaryChatLog logEntity) {
        if (logEntity == null) return;
        new Thread(() -> {
            try {
                if (logEntity.getCreatedAt() == null) logEntity.setCreatedAt(LocalDateTime.now());
                logMapper.insert(logEntity);
            } catch (Exception e) {
                // 日志写入失败不能影响主流程，只打 warn
                log.warn("日记对话日志落库失败 sessionId={}: {}", logEntity.getSessionId(), e.getMessage());
            }
        }).start();
    }

    /** 查询某用户某会话的历史日志（用于前端拉历史） */
    public java.util.List<DiaryChatLog> listByUserAndSession(String userId, String sessionId) {
        return logMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<DiaryChatLog>()
                        .eq("user_id", userId)
                        .eq("session_id", sessionId)
                        .orderByAsc("turn_id")
        );
    }

    /** 记录用户反馈（前端点 👍/👎 后调） */
    public void recordFeedback(Long logId, String feedback) {
        DiaryChatLog e = logMapper.selectById(logId);
        if (e != null) {
            e.setUserFeedback(feedback);
            e.setCreatedAt(LocalDateTime.now());
            logMapper.updateById(e);
        }
    }

    /** 按 sessionId 找到本用户最后一条日志写反馈（不依赖 logId，前端只带 sessionId 更稳） */
    public void recordFeedbackBySession(String sessionId, String feedback) {
        DiaryChatLog last = logMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<DiaryChatLog>()
                        .eq("session_id", sessionId)
                        .orderByDesc("id")
                        .last("LIMIT 1")
        );
        if (last != null && last.getUserFeedback() == null) {
            last.setUserFeedback(feedback);
            last.setCreatedAt(LocalDateTime.now());
            logMapper.updateById(last);
        }
    }
}
