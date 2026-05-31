package com.mszlu.blog.vo.params;

import lombok.Data;

@Data
public class CommentParam {

    private String articleId;

    private String content;

    private String parent;

    private String toUserId;}