package com.mszlu.blog.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * 仅生产 profile 注册的 Actuator 鉴权过滤器。
 * dev 保持原有调试便利；prod 下 health 匿名只读 status，prometheus 需 ACTUATOR_TOKEN。
 */
@Configuration
@Profile("prod")
public class ActuatorSecurityConfig {

    @Bean
    public FilterRegistrationBean<ActuatorAuthFilter> actuatorAuthFilterRegistration(
            @Value("${security.actuator.token:}") String token) {
        FilterRegistrationBean<ActuatorAuthFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(new ActuatorAuthFilter(token));
        registration.addUrlPatterns("/actuator", "/actuator/*");
        registration.setOrder(2);
        return registration;
    }
}
