package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.utils.JWTUtils;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ErrorCode;
import com.mszlu.blog.vo.params.LoginParam;
import org.apache.commons.codec.digest.DigestUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 登录 / 注册 / checkToken / logout 正反用例。
 * 覆盖：BCrypt、MD5/明文老账号懒迁移、登录限流锁定、Redis token 存取。
 */
@ExtendWith(MockitoExtension.class)
class LoginServiceImplTest {

    @Mock
    private SysUserService sysUserService;
    @Mock
    private RedisTemplate<String, String> redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOps;
    @Mock
    private JWTUtils jwtUtils;
    @InjectMocks
    private LoginServiceImpl loginService;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
    }

    private LoginParam param(String account, String password) {
        LoginParam p = new LoginParam();
        p.setAccount(account);
        p.setPassword(password);
        return p;
    }

    private SysUser userWithPassword(String stored) {
        SysUser u = new SysUser();
        u.setId("1001");
        u.setAccount("alice");
        u.setNickname("Alice");
        u.setPassword(stored);
        return u;
    }

    // ===== 参数校验 =====

    @Test
    void login_blankParams_returnsParamsError() {
        Result r = loginService.login(param("", ""));
        assertFalse(r.isSuccess());
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), r.getCode());
    }

    @Test
    void login_overlongAccount_returnsParamsError() {
        Result r = loginService.login(param("a".repeat(65), "x"));
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), r.getCode());
    }

    // ===== 限流锁定 =====

    @Test
    void login_lockedAccount_rejectedWithLockMessage() {
        when(valueOps.get("login_lock_alice")).thenReturn("1");
        when(redisTemplate.getExpire("login_lock_alice", TimeUnit.SECONDS)).thenReturn(900L);

        Result r = loginService.login(param("alice", "whatever"));
        assertFalse(r.isSuccess());
        assertTrue(r.getMsg().contains("锁定"));
        verify(sysUserService, never()).findUserByAccount(anyString());
    }

    @Test
    void login_fifthFailure_locksAccount() {
        when(valueOps.get("login_lock_alice")).thenReturn(null);
        when(sysUserService.findUserByAccount("alice")).thenReturn(null);
        when(valueOps.get("login_fail_alice")).thenReturn("4"); // 已失败 4 次

        Result r = loginService.login(param("alice", "x"));
        assertEquals(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), r.getCode());
        verify(valueOps).set("login_fail_alice", "5", 10L, TimeUnit.MINUTES);
        verify(valueOps).set("login_lock_alice", "1", 15L, TimeUnit.MINUTES);
    }

    // ===== 账号/密码校验 =====

    @Test
    void login_unknownAccount_failsAndRecordsAttempt() {
        when(valueOps.get("login_lock_nobody")).thenReturn(null);
        when(sysUserService.findUserByAccount("nobody")).thenReturn(null);

        Result r = loginService.login(param("nobody", "x"));
        assertEquals(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), r.getCode());
        verify(valueOps).set(eq("login_fail_nobody"), eq("1"), eq(10L), eq(TimeUnit.MINUTES));
    }

    @Test
    void login_wrongBcryptPassword_fails() {
        when(valueOps.get("login_lock_alice")).thenReturn(null);
        when(sysUserService.findUserByAccount("alice"))
                .thenReturn(userWithPassword(encoder.encode("right-password")));

        Result r = loginService.login(param("alice", "wrong-password"));
        assertEquals(ErrorCode.ACCOUNT_PWD_NOT_EXIST.getCode(), r.getCode());
        verify(jwtUtils, never()).createToken(anyString());
    }

    @Test
    void login_correctBcrypt_issuesTokenAndCachesUser() {
        SysUser u = userWithPassword(encoder.encode("right-password"));
        when(valueOps.get("login_lock_alice")).thenReturn(null);
        when(sysUserService.findUserByAccount("alice")).thenReturn(u);
        when(jwtUtils.createToken("1001")).thenReturn("jwt-token-abc");

        Result r = loginService.login(param("alice", "right-password"));
        assertTrue(r.isSuccess());
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) r.getData();
        assertEquals("jwt-token-abc", data.get("token"));
        assertEquals("Alice", data.get("nickname"));
        assertEquals("alice", data.get("account"));

        verify(redisTemplate).delete("login_fail_alice");
        verify(valueOps).set(eq("Token_jwt-token-abc"), anyString(), eq(30L), eq(TimeUnit.DAYS));
    }

    @Test
    void login_legacyMd5Password_migratesToBcrypt() {
        SysUser u = userWithPassword(DigestUtils.md5Hex("old-password"));
        when(valueOps.get("login_lock_alice")).thenReturn(null);
        when(sysUserService.findUserByAccount("alice")).thenReturn(u);
        when(jwtUtils.createToken("1001")).thenReturn("t");

        Result r = loginService.login(param("alice", "old-password"));
        assertTrue(r.isSuccess());

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserService).updateById(captor.capture());
        String upgraded = captor.getValue().getPassword();
        assertTrue(upgraded.startsWith("$2"));
        assertTrue(encoder.matches("old-password", upgraded));
    }

    @Test
    void login_legacyPlaintextPassword_migratesToBcrypt() {
        SysUser u = userWithPassword("plain-password");
        when(valueOps.get("login_lock_alice")).thenReturn(null);
        when(sysUserService.findUserByAccount("alice")).thenReturn(u);
        when(jwtUtils.createToken("1001")).thenReturn("t");

        Result r = loginService.login(param("alice", "plain-password"));
        assertTrue(r.isSuccess());
        verify(sysUserService).updateById(argThat(s -> s.getPassword().startsWith("$2")));
    }

    // ===== checkToken =====

    @Test
    void checkToken_blank_returnsNull() {
        assertNull(loginService.checkToken(""));
        assertNull(loginService.checkToken(null));
    }

    @Test
    void checkToken_invalidJwt_returnsNull() {
        when(jwtUtils.checkToken("bad")).thenReturn(null);
        assertNull(loginService.checkToken("bad"));
    }

    @Test
    void checkToken_jwtValidButRedisMiss_returnsNull() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", "1001");
        when(jwtUtils.checkToken("t")).thenReturn(claims);
        when(valueOps.get("Token_t")).thenReturn(null);
        assertNull(loginService.checkToken("t"));
    }

    @Test
    void checkToken_jwtAndRedisHit_returnsUser() {
        SysUser u = userWithPassword("x");
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", "1001");
        when(jwtUtils.checkToken("t")).thenReturn(claims);
        when(valueOps.get("Token_t")).thenReturn(JSON.toJSONString(u));

        SysUser result = loginService.checkToken("t");
        assertNotNull(result);
        assertEquals("alice", result.getAccount());
    }

    // ===== logout =====

    @Test
    void logout_deletesTokenKey() {
        Result r = loginService.logout("t");
        assertTrue(r.isSuccess());
        verify(redisTemplate).delete("Token_t");
    }

    // ===== 注册 =====

    @Test
    void register_blankParams_fails() {
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(),
                loginService.register(param("", "")).getCode());
    }

    @Test
    void register_illegalAccount_fails() {
        LoginParam p = param("ab!", "password1");
        p.setNickname("nick");
        Result r = loginService.register(p);
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), r.getCode());
        assertTrue(r.getMsg().contains("账号"));
    }

    @Test
    void register_shortPassword_fails() {
        LoginParam p = param("alice_01", "12345");
        p.setNickname("nick");
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), loginService.register(p).getCode());
    }

    @Test
    void register_illegalNickname_fails() {
        LoginParam p = param("alice_01", "password1");
        p.setNickname("***");
        assertEquals(ErrorCode.PARAMS_ERROR.getCode(), loginService.register(p).getCode());
    }

    @Test
    void register_existingAccount_fails() {
        LoginParam p = param("alice", "password1");
        p.setNickname("nick");
        when(sysUserService.findUserByAccount("alice")).thenReturn(new SysUser());
        assertEquals(ErrorCode.ACCOUNT_EXIST.getCode(), loginService.register(p).getCode());
    }

    @Test
    void register_success_savesBcryptUser() {
        LoginParam p = param("alice_01", "password1");
        p.setNickname("nick");
        when(sysUserService.findUserByAccount("alice_01")).thenReturn(null);

        Result r = loginService.register(p);
        assertTrue(r.isSuccess());

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(sysUserService).save(captor.capture());
        SysUser saved = captor.getValue();
        assertTrue(saved.getPassword().startsWith("$2"));
        assertTrue(encoder.matches("password1", saved.getPassword()));
        assertEquals(0, saved.getAdmin());
        assertEquals(0, saved.getDeleted());
    }
}
