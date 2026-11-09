package com.mszlu.blog.vo.params;

import lombok.Data;

import java.util.List;

/**
 * Badeline 影子聊天请求体
 */
@Data
public class BadelineChatParam {

    private String message;

    /** 对话历史 [{role:'user'|'assistant', content:'...'}] */
    private List<ChatTurn> history;

    /** 心之水晶 [{color,title,desc,seq}] */
    private List<HeartItem> hearts;
}
