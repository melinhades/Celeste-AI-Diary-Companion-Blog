package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("memory")
public class MemoryController {

    @Autowired
    private MemoryService memoryService;

    /** "它记得我什么"页面：列出所有未完结记忆 */
    @GetMapping("list")
    public Result listOpen() {
        return memoryService.listOpen();
    }

    /** 用户手动了结某条记忆 */
    @PostMapping("resolve/{id}")
    public Result resolve(@PathVariable("id") String id) {
        return memoryService.resolve(id);
    }

    /** 一次性运维：给存量记忆回填向量 */
    @PostMapping("reindex")
    public Result reindex() {
        return memoryService.reindex();
    }
}
