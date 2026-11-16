-- =============================================================================
-- 自我迭代第二步：评测基准集
-- 对应代码：EvalCaseService.promote（把 👎 反馈 / 人格检查失败固化成用例）
-- 背景：差评与红线失败不再只停留在日志里，入池后作为改 prompt 的回归基准。
-- 表名走 MyBatis-Plus 全局前缀 ms_，实体 EvalCase 不写 @TableName。
--
-- 执行方式：在 MySQL 客户端直接跑本文件（可重复执行）
-- 注意：显式 USE blog，避免 TiDB Cloud SQL Editor 默认连在 test 库时把表建错地方
-- =============================================================================

USE blog;

CREATE TABLE IF NOT EXISTS `ms_eval_case` (
  `id`           VARCHAR(32)  NOT NULL COMMENT '雪花 ID',
  `source`       VARCHAR(32)  NOT NULL COMMENT '来源：feedback=👎反馈 / persona_fail=人格检查失败',
  `source_id`    VARCHAR(64)  NOT NULL COMMENT '来源记录 ID（diary_chat_log.id / ms_agent_trace.id）',
  `scene`        VARCHAR(32)  DEFAULT NULL COMMENT '场景（chat / roundtable ...）',
  `session_id`   VARCHAR(64)  DEFAULT NULL COMMENT '会话 ID',
  `user_id`      VARCHAR(32)  DEFAULT NULL COMMENT '用户 ID',
  `case_input`   VARCHAR(1024) DEFAULT NULL COMMENT '被评测的输入（日记草稿 / 触发句）',
  `bad_output`   VARCHAR(1024) DEFAULT NULL COMMENT '当时的坏输出',
  `expected`     VARCHAR(512) DEFAULT NULL COMMENT '期望结果：失败规则号或人工补充的标准答案',
  `status`       VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending=待人工标注 / ready=可直接回归 / dropped=已废弃',
  `create_date`  BIGINT       DEFAULT NULL COMMENT '创建时间戳（毫秒）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source` (`source`, `source_id`),
  KEY `idx_status_time` (`status`, `create_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent 评测基准集';
