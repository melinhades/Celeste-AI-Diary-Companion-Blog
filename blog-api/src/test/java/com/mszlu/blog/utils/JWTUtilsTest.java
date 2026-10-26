package com.mszlu.blog.utils;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * JWT 签发 / 校验 / 过期 / 篡改 正反用例。
 * 注意：jjwt 0.11.5 的 hmacShaKeyFor 强制要求 HS256 密钥 ≥ 256 bit，
 * 因此测试统一使用 32 字节密钥；生产默认密钥 "123456Mszlu!@###$$" 只有 17 字节，
 * 若 jwt.secret 未配置会在 createToken 时抛 WeakKeyException（见升级记录遗留风险）。
 */
class JWTUtilsTest {

    private static final String SECRET = "0123456789abcdef0123456789abcdef"; // 32 bytes
    private JWTUtils jwtUtils;

    @BeforeEach
    void setUp() {
        jwtUtils = new JWTUtils();
        ReflectionTestUtils.setField(jwtUtils, "jwtSecret", SECRET);
        ReflectionTestUtils.setField(jwtUtils, "jwtExpiration", 3600_000L);
    }

    @Test
    void createThenCheck_roundTripReturnsUserId() {
        String token = jwtUtils.createToken("12345");
        assertNotNull(token);

        Map<String, Object> claims = jwtUtils.checkToken(token);
        assertNotNull(claims);
        assertEquals("12345", claims.get("userId"));
    }

    @Test
    void checkToken_tamperedSignature_returnsNull() {
        String token = jwtUtils.createToken("12345");
        // 篡改签名最后一段
        String tampered = token.substring(0, token.length() - 2) + "xx";
        assertNull(jwtUtils.checkToken(tampered));
    }

    @Test
    void checkToken_signedWithDifferentSecret_returnsNull() {
        String token = jwtUtils.createToken("12345");

        JWTUtils other = new JWTUtils();
        ReflectionTestUtils.setField(other, "jwtSecret", "fedcba9876543210fedcba9876543210");
        ReflectionTestUtils.setField(other, "jwtExpiration", 3600_000L);

        assertNull(other.checkToken(token));
    }

    @Test
    void checkToken_expired_returnsNull() {
        ReflectionTestUtils.setField(jwtUtils, "jwtExpiration", -60_000L); // 已过期
        String token = jwtUtils.createToken("12345");
        assertNull(jwtUtils.checkToken(token));
    }

    @Test
    void checkToken_garbageString_returnsNull() {
        assertNull(jwtUtils.checkToken("not-a-jwt"));
        assertNull(jwtUtils.checkToken(""));
    }
}
