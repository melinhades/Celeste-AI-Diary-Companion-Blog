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

    /** 删除文章（仅作者本人），连带清理正文、标签关联、评论 */
    Result deleteArticle(String articleId);

    /** 我的文章列表（含私密），数据隔离：只查自己的 */
    Result myArticles(String authorId, int page, int pageSize);

    /** 当前登录用户的文章数（数据隔离：只算自己的） */
    Result myArticleCount(String authorId);

}

