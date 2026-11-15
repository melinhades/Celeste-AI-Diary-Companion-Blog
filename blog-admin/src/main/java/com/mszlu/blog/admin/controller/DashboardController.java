package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/dashboard")
public class DashboardController {

    private final ContentAdminService contentAdminService;

    public DashboardController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @GetMapping("/overview")
    public Result overview() {
        return contentAdminService.overview();
    }
}
