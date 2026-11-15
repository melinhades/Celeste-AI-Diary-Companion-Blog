package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.pojo.Tag;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/tag")
public class TagAdminController {

    private final ContentAdminService contentAdminService;

    public TagAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @GetMapping("/list")
    public Result list() {
        return contentAdminService.tagList();
    }

    @PostMapping("/add")
    public Result add(@RequestBody Tag tag) {
        return contentAdminService.addTag(tag);
    }

    @PostMapping("/update")
    public Result update(@RequestBody Tag tag) {
        return contentAdminService.updateTag(tag);
    }

    @PostMapping("/delete/{id}")
    public Result delete(@PathVariable("id") Long id) {
        return contentAdminService.deleteTag(id);
    }
}
