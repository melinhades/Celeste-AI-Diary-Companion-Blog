package com.mszlu.blog.vo;

import lombok.Data;

import java.util.Map;

/**
 * RAG 检索指标：每次检索后记录，用于监控和调优。
 * 前端可视化 or 日志分析工具可消费此指标。
 */
@Data
public class RagMetrics {

    /** 召回记录总数 */
    private int totalRecalled;

    /** 检索耗时（毫秒） */
    private long elapsedMs;

    /** 命中源分布：memory / diary / lore 各召回多少条 */
    private Map<String, Integer> sourceDistribution;

    /** 相似度分位数：p50 / p90 / max（用于判断召回质量） */
    private Double similarityP50;
    private Double similarityP90;
    private Double similarityMax;

    /** 是否命中向量检索（false = 降级到 2-gram） */
    private boolean vectorHit;

    /** 查询文本（脱敏后的前 20 字，用于日志分析） */
    private String querySnippet;
}
