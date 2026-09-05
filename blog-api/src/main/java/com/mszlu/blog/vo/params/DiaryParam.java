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
}