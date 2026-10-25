package com.mszlu.blog.admin.config;

import com.mszlu.blog.admin.service.AuthService;
import com.mszlu.blog.admin.service.SecurityUserService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Spring Security 6 配置。
 * 6.x 已删除 WebSecurityConfigurerAdapter，改为声明 SecurityFilterChain / AuthenticationProvider Bean；
 * authorizeRequests -> authorizeHttpRequests，antMatchers -> requestMatchers，
 * @EnableGlobalMethodSecurity -> @EnableMethodSecurity。
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final SecurityUserService securityUserService;
    private final AuthService authService;

    public SecurityConfig(SecurityUserService securityUserService, AuthService authService) {
        this.securityUserService = securityUserService;
        this.authService = authService;
    }

    @Bean
    public BCryptPasswordEncoder bCryptPasswordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * 走数据库管理员表（ms_admin）校验账号密码，密码使用 BCrypt 比对。
     */
    @Bean
    public DaoAuthenticationProvider daoAuthenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(securityUserService);
        provider.setPasswordEncoder(bCryptPasswordEncoder());
        return provider;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                        .requestMatchers("/css/**", "/img/**", "/js/**", "/plugins/**").permitAll()
                        // 自定义 service 实时权限认证：超管直接放行，普通管理员按 ms_permission.path 逐条比对
                        .requestMatchers("/admin/**").access((authenticationSupplier, context) ->
                                new AuthorizationDecision(authService.auth(context.getRequest(), authenticationSupplier.get())))
                        .requestMatchers("/pages/**").authenticated())
                .formLogin(form -> form
                        .loginPage("/login.html")
                        .loginProcessingUrl("/login")
                        .usernameParameter("username")
                        .passwordParameter("password")
                        .defaultSuccessUrl("/pages/main.html")
                        .failureUrl("/login.html?error")
                        .permitAll())
                .logout(logout -> logout
                        .logoutUrl("/logout")
                        .logoutSuccessUrl("/login.html")
                        .permitAll())
                .httpBasic(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                // 后台页面使用 iframe 嵌套，必须保留 sameOrigin，否则子页被 X-Frame-Options 拒绝
                .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin()));
        return http.build();
    }
}
