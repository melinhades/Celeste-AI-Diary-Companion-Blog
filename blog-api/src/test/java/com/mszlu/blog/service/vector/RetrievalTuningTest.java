package com.mszlu.blog.service.vector;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 检索参数离线网格搜索：τ（时间衰减）、相似度阈值、重要性融合下限。
 * <p>
 * 用 5 个标注用例模拟记忆召回，按 recall@3 + MRR 打分，输出最优组合。
 * 不连数据库、不调 AI，纯内存计算，改完 yml 里的 rag.* 参数重启即可生效。
 * <p>
 * 运行：mvn test -Dtest=RetrievalTuningTest -Dtuning=true
 */
@Tag("tuning")
@EnabledIfSystemProperty(named = "tuning", matches = "true")
class RetrievalTuningTest {

    private static final int TOP_K = 3;
    private static final long DAY_MS = 24L * 60 * 60 * 1000;

    /** 当前线上默认值，作为对比基线 */
    private static final int DEFAULT_TAU = 30;
    private static final double DEFAULT_THRESHOLD = 0.3;
    private static final double DEFAULT_FLOOR = 0.8;

    /** 一条候选记忆：向量、重要性 1-10、距今天数 */
    private record Mem(String id, float[] vec, int importance, long ageDays) {
    }

    /** 一个标注用例：查询向量 + 候选池 + 期望命中的 ID */
    private record Case(String name, float[] query, List<Mem> pool, Set<String> relevant) {
    }

    private record Params(int tau, double threshold, double floor, double score, double recall, double mrr) {
    }

    private static final long NOW = System.currentTimeMillis();

    @Test
    void gridSearch() {
        List<Case> cases = buildCases();
        List<Params> results = new ArrayList<>();

        int[] taus = {7, 14, 30, 60, 120, 180};
        double[] thresholds = {0.2, 0.3, 0.35, 0.4, 0.5};
        double[] floors = {0.8, 0.85, 0.9, 0.95, 1.0};

        for (int tau : taus) {
            for (double th : thresholds) {
                for (double floor : floors) {
                    results.add(evaluate(cases, tau, th, floor));
                }
            }
        }
        results.sort(Comparator.comparingDouble(Params::score).reversed());

        Params baseline = evaluate(cases, DEFAULT_TAU, DEFAULT_THRESHOLD, DEFAULT_FLOOR);
        // 同分时优先选离当前默认值最近的组合，避免无意义的参数漂移
        double bestScore = results.get(0).score();
        Params best = results.stream()
                .filter(p -> Math.abs(p.score() - bestScore) < 1e-9)
                .min(Comparator.comparingDouble(RetrievalTuningTest::distanceToDefault))
                .orElse(results.get(0));

        System.out.println("[TUNING] 用例数=" + cases.size() + " 组合数=" + results.size());
        System.out.println("[TUNING] 当前默认 tau=" + DEFAULT_TAU + " threshold=" + DEFAULT_THRESHOLD
                + " floor=" + DEFAULT_FLOOR + " score=" + fmt(baseline.score()));
        System.out.println("[TUNING] 前 5 名：");
        for (int i = 0; i < Math.min(5, results.size()); i++) {
            Params p = results.get(i);
            System.out.println("[TUNING] #" + (i + 1) + " tau=" + p.tau() + " threshold=" + p.threshold()
                    + " floor=" + p.floor() + " score=" + fmt(p.score())
                    + " recall=" + fmt(p.recall()) + " mrr=" + fmt(p.mrr()));
        }
        System.out.println("[TUNING] 建议 tau=" + best.tau() + " threshold=" + best.threshold()
                + " floor=" + best.floor() + " score=" + fmt(best.score())
                + "（基线 " + fmt(baseline.score()) + "）");

        assertTrue(best.score() + 1e-9 >= baseline.score(),
                "网格搜索的最优分不应低于当前默认参数");
    }

    private Params evaluate(List<Case> cases, int tau, double threshold, double floor) {
        double sumRecall = 0;
        double sumMrr = 0;
        for (Case c : cases) {
            List<Scored> hits = new ArrayList<>();
            for (Mem m : c.pool()) {
                double sim = RetrievalScorer.cosine(c.query(), m.vec());
                if (sim <= threshold) continue;
                long ts = NOW - m.ageDays() * DAY_MS;
                double score = sim
                        * RetrievalScorer.timeDecay(ts, tau, NOW)
                        * RetrievalScorer.importanceWeight(m.importance(), floor);
                hits.add(new Scored(m.id(), score));
            }
            hits.sort(Comparator.comparingDouble(Scored::score).reversed());

            Set<String> expected = c.relevant();
            int hit = 0;
            double mrr = 0;
            for (int i = 0; i < Math.min(TOP_K, hits.size()); i++) {
                if (expected.contains(hits.get(i).id())) {
                    hit++;
                    if (mrr == 0) mrr = 1.0 / (i + 1);
                }
            }
            sumRecall += (double) hit / expected.size();
            sumMrr += mrr;
        }
        double recall = sumRecall / cases.size();
        double mrr = sumMrr / cases.size();
        return new Params(tau, threshold, floor, 0.5 * recall + 0.5 * mrr, recall, mrr);
    }

    private static double distanceToDefault(Params p) {
        return Math.abs(Math.log((double) p.tau() / DEFAULT_TAU))
                + Math.abs(p.threshold() - DEFAULT_THRESHOLD) * 10
                + Math.abs(p.floor() - DEFAULT_FLOOR) * 10;
    }

    private static String fmt(double v) {
        return String.format("%.3f", v);
    }

    private record Scored(String id, double score) {
    }

    private static List<Case> buildCases() {
        List<Case> cases = new ArrayList<>();

        // 1. 时间优先：内容完全相同的两条，最近提过的应排前面
        cases.add(new Case("recency",
                new float[]{1, 0, 0, 0},
                List.of(
                        new Mem("old", new float[]{1, 0, 0, 0}, 5, 90),
                        new Mem("new", new float[]{1, 0, 0, 0}, 5, 2)),
                Set.of("new")));

        // 2. 重要性融合：同相似度同时间，重要性高的应胜出
        //    候选顺序故意把低重要性放前面，floor=1.0 时会退化成平手
        cases.add(new Case("importance",
                new float[]{1, 0, 0, 0},
                List.of(
                        new Mem("low", new float[]{1, 0, 0, 0}, 1, 10),
                        new Mem("high", new float[]{1, 0, 0, 0}, 9, 10)),
                Set.of("high")));

        // 3. 阈值边界：相关性 0.36 的记忆，在阈值 0.4 时会被直接过滤掉
        cases.add(new Case("threshold",
                new float[]{1, 0, 0, 0},
                List.of(
                        new Mem("weak", new float[]{0.36f, 0.93295f, 0, 0}, 5, 30),
                        new Mem("noise", new float[]{0, 1, 0, 0}, 5, 1)),
                Set.of("weak")));

        // 4. 衰减强度：120 天前的强相关 vs 昨天的一般相关，τ 太小会把旧记忆压死
        cases.add(new Case("decay",
                new float[]{1, 0, 0, 0},
                List.of(
                        new Mem("stale", new float[]{1, 0, 0, 0}, 8, 120),
                        new Mem("freshNoise", new float[]{0.45f, 0.89303f, 0, 0}, 5, 1)),
                Set.of("stale")));

        // 5. 多相关：两条相关都要进前 3，且无关项不能挤进来
        cases.add(new Case("multi",
                new float[]{0.6f, 0.8f, 0, 0},
                List.of(
                        new Mem("a", new float[]{0.6f, 0.8f, 0, 0}, 3, 5),
                        new Mem("b", new float[]{0.8f, 0.6f, 0, 0}, 3, 5),
                        new Mem("noise", new float[]{0, 0, 1, 0}, 10, 1)),
                new HashSet<>(Arrays.asList("a", "b"))));

        return cases;
    }
}
