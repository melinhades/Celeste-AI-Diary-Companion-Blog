# Checklist：DreamBlock / DreamDash 的 REA 深度复刻

* [x] `dreamDashCheck` 按 IL ④ 实现轴平移：`axis=(|dir.Y|,|dir.X|)`、`flag/flag2` 由 `Speed` 决定、`i=-1..-4` / `j=1..4`、命中后 `Position += axis*k` 并置 `dreamBlock`，全失败返回 false

* [x] `dreamDashCheck` 的重叠判定使用「不含目标 DreamBlock 的实心」(`solidAt`)，并附推导注释与文档记录

* [x] `dreamDashUpdate` 的 `dreamDashCanEndTimer` 仅在 `>0` 时递减

* [x] `dreamDashUpdate` 的 `DreamDashedIntoSolid` 采用 IL 的四层顺序（`i=1..5 step2` → `j=-1,1` → `k=1..5 step2` → `l=-1,1`，偏移 `(i*j,k*l)`）

* [x] 25 点全实心 → 死亡回调；出块且 `timer<=0` → `Freeze(.05)` → 出口跳 / `MoveHExact(∓5)` / `GrabCheck`

* [x] `DashDir.Y < 0 && DashDir.X != 0` 时直接收尾，不走贴墙修正与抓墙判定

* [x] `MoveHExact(∓5)` 为逐像素平移、撞到实心即停（不瞬移、不改 Speed）

* [x] 三处 `DreamDashCheck` 均在角修正之后：水平（DashCorrectCheck 后）、向上（UpwardCornerCorrection + varJumpTimer 清零后）、向下（落地/角修正/着地效果之后）

* [x] 退出 9 的那一帧不再跑 `postPhysics`（`startedDreamDash`），避免同帧两步

* [x] `updateSpriteAnim`：State 9 → `dreamDashIn`/`dreamDashLoop`；离开 9 首帧 → `dreamDashOut`；`dreamDashOut` 播放期间不覆盖

* [x] `updateDashTrail`：State 9 且 `dreamBlock` 为空时不推进 0.1s 计时、不生成残影

* [x] `jump(fromDreamBlock)` 新增形参：出口跳 `jump(true)` 触发 `onDreamJump`，普通跳跃不触发

* [x] `dreamWobbleLine`：`whiteFill>0` 时背景色与主线色都向白 `Lerp`

* [x] `drawDreamBlocks`：底色 / 粒子 / whiteFill / 四条 wobble / 四角坐标统一加 `shakeX/shakeY`（本类型恒 0，注释说明依据）

* [x] `spawnDust` 支持传入角度时按 `angle ± 0.4` 锥形爆散（`Dust.Burst` 语义）

* [x] `onDreamDashExit` 使用玩家坐标 + `atan2(vy,vx)`、16 粒（非方块中心）；`onDreamJump` 4 粒 `-π/2`

* [x] `internet_cafe.html` 缓存版本已 bump（`celeste-character.js?v=10`、`internet_cafe-1.js?v=20261028g`）

* [x] `node --check` 两个 JS 文件通过

* [x] `%TEMP%\dream_test.js` 41/41 全绿（含轴平移、25 点顺序、残影门控、出口跳回调、dreamDashOut）

* [x] 研究文档第 21 章：G12/G13 标记「已按 IL 补齐」；新增 21.6 证据表；G14–G20 缺口/近似/不适用逐条保留

## Round 5（手感 / 操作逻辑 / 交互效果）

* [x] `dreamDashCheck` 门禁改为 IL 的 OR 语义：`dir.X==Sign(DashDir.X) || dir.Y==Sign(DashDir.Y)`，斜向 dash 可进块

* [x] `update()` 着地时 `state !== StClimb` → `autoJump = false`（IL L13043–13053）

* [x] `beginDreamDash` 不再清零 `dashAttackTimer`（IL 未碰该字段），出块后保留 DashAttacking 窗口

* [x] 场景新增涟漪近似：块内每 0.04s `(0.3, 40)`、落地 DreamBlock 顶面 `(0.5, 40)`，0.25s 扩张淡出

* [x] `%TEMP%\dream_test.js` 新增斜向门禁 3 条、AutoJump 2 条、DashAttackTimer/连续梦冲 2 条断言并全绿（50/50）

* [x] `internet_cafe.html` bump（`celeste-character.js?v=11`、`internet_cafe-1.js?v=20261028h`）

* [x] `node --check` 两文件通过

* [x] 研究文档 21.7 与 G21/G22 已登记

