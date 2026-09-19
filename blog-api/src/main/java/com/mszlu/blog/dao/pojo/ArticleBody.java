package com.mszlu.blog.dao.pojo;

import lombok.Data;

@Data
public class ArticleBody {
    private String id;
    private String content;
    private String contentHtml;
    private String articleId;
}
