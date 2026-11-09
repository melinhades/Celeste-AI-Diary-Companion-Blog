package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.UserVo;

public interface SysUserService {
    UserVo findUserVoById(String id);

    SysUser findUserById(String id);

    Result findUserByToken(String token);
    //根据账号查找用户
    SysUser findUserByAccount(String account);
    //保存用户
    void save(SysUser sysUser);
    //按 id 更新用户（旧明文密码登录成功后懒迁移为 BCrypt 用）
    void updateById(SysUser sysUser);

    /** 查询当前登录用户的草莓余额 */
    Result berryBalance(String token);

    /** 新日记保存成功后的服务端权威奖励（+1 草莓，仅内部调用） */
    void grantDiaryBerry(String userId);

    /**
     * 草莓籽收集奖励领取：服务端按 6 小时冷却发放 +1，客户端不能传金额。
     * batchId 为前端批次编号，用于幂等：同一批次重复领取只回报「已发放」，不再加余额。
     */
    Result claimSeedBerry(String token, String batchId);

    /** 更新当前登录用户的个性签名（null/空串=清空，最长 30 字） */
    Result updateSignature(String token, String signature);

    /** 设置或清空当前用户自定义 AI API Key（空串=null→回退系统默认，最长 128） */
    Result updateApiKey(String token, String apiKey);

    /**
     * 用待安装的 Key 做一次上游连通性测试（不落库）。
     * model 为空 → 探测服务商并附带可用对话模型列表；model 非空 → 用该模型做最小 chat 探测
     */
    Result testApiKey(String token, String apiKey, String model);

    /** 查询当前用户 API Key 配置状态（只返回 hasApiKey 布尔，不返回明文） */
    Result apiKeyStatus(String token);
}
