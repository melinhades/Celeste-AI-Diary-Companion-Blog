-- =============================================================================
-- 自我迭代第三步：prompt 补丁提案
-- 对应代码：PromptProposalService.generate（读失败用例 → AI 归纳 → 落提案）
-- 背景：提案只写库，不碰源码、不自动生效；人工确认后再改 PromptBuilder。
-- 表名走 MyBatis-Plus 全局前缀 ms_。
--
-- 执行方式：在 MySQL 客户端直接跑本文件（可重复执行）
-- 注意：显式 USE blog，避免 TiDB Cloud SQL Editor 默认连在 test 库时把表建错地方
-- =============================================================================

USE blog;

CREATE TABLE IF NOT EXISTS `ms_prompt_proposal` (
  `id`            VARCHAR(32)   NOT NULL COMMENT '雪花 ID',
  `title`         VARCHAR(255)  DEFAULT NULL COMMENT '提案一句话概括',
  `scene`         VARCHAR(32)   NOT NULL COMMENT '场景（chat ...）',
  `case_ids`      VARCHAR(2048) DEFAULT NULL COMMENT '关联用例 ID（JSON 数组）',
  `fail_patterns` VARCHAR(1024) DEFAULT NULL COMMENT '失败模式归纳（JSON 数组）',
  `patch`         TEXT          DEFAULT NULL COMMENT '建议追加的规则片段（只追加，不改人设）',
  `patch_hash`    VARCHAR(64)   NOT NULL COMMENT '补丁内容哈希，用于去重',
  `rationale`     VARCHAR(1024) DEFAULT NULL COMMENT '为什么这么改',
  `risk`          VARCHAR(1024) DEFAULT NULL COMMENT '风险与影响面',
  `model`         VARCHAR(90)   DEFAULT NULL COMMENT '生成提案的模型',
  `status`        VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT 'pending / accepted / rejected',
  `create_date`   BIGINT        DEFAULT NULL COMMENT '创建时间戳（毫秒）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_patch_hash` (`patch_hash`),
  KEY `idx_status_time` (`status`, `create_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Prompt 补丁提案';
