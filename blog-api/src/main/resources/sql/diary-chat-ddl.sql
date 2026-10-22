-- =============================================================================
-- Madeline 日记多轮实时反应 · 全链路日志表 + 会话记忆表
-- 对应规格：.trae/specs/madeline-diary-chat/diary-chat-v1.md
-- Spring Boot 2.5.0 + MySQL 5.7+（无新依赖）
-- =============================================================================

-- 全链路日志（每轮 Madeline 反应必写，不可省略）
CREATE TABLE IF NOT EXISTS `diary_chat_log` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`           VARCHAR(64)     NOT NULL COMMENT '用户 ID',
  `session_id`        VARCHAR(64)     NOT NULL COMMENT '会话 ID（同一用户多会话隔离）',
  `turn_id`           INT             NOT NULL COMMENT '会话内第几轮（从 1 开始）',

  -- 触发侧
  `trigger_type`      VARCHAR(16)     NOT NULL COMMENT '保存/修改/停顿/中断',
  `trigger_detail`    VARCHAR(512)             DEFAULT NULL COMMENT '触发详情（如字数、停顿秒数、修改偏移）',
  `user_draft`        TEXT                     COMMENT '用户当轮日记文本（截取 ≤ 2000 字）',
  `typing_signal`     VARCHAR(128)             DEFAULT NULL COMMENT '打字轨迹信号（如 delete:5/pause:3.2）',

  -- RAG 检索侧
  `retrieved_chunks`  TEXT                     COMMENT 'JSON：检索到的历史日记片段（≤ 3 段，含 similarity）',
  `retrieved_scores`  VARCHAR(128)             DEFAULT NULL COMMENT 'JSON 数组：各段相似度分数',

  -- AI 生成侧
  `system_prompt`     MEDIUMTEXT               COMMENT '发给模型的完整 system prompt（截取 ≤ 4000 字）',
  `model_raw`         MEDIUMTEXT               COMMENT '模型原始输出（含情绪标记）',
  `filtered_response` TEXT                     COMMENT '人格检查后最终下发给用户的文本',
  `filter_reason`     VARCHAR(256)             DEFAULT NULL COMMENT '过滤/重生成理由（如 R1 医疗建议 → 重新生成 2 次）',

  -- 分析侧
  `emotion_score`     DECIMAL(5,3)             DEFAULT NULL COMMENT '0-1 情绪得分（双模态融合后）',
  `emotion_type`      VARCHAR(16)              DEFAULT NULL COMMENT '兴奋/平静/沮丧/愤怒/迷茫',
  `emotion_score_detail` TEXT                 DEFAULT NULL COMMENT 'JSON：深度情绪分析全量输出（Plutchik/锚点/矛盾/轨迹特征/跨日记趋势/自适应权重）',
  `intent_type`       VARCHAR(16)              DEFAULT NULL COMMENT '吐槽/疑问/喜悦/反思/求助',
  `feather_triggered` TINYINT(1) UNSIGNED      NOT NULL DEFAULT 0 COMMENT '是否触发羽毛联动',
  `roundtable_sync`   TINYINT(1) UNSIGNED      NOT NULL DEFAULT 0 COMMENT '是否同步圆桌结论',

  -- 用户反馈
  `user_feedback`     VARCHAR(8)               DEFAULT NULL COMMENT '👍/👎/NULL',

  -- 性能与状态
  `first_delta_ms`    INT                      DEFAULT NULL COMMENT '从 trigger 到首个 delta 的耗时（ms）',
  `total_ms`          INT                      DEFAULT NULL COMMENT '整轮耗时（ms）',
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX `idx_user_session` (`user_id`, `session_id`),
  INDEX `idx_created`      (`created_at`),
  INDEX `idx_feedback`     (`user_feedback`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Madeline 日记多轮反应全链路日志';


-- 会话记忆表（每 3 轮压缩一次，摘要 ≤ 100 字）
CREATE TABLE IF NOT EXISTS `diary_chat_session` (
  `session_id`        VARCHAR(64)     NOT NULL PRIMARY KEY COMMENT '会话 ID（UUID 或时间戳+随机）',
  `user_id`           VARCHAR(64)     NOT NULL,
  `summary`           VARCHAR(512)    DEFAULT NULL COMMENT '累计摘要（≤ 100 字 / 每 3 轮压缩）',
  `turn_count`        INT             NOT NULL DEFAULT 0 COMMENT '本会话已完成的轮次',
  `last_active_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user_active` (`user_id`, `last_active_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Madeline 日记会话记忆';


-- =============================================================================
-- v2 升级：为已有部署补 emotion_score_detail 列（CREATE TABLE IF NOT EXISTS 不会修改已存在表）
-- 执行方式：在 MySQL 客户端直接跑这条 ALTER
-- =============================================================================
-- ALTER TABLE `diary_chat_log` ADD COLUMN `emotion_score_detail` TEXT DEFAULT NULL COMMENT 'JSON：深度情绪分析全量输出（Plutchik/锚点/矛盾/轨迹特征/跨日记趋势/自适应权重）' AFTER `emotion_type`;


-- =============================================================================
-- v2 验证 harness：金标准测试集表（用于 Cohen's kappa + LLM-as-Judge 双盲评分）
-- 标注流程：2-3 标注者独立标 emotion_type + intensity 1-5
-- =============================================================================
CREATE TABLE IF NOT EXISTS `diary_emotion_test_set` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `diary_text`        MEDIUMTEXT     NOT NULL COMMENT '日记原文',
  `annotator_1_type`  VARCHAR(16)    DEFAULT NULL COMMENT '标注者 1 的 emotion_type（Plutchik primary）',
  `annotator_1_intensity` INT      DEFAULT NULL COMMENT '标注者 1 的 intensity 1-5',
  `annotator_2_type`  VARCHAR(16)    DEFAULT NULL COMMENT '标注者 2 的 emotion_type',
  `annotator_2_intensity` INT      DEFAULT NULL,
  `annotator_3_type`  VARCHAR(16)    DEFAULT NULL,
  `annotator_3_intensity` INT      DEFAULT NULL,
  `gold_type`         VARCHAR(16)    DEFAULT NULL COMMENT '仲裁后的金标准',
  `gold_intensity`    INT            DEFAULT NULL,
  `created_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_gold`    (`gold_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金标准测试集（Cohen''s kappa + Judge 双盲评分用）';


-- =============================================================================
-- v2 验证 harness：消融实验记录（每去掉一个子模块 → Judge 打分变化）
-- =============================================================================
CREATE TABLE IF NOT EXISTS `diary_emotion_ablation` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `turn_id`           VARCHAR(32)    NOT NULL COMMENT 'diary_chat_log.id 引用',
  `ablation_module`   VARCHAR(32)    NOT NULL COMMENT '被关闭的模块名（text/embed/trajectory/trend/fusion）',
  `judge_score_before` DECIMAL(5,2)  DEFAULT NULL COMMENT '关闭前 Judge 评分',
  `judge_score_after`  DECIMAL(5,2)  DEFAULT NULL COMMENT '关闭后 Judge 评分',
  `delta`              DECIMAL(5,2)  DEFAULT NULL COMMENT '评分下降值',
  `created_at`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消融实验记录';


-- =============================================================================
-- v2 验证 harness：外部效度（情绪得分 vs 真实用户行为相关）
-- 这个表是从 diary_chat_log JOIN diary / diary_chat_log JOIN 其他行为表的物化结果
-- =============================================================================
CREATE TABLE IF NOT EXISTS `diary_emotion_external_validity` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `session_id`        VARCHAR(64)    NOT NULL,
  `emotion_score`     DECIMAL(5,3)  DEFAULT NULL COMMENT 'diary_chat_log.emotion_score',
  `feather_triggered` TINYINT(1)    DEFAULT NULL COMMENT '是否触发羽毛',
  `next_24h_diary`    TINYINT(1)    DEFAULT NULL COMMENT '24h 内是否再写日记',
  `stay_minutes`      INT           DEFAULT NULL COMMENT '保存后停留分钟数（近似值）',
  `user_feedback`     VARCHAR(8)    DEFAULT NULL COMMENT '👍/👎',
  `created_at`        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_score`   (`emotion_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='外部效度验证表（Pearson 相关系数计算用）';
