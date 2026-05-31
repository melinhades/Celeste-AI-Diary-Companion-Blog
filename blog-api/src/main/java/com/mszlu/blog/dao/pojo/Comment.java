package com.mszlu.blog.dao.pojo;

import lombok.Data;

@Data
public class Comment {

    private String id;

    private String content;

    private Long createDate;

    private String articleId;

    private String authorId;

    private String parentId;

    private String toUid;

    private Integer level;
}