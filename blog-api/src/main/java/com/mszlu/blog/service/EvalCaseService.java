package com.mszlu.blog.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.AgentTraceMapper;
import com.mszlu.blog.dao.mapper.DiaryChatLogMapper;
import com.mszlu.blog.dao.mapper.EvalCaseMapper;
import com.mszlu.blog.dao.pojo.AgentTrace;
import com.mszlu.blog.dao.pojo.DiaryChatLog;
import com.mszlu.blog.dao.pojo.EvalCase;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 自我迭代第二步：把线上失败固化成可复现的评测用例。
 * <p>
 * 两个来源：
 *   1. 👎 反馈 —— 入池后 status=pending，等人工补 expected（好回答长什么样）；
 *   2. persona_fail —— 自带违反的规则号，直接 status=ready。
 * 去重靠 (source, sourceId)，重复触发不会产生重复用例。
 */
@Service
@Slf4j
public class EvalCaseService {

    /** 单次入池上限，防止一次手工触发灌爆表 */
    private static final int MAX_PROMOTE = 200;
    /** 列表查询上限 */
    private static final int MAX_LIST = 200;

    private static final int MAX_INPUT = 1000;
    private static final int MAX_OUTPUT = 1000;
    private static final int MAX_EXPECTED = 500;

    /** 从「R4 空泛鸡汤」里取规则号 */
    private static final Pattern RULE_HEAD = Pattern.compile("^\\s*([A-Za-z]+\\d*)");

    @Autowired
    private DiaryChatLogMapper diaryChatLogMapper;

    @Autowired
    private AgentTraceMapper agentTraceMapper;

    @Autowired
    private EvalCaseMapper evalCaseMapper;

    /**
     * 把窗口内的差评与人格失败写入基准集。
     *
     * @param days 回看天数，收敛到 [1, 90]
     */
    public Map<String, Object> promote(int days) {
        int window = days <= 0 ? 7 : Math.min(days, 90);
        long since = System.currentTimeMillis() - window * 24L * 60 * 60 * 1000;

        Map<String, Object> feedback = promoteFeedback(window);
        Map<String, Object> personaFail = promotePersonaFail(since);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("windowDays", window);
        out.put("feedback", feedback);
        out.put("personaFail", personaFail);
        out.put("totalInserted", (int) feedback.get("inserted") + (int) personaFail.get("inserted"));
        return out;
    }

    /** 基准集列表：默认只给待人工标注的 */
    public List<EvalCase> list(String status, int limit) {
        int size = limit <= 0 ? 50 : Math.min(limit, MAX_LIST);
        LambdaQueryWrapper<EvalCase> qw = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            qw.eq(EvalCase::getStatus, status.trim());
        }
        qw.orderByDesc(EvalCase::getCreateDate)
                .last("limit " + size);
        return evalCaseMapper.selectList(qw);
    }

    private Map<String, Object> promoteFeedback(int window) {
        List<DiaryChatLog> logs;
        try {
            LambdaQueryWrapper<DiaryChatLog> qw = new LambdaQueryWrapper<>();
            qw.eq(DiaryChatLog::getUserFeedback, "👎")
                    .ge(DiaryChatLog::getCreatedAt, LocalDateTime.now().minusDays(window))
                    .orderByDesc(DiaryChatLog::getId)
                    .last("limit " + MAX_PROMOTE);
            logs = diaryChatLogMapper.selectList(qw);
        } catch (Exception e) {
            log.warn("差评样本入池查询失败: {}", e.getMessage());
            logs = Collections.emptyList();
        }

        List<String> ids = new ArrayList<>();
        for (DiaryChatLog l : logs) {
            if (l.getId() != null) ids.add(String.valueOf(l.getId()));
        }
        Set<String> exists = existingIds("feedback", ids);

        int inserted = 0;
        int skipped = 0;
        for (DiaryChatLog l : logs) {
            String sourceId = l.getId() == null ? null : String.valueOf(l.getId());
            if (sourceId == null || exists.contains(sourceId)) {
                skipped++;
                continue;
            }
            EvalCase c = new EvalCase();
            c.setSource("feedback");
            c.setSourceId(sourceId);
            c.setScene("chat");
            c.setSessionId(l.getSessionId());
            c.setUserId(l.getUserId());
            c.setCaseInput(clip(l.getUserDraft(), MAX_INPUT));
            c.setBadOutput(clip(l.getFilteredResponse(), MAX_OUTPUT));
            // 差评没有唯一正确答案，先标 pending；过滤原因只作线索，不当作 expected
            c.setExpected(clip(l.getFilterReason(), MAX_EXPECTED));
            c.setStatus("pending");
            c.setCreateDate(System.currentTimeMillis());
            if (save(c)) inserted++;
            else skipped++;
        }
        return counts(logs.size(), inserted, skipped);
    }

    private Map<String, Object> promotePersonaFail(long since) {
        List<AgentTrace> traces;
        try {
            LambdaQueryWrapper<AgentTrace> qw = new LambdaQueryWrapper<>();
            qw.eq(AgentTrace::getEvent, "persona_fail")
                    .ge(AgentTrace::getCreateDate, since)
                    .orderByDesc(AgentTrace::getCreateDate)
                    .last("limit " + MAX_PROMOTE);
            traces = agentTraceMapper.selectList(qw);
        } catch (Exception e) {
            log.warn("人格失败样本入池查询失败: {}", e.getMessage());
            traces = Collections.emptyList();
        }

        List<String> ids = new ArrayList<>();
        for (AgentTrace t : traces) {
            if (t.getId() != null && t.getInput() != null && !t.getInput().isBlank()) {
                ids.add(t.getId());
            }
        }
        Set<String> exists = existingIds("persona_fail", ids);

        int inserted = 0;
        int skipped = 0;
        for (AgentTrace t : traces) {
            String rule = ruleOf(t.getOutput());
            if (t.getId() == null || t.getInput() == null || t.getInput().isBlank()
                    || "未标注".equals(rule) || exists.contains(t.getId())) {
                skipped++;
                continue;
            }
            EvalCase c = new EvalCase();
            c.setSource("persona_fail");
            c.setSourceId(t.getId());
            c.setScene(t.getScene());
            c.setSessionId(t.getSessionId());
            c.setUserId(t.getUserId());
            // 触发违规的句子就是待评测输入；期望结果是「命中该规则」
            c.setCaseInput(clip(t.getInput(), MAX_INPUT));
            c.setExpected(clip(rule, MAX_EXPECTED));
            c.setStatus("ready");
            c.setCreateDate(System.currentTimeMillis());
            if (save(c)) inserted++;
            else skipped++;
        }
        return counts(traces.size(), inserted, skipped);
    }

    /** 已入池的来源 ID，用于批量去重 */
    private Set<String> existingIds(String source, List<String> ids) {
        if (ids.isEmpty()) return Collections.emptySet();
        try {
            List<EvalCase> rows = evalCaseMapper.selectList(new LambdaQueryWrapper<EvalCase>()
                    .select(EvalCase::getSourceId)
                    .eq(EvalCase::getSource, source)
                    .in(EvalCase::getSourceId, ids));
            Set<String> out = new HashSet<>();
            for (EvalCase c : rows) out.add(c.getSourceId());
            return out;
        } catch (Exception e) {
            log.warn("基准集去重查询失败，按全部未入池处理: {}", e.getMessage());
            return Collections.emptySet();
        }
    }

    private boolean save(EvalCase c) {
        try {
            evalCaseMapper.insert(c);
            return true;
        } catch (Exception e) {
            // 唯一键冲突（并发重复入池）不算错误
            log.debug("基准用例入库失败（忽略）source={}, sourceId={}: {}",
                    c.getSource(), c.getSourceId(), e.getMessage());
            return false;
        }
    }

    private Map<String, Object> counts(int scanned, int inserted, int skipped) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scanned", scanned);
        m.put("inserted", inserted);
        m.put("skipped", skipped);
        return m;
    }

    private String ruleOf(String output) {
        if (output == null || output.isBlank()) return "未标注";
        Matcher m = RULE_HEAD.matcher(output);
        return m.find() ? m.group(1).toUpperCase() : "未标注";
    }

    private String clip(String s, int max) {
        if (s == null) return null;
        String oneLine = s.replace("\r", " ").replace("\n", " ").trim();
        return oneLine.length() <= max ? oneLine : oneLine.substring(0, max);
    }
}
