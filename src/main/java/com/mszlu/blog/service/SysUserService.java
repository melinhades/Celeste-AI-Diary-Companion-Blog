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
}
