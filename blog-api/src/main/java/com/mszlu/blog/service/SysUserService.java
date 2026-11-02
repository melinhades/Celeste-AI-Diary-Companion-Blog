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

    /** 原子消费草莓（delta 必须为负，余额不允许为负）；正向变动只能由服务端业务发放 */
    Result adjustBerry(String token, Integer delta);

    /** 新日记保存成功后的服务端权威奖励（+1 草莓，仅内部调用） */
    void grantDiaryBerry(String userId);

    /** 草莓籽收集奖励领取：服务端按 6 小时冷却发放 +1，客户端不能传金额 */
    Result claimSeedBerry(String token);

    /** 更新当前登录用户的个性签名（null/空串=清空，最长 30 字） */
    Result updateSignature(String token, String signature);
}
