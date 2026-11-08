package com.mszlu.blog.service.vector;

import lombok.Data;

/**
 * 待写入/更新的向量记录。
 * <p>
 * 只承载「向量 + 检索回填所需的元数据」，不依赖具体的持久化实体；
 * Milvus 实现可直接把这些字段写入 scalar field。
 */
@Data
public class VectorRecord {

    private VectorCollection collection;

    /** 已存在记录的 ID；新建分片可为 null，由底层生成 */
    private String id;

    private String userId;

    /** memory / diary / lore */
    private String source;

    /** 日记 ID（同一篇日记重存时按它整组覆盖） */
    private String refId;

    private String title;

    private String content;

    private Long createDate;

    private float[] embedding;

    /** 记忆向量：更新已有记录的 embedding 列 */
    public static VectorRecord forMemory(String id, String userId, float[] embedding) {
        VectorRecord record = new VectorRecord();
        record.collection = VectorCollection.MEMORY;
        record.id = id;
        record.userId = userId;
        record.embedding = embedding;
        return record;
    }

    /** 分片向量：新增一条 DocumentChunk 记录 */
    public static VectorRecord forChunk(VectorCollection collection, String userId, String source,
                                        String refId, String title, String content,
                                        Long createDate, float[] embedding) {
        VectorRecord record = new VectorRecord();
        record.collection = collection;
        record.userId = userId;
        record.source = source;
        record.refId = refId;
        record.title = title;
        record.content = content;
        record.createDate = createDate;
        record.embedding = embedding;
        return record;
    }
}
