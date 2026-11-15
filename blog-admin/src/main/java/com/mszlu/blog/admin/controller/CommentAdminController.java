package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.CommentPageParam;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/comment")
public class CommentAdminController {

    private final ContentAdminService contentAdminService;

    public CommentAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @PostMapping("/page")
    public Result page(@RequestBody CommentPageParam param) {
        return contentAdminService.commentPage(param);
    }

    @PostMapping("/delete/{id}")
    public Result delete(@PathVariable("id") Long id) {
        return contentAdminService.deleteComment(id);
    }
}
