package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ArticleLikeMapper;
import com.mszlu.blog.dao.pojo.ArticleLike;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LikeService;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class LikeServiceImpl implements LikeService {

    @Autowired
    private ArticleLikeMapper articleLikeMapper;

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
}
