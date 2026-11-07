# Celeste Dash 第一波发布结果：未发布

> 检查时间：2026-11-02（Asia/Shanghai）
>
> **结论：未发布。** 博客、GitHub Discussion、B 站动态三个入口都没有发出。
>
> 原因不是文案问题，而是没有可验证的账号权限；同时博客编辑器不支持独立封面字段。没有使用测试账号、没有猜 token、没有绕过登录、没有伪造发布成功。

---

## 1. 实际结果

| 平台 | 结果 | 公开链接 | 具体卡点 |
|---|---|---|---|
| 博客 | **未发布** | 无 | 本地无可用博客 token；`POST /articles/publish` 需要登录态；编辑器无封面字段 |
| GitHub Discussion | **未发布** | 无 | `gh` 未安装；无 GitHub token；文章 ID 尚不存在 |
| B 站动态 | **未发布** | 无 | 无登录态/API；按约束只给文案与步骤，未尝试绕过登录 |

补充核验：博客站内搜索 `冲刺状态机`、`Celeste 冲刺` 均为 `total=0`，确认文章不在线上，不存在“已发布但没找到”的情况。

---

## 2. 权限与事实检查

### 2.1 博客：接口存在，但没有可用登录态

发布链路是明确的：

- 前端编辑器 `blog-ui/write.html:40-49` 只有标题、分类、标签、摘要、Markdown 正文；没有封面上传项。
- `blog-ui/js/write-3.js:3` 在 `localStorage` 没有 `token` 时直接拦截，不进入发布。
- `blog-ui/js/write-3.js:137` 调 `POST /articles/publish`，请求头由 `js/api.js` 注入 `Authorization`。
- 后端 `blog-api/.../config/WebMVCConfig.java:35` 把 `/articles/publish` 加进登录拦截器；`:48` 把 `/upload` 也加进拦截器。
- `blog-api/.../handler/LoginIntercepter.java:38` 从 `Authorization` 取 token；`blog-api/.../impl/TokenServiceImpl.java:32` 校验 Redis 键 `Token_<jwt>`。

检查结果：

- 环境变量里没有博客 token；只有 `ANTHROPIC_AUTH_TOKEN`、`CFS_TOKEN`、`TRAE_JWT_TOKEN_PATH` 等无关凭证。
- 仓库内没有 `.env`、`.token`、`.cookie`、`cookies*.txt`。
- 没有可用的浏览器登录态可读取。
- `blog-ui/js/shelf.js:276` 有一个前端写法 `localStorage.setItem('token', 'dev-bypass')`。这是前端占位值，服务端 `TokenService.checkToken` 会拒绝；**没有使用它**，用它发布属于伪造登录。

**结论：** 发布接口存在，但没有真实、可验证的账号 token，不能在未登录状态下调用。按你的约束，停在这里。

### 2.2 博客封面：平台格式不支持

- `blog-api/.../vo/params/ArticleParam.java` 的字段只有 `id`、`body`、`category`、`summary`、`tags`、`title`，**没有 cover 字段**。
- `blog-ui/write.html` 没有封面上传/选择控件。
- `docs/celeste-dash-article.md` 第 21–25 行只有“封面图建议”，仓库里没有对应的实际封面文件。

因此“标题、摘要、标签、封面”里的**封面无法按博客编辑器要求设置**。按你的约束“封面缺失或平台格式不支持就停下来报告”，本轮没有强行发布无封面文章。

如果接受“正文首图代替封面”，可以后续再生成一张 1600×900 的矢量封面，从编辑器 Image 按钮上传；但这需要你另行确认，不属于本轮自动执行范围。

### 2.3 GitHub：Discussions 可用，但没有认证

- `gh auth status`：`gh` 未安装（`CommandNotFoundException`），无法检查 repo 权限。
- 环境变量里没有 `GITHUB_TOKEN` / `GH_TOKEN`。
- 公开 API 核验仓库：`melinhades/Celeste-AI-Diary-Companion-Blog`，`private=false`，`default_branch=master`，`has_discussions=true`，`archived=false`。

**结论：** Discussions 功能本身可用，但没有可验证的写权限；而且博客文章 ID 尚不存在，此时发 Discussion 只能带一个断链。按你的约束，未发 Discussion，未改 README，未提交。

### 2.4 B 站：没有登录态，只给文案与步骤

- `bili`、`bilibili`、`biliup` 均未安装（`NOT_FOUND`）。
- 没有 B 站 cookie / 登录态文件。
- 公开接口复核视频 `BV13QYT64EDX`：`code=0`，标题《与Madeline写日记｜Celeste AI日记博客demo展示》，UP 主 `Spongebob452`，时长 213 秒（3:33）。

**结论：** 视频真实存在，但没有发布动态所需的登录态/API；未尝试绕过登录，只输出可粘贴文案和手动步骤。

### 2.5 链接与页面核验

| 项 | 结果 |
|---|---|
| `https://www.instapix.icu/celeste-character-demo` | HTTP 200，16,518 字节 |
| `https://www.instapix.icu/write` | HTTP 200 |
| `https://www.instapix.icu/login` | HTTP 200 |
| `https://www.instapix.icu/write.html` / `login.html` | 308 跳转到无扩展名地址 |
| 博客分类接口 | `Tech`(1)、`Life`(2)、`Study`(3) |
| 文章搜索 `冲刺状态机` / `Celeste 冲刺` | `total=0`，未发布 |

---

## 3. 可直接复制的内容

### 3.1 博客字段

| 字段 | 值 |
|---|---|
| 标题 | `Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现` |
| 分类 | `Tech`（id=1） |
| 标签 | `逆向工程,游戏开发,Celeste,状态机,JavaScript,前端,反编译,手感设计` |
| 摘要 | `以 Noel Berry 公开归档的 Player.cs 与本机安装版 Celeste.dll 的 IL 为证据，拆解 Celeste 的 Dash 生命周期、速度数学，以及 SuperWallJump、Super/Hyper、Ultra 与角修正的真实触发条件；说明哪些结论是源码级事实、哪些是 IL 级事实、哪些只是移植中的近似，并给出浏览器 demo 与可复现步骤。` |
| 正文 | 见下方复制范围说明 |
| 封面 | 平台无独立封面字段；不要伪造 |

标签请用**英文逗号**分隔。编辑器按 `,` 拆分；用中文顿号 `、` 会变成一个长标签。

正文复制范围：

- 打开 `docs/celeste-dash-article.md`。
- 从**第 41 行** `# Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现` 开始，复制到文件末尾。
- **不要复制第 1–40 行**的“发布元信息”；那一节是给你看的标题/摘要/标签建议，不属于正文。
- 第 12 节“版权与声明”已保留非商用声明：Celeste 素材归 Extremely OK Games，本文无关联、未获授权、非商用同人学习。

### 3.2 GitHub Discussion

标题：

```text
Celeste AI Diary Companion: building a blog with a browser-playable character engine
```

正文（英文；仓库清理前不要加 repo/demo 链接；文章链接等 `ARTICLE_ID` 出来后再补）：

```markdown
I'm building a small personal project: a Celeste-inspired blog where an AI companion writes diary entries, with a browser-playable character engine so the reading experience feels a little more like the game.

The project is still early. The blog side is an AI diary companion; the character side is a small JS engine that supports run, jump, dash, climb, wall jump and a few Celeste-specific movement quirks. The goal is not to clone the game, but to make the movement feel right while keeping the site readable and personal.

The dash was the part that kept feeling wrong until I stopped guessing. I compared the archived `Player.cs` with IL and metadata from the installed build, and kept the two evidence levels separate. A few things that surprised me:

- `DashBegin` zeroes the current speed; the dash velocity is assigned on the next frame, not on key press.
- Dash cooldown and dash refill cooldown are separate timers.
- A pure up-dash into a wall is the wallbounce path; a horizontal dash into a wall is not.
- The end-of-dash speed reset is skipped when `DashDir.Y > 0`.

I'm still unsure about two things: `Input.GetAimVector(Facing)` is not in the public archive, so the deadzone, diagonal snap and zero-input fallback are approximations in my port; and Monocle's `StateMachine` callback order is not public, so I emulate the coroutine's `yield return null` with an explicit phase flag.

I'm currently cleaning the repo and replacing game-derived assets before sharing it. Once that's done I'll add the article and a short demo link.

Questions for this group:

1. Does the "AI diary companion + playable character" concept make sense as a personal blog, or is the character engine too much of a distraction?
2. For people who have looked at Celeste/Monocle internals, is my reading of the wallbounce path correct?
3. What would you prioritize next: more movement fidelity, better diary integration, or accessibility and readability?

This is an unofficial, non-commercial fan project. Celeste is by Extremely OK Games; this project is not affiliated with or endorsed by them.
```

文章发布后再补的 UTM 链接：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=github&utm_medium=community&utm_campaign=celeste_dash_re&utm_content=discussion
```

### 3.3 B 站动态

短版（用于动态）：

```text
把 Madeline 的冲刺状态机搬进浏览器后，最反直觉的三件事：
1. 冲刺不是按下即赋速，Begin 先把速度清零；
2. 水平冲撞墙不是 wallbounce；
3. 向下冲刺结束不重置速度。
长文把证据、推断和近似分开写了：{BILIBILI_LINK}
```

对应 UTM 链接：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=bilibili&utm_medium=social&utm_campaign=celeste_dash_re&utm_content=dynamic
```

长版（用于视频简介或置顶评论）：

```text
视频里是这个 Celeste 同人博客项目的整体 demo。角色冲刺部分不是“照着 Wiki 调参”，而是对着归档的 Player.cs 和本机安装版 IL 逐条对齐的：Begin 清速、协程第二帧赋速、纯上冲才是 wallbounce、向下冲刺结束不重置、DashAttack 比 Dash 多 0.15 秒。

逐帧细节和 13 个移植坑在这里（长文，含证据等级标注）：
{BILIBILI_VIDEO_LINK}

项目仓库：https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog
Demo：https://www.instapix.icu/celeste-character-demo

非商用同人二创，Celeste 版权归 Extremely OK Games；本项目与其无关联。
```

视频简介用：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=bilibili&utm_medium=social&utm_campaign=celeste_dash_re&utm_content=video_desc
```

置顶评论用：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=bilibili&utm_medium=social&utm_campaign=celeste_dash_re&utm_content=pinned_comment
```

### 3.4 GitHub README（可选，本轮未执行）

README 修改属于仓库变更，需人工审核；本轮没有改。文案可直接用 `docs/celeste-dash-promo.md` 第 2.1 节，把 `{ARTICLE_ID}` 换成真实 ID 后再提交。

---

## 4. 用户下一步只需点的操作

### 4.1 博客（先做这一步）

1. 打开 `https://www.instapix.icu/login`，用**你自己的账号**登录。
2. 打开 `https://www.instapix.icu/write`。
3. 标题填：`Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现`。
4. 分类选：`Tech`。
5. 标签填：`逆向工程,游戏开发,Celeste,状态机,JavaScript,前端,反编译,手感设计`。
6. 摘要填第 3.1 节的摘要原文。
7. 正文：从 `docs/celeste-dash-article.md` 第 41 行复制到文末，粘贴；不要带第 1–40 行元信息。
8. 封面：当前编辑器没有封面字段。**如果封面是硬性要求，先不要点 Publish**，告诉我，我们改用“正文首图”方案；如果接受无独立封面，继续。
9. 点 `Publish`。
10. 页面跳转后，从地址栏复制 `article?id=` 后面的数字，发给我。

### 4.2 GitHub Discussion（博客发布、拿到 ARTICLE_ID 后）

1. 打开 `https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog/discussions/new/choose`。
2. 标题、正文粘贴第 3.2 节内容，把 `{ARTICLE_ID}` 替换成真实 ID。
3. 点 `Start discussion`。
4. 如果页面提示没有 Discussion 权限，停下告诉我，不要重复尝试。

### 4.3 B 站动态（博客发布、拿到 ARTICLE_ID 后）

1. 打开 `https://www.bilibili.com/`，进入动态发布入口。
2. 粘贴第 3.3 节短版，把 `{ARTICLE_ID}` 替换成真实 ID。
3. 点发布。
4. 如果改发视频简介/置顶评论，用长版，并把 `utm_content` 换成 `video_desc` / `pinned_comment`。

---

## 5. ARTICLE_ID 回填规则

发布后统一使用：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}
```

带 UTM 的 GitHub / B 站链接见第 3.2、3.3 节。把真实 ARTICLE_ID 发给我后，我会：

1. 替换本报告与 `docs/celeste-dash-promo.md` 中所有 `{ARTICLE_ID}` / `{ARTICLE_LINK}` / `{BILIBILI_LINK}` / `{BILIBILI_VIDEO_LINK}`。
2. 验证 `https://www.instapix.icu/article?id=<真实ID>` 返回 200。
3. 再给你一份可复制的 GitHub Discussion / B 站动态终稿。

---

## 6. 本轮明确未做

- 未发布任何平台，未登录任何平台。
- 未使用测试账号，未猜 token，未使用 `dev-bypass` 占位 token。
- 未绕过 B 站/GitHub 登录。
- 未改 README、未改代码、未改数据库、未提交、未部署。
- 未刷量、未互赞、未批量私信、未做“官方/授权”暗示。
- 未修改文章正文事实；只做了平台字段格式转换（标签用英文逗号）。

---

## 7. 相关文件

- 长文正文：`docs/celeste-dash-article.md`
- 推广文案与 UTM：`docs/celeste-dash-promo.md`
- 本报告：`docs/celeste-dash-first-wave-report.md`
