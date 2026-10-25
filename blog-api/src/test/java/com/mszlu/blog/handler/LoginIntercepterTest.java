package com.mszlu.blog.handler;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.utils.UserThreadLocal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 登录拦截器正反用例：OPTIONS 放行、无 token 拦截、无效 token 拦截、有效 token 放行并写入 ThreadLocal。
 */
@ExtendWith(MockitoExtension.class)
class LoginIntercepterTest {

    @Mock
    private LoginService loginService;
    @Mock
    private HttpServletRequest request;
    @Mock
    private HttpServletResponse response;
    @InjectMocks
    private LoginIntercepter interceptor;

    @AfterEach
    void cleanUp() {
        UserThreadLocal.remove();
    }

    @Test
    void preHandle_optionsRequest_passesWithoutTokenCheck() throws Exception {
        when(request.getMethod()).thenReturn("OPTIONS");
        assertTrue(interceptor.preHandle(request, response, new Object()));
        verifyNoInteractions(loginService);
    }

    @Test
    void preHandle_missingToken_rejectedWith90002() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/articles/myCount");
        when(request.getHeader("Authorization")).thenReturn(null);
        StringWriter body = new StringWriter();
        when(response.getWriter()).thenReturn(new PrintWriter(body));

        assertFalse(interceptor.preHandle(request, response, new Object()));
        assertTrue(body.toString().contains("90002"));
        verify(loginService, never()).checkToken(anyString());
    }

    @Test
    void preHandle_invalidToken_rejectedWith90002() throws Exception {
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/articles/myCount");
        when(request.getHeader("Authorization")).thenReturn("bad-token");
        when(loginService.checkToken("bad-token")).thenReturn(null);
        StringWriter body = new StringWriter();
        when(response.getWriter()).thenReturn(new PrintWriter(body));

        assertFalse(interceptor.preHandle(request, response, new Object()));
        assertTrue(body.toString().contains("90002"));
    }

    @Test
    void preHandle_validToken_passesAndPopulatesThreadLocal() throws Exception {
        SysUser user = new SysUser();
        user.setId("1001");
        when(request.getMethod()).thenReturn("GET");
        when(request.getRequestURI()).thenReturn("/articles/myCount");
        when(request.getHeader("Authorization")).thenReturn("good-token");
        when(loginService.checkToken("good-token")).thenReturn(user);

        assertTrue(interceptor.preHandle(request, response, new Object()));
        assertEquals("1001", UserThreadLocal.get().getId());

        interceptor.afterCompletion(request, response, new Object(), null);
        assertNull(UserThreadLocal.get());
    }
}
