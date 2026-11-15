package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_article_like")
public class ArticleLike {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String articleId;

    private String userId;

    private Long createDate;
}
