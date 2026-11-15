package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_ai_trace")
public class AiTrace {

    @TableId(type = IdType.INPUT)
    private String id;

    private String scene;

    private String userId;

    private String title;

    private String status;

    private String model;

    private Long startTime;

    private Integer durationMs;

    private Integer stepCount;

    private Integer promptTokens;

    private Integer completionTokens;

    private Double score;

    private String summary;

    private String error;

    private Long createDate;
}
