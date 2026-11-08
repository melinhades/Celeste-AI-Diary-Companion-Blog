package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.DocumentChunkMapper;
import com.mszlu.blog.dao.mapper.MemoryMapper;
import com.mszlu.blog.dao.pojo.DocumentChunk;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.service.vector.VectorCollection;
import com.mszlu.blog.service.vector.VectorHit;
import com.mszlu.blog.service.vector.VectorQuery;
import com.mszlu.blog.service.vector.VectorRecord;
import com.mszlu.blog.service.vector.VectorStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 向量存储的 MySQL 实现：向量以 JSON 数组字符串存在 TEXT 列，检索时全量取数 + 内存余弦。
 * <p>
 * 这里原样保留改造前的行为（SQL 取数、召回上限、时间衰减、重要性融合、VEC_CACHE 策略），
 * 作为接入 Milvus 前的基线实现。
 */
@Component
@Slf4j
public class MysqlVectorStore implements VectorStore {

    /**
     * 每个用户的向量缓存，key = 用户ID（lore 用 "__lore__"），value = 该用户的整片缓存。
     * 过期与失效都按这个 key 整片处理，避免同一用户出现部分新、部分旧的向量。
     */
    private final ConcurrentHashMap<String, CacheBucket> VEC_CACHE = new ConcurrentHashMap<>();

    /** 缓存 TTL：10 分钟（从整片缓存创建时算起，超时后整片丢弃并重新解析） */
    private static final long CACHE_TTL_MS = 10 * 60 * 1000L;

    /** 单个用户的向量缓存片：一份向量表 + 这片缓存的创建时间 */
    private static final class CacheBucket {

        private final ConcurrentHashMap<String, float[]> vectors = new ConcurrentHashMap<>();
        private final long loadedAt = System.currentTimeMillis();

        private boolean expired(long nowMs) {
            return nowMs - loadedAt > CACHE_TTL_MS;
        }
    }

    @Value("${rag.similarity-threshold:0.3}")
    private double similarityThreshold;

    @Value("${rag.decay-tau-days:30}")
    private int decayTauDays;

    /** 单次检索从库里取的最大候选数（原写死 200 / 300 / 500） */
    @Value("${rag.recall.memory:200}")
    private int memoryRecallLimit;

    @Value("${rag.recall.diary:300}")
    private int diaryRecallLimit;

    @Value("${rag.recall.lore:500}")
    private int loreRecallLimit;

    @Autowired
    private MemoryMapper memoryMapper;

    @Autowired
    private DocumentChunkMapper chunkMapper;

    @Override
    public List<VectorHit> search(VectorQuery query) {
        if (query == null || query.getQueryVector() == null) {
            return new ArrayList<>();
        }
        List<VectorHit> hits;
        VectorCollection collection = query.getCollection();
        if (collection == VectorCollection.MEMORY) {
            hits = searchMemories(query);
        } else if (collection == VectorCollection.DIARY) {
            hits = searchDiaryChunks(query);
        } else if (collection == VectorCollection.LORE) {
            hits = searchLoreChunks(query);
        } else {
            return new ArrayList<>();
        }

        hits.sort(Comparator.comparingDouble(VectorHit::getScore).reversed());
        if (query.getLimit() > 0 && hits.size() > query.getLimit()) {
            return new ArrayList<>(hits.subList(0, query.getLimit()));
        }
        return hits;
    }

    /** 记忆：sim × 时间衰减（lastMentionedTime 优先）× 重要性融合 */
    private List<VectorHit> searchMemories(VectorQuery query) {
        LambdaQueryWrapper<Memory> pool = new LambdaQueryWrapper<>();
        pool.eq(Memory::getUserId, query.getUserId());
        pool.isNotNull(Memory::getEmbedding);
        pool.last("limit " + memoryRecallLimit);

        List<VectorHit> hits = new ArrayList<>();
        for (Memory m : memoryMapper.selectList(pool)) {
            float[] v = cachedVec(query.getUserId(), m.getId(), m.getEmbedding());
            if (v == null) {
                continue;
            }
            double sim = cosine(query.getQueryVector(), v);
            if (sim <= similarityThreshold) {
                continue;
            }
            Long tRef = m.getLastMentionedTime() != null ? m.getLastMentionedTime() : m.getCreateDate();
            double finalScore = sim * timeDecay(tRef) * importanceWeight(m.getImportance());
            hits.add(VectorHit.ofMemory(m, sim, finalScore));
        }
        return hits;
    }

    /** 日记分片：sim × 时间衰减（与原实现一致，不按 source 过滤） */
    private List<VectorHit> searchDiaryChunks(VectorQuery query) {
        LambdaQueryWrapper<DocumentChunk> pool = new LambdaQueryWrapper<>();
        pool.eq(DocumentChunk::getUserId, query.getUserId());
        pool.isNotNull(DocumentChunk::getEmbedding);
        pool.last("limit " + diaryRecallLimit);

        List<VectorHit> hits = new ArrayList<>();
        for (DocumentChunk c : chunkMapper.selectList(pool)) {
            float[] v = cachedVec(query.getUserId(), c.getId(), c.getEmbedding());
            if (v == null) {
                continue;
            }
            double sim = cosine(query.getQueryVector(), v);
            if (sim <= similarityThreshold) {
                continue;
            }
            double finalScore = sim * timeDecay(c.getCreateDate());
            hits.add(VectorHit.ofChunk(c, sim, finalScore));
        }
        return hits;
    }

    /** 公共设定：sim 直接用，公共设定不随时间过时 */
    private List<VectorHit> searchLoreChunks(VectorQuery query) {
        LambdaQueryWrapper<DocumentChunk> pool = new LambdaQueryWrapper<>();
        pool.isNull(DocumentChunk::getUserId);
        pool.eq(DocumentChunk::getSource, "lore");
        pool.isNotNull(DocumentChunk::getEmbedding);
        pool.last("limit " + loreRecallLimit);

        List<VectorHit> hits = new ArrayList<>();
        for (DocumentChunk c : chunkMapper.selectList(pool)) {
            float[] v = cachedVec(null, c.getId(), c.getEmbedding());
            if (v == null) {
                continue;
            }
            double sim = cosine(query.getQueryVector(), v);
            if (sim <= similarityThreshold) {
                continue;
            }
            hits.add(VectorHit.ofChunk(c, sim, sim));
        }
        return hits;
    }

    @Override
    public void upsert(VectorRecord record) {
        if (record == null || record.getEmbedding() == null) {
            return;
        }
        if (record.getCollection() == VectorCollection.MEMORY) {
            // 记忆行由业务侧写入，这里只回填 embedding 列
            Memory update = new Memory();
            update.setEmbedding(JSON.toJSONString(record.getEmbedding()));
            LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(Memory::getId, record.getId());
            memoryMapper.update(update, wrapper);
            return;
        }
        // 分片类集合：一条记录即一条 DocumentChunk
        DocumentChunk chunk = new DocumentChunk();
        chunk.setId(record.getId());
        chunk.setUserId(record.getUserId());
        chunk.setSource(record.getSource());
        chunk.setRefId(record.getRefId());
        chunk.setTitle(record.getTitle());
        chunk.setContent(record.getContent());
        chunk.setEmbedding(JSON.toJSONString(record.getEmbedding()));
        chunk.setCreateDate(record.getCreateDate());
        chunkMapper.insert(chunk);
    }

    @Override
    public void delete(VectorCollection collection, String userId, String refId) {
        if (collection == VectorCollection.MEMORY) {
            LambdaQueryWrapper<Memory> wrapper = new LambdaQueryWrapper<>();
            if (userId != null) {
                wrapper.eq(Memory::getUserId, userId);
            }
            if (refId != null) {
                wrapper.eq(Memory::getId, refId);
            }
            memoryMapper.delete(wrapper);
            return;
        }
        if (collection == VectorCollection.LORE) {
            LambdaQueryWrapper<DocumentChunk> wrapper = new LambdaQueryWrapper<>();
            wrapper.isNull(DocumentChunk::getUserId).eq(DocumentChunk::getSource, "lore");
            if (refId != null) {
                wrapper.eq(DocumentChunk::getRefId, refId);
            }
            chunkMapper.delete(wrapper);
            return;
        }
        // DIARY：与原实现一致，按 userId + refId 删除
        if (userId == null) {
            return;
        }
        LambdaQueryWrapper<DocumentChunk> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DocumentChunk::getUserId, userId);
        if (refId != null) {
            wrapper.eq(DocumentChunk::getRefId, refId);
        }
        chunkMapper.delete(wrapper);
    }

    @Override
    public void invalidate(String userId) {
        if (userId != null) {
            VEC_CACHE.remove(userId);
        }
    }

    @Override
    public boolean healthy() {
        try {
            memoryMapper.selectList(new LambdaQueryWrapper<Memory>().last("limit 1"));
            return true;
        } catch (Exception e) {
            log.warn("向量存储健康检查失败: {}", e.getMessage());
            return false;
        }
    }

    private double cosine(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) {
            return 0;
        }
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        if (na == 0 || nb == 0) {
            return 0;
        }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    private float[] parseVec(String json) {
        try {
            JSONArray arr = JSON.parseArray(json);
            float[] out = new float[arr.size()];
            for (int i = 0; i < arr.size(); i++) {
                out[i] = arr.getFloatValue(i);
            }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 带缓存的向量解析：先查 VEC_CACHE[userId][recordId]，miss 才 parseVec 并回填。
     * 整片缓存超过 TTL 时按 userId 整片丢弃后重新加载，与 invalidate(userId) 的口径一致。
     * lore 公共知识库用固定 key "__lore__"，同样按 TTL 整片刷新。
     */
    private float[] cachedVec(String userId, String recordId, String json) {
        String cacheKey = (userId == null || userId.isEmpty()) ? "__lore__" : userId;
        long nowMs = System.currentTimeMillis();
        CacheBucket bucket = VEC_CACHE.get(cacheKey);
        if (bucket != null) {
            if (bucket.expired(nowMs)) {
                // 条件移除：只删自己读到的那片，避开并发下刚被重建的新片
                VEC_CACHE.remove(cacheKey, bucket);
                bucket = null;
            } else {
                float[] hit = bucket.vectors.get(recordId);
                if (hit != null) {
                    return hit;
                }
            }
        }
        float[] parsed = parseVec(json);
        if (parsed != null) {
            CacheBucket target = VEC_CACHE.computeIfAbsent(cacheKey, k -> new CacheBucket());
            target.vectors.put(recordId, parsed);
        }
        return parsed;
    }

    /** 时间衰减因子：exp(-Δt / τ)，τ=30 天；Δt 用秒；返回 (0, 1] */
    private double timeDecay(Long timestampMs) {
        if (timestampMs == null) {
            return 1.0;
        }
        double deltaSec = (System.currentTimeMillis() - timestampMs) / 1000.0;
        if (deltaSec <= 0) {
            return 1.0;
        }
        double tauSec = decayTauDays * 86400.0;
        return Math.exp(-deltaSec / tauSec);
    }

    /** 重要性融合因子：importance 1-10，权重 0.8 + 0.2·importance/10；null 兜底 5 → 1.0 */
    private double importanceWeight(Integer importance) {
        if (importance == null) {
            return 1.0;
        }
        int imp = Math.max(1, Math.min(10, importance));
        return 0.8 + 0.2 * (imp / 10.0);
    }
}
