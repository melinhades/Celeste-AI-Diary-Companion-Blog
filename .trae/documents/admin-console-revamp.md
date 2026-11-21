# Blog Admin 管理后台升级方案

## Context

`blog-admin` 目前还是教程遗留状态：Spring Boot 内嵌的 `static/pages/main.html` 只有一个「权限管理」表格页，与前台 blog-ui 的 Celeste 视觉体系完全脱节；同时 `SecurityConfig` 没有 `anyRequest` 兜底，访问根路径 `/`、`/error`、`/darkswamp.png` 等未匹配路径会直接 403（用户看到的「没有访问权限」）。

目标：把它升级成能真正管理这个豪华版博客的后台——保留原有登录与权限校验，补齐真实内容管理（文章 / 日记 / 评论 / 分类 / 标签 / 用户），并按前台同一套 Celeste 视觉重做界面。

已确认的事实：

- 后台只有 `ms_permission` 的 CRUD（`AdminController`），没有文章/日记/评论管理。
- `admin` 用户 id=1，`AuthService` 中直接放行；其他管理员按 `ms_permission.path` 匹配 URI。
- blog-admin 不依赖 blog-api/blog-common，只有 Spring Web + MyBatis-Plus + MySQL；因此新增管理功能**直接读写同一个 blog 库**，不经过 blog-api（blog-api 的接口都绑定 `UserThreadLocal` 的前台用户 token，后台 session 与之不互通）。
- 数据量：文章 7、日记 97、评论 11、分类 3、标签 8、用户 19。文章 `visibility`：1=公开（6 篇）、0=私密（1 篇）。
- 关键表字段：
  - `ms_article`(id, title, summary, create_date, view_counts, comment_counts, weight, author_id, body_id, category_id, visibility, source_type, source_id, anonymous, publish_time)
  - `ms_article_body`(id, content, content_html, article_id)
  - `ms_diary`(id varchar32, user_id, title, content, create_date, update_date, emotion, emotion_detail, type)
  - `ms_comment`(id, content, create_date, article_id, author_id, parent_id, to_uid, level, anonymous)
  - `ms_category`(id, avatar, category_name, description)、`ms_tag`(id, avatar, tag_name)、`ms_article_tag`(article_id, tag_id)
  - `ms_sys_user`(id, account, nickname, avatar, email, admin, status, create_date, last_login, berry, signature)
  - `ms_document_chunk`(id, user_id, source, ref_id, title, content, embedding, create_date) —— 日记 RAG 分片，删除日记时要一起清
  - `ms_diary_companion`(id, diary_id, suggestion, user_id, content, trigger_type, create_date)
  - `ms_article_like`(id, article_id, user_id, create_date)

## 范围（V1）

做：

1. 修复安全配置与入口跳转。
2. 新增后台数据接口：仪表盘概览、文章、日记、评论、分类、标签、用户（只读）。
3. 前端整体重做：Celeste 风格侧边栏 + 顶栏 + 卡片 + 表格 + 分页 + 详情抽屉 + 确认弹窗 + Toast。
4. 保留并美化权限管理页。
5. 文章/日记/评论提供「查看前台」跳转；文章只做可见性切换与删除，**不做在线富文本编辑器**（新建/编辑仍走前台编辑器），避免重复实现编辑器。

不做（明确排除，避免过度设计）：图片上传、AI/情感配置、通知中心、富文本编辑器、文章正文在线编辑。

## 实施步骤

### 1. 安全与入口（先修 403）

`blog-admin/src/main/java/com/mszlu/blog/admin/config/SecurityConfig.java`

- 在现有规则末尾补兜底：`/`、`/login.html`、`/error`、`/favicon.ico`、`/fonts/**`、`/darkswamp.png`、`/js/**` 放行，其余 `anyRequest().permitAll()`（管理接口仍由 `/admin/**` 的 `AuthService` 把关，静态页由 `/pages/**` 的 `authenticated()` 把关）。
- 增加根路径跳转：`GET /` → 已登录跳 `/pages/main.html`，未登录跳 `/login.html`（可用一个极简 `HomeController` 方法或 `defaultSuccessUrl` 已有逻辑扩展）。
- 保持 `admin` id=1 超管直通逻辑不动。

### 2. 后端数据层（blog-admin 内新增，直接连库）

新增 PO（`pojo/`）+ Mapper（`mapper/`，继承 `BaseMapper`，`@MapperScan` 已覆盖）：

- `ArticlePO`、`ArticleBodyPO`、`DiaryPO`、`CommentPO`、`CategoryPO`、`TagPO`、`ArticleTagPO`、`ArticleLikePO`、`SysUserPO`、`DocumentChunkPO`、`DiaryCompanionPO`。
- 字段用 `@TableName` / `@TableId` / `@TableField` 显式映射，时间戳保持 bigint/datetime 原样，格式化交给前端。

新增 `service/ContentAdminService`（`@Transactional`）：

- 文章删除：`ms_article_tag` → `ms_article_body` → `ms_comment` → `ms_article_like` → `ms_article`。
- 日记删除：`ms_diary_companion` → `ms_document_chunk(source='diary' AND ref_id=日记id)` → `ms_diary`。
- 评论删除：存在子回复时先删子回复再删父级（`parent_id` 一级即可）。
- 分类/标签删除前做引用检查（分类被文章引用、标签在 `ms_article_tag` 有引用则拒绝并返回提示）。

### 3. 后端接口（全部挂在 `/admin/**`，沿用现有 `Result`/`PageResult`）

新增 controller：

- `DashboardController`：`GET /admin/dashboard/overview` —— 文章/日记/评论/用户总数、今日新增、近 7 天发布趋势（按 `create_date` 聚合）、最近 5 篇文章/日记/评论。
- `ArticleAdminController`：
  - `POST /admin/article/page`（currentPage,pageSize,query,categoryId,visibility）
  - `GET /admin/article/{id}`（含正文、分类名、标签列表）
  - `POST /admin/article/visibility`（id, visibility）
  - `POST /admin/article/delete/{id}`
- `DiaryAdminController`：`POST /admin/diary/page`、`GET /admin/diary/{id}`、`POST /admin/diary/delete/{id}`。
- `CommentAdminController`：`POST /admin/comment/page`（带文章标题 join/批量回填）、`POST /admin/comment/delete/{id}`。
- `CategoryAdminController`：`GET /admin/category/list`、`POST /admin/category/add|update|delete`。
- `TagAdminController`：`GET /admin/tag/list`、`POST /admin/tag/add|update|delete`。
- `UserAdminController`：`POST /admin/user/page`（只读，隐藏 password/salt/api_key）。
- 现有 `AdminController` 的权限接口保持不变。

分页统一用 MyBatis-Plus `Page`；关键字查询用 `like`（title/content），排序：文章 `publish_time/weight`、日记 `create_date desc`、评论 `create_date desc`。

### 4. 前端视觉系统（静态资源，无构建工具）

新增：

- `static/fonts/Renogare-Regular.otf`、`static/fonts/PressStart2P-Regular.ttf`（从 blog-ui 复制，约 58KB/118KB）。
- `static/css/admin.css`：从 blog-ui 抽取同一套变量——背景 `#080824` + `darkswamp.png`，主色 `#7dfbd0`，渐变 `#00c896 → #4b7bff`，玻璃卡片 `rgba(18,24,52,.6)` + `backdrop-filter: blur(14px)`，像素描边（`box-shadow` 直角边框），字体栈 `'Renogare','CelesteZH','Microsoft YaHei',sans-serif`；保留现有 `#dreamRibbons/#dreamStars` 极光动效。
- `static/js/admin/api.js`：统一 `fetch` 封装（JSON、错误提示、`credentials:'same-origin'`）。
- `static/js/admin/ui.js`：Toast、确认框、分页组件、表格渲染、抽屉、骨架屏、HTML 转义（复用现有 `escHtml` 思路）。
- `static/js/admin/app.js`：路由（hash：#dashboard/#article/#diary/#comment/#taxonomy/#user/#permission）、侧边栏激活态、登录过期跳转。

重写 `static/pages/main.html` 为壳页面：顶栏（logo、当前时间、管理员、退出）、侧边栏（仪表盘 / 文章 / 日记 / 评论 / 分类标签 / 用户 / 权限）、内容容器。各页面 JS 按模块拆分到 `static/js/admin/pages/*.js`，避免单文件继续膨胀。

`static/login.html` 只做视觉对齐（同字体/同配色/保留现有登录逻辑），不改认证流程。

### 5. 页面细节

- 仪表盘：4 个统计卡 + 近 7 天柱状图（纯 div/SVG，不引第三方库）+ 最近内容列表。
- 文章：搜索框、分类下拉、可见性筛选、表格（标题/分类/标签/浏览/评论/可见性/时间/操作）；操作 = 预览（抽屉，渲染 `content_html`）、公开↔私密、删除、前台查看（`https://instapix.icu/article.html?id=...`）。
- 日记：搜索 + 情绪标签 + 表格（标题/情绪/字数/时间）+ 详情抽屉 + 删除 + 前台查看。
- 评论：搜索 + 文章筛选 + 表格（内容摘要/文章/作者/匿名/时间）+ 删除。
- 分类/标签：左右双栏卡片，行内增删改。
- 用户：只读表格（昵称/账号/邮箱/状态/注册时间/草莓数）。
- 权限：沿用现有增删改查，套新样式。

### 6. 验证

1. `mvn -pl blog-admin -am -DskipTests package` 编译通过（注意父 pom 的 checkstyle/spotbugs 在 `verify` 阶段，使用 `package` 即可）。
2. 启动 `blog-admin`（8889），确认：
   - `/` 自动跳转登录/主页，不再 403；`/favicon.ico`、`/darkswamp.png`、字体文件 200。
   - `admin/admin123` 登录成功，进入新后台。
   - 每个模块列表有数据（文章 7、日记 97、评论 11、分类 3、标签 8、用户 19）。
   - 文章预览正文正常、可见性切换后前台列表行为符合预期。
   - 删除测试用**临时造的数据**（或先备份后删一条再恢复），确认级联清理生效；不删真实内容。
3. 浏览器实测：侧边栏切换、搜索、分页、抽屉、确认框、Toast 正常；控制台零报错；1280px 与 900px 宽度下布局不破。
4. 完成后关闭测试进程，保留可复现的启动命令说明。

## 风险与取舍

- 后台 session 与 blog-api token 不互通，因此直接读写库；这意味着删除文章/日记不会触发 blog-api 的通知、异步任务等副作用，V1 只补齐必要的关联数据清理（标签、正文、评论、点赞、RAG 分片、陪伴记录）。
- `ms_article.create_date` / `publish_time` 是 epoch 毫秒，`ms_diary.create_date` 是 datetime，前端统一格式化，不做库结构变更。
- 非超管管理员访问新模块会被 `AuthService` 按 `ms_permission.path` 拦截；V1 默认只有超管可用，后续可在权限页录入新路径。
- 不引入前端框架与打包工具，保持 Spring Boot 静态资源即可部署。
