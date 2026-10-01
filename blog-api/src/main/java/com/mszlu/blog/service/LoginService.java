package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.LoginParam;
import org.springframework.transaction.annotation.Transactional;

@Transactional
public interface LoginService {
    Result login(LoginParam loginParam);

    SysUser checkToken(String token);

    /** 用户资料/余额变更后，刷新 Redis 中的登录态缓存（checkToken 读的就是这份缓存） */
    void refreshUserCache(String token, SysUser sysUser);

    Result logout(String token);

    Result register(LoginParam loginParam);
}
