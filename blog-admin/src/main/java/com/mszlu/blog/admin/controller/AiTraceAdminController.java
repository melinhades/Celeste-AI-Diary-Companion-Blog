package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.AiTracePageParam;
import com.mszlu.blog.admin.service.AiTraceAdminService;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin/ai/trace")
public class AiTraceAdminController {

    private final AiTraceAdminService aiTraceAdminService;

    public AiTraceAdminController(AiTraceAdminService aiTraceAdminService) {
        this.aiTraceAdminService = aiTraceAdminService;
    }

    @PostMapping("/page")
    public Result page(@RequestBody AiTracePageParam param) {
        return aiTraceAdminService.page(param);
    }

    @GetMapping("/scenes")
    public Result scenes() {
        return aiTraceAdminService.scenes();
    }

    @GetMapping("/{id}")
    public Result detail(@PathVariable("id") String id) {
        return aiTraceAdminService.detail(id);
    }
}
