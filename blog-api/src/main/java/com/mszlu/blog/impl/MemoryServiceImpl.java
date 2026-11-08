package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.DocumentChunk;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.service.vector.VectorCollection;
import com.mszlu.blog.service.vector.VectorHit;
import com.mszlu.blog.service.vector.VectorQuery;
import com.mszlu.blog.service.vector.VectorRecord;
import com.mszlu.blog.service.vector.VectorStore;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.ContextChunk;
import com.mszlu.blog.vo.RagMetrics;
import com.mszlu.blog.vo.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.AbstractMap;
import java.util.Comparator;
import java.util.HashMap;
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

    // ================= P1/P2：向量检索抽象 + 重排参数 =================
    // 相似度阈值、时间衰减、召回上限与向量缓存均下沉到 VectorStore 实现
    @Value("${rag.quota.memory:0.4}")
    private double memoryQuota;
    
    @Value("${rag.quota.diary:0.4}")
    private double diaryQuota;
    
    @Value("${rag.quota.lore:0.2}")
    private double loreQuota;

    @Autowired
    private MemoryMapper memoryMapper;
    @Autowired
    private VectorStore vectorStore;
    @Autowired
    private AiClient aiClient;

    @Override
    public List<Memory> getRelevant(String userId, String userContent) {
        long startMs = System.currentTimeMillis();
        // 用 LinkedHashMap 按插入顺序去重（key = memory id）
        Map<String, Memory> picked = new LinkedHashMap<>();
        // 向量命中项的融合分：只用于最终排序/截断，非向量来源不参与打分
        Map<String, Double> vectorScores = new HashMap<>();

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

        // 2. RAG：当前消息向量化，交给 VectorStore 取 Top 8（内部含缓存 + 时间衰减 × 重要性融合）
        boolean vectorHit = false;
        if (userContent != null && !userContent.isEmpty()) {
            float[] queryVec = aiClient.embed(userContent, userId);
            if (queryVec != null) {
                List<VectorHit> hits = vectorStore.search(
                        VectorQuery.of(VectorCollection.MEMORY, userId, queryVec, 8));
                for (VectorHit hit : hits) {
                    picked.putIfAbsent(hit.getId(), hit.getMemory());
                    vectorScores.put(hit.getId(), hit.getScore());
                    vectorHit = true;
                }
            }
        }

        // 3. 向量 0 命中时的降级：按剩余槽位取关键词命中，只捞 open 记忆
        if (!vectorHit && userContent != null) {
            for (String keyword : extractKeywords(userContent)) {
                int remaining = MAX_CONTEXT_MEMORIES - picked.size();
                if (remaining <= 0) {
                    break;
                }
                LambdaQueryWrapper<Memory> kw = new LambdaQueryWrapper<>();
                kw.eq(Memory::getUserId, userId);
                kw.eq(Memory::getStatus, "open");
                kw.like(Memory::getContent, keyword);
                kw.last("limit " + Math.min(3, remaining));
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
        // 截断前先排序：向量命中按融合分倒序排在最前，其余来源保持插入顺序排在后面，
        // 这样 15 条上限砍掉的是尾部（最低分/无分）条目，而不是最后插入的条目
        result.sort((a, b) -> {
            Double sa = vectorScores.get(a.getId());
            Double sb = vectorScores.get(b.getId());
            if (sa == null && sb == null) return 0;
            if (sa == null) return 1;
            if (sb == null) return -1;
            return Double.compare(sb, sa);
        });
        
        // P2：提取检索指标（召回数/耗时/向量命中），记日志供监控
        RagMetrics metrics = extractMetrics(startMs, result.size(), vectorHit, userContent);
        log.info("RAG检索完成: userId={}, recalled={}, elapsed={}ms, vectorHit={}", 
                 userId, metrics.getTotalRecalled(), metrics.getElapsedMs(), metrics.isVectorHit());
        
        return result.size() > MAX_CONTEXT_MEMORIES
                ? result.subList(0, MAX_CONTEXT_MEMORIES) : result;
    }

    /** P1 重排：把 searchContext 的全量 scored 列表按 分源配额 × 时间衰减 × 重要性融合 重新组装 */
    private List<ContextChunk> reRank(List<Map.Entry<ContextChunk, Double>> scored, int limit) {
        if (scored == null || scored.isEmpty()) return new ArrayList<>();

        int cap = Math.max(1, limit);
        int memQuota;
        int diaQuota;
        int lorQuota;
        if (cap <= 2) {
            // 小配额优先保证 lore 至少 1 条，剩余给 memory
            memQuota = cap - 1;
            diaQuota = 0;
            lorQuota = 1;
        } else {
            // 用 floor 而非 ceil：避免 memory+diary 把槽位吃满，导致 lore 恒为 0
            memQuota = (int) Math.floor(cap * memoryQuota);
            diaQuota = (int) Math.floor(cap * diaryQuota);
            lorQuota = Math.max(1, cap - memQuota - diaQuota);
        }

        List<Map.Entry<ContextChunk, Double>> mem = new ArrayList<>();
        List<Map.Entry<ContextChunk, Double>> dia = new ArrayList<>();
        List<Map.Entry<ContextChunk, Double>> lor = new ArrayList<>();

        for (Map.Entry<ContextChunk, Double> e : scored) {
            String src = e.getKey().getSource();
            if ("memory".equals(src)) mem.add(e);
            else if ("diary".equals(src)) dia.add(e);
            else lor.add(e);
        }

        mem.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
        dia.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));
        lor.sort((a, b) -> Double.compare(b.getValue(), a.getValue()));

        List<ContextChunk> out = new ArrayList<>();
        int mi = 0, di = 0, li = 0;

        // 先按分源配额取
        for (int i = 0; i < memQuota && mi < mem.size() && out.size() < cap; i++) {
            out.add(mem.get(mi++).getKey());
        }
        for (int i = 0; i < diaQuota && di < dia.size() && out.size() < cap; i++) {
            out.add(dia.get(di++).getKey());
        }
        for (int i = 0; i < lorQuota && li < lor.size() && out.size() < cap; i++) {
            out.add(lor.get(li++).getKey());
        }

        // 某个源为空时用其余源补齐，保证返回条数尽量接近 limit
        while (out.size() < cap && (mi < mem.size() || di < dia.size() || li < lor.size())) {
            if (mi < mem.size()) out.add(mem.get(mi++).getKey());
            else if (di < dia.size()) out.add(dia.get(di++).getKey());
            else if (li < lor.size()) out.add(lor.get(li++).getKey());
        }

        // 配额只决定「谁入选」；入选后统一按 score 倒序输出，避免低分记忆排在高分日记前面
        out.sort(Comparator.comparingDouble(ContextChunk::getScore).reversed());
        return out;
    }

    @Override
    @Async("aiExecutor")
    public void extractAsync(String userId, String userContent, String aiReply) {
        doExtract(userId, PromptBuilder.memoryExtract(userContent, aiReply), "对话");
    }

    @Override
    @Async("aiExecutor")
    public void extractDiaryAsync(String userId, String diaryContent) {
        if (diaryContent == null || diaryContent.trim().isEmpty()) return;
        // 日记可能较长，提取时只送前 1500 字（与情绪分析一致）
        String snippet = diaryContent.length() > 1500 ? diaryContent.substring(0, 1500) : diaryContent;
        doExtract(userId, PromptBuilder.memoryExtractDiary(snippet), "日记");
    }

    /** 记忆提取公共流程：按 prompt 让 AI 抽 JSON → 入库 → 顺手向量化；任何失败都不影响主流程 */
    private void doExtract(String userId, String prompt, String source) {
        try {
            String json = aiClient.chat(
                    Arrays.asList(new AiMessage("user", prompt)), true, aiClient.getModel(), userId);
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
                float[] vec = aiClient.embed(memory.getContent(), userId);
                if (vec != null) memory.setEmbedding(JSON.toJSONString(vec));
                memoryMapper.insert(memory);
            }
            vectorStore.invalidate(userId);  // P1：新记忆入库后清缓存
        } catch (Exception e) {
            // 记忆提取失败只记日志，绝不影响主流程
            log.error("{}记忆提取失败, userId={}", source, userId, e);
        }
    }

    @Override
    public void markMentioned(List<Memory> memories) {
        long now = System.currentTimeMillis();
        String uid = null;
        for (Memory m : memories) {
            if (uid == null) uid = m.getUserId();
            Memory update = new Memory();
            update.setLastMentionedTime(now);
            LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Memory::getId, m.getId());
            memoryMapper.update(update, wrapper);
        }
        if (uid != null) vectorStore.invalidate(uid);  // P1：时间戳变了，时间衰减要重算
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
        vectorStore.invalidate(user.getId());  // P1：状态变了，重查
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
            float[] vec = aiClient.embed(m.getContent(), user.getId());
            if (vec != null) {
                vectorStore.upsert(VectorRecord.forMemory(m.getId(), user.getId(), vec));
                done++;
            }
        }
        vectorStore.invalidate(user.getId());  // P1：embedding 全量刷新后清缓存
        return Result.success(done);
    }

    // ================= 日记分片：保存日记后建"日记知识库" =================
    private static final Pattern SENTENCE = Pattern.compile("[^。！？!?\\n]+[。！？!?\\n]?");
    private static final int CHUNK_MAX = 110;
    private static final int CHUNKS_PER_DIARY = 8;

    @Override
    @Async("aiExecutor")
    public void chunkDiary(String userId, String diaryId, String title, String content) {
        try {
            if (content == null || content.trim().length() < 20) return;

            // 覆盖旧分片（同一篇日记编辑重存时）
            vectorStore.delete(VectorCollection.DIARY, userId, diaryId);

            for (String piece : splitChunks(content)) {
                float[] vec = aiClient.embed((title != null ? title + "：" : "") + piece, userId);
                if (vec == null) continue;
                vectorStore.upsert(VectorRecord.forChunk(VectorCollection.DIARY, userId, "diary",
                        diaryId, title, piece, System.currentTimeMillis(), vec));
            }
        } catch (Exception e) {
            log.error("日记分片失败, diaryId={}", diaryId, e);
        } finally {
            vectorStore.invalidate(userId);  // P1：日记分片重存后清缓存
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
        float[] qv = aiClient.embed(query, userId);
        if (qv == null) return new ArrayList<>();

        List<Map.Entry<ContextChunk, Double>> scored = new ArrayList<>();

        // 源1：记忆 —— sim × 时间衰减 × 重要性融合（由 VectorStore 实现）
        for (VectorHit hit : vectorStore.search(VectorQuery.of(VectorCollection.MEMORY, userId, qv, 0))) {
            Memory mem = hit.getMemory();
            double finalScore = hit.getScore();
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("memory", mem.getContent(),
                            org.apache.commons.lang3.time.DateFormatUtils.format(mem.getCreateDate(), "M月d日记下的事"), finalScore),
                    finalScore));
        }

        // 源2：日记分片 —— sim × 时间衰减
        for (VectorHit hit : vectorStore.search(VectorQuery.of(VectorCollection.DIARY, userId, qv, 0))) {
            DocumentChunk c = hit.getChunk();
            double finalScore = hit.getScore();
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("diary", c.getContent(),
                            (c.getTitle() != null ? "《" + c.getTitle() + "》" : "日记") + "里写过", finalScore),
                    finalScore));
        }

        // 源3：Celeste 公共设定知识库（userId 为空，source=lore）—— sim 直接用，公共设定不随时间过时
        for (VectorHit hit : vectorStore.search(VectorQuery.of(VectorCollection.LORE, null, qv, 0))) {
            DocumentChunk c = hit.getChunk();
            double finalScore = hit.getScore();
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("lore", c.getContent(),
                            c.getTitle() != null ? "Celeste设定·" + c.getTitle() : "Celeste设定", finalScore),
                    finalScore));
        }

        // P1 新：分源配额重排（memory 40% / diary 40% / lore 20%）
        return reRank(scored, limit);
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

    /**
     * P2 新增：提取检索指标，用于监控和调优。
     * @param startMs 检索开始时间戳
     * @param recalledCount 召回记录数
     * @param vectorHit 是否命中向量检索
     * @param query 查询文本
     */
    private RagMetrics extractMetrics(long startMs, int recalledCount, boolean vectorHit, String query) {
        RagMetrics m = new RagMetrics();
        m.setTotalRecalled(recalledCount);
        m.setElapsedMs(System.currentTimeMillis() - startMs);
        m.setVectorHit(vectorHit);
        
        // 查询文本脱敏：只取前 20 字
        if (query != null && !query.isEmpty()) {
            m.setQuerySnippet(query.length() > 20 ? query.substring(0, 20) + "..." : query);
        }
        
        // 源分布和相似度分位数留给 searchContext 实现（getRelevant 只返回 Memory 列表，无源信息）
        m.setSourceDistribution(new HashMap<>());
        return m;
    }
}
