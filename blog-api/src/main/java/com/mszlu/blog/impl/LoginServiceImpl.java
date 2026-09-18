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

    // ===== 登录限流配置 =====
    private static final int LOGIN_MAX_ATTEMPTS = 5;          // 最大失败次数
    private static final long LOGIN_LOCK_MINUTES = 15;         // 锁定时长（分钟）
    private static final long LOGIN_COUNT_WINDOW_MIN = 10;     // 失败计数窗口（分钟）

    @Override
    public Result login(LoginParam loginParam) {
        String account = loginParam.getAccount();
        String password = loginParam.getPassword();
        if (StringUtils.isBlank(account) || StringUtils.isBlank(password)) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), ErrorCode.PARAMS_ERROR.getMsg());
        }
        // 输入长度校验，防止超长字符串攻击
        if (account.length() > 64 || password.length() > 128) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), ErrorCode.PARAMS_ERROR.getMsg());
        }

        // ===== 登录限流：检查账号是否被锁定 =====
        String lockKey = "login_lock_" + account;
        String locked = redisTemplate.opsForValue().get(lockKey);
        if (locked != null) {
            Long ttl = redisTemplate.getExpire(lockKey, TimeUnit.SECONDS);
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(),
                    "账号已被临时锁定，请 " + (ttl != null ? ttl : LOGIN_LOCK_MINUTES * 60) + " 秒后重试");
        }

        SysUser sysUser = sysUserService.findUserByAccount(account);
        if (sysUser == null) {
            // 账号不存在也走失败计数，避免账号枚举（统一错误提示）
            recordFailedAttempt(account);
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
            recordFailedAttempt(account);
            return Result.fail(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), ErrorCode.ACCOUNT_PWD_NOT_EXIST.getMsg());
        }
        // 登录成功：清除失败计数
        clearFailedAttempts(account);
        String token = jwtUtils.createToken(sysUser.getId());
        redisTemplate.opsForValue().set("Token_" + token, JSON.toJSONString(sysUser), 30, TimeUnit.DAYS);
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("token", token);
        String nickname = sysUser.getNickname();
        data.put("nickname", (nickname != null && !nickname.isEmpty()) ? nickname : sysUser.getAccount());
        data.put("account", sysUser.getAccount());
        return Result.success(data);
    }

    /** 记录登录失败次数，达到阈值则锁定账号 */
    private void recordFailedAttempt(String account) {
        try {
            String countKey = "login_fail_" + account;
            String countStr = redisTemplate.opsForValue().get(countKey);
            int count = 0;
            if (countStr != null) {
                count = Integer.parseInt(countStr);
            }
            count++;
            redisTemplate.opsForValue().set(countKey, String.valueOf(count), LOGIN_COUNT_WINDOW_MIN, TimeUnit.MINUTES);
            if (count >= LOGIN_MAX_ATTEMPTS) {
                redisTemplate.opsForValue().set("login_lock_" + account, "1", LOGIN_LOCK_MINUTES, TimeUnit.MINUTES);
            }
        } catch (Exception e) {
            // Redis 异常不阻断登录流程
        }
    }

    /** 登录成功后清除失败计数 */
    private void clearFailedAttempts(String account) {
        try {
            redisTemplate.delete("login_fail_" + account);
        } catch (Exception e) {
            // ignore
        }
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

    // ===== 注册输入校验规则 =====
    private static final java.util.regex.Pattern ACCOUNT_PATTERN =
            java.util.regex.Pattern.compile("^[a-zA-Z0-9_]{3,20}$");
    private static final java.util.regex.Pattern NICKNAME_PATTERN =
            java.util.regex.Pattern.compile("^[\\u4e00-\\u9fa5a-zA-Z0-9_]{1,20}$");

    @Override
    public Result register(LoginParam loginParam) {
        String account = loginParam.getAccount();
        String password = loginParam.getPassword();
        String nickname = loginParam.getNickname();
        if (StringUtils.isBlank(account) || StringUtils.isBlank(password) || StringUtils.isBlank(nickname)) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), ErrorCode.PARAMS_ERROR.getMsg());
        }
        // 账号格式校验：3-20 位字母、数字、下划线
        if (!ACCOUNT_PATTERN.matcher(account).matches()) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), "账号需为 3-20 位字母、数字或下划线");
        }
        // 密码长度校验：6-64 位
        if (password.length() < 6 || password.length() > 64) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), "密码长度需为 6-64 位");
        }
        // 昵称格式校验：1-20 位中英文、数字、下划线
        if (!NICKNAME_PATTERN.matcher(nickname).matches()) {
            return Result.fail(ErrorCode.PARAMS_ERROR.getCode(), "昵称需为 1-20 位中英文、数字或下划线");
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
        sysUser.setAdmin(0); // 新注册用户默认为普通用户，0 为非管理员
        sysUser.setDeleted(0); // 0 为false
        sysUser.setSalt("");
        sysUser.setStatus("");
        sysUser.setEmail("");
        this.sysUserService.save(sysUser);
        return Result.success(null);

    }
}











