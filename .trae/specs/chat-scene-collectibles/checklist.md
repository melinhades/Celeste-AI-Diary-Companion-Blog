# Checklist — farewell demo 聊天室 + 场景互动

> 每条都用无头 Chromium（`--headless=new`，1280×800 与 390×844 两套视口）实测，或对代码/素材做可复现的静态核对。`[x]` = 已通过。

## 一、结构与环境

- [x] 页面为 `blog-ui/celeste-farewell-remembered-demo.html`，入口鸟链接（`js/auth.js:14`）与 work/seed 注册（`js/seed.js:77`，id 保持 `messages`）都指向它，`messages.html` 保留未删。
- [x] demo 原有场景全部保留：浮空跳板 25 块 / 167 格、月亮生物 ×9、moonBlade ×95、背景 11 层 + 前景 1 层、空无之心、BGM 静音按钮、加载层。
- [x] `auth.js` / `messages.js` / `seed.js` 在全部引用页均为 `?v=20261101c`（23 处引用已核对）。
- [x] 场景页自检（`?scenetest`）**55 pass / 0 fail / 0 exceptions**，其中水母专项断言 14 条（Grab/Hold/Throw/Drop、气泡悬浮、Dash-Grab 动量、`holdCannotDuck` 门控、死亡回收）。
- [x] 真实键盘事件（页面内 `KeyboardEvent` 触发真实监听）验证核心交互：按住 `Shift` → 抓取并 `carry(0,-16)`；持有时按 `D` → 玩家 `vx=90`、水母逐帧跟随、`dx=0`；松开 `Shift` → 水母 `vx=100, vy=-40` 飞出、`held=false`。
- [x] 冲刺抓取（真实键盘）：`X` 冲刺撞向 `x=28` 的水母，进入 10px 抓取范围后按 `Shift` → `held=true` 且 `vx=240` 保留（抓取不清玩家速度）。
- [x] 气泡悬浮（实时 `🪼`）：生成后 1.2s 仍 `bubble=true`，`y` 与 `homeY` 偏差 0.21–0.54px（两次采样，均在 ±1px SineWave 内）；抓取后 `bubble=false`。

## 二、聊天卡（居中 / 滚动 / 显隐）

- [x] 1280×800 下 `.chat-wrap` 900×530，水平/垂直偏移均为 0（正中心）。
- [x] 左侧 rail 可见且显示「山间聊天」；`#chatLog` 为内部滚动（`overflow-y:auto`），已停在底部。
- [x] 按 `A`（移动键 / `Space` / `X` / `Shift` / 方向键同理）→ `#chatContainer.chat-hidden`、`.chat-wrap` `opacity:0` 且 `pointer-events:none`；底部「山间聊天」胶囊与操作提示同时出现。
- [x] 按 `Enter` → 卡片淡入且焦点落到 `#chatInput`。
- [x] 他人消息（`chat:reveal` 事件）→ 卡片淡入但焦点停在 `BODY`（不抢焦点）；bird 消息不触发显现。
- [x] 就地在 DOM 模板挂载导致容器根级 `:class` 失效的隐藏态 bug 已修：`syncChatHiddenClass()` 在 `showChat` / `hideChat` / `onMounted` 三处同步 class，demo 根节点上的死绑定已移除。
- [x] 390×844：卡片 390×523、贴底（`bottomGap:0`）、rail `display:none`、`#chatPane` 只留上圆角 18px、无横向溢出；隐藏态同样生效。

## 三、收集品渲染

- [x] `renderChatContent` 把 `🍓 / 🪼 / 🪶` 归一化为 `[c:berry|jelly|feather]` 并替换为 `img.chat-emoji.collect`（`messages.js:159-161`）。
- [x] 三个素材均 200：`celeste-collectables/strawberry.png`、`Atlases/Gameplay/objects/glider/idle0.png`、`Atlases/Gameplay/objects/flyFeather/idle00.png`。
- [x] 收集图标不进 `EmojiAnim`（`bindEmojis` 只扫 `img.chat-emoji` 的非 collect 系列）。
- [x] 「收集」表情 tab 走 `EMOJI_PACKS.col` + `seriesList` 第 6 项，插入后生成 `[c:*]` 标记。

## 四、场景互动

- [x] 实时消息解析：`🍓`×12 → 跟随 10（上限）；`🪼`×6 → 场上 4（上限，含手持）；`🪶`×8 → 6。
- [x] 水母在 Madeline 近身刷新（左右 24–80px、上方 26–68px，8 次避实心重试，≤110px），全部落在 `BOUND` 内且一次跳跃可及；生成后原地气泡悬浮（`sin(time*0.3*2π)` ±1px），不再身侧伴飞、不再刷在够不到的高空。
- [x] 水母 `PickupCollider`（20×22 @(-10,-16)）判定：贴近可抓、远处（`y-60`）不可抓；按住 `Shift/Z` 抓取后 carry 到 `m.y-16`、`bubble=false`；体力 `checkStamina()<20` 时抓取被拒绝。
- [x] 持有缓降：`maxFall` 目标 40、`vy` 降到 40；按 ↓ → 120；按 ↑ → 24；空中 `maxRun=108` 且水平加速度 ×0.5；墙滑与攀爬跳过。
- [x] 投掷/丢弃：松开抓取键 → 投掷 `(100,-40)` + 玩家后坐 `-80`；地面按 ↓（`!holdCannotDuck`）→ Drop 零速度；松开后 0.3s 内重新抓取被正确拒绝。
- [x] `holdCannotDuck` 门控：空中按下 ↓ 置位 → 落地按住 ↓ 不自动丢水母/不下蹲；落地松开 ↓ 清除；再按 ↓ 才 Drop（4 条断言）。
- [x] 未持有的水母有独立物理：`bubble` 时悬浮；否则 `gravityTimer=0.1` 内跳过摩擦与重力；地面 `800` 摩擦 + `±20` 侧滑；撞实心反弹；掉出下边界移除。
- [x] 未持有的水母撞到 Madeline **不销毁**（原作 `OnCollide` 的 `0x020004ac` 实体未能解析，D18 / U13）；死亡动画仅在显式触发时播放并在 0.64s 后回收。
- [x] HUD 同步：`草莓 10/10 · 水母 4/4 · 羽毛 6/6`；`ChatScene.reset()` 后回到 `0/10 · 0/4 · 0/6`。
- [x] 羽毛刷新点全部落在 `BOUND = [-304,304]×[-288,48]` 内（实测采样 `94,-98 / -93,-110 / 110,-125 / -112,-105 / -102,-111 / 146,-135`）。
- [x] Follower 延迟：`FollowDelay=0.3`，18 帧内位置完全不变（实测差 0）。
- [x] 触碰金羽毛 → 进入飞行（`fly=true`、羽毛从数组移除）→ **146 帧**（0.42s 变形 + 2s 飞行）自动结束。
- [x] 飞行结束头发复原：`count=4` / `colorIdx=0`（normal）/ `rigid=false`。
- [x] 羽毛不重生；飞行期 `stepFeathers` 与坠落/空无判定均跳过。
- [x] 历史消息不回放：`ChatScene.consume` 只在 SSE `chat` 回调（`messages.js:470-471`）调用，`pushMsg` 路径不触发。
- [x] 纯 UI 数据断言（Node vm）**19 pass / 0 fail**：`FOLLOWER` / `STARFLY` 常量、`followerLerp`、`flyTargetSpeed`(91/190/140)、`flyEndVy`(-100/0)、`clampCount`(10/4/6)。

## 五、回归与已知干扰

- [x] `messages.html` 无回归：无 `#chatToggle`、无 `chat-hidden`、`#chatLog` 保持页面级滚动（`overflow-y:visible`）、无新增异常。
- [x] 全站无新增 `Runtime.exceptionThrown`（两轮实测均为空数组）。
- [x] 已剔除的既有噪声：`Atlases/Gameplay/characters/player/duck00.png` 404（`celeste-character.js` 把单帧 `duck.png` 拼成 `duck00.png`，本轮未触碰该文件，属既有问题）、`favicon.ico` 404、`localhost:8888` 连接拒绝（后端未启动）。
- [x] 后端未运行时降级正常：`logStatus=error` 显示「历史记录加载失败」、状态胶囊为「连接断开，重连中」，场景与互动不受影响。

## 六、研究文档

- [x] `celeste-dash-反编译研究.md` 新增 `## 24. 第六轮：跟随者与金羽毛飞行（聊天室互动移植）`，含 24.1–24.8 八节（Leader/Follower 证据、帧序、StarFly 常量与语义、球体锚点、偏差表 D1–D8 / K1–K3、未验证 U1–U6、素材清单）。
- [x] 新增 `## 25. 第七轮：水母 Glider 可持有物件（聊天室互动改造）`，含 25.1–25.11（语义变更、`Celeste.Jellyfish` 不存在/实体为 `Glider`、SHA-256/MVID/方法 token、Holdable 契约与输入顺序、SlowFall、气泡悬浮、未持有物理与销毁、持有表现、实现映射、偏差 D9–D18、未验证 U7–U14、素材、验证）。
- [x] 偏差已如实记录：结束条件按 IL 取「仅 `timer<=0`」（spec 早期文案的 `|len|<=140` 实为 `StarFlyEnd` 收尾夹取）；草莓统一播 `wings` flap 属可读性取舍；水母 `carryY=-16` 与 `deathTime=0.64` 标为推定。
- [x] 取证强度已声明：第 24 节未重新跑 REA、不补 IL 行号；第 25 节已重新跑 REA 6.8.0，记录程序集 SHA-256 `999024e2…f8e24`、MVID `4a26f9de-d670-4c87-a2f4-7e66d2d85163` 与全部引用方法 token。
