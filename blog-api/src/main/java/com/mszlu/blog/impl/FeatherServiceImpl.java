package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.FeatherMapper;
import com.mszlu.blog.dao.pojo.Feather;
import com.mszlu.blog.service.FeatherService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class FeatherServiceImpl implements FeatherService {

    @Autowired
    private FeatherMapper featherMapper;

    @Override
    public Result save(String content) {
        String userId = UserThreadLocal.get().getId();
        if (content == null || content.trim().isEmpty()) {
            return Result.fail(400, "羽毛不能为空");
        }
        if (content.length() > 200) content = content.substring(0, 200);

        Feather feather = new Feather();
        feather.setUserId(userId);
        feather.setContent(content.trim());
        feather.setCreateDate(new Date());
        featherMapper.insert(feather);

        long count = featherMapper.selectCount(
                new LambdaQueryWrapper<Feather>().eq(Feather::getUserId, userId));
        Map<String, Object> data = new HashMap<>();
        data.put("count", count);
        return Result.success(data);
    }

    @Override
    public Result count() {
        String userId = UserThreadLocal.get().getId();
        long count = featherMapper.selectCount(
                new LambdaQueryWrapper<Feather>().eq(Feather::getUserId, userId));
        Map<String, Object> data = new HashMap<>();
        data.put("count", count);
        return Result.success(data);
    }

    @Override
    public Result recent(int limit) {
        String userId = UserThreadLocal.get().getId();
        List<Feather> list = featherMapper.selectList(
                new LambdaQueryWrapper<Feather>()
                        .eq(Feather::getUserId, userId)
                        .orderByDesc(Feather::getCreateDate)
                        .last("limit " + limit));
        return Result.success(list);
    }
}
