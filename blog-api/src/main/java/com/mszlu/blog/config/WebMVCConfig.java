package com.mszlu.blog.config;

import com.mszlu.blog.handler.LoginIntercepter;
import com.mszlu.blog.config.UTF8EncodingFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

@Configuration
public class WebMVCConfig implements WebMvcConfigurer {
    private LoginIntercepter loginIntercepter;

    public WebMVCConfig(LoginIntercepter loginIntercepter) {
        this.loginIntercepter = loginIntercepter;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins("http://localhost:8080", "http://localhost:3000", "https://instapix.icu", "https://www.instapix.icu")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loginIntercepter)
                .addPathPatterns("/test")
                .addPathPatterns("/comments/create/change")
                .addPathPatterns("/articles/publish")
                .addPathPatterns("/articles/update")
                .addPathPatterns("/articles/myCount")
                .addPathPatterns("/likes/toggle")
                .addPathPatterns("/notifications/**")
                .addPathPatterns("/chat/**")
                .addPathPatterns("/persona/**")
                .addPathPatterns("/memory/**")
                .addPathPatterns("/proactive/**")
                .addPathPatterns("/diary/**")
                .addPathPatterns("/upload")
                .addPathPatterns("/feather")
                .addPathPatterns("/feather/**")
                // 实时聊天 demo：send/history 走登录拦截器；stream 用 query token 手动鉴权（EventSource 带不了 Header）
                .addPathPatterns("/realtime-chat/send")
                .addPathPatterns("/realtime-chat/history")
                // AI 圆桌 demo：stream 用 query token 手验，插话/终止走拦截器
                .addPathPatterns("/roundtable/*/interject")
                .addPathPatterns("/roundtable/*/stop")
                .excludePathPatterns("/chat/test-ai");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        File dir = new File(System.getProperty("user.dir"), "uploads");
        if (!dir.exists()) dir.mkdirs();
        registry.addResourceHandler("/uploads/**").addResourceLocations(dir.toURI().toString());
    }

    @Bean
    public FilterRegistrationBean<UTF8EncodingFilter> utf8EncodingFilterRegistrationBean() {
        FilterRegistrationBean<UTF8EncodingFilter> registrationBean = new FilterRegistrationBean<>();
        registrationBean.setFilter(new UTF8EncodingFilter());
        registrationBean.addUrlPatterns("/*"); // 应用于所有路径
        registrationBean.setOrder(1); // 设置过滤器顺序，数字越小优先级越高
        return registrationBean;
    }
}
