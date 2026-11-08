package com.mszlu.blog.service.vector;

/**
 * 向量检索条件。
 */
public class VectorQuery {

    private final VectorCollection collection;
    private final String userId;
    private final float[] queryVector;
    /** 返回条数上限；<= 0 表示不截断（取全部候选） */
    private final int limit;

    public VectorQuery(VectorCollection collection, String userId, float[] queryVector, int limit) {
        this.collection = collection;
        this.userId = userId;
        this.queryVector = queryVector;
        this.limit = limit;
    }

    public static VectorQuery of(VectorCollection collection, String userId, float[] queryVector, int limit) {
        return new VectorQuery(collection, userId, queryVector, limit);
    }

    public VectorCollection getCollection() {
        return collection;
    }

    public String getUserId() {
        return userId;
    }

    public float[] getQueryVector() {
        return queryVector;
    }

    public int getLimit() {
        return limit;
    }
}
