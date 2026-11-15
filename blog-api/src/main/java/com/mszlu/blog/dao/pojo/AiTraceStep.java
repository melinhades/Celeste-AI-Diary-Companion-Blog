package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/** AI 流程中的单个步骤：embedding / 向量检索 / LLM / 评分 / 解析 */
@Data
@TableName("ms_ai_trace_step")
public class AiTraceStep {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String traceId;

    private Integer seq;

    private String type;

    private String name;

    private String status;

    private Integer startOffsetMs;

    private Integer durationMs;

    private String model;

    private Double score;

    private String inputText;

    private String outputText;

    private String meta;

    private String error;
}
