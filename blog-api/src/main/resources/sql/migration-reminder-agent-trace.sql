-- =============================================================================
-- 1. AI 提醒待办表
-- 对应代码：ChatServiceImpl.saveReminderIfAny 落库、ReminderServiceImpl 定时派发
-- 背景：AI 回复里带 reminder 工具字段（"明天9点叫我"）时写入本表，
--       每分钟扫描到点记录，写一条 assistant 聊天消息提醒用户。
--
-- 2. AI 决策追踪表
-- 对应代码：AgentTraceService.record（异常静默吞掉，缺表时只打 debug 日志）
-- 背景：AI 编排链路的关键决策留痕，input/output 均截断到 500 字符。
--
-- 执行方式：在 MySQL 客户端直接跑本文件（可重复执行）
-- 注意：显式 USE blog，避免 TiDB Cloud SQL Editor 默认连在 test 库时把表建错地方
-- =============================================================================

USE blog;

CREATE TABLE IF NOT EXISTS `ms_reminder` (
  `id`          VARCHAR(32)  NOT NULL COMMENT '雪花 ID',
  `user_id`     VARCHAR(32)  NOT NULL COMMENT '用户 ID',
  `content`     VARCHAR(512) NOT NULL COMMENT '提醒内容（"交作业"）',
  `remind_at`   BIGINT   NOT NULL COMMENT '应提醒时间戳（毫秒）',
  `status`      TINYINT      NOT NULL DEFAULT 0 COMMENT '0=待提醒 1=已派发 2=已取消',
  `create_date` BIGINT   DEFAULT NULL COMMENT '创建时间戳（毫秒）',
  PRIMARY KEY (`id`),
  KEY `idx_status_remind` (`status`, `remind_at`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 提醒待办';


CREATE TABLE IF NOT EXISTS `ms_agent_trace` (
  `id`          VARCHAR(32)  NOT NULL COMMENT '雪花 ID',
  `user_id`     VARCHAR(32)  DEFAULT NULL COMMENT '用户 ID',
  `scene`       VARCHAR(32)  NOT NULL COMMENT '场景（chat / reminder / roundtable ...）',
  `session_id`  VARCHAR(64)  DEFAULT NULL COMMENT '会话 ID',
  `event`       VARCHAR(64)  NOT NULL COMMENT '事件名',
  `input`       VARCHAR(512) DEFAULT NULL COMMENT '输入摘要（≤500 字符）',
  `output`      VARCHAR(512) DEFAULT NULL COMMENT '输出摘要（≤500 字符）',
  `latency_ms`  BIGINT   DEFAULT NULL COMMENT '耗时（毫秒）',
  `create_date` BIGINT   DEFAULT NULL COMMENT '创建时间戳（毫秒）',
  PRIMARY KEY (`id`),
  KEY `idx_scene_time` (`scene`, `create_date`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 决策追踪';
