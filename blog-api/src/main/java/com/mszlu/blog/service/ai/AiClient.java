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

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Slf4j
public class AiClient {

    @Value("${ai.base-url:https://api.siliconflow.cn/v1}")
    private String baseUrl;

    @Value("${ai.api-key:}")
    private String apiKey;

    @Value("${ai.model:THUDM/GLM-4-9B-0414}")
    private String model;

    /** 前处理快模型：情绪提取/意图分类不需要强推理，用小模型省延迟 */
    @Value("${ai.fast-model:Qwen/Qwen2.5-3B-Instruct}")
    private String fastModel;

    public String getFastModel() { return fastModel; }

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

    /** 全局两次 AI 请求的最小间隔（毫秒），防止触发上游限流（429） */
    @Value("${ai.min-interval-ms:800}")
    private long minIntervalMs;

    /** 429 限流时的重试次数与退避基数（毫秒） */
    @Value("${ai.rate-limit.retries:3}")
    private int rateLimitRetries;

    @Value("${ai.rate-limit.backoff-ms:2000}")
    private long rateLimitBackoffMs;

    private final AtomicLong lastRequestAt = new AtomicLong(0);

    /** 全局限速：保证任意两次请求间隔 >= minIntervalMs */
    private void throttle() {
        long now = System.currentTimeMillis();
        long prev = lastRequestAt.get();
        long wait = prev + minIntervalMs - now;
        if (wait > 0) {
            try {
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        lastRequestAt.set(System.currentTimeMillis());
    }

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

    /** 熔断器当前状态：CLOSED / OPEN / HALF_OPEN，供健康检查与监控使用 */
    public String circuitState() {
        return circuitState.name();
    }

    /** 连续失败次数，熔断打开后达到阈值，恢复成功后归零 */
    public int consecutiveFailures() {
        return consecutiveFailures.get();
    }

    /** 触发熔断的连续失败阈值 */
    public int circuitFailureThreshold() {
        return circuitFailureThreshold;
    }

    public String chat(List<AiMessage> messages, boolean jsonMode) {
        return chat(messages, jsonMode, this.model);
    }

    /** 带自定义模型的 chat：前处理（情绪/意图）用快模型，主回复用主模型 */
    public String chat(List<AiMessage> messages, boolean jsonMode, String model) {
        throttle();
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
                // 429 限流：可重试，指数退避
                if (e.getStatusCode().value() == 429 && attempt < rateLimitRetries) {
                    long wait = rateLimitBackoffMs * (1L << attempt);
                    log.warn("AI 限流 429，{}ms 后重试（第 {}/{} 次）", wait, attempt + 1, rateLimitRetries);
                    try {
                        Thread.sleep(wait);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                    }
                    continue;
                }
                // 其他 4xx：请求本身有问题（参数/鉴权/余额），重试无意义，直接失败
                log.warn("AI 客户端错误 status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
                onFailure();
                if (e.getStatusCode().value() == 402) {
                    return "AI 服务余额不足，请联系管理员充值";
                }
                if (e.getStatusCode().value() == 429) {
                    return "AI 服务限流中，请稍后再试";
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
     * 流式对话：上游 stream=true，逐 delta 回调 onDelta（边生成边推给客户端）。
     * 返回完整文本；上游失败返回 null；客户端中途断开则中断流并返回 null（已收到的部分由调用方通过回调处理）。
     * 流式不做重试（无法重试到中间帧），只保留全局限速和熔断。
     */
    public String streamChat(List<AiMessage> messages, java.util.function.Consumer<String> onDelta) {
        throttle();
        if (!tryAcquire()) {
            log.warn("AI 熔断器打开中，流式请求快速失败");
            return null;
        }
        JSONObject body = new JSONObject();
        body.put("model", model);
        body.put("messages", JSON.parseArray(JSON.toJSONString(messages)));
        body.put("temperature", 0.8);
        body.put("stream", true);

        StringBuilder full = new StringBuilder();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/chat/completions"))
                    .timeout(Duration.ofMillis(Math.max(readTimeout * 2L, 60000L)))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body.toJSONString()))
                    .build();
            HttpResponse<java.util.stream.Stream<String>> response = httpClient().send(
                    request, HttpResponse.BodyHandlers.ofLines());
            if (response.statusCode() != 200) {
                log.warn("AI 流式响应异常 status={}", response.statusCode());
                onFailure();
                return null;
            }
            try (java.util.stream.Stream<String> lines = response.body()) {
                lines.forEach(line -> {
                    if (!line.startsWith("data:")) return;
                    String payload = line.substring(5).trim();
                    if (payload.isEmpty() || "[DONE]".equals(payload)) return;
                    try {
                        JSONObject chunk = JSON.parseObject(payload);
                        JSONArray choices = chunk.getJSONArray("choices");
                        if (choices == null || choices.isEmpty()) return;
                        JSONObject delta = choices.getJSONObject(0).getJSONObject("delta");
                        String piece = delta == null ? null : delta.getString("content");
                        if (piece == null || piece.isEmpty()) return;
                        full.append(piece);
                        if (onDelta != null) {
                            try {
                                onDelta.accept(piece);
                            } catch (Exception down) {
                                // 下游写不进（客户端断开等）：中断整个流
                                throw new RuntimeException(down);
                            }
                        }
                    } catch (RuntimeException down) {
                        throw down;
                    } catch (Exception parse) {
                        log.debug("忽略无法解析的流片段: {}", payload);
                    }
                });
            }
            onSuccess();
            return full.toString();
        } catch (Exception e) {
            if (full.length() > 0) {
                // 已收到部分内容后中断：多半是客户端断开，不算 AI 故障，不计熔断
                log.warn("AI 流式传输中断（已收到 {} 字）: {}", full.length(), e.getMessage());
                return null;
            }
            log.warn("AI 流式调用失败: {}", e.getMessage());
            onFailure();
            return null;
        }
    }

    /** java.net.http.HttpClient 懒加载：RestTemplate 不支持流式响应，这里专用 */
    private volatile java.net.http.HttpClient httpClient;

    private java.net.http.HttpClient httpClient() {
        if (httpClient == null) {
            synchronized (this) {
                if (httpClient == null) {
                    httpClient = HttpClient.newBuilder()
                            .connectTimeout(Duration.ofMillis(connectTimeout))
                            .build();
                }
            }
        }
        return httpClient;
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
