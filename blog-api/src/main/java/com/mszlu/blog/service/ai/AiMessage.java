package com.mszlu.blog.service.ai;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AiMessage {

    /** system / user / assistant */
    private String role;

    private String content;
}
