package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.controller.RealtimeChatController;
import com.mszlu.blog.dao.mapper.ArticleLikeMapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.NotificationMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.ArticleLike;
import com.mszlu.blog.dao.pojo.Notification;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LikeService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class LikeServiceImpl implements LikeService {

    @Autowired
    private ArticleLikeMapper articleLikeMapper;

    @Autowired
    private ArticleMapper articleMapper;

    @Autowired
    private NotificationMapper notificationMapper;

    @Autowired
    private SysUserService sysUserService;

    @Autowired
    private RealtimeChatController realtimeChatController;

    @Override
    public Result toggle(String articleId, SysUser user) {
        LambdaQueryWrapper<ArticleLike> qw = new LambdaQueryWrapper<>();
        qw.eq(ArticleLike::getArticleId, articleId).eq(ArticleLike::getUserId, user.getId());
        ArticleLike existing = articleLikeMapper.selectOne(qw);
        if (existing != null) {
            articleLikeMapper.deleteById(existing.getId());
        } else {
            ArticleLike like = new ArticleLike();
            like.setArticleId(articleId);
            like.setUserId(user.getId());
            like.setCreateDate(System.currentTimeMillis());
            articleLikeMapper.insert(like);
            Article article = articleMapper.selectById(articleId);
            if (article != null && !user.getId().equals(article.getAuthorId())) {
                Notification n = new Notification();
                n.setUserId(article.getAuthorId());
                n.setFromUserId(user.getId());
                n.setArticleId(articleId);
                n.setType("like");
                n.setIsRead(0);
                n.setCreateDate(System.currentTimeMillis());
                notificationMapper.insert(n);

                // 只在「别人点赞成功」后追加实时事件，不改点赞业务本身：
                // 定向推给文章作者，前端据此在铭记场景里刷 1 颗心（自我点赞不进入此分支）
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("id", n.getId());
                payload.put("articleId", articleId);
                payload.put("articleTitle", article.getTitle());
                payload.put("fromUserId", String.valueOf(user.getId()));
                payload.put("fromName", user.getNickname() != null && !user.getNickname().isEmpty()
                        ? user.getNickname() : user.getAccount());
                payload.put("count", 1);
                payload.put("ts", System.currentTimeMillis());
                realtimeChatController.sendToUser(article.getAuthorId(), "like", payload);
            }
        }
        return info(articleId, user);
    }

    @Override
    public Result info(String articleId, SysUser user) {
        LambdaQueryWrapper<ArticleLike> qw = new LambdaQueryWrapper<>();
        qw.eq(ArticleLike::getArticleId, articleId);
        Long count = articleLikeMapper.selectCount(qw);
        boolean liked = false;
        if (user != null) {
            LambdaQueryWrapper<ArticleLike> mq = new LambdaQueryWrapper<>();
            mq.eq(ArticleLike::getArticleId, articleId).eq(ArticleLike::getUserId, user.getId());
            liked = articleLikeMapper.selectCount(mq) > 0;
        }
        Map<String, Object> data = new HashMap<>();
        data.put("likeCount", count);
        data.put("liked", liked);
        return Result.success(data);
    }

    @Override
    public Result batchCounts(List<String> articleIds) {
        Map<String, Long> map = new HashMap<>();
        if (articleIds != null && !articleIds.isEmpty()) {
            LambdaQueryWrapper<ArticleLike> qw = new LambdaQueryWrapper<>();
            qw.in(ArticleLike::getArticleId, articleIds);
            List<ArticleLike> likes = articleLikeMapper.selectList(qw);
            for (ArticleLike l : likes) {
                map.merge(l.getArticleId(), 1L, Long::sum);
            }
        }
        return Result.success(map);
    }

    @Override
    public Result likers(String articleId) {
        LambdaQueryWrapper<ArticleLike> qw = new LambdaQueryWrapper<>();
        qw.eq(ArticleLike::getArticleId, articleId)
                .orderByDesc(ArticleLike::getCreateDate)
                .last("limit 10");
        List<ArticleLike> likes = articleLikeMapper.selectList(qw);
        List<String> names = new ArrayList<>();
        for (ArticleLike l : likes) {
            SysUser u = sysUserService.findUserById(l.getUserId());
            if (u != null) names.add(u.getNickname());
        }
        return Result.success(names);
    }
}
