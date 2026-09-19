package com.mszlu.blog.dao.controller;

import com.mszlu.blog.dao.mapper.TagMapper;
import com.mszlu.blog.service.TagService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("tags")
public class TagsController {
    @Autowired
    private TagService tagService;
    @GetMapping("hot")
    public Result hot(){
        int limit  = 6;
        return tagService.hots(limit);
    }
    @GetMapping
    public Result finaAll(){
        return tagService.findAll();
    }
    @GetMapping("detail")
    public Result findAllDetail(){
        return tagService.findAllDetail();

    }

}
