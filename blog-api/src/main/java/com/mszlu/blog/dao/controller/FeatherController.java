package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.FeatherService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("feather")
public class FeatherController {

    @Autowired
    private FeatherService featherService;

    @PostMapping
    public Result save(@RequestBody FeatherParam param) {
        return featherService.save(param.getContent());
    }

    @GetMapping("count")
    public Result count() {
        return featherService.count();
    }

    @GetMapping("recent")
    public Result recent(@RequestParam(defaultValue = "5") int limit) {
        return featherService.recent(limit);
    }

    static class FeatherParam {
        private String content;

        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
}
