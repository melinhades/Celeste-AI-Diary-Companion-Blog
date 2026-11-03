# Tasks

## T1 取消自动开场并改为按钮触发
- [x] `shop.js`：删除 `introReplayBtn` 变量与监听。
- [x] `shop.js`：`startShopScene()` 只做布局，隐藏 Oshiro，重置 `osAtDesk/osSummoned`。
- [x] `shop.js`：删除 `sessionStorage` / `?intro=1` 自动播放。
- [x] `shop.js`：`summonOshiro()` 未召唤时调用 `playOshiroIntro()`；已召唤时仅问候。

## T2 按钮归位
- [x] `shop.js`：`DOTS_CFG.dotMid.anchor = {x:170,y:132}`。
- [x] `shop.js`：`DOTS_CFG.dotRight.anchor = {x:244,y:132}`。
- [x] `shop.html`：删除 `#introReplayBtn`，更新两个按钮注释/aria/title。

## T3 场景实体补全
- [x] `shop.js`：新增 `HALL_ENTITIES`（含 BinaryPacker node）。
- [x] `shop.js`：`loadHallAssets()` 统一 key，加载 `door04.png`、灯笼素材。
- [x] `shop.js`：`composeHall()` 末尾绘制 2 个 Celeste.Cobweb 线网与 `door04`。
- [x] `shop.js`：新增 `layoutLanterns()` + 300ms 5 帧灯笼动画。
- [x] `shop.html`：新增两个 `.resort-lantern` DOM。
- [x] `shop.css`：删除重播样式，新增灯笼/光晕/flicker 动画。

## T4 灰尘兔水平循环
- [x] `celeste-dust-bunny.js`：替换 `rowTraj` 为正弦往返，`alpha=1`，方向随 `cos` 翻转。

## T5 验收与版本
- [x] `node --check` 两个 JS。
- [x] CDP 真实浏览器验证：初始无 Oshiro、按钮触发演出、跳过、对白后回镜头、二次点击问候、备忘录、按钮/灯笼/蛛网/门位置。
- [x] 灰尘兔 12s 采样：`alphaBad=0`、`x` 在 `[a,b]` 内、方向翻转。
- [x] bump `shop.css` / `shop.js` / `celeste-dust-bunny.js` 的 `?v=`。
