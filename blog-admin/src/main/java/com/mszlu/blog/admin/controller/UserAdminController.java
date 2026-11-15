package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.PageParam;
import com.mszlu.blog.admin.service.ContentAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/user")
public class UserAdminController {

    private final ContentAdminService contentAdminService;

    public UserAdminController(ContentAdminService contentAdminService) {
        this.contentAdminService = contentAdminService;
    }

    @PostMapping("/page")
    public Result page(@RequestBody PageParam param) {
        return contentAdminService.userPage(param);
    }
}
