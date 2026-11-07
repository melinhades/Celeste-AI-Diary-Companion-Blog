# Badeline 偶尔顶班日记页 · 策划方案

## 结论（推荐方案）

**做「手动召唤 + 低频加权触发」的“暗面顶班”，不做常驻切肤。** 具体是：默认她不在；用户双击日记页的 Madeline 像素小人（或点书页角的镜子）可以主动请她来；此外每天只在“深夜 + 当天情绪偏负 + 连续低谷”等信号叠加时，才有一次低概率（≤30%）的自动出现。她来的时候**整页换人**——像素小人换成 Badeline、聊天头像与对话框立绘换成她的 15 张表情、主题色转紫黑、打字指示器变紫、开屏一句话由她来说；**BGM 默认不换**（用户可能自定义过 `berryBgm`），P1 再考虑淡入 `in-stasis.mp3`。她走的时候从镜面退回，Madeline 走回来。

**红线优先级高于一切**：危机文本、`isCrisisDraft`、裁判 R 类命中时，**她绝不顶班**；已经顶班也立刻交还 Madeline 并走安全回应。她的说话方式用现成的 `badelineSystem` + 一段新的日记背景（不是梦境背景），不改她的核心，也不复用 Madeline 的“嗯，我在听～”兜底。

状态只放 `localStorage`（按日 `{date, active, count, lastAt}`），刷新保持，一天最多 1 次（手动召唤最多再 +1），7 天冷却。P2 再考虑后端字段与跨设备。

---

## 0. 真实代码盘点

### 0.1 日记页里“Madeline”的全部载体

| 载体 | 位置 | 现状 |
|---|---|---|
| 像素小人 | `blog-ui/js/diary.js:2326`（`#pixelMadeline`）；素材表 `PM_SRC` `2330-2338`；状态机 `pmState` `2339-2351`；切帧 `pmSetSrc` `2387-2404`；行为 `pmThink` `2569-2599` | 6 个 gif + `fallPose` 帧序列；有走/坐/睡/醒/跳/看 |
| 像素小人对情绪的反应 | `pmReactToEmotion` `2554-2568`；`pmBounce` `2546`；`requestMode('fun'/'sit')` | 只认 `isPositive/isGloomy`（`2509` 来自 `MadelineMood` 核心） |
| 聊天头像（历史框顶部） | `avatarMap` `224`；`#chatAvatar` 帧循环 `377-392`；`currentEmotion` `304`；`setAvatar` `309-313` | 每 1.2s 按 `currentEmotion` 换帧 |
| 历史气泡头像 | `newMadelineRow(emotion)` `359-376`（`367` 设 `avatarMap[emotion]`） | 创建时固定，之后不随情绪变 |
| 对话框立绘 | `gameDialogPortraitImg.src = avatarMap[emotion]` `237` | 主线对话用 |
| 主题色 | `updateThemeByEmotion` `275-278`；`emotionSceneMap` `252`；`#emotion-bg` `297` | 通过 `body.className = 'emotion-' + ...` 切 CSS |
| BGM | `applyBerryBgm` `2139-2143`（`localStorage.berryBgm` → `bgm/<name>.mp3`）；播放/续时 `3022-3044` | 默认日记 BGM + 用户可换 |
| 打字指示 | `TextFx` 集成 `496-693`；`companionState.isTyping`（`2571` 让像素小人 `peek`） | 打字时小人跑过来看 |
| 睡眠梦话 | `dreamLines` `2784`；`pmThink` 睡眠分支 `2594-2599` | 5 句固定梦话 |
| 开屏问候 | **没有**。进页只恢复 `savedEmotion` 并 `updateThemeByEmotion('默认'/saved)` `3049` | 无问候语机制 |
| 心晶 | `heartCrystalDay` `shop.js:1439-1451`；`heartDoorHearts` `shop.js:1966-1982`；心门条件 `shelf.js:3365` | 按日首颗 + 已收下的心数组 |

### 0.2 情绪 / 立绘链路

```
前处理情绪（DiaryChatEmotionExtractor）
   → companionState.currentEmotion（diary.js:1623-1624，仅 finishMeta 更新）
   → updateThemeByEmotion(主题) + setAvatar(头像)
   → pmReactToEmotion(像素小人反应)
正文 [m:…] → MadelineMood.feeder() → applyMood(当前气泡) → 历史气泡固定
SSE done.emotion → 只来自首行 [emotion:…]（DiaryServiceImpl.java:878-884、1006）
```

已知断点（上一轮已诊断）：`done.emotion` 只认首行标记；正文 `[m:…]` 只驱动当前气泡；历史没有助手表情字段；`pmReactToEmotion` 在 `chatOpen` 时直接 return（`diary.js:2554-2568`）。

### 0.3 会和“顶班”冲突的四套机制

| 机制 | 位置 | 冲突点 |
|---|---|---|
| `currentEmotion` | `diary.js:304`、`1622-1634` | 顶班后头部头像/主题仍按 Madeline 的情绪帧走；若 Badeline 有自己的 15 表情，需要独立 `badelineEmotion`，不能复用 `avatarMap` |
| `applyMood` | `diary.js:472-478` | 只作用于“当前气泡”；顶班后新气泡必须用她的头像帧，历史气泡不会改 |
| `pmReactToEmotion` | `diary.js:2554-2568` | `chatOpen` 时早退；顶班演出若在聊天中触发，她不会有反应动作 |
| `toggleChat` | `diary.js:953-962` | 开关聊天只切 CSS；顶班的进/退必须与它协调，不能把正在输入/正在流的对话打断 |
| 心晶 | `shop.js:1439-1451`、`1966-1982` | `heartCrystalDay` 一天一颗、按 `day` 日记算；顶班不能生成/吞掉一颗心，也不能改颜色规则 |
| 人格闸门 | `DiaryChatPersonaChecker.java:132-169`；`DiaryServiceImpl.java:1041-1089`；危机 `794-795`、`844-852` | 兜底句「嗯，我在听～」是 Madeline 的台词；顶班时必须换成她的兜底，且危机场景强制交还 Madeline |
| 梦境夜话 | `DiaryServiceImpl.java:1534-1547` | 这条路径**没有裁判、没有危机拦截**；顶班如果复用“夜话”的直连方式，会把风险带进日记页 |

### 0.4 Badeline 素材盘点（`blog-ui/atlases` 与 `blog-ui/celeste-portraits`）

| 可用 | 位置 | 用途 |
|---|---|---|
| 立绘 15 表情 | `blog-ui/celeste-portraits/badeline/{normal,concerned,serious,scoff,angry,angryAlt,yell,upset,sad,sigh,worried,worriedAlt,freakA,freakB,freakC}00-10.png` | 聊天头像、对话框立绘、夜话 |
| 镜子立绘 9 表情 | `atlases/Portraits/madelinemirror/{angry,deadpan,determined,distracted,normal,panic,sad,surprised,upset}` | 镜子出场/退场的“镜中她” |
| 像素小人 | `atlases/Gameplay/characters/player_badeline/*`（`idleA/B/C`、`dash`、`dreamDash`、`hair`、`bangs`、`fall`、`faint`、`dead*`） | 替换 `PM_SRC`（PNG 帧，不是 gif） |
| 叙事动作帧 | `atlases/Gameplay/characters/badeline/*`（`idle`、`laugh`、`angry`、`boost`、`dreamDash`、`hug`、`sleep`、`faint`、`dangling`） | 出场/退场演出 |
| 特效 | `atlases/Gameplay/characters/badelineBoss/*`（`beam`、`beamStart`、`charge`、`projectile`、`scared`）；`atlases/Gameplay/objects/badelineboost/*`（34 帧） | 镜面裂开、冲刺入场 |
| 文本立绘 | `atlases/Portraits/textbox/badeline.png`、`badeline_mini.png` | 对话框小头像 |
| 梦境/篝火 | `atlases/Gameplay/objects/campfire/dream00-08` | 梦境场景（与本方案共用氛围） |
| BGM | `blog-ui/bgm/in-stasis.mp3`（已有）、`Resurrections.mp3` | P1 可选顶班曲，不必新增音频 |

**缺什么**：
- 没有 Badeline 的 gif 版走路/坐下/睡觉（Madeline 用的是 gif）；需要用 `player_badeline` PNG 帧自己搭 55ms 帧循环（`pmSetSrc` 已支持帧数组，`2375-2401`）。
- 没有她的“打字旁观”姿态（Madeline 是 `peek`）；可用 `badeline/idle` 或 `lookUp`。
- 没有“她坐在书页边”的专属构图；需要 CSS 定位，不一定要新素材。
- 没有独立的日记页问候语音/音效；P1 用文字即可。

---

## 1. 触发条件

### 候选

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 纯手动 | 双击像素小人 / 点书页角的镜子 | 完全可控、不会在脆弱时被吓到；缺点是大多数用户不会发现 |
| B 纯概率 | 每次打开日记页 `x%` | 有“她真的会来”的活性；不可测试、可能在用户正难过时出现，容易变成骚扰 |
| C 情绪阈值 | 当天情绪负面且强度≥4、或连续 3 天低谷 | 最贴主题（她因焦虑而来）；但会形成“我一难过她就来”的条件反射，风险高 |
| D 事件/日期 | 心晶炼成、写完梦、纪念日 | 有意义、可解释；容易设计成任务系统，范围失控 |

### 推荐：A + 低频加权（B/C 的收敛版）

- 手动永远可用（不消耗自动概率）。
- 自动只在“打开日记页那一刻”掷一次，不重复掷：
  `P = min(0.30, 0.10*深夜 + 0.10*当天负面强度≥4 + 0.10*连续3天负面 + 0.05*当天写过梦)`
  - 深夜：22:00–03:00
  - 负面：`companionState.currentEmotion` 属于 `不安/不开心/怨恨/悲伤/孤独`，且强度≥4（若拿不到强度，只看标签）
  - 连续 3 天负面：读 `recentEmotionNote` 或近 3 天情绪标签（P1）
- 冷却：出现后 7 天内不再自动出现；同一天最多 1 次（手动召唤可 +1，但一天总上限 2）。
- **硬闸门**：`isCrisisDraft(draft)` 为真、或当天最近一篇日记命中危机词 → 自动概率强制 0，手动召唤也拒绝，并提示“今天她不来”。

---

## 2. 出场与退场

### 候选

| 方案 | 演出 | 取舍 |
|---|---|---|
| A 镜子 | 点镜子 → 镜面波纹 → 她从镜里走出；Madeline 的像素小人退到书页后 | 最贴《蔚蓝》的暗面设定；`madelinemirror` 九张立绘现成；实现只需 CSS + 一张覆盖层 |
| B 火光 | 篝火转紫 → 烟里出现 | 与日记页篝火场景连贯；但“烟里出现”容易做成恐怖片，惊悚风险高 |
| C 直接替换 | 淡出/淡入 300ms | 零风险、零演出；用户会觉得“换了个皮肤”，没有“她来了”的体感 |

### 推荐：A（P0 用简化镜面），C 作降级

- 进场：镜子高光扫过 180ms → 镜面波纹 240ms → Badeline 立绘从镜中 `clip-path` 展开 320ms → 主题色 500ms 过渡 → 像素小人换帧。
- 退场：她走向镜子 → 波纹 → 淡出 400ms → Madeline 走回原位（复用 `pmStartWalk`）。
- **不打断对话**：
  - 若 `companionState.isTyping` 或 SSE 正在流：排队，等 `isTyping=false && !streaming` 再演。
  - 若聊天框打开且有未发送草稿：只在顶部浮一条“她来了”提示，等用户发送后再整页换。
  - 任何时候都不改变已发消息、不中断当前回复。
- 移动端/`prefers-reduced-motion`：直接 C（淡入淡出 200ms），不做波纹。

---

## 3. 表现层

### 候选

| 方案 | 换什么 | 取舍 |
|---|---|---|
| A 全量换人（推荐） | 像素小人、聊天头像、对话框立绘、主题色、打字色、开屏语全换；BGM 不换 | 用户一眼知道“现在是她在”；改动集中在前端表现层；风险是惊悚与误认 bug |
| B 局部换 | 只换聊天头像 + 主题色，像素小人仍是 Madeline | 改动最小；但“顶班”感弱，像素小人会穿帮（Madeline 还在走） |
| C 反向 | Madeline 退场，Badeline 坐在篝火旁，整页变成“她的房间” | 气质最强；工作量大，且会与日记编辑区争夺视线 |

### 推荐：A，按下面清单执行

- 像素小人：`PM_SRC` 换到 `player_badeline` 帧组（`idleA`/`dash`/`dreamDash`），保留原状态机与 `pmThink` 的走/坐/睡；睡眠梦话换 `badelineLines`（她的 5 句，见 P1）。
- 聊天头像/立绘：`avatarMap` 分支到 `celeste-portraits/badeline/{emotion}`，默认 `normal`；`setAvatar` 增加 `persona` 参数，避免污染 `currentEmotion`。
- 主题：新增 `body.emotion-badeline` 或 `body[data-persona="badeline"]`，紫黑 + 霓虹；不改 Madeline 的 `emotion-*` 映射（`diary.js:275-278`）。
- 打字指示：`TextFx` 颜色变量切紫；`pmThink` 的 `peek` 用 `badeline/lookUp` 帧。
- 开屏问候：她不问“今天怎么样”，而是 3 选 1 的低频短句（P1 从池里取，P0 只一句固定）；不能每天同一句。
- BGM：**P0 不换**（尊重 `berryBgm` 用户选择，也避免突兀）；P1 若用户没自定义 `berryBgm`，用 1.2s 交叉淡入 `bgm/in-stasis.mp3`，退场淡回；P2 再评估专属曲。

---

## 4. 人格差异

### 候选

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 复用 `badelineSystem` + 新的“日记顶班背景”（推荐） | 她仍是同一个 Badeline，只换场景；新增 `badelineDiaryBackground(todayDiary, emotionNote, hearts, madelineLastReply)` | 成本低、人格不漂移；需要小心“梦境背景”的台词（梦境任务不适用日记） |
| B 新写一套“日记版 Badeline”人格 | 更贴日记场景，语气可更软 | 两套人格容易漂移，且会稀释“她是同一个人”的设定 |

### 推荐：A + 三条强制约束

1. **她不是治疗师**：禁止诊断、禁止“你该去看心理医生”、禁止“一切都会好起来”；沿用 `PromptBuilder.java:884-889` 的禁令。
2. **她只戳穿，不接管**：只对“这次写的内容 + 今天的情绪 + 她的记忆”说话；禁止替用户做决定、禁止给行动指令。
3. **危机不顶班**：`isCrisisDraft` / R 类命中 → 立刻 `mode=madeline`，由 Madeline 的安全回应接管；她的立绘在 200ms 内退场。

### 明确改动点

- 新增 `PromptBuilder.badelineDiaryBackground(...)`（结构参照 `badelineDreamBackground`，`PromptBuilder.java:1063-1091`，但把“梦境任务”换成“日记顶班任务”）。
- 伴侣流式入口增加 `persona` 参数（`DiaryServiceImpl.java:647-1011`），system 选择 `badelineSystem(badelineDiaryBackground(...))`。
- 人格闸门增加 `mode`：`checkOnce` 的 `suggestion` 若为空且 R 类命中，兜底句按 `mode` 选——Madeline 用「嗯，我在听～」，Badeline 用她自己的短句（需新增常量），**不能让她说 Madeline 的台词**（`DiaryChatPersonaChecker.java:132-169`、`DiaryServiceImpl.java:1082-1085`）。
- `diary_chat_log` 增加 `persona`（或写进 `model_raw` 前缀）用于区分谁说的，避免她的句子污染 `recentEmotionNote`。

---

## 5. 与心晶的关系

### 候选

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 同一颗心（推荐） | 心晶仍是 `heartCrystalDay` / `heartDoorHearts` 那一套；颜色/命名不改；她只改变“读这颗心时的语气” | 不产生第二套货币；心门、商店、日记统计都不受影响 |
| B 另起一套“她的心” | 新颜色/新名字/新存储 | 视觉有辨识度；但会出现两套心、心门条件混乱、用户不知道哪颗算数 |
| C 同颗心 + 紫色描边 | 数据同一颗，展示时加紫边/她的签名 | 兼顾辨识与一致；实现只在渲染层 |

### 推荐：A，P2 可选 C

- 数据源不变：`shop.js:1439-1451`、`1966-1982`；`heartTitle` 的红/蓝/黄映射不改（`PromptBuilder.java:798-842`）。
- 她顶班时如果提到心，只说“你今天那颗心”/“你炼的那颗”，不重新命名；P2 再给她一句“她的读法”（只展示，不落库）。
- 绝不允许顶班状态改变 `heartCrystalDay` 的当日首颗判定，也不允许她在危机日生成心。

---

## 6. 状态与持久化

### 候选

| 方案 | 存储 | 刷新 | 上限/冷却 | 取舍 |
|---|---|---|---|---|
| A localStorage 按日（推荐） | `badelineDiaryDay = {date, active, count, lastAt, manual}` | 保持到当日结束或用户点“让她走” | 1 次自动 + 最多 1 次手动；7 天冷却 | 最简单；不跨设备；多标签页需 `storage` 事件同步 |
| B sessionStorage | 同 A，但关标签即失 | 刷新还在，关掉就没 | 同 A | 体验断层，不推荐 |
| C 后端字段 | `user.diary_persona_date/count` | 跨设备 | 同 A | 需要新列/接口；P2 才值 |

### 推荐：A（P0），C（P2）

- 进入页面读 `active && date===today` → 直接以她的主题/头像开场（不重播进场演出，只做 200ms 淡入）。
- 午夜自动失效；`lastSeenDate` 存冷却起点。
- 多标签页：监听 `storage`，另一个标签切成顶班时同步（P1）。
- 退出：用户点“让玛德琳回来”或写完一篇日记后自动退（P1 规则）。

---

## 7. 风险

| 风险 | 触发点 | 缓解 |
|---|---|---|
| 视觉惊悚 | `freakA/B/C` 立绘、镜面波纹、紫黑突变 | 前 3 秒只用 `normal/concerned/scoff`；`freak*` 仅在她被激怒后；无闪屏、无音效跳吓；`prefers-reduced-motion` 走淡入 |
| 误以为出 bug | 像素小人/头像/主题突然换 | 顶部常驻一个 11px 小标「暗面 · 她在」；提供“让玛德琳回来”；换人不动布局、不动正文 |
| 与“我在听”兜底冲突 | `gateSentence` R 类兜底、危机前置固定句 | 顶班时 `mode` 传给裁判；她不说 Madeline 的兜底句；危机强制切回 Madeline（`DiaryServiceImpl.java:794-795`、`844-852`、`1082-1085`） |
| 打断对话 | 正在流式/正在输入 | 排队到 `isTyping=false && !streaming`；聊天中只提示不换页 |
| 记忆污染 | 她的话进 `recentEmotionNote`/记忆提取 | `persona` 标记；她的句子不参与次日“她最近的情绪状态” |
| 心晶错乱 | 顶班日的心 | 不改 `heartCrystalDay` 判定；顶班不生成心 |
| 素材穿帮 | 像素小人还用 Madeline gif | P0 必须同时换 `PM_SRC`；否则只做 B 方案（不换像素小人） |

---

## 8. 分阶段

### P0（最小可用，最能体现“她真的来了”）

- `diary.js`
  - `PM_SRC` 增加 Badeline 帧组（`2330-2338`），`pmSetSrc` 复用（`2387-2404`）
  - `avatarMap` 分支（`224`）、`setAvatar` 加 `persona`（`309-313`）、`newMadelineRow` 加 `persona`（`359-376`）
  - 主题新增 `body[data-persona="badeline"]` 映射（不改 `275-278`）
  - 手动入口：双击 `#pixelMadeline`（参考 `2859-2862` 的现有双击）+ 书页角镜子按钮
  - 进场/退场简化镜面（CSS 覆盖层 + `clip-path`），排队条件用 `companionState.isTyping`
  - `localStorage` 按日状态（P0 只存 `active/count/lastAt`）
- `diary.html` / `diary.css`：镜子按钮、紫色主题变量、Badeline 头像尺寸、11px「暗面 · 她在」小标、“让玛德琳回来”
- 后端
  - `PromptBuilder` 新增 `badelineDiaryBackground(...)`
  - `DiaryServiceImpl` 伴侣流式入口加 `persona` 参数与 system 分支
  - `DiaryChatPersonaChecker` 兜底按 `mode` 选句；`gateSentence` 透传 `mode`
  - 危机硬闸门：`isCrisisDraft` 时 `persona=madeline`
- 验收：手动召唤能换人；刷新保持；危机文本她不出现；R 类兜底不是她的声音。

### P1

- 自动加权概率 + 7 天冷却（`diary.js` 打开页时掷一次）
- 开屏问候池（5–8 句，按情绪/心色选，不重复）
- 睡眠梦话换 `badelineLines`（`2784` 分支）
- BGM 可选淡入 `bgm/in-stasis.mp3`（尊重 `berryBgm`）
- `diary_chat_log.persona` 落库；`recentEmotionNote` 排除她的句子
- 多标签页同步、写完日记自动退场
- 心晶“她的读法”一句话（只展示）

### P2

- 完整镜面演出（`madelinemirror` + `badelineBoss/beam` + `badelineboost` 帧）
- 她的专属像素动作（`dreamDash` 入场、`boost` 离场）
- 顶班状态后端字段（跨设备）
- 独立 BGM 曲/音效（若确认版权与素材）
- “她的心”展示层紫边（不改数据）
