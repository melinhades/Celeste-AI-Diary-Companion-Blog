package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.utils.JWTUtils;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ErrorCode;
import com.mszlu.blog.vo.params.LoginParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class LoginServiceImpl implements LoginService {
    @Autowired
    private SysUserService sysUserService;
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    @Autowired
    private JWTUtils jwtUtils;
    // BCryptPasswordEncoder 无状态、线程安全，直接实例化即可。
    // blog-api 上下文里没有该 Bean，若继续用 @Autowired 启动会报 NoSuchBeanDefinitionException。
    private final org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder passwordEncoder
            = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();

    @Override
    public Result login(LoginParam loginParam) {
        String account = loginParam.getAccount();
        String password = loginParam.getPassword();
        if (StringUtils.isBlank(account) || StringUtils.isBlank(password)) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), ErrorCode.PARAMS_ERROR.getMsg());
        }
        SysUser sysUser = sysUserService.findUserByAccount(account);
        if (sysUser == null) {
            return Result.fail(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), ErrorCode.ACCOUNT_PWD_NOT_EXIST.getMsg());
        }
        String stored = sysUser.getPassword();
        boolean matched;
        boolean legacy = false;
        if (stored != null && stored.startsWith("$2")) {
            // 新账号：库里存的是 BCrypt 哈希
            matched = passwordEncoder.matches(password, stored);
        } else if (stored != null && stored.matches("[0-9a-fA-F]{32}")) {
            // 老账号（MD5 时代）：库里存的是无盐 MD5(password)，32 位十六进制
            matched = org.apache.commons.codec.digest.DigestUtils.md5Hex(password).equalsIgnoreCase(stored);
            legacy = true;
        } else {
            // 更老的账号：明文存储，直接比对原文
            matched = stored != null && stored.equals(password);
            legacy = true;
        }
        if (matched && legacy) {
            // 懒迁移：老格式（MD5/明文）登录成功后升级为 BCrypt，下次即走 BCrypt 分支
            sysUser.setPassword(passwordEncoder.encode(password));
            sysUserService.updateById(sysUser);
        }
        if (!matched) {
            return Result.fail(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), ErrorCode.ACCOUNT_PWD_NOT_EXIST.getMsg());
        }
        String token = jwtUtils.createToken(sysUser.getId());
        redisTemplate.opsForValue().set("Token_" + token, JSON.toJSONString(sysUser), 30, TimeUnit.DAYS);
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("token", token);
        String nickname = sysUser.getNickname();
        data.put("nickname", (nickname != null && !nickname.isEmpty()) ? nickname : sysUser.getAccount());
        data.put("account", sysUser.getAccount());
        return Result.success(data);
    }

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
        SysUser sysUser = JSON.parseObject(userJson, SysUser.class);
        return sysUser;
    }

    @Override
    public Result logout(String token) {
        redisTemplate.delete("Token_" + token);
        return Result.success(null);
    }

    @Override
    public Result register(LoginParam loginParam) {
        String account = loginParam.getAccount();
        String password = loginParam.getPassword();
        String nickname = loginParam.getNickname();
        if (StringUtils.isBlank(account) || StringUtils.isBlank(password) || StringUtils.isBlank(nickname)) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), ErrorCode.PARAMS_ERROR.getMsg());
        }
        SysUser sysUser = sysUserService.findUserByAccount(account);
        if (sysUser != null) {
            return Result.fail(ErrorCode.ACCOUNT_EXIST.getCode(), "账户已经注册了");

        }
        sysUser = new SysUser();
        sysUser.setNickname(nickname);
        sysUser.setAccount(account);
        sysUser.setPassword(passwordEncoder.encode(password));
        sysUser.setCreateDate(System.currentTimeMillis());
        sysUser.setLastLogin(System.currentTimeMillis());
        sysUser.setAvatar("/static/img/logo.b3a48c0.png");
        sysUser.setAdmin(1); //1 为true
        sysUser.setDeleted(0); // 0 为false
        sysUser.setSalt("");
        sysUser.setStatus("");
        sysUser.setEmail("");
        this.sysUserService.save(sysUser);
        return Result.success(null);

    }
}











