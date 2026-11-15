package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.pojo.Category;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/category")
public class CategoryAdminController {

    private final ContentAdminService contentAdminService;

    public CategoryAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @GetMapping("/list")
    public Result list() {
        return contentAdminService.categoryList();
    }

    @PostMapping("/add")
    public Result add(@RequestBody Category category) {
        return contentAdminService.addCategory(category);
    }

    @PostMapping("/update")
    public Result update(@RequestBody Category category) {
        return contentAdminService.updateCategory(category);
    }

    @PostMapping("/delete/{id}")
    public Result delete(@PathVariable("id") Long id) {
        return contentAdminService.deleteCategory(id);
    }
}
