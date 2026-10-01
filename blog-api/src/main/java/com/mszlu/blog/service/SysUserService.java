package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.UserVo;

public interface SysUserService {
    UserVo findUserVoById(String id);

    SysUser findUserById(String id);

    SysUser findUser(String account, String password);

    Result findUserByToken(String token);
    //根据账号查找用户
    SysUser findUserByAccount(String account);
    //保存用户
    void save(SysUser sysUser);
    //按 id 更新用户（旧明文密码登录成功后懒迁移为 BCrypt 用）
    void updateById(SysUser sysUser);

    /** 查询当前登录用户的草莓余额 */
    Result berryBalance(String token);

    /** 原子增减草莓余额（delta 正=获得，负=消费），余额不允许为负 */
    Result adjustBerry(String token, Integer delta);

    /** 更新当前登录用户的个性签名（null/空串=清空，最长 30 字） */
    Result updateSignature(String token, String signature);
}
