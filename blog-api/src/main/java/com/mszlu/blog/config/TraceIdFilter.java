package com.mszlu.blog.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;

import java.io.IOException;
import java.util.UUID;

/**
 * 全链路追踪过滤器：
 * <ul>
 *   <li>优先读取请求头 {@code X-Trace-Id}，上游传入则沿用，保证跨服务链路一致；</li>
 *   <li>无则生成 32 位无横线 UUID；</li>
 *   <li>写入 {@link MDC} 的 {@code traceId} 键，供日志 pattern 输出；</li>
 *   <li>响应头回写 {@code X-Trace-Id}，便于客户端排查；</li>
 *   <li>finally 中 {@link MDC#remove} 清理，避免线程池复用导致串号。</li>
 * </ul>
 * 通过 {@code FilterRegistrationBean} 以 order=0 注册，确保在 UTF8 编码过滤器之前执行。
 */
public class TraceIdFilter implements Filter {

    static final String TRACE_ID_HEADER = "X-Trace-Id";
    static final String MDC_TRACE_ID = "traceId";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String traceId = httpRequest.getHeader(TRACE_ID_HEADER);
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString().replace("-", "");
        }

        MDC.put(MDC_TRACE_ID, traceId);
        httpResponse.setHeader(TRACE_ID_HEADER, traceId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_TRACE_ID);
        }
    }
}
