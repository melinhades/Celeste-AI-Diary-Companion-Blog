package com.mszlu.blog.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * prod 启动强校验：JWT 密钥必须显式来自环境变量 JWT_SECRET。
 * 仓库内存在兜底密钥（JWTUtils 与 application-prod.yml），一旦随仓库泄漏等于全员免密，
 * 故 prod 缺失/仍为默认值/长度过短时直接 fail-fast，拒绝启动。
 */
@Component
@Slf4j
public class ConfigValidator implements ApplicationRunner {

    /** 仓库中已存在的两处兜底密钥，prod 下视为无效 */
    private static final String[] FORBIDDEN_DEFAULTS = {
            "123456Mszlu!@###$$",
            "MszluBlogJwtSecretKey2026AbcXyz789"
    };

    /** jjwt HS256 要求密钥 >= 256 bit，过短会在签名时抛 WeakKeyException */
    private static final int MIN_SECRET_BYTES = 32;

    private final Environment environment;

    public ConfigValidator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!Arrays.asList(environment.getActiveProfiles()).contains("prod")) {
            return;
        }
        String secret = environment.getProperty("JWT_SECRET");
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "[ConfigValidator] prod 启动失败: 环境变量 JWT_SECRET 未设置，禁止使用默认密钥运行生产环境");
        }
        for (String forbidden : FORBIDDEN_DEFAULTS) {
            if (forbidden.equals(secret)) {
                throw new IllegalStateException(
                        "[ConfigValidator] prod 启动失败: JWT_SECRET 仍为仓库中的默认密钥，必须更换为独立密钥");
            }
        }
        int bytes = secret.getBytes(StandardCharsets.UTF_8).length;
        if (bytes < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "[ConfigValidator] prod 启动失败: JWT_SECRET 仅 " + bytes + " 字节，不满足 HS256 256-bit 要求（>=32）");
        }
        log.info("[ConfigValidator] prod 配置校验通过: JWT_SECRET 已显式配置 ({} bytes)", bytes);
    }
}
