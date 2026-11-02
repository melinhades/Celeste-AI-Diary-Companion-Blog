# Tasks：REA 复刻 CS10_FinalLaunch 过场 + 修复鸟容器裁剪

依赖：`spec.md` 获批后按序执行。
验证命令：`node --check blog-ui/js/bird-ascent.js`、`node --check blog-ui/js/index-bird.js`、
`node .screenshots/.tmp/birdascent/assert.js`、`node .screenshots/.tmp/birdascent/test.js`。

## T1 头部鸟容器裁剪（D1）
- [x] 文件：`blog-ui/css/index-bird.css`。
- [x] 动作：追加 `.chat-crow .chat-crow-box{width:auto;height:auto;overflow:visible;align-items:center;justify-content:center}`
  与 `.chat-crow .chat-crow-box img{width:32px;height:24px;margin:0}`；hover/animation 规则不动。
- [x] 完成标志：截图里 32×24 鸟全身体可见，`birdCall` 的 `translateY(-6px) scale(1.16)` 无裁切。

## T2 过场骨架：视口 / 时间线 / 相机（D2 D3 D7）
- [x] 文件：`blog-ui/js/bird-ascent.js`（整体重写，保留导出 API）。
- [x] 动作：320×180 cover 变换；`TIME_SCALE=1.5`；`t` 驱动一切；`mad.y=-240*t`、`cameraOffset(0,-20)`、
  `wave(timer=2t)`、`p=t/12`、白幕整屏 fillRect；`celeste-gui/madeline-move.gif` 脚底线对齐。
- [x] 完成标志：断言 ②③ 通过；t=0 时无夜天/行星等旧元素，只有黑洞背景 + Madeline + 白幕。

## T3 鸟三段飞行（D4）
- [x] 文件同上。
- [x] 动作：A/B/C 三段按 IL 的 from/to/ease/`u*32` + 正弦抖动；动画 `flyupIdle`/`flyupRoll` 切换时间点
  (4.8 / 8.2) 与 `flyup00,FlyUp01..15` 帧序；origin (16,24)。
- [x] 完成标志：断言 ① 五时刻坐标在 ±1 内；t≥10.8 鸟消失。

## T4 Streaks（D5）
- [x] 文件同上。
- [x] 动作：80 粒子固定种子初始化；`y(t)=y0+speed*t`；ClampedMap 三段缩放；白/`#e69ecb`；左右 26×200 边缘条。
- [x] 完成标志：断言 ④ 通过（数量 80、`y(t)` 与闭式一致）。

## T5 BlackholeBG 背景（D6）
- [x] 文件同上。
- [x] 动作：离屏 320×180；`SM=3`、`center(160,190)`、`offset(0,-50)`、`spinTime=5t`；
  20 层 portal（t/scale/rot/pos + 16 档预烘 tint + `lighter`）；200 particles；40 streams 四边形；
  整层 `globalAlpha=1-p`。
- [x] 完成标志：截图里能看出紫色 portal 涡流由中心向外扩散，且随 p 淡出。

## T6 收场与交接（D8 D9）
- [x] 文件：`blog-ui/js/bird-ascent.js`、`blog-ui/js/index-bird.js`。
- [x] 动作：`finish()` 做相机下沉 0.5 名义秒 + 白幕 1.2 实秒推满 + 0.2s hold → `onDone`；
  `handoffAfter=9.3`；`onPhase` 仅 `'bird'` 时 `.climb`。
- [x] 完成标志：白幕到 1 后才跳页，`onDone` 只触发一次。

## T7 接页与配色（D10 D11）
- [x] 文件：`blog-ui/celeste-farewell-remembered-demo.html`、`blog-ui/css/index-bird.css`。
- [x] 动作：demo 侧删除 `BirdAscent.open(mode:'climb')` 与 12s 兜底、删除 L1202 的 `settleAscent` 调用；
  改为 `show` → 双 raf → `done`(1.4s) → 1.6s 后 `removeCover()`。`#birdAscent` 改白底、caption/skip 改深色。
- [x] 完成标志：进 demo 是白屏 → 1.4s 淡出到场景，无闪烁、无空白等待。

## T8 缓存版本号（D12）
- [x] 文件：`blog-ui/index.html`、`blog-ui/celeste-farewell-remembered-demo.html`。
- [x] 动作：`index-bird.css` / `bird-ascent.js` / `index-bird.js` 全部 `?v=20261101b`。
- [x] 完成标志：DevTools 里拉到的都是新文件。

## T9 断言脚本（spec 第 4 节）
- [x] 文件：`.screenshots/.tmp/birdascent/assert.js`（仓库外临时目录）。
- [x] 动作：Node vm 载入 `bird-ascent.js`（mock canvas/Image/sessionStorage），按 5 个时刻断言 ①~⑤；
  输出 `passed/total`，失败退出码非 0。
- [x] 完成标志：全绿。

## T10 浏览器验收（spec 第 4 节）
- [x] 文件：`.screenshots/.tmp/birdascent/test.js`。
- [x] 动作：跑静态服务 8791；头部图标 + hover 截图；点击后 6 张关键帧；第二页 cover 生命周期；console errors。
- [x] 完成标志：截图确认动作/配色/白化与 IL 一致，`errors: none`。

## T11 研究记录（D13）
- [x] 文件：`celeste-dash-反编译研究.md`（追加新章）。
- [x] 动作：成员级证据清单 + 偏差表（TIME_SCALE、spirals 缺、streams 不重取、收场压缩）+ gap 清单 + 断言结果。
- [x] 完成标志：每条常量都能指到 assembly 成员。

## T12 汇报
- [ ] 向用户报告改动与验证结果；**等用户确认后才 commit**。

## T13 SummitLaunch 姿态 + SpeedRing + 相机抖动（第六轮）
- [x] 文件：`blog-ui/js/bird-ascent.js`。
- [x] 动作：删 `MOVE_GIF`/`IM.move`，改载 `characters/player/launch00..07.png`（32×32，Origin 16,32，
  `Sprites.xml <Loop id="launch" delay="0.06" frames="0-7"/>`）；`launchFrameIndex(t)=floor(t/0.06)%8`。
- [x] 动作：`drawRings(t,px,py)` —— 每 0.2s 一枚、寿命 1/3s、半径 4→14、沿 normal 压到 0.5、
  `color*Lerp(0.6,0,lerp)`、`Position += normal*10*dt` 的向下漂移。
- [x] 动作：`launchFlash(t)=0.5*max(0,1-t/0.45)`、`launchShake(t)`（`DirectionalShake(-UnitY,0.6)`）。
- [x] 动作：`drawBG` 吃 `camX/camY`（`cx=160-camX`、`cy=190-camY`），与 Madeline 同一组相机位移；
  鸟 / Streaks 仍按 IL 的「Camera.Position + 屏幕坐标」保持屏幕不动 —— 这样抖动才是整台相机抖，
  不再是 Madeline 一个人上下摆（用户眼中的「先跃起再落地」）。
- [x] 完成标志：`assert.js` 22/22；`probe5.js` 四个取样点无 console error、截图可见翻滚帧 + SpeedRing；
  `probe6.js` 交接白幕 → demo `__scene` 正常；`?v=20261101e` 已 bump。

## T14 过场转废案 + 鸟按钮改造（2026-11-01）
- [x] 废案：`blog-ui/js/bird-ascent.js` + 原 `css/index-bird.css` 移入 `blog-ui/attic/cs10-launch-transition/`
  （`bird-ascent.js`、`index-bird.ascent.css`），不再被任何页面引用；index / demo 的 `#birdAscent`
  覆盖层与 `?ascent=1` 白幕逻辑一并删除。
- [x] 落点：`index.html` 的 `.nav` 末尾新增 `#navBirdSlot`，`js/index-bird.js` 把 auth.js 注入的
  `.chat-crow` 搬进去（MutationObserver 兜登录/登出重渲染），与 Home/Archives/Diary/Shop/🪑 同一水平线。
- [x] 尺寸：img 40×30 → 52×39（+30%），`common.css` 的 19×18 裁切继续由 `css/index-bird.css` 覆盖。
- [x] 点击链路：croak 悬停 → `fly00..03` 振翅帧 + `.flying-out`（CSS crowFlyOut .95s，向右上方飞离）
  → `js/page-loading.js` 的 `PageLoading.show()` 铺统一加载层（夜空/雪/十帧跑动 Madeline/LOADING…）
  → 1.1s 后进 `celeste-farewell-remembered-demo.html`（不带 `?ascent=1`）；demo 侧首帧后 `PageLoading.ready()` 淡出。
- [x] 版本：`index-bird.css?v=20261101f`、`index-bird.js?v=20261101e`、`page-loading.js?v=20261101a`。
- [x] 验收：`.screenshots/.tmp/birdnav/probe.js` —— 鸟在 `#navBirdSlot`、img 52×39、中心线 50px 与其它
  nav 一致；悬停 260ms 已到 crow03；点击后 `.flying-out` + fly 帧；加载层 display:flex；跳转后路径无
  `?ascent=1`；demo 首帧后加载层移除；console 异常 0。
