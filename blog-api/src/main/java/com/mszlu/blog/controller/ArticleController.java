package com.mszlu.blog.controller;

import com.mszlu.blog.common.aop.LogAnnotation;
import com.mszlu.blog.common.cache.Cache;
import com.mszlu.blog.utils.UserThreadLocal;
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

    @PostMapping
    //加上此注解 代表要对此接口记录日志
    @LogAnnotation(module="文章",operator="获取文章列表")
    @Cache(name = "article", expire = 30_000)
    public Result listArticle(@RequestBody PageParams pageParams) {
        return articleService.listArticle(pageParams);
    }

    @PostMapping("hot")
    @Cache(name = "article", expire = 30_000)
    public Result hotArticle() {
        int limit = 5;
        return articleService.hotArticle(limit);
    }
    @PostMapping("new")
    @Cache(name = "article", expire = 30_000)
    public Result newArticles(){
     int limit = 5;
     return articleService.newArticles(limit);
    }
    @PostMapping("listArchives")
    @Cache(name = "article", expire = 30_000)
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

    /** 日记一键发布为博客（默认私密） */
    @PostMapping("publish-from-diary")
    public Result publishFromDiary(@RequestBody java.util.Map<String, String> body) {
        String diaryId = body == null ? null : body.get("diaryId");
        if (diaryId == null || diaryId.trim().isEmpty()) {
            return Result.fail(400, "缺少 diaryId");
        }
        return articleService.publishFromDiary(diaryId);
    }

    /** 切换文章可见性：1=公开 0=私密 */
    @PostMapping("visibility")
    public Result updateVisibility(@RequestBody java.util.Map<String, Object> body) {
        if (body == null || body.get("articleId") == null || body.get("visibility") == null) {
            return Result.fail(400, "缺少 articleId 或 visibility");
        }
        String articleId = String.valueOf(body.get("articleId"));
        int visibility = Integer.parseInt(String.valueOf(body.get("visibility")));
        if (visibility != Article.VISIBILITY_PUBLIC && visibility != Article.VISIBILITY_PRIVATE) {
            return Result.fail(400, "visibility 只能为 0 或 1");
        }
        return articleService.updateVisibility(articleId, visibility);
    }

    /** 一键删除文章（仅作者本人，详情页可见删除按钮） */
    @PostMapping("delete/{id}")
    public Result delete(@PathVariable("id") String articleId) {
        return articleService.deleteArticle(articleId);
    }

    /** 我的文章列表（含私密），数据隔离：只查自己的 */
    @GetMapping("mine")
    public Result myArticles(@RequestParam(defaultValue = "1") int page,
                             @RequestParam(defaultValue = "10") int pageSize) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(401, "未登录");
        return articleService.myArticles(user.getId(), page, pageSize);
    }

    /** 当前登录用户的文章数（数据隔离：只算自己的） */
    @GetMapping("myCount")
    public Result myCount() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        return articleService.myArticleCount(user.getId());
    }
}
