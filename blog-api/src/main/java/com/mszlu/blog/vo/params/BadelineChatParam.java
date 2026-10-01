package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * Badeline 影子聊天请求体
 */
@Data
public class BadelineChatParam {

    private String message;

    /** JSON 数组字符串 [{role:'user'|'assistant', content:'...'}] */
    private String history;

    /** JSON 数组字符串 [{color,title,desc,seq}] */
    private String hearts;
}
