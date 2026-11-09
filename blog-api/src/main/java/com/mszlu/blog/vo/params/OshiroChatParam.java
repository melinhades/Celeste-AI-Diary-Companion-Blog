package com.mszlu.blog.vo.params;

import lombok.Data;

import java.util.List;

/**
 * Oshiro 旅馆聊天请求体
 */
@Data
public class OshiroChatParam {

    private String message;

    /** 历史对话行（前端逐条序列化后的字符串，与原有提示词口径一致） */
    private List<String> history;
}
