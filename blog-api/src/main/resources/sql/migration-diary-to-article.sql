-- 日记 → 博客一键发布 & 隐私切换
-- 说明：
--   1. visibility 默认 1(公开)，保证存量文章迁移后仍可访问；
--      从日记发布的新文章在代码里显式置 0(私密)，由用户确认后再公开。
--   2. uk_article_source 保证「一篇日记最多发布一次」，并发/重试由数据库兜底。
--      source_type / source_id 为 NULL 时 MySQL 允许重复 NULL，手动发布的文章不受影响。

ALTER TABLE ms_article
    ADD COLUMN visibility   TINYINT     NOT NULL DEFAULT 1 COMMENT '1=公开 0=私密',
    ADD COLUMN source_type  VARCHAR(16) NULL COMMENT '来源类型：diary',
    ADD COLUMN source_id    VARCHAR(64) NULL COMMENT '来源 id（日记 id）',
    ADD UNIQUE KEY uk_article_source (author_id, source_type, source_id);

-- 首页/归档查询按可见性过滤
ALTER TABLE ms_article ADD KEY idx_visibility_create (visibility, create_date);
