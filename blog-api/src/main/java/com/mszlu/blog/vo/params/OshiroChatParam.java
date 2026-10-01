package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * Oshiro 旅馆聊天请求体
 */
@Data
public class OshiroChatParam {

    private String message;

    /** JSON 数组字符串 */
    private String history;
}
