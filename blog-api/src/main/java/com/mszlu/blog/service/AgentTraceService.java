package com.mszlu.blog.service;

import com.mszlu.blog.dao.mapper.AgentTraceMapper;
import com.mszlu.blog.dao.pojo.AgentTrace;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Agent 决策追踪：任何AI编排链路上的关键决策都记一笔。
 * 追踪永远不能影响主流程——所有异常静默吞掉，单条超长内容截断。
 */
@Service
@Slf4j
public class AgentTraceService {

    private static final int MAX_FIELD = 500;

    @Autowired
    private AgentTraceMapper agentTraceMapper;

    public void record(String scene, String sessionId, String userId,
                       String event, String input, String output, long latencyMs) {
        try {
            AgentTrace t = new AgentTrace();
            t.setUserId(userId);
            t.setScene(scene);
            t.setSessionId(sessionId);
            t.setEvent(event);
            t.setInput(truncate(input));
            t.setOutput(truncate(output));
            t.setLatencyMs(latencyMs);
            t.setCreateDate(System.currentTimeMillis());
            agentTraceMapper.insert(t);
        } catch (Exception e) {
            log.debug("agent trace 写入失败（忽略）: {}", e.getMessage());
        }
    }

    private String truncate(String s) {
        if (s == null) return null;
        return s.length() <= MAX_FIELD ? s : s.substring(0, MAX_FIELD);
    }
}
