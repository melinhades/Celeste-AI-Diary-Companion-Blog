package com.mszlu.blog.service.ai;

import com.alibaba.fastjson.JSON;
import com.mszlu.blog.dao.mapper.AiTraceMapper;
import com.mszlu.blog.dao.mapper.AiTraceStepMapper;
import com.mszlu.blog.dao.pojo.AiTrace;
import com.mszlu.blog.dao.pojo.AiTraceStep;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.utils.UserThreadLocal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * AI 调用流程追踪器（只写）。
 * <p>
 * blog-api 在每次 RAG 检索 / 向量检索 / LLM 调用 / 评分时写入 ms_ai_trace + ms_ai_trace_step，
 * 管理后台只读展示。这里不提供任何对外查询接口，普通用户无法读取。
 * <p>
 * 所有写入都做失败隔离：追踪异常绝不影响业务 AI 流程。
 */
@Component
@Slf4j
public class AiTraceRecorder {

    public static final String RUNNING = "RUNNING";
    public static final String OK = "OK";
    public static final String FAIL = "FAIL";

    private static final int MAX_TEXT = 8000;
    private static final int MAX_ERROR = 1000;
    private static final ThreadLocal<TraceState> CURRENT = new ThreadLocal<>();

    @Autowired
    private AiTraceMapper traceMapper;

    @Autowired
    private AiTraceStepMapper stepMapper;

    /** 显式开启一个业务链路；已有链路时返回 false（嵌套步骤自动并入外层） */
    public boolean begin(String scene, String userId, String title) {
        if (CURRENT.get() != null) {
            return false;
        }
        try {
            TraceState state = new TraceState();
            state.traceId = UUID.randomUUID().toString();
            state.scene = scene == null ? "ai_call" : scene;
            state.userId = userId;
            state.title = title;
            state.startMs = System.currentTimeMillis();

            AiTrace trace = new AiTrace();
            trace.setId(state.traceId);
            trace.setScene(state.scene);
            trace.setUserId(state.userId);
            trace.setTitle(truncate(title, 240));
            trace.setStatus(RUNNING);
            trace.setStartTime(state.startMs);
            trace.setStepCount(0);
            trace.setCreateDate(state.startMs);
            traceMapper.insert(trace);
            CURRENT.set(state);
            return true;
        } catch (Exception e) {
            log.warn("AI 追踪开启失败 scene={}: {}", scene, e.getMessage());
            CURRENT.remove();
            return false;
        }
    }

    public void end(boolean success, Throwable error) {
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        CURRENT.remove();
        try {
            long now = System.currentTimeMillis();
            for (AiTraceStep step : state.steps) {
                step.setTraceId(state.traceId);
                stepMapper.insert(step);
            }
            AiTrace trace = new AiTrace();
            trace.setId(state.traceId);
            trace.setStatus(success ? OK : FAIL);
            trace.setDurationMs((int) Math.min(Integer.MAX_VALUE, now - state.startMs));
            trace.setStepCount(state.steps.size());
            trace.setModel(truncate(state.model, 90));
            trace.setPromptTokens(state.promptTokens);
            trace.setCompletionTokens(state.completionTokens);
            trace.setScore(state.score);
            trace.setError(truncate(error == null ? null : String.valueOf(error.getMessage()), MAX_ERROR));
            traceMapper.updateById(trace);
        } catch (Exception e) {
            log.warn("AI 追踪落库失败 traceId={}: {}", state.traceId, e.getMessage());
        }
    }

    public boolean active() {
        return CURRENT.get() != null;
    }

    /** 当前用户（异步线程里 ThreadLocal 可能为空，交由调用方显式传 userId） */
    public String currentUserId() {
        try {
            SysUser user = UserThreadLocal.get();
            return user == null || user.getId() == null ? null : String.valueOf(user.getId());
        } catch (Exception e) {
            return null;
        }
    }

    // ==================== 具体步骤 ====================

    /** 记录一次 LLM 调用；没有外层链路时自动生成单步链路 */
    public void llm(List<AiMessage> messages, String output, String model,
                    long startedAt, Throwable error, Integer promptTokens, Integer completionTokens) {
        boolean owner = ensureTrace("llm_call");
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        try {
            AiMessage last = messages == null || messages.isEmpty() ? null : messages.get(messages.size() - 1);
            String input = summarizeMessages(messages);
            addStep(state, "llm", error == null ? "LLM 生成" : "LLM 调用失败",
                    input, truncate(output, MAX_TEXT), model, null,
                    System.currentTimeMillis() - startedAt, error == null ? OK : FAIL, error, null);
            if (model != null) {
                state.model = model;
            }
            if (promptTokens != null) {
                state.promptTokens = promptTokens;
            }
            if (completionTokens != null) {
                state.completionTokens = completionTokens;
            }
            if (last != null && state.title == null) {
                state.title = truncate(last.getContent(), 120);
            }
        } catch (Exception e) {
            log.debug("AI 追踪 LLM 步骤失败: {}", e.getMessage());
        } finally {
            if (owner) {
                end(error == null, error);
            }
        }
    }

    /** 记录一次 embedding 调用 */
    public void embed(String input, Integer dimension, long startedAt, Throwable error) {
        boolean owner = ensureTrace("embedding");
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        try {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("dimension", dimension);
            addStep(state, "embed", error == null ? "文本向量化" : "向量化失败",
                    truncate(input, 2000), dimension == null ? null : ("向量维度 " + dimension),
                    null, null, System.currentTimeMillis() - startedAt,
                    error == null ? OK : FAIL, error, meta);
        } catch (Exception e) {
            log.debug("AI 追踪 embed 步骤失败: {}", e.getMessage());
        } finally {
            if (owner) {
                end(error == null, error);
            }
        }
    }

    /**
     * 记录一次向量检索
     *
     * @param hits 命中的片段：source / score / content（按分数倒序）
     */
    public void retrieval(String name, String query, int limit,
                          List<Map<String, Object>> hits, long startedAt, Object meta) {
        boolean owner = ensureTrace("retrieval");
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        try {
            List<Map<String, Object>> safeHits = hits == null ? new ArrayList<>() : hits;
            StringBuilder out = new StringBuilder();
            out.append("命中 ").append(safeHits.size()).append(" 条（limit ").append(limit).append("）\n");
            for (Map<String, Object> hit : safeHits) {
                out.append("- [").append(hit.get("source")).append("] ")
                        .append(hit.get("score")).append("  ")
                        .append(truncate(String.valueOf(hit.get("content")), 160)).append('\n');
            }
            Map<String, Object> stepMeta = new LinkedHashMap<>();
            stepMeta.put("limit", limit);
            stepMeta.put("hitCount", safeHits.size());
            if (meta != null) {
                stepMeta.put("detail", meta);
            }
            double maxScore = safeHits.stream()
                    .mapToDouble(h -> h.get("score") instanceof Number ? ((Number) h.get("score")).doubleValue() : 0)
                    .max().orElse(0);
            addStep(state, "retrieval", name, truncate(query, 1500), truncate(out.toString(), MAX_TEXT),
                    null, safeHits.isEmpty() ? null : maxScore,
                    System.currentTimeMillis() - startedAt, OK, null, stepMeta);
        } catch (Exception e) {
            log.debug("AI 追踪 retrieval 步骤失败: {}", e.getMessage());
        } finally {
            if (owner) {
                end(true, null);
            }
        }
    }

    /** 记录一个评分点（LLM 情绪分、检索最高分等） */
    public void score(String name, Double value, Object meta) {
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        try {
            addStep(state, "score", name, null, value == null ? null : String.valueOf(value),
                    null, value, 0, OK, null, meta);
            if (value != null) {
                state.score = value;
            }
        } catch (Exception e) {
            log.debug("AI 追踪 score 步骤失败: {}", e.getMessage());
        }
    }

    /** 记录 token 用量（由 AiClient 在解析响应时回填） */
    public void noteUsage(Integer promptTokens, Integer completionTokens) {
        TraceState state = CURRENT.get();
        if (state == null) {
            return;
        }
        if (promptTokens != null) {
            state.promptTokens = promptTokens;
        }
        if (completionTokens != null) {
            state.completionTokens = completionTokens;
        }
    }

    // ==================== 内部 ====================

    private boolean ensureTrace(String ignoredScene) {
        if (CURRENT.get() != null) {
            return false;
        }
        return begin(detectScene(), currentUserId(), null);
    }

    private void addStep(TraceState state, String type, String name, String input, String output,
                         String model, Double score, long durationMs, String status,
                         Throwable error, Object meta) {
        AiTraceStep step = new AiTraceStep();
        step.setSeq(++state.seq);
        step.setType(type);
        step.setName(truncate(name, 120));
        step.setStatus(status);
        step.setStartOffsetMs((int) Math.min(Integer.MAX_VALUE, System.currentTimeMillis() - state.startMs));
        step.setDurationMs((int) Math.min(Integer.MAX_VALUE, Math.max(0, durationMs)));
        step.setModel(truncate(model, 90));
        step.setScore(score);
        step.setInputText(input);
        step.setOutputText(output);
        step.setError(truncate(error == null ? null : String.valueOf(error.getMessage()), MAX_ERROR));
        if (meta != null) {
            try {
                step.setMeta(meta instanceof String ? (String) meta : JSON.toJSONString(meta));
            } catch (Exception ignore) {
                // meta 序列化失败不影响主流程
            }
        }
        state.steps.add(step);
    }

    /** 取第一个业务调用方作为场景名，避免所有兜底链路都叫 ai_call */
    private static String detectScene() {
        try {
            return StackWalker.getInstance().walk(stream -> stream
                    .filter(f -> !f.getClassName().startsWith("com.mszlu.blog.service.ai.AiTraceRecorder"))
                    .filter(f -> !f.getClassName().startsWith("com.mszlu.blog.service.ai.AiClient"))
                    .filter(f -> !f.getClassName().startsWith("java."))
                    .findFirst()
                    .map(f -> {
                        String cls = f.getClassName();
                        int idx = cls.lastIndexOf('.');
                        return (idx >= 0 ? cls.substring(idx + 1) : cls) + "." + f.getMethodName();
                    })
                    .orElse("ai_call"));
        } catch (Exception e) {
            return "ai_call";
        }
    }

    private static String summarizeMessages(List<AiMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (AiMessage m : messages) {
            sb.append('[').append(m.getRole()).append("] ")
                    .append(truncate(m.getContent(), 2000)).append("\n\n");
        }
        return truncate(sb.toString(), MAX_TEXT);
    }

    private static String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    private static class TraceState {
        String traceId;
        String scene;
        String userId;
        String title;
        long startMs;
        int seq;
        String model;
        Double score;
        Integer promptTokens;
        Integer completionTokens;
        final List<AiTraceStep> steps = new ArrayList<>();
    }
}
