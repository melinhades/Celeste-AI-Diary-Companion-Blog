package com.mszlu.blog.vo;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ContextChunk {

    /** memory / diary */
    private String source;

    private String text;

    /** 关联日期文案，如"3月12日的日记" */
    private String label;

    private double score;

    public String sourceLabel() {
        if ("diary".equals(source)) return "她的日记";
        if ("lore".equals(source)) return "Celeste设定";
        return "你记得的事";
    }
}
