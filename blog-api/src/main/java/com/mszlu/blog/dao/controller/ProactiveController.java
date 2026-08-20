package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.ProactiveService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("proactive")
public class ProactiveController {

    @Autowired
    private ProactiveService proactiveService;

    /** 前端进聊天页时轮询：有没有 AI 主动发来的话 */
    @GetMapping("latest")
    public Result latestUnread() {
        return proactiveService.latestUnread();
    }

    /** 调试专用：手动触发一次每日决策（正式环境建议删掉或加管理员校验） */
    @PostMapping("trigger")
    public Result trigger() {
        proactiveService.dailyReachOut();
        return Result.success("已触发，看日志和 proactive_log 表");
    }
}
