package com.mszlu.blog.controller;

import com.mszlu.blog.vo.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("test")
public class TestController {

    @RequestMapping
    public Result test(){
        return Result.success(null);
    }

    @GetMapping("hello")
    public Result hello(){
        return Result.success("Blog API is running successfully!");
    }
}

