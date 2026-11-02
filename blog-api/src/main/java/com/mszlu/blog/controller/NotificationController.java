package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.NotificationService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("notifications")
public class NotificationController {

    @Autowired
    private NotificationService notificationService;

    @GetMapping("list")
    public Result list() {
        SysUser user = UserThreadLocal.get();
        return notificationService.listMine(user.getId());
    }

    @GetMapping("unread")
    public Result unread() {
        SysUser user = UserThreadLocal.get();
        return notificationService.unreadCount(user.getId());
    }

    @PostMapping("readAll")
    public Result readAll() {
        SysUser user = UserThreadLocal.get();
        return notificationService.markAllRead(user.getId());
    }
}
