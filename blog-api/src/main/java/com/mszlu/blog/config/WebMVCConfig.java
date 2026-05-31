package com.mszlu.blog.config;

import com.mszlu.blog.handler.LoginIntercepter;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMVCConfig implements WebMvcConfigurer {
    private LoginIntercepter loginIntercepter;

    public WebMVCConfig(LoginIntercepter loginIntercepter) {
        this.loginIntercepter = loginIntercepter;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        //解决跨域配置
        registry.addMapping("/**").allowedOrigins("http://localhost:8080");
    }
    public void addInterceptors(InterceptorRegistry registry) {
        //拦截test接口，后续实际遇到需要拦截的接口是，再配置为真正的接口
        registry.addInterceptor(loginIntercepter)
                .addPathPatterns("/test")
                .addPathPatterns("/comments/create/change")
                .addPathPatterns("/article/publish");
    }
}
