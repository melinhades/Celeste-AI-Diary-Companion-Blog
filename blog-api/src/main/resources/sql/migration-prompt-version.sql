-- =============================================================================
-- 自我迭代第四步：prompt 版本 + 灰度 + 回滚
-- 对应代码：PromptVersionService（采纳提案 / 按用户哈希灰度 / 指标恶化自动回滚）
-- 背景：采纳不等于全量；先按 userId 哈希灰度，👎 率相对基线恶化就自动下线。
--
-- 执行方式：在 MySQL 客户端直接跑本文件
-- 注意：ALTER 语句只在首次执行；若 diary_chat_log 已有 prompt_version 列请跳过第二段
-- =============================================================================

USE blog;

CREATE TABLE IF NOT EXISTS `ms_prompt_version` (
  `id`                     VARCHAR(32)   NOT NULL COMMENT '雪花 ID',
  `scene`                  VARCHAR(32)   NOT NULL COMMENT '场景（chat ...）',
  `patch`                  TEXT          DEFAULT NULL COMMENT '生效的追加规则',
  `patch_hash`             VARCHAR(64)   DEFAULT NULL COMMENT '补丁内容哈希',
  `source_proposal_id`     VARCHAR(32)   DEFAULT NULL COMMENT '来源提案 ID',
  `rollout_percent`        INT           NOT NULL DEFAULT 100 COMMENT '灰度比例 1-100（按 userId 哈希分桶）',
  `baseline_negative_rate` DECIMAL(6,4)  DEFAULT NULL COMMENT '采纳时近 7 天 👎 率基线',
  `status`                 VARCHAR(16)   NOT NULL DEFAULT 'active' COMMENT 'active / retired / rolled_back',
  `create_date`            BIGINT        DEFAULT NULL COMMENT '创建时间戳（毫秒）',
  PRIMARY KEY (`id`),
  KEY `idx_scene_status` (`scene`, `status`),
  KEY `idx_proposal` (`source_proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Prompt 补丁版本（灰度/回滚）';

-- 每轮对话记录本轮命中的补丁版本，未命中灰度为 NULL。
-- 重复执行会报 Duplicate column，属正常，跳过即可。
ALTER TABLE `diary_chat_log`
  ADD COLUMN `prompt_version` VARCHAR(32) DEFAULT NULL COMMENT '本轮生效的 prompt 补丁版本 ID' AFTER `filter_reason`;
