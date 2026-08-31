package com.mszlu.blog.dao.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.common.aop.LogAnnotation;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.ArticleService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ArticleParam;
import com.mszlu.blog.vo.params.PageParams;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("articles")
public class ArticleController {
    @Autowired
    private ArticleService articleService;

    @Autowired
    private ArticleMapper articleMapper;

    @PostMapping
    //加上此注解 代表要对此接口记录日志
    @LogAnnotation(module="文章",operator="获取文章列表")
    public Result listArticle(@RequestBody PageParams pageParams) {
        return articleService.listArticle(pageParams);
    }

    @PostMapping("hot")
    public Result hotArticle() {
        int limit = 5;
        return articleService.hotArticle(limit);
    }
    @PostMapping("new")
    public Result newArticles(){
     int limit = 5;
     return articleService.newArticles(limit);
    }
    @PostMapping("listArchives")
    public Result listArchives(){
        return articleService.listArchives();

    }
    @PostMapping("article/view/{id}")
    public Result findArticleById(@PathVariable("id") String articleId){
        return articleService.findArticlesById(articleId);
    }
    @PostMapping("publish")
    public Result publish(@RequestBody ArticleParam articleParam){
        return articleService.publish(articleParam);
    }

    @PostMapping("update")
    public Result update(@RequestBody ArticleParam articleParam){
        return articleService.update(articleParam);
    }

    /** 当前登录用户的文章数（数据隔离：只算自己的） */
    @GetMapping("myCount")
    public Result myCount() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        LambdaQueryWrapper<Article> qw = new LambdaQueryWrapper<>();
        qw.eq(Article::getAuthorId, user.getId());
        return Result.success(articleMapper.selectCount(qw));
    }
}
