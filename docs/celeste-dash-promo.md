# Celeste Dash 长文 · 推广包（草稿，未发布）

## 0. 结论与边界

- 主文章已写入 `docs/celeste-dash-article.md`，本文件只负责推广文案、UTM、节奏与评论回收。
- **未发布、未登录任何平台、未修改 README、未提交、未部署。**
- 已核验的真实链接：
  - 博客：`https://www.instapix.icu`
  - 文章（发布后替换 ID）：`https://www.instapix.icu/article?id={ARTICLE_ID}`
  - Demo：`https://www.instapix.icu/celeste-character-demo`（HTTP 200）
  - 仓库：`https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog`
  - B 站视频：`https://www.bilibili.com/video/BV13QYT64EDX/`（公开接口 `code=0`，标题《与Madeline写日记｜Celeste AI日记博客demo展示》，UP 主 `Spongebob452`，3:33）

> 注意：`article.html?id=` 会 308 跳转，推广统一用扩展名省略形式 `article?id=`。

---

## 1. UTM 规范

统一 campaign：`utm_campaign=celeste_dash_re`。所有 UTM 只加在**博客文章链接**上，不要加到仓库、demo、视频链接上。

| 平台 | `utm_source` | `utm_medium` | `utm_content` |
|---|---|---|---|
| GitHub README | `github` | `referral` | `readme` |
| GitHub Discussion | `github` | `community` | `discussion` |
| B 站简介 / 置顶评论 | `bilibili` | `social` | `video_desc` / `pinned_comment` |
| 掘金 | `juejin` | `blog` | `article` |
| 知乎 | `zhihu` | `qa` | `answer` |
| X | `x` | `social` | `post` |
| Bluesky | `bluesky` | `social` | `post` |

示例：

```text
https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=github&utm_medium=referral&utm_campaign=celeste_dash_re&utm_content=readme
```

占位符替换：

| 占位符 | 替换为 |
|---|---|
| `{ARTICLE_ID}` | 博客发布后后台生成的文章 ID |
| `{BLOG_ARTICLE_LINK}` | `https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=...&utm_medium=...&utm_campaign=celeste_dash_re&utm_content=...` |
| `{REPO_URL}` | `https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog` |
| `{LINK}` | 按平台替换成带对应 UTM 的文章链接 |

**诚实说明**：如果博客没有接入任何分析工具，UTM 不会自动产生报表；它只是把来源写进 URL。没有数据时不要声称“来自 X 的转化提升了多少”。平台自带的阅读/播放/点赞数也要记录采集时间，不能拿核验时的读数当发布后的成绩。

---

## 2. 分平台文案

### 2.1 GitHub README

建议放在一个独立的 “Technical write-ups” 小节，不要塞进项目简介第一屏。README 修改属于仓库变更，**必须人工审核后再提交**，本包只提供文案。

```markdown
### Technical write-up: reverse-engineering Celeste's dash state machine

An unofficial, non-commercial study of how Celeste's dash lifecycle works under the hood — the four state-machine callbacks, 8-direction speed math, the difference between a wallbounce and a horizontal wall hit, the 0.15s post-dash attack window, and the four corner-correction tolerances. The findings are labeled as source-level facts, IL-level facts, inferences, and approximations.

- Article (Chinese): [Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现](https://www.instapix.icu/article?id={ARTICLE_ID}&utm_source=github&utm_medium=referral&utm_campaign=celeste_dash_re&utm_content=readme)
- Playable demo: [Celeste character engine](https://www.instapix.icu/celeste-character-demo)
- Implementation: [blog-ui/js/celeste-character.js](https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog/blob/master/blog-ui/js/celeste-character.js)

Celeste is a game by Extremely OK Games. This project is an unofficial fan work for study and demonstration only, and is not affiliated with or endorsed by Extremely OK Games.
```

### 2.2 GitHub Discussion

标题：

```text
Celeste AI Diary Companion: building a blog with a browser-playable character engine
```

正文（英文；仓库清理前不要加 repo/demo 链接，文章链接等 `ARTICLE_ID` 出来后再补）：

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

发布注意：只发 1 条 Discussion，不要到多个仓库重复贴；不要给维护者发私信求回复。仓库清理前不要加 repo/demo 链接；文章链接等 `ARTICLE_ID` 出来后再补。

### 2.3 B 站

**视频简介 / 置顶评论（差异化：视频看手感，文章看证据）**

```text
视频里是这个 Celeste 同人博客项目的整体 demo。角色冲刺部分不是“照着 Wiki 调参”，而是对着归档的 Player.cs 和本机安装版 IL 逐条对齐的：Begin 清速、协程第二帧赋速、纯上冲才是 wallbounce、向下冲刺结束不重置、DashAttack 比 Dash 多 0.15 秒。

逐帧细节和 13 个移植坑在这里（长文，含证据等级标注）：
{BLOG_ARTICLE_LINK}

项目仓库：{REPO_URL}
Demo：https://www.instapix.icu/celeste-character-demo

非商用同人二创，Celeste 版权归 Extremely OK Games；本项目与其无关联。
```

**B 站动态（短版）**

```text
把 Madeline 的冲刺状态机搬进浏览器后，最反直觉的三件事：
1. 冲刺不是按下即赋速，Begin 先把速度清零；
2. 水平冲撞墙不是 wallbounce；
3. 向下冲刺结束不重置速度。
长文把证据、推断和近似分开写了：{BLOG_ARTICLE_LINK}
```

注意：B 站对外链有限制，若简介不能放链接，用置顶评论或专栏；不要反复刷同一链接。

### 2.4 掘金

标题建议：

```text
Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现
```

摘要与开头：

```markdown
Celeste 的冲刺手感常被归结为“240 速度、0.15 秒、墙反弹”三个数字，但真正决定手感的是状态机的调用顺序：DashBegin 把速度清零，协程第二帧才赋速；DashUpdate 只处理跳跃打断；DashEnd 不碰速度。本文用归档的 Player.cs 和安装版 Celeste.dll 的 IL 做交叉取证，区分源码级事实、IL 级事实、推断与 JS 近似，并给出一个可交互的浏览器 demo。

如果你也复刻过平台跳跃，欢迎重点看两处：水平撞墙与 wallbounce 的区别，以及 DashAttackTime=0.3s 比 DashTime=0.15s 多出来的那个宽容窗口。
```

结尾：

```text
全文（含 13 个移植坑与可复现步骤）：{BLOG_ARTICLE_LINK}
仓库：{REPO_URL}
Demo：https://www.instapix.icu/celeste-character-demo

本文同步自个人博客；Celeste 版权归 Extremely OK Games，本项目为非商用同人学习项目。
```

标签：`逆向工程`、`JavaScript`、`游戏开发`、`前端`、`Celeste`。

注意：掘金偏好原创与完整正文，不要只发外链；若平台判定重复，改为“首发博客，掘金同步”的明确说明。

### 2.5 知乎

建议回答的问题类型：`如何复刻 Celeste 的冲刺手感？` / `Celeste 的移动手感为什么好？`

回答开头（先给结论，再给证据）：

```markdown
如果只记三个数字，很容易把 Celeste 的冲刺写错。更关键的是三件事：

1. wallbounce 不是“水平冲撞墙”。源码要求 `DashDir.X == 0 && DashDir.Y == -1`，也就是纯上冲 + 贴墙跳；水平撞墙只是清零水平速度，并留下 0.06 秒的速度返还窗口。
2. 向下冲刺结束不重置速度。`DashDir.Y > 0` 时，协程尾部的 `Speed = DashDir * 160` 整段被跳过，所以直下仍是 240，下斜仍是每轴 169.7。
3. 冲刺结束后还有 0.15 秒的 wallbounce 窗口。`DashAttackTime = 0.3s`，`DashTime = 0.15s`，`DashAttacking` 在回到 Normal 后仍为真。

这些结论来自归档的 `Player.cs` 与本机安装版 IL 的交叉核对；拿不到的部分（`Input.GetAimVector`、Monocle `StateMachine` 顺序）我在文中明确标成缺口，没有用记忆补全。
```

结尾：

```text
完整拆解与浏览器 demo：{BLOG_ARTICLE_LINK}
```

注意：知乎对外链和营销内容敏感；正文必须提供足够信息量，不能只放链接。不要在多个问题下复制同一回答。

### 2.6 X

**单条（英文，控制在 280 字符内）**

```text
Celeste's dash isn't "press and set speed to 240". DashBegin zeroes the speed; the coroutine assigns it one frame later. I traced the four callbacks, the 0.3s vs 0.15s attack window, and why a horizontal wall hit is NOT a wallbounce.

Write-up + playable JS demo:
{LINK}

Unofficial fan study. #gamedev #reverseengineering
```

**单条（中文，短版）**

```text
把 Celeste 的 Dash 拆到帧：Begin 先清速，协程第二帧才赋速；水平撞墙不是 wallbounce；向下冲刺结束不重置。长文把源码级事实、IL 级事实、推断和 JS 近似分开标注，附可玩 demo。
{LINK}
```

**Thread（4 条，英文）**

```text
1/4 Celeste dash, in four callbacks: Begin zeroes Speed, Coroutine assigns direction one frame later, Update handles jump interrupts, End only fires events. That one-frame delay is why demodash exists.
2/4 Diagonal dash is not 240 * sqrt(2). The aim vector is normalized first, so each axis gets 240/sqrt(2) = 169.7 and the total stays 240.
3/4 A horizontal wall hit is NOT a wallbounce. Wallbounce needs DashDir.X == 0 && DashDir.Y == -1. Horizontal hits zero vx and open a 0.06s speed-retention window instead.
4/4 DashAttackTime is 0.3s, DashTime is 0.15s. After the dash state ends, the wallbounce window is still open for ~0.15s. Write-up + demo: {LINK}
```

### 2.7 Bluesky

```text
Celeste dash reverse-engineering notes: the speed is assigned one frame after DashBegin, diagonals are 169.7 per axis (not 240×√2), and a horizontal wall hit is not a wallbounce — the real path requires a pure upward dash plus a wall jump. Source-level facts, IL-level facts, and approximations are labeled separately.

{LINK}
```

可加 1 个标签 `#gamedev`，不要堆标签。

---

## 3. 可自动生成 vs 必须人工确认

| 可自动生成 | 必须人工确认 | 不得自动化 |
|---|---|---|
| 文章 Markdown、标题备选、摘要、标签 | 平台账号登录与身份 | 批量私信、批量 @、批量评论 |
| UTM 链接拼接与占位符替换 | 平台最新规则与外链政策 | 刷播放、刷赞、刷收藏、买量 |
| 各平台文案变体、Thread 拆分 | README 是否合并、提交范围 | 多账号互推、互赞群 |
| 封面图 prompt、配图位置表 | 封面素材版权与商用边界 | 冒充官方、伪造授权 |
| 7 天节奏表、评论分类模板 | 最终事实核对与数字口径 | 抓取用户数据、爬评论做画像 |
| 链接可用性检查 | 是否披露 AI 辅助写作 | 自动登录或绕过验证码 |
| 评论区问题归类草稿 | 回复语气、道歉/更正措辞 | 删除合理批评、只留好评 |

**发布前必须人工做的 8 件事：**

1. 通读文章，确认没有“官方/授权/合作”暗示；
2. 确认所有数字与文中标注一致，尤其是 240 / 169.7 / 160 / 120 / 0.3 / 0.15；
3. 确认 `Input.GetAimVector`、`StateMachine`、`MoveNext` 仍标为缺口；
4. 确认封面没有未经许可的商业化使用游戏素材；
5. 确认 B 站视频公开可见，链接可打开；
6. 确认博客文章 URL 的 `{ARTICLE_ID}` 已替换，且无 308；
7. 确认平台规则允许外链与项目自荐；
8. 确认评论回收由本人回复，不用机器人。

---

## 4. 7 天发布节奏

时间窗是建议，不是“最佳发布时间”的承诺；以本人时区 `Asia/Shanghai` 为准。

| 天 | 时间窗 | 动作 | 目标 | 风险控制 |
|---|---|---|---|---|
| Day 0（发布前） | 任意 60 分钟 | 文章终检、链接检查、封面、UTM、记录基线数据 | 确保源站可用 | 不发布、不登录 |
| Day 1 | 20:00–22:00 | 发布博客长文；自己走一遍移动端阅读 | 建立可引用的源链接 | 先不发外链，确认文章 ID |
| Day 2 | 20:00–21:30 | GitHub Discussion 发 1 条；如愿意，人工合并 README 的 “Technical write-ups” | 获取技术反馈 | 只发 1 条，不私信维护者 |
| Day 3 | 19:00–21:00 | B 站简介/置顶评论更新；发 1 条动态 | 把视频流量导向长文 | 外链受限时用专栏/评论 |
| Day 4 | 20:00–22:00 | 掘金同步全文（注明首发博客） | 中文技术社区曝光 | 不删减成纯外链 |
| Day 5 | 20:00–21:30 | 知乎回答 1 个高相关问题 | 长尾搜索 | 正文给足信息，不复制多帖 |
| Day 6 | 21:00–22:00 | X 单条 + Thread；Bluesky 单条 | 海外曝光 | 不同账号重复刷 |
| Day 7 | 任意 60 分钟 | 回收 24h/72h 评论，更新 FAQ/更正，记录数据 | 形成闭环 | 不删合理批评，不刷量 |

**排序理由**：博客是源链接，先确保它稳定；GitHub 面向最可能给出技术批评的人群，放第二天；B 站视频已存在，适合第三天做“视频看手感、文章看证据”的导流；掘金/知乎需要完整正文，放在后半段；X/Bluesky 是补充曝光，不是主战场。

---

## 5. 评论回收

### 5.1 检查节奏

- 发布后 **24 小时**：每个平台看一次，记录未回复问题；
- 发布后 **72 小时**：第二次回收，合并重复问题；
- 发布后 **7 天**：把高频问题写进文章 FAQ 或单独短帖，不逐条吵。

### 5.2 分类与回复模板

| 类型 | 示例 | 处理 | 模板 |
|---|---|---|---|
| A. 事实更正 | “DashAttackTime 不是 0.3 吗？” | 最高优先，核对后公开更正 | “谢谢指出。我核对的是 …；如果方便请给出你的版本/偏移，我会更新文章并加修订记录。” |
| B. 细节追问 | “GetAimVector 的死区是多少？” | 指向缺口，不猜 | “这个实现不在公开归档里，我标成了缺口 G5；文中用的是 8 向单位化 + 零输入回落 Facing 的近似。” |
| C. Demo 问题 | “手机上按 X 没反应” | 先复现，再修 | “能否给一下浏览器/设备/操作步骤？我先复现，确认后修 demo 并在文章里注明。” |
| D. 选题建议 | “能不能写 Ultra 链式加速？” | 记录，不承诺 | “记下了。目前没有排期承诺；如果做，会先在仓库/文章更新。” |
| E. 低信息量 | “牛”“看看” | 简短感谢，不展开 | “谢谢，细节都在文章里。” |

### 5.3 公开更正规则

- 事实错误：在原文对应段落加“修订”标注，并在文末加一条修订记录；不要静默改数字。
- 版本差异：明确写“这是 1.4.x / 安装版 Everest 补丁的观察”，不要把版本差异说成谁对谁错。
- 无法确认：直接写“无法确认”，不要用“应该是”“我记得”补位。
- 不删合理批评；只处理 spam、辱骂、广告。

### 5.4 记录表（人工维护）

| 日期 | 平台 | 链接/评论 | 类型 | 摘要 | 回复 | 是否需改文 | 状态 |
|---|---|---|---|---|---|---|---|
|  |  |  | A/B/C/D/E |  |  | 是/否 | 待处理/已回复/已更正 |

---

## 6. 发布前检查清单

- [ ] `docs/celeste-dash-article.md` 已通读，五类标注齐全
- [ ] 3 个备选标题、摘要、标签、封面建议、配图/视频位置表齐全
- [ ] 版权声明与“无关联/未授权”表述存在
- [ ] `{ARTICLE_ID}` 已替换，文章 URL 返回 200（不是 308）
- [ ] Demo 链接返回 200
- [ ] B 站视频 `code=0`，公开可见
- [ ] 仓库 README 若修改，已人工审核并单独提交
- [ ] 所有 UTM 的 `utm_campaign=celeste_dash_re` 一致
- [ ] 没有引用播放/点赞数作为背书
- [ ] 没有“官方/授权/合作”暗示
- [ ] 没有建议刷量、互赞、批量私信、多账号
- [ ] 评论回收人和时间已确定

---

## 7. 风险与合规

- **IP**：Celeste 素材版权归 Extremely OK Games；本项目是非商用同人二创，仅学习/演示；不使用官方 logo 做项目背书。
- **平台规则**：GitHub 只发 1 条 Discussion，不跨仓库重复；B 站外链可能受限；掘金要求原创/完整正文；知乎反营销；X/Bluesky 不做自动化互动。
- **数据**：不伪造播放、点赞、收藏、评论、转化；核验读数只用于内部记录，不写进对外文案。
- **AI 披露**：如果平台要求或读者询问，明确说明“草稿由 AI 辅助整理，事实核对与发布由本人完成”；不要隐瞒。
- **安全**：不发布账号密码、Token、数据库地址、内网信息；截图前检查 HUD/控制台是否泄露敏感信息。

---

*本推广包只是草稿与清单，未执行任何发布动作。*
