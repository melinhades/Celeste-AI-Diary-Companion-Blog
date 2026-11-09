package com.mszlu.blog.vo.params;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 心之水晶条目：只接受 color / title / desc / seq，前端附带的 date、legacy 等字段忽略。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class HeartItem {

    private String color;

    private String title;

    private String desc;

    private Integer seq;
}
