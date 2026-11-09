# 社区曝光内容交付 · Celeste Dash 逆向长文

## 状态
已由用户在当前请求中明确授权执行。只读使用仓库素材，不发布、不登录、不改生产、不改代码、不提交。

## 目标
产出两份中文 Markdown 草稿：

1. `docs/celeste-dash-article.md` —— 可直接粘贴进博客编辑器的技术长文。
2. `docs/celeste-dash-promo.md` —— 分平台推广文案、UTM 规范、自动化边界、7 天发布节奏与评论回收清单。

## 选题判定
- 首选 Dash 逆向，**不切换**。
- 依据：`celeste-dash-反编译研究.md` 已有源码级证据（`Player.cs` 186,844 B / 5,471 行）、IL 级证据（`Celeste.dll` 220 methods / 355 fields，coverage complete）、JS 实现（`blog-ui/js/celeste-character.js`）与可交互 demo（`blog-ui/celeste-character-demo.html`）。
- 不编造任何未取得的 IL 或 C# 伪代码；缺口集中标注。

## 事实与核验基线
| 项 | 结论 | 来源 |
|---|---|---|
| 归档仓库 | `NoelFB/Celeste`，2023-03-16 归档只读 | 研究文档 §0 |
| `Player.cs` | 186,844 B / 5,471 行；双代理取回字节数一致 | 研究文档 §0 |
| 缺失文件 | `Input.cs` / `PlayerHair.cs` / `PlayerSprite.cs` / `Assists.cs` 均 404 | 研究文档 §0 |
| 安装版 DLL | SHA-256 `999024e23285acc0c7ac37b6ed33874e16a1f0f9af5fdeff66a64050b78f8e24`，5,223,424 B | 研究文档 §14 |
| IL 覆盖 | `Celeste.Player` token `0x020007c9`，220 methods / 355 fields / 2952 field_accesses，coverage complete | 研究文档 §14 |
| 反编译限制 | `rea decompile` 返回 `provider_unavailable`，无 C# 伪代码 | 研究文档 §14 / G1 |
| Dash 常量 | `DashSpeed 240` / `EndDashSpeed 160` / `EndDashUpMult .75` / `DashTime .15` / `DashCooldown .2` / `DashRefillCooldown .1` / `DashAttackTime .3` | 研究文档 §1 |
| SuperWallJump | `170 / -160`，`varJump .25`；必须纯上冲 + 贴墙跳 | 研究文档 §6.3 |
| demo | `https://www.instapix.icu/celeste-character-demo` 本次复核 HTTP 200，标题 `Celeste 人物引擎 · 测试展示（Climb + Dash + Boost）` | 本次网络核验 |
| B 站视频 | `BV13QYT64EDX` 公开接口 `code=0`；标题《与Madeline写日记｜Celeste AI日记博客demo展示》；UP 主 `Spongebob452`；时长 213 秒 | 本次网络核验 |
| 文章 URL 形式 | `https://www.instapix.icu/article?id={ARTICLE_ID}`；`.html?id=` 会 308 跳转 | `index-1.js` + 本次 curl 核验 |

## 文章要求
- 标题：主标题 + 3 个备选。
- 结构：问题背景 → 取证方法 → 状态机/常量 → 核心分支（以 SuperWallJump 为主，Super/Hyper/Ultra/角修正为辅）→ Web 实现 → demo 验证 → 可复现步骤 → 缺口 → 版权。
- 每处关键结论标注：【事实·源码级】【事实·IL 级】【推断】【近似】【缺口】。
- 明确 `Input.GetAimVector`、Monocle `StateMachine` 调用顺序、编译器 `MoveNext` 为缺口。
- 口吻：技术长文，无营销腔，不暗示官方/授权/背书。
- 版权声明：Celeste 素材版权归 Extremely OK Games；非商用同人二创，仅学习/演示；与本项目无关联声明。
- 配图/视频位置表；封面建议避免直接使用受版权保护的精灵图作为商业封面。

## 推广包要求
- GitHub README / GitHub Discussion / B 站 / 掘金 / 知乎 / X / Bluesky 差异化文案，均带 UTM 占位。
- UTM 统一：`utm_source` / `utm_medium` / `utm_campaign=celeste_dash_re` / `utm_content`。
- 自动生成 vs 必须人工确认边界；明确禁止刷量、互赞、批量私信、多账号。
- 7 天节奏：先博客，再 GitHub，再 B 站，再掘金/知乎，最后 X/Bluesky；含评论分类与回复模板。
- 不引用播放/点赞数做宣传背书；核验读数仅内部记录。

## 验收
1. 两个文件存在，均为 UTF-8 Markdown。
2. 文章含 3 个备选标题、摘要、标签、封面建议、配图/视频位置表。
3. 文章五类标注齐全，缺口章节存在，版权声明存在。
4. 推广包含 UTM 表、自动化边界、7 天节奏。
5. 链接：demo 200、视频 `code=0`、文章 URL 形式正确（占位符）。
6. `git status` 只新增两份文档与 spec/tasks，无代码改动。

## 非目标
不发布、不登录任何平台、不修改 README/代码/数据库、不部署、不提交。
