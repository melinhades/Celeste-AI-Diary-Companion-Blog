package com.mszlu.blog.handler;

import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class AllExceptionHandler {
    //进行异常处理，处理Exception。class的异常
    @ExceptionHandler(Exception.class)
    public Result doException(Exception ex){
        log.error("unhandled exception", ex);
        return Result.fail(-999,"系统异常");
    }

}
