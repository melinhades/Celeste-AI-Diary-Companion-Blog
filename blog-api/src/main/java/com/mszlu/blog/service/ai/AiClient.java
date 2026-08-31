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
import org.springframework.web.client.RestTemplate;

import java.util.List;

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

    private final RestTemplate restTemplate;

    public AiClient() {
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10000);
        factory.setReadTimeout(60000);
        this.restTemplate = new RestTemplate(factory);
    }

    public String chat(List<AiMessage> messages, boolean jsonMode) {
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
        System.out.println("===== AI 请求 =====");
        System.out.println("URL: " + url);
        System.out.println("Model: " + model);
        System.out.println("API Key 前10位: " + (apiKey.length() > 10 ? apiKey.substring(0, 10) + "..." : apiKey));
        System.out.println("Messages: " + messages.size() + " 条");
        System.out.println("请求体: " + body.toJSONString().substring(0, Math.min(500, body.toJSONString().length())));

        try {
            ResponseEntity<String> response = restTemplate.postForEntity(
                    url,
                    new HttpEntity<>(body.toJSONString(), headers),
                    String.class);

            String responseBody = response.getBody();
            System.out.println("===== AI 响应 =====");
            System.out.println("HTTP状态码: " + response.getStatusCode());
            System.out.println("响应内容: " + (responseBody != null ? responseBody.substring(0, Math.min(1000, responseBody.length())) : "null"));

            JSONObject json = JSON.parseObject(responseBody);

            if (json.containsKey("error")) {
                System.out.println("===== AI 错误 =====");
                System.out.println("错误: " + json.getString("error"));
                return null;
            }

            JSONArray choices = json.getJSONArray("choices");
            if (choices == null || choices.isEmpty()) {
                System.out.println("===== AI 无 choices =====");
                System.out.println("完整响应: " + responseBody);
                return null;
            }
            String content = choices.getJSONObject(0).getJSONObject("message").getString("content");
            System.out.println("AI 回复长度: " + (content != null ? content.length() : 0) + " 字符");
            System.out.println("===================");
            return content;
        } catch (HttpClientErrorException e) {
            System.err.println("AI 服务调用失败: " + e.getStatusCode() + " - " + e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 402) {
                return "AI 服务余额不足，请联系管理员充值";
            }
            return "AI 服务调用失败: " + e.getMessage();
        }
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
            System.err.println("Embedding 调用失败: " + e.getMessage());
            return null;
        }
    }
}
