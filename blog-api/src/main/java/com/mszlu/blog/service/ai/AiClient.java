package com.mszlu.blog.service.ai;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import javax.annotation.PostConstruct;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@Slf4j
public class AiClient {

    @Value("${ai.base-url:https://api.siliconflow.cn/v1}")
    private String baseUrl;

    @Value("${ai.api-key:}")
    private String apiKey;

    @Value("${ai.model:THUDM/GLM-4-9B-0414}")
    private String model;

    @Value("${ai.embedding-model:BAAI/bge-m3}")
    private String embeddingModel;

    /** 连接超时（毫秒） */
    @Value("${ai.connect-timeout:10000}")
    private int connectTimeout;

    /** 读超时（毫秒）：AI 生成慢，但超过 30s 视为异常，避免拖垮线程池 */
    @Value("${ai.read-timeout:30000}")
    private int readTimeout;

    /** 失败重试次数（不含首次调用），仅对网络异常/超时/5xx 重试，4xx 不重试 */
    @Value("${ai.max-retries:1}")
    private int maxRetries;

    /** 连续失败多少次后熔断 */
    @Value("${ai.circuit.failure-threshold:5}")
    private int circuitFailureThreshold;

    /** 熔断打开持续时间（毫秒），期间快速失败，过后放一个试探请求 */
    @Value("${ai.circuit.open-duration:30000}")
    private long circuitOpenDurationMs;

    private RestTemplate restTemplate;

    @PostConstruct
    public void init() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        this.restTemplate = new RestTemplate(factory);
    }

    // ================= 简单熔断器（CLOSED / OPEN / HALF_OPEN） =================
    private enum CircuitState { CLOSED, OPEN, HALF_OPEN }

    private volatile CircuitState circuitState = CircuitState.CLOSED;
    private volatile long openedAt = 0;
    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);

    /** 是否放行本次请求：OPEN 期间快速失败；冷却结束后放一个试探请求进入 HALF_OPEN */
    private boolean tryAcquire() {
        if (circuitState == CircuitState.CLOSED) return true;
        if (circuitState == CircuitState.HALF_OPEN) return false;
        if (System.currentTimeMillis() - openedAt >= circuitOpenDurationMs) {
            circuitState = CircuitState.HALF_OPEN;
            log.warn("AI 熔断器进入半开状态，放行一个试探请求");
            return true;
        }
        return false;
    }

    private void onSuccess() {
        if (circuitState != CircuitState.CLOSED || consecutiveFailures.get() > 0) {
            log.info("AI 调用恢复，熔断器关闭");
        }
        consecutiveFailures.set(0);
        circuitState = CircuitState.CLOSED;
    }

    private void onFailure() {
        if (circuitState == CircuitState.HALF_OPEN) {
            circuitState = CircuitState.OPEN;
            openedAt = System.currentTimeMillis();
            log.warn("试探请求仍失败，AI 熔断器重新打开 {}ms", circuitOpenDurationMs);
            return;
        }
        int n = consecutiveFailures.incrementAndGet();
        if (circuitState == CircuitState.CLOSED && n >= circuitFailureThreshold) {
            circuitState = CircuitState.OPEN;
            openedAt = System.currentTimeMillis();
            log.warn("AI 连续失败 {} 次，熔断器打开 {}ms，期间快速失败", n, circuitOpenDurationMs);
        }
    }

    public String chat(List<AiMessage> messages, boolean jsonMode) {
        if (!tryAcquire()) {
            log.warn("AI 熔断器打开中，本次请求快速失败");
            return null;
        }
        JSONObject body = new JSONObject();
        body.put("model", model);
        body.put("messages", JSON.parseArray(JSON.toJSONString(messages)));
        body.put("temperature", 0.8);
        if (jsonMode) {
            body.put("response_format", JSONObject.parseObject("{\"type\":\"json_object\"}"));
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        String url = baseUrl + "/chat/completions";
        String bodyStr = body.toJSONString();
        if (log.isDebugEnabled()) {
            log.debug("AI 请求 url={}, model={}, messages={}, body={}",
                    url, model, messages.size(),
                    bodyStr.substring(0, Math.min(500, bodyStr.length())));
        }

        int attempts = maxRetries < 0 ? 0 : maxRetries;
        Exception lastErr = null;
        for (int attempt = 0; attempt <= attempts; attempt++) {
            try {
                ResponseEntity<String> response = restTemplate.postForEntity(
                        url,
                        new HttpEntity<>(bodyStr, headers),
                        String.class);

                String responseBody = response.getBody();
                if (log.isDebugEnabled()) {
                    log.debug("AI 响应 status={}, body={}",
                            response.getStatusCode(),
                            responseBody != null ? responseBody.substring(0, Math.min(1000, responseBody.length())) : "null");
                }

                JSONObject json = JSON.parseObject(responseBody);
                if (json.containsKey("error")) {
                    log.warn("AI 返回错误: {}", json.getString("error"));
                    onFailure();
                    return null;
                }
                JSONArray choices = json.getJSONArray("choices");
                if (choices == null || choices.isEmpty()) {
                    log.warn("AI 响应无 choices: {}", responseBody);
                    onFailure();
                    return null;
                }
                String content = choices.getJSONObject(0).getJSONObject("message").getString("content");
                log.debug("AI 回复长度: {}", content != null ? content.length() : 0);
                onSuccess();
                return content;
            } catch (HttpClientErrorException e) {
                // 4xx：请求本身有问题（参数/鉴权/余额），重试无意义，直接失败
                log.warn("AI 客户端错误 status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
                onFailure();
                if (e.getStatusCode().value() == 402) {
                    return "AI 服务余额不足，请联系管理员充值";
                }
                return "AI 服务调用失败: " + e.getMessage();
            } catch (HttpServerErrorException | ResourceAccessException e) {
                // 5xx 或网络异常/超时：可重试
                lastErr = e;
                log.warn("AI 调用失败（第 {}/{} 次）: {}",
                        attempt + 1, attempts + 1, e.getMessage());
            }
        }
        log.error("AI 调用重试 {} 次后仍失败", attempts, lastErr);
        onFailure();
        return null;
    }

    public String chat(List<AiMessage> messages) {
        return chat(messages, false);
    }

    /**
     * 文本向量化：调 SiliconFlow /embeddings，失败返回 null（调用方需降级处理）
     */
    public float[] embed(String text) {
        if (text == null || text.trim().isEmpty()) return null;
        JSONObject body = new JSONObject();
        body.put("model", embeddingModel);
        body.put("input", text.length() > 1500 ? text.substring(0, 1500) : text);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    baseUrl + "/embeddings",
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);
            JSONObject json = JSON.parseObject(response.getBody());
            JSONArray data = json.getJSONArray("data");
            if (data == null || data.isEmpty()) return null;
            JSONArray vec = data.getJSONObject(0).getJSONArray("embedding");
            float[] out = new float[vec.size()];
            for (int i = 0; i < vec.size(); i++) out[i] = vec.getFloatValue(i);
            return out;
        } catch (Exception e) {
            log.warn("Embedding 调用失败: {}", e.getMessage());
            return null;
        }
    }
}
