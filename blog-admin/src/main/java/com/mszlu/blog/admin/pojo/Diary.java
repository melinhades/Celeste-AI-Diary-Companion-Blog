package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("ms_diary")
public class Diary {

    @TableId(type = IdType.INPUT)
    private String id;

    private String userId;

    private String title;

    private String content;

    private LocalDateTime createDate;

    private LocalDateTime updateDate;

    private String emotion;

    private String emotionDetail;

    private String type;
}
