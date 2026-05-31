package com.mszlu.blog.handler;

import com.mszlu.blog.vo.Result;
import org.apache.logging.log4j.core.tools.picocli.CommandLine;
import org.springframework.web.bind.annotation.ExceptionHandler;

public class AllExceptionHandler {
    //进行异常处理，处理Exception。class的异常
    @ExceptionHandler(Exception.class)
    public Result doException(Exception ex){
        ex.printStackTrace();
        return Result.fail(-999,"系统异常");
    }

}
