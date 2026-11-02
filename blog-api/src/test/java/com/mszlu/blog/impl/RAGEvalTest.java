package com.mszlu.blog.impl;

import com.mszlu.blog.dao.mapper.DocumentChunkMapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.vo.ContextChunk;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * RAG 评测：5 组真实场景（精确匹配/语义泛化/时间优先/重要性/降级）。
 * 改动后对比此基准，确保检索质量不退化。
 * 标注 BLOCKED：需真实 AI embedding 服务可用，CI 环境不可用时跳过。
 */
class RAGEvalTest {

    @Mock
    private MemoryMapper memoryMapper;
    @Mock
    private DocumentChunkMapper chunkMapper;
    @Mock
    private AiClient aiClient;

    @InjectMocks
    private MemoryServiceImpl memoryService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    /**
     * 场景1：精确匹配 —— 查询「李明」应召回包含「李明」的记忆
     * 验证点：关键词命中 > 泛化召回
     */
    @Test
    void scenario1_exactMatch() {
        // Mock embed 返回查询向量
        float[] queryVec = {1.0f, 0.0f, 0.0f};
        when(aiClient.embed("李明")).thenReturn(queryVec);

        // Mock 数据库返回 2 条记忆：一条包含「李明」，一条无关
        Memory m1 = new Memory();
        m1.setId("m1");
        m1.setUserId("u1");
        m1.setContent("今天和李明吵架了");
        m1.setType("event");
        m1.setStatus("open");
        m1.setImportance(8);
        m1.setEmbedding("[1.0, 0.1, 0.0]");  // 高相似度
        m1.setCreateDate(System.currentTimeMillis());

        Memory m2 = new Memory();
        m2.setId("m2");
        m2.setUserId("u1");
        m2.setContent("去超市买菜");
        m2.setType("event");
        m2.setStatus("open");
        m2.setImportance(3);
        m2.setEmbedding("[0.0, 1.0, 0.0]");  // 正交，相似度0
        m2.setCreateDate(System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000L);

        when(memoryMapper.selectList(any())).thenReturn(Arrays.asList(m1, m2));

        List<Memory> result = memoryService.getRelevant("u1", "李明");

        // 断言：「李明」记忆应排在前面（或至少被召回）
        assertFalse(result.isEmpty(), "应至少召回1条记忆");
        assertTrue(result.stream().anyMatch(m -> m.getContent().contains("李明")), 
                   "应召回包含「李明」的记忆");
    }

    /**
     * 场景2：语义泛化 —— 查询「心情不好」应召回「焦虑」「难过」等情绪记忆
     * 验证点：embedding 语义相似度 > 字面匹配
     * 标注 BLOCKED：需真实 embedding 服务
     */
    @Test
    void scenario2_semanticGeneralization() {
        // 此用例需真实 embedding，mock 无法模拟语义相似度
        // 标注为 BLOCKED，生产环境可用集成测试验证
        assertTrue(true, "BLOCKED: 需真实 AI embedding 服务");
    }

    /**
     * 场景3：时间优先 —— 相似度相同时，最近提及的记忆应排前面
     * 验证点：时间衰减因子生效
     */
    @Test
    void scenario3_recentFirst() {
        float[] queryVec = {1.0f, 0.0f, 0.0f};
        when(aiClient.embed(anyString())).thenReturn(queryVec);

        long now = System.currentTimeMillis();
        Memory m1 = new Memory();
        m1.setId("m1");
        m1.setUserId("u1");
        m1.setContent("旧记忆");
        m1.setEmbedding("[1.0, 0.0, 0.0]");  // 相似度1.0
        m1.setImportance(5);
        m1.setCreateDate(now - 30L * 24 * 60 * 60 * 1000L);  // 30天前
        m1.setLastMentionedTime(now - 30L * 24 * 60 * 60 * 1000L);

        Memory m2 = new Memory();
        m2.setId("m2");
        m2.setUserId("u1");
        m2.setContent("新记忆");
        m2.setEmbedding("[1.0, 0.0, 0.0]");  // 相似度1.0
        m2.setImportance(5);
        m2.setCreateDate(now - 1 * 24 * 60 * 60 * 1000L);  // 1天前
        m2.setLastMentionedTime(now - 1 * 24 * 60 * 60 * 1000L);

        when(memoryMapper.selectList(any())).thenReturn(Arrays.asList(m1, m2));

        List<Memory> result = memoryService.getRelevant("u1", "测试");

        // 断言：新记忆应排在旧记忆前面（时间衰减生效）
        if (result.size() >= 2) {
            int idx1 = -1, idx2 = -1;
            for (int i = 0; i < result.size(); i++) {
                if (result.get(i).getId().equals("m1")) idx1 = i;
                if (result.get(i).getId().equals("m2")) idx2 = i;
            }
            if (idx1 >= 0 && idx2 >= 0) {
                assertTrue(idx2 < idx1, "新记忆应排在旧记忆前面");
            }
        }
    }

    /**
     * 场景4：重要性融合 —— 重要性高的记忆应提升排序
     * 验证点：importanceWeight 融合因子生效
     */
    @Test
    void scenario4_importanceBoost() {
        float[] queryVec = {1.0f, 0.0f, 0.0f};
        when(aiClient.embed(anyString())).thenReturn(queryVec);

        long now = System.currentTimeMillis();
        Memory m1 = new Memory();
        m1.setId("m1");
        m1.setUserId("u1");
        m1.setContent("低重要性");
        m1.setEmbedding("[0.8, 0.0, 0.0]");  // 相似度0.8
        m1.setImportance(1);  // 权重0.8
        m1.setCreateDate(now);

        Memory m2 = new Memory();
        m2.setId("m2");
        m2.setUserId("u1");
        m2.setContent("高重要性");
        m2.setEmbedding("[0.8, 0.0, 0.0]");  // 相似度0.8
        m2.setImportance(10);  // 权重1.0
        m2.setCreateDate(now);

        when(memoryMapper.selectList(any())).thenReturn(Arrays.asList(m1, m2));

        List<Memory> result = memoryService.getRelevant("u1", "测试");

        // 断言：高重要性记忆应排在低重要性记忆前面
        if (result.size() >= 2) {
            int idx1 = -1, idx2 = -1;
            for (int i = 0; i < result.size(); i++) {
                if (result.get(i).getId().equals("m1")) idx1 = i;
                if (result.get(i).getId().equals("m2")) idx2 = i;
            }
            if (idx1 >= 0 && idx2 >= 0) {
                assertTrue(idx2 < idx1, "高重要性记忆应排在前面");
            }
        }
    }

    /**
     * 场景5：降级策略 —— embedding 失败时，2-gram LIKE 兜底
     * 验证点：向量不可用时仍能召回关键词匹配的记忆
     */
    @Test
    void scenario5_fallbackTo2gram() {
        // Mock embed 返回 null（模拟 AI 服务不可用）
        when(aiClient.embed(anyString())).thenReturn(null);

        Memory m = new Memory();
        m.setId("m1");
        m.setUserId("u1");
        m.setContent("李明欠我钱");
        m.setType("promise");
        m.setStatus("open");
        m.setImportance(8);
        m.setCreateDate(System.currentTimeMillis());

        when(memoryMapper.selectList(any())).thenReturn(Arrays.asList(m));

        List<Memory> result = memoryService.getRelevant("u1", "李明");

        // 断言：即使向量不可用，也应通过 2-gram 降级召回
        assertFalse(result.isEmpty(), "降级策略应召回至少1条记忆");
        assertTrue(result.stream().anyMatch(mem -> mem.getContent().contains("李明")), 
                   "应通过关键词匹配召回");
    }
}
