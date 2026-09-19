package com.mszlu.blog.dao.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.NotificationMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.Notification;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("notifications")
public class NotificationController {

    @Autowired
    private NotificationMapper notificationMapper;

    @Autowired
    private SysUserService sysUserService;

    @Autowired
    private ArticleMapper articleMapper;

    @GetMapping("list")
    public Result list() {
        SysUser user = UserThreadLocal.get();
        LambdaQueryWrapper<Notification> qw = new LambdaQueryWrapper<>();
        qw.eq(Notification::getUserId, user.getId())
                .orderByDesc(Notification::getCreateDate)
                .last("limit 30");
        List<Notification> rows = notificationMapper.selectList(qw);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Notification n : rows) {
            Map<String, Object> m = new HashMap<>();
            m.put("id", n.getId());
            m.put("articleId", n.getArticleId());
            m.put("type", n.getType());
            m.put("isRead", n.getIsRead());
            m.put("createDate", n.getCreateDate());
            SysUser from = sysUserService.findUserById(n.getFromUserId());
            m.put("fromName", from != null ? from.getNickname() : "有人");
            Article a = articleMapper.selectById(n.getArticleId());
            m.put("articleTitle", a != null ? a.getTitle() : "已删除的文章");
            out.add(m);
        }
        return Result.success(out);
    }

    @GetMapping("unread")
    public Result unread() {
        SysUser user = UserThreadLocal.get();
        LambdaQueryWrapper<Notification> qw = new LambdaQueryWrapper<>();
        qw.eq(Notification::getUserId, user.getId()).eq(Notification::getIsRead, 0);
        return Result.success(notificationMapper.selectCount(qw));
    }

    @PostMapping("readAll")
    public Result readAll() {
        SysUser user = UserThreadLocal.get();
        Notification upd = new Notification();
        upd.setIsRead(1);
        LambdaUpdateWrapper<Notification> uw = new LambdaUpdateWrapper<>();
        uw.eq(Notification::getUserId, user.getId()).eq(Notification::getIsRead, 0);
        notificationMapper.update(upd, uw);
        return Result.success(null);
    }
}
