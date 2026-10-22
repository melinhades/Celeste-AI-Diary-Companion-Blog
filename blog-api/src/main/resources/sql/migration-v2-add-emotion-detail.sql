-- =============================================================================
-- Madeline 情绪分析 v2 迁移脚本：为已部署的 diary_chat_log 加 emotion_score_detail
-- 执行条件：diary_chat_log 已存在、无 emotion_score_detail 列
-- 执行方式：在 MySQL 客户端直接跑，或 Flyway / Liquibase 迁移
-- =============================================================================

-- 先查列是否存在（MySQL 5.7+）：
-- SELECT COUNT(*) FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diary_chat_log' AND COLUMN_NAME = 'emotion_score_detail';
-- 如果返回 0，再执行下面这条 ALTER：

ALTER TABLE `diary_chat_log`
    ADD COLUMN `emotion_score_detail` TEXT DEFAULT NULL
    COMMENT 'JSON：深度情绪分析全量输出（Plutchik/锚点/矛盾/轨迹特征/跨日记趋势/自适应权重/消融标记）'
    AFTER `emotion_type`;

-- 回滚（如需）：
-- ALTER TABLE `diary_chat_log` DROP COLUMN `emotion_score_detail`;
