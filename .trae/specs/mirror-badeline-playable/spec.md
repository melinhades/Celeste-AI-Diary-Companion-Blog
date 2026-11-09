# 碎镜后 Badeline 可操控 + 穿梦块自动退出 dream

状态：已拍板，进入实现
范围：只做下列 6 条，不扩（触屏不做）

## 1. 范围（用户拍板，逐条）

1. **触屏不做**。键盘 + 鼠标既有交互保留。
2. 首次碎镜过场播完（`SCENE.onDone`）后，Badeline 站在**默认落点**，**直接可操控**：
   走 / 跳 / 冲刺 / 抓墙。**不自动弹聊天面板**，不启 DOM 自由游荡。
3. 可操控状态下**穿 dream block**：
   梦块内穿越 → 离开梦块自动播 `dreamDashOut` → **末帧直接消失**（不淡出、不缩放）
   → 写回 `dived` → 宿主 `goBack` 回 dream 场景 → Badeline 出场 + 台词
   → 气泡消失（4.85s）后**直接退出 dream，不叫醒 Madeline**（保持睡姿）→ 回书架。
4. **手动提前走**（点睡着的 Madeline / Esc）保留原睡醒演出；
   自动退出路径加 `waking` 守卫，避免与手动退出重复。
5. **diary 持久接管**：独立键、无 TTL、加入 `USER_SCOPED_KEYS`；
   日记页「恢复 Madeline」按钮是唯一出口。
6. **重复进入**：已碎镜直接出人，不重播碎镜动画（移除原来的 5:5 随机重演）。

只读约束：**不修改 `celeste-character.js` / `celeste-hair.js` 的既有行为**（farewell /
internet_cafe 共用）。所有改动落在接线层（`celeste-mirror.js` / `shelf.js` /
`diary.js` / `api.js` / `shelf.html`）。

## 2. 已核实的代码事实

### 2.1 镜子房间（`blog-ui/js/celeste-mirror.js`）
- `VIEW_W=320/VIEW_H=180`，`Z=H/180`，`toScreen(wx,wy)`；默认机位 `cam=(160,216)`。
- 房间 `320×456`，`MIRROR_MAP.solids` 40 列 × 57 行，8px tile；`'0'` = 空。
- `DREAM={x:120,y:128,w:80,h:64}`：地图上 cols 15–24 正好是空槽，上下被实体夹住。
- `MIRROR={x:160,y:264}`：镜座台面 row33 顶面 y=264，脚底落点即 `(160,264)`。
- 梦块底边 y=192，地面 y=264：地面起跳（约 27px）+ 上冲刺（36px）可从上穿入。
- 梦块顶部 y=128 以上（rows 12–15, cols 12–25）为空，向上穿出不会撞实体。
- 剧情键 `badelineMirrorStoryV1`（含 60min TTL）：`storyRead/storyWrite/storyReset`。
- `storyEnter()` 只同步状态；`storyCanDive()` 只在 `stage==='sleep'` 且过场未结束/已结束时成立。
- `storyDive()` 收尾三行：`sbClear(); storyWrite('dived'); if(STORY.hostDone) setTimeout(...)`。
- `storySyncBar()`：`stage!=='sleep'` 时在房间右下角挂「恢复 Madeline」（既有行为，保留）。
- `dreamHit` 是梦块的 DOM 点击热区（旧版点块=脚本化穿走）；可操控期间必须让位。
- rAF 主循环：`update(dt)` → `render()`；`render` 末尾 `storySyncHit()`。
- `resetScene()` 复位相机到 `(160,216)`；`applyStateNow(smashed,dreamDash)` 直接推终态。
- 导出 `window.MirrorScene`：`init/breakNow/ff/reset/applyState/resize/isReady/
  storyEnter/storyStage/storyMark/storyReset/setHostBadeline/dbg/scale/mirrorRect`。

### 2.2 引擎 API（只读）
- `CelesteCharacter.create({base,color,x,y,facing})` → Promise<Character>。
- 输入字段：`{left,right,up,down,jumpPressed,jumpHeld,dashPressed,grabHeld,aimY,...}`；
  `aimY` 屏幕向下为正（上 = −1），零输入时回落 `facing`。
- 碰撞接线：`setGround(fn)/setWallAt(fn)/setWallCollideFn(fn)/setCeiling(fn)/
  setBodySolid(fn)/setDreamBlockFn(fn)`；`dreamDashEnabled=true` 才允许穿块。
- 回调：`onDreamDashEnter/onDreamDashExit/onDreamDashDeath`。
- 离开 `ST_DREAM_DASH` 时 `dreamDashEnd()` 触发 `onDreamDashExit`，随后引擎自动
  `sprite.play('dreamDashOut')`（4 帧、无 goto），`sprite.current` 归空。
- `sprite.onLastFrame(id)` 在末帧展示时间耗尽那一 tick 触发（可包裹，保留原 idle 甩发）。
- `Character.draw(ctx, toScreen, zoom)`：`toScreen` 收**点对象**；先画头发后画身体。
- `CelesteHair.load(base,color)` 只染 `hair00` + `bangs00–02`；`hair.reset(x,y,facing)`。

### 2.3 宿主接线（`blog-ui/js/shelf.js`）
- 镜子点击：`if(__mirrorRoomBroken){summon();return;}`；否则 `reset().breakNow()`。
- `onDone`：`msPosition(); summon();`（过场结束的收尾点）。
- `summon()`：`blApi.openChat()` + `.summoned` + `900ms → __badelineStartFreeRoam`（旧的 DOM 游荡）。
- `enter()`：`roomShowsBroken = brokenFact && Math.random()<0.5`（5:5 随机）。
- `goBack()`：仅当 `.panned`；`__mirrorScene.leave()` → 派发 `mirrorstory:back`。
- `#mirrorRoom` 背景 click：`e.target===room → goBack()`。
- dream 场景：`exitDream()` 是同一 IIFE 内**函数声明**，可直接调用（移除 `scene.show`/
  `body.dream-active`、清定时器、复位 `playing/waking`、`dsMadeline` 设回 `SLEEP_GIF`、
  `dsClearVisuals()`）。
- `dsShowBubble()`：900ms 写 `appeared` + 出场，4850ms 移除气泡。
- 旧的 diary 替班读 `badelineMirrorStoryV1`，一次性：`appeared → diaryShown → 清键`，且带 60min TTL。

### 2.4 diary（`blog-ui/js/diary.js`）
- 替班入口只是 `PM_BADELINE_STANDIN` 布尔 + `pmState.mode='badeline'` +
  128px 立绘定位 + 「恢复 Madeline」按钮；`window.isBadelineStandIn()` 给羽毛拦截复用。
- `pmSetSrc` / `pmLoop` 对替班已有冻结分支，无需改动。

## 3. 实现方案

### 3.1 `celeste-mirror.js`：新增 PLAY 层（第 8 节之后）
- `PLAY` 状态：`active/removed/frozen/exitPending/dived/ch/loading/gen/camT`。
- `playStart()`：同步置 `active`（先挡住旧 dreamHit），异步 `CelesteCharacter.create`：
  `base='Atlases/Gameplay/characters/player_badeline'`，发色取样 `#672141`，
  脚底 `(160,264)`、`facing=-1`。已加载则直接复位落点。
- 碰撞：沿用 internet_cafe 的 8×11 身体盒 + 8px tile 适配，唯一梦块 = `DREAM`；
  `bodySolid` / `groundY` / `wallAt` / `wallCollide` / `ceiling` 均把 `DREAM` 当 Solid，
  `dreamBlockFn` 用 ±0.5 内缩身体盒判定。
- 输入：document 捕获阶段监听；`A/←` `D/→` `W/↑` `S/↓`，`C/Space` 跳，`X` 冲刺，
  `Z/Shift` 抓；仅 `PLAY.active && !frozen` 且非输入框聚焦时生效，并 `preventDefault`。
  `aimY = down?1:(up?-1:0)`。
- `playUpdate(dt)`：推进角色；相机从进房机位 tween 到 `y=190`（保证梦块顶部出口
  在画面内），tween 期间调 `SCENE.onCam()` 让宿主同步 DOM 镜子命中区。
- `playDraw()`：`sbDraw()` 之后画角色（`toScreen` 包装成点对象）。
- 穿块：`onDreamDashEnter → dived=true`；`onDreamDashExit/Death → freezeNext`；
  `playUpdate` 下一帧起 `frozen`，只 `sprite.update(dt)`（原地播 `dreamDashOut`）。
  包裹 `sprite.onLastFrame`：`id==='dreamDashOut' && dived` → `playDiveDone()`。
- `playDiveDone()`：`removed=true; active=false`（当帧跳过绘制）→
  `sbClear(); storyWrite('dived'); storySyncBar(); STORY.hostDone()`（与 `storyDive` 尾部一致）。
- `playReset()`：停止/复位，供 `resetScene()` 调用。
- `storySyncHit()`：`PLAY.active` 时把 `dreamHit` 设为 `pointer-events:none`+透明，
  否则恢复；避免旧「点块脚本穿走」抢占。
- 导出：`playStart / playStop / isPlaying / onCam` 钩子。

### 3.2 `shelf.html`
- 在 `celeste-mirror.js` 之前引入 `js/celeste-character.js`（此前只在 internet_cafe 加载）。

### 3.3 `shelf.js`
- `summon()` canvas 分支：直接 `MirrorScene.playStart()`（不 `openChat`、不 `.summoned`、
  不 900ms DOM 游荡）；DOM 回退分支原样保留。
- `enter()`：`roomShowsBroken = brokenFact`（去掉 5:5）；若已破，`applyState` 后直接
  `summon()`（重复进入直接出人）。
- `init` 选项加 `onCam: msPosition`（相机 tween 时同步 DOM 命中区）。
- 背景 `goBack`：`PLAY.active` 时不退房（避免可操控时点到背景误退）；Esc / 睡着的 Madeline 保留。
- `dsShowBubble`：900ms 与 4850ms 回调都加 `if (waking) return;`；
  4850ms 移除气泡后直接 `exitDream()`（**不调 `wakeMadeline`**）。
- 900ms 出场处写 diary 独立键 `badelineDiaryStandInV1='1'`。

### 3.4 `diary.js`
- `SHIFT_KEY='badelineDiaryStandInV1'`，存 `'1'`，**无 TTL**；
  `readShiftDiary()` 只读布尔；删除 `diaryShown` 一次性消费与 60min 回退。
- 「恢复 Madeline」按钮：清键 + 复位为 Madeline（现有逻辑保留）。
- `window.isBadelineStandIn()` 仍返回该布尔。

### 3.5 `api.js`
- `USER_SCOPED_KEYS` 增加 `badelineDiaryStandInV1`。

## 4. 验收（必须真的跑起来）

1. 首次进房：敲镜 → 过场 → 碎镜后 Badeline 站在 `(160,264)`；方向键能走、
   C 能跳、X 能冲刺、抓墙能挂；无聊天面板。
2. 从地面起跳到梦块下方按上冲刺 → 穿块 → `dreamDashOut` 播完后人物瞬间消失。
3. 消失后自动回 dream：Badeline 出场 + 台词；4.85s 气泡消失后 dream 直接退出，
   Madeline 保持睡姿，回到书架正页。
4. 手动 Esc / 点睡着的 Madeline：仍播睡醒 gif，2.4s 后退出；自动路径不再二次触发。
5. 刷新后重进：镜子显示已破、直接出人、不播碎镜。
6. 日记页：Badeline 永久替班（刷新仍在），只有「恢复 Madeline」能回 Madeline。

## 5. 风险 / 取舍（用户已知）
- 可操控段若卡住（爬不上/卡在角落），**唯一手段是刷新页面**。这是用户明确接受的取舍，
  不补逃生口、不补「回到 Madeline」按钮。
- 相机在可操控态轻微下移（216→190），由 `onCam` 同步 DOM 命中区，离开/复位回 216。
- 梦块出口在画面内的前提依赖 `y=190` 机位；若窗口比例极端（非 16:9），仅左右留黑，
  垂直仍按 180 世界像素映射。
