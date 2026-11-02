# 实时聊天室场景互动（以 farewell demo 为载体）

## 1. 目标与载体

把 `blog-ui/celeste-farewell-remembered-demo.html`（现标题「铭记 · 山间聊天室」）作为**新的实时聊天室页面**：

1. 它已内置完整关卡（lvl_e-00z，624×432）、相机、视差层、月亮生物、空无之心收集、BGM 与加载层 → **全部保留**。
2. 它已复用 `js/messages.js` + `css/messages.css` 的聊天面板 → 在其上补齐聊天室结构（左侧 rail「山间聊天」），并把面板改为**屏幕正中、可隐藏 / 可再次显现**。
3. 新增三种聊天触发互动：草莓跟随（上限 **10**）、水母可持有物件（上限 **4**，`Celeste.Glider` 的 `Holdable` 语义）、金羽毛 + StarFly（同时最多 **6** 颗）。
4. 入口切换：`js/auth.js` 顶部聊天鸟链接与 `js/seed.js` 页面注册表由 `messages.html` 指向新页面；旧 `messages.html` **保留不删**，其布局与行为不变。

非目标：不做草莓/水母结算（结算入口留给 `ChatScene.reset()`）；**notify（通知）面板本次不加**（用户明确说之后再加）；不改后端 `RealtimeChatController`；`celeste-character.js` 仅围绕持有缓降扩展（`holdSlowFall` 驱动 maxFall / 重力 / 空中 maxRun / 墙滑），不改其余状态机；不改 `shelf.js`。

## 2. 载体现状（已核对）

| 位置 | 现状 | 对本方案的意义 |
|---|---|---|
| `celeste-farewell-remembered-demo.html` 第 101 行 | `<canvas id="scene">` 全屏主画布，`Z = innerHeight>=700 ? 4 : 3` | 互动直接画进现有 `render()`，不新建画布 |
| 第 282-309 行 | `SPAWN {312,376}`、`ROOM 624×432`、`BLOCKS/JTS/DOOR/SOLIDS` | 草莓/羽毛用同一套世界坐标与地形 |
| 第 776-801 行 | `cam`（房间坐标）、`toScreen(n) = ((n.x+SPAWN.x-cam.x)*Z, ...)`、`updateCam` | 羽毛随机位置按相机可见区计算 |
| 第 493-520 行 | 键盘：`A/D/←→` 移动、`Space/C` 跳、`X/K` 冲刺、`Shift/Z` 抓；`typingInChat()` 让输入框不被抢键 | 互动沿用，不改键位 |
| 第 953-976 行 | `render()` 顺序：背景→门→方块→跳板→碎屑→生物→空无→尘土→粒子→`m.draw`→前景 | 草莓/水母/羽毛插在 `m.draw` 之前，飞行时用球体替代 `m.draw` |
| 第 1023-1051 行 | `tick(dt)`：输入→`m.update`→`updateCam`→空无判定→坠落重生 | 飞行期改成 `stepFly` 分支 |
| 第 1244-1313 行 | `main()` 内联 IIFE，`m`、`cam`、`IMG`、`render`、`tick` 均为闭包私有；已暴露 `window.__scene` | 互动代码写在同一个 IIFE 内，另暴露 `window.ChatScene` |
| 第 1316-1320 行 | 已加载 `api.js` / `auth.js` / `felt-piano.js` / `vue` / `messages.js` | 聊天逻辑复用 `messages.js`，无需新写一套 |
| 第 49-88 行 | 内联 CSS 把 `.chat-wrap` 改成右侧全高、隐藏 `body::after` 与 `#chatContainer::before` | 改为居中卡片 + 隐藏态样式 |
| `js/messages.js` 第 3-4 行 | 顶层调用 `initHeader()`，挂载 `#chatContainer` | 旧页面共用；新改动必须保持向后兼容 |

## 3. 素材（全部来自现有目录）

| 用途 | 路径 | 帧 / 参数 |
|---|---|---|
| 草莓跟随 | `Atlases/Gameplay/collectables/strawberry/wings00..09.png` | 10 帧，40×24；Sprites.xml `flap` delay `.08`，帧序 `0-8,0-8,0-7,9` |
| 聊天草莓图标 | `celeste-collectables/strawberry.png` | 96×96（me.html 同款） |
| 水母待机 | `Atlases/Gameplay/objects/glider/idle0..9.png` | 10 帧，48×48；`idle` delay `.1`；Justify `(0.5,0.58)` |
| 水母持有 | `.../glider/held0.png` | 1 帧，48×48 |
| 水母开伞 | `.../glider/fall0..2.png`、`fallLoop0..1.png` | 3 帧 / 2 帧，`.08s` |
| 水母销毁 | `.../glider/death00..07.png` | 8 帧，`.08s`（时长推定 0.64s） |
| 金羽毛 | `Atlases/Gameplay/objects/flyFeather/idle00..20.png`、`flash00..20.png` | 42 帧，32×32；`idle` 21×`.06` → `flash` 21×`.06` 循环 |
| 星飞球体 | `Atlases/Gameplay/characters/player/starFly00.png` | 32×32，球心 = 脚底 `(0,-6)` |
| 变形帧 | `.../player/startStarFly00..03.png` | 4 帧，每帧 `.08s`（`CHARGE_ANIM=0.32`） |
| 头发 | `js/celeste-hair.js` | 飞行 `count=7`、`rigid=true`、`setColor('fly')`、`offY=3` |

## 4. 聊天室结构补齐

新页面当前只有聊天框，需补：

1. `.msg-layout` 内新增 `<aside class="msg-side">`：标题「消息」+ 单项「山间聊天」（`active`）。**不加 notify 项**（本次不做，后续再加）。
2. 聊天头、状态、历史、正在输入、表情面板、输入行沿用现有结构（已在 demo 中）。
3. `#hud` 从左下改为左上两行：`空无 0 / 1` + `草莓 0/10 · 水母 0/4 · 羽毛 0/6`；`#mute` 移到右上，避免与居中卡片冲突。
4. 保留 `#toast`（拾起空无 / 拾起金羽毛提示）。

## 5. 聊天框：居中 + 隐藏 / 显现

在 demo 内联 CSS 覆盖 `css/messages.css`：

- `#chatContainer`：`position:fixed; inset:0; z-index:8; display:flex; align-items:center; justify-content:center; padding:24px; pointer-events:none`。
- `.chat-wrap`：`pointer-events:auto`；`width:min(900px, 94vw)`；`max-height:min(82vh, 760px)`；`margin:0`；`display:flex; flex-direction:column`。
- `#chatLog`：`flex:1; min-height:0; overflow-y:auto`（已有），确保历史在卡片内部滚动。
- `#chatContainer.chat-hidden .chat-wrap { opacity:0; transform:translateY(16px) scale(.975); pointer-events:none; }`，`transition: opacity .32s, transform .32s`。
- 新增 `#chatToggle`（底部居中玻璃胶囊，仅隐藏时出现）与 `.chat-hint`（胶囊上方：「A / D 移动 · Space 跳 · X 冲刺 · Enter 聊天」）。
- 窄屏 `max-width:820px`：聊天卡改为底部抽屉（`width:100%; max-height:62vh; align-self:flex-end`），胶囊 bottom 18px。

状态机（实现在 `messages.js`，仅当页面存在 `#chatToggle` 时启用，旧 `messages.html` 不受影响）：

| 触发 | 行为 |
|---|---|
| 初始 | `chatHidden=false`，**不自动聚焦输入框** |
| 按移动/动作键且输入框未聚焦 | 隐藏聊天框，同时照常操作 Madeline |
| `Esc` | 隐藏 |
| 聊天隐藏时按 `Enter`（全局） | 显示并聚焦输入框 |
| 点击 `#chatToggle` | 显示并聚焦 |
| 收到**其他真实用户**的 SSE `chat`（排除 `__bird__` 与自己） | 显示，**不抢焦点** |
| 发送消息后 | 保持显示并聚焦 |

## 6. 互动规则

### 6.1 草莓跟随（移植 `Celeste.Leader::Update` / `Follower`）

证据：`Leader::MaxPastPoints = 350`；`OnInterval(0.02)` 且距首点 ≥ 3 才 `Insert(0,pos)`；遍历起点 `num=5`，每只 follower 取 `PastPoints[num]`、`num += 5`；`Follower::Update` 只看 `DelayTimer`；`Strawberry::Added` 的 `FollowDelay = 0.3`。

- `leader.past` 采样世界点 `{x:m.x, y:m.y-10}`；`pastAcc += dt`，每 `0.02s` 采样；`|pos-past[0]| >= 3` 才插入；超过 350 丢末尾。
- 每个草莓索引 `i` 取 `past[5*(i+1)]`；`delayTimer` 起始 `0.3`，每帧 `-=dt`；到 0 后：
  `pos += (target - pos) * (1 - Math.pow(0.01, dt))`。
- 上限 **10**；消息内多余草莓直接忽略（不排队）。
- 视觉：`wings` 帧 `[0..8,0..8,0..7,9]`，`.08s`，随机相位；`drawImage(img, sx-20Z, sy-12Z, 40Z, 24Z)`（`s = toScreen(pos)`）。
- 生成动画：`spawnT` 0→1（0.4s），缩放 `0.4→1`。
- 不结算：无碰撞、永不消失。

### 6.2 水母（移植 `Celeste.Glider` 的 `Holdable` 语义）

证据见研究文档 §25：`Glider.orig_ctor`（`Holdable(0.3)`、`PickupCollider 20×22 @(-10,-16)`、`SlowFall=true`、`SlowRun=false`）、`Glider.OnRelease`（`dir*100`，`Y*=0.5`，X≠0 且 Y==0 → Y=-0.4）、`Player.NormalUpdate` 持有分支（IL 75/85-307/823-947）。

**刷新**：`🪼` token → 在相机可见区左右两侧随机生成 1 只，同时最多 **4** 只（含手持）；取点策略与羽毛相同（`f ∈ [0.06,0.30] ∪ [0.70,0.94]`，`worldY` 取可见区上中部），8 次重试避开实心块。不在历史回放中生成。

**抓取**：玩家未持有、未蹲下、未飞行、水母不在冷却（`cannotHoldTimer > 0`）时，按住 `Shift/Z`（`GrabCheck` 为按住式）→ 取最近的相交水母；成功则 `minHoldTimer=0.35`、`highFrictionTimer=0.5`、速度清零、`cannotHoldTimer` 保留、携带到 `m.y-16`。

**持有**：`holdSlowFall=true` → `maxFall` 目标 40（`MoveY==1` → 120，`==-1` → 24，`Approach(300*dt)`）、重力 ×0.5、空中 `maxRun=108` 且水平加速度 ×0.5、不进入墙滑、跳过攀爬；持有期间不向引擎传 `grabHeld`（等价 `Holding != null` 跳过抓墙分支）；旋转 `ClampedMap(m.vx,-300,300,±0.698)` / 空中 `±1.047`，角速度 `PI*dt`；动画 `held` / `fall→fallLoop`（`m.vy>20`）；缩放 `MoveY>0 → (0.7,1.4)`、`<0 → (1.2,0.8)`。

**投掷 / 丢弃**：松开抓取键且 `minHoldTimer<=0` → `Throw`：`Release(Facing)` 速度 `(100,-40)`、玩家后坐 `vx += -80*facing`；地面按 ↓（`vy>=0`）→ `Drop`：零速度。`Release` 置 `gravityTimer=0.1`、`cannotHoldTimer=0.3`，若仍与实心块重叠沿 X（或向上）最多挪 10px 脱困。

**未持有物理**：`gravityTimer>0` 时同时跳过摩擦与重力；否则空中重力 200（`vy<-30` 时 100）、横向摩擦 40/10、地面 `Approach(vx, ±20 侧滑, 800*dt)`；`MoveH/V` 命中实心 → `vx*=-1` / `vy=-vy*0.5`（向下则 0）；越界夹回、掉出下边界移除；撞玩家 → 进入销毁（8 帧 0.64s 后移除）。

**表现**：图层在人物之后（`Depth = player.Depth - 1`）；Sprite origin `(24, 27.8)`，绘制 48×48；不结算、不计 HUD 收集数（HUD 只显示场上只数）。

### 6.3 金羽毛 + StarFly

- 每次出现 1 个羽毛 token → 在**当前相机可见区的左右两侧**随机生成 1 颗，同时最多 **6** 颗：
  - `f ∈ [0.06,0.30] ∪ [0.70,0.94]`
  - `worldX = clamp(cam.x - SPAWN.x + f * W/Z, -304, 304)`
  - `worldY = clamp(cam.y - SPAWN.y + (H/Z) * [0.18..0.45], -280, 40)`
- 动画：`idle00-20` → `flash00-20` 循环，`.06s`；`drawImage(img, sx-16Z, sy-16Z, 32Z, 32Z)`；轻微 `sin(t*2)*3` 浮动。
- 触碰：羽毛中心与 Madeline 中心（`m.x, m.y-6`）距离 `< 14` → 移除羽毛并 `startFly()`。
- StarFly 常量（`shelf.js` 移植 + IL 取证）：
  - `CHARGE_ANIM = 0.32`、`CHARGE_TOTAL = 0.42`
  - `FLY_SPEED_START = 250`、`ACCEL = 1000`、`TURN_RATE = 5.5850534`
  - 目标速度：无方向输入 `91`；`dot(moveDir,dir) >= 0.45` → `190`；否则 `140`
  - `FLY_TIME = 2.0`（原作 2s）
  - 碰撞：用现有 `bodySolidFn`（8×11 身体盒）检测下一步位置；命中 → `timer < 0.2` 速度归零，否则对应轴方向翻转且 `len *= 0.5`
  - 房间边界：`x ∈ [-304,304]`、`y ∈ [-288, 48]`，同样按上述规则反弹
  - 结束：`timer <= 0` 或 `|len| <= 140`；按住 ↑ → `vy = -100`；`vy > 0 → 0`；恢复普通状态
  - 末 0.5s：每 `.05s` 在 `#ffd65c` ⇄ `#AC3232` 闪烁（`multiply` 叠色）
- 表现：
  - 变形期（0→0.42s）：不 `m.update`；画 `startStarFly00..03`（`.08s/帧`），缩放 `1→0.6`。
  - 飞行期：不画人物 sprite；球心 `(m.x, m.y-6)` 画 `starFly00.png`；`hair.count=7`、`rigid=true`、`setColor('fly')`，`hair.update(m.x, m.y-6, m.facing, 0, 3, dt, 1)` 后 `hair.draw(ctx, toScreen, Z, 0, 1)`。
  - 结束：`hair.count=4; rigid=false; setColor('normal'); hair.reset(...)`。
- 飞行期间不检测/不生成新羽毛；结束时羽毛不重生（需再发消息）。
- 拾起时复用 `toastEl`：`拾起「金羽毛」`（2.6s）。

## 7. 表情与消息渲染（`messages.js`）

- 新增 `EMOJI_PACKS.col = { names:['berry','jelly','feather'] }`；`seriesList` 追加 `{ key:'col', label:'收集' }`。
- `COLLECT_SRC`：`berry → celeste-collectables/strawberry.png`、`jelly → Atlases/Gameplay/objects/glider/idle0.png`、`feather → Atlases/Gameplay/objects/flyFeather/idle00.png`。
- `currentEmojis` 的 `col` 分支返回上述 3 项，`mark` 为 `[c:berry]` / `[c:jelly]` / `[c:feather]`。
- `renderChatContent()`（`escHtml` 之后）：
  1. 归一化原始 emoji：`🍓→[c:berry]`、`🪼→[c:jelly]`、`🪶→[c:feather]`；
  2. 替换 `\[c:(berry|jelly|feather)\]` 为 `<img class="chat-emoji collect">`（不带 `data-series`，不进 `EmojiAnim`）。
- 计数：`ChatScene.consume(content)` 按 token 出现次数累加；只在 SSE 实时消息调用（历史 `quiet` 不回放，符合已确认决策）。
- 兼容：`messages.html` 仍加载同一份 `messages.js`，新增项必须不改变其现有布局与滚动行为。

## 8. 精确改动清单

### 8.1 `blog-ui/celeste-farewell-remembered-demo.html`

**HTML**
1. 第 103 行 `#hud` 改为两行：`<span id="hudHeart">空无 0 / 1</span><br><span id="hudCollect">草莓 0/10 · 水母 0/4 · 羽毛 0/6</span>`。
2. `#chatContainer` 加 `:class="{'chat-hidden': chatHidden}"`。
3. 第 115-116 行 `.msg-layout` 内、`.msg-main` 之前插入 `.msg-side`（标题 + 山间聊天单项，`@click="pane='chat'"`）。
4. `</header>` 不存在；在 `#chatContainer` 内、`.chat-login-tip` 之前插入 `#chatToggle` 与 `.chat-hint`（`:class="{show: chatHidden}"`）。

**内联 CSS（覆盖 messages.css）**
5. `#chatContainer` → fixed 全屏 flex 居中，`z-index:8`，`pointer-events:none`。
6. `.chat-wrap` → `width:min(900px,94vw); max-height:min(82vh,760px); margin:0; pointer-events:auto; display:flex; flex-direction:column`。
7. `.msg-layout` → `display:flex; gap:18px; height:100%; min-height:0`；`.msg-side` → 宽 210px、玻璃底、自身滚动。
8. `.msg-main`/`#chatPane` → `flex:1; min-height:0; display:flex; flex-direction:column`；`#chatLog` 内部滚动。
9. `#chatContainer.chat-hidden .chat-wrap` → opacity/transform/pointer-events（§5）。
10. `#chatToggle`、`.chat-hint`、`#hud`（左上）、`#mute`（右上）定位；窄屏抽屉布局。

**内联场景脚本**
11. `preload()` 追加：`berry0..9`（wings）、`jelly0..9` + `jellyHeld` + `jellyFall0..2` + `jellyFallLoop0..1` + `jellyDeath0..7`、`feather0..41`（21 idle + 21 flash）、`orb`（starFly00）、`morph0..3`（startStarFly）。
12. 新增状态：`leader = { past:[], acc:0 }`、`berries=[]`、`jellies=[]`、`heldJelly=null`、`feathers=[]`、`fly=null`、`collectCounts={berry,jelly,feather}`，以及 `GLIDER` 常量表（§6.2 数值与 `celeste-dash-反编译研究.md` §25.7）。
13. 新增函数：`toScreen` 复用；`stepLeader(dt)`、`addBerry(n)`、`spawnJelly()`、`gliderSolidAt()`、`inPickupRange()`、`tryPickupJelly()`、`releaseJelly(dirX,dirY)`、`throwJelly(drop)`、`stepFollowers(dt)`、`stepJellies(dt)`、`jellyImage(j)`、`stepFeathers(dt)`、`startFly()`、`stepFly(dt)`、`endFly()`、`drawBerries()`、`drawJellies()`、`drawFeathers()`、`drawFly()`、`updateHud()`、`consume(content)`。
14. `tick(dt)`：**持有水母段**在 `m.update` 之前：`minHoldTimer` 递减；`!grabHeld && minHoldTimer<=0` → `throwJelly(input.down)`；地面按 ↓且 `vy>=0` → `throwJelly(true)`；未持有时按住抓取键 → `tryPickupJelly()`；随后 `m.holdSlowFall = !!heldJelly`，并把传给引擎的 `grabHeld` 强制为 `false`（等价 `Holding != null` 跳过攀爬）。之后 `if (fly) stepFly(dt); else m.update(...)`；再 `updateCam`；再 `stepLeader/stepFollowers/stepJellies/stepFeathers`；空无与坠落判定在飞行时跳过。
15. `render()`：`m.draw` 之前插入 `drawFeathers(); drawBerries();`；`m.draw` **之后**插入 `drawJellies()`（水母 `Depth = player.Depth - 1`，盖在人物之上）；飞行时用 `drawFly()` 替代 `m.draw`。
16. 同步暴露 `window.ChatScene = { consume, revealChat, reset, stats, ready:false, __test }`（在 IIFE 顶部定义，`main()` 完成后 `ready=true`；未就绪时 `consume` 入队，就绪后回放队列）；`stats` 含 `held` 布尔。
17. `respawn()` / `reset()` 中追加 `endFly(true)`、清空 `fly` 与 `heldJelly`（手上的水母留在原地，不结算）；`reset()` 清空草莓/水母/羽毛并归零 HUD。

### 8.2 `blog-ui/js/messages.js`

1. `COLLECT_SRC` + `EMOJI_PACKS.col` + `seriesList` 第 6 项 + `currentEmojis` 分支。
2. `renderChatContent`：emoji 归一化 + `[c:*]` 替换。
3. 滚动自适应：`logScrollEl()` 检测 `#chatLog` 的 `overflow-y`；`atBottom()/scrollToBottom()` 有内部滚动时用 `scrollTop`，否则保留原 document 逻辑（兼容旧页）。
4. 新增 `chatHidden` ref、`showChat(focus)`、`hideChat()`、`toggleChat()`。
5. 仅在存在 `#chatToggle` 时启用：全局 `keydown`（`Enter` 显示+聚焦、`Esc` 隐藏、移动/动作键先隐藏）、`#chatToggle` 点击、监听 `window` 的 `chat:reveal` 事件。
6. SSE `chat` 回调：`pushMsg(m)` 后 `window.ChatScene && ChatScene.consume(m.content||'')`；若 `userId !== myUserId && userId !== BIRD_ID` → `ChatScene.revealChat()`。
7. `onInputKey` 增加 `Esc`；`doSend` 的 `finally` 仅在未隐藏时聚焦。
8. 返回值追加 `chatHidden, toggleChat`。

### 8.3 入口与注册表

- `js/auth.js` 第 14 行：`href="messages.html"` → `href="celeste-farewell-remembered-demo.html"`。
- `js/seed.js` 第 77 行：`file: 'messages.html'` → `file: 'celeste-farewell-remembered-demo.html'`（`id` 保持 `messages`，已有籽状态不丢）。

### 8.4 研究文档

`celeste-dash-反编译研究.md` 已有：`## 24. 第六轮：跟随者与金羽毛飞行（聊天室互动移植）`（Leader/Follower 证据、Strawberry `flap` 帧序、Glider `idle`、FlyFeather `loop/flash`、StarFly 移植状态与偏差表）；`## 25. 第七轮：水母 Glider 可持有物件（聊天室互动改造）`（§25.2 程序集 SHA-256/MVID/方法 token、§25.3 Holdable 契约与输入顺序、§25.4 SlowFall、§25.5 未持有物理与销毁、§25.6 持有表现、§25.7 实现映射、§25.8 偏差 D9–D17、§25.9 未验证 U7–U14、§25.10 素材、§25.11 验证）。

## 9. 偏差表

| ID | 原作行为 | 本项目 | 处理 |
|---|---|---|---|
| D1 | 草莓跟随时仍参与地面碰撞 | 仅按 Leader 轨迹插值 | 刻意（关卡无草莓实体） |
| D2 | `FollowDelay = 0.3` | 同值 | 无偏差 |
| D3 | 非翼草莓播 `idle`（`normal` 18×16） | 统一播 `flap`（`wings` 40×24） | 刻意，跟随可读性 |
| D4 | StarFly 2s | 2s | 无偏差（不采用 shelf.js 的 4s） |
| D5 | 撞墙 `timer<0.2` 归零 / 否则 `-0.5` | 用 `bodySolidFn` 预判下一步；单轴方向翻转 + `len*=0.5` | 语义等价 |
| D6 | 羽毛方向由关卡配置 | 触碰瞬间取 `sign(feather.x - m.x)`，同 x 用 `m.facing` | 场景无方向羽毛 |
| D7 | 飞行结束羽毛重生 | 不重生（无结算，需再发消息） | 按需求 |
| D8 | 头发变形 4 → 飞行 7，`offY` `-2` / `3` | 同 | 无偏差 |
| D9 | 水母由关卡实体放置 | `🪼` 消息触发、相机可见区随机生成 | 产品需求；语义仍是 Holdable |
| D10 | `Holdable.Check` 用完整碰撞盒 | 20×22 抓取盒与 8×11 身体盒手工相交 | 语义等价 |
| D11 | 抓取需要按住抓取键且未疲惫 | 只检查按住，不模拟 `IsTired` / `NoGrabbing` | 场景无体力消耗 |
| D12 | 死亡协程时长由 `DestroyAnimationRoutine` 决定 | 固定 0.64s（8 帧 × 0.08） | 推定（U8） |
| D13 | `carryOffset` 逐帧逼近 `(0,-12)` + `CarryYOffset` | 固定总偏移 `-16` | 推定（U7） |
| D14 | 风场 `windMovedUp` / `WindMode` 分支 | 未实现（场景无风） | 缺口（U9） |
| D15 | 持有时缩放 `Approach(2*dt)` | 直接设为目标缩放 | 视觉差异极小（U12） |
| D16 | `holdCannotDuck` 门控下压 Drop | 仅检查 `onGround && MoveY==1 && Speed.Y>=0` | 少一个边界（U10） |
| D17 | `Throw` 播放 `throw` 精灵与音效 | 仅物理与后坐 | 引擎无 throw 动画，场景静音 |

## 10. 验证

### 10.1 数值断言（Node vm，脚本放临时目录）

`ChatScene.__test` 暴露 `FOLLOWER`、`STARFLY`、`GLIDER`、`followerLerp`、`flyTargetSpeed`、`flyEndVy`、`clampCount`：

1. `FOLLOWER = { sample:0.02, minDist:3, maxPoints:350, stepIndex:5, delay:0.3 }`。
2. `followerLerp(0,100,1/60) === 100*(1-Math.pow(0.01,1/60))`。
3. `flyTargetSpeed`：无输入 `91`；同向 `190`；反向 `140`。
4. `flyEndVy(up=true) === -100`；`flyEndVy(up=false, vy=50) === 0`。
5. `clampCount('berry', 12) === 10`、`('jelly', 7) === 4`、`('feather', 9) === 6`。
6. `GLIDER`：`pickupDelay .35`、`regrabDelay .3`、`releaseGravity .1`、`throwX 100`、`throwY -40`、`recoil 80`、`carryY -16`、`pickX 10` / `pickTop 16` / `pickBottom 6`、`deathTime .64`、`originY 27.8`。
7. 输出 `passed/total`，失败退出码非 0。

### 10.2 浏览器验收（`http://localhost:8080/celeste-farewell-remembered-demo.html`）

1. 加载层正常淡出；场景、月亮生物、空无之心、BGM 均在；无 console 错误。
2. 聊天卡在屏幕正中，左侧 rail 显示「山间聊天」，`#chatLog` 内部滚动并停在底部。
3. 发 `🍓`×3 → 3 颗草莓跟随；再累计到 11 颗 → 停在 10；HUD 同步。
4. 发 `🪼` → 相机可见区随机出现 1 只水母（避开实心块）；累计到 5 → 停在 4；再发不新增。
4a. 走到水母旁按住 `Shift/Z` → 抓取并携带在 `m.y-16`；持有时下落明显变慢（`maxFall` 40），空中水平速度上限 108。
4b. 松开 `Shift/Z` → 水母以 `(±100,-40)` 飞出、玩家后坐 `-80`；地面按 ↓ → 零速度丢弃；0.3s 内不能立刻重抓。
4c. 未持有的水母撞到 Madeline → 播放死亡帧后 0.64s 移除；掉出下边界同样移除。
5. 发 `🪶` → 视野两侧随机出现羽毛；触碰 → 变形 0.42s → 球体飞行（7 段飞行色头发）→ 2s 后落地；羽毛不重生。
6. 按 `A` → 聊天卡淡出、胶囊出现；`Enter` → 淡入并聚焦；`Esc` → 隐藏。
7. 第二个账号发消息 → 自动显现且不抢焦点；bird 消息不触发显现。
8. 「收集」表情 tab 三项插入后正确渲染；直接输入 `🍓/🪼/🪶` 同样生效。
9. 820px 以下：聊天卡变底部抽屉，不遮挡角色操作区。
10. `messages.html` 仍可打开且行为与改动前一致（共享 `messages.js` 无回归）。

### 10.3 缓存版本

`auth.js?v=20261101c`（所有引用页）、`messages.js?v=20261101c`、`seed.js?v=20261101c`；demo 内联无需 bump；引擎脚本 `js/celeste-character.js?v=20261102b`（本轮新增 `holdSlowFall` 的空中 `maxRun=108` 分支）。

## 11. 已确认决策

1. 上限：草莓 10、水母 4、羽毛 6。
2. 历史消息不回放场景物件，仅实时消息触发。
3. 主动显现：`Enter` + 底部「聊天」胶囊。
4. 载体：farewell demo；`messages.html` 保留但入口改为新页面。
5. demo 原有场景内容全部保留（空无之心、月亮生物、音乐、加载层）。
6. notify 面板本次不做。
7. StarFly 时长 2s（原作）。
8. 水母按原作 `Celeste.Glider`（`Holdable`）实现：抓取 / 持有缓降 / 投掷 / 丢弃 / 未持有物理 / 撞玩家销毁，不结算。
