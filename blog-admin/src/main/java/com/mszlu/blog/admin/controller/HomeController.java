package com.mszlu.blog.admin.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
public class HomeController {

    @GetMapping("/")
    public Map<String, Object> home() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "running");
        response.put("application", "Blog Admin API");
        response.put("message", "Admin API is running successfully");
        response.put("endpoints", new String[]{
            "POST /admin/permission/list",
            "POST /admin/permission/permissionList",
            "POST /admin/permission/add",
            "POST /admin/permission/update",
            "GET /admin/permission/delete/{id}"
        });
        return response;
    }
}
