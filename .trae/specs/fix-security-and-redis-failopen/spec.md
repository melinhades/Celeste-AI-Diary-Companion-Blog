# 修复三项高危问题 + 文章读缓存 Redis fail-open

> 状态：待确认。确认后才进入实现；实现前不修改业务代码。
>
> 约束：工作区已有未提交改动，必须保留，不得回退、覆盖或顺手重构无关代码；不提交代码。Phase 1（三个高危问题）完成并做最小验证后，再进入 Phase 2（Redis fail-open）。

## 0. 结论先行

### Phase 1：三个已确认高危问题

1. **草莓余额任意增减**：`POST /users/berry` 直接信任客户端 `delta`，普通登录用户可自行加最多 100000。修复为：正向 `delta` 一律拒绝；负向消费保留但加余额充足校验；新日记 +1 和草莓籽 +1 改为服务端权威发放。
2. **文章正文存储型 XSS**：`article.js` 在正文含 HTML 标签时跳过 `marked.parse`，原始正文直接进入 `article.html` 的 `v-html`。修复为：Markdown 解析后统一用本地 DOMPurify 清洗，再交给 `v-html`。
3. **线上登出失效**：`auth.js` 硬编码 `http://localhost:8888/logout`。修复为：通过 `api.js` 的 `api('/logout','GET')` 使用项目已有 `BASE_URL`，在清除本地 token 前发起服务端注销。

### Phase 2：Redis 故障时文章读取 fail-open

**代码事实（已只读核对）**：

- `ArticleController` / `ArticleServiceImpl` 的文章列表、热门、最新、归档、详情**当前没有 `@Cache` 注解**，所以当前源码里这些接口不经过 Redis 缓存。
- 项目唯一的读缓存组件是 `blog-api/.../common/cache/CacheAspect.java`，切点只匹配 `@com.mszlu.blog.common.cache.Cache`。它当前的行为是 **fail-closed**：捕获任何 `Throwable`（包括 Redis 读/写失败，也包括业务方法自身异常）后统一返回 `Result.fail(-999, "系统错误")`。一旦文章读方法被 `@Cache` 标注（生产旧版本或后续改动），Redis 故障就会复现“文章接口整体 -999”。
- Redis 的其余用途：`TokenServiceImpl.checkToken`（鉴权）、`LoginServiceImpl`（登录限流/登录态写入）、以及本 Phase 1 新增的草莓籽领取冷却。非缓存类安全依赖**不 fail-open**。

**Phase 2 决策**：

- 重写 `CacheAspect` 为真正的读缓存 fail-open：缓存读异常/超时只记日志与指标，继续查库；查库成功后异步尽力回填；绝不把 null 或业务失败缓存为正常值；业务方法异常不再被切面吞成 -999。
- 仅给**公开**的文章列表、热门、最新、归档加 30 秒短 TTL 缓存；文章详情不加缓存，保持“按 id 查库 + 私密文章可见性校验 + 阅读数更新”的现有语义，因此 Redis 故障对详情无影响，也不会发生私密文章被缓存泄露。
- 增加短超时（默认 300ms）、连续失败熔断（默认 3 次、打开 30 秒）、降级开关（`blog.cache.enabled`）、单机 key 级防击穿锁。
- 鉴权、登录限流、草莓籽领取冷却保持 fail-closed；Redis 故障时返回明确错误，不绕过安全校验。

## 1. Phase 1：草莓余额权威化

### 1.1 现状与漏洞

- `BerryParam` 只有 `Integer delta`，无任何校验。
- `SysUserServiceImpl.adjustBerry` 只拒绝 `null`、`0`、`|delta| > 100000`，普通登录用户可直接 `POST /users/berry {"delta":100000}` 加余额。
- 前端正向入账入口：
  - `blog-ui/js/api.js` 的 `addBerries(n)`：正负都 POST `delta`；
  - `blog-ui/js/diary.js:2225` 新日记保存成功后 `addBerries(1)`；
  - `blog-ui/js/seed.js:714-716、757-759` 草莓籽收集完成/中断恢复时 `window.addBerries(1)`；
  - `blog-ui/js/api.js:108-125` 的 `flushPendingBerries()` 会把未登录期间攒的 `berryPendingCredit` 以正向 `delta` POST 到服务端。
- `spendBerries` 目前没有实际调用点；`POST /users/berry` 没有其他前端或后台调用方。

### 1.2 后端改动

#### A. `blog-api/src/main/java/com/mszlu/blog/service/SysUserService.java`

新增两个服务端权威方法，并修正 `adjustBerry` 注释：

```java
/** 新日记保存成功后的服务端权威奖励（+1 草莓，仅内部调用） */
void grantDiaryBerry(String userId);

/** 草莓籽收集奖励领取：服务端按 6 小时冷却发放 +1，客户端不能传金额 */
Result claimSeedBerry(String token);

/** 原子消费草莓（delta 必须为负），余额不允许为负；正向变动只能由服务端业务发放 */
Result adjustBerry(String token, Integer delta);
```

#### B. `blog-api/src/main/java/com/mszlu/blog/impl/SysUserServiceImpl.java`

1. 新增 Redis 依赖与常量：

```java
@Autowired
private RedisTemplate<String, String> redisTemplate;

private static final String SEED_CLAIM_KEY_PREFIX = "berry_seed_claim_";
private static final long SEED_CLAIM_COOLDOWN_HOURS = 6;
```

2. `adjustBerry` 改为**只接受负向消费**：

```java
if (delta == null || delta == 0) return Result.fail(400, "delta 非法");
if (delta > 0) return Result.fail(403, "草莓只能通过服务端业务奖励获得");
if (delta < -100000) return Result.fail(400, "delta 超出范围");

int spend = -delta; // 已保证 delta >= -100000，不会溢出
LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
uw.eq(SysUser::getId, loginUser.getId());
uw.ge(SysUser::getBerry, spend);
uw.setSql("berry = COALESCE(berry, 0) - " + spend);
int rows = sysUserMapper.update(null, uw);
if (rows == 0) return Result.fail(400, "草莓余额不足");
```

后续仍读取最新用户、`tokenService.refreshUserCache`、返回 `{"berry": 权威值}`，响应结构不变。

3. 新增 `grantDiaryBerry`：

```java
@Override
public void grantDiaryBerry(String userId) {
    if (userId == null || userId.isEmpty()) return;
    LambdaUpdateWrapper<SysUser> uw = new LambdaUpdateWrapper<>();
    uw.eq(SysUser::getId, userId);
    uw.setSql("berry = COALESCE(berry, 0) + 1");
    sysUserMapper.update(null, uw);
}
```

4. 新增 `claimSeedBerry`（服务端冷却，安全相关，**不 fail-open**）：

```java
SysUser loginUser = tokenService.checkToken(token);
if (loginUser == null) return Result.fail(TOKEN_ERROR...);

String key = SEED_CLAIM_KEY_PREFIX + loginUser.getId();
Boolean first = redisTemplate.opsForValue()
        .setIfAbsent(key, "1", SEED_CLAIM_COOLDOWN_HOURS, TimeUnit.HOURS);
boolean granted = Boolean.TRUE.equals(first);
if (granted) {
    // +1 原子更新；若更新失败则删除冷却 key，允许下次重试
}
if (redisTemplate 调用异常) {
    // 返回明确失败（503 / “奖励暂不可用”），不得吞掉异常后照常发放
}
data.put("berry", freshBerry);
data.put("granted", granted);
return Result.success(data);
```

- Redis 不可用时返回 `Result.fail(503, "奖励暂不可用，请稍后再试")`，不发放奖励、不绕过冷却。
- 同一用户 6 小时内重复领取返回 `granted=false` + 当前权威余额，不报错。

#### C. `blog-api/src/main/java/com/mszlu/blog/controller/UserController.java`

- 保留 `GET /users/berry`、`POST /users/berry`。
- `POST /users/berry` 注释改为“仅消费（delta 必须为负）”。
- 新增：

```java
/** 草莓籽收集奖励：服务端按 6 小时冷却发放，客户端不能传金额 */
@PostMapping("berry/seed-claim")
public Result claimSeedBerry(@RequestHeader("Authorization") String token) {
    return sysUserService.claimSeedBerry(token);
}
```

#### D. `blog-api/src/main/java/com/mszlu/blog/impl/DiaryServiceImpl.java`

- 注入 `SysUserService`。
- 仅在**新增日记**分支（`else { diaryMapper.insert(diary); }`，第 157-160 行）插入成功后调用一次 `grantDiaryBerry(userId)`；更新分支不发放，避免编辑刷草莓。
- 奖励失败只记 `log.warn`，不影响日记保存成功返回。

```java
} else {
    diaryMapper.insert(diary);
    try {
        sysUserService.grantDiaryBerry(userId);
    } catch (Exception e) {
        log.warn("日记保存成功但草莓奖励失败 userId={} diaryId={}", userId, diary.getId(), e);
    }
}
```

#### E. `blog-api/src/main/java/com/mszlu/blog/vo/params/BerryParam.java`

- 只更新字段注释：正向不再由客户端传；不改请求结构，保持前端协议兼容。

### 1.3 前端改动

#### A. `blog-ui/js/api.js`

- 删除通用正向 `addBerries(n)`，改为：
  - `spendBerries(n)`：只发送 `{ delta: -Math.abs(n) }`，带乐观更新和失败回滚；未登录不写服务端。
  - 新增 `claimSeedBerry()`：登录后 `POST /users/berry/seed-claim`，用返回的 `data.berry` 更新本地缓存；`granted=false` 也刷新余额，不报错。
  - 删除 `flushPendingBerries()` 的正向补账逻辑；模块加载时直接清理历史 `berryPendingCredit`，避免旧客户端继续发正向 delta。
- 保留 `berryBalance()`、`syncBerryBalance()` 和本地缓存展示逻辑；服务端仍是权威值。
- 保持 `BASE_URL`/`api()` 不变。

#### B. `blog-ui/js/diary.js`

- 第 2225 行 `addBerries(1)` 改为 `syncBerryBalance()`。服务端在 `/diary/save` 内已 +1，保存成功后同步权威余额即可。
- 保留 `diarySaveCount`、`pmMilestone`、`playBerrySound` 等现有展示逻辑。

#### C. `blog-ui/js/seed.js`

- 第 714-716、757-759 行两处 `window.addBerries(1)` 改为 `window.claimSeedBerry()`（保留 `typeof` 判断与 try/catch）。
- 更新注释：奖励由服务端按 6 小时冷却发放；`credited` 仍用于防止中断后重复触发，最终由服务端冷却兜底。
- 未登录用户不再攒 `berryPendingCredit`，也不再获得服务端余额。

### 1.4 回归影响

- 新日记 +1：保留，改为服务端发放。
- 草莓籽集齐 +1：保留，服务端 6 小时冷却；比原先客户端无限制更严格。
- 商店消费：当前无调用点；`spendBerries` 保留负向能力，余额不足由服务端拒绝。
- 管理员/内部正向入账：不再通过公开 `POST /users/berry`，只通过服务端业务方法。
- 匿名用户本地展示余额可能仍由 `berryBalance()` 兜底计算，但不写服务端、不影响登录后权威值。

## 2. Phase 1：文章正文 XSS

### 2.1 现状

`blog-ui/js/article.js:128-136`：

```js
let body = a.body?.content || a.body?.contentHtml || '';
body = body.replace(/^```[a-z]*\s*/, '').replace(/```\s*$/, '');
if (body && !/<[a-z][^>]*>/i.test(body)) {
    body = marked.parse(body);
}
bodyHtml.value = `<div class="article-body">${body}</div>`;
```

问题：

- 正文含任意 HTML 标签时跳过 `marked.parse`，原文直接拼接进 `bodyHtml`，由 `article.html:74` 的 `v-html` 渲染。
- `marked` 默认也允许原始 HTML；仅靠 `marked` 不够。
- 库中存在正文包含 Markdown 代码块 `<script setup>` 的文章，会触发“跳过 marked”的分支，说明这是现实入口，不只是理论风险。

### 2.2 改动

#### A. 新增本地 DOMPurify

- 新增 `blog-ui/js/purify.min.js`：DOMPurify 3.2.6 官方 `purify.min.js` 本地副本（带版本/许可证头）。
- 不引入 CDN 运行时依赖，避免线上 CDN 不可用导致清洗缺失。

#### B. `blog-ui/article.html`

- 在 `<head>` 的 `marked.min.js` 之后增加：

```html
<script src="js/purify.min.js?v=20261102"></script>
```

- 保证在 `article.js` 之前加载；`article.html:74` 的 `v-html="bodyHtml"` 路径被覆盖。

#### C. `blog-ui/js/article.js`

将正文构建改为：

```js
const rawContent = a.body?.content;
let body = rawContent || a.body?.contentHtml || '';
if (rawContent) {
    // 原始 content 按 Markdown 解析；代码块里的 <script setup> 会被 marked 转义，不再触发“含 HTML 就跳过”的危险分支
    body = rawContent.replace(/^```[a-z]*\s*/, '').replace(/```\s*$/, '');
    body = marked.parse(body);
}
// 最终交给 v-html 的 HTML 必须清洗；保留常见 Markdown 排版（标题/列表/表格/代码块/图片/链接）
if (window.DOMPurify) {
    body = window.DOMPurify.sanitize(body, { USE_PROFILES: { html: true } });
} else {
    // 库未加载时 fail-closed，不把未清洗 HTML 交给 v-html
    body = escHtml(body);
}
bodyHtml.value = `<div class="article-body">${body}</div>`;
```

- `contentHtml` 分支（没有原始 `content` 时）同样经过 `DOMPurify.sanitize`。
- DOMPurify 缺失时用 `escHtml` 作为安全兜底；会损失排版，但不会执行注入 HTML。该兜底作为未覆盖限制记录。
- 评论内容已有的 `renderCommentContent` 先转义再替换表情，不在本次范围。

## 3. Phase 1：线上登出

### 3.1 现状

`blog-ui/js/auth.js:27-42`：

```js
localStorage.removeItem('token');
localStorage.removeItem('nickname');
if (typeof clearSessionDisplayStorage === 'function') clearSessionDisplayStorage();
if (token) {
    fetch('http://localhost:8888/logout', { headers: { 'Authorization': token } }).catch(() => {});
}
initHeader();
```

问题：

- 生产域名下仍请求 `localhost:8888`，服务端 `Token_<token>` 不会被删除。
- 先删本地 token，再请求；若改用 `api()` 必须调整顺序。

### 3.2 改动

`blog-ui/js/auth.js` 的 `doLogout` 改为：

```js
function doLogout() {
    const token = localStorage.getItem('token');
    // ...保留现有音效...
    if (token) {
        // 必须在删除 localStorage token 前调用：api() 此时还能读到 Authorization
        // api() 内部使用项目已有 BASE_URL，生产走 https://api.instapix.icu
        api('/logout', 'GET').catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('nickname');
    if (typeof clearSessionDisplayStorage === 'function') clearSessionDisplayStorage();
    initHeader();
}
```

- 服务端 `LogoutController` 的 `GET /logout` 删除 Redis `Token_<token>`；本地 token/nickname/展示缓存同时清理。
- `api()` 已内置网络错误捕获并返回 `{success:false}`，不阻塞登出。
- 网络失败时服务端 token 可能未被注销，属于 best-effort 限制；本地登录状态仍会清理。

## 4. Phase 2：文章读缓存 Redis fail-open

### 4.1 实际失败点

- `CacheAspect.around` 当前结构：

```java
try {
    String redisValue = redisTemplate.opsForValue().get(redisKey);
    ...
    Object proceed = pjp.proceed();
    redisTemplate.opsForValue().set(...);
    return proceed;
} catch (Throwable throwable) {
    log.error("cache aspect error", throwable);
}
return Result.fail(-999, "系统错误");
```

- Redis 连接/超时异常、序列化异常、甚至 `pjp.proceed()` 里的业务异常都会被吞掉并伪装成 -999。
- 生产 Redis 配置 `application-prod.yml:36-49`：`timeout: 3000ms`、Lettuce `max-wait: 2000ms`；Redis 故障时单次请求可阻塞数秒，然后所有缓存方法返回 -999。
- 当前源码没有文章读方法上的 `@Cache`；本次会在公开文章读接口上显式加短 TTL 缓存，同时把切面改成 fail-open，保证“有缓存时 Redis 挂了也能回源”。

### 4.2 `CacheAspect` 重写

文件：`blog-api/src/main/java/com/mszlu/blog/common/cache/CacheAspect.java`

核心结构：

1. **注解解析**
   - 用 `MethodSignature` + `AopUtils.getMostSpecificMethod(...)` + `AnnotationUtils.findAnnotation(...)` 获取 `@Cache`，避免 JDK 代理下从接口方法取不到注解导致 NPE。
   - 取不到注解时直接 `pjp.proceed()`，不缓存。

2. **配置项**（`application.properties` 增加，带环境变量默认值）

```properties
blog.cache.enabled=${BLOG_CACHE_ENABLED:true}
blog.cache.redis-timeout-ms=${BLOG_CACHE_REDIS_TIMEOUT_MS:300}
blog.cache.failure-threshold=${BLOG_CACHE_FAILURE_THRESHOLD:3}
blog.cache.open-duration-ms=${BLOG_CACHE_OPEN_DURATION_MS:30000}
```

3. **短超时**
   - 使用独立守护线程池执行 Redis get/set，`Future.get(redisTimeoutMs, MILLISECONDS)`；超时 `cancel(true)` 并按缓存未命中处理。
   - 线程池有界（2 线程 + 小队列）；拒绝任务时直接视为缓存不可用，不阻塞请求。
   - 不修改全局 `spring.data.redis.timeout`，避免影响鉴权/限流。

4. **熔断/降级**
   - `AtomicInteger consecutiveFailures`、`volatile long circuitOpenUntil`。
   - 连续失败达到 `failure-threshold` 后打开 30 秒；打开期间跳过所有缓存读写，直接查库。
   - `blog.cache.enabled=false` 时完全绕过缓存。
   - 成功一次读/写后重置连续失败计数。

5. **读 fail-open**
   - 缓存读异常或超时：`log.warn` + Micrometer 计数器 + 继续 `pjp.proceed()`。
   - 缓存值不是 `null`、不是字符串 `"null"`才反序列化；坏值删除并当作未命中。
   - 读失败绝不返回 -999。

6. **回填**
   - 查库成功后，仅当结果非 null 且 `Result.success == true` 才回填；`Result.fail` 不缓存。
   - 回填异步执行，失败只记日志/指标，不影响响应；熔断打开时不再回填。
   - TTL 使用 `@Cache.expire()`，默认 60 秒；本次文章读注解使用 30 秒。

7. **防击穿**
   - `ConcurrentHashMap<String, ReentrantLock>` 按 key 加锁；`tryLock(50ms)` 成功者查库并回填，失败者直接查库但不回填，避免所有请求同时打 DB。
   - 锁用完 `remove(key, lock)`；Redis 故障时锁只影响同 key 的短时间竞争，不会把错误放大。

8. **业务异常不被吞**
   - `pjp.proceed()` 不放在 catch 内；数据库/业务异常继续抛给 `AllExceptionHandler`。
   - 切面只捕获缓存操作异常。

9. **指标**
   - 注入 `ObjectProvider<MeterRegistry>`；存在时记录 `blog.cache.requests{cache=article,outcome=hit|miss|error|circuit_open}`。
   - 无 Micrometer 时仅日志，不影响运行。

### 4.3 文章读接口缓存范围

文件：`blog-api/src/main/java/com/mszlu/blog/controller/ArticleController.java`

| 接口 | 方法 | 处理 |
|---|---|---|
| `POST /articles` | `listArticle` | 加 `@Cache(name="article", expire=30_000)`，公开列表，按分页/筛选参数分 key |
| `POST /articles/hot` | `hotArticle` | 加 `@Cache(name="article", expire=30_000)` |
| `POST /articles/new` | `newArticles` | 加 `@Cache(name="article", expire=30_000)` |
| `POST /articles/listArchives` | `listArchives` | 加 `@Cache(name="article", expire=30_000)` |
| `POST /articles/article/view/{id}` | `findArticleById` | **不加缓存**。保持 DB 查询、私密文章可见性校验和阅读数更新；Redis 故障对它无影响 |

- 不缓存文章详情的原因：缓存 key 只有 articleId，无法区分匿名/作者，私密文章成功响应可能被匿名用户命中；且阅读数更新会被缓存绕过。详情当前就是 DB-only，已经满足“Redis 挂时回源数据库”。
- 列表/热门/最新/归档均为公开数据；30 秒 TTL 控制发布/改可见性后的陈旧窗口。不引入 `KEYS` 批量失效，避免阻塞 Redis。
- API 响应结构不变，前端无需改协议。

### 4.4 边界（明确不 fail-open）

- `TokenServiceImpl.checkToken`：鉴权依赖，Redis 故障时不能当作“已登录”；保持失败/拒绝。
- `LoginServiceImpl`：登录限流与登录态写入；现有失败计数已捕获异常，但登录 token 写入失败不能绕过。
- Phase 1 `claimSeedBerry`：草莓籽冷却属于业务完整性/安全控制；Redis 故障返回 503，不发放。
- `CacheAspect` 只对读缓存 fail-open；写业务、鉴权、限流、锁不套用该策略。

## 5. 验证计划（最小）

### Phase 1

1. `mvn -pl blog-api -am -DskipTests compile`（后端编译）。
2. `node --check` 检查 `api.js`、`diary.js`、`seed.js`、`article.js`、`auth.js`、`purify.min.js`。
3. 静态核对：
   - `blog-ui` 内无正向 `{ delta: 正数 }` 的 `POST /users/berry` 调用；`addBerries` 调用点清零。
   - `auth.js` 不再出现 `localhost:8888/logout`，出现 `api('/logout'`。
   - `article.html` 在 `article.js` 之前引入 `purify.min.js`。
   - `article.js` 在 `bodyHtml` 赋值前调用 `DOMPurify.sanitize`。
4. 不新建业务测试账号、不写业务数据；登录态端到端草莓验证不做，列为未覆盖限制。

### Phase 2

1. 同一 `mvn -pl blog-api -am -DskipTests compile` 覆盖。
2. 可控模拟 Redis 不可用：
   - 另起一个实例（不同端口，如 8899），参数 `--spring.data.redis.port=1`，共享本地 MySQL。
   - 调用 `POST /articles`、`POST /articles/hot`、`POST /articles/new`、`POST /articles/listArchives`，确认 HTTP 200 且 `success=true`、`data` 有内容。
   - 调用文章详情：优先用不存在的 id 验证返回业务 404 而不是 -999；若用真实公开文章，会正常返回并累加一次阅读数（需在报告中说明）。
   - 观察日志出现 `cache read failed ... fail-open` 与熔断打开，不再出现 `Result.fail(-999)`。
3. 验证降级开关：`--blog.cache.enabled=false` 时文章接口直接查库。
4. 不做全量测试、不压测、不长时间停生产 Redis。

## 6. 已知限制（最终报告需列出）

- 文章详情不缓存；这是为私密文章可见性与阅读数正确性做的取舍。若后续要缓存，需要 visibility/user-aware key + 主动失效。
- 公开列表/热门/最新/归档存在最长 30 秒陈旧窗口；发布、改可见性后最多 30 秒才反映到列表缓存。
- 熔断是单实例内存状态，不是分布式熔断；多实例各自独立。
- 回填缓存异步，进程重启/线程池饱和时可能丢一次回填，数据库仍正确。
- 登出是 best-effort：网络失败时服务端 token 可能未注销，直到 Redis TTL 到期；本地状态仍清理。
- DOMPurify 脚本缺失时回退为转义文本，排版会丢失（安全优先）。
- 未做认证态草莓端到端测试（避免创建测试账号/写业务数据）；以编译、静态检查和代码路径核对为准。

## 7. 需要确认

- 是否同意 Phase 2 的取舍：**文章详情不加缓存**（详情本来就是 DB-only，Redis 故障不影响；避免私密文章泄露），仅列表/热门/最新/归档加 30 秒缓存。
- 是否同意草莓籽奖励采用服务端 6 小时 Redis 冷却，Redis 故障时返回 503 而不是 fail-open。
- 确认后按 `tasks.md` 顺序执行：Phase 1 先做并验证，再进入 Phase 2；不提交代码。
