package com.mszlu.blog.vo.params;

import lombok.Data;

@Data
public class CommentParam {

    private String articleId;

    private String content;

    private String parent;

    private String toUserId;

    /**
     * 是否匿名评论，与文章发表保持同一约定：不传/null 当非匿名
     */
    private Boolean anonymous;
}