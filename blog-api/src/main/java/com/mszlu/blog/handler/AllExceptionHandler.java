package com.mszlu.blog.handler;

import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
@Slf4j
public class AllExceptionHandler {
    //进行异常处理，处理Exception。class的异常
    @ExceptionHandler(Exception.class)
    public Result doException(Exception ex){
        log.error("unhandled exception", ex);
        return Result.fail(-999,"系统异常");
    }

    /**
     * 静态资源不存在（Spring 6.1 起由 ResourceHttpRequestHandler 抛 NoResourceFoundException）。
     * 必须单独拦下：否则会被上面的 Exception 兜底吞成「系统异常 -999」，把 404 伪装成 500，
     * 历史上失效图片链接（如 /db93f409....png）持续刷 ERROR 栈、污染监控。
     * 这里返回真正的 404 且降级为 debug 日志。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> doNoResourceFound(NoResourceFoundException ex) {
        log.debug("静态资源不存在: {}", ex.getResourcePath());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
    }
}
