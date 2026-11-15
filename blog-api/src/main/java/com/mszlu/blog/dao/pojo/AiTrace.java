package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 一次 AI 业务流程的追踪记录（RAG 检索 / 向量检索 / LLM 调用 / 评分）。
 * 只写不读：blog-api 负责记录，blog-admin 只读展示，不对外暴露任何查询接口。
 */
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
