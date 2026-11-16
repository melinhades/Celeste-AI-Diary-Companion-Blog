package com.mszlu.blog.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.AgentTraceMapper;
import com.mszlu.blog.dao.mapper.DiaryChatLogMapper;
import com.mszlu.blog.dao.pojo.AgentTrace;
import com.mszlu.blog.dao.pojo.DiaryChatLog;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 自我迭代第一步：把「用户差评」和「人格检查失败」聚合成失败模式，给调 prompt 找方向。
 * <p>
 * 只读：不改任何数据，也不调用 AI。查询失败只打日志，返回空统计，不影响后台其它功能。
 */
@Service
@Slf4j
public class SelfEvalService {

    /** 窗口上限，防止一次扫全表 */
    private static final int MAX_WINDOW_DAYS = 90;
    /** 每组最多返回的模式数 */
    private static final int MAX_PATTERNS = 10;
    /** 样本最多返回条数 */
    private static final int MAX_SAMPLES = 5;
    /** 样本摘要截断长度 */
    private static final int MAX_SAMPLE_CHARS = 80;

    /** 从「R4 空泛鸡汤」里取规则号 */
    private static final Pattern RULE_HEAD = Pattern.compile("^\\s*([A-Za-z]+\\d*)");

    @Autowired
    private DiaryChatLogMapper diaryChatLogMapper;

    @Autowired
    private AgentTraceMapper agentTraceMapper;

    /**
     * 失败模式聚合。
     *
     * @param days 回看天数，非法或过大时收敛到 [1, 90]
     */
    public Map<String, Object> failurePatterns(int days) {
        int window = days <= 0 ? 7 : Math.min(days, MAX_WINDOW_DAYS);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("windowDays", window);
        out.put("negativeFeedback", negativeFeedback(window));
        out.put("personaFailures", personaFailures(window));
        return out;
    }

    /** 👎 反馈：按意图 / 情绪 / 过滤原因聚合 */
    private Map<String, Object> negativeFeedback(int window) {
        List<DiaryChatLog> logs;
        try {
            LambdaQueryWrapper<DiaryChatLog> qw = new LambdaQueryWrapper<>();
            qw.eq(DiaryChatLog::getUserFeedback, "👎")
                    .ge(DiaryChatLog::getCreatedAt, LocalDateTime.now().minusDays(window))
                    .orderByDesc(DiaryChatLog::getId);
            logs = diaryChatLogMapper.selectList(qw);
        } catch (Exception e) {
            log.warn("差评样本查询失败（返回空统计）: {}", e.getMessage());
            logs = new ArrayList<>();
        }

        Map<String, Integer> byIntent = new LinkedHashMap<>();
        Map<String, Integer> byEmotion = new LinkedHashMap<>();
        Map<String, Integer> byFilterReason = new LinkedHashMap<>();
        for (DiaryChatLog l : logs) {
            bump(byIntent, blankTo(l.getIntentType(), "未分类"));
            bump(byEmotion, blankTo(l.getEmotionType(), "未分类"));
            bump(byFilterReason, blankTo(l.getFilterReason(), "生成即被差评"));
        }

        List<Map<String, Object>> samples = new ArrayList<>();
        for (DiaryChatLog l : logs) {
            if (samples.size() >= MAX_SAMPLES) break;
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("sessionId", l.getSessionId());
            s.put("intent", blankTo(l.getIntentType(), "未分类"));
            s.put("emotion", blankTo(l.getEmotionType(), "未分类"));
            s.put("filterReason", l.getFilterReason());
            s.put("draft", clip(l.getUserDraft(), MAX_SAMPLE_CHARS));
            samples.add(s);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", logs.size());
        out.put("byIntent", rank(byIntent));
        out.put("byEmotion", rank(byEmotion));
        out.put("byFilterReason", rank(byFilterReason));
        out.put("samples", samples);
        return out;
    }

    /** 人格检查失败：按违反的规则号聚合 */
    private Map<String, Object> personaFailures(int window) {
        long since = System.currentTimeMillis() - window * 24L * 60 * 60 * 1000;
        List<AgentTrace> traces;
        try {
            LambdaQueryWrapper<AgentTrace> qw = new LambdaQueryWrapper<>();
            qw.eq(AgentTrace::getEvent, "persona_fail")
                    .ge(AgentTrace::getCreateDate, since)
                    .orderByDesc(AgentTrace::getCreateDate);
            traces = agentTraceMapper.selectList(qw);
        } catch (Exception e) {
            log.warn("人格检查失败查询失败（返回空统计）: {}", e.getMessage());
            traces = new ArrayList<>();
        }

        Map<String, Integer> byRule = new LinkedHashMap<>();
        for (AgentTrace t : traces) {
            bump(byRule, ruleOf(t.getOutput()));
        }

        List<Map<String, Object>> samples = new ArrayList<>();
        for (AgentTrace t : traces) {
            if (samples.size() >= MAX_SAMPLES) break;
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("sessionId", t.getSessionId());
            s.put("rule", ruleOf(t.getOutput()));
            s.put("reason", t.getOutput());
            s.put("sentence", clip(t.getInput(), MAX_SAMPLE_CHARS));
            s.put("latencyMs", t.getLatencyMs());
            samples.add(s);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", traces.size());
        out.put("byRule", rank(byRule));
        out.put("samples", samples);
        return out;
    }

    /** 取失败原因开头的规则号，未标注返回「未标注」 */
    private String ruleOf(String output) {
        if (output == null || output.isBlank()) return "未标注";
        Matcher m = RULE_HEAD.matcher(output);
        return m.find() ? m.group(1).toUpperCase() : "未标注";
    }

    private void bump(Map<String, Integer> counts, String key) {
        counts.merge(key, 1, Integer::sum);
    }

    /** 计数降序，最多 MAX_PATTERNS 条 */
    private List<Map<String, Object>> rank(Map<String, Integer> counts) {
        List<Map.Entry<String, Integer>> entries = new ArrayList<>(counts.entrySet());
        entries.sort((a, b) -> b.getValue() - a.getValue());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < entries.size() && i < MAX_PATTERNS; i++) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", entries.get(i).getKey());
            row.put("count", entries.get(i).getValue());
            rows.add(row);
        }
        return rows;
    }

    private String blankTo(String s, String fallback) {
        return s == null || s.isBlank() ? fallback : s;
    }

    private String clip(String s, int max) {
        if (s == null) return null;
        String oneLine = s.replace("\r", " ").replace("\n", " ").trim();
        return oneLine.length() <= max ? oneLine : oneLine.substring(0, max) + "…";
    }
}
