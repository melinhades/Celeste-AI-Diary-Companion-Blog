package com.mszlu.blog.service.ai;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.utils.UserThreadLocal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * AI 客户端 —— 支持用户自定义 API Key 路由
 *
 * Key 选择优先级（resolveKey）：
 *   1. UserThreadLocal 中的 SysUser.apiKey（零 DB 开销，主路径）
 *   2. BaseMapper.selectById 查到的 SysUser.apiKey（异步/无 ThreadLocal 场景的 fallback）
 *   3. application-prod.yml 中的 ai.api-key（系统默认）
 *
 * 熔断粒度：全局（consecutiveFailures / circuitState）。
 *   —— 402（余额不足）按当前 key 区分提示：用户 key 提示"你的 API Key"，系统 key 提示"AI 服务"
 *   —— 429（上游限流）仍全局熔断，因为与 key 无关
 *
 * 向后兼容：所有现有 chat() / streamChat() / embed() 签名保持不变，
 *   内部自动从 UserThreadLocal 取 userId → resolveKey 选 key。
 */
@Component
@Slf4j
public class AiClient {

    @Value("${ai.base-url:https://api.siliconflow.cn/v1}")
    private String baseUrl;

    /** 系统默认 Key（application-prod.yml）。用户 apiKey 为空时回退 */
    @Value("${ai.api-key:}")
    private String apiKey;

    /** 独立 embedding 服务地址；未配置时回落 ai.base-url，保证换对话服务商不影响 RAG */
    @Value("${ai.embed-base-url:}")
    private String embedBaseUrl;

    /** 独立 embedding 服务 Key；未配置时保持原有 Key 选择逻辑（用户 Key → 系统 Key） */
    @Value("${ai.embed-api-key:}")
    private String embedApiKey;

    /**
     * 快模型独立服务地址；为空则回落 ai.base-url。
     * 只在本次请求的 model 等于 ai.fast-model 时生效；流式与 embedding 不走这条路由。
     */
    @Value("${ai.fast-base-url:}")
    private String fastBaseUrl;

    /**
     * 快模型独立服务 Key；为空则回落系统主 Key（ai.api-key）。
     * 注意：BYOK 用户的 Key 属于用户自己的服务商，不能拿去请求快模型端点。
     */
    @Value("${ai.fast-api-key:}")
    private String fastApiKey;

    @Value("${ai.model:THUDM/GLM-4-9B-0414}")
    private String model;

    /** 前处理快模型：情绪提取/意图分类不需要强推理，用小模型省延迟 */
    @Value("${ai.fast-model:Qwen/Qwen2.5-7B-Instruct}")
    private String fastModel;

    public String getFastModel() { return fastModel; }

    /** 主模型名：供需要在异步线程中显式传 userId 的调用方保持原模型语义 */
    public String getModel() { return model; }

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

    /** 系统 Key 是否可用（空/占位符 = 不可用） */
    private volatile boolean configured = true;

    /** 当前 resolveKey 解析的 Key 来源类型 —— 用于 402 区分提示文案 */
    public enum KeySource { SYSTEM, USER }

    /**
     * 用户/系统 Key 选择
     * @param explicitUserId 显式 userId（异步场景，ThreadLocal 取不到时用）
     * @return 解析后的 API Key；系统 apiKey 未配置时返回 null
     */
    private String resolveKey(String explicitUserId) {
        // 1. 优先从 UserThreadLocal 取当前登录用户的 apiKey（零 DB 开销）
        SysUser u = UserThreadLocal.get();
        if (u != null && isKeyValid(u.getApiKey())) return u.getApiKey().trim();

        // 2. explicitUserId 有值但 ThreadLocal 没 → DB fallback（少数异步/无上下文场景）
        if (explicitUserId != null && !explicitUserId.isEmpty() && userMapper != null) {
            SysUser db = userMapper.selectById(explicitUserId);
            if (db != null && isKeyValid(db.getApiKey())) return db.getApiKey().trim();
        }

        // 3. 回系统默认
        return isKeyValid(apiKey) ? apiKey : null;
    }

    /** 判断 resolveKey 解析出的 Key 是用户的还是系统的 —— 用于 402 区分提示 */
    private KeySource currentKeySource(String resolvedKey, String explicitUserId) {
        SysUser u = UserThreadLocal.get();
        if (u != null && isKeyValid(u.getApiKey()) && u.getApiKey().trim().equals(resolvedKey)) {
            return KeySource.USER;
        }
        if (explicitUserId != null && !explicitUserId.isEmpty() && userMapper != null) {
            SysUser db = userMapper.selectById(explicitUserId);
            if (db != null && isKeyValid(db.getApiKey()) && db.getApiKey().trim().equals(resolvedKey)) {
                return KeySource.USER;
            }
        }
        return KeySource.SYSTEM;
    }

    private boolean isKeyValid(String k) { return k != null && !k.trim().isEmpty() && !k.trim().startsWith("your"); }

    /** 取当前上下文用户（ThreadLocal 优先，异步场景回退 DB） */
    private SysUser userOf(String explicitUserId) {
        SysUser u = UserThreadLocal.get();
        if (u != null) return u;
        if (explicitUserId != null && !explicitUserId.isEmpty() && userMapper != null) {
            return userMapper.selectById(explicitUserId);
        }
        return null;
    }

    /**
     * 当前解析出的 Key 是否是「DeepSeek 服务商的用户自定义 Key」。
     * 是 → 本次请求改走 DeepSeek 官方端点与 deepseek-chat 模型。
     */
    private boolean isDeepseekUser(String resolvedKey, String explicitUserId) {
        if (resolvedKey == null) return false;
        SysUser u = userOf(explicitUserId);
        return u != null
                && isKeyValid(u.getApiKey())
                && u.getApiKey().trim().equals(resolvedKey)
                && "deepseek".equalsIgnoreCase(u.getApiProvider());
    }

    /** 按用户服务商选择 chat 端点 */
    private String chatBaseOf(String resolvedKey, String explicitUserId) {
        return isDeepseekUser(resolvedKey, explicitUserId) ? DEEPSEEK_BASE_URL : baseUrl;
    }

    /** 按用户服务商选择 chat 模型（DeepSeek 只有一个对话模型，忽略入参） */
    private String chatModelOf(String resolvedKey, String explicitUserId, String requested) {
        return isDeepseekUser(resolvedKey, explicitUserId) ? DEEPSEEK_MODEL : requested;
    }

    @Autowired(required = false)
    private BaseMapper<SysUser> userMapper;

    /**
     * 对指定用户是否有可用 Key（用户自定义 or 系统默认）
     */
    public boolean isConfigured(String userId) {
        return resolveKey(userId) != null;
    }

    /** 系统 Key 是否可用（向后兼容，不含用户 Key 检查） */
    public boolean isConfigured() {
        return configured || resolveKey(null) != null;
    }

    /** DeepSeek 官方端点：Key 在默认端点（SiliconFlow）无效时，测试接口兜底再试一次 */
    private static final String DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
    private static final String DEEPSEEK_MODEL = "deepseek-chat";

    /** Key 探测结果：provider 为通过验证的服务商（siliconflow/deepseek），error 为面向用户的失败原因 */
    public static class KeyProbe {
        public final String provider;
        public final String error;
        KeyProbe(String provider, String error) { this.provider = provider; this.error = error; }
    }

    /**
     * 探测 Key 属于哪个服务商：先试默认端点（SiliconFlow），无效/不匹配再试 DeepSeek。
     * 安装与保存自定义 Key 时共用，探测出的 provider 会随 Key 一起落库。
     */
    public KeyProbe probeKey(String key) {
        String k = key == null ? "" : key.trim();
        if (!isKeyValid(k)) return new KeyProbe(null, "请填入有效的 API Key");

        String err = tryKey(baseUrl, model, k);
        if (err == null) return new KeyProbe("siliconflow", null);
        if (err.contains("无效或无权限") || err.contains("是否匹配")) {
            String err2 = tryKey(DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, k);
            if (err2 == null) return new KeyProbe("deepseek", null);
            return new KeyProbe(null, err2);
        }
        return new KeyProbe(null, err);
    }

    /** 用指定模型对 Key 做最小 chat 探测（安装成功后“测试所选模型”用），返回 null = 通过 */
    public String testKeyModel(String key, String provider, String model) {
        String k = key == null ? "" : key.trim();
        if (!isKeyValid(k)) return "请填入有效的 API Key";
        String m = model == null ? "" : model.trim();
        if (m.isEmpty()) return "请先选择模型";
        String base = "deepseek".equalsIgnoreCase(provider) ? DEEPSEEK_BASE_URL : baseUrl;
        return tryKey(base, m, k);
    }

    /** 非对话类模型的 id 特征（SiliconFlow /models 返回全量，需剔除） */
    private static final List<String> NON_CHAT_HINTS = java.util.Arrays.asList(
            "embed", "bge", "rerank", "whisper", "tts", "speech", "audio",
            "clip", "flux", "stable", "image", "video", "moderation", "dall");

    /**
     * 列出该 Key 在对应服务商可用的对话模型（安装成功后让用户挑选）。
     * SiliconFlow 走 ?type=text&sub_type=chat 过滤；DeepSeek 只有对话模型，全量返回。
     * 失败返回空列表（调用方降级：跳过选择直接进主页）。
     */
    public List<String> listModels(String key, String provider) {
        List<String> out = new java.util.ArrayList<>();
        if (!isKeyValid(key)) return out;
        boolean deepseek = "deepseek".equalsIgnoreCase(provider);
        String url = (deepseek ? DEEPSEEK_BASE_URL : baseUrl) + "/models";
        if (!deepseek) url += "?type=text&sub_type=chat";
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(key.trim());
        try {
            ResponseEntity<String> resp = restTemplate.exchange(
                    url, org.springframework.http.HttpMethod.GET, new HttpEntity<>(headers), String.class);
            JSONObject json = JSON.parseObject(resp.getBody());
            JSONArray data = json == null ? null : json.getJSONArray("data");
            if (data == null) return out;
            for (int i = 0; i < data.size() && out.size() < 60; i++) {
                String id = data.getJSONObject(i).getString("id");
                if (id == null || id.isEmpty()) continue;
                if (!deepseek && looksNonChat(id)) continue;
                out.add(id);
            }
        } catch (Exception e) {
            log.warn("拉取模型列表失败: {}", e.getMessage());
        }
        return out;
    }

    private boolean looksNonChat(String id) {
        String s = id.toLowerCase();
        for (String h : NON_CHAT_HINTS) {
            if (s.contains(h)) return true;
        }
        return false;
    }

    /** 对指定端点发一次最小 chat 请求；返回 null = 通过，否则为可直接展示的中文错误 */
    private String tryKey(String base, String testModel, String k) {
        JSONObject body = new JSONObject();
        body.put("model", testModel);
        JSONArray messages = new JSONArray();
        JSONObject message = new JSONObject();
        message.put("role", "user");
        message.put("content", "ping");
        messages.add(message);
        body.put("messages", messages);
        body.put("max_tokens", 1);
        body.put("temperature", 0);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(k);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    base + "/chat/completions",
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);
            JSONObject json = JSON.parseObject(response.getBody());
            JSONArray choices = json == null ? null : json.getJSONArray("choices");
            if (choices == null || choices.isEmpty()) {
                return "AI 服务返回异常响应";
            }
            return null;
        } catch (HttpClientErrorException e) {
            int status = e.getStatusCode().value();
            if (status == 401 || status == 403) return "API Key 无效或无权限";
            if (status == 402) return "API Key 余额不足";
            if (status == 404) return "当前服务商不支持模型 " + testModel;
            if (status == 429) return "上游限流，请稍后重试";
            if (status == 400) return "请求被拒绝，请确认 Key 与服务商是否匹配";
            return "AI 服务调用失败（HTTP " + status + "）";
        } catch (HttpServerErrorException e) {
            return "AI 服务暂时不可用（HTTP " + e.getStatusCode().value() + "）";
        } catch (ResourceAccessException e) {
            return "无法连接 AI 服务，请检查网络或服务地址";
        } catch (Exception e) {
            log.warn("API Key 测试失败: {}", e.getMessage());
            return "测试失败，请稍后重试";
        }
    }

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

        // 启动时校验系统密钥：缺省值/空值/粘贴带空白都会导致上游 401，这里提前暴露并跳过上游请求
        String key = apiKey == null ? "" : apiKey.trim();
        this.apiKey = key;
        this.configured = !key.isEmpty() && !key.startsWith("your");
        if (!configured) {
            log.warn("系统 AI_API_KEY 未配置或仍为占位符；登录用户若在 sys_user.api_key 填入自定义 Key 仍可使用");
        }
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

    // ================= chat —— 公开签名不变，内部自动 resolveKey =================

    public String chat(List<AiMessage> messages, boolean jsonMode) {
        return chat(messages, jsonMode, this.model);
    }

    /** 带自定义模型的 chat：前处理（情绪/意图）用快模型，主回复用主模型 */
    public String chat(List<AiMessage> messages, boolean jsonMode, String model) {
        return chat(messages, jsonMode, model, null);
    }

    /** 显式 userId 版本（异步场景 / ThreadLocal 拿不到时使用） */
    public String chat(List<AiMessage> messages, boolean jsonMode, String model, String userId) {
        // 快模型独立路由：仅当本次 model 命中 ai.fast-model 且配置了 ai.fast-base-url 时生效
        boolean fastRoute = fastBaseUrl != null && !fastBaseUrl.trim().isEmpty()
                && model != null && model.equals(fastModel);
        String resolvedKey;
        KeySource keySource;
        if (fastRoute) {
            // BYOK 用户 Key 属于用户自己的服务商，不能用于快模型服务商；只用 fast Key，空则回落系统主 Key
            resolvedKey = isKeyValid(fastApiKey) ? fastApiKey.trim()
                    : (isKeyValid(apiKey) ? apiKey.trim() : null);
            keySource = KeySource.SYSTEM;
            if (resolvedKey == null) {
                log.warn("快模型服务未配置：ai.fast-api-key 与 ai.api-key 均为空");
                return null;
            }
        } else {
            resolvedKey = resolveKey(userId);
            if (resolvedKey == null) {
                log.warn("AI 服务未配置：用户 Key 与系统默认 Key 均为空");
                return null;
            }
            keySource = currentKeySource(resolvedKey, userId);
        }
        throttle();
        if (!tryAcquire()) {
            log.warn("AI 熔断器打开中，本次请求快速失败");
            return null;
        }
        String effModel = fastRoute ? model : chatModelOf(resolvedKey, userId, model);
        JSONObject body = new JSONObject();
        body.put("model", effModel);
        body.put("messages", JSON.parseArray(JSON.toJSONString(messages)));
        body.put("temperature", 0.8);
        if (jsonMode) {
            body.put("response_format", JSONObject.parseObject("{\"type\":\"json_object\"}"));
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(resolvedKey);

        String url = (fastRoute ? fastBaseUrl.trim() : chatBaseOf(resolvedKey, userId)) + "/chat/completions";
        String bodyStr = body.toJSONString();
        if (log.isDebugEnabled()) {
            log.debug("AI 请求 url={}, model={}, messages={}, keySource={}, body={}",
                    url, effModel, messages.size(), keySource,
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
                // 其他 4xx：请求本身有问题（参数/鉴权/余额），重试无意义，直接失败。
                // 注意：失败原因只进日志，绝不当作模型正文返回，避免调用方把报错念给用户。
                log.warn("AI 客户端错误 status={}, body={}", e.getStatusCode(), e.getResponseBodyAsString());
                onFailure();
                return null;
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

    // ================= streamChat —— 公开签名不变 =================

    /**
     * 流式对话：上游 stream=true，逐 delta 回调 onDelta（边生成边推给客户端）。
     * 返回完整文本；上游失败返回 null；客户端中途断开则中断流并返回 null（已收到的部分由调用方通过回调处理）。
     * 流式不做重试（无法重试到中间帧），只保留全局限速和熔断。
     */
    public String streamChat(List<AiMessage> messages, java.util.function.Consumer<String> onDelta) {
        return streamChat(messages, onDelta, null);
    }

    public String streamChat(List<AiMessage> messages, java.util.function.Consumer<String> onDelta, String userId) {
        String resolvedKey = resolveKey(userId);
        if (resolvedKey == null) return null;
        throttle();
        if (!tryAcquire()) {
            log.warn("AI 熔断器打开中，流式请求快速失败");
            return null;
        }
        JSONObject body = new JSONObject();
        body.put("model", chatModelOf(resolvedKey, userId, model));
        body.put("messages", JSON.parseArray(JSON.toJSONString(messages)));
        body.put("temperature", 0.8);
        body.put("stream", true);

        StringBuilder full = new StringBuilder();
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(chatBaseOf(resolvedKey, userId) + "/chat/completions"))
                    .timeout(Duration.ofMillis(Math.max(readTimeout * 2L, 60000L)))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + resolvedKey)
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

    // ================= embed —— 公开签名不变 =================

    /**
     * 文本向量化：调 SiliconFlow /embeddings，失败返回 null（调用方需降级处理）
     */
    public float[] embed(String text) {
        return embed(text, null);
    }

    public float[] embed(String text, String userId) {
        if (text == null || text.trim().isEmpty()) return null;

        // embedding 端点：优先独立配置；未配置回落主对话地址（保持原有行为）
        String embedUrl = (embedBaseUrl != null && !embedBaseUrl.trim().isEmpty()
                ? embedBaseUrl.trim() : baseUrl) + "/embeddings";

        // embedding Key：显式配置 ai.embed-api-key 时用独立凭据（embedding 与对话可能分属不同服务商）；
        // 未配置时保持原逻辑：用户 Key 优先，DeepSeek 用户没有 embeddings → 回落系统 Key
        String embedKey;
        if (isKeyValid(embedApiKey)) {
            embedKey = embedApiKey.trim();
        } else {
            String resolvedKey = resolveKey(userId);
            if (resolvedKey == null) return null;
            embedKey = resolvedKey;
            if (isDeepseekUser(resolvedKey, userId)) {
                if (!isKeyValid(apiKey)) return null;
                embedKey = apiKey;
            }
        }
        JSONObject body = new JSONObject();
        body.put("model", embeddingModel);
        body.put("input", text.length() > 1500 ? text.substring(0, 1500) : text);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(embedKey);

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    embedUrl,
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
