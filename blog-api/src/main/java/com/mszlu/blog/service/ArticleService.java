package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ArticleParam;
import com.mszlu.blog.vo.params.PageParams;
import com.mszlu.blog.vo.params.ArticleVo;
import org.springframework.transaction.annotation.Transactional;

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

}

