package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_diary_companion")
public class DiaryCompanion {

    @TableId(type = IdType.INPUT)
    private String id;

    private String diaryId;

    private String suggestion;

    private String userId;

    private String content;

    private String triggerType;

    private Long createDate;
}
