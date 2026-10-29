# Tasks：DreamBlock / DreamDash 的 REA 深度复刻

依赖：`spec.md` 获批后按序执行。
验证命令：`node --check blog-ui/js/celeste-character.js`、`node --check blog-ui/js/internet_cafe-1.js`、
`node %TEMP%\dream_test.js`。

## T1 引擎：DreamDashCheck 轴平移修正（D1）
- [x] 文件：`blog-ui/js/celeste-character.js` → `dreamDashCheck`（约 L525）。
- [x] 动作：按 spec D1 完整实现 `|dir.Y|/|dir.X|` 轴交换 + `-1..-4` / `1..4` 平移；
  `bodySolidAt` 以 `dir + axis*k` 为偏移；命中写 `dreamBlock` 返回 true，否则 false。
- [x] 完成标志：重叠 Solid 场景下玩家被平移出实心并仍进入 state 9。

## T2 引擎：dreamDashUpdate 精确化（D2）
- [x] 文件同上 → `dreamDashUpdate`（约 L575）。
- [x] 动作：timer 仅在 `>0` 递减；`DreamDashedIntoSolid` 改为四层 ±1/3/5 顺序搜索；
  卡死分支保持 `setState(ST_NORMAL)` + `onDreamDashDeath`；`blk` 分支保留 trail 触发条件。
- [x] 完成标志：25 点顺序断言通过。

## T3 引擎：三处 DreamDashCheck 后置（D3）
- [x] 文件同上 → `postPhysics`（约 L1385–1556）。
- [x] 动作：水平方向先记录 `collidedH`，角修正后再判；天花板移入天花板块末尾（角修正 + varJump 清 0 之后）；
  地面删除落地前检测，改为地面碰撞整段结束后用 `groundHit` 判。
- [x] 完成标志：擦边沿不进 9、正撞进 9 的断言通过。

## T4 引擎：dreamDashOut 动画（D4）
- [x] 文件同上 → `updateSpriteAnim`（约 L1624–1650）。
- [x] 动作：State 9 分支后插入 `S.last` 以 `dreamDash` 开头且 ≠ `dreamDashOut` → `play('dreamDashOut')`；
  `current==='dreamDashOut'` 时本帧不覆盖。
- [x] 完成标志：离开 9 首帧 `last==='dreamDashOut'`，动画结束后恢复普通分支。

## T5 引擎：残影门控（D5）
- [x] 文件同上 → `updateDashTrail`（约 L1595–1601）。
- [x] 动作：State 9 分支先 `if (!this.dreamBlock) return;` 再做 0.1s 节流。
- [x] 完成标志：块外梦境冲刺帧不新增残影。

## T6 引擎：出口跳尘土回调（D8 引擎侧）
- [x] 文件同上 → `jump()` 及 `dreamDashUpdate` 出口跳调用点。
- [x] 动作：`jump(fromDreamBlock)` 增加形参；出口跳传 `true`；函数末尾触发 `onDreamJump`。
- [x] 完成标志：出口跳时回调被调用一次，普通跳跃不调用。

## T7 场景：WobbleLine whiteFill 与 shake（D6 / D7）
- [x] 文件：`blog-ui/js/internet_cafe-1.js` → `dreamWobbleLine`、`drawDreamBlocks`。
- [x] 动作：`whiteFill>0` 时两色向白 lerp；所有绘制坐标加 `b.shakeX/b.shakeY`（默认 0）并注释恒 0 依据。
- [x] 完成标志：`whiteFill` 改动时线条颜色向白过渡；默认场景渲染与现状一致。

## T8 场景：尘土方向与出口/出口跳接线（D8 场景侧）
- [x] 文件同上 → `spawnDust`、L1574 附近的回调接线。
- [x] 动作：`spawnDust(x, y, count, angle?)` 支持锥形；`onDreamDashExit` 用玩家坐标 + `atan2(vy,vx)`；
  新增 `onDreamJump` 播 4 粒 `-π/2` 尘土。
- [x] 完成标志：退出 DreamDash 时尘土从玩家位置沿速度方向散开。

## T9 测试与缓存（D9）
- [x] 文件：`%TEMP%\dream_test.js`、`blog-ui/internet_cafe.html`。
- [x] 动作：新增 spec 第 4 节所列断言；HTML 内 `celeste-character.js?v=10`、`internet_cafe-1.js?v=20261028g`；
  跑 `node --check`（两文件）与 `node dream_test.js`。
- [x] 完成标志：断言全绿（41/41）、无语法错误。

## T10 研究文档修订（D9）
- [x] 文件：`celeste-dash-反编译研究.md` 第 21 章。
- [x] 动作：G12/G13 改「已按 IL 补齐」；补 21.6 新证据条目；保留音频 / Displacement / LightOcclude /
  shake / Grab 近似等 gap。
- [x] 完成标志：文档与实现一一对应，无遗留「未移植」旧描述。

## 执行顺序与并行度
T1→T2→T3→T4→T5→T6 顺序改同一文件；T7/T8 可在 T6 后并行；T9 最后；T10 收尾。

---

# Round 5 增量（手感 / 操作逻辑 / 交互效果）

依赖：`spec.md` 第 6–7 节获批。验证命令同前。

## T11 引擎：DreamDashCheck OR 门禁（D10）
- [x] 文件：`blog-ui/js/celeste-character.js` → `dreamDashCheck`（L537）。
- [x] 动作：改为 `if (dirX !== sx && dirY !== sy) return false;`（`sx/sy = Sign(DashDir)`），注释引 IL L11–26。
- [x] 完成标志：斜向 dash 撞墙 / 撞地 / 撞天花板均能进入 `DreamDashCheck` 成功分支。

## T12 引擎：着地清 AutoJump（D11）
- [x] 文件同上 → `update()`（L934）。
- [x] 动作：`onGround && state !== ST_CLIMB` 时 `this.autoJump = false;`。
- [x] 完成标志：着地后 `autoJump===false`；Climb 态着地不清。

## T13 引擎：DreamDashBegin 保留 DashAttackTimer（D12）
- [x] 文件同上 → `beginDreamDash`（L581）。
- [x] 动作：删除 `this.dashAttackTimer = 0;`，改注释说明 IL 未清零、timer 由 update() 递减。
- [x] 完成标志：进入 9 后 `dashAttackTimer` 不突变；出块后 `dashAttacking` 仍 true 时可对第二块连续梦冲。

## T14 场景：涟漪近似（D13）
- [x] 文件：`blog-ui/js/internet_cafe-1.js`。
- [x] 动作：新增 `dreamRipples` / `dreamRippleTimer` / `spawnRipple` / `drawDreamRipples` / `dreamBlockTopAt`；
  `tick()` 内块内每 0.04s 生成 (0.3,40) 涟漪并衰减；`onLand` 落到 DreamBlock 顶面生成 (0.5,40)；
  `render()` 在玩家之后、`drawDust()` 之前绘制。
- [x] 完成标志：梦冲穿块时出现周期涟漪；落在方块顶面出现一次落地涟漪；无残留对象泄漏。

## T15 测试与缓存（D15）
- [x] 文件：`%TEMP%\dream_test.js`、`blog-ui/internet_cafe.html`。
- [x] 动作：新增斜向门禁 3 条、AutoJump 2 条、DashAttackTimer/连续梦冲 2 条断言；
  HTML bump `celeste-character.js?v=11`、`internet_cafe-1.js?v=20261028h`；
  跑 `node --check` 两文件与 `node dream_test.js`。
- [x] 完成标志：断言全绿（50/50）、无语法错误。

## T16 研究文档与 checklist 收尾（D15）
- [x] 文件：`celeste-dash-反编译研究.md` 第 21 章、本目录 `checklist.md`。
- [x] 动作：新增 21.7 证据小节；G21（Displacement 近似）/G22（攀爬/墙跳涟漪未做）登记；
  checklist 追加 Round 5 条目并勾选。
- [x] 完成标志：文档、spec、实现三者一致。
