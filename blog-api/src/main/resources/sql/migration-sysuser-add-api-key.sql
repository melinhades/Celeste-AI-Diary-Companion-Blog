-- 用户自定义 AI API Key 支持
-- 执行条件：ms_sys_user 表存在、无 api_key 列（注意全局表前缀 ms_）
ALTER TABLE ms_sys_user
    ADD COLUMN api_key VARCHAR(128) DEFAULT NULL
    COMMENT '用户自定义 AI API Key，为空则使用系统默认 Key（application-prod.yml 中 ai.api-key）'
    AFTER signature;

-- 自定义 Key 的服务商：保存 Key 时由探测结果写入，全局 AI 调用据此选择端点/模型
ALTER TABLE ms_sys_user
    ADD COLUMN api_provider VARCHAR(20) DEFAULT NULL
    COMMENT '自定义 Key 服务商：siliconflow（默认/空）| deepseek'
    AFTER api_key;
