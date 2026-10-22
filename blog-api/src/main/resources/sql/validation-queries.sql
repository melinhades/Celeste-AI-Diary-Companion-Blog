-- =============================================================================
-- Madeline 情绪分析 v2 · 验证 harness 查询集
-- 用 diary_emotion_test_set / diary_emotion_external_validity / diary_emotion_ablation 三张表
-- 验证 prompt 第（六）部分的四项量化指标
-- =============================================================================

-- (a) Cohen's kappa —— 标注者 1/2/3 一致性
-- 公式：κ = (Po - Pe) / (1 - Pe)
-- Po = 观测一致比例，Pe = 随机一致概率
-- 下面这个查询按 emotion_type 列计算 κ；改强度 κ 把 type 换成 intensity 即可
SELECT
    -- Po：三个标注者完全一致的比例
    SUM(CASE WHEN annotator_1_type = annotator_2_type AND annotator_2_type = annotator_3_type THEN 1 ELSE 0 END) / COUNT(*) AS po,
    -- Pe：随机一致概率（各标注者类别分布的乘积和）
    -- 简化版：两两一致率 / 3（近似）
    (
      SUM(CASE WHEN annotator_1_type = annotator_2_type THEN 1 ELSE 0 END) +
      SUM(CASE WHEN annotator_2_type = annotator_3_type THEN 1 ELSE 0 END) +
      SUM(CASE WHEN annotator_1_type = annotator_3_type THEN 1 ELSE 0 END)
    ) / (COUNT(*) * 3.0) AS kappa_approx,
    COUNT(*) AS sample_count
FROM diary_emotion_test_set
WHERE annotator_1_type IS NOT NULL AND annotator_2_type IS NOT NULL AND annotator_3_type IS NOT NULL;


-- (b) LLM-as-Judge 双盲 —— 新版 vs 旧版情绪分析的 Judge 评分差
-- 新版样本：diary_chat_log 中 emotion_score_detail 非空（v2 跑过）
-- 旧版样本：diary_chat_log 中 emotion_score_detail 为空（v1 未跑过）
-- 评分 = Judge 返回的 0-10 分（由 LLM-as-Judge prompt 产生）
SELECT
    CASE WHEN emotion_score_detail IS NOT NULL THEN 'v2_new' ELSE 'v1_old' END AS version_group,
    AVG(judge_score) AS avg_judge_score,
    STDDEV(judge_score) AS std_dev,
    COUNT(*) AS n
FROM (
    SELECT l.*,
           (judge ->> '$.score')        AS judge_score,
           (judge ->> '$.dimensions')   AS judge_dims
    FROM diary_chat_log l
    WHERE judge IS NOT NULL  -- judge 列由外部 LLM-as-Judge 评分任务填充
) scored
GROUP BY version_group;


-- (c) 消融实验 —— 每个模块拿掉后 Judge 评分下降多少
SELECT
    ablation_module,
    AVG(judge_score_before) AS avg_before,
    AVG(judge_score_after)  AS avg_after,
    AVG(judge_score_before - judge_score_after) AS avg_delta,
    STDDEV(judge_score_before - judge_score_after) AS std_delta,
    COUNT(*) AS n
FROM diary_emotion_ablation
GROUP BY ablation_module
ORDER BY avg_delta DESC;


-- (d) 外部效度 —— emotion_score vs 用户行为 Pearson 相关系数
-- r = Σ(xi-x̄)(yi-ȳ) / sqrt(Σ(xi-x̄)² · Σ(yi-ȳ)²)
SELECT
    -- emotion_score vs feather_triggered（二值点-双列相关）
    (SUM((emotion_score - m1.avg_s) * (feather_triggered - m1.avg_f)) /
     SQRT(SUM((emotion_score - m1.avg_s) * (emotion_score - m1.avg_s)) *
          SUM((feather_triggered - m1.avg_f) * (feather_triggered - m1.avg_f))))
    AS pearson_score_feather,

    -- emotion_score vs next_24h_diary
    (SUM((emotion_score - m2.avg_s) * (next_24h_diary - m2.avg_n)) /
     SQRT(SUM((emotion_score - m2.avg_s) * (emotion_score - m2.avg_s)) *
          SUM((next_24h_diary - m2.avg_n) * (next_24h_diary - m2.avg_n))))
    AS pearson_score_next24h

FROM diary_emotion_external_validity,
     (SELECT AVG(emotion_score) AS avg_s, AVG(feather_triggered) AS avg_f FROM diary_emotion_external_validity) m1,
     (SELECT AVG(emotion_score) AS avg_s, AVG(next_24h_diary)    AS avg_n FROM diary_emotion_external_validity) m2
WHERE emotion_score IS NOT NULL;


-- (e) 反馈闭环 —— 👍/👎 率按 emotion_score 分桶
SELECT
    FLOOR(emotion_score * 5) / 5 AS score_bucket,     -- 0.0-0.2, 0.2-0.4, ..., 0.8-1.0
    SUM(CASE WHEN user_feedback = '👍' THEN 1 ELSE 0 END) AS thumbs_up,
    SUM(CASE WHEN user_feedback = '👎' THEN 1 ELSE 0 END) AS thumbs_down,
    SUM(CASE WHEN user_feedback = '👍' THEN 1 ELSE 0 END) * 100.0 /
      NULLIF(SUM(CASE WHEN user_feedback IN ('👍', '👎') THEN 1 ELSE 0 END), 0) AS thumbs_up_rate_pct,
    COUNT(*) AS total_with_feedback
FROM diary_emotion_external_validity
WHERE user_feedback IS NOT NULL AND user_feedback IN ('👍', '👎')
GROUP BY score_bucket
ORDER BY score_bucket;
