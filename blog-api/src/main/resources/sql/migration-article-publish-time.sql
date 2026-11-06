-- 文章「首次公开时间」publish_time
-- 说明：
--   1. create_date 记录的是文章创建（写入博客）的时刻，日记一键发布的文章先处于私密态，
--      作者确认公开的时刻此前没有落库，这里补一列记下来。
--   2. 排序与展示仍以 create_date 为准（idx_visibility_create 的契约不变），
--      publish_time 只用于状态展示与审计，避免私密文章转公开后在列表里「插队」。
--   3. 存量数据里 visibility=1 的文章没有「先私密再公开」的过程，用 create_date 回填，语义等价；
--      仍为私密的文章保持 NULL，等作者真正点公开时由代码写入。
--   4. 仓库没有 Flyway/Liquibase。应用启动时 SchemaInitializer 会兜底补列并做同样的回填，
--      本脚本用于受控的手工变更（生产建议先在维护窗口执行，不要让启动钩子静默改结构）。
--   5. 不建索引：当前没有任何查询按 publish_time 过滤或排序，列表仍走 idx_visibility_create；
--      将来真要按公开时间排序时，再一起把索引补进本脚本与 SchemaInitializer。

ALTER TABLE ms_article ADD COLUMN publish_time BIGINT NULL COMMENT '首次公开时间戳（毫秒）';

UPDATE ms_article SET publish_time = create_date WHERE visibility = 1 AND publish_time IS NULL;

-- 回滚：
--   ALTER TABLE ms_article DROP COLUMN publish_time;
