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

    /**
     * 是否匿名评论：1=匿名 0=非匿名（匿名时不下发作者信息，通知也只显「匿名」）
     */
    private Integer anonymous;
}