# Spec：DreamBlock / DreamDash 的 REA 深度复刻

状态：待批准
范围：只改 `blog-ui/js/celeste-character.js`、`blog-ui/js/internet_cafe-1.js`、`blog-ui/internet_cafe.html`、
`celeste-dash-反编译研究.md`，以及测试脚本 `%TEMP%\dream_test.js`。
行为证据：本地安装版 `Celeste.dll` 经 dnfile+dncil dump 的 IL（`dream_il.txt`、`player_collide_il.txt`、
`player_normal_il.txt`、`sprite_dream_il.txt`）。不引入新素材、不编造常量。

## 1. 背景

上一轮已把 DreamBlock 接入 internet\_cafe 场景「能跑」，但仍有多处与 IL 不一致（自研近似）。
本轮把这些偏差逐条按 IL 补齐，并把无法在 Canvas 2D 场景复刻的部分明确列为 gap。

## 2. 逐条决策（文件 / 函数 / 具体改法）

### D1 `celeste-character.js` → `dreamDashCheck(dirX, dirY)`

补「同时与其它 Solid 重叠」的轴平移修正，完整对齐 IL：

```
if (!dreamDashEnabled || !dashAttacking) return false;
if (dirX !== Math.sign(dashDir.x) || dirY !== Math.sign(dashDir.y)) return false;
if (!dreamBlockFn) return false;
const blk = dreamBlockFn(this.x + dirX, this.y + dirY);
if (!blk) return false;
if (this.bodySolidAt(dirX, dirY)) {
    const ax = Math.abs(dirY), ay = Math.abs(dirX);      // 轴交换
    let flag, flag2;
    if (dirX !== 0) { flag = !(this.vy > 0); flag2 = !(this.vy < 0); }
    else            { flag = !(this.vx > 0); flag2 = !(this.vx < 0); }
    if (flag)  for (let i = -1; i >= -4; i--)
        if (!this.bodySolidAt(dirX + ax * i, dirY + ay * i)) { this.x += ax * i; this.y += ay * i; this.dreamBlock = blk; return true; }
    if (flag2) for (let j = 1; j <= 4; j++)
        if (!this.bodySolidAt(dirX + ax * j, dirY + ay * j)) { this.x += ax * j; this.y += ay * j; this.dreamBlock = blk; return true; }
    return false;
}
this.dreamBlock = blk;
return true;
```

### D2 `celeste-character.js` → `dreamDashUpdate(dt, input)`

* `dreamDashCanEndTimer` 仅在 `> 0` 时递减（IL：`if (dreamDashCanEndTimer > 0f) ...`）。

* `DreamDashedIntoSolid` 改为 IL 的四层顺序搜索（25 点，顺序必须一致）：
  `i=1..5 step2`（x 幅值）→ `j=-1,1`（x 符号）→ `k=1..5 step2`（y 幅值）→ `l=-1,1`（y 符号），
  偏移 `(i*j, k*l)`，命中第一个非 Solid 点就 `x += i*j; y += k*l; return false;`；全部 25 点都 Solid 才判定卡死。

* 卡死时保持现有 `setState(ST_NORMAL)` + `onDreamDashDeath`（本场景无 Assist，原作非无敌分支为 `Die`）。

* 残影：CreateTrail 只在 `blk != null`（仍在本块内）路径触发，见 D5。

* 出口跳 `jump()` 需要 `fromDreamBlock=true` 语义：在 `BottomCenter` 产生 4 粒 `-π/2` 向尘土
  （由新增 `onDreamJump` 回调交给场景层，见 D8）。

### D3 `celeste-character.js` → `postPhysics` 三处 DreamDashCheck 移到角修正之后

* 水平：先记录 `collidedH = blocked !== null`；执行现有 Dash 角修正；**之后**再执行
  `if (collidedH && this.dreamDashCheck(sign(vx), 0)) { if (blocked !== null) this.x = ...; beginDreamDash(); return; }`。

* 天花板：把现有 1461 行附近的梦境界探测整块移到 `this.vy < 0 && ceilingFn` 天花板块**内部末尾**
  （角修正 + `varJumpTimer` 清零之后），调用 `dreamDashCheck(0, -1)`；命中后 `beginDreamDash()` 并 return。

* 地面：删除 1517 行「落地前」的检测；改为在整段地面碰撞（含 Dash corner correction / 落地 / landEffects）
  **之后**，用本帧发生落地/贴地事件的标记 `landedThisFrame` 执行 `dreamDashCheck(0, 1)`。
  命中后 `beginDreamDash()` 并 `updateSharedVisuals(dt); return;`。

* 三处命中后统一：`state=9`、`dashAttackTimer=0`、`gliderBoostTimer` 保持现有（引擎无此字段则不加）。

### D4 `celeste-character.js` → `updateSpriteAnim()`

在 State 9 分支之后、State 1 分支之前插入（对齐 `player_normal_il.txt` L14418–14440）：

```
if (S.last && S.last.indexOf('dreamDash') === 0 && S.last !== 'dreamDashOut') {
    S.play('dreamDashOut');
    return;
}
```

并在正常分支入口保留：`current === 'dreamDashOut'` 时本帧不再改播其它动画（`return`），
直到 `dreamDashOut` 自身播完（`goto:null`）后由下一帧正常状态机接管——与 IL 的
`if (CurrentAnimationID != "dreamDashOut") { ...普通分支... }` 等价。

### D5 `celeste-character.js` → `updateDashTrail(dt)`

State 9 分支增加门控：`if (!this.dreamBlock) return;`，然后才做 0.1s 节流 CreateTrail。
（原作只在 `StDreamDash` 且 `CollideFirst<DreamBlock>` 非空时 `OnInterval(.1f) CreateTrail()`。）

### D6 `internet_cafe-1.js` → `dreamWobbleLine(...)`

* 按 IL（`dream_il.txt` L1121–1134）在 `whiteFill > 0` 时对两条颜色做
  `color = lerp(color, 白色, whiteFill)`（逐通道，等价 `Color.Lerp(color, White, whiteFill)`）。

* 循环体保持现有三条线（`-perp`、`-2*perp` 用 backColor，主线用 lineColor）+ `offset = amp; i += step`；
  与 IL L1135–1238 一致，无需改动。

* `len < 4` 的提前返回等价于 `while (i < len - 2)` 不进入循环，保留。

### D7 `internet_cafe-1.js` → `drawDreamBlocks()`

* 按 IL `Render`，所有绘制坐标统一加 `shake` 偏移；本类型 `shaker` 字段从未被赋值，
  `shake` 恒为 `(0,0)`，因此实现为读取 `b.shakeX/b.shakeY`（默认 0）加到起点坐标，并注释说明恒 0 的原因。

* 其余（相机裁剪、底色、粒子层帧选择与 2px 裁剪、whiteFill、四条 wobble、四角 2×2）保持现状。

### D8 `internet_cafe-1.js` → 接线与尘土

* `spawnDust(x, y, count, angle)`：新增可选 `angle`（弧度）。传入时粒子方向落在
  `angle ± 0.4` 的扇形内（原作 `Dust.Burst` 的锥形爆散）；不传保持现有全向爆散。

* `m.onDreamDashExit = function (b) { spawnDust(m.x, m.y, 16, Math.atan2(m.vy, m.vx)); }`
  （IL：`Dust.Burst(player.Position, Calc.Angle(player.Speed), 16, null)`，不再用方块中心）。

* 新增 `m.onDreamJump = function () { spawnDust(m.x, m.y + 11, 4, -Math.PI / 2); }`
  （IL：`Jump(true, true)` 在 `BottomCenter` 播 4 粒 `-π/2` 尘土；`y + 11` 即脚底）。

* `celeste-character.js` 的 `jump(fromDreamBlock)`：出口跳调用时传 `true`，并在跳跃体末尾
  触发 `this.onDreamJump && this.onDreamJump()`；普通跳跃不触发。

### D9 缓存与文档

* `internet_cafe.html`：`celeste-character.js?v=10`、`internet_cafe-1.js?v=20261028g`。

* 研究文档第 21 章：G12（dreamDashOut）、G13（Check 轴平移）标记「已按 IL 补齐」；
  新增 21.1 证据条目（DreamDashedIntoSolid 顺序、UpdateSprite 分支、OnPlayerExit 用玩家位置、
  Jump(true,true) 尘土、WobbleLine 的 `Color.Lerp(color, White, whiteFill)`）；
  保留真实 gap：音频（dreamblock\_enter/travel/exit、jump\_dreamblock、assist\_dreamblockbounce 无素材）、
  `Displacement.AddBurst`（需 Displacement shader）、`LightOcclude`（引擎无光照层）、
  `shake` 恒 0、Grab 出口用 `beginClimb` 近似、`SurfaceSoundIndex`/`BlockedCheck`（无音频、无实体推挤需求）。

## 3. 不做的事

* 不新增 DreamBlock 之外的类型，不改场景内方块布局/坐标/配色。

* 不引入新图片素材；粒子仍只用 `objects/dreamblock/particles.png`。

* 不为音频、Displacement、光照做伪造实现（列入 gap）。

## 4. 验收标准

1. `node --check` 两个 JS 文件均通过。
2. `%TEMP%\dream_test.js` 全绿，且新增断言：

   * 左右各方向冲刺进块后 `state===9`、速度 = `DashDir*240`；

   * 身体与块重叠时 `dreamDashCheck` 的轴平移使玩家脱离 Solid 且仍进入 9；

   * `DreamDashedIntoSolid` 25 点顺序脱困（构造只允许 `(+1,-1)` 为空的场景时位移为 `(1,-1)`）；

   * 水平/天花板/地面三处「先角修正、后梦境界」：边沿擦撞不误进 9、正撞进 9；

   * 离开 9 后第一帧 `sprite.last==='dreamDashOut'`，且下一帧起恢复普通动画；

   * `dreamBlock===null` 的梦境冲刺帧不产生新残影，`dreamBlock!==null` 时 0.1s 一枚。
3. 场景层单测（Node vm 内直接调用 `spawnDust` / 回调）验证 `onDreamDashExit` 使用玩家坐标与速度角、
   `onDreamJump` 产生 4 粒 `-π/2` 尘土。
4. 研究文档中 G12/G13 状态与实现一致，其余 gap 明确列出。

## 5. 风险

* 三处 Check 后置会改变「撞面即进块」的时序：若角修正先触发，玩家可能先被修正而不再进块；
  这与原作 IL 顺序一致，属预期行为，用断言锁住。

* `dreamDashOut` 播放与「普通分支抑制」若实现过严会卡动画，靠 `goto:null` + 单帧条件保证退出。

## 6. Round 5 增量：手感 / 操作逻辑 / 交互效果

依据用户反馈「dreamblock 做的不像原作，手感和操作逻辑，以及与人物的交互效果都不如」。
本轮只修 IL 可证实的偏差；Displacement 用轻量涟漪近似，并在文档中标注为 gap。

### D10 `celeste-character.js` → `dreamDashCheck` 门禁改为 OR 语义（必修）

IL（`player_dream_il.txt` DreamDashCheck L11–26）为：

```
if (dir.X == Sign(DashDir.X)) goto pass;      // X 命中即跳过 Y 检查（beq）
if (dir.Y != Sign(DashDir.Y)) return false;   // 否则才比 Y（bne.un）
pass: ...
```

即 `dirX === Sign(DashDir.X) || dirY === Sign(DashDir.Y)`。当前实现是双轴 AND，
导致斜向冲刺（DashDir=(±0.707,±0.707)）撞墙/撞地/撞天花板时 dir 只有一个分量匹配 → 永远进不了方块。

改法（L537）：

```js
const sx = Math.sign(this.dashDir.x), sy = Math.sign(this.dashDir.y);
if (dirX !== sx && dirY !== sy) return false;   // 等价 IL：任一非零分量匹配即通过
```

### D11 `celeste-character.js` → `update()` 着地清 `AutoJump`（必修）

IL `Player.Update`（`player_normal_il.txt` L13043–13053）：

```
if (onGround && State != StClimb) { AutoJump = false; Stamina = 110f; ... }
```

当前 L934 的着地块只回充 stamina / wallSlide / jumpGrace，未清 `AutoJump`。
`DreamDashEnd` 会置 `AutoJump = true`（非 dreamJump 出口），而引擎把 `AutoJump` 当作
「按住跳跃」参与半重力（L1116/1120）与 varJump（L1129），因此不清会导致梦冲出口后长期「发飘」。

改法：

```js
if (this.onGround) {
    if (this.state !== ST_CLIMB) this.autoJump = false;
    this.refillStamina();
    this.wallSlideTimer = WALL_SLIDE_TIME;
    this.jumpGraceTimer = JUMP_GRACE_TIME;
} else if (this.jumpGraceTimer > 0) { ... }
```

（`Stamina = 110` 已由 `refillStamina()` 覆盖；`AutoJumpTimer` IL 未改，保持现状。）

### D12 `celeste-character.js` → `beginDreamDash` 不再清零 `dashAttackTimer`（必修）

IL `DreamDashBegin`（L178–222）只做：`Speed = DashDir*240`、`TreatNaive = true`、`Depth = -12000`、
`dreamDashCanEndTimer = 0.1`、`Stamina = 110`、`dreamJump = false`、播 enter/travel 音效，
**不碰 `dashAttackTimer`**。当前 L581 的 `this.dashAttackTimer = 0;` 使 `DashAttacking` 立刻变 false，
而 `dreamDashCheck` 的第二个门禁正是 `dashAttacking` → 连续梦冲（一个梦冲链过两块）被切断。

改法：删除该行，注释写明「IL 未清零；timer 由 update() 继续递减，出块后仍保留 DashAttacking 窗口」。
`dashAttackTimer` 仍由 `update()` L947 每帧递减（State 9 也一样，符合 Player.Update 顶层 bookkeeping）。

### D13 `internet_cafe-1.js` → `FootstepRipple` / Displacement 的轻量近似（交互效果）

IL 事实（`dream_il.txt` + `player_normal_il.txt`）：

* `DreamBlock.FootstepRipple(p)`：`playerHasDreamDash` 时 `Displacement.AddBurst(p, 0.5f, 0f, 40f, 1f)`；
  调用点：落地 `FootstepRipple(Position)`、攀爬跳离 `Position + (Facing*3, -4)`、墙跳离 `Position + (dir*3, -4)`。
* `DreamDashUpdate` 块内：`OnInterval(0.04f) Displacement.AddBurst(Center, 0.3f, 0f, 40f, 1f)`。

引擎无 Displacement shader，用白色扩张圆环近似（半径 2→40、0.25s 淡出，强度即 IL 的 0.5/0.3）：

1. 新增模块级 `var dreamRipples = [], dreamRippleTimer = 0;`
   与 `function spawnRipple(x, y, radius, strength)`（push `{x,y,r1,life,max,strength}`）。
2. `tick()` 内 `m.update(...)` 之后：
   `if (m.state === CelesteCharacter.ST.DreamDash && m.dreamBlock) { dreamRippleTimer -= dt; if (<=0) { =0.04; spawnRipple(m.x, m.y, 40, 0.3); } }`
3. `onLand` 内（车顶音效之后）：新增 `dreamBlockTopAt(m.x, m.y)` 判定落在 DreamBlock 顶面 →
   `spawnRipple(m.x, m.y, 40, 0.5)`（IL 落地 FootstepRipple 参数）。
   新增 `dreamBlockTopAt(x, feetY)`：`Math.abs(b.y - feetY) < 0.6` 且 x 落在块内（±4 身体半宽）。
4. `tick()` 内衰减 `dreamRipples`；`render()` 在 L1488 玩家绘制之后、`drawDust()` 之前
   调用 `drawDreamRipples()`：`toScreen(p)` + `ctx.arc`，半径 = `lerp(2, r1, t) * Z`，
   `globalAlpha = strength * (1 - t)`，白色描边 1px。
5. 攀爬/墙跳离的两个调用点需要引擎新增跳跃类型回调，本轮不做（列入 gap G22，避免为一项表现层
   改动引入新的状态机耦合）。

### D14 明确不做的项（保持 gap，不改代码）

* `SurfaceSoundIndex = 12`：本工程 DreamBlock 无音频素材，且场景音效系统按图片事件触发。
* `dreamSfxLoop`（dreamblock\_enter / travel / exit）、`jump_dreamblock`：无素材（沿用 G14）。
* `PutInside` / `BlockedCheck` / `TryActorWiggleUp` / `OneUseDestroy`：本场景无实体互推、无一次性块。
* `Invincible` 出口反弹：场景无 Assist（沿用现有死亡分支）。
* 真正的 `Displacement` shader 位移：G15 / G21，本轮只做圆环近似。

### D15 测试 / 缓存 / 文档

* `%TEMP%\dream_test.js` 新增断言：
  1. 斜向 dash（DashDir=(0.707,0.707)）撞墙 `dir=(1,0)` → `dreamDashCheck` true；
     DashDir=(0.707,-0.707) 撞天花板 `dir=(0,-1)` → true；`(0,-1)` 纯垂直 dash 撞地 `dir=(0,1)` → true。
  2. 着地（`state=0`）时 `autoJump=true` → `update()` 后为 false；`state=1`（Climb）着地时保持 true。
  3. `beginDreamDash` 后 `dashAttackTimer` 保持进入前的值；梦冲出块后 `dashAttacking` 仍为 true 且
     可对第二块 `dreamDashCheck` 命中（连续梦冲）。
* `internet_cafe.html`：`celeste-character.js?v=11`、`internet_cafe-1.js?v=20261028h`。
* 研究文档第 21 章新增 21.7 证据小节（OR 门禁、AutoJump、DashAttackTimer、FootstepRipple 参数、
  涟漪近似），G21/G22 记为近似/未做。

## 7. Round 5 验收标准

1. `node --check` 两个 JS 文件通过。
2. `%TEMP%\dream_test.js` 全绿（原 41 条 + 新增 ≥6 条）。
3. 场景中斜向 dash 可从任意方向进入 DreamBlock；梦冲出口后下落不再出现「半重力漂浮」。
4. 连续两块 DreamBlock 可在单次 dash 窗口内链式穿越（不再需要重新按 dash）。
5. 梦冲穿过方块时有周期性白色涟漪、落在方块顶面有落地涟漪（近似 Displacement）。
6. 文档与实现一致，gap 列表更新。

