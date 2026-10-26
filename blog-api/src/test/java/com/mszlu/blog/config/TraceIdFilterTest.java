package com.mszlu.blog.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class TraceIdFilterTest {

    private final TraceIdFilter filter = new TraceIdFilter();

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Test
    void 无请求头时生成新traceId并写入MDC与响应头() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        final String[] captured = new String[1];
        FilterChain capturingChain = (req, res) -> {
            captured[0] = MDC.get("traceId");
            chain.doFilter(req, res);
        };

        filter.doFilter(request, response, capturingChain);

        assertThat(captured[0]).isNotBlank().hasSize(32);
        assertThat(response.getHeader("X-Trace-Id")).isEqualTo(captured[0]);
        // 过滤器结束后 MDC 必须清理，避免线程池复用串号
        assertThat(MDC.get("traceId")).isNull();
    }

    @Test
    void 有请求头时沿用上链路traceId() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Trace-Id", "upstream-trace-001");
        MockHttpServletResponse response = new MockHttpServletResponse();

        final String[] captured = new String[1];
        FilterChain capturingChain = (req, res) -> captured[0] = MDC.get("traceId");

        filter.doFilter(request, response, capturingChain);

        assertThat(captured[0]).isEqualTo("upstream-trace-001");
        assertThat(response.getHeader("X-Trace-Id")).isEqualTo("upstream-trace-001");
        assertThat(MDC.get("traceId")).isNull();
    }

    @Test
    void 请求头为空白时仍生成新traceId() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Trace-Id", "   ");
        MockHttpServletResponse response = new MockHttpServletResponse();

        final String[] captured = new String[1];
        FilterChain capturingChain = (req, res) -> captured[0] = MDC.get("traceId");

        filter.doFilter(request, response, capturingChain);

        assertThat(captured[0]).isNotBlank().hasSize(32).doesNotContain("-");
    }

    @Test
    void 下游抛异常时仍清理MDC() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain throwingChain = (req, res) -> {
            throw new ServletException("boom");
        };

        try {
            filter.doFilter(request, response, throwingChain);
        } catch (ServletException expected) {
            assertThat(expected.getMessage()).isEqualTo("boom");
        }

        assertThat(MDC.get("traceId")).isNull();
    }
}
