package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Madeline 日记会话记忆（每 3 轮压缩一次摘要，≤ 100 字）
 */
@Data
@TableName("diary_chat_session")
public class DiaryChatSession {

    @TableId(type = IdType.INPUT)   // sessionId 手工生成，不依赖数据库
    private String sessionId;

    private String userId;
    private String summary;          // 累计摘要（≤ 100 字）
    private Integer turnCount;
    private LocalDateTime lastActiveAt;
    private LocalDateTime createdAt;
}
