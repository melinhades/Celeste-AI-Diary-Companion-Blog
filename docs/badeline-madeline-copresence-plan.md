# Madeline 与 Badeline 同屏设计草案

> 状态：设计草案，只定规则，不写实现。
> 阅读约定：标【事实】的内容可在标注的 `文件:行号` 处核对；标【建议】的内容是本草案提出的规则，当前代码并不这样执行，需要拍板后才落地。
> 范围前提：本草案默认首发场景是日记页（`blog-ui/diary.html`）。理由见 §1；如果目标场景不是日记页，状态表和话筒表仍然可用，但“读谁的位置”要换成对应页面的角色状态。

---

## 0. 结论

【建议】同屏按“她来待一会儿”的在场窗口实现，不做永久双人；行为只保留两个长期态（跟随 / 自主）和两个短态（休息 / 互动）；**默认 Madeline 拥有话筒，Badeline 只有在用户主动找她（点她、给她发消息）或她的面板开着时才拿话筒**；全局同一时刻最多 1 个文本框、最多 1 个聊天面板、最多 1 个“说话人”；Badeline 永不推动 Madeline，只有 Madeline 的位置是权威。

三个必须写死的红线：

1. 替班期间（`PM_BADELINE_STANDIN === true`）同屏整体禁用，绝不出现两个身子（依据见 §2.5）。
2. 同一时刻只允许一个角色拥有对话表面；两个文本框在 CSS 上是**同位置同尺寸**，同时显示必然互相遮挡（依据见 §4.1）。
3. 金羽毛、替班 hack、每日明信片的现有判断不修改、不接管（依据见 §6.3）。

---

## 1. 首发场景与范围

### 1.1 为什么选日记页

【事实】日记页同时具备三件套：Madeline 像素小人与其行为树、Badeline 面板与其对话框、以及“替班”状态判断。三者集中在同一页面：

| 能力 | 位置 | 说明 |
|---|---|---|
| Madeline 像素小人 | `blog-ui/diary.html:27`；`blog-ui/js/diary.js:2558` | `#pixelMadeline` |
| Madeline 行为树 | `blog-ui/js/diary.js:2811-2824` 接入 `madeline-core.js` | 模式表、优先级、最小驻留都在共享内核 |
| Badeline 面板 | `blog-ui/js/badeline-panel.js:102-553`；日记页挂载 `diary.js:3642-3678` | 模块与页面解耦，日记页只传 options |
| Badeline 对话框 | `blog-ui/css/badeline-panel.css:68-91` | 由面板模块注入 `#badelineDialog` |
| 替班状态 | `blog-ui/js/diary.js:2586-2655` | `PM_BADELINE_STANDIN` / `window.isBadelineStandIn()` |

【事实】书架页的 Badeline 是镜之房间里的独立游荡实现（`blog-ui/js/shelf.js:1237-1563`），Madeline 在书架页只出现在梦境场景（睡眠状态），没有“走动让 Badeline 跟随”的输入源。因此“跟着 Madeline 做”这个需求只在日记页成立。

【建议】本轮只改日记页。书架镜之房间、写作页、梦境场景保持现状；共享模块（`badeline-panel.js`、`emotion-map.js`）只增加可选参数，不改变默认行为。

### 1.2 同屏的定义

【建议】同屏 = 两个独立像素精灵同时可见，且各自拥有独立的身体状态；但**对话表面不独立**，由话筒仲裁决定当前谁说话。不要把“同屏”理解成“两个人都能同时说话”。

---

## 2. 状态划分

### 2.1 三层状态，不要混成一层

【建议】把状态拆成三层，任何一层都不能替代另一层：

| 层 | 状态 | 作用 | 谁决定 |
|---|---|---|---|
| A 在场层 | `ABSENT` / `PRESENT` / `LEAVING` | 她在不在屏幕上 | 场景阶段 + 在场窗口 |
| B 行为层 | `FOLLOW` / `AUTONOMOUS` / `REST` / `INTERACT` | 她的身体干什么 | 事件 + 距离 + 时间 |
| C 说话层 | `SILENT` / `SPEAKING` / `QUEUED` | 她能不能开口 | 全局话筒仲裁 |

【建议】情绪不是状态，是行为层的输入参数；情绪不能直接抢话筒。这条单独写死，避免“她一生气就必抢麦”。

### 2.2 行为状态表

【建议】行为状态与数值如下（“最小驻留”只约束**主动**切换；被动原因可以越过）：

| ID | 状态 | 语义 | 进入条件（全部满足） | 退出条件（任一） | 最小驻留 | 移动 |
|---|---|---|---|---|---|---|
| B0 | `ABSENT` | 不在场 | 同屏开关关闭；或替班为真；或明信片 / 金羽毛覆盖层打开；或页面隐藏 | 同屏开关打开且替班为假，且明信片已关闭，且页面可见 | — | 无 |
| B1 | `FOLLOW` | 跟随 Madeline | Madeline 在最近 1.5s 内位移 ≥ 30px，或当前动作属于可移动模式；且两人中心距离 ≥ 72px；且不在强制自主窗口 | 中心距离 ≤ 40px 且持续 1s；或 Madeline 坐/睡 ≥ 2.5s；或跟丢（§3.4）；或连续跟随 ≥ 90s 进入自主 | 3000ms | 沿 Madeline 历史路径跟随 |
| B2 | `AUTONOMOUS` | 自主活动 | 连续跟随 ≥ 90s（定时）；或跟丢后降级；或用户点她后进入“自己待一会儿” | 自主计时 15–30s 到期；或 Madeline 可移动且距离 ≤ 180px；或距离 > 420px 持续 3s | 8000ms | 在 Madeline 周围 260px 内选点游荡 |
| B3 | `REST` | 在她旁边歇着 | Madeline 处于 `sit` 或 `sleep` 持续 ≥ 2500ms | Madeline 醒来/起身且移动 ≥ 30px；或打断事件 | 3000ms | 走到她侧边 80px 处停住 |
| B4 | `INTERACT` | 短互动 | 对视 / 让路 / 先走再回头 的触发条件命中（§5） | 互动演出结束 | 由互动本身决定 | 由互动决定 |
| B5 | `LEAVING` | 离场 | 在场窗口到期；或替班变为真；或页面卸载 | 淡出 400ms 完成 | — | 原地淡出 |

【事实】Madeline 的可移动模式来自共享内核（`blog-ui/js/madeline-core.js:39-51`）：`walk`、`peek`、`celebrate` 的 `movable` 为 `true`；`idle`、`bounce`、`lookaround`、`sit`、`sleep`、`wake` 为 `false`。日记页额外补了 `fall`（`diary.js:2827`），`movable` 为 `false`。

【建议】“她跟着做”不等于“她复制 Madeline 的每一个动作”。`FOLLOW` 只保证**位置跟随 + 低频姿态模仿**（§5.4）；动作模仿的冷却沿用行为内核的 `REACTIVE_COOLDOWN = 2500ms`（`madeline-core.js:58-59`），不要每帧换图。

### 2.3 切换条件到底由谁决定

【建议】四种驱动源的权重和职责如下，推荐“事件为主、距离为硬边界、时间为兜底节奏、场景阶段为总闸门”：

| 驱动源 | 建议权重 | 负责什么 | 不负责什么 | 理由 |
|---|---|---|---|---|
| 场景阶段 | 总闸门（0/1） | 页面是否就绪、替班是否关闭、明信片/金羽毛覆盖层是否关闭、标签页是否可见 | 具体行为选择 | 这是唯一能防止“两个身子”和“覆盖层上有人说话”的层 |
| 事件 | 约 70% | 首次保存成功、Madeline 坐/睡、用户点她、情绪变化、互动命中 | 长时间节奏 | 事件驱动才有叙事因果关系；纯计时会显得机械 |
| 距离 | 约 20% | 跟丢、追上、贴太近、分开 | 选择自主动作 | 距离是硬边界，防止卡死和叠身 |
| 时间 | 约 10% | 连续跟随 90s 后强制自主 15–30s、在场窗口 3–10min、冷却 | 实时反应 | 只作为节奏兜底，避免她永远粘着或永远不动 |

【建议】不要用“固定时间表”决定跟随/自主（例如每 10 秒切换一次），那会被用户一眼看穿。用“连续跟随时长”作为触发条件、用“距离”作为打断条件，二者组合。

### 2.4 行为切换的优先级与防抖

【建议】行为层内部也做优先级仲裁，数值如下（借用 Madeline 内核的“最小驻留 + 硬差距”思路，但独立维护，避免改动现有内核）：

| 行为 | 优先级 | 可打断谁 | 说明 |
|---|---|---|---|
| `LEAVING` | 200 | 全部 | 最高；替班/离场必须无条件执行 |
| `INTERACT` | 110 | `FOLLOW` / `REST` / `AUTONOMOUS` | 与 `FOLLOW` 差 50，超过硬差距 |
| `REST` | 65 | `FOLLOW` / `AUTONOMOUS` | 她坐/睡时，陪在旁边要能压过“继续跟随” |
| `FOLLOW` | 60 | `AUTONOMOUS` | 跟随优先于自主；不打断 `REST` |
| `AUTONOMOUS` | 40 | 只打断自己 | 最低 |

【建议】切换规则：

1. 任何状态进入后 800ms 内不被同级或更低级状态顶掉（硬防抖）。
2. 优先级差 ≥ 40 时才允许越过最小驻留直接打断。
3. 同优先级不打断，先入队，等当前状态自然结束。
4. `B1 FOLLOW` 连续 ≥ 90s 必须给一次 `B2 AUTONOMOUS`，时长 15–30s；这是“有时按自己意图活动”的唯一强保证。
5. 从 `B2` 回到 `B1` 的距离阈值是 180px，从 `B1` 掉到 `B2` 的距离阈值是 320px，做迟滞，避免在 200px 附近反复横跳。

【事实】Madeline 内核的对应常数是 `MIN_DWELL = 800`、`HARD_GAP = 40`、`REACTIVE_COOLDOWN = 2500`（`blog-ui/js/madeline-core.js:56-59`），仲裁逻辑见 `canInterrupt`（`113-127`）与 `requestMode`（`130-136`）。【建议】Badeline 行为层复用这三个数值口径，但不要调用 Madeline 内核的状态机，避免把她的模式表污染成双人共用。

### 2.5 与替班的互斥

【事实】替班状态由 `badelineMirrorStoryV1` 驱动，`stage === 'appeared'` 时把 `pm` 的 `src` 换成 `celeste-player/badeline/lookingUp_f.gif`、尺寸由 CSS 放大到 128px、并添加“恢复 Madeline”按钮；同时写入 `diaryShown`，刷新即恢复（`blog-ui/js/diary.js:2586-2653`）。替班期间 `pmLoop` 直接跳过 Madeline 行为树（`2947-2953`），单击/双击也全部归她（`3160-3190`）。

【建议】同屏与替班是互斥的两种呈现：

- `PM_BADELINE_STANDIN === true` → 同屏控制器直接 `ABSENT`，不注入第二个精灵、不接管任何点击。
- `PM_BADELINE_STANDIN === false` → 同屏可以出现，但**不得修改** `PM_BADELINE_STANDIN`，也不得改写 `badelineMirrorStoryV1`。
- `window.isBadelineStandIn()` 保持只读语义（`diary.js:2655`），金羽毛拦截继续只认它（`feather-game.js:788-799`）。

【建议】如果以后要“同屏取代替班”，那是另一个变更，必须单独评审替班的写入与清理，不要在本草案里顺手改。

---

## 3. 移动如何相互影响

### 3.1 跟随时读什么

【建议】只读 Madeline 的行为状态，不读她的像素坐标、不做 DOM 矩形轮询：

| 读取项 | 位置 | 用途 |
|---|---|---|
| `pmState.x / y` | `blog-ui/js/diary.js:2571-2584` | 当前位置与路径采样 |
| `pmState.dir` | 同上 | 朝向参考 |
| `pmState.mode` | 同上 | 判断走/坐/睡/庆祝 |
| `pmState.action` | `madeline-core.js:83-85`（`enterMode` 写入具体动作名） | 区分 `fun`/`look` 这类别名，做模仿映射 |
| `pmState.enteredAt` | `madeline-core.js:83` | 判断动作已持续多久，避免瞬间模仿 |
| `PM_MODES[mode].movable` | `madeline-core.js:39-51`；`diary.js:2827` | 她能不能跟 |
| `chatOpen` | `diary.js:2961` | Madeline 聊天时冻结行为树，Badeline 也必须停 |
| `companionState.isTyping` | `diary.js:2884` | Madeline 跑到书页旁 `peek`，Badeline 应改去 `REST` 而不是继续跟随 |
| 地面与禁区 | `diary.js:2656-2677`、`2714-2729` | 落地、避让 UI |

【事实】Madeline 的位置主要由 `pmLoop` 更新，走路速度固定 120px/s（`diary.js:2963`），边界钳制为 `x ∈ [4, innerWidth - bw - 4]`、`y ∈ [60, groundY]`（`2994-2995`）；另有替班恢复（`2631`）与 resize（`3031`）会直接改 `y`。她不会为另一个精灵让路：`blockedAt` 只检查布局缓存里的 UI 禁区（`2714-2729`），没有角色间碰撞。

【建议】Badeline 也**不**参与 Madeline 的 `blockedAt` 判定；两个角色不是刚体。Badeline 的避让只针对 UI 禁用区，复用同一套布局缓存思路，但拥有自己的 rect 列表与边距，不修改 `layoutCache`。

### 3.2 更新频率

【建议】明确分层，避免每帧读 DOM 或每帧换目标：

| 回路 | 频率 | 做什么 | 依据 |
|---|---|---|---|
| 渲染 | `requestAnimationFrame`，`dt` 上限 0.05s | 位移积分、贴地、朝向、层级 | 与现有两个主循环一致：`diary.js:2945`、`shelf.js:1378` |
| 路径采样 | 100ms | 记录 Madeline 位置到环形缓冲，保留 30 个样本（3s） | 新增 |
| 跟随目标重算 | 250ms | 从路径缓冲取“500ms 前”的点，决定目标 | 新增 |
| 跟丢检测 | 500ms | 判断距离是否连续不缩小 | 新增 |
| 布局刷新 | 300ms + resize/scroll | 禁区矩形、精灵尺寸、地面线 | 复用现有节奏：`diary.js:2671-2673` |
| 行为切换 | 最小 800ms | 防抖 | 对齐 `madeline-core.js:56` |

### 3.3 跟随算法（建议数值）

【建议】不要直接把 Badeline 的目标设成 Madeline 的当前坐标，否则她会永远贴脸、看起来像拖影。用“路径延迟 + 距离带”：

1. 记录 Madeline 每 100ms 的位置，形成路径；取 500ms 前的样本作为基准点。
2. 再沿路径向后补 40px，作为跟随点；总落后量约 100px（按 120px/s 估算，500ms 约 60px，加 40px 余量）。
3. 速度分三档：
   - 距离 ≤ 120px：105px/s（略慢，避免贴脸）；
   - 距离 120–260px：120px/s（与她同速）；
   - 距离 > 260px：150px/s（追赶，最多 1.25 倍）。
4. 到达死区 24px 内不移动，避免抖动；6px 内视为到位。
5. 朝向：速度 > 20px/s 时朝移动方向；静止时朝 Madeline。
6. 垂直方向做低通（每帧 15% 逼近），让她的上下移动有漂浮感；`y` 不上穿 60，不下穿地面线。

【事实】Badeline 现有可用的 GIF 共 6 组：书架页在用的 5 组是 `spin_f.gif`（roam）、`lookingUp_f.gif`、`sleep_f.gif`、`roll_f.gif`、`rollGetUp_f.gif`（`blog-ui/js/shelf.js:1244-1252`），目录里另有未被书架使用的 `pretendDead.gif`（目录核对）；源图都是 32×32。她没有“走路 GIF”。

【建议】移动表现的两种选择，按步骤落地：

- P1 先用 `spin_f.gif` 当移动帧（与书架页一致的“旋转游荡”），零新素材、零新帧播放器；
- P2 再启用 `blog-ui/atlases/Gameplay/characters/player_badeline/` 下的 `walk*.png` / `run*.png` / `idle*.png` / `sitDown*.png` / `sleep*.png` / `lookUp*.png` 做 PNG 帧播放，动作更像“跟着走”。
- 若做 PNG 帧播放，注意 `pmSetSrc` 的帧数组能力只服务于 Madeline 的 `#pixelMadeline`（`diary.js:2691-2709`），Badeline 需要自己的帧播放器，不能复用那个函数去改 Madeline 的 `src`。

### 3.4 跟丢了怎么办

【建议】按四级降级，禁止瞬间瞬移到用户眼前（除最后一级）：

| 级别 | 触发 | 处理 | 时长 |
|---|---|---|---|
| L1 追赶 | 中心距离 > 320px 持续 1000ms | 速度切 150px/s，目标改为“Madeline 身后 100px 的最近可走点” | 最多 1500ms |
| L2 自主 | L1 结束后距离仍不缩小，或连续 1000ms 无有效位移 | 切 `AUTONOMOUS`，只在她周围 260px 内选点 | 10s |
| L3 重新接上 | 自主期间距离 ≤ 180px，且 Madeline 可移动 | 切回 `FOLLOW` | — |
| L4 闪现 | 距离 > 400px，或她卡在禁区外 2000ms | 淡出 250ms → 在她侧边 80px 出现 → 淡入 250ms | 一次性 |

【建议】L4 的三个禁止条件：正在说话（任一角色 `SPEAKING`）、任一面板打开、用户 2 秒内点过她。满足任一条件就继续等，不瞬移。

【事实】Madeline 的 `pmDetour`（`diary.js:2762-2774`）只处理书页障碍，不处理角色；所以 Badeline 的“绕行”必须自己实现，不能借用 `pmDetour`。

### 3.5 会不会互相推挤或叠在一起

【建议】不会，规则如下：

1. **Madeline 权威**：Badeline 永远不写 `pmState`，不推动、不阻挡、不改变 Madeline 的目标点。
2. **软分离只作用于 Badeline**：两人中心距离 < 60px 时，以 28px/s 沿径向把 Badeline 推开，直到 ≥ 72px；如果她在 Madeline 正上方，优先向侧后方让，避免“踩头”。
3. **目标点避让**：跟随点若与 Madeline 当前点重合，向侧向偏移 40px。
4. **层级按脚底 Y 排序**：Madeline 固定 `z-index: 800`（`diary.css:610`）；Badeline 用 `799` 或 `801`——`by >= my` 时 801（在前），否则 799（在后）。不要修改 Madeline 的 z-index，也不要让任何一方超过 `#gameDialog` 的 950（`diary.css:645`）。
5. **点击热区不重叠**：两者中心距离硬下限 60px，保证单击判定不会同时命中两个精灵。

【事实】Madeline 的 CSS 尺寸是 56×56（`diary.css:608-609`），Badeline 替班时是 128×128（`diary.css:617-620`）。【建议】同屏时 Badeline 用 64×64（32px 源图 2 倍整数放大），保持像素边缘清晰，也不会比 Madeline 高出一截。不要把她的 `src` 放进 `#pixelMadeline`，否则会命中替班的 128px 选择器。

### 3.6 与现有行为树的边界

| 项 | 处理 | 理由 |
|---|---|---|
| Madeline 的 `PM_MODES` / `pmThink` / `pmLoop` | 【建议】只读，不改 | 现有走/坐/睡/庆祝/摔的逻辑已经稳定，不能因为同屏改优先级 |
| Madeline 的 `chatOpen` 冻结 | 【建议】沿用 | 她开聊天时本来就不动（`diary.js:2961`），Badeline 也必须停，否则画面里只有一个人在动，很怪 |
| Badeline 的 `spin/lookUp/sleep/roll` | 【建议】复用素材与切换思路，不复用书架页的 DOM 与 `st` 状态 | 书架页的 `st` 绑定 `#badelineImg`（`shelf.js:1271-1275`），日记页需要独立状态对象 |
| 书架的 `pickTarget → enterMode → think` 三段式 | 【建议】当模板抄结构，不当依赖引用 | 书架实现与镜之房间的坐标、边界、`inDialog` 强绑定（`shelf.js:1284-1394`） |

---

## 4. 话筒规则（最危险的一块）

### 4.1 现状盘点：为什么危险

【事实】目前两套说话系统是**完全独立**的，没有任何跨角色仲裁：

| 机制 | Madeline | Badeline | 冲突后果 |
|---|---|---|---|
| 消息队列 | `msgQueue` 串行（`diary.js:444-448`） | `queue` 串行（`badeline-panel.js:125`、`279-281`） | 两条队列可同时推进 |
| 文本框 | `#gameDialog`，`z-index: 950`（`diary.css:638-656`） | `#badelineDialog`，`z-index: 1600`（`badeline-panel.css:68-86`） | 同 `left: 50%`、同 `bottom: 26px`、同 `min(94vw, 900px)`；同时显示 = 她的框完整盖住 Madeline 的框 |
| 自动收起 | 6000ms（`diary.js:435-437`） | 6000ms（`badeline-panel.js:327-330`） | 两个计时器独立，先收谁不可控 |
| 点击关闭 | 独立 `gameDialogToken`（`diary.js:401-403`、`439-443`） | 独立 `dialogToken`（`badeline-panel.js:124`、`251-258`） | 点一下只关最上层的那个；下面那个还在“隐形说话” |
| 聊天面板 | `#madeline-wrapper` / `#madeline-chat-dialog`，`z-index: 1000`（`diary.css:211-216`；`chat-widget.css:2-19`） | `#blChat`，`z-index: 1600`、`bottom: 84px`（`badeline-panel.css:11-29`） | 两个面板可同时打开，且 Badeline 面板压住 Madeline 面板 |
| 打断/继续 | 同一组按钮，`preRunAbort` 单槽（`diary.js:1615-1648`） | 同一组按钮；Madeline 已持有 `preRunAbort` 时她主动不抢（`diary.js:3665-3669`） | 两轮流式可以同时跑，但只有一轮可被“打断”按钮掐断 |
| 主动台词归属 | `companionSay`：面板打开或替班 → 她；否则 Madeline（`diary.js:1552-1559`） | 同一入口 | 同屏时面板通常关闭，主动台词会全部落到 Madeline，Badeline 永远不主动开口 |
| 情绪 | `companionState.currentEmotion`（`diary.js:1718`、`2830`、`2883`） | 面板内部 `curEmo` + `onEmotion` 回调（`badeline-panel.js:123`、`292`） | 日记页挂载没有传 `onEmotion`（`diary.js:3643-3677`），她的情绪目前不驱动任何身上表现 |

【事实】两个对话框在隐藏时都是 `opacity: 0; pointer-events: none`（`diary.css:651-652`、`badeline-panel.css:81-82`），所以“隐形框挡点击”不是问题；真正的问题是**同时显示时的覆盖和两套隐形打字**。

### 4.2 唯一话筒（核心规则）

【建议】引入一个全局“话筒令牌”，只有持有者可以产生一次完整说话演出：

1. 令牌是全局单例，跨两个角色、跨文本框与面板。
2. 同一时刻最多 1 个角色持有令牌。
3. 持有者可以同时拥有“自己的文本框 + 自己的面板”（Badeline 现有实现支持 `#blChat.dialog-live` 上移让位，`badeline-panel.css:91`；Madeline 面板与文本框的层级关系保持现状）。非持有者**不得出现任何对话表面**。
4. 身体情绪反应不占令牌；非持有者可以换姿态、换表情、做动作，但不能出声、不能弹框。
5. 用户点击对话框 = 用户强制收回令牌；当前打字立刻中止（沿用现有 token 失效机制）。
6. 用户发送消息 = 最高优先级的“请求令牌”，但不必立刻掐断当前句；按 §4.4 的句界规则交接。

### 4.3 优先级数值表

【建议】所有说话请求都带一个数值优先级；数值越大越先说：

| 级别 | 数值 | 来源 | 是否可打断 | 备注 |
|---|---|---|---|---|
| P0 危机/安全 | 200 | Madeline 的安全回应；Badeline 永远不产生 P0 | 可打断任何非 P0；自身不可被打断 | 只允许 Madeline；她是安全出口 |
| P1 用户直接输入后的回复 | 150 | 用户在 Madeline 面板/输入框发送；用户在 Badeline 面板发送 | 可打断 ≤110；同 150 不打断，见 §4.4 | 用户明确找谁，谁拿麦 |
| P2 用户点击角色的即时回应 | 120 | 点 Madeline（pet/scold/quickTalk）；点 Badeline（quickTalk） | 可打断 ≤80；同 120 按句界排队 | 点击是强意图，但不该切断刚开口的长回复 |
| P3 系统/事件反馈 | 80 | 保存反馈、金羽毛建议、重要日期/回访等 | 默认可被 ≥120 打断；金羽毛建议与保存反馈标记 `mustFinish`，除 P0 外不被打断 | `mustFinish` 保护 `suggestThenOpen` 的“说完再淡入”链路；P0 安全轮次最高优先 |
| P4 主动消息 | 50 | `/proactive/stream` 的 bubble、主动冒泡 | 可被 ≥90 打断 | 她的主动台词也落这一档 |
| P5 环境闲聊 | 30 | 空闲问候、梦话、陪写旁白 | 可被任意 ≥70 打断；自身 ≤30 时随时可被顶掉 | 最低成本的“氛围声” |
| P6 动作旁白 | 10 | 纯 murmur、动作注解 | 同上 | 不出框也应被压到最低 |

【建议】补充两条修正项：

- **面板打开加成**：某角色的聊天面板处于打开状态时，她的 P4/P5 请求 +40；P0/P1 不加成。这样“用户正开着她的面板”时，她的主动话不会被 Madeline 的普通主动话压住。
- **最后交互对象加成**：用户最近 3 秒内交互过的角色，P2 请求 +10；仅用于同分裁决，不改变跨级比较。

### 4.4 打断与排队规则

【建议】把“谁打断谁”写成可执行的判定顺序，按顺序命中即停止：

1. 当前没有说话者 → 直接授予。
2. 请求是 P0：
   - 当前也是 P0 → 排队，P0 自身不可被打断；
   - 当前不是 P0 → 等当前句说完（最多 600ms）后授予；安全优先，`mustFinish` 在这一步也要让路。
3. 当前请求标记 `mustFinish`（仅非危机的 P3）→ 新请求一律排队，不打断（包括 P1）。
4. 当前优先级 ≤ 30（P5/P6）→ 新请求 ≥ 50 时可立即在句界接管。
5. 优先级差 ≥ 40 → 在下一个句界接管。
6. 优先级相同 → 若当前句已播放 ≥ 1200ms，可在下一个句界接管；否则排队。
7. 优先级差 < 40 → 排队。
8. 排队超过上限或等待超时 → 按 §4.5 丢弃。

【建议】句界与强制切割：

- 句界以 `。！？!?…` 为界；Madeline 的分段在 `madeline-core.js:185-192` 的 `speechShouldBreak`，Badeline 的分段在 `badeline-panel.js:260-274` 的 `splitPages`。
- 正常情况下只在句界交接，不在字中间切断。
- 若优先级差 ≥ 80 且 1200ms 内等不到句界，允许强制切割；切割后静音 250ms 再开新框，避免两个 textbox 音效叠在一起。
- 打断后同一角色 800ms 内不得重新抢麦（P1 除外）。
- “继续”按钮的归属仍按现有 `abortOwner` 判断（`diary.js:1636-1642`）：谁被打断，谁续说；不要新造第二套按钮。

【事实】两个角色都使用同一套 `textbox/ui_game_textbox_madeline_in/out.wav` 音效（`diary.js:405-415`、`badeline-panel.js:219-222`）。同时开框会出现双重入/出音，这也是“必须串行”的硬理由。

### 4.5 可见性与队列上限

【建议】硬上限：

| 项 | 上限 | 超限处理 |
|---|---|---|
| 可见文本框 | 1 | 新请求排队；非持有者的框直接不打开 |
| 可见聊天面板 | 1 | 打开第二个面板时，先关闭第一个（走各自 `closeChat` 语义） |
| 同时持有话筒的角色 | 1 | 另一角色只能做身体反应 |
| 全局待说话队列 | 3 条 | 丢最低优先级；同优先级丢最新一条 P5/P6；仍超限丢最旧 |
| 单角色待说话队列 | 2 条 | 同上 |
| 等待超时 | P1/P2 30s；P3 20s；P4–P6 15s | 超时静默丢弃，不补说、不弹错误 |

【建议】持有者的“面板 + 文本框”两件套不算两个说话人；但如果面板和文本框同时出现，文本框仍只能 1 个，且面板必须按 `dialog-live` 上移（`badeline-panel.css:91`），不能压住文本框。

### 4.6 冲突裁决表

【建议】以下场景必须按表执行，不允许“看心情”：

| # | 场景 | 竞争者 | 裁决 | 数值依据 | 具体动作 |
|---|---|---|---|---|---|
| 1 | 两人同时被主动消息触发（两边面板都关闭） | M P4 50 vs B P4 50 | Madeline 先说 | 同分默认 Madeline | Badeline 只做身体反应，不弹框 |
| 2 | 用户给 Madeline 发消息，Badeline 正在说 | M P1 150 vs B P4 50 | Madeline 接管 | 差 100 ≥ 40 | Badeline 在下一个句界停；250ms 后开 Madeline 的框 |
| 3 | 用户给 Badeline 发消息，Madeline 正在说普通回复 | B P1 150 vs M P1 150 | 若 Madeline 已说 ≥1200ms，Badeline 接管；否则排队 | 同分 + 已播时长 | 不切断 Madeline 刚开口的句子 |
| 4 | 用户点 Madeline，Badeline 正在说 | M P2 120 vs B P4 50 | Madeline 接管 | 差 70 ≥ 40 | Badeline 句界停 |
| 5 | 用户点 Badeline，Madeline 正在说 | B P2 120 vs M P4 50 | Badeline 接管 | 差 70 ≥ 40 | Madeline 句界停 |
| 6 | 两人在 260ms 内都被单击 | M P2 120 vs B P2 120 | 后点的那一个赢；先点的只转身不开口 | 同分取后请求 | 全局单击定时器保证只有一次单点行为 |
| 7 | 两人同时情绪激动并各自产生一句情绪台词（两边面板都关闭） | M 50 vs B 50（情绪台词固定 P4） | Madeline 开口；Badeline 换表情/姿态 | 同分默认 Madeline | 不出现两个框 |
| 8 | Madeline 保存反馈（P3 80，mustFinish）与 Badeline 点击（P2 120） | B 120 vs M 80 | Badeline 排队 | `mustFinish` 优先于数值 | 保存反馈说完再让 Badeline 说 |
| 9 | 金羽毛建议（P3 80，mustFinish）与 Badeline 任何请求 | B 任意 vs M 80 | Badeline 排队 | `mustFinish` + 金羽毛链路要“说完再淡入” | 依据 `feather-trigger.js:75-81` |
| 10 | Madeline 打开聊天面板，Badeline 主动开口 | M 面板打开（P4+40=90） vs B P4 50 | Madeline 先说 | 面板加成 | Badeline 只能身体反应 |
| 11 | Badeline 打开聊天面板，Madeline 主动冒泡 | B P4+40=90 vs M P4 50 | Badeline 先说 | 面板加成 | Madeline 的主动冒泡排队或丢弃 |
| 12 | 两个面板都打开 | M 面板 vs B 面板 | 后打开的赢，先打开的关闭 | 可见面板上限 1 | 不要两个面板并存 |
| 13 | 明信片 / 金羽毛斩断覆盖层打开 | 任意请求 | 全部静音 | 覆盖层是全屏遮罩（明信片 `z-index:10000`，`diary.css:279-288`） | 暂停话筒，不打开新框；当前句最多再说 1 句后收起（金羽毛建议链路本来就要求说完再演） |
| 14 | 替班为真 | 同屏控制器 vs 替班 | 替班赢；同屏整体 `ABSENT` | `PM_BADELINE_STANDIN` 是旧的驻场语义 | 不出现第二个精灵，不接管点击 |

### 4.7 用户点击优先级判定

【建议】点击按下面的顺序判，数值是硬规则：

1. **先判最上层元素**：`document.elementFromPoint` 命中谁，就归谁。层级事实：对话框 `#badelineDialog` 1600、`#gameDialog` 950；面板 `#blChat` 1600、`#madeline-wrapper` 1000；精灵 799–801；控制条 2000；明信片 10000。
2. **点中对话框** → 只关闭这个框，作废当前打字（P0 关闭 = 用户强制收回令牌）。
3. **点中面板** → 走面板自己的输入/关闭逻辑，不产生新的角色台词（用户发送时才产生 P1）。
4. **点中精灵** → 进入 260ms 单击判定（沿用现有两个实现的窗口：`diary.js:3161-3178`、`shelf.js:1547-1553`）。
5. **全局互斥**：任一精灵收到点击时，取消另一个精灵尚未触发的单击定时器；只有最后点击的那个能执行单点行为。
6. **双击** → 取消单击定时器，打开该角色的面板；若另一个面板已打开，先关闭它。
7. **跨角色单击**：先点的角色只做“转身 / 点头”等无声身体反应，不出台词；后点的角色拿 P2 120 的请求。
8. **点空白** → 不改变话筒，不关闭任何框（除非点中了实际的可关闭区域）。

【建议】单击判定数值：

| 项 | 数值 | 说明 |
|---|---|---|
| 单击延迟 | 260ms | 与现有实现一致 |
| 双击窗口 | 260ms 内第二击 | 与现有实现一致 |
| 身体确认反应 | 150ms 内转身 | 先被点但不说话的角色用它回应，避免“点了没反应” |
| 重开框间隔 | 250ms | 防止 in/out 音效叠在一起 |
| 同一角色连续点击冷却 | 800ms | 防止连点刷台词 |

### 4.8 情绪并发

【建议】情绪与话筒解耦：

1. 每个角色独立维护自己的情绪状态：Madeline 用 `companionState.currentEmotion`（`diary.js:1718`），Badeline 新增独立 `badelineEmotion`，通过给 `BadelinePanel.mount` 传 `onEmotion` 回调来更新（`badeline-panel.js:8-23` 的契约里有该回调；日记页当前挂载没有传，`diary.js:3643-3677`）。**这是新增的接线，不是改模块内部。**
2. 情绪变化只驱动身体：换表情、换姿态、换气泡颜色；不直接产生说话权。
3. 如果情绪变化需要一句台词，按 P4 50 处理；两个角色同时产生情绪台词时，Madeline 赢（裁决表 #7）。
4. 非持有者的情绪反应：每 3 秒最多 1 次可见身体变化；同一情绪的重复反应冷却 5 秒。避免两人同时抽搐。
5. 危机轮次：Madeline 的 `companionState.phase === 'REPLYING'` 且情绪为负向/安全类时，Badeline 不得启动任何新台词；她只能身体反应。P0 也不允许 Badeline 持有。危机判定本身沿用后端既有闸门，前端不新增判定逻辑。

### 4.9 覆盖层与页面状态

【建议】以下状态一律进入“全局静音”，正在说的句子允许说完，但不允许开新框：

| 状态 | 依据 | 处理 |
|---|---|---|
| 每日明信片显示 | `#postcard-overlay.show`，`z-index:10000`（`diary.css:279-288`） | 静音；不弹新框；覆盖层关闭后再恢复 |
| 金羽毛斩断演出 | `feather-game.js:624-804`，覆盖层 `z-index:1250` | 静音；不让 Badeline 的台词插进演出 |
| 金羽毛游戏打开 | `feather-trigger.js:53-98` | 静音；`mustFinish` 建议句仍按原链路说完再淡入 |
| 页面 `visibilityState !== 'visible'` | 浏览器事实 | 暂停行为与话筒；回到前台后丢弃过期 P5/P6 |
| 替班为真 | `diary.js:2615-2655` | 同屏整体禁用 |

---

## 5. 互动形式最小集合

【建议】先做 4 个，其中前 3 个不依赖新美术素材：

| # | 互动 | 触发条件 | 表现 | 时长 / 冷却 | 素材 | 现有行为树能否直接做 | 性质 |
|---|---|---|---|---|---|---|---|
| 5.1 | 对视 | 两人都处于静止（M `idle`/`lookaround`；B `lookUp`）≥ 1.5s；中心距离 ≤ 150px；冷却 90s | 两人朝向对方 1.4s；可选的短句只走 P4，且每 5 分钟最多 1 句 | 1.4s / 90s | `lookingUp_f.gif` + M 现有 idle/fun | 部分：朝向可以直接改 `dir`；但 M 没有“面向另一角色”的动作，需要新增一个轻量姿态覆盖 | 【建议】新增调度，不改行为树 |
| 5.2 | 让路 | 预测 0.6s 内路径交叉，且两人中心距离 ≤ 70px；两人都在移动 | Badeline 向侧后方退 36px，停 1s，再恢复跟随；Madeline 不变 | 1s / 8s | 无新素材 | 否：现有两套行为树都没有角色间碰撞（`diary.js:2714-2729`、`shelf.js:1370-1394`） | 【建议】新增 |
| 5.3 | 她先走再回头 | 仅 `AUTONOMOUS`；Madeline 正在走；冷却 60s | 她在 Madeline 面前 140–220px 处选一个可走点，先到那里；到达后转身面向 Madeline 等最多 3s；Madeline 没跟上来就自己走回来 | 3s / 60s | `spin_f.gif` 或 `player_badeline/walk*.png`；转身用 `lookingUp_f.gif` | 否；但可以照抄书架的 `pickTarget → MODE_HANDLERS → think` 结构（`shelf.js:1290-1394`） | 【建议】新增 |
| 5.4 | 模仿动作 | `FOLLOW` 中；Madeline 的动作变化持续 ≥ 600ms；同一动作冷却 2.5s | 按下表映射；只换姿态，不复制位移 | 跟随期间持续 | 见下表 | M 行为树不需要改；B 需要映射表 | 【建议】新增映射 |

【建议】5.4 的映射表：

| Madeline 动作 | Badeline 表现 | 素材 | 备注 |
|---|---|---|---|
| `walk` | 移动帧（`spin_f.gif` 或 `player_badeline/walk*.png`） | 现有或新增帧播放器 | 不复制 120px/s；只表现“在跟着走” |
| `idle` | `lookingUp_f.gif` | 现有 | 最稳，零风险 |
| `bounce` | 以 0.35s 周期上下浮 4px | `lookingUp_f.gif` + CSS 位移 | 无跳跃素材，用呼吸式起伏代替 |
| `lookaround` / `fun` | `lookingUp_f.gif` 或 `spin_f.gif` | 现有 | 与书架页情绪映射一致 |
| `sit` | `player_badeline/sitDown*.png` | 新增帧播放器 | 没有 GIF 坐姿（`celeste-player/badeline` 目录核对） |
| `sleep` | `sleep_f.gif` | 现有 | 可以直接模仿 |
| `wake` | `lookingUp_f.gif` | 现有 | — |
| `fall` | `lookingUp_f.gif` | 现有 | 不建议模仿“摔死”，会误导 |
| `celebrate` | 转一圈 `spin_f.gif` | 现有 | 一次性，不循环 |
| `peek` | `lookingUp_f.gif`，朝向书页 | 现有 | Madeline 打字时她在一旁看 |

【事实】Badeline 的 GIF 目录只有 `lookingUp / pretendDead / roll / rollGetUp / sleep / spin`（`blog-ui/celeste-player/badeline/`，目录核对）；`atlases/Gameplay/characters/player_badeline/` 里有 `walk / run / idle / sitDown / sleep / lookUp` 等 PNG 帧（502 个文件）；`atlases/Gameplay/characters/badeline/` 里有 `walk / run / idle / sleep / lookUp / laugh / angry` 等 PNG 帧，但没有 `sitDown`（275 个文件）。

【建议】互动全部可关：`full` 模式下才启用 5.1–5.4；只到 `move` 模式时，她只跟随/自主，不做互动。

---

## 6. 与现有实现的边界

### 6.1 复用（只读或原样调用，不修改内部）

| 项 | 位置 | 复用方式 |
|---|---|---|
| Badeline 面板模块 | `blog-ui/js/badeline-panel.js:8-24`（契约）、`102-553`（mount 与返回对象） | 同屏只调用 `mount()`，用返回的 `say/speak/quickTalk/openChat/closeChat/killDialog/isOpen/reset/resumeLast`；不复制面板代码 |
| 情绪 19 键层 | `blog-ui/js/lib/emotion-map.js:17-41`（键与标签）、`56-71`（降级与 `__EMOTION_UNIFY_OFF`） | Badeline 标签继续走 `labelFor('badeline', emo)`（`badeline-panel.js:38-41`）；Madeline 标签走 `EmotionMap.labelFor('madeline', raw)`（`diary.js:237`）；新增 `badelineEmotion` 时用 `normalize/keyFor` |
| 替班状态判断 | `blog-ui/js/diary.js:2655` 的 `window.isBadelineStandIn()` | 只读；同屏用它判断“要不要整体禁用”，绝不改写它 |
| Madeline 行为树内核 | `blog-ui/js/madeline-core.js:39-59`（模式表/常数）、`113-136`（仲裁入口） | 只读 `pmState` 与 `PM_MODES`；不新增模式、不改优先级 |
| 布局缓存与禁区 | `blog-ui/js/diary.js:2656-2677`、`2714-2729` | 复用“300ms 刷新 + rect 列表”的方法论；Badeline 用自己的 rect 列表，不改 `layoutCache` |
| 单个中断/继续控制条 | `blog-ui/diary.html:35-40`；`diary.js:1615-1648` | 沿用；Badeline 流式已经通过 `onStreamStart/onStreamEnd` 接入同一 `preRunAbort`（`diary.js:3665-3675`） |
| 两套聊天历史键 | Madeline `madelineChatLog`（`diary.js:316`）；Badeline 默认 `badelineChatLog`（`badeline-panel.js:23`） | 保持分离，不合并、不迁移 |

### 6.2 必须新增

| 新增项 | 建议文件 | 作用 | 为什么不能塞进现有文件 |
|---|---|---|---|
| 同屏控制器 | `blog-ui/js/badeline-copresence.js` | 在场窗口、行为状态机、跟随路径、互动调度、第二个精灵渲染 | 现有 `diary.js` 已经很长（>3600 行），再塞会继续加重维护负担；独立文件可整体关闭 |
| 话筒仲裁器 | `blog-ui/js/lib/speech-arbiter.js` | 全局令牌、优先级、句界交接、可见性上限、点击互斥 | 这是跨模块规则；放在 `diary.js` 里会与面板模块形成隐式耦合 |
| 同屏样式 | `blog-ui/css/badeline-copresence.css` | `#pixelBadeline` 的 64px 尺寸、层级、淡入淡出、浮动态 | 不修改 `diary.css` 的现有选择器，回退只需删一个 link |
| 第二个精灵 | `blog-ui/diary.html:27` 之后 | `<img id="pixelBadeline">` | 不能复用 `#pixelMadeline`：替班 CSS 选择器 `#pixelMadeline[src*="badeline/"]` 会把它放大到 128px（`diary.css:617-620`） |
| 独立情绪状态 | 同屏控制器内部 + 日记页 mount 参数 | `badelineEmotion`，由 `onEmotion` 更新 | `companionState.currentEmotion` 是 Madeline 的，不能复用（`diary.js:1718`） |

### 6.3 不能碰（改动会直接破坏现有功能）

| 禁区 | 位置 | 为什么不能碰 |
|---|---|---|
| 金羽毛斩断 | `blog-ui/js/feather-game.js:624-804`；`feather-trigger.js:1-113` | 它只认 `window.isBadelineStandIn()`（`feather-game.js:788-799`）；同屏如果改写这个判断，会让“替班期间必斩断”失效或误斩 |
| 替班 hack | `blog-ui/js/diary.js:2586-2655`（键、TTL、替换、恢复按钮）；`2691-2692`、`2860-2861`、`2947-2953`、`3160-3190`（各处的替班闸门） | 这是用户明确要求保留的旧行为；同屏只能在它为假时运行 |
| 每日明信片 | `blog-ui/js/diary.js:1290-1422`（取卡与演出）、`3436-3443`（每天一次的闸门）；`diary.css:279-288`（全屏覆盖层） | 改写入时机或 `postcardDate` 会造成重复弹/当天不弹；同屏只能在覆盖层关闭后出现 |
| 对话框架 CSS 几何 | `diary.css:638-656`；`badeline-panel.css:68-91` | 两个框的“同位置同尺寸”是现有设计；不要靠改 left/bottom/宽度来“错开”，那会同时影响单人和替班场景 |
| Madeline 的 z-index | `diary.css:605-620` | 改成 801/799 会改变它相对日记书页与按钮的前后关系；Badeline 应该用独立元素自己的层级 |
| 后端接口 / 提示词 / 数据库 | 不在本草案范围 | 同屏是前端行为，不应改 `/proactive`、日记 SSE、Badeline 流式接口的协议 |
| 明信片导出、心晶、书架 | `diary.js` 的明信片导出段、`shop.js`、`shelf.js` 的独立逻辑 | 与同屏无直接关系；不要顺手改 |

### 6.4 接线点（只列位置，不写实现）

【建议】同屏的接入面控制到 4 行以内：

1. `diary.html`：在 `#pixelMadeline`（第 27 行）后加第二个 `<img id="pixelBadeline">`，默认 `hidden`。
2. `diary.html`：在 `badeline-panel.css` 之后加 `badeline-copresence.css`（第 14 行附近）。
3. `diary.html`：在 `badeline-panel.js` 之后、`diary.js` 之前加 `speech-arbiter.js`（第 119 行之后）；在 `diary.js` 之后加 `badeline-copresence.js`（第 127 行之后）。
4. 同屏控制器启动时等待 `window.__diaryBadelinePanel` 出现（`diary.js:3643` 异步挂载）；不要反向去改 `diary.js` 的挂载顺序。

【建议】不修改 `badeline-panel.js` 的任何内部函数；给 `mount` 多传一个 `onEmotion` 是契约内允许的可选参数（`badeline-panel.js:19`、`292`）。

---

## 7. 分步落地与回退

### 7.1 步骤表

| 步骤 | 内容 | 开关值 | 回退动作 | 回退后应恢复 |
|---|---|---|---|---|
| P0 观察 | 第二个精灵出现、固定站在 Madeline 侧边；不移动、不说话、不接管点击 | `copresenceMode = 'observe'` | 设为 `off` 并刷新；或直接删掉 `#pixelBadeline` 与 2 个 script、1 个 CSS 链接 | 页面与今天完全一致；无新 DOM、无新 localStorage 键 |
| P1 移动 | 加跟随/自主/休息；速度、路径、软分离、层级 | `'move'` | 设回 `'observe'` | 精灵退回静止站姿；Madeline 行为树不变 |
| P2 话筒 | 加 `speech-arbiter.js`，接管 Badeline 的 `say` 与可见性上限 | `'mic'` | 设回 `'move'` 并移除仲裁器 script | Badeline 退回“只在她面板打开时说话”的现状；Madeline 队列时序不变 |
| P3 互动 | 对视、让路、先走再回头 | `'full'` | 设回 `'mic'` | 只保留跟随/自主 + 话筒；互动不触发 |
| P4 模仿 | PNG 帧播放器 + 动作映射 | `'mimic'` | 设回 `'full'` | 只保留 GIF 表现；不加载 PNG 帧 |

【建议】开关读取顺序：URL 参数 `?copresence=` > `localStorage.copresenceMode` > 默认 `'off'`。默认关闭，确保发布到线上时不改变任何现有页面；评审通过后再逐步打开。

【建议】每一步单独改动、单独回退；本轮只出文档，不提交 git。

### 7.2 每一步的回退验收

| 步骤 | 回退后必须看到 |
|---|---|
| P0 → off | `document.getElementById('pixelBadeline')` 不存在或不可见；控制台无新报错；`badelineMirrorStoryV1` / `postcardDate` / `madelineChatLog` / `badelineChatLog` 均无新增或改写 |
| P1 → observe | 精灵位置固定在 Madeline 右侧 80px，不再追赶；Madeline 的 `pmLoop` 帧率与路径不变 |
| P2 → move | 只有面板打开时 Badeline 才说话；Madeline 的保存反馈、金羽毛建议仍能完整说完 |
| P3 → mic | 对视/让路/先走再回头不再出现；跟随/自主仍在 |
| P4 → full | 不请求 `player_badeline` 的 PNG；只保留 GIF；`<img>` 的 `src` 不出现 `atlases/` |

---

## 8. 验收：怎么判断“没搞坏现有页面”

### 8.1 必过的回归清单（按现有行为逐条核）

| # | 检查 | 期望 | 依据 |
|---|---|---|---|
| 1 | 当天首次进入日记页 | 明信片只弹一次；`postcardDate === new Date().toDateString()` | `diary.js:3436-3443` |
| 2 | 明信片不点关闭直接刷新 | 当天不再弹 | `diary.js:3440-3441` 先落盘 |
| 3 | 触发替班（镜之房间 `appeared`） | 日记页只出现“一个 128px 的 Badeline”，有「恢复 Madeline」；刷新恢复；1 小时过期 | `diary.js:2586-2653` |
| 4 | 替班期间点金羽毛 | 第一次播斩断演出，之后同一驻场周期静默拒绝 | `feather-game.js:786-799` |
| 5 | 替班为假、同屏为真时点金羽毛 | 不播斩断，正常进入羽毛游戏 | `feather-game.js:788-794` + `feather-trigger.js:58` |
| 6 | Madeline 单击 / 双击 | 单击 260ms 后 pet/scold；双击开关聊天 | `diary.js:3161-3190` |
| 7 | 打开 Madeline 聊天 | Madeline 停止移动 | `diary.js:2961` |
| 8 | Badeline 面板发送、打断、继续、关闭 | 发送走她的流式；打断按钮掐断；继续重发；关闭后控制条还原 | `badeline-panel.js:279-331`；`diary.js:1619-1648`、`3665-3675` |
| 9 | 面板历史 | 仍是 `badelineChatLog`，不串到 `madelineChatLog` | `badeline-panel.js:23`；`diary.js:316` |
| 10 | 两个文本框同时被强制触发 | 只有 1 个可见；另一个排队或丢弃；无隐形打字 | §4.5 |
| 11 | 两个面板同时被打开 | 只有 1 个可见；后开的赢 | §4.5；层级 `badeline-panel.css:11-16` vs `diary.css:211-216` |
| 12 | 两人都收到情绪 | 两人都可以换表情；只有话筒持有者能说话 | §4.8 |
| 13 | 两人在屏幕里跑 2 分钟 | 中心距离始终 ≥ 60px；无叠身；层级按脚底 Y 正确 | §3.5 |
| 14 | 精灵经过日记书页、动作按钮、对话框 | 不进入禁区；不遮挡对话按钮 | `diary.js:2660-2666`、`2714-2729` |
| 15 | 控制台 | 无新报错、无新警告、无 404 | — |

### 8.2 自动化与人工

| 类型 | 做法 |
|---|---|
| 既有单测 | 运行 `node blog-ui/tests/madeline-segmentation-invariants.js`，退出码必须为 0（该测试只验证 Madeline 台词分段不变式，见文件头 `1-15` 行） |
| 视觉基线 | 在 1440×900 与 390×844 两个视口，对“日记页 + 明信片 + 两个面板 + 两个文本框”分别截图；改动前后对比，只允许新增 Badeline 精灵区域发生变化 |
| 手动脚本 | 按 §8.1 的 15 条顺序走一遍；每条记录“通过 / 失败 + 截图” |
| 性能 | 开 DevTools Performance 录 10s；`rAF` 不应出现每帧 DOM 读取；帧率下降不超过 15% |
| 移动端 | 390×844 下确认两个精灵不挡住输入区；两个框不重叠；单击/双击仍是 260ms 判定 |

### 8.3 一票否决（出现任一条立即回退）

1. 替班时同时出现两个精灵。
2. 明信片当天重复弹，或当天不弹。
3. 替班为假时金羽毛出现斩断演出。
4. 两个文本框同时可见，或出现“框关了但还在打字”的隐形说话。
5. Badeline 推着 Madeline 改变位置。
6. 任一精灵停在书页/按钮/对话框上，导致按钮点不到。
7. `madelineChatLog` 与 `badelineChatLog` 互相写入，或 `badelineMirrorStoryV1` 被改写。
8. 控制台出现未捕获异常。

---

## 9. 需要拍板的问题

1. **首发页确认**：本草案按日记页写。若目标是书架镜之房间、写作页或别的页面，§3 的“读取源”必须替换，不能照搬 `pmState`。
2. **Badeline 同屏尺寸**：【建议】64×64（32px 源图 2 倍整数放大）。备选 56×56（与 Madeline 同高，但非整数倍，像素边缘会糊）和 128×128（与替班同量级，但会压过 Madeline）。
3. **在场窗口长度**：【建议】3–10 分钟随机，到点淡出。备选“只在她被召唤后出现，直到刷新/离开页面”。
4. **是否允许她模仿坐/睡**：【建议】P2 再做；先用 `lookingUp` 代替，避免为了一个坐姿引入整套 PNG 帧播放器。
5. **是否允许 Badeline 主动打断 Madeline 的普通主动台词**：【建议】不允许。她只在“用户找她”或“她的面板开着”时拿话筒；面板关闭时，她的情绪与主动话默认降为身体反应，避免两个人抢话把页面变成吵架现场。
6. **危机轮次的前端信号**：【建议】前端不新增危机判定；如果后端 `done` 没有暴露 `safety` 标记，前端只按“Madeline 正在回复且情绪负向”做保守静音，宁可少说，不可让 Badeline 接手安全回应。

---

## 10. 一张总图（给实现时对照）

```
场景阶段（页面可见 / 明信片关闭 / 替班为假 / 覆盖层关闭）
        │
        ├─ 不满足 → ABSENT（同屏整体禁用）
        │
        └─ 满足
             │
             ├─ 在场窗口到期 / 替班变真 → LEAVING → ABSENT
             │
             └─ PRESENT
                  │
                  ├─ FOLLOW（默认）── 连续 90s ──► AUTONOMOUS（15–30s）
                  │      ▲                              │
                  │      └──── 距离 ≤ 180px ────────────┘
                  │
                  ├─ REST（Madeline 坐/睡 ≥ 2.5s）
                  │
                  └─ INTERACT（对视 / 让路 / 先走再回头）

话筒：任何说话请求 → 优先级表 → 当前持有者比较
      → 更高或同分且已播 ≥ 1200ms → 句界接管
      → 否则排队（全局 3 / 单角色 2）
      → 同时最多 1 个文本框、1 个面板、1 个说话人
```
