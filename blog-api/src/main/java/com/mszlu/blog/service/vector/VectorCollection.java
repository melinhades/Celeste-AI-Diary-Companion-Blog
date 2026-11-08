package com.mszlu.blog.service.vector;

/**
 * 向量集合（逻辑分库）。
 * <p>
 * 现有实现映射到 MySQL：
 * MEMORY -> ms_memory.embedding；DIARY / LORE -> ms_document_chunk.embedding。
 * 后续接 Milvus 时，一个集合可对应一个 collection/partition，调用方无需改动。
 */
public enum VectorCollection {

    /** 记忆：ms_memory */
    MEMORY,

    /** 日记分片：ms_document_chunk，source=diary */
    DIARY,

    /** 公共设定：ms_document_chunk，user_id 为空，source=lore */
    LORE
}
