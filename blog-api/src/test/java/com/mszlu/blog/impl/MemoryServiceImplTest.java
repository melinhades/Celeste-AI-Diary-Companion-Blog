package com.mszlu.blog.impl;

import com.mszlu.blog.dao.mapper.DocumentChunkMapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.service.ai.AiClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * MemoryServiceImpl 核心算法单测：向量解析、余弦相似度、时间衰减、重要性融合。
 * 不依赖数据库和真实 AI 服务，用 mock 隔离外部依赖。
 */
class MemoryServiceImplTest {

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

    @Test
    void testCosine_normalVectors() {
        float[] a = {1.0f, 0.0f, 0.0f};
        float[] b = {1.0f, 0.0f, 0.0f};
        double result = invokeCosine(a, b);
        assertEquals(1.0, result, 0.001, "相同向量余弦应为1");
    }

    @Test
    void testCosine_orthogonalVectors() {
        float[] a = {1.0f, 0.0f, 0.0f};
        float[] b = {0.0f, 1.0f, 0.0f};
        double result = invokeCosine(a, b);
        assertEquals(0.0, result, 0.001, "正交向量余弦应为0");
    }

    @Test
    void testCosine_nullOrEmptyVectors() {
        float[] a = {1.0f, 0.0f};
        assertEquals(0.0, invokeCosine(null, a), 0.001, "null向量余弦应为0");
        assertEquals(0.0, invokeCosine(a, null), 0.001, "null向量余弦应为0");
        assertEquals(0.0, invokeCosine(new float[]{}, a), 0.001, "长度不匹配余弦应为0");
    }

    @Test
    void testTimeDecay_recentTimestamp() {
        long now = System.currentTimeMillis();
        long oneDayAgo = now - 24 * 60 * 60 * 1000L;
        double decay = invokeTimeDecay(oneDayAgo);
        assertTrue(decay > 0.95 && decay <= 1.0, "1天前的记忆衰减应接近1");
    }

    @Test
    void testTimeDecay_oldTimestamp() {
        long now = System.currentTimeMillis();
        long thirtyDaysAgo = now - 30L * 24 * 60 * 60 * 1000L;
        double decay = invokeTimeDecay(thirtyDaysAgo);
        assertTrue(decay > 0.3 && decay < 0.4, "30天前的记忆衰减应约0.368（exp(-1)）");
    }

    @Test
    void testTimeDecay_nullTimestamp() {
        double decay = invokeTimeDecay(null);
        assertEquals(1.0, decay, 0.001, "null时间戳衰减应为1");
    }

    @Test
    void testImportanceWeight_minMax() {
        assertEquals(0.8, invokeImportanceWeight(1), 0.001, "重要性1权重应为0.8");
        assertEquals(1.0, invokeImportanceWeight(10), 0.001, "重要性10权重应为1.0");
        assertEquals(1.0, invokeImportanceWeight(null), 0.001, "null重要性权重应为1.0");
    }

    @Test
    void testImportanceWeight_middle() {
        double w5 = invokeImportanceWeight(5);
        assertTrue(w5 > 0.8 && w5 < 1.0, "重要性5权重应在0.8-1.0之间");
    }

    @Test
    void testParseVec_validJson() {
        String json = "[0.1, 0.2, 0.3]";
        float[] result = invokeParseVec(json);
        assertNotNull(result, "有效JSON应解析成功");
        assertEquals(3, result.length, "向量维度应为3");
        assertEquals(0.1f, result[0], 0.001f);
        assertEquals(0.2f, result[1], 0.001f);
    }

    @Test
    void testParseVec_invalidJson() {
        assertNull(invokeParseVec(null), "null应返回null");
        assertNull(invokeParseVec("not-json"), "非法JSON应返回null");
        assertNull(invokeParseVec("{}"), "非数组JSON应返回null");
    }

    // ===== 反射调用 private 方法用于测试 =====
    private double invokeCosine(float[] a, float[] b) {
        try {
            var method = MemoryServiceImpl.class.getDeclaredMethod("cosine", float[].class, float[].class);
            method.setAccessible(true);
            return (double) method.invoke(memoryService, a, b);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private double invokeTimeDecay(Long timestampMs) {
        try {
            var method = MemoryServiceImpl.class.getDeclaredMethod("timeDecay", Long.class);
            method.setAccessible(true);
            return (double) method.invoke(memoryService, timestampMs);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private double invokeImportanceWeight(Integer importance) {
        try {
            var method = MemoryServiceImpl.class.getDeclaredMethod("importanceWeight", Integer.class);
            method.setAccessible(true);
            return (double) method.invoke(memoryService, importance);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private float[] invokeParseVec(String json) {
        try {
            var method = MemoryServiceImpl.class.getDeclaredMethod("parseVec", String.class);
            method.setAccessible(true);
            return (float[]) method.invoke(memoryService, json);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
