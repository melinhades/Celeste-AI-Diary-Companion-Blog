package com.mszlu.blog.config;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.handler.MemorialSceneWebSocketHandler;
import com.mszlu.blog.service.TokenService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/**
 * 铭记页多人同屏的 WebSocket 入口。
 *
 * <p>握手时从 query 取 token（浏览器 WebSocket 不能带 Authorization Header），
 * 校验通过后把 userId/name/scene 放进 session attributes；未登录直接 401。</p>
 */
@Configuration
@EnableWebSocket
public class MemorialSceneWebSocketConfig implements WebSocketConfigurer {

    private final MemorialSceneWebSocketHandler handler;
    private final TokenService tokenService;

    public MemorialSceneWebSocketConfig(MemorialSceneWebSocketHandler handler, TokenService tokenService) {
        this.handler = handler;
        this.tokenService = tokenService;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/realtime-chat/ws")
                .addInterceptors(new TokenHandshakeInterceptor(tokenService))
                .setAllowedOriginPatterns(
                        "http://localhost:*",
                        "http://127.0.0.1:*",
                        "https://instapix.icu",
                        "https://www.instapix.icu"
                );
    }

    /** 单帧上限 8KB：位置包只有几百字节，防止恶意大包 */
    @Bean
    public ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(8192);
        container.setMaxBinaryMessageBufferSize(8192);
        return container;
    }

    private static final class TokenHandshakeInterceptor implements HandshakeInterceptor {
        private final TokenService tokenService;

        private TokenHandshakeInterceptor(TokenService tokenService) {
            this.tokenService = tokenService;
        }

        @Override
        public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       WebSocketHandler wsHandler, Map<String, Object> attributes) {
            var params = UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams();
            String token = params.getFirst("token");
            String scene = params.getFirst("scene");
            SysUser user = (token == null || token.isEmpty()) ? null : tokenService.checkToken(token);
            if (user == null) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            String name = user.getNickname() != null && !user.getNickname().isEmpty()
                    ? user.getNickname() : user.getAccount();
            attributes.put("userId", String.valueOf(user.getId()));
            attributes.put("name", name == null ? String.valueOf(user.getId()) : name);
            attributes.put("scene", "memorial".equals(scene));
            return true;
        }

        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Exception exception) {
        }
    }
}
