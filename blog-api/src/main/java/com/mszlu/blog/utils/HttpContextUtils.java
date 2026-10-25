package com.mszlu.blog.utils;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;

public class HttpContextUtils {

        private HttpContextUtils() {
            // 工具类禁止实例化
        }

        public static HttpServletRequest getHttpServletRequest(){
            ServletRequestAttributes attributes =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes == null) {
                // 非请求线程调用（异步/定时任务），此前会直接 NPE，改为明确报错
                throw new IllegalStateException("当前线程未绑定 HTTP 请求上下文");
            }
            return attributes.getRequest();
        }
    }
