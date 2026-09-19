package com.mszlu.blog.common.aop;

import com.alibaba.fastjson.JSON;
import com.mszlu.blog.utils.HttpContextUtils;
import com.mszlu.blog.utils.IpUtils;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Method;

@Component
@Aspect //切面 定义了 通知和切点的关系
@Slf4j
public class LogAspect {
    @Pointcut("@annotation(com.mszlu.blog.common.aop.LogAnnotation)")
    public void pt(){

    }
    //环绕通知
    @Around("pt()")
    public Object log(ProceedingJoinPoint joinPoint)throws Throwable{
        long beginTime=System.currentTimeMillis();
        //执行方法
        Object result= joinPoint.proceed();
        // 执行时长
        Long endTime=System.currentTimeMillis()-beginTime;
        //保存日志
        recordLog(joinPoint,endTime);

        return result;

    }
    private void recordLog(ProceedingJoinPoint joinPoint, long time) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        LogAnnotation logAnnotation = method.getAnnotation(LogAnnotation.class);
        log.info("=====================log start================================");
        log.info("module:{}",logAnnotation.module());
        log.info("operation:{}",logAnnotation.operator());

        //请求的方法名
        String className = joinPoint.getTarget().getClass().getName();
        String methodName = signature.getName();
        log.info("request method:{}",className + "." + methodName + "()");

//        //请求的参数
        Object[] args = joinPoint.getArgs();
        String params = JSON.toJSONString(args[0]);
        log.info("params:{}",params);

        //获取request 设置IP地址
        HttpServletRequest request = HttpContextUtils.getHttpServletRequest();
        log.info("ip:{}", IpUtils.getIpAddr(request));


        log.info("excute time : {} ms",time);
        log.info("=====================log end================================");
    }

}
