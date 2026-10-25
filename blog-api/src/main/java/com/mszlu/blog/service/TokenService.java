package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.SysUser;

/**
 * 登录态（token → 用户）的校验与缓存维护。
 *
 * <p>从 {@link LoginService} 拆出：token 校验是会话关注点，与账号/注册逻辑无关。
 * 拆分前 LoginServiceImpl 注入 SysUserService、SysUserServiceImpl 又注入 LoginService，
 * 二者互相依赖构成循环引用（Spring Boot 2.6+ 默认禁止，启动直接失败）。
 * 拆分后依赖图变为 LoginService → SysUserService → TokenService，有向无环。</p>
 */
public interface TokenService {

    /** 校验 token：JWT 签名 + Redis 登录态缓存，任一不通过返回 null */
    SysUser checkToken(String token);

    /** 用户资料/余额变更后，刷新 Redis 中的登录态缓存（checkToken 读的就是这份缓存） */
    void refreshUserCache(String token, SysUser sysUser);
}
