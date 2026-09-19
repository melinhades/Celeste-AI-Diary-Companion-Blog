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
        return "diary".equals(source) ? "她的日记" : "你记得的事";
    }
}
