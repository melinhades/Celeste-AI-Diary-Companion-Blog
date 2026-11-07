package com.mszlu.blog.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.vo.PptGenerateParam;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * PPT 槽位生成：版式由前端的 GRID_TEMPLATE 固定，AI 只负责填字。
 * 提示词只有前端 pptgen.js 一份（原样沿用），后端不重复维护；这里只做 JSON 模式调用、
 * schema 校验、长度截断和兜底。
 */
@Service
@Slf4j
public class PptService {

    @Autowired
    private AiClient aiClient;

    /**
     * slotId → 最大字符数（与 blog-ui/js/pptgen.js 的 GRID_TEMPLATE.max 对齐）。
     * 后端先截断一次，保证返回的 JSON 不因模型啰嗦而撑破版式。
     */
    private static final Map<String, Integer> MAX_LEN = new LinkedHashMap<>();
    static {
        MAX_LEN.put("p1_title", 32);
        MAX_LEN.put("p1_sub", 60);
        MAX_LEN.put("p2_head", 24);
        MAX_LEN.put("p2_fact", 40);
        MAX_LEN.put("p2_hard1", 40);
        MAX_LEN.put("p2_hard2", 40);
        MAX_LEN.put("p2_worst", 40);
        MAX_LEN.put("p2_tail", 24);
        MAX_LEN.put("p2_impossible", 16);
        MAX_LEN.put("p3_title", 28);
        MAX_LEN.put("p3_desc", 60);
        MAX_LEN.put("p4_title", 16);
        MAX_LEN.put("p4_step1", 28);
        MAX_LEN.put("p4_step2", 28);
        MAX_LEN.put("p4_step3", 28);
        MAX_LEN.put("p5_warn_a", 30);
        MAX_LEN.put("p5_warn_b", 30);
        MAX_LEN.put("p6_title", 28);
    }

    /**
     * 生成 6 页的填字数据。任何一步失败（无 Key / 超时 / 解析失败 / 字段缺失）都返回本地兜底，
     * 不会出现空页。
     */
    public Map<String, String> generate(PptGenerateParam param) {
        String topic = StringUtils.isBlank(param.getTopic()) ? "这件事" : param.getTopic().trim();
        Map<String, String> out = fallback(topic);

        String prompt = param.getPrompt();
        if (StringUtils.isBlank(prompt)) {
            log.warn("/ppt/generate 未收到 prompt（提示词由前端 pptgen.js 提供），返回本地兜底文案");
            return out;
        }

        String raw = aiClient.chat(Collections.singletonList(new AiMessage("user", prompt)), true, aiClient.getModel());
        if (raw == null) {
            log.warn("/ppt/generate AI 无返回（未配置 Key / 超时 / 熔断），返回本地兜底文案");
            return out;
        }

        JSONObject obj = parse(raw);
        if (obj == null) {
            log.warn("/ppt/generate 返回内容不是合法 JSON，返回本地兜底文案");
            return out;
        }

        for (Map.Entry<String, Integer> e : MAX_LEN.entrySet()) {
            String key = e.getKey();
            String value = sanitize(obj.getString(key), key.startsWith("p5_warn"));
            if (StringUtils.isNotBlank(value)) {
                out.put(key, truncate(value, e.getValue()));
            }
        }
        return out;
    }

    /** 本地兜底：保证每个 slot 都有字，页面永远不空 */
    private Map<String, String> fallback(String topic) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("p1_title", topic + "与我");
        m.put("p1_sub", "学不会？来看看");
        m.put("p2_head", "你在" + topic + "上卡壳了？");
        m.put("p2_fact", "事实：" + topic + "真的好难！");
        m.put("p2_hard1", "每次都差一点点");
        m.put("p2_hard2", "老是搞不对时机");
        m.put("p2_worst", "而且还绕不过去");
        m.put("p2_tail", "（这最坏了）");
        m.put("p2_impossible", "不可能学会的" + topic + "？");
        m.put("p3_title", "介绍…" + topic + ".ppt!!");
        m.put("p3_desc", "把所有坑都帮你踩过了！");
        m.put("p4_title", topic + "三步法");
        m.put("p4_step1", "先把" + topic + "拆成小动作");
        m.put("p4_step2", "每次只练一个细节");
        m.put("p4_step3", "慢慢来，别急");
        m.put("p5_warn_a", "如果又搞砸了…<br>歇一会儿再试试");
        m.put("p5_warn_b", "如果心态快崩了…<br>深呼吸，别着急");
        m.put("p6_title", topic + "，快乐的你");
        for (Map.Entry<String, Integer> e : MAX_LEN.entrySet()) {
            m.put(e.getKey(), truncate(m.get(e.getKey()), e.getValue()));
        }
        return m;
    }

    private JSONObject parse(String raw) {
        String s = StringUtils.trimToEmpty(raw)
                .replaceAll("^```(?:json)?\\s*", "")
                .replaceAll("\\s*```$", "");
        try {
            return JSON.parseObject(s);
        } catch (Exception ignored) {
            int l = s.indexOf('{');
            int r = s.lastIndexOf('}');
            if (l >= 0 && r > l) {
                try {
                    return JSON.parseObject(s.substring(l, r + 1));
                } catch (Exception ignored2) {
                    return null;
                }
            }
            return null;
        }
    }

    /** 清洗模型输出：去引号/换行；warn 类保留 <br> 作为两行分隔 */
    private String sanitize(String value, boolean allowBr) {
        if (value == null) return null;
        String s = value.trim().replaceAll("```", "").trim();
        s = s.replaceAll("^[\"']+", "").replaceAll("[\"']+$", "");
        if (allowBr) {
            s = s.replaceAll("\\s*<br\\s*/?>\\s*", "<br>");
            s = s.replaceAll("[\\r\\n]+", "<br>");
        } else {
            s = s.replaceAll("[\\r\\n]+", " ");
        }
        return s.replaceAll("[\\t ]+", " ").trim();
    }

    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
