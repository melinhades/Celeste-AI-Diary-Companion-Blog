package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_article_body")
public class ArticleBody {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String content;

    private String contentHtml;

    private Long articleId;
}
