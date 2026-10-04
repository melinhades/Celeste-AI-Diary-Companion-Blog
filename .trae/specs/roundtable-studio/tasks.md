# AI 圆桌演播厅补完 - 实施计划

## Task 1: 会话事件总线 SessionBus（扇出 + 回放）

* **Status**: `completed`

* **Priority**: high

* **Depends On**: None

* **Description**:

  * 新增 `SessionBus`（隶属 RoundtableSession）：支持 owner 与多观察者订阅、按事件名广播、订阅者断连自动摘除、观察者计数。

  * 提供加入时快照（transcript 副本 + 最近 pulse + meta）供观察者回放；广播接口返回失败订阅者列表供引擎计数。

  * RoundtableSession 增加 `observerCount`、`speechCount`、`lastPulse` 字段。

* **Acceptance Criteria Addressed**: AC-4（并为 AC-2 提供基础）

* **Test Requirements**:

  * `rule` TR-1.1: 单测中向 3 个订阅者广播，强制其中 1 个抛 IOException 后，其余 2 个仍收到事件、计数为 2；证据：测试断言

  * `rule` TR-1.2: 快照与广播并发执行时不抛 ConcurrentModificationException，快照条数等于加入时刻 transcript 长度；证据：测试断言

## Task 2: 大厅列表与观察者 SSE 端点

* **Status**: `completed`

* **Priority**: high

* **Depends On**: Task 1

* **Description**:

  * `GET /roundtable/live`（登录拦截）：返回全部 RUNNING 会话摘要（id/topic/发起人昵称/startedAt/speechCount/observerCount）。

  * `GET /roundtable/observe/{id}`：登录用户订阅总线；先推 meta、lastPulse（若有）、再按 turn\_start/delta/turn\_end 节奏回放 transcript 快照，随后保持 SSE 订阅至 done；超时/断连摘除。

  * 观察者加入/离开更新 observerCount；会议不存在返回 404 事件语义（HTTP 状态）。

* **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3（服务端写权限维持 403 现状并补测）

* **Test Requirements**:

  * `rule` TR-2.1: live 接口测试：两个 RUNNING + 一个 FINISHED，返回仅含前者且字段齐全；证据：MockMvc/独立测试

  * `rule` TR-2.2: 观察者连接后收到的回放事件条数等于订阅时刻 transcript 条数，随后能收到 done；证据：集成测试

  * `rule` TR-2.3: 非发起人调用 interject/stop 返回 403；证据：控制器测试

## Task 3: TurnScheduler 自主调度（TDD）

* **Status**: `completed`

* **Priority**: high

* **Depends On**: None

* **Description**:

  * 新增 `TurnScheduler`：先写测试。基于 topic、transcript（滑动窗口）、可选 forcedSpeaker（人类点名）调用一次 AiClient（JSON 模式），返回 `{speakerId, action, publicNote}`。

  * 规则：forcedSpeaker 存在时跳过模型直接采用；模型输出非法/超范围/与上一发言人相同（非 forced 情形）时按"距上次发言最久且非上一发言人"兜底；保证长期每人都有机会（记录每人数计数）。

  * prompt 结构化输出契约（只允许五个 AI id 与枚举动作），publicNote 为面向观众的一句话。

* **Acceptance Criteria Addressed**: AC-5, AC-6, AC-8, AC-13

* **Test Requirements**:

  * `rule` TR-3.1: 正常 JSON 解析返回正确结构；证据：单测

  * `rule` TR-3.2: JSON 损坏 / speakerId 非法 / AiClient 返回 null 三种情况均走兜底且不与上一发言人重复；证据：单测

  * `rule` TR-3.3: forcedSpeaker（matchMention 结果）必定成为下一位且无需模型调用（验证 AiClient 零调用）；证据：单测

  * `rule` TR-3.4: 连续 20 次兜底选择中无连续同一人、五个 id 均出现；证据：单测

## Task 4: RosterBuilder 阵容/meta 组装（TDD）

* **Status**: `completed`

* **Priority**: medium

* **Depends On**: None

* **Description**:

  * 抽取 `RosterBuilder`：集中席位 meta 组装（id/name/title/color/human）与 owner meta payload；对应作业"嘉宾生成"考察点。

  * 先写测试：meta 包含全部 6 席（含 user）、字段完整、human 标记仅 user 一席。

* **Acceptance Criteria Addressed**: AC-13（阵容部分）

* **Test Requirements**:

  * `rule` TR-4.1: meta 列表 6 席、字段齐全、human 仅 1 席；证据：单测

## Task 5: ConsensusTracker 实时共识/分歧（TDD）

* **Status**: `completed`

* **Priority**: high

* **Depends On**: None

* **Description**:

  * 新增 `ConsensusTracker`：先写测试。维护 `{consensus:[{point, by:[names]}], disagreements:[{point, sides}]}`；`update(newSpeeches)` 携带上一版本增量调用 AiClient（JSON），解析合并为新版本；每 2 条发言触发一次（由引擎决定调用时机，类内只做内容与校验）。

  * AI 失败 / JSON 异常时规则兜底：从新发言中按"同意/赞同"与"但是/反对"关键词提取，保证返回非空演进版本。

* **Acceptance Criteria Addressed**: AC-9, AC-13

* **Test Requirements**:

  * `rule` TR-5.1: 正常 JSON 合并后版本号递增、条目可新增与消失；证据：单测

  * `rule` TR-5.2: AiClient null / JSON 损坏时走关键词兜底且不抛异常；证据：单测

  * `rule` TR-5.3: 两次连续 update 均返回非空结果；证据：单测

## Task 6: 引擎主循环重构（调度驱动 + pulse + 总线）

* **Status**: `completed`

* **Priority**: high

* **Depends On**: Task 1, Task 3, Task 4, Task 5

* **Description**:

  * `RoundtableEngine.run` 改为：meta（RosterBuilder）→ 主持开场（维持现状）→ 循环{ 排空插话（点名→forcedSpeaker）→ TurnScheduler 选人 → turn\_prepare（含 action/publicNote）→ 发言生成与伪流式 pushSpeech（推 SessionBus）→ 每 2 条发言调 ConsensusTracker 并广播 pulse → 第 12 条发言起每 6 条评审一次（沿用 judge/阈值/硬上限）} → 主持总结（维持现状）→ score → done。

  * speechCount、lastPulse 写回 session；所有事件改走总线；去除 round 事件（或保留内部不推送）。

  * 单条发言失败不毁整场（沿用 notice 跳过）。

* **Acceptance Criteria Addressed**: AC-5, AC-6, AC-9, AC-11

* **Test Requirements**:

  * `rule` TR-6.1: mock 全套组件时事件序列与频次符合 FR-9（pulse 每 2 条、评审节点正确）；证据：Task 10 E2E 复用断言

  * `rule` TR-6.2: stop 请求后当前发言结束即进入主持总结；证据：集成测试

  * `rule` TR-6.3: 无 round 事件被推送、turn\_prepare payload 含 publicNote；证据：E2E 断言

## Task 7: 前端演播厅布局骨架（视口/三档/聚光灯/独立滚动）

* **Status**: `completed`（2026-10-04。仅改 roundtable.html：stage 固定视口 flex 骨架；≥1600 三栏 / 768-1599 席位顶排+右栏 / ≤768 标签切换；transcript、共识、分歧列表独立滚动且 body 不滚；setup 大厅区容器预留；聚光灯发言席位高亮、其余压暗 opacity .42 + brightness(.72)。实测：1920/1366/390 三视口 bodyGap=0，各容器 scrollTop 可移动；MutationObserver 抓到 speakingCount/spotlightCount=7、dimmed=5；关过渡终值校验 otherOp=0.42、filter=brightness(0.72) saturate(0.8)；1366 截图 studio-spotlight-1366.png）

* **Priority**: high

* **Depends On**: Task 6

* **Description**:

  * stage 视图重构为固定视口 flex：`body` 不滚动；≥1600 三栏（席位侧栏/transcript/共识分歧）；768-1599 席位顶排 + transcript 主区 + 右栏共识；≤768 堆叠 + 标签切换（席位/现场/共识）。

  * transcript、共识、分歧、大厅列表容器独立滚动；当前发言席位聚光灯高亮、其余压暗。

  * setup 视图大厅区同样容器化滚动。

* **Acceptance Criteria Addressed**: AC-12, AC-16, AC-17

* **Test Requirements**:

  * `rule` TR-7.1: 1920/1366/390 三视口下 body.scrollHeight ≤ clientHeight+1，且 transcript/共识容器可独立滚动；证据：browser\_evaluate 数据 + 截图

  * `rubric` TR-7.2: 三档布局合理性；1-5；1=窄屏裁切混乱, 3=可用但拥挤, 5=密度舒适层级清晰；阈值 ≥4；证据：三视口截图评审

## Task 8: 前端讨论大厅 + 观察者模式

* **Status**: `completed`

* **Priority**: high

* **Depends On**: Task 2, Task 7

* **Description**:

  * setup 顶部新增大厅列表（10s 内自动刷新），卡片显示议题/发起人/开始时间/发言数；点击以观察者身份进入 stage。

  * 观察者 stage：显示"👁 观察中"标识、隐藏插话行与结束按钮；订阅 observe SSE，复用现有发言/pulse/score/done 渲染管线处理回放与实时事件。

  * `?mock=1` 脚本同步更新：补 publicNote/pulse 事件、去 round 横幅，并模拟一条大厅数据。

* **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3

* **Test Requirements**:

  * `rule` TR-8.1: mock 模式下大厅卡片可见、点击进入后先看到回放再看到后续发言，且无写控件；证据：浏览器实测

  * `rule` TR-8.2: 大厅卡片字段与 /live 契约一致；证据：DOM 断言

* **完成证据（2026-06-11）**：
  * 后端配套修补：WebMVCConfig 放行规则新增 `/roundtable/live`（登录态）；observe 改用 query token 手验（EventSource 带不了 Header）；observe 回放 meta 补 `speakers`（RosterBuilder.build）、快照事件带 `replay:true`；mvn compile 通过
  * DOM 断言（?mock=1）：#livePanel 显示，卡片渲染「议题 + 登山的西奥 · 7 分钟前开始 · 13 条发言 · 2 人在旁听 + 进去旁听」；10s setInterval 自动重渲
  * 点击卡片：stage 打开，`#observerBadge` 显示「👁 观察中 · 只读」，stopBtn/interjectRow 均 display:none，backLink=「‹ 返回大厅」；先同步回放 host+Madeline 两条（静音/定格）再实时，全程 9 气泡后出现结果卡
  * 观察者散场不写 roundtable_history_v1（observerSaved=false）；主人会议正常写历史
  * mock 脚本：去 round 横幅；prepare 带 publicNote 文案；每 2 条发言推一次 pulse（共识/分歧/焦点三态演进）；mockLiveData 一张演示卡

## Task 9: 前端状态小窗关注点 + transcript 头衔 + 内部事件清理

* **Status**: `completed`

* **Priority**: high

* **Depends On**: Task 7

* **Description**:

  * 席位卡增加"关注点"行：turn\_prepare 时显示 publicNote，idle 后保留最近内容；三态逻辑维持。

  * transcript 气泡 meta 行改为"姓名 · 头衔 · 时间"（user 行同样带头衔"议题主人"），host 行维持无 meta 现状。

  * 移除 round-banner、评审中 notice 等内部事件展示（notice 仅保留对观众有意义的内容）。

* **Acceptance Criteria Addressed**: AC-7, AC-8, AC-10

* **Test Requirements**:

  * `rule` TR-9.1: prepare 态席位卡出现 publicNote 文本且结束后保留；证据：DOM 断言

  * `rule` TR-9.2: transcript 全部非 host 行含头衔文案，且全文无"第 N 轮/举手/评审中"命中；证据：DOM 文本扫描

* **完成证据（2026-06-11）**：
  * 席位卡新增 `.s-focus` 关注点行（CSS line-clamp 2）；setSeatState(id,state,note) 在 prepare 时写入 seatFocus 并高亮，idle/speaking 后保留；实测散场后 5 个 AI 席仍显示各自最后关注点（如「抱臂冷笑，按捺不住…」），user 席「随时可插话」
  * 气泡 meta 改三段式：实测 `Madeline · 攀登者 · 11:03`；用户插话气泡 `你 · 议题主人 · 11:06`；host 气泡无 meta（hostNoMeta=true）
  * 内部事件清理：前端删除 round 事件监听与 .round-banner CSS/JS；后端 RoundtableEngine 删除 round 广播与两处内部 notice（跳过发言/评审中），turn_prepare 字段 `note`→`publicNote`；全文正则 `/第\s*\d+\s*轮|举手|评审中/` 扫描 banned=false（观察者+主人两场）

## Task 10: SSE 端到端集成测试（序列 + 并行隔离）

* **Status**: `completed`（2025-07-04，证据见下）

* **Priority**: high

* **Depends On**: Task 6

* **Description**:

  * 测试配置以 mock AiClient（按调用内容脚本化返回：调度 JSON/发言文本/pulse JSON/评审 JSON）驱动真实引擎与 SessionBus，收集事件。

  * 断言：事件序列（meta→host开场→多组 turn\_prepare/turn\_start/deltas/turn\_end→host总结→score→done）、pulse ≥2 次、无连续同一发言者（点名场景单独构造验证）、无 round 事件。

  * 并行两场：断言两会话事件按 sessionId 隔离、互无对方发言；观察者场景断言回放 + 实时 + done。

* **Acceptance Criteria Addressed**: AC-14, AC-2, AC-4, AC-11

* **Test Requirements**:

  * `rule` TR-10.1: 序列、频次、隔离断言全部通过；证据：mvn test 输出

  * `rule` TR-10.2: 主持开场/总结无 JSON 字符且总结先于 score；证据：断言

  * 完成证据：新增 `blog-api/src/test/java/com/mszlu/blog/service/ai/roundtable/RoundtableEngineE2eTest.java`，4 个用例：
    1. `eventSequence_isMetaHostSpeechesPulseHostCloseScoreDone_withNoRoundOrNotice`：脚本化 AiClient（第 1 次评审各维 55 不收尾、第 2 次 82 收尾），同步 Executor 跑完真实引擎，断言 meta→host 开场→11 条 AI 轮换发言（每 2 条 pulse）→host 总结→score→done、无 `round`/内部 notice、host 文本无 JSON 字符且总结先于 score；
    2. `humanMention_forcesMentionedPersonaToSpeakNext`：插话点名「暗面」后下一条必为 badeline；
    3. `twoParallelSessions_eventsAreIsolatedBySession`：两引擎并行（parallel-A/parallel-B），各自事件流不含对方 sessionId 与发言内容；
    4. `observer_getsReplayThenLiveEvents_thenScoreAndDone`：真实 `RoundtableController.observe()`（mock LoginService + 反射注入 sessions），攒满 4 条 transcript 后加入，断言 observer meta（6 阵容、observer:true）→replay 快照（仅 turn_start/delta/turn_end 且配对）→实时 prepare/publicNote→score→done。
    踩坑记录：Spring 5.3.7 的 `SseEventBuilder.build()` 文本段为整串 `event:done\ndata:`（TEXT_PLAIN 缓冲不按行分段），解析事件名必须在第一个 `\n` 截断。
    `mvn test` 全量结果：**Tests run: 26, Failures: 0, Errors: 0, Skipped: 0，BUILD SUCCESS**（RoundtableControllerTest 4、ConsensusTrackerTest 4、RosterBuilderTest 3、RoundtableEngineE2eTest 4、SessionBusTest 4、TurnSchedulerTest 7）。

## Task 11: 密钥扫描与浏览器三视口终验

* **Status**: `completed`（2025-07-04，规则项证据见下；TR-11.3/11.4 为 rubric，留用户评价）

* **Priority**: medium

* **Depends On**: Task 8, Task 9, Task 10

* **Description**:

  * 静态扫描 blog-ui 全部文件确认无大模型 Key 特征；live/observe 网络载荷检查。

  * 三视口（1920/1366/390）mock 模式走完整场：独立滚动数据、聚光灯、大厅与观察者、钢琴/鸟/语音在新布局下正常。

* **Acceptance Criteria Addressed**: AC-15, AC-12, AC-16, AC-17

* **Test Requirements**:

  * `rule` TR-11.1: 扫描无密钥命中、网络面板仅见站点 token；证据：扫描输出

  * `rule` TR-11.2: 三视口 body 无整页滚动、各容器独立滚动成立；证据：browser\_evaluate

  * `rubric` TR-11.3: 演播厅沉浸感；1-5；锚点同 AC-16；阈值 ≥4；证据：三视口截图/录屏 + 用户评价

  * `rubric` TR-11.4: 中文 UI 完整度；1-5；锚点同 AC-17；阈值 ≥4；证据：截图评审

* **完成证据（2025-07-04）**：

  * **TR-11.1 通过**：blog-ui 全目录正则扫描 `sk-[a-zA-Z0-9]{16,}|sk-ant-|AIza[0-9A-Za-z_-]{20,}|api[_-]?key\s*[:=]|secret\s*[:=]|access[_-]?key` → 0 命中；扩大扫 js/ts/json/env/css 中 openai/deepseek/dashscope/anthropic/sk- 关键字，仅 `js/wow_vox.js` 注释含音频文件名 wow_so_secret（非密钥）。token 命中均为站点自身登录态（`localStorage.getItem('token')`、`js/api.js` BASE_URL=`https://api.instapix.icu`、EventSource observe query token）。浏览器网络面板实测：mock 全场/观察者场请求仅 `127.0.0.1:8804` 本地静态资源（鸟帧/钢琴采样/页面脚本），无任何第三方 AI 域名；真实模式端点仅站点自身 api.instapix.icu（Authorization 头带站点登录 token）。

  * **TR-11.2 通过**（browser_evaluate 实测，?mock=1 静态服务器）：三视口舞台态 `scrollWidth=innerWidth`（1920/1366/390）、`scrollHeight-innerHeight=0`、程序 `scrollTo()` 后 scrollX 恒 0；1920 三栏 `.studio-side` right=1906 在界内；独立滚动：`#transcript` flex:1+overflow-y:auto 可滚可复位，窄屏席位/共识列表各自 overflow-y:auto，大厅 390 允许纵向文档流（设计预期）。mock 全场 9 句+结果卡三视口均跑完；聚光灯 MutationObserver 录制 57 次 class 变化、并发 speaking 恒 1、`.studio.spotlight` 切换 21 次；钢琴采样 20 条命中（仅绑人工输入键事件为设计行为），鸟 114 帧预载+状态机正常，全场零 window error。观察者流（1366 点直播卡）：观察者徽章 `.show`、停止键/插话行 display:none、出现「—— 回放结束，以下为实时发言 ——」分隔、9 句（2 回放+7 实时）+结果卡、`roundtable_history_v1` 前后严格相等（观察者不写历史）。

  * **本轮修复（页面级兜底，未动全站公共组件）**：390px 下全站公共 header/nav 越界（`index.html` 同样现象，属全站既有问题、超本任务范围）导致 roundtable 页可整页横滑 329px。修复：`roundtable.html` 新增 `html.rt-stage-lock{overflow:hidden}`，`enterStageMode/leaveStageMode` 同步切换（舞台态双向锁）；新增 `@media(max-width:768px){html,body{overflow-x:hidden}}`（大厅保留纵向滚动、裁掉横向）。复验：390 大厅 scrollWidth=375、scrollTo(300)=0；390 舞台 9 句+结果卡、scrollX=0、纵溢出 0；1366/1920 舞台同样 sw=视口、oxY=0、sx=0。

  * **TR-11.3 / TR-11.4**：rubric 需用户评价，不自评分。本轮截图工具 IDE 侧持续超时不可用，已以 DOM/几何/录制式 MutationObserver 数据留证（见上）；请用户回来后在三视口目检沉浸感与中文完整度（角色名英文 Madeline/Theo/Granny/Badeline/Oshiro + 中文头衔，无 PressStart2P）。

## Task 12: 演出装饰层与角色对话框接入

* **Status**: `completed`（2025-07-04，TR-12.1~12.4 证据见下）

* **Priority**: high

* **Depends On**: Task 7

* **Description**:

  * 将临时素材 `blog-ui/_cut-assets/`（mad\_idle / oshiro\_move / oshiro\_idle 三张 WebP 精灵表 + manifest.json）正式迁入 `blog-ui/roundtable-scenes/`；删除 `_cut-demo.html` 与 `_cut-assets/`。

  * `roundtable.html` stage 视图主舞台区加入 `<canvas>` 动画背景层：入场播放 mad\_idle 循环 → 主持开场触发 oshiro\_move 一次 → 切 oshiro\_idle 循环；Oshiro 移动段不绑定任何剧情台词，纯装饰。

  * 发言气泡替换为 textbox 对话框组件：背景 = `Atlases/Portraits/textbox/{role}.png`（按发言角色切换），左侧 = `Atlases/Portraits/{role}/` 动画头像帧（帧数自动探测、120ms 循环），右上 = 角色英文名，下方 = 打字机文本；头像动画在发言结束后停止。

  * 全局字体统一 `Renogare + CelesteZH`：移除 `roundtable.html` 与相关 CSS 中所有 `Press Start 2P` / `press2p` 引用；角色名用英文（Madeline/Theo/Granny/Badeline/Oshiro），头衔用中文。

* **Acceptance Criteria Addressed**: AC-18, FR-11

* **Test Requirements**:

  * `rule` TR-12.1: stage 加载后动画按 mad\_idle→oshiro\_move→oshiro\_idle 顺序播放，oshiro\_move 只播一次且期间无任何台词气泡；证据：浏览器实测 + canvas 帧序列断言

  * `rule` TR-12.2: 不同角色发言时对话框背景图与头像 src 切换为对应角色，人名显示英文；证据：DOM 断言（backgroundImage / img.src / 人名文本）

  * `rule` TR-12.3: 全站 `getComputedStyle` 字体栈不含 `Press`/`press2p`，含 `Renogare` 与 `CelesteZH`；证据：browser\_evaluate 扫描

  * `rule` TR-12.4: `_cut-demo.html` 与 `_cut-assets/` 已从项目删除，素材位于 `roundtable-scenes/`；证据：文件系统检查

* **完成证据（2025-07-04，?mock=1 浏览器实测，1366/390 iframe + 定时器垫片）**：

  * 交付物：新增 `blog-ui/js/roundtable-scenes.js`（canvas 精灵表播放器，`imageSmoothingEnabled=false`、rAF tick+acc 按 manifest.frameMs 切帧，`window.RoundtableScenes`：attach/start/hostOpeningDone/stop/state）；素材迁入 `blog-ui/roundtable-scenes/`（mad_idle/oshiro_move/oshiro_idle 三张 webp + manifest.json，src 同目录裸文件名）；`roundtable.html` 在 `.studio-main` 顶部加 `<canvas id="sceneCanvas" width=1152 height=720 class="scene-layer">` + `.scene-scrim` 半透明压暗层（z-index:0，内容 z-index:1，transcript 仍独立滚动）。

  * **TR-12.1 通过**：`state().seq` 全场（含主持收尾第二次 host turn_end）精确为 `mad_idle → oshiro_move ×1 → oshiro_idle`，movePlayed 一次性闸门生效（收尾 host 不再触发）；16ms 状态变化时间线：host 气泡在 mad_idle 帧 26 期间出现（sp=1）→ 主持开场结束才进入 oshiro_move（此时 sp 恒为 1，move 全程无任何气泡节点新增）→ cur 切 oshiro_idle 后下一条 madeline 气泡才出现（sp=2）；move 帧 0→29 走满才回调 onEnd 切 idle（`onEnd` 仅在 frameIdx≥30 触发，idle 起始即证明 30 帧播完）；canvas getImageData 实采到不透明像素（[60,35,65,255]），idle 帧号持续循环；返回大厅后 state.cur=null、playing=false、rAF 取消。

  * **TR-12.2 通过**（DOM 断言，7 条 AI 发言）：每条 `.sp.tb.tb-{role}` 的 computed backgroundImage = `Atlases/Portraits/textbox/{role}.png`（madeline/theo/granny/badeline/oshiro，五张底图实测均 1800×400 加载成功）；`.tb-portrait img.b-avatar-img` src = `Atlases/Portraits/{char}/{emo}00.png`，**Badeline 正确走 `Atlases/Portraits/ghost/`（规避了 demo 里误写 celeste-portraits/badeline 的坑）**；`.tb-name` 文本为 Madeline/Theo/Granny/Badeline/Oshiro 英文。打字机实测：发言中 `.tb-text` 文本长度 0→8→16→… 分块增长且 `.sp.tb.typing` 带光标，结束后 typing 移除；头像动画发言结束定格（间隔 500ms 两次快照 src 全等，7/7 naturalWidth=160 解码成功）。host 气泡保留小鸟样式、user 插话保留黄色气泡，均不套 textbox（无对应底图素材）。头像情绪帧继续复用 RoundtablePortraits（infer 情绪切组正常，定格 determined/wtf/nervous/nailedit 等），FeltPiano 绑定未动。

  * **TR-12.3 通过**：遍历 iframe 内全部元素 getComputedStyle().fontFamily，`/press/i` 命中 0；Renogare 与 CelesteZH 均存在（body = Renogare, CelesteZH, …；.tb-name = Renogare, CelesteZH, sans-serif）。roundtable.html 只引 css/common.css，本来就无 PressStart2P；其他页面（diary/shelf/shop 等）的 Press Start 2P 不属本任务范围，未改动。

  * **TR-12.4 通过**：`_cut-demo.html` 与 `_cut-assets/`（3 webp+manifest）已删除，空目录移除（Test-Path 均 False）；素材位于 `roundtable-scenes/`；Grep 全站无 `_cut-assets|_cut-demo` 残留引用。

  * 回归：390 视口整场 9 句+结果卡，scrollWidth=390、纵向溢出 0、scrollX=0，canvas 宽 372.7px 随容器 contain 缩放不撑破布局；1366 整场 9 句（7 textbox+2 host）正常；node vm.Script 语法检查通过；控制台仅见站点 suggestions API 不可达（测试环境网络）与垫片 0ms 高速换帧导致的头像/鸟图 ERR_ABORTED（最终定格帧全部 200 解码，非产品缺陷）。


