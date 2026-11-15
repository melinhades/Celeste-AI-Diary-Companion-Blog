package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.ArticlePageParam;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/admin/article")
public class ArticleAdminController {

    private final ContentAdminService contentAdminService;

    public ArticleAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @PostMapping("/page")
    public Result page(@RequestBody ArticlePageParam param) {
        return contentAdminService.articlePage(param);
    }

    @GetMapping("/{id}")
    public Result detail(@PathVariable("id") Long id) {
        return contentAdminService.articleDetail(id);
    }

    @PostMapping("/visibility")
    public Result visibility(@RequestBody Map<String, Object> body) {
        Long id = body.get("id") == null ? null : Long.valueOf(String.valueOf(body.get("id")));
        Integer visibility = body.get("visibility") == null ? null
                : Integer.valueOf(String.valueOf(body.get("visibility")));
        if (id == null) {
            return Result.fail(400, "缺少文章 id");
        }
        return contentAdminService.articleVisibility(id, visibility);
    }

    @PostMapping("/delete/{id}")
    public Result delete(@PathVariable("id") Long id) {
        return contentAdminService.deleteArticle(id);
    }
}
