package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ArticleParam;
import com.mszlu.blog.vo.params.PageParams;
import com.mszlu.blog.vo.params.ArticleVo;

import java.util.List;

public interface ArticleService {

    List<ArticleVo> listArticlesPage(PageParams pageParams);
    Result listArticle(PageParams pageParams);
    Result hotArticle(int limit);
    Result newArticles(int limit);
    //文章归档
    Result listArchives();
    //查询文章详请
    Result findArticlesById(String articleId);
    Result publish(ArticleParam articleParam);
    Result update(ArticleParam articleParam);

    /** 日记一键发布为博客（默认私密；同一篇日记重复调用返回已发布的文章） */
    Result publishFromDiary(String diaryId);

    /** 切换文章可见性：Article.VISIBILITY_PUBLIC / VISIBILITY_PRIVATE */
    Result updateVisibility(String articleId, int visibility);

}

