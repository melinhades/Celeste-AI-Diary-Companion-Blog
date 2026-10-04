# AI 圆桌演播厅补完 - 产品需求文档

## Overview
- **Summary**：在现有 `roundtable.html` + 后端圆桌引擎基础上，补完实习生作业《AI 圆桌演播厅》中尚未落地的能力：全站讨论大厅与观察者模式、AI 自主发言调度（取代机械轮流）、专家状态小窗的公开关注点、实时共识/分歧、演播厅式独立滚动响应式布局，并对核心逻辑严格 TDD + 端到端测试。
- **Purpose**：让现有 demo 达到作业验收标准，同时不破坏已经建立的 Celeste birdAI 氛围。
- **Target Users**：站点登录用户（发起讨论、观察他人讨论、实时插话）。

## Goals
- 用户进入圆桌页即可看到全站正在进行的讨论，并能以观察者身份实时观看。
- 专家依据 transcript 自主获得发言机会（抢答/补充/反驳/回应），不再机械轮流。
- 讨论进行中持续提炼共识与分歧，实时更新。
- 页面像一座演播厅：聚光灯随发言人移动，各区域独立滚动，三档视口均可用。
- 核心模块（调度、共识、阵容组装）以测试驱动，SSE 全链路有自动化 E2E。

## Non-Goals
- 不做动态嘉宾生成 / 专家人数输入：五位 Celeste 角色（玛德琳、西奥、奶奶、暗面琳、大崎）固定出席。
- 不改变主持人现有形态：保留鸟头像气泡的开场与自然语言总结，不新增主持人角色或台词体系。
- 不引入浏览器 Playwright 工具链（E2E 在后端用 mock AI + SSE 事件断言完成）。
- 不做讨论/发言持久化：会议状态仍纯内存，本机历史仍由 localStorage 承载。
- 不改动与圆桌无关的页面。
- 不给 Oshiro 入场动画编排任何剧情台词：它仅作为页面鲜活装饰（入场播一次移动、之后待机循环），不与讨论议题或发言内容挂钩。

## Background & Context
- 现状（已读代码确认）：
  - 后端：`RoundtableEngine`（按轮 × 固定 5 人顺序轮流发言）、`RoundtableSession`（纯内存、transcript、插话队列、stop）、`RoundtablePersonas`（人设 + prompt）、`RoundtableController`（`/roundtable/stream` SSE、interject、stop、suggestions）。
  - 前端：两视图（setup 创建 + stage 会议），席位卡已有 待机/准备发言/发言中 三态；transcript 行显示名字与时间、不显示 title；鸟行为树 `roundtable-bird.js` 与发言事件联动；`?mock=1` 可本地罐头演示。
  - 并行会话隔离后端已支持（ConcurrentHashMap，每会话独立状态），但每场会议只有 owner 一个 SSE 订阅者，无观察者扇出。
  - 测试：项目零测试；父 pom 已引入 `spring-boot-starter-test`（JUnit5 + Mockito 可用）。
- 用户决策（2026-10-03）：主持鸟维持现状；嘉宾固定五人不动态生成；讨论列表全站可见、可静音观察；测试做核心三件套 + mock AI 的 SSE E2E。
- 演出素材插曲（2026-10-03）：已从 Celeste 录屏裁出三段真机动画并通过浏览器实测——Madeline 抖动待机（0.9s 无缝循环）、Oshiro 走过来（1s 一次）、Oshiro 站定待机（0.87s 无缝循环）；视频上方游戏对话框已用无框静帧贴死消除。对话框方案复用 diary 页 `gameDialog` 思路：每位角色使用 `Atlases/Portraits/textbox/{role}.png` 专属文本框背景 + `Atlases/Portraits/{role}/` 动画头像帧（帧数自动探测）+ 英文名 + 打字机文本，字体统一 `Renogare + CelesteZH`（禁用 PressStart2P）。素材暂存 `blog-ui/_cut-assets/`，验证页 `blog-ui/_cut-demo.html`。

## Functional Requirements
- **FR-1 讨论大厅**：setup 视图顶部展示全站所有 RUNNING 讨论（议题、发起人昵称、开始时间、累计发言数、观察者数），列表自动刷新；点击卡片以观察者身份进入该会议。
- **FR-2 观察者模式**：观察者 SSE 先收到 meta、当前共识/分歧快照与已有 transcript 的回放，再持续收到实时发言、pulse、score、done；UI 为纯只读（无插话框、无结束按钮，明确标识"观察中"）。
- **FR-3 会话事件总线**：每场会议一个扇出总线，owner 与任意数量观察者订阅；任一订阅者断连只摘除自身，不影响会议与其他订阅者。
- **FR-4 自主发言调度**：每次发言结束后，调度器基于当前 transcript 做一次 JSON 调用，选出下一位发言 AI 与动作类型（同意/补充/反驳/追问/回应），随后只对被选中者做一次发言生成。
- **FR-5 调度约束**：不允许同一 AI 连续两次发言（回应人类点名的情形除外）；人类插话点名称呼时，被点角色必须为下一位发言者并直接回应；长讨论中五位 AI 均须获得发言机会。
- **FR-6 状态小窗**：席位卡保留三态并增加"关注点"一行；被选中者在准备态展示调度器给出的对外可见一句话（publicNote），待机者展示其最近一次关注点或"待机"。publicNote 是专门生成的对外话术，不得展示隐藏推理或 JSON。
- **FR-7 实时共识/分歧**：每新增 2 条发言触发一次增量提炼（输入上一版本 + 新增发言，输出更新后的共识列表与分歧列表），通过 `pulse` 事件实时推送；AI 不可用时使用规则兜底，面板永不为空白超过一次更新周期。
- **FR-8 Transcript 规范**：每条发言显示发言人姓名与头衔（Title），颜色沿用角色色块；调度、举手、评审过程等内部事件不出现在 transcript；去除"第 N 轮"横幅。
- **FR-9 收尾逻辑**：主持人开场与总结保持现状（自然语言气泡）；自动共识判定由"每轮评审"改为"每累计 6 条发言评审一次、首次评审不早于第 12 条发言"，阈值与硬上限行为沿用现有规则；用户可随时结束。
- **FR-10 安全**：`live` 与 `observe` 端点均需登录；观察者无任何写权限；大模型 API Key 只存在于后端配置/环境变量，前端任何资源不含密钥。
- **FR-11 演出装饰层**：会议进入 stage 时，在主舞台区域播放 Celeste 真机动画作为背景氛围层——先播 Madeline 待机循环，会议开场时 Oshiro 移动动画播一次后切全员待机循环（仅此装饰用途，不承载剧情）；所有发言气泡使用角色专属 textbox 对话框：`Atlases/Portraits/textbox/{role}.png` 为框背景、`Atlases/Portraits/{role}/` 为动画头像帧、显示角色英文名 + 打字机文本；字体全局 `Renogare + CelesteZH`，不使用 PressStart2P。

## Non-Functional Requirements
- **NFR-1 布局**：stage 视图占满视口剩余高度，`body` 不出现整页滚动；transcript、共识/分歧、大厅列表均在自身容器内独立滚动。
- **NFR-2 响应式三档**：超宽屏（≥1600px 三栏：席位侧栏 / transcript / 共识分歧）、普通桌面（席位顶排 + transcript + 右侧共识栏）、窄屏（≤768px，堆叠与标签切换，各容器仍独立滚动且高度不溢出视口）。
- **NFR-3 演播厅沉浸感**：当前发言席位聚光灯高亮、其余席位压暗；主持鸟动画与现有行为树在新布局下行为不变。
- **NFR-4 实时性**：除发言伪流式外，pulse 事件须在其对应发言结束后 2 秒内推送；大厅列表自动刷新间隔 ≤ 10 秒。
- **NFR-5 性能与成本**：调度 = 每发言周期 2 次模型调用（1 次调度 + 1 次发言）；共识提炼每 2 条发言 1 次；观察者回放不二次调用模型。
- **NFR-6 UI 语言**：界面操作文案为中文；五位角色人名为英文（Madeline / Theo / Granny / Badeline / Oshiro），头衔为中文。

## Constraints
- **Technical**：Java 8 / Spring Boot 2.5 / 纯内存会话 / SSE（非 WebSocket）；前端原生 HTML+JS，不引入框架；父 pom 已有 spring-boot-starter-test。
- **Business**：Celeste IP 仅粉丝向非商用展示；不破坏 birdAI 既有氛围。
- **Dependencies**：AiClient（含 JSON 模式）、aiExecutor、现有 PromptBuilder。

## Assumptions
- 大厅展示他人会议昵称不构成隐私问题（站点本身为公开博客评论体系）。
- 观察者可在会议 FINISHED 后看到完整回放与评分；订阅连接在 done 后正常关闭。
- 主持人气泡（role=host）在观察者眼中与 owner 所见完全一致。

## Acceptance Criteria

### AC-1: 大厅列出进行中的讨论
- **Type**: `rule`
- **Given**: 系统中存在两个不同用户的 RUNNING 会话
- **When**: 登录用户请求 `GET /roundtable/live`
- **Then**: 返回两个会话的 id、topic、发起人昵称、startedAt、发言数、观察者数，且不含已结束会话
- **Pass Condition**: 字段齐全且仅含 RUNNING
- **Evidence**: 接口测试 + 前端大厅区域 DOM 截图

### AC-2: 观察者可实时跟踪进行中会议
- **Type**: `rule`
- **Given**: 一场已产生若干发言的 RUNNING 会议
- **When**: 非发起人用户连接 `GET /roundtable/observe/{id}`
- **Then**: 先收到 meta 与已有 transcript 的回放，随后收到新发言、pulse、score、done 事件
- **Pass Condition**: 回放条数 = 订阅时 transcript 条数，且之后能收到至少一条实时发言与 done
- **Evidence**: SSE E2E 测试事件序列断言

### AC-3: 观察者全程只读
- **Type**: `rule`
- **Given**: 观察者进入会议
- **When**: 检查页面与写接口
- **Then**: 无插话输入框与结束按钮，interject/stop 对非发起人返回 403
- **Pass Condition**: UI 无写控件 + 接口 403
- **Evidence**: 浏览器快照 + 现有权限测试

### AC-4: 多订阅者扇出与容错
- **Type**: `rule`
- **Given**: owner 与 2 名观察者同时订阅同一会话
- **When**: 任一观察者断连
- **Then**: 会议继续，owner 与另一观察者仍收到后续全部事件，观察者计数正确减少
- **Pass Condition**: 断连后其余订阅者事件不断、计数 -1
- **Evidence**: SSE E2E 测试

### AC-5: 发言顺序非机械
- **Type**: `rule`
- **Given**: mock 调度器返回不同选择的一场会议
- **When**: 统计前 10 条 AI 发言的 speakerId 序列
- **Then**: 不存在连续同一 speaker（人类点名回应场景除外），且顺序不呈现固定 5 人周期
- **Pass Condition**: 无连续重复且顺序不等于枚举固定轮转
- **Evidence**: E2E 事件序列断言

### AC-6: 人类点名必被回应
- **Type**: `rule`
- **Given**: 用户插话内容包含角色称呼（如"奶奶你怎么看"）
- **When**: 下一条 AI 发言产生
- **Then**: speakerId 为被点角色，发言直接回应该插话
- **Pass Condition**: 下一条发言 speakerId 与 matchMention 结果一致
- **Evidence**: TurnScheduler 单测 + E2E 断言

### AC-7: 状态小窗展示三态与关注点
- **Type**: `rule`
- **Given**: 会议进行
- **When**: 某席位经历 prepare → speaking → idle
- **Then**: 席位卡依次显示"准备发言…/发言中…/待机"，prepare 时关注点行显示调度器 publicNote，idle 后保留最近关注点
- **Pass Condition**: 三态文案与关注点行内容均可见
- **Evidence**: 浏览器实测 + DOM 断言

### AC-8: 关注点不泄露隐藏推理
- **Type**: `rule`
- **Given**: 调度器 JSON 输出
- **When**: 前端渲染关注点
- **Then**: 页面只出现 publicNote 字段的自然语言；不出现 JSON、prompt、原始 action/reason 字段及任何 chain-of-thought 文本
- **Pass Condition**: transcript 与席位卡无 JSON 片段或内部字段
- **Evidence**: 控制台/网络面板检查 + 单测契约断言

### AC-9: 共识与分歧在讨论中实时更新
- **Type**: `rule`
- **Given**: mock AI 的会议跑到结束
- **When**: done 事件到达时
- **Then**: 此前已收到 ≥2 次 pulse 事件，且共识/分歧区域在每次 pulse 后内容变化
- **Pass Condition**: pulse 次数 ≥2 且区域非空、有更新
- **Evidence**: E2E pulse 计数 + 浏览器 DOM 变化记录

### AC-10: Transcript 显示头衔且无内部事件
- **Type**: `rule`
- **Given**: 会议结束
- **When**: 检查 transcript 全部行
- **Then**: 每行可识别发言人姓名与头衔，颜色与角色一致；不存在"举手/调度/评审中/第 N 轮"等内部事件文本
- **Pass Condition**: 头衔可见且禁用词零命中
- **Evidence**: 浏览器 DOM 断言

### AC-11: 主持鸟开场与总结维持现状
- **Type**: `rule`
- **Given**: 一场完整会议
- **When**: 检查首尾两条 role=host 发言
- **Then**: 开场与总结均为自然语言气泡（无 JSON），总结在 score 之前
- **Pass Condition**: 首尾 host 发言存在、无 JSON 字符
- **Evidence**: E2E 事件序列

### AC-12: 布局独立滚动与三档响应
- **Type**: `rule`
- **Given**: 1920 / 1366 / 390 三种视口宽度
- **When**: 会议产生超长 transcript
- **Then**: body 无整页滚动条；transcript、共识/分歧、大厅列表各自容器内滚动且不超出视口；窄屏无内容被裁切
- **Pass Condition**: body.scrollHeight ≤ body.clientHeight（容差 1px）且各容器可滚动
- **Evidence**: 三视口浏览器实测数据与截图

### AC-13: 核心三件套测试先行且通过
- **Type**: `rule`
- **Given**: TurnScheduler、ConsensusTracker、RosterBuilder 三个类
- **When**: 执行 `mvn test`
- **Then**: 其测试类先于/伴随实现存在，全部通过，覆盖正常、JSON 异常、AI 失败兜底、规则约束场景
- **Pass Condition**: 目标测试类 ≥3 且全绿
- **Evidence**: mvn test 输出与测试文件提交

### AC-14: SSE 端到端与并行隔离
- **Type**: `rule`
- **Given**: mock AiClient（脚本化调度/发言/pulse）
- **When**: 同时启动两场会议并订阅
- **Then**: 每场事件序列为 meta → host开场 → (turn_prepare → turn_start → deltas → turn_end [→ pulse])×N → host总结 → score → done；两场的 transcript/pulse 互不串扰
- **Pass Condition**: 序列断言通过且两场事件按 sessionId 隔离
- **Evidence**: 集成测试报告

### AC-15: 密钥不暴露浏览器端
- **Type**: `rule`
- **Given**: 全部前端资源
- **When**: 检查网络请求与静态文件
- **Then**: 无任何大模型 Key 出现在浏览器端；live/observe 请求只带站点自有 token
- **Pass Condition**: 全量静态文件扫描无密钥特征
- **Evidence**: 扫描脚本输出

### AC-16: 演播厅沉浸感
- **Type**: `rubric`
- **Dimension**: 观看时"正在观看一场演播厅讨论"的临场感（聚光灯、席位明暗、鸟的串场、信息分区）
- **Scale**: 1-5
- **Anchors**: 1 = 与普通聊天页无差别；3 = 有灯光与分区但注意力引导弱；5 = 视线自然跟随聚光灯与鸟，信息区不抢戏且实时感强
- **Pass Threshold**: >= 4
- **Evidence**: 三视口录屏/截图 + 用户主观评价

### AC-17: 中文 UI 与响应式合理性
- **Type**: `rubric`
- **Dimension**: 文案中文完整性与三档布局的信息分配合理性
- **Scale**: 1-5
- **Anchors**: 1 = 存在英文残留或窄屏混乱；3 = 基本可用但拥挤/留白失衡；5 = 三档均有舒适密度与清晰层级
- **Pass Threshold**: >= 4
- **Evidence**: 三视口截图评审

### AC-18: 演出装饰层与角色对话框
- **Type**: `rule`
- **Given**: 用户进入 stage 视图
- **When**: 检查舞台背景动画与发言气泡
- **Then**: 舞台区播放 Celeste 真机动画（Madeline 待机循环 → Oshiro 移动一次 → 全员待机循环，Oshiro 移动无剧情台词）；每条发言气泡使用发言角色的专属 textbox 框背景 + 该角色动画头像帧 + 英文名 + 打字机文本；全站字体不含 PressStart2P
- **Pass Condition**: 动画三段按序播放且循环正确；对话框背景与头像随发言角色切换；`getComputedStyle` 字体栈含 Renogare/CelesteZH 且不含 PressStart2P
- **Evidence**: 浏览器截图 + DOM/字体断言

## Open Questions
- 无（四个关键岔路已由用户 2026-10-03 决策关闭）。
