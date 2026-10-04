package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 共识/分歧追踪器：每若干条发言增量分析一次，产出 pulse {consensus, disagreements, focusPoint, consensusScore}。
 * 模型失败时用关键词兜底，保证前端状态小窗永远有内容。
 */
@Component
@Slf4j
public class ConsensusTracker {

    private final AiClient aiClient;

    @Autowired
    public ConsensusTracker(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    public Map<String, Object> update(RoundtableSession session) {
        Map<String, Object> pulse;
        try {
            String raw = aiClient.chat(buildMessages(session), true);
            pulse = parse(raw);
        } catch (Exception e) {
            log.warn("共识分析失败，走兜底: {}", e.getMessage());
            pulse = null;
        }
        if (pulse == null) pulse = fallback(session);
        session.setLastPulse(pulse);
        return pulse;
    }

    private Map<String, Object> parse(String raw) {
        if (raw == null) return null;
        JSONObject obj = JSON.parseObject(raw);
        if (obj == null) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("consensus", toStringList(obj.getJSONArray("consensus")));
        m.put("disagreements", toStringList(obj.getJSONArray("disagreements")));
        String fp = obj.getString("focusPoint");
        m.put("focusPoint", fp == null ? "讨论进行中" : fp);
        Object score = obj.get("consensusScore");
        m.put("consensusScore", score instanceof Number ? ((Number) score).intValue() : 50);
        m.put("ts", System.currentTimeMillis());
        return m;
    }

    private List<String> toStringList(JSONArray arr) {
        List<String> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.size(); i++) {
            String s = arr.getString(i);
            if (s != null && !s.trim().isEmpty()) out.add(s);
        }
        return out;
    }

    private Map<String, Object> fallback(RoundtableSession session) {
        List<String> consensus = new ArrayList<>();
        List<String> disagreements = new ArrayList<>();
        String focus = "讨论进行中";
        for (Map<String, Object> m : session.getTranscript()) {
            String c = (String) m.get("content");
            if (c == null) continue;
            if (c.contains("同意") || c.contains("没错") || c.contains("赞成") || c.contains("对")) {
                consensus.add(c);
            }
            if (c.contains("反对") || c.contains("但是") || c.contains("可是") || c.contains("不同意") || c.contains("不对")) {
                disagreements.add(c);
            }
        }
        // focus: 取最近一条非 AI 主持的发言关键词（简单取前 8 字）
        for (int i = session.getTranscript().size() - 1; i >= 0; i--) {
            String c = (String) session.getTranscript().get(i).get("content");
            if (c != null && !c.isEmpty()) { focus = c.substring(0, Math.min(8, c.length())); break; }
        }
        Map<String, Object> pulse = new LinkedHashMap<>();
        pulse.put("consensus", consensus);
        pulse.put("disagreements", disagreements);
        pulse.put("focusPoint", focus);
        pulse.put("consensusScore", 50);
        pulse.put("ts", System.currentTimeMillis());
        return pulse;
    }

    private List<AiMessage> buildMessages(RoundtableSession session) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system",
                "你是圆桌讨论的共识分析师。输出 JSON：{\"consensus\":[共识条目],\"disagreements\":[分歧条目]," +
                        "\"focusPoint\":\"当前讨论焦点一句话\",\"consensusScore\":0-100整数}。" +
                        "共识条目 2-4 条、分歧 1-3 条，每条是一句具体的话（含谁主张/什么理由），不要空泛概括。"));
        StringBuilder sb = new StringBuilder("议题：").append(session.getTopic()).append("\n讨论记录：\n");
        List<Map<String, Object>> t = session.getTranscript();
        int from = Math.max(0, t.size() - 15);
        for (int i = from; i < t.size(); i++) {
            Map<String, Object> m = t.get(i);
            sb.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
        }
        msgs.add(new AiMessage("user", sb.toString()));
        return msgs;
    }
}
