# Shop 大厅：按钮召唤 Oshiro + 场景实体补全 + 灰尘兔水平循环

## 1. 目标

修正 `shop.html` 第三章 `lvl_0x-a` 大厅复刻中与原作不一致的三处：

1. **取消加载自动开场**：页面初始大厅没有 Oshiro；点击前台服务铃按钮后才播放 `CS03_OshiroLobby` 登场演出。
2. **按钮归位并复用**：`#dotMid` 移到桌面服务铃上方，`#dotRight` 移到留言簿上方；删除多余的重播按钮。
3. **补全房间实体细节**：绘制 2 盏 `resortLantern`、2 个 `cobweb`、`oshirodoor`，灯笼带原作灯光闪烁。
4. **灰尘兔水平循环**：`rowTraj` 改为正弦往返、`alpha` 恒 1，不再两端淡入淡出。

## 2. REA 证据（已从 Celeste.dll 取证）

- 地图 `lvl_0x-a` 实体：
  - `npc oshiro_03_lobby` `(184,152)`
  - `resortLantern` `(128,48)`、`(192,48)`
  - `cobweb` `(120,32)`、`(80,80)`
  - `oshirowdoor` `(272,120)`（`door04` 视觉底边贴地板 `y=152`）
- `Celeste.ResortLantern` IL：
  - `holder` 为 `Image` + `CenterOrigin`；`lantern` 为 `Sprite.AddLoop("light", "lantern", 0.3, 5 frames)`，`Origin=(7,7)`、`Position=(-1,-5)`。
  - `VertexLight(Color.White, 0.95, 32, 64)`、`BloomPoint(0.8, 8)`。
  - `Update`：`Alpha = 0.95 + Sin(alphaTimer) * 0.05`。
  - 摆动 `Wiggler(2.5, 1.2)` 只在 `OnPlayer` 碰撞时 `Start`，`Rotation = value * mult * 30°`；常驻状态不摆动。
- 素材：`resortLantern/holder.png`、`lantern00..02.png` 均 16×24；`door/door04.png` 32×24。
- `Celeste.Cobweb` IL：`DrawCobweb` 用 `SimpleCurve(anchorA, 中点+8+sin*4, anchorB)` 画 12 段主线，offshoot 画 4 段；`edge = Lerp(color, #0f0e17, 0.2)`。节点从 BinaryPacker 原始 `node` 子元素取得。

## 3. 设计决策

### 3.1 灯笼（DOM + 灯光闪烁）

- 在 `#sceneZoom` 内新增 2 个 `.resort-lantern` 容器，每个包含 `.lantern-glow`、`.lantern-holder`、`.lantern-body` 三张图层。
- 原生定位：以 `(x,y)` 为灯笼底边中心，容器左上角 `(x-8, y-24)`，尺寸 `16×24` 原生像素；屏幕坐标经 `nXY()` 换算。此摆放已由上一轮 PIL 合成预览确认贴顶自然。
- 帧循环：`LANTERN_FRAMES = [0,1,2,1,0]`，每帧 `300ms`（对应 `AddLoop` 的 5 帧、`0.3s`），两个灯笼共用一个定时器。
- 光晕：`.lantern-glow` 径向渐变，CSS `lanternFlicker` 动画复刻 `Alpha = 0.95 ± 0.05` 的慢闪；不做持续摆动（IL 中 `Wiggler` 仅碰撞触发）。

### 3.2 蛛网与 Oshiro 门

- 蛛网按 `Celeste.Cobweb` IL 还原为**过程化线网**，不使用 `cobwebs16_*` 贴图：
  - `anchorA` = 实体位置；`node[0]` = `anchorB`；全部 node 同时作为 `offshoot`。
  - 主曲线为二次贝塞尔，中点向下垂 `8 + sin(wave)*4`；主线 12 段，分支 4 段；`color`（中段）/`edge`（首尾）双色。
  - BinaryPacker 实测节点：
    - `(120,32)` → anchorB `(200,16)`，offshoot `(200,32)`、`(160,8)`
    - `(80,80)` → anchorB `(112,32)`，offshoot `(112,32)`、`(112,48)`、`(80,64)`、`(80,40)`
- `door04.png` 底边中心锚点 `(272,152)` → 左上 `(256,128)`。
- 绘制顺序：`fgdecals` 之后、实体层之前，保证盖住墙纸/木饰面。

### 3.3 按钮

- `#dotMid` → `anchor {x:170,y:132}`（桌面 `x164..196`、`y136..152` 的服务铃上方）。
- `#dotRight` → `anchor {x:244,y:132}`（`guestbook` 中心 `244,144`、顶边 `136`）。
- `#dotMid`：未召唤时 `playOshiroIntro()`；已召唤时保留现有侧身问候对白。
- `#dotRight`：保持打开开场备忘录 `playOpeningMemo()`。
- 删除 `#introReplayBtn` 的 HTML、CSS、JS 监听。

### 3.4 开场触发

- `startShopScene()` 只做 `layoutHall()`；`#pixelOshiro` 初始 `display:none`，`osAtDesk=false`、`osSummoned=false`。
- 删除 `sessionStorage`、`?intro=1` 自动播放逻辑。
- 演出时序、`body.intro` 隐藏按钮、`holdZoomUntilDialogClosed()`、跳过逻辑均保持不变。

### 3.5 灰尘兔循环

- `rowTraj` 改为以 `mid=(a+b)/2` 为中心、`half=span/2` 的正弦往返；`alpha` 恒 `1`；`target.x` 随 `cos(angle)` 符号翻转；保留 `sink` 与 `BOB`。
- 不穿墙、无瞬移、无淡入淡出；`dir` 参数保留但忽略。

## 4. 精确文件改动

### `blog-ui/shop.html`

1. 删除 `<button id="introReplayBtn">…</button>`。
2. 更新两个 `.dot-bubble` 的注释、`aria-label`、`title`：
   - `dotMid`：召唤 Oshiro（服务铃）
   - `dotRight`：打开留言簿（备忘录）
3. `#sceneZoom` 内、`#introFx` 之后加入两个灯笼容器（结构见 §3.1）。
4. 末尾脚本版本：
   - `css/shop.css?v=20261103c`
   - `js/celeste-dust-bunny.js?v=20261103b`
   - `js/shop.js?v=20261103d`

### `blog-ui/css/shop.css`

1. 删除 `#introReplayBtn` 规则及 `body.intro #introReplayBtn` 选择器。
2. 新增：
   - `.resort-lantern { position:absolute; z-index:6; pointer-events:none; }`
   - `.lantern-holder, .lantern-body { position:absolute; left:0; top:0; width:100%; height:100%; image-rendering:pixelated; }`
   - `.lantern-glow { position:absolute; left:50%; top:58%; width:300%; height:250%; transform:translate(-50%,-50%); background:radial-gradient(...); animation:lanternFlicker 1.6s ease-in-out infinite; }`
   - `@keyframes lanternFlicker { 0%,100%{opacity:.82} 50%{opacity:1} }`
3. 保留 `body.intro .dot-bubble { opacity:0; pointer-events:none; }`。

### `blog-ui/js/shop.js`

1. 新增 `HALL_ENTITIES`：
   ```js
   var HALL_ENTITIES = {
       lanterns: [{ x: 128, y: 48 }, { x: 192, y: 48 }],
       cobwebs: [
           { a: {x:120,y:32}, b: {x:200,y:16}, off: [{x:200,y:32},{x:160,y:8}] },
           { a: {x:80,y:80},  b: {x:112,y:32}, off: [{x:112,y:32},{x:112,y:48},{x:80,y:64},{x:80,y:40}] }
       ],
       door: { x: 272, y: 152 }
   };
   ```
2. `loadHallAssets()` 统一 key；新增 `objects/door/door04.png`（蛛网为线网，不加载贴图）。
3. 新增 `hallDrawEntities(ctx)`，在 `composeHall()` 的 `hallDrawDecals(ctx,'fgdecals')` 之后调用：
   - `webDrawCurve()`：复刻 `Cobweb.DrawCobweb` 的贝塞尔主线/分支与双色线段。
   - door：`drawImage(img, x-16, y-24)`。
4. 新增灯笼布局与帧动画：
   - `layoutLanterns()`：遍历 `.resort-lantern`，使用 `nXY(ent.x-8, ent.y-24)` 设置 `left/top/width/height`。
   - `startLanternAnim()`：`setInterval` 300ms，按 `[0,1,2,1,0]` 切换 `.lantern-body` 的 `src`。
   - `layoutHall()` 末尾调用 `layoutLanterns()`；`resize` 处理器同步。
5. `DOTS_CFG` 锚点改为 `{x:170,y:132}` / `{x:244,y:132}`。
6. `summonOshiro()`：
   ```js
   if (introActive) return;
   if (!osSummoned) { playOshiroIntro(); return; }
   osSetSrc(OS_SRC.side);
   showOshiroDialog('我就在这里呀～需要帮忙的话，随时招呼一声。', '可爱');
   ```
7. 删除 `var introReplayBtn` 与点击监听；`startShopScene()` 改为：
   ```js
   function startShopScene() {
       layoutHall();
       pixelOshiro.style.display = 'none';
       osAtDesk = false;
       osSummoned = false;
       osSetSrc(OS_SRC.idle);
   }
   ```
8. 首次点击 `dotMid` 期间 `body.intro` 隐藏两个按钮；演出结束/跳过后恢复。

### `blog-ui/js/celeste-dust-bunny.js`

替换 `rowTraj(o)`：

```js
function rowTraj(o) {
    var span = o.b - o.a;
    var mid = (o.a + o.b) / 2;
    var half = Math.max(10, span / 2);
    var w = SPEED / half;
    var base = (o.u0 == null ? 0 : o.u0) / Math.max(1, span) * Math.PI * 2;
    var phase = base + (o.i || 0) * (SPACING / half);
    var t = {
        fam: 'row', clock: 0, sink: SINK_DIST, x: o.a, y: o.lane, alpha: 1,
        span: span, cycleLen: span,
        target: { x: 1, y: 0 }
    };
    t.step = function (dt) {
        t.clock += dt;
        t.sink = approach(t.sink, 0, dt * SINK_RATE);
        var ang = t.clock * w + phase;
        t.x = mid + half * Math.sin(ang);
        t.y = o.lane + Math.sin(t.clock * BOB_FREQ + o.phase) * BOB_AMP - t.sink;
        t.target.x = Math.cos(ang) >= 0 ? 1 : -1;
        t.target.y = 0;
        t.alpha = 1;
    };
    t.step(0);
    return t;
}
```

## 5. 验收

1. `node --check blog-ui/js/shop.js`、`node --check blog-ui/js/celeste-dust-bunny.js` 通过。
2. 真实浏览器（`http://localhost:8123/shop.html`，CDP 实时）：
   - 初始：`#pixelOshiro` 不可见、`body` 无 `intro`、两个按钮可见。
   - 点击 `#dotMid`：进入 intro，聚光/震动/2× 推进/appear/火花/对白依次出现；`#introSkip` 可跳过。
   - 对白关闭后镜头回到 cover；Oshiro 留在前台，按钮恢复。
   - 再次点击 `#dotMid`：只出现问候对白，不重播演出。
   - 点击 `#dotRight`：备忘录出现，5s 后自动消失。
   - 截图确认：2 盏灯笼贴顶、2 个蛛网、Oshiro 门贴地板；按钮位于服务铃/留言簿上方且不遮挡台面。
3. 灰尘兔：连续采样 6s，`alpha` 始终为 1，`x` 在 `[a,b]` 内正弦往返，方向随 `cos` 翻转。
4. 控制台除既有 `duck00.png` 404 外无新错误。

## 6. 非目标

- 不给灯笼新增碰撞摇摆/音效（`Wiggler` 仅原作 `OnPlayer` 触发，商店页无对应交互）。
- 不改商店交易、聊天、水晶之心、备忘录、音频逻辑。
- 不改后端。
