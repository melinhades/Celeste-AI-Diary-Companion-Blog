package com.mszlu.blog.service.vector;

import com.mszlu.blog.dao.pojo.DocumentChunk;
import com.mszlu.blog.dao.pojo.Memory;
import lombok.Getter;

/**
 * 单条向量检索命中。
 * <p>
 * memory / chunk 保留原始领域对象，调用方可直接复用，无需二次查库；
 * similarity 是原始余弦值，score 是按各集合策略融合（时间衰减 / 重要性）后的最终分。
 */
@Getter
public class VectorHit {

    private final String id;
    /** memory / diary / lore */
    private final String source;
    private final double similarity;
    private final double score;
    private final Memory memory;
    private final DocumentChunk chunk;

    private VectorHit(String id, String source, double similarity, double score,
                      Memory memory, DocumentChunk chunk) {
        this.id = id;
        this.source = source;
        this.similarity = similarity;
        this.score = score;
        this.memory = memory;
        this.chunk = chunk;
    }

    public static VectorHit ofMemory(Memory memory, double similarity, double score) {
        return new VectorHit(memory.getId(), "memory", similarity, score, memory, null);
    }

    public static VectorHit ofChunk(DocumentChunk chunk, double similarity, double score) {
        return new VectorHit(chunk.getId(), chunk.getSource(), similarity, score, null, chunk);
    }
}
