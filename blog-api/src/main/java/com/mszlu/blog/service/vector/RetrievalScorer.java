package com.mszlu.blog.service.vector;

/**
 * 检索打分的纯函数集合：余弦相似度、时间衰减、重要性融合。
 * <p>
 * 单独抽出来是为了让离线调参工具能用同一套公式跑网格搜索，
 * 避免在测试里复制一份实现导致口径漂移。
 */
public final class RetrievalScorer {

    private RetrievalScorer() {
    }

    /** 余弦相似度；维度不一致或零向量返回 0 */
    public static double cosine(float[] a, float[] b) {
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

    /**
     * 时间衰减：exp(-Δt / τ)，τ 以天计；返回 (0, 1]。
     * 时间戳为空、未来时间或 τ 非法时按「不过期」处理。
     */
    public static double timeDecay(Long timestampMs, int tauDays, long nowMs) {
        if (timestampMs == null) {
            return 1.0;
        }
        double deltaSec = (nowMs - timestampMs) / 1000.0;
        if (deltaSec <= 0) {
            return 1.0;
        }
        double tauSec = tauDays * 86400.0;
        if (tauSec <= 0) {
            return 1.0;
        }
        return Math.exp(-deltaSec / tauSec);
    }

    /**
     * 重要性融合：floor + (1-floor)·importance/10，importance 收敛到 1-10。
     * floor=1 表示完全不考虑重要性；null 兜底 1.0。
     */
    public static double importanceWeight(Integer importance, double floor) {
        if (importance == null) {
            return 1.0;
        }
        double f = Math.max(0.0, Math.min(1.0, floor));
        int imp = Math.max(1, Math.min(10, importance));
        return f + (1.0 - f) * (imp / 10.0);
    }
}
