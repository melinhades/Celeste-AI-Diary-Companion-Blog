package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
public class MemoryServiceImpl implements MemoryService {

    /** 拼进 prompt 的记忆上限，防止 token 膨胀 */
    private static final int MAX_CONTEXT_MEMORIES = 15;

    @Autowired
    private MemoryMapper memoryMapper;
    @Autowired
    private AiClient aiClient;

    @Override
    public List<Memory> getRelevant(String userId, String userContent) {
        // 用 LinkedHashMap 按插入顺序去重（key = memory id）
        Map<String, Memory> picked = new LinkedHashMap<>();

        // 1. open 的 promise/event 全取 —— 未完结的事，是"翻旧账"的素材
        LambdaQueryWrapper<Memory> openWrapper = new LambdaQueryWrapper<>();
        openWrapper.eq(Memory::getUserId, userId);
        openWrapper.eq(Memory::getStatus, "open");
        openWrapper.in(Memory::getType, Arrays.asList("promise", "event"));
        openWrapper.orderByDesc(Memory::getImportance);
        openWrapper.last("limit 10");
        for (Memory m : memoryMapper.selectList(openWrapper)) {
            picked.put(m.getId(), m);
        }

        // 2. 关键词匹配：消息里长度>=2 的词去 LIKE memory.content
        //    中文没有天然分词，这里做最简的 2-gram 粗匹配，聊胜于无；
        //    后续上向量库（pgvector/Qdrant）后整个换掉这步
        if (userContent != null) {
            for (String keyword : extractKeywords(userContent)) {
                LambdaQueryWrapper<Memory> kw = new LambdaQueryWrapper<>();
                kw.eq(Memory::getUserId, userId);
                kw.like(Memory::getContent, keyword);
                kw.last("limit 3");
                for (Memory m : memoryMapper.selectList(kw)) {
                    picked.putIfAbsent(m.getId(), m);
                }
            }
        }

        // 3. 兜底：importance 最高的几条，保证 AI 至少"记得点什么"
        if (picked.size() < 5) {
            LambdaQueryWrapper<Memory> top = new LambdaQueryWrapper<>();
            top.eq(Memory::getUserId, userId);
            top.eq(Memory::getStatus, "open");
            top.orderByDesc(Memory::getImportance);
            top.last("limit 5");
            for (Memory m : memoryMapper.selectList(top)) {
                picked.putIfAbsent(m.getId(), m);
            }
        }

        List<Memory> result = new ArrayList<>(picked.values());
        return result.size() > MAX_CONTEXT_MEMORIES
                ? result.subList(0, MAX_CONTEXT_MEMORIES) : result;
    }

    @Override
    @Async("taskExecutor")
    public void extractAsync(String userId, String userContent, String aiReply) {
        try {
            String prompt = PromptBuilder.memoryExtract(userContent, aiReply);
            String json = aiClient.chat(
                    Arrays.asList(new AiMessage("user", prompt)), true);
            if (json == null) {
                return;
            }
            JSONArray memories = JSON.parseObject(json).getJSONArray("memories");
            if (memories == null) {
                return;
            }
            for (int i = 0; i < memories.size(); i++) {
                JSONObject item = memories.getJSONObject(i);
                Memory memory = new Memory();
                memory.setUserId(userId);
                memory.setContent(item.getString("content"));
                memory.setType(item.getString("type"));
                memory.setStatus("open");
                memory.setImportance(item.getIntValue("importance"));
                memory.setCreateDate(System.currentTimeMillis());
                memoryMapper.insert(memory);
            }
        } catch (Exception e) {
            // 记忆提取失败只记日志，绝不影响主流程
            log.error("记忆提取失败, userId={}", userId, e);
        }
    }

    @Override
    public void markMentioned(List<Memory> memories) {
        long now = System.currentTimeMillis();
        for (Memory m : memories) {
            Memory update = new Memory();
            update.setLastMentionedTime(now);
            LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Memory::getId, m.getId());
            memoryMapper.update(update, wrapper);
        }
    }

    @Override
    public Result listOpen() {
        SysUser user = UserThreadLocal.get();
        LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Memory::getUserId, user.getId());
        wrapper.eq(Memory::getStatus, "open");
        wrapper.orderByDesc(Memory::getImportance);
        return Result.success(memoryMapper.selectList(wrapper));
    }

    @Override
    public Result resolve(String memoryId) {
        SysUser user = UserThreadLocal.get();
        Memory update = new Memory();
        update.setStatus("resolved");
        LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Memory::getId, memoryId);
        wrapper.eq(Memory::getUserId, user.getId()); // 防越权
        memoryMapper.update(update, wrapper);
        return Result.success(null);
    }

    /** 最简 2-gram 关键词提取：连续中文/英文段切成长度 2 的片 */
    private List<String> extractKeywords(String content) {
        List<String> keywords = new ArrayList<>();
        String cleaned = content.replaceAll("[\\p{P}\\s]", "");
        for (int i = 0; i + 2 <= cleaned.length() && keywords.size() < 5; i += 2) {
            keywords.add(cleaned.substring(i, i + 2));
        }
        return keywords;
    }
}
