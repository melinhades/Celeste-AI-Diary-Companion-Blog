package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * Agent 决策追踪：把 AI 编排里的关键暗箱决策（检索命中、摘要、评审、插话掷骰、
 * 工具调用、反思触发）落到表里，调 prompt / 查问题时有据可依。
 */
@Data
public class AgentTrace {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** roundtable / chat / reminder / proactive */
    private String scene;

    /** 关联的会话 id（圆桌会议 id / 无则空） */
    private String sessionId;

    /** 事件名：retrieve / summary / judge / interject / reflect / persist / tool_reminder */
    private String event;

    /** 关键输入摘要（截断存储） */
    private String input;

    /** 关键输出/决策摘要（截断存储） */
    private String output;

    private Long latencyMs;

    private Long createDate;
}
