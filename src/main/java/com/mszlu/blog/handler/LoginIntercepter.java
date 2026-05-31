package com.mszlu.blog.handler;

import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.LoginService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HttpServletBean;

import javax.servlet.http.HttpServletRequest;

import static com.mysql.cj.MysqlType.JSON;

@Component
@Slf4j
public class LoginIntercepter implements HandlerInterceptor {
    @Autowired
    private LoginService loginService;
    @Override
    public boolean preHandle(HttpServletRequest request,HttpServiceResponse response,Object handler)throws Exception{
        /**
         * 1.需要判断 请求的接口路径是否为HandlerMethod(controller方法)
         * 2.判断token是否为空，如果为空，未登录
         * 3.如果token不为空，登录验证loginservice checkToken
         * 4.如果验证成功，放行即可
         */
        if (!(handler instanceof HandlerMethod) ){
            //handler 可能是RequestResourceHandler springboot程序默认访问静态资源 默认去class path下的static目录去查询
            return true;
        }
        String token=request.getHeader("Authorization");
        log.info("=================request start===========================");
        String requestURI = request.getRequestURI();
        log.info("request uri:{}",requestURI);
        log.info("request method:{}",request.getMethod());
        log.info("token:{}", token);
        log.info("=================request end===========================");
        if (StringUtils.isBlank(token)) {
            Result result = Result.fail(ErrorCode.NO_LOGIN.getCode(),"未登录");
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().print(JSON.toJSONString(result));
            return false;
        }
        SysUser sysUser=loginService.checkToken(token);
        if(sysUser==null){
            Result result= Result.fail(ErrorCode.NO_LOGIN.getcode(),"未登录");
            response.setContentType("application/json;charset=utf-8");
            response.getWriter().print(JSON.toJSONString(result));
            return false;
        }
        //通过，放行
        //我希望在controller中，直接获取用户的信息 怎么获取？
        UserThreadLocal.put(sysUser);

        return true;
    }
    @Override
    public void afterCompletion(HttpServiceRequest request,HttpServiceResponse response,Object handler,Exception e){
        //如果不删除 ThreadLOcal中用完的信息 会有内存泄漏的风险
        UserThreadLocal.remove();

    }

}
