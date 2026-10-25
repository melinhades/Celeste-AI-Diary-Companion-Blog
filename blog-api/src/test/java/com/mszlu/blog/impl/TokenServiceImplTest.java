package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.utils.JWTUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 登录态校验从 LoginService 拆出为 TokenService（解开 LoginServiceImpl ⇄ SysUserServiceImpl 循环依赖）。
 * 用例锁定拆出后的行为不变：JWT 与 Redis 双校验、缓存刷新保持剩余 TTL、Redis 异常不抛出。
 */
@ExtendWith(MockitoExtension.class)
class TokenServiceImplTest {

    @Mock
    private RedisTemplate<String, String> redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOps;
    @Mock
    private JWTUtils jwtUtils;
    @InjectMocks
    private TokenServiceImpl tokenService;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
    }

    private Map<String, Object> claims() {
        Map<String, Object> claims = new HashMap<>();
        claims.put("userId", "1001");
        return claims;
    }

    private SysUser user() {
        SysUser u = new SysUser();
        u.setId("1001");
        u.setAccount("alice");
        u.setNickname("Alice");
        return u;
    }

    // ===== checkToken =====

    @Test
    void checkToken_blank_returnsNull() {
        assertNull(tokenService.checkToken(""));
        assertNull(tokenService.checkToken(null));
        verifyNoInteractions(jwtUtils);
    }

    @Test
    void checkToken_invalidJwt_returnsNull() {
        when(jwtUtils.checkToken("bad")).thenReturn(null);
        assertNull(tokenService.checkToken("bad"));
        verify(valueOps, never()).get(anyString());
    }

    @Test
    void checkToken_jwtValidButRedisMiss_returnsNull() {
        when(jwtUtils.checkToken("t")).thenReturn(claims());
        when(valueOps.get("Token_t")).thenReturn(null);
        assertNull(tokenService.checkToken("t"));
    }

    @Test
    void checkToken_jwtAndRedisHit_returnsUser() {
        when(jwtUtils.checkToken("t")).thenReturn(claims());
        when(valueOps.get("Token_t")).thenReturn(JSON.toJSONString(user()));

        SysUser result = tokenService.checkToken("t");
        assertNotNull(result);
        assertEquals("alice", result.getAccount());
    }

    // ===== refreshUserCache =====

    @Test
    void refreshUserCache_rewritesWithRemainingTtl() {
        SysUser u = user();
        u.setNickname("新昵称");
        when(redisTemplate.getExpire("Token_t", TimeUnit.SECONDS)).thenReturn(3600L);

        tokenService.refreshUserCache("t", u);

        verify(valueOps).set(eq("Token_t"), anyString(), eq(3600L), eq(TimeUnit.SECONDS));
    }

    @Test
    void refreshUserCache_expiredKey_skips() {
        when(redisTemplate.getExpire("Token_t", TimeUnit.SECONDS)).thenReturn(-2L);

        tokenService.refreshUserCache("t", user());

        verify(valueOps, never()).set(anyString(), anyString(), anyLong(), any(TimeUnit.class));
    }

    @Test
    void refreshUserCache_redisThrows_notPropagated() {
        when(redisTemplate.getExpire("Token_t", TimeUnit.SECONDS))
                .thenThrow(new RuntimeException("redis down"));

        // 缓存刷新失败不得影响写库结果，异常必须被吞掉
        assertDoesNotThrow(() -> tokenService.refreshUserCache("t", user()));
    }
}
