package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * 日记伴侣建议表（Madeline 对日记内容的反馈）
 */
@Data
public class DiaryCompanion {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 用户ID */
    private String userId;

    /** 日记ID（对应的日记条目） */
    private String diaryId;

    /** Madeline 的建议/反馈内容 */
    private String suggestion;

    /** 日记内容摘要 */
    private String content;

    /** 创建时间 */
    private Long createDate;
}