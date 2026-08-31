package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.mapper.DocumentChunkMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.DocumentChunk;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.ContextChunk;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.AbstractMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class MemoryServiceImpl implements MemoryService {

    /** 拼进 prompt 的记忆上限，防止 token 膨胀 */
    private static final int MAX_CONTEXT_MEMORIES = 15;

    @Autowired
    private MemoryMapper memoryMapper;
    @Autowired
    private DocumentChunkMapper chunkMapper;
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

        // 2. RAG：当前消息向量化，与记忆向量算余弦相似度取 Top 8
        boolean vectorHit = false;
        if (userContent != null && !userContent.isEmpty()) {
            float[] queryVec = aiClient.embed(userContent);
            if (queryVec != null) {
                LambdaQueryWrapper<Memory> pool = new LambdaQueryWrapper<>();
                pool.eq(Memory::getUserId, userId);
                pool.isNotNull(Memory::getEmbedding);
                pool.last("limit 200");
                List<Map.Entry<Memory, Double>> scored = new ArrayList<>();
                for (Memory m : memoryMapper.selectList(pool)) {
                    double sim = cosine(queryVec, parseVec(m.getEmbedding()));
                    if (sim > 0) scored.add(new AbstractMap.SimpleEntry<>(m, sim));
                }
                scored.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
                for (int i = 0; i < Math.min(8, scored.size()); i++) {
                    picked.putIfAbsent(scored.get(i).getKey().getId(), scored.get(i).getKey());
                    vectorHit = true;
                }
            }
        }

        // 3. 向量不可用时的降级：保留原 2-gram 关键词 LIKE
        if (!vectorHit && userContent != null) {
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

        // 4. 兜底：importance 最高的几条，保证 AI 至少"记得点什么"
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

    private double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na == 0 || nb == 0) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    private float[] parseVec(String json) {
        try {
            JSONArray arr = JSON.parseArray(json);
            float[] out = new float[arr.size()];
            for (int i = 0; i < arr.size(); i++) out[i] = arr.getFloatValue(i);
            return out;
        } catch (Exception e) {
            return null;
        }
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
                // 顺手向量化（失败不影响记忆入库，下次 reindex 可补）
                float[] vec = aiClient.embed(memory.getContent());
                if (vec != null) memory.setEmbedding(JSON.toJSONString(vec));
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

    @Override
    public Result reindex() {
        SysUser user = UserThreadLocal.get();
        LambdaQueryWrapper<Memory> qw = new LambdaQueryWrapper<>();
        qw.eq(Memory::getUserId, user.getId());
        qw.isNull(Memory::getEmbedding);
        int done = 0;
        for (Memory m : memoryMapper.selectList(qw)) {
            float[] vec = aiClient.embed(m.getContent());
            if (vec != null) {
                Memory upd = new Memory();
                upd.setEmbedding(JSON.toJSONString(vec));
                LambdaQueryWrapper<Memory> uw = new LambdaQueryWrapper<>();
                uw.eq(Memory::getId, m.getId());
                memoryMapper.update(upd, uw);
                done++;
            }
        }
        return Result.success(done);
    }

    // ================= 日记分片：保存日记后建"日记知识库" =================
    private static final Pattern SENTENCE = Pattern.compile("[^。！？!?\\n]+[。！？!?\\n]?");
    private static final int CHUNK_MAX = 110;
    private static final int CHUNKS_PER_DIARY = 8;

    @Override
    @Async("taskExecutor")
    public void chunkDiary(String userId, String diaryId, String title, String content) {
        try {
            if (content == null || content.trim().length() < 20) return;

            // 覆盖旧分片（同一篇日记编辑重存时）
            LambdaQueryWrapper<DocumentChunk> del = new LambdaQueryWrapper<>();
            del.eq(DocumentChunk::getUserId, userId).eq(DocumentChunk::getRefId, diaryId);
            chunkMapper.delete(del);

            for (String piece : splitChunks(content)) {
                float[] vec = aiClient.embed((title != null ? title + "：" : "") + piece);
                if (vec == null) continue;
                DocumentChunk c = new DocumentChunk();
                c.setUserId(userId);
                c.setSource("diary");
                c.setRefId(diaryId);
                c.setTitle(title);
                c.setContent(piece);
                c.setEmbedding(JSON.toJSONString(vec));
                c.setCreateDate(System.currentTimeMillis());
                chunkMapper.insert(c);
            }
        } catch (Exception e) {
            log.error("日记分片失败, diaryId={}", diaryId, e);
        }
    }

    /** 按句子切分，贪心攒成 60~110 字的片，片头保留上一片末句做上下文衔接 */
    private List<String> splitChunks(String text) {
        List<String> sentences = new ArrayList<>();
        Matcher m = SENTENCE.matcher(text);
        while (m.find()) {
            String s = m.group().trim();
            if (!s.isEmpty()) sentences.add(s);
        }
        List<String> chunks = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String s : sentences) {
            if (cur.length() > 0 && cur.length() + s.length() > CHUNK_MAX) {
                chunks.add(cur.toString());
                cur = new StringBuilder(s);
            } else {
                cur.append(s);
            }
            if (chunks.size() >= CHUNKS_PER_DIARY) return chunks;
        }
        if (cur.length() > 0 && chunks.size() < CHUNKS_PER_DIARY) chunks.add(cur.toString());
        return chunks;
    }

    // ================= RAG 统一检索工具 =================
    @Override
    public List<ContextChunk> searchContext(String userId, String query, int limit) {
        float[] qv = aiClient.embed(query);
        if (qv == null) return new ArrayList<>();

        List<Map.Entry<ContextChunk, Double>> scored = new ArrayList<>();

        // 源1：记忆
        LambdaQueryWrapper<Memory> mp = new LambdaQueryWrapper<>();
        mp.eq(Memory::getUserId, userId).isNotNull(Memory::getEmbedding).last("limit 200");
        for (Memory mem : memoryMapper.selectList(mp)) {
            double sim = cosine(qv, parseVec(mem.getEmbedding()));
            if (sim > 0.3) {
                scored.add(new AbstractMap.SimpleEntry<>(
                        new ContextChunk("memory", mem.getContent(),
                                org.apache.commons.lang3.time.DateFormatUtils.format(mem.getCreateDate(), "M月d日记下的事"), sim), sim));
            }
        }

        // 源2：日记分片
        LambdaQueryWrapper<DocumentChunk> cp = new LambdaQueryWrapper<>();
        cp.eq(DocumentChunk::getUserId, userId).isNotNull(DocumentChunk::getEmbedding).last("limit 300");
        for (DocumentChunk c : chunkMapper.selectList(cp)) {
            double sim = cosine(qv, parseVec(c.getEmbedding()));
            if (sim > 0.3) {
                scored.add(new AbstractMap.SimpleEntry<>(
                        new ContextChunk("diary", c.getContent(),
                                (c.getTitle() != null ? "《" + c.getTitle() + "》" : "日记") + "里写过", sim), sim));
            }
        }

        scored.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
        List<ContextChunk> out = new ArrayList<>();
        for (int i = 0; i < Math.min(limit, scored.size()); i++) out.add(scored.get(i).getKey());
        return out;
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
