# 交接文档 · Shop 大厅按钮召唤与场景实体补全

日期：2026-11-03
状态：**已实现并通过真实浏览器验收**（T1–T5 全部完成）

## 1. 本轮需求（用户原话）

> “不用开场oshiro出现，游戏里是按按钮oshiro出现的，我也想，所以这两个按钮你也得复刻（现有代码就有，但是位置不对），场景细节不够特别逼真，在REA研究还原下（dustbunny水平移动的话，因为现在场地终于弄好了，你可以弄个循环而不是淡入淡出效果）”

拆解：
1. 页面加载不再自动播放 Oshiro 开场；由前台服务铃按钮触发。
2. 复刻两个已存在的省略号按钮到真实交互点。
3. 用 REA 补全大厅缺失实体（灯笼、蛛网、Oshiro 门）。
4. 灰尘兔水平移动改成无缝循环，取消淡入淡出。

## 2. 已改文件

| 文件 | 改动 |
| --- | --- |
| `blog-ui/shop.html` | 删除 `#introReplayBtn`；`#sceneZoom` 内新增 2 个 `.resort-lantern`；更新两个 `.dot-bubble` 的 aria/title；版本号 bump |
| `blog-ui/css/shop.css` | 删除重播按钮样式；新增 `.resort-lantern` / `.lantern-holder` / `.lantern-body` / `.lantern-glow` / `@keyframes lanternFlicker` |
| `blog-ui/js/shop.js` | 新增 `HALL_ENTITIES`、`hallDrawEntities()`、`webCurvePoint()`、`webDrawCurve()`、`layoutLanterns()`、`startLanternAnim()`；`DOTS_CFG` 锚点归位；`summonOshiro()` 改为首次触发 intro；`startShopScene()` 不再自动播放；删除 `sessionStorage` / `?intro=1` / 重播监听 |
| `blog-ui/js/celeste-dust-bunny.js` | `rowTraj()` 改为正弦往返循环，`alpha` 恒 1，眼睛朝向随 `cos` 翻转 |
| `.trae/specs/shop-oshiro-summon-hall-detail/spec.md`、`tasks.md` | 规格与任务清单（已全部勾选） |

缓存版本（`shop.html`）：
- `css/shop.css?v=20261103c`
- `js/celeste-dust-bunny.js?v=20261103b`
- `js/shop.js?v=20261103d`

## 3. 关键实现细节

### 3.1 按钮

- `DOTS_CFG.dotMid.anchor = {x:170,y:132}`：前台桌面服务铃上方（desk `x164..196`、`y136..152`）。
- `DOTS_CFG.dotRight.anchor = {x:244,y:132}`：留言簿 `guestbook` 上方（中心 `244,144`）。
- `dotMid` 点击：
  - `!osSummoned` → `playOshiroIntro()`（完整 CS03 演出）。
  - 已召唤 → 侧身 + 问候对白。
- `dotRight` → `playOpeningMemo()`（5s 自动消失）。
- 演出期间 `body.intro` 通过 CSS 隐藏两个按钮。

### 3.2 灯笼（DOM）

- 实体：`(128,48)`、`(192,48)`；容器左上角 `(x-8, y-24)`，原生 `16×24`。
- 三层：`.lantern-glow`（径向渐变 + `lanternFlicker`）、`.lantern-holder`、`.lantern-body`。
- 帧循环 `[0,1,2,1,0]`，300ms/帧（REA：`Sprite.AddLoop("light","lantern",0.3,5 frames)`）。
- 光晕闪烁对应 `ResortLantern.Update` 的 `Alpha=0.95+Sin(t)*0.05`；未做持续摆动（原作 `Wiggler` 仅 `OnPlayer` 触发）。

### 3.3 蛛网（过程化线网，不是贴图）

REA `Celeste.Cobweb`：
- `anchorA` = 实体位置，`node[0]` = `anchorB`，全部 node 同时作为 offshoot。
- 二次贝塞尔：中点 `+8+sin(wave)*4`；主线 12 段、分支 4 段；中段 `color`、首尾 `edge`。
- BinaryPacker 实测节点：
  - `(120,32)` → `(200,16)`，分支 `(200,32)`、`(160,8)`
  - `(80,80)` → `(112,32)`，分支 `(112,32)`、`(112,48)`、`(80,64)`、`(80,40)`
- 当前 `wave=0` 静态绘制；如需动态摆动，把 `hallDrawEntities` 的 `wave` 接 `performance.now()` 并每帧重绘即可（原作仅为 ±4px）。

### 3.4 Oshiro 门

- `door04.png`（32×24，可见内容 `x10..17`）底边中心 `(272,152)` → 左上 `(256,128)`。

### 3.5 灰尘兔

- `rowTraj` 以 `mid=(a+b)/2`、`half=span/2` 做正弦往返；速度中心 ≈ 26px/s（原作常量 `SPEED=26`）。
- `alpha=1` 始终；`target.x` 随 `cos(ang)` 符号翻转；保留 `sink` 与 `BOB`。
- `dir` 参数保留但忽略。

## 4. 验收结果（CDP 真实时间，1280×720）

脚本：`C:\Users\28464\AppData\Local\Temp\rea\verify_round3.py`
截图目录：`C:\Users\28464\AppData\Local\Temp\rea\prof_round3\`

- 初始：`intro=false`、`#pixelOshiro display:none`、`osSummoned=false`。
- 点击 `dotMid`：`body.intro=true`、聚光 `opacity:1`、`sceneZoom scale(2)`、appear 帧 `oshiro8`。
- 演出结束：对白“欢迎光临！有什么能为您效劳的吗？”，对白期间保持 2×；关闭对话框后 `scale(1)`、按钮恢复。
- 二次点击 `dotMid`：只出现问候“我就在这里呀～需要帮忙的话，随时招呼一声。”，不重播。
- 点击 `dotRight`：`shopMemo.show=true`。
- 灯笼：`left/top` 正确，两盏贴顶；蛛网线网与门截图确认自然。
- 灰尘兔 12s 采样：`alphaBad=0`、`x∈[40,280]`、方向翻转 1 次、`finalAlpha=1`。
- 控制台唯一错误：既有 `Atlases/Gameplay/characters/player/duck00.png` 404（与本轮无关）。

## 5. 复验方法

1. 本地服务：`http://localhost:8123/shop.html`（服务根目录为 `blog-ui`，后台可能仍在运行）。
2. 语法检查：
   ```powershell
   node --check blog-ui/js/shop.js
   node --check blog-ui/js/celeste-dust-bunny.js
   ```
3. 真实浏览器：
   ```powershell
   python C:\Users\28464\AppData\Local\Temp\rea\verify_round3.py
   ```
   注意用真实时间（不要用 `--virtual-time-budget`，rAF 时间线会失真）。

## 6. 已知遗留 / 非目标

- `dotMid` 的 hover 挂牌（`Atlases/Gui/hover/resort.png`）沿用旧尺寸 `96*DOT_ZOOM`，视觉上较大，但位置已对准服务铃；未改尺寸。
- 灰尘兔会遮挡右侧 Oshiro 门（装饰性，且原本就在该区域活动），未调整。
- 未给灯笼新增碰撞摆动/音效（原作 `Wiggler` 仅 `OnPlayer`）。
- 未改商店交易、聊天、水晶之心、备忘录、音频、后端。
- 工作区存在多处**与本轮无关**的已修改文件（如 `blog-api/*`、`diary.*`、`article.*`、`celeste-character.js` 等）；不要整套 `git add -A`。
- 本轮改动**尚未提交 git**，提交时只应包含：
  - `blog-ui/shop.html`
  - `blog-ui/css/shop.css`
  - `blog-ui/js/shop.js`
  - `blog-ui/js/celeste-dust-bunny.js`
  - `.trae/specs/shop-oshiro-summon-hall-detail/`

## 7. 可选后续

- 蛛网加入真实 `waveTimer` 摆动（±4px）。
- 灯笼点击/碰撞时触发 `Wiggler` 摆动（`Rotation = value*mult*30°`）。
- 若希望“工人按钮”语义更明确，可再复刻原作服务铃的 `PLEASE RING FOR SERVICE` 小挂牌尺寸。
