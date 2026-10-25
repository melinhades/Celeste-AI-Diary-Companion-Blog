package com.mszlu.blog.handler;

import com.mszlu.blog.vo.Result;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 全局异常兜底的语义区分：
 * 静态资源缺失是 404（不该刷 ERROR 栈、也不该回 -999 系统异常），其余未知异常仍是 -999。
 */
class AllExceptionHandlerTest {

    private final AllExceptionHandler handler = new AllExceptionHandler();

    @Test
    void missingStaticResource_returns404_notSystemError() {
        ResponseEntity<Void> r = handler.doNoResourceFound(
                new NoResourceFoundException(HttpMethod.GET, "db93f4091caf42139916a98f82cc1ac6.png"));

        assertEquals(404, r.getStatusCode().value());
        assertNull(r.getBody(), "404 不应返回 Result JSON 体");
    }

    @Test
    void unknownException_stillReturnsSystemError() {
        Result r = handler.doException(new IllegalStateException("boom"));

        assertFalse(r.isSuccess());
        assertEquals(-999, r.getCode());
        assertEquals("系统异常", r.getMsg());
    }
}
