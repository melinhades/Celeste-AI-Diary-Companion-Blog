package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.DiaryPageParam;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/diary")
public class DiaryAdminController {

    private final ContentAdminService contentAdminService;

    public DiaryAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @PostMapping("/page")
    public Result page(@RequestBody DiaryPageParam param) {
        return contentAdminService.diaryPage(param);
    }

    @GetMapping("/{id}")
    public Result detail(@PathVariable("id") String id) {
        return contentAdminService.diaryDetail(id);
    }

    @PostMapping("/delete/{id}")
    public Result delete(@PathVariable("id") String id) {
        return contentAdminService.deleteDiary(id);
    }
}
