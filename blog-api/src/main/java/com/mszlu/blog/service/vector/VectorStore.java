package com.mszlu.blog.service.vector;

import java.util.List;

/**
 * 向量存储抽象：屏蔽「MySQL 列存 + 内存余弦」与「Milvus ANN 检索」的差异。
 * <p>
 * 语义约定：
 * 1. search 需要完成「按用户 + 集合取候选 → 相似度阈值过滤 → 集合各自的融合打分
 *    （记忆：时间衰减 × 重要性；日记：时间衰减；设定：不衰减）→ 按 score 倒序 → 截断 topN」，
 *    这样无论底层是 SQL 全量取数还是 ANN 近似检索，调用方拿到的结果语义一致。
 * 2. upsert 只负责把向量写进对应集合；分片类集合（DIARY/LORE）的「覆盖」语义由
 *    delete + upsert 组合完成，与现有 MySQL 行为一致。
 * 3. invalidate 是缓存失效钩子：MySQL 实现有本地向量缓存，Milvus 实现可为空实现。
 */
public interface VectorStore {

    /**
     * 按用户 + 集合检索 topN 相似项。
     * 返回结果已按 {@link VectorHit#getScore()} 倒序；limit &lt;= 0 时不截断。
     */
    List<VectorHit> search(VectorQuery query);

    /** 写入或更新单条向量 */
    void upsert(VectorRecord record);

    /** 批量写入或更新（默认逐条调用 upsert，实现可覆盖为批量接口） */
    default void upsertBatch(List<VectorRecord> records) {
        if (records == null) {
            return;
        }
        for (VectorRecord record : records) {
            upsert(record);
        }
    }

    /**
     * 删除向量。
     *
     * @param collection 目标集合
     * @param userId     用户 ID；LORE 集合传 null
     * @param refId      按业务关联 ID 精确删除（如日记 ID）；为 null 表示删除该用户在该集合下的全部向量
     */
    void delete(VectorCollection collection, String userId, String refId);

    /** 清理实现内部的检索缓存；无缓存实现可为空 */
    void invalidate(String userId);

    /** 健康检查：底层存储可用返回 true */
    boolean healthy();
}
