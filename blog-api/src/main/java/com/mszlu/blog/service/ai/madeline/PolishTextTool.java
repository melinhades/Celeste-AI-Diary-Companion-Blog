package com.mszlu.blog.service.ai.madeline;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Collections;

/**
 * polishText 工具：评估 + 润色一段文字，返回结构化结果（问题清单 / 修改后全文 / 改动说明）。
 * 一期唯一工具：不写库、纯评估，先验证工具循环框架，最安全。
 */
@Component
@Slf4j
public class PolishTextTool {

    @Autowired
    private AiClient aiClient;

    /**
     * 执行润色。成功返回结构化 JSON（issues/polished/changeNote），失败返回 null（由引擎降级为口头回答）。
     */
    public JSONObject run(String text, String style) {
        if (text == null || text.trim().length() < 10) {
            return null; // 太短没啥可改的
        }
        String prompt = PromptBuilder.polishText(text.trim(), style);
        String out = aiClient.chat(Collections.singletonList(new AiMessage("user", prompt)), true);
        if (out == null) return null;
        try {
            JSONObject obj = JSON.parseObject(out);
            if (obj == null || obj.getString("polished") == null || obj.getString("polished").trim().isEmpty()) {
                return null;
            }
            return obj;
        } catch (Exception e) {
            log.warn("polishText 结果解析失败: {}", out.length() > 200 ? out.substring(0, 200) : out);
            return null;
        }
    }
}
