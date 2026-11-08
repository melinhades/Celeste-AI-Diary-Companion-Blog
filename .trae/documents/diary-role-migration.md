# 日记页角色迁移梳理（Madeline → Badeline）

范围：`blog-ui/diary.html`、`blog-ui/js/diary.js` 及其直接依赖的页面级脚本、接口与后端服务。
本文只记录现状、耦合与迁移成本，不含代码改动。行号以当前仓库版本为准。

两个前提约束：

- 日记页里的 Badeline「一小时替班」是剧情暂驻，不是固定入口，不动。
- 每日明信片是页面的日常仪式，不是角色通道，不动。

---

## 1. 全量清单表

说明：

- 「现在归谁做」分四类：**面板内**（聊天框自身）、**页面级**（diary.js 主流程）、**后端**（接口/提示词/落库）、**shelf 页**（书架独立页面）。
- 难度取值：**配置级**＝换人设配置即可；**前端换皮**＝换资产/文案/映射；**主干**＝要改接口、协议或主流程；**无需动**＝与角色无关。
- 「状态」列留空，供后续逐项打勾。

| # | 是什么 | 触发方式 | 位置 | 现在归谁做 | 换成 Badeline 要动什么 | 难度 | 状态 |
|---|---|---|---|---|---|---|---|
| A1 | 像素小人单击：摸头回应 / 撞墙被凶 / 睡眠中梦话 | 点击 | `diary.js:3117-3125`、`3090-3105`、`3106-3115`、`2832-2849` | 页面级，Madeline 台词与 GIF | 换 `petLines`、`dreamLines`、`pmScold` 台词、像素帧与情绪 | 前端换皮 | |
| A2 | 像素小人双击：开/关聊天面板 | 双击 | `diary.js:3127-3130`、`1140-1151` | 面板内，通用交互 | 面板标题、头像、日志 key 按角色切换 | 前端换皮 | |
| A3 | 浮动头像按钮、快捷输入框 | 点击 / 输入 | `diary.html:79-86`、`diary.js:1170-1221`、`915` | 面板内，通用交互 | 头像、placeholder、名字 | 前端换皮 | |
| A4 | 聊天面板发送（闲聊） | 点击 / 回车 | `diary.js:1134-1136`、`1114-1122`；后端 `/chat` | 后端 Persona + 面板 | 服务端切 active persona；前端头像/名字/情绪集合跟随 | 配置级 | |
| A5 | 聊天面板发送（任务意图） | 点击 / 回车 | `diary.js:955-957`、`1010-1131`；`AgentController.java:12,23-26` | 后端 Madeline agent | 入口参数、系统提示、工具清单、情绪白名单、结果卡片 | 主干 | |
| A6 | 聊天历史记录（本地最近 20 条 / 恢复 6 条） | 打开面板 / 自动 | `diary.js:309`、`789-816`；`api.js:89-96` | 面板内，本地存储 | 日志 key 按角色分区；头像与情绪渲染跟随 | 前端换皮 | |
| A7 | 聊天面板加载占位、失败错误提示 | 自动 | `diary.js:844-876` | 面板内，通用 | 无 | 无需动 | |
| A8 | 对话情绪 → 头像 / 立绘 / 背景主题 | 自动 | `diary.js:224-233`、`302`、`335`、`359`、`851`、`2438`；`madeline-mood.js` | 前端情绪集合 | 扩成共享词表，并把两套表情做映射 | 前端换皮（第二步收敛） | |
| A9 | 逐字显示、说话音效 | 自动 | `diary.js:436-530`；`MadelineMood` | 前端资源 | Badeline 语音包、音效映射 | 前端换皮 | |
| A10 | 关闭聊天面板 ✕ | 点击 | `diary.js:1151` | 面板内，通用 | 无 | 无需动 | |
| B1 | 服务端主动冒泡（SSE `bubble`） | 自动 | `diary.js:1537-1570`；`ProactiveServiceImpl.java:50-80,166-200` | 后端决策 + 前端气泡 | 服务端 persona 提示词；前端头像/气泡样式 | 配置级 | |
| B2 | 保存日记后 2 秒再主动冒泡 | 自动 | `diary.js:2456-2461` | 页面级 | 跟随 B1 | 配置级 | |
| B3 | 游戏对话框：出现、点击关闭、6 秒自动收起 | 自动 / 点击 | `diary.js:416-434`、`475`；`diary.html:27-38` | 页面级，Madeline 名字与头像 | 名字、头像、立绘、台词全部角色化 | 前端换皮 | |
| B4 | 陪写：写作过程中的流式反应 | 自动 | `diary.js:1883`、`2010-2020`、`2217`；`/diary/companion/stream` | 后端 Persona + 页面 | 服务端 persona；前端头像 | 配置级 | |
| B5 | 陪写「打断她 / 继续」按钮 | 点击 | `diary.html:34-37`；`diary.js:1596-1614` | 页面级，通用 | 无 | 无需动 | |
| B6 | 夜间入睡后的梦话计时 | 自动 | `diary.js:2832-2849` | 页面级，Madeline 台词 | `dreamLines` 与像素帧 | 前端换皮 | |
| B7 | 节日彩蛋台词 | 自动（按日期） | `diary.js:3493-3526` | 页面级，Madeline 台词表 | 整张 `HOLIDAY_EGGS`；其中 `10-31` 明写 Badeline | 前端换皮 | |
| B8 | 离页道别、草稿恢复台词 | 自动 | `diary.js:3529-3547` | 页面级，Madeline 台词 | `farewellLines` | 前端换皮 | |
| C1 | 回忆书架按钮，跳 `shelf.html` | 点击 | `diary.js:3136-3154`、`3247` | 页面级跳转，书架在 shelf 页 | 若由 Badeline 在日记页承担，需要面板内列表/详情钩子 | 主干 | |
| C2 | 书架列表加载、点选某一天 | 自动 / 点击 | `shelf.js:452`、`376`；`/diary/list` | shelf 页 | shelf 页本身是 Badeline 主场；要复用进日记面板需抽共享模块 | 主干 | |
| C3 | 书架详情「回去编辑这篇」 | 点击 | `shelf.js:486-488`；`diary.js:3360-3368` | shelf 页 | 无 | 无需动 | |
| C4 | diary.js 内置「回忆书架」面板 | 未启用 | `diary.js:3156-3290` | 无（从未 `.open`，属死代码） | 启用时需接角色配置与列表接口 | 前端换皮（当前死代码） | |
| C5 | 书架导出明信片 | 点击 | `diary.js:3453-3492` | 页面级 | 落款「×N — Madeline」写死 | 前端换皮 | |
| D1 | 草莓徽章点击，角色说一句 | 点击 | `diary.js:2336-2346` | 页面级，固定台词 | 台词、情绪标签 | 前端换皮 | |
| D2 | 草莓余额显示、`berries:change` 实时刷新 | 自动 | `diary.js:2323-2351`、`2483`；`api.js:45-62`；`SysUserServiceImpl.java:110-118` | 后端权威 + 页面缓存 | 无 | 无需动 | |
| D3 | 草莓籽收集 | 点击 / 自动 | `seed.js:715`、`759`；`api.js:71-78` | 全站共用 | 无 | 无需动 | |
| E1 | 每页保存图标、SAVE 按钮 | 点击 | `diary.js:2286-2301`、`2507-2509` | 页面级，通用 | 无 | 无需动 | |
| E2 | 保存写入 `POST /diary` | 自动 | `diary.js:2433` | 后端 | 无 | 无需动 | |
| E3 | 保存后调用 `/diary/summary` 并让角色开口 | 自动 | `diary.js:2444-2450`；`DiaryServiceImpl.java:1217-1264` | 后端总结（提示词写死）+ 页面说话 | 总结提示词角色化；结果仍走 `addMadelineMessage` | 主干 | |
| E4 | 坏情绪 → 金羽毛邀请 | 自动 | `diary.js:2452-2453`、`2050-2051`；`feather-trigger.js:39,98-106` | 页面级 + 后端 | 邀请文案角色化 | 前端换皮 | |
| E5 | 保存成功后的庆祝、里程碑动作 | 自动 | `diary.js:2479-2486`、`2739`、`3051` | 页面级，Madeline 立绘 | 立绘与动作帧 | 前端换皮 | |
| E6 | 困境检测生成课件 | 自动 | `diary.js:2467-2477`；`detect.js`、`pptgen.js` | 后端/页面通用 | 无 | 无需动 | |
| E7 | 保存计数、封面贴纸、日期 | 自动 | `diary.js:2481-2486`、`123-146` | 页面级，通用 | 无 | 无需动 | |
| F1 | 金羽毛入口按钮 | 点击 | `diary.html:40`；`diary-2.js:40-54` | 页面级 | 入口图标本身不用换；游戏内角色要换 | 前端换皮 | |
| F2 | 羽毛随笔弹框保存 `POST /feather` | 点击 / 输入 | `diary.html:44-59`；`diary-2.js:64` | 页面级 + 后端 | 无 | 无需动 | |
| F3 | 金羽毛游戏内立绘、名字、台词、配色 | 点击 / 自动 | `feather-game.js:59-70`、`105-118`、`121-131`、`183-206` | 前端游戏内，Madeline 资产 | 立绘、名字、四组台词、情绪到立绘的映射、配色 | 前端换皮 | |
| F4 | 羽毛结束 / 落地后的收尾台词 | 自动 | `diary.js:3008-3025` | 页面级，Madeline 台词 | 台词与情绪 | 前端换皮 | |
| F5 | AI 主动邀请做羽毛呼吸 | 自动 | `diary.js:904-905`、`943-944`；`PromptBuilder.java:31-42` | 后端提示词 | 邀请措辞角色化 | 配置级 | |
| G1 | 日记本翻页、输入、草稿、翻页动画 | 点击 / 输入 | `diary.js:44-84`、`155-223`、`2102`、`3065` | 页面级，通用 | 无 | 无需动 | |
| G2 | 每日明信片开场 | 自动 | `diary.js:1277-1408`；`PromptBuilder.java:582`；`DiaryServiceImpl.java:306-341` | 后端 + 页面 | 不动，见第 2 节 | 无需动 | |
| G3 | 一小时替班 Badeline、「恢复 Madeline」按钮 | 自动 / 点击 | `diary.js:2544-2611`、`2648`、`2817`、`2905`、`3118` | 剧情暂驻 hack | 不动，见第 2 节 | 无需动 | |
| G4 | 雪花、BGM、首页按钮 | 自动 / 点击 | `diary.html:22`；`snow-effect.js`、`snow-bgm.js`；`diary.js:3290-3308` | 页面级，通用 | 无 | 无需动 | |
| G5 | 情绪背景 / 主题切换 | 自动 | `diary.js:2438` | 页面级 | 情绪键到背景主题的映射跟随角色词表 | 前端换皮 | |

---

## 2. 不动的清单

### 2.1 一小时替班 hack

位置：`diary.js:2544-2611`，配套短路在 `2648`、`2817`、`2905`、`3118`、`3117`。

- 它不是「角色配置」，而是一次性的剧情快照：`celeste-mirror.js` 的镜之房间把 `badelineMirrorStoryV1` 写成 `appeared`，日记页读到后只替班这一屏，把 stage 改成 `diaryShown`，刷新即回 Madeline；另有 1 小时 `SHIFT_TTL` 自然过期。
- 它直接改写 `pmCurName`、像素立绘、`PM_BADELINE_STANDIN` 旁路，并挂一个「恢复 Madeline」按钮。把它纳入角色切换会把剧情状态机和角色配置两套状态缠在一起：镜之房间、日记页、刷新恢复都会互相影响。
- 结论：保持原样。不把它当作 Badeline 的固定入口，也不在角色配置里给它留槽位。

### 2.2 每日明信片

位置：`diary.js:1277-1408`，页面开场与封面；后端提示词 `PromptBuilder.java:582`，数据 `DiaryServiceImpl.java:306-341`。

- 内容口径是「山 / 旅行者」写给用户，不是 Madeline 或 Badeline 的第一人称角色表达，代码里也没有 Badeline 专属明信片组件。
- 它按用户每日生成，署名与文案来自后端明信片逻辑，不读 active persona，也不参与聊天上下文。
- 结论：保持原样。它的定位是页面的日常仪式，不是角色通道；换角色时不应改它。

---

## 3. 硬耦合清单

### 3.1 客户端

| 硬耦合 | 在哪 | 为什么硬 |
|---|---|---|
| 头像表 | `diary.js:224-233`（`avatarMap`）、`302`（`chatAvatar`）；`diary.html:26,28,81,90` | 七个情绪键直接映射到 `celeste-portraits/madeline/*00.png`。Badeline 的立绘目录是 `celeste-portraits/badeline/`，且表情组数与键名都不同，不存在可直接替换的公共键集。 |
| 名字标签 | `diary.html:30`（`gameDialogName`）、`92`（`chat-title`）；`diary.js:2518`（`pmCurName`）、`2581-2586` | 名字不只在标签上，还参与状态判断：替班块、行为树短路、说话队列都以 `pmCurName` / `PM_BADELINE_STANDIN` 为准。没有单一名字源，换角色要同时改显示与判断。 |
| 历史 key | `diary.js:309`（`CHAT_LOG_KEY = 'madelineChatLog'`）、`789-816`（按 `__account` 追加后缀）；`api.js:89-96` | 角色名写进存储键，且账号隔离是在 key 后拼 `__account` 实现的，不在 `USER_SCOPED_KEYS` 的统一清理列表里。换角色若不换 key，会把 Madeline 的历史直接当成 Badeline 的上下文；换了 key 又需要迁移或兼容读取。 |
| 情绪集合 | `diary.js:224-233`、`851`；`madeline-mood.js`；后端 `PromptBuilder.java:17-28` | 前端头像表、背景主题、逐字语音与后端七情绪白名单是一个闭环。Badeline 侧是另一套 15 组表情（`shelf.js:1105-1126`）与独立语音映射，两套集合不通用，未识别情绪一律落到「默认」。 |
| 角色资产与台词 | `diary.js:3090-3115`、`2832-2849`、`3493-3526`、`3529-3547`、`2336-2346`、`3453-3492`；`feather-game.js:59-131` | 摸头、梦话、节日、道别、草莓、明信片落款、羽毛游戏台词全部按 Madeline 的口吻写死，且分散在多个闭包里，没有集中台词表。 |
| 面板与 agent 请求地址 | `diary.js:1010-1131` | `runAgentStream` 直接把 `/agent/madeline/stream` 写进前端，任务意图判定也按 Madeline 的能力写死（润色/评估关键词）。换角色必须同时改 URL 与意图门。 |

### 3.2 服务端

| 硬耦合 | 在哪 | 为什么硬 |
|---|---|---|
| agent 入口与参数 | `AgentController.java:12`（`@RequestMapping("agent")`）、`23-26`（`POST /agent/madeline/stream`）；`AgentParam.java` 只有 `message` | 角色写进路径与方法名，请求体没有 persona/character 字段。客户端也写死同一路径。换角色要么新增入口，要么改参数，不能只改配置。 |
| 系统提示 | `MadelineAgentEngine.java:55`（`PromptBuilder.madelineAgent()`）、`131`（`madelineAgentReply`）；`PromptBuilder.java:1257`、`1279`；`PromptBuilder.java:162`（`chatSystem`） | agent 链路固定拼 Madeline 人设；`chatSystem` 里还有 `if ("Madeline".equals(persona.getName()))` 两处分支（`167`、`182`），说明 Persona 只是部分可配，不是全量角色化。 |
| 情绪白名单 | `MadelineAgentEngine.java:32`、`217-218`；`PromptBuilder.java:17-28` | 后端把情绪收敛到七个标签，超出即「默认」。这与 Badeline 的 15 组表情、独立语音映射不一致；换角色若不换白名单，Badeline 的细腻情绪会被压平。 |
| 工具清单 | `MadelineAgentEngine.java:39`（`PolishTextTool`）、`77`（只认 `polishText`）、`96`（执行）、`21-22`（循环与事件注释） | 当前不是工具注册表，而是单工具分支：决策 JSON 里只有 `tool=polishText` 会被执行，其余直接进入终态回复。加任何角色能力都要改循环和判定，属于主干。 |
| 结果卡片 | `MadelineAgentEngine.java:181-187`（`card.put("tool","polishText")` 与 `result` 事件）；`diary.js:988-1008`（`renderPolishCard`） | 卡片结构绑定「原文/修改后」双栏与四维问题清单。Badeline 若要承担查日记、草莓、总结，需要新的卡片协议或干脆不用卡片，现有渲染器无法复用。 |
| 日记总结提示词 | `DiaryServiceImpl.java:1217-1264`，硬编码「你是 Madeline」在 `1223`、`1254` | 总结链路完全不读 Persona，也不落库；它只把一段话返回给页面。换角色必须改这段代码，配置切不动。 |
| 主动消息 / 陪写提示词 | `PromptBuilder.java:444`（`proactiveDecision(Persona…)`）、`478`（`diaryCompanion(Persona…)`）；`PersonaServiceImpl.java:21-40` | 这两处已经接收 Persona，是仓库里现成的唯一角色缝；但无角色时 `getActive` 回退 Madeline（`30-32`），所以「配置级」只覆盖到这两条链路，覆盖不了 agent 与总结。 |
| Badeline 对话链路 | `DiaryServiceImpl.java:1549-1590`；`PromptBuilder.java:896`（`badelineSystem`） | 纯 `streamChat`：请求带 `message + history + hearts`，没有人设以外的工具调用，也没有 agent 循环。它不能直接承接 Madeline 的工具能力。 |

### 3.3 两套 SSE 协议不兼容

**Madeline agent（`/agent/madeline/stream`）**

- 事件帧：`step` / `emotion` / `delta` / `result` / `done` / `error`，定义见 `MadelineAgentEngine.java:21-22`、`86`、`144`、`187`、`169`。
- `step` 是中间步骤播报，`result` 是工具卡片数据；`emotion` 故意推迟到首个 `delta` 一起发（`136-145`）。
- 客户端：`diary.js:1010-1131`，用 `agentStepRow`（`960-986`）、`renderPolishCard`（`988-1008`）专门消费这两类帧。

**Badeline 对话（`/diary/badeline-chat/stream`）**

- 事件帧：`emotion` / `delta` / `done` / `error`，见 `diaryApi.js:90-94`、`114-120`。
- 请求体是 `message + history + hearts`（`diaryApi.js:82-94`），`hearts` 是心光谱载荷；没有 `step`，没有 `result`。
- 客户端：`shelf.js:1372`，消费后驱动 Badeline 对话框与立绘，渲染器与 `addMadelineMessage` 完全不同。

**为什么硬**

- 差异不只是事件名，而是语义：`step` 对应「agent 中间决策」，`result` 对应「工具卡片」，`emotion` 的发送时机也不同（Madeline 延后到首字，Badeline 独立发）。
- 前端有两个互不复用的消费端：日记页的说话队列 + polish 卡片，书架页的 Badeline 对话框 + 立绘帧。
- 要共用一套面板，必须选定一种协议并给另一端写适配层；直接删掉任一端都会破坏现有页面。另有一条 `/proactive/stream` 只发 `bubble`（`diary.js:1545-1559`），是第三种形态，也不能混用。

---

## 4. Agent 真实能力说明

**结论：agent 目前只有「润色文字」一个工具，查日记、草莓数、日记总结都不是工具，是页面自己调接口。**

证据链：

1. 入口：`AgentController.java:23-26` 只暴露 `POST /agent/madeline/stream`，请求体 `AgentParam` 只有 `message`。
2. 循环：`MadelineAgentEngine.java:66-131`。每轮让模型输出决策 JSON，只有 `tool` 且 `tool == "polishText"` 时（`77`）才执行 `PolishTextTool`（`96`），把结果回注（`103-107`），然后进入终态回复。没有工具注册表，也没有其他工具分支。
3. 门控：`diary.js:955-957` 的 `isAgentTaskIntent` 只在「润色 / 帮我改 / 评估 / 斧正 / 帮我看看这」且长度 ≥ 30 时才走 agent；其余全部走普通 `/chat`（`1114-1122`）。
4. 查日记：`shelf.js:452` 的 `DiaryApi.listDays()` 与 `diary.js:3182` 的 `/diary/list` 都是页面直接调接口，不是 agent 工具。
5. 草莓数：`api.js:45-62` 的 `berryBalance` / `syncBerryBalance` 走 `GET /users/berry`（`UserController.java:21-27`），页面渲染；也没有进 agent 上下文或提示词。
6. 日记总结：`diary.js:2444` 直接 `POST /diary/summary`，后端 `DiaryServiceImpl.java:1217-1264` 生成一段话返回；不是工具，不落库，不回灌对话上下文。

因此，任何「agent 会自己查日记 / 自己数草莓 / 自己做总结」的理解都是错的。后续接角色时，这些能力仍然属于页面级或后端接口级，除非专门把它们注册成工具。

---

## 5. 三步走计划

### 第一步：前端换皮，不动主干

目标：让日记页的角色身份从「写死在 diary.js」变成「一份可替换的前端角色档案」，但服务端 agent 与总结仍按 Madeline 跑。

- 收拢：名字、头像表、聊天标题、历史 key 前缀、摸头/梦话/节日/道别/草莓/羽毛收尾台词、像素与立绘资源，统一放进一份角色档案（Madeline 为默认档案，Badeline 为第二份）。
- 历史：日志 key 改成 `角色 + 账号` 两段式；读取时保留对旧 `madelineChatLog:<account>` 的兼容读取，避免 Madeline 用户升级后丢历史。
- 明确不改：`/agent/madeline/stream`、`/diary/summary`、情绪白名单、工具清单。第一步做完后，页面的「脸和嘴」可以是 Badeline，但任务型对话与日记总结仍是 Madeline 的口径——这是刻意保留的已知边界。
- 回退方式：角色档案带默认值 `madeline`，一个常量控制当前档案；出问题把常量切回 `madeline` 即恢复原状。历史 key 采用「新 key 写入、旧 key 兼容读」，回退时旧数据仍可读，不需要数据迁移。

### 第二步：情绪收敛

目标：让两套情绪集合可以互操作，而不是互相压平。

- 定义一份共享情绪词表（建议先把 Madeline 的七类作为规范集），再给每个角色写适配器：Badeline 的 15 组表情映射到规范集，规范集再映射回 Badeline 的立绘帧与语音。
- 前端：`avatarMap`、背景主题、逐字语音都改为「先规范、再角色化」两级映射；未识别情绪仍回退「默认」，但不再直接落到 Madeline 头像。
- 后端：保留 `MOOD_WHITELIST` 作为出口白名单，但按角色选择白名单；`PromptBuilder` 的情绪工具说明跟随角色档案。
- 回退方式：适配器默认走恒等映射（规范集 = 现有七类），并保留原 `avatarMap` 与原始白名单分支；关闭适配器即回到第一步的行为，不改数据、不改接口。

### 第三步：agent 与总结提示词角色化

目标：让同一套 agent 引擎按角色参数跑，而不是再养一套决策逻辑；同时把日记总结从硬编码里拿出来。

- agent：给 `AgentParam` 增加角色标识（或新增 `/agent/{role}/stream`，保留旧路径兼容），`MadelineAgentEngine` 根据角色选择系统提示与情绪白名单；把「单工具分支」改成最小工具注册表，先只注册 `polishText`，后续查日记/草莓/总结再按需注册。
- 结果卡片：`result` 帧按工具类型区分，polish 卡片保持现状；新工具要么不复用卡片，要么新增卡片类型，避免把 Badeline 的能力硬塞进双栏润色卡。
- 总结：`DiaryServiceImpl` 的总结提示词改为读取 Persona（或请求带的角色参数），无角色时回退 Madeline；输出结构不变，仍然只返回、不落库。
- 回退方式：加一个服务端开关 `agentRole`，默认 `madeline`；关闭时走旧路径与旧提示词分支。总结同样保留硬编码分支作为兜底。回退只涉及开关与分支，不涉及数据库变更；旧 `/agent/madeline/stream` 保持可用。
