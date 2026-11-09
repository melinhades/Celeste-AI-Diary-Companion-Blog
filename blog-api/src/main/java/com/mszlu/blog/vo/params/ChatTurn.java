package com.mszlu.blog.vo.params;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 对话历史条目：只接受 role / content，前端附带的其它字段一律忽略。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ChatTurn {

    /** user / assistant；其它值按 user 处理，与原有解析口径一致 */
    private String role;

    private String content;
}
