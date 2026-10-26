package com.mszlu.blog.service.ai;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiHealthIndicatorTest {

    private final AiClient aiClient = mock(AiClient.class);
    private final AiHealthIndicator indicator = new AiHealthIndicator(aiClient);

    @Test
    void 熔断器关闭时健康状态为UP() {
        when(aiClient.circuitState()).thenReturn("CLOSED");
        when(aiClient.consecutiveFailures()).thenReturn(0);
        when(aiClient.circuitFailureThreshold()).thenReturn(5);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("circuit", "CLOSED");
        assertThat(health.getDetails()).containsEntry("consecutiveFailures", 0);
        assertThat(health.getDetails()).containsEntry("failureThreshold", 5);
    }

    @Test
    void 熔断器打开时健康状态为DOWN() {
        when(aiClient.circuitState()).thenReturn("OPEN");
        when(aiClient.consecutiveFailures()).thenReturn(5);
        when(aiClient.circuitFailureThreshold()).thenReturn(5);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
        assertThat(health.getDetails()).containsEntry("circuit", "OPEN");
        assertThat(health.getDetails()).containsEntry("consecutiveFailures", 5);
    }

    @Test
    void 熔断器半开时健康状态为UP_试探恢复中() {
        when(aiClient.circuitState()).thenReturn("HALF_OPEN");
        when(aiClient.consecutiveFailures()).thenReturn(5);
        when(aiClient.circuitFailureThreshold()).thenReturn(5);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("circuit", "HALF_OPEN");
    }
}
