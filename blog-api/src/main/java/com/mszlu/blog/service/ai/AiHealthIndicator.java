package com.mszlu.blog.service.ai;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * AI 服务健康检查：基于 {@link AiClient} 内置熔断器状态判定可用性。
 * <ul>
 *   <li>CLOSED / HALF_OPEN → UP（正常或试探恢复中）</li>
 *   <li>OPEN → DOWN（连续失败达阈值，正在快速失败）</li>
 * </ul>
 * 不主动探测 AI 端点（避免消耗配额与增加延迟），以熔断器实时状态为准。
 * 出现在 /actuator/health 的 components.ai 节点。
 */
@Component
public class AiHealthIndicator implements HealthIndicator {

    private final AiClient aiClient;

    public AiHealthIndicator(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    @Override
    public Health health() {
        String state = aiClient.circuitState();
        int failures = aiClient.consecutiveFailures();
        int threshold = aiClient.circuitFailureThreshold();

        Health.Builder builder = "OPEN".equals(state)
                ? Health.down()
                : Health.up();
        return builder
                .withDetail("circuit", state)
                .withDetail("consecutiveFailures", failures)
                .withDetail("failureThreshold", threshold)
                .build();
    }
}
