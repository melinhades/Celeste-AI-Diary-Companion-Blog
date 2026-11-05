package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.NotificationMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.Notification;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.NotificationService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class NotificationServiceImpl implements NotificationService {

    @Autowired
    private NotificationMapper notificationMapper;
    @Autowired
    private ArticleMapper articleMapper;
    @Autowired
    private SysUserService sysUserService;

    @Override
    public Result listMine(String userId) {
        LambdaQueryWrapper<Notification> qw = new LambdaQueryWrapper<>();
        qw.eq(Notification::getUserId, userId)
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
            // 发起者匿名的通知不去解析 fromUserId，否则文章作者能从消息列表里认出评论者
            String fromName = "有人";
            if (n.getAnonymous() != null && n.getAnonymous() == 1) {
                fromName = "匿名";
            } else {
                SysUser from = sysUserService.findUserById(n.getFromUserId());
                if (from != null) {
                    fromName = from.getNickname();
                }
            }
            m.put("fromName", fromName);
            Article a = articleMapper.selectById(n.getArticleId());
            m.put("articleTitle", a != null ? a.getTitle() : "已删除的文章");
            out.add(m);
        }
        return Result.success(out);
    }

    @Override
    public Result unreadCount(String userId) {
        LambdaQueryWrapper<Notification> qw = new LambdaQueryWrapper<>();
        qw.eq(Notification::getUserId, userId).eq(Notification::getIsRead, 0);
        return Result.success(notificationMapper.selectCount(qw));
    }

    @Override
    public Result markAllRead(String userId) {
        Notification upd = new Notification();
        upd.setIsRead(1);
        LambdaUpdateWrapper<Notification> uw = new LambdaUpdateWrapper<>();
        uw.eq(Notification::getUserId, userId).eq(Notification::getIsRead, 0);
        notificationMapper.update(upd, uw);
        return Result.success(null);
    }
}
