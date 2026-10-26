// UPDATED ON 2026-08-19 TO FIX TOKEN EXPIRY AND UTF-8 ISSUES
package com.mszlu.blog.utils;

import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwt;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Component
@Slf4j
public class JWTUtils {

    @Value("${jwt.secret:123456Mszlu!@###$$}")
    private String jwtSecret;

    @Value("${jwt.expiration:2592000000}") // 30天 默认毫秒
    private long jwtExpiration;

    private Key getSigningKey() {
        // 显式指定 UTF-8：默认编码随平台变化会导致同一 secret 在不同环境签出不同 key
        return Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String createToken(String userId){
        Map<String,Object> claims = new HashMap<>();
        claims.put("userId",userId);
        JwtBuilder jwtBuilder = Jwts.builder()
                .signWith(getSigningKey()) // 使用配置的签名密钥
                .setClaims(claims)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + jwtExpiration));
        String token = jwtBuilder.compact();
        return token;
    }

    public Map<String, Object> checkToken(String token){
        try {
            Jwt parse = Jwts.parserBuilder().setSigningKey(getSigningKey()).build().parse(token);
            return (Map<String, Object>) parse.getBody();
        } catch (ExpiredJwtException e) {
            log.warn("JWT token expired: {}", e.getMessage());
        } catch (Exception e) {
            log.warn("JWT token invalid: {}", e.getMessage());
        }
        return null;
    }

}
