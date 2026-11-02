# Tasks

> 顺序执行：Phase 1 全部完成并验证后，再做 Phase 2。每步只改 `spec.md` 列出的文件；不提交代码。

## Phase 1：三个高危问题

### T1.1 后端草莓余额权威化

- [x] `SysUserService` 新增 `grantDiaryBerry(String userId)`、`claimSeedBerry(String token)`，并修正 `adjustBerry` 注释。
- [x] `SysUserServiceImpl`：
  - [x] `adjustBerry` 拒绝 `delta > 0`（403）；`delta == 0/null`、`delta < -100000` 返回 400；负向消费用 `berry >= spend` 条件更新，余额不足返回 400，余额不为负。
  - [x] 新增 `grantDiaryBerry`：按 userId 原子 `+1`。
  - [x] 新增 `claimSeedBerry`：Redis `berry_seed_claim_{userId}` 6 小时 `setIfAbsent`；首次 +1，重复返回 `granted=false` + 权威余额；Redis 异常返回 503，不发放、不 fail-open。
- [x] `UserController` 新增 `POST /users/berry/seed-claim`；更新 `POST /users/berry` 注释。
- [x] `BerryParam` 只更新注释，请求结构不变。
- [x] `DiaryServiceImpl` 仅新增日记分支插入成功后调用 `grantDiaryBerry(userId)`，异常 `log.warn` 不影响保存。
- [x] 验收：公开 `POST /users/berry` 无法正向加余额；新日记 +1 仍生效；编辑日记不发放；余额不足无法扣成负数。

### T1.2 前端草莓调用改造

- [x] `api.js` 删除正向 `addBerries`；`spendBerries` 只发 `{delta:-n}` 并保留乐观回滚；新增 `claimSeedBerry()`；删除 `flushPendingBerries` 正向补账，加载时清理 `berryPendingCredit`。
- [x] `diary.js:2225` `addBerries(1)` → `syncBerryBalance()`。
- [x] `seed.js:714-716、757-759` `window.addBerries(1)` → `window.claimSeedBerry()`，保留类型判断和 try/catch，更新注释。
- [x] 验收：前端无正向 delta 调用；未登录不再攒 pending；服务端返回余额驱动 UI。

### T1.3 文章正文 XSS 清洗

- [x] 新增本地 `blog-ui/js/purify.min.js`（DOMPurify 3.2.6）。
- [x] `article.html` 在 `marked.min.js` 后、`article.js` 前引入 `purify.min.js`。
- [x] `article.js` 正文构建：
  - [x] 有原始 `content` 时始终 `marked.parse`，不再因含 HTML 标签跳过。
  - [x] 最终 HTML 统一 `DOMPurify.sanitize(body, {USE_PROFILES:{html:true}})` 后再赋给 `bodyHtml`。
  - [x] DOMPurify 缺失时 `escHtml` fail-closed。
- [x] 验收：`article.html:74` 的 `v-html` 路径被覆盖；正常 Markdown 排版保留；代码块中的 `<script setup>` 不再触发原始 HTML 注入。

### T1.4 线上登出

- [x] `auth.js` 的 `doLogout`：在删除 localStorage token 前调用 `api('/logout','GET')`，由 `api.js` 的 `BASE_URL` 决定地址。
- [x] 保留本地 token/nickname/展示缓存清理和 `initHeader()`。
- [x] 验收：`auth.js` 无 `localhost:8888/logout`；生产域名通过 `BASE_URL` 调服务端注销；本地状态清理。

### T1.5 Phase 1 最小验证

- [x] `mvn -pl blog-api -am -DskipTests compile` 通过。
- [x] `node --check` 通过：`api.js`、`diary.js`、`seed.js`、`article.js`、`auth.js`、`purify.min.js`。
- [x] 静态检查：无正向 `POST /users/berry`；无 `addBerries(1)`/`flushPendingBerries` 正向调用；`purify.min.js` 引入顺序正确；`api('/logout'` 存在。
- [x] 记录未覆盖：未创建测试账号做登录态端到端草莓验证。

## Phase 2：Redis 文章读缓存 fail-open

### T2.1 重写 CacheAspect

- [x] 注解解析用 `MethodSignature` + `AopUtils.getMostSpecificMethod` + `AnnotationUtils.findAnnotation`；取不到注解直接查库。
- [x] 配置项：`blog.cache.enabled`、`blog.cache.redis-timeout-ms=300`、`blog.cache.failure-threshold=3`、`blog.cache.open-duration-ms=30000`，写入 `application.properties`，支持环境变量。
- [x] 有界守护线程池 + `Future.get(timeout)` 实现短超时；拒绝任务视为缓存不可用。
- [x] 连续失败熔断：达到阈值打开 30 秒；打开/关闭记日志；`enabled=false` 完全绕过缓存。
- [x] 读异常/超时：`log.warn` + Micrometer 计数器（存在时）+ 继续 `pjp.proceed()`，绝不返回 -999。
- [x] 缓存值 `null`/`"null"`/坏 JSON 不作为正常值；坏 key 删除后按未命中处理。
- [x] 仅缓存非 null 且 `Result.success == true` 的结果；`Result.fail` 不缓存。
- [x] 回填异步、失败只记日志/指标；熔断打开时不回填。
- [x] `ConcurrentHashMap<String, ReentrantLock>` + `tryLock(50ms)` 做 key 级防击穿；拿不到锁直接查库不回填。
- [x] `pjp.proceed()` 不在缓存 catch 内，业务/DB 异常继续抛给全局异常处理器。
- [x] 线程池 `@PreDestroy` 关闭。
- [x] 验收：Redis 读/写异常只影响缓存，不影响业务返回；业务异常不再被吞成 -999。

### T2.2 文章读接口缓存范围

- [x] `ArticleController` 给 `listArticle`、`hotArticle`、`newArticles`、`listArchives` 加 `@Cache(name="article", expire=30_000)`。
- [x] `findArticleById` 不加缓存，保持 DB 查询、私密可见性校验和阅读数更新。
- [x] 验收：公开读接口有短 TTL 缓存；详情不依赖 Redis；API 返回结构不变。

### T2.3 边界确认

- [x] `TokenServiceImpl`、`LoginServiceImpl` 不改 fail-open 行为。
- [x] `claimSeedBerry` 保持 fail-closed，Redis 异常返回 503。
- [x] 验收：安全相关 Redis 依赖故障时不会绕过鉴权/限流/冷却。

### T2.4 Phase 2 最小验证

- [x] 后端编译通过。
- [x] 起临时实例（如 8899）并 `--spring.data.redis.port=1` 模拟 Redis 不可用。
- [x] 验证 `POST /articles`、`/articles/hot`、`/articles/new`、`/articles/listArchives` 返回 `success=true` 且有数据。
- [x] 验证文章详情：不存在 id 返回业务 404 而非 -999；如用真实文章，记录阅读数 +1 的副作用。
- [x] 验证 `--blog.cache.enabled=false` 时直接查库。
- [x] 日志出现 fail-open/熔断记录，无文章接口 -999。
- [x] 记录未覆盖：未做全量测试/压测；未长时间停生产 Redis。

## 最终输出

- [x] 中文 Markdown 汇报：Phase 1 实际文件与行为、关键位置、验证结果；Phase 2 根因、改动文件、核心机制、失败路径、验证结果；统一列出未覆盖限制。
- [x] 不提交代码；保留工作区已有未提交改动。
