package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 日记参数（保存/更新时使用）
 */
@Data
public class DiaryParam {

    /** 日记ID（更新时提供，新增时可为空） */
    private String id;

    /** 标题 */
    private String title;

    /** 内容 */
    private String content;

    /** 情绪数据（可选：保存时的分析结果 / 快照时的聚合摘要） */
    private String emotion;

    /** 日记类型：day=普通日记（默认），dream=梦境日记 */
    private String type;

    /** 快照类型：week=周度快照，month=月度快照 */
    private String snapType;

    /** 周度快照：3-5 条日记原话片段（换行分隔） */
    private String keySentences;

    /** 周度快照：情绪评分趋势 */
    private String trend;
}