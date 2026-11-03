-- 用户自定义 AI API Key 支持
-- 执行条件：sys_user 表存在、无 api_key 列
ALTER TABLE sys_user
    ADD COLUMN api_key VARCHAR(128) DEFAULT NULL
    COMMENT '用户自定义 AI API Key，为空则使用系统默认 Key（application-prod.yml 中 ai.api-key）'
    AFTER signature;
