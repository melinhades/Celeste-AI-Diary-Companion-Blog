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
