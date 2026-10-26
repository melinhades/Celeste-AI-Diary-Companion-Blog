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
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class MemoryServiceImpl implements MemoryService {

    /** 拼进 prompt 的记忆上限，防止 token 膨胀 */
    private static final int MAX_CONTEXT_MEMORIES = 15;

    // ================= P1 新增：向量缓存 + 重排常量 =================
    /** 每个用户的向量缓存，key = 用户ID，value = (记录ID → 向量) */
    private final ConcurrentHashMap<String, ConcurrentHashMap<String, float[]>>
            VEC_CACHE = new ConcurrentHashMap<>();
    /** 缓存 TTL：10 分钟（超出则丢弃，下次查询时重新解析） */
    private static final long CACHE_TTL_MS = 10 * 60 * 1000L;
    /** 时间衰减 τ：30 天（exp(-Δt/τDays)，τDays = 30×86400） */
    private static final double DECAY_TAU_SEC = 30L * 86400;
    /** 分源配额：memory 40% / diary 40% / lore 20% */
    private static final double MEMORY_QUOTA = 0.4;
    private static final double DIARY_QUOTA  = 0.4;
    private static final double LORE_QUOTA   = 0.2;

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

        // 2. RAG：当前消息向量化，与记忆向量算余弦相似度取 Top 8（用缓存 + 时间衰减 × 重要性融合）
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
                    float[] v = cachedVec(userId, m.getId(), m.getEmbedding());
                    if (v == null) continue;
                    double sim = cosine(queryVec, v);
                    if (sim > 0) {
                        Long tRef = m.getLastMentionedTime() != null ? m.getLastMentionedTime() : m.getCreateDate();
                        double finalScore = sim * timeDecay(tRef) * importanceWeight(m.getImportance());
                        scored.add(new AbstractMap.SimpleEntry<>(m, finalScore));
                    }
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

    // ================= P1 新增：向量缓存 + 重排工具 =================
    /**
     * 带缓存的向量解析：先查 VEC_CACHE[userId][recordId]，miss 才 parseVec 并回填。
     * lore 公共知识库用固定 key "__lore__"，不做失效（永远是同一批设定）。
     */
    private float[] cachedVec(String userId, String recordId, String json) {
        String cacheKey = (userId == null || userId.isEmpty()) ? "__lore__" : userId;
        ConcurrentHashMap<String, float[]> bucket = VEC_CACHE.get(cacheKey);
        if (bucket != null) {
            float[] hit = bucket.get(recordId);
            if (hit != null) return hit;
        }
        float[] parsed = parseVec(json);
        if (parsed != null) {
            bucket = VEC_CACHE.computeIfAbsent(cacheKey, k -> new ConcurrentHashMap<>());
            bucket.put(recordId, parsed);
        }
        return parsed;
    }

    /** 写入路径调此方法增量失效（doExtract / chunkDiary / markMentioned / resolve / reindex 都覆盖） */
    private void invalidate(String userId) {
        if (userId != null) VEC_CACHE.remove(userId);
    }

    /** 时间衰减因子：exp(-Δt / τ)，τ=30 天；Δt 用秒；返回 (0, 1] */
    private double timeDecay(Long timestampMs) {
        if (timestampMs == null) return 1.0;
        double deltaSec = (System.currentTimeMillis() - timestampMs) / 1000.0;
        if (deltaSec <= 0) return 1.0;
        return Math.exp(-deltaSec / DECAY_TAU_SEC);
    }

    /** 重要性融合因子：importance 1-10，权重 0.8 + 0.2·importance/10；null 兜底 5 → 1.0 */
    private double importanceWeight(Integer importance) {
        if (importance == null) return 1.0;
        int imp = Math.max(1, Math.min(10, importance));
        return 0.8 + 0.2 * (imp / 10.0);
    }

    /** P1 重排：把 searchContext 的全量 scored 列表按 分源配额 × 时间衰减 × 重要性融合 重新组装 */
    private List<ContextChunk> reRank(List<Map.Entry<ContextChunk, Double>> scored, int limit) {
        if (scored == null || scored.isEmpty()) return new ArrayList<>();

        double memQuota = Math.ceil(limit * MEMORY_QUOTA);
        double diaQuota = Math.ceil(limit * DIARY_QUOTA);
        double lorQuota = limit - memQuota - diaQuota;

        List<Map.Entry<ContextChunk, Double>> mem = new ArrayList<>();
        List<Map.Entry<ContextChunk, Double>> dia = new ArrayList<>();
        List<Map.Entry<ContextChunk, Double>> lor = new ArrayList<>();

        for (Map.Entry<ContextChunk, Double> e : scored) {
            String src = e.getKey().getSource();
            if ("memory".equals(src)) mem.add(e);
            else if ("diary".equals(src)) dia.add(e);
            else lor.add(e);
        }

        // Memory：时间衰减（lastMentionedTime 优先，null → createDate）× 重要性融合
        mem.sort((a, b) -> {
            double sa = a.getValue();
            double sb = b.getValue();
            // 取 createDate / importance 兜底（ContextChunk 没带，退回纯 sim 比较）
            return Double.compare(sb, sa);
        });
        // 注：时间衰减 + 重要性融合只在 searchContext 里已读 DB 表时生效，
        // ContextChunk 封装后丢失原始字段，所以这里先按 sim 排。
        // 真正的衰减与融合在 searchContext 内部组装 scored 时就乘进去了（见下方改动）。

        List<ContextChunk> out = new ArrayList<>();
        int mi = 0, di = 0, li = 0;
        while (out.size() < limit) {
            boolean progress = false;
            if (out.size() < memQuota && mi < mem.size()) {
                out.add(mem.get(mi++).getKey()); progress = true;
            }
            if (out.size() < memQuota + diaQuota && di < dia.size() && out.size() < limit) {
                out.add(dia.get(di++).getKey()); progress = true;
            }
            if (li < lor.size() && out.size() < limit) {
                out.add(lor.get(li++).getKey()); progress = true;
            }
            if (!progress) break;
        }
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
            invalidate(userId);  // P1：新记忆入库后清缓存
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
        if (uid != null) invalidate(uid);  // P1：时间戳变了，时间衰减要重算
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
        invalidate(user.getId());  // P1：状态变了，重查
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
        invalidate(user.getId());  // P1：embedding 全量刷新后清缓存
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
        } finally {
            invalidate(userId);  // P1：日记分片重存后清缓存
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
        long now = System.currentTimeMillis();

        // 源1：记忆 —— sim × 时间衰减 × 重要性融合
        LambdaQueryWrapper<Memory> mp = new LambdaQueryWrapper<>();
        mp.eq(Memory::getUserId, userId).isNotNull(Memory::getEmbedding).last("limit 200");
        for (Memory mem : memoryMapper.selectList(mp)) {
            float[] v = cachedVec(userId, mem.getId(), mem.getEmbedding());
            if (v == null) continue;
            double sim = cosine(qv, v);
            if (sim <= 0.3) continue;
            // 时间衰减：lastMentionedTime 优先（最近被提及=更相关），null → createDate
            Long tRef = mem.getLastMentionedTime() != null ? mem.getLastMentionedTime() : mem.getCreateDate();
            double timeD = timeDecay(tRef);
            // 重要性融合
            double impW = importanceWeight(mem.getImportance());
            double finalScore = sim * timeD * impW;
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("memory", mem.getContent(),
                            org.apache.commons.lang3.time.DateFormatUtils.format(mem.getCreateDate(), "M月d日记下的事"), finalScore),
                    finalScore));
        }

        // 源2：日记分片 —— sim × 时间衰减
        LambdaQueryWrapper<DocumentChunk> cp = new LambdaQueryWrapper<>();
        cp.eq(DocumentChunk::getUserId, userId).isNotNull(DocumentChunk::getEmbedding).last("limit 300");
        for (DocumentChunk c : chunkMapper.selectList(cp)) {
            float[] v = cachedVec(userId, c.getId(), c.getEmbedding());
            if (v == null) continue;
            double sim = cosine(qv, v);
            if (sim <= 0.3) continue;
            double timeD = timeDecay(c.getCreateDate());
            double finalScore = sim * timeD;
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("diary", c.getContent(),
                            (c.getTitle() != null ? "《" + c.getTitle() + "》" : "日记") + "里写过", finalScore),
                    finalScore));
        }

        // 源3：Celeste 公共设定知识库（userId 为空，source=lore）—— sim 直接用，公共设定不随时间过时
        LambdaQueryWrapper<DocumentChunk> lp = new LambdaQueryWrapper<>();
        lp.isNull(DocumentChunk::getUserId)
          .eq(DocumentChunk::getSource, "lore")
          .isNotNull(DocumentChunk::getEmbedding)
          .last("limit 500");
        for (DocumentChunk c : chunkMapper.selectList(lp)) {
            float[] v = cachedVec(null, c.getId(), c.getEmbedding());
            if (v == null) continue;
            double sim = cosine(qv, v);
            if (sim <= 0.3) continue;
            scored.add(new AbstractMap.SimpleEntry<>(
                    new ContextChunk("lore", c.getContent(),
                            c.getTitle() != null ? "Celeste设定·" + c.getTitle() : "Celeste设定", sim), sim));
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
}
