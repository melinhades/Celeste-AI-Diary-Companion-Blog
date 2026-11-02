# 生产环境 Schema 漂移与 Redis 不可达修复

> 状态：待用户批准。只读诊断已完成。
> 约束：本 spec 不授权修改生产数据库、不授权改业务代码、不授权部署、不提交代码。
> 所有“执行”步骤需用户自己在 TiDB / Render / Cloudflare 控制台确认后操作，或另行明确授权。

## 0. 结论先行

线上“登录失效 + 文章加载失败”是**两个独立根因**，不是同一个问题：

| 现象 | 根因 | 证据 |
|---|---|---|
| 文章列表/热门/最新/归档/详情全部 `-999 系统异常` | 生产 `ms_article` 缺 `visibility` / `source_type` / `source_id` 列；运行中的后端已包含这些字段的代码，但迁移脚本从未在生产执行 | 用户提供的线上日志 `BadSqlGrammarException: Unknown column 'visibility' in 'where clause'` / `in 'field list'`；`Article.java` 与 `ArticleMapper.xml`；`migration-diary-to-article.sql` 于 2026-10-27 才加入，仓库无 Flyway/Liquibase |
| 登录失效、`/actuator/health` 503 | Redis 实例不可达（DOWN） | health 明细 `redis: DOWN, Unable to connect to Redis`；`LoginServiceImpl.login:50` 在查库前直接读 Redis 且无 try/catch；`TokenServiceImpl.checkToken:32` 同样 |

**不是根因的项（已实测排除）**：

- API base 不是 localhost / HTTP：线上 `js/api.js` 为 `const BASE_URL = 'https://api.instapix.icu';`，`login` 页与首页均无 `localhost` / `127.0.0.1` / `http://`。
- CORS 没有拒绝：`OPTIONS /articles`、`OPTIONS /login` 均 200；`Access-Control-Allow-Origin: https://www.instapix.icu`；`Access-Control-Allow-Credentials: true`；`Access-Control-Allow-Headers: content-type, authorization`。
- 不是 Cookie 的 Domain/Secure/SameSite 问题：前端不使用 Cookie，登录态是 `localStorage.token` + 原生 `Authorization` 请求头（不带 `Bearer ` 前缀），`fetch` 也没有 `credentials: 'include'`。因此 Cookie 三属性不适用。
- 前端旧版不是接口失败的原因：旧版只是 UI 和登出逻辑旧，API 域名本身正确。

**次级问题（会导致“看起来登录失效”，但不是主阻断）**：

- 线上前端约为 2026-09-19 版本（`js/api.js` 1,973 bytes，与 `e70505a` 一致）；`js/auth.js` 登出仍请求 `http://localhost:8888/logout`，服务端 `Token_<token>` 不会删除。
- `https://instapix.icu` 与 `https://www.instapix.icu` 都直接返回 200，没有 301/308 归一。`localStorage` 按 origin 隔离，在裸域登录后切到 www 会看不到 token（反之亦然）。
- wrangler 登录已过期（`Not logged in ... environment is non-interactive`），最新前端无法直接上传，但不影响本文两个接口根因。

## 1. 数据库事实

### 1.1 表名

MyBatis-Plus 全局配置 `table-prefix: ms_`，`Article` 无 `@TableName`，实际表名：

- `ms_article`（文章主表）
- `ms_article_body`（正文）
- `ms_article_tag`（文章-标签关联）

### 1.2 `visibility` 定义与索引（来自仓库迁移脚本）

文件：`blog-api/src/main/resources/sql/migration-diary-to-article.sql`

```sql
ALTER TABLE ms_article
    ADD COLUMN visibility   TINYINT     NOT NULL DEFAULT 1 COMMENT '1=公开 0=私密',
    ADD COLUMN source_type  VARCHAR(16) NULL COMMENT '来源类型：diary',
    ADD COLUMN source_id    VARCHAR(64) NULL COMMENT '来源 id（日记 id）',
    ADD UNIQUE KEY uk_article_source (author_id, source_type, source_id);

ALTER TABLE ms_article ADD KEY idx_visibility_create (visibility, create_date);
```

- `visibility`：`TINYINT NOT NULL DEFAULT 1`，0=私密，1=公开；存量行加列后自动为 1。
- `source_type` / `source_id`：可空；唯一键 `(author_id, source_type, source_id)` 保证一篇日记最多发布一次；NULL 组合在 MySQL/TiDB 中允许重复。
- 查询索引：`idx_visibility_create (visibility, create_date)`，服务首页/归档过滤。

### 1.3 为什么判断“迁移漏执行”

- `blog_backup.sql` 的 `CREATE TABLE ms_article` 只有 id、comment_counts、create_date、summary、title、view_counts、weight、author_id、body_id、category_id，**没有 visibility / source_type / source_id**。
- `migration-diary-to-article.sql` 由 commit `e6c3e7e`（2026-10-27）引入；仓库没有 Flyway/Liquibase，也没有任何启动时自动执行 SQL 的机制，迁移必须手工执行。
- 线上日志明确报 `Unknown column 'visibility'`，说明生产库仍是旧结构，而运行中的后端已是含 `visibility` 的新代码。
- 两个错误位置对应关系：
  - `in 'where clause'`：`ArticleMapper.xml` 的 `listArticle` / `listArchives`，以及 `hotArticle` / `newArticles` 的 `LambdaQueryWrapper.eq(visibility)`。
  - `in 'field list'`：`selectById` / `selectPage` 由 MyBatis-Plus 按 `Article` 实体生成显式列清单，包含 `visibility`、`source_type`、`source_id`；对应文章详情。

## 2. 安全迁移方案

### 2.1 执行前检查（只读）

```sql
-- 确认连到目标库，不是本地/测试库
SELECT DATABASE(), CURRENT_USER(), VERSION();

-- 记录完整表结构，作为执行前快照
SHOW CREATE TABLE ms_article;

-- 记录行数
SELECT COUNT(*) AS rows_total FROM ms_article;

-- 逐列核对是否已有部分列（避免整条 ALTER 因重复列失败）
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ms_article'
  AND COLUMN_NAME IN ('visibility','source_type','source_id');

-- 核对索引是否已存在
SHOW INDEX FROM ms_article
WHERE Key_name IN ('uk_article_source','idx_visibility_create');

-- 仅当 source_type/source_id 已存在且有数据时，检查唯一键冲突
SELECT author_id, source_type, source_id, COUNT(*) AS cnt
FROM ms_article
WHERE source_type IS NOT NULL AND source_id IS NOT NULL
GROUP BY author_id, source_type, source_id
HAVING COUNT(*) > 1;
```

### 2.2 备份（执行前必须完成）

任选其一，由用户在 TiDB 侧完成：

1. TiDB Cloud 控制台 → 目标集群 → Backup / Restore，创建一次手动快照，记录快照 ID 与时间。
2. 客户端逻辑备份：

```bash
mysqldump --single-transaction --no-tablespaces --set-gtid-purged=OFF \
  -h <MYSQL_HOST> -P <MYSQL_PORT> -u <MYSQL_USERNAME> -p \
  blog ms_article > ms_article_before_visibility.sql
```

不要在执行期间同时跑其他 DDL。

### 2.3 精确 DDL

**情况 A：三列都不存在（最可能）**

```sql
ALTER TABLE ms_article
    ADD COLUMN visibility   TINYINT     NOT NULL DEFAULT 1 COMMENT '1=公开 0=私密',
    ADD COLUMN source_type  VARCHAR(16) NULL COMMENT '来源类型：diary',
    ADD COLUMN source_id    VARCHAR(64) NULL COMMENT '来源 id（日记 id）',
    ADD UNIQUE KEY uk_article_source (author_id, source_type, source_id);

ALTER TABLE ms_article
    ADD KEY idx_visibility_create (visibility, create_date);
```

**情况 B：只缺其中一部分**

按缺失项拆开执行，已存在的列/索引不要重复添加：

```sql
ALTER TABLE ms_article ADD COLUMN visibility  TINYINT NOT NULL DEFAULT 1 COMMENT '1=公开 0=私密';
ALTER TABLE ms_article ADD COLUMN source_type VARCHAR(16) NULL COMMENT '来源类型：diary';
ALTER TABLE ms_article ADD COLUMN source_id   VARCHAR(64) NULL COMMENT '来源 id（日记 id）';
ALTER TABLE ms_article ADD UNIQUE KEY uk_article_source (author_id, source_type, source_id);
ALTER TABLE ms_article ADD KEY idx_visibility_create (visibility, create_date);
```

### 2.4 是否需要停机

- 预计**不需要停机**。TiDB 的 `ADD COLUMN` 为在线元数据变更；`ADD INDEX` 为在线回填，允许并发读写。当前 `ms_article` 只有个位数行，DDL 秒级完成。
- 后端无需重启：运行中的 MyBatis-Plus 在执行下一条 SQL 时会直接看到新列。
- 真正的停机点不是 DDL，而是 DDL 之前/之后的部署顺序：当前是“新后端 + 旧库”，所以文章接口已经全挂；先补库即可恢复，不需要回滚后端。
- 若 TiDB 集群有 schema change 队列/限流，等待 DDL 完成再验证，不要并发重复提交。

### 2.5 回滚（仅在必须回退后端代码时）

```sql
ALTER TABLE ms_article DROP INDEX idx_visibility_create;
ALTER TABLE ms_article DROP INDEX uk_article_source;
ALTER TABLE ms_article DROP COLUMN source_id;
ALTER TABLE ms_article DROP COLUMN source_type;
ALTER TABLE ms_article DROP COLUMN visibility;
```

注意：删除 `visibility` 会丢失已设置的私密状态；当前存量行默认全为 1，风险低，但仍需先备份。

### 2.6 执行后验证

SQL：

```sql
SHOW CREATE TABLE ms_article;

SELECT id, title, visibility, source_type, source_id, create_date
FROM ms_article
ORDER BY create_date DESC
LIMIT 5;

SELECT COUNT(*) AS public_rows FROM ms_article WHERE visibility = 1;
SELECT COUNT(*) AS private_rows FROM ms_article WHERE visibility = 0;
```

HTTP（`https://api.instapix.icu`，`Origin: https://www.instapix.icu`）：

| 请求 | 期望 |
|---|---|
| `POST /articles`，body `{"page":1,"pageSize":5}` | HTTP 200，`success:true`，`data.records` 非空，`data.total` > 0 |
| `POST /articles/hot` | `success:true` |
| `POST /articles/new` | `success:true` |
| `POST /articles/listArchives` | `success:true` |
| `POST /articles/article/view/<公开文章id>` | `success:true`，`data.body` 有内容 |
| `POST /articles/article/view/<私密文章id>`（无 token） | `success:false, code:403`，不再是 -999 |

失败判据：若仍出现 `-999`，抓后端日志确认是否仍为 `Unknown column`；若不是，再按新异常定位。

## 3. Redis 与登录问题

### 3.1 判定：登录失败不是文章查询失败导致的

`LoginServiceImpl.login` 的执行顺序是：

1. 参数校验。
2. `redisTemplate.opsForValue().get("login_lock_" + account)`（第 50 行，**无 try/catch**）。
3. 查用户、校验密码。
4. 写 `Token_<token>` 到 Redis（第 90 行，**无 try/catch**）。

Redis 不可达时，第 2 步就抛 `RedisConnectionFailureException`，由 `AllExceptionHandler` 统一返回 `-999 系统异常`，根本走不到文章查询，也不会签发 token。

即使本地还留着旧 token，`TokenServiceImpl.checkToken` 第 32 行同样直接读 Redis；Redis 挂了就无法校验，受保护接口也会失败。

因此：

- **只修 visibility 迁移，登录仍然失败**。
- **只恢复 Redis，文章仍然 -999**。
- 两者必须分别修复。

判别方法：

- 若页面头部还能显示昵称（`localStorage.token` + `nickname` 存在），但文章列表报错 → 文章查询问题为主。
- 若 `POST /login` 本身返回 `-999`，或登录后受保护接口全部失败 → Redis/认证问题。
- 当前 health 已明确 Redis DOWN，因此登录路径必然失败，与是否能看到旧昵称无关。

### 3.2 需要检查的配置

文件 `blog-api/src/main/resources/application-prod.yml`：

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      password: ${REDIS_PASSWORD:}
      timeout: 3000ms
```

待用户在 Render 控制台确认（不需要我登录）：

1. 服务是否以 `SPRING_PROFILES_ACTIVE=prod` 启动。
2. `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 是否设置且指向仍存活的实例；若未设置则回落到 `localhost:6379`，容器内必为 DOWN。
3. Redis 提供商侧实例状态、免费额度/到期、网络白名单、是否要求 TLS。
4. Render 日志中 `RedisConnectionFailureException` 的完整 cause（连接拒绝 / DNS / 认证 / 超时）。
5. 修复后在 Render 触发 restart/redeploy，再验 `/actuator/health` 返回 200 且 `redis: UP`。

### 3.3 代码层风险（不在本次实现范围）

`LoginServiceImpl.login:50`、`TokenServiceImpl.checkToken:32`、`LoginServiceImpl.logout:129` 对 Redis 无降级。是否加 try/catch 或 fail-open 属于认证语义变更，需单独批准；本 spec 不建议在生产故障窗口顺手改代码。

## 4. 前端部署（次级，不阻断接口修复）

- 项目：Cloudflare Pages `instapix`（账号 `5deea33a1b45460d0c37c19879508e95`），**Direct Upload**，不是 Git 集成。
- 仓库 CI `.github/workflows/ci.yml` 只做 Maven 校验，没有 Pages 部署步骤。
- 现有部署命令：

```bash
npx wrangler pages deploy blog-ui --project-name instapix
```

- 当前卡点：wrangler 未登录（`Not logged in. Your auth token has expired ... environment is non-interactive`）。需要用户交互执行 `npx wrangler login`，或提供 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`。
- 最新前端目前只在本地工作区：`master` 领先 4 个未推送 commit，且 `blog-ui` 有大量未提交改动；不能用 Git 集成方式部署。
- 部署前应先修 Redis + 执行迁移，否则新前端仍会显示接口错误。
- 部署后验证：`/js/api.js` 大小不再是 1,973 bytes；`/js/index-bird.js` 返回 `application/javascript` 而不是首页 HTML；`auth.js` 不再包含 `localhost:8888`。

## 5. 验收标准

1. `SHOW CREATE TABLE ms_article` 含 `visibility TINYINT NOT NULL DEFAULT 1`、`source_type`、`source_id`、`uk_article_source`、`idx_visibility_create`。
2. `/articles`、`/articles/hot`、`/articles/new`、`/articles/listArchives`、`/articles/article/view/{id}` 均 `success:true`（公开文章）。
3. `/actuator/health` 返回 200，`redis: UP`。
4. 真实账号 `POST /login` 返回 token；`GET /users/currentUser` 带 token 返回 `success:true`。
5. 受保护接口在无 token 时返回“未登录”，不再是 `-999`。
6. `/articles/article/view/{私密id}` 匿名返回 403，作者带 token 可读。

## 6. 已知限制

- 未直接访问生产数据库；表结构判断基于线上报错、仓库基线 SQL 和迁移脚本。
- 未使用真实账号登录（避免操作账号），登录失败结论来自代码路径 + Redis DOWN，不是实测登录响应。
- Redis 为何不可达（环境变量缺失 / 实例下线 / 网络 / 认证）需 Render 控制台与日志确认，无法从公开 HTTP 推断。
- Cloudflare 精确 deployment ID / 时间需 Dashboard 或 API token；当前只能从静态资源哈希与 `.wrangler` 缓存时间推断。

## 7. 需要批准

请用户确认以下任一项后再进入执行：

- [ ] 授权我仅生成迁移/验证命令，由用户在 TiDB 控制台执行（默认，最安全）。
- [ ] 授权我在获得临时只读数据库连接后先跑 2.1 的只读检查（仍需用户提供连接方式，且不改数据）。
- [ ] 授权我在 Redis 修复后重新部署前端（需先完成 `wrangler login` 或提供 API token）。

未获得上述授权前，不执行任何生产变更。
