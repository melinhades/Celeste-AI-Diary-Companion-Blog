# Tasks — 生产 Schema 漂移与 Redis 不可达

> 执行前提：用户批准 `spec.md` 第 7 节。
> 禁止：未经授权操作生产数据库、提交代码、部署、操作无关外部账号。

## 本次执行状态（2026-11-02）

- T1、T1b 已完成。
- T2-T9 未执行：当前环境没有 `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USERNAME` / `MYSQL_PASSWORD`、`REDIS_HOST` / `REDIS_PASSWORD`、`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`；且用户明确禁止直接操作生产数据库。
- 未修改生产数据库、未修改业务代码、未提交、未推送、未部署。

## T1. 只读诊断（已完成）

- [x] 确认前端 API base 为 `https://api.instapix.icu`，无 localhost / HTTP。
- [x] 确认 CORS 放行 `https://www.instapix.icu`，preflight 200，允许 `authorization`，`ACAC: true`。
- [x] 确认前端使用 `localStorage.token` + `Authorization` 头，不使用 Cookie。
- [x] 确认线上前端旧版（`api.js` 1,973 bytes ≈ `e70505a`，`auth.js` 登出指向 `localhost:8888`）。
- [x] 确认 `ms_article` 基线无 `visibility` / `source_type` / `source_id`。
- [x] 确认迁移脚本由 `e6c3e7e`（2026-10-27）引入，仓库无 Flyway/Liquibase。
- [x] 确认 `LoginServiceImpl.login:50`、`TokenServiceImpl.checkToken:32` 对 Redis 无降级。
- [x] 确认 `/actuator/health` 503 且 `redis: DOWN`。
- [x] 确认 wrangler 未登录，无法部署。

## T1b. 离线 DDL 校验（已完成，非生产）

- [x] 在本机 MySQL 5.7 临时库 `blog_ddl_verify_20261102` 创建 `blog_backup.sql` 的基线 `ms_article`。
- [x] 执行 `spec.md` 2.3 情况 A 的两条 DDL，无语法错误。
- [x] 确认存量行 `visibility` 自动为 `1`（public）。
- [x] 确认 `uk_article_source` 允许多条 `(author_id, NULL, NULL)`，不阻塞存量数据。
- [x] 确认 `idx_visibility_create (visibility, create_date)` 生效。
- [x] 已删除临时库与临时 SQL 文件，未触碰仓库 `blog` 库。

## T2. 数据库备份（阻塞：需用户执行）

- [ ] 在 TiDB Cloud 控制台创建手动快照，记录快照 ID / 时间。
- [ ] 或执行 `mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF ... blog ms_article > ms_article_before_visibility.sql`。
- 完成判据：备份文件/快照可读，记录行数与 `SELECT COUNT(*) FROM ms_article` 一致。

## T3. 执行前只读检查（阻塞：需 DB 访问授权）

- [ ] `SELECT DATABASE(), CURRENT_USER(), VERSION();`
- [ ] `SHOW CREATE TABLE ms_article;`
- [ ] `SELECT COUNT(*) FROM ms_article;`
- [ ] 查询 `information_schema.COLUMNS` 确认三列是否存在。
- [ ] `SHOW INDEX FROM ms_article WHERE Key_name IN ('uk_article_source','idx_visibility_create');`
- [ ] 若 source 列已存在，检查唯一键重复。
- 完成判据：明确属于 spec 2.3 的情况 A 或情况 B，并记录实际列/索引清单。

## T4. 执行迁移（阻塞：需用户授权执行）

- [ ] 按情况 A/B 执行对应 `ALTER TABLE`。
- [ ] 等待 TiDB DDL 任务完成，不并发重复提交。
- 完成判据：`SHOW CREATE TABLE ms_article` 含三列、唯一键、普通索引。

## T5. 文章接口验证（阻塞：需 T4 完成）

- [ ] `POST /articles` → `success:true`，records 非空。
- [ ] `POST /articles/hot` / `/new` / `/listArchives` → `success:true`。
- [ ] `POST /articles/article/view/{公开id}` → `success:true`。
- [ ] 匿名访问私密文章 → `code:403`，不是 -999。
- [ ] 若仍 -999，抓取后端日志确认新异常，不回退迁移。

## T6. Redis 恢复（阻塞：需 Render / Redis 控制台权限）

- [ ] 检查 `SPRING_PROFILES_ACTIVE=prod`。
- [ ] 检查 `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 是否设置且实例存活。
- [ ] 检查 Redis 免费额度、到期、白名单、TLS 要求。
- [ ] 查看 Render 日志中 `RedisConnectionFailureException` 的完整 cause。
- [ ] 修复后 restart/redeploy。
- 完成判据：`/actuator/health` 200 且 `redis: UP`。

## T7. 登录与鉴权验证（阻塞：需 T6 完成）

- [ ] 用真实账号 `POST /login`，确认返回 `success:true` + token。
- [ ] `GET /users/currentUser` 带 token → `success:true`。
- [ ] 无 token 访问受保护接口 → “未登录”，不是 -999。
- [ ] `GET /logout` 后旧 token 再访问 → 未登录。
- 注意：线上旧 `auth.js` 登出仍打 `localhost:8888`，需前端新版部署后才修好。

## T8. 前端重新部署（阻塞：需 wrangler 登录或 API token）

- [ ] 用户执行 `npx wrangler login`，或提供 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`。
- [ ] `npx wrangler pages deploy blog-ui --project-name instapix`。
- [ ] 验证 `/js/api.js` 大小不再是 1,973 bytes。
- [ ] 验证 `/js/index-bird.js`、`/js/page-loading.js`、`/css/index-bird.css` 返回 `application/javascript` / `text/css`，不再是首页 HTML。
- [ ] 验证 `auth.js` 不再包含 `localhost:8888`。
- 注意：本地最新前端未提交、未推送；禁止用 Git 集成方式部署。

## T9. 回归与收口（阻塞：需 T5 + T7 + T8）

- [ ] 首页文章列表正常渲染。
- [ ] 文章详情正文正常渲染。
- [ ] 登录、登出、刷新后登录态正常。
- [ ] `/actuator/health` 200。
- [ ] `www.instapix.icu` 与 `instapix.icu` 各自登录态说明写入交付说明（localStorage 按 origin 隔离，不做跨域共享）。
- [ ] 记录最终部署时间 / commit / deployment ID（需 Cloudflare 权限）。
