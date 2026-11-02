# Spec：REA 复刻 CS10_FinalLaunch 过场 + 修复头部鸟容器裁剪

状态：待批准
范围：`blog-ui/css/index-bird.css`、`blog-ui/js/bird-ascent.js`（整体重写）、`blog-ui/js/index-bird.js`、
`blog-ui/celeste-farewell-remembered-demo.html`、`blog-ui/index.html`（仅版本号）、
`celeste-dash-反编译研究.md`（追加章节）、测试脚本 `.screenshots/.tmp/birdascent/*`。

行为证据：本地 `Celeste.dll` 逐条 IL（`CS10_FinalLaunch`、`<Cutscene>d__14`、`<BirdRoutine>d__17`、
`<WaveCamera>d__16`、`BlackholeBG`、`AscendManager/Streaks`、`Ease`、`Player.SummitLaunch*`、
`BadelineBoost.<BoostRoutine>d__22`），已 dump 到 `.screenshots/.tmp/rea/`。
Sprites.xml L261-284（bird origin 16,24；flyupIdle=FlyUp10-15@0.1；flyupRoll=flyup0-15@0.1 → flyupIdle）。
素材全部来自 `blog-ui/Atlases/`：`Gameplay/characters/bird/{flyup00,FlyUp01..15}.png`（32×24）、
`Gameplay/scenery/launch/slice00..02.png`（32×128）、`Gameplay/objects/temple/portal/portal.png`（240×240）；
Madeline 用 `celeste-gui/madeline-move.gif`（用户指定）。
不引入新素材、不编造常量。

## 1. 背景

上一轮 `bird-ascent.js` 是自研的夜天/星空/行星/贝塞尔起飞，与 CS10 没有任何对应关系，用户判定"根本一点不像"。
本轮按 IL 把整段过场做成**只依赖发射后时间 t 的确定性函数**，index 与 demo 两页共用同一套渲染；
同时修 `.chat-crow` 容器裁剪（19×18 + `overflow:hidden` 只露出鸟头，悬停喊叫被切）。

## 2. 逐条决策（文件 / 函数 / 具体改法）

### D1 `css/index-bird.css` → 头部鸟容器

`common.css` L268-293 是裁剪来源（`width:19px;height:18px;overflow:hidden` + img `40×30 / margin:-14 0 0 -10`），
不改 common.css，在本文件里追加高特异性覆盖（本文件在 common.css 之后加载）：

```css
.chat-crow .chat-crow-box { width: auto; height: auto; overflow: visible; align-items: center; justify-content: center; }
.chat-crow .chat-crow-box img { width: 32px; height: 24px; margin: 0; }
```

32×24 = 原始帧尺寸（不缩放），`overflow:visible` 让 `translateY(-6px) scale(1.16) rotate(-3deg)` 的
`birdCall` 与 hover `scale(1.08)` 完整可见，容器不再裁掉身体。`.chat-crow` / `.header-right` 已确认无
`overflow:hidden`，无需再动。

### D2 `js/bird-ascent.js` → 视口与坐标（整段重写）

* 虚拟视口固定 **320×180**（原作 play 分辨率）。`Z = max(W/320, H/180)`（cover 裁切），
  `ox = (W - 320*Z)/2`、`oy = (H - 180*Z)/2`。
* `screen(px, py) → (ox + px*Z, oy + py*Z)`；背景 buffer 也在 320×180 空间里画，整体按同一变换贴屏。
* 导出 API 保持不变：`open({canvas,mode,handoffAfter,onPhase,onHandoff,onDone})`、`finish()`、`close()`、
  `armed()`、`reduced()`、`loadFullSet()`、`takeSeed()`、`writeSeed()`、`readSeed()`、`SEED_KEY`、
  `get state()`。`mode: 'intro' | 'climb'` 都走同一条时间线（`climb` 仅表示"从 index 已起飞"）。
* `TIME_SCALE = 1.5`：内部 `t = 实耗秒 * 1.5`。**这是唯一的时间类偏差**（原版从起飞到全白约 16s，
  作为页面跳转过长），所有 Ease / 常量仍按原作数值，只是整体播放速率 ×1.5；Esc/任意键可跳过。
  代码里写成常量并注明对照的 IL 数值，便于改回 1×。

### D3 `js/bird-ascent.js` → 相机与 Madeline（SummitLaunch）

* `mad.y = -240 * t`、`mad.x = 0`、`facing = 1`（`Player.SummitLaunchBegin`: `Speed = -UnitY*240`）。
* `cameraOffset = (0, -20)`（Cutscene 里 `cameraOffset = new Vector2(0, -20)`）；收场阶段按 D8 抬到 180。
* `cameraWaveOffset`（`<WaveCamera>d__16`，`timer = t*2`）：
  `X = sin(timer)*16`；`Y = sin(timer*0.5)*16 + sin(timer*0.25)*8`。
* `cameraOffsetTotal = cameraOffset + wave`；Madeline 屏幕坐标 `(160 - off.x, 90 - off.y)`。
  相机左上角（世界）= `mad - 屏幕中心`，`screen(wx,wy) = (wx - cam.x, wy - cam.y)`。
* Madeline 用 `celeste-gui/madeline-move.gif`（32×32）以脚底线对齐：`drawImage(gif, -16, -32)`，
  `image-rendering: pixelated`，`imageSmoothingEnabled = false`。

### D4 `js/bird-ascent.js` → 鸟（`<BirdRoutine>d__17` 三段，屏幕空间）

`birdScreenPosition` 是屏幕坐标（IL 里 `bird.Position = Camera.Position + birdScreenPosition`），
再加每帧抖动（`timer = t`，位置每帧先重置，故不累积）：

```
X += sin(timer)*4
Y += sin(timer*0.1)*4 + sin(timer*0.25)*4
```

* `0 ≤ t < 0.8`：不画（原作 BirdRoutine 先 `yield 0.8`）。
* A 段 `0.8 ≤ t < 4.8`：`u = (t-0.8)/4`；`from=(200,220)`、`to=(128,66)`；
  `pos = from + (to-from)*BackOut(u)`，`BackOut = 1-(1-u)^2*(1-2.70158*u)`。
* B 段 `4.8 ≤ t < 6.8`：`u = (t-4.8)/2`；`pos = to + (64,0)*CubeInOut(u)`（`to` 不更新，终点 (192,66)）。
* C 段 `6.8 ≤ t < 10.8`：`u = (t-6.8)/4`；`to2=(192,66)`、`from3=(120,-100)`；
  `pos = to2 + (from3-to2)*BigBackIn(u)`；再 `pos.x += u*32`；
  `BigBackIn(u) = 33u^5 - 59u^4 + 32u^3 - 5u^2`。
* 动画（`flyup` 帧序列 = `flyup00, FlyUp01..15`，32×24，origin (16,24)，`drawImage(im,-16,-24)`）：
  `flyupIdle = 帧 10..15 @0.1s` 循环；`flyupRoll = 帧 0..15 @0.1s` 播一遍后转 `flyupIdle`。
  时间点：A 段起 `flyupIdle`；`t=4.8` 播 `flyupRoll`（至 6.4 转 idle）；`t=8.2` 再播 `flyupRoll`。
* `t ≥ 10.8` 后不再画（原作 `bird.RemoveSelf()`）。相位名 `phase='bird'` 时 `onPhase` 回调一次。

### D5 `js/bird-ascent.js` → Streaks（`AscendManager/Streaks`，Depth 20）

* 80 个粒子，固定种子（mulberry32，seed 常量），逐条按 ctor：
  `x = 160 + Range(24,144)*Choose(-1,1)`、`y = NextFloat()*436`、
  `speed = ClampedMap(|x-160|,0,160,0.25,1) * Range(600,2000)`、`index ∈ 0..2`、`color ∈ 0..1`。
* 更新闭式：`y(t) = y + speed*t`（`Update` 是 `Y += Speed*dt`，无需逐帧累积）。
* `Alpha = p`（D7），`a = SineInOut(Alpha)`；颜色 `White` / `#e69ecb`，`alpha = a`。
* 位置 `(mod(x,320), -128 + mod(y,436))`（屏幕坐标，不再加 camera）；`DrawCentered`：
  `w = 32*sx`, `h = 128*sy`，`sx = ClampedMap(speed,600,2000,1,0.25)*ClampedMap(speed,600,2000,1,4)`、
  `sy = ClampedMap(speed,600,2000,1,2)*ClampedMap(speed,600,2000,1,4)`。
* 左右边缘条：`Rect(-10,-10,26,200)` 与 `Rect(304,-10,26,200)`，颜色 = 白*`a`。
* 分层顺序：背景 → Madeline → 鸟 → Streaks → 白幕（Streaks Depth 20 在角色之前）。

### D6 `js/bird-ascent.js` → BlackholeBG 背景（离屏 320×180）

`Direction = -2.5`、`SnapStrength(2)` → `SM = 3` 常量（`(SM-1)/3 = 2/3`，wild 色档）；
颜色常量按 ctor：`bgColorInner=#000000`、`bgColorOuterMild=#512a8b`、`bgColorOuterWild=#bd2192`。

* `center = (160,190)`、`offset = (0,-50)`（Cutscene: `CenterOffset.Y = 100`、`OffsetOffset.Y = -50`）。
* `spinTime = (2+SM)*t = 5t`；`shake` 每 0.025s 取 `AngleToVector(hash(floor(t/0.025))*2π, 2*(SM-1)=4)`。
* 20 层 portal：`lt = (1 - spinTime%1)*0.05 + i/20`；`color = Lerp(inner, Lerp(outerMild, outerWild, 2/3), SineOut(lt))`；
  `scale = ClampedMap(lt,0,1,0.1,4)`；`rot = 2π*lt`；`pos = center + offset*lt + shake*(1-lt)`；
  以 `pos` 为中心画 240×240 portal。为省开销，加载时预烘 **16 档 tint** 变体，按颜色就近取档，
  以 `lighter` 合成叠加。
* particles：取 200 个（IL 150~220）；每个 `Normal = AngleToVector(r*2π,1)`、`Percent0 = r`、`Color ∈ 0..2`；
  `P = mod(Percent0 + t*(SM*0.25)*(Direction) , 1)`（= -1.875/s，越界 +1）；
  `V8 = CubeIn(clamp(P,0,1))`；`pos = center + Normal*ClampedMap(V8,1,0,8,220)`；
  `V10 = 1 + (1-V8)*1.5`；`color = colorsLerpTransparent[Color][int(V8*19)]`，画 `V10×V10` 方块。
* streams：取 40 个（IL 30~50），`Normal` 固定、`Speed ∈ 0.6..1.4`、`Color ∈ 0..2`；
  `P = mod(P0 + Speed*cubeTimeK*t, 1)`，`cubeTimeK = 1+(SM-1)*0.7 = 2.4`；
  `V8 = CubeIn(ClampedMap(P,0,0.8,0,1))`、`V9 = CubeIn(ClampedMap(P,0.2,1,0,1))`；
  `V12 = Normal*16 + Normal*(1-V8)*200`、`V13 = (1-V8)*8`；
  `V15 = Normal*16 + Normal*(1-V9)*280`、`V16 = (1-V9)*8`；
  四边形 `V12±perp*V13`、`V18±perp*V15` 用 `fillStyle = colorsLerpBlack[Color][int(V8*0.6*19)]` 填充。
* 整层透明度 `globalAlpha = 1 - p`（`FadeAlphaMultiplier = 1-p`）。

### D7 `js/bird-ascent.js` → 白化（Cutscene 主循环）

`p = clamp(t/12, 0, 1)`；`fadeToWhite = p`；`streaks.Alpha = p`；背景 `FadeAlphaMultiplier = 1-p`。
最后一层：整屏 `fillRect` 白，`alpha = p`（`Draw.Rect(cam.X-1, cam.Y-1, 322, 322, White*fadeToWhite)`）。

### D8 `js/bird-ascent.js` → 收场（finish / onDone）

`finish()`：置 `S.closing`，记 `closingAt`；两件同时进行（压缩自 Cutscene 尾部）：

* 相机下沉：`cameraOffset.y = -20 + 200*BigBackIn(q)`，`q` 在 0.5 名义秒内 0→1；
* 白幕推进：`p` 从当前值用 `SineInOut` 线性推到 1，时长 1.2 实秒；
* `p ≥ 1` 后 hold 0.2 实秒 → `onDone`（只调一次）。

`intro` 模式：`t ≥ handoffAfter`（默认 9.3 名义秒）引擎自动调用 `finish()`，调用方不必自己计时。
`close()`：清状态、停 raf，用于 `pageshow(persisted)`。

### D9 `js/index-bird.js` → 交接语义

* `handoffAfter: 9.3`（名义秒，= 实耗 6.2s；白幕 0.775 → 收场推满）。
* `onHandoff`/`leave()` 不变（`takeSeed()` → `writeSeed()` → `location.href = 'celeste-farewell-remembered-demo.html?ascent=1'`）。
* `onPhase` 只在 `name === 'bird'` 时 toggle `.climb`（章节字样出现在鸟飞入之后）。
* 悬停喊叫（crow00..13 @0.08s、第 9 帧 `bird_squawk`）不改。

### D10 `celeste-farewell-remembered-demo.html` → 接页

删除 `BirdAscent.open({mode:'climb'})` 与 12s 兜底；改为：

```js
if (ASCENT) {
  if (ascentCover) {
    ascentCover.classList.add('show');                    // 整屏白（#birdAscent 改白底，见 D11）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ascentCover.classList.add('done');                  // 1.4s 白→透明
      setTimeout(removeCover, 1600);
    }));
  }
}
```

`removeCover()` 保持 `BirdAscent.close()`（幂等）。L1202 的 `settleAscent` 调用删除。

### D11 `css/index-bird.css` → 覆盖层配色

`#birdAscent` 背景与 `.done` 时长改为白幕（接续白化）：`background: #fff`、`transition: opacity .38s ease`
保留（demo 页淡出用 1.4s 由 html 侧 `transition` 覆盖或直接改本条为 `.done { opacity:0; transition: opacity 1.4s ease; }`），
`#birdAscent.done { opacity: 0; }` 不变；`.ba-caption` / `.ba-skip` 颜色改深色系（白底上可读）。

### D12 版本号

`index.html`：`index-bird.css?v=20261101b`、`bird-ascent.js?v=20261101b`、`index-bird.js?v=20261101b`。
demo：`index-bird.css?v=20261101b`、`bird-ascent.js?v=20261101b`。

### D13 研究记录

`celeste-dash-反编译研究.md` 追加新章（编号顺延现有最后一章），内容：本章 IL 证据清单（成员级）、
偏差表（D2 的 TIME_SCALE、D6 的 spirals 未移植与 streams 的 Normal 不重取、D8 的收场压缩）、
素材尺寸与帧表、数值断言结果。

## 3. 明确 gap（写进文档，不伪装成已复刻）

1. `spirals`（SPIRAL_MIN/MAX 0~10、12 段弧形）未移植：视觉为细碎弧线，成本高、收益低。
2. streams 的 `Normal` 在越界时原版会重取（`AngleToVector(NextFloat()*2π,1)`），本轮用闭式 `mod` 固定 Normal，
   不重取（长时段可能出现同向条纹重复）。
3. `Level.Foreground.GetEach<Parallax>("blackhole")` 的视差前景层不移植（本项目无该素材层）。
4. `Textbox.Say("CH9_LAST_BOOST")`、音乐 `event:/new_content/music/lvl10/granny_farewell`、`ScreenWipe`、
   golden strawberry 分支不移植（本项目无对应资源/交互）。
5. 音频：仅沿用 `window.BirdMotion.Sfx`，不新增曲目。

## 4. 验证（必须全部通过才算完成）

1. `node --check blog-ui/js/bird-ascent.js`、`node --check blog-ui/js/index-bird.js`。
2. 数值断言（Node vm，无浏览器）：在 t = 0.8 / 4.8 / 6.8 / 9.3 / 10.8 断言
   ① 鸟屏幕坐标（对照手算 BackOut/CubeInOut/BigBackIn）② `p = t/12` ③ wave 三条正弦
   ④ Streaks 粒子数与 `y(t)` 闭式 ⑤ 收场 `cameraOffset.y = -20 + 200*BigBackIn(q)` 的端点值。
   位置容差 ±1 单位。
3. 浏览器（`node .screenshots/.tmp/birdascent/test.js`，静态服务 8791）：
   ① 头部图标截图：32×24 全身体可见、hover 时不被裁；
   ② 点击后 6 张关键帧截图（t≈0.5s / 2s / 4s / 6s / 收场白 / demo 首屏）；
   ③ 第二页 cover 出现→淡出→移除，`errors: none`。
4. 以上都通过后再向用户报告；**未经确认不 commit**。
