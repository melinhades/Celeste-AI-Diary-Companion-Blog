package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * Madeline agent 请求体：聊天框里带任务意图的用户消息
 */
@Data
public class AgentParam {

    /** 用户消息原文 */
    private String message;
}
