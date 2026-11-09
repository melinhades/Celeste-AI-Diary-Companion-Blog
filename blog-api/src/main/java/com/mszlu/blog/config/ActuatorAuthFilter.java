package com.mszlu.blog.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * prod 下 Actuator 访问控制（仅在 {@link ActuatorSecurityConfig} 中按 prod profile 注册）。
 * health 是探活入口，允许匿名且 prod 已配置只返回 status；
 * 其余端点（prometheus 等）必须携带 ACTUATOR_TOKEN（Header 或 Bearer），否则 401。
 * 未配置 token 时 fail-closed：除 health 外全部拒绝，避免默认裸奔。
 */
@Slf4j
public class ActuatorAuthFilter implements Filter {

    private static final String HEADER = "X-Actuator-Token";
    private static final String BEARER_PREFIX = "Bearer ";

    private final String expectedToken;

    public ActuatorAuthFilter(String expectedToken) {
        this.expectedToken = expectedToken == null ? "" : expectedToken.trim();
        if (this.expectedToken.isEmpty()) {
            log.warn("[ActuatorAuthFilter] ACTUATOR_TOKEN 未配置，/actuator 除 health 外将全部拒绝访问");
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest) || !(response instanceof HttpServletResponse)) {
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse resp = (HttpServletResponse) response;

        String path = req.getRequestURI();
        // 探活端点：只暴露 status，允许匿名访问
        if (path != null && (path.equals("/actuator/health") || path.startsWith("/actuator/health/"))) {
            chain.doFilter(request, response);
            return;
        }

        String presented = extractToken(req);
        if (expectedToken.isEmpty() || presented == null || !constantTimeEquals(expectedToken, presented)) {
            resp.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            resp.setContentType("application/json;charset=utf-8");
            resp.getWriter().write("{\"success\":false,\"code\":401,\"msg\":\"需要 ACTUATOR_TOKEN\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private String extractToken(HttpServletRequest req) {
        String authorization = req.getHeader("Authorization");
        if (authorization != null && authorization.startsWith(BEARER_PREFIX)) {
            return authorization.substring(BEARER_PREFIX.length()).trim();
        }
        String header = req.getHeader(HEADER);
        return header == null ? null : header.trim();
    }

    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }
}
