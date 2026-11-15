package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import lombok.Data;

@Data
@TableName("ms_article")
public class Article {

    /** 雪花 id 超出 JS 安全整数范围，序列化成字符串避免前端精度丢失 */
    @JsonSerialize(using = ToStringSerializer.class)
    @TableId(type = IdType.AUTO)
    private Long id;

    private Integer commentCounts;

    private Long createDate;

    private String summary;

    private String title;

    private Integer viewCounts;

    private Integer weight;

    private Long authorId;

    private Long bodyId;

    private Integer categoryId;

    private Integer visibility;

    private String sourceType;

    private String sourceId;

    private Integer anonymous;

    private Long publishTime;
}
