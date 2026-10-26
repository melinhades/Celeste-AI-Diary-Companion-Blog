package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.TokenService;
import com.mszlu.blog.utils.JWTUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class TokenServiceImpl implements TokenService {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    @Autowired
    private JWTUtils jwtUtils;

    @Override
    public SysUser checkToken(String token) {
        if (StringUtils.isBlank(token)) {
            return null;
        }
        Map<String, Object> stringObjectMap = jwtUtils.checkToken(token);
        if (stringObjectMap == null) {
            return null;
        }
        String userJson = redisTemplate.opsForValue().get("Token_" + token);
        if (userJson == null) {
            return null;
        }
        return JSON.parseObject(userJson, SysUser.class);
    }

    @Override
    public void refreshUserCache(String token, SysUser sysUser) {
        try {
            // 保持原 30 天 TTL：用 getExpire 读出剩余秒数后重写，过期后自然重新登录
            String key = "Token_" + token;
            Long ttl = redisTemplate.getExpire(key, TimeUnit.SECONDS);
            if (ttl != null && ttl > 0) {
                redisTemplate.opsForValue().set(key, JSON.toJSONString(sysUser), ttl, TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            // 缓存刷新失败不影响写库结果，下次登录自然一致
        }
    }
}
