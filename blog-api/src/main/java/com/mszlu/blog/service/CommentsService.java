package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.CommentParam;

public interface CommentsService {
    /*
    根据文章id 查询所有评论列表
     */
    Result commentsByArticleId(String id);
    Result comment(CommentParam commentParam);
}
