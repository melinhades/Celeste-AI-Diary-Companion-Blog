# Celeste · 金羽毛 / 水母：REA 取证

> 取证对象：本机 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`（FNA/MonoGame C#，含 Everest 补丁）。
> 方法：ILSpyCmd 定向反编译 + 元数据核对；只读游戏安装目录，未做任何修改。
> 反编译产物在 `%TEMP%\celeste-rea\`：
> `Celeste.FlyFeather.decompiled.cs`、`Celeste.Glider.decompiled.cs`、`Celeste.Holdable.decompiled.cs`、
> `Monocle.SineWave.decompiled.cs`、`Celeste.Input.decompiled.cs`、`Player.cs`、`yolo\Celeste.ParticleTypes.cs`，
> 精灵定义取自安装目录 `Content\Graphics\Sprites.xml`。
> 行号均指上述文件（ILSpyCmd 输出，稳定可复查）。
> 单位：1 游戏单位 = 1px；速度 / 加速度均为 **每秒**；网页引擎 y 向下，与原作一致。
> FMOD 事件内部的毫秒 / 曲线 / bank 内容不在托管代码里，本文只记录事件路径与触发时机。

---

## 0. 一句话结论

| 问题 | 结论 |
|---|---|
| 羽毛怎么浮 | `SineWave(0.6)`，`Y = sin(2π·0.6·t + φ) × 2`，即 **0.6 Hz / ±2px**；相位 `Randomize()` 随机取 `[0, 4π)`。碰护盾羽毛时另有 `moveWiggle` 的 -8px 位移，不是悬浮。 |
| 羽毛怎么被拿 | `PlayerCollider` 命中 → `Player.StartStarFly()`；状态 19 已在则**只续 2s**（renew），不再播收集动画。护盾羽毛在非冲刺时只弹开（`PointBounce`）。 |
| 飞行怎么起 | `StarFlyBegin` 收速到 0（1000/s）＋ `startStarFly` 动画播完（4 帧×0.08s）＋ 0.1s → **约 0.42s** 后发射；发射速度 **250**，方向取 `Input.Feather`（无输入则朝向）。 |
| 飞行怎么飞 | 方向按 **5.5850534 rad/s** 追输入；速度上限 `91（无输入）/ 140（普通）/ 190（对齐，140→190 用 1s 线性爬升）`；加速度 **1000/s**；计时 **2s**。 |
| 飞行怎么结束 | 2s 到 / 跳跃落地 / 两侧蹬墙 / 抓墙 / 冲刺；退出时 `|vx|` 夹 **140**、按 ↑ 给 **-100**、正 vy 归 0。 |
| 羽毛怎么重生 | `respawnTimer = 3s`（仅 `singleUse=false`），期间 `outline` 常亮；重生瞬间播 `feather_reappear` + 16 颗 `P_Respawn`。 |
| 水母是什么 | `Holdable(0.3)` 的可搬运物；拾取点 `20×22 @(-10,-16)`，`SlowFall=true`，`SlowRun=false`；身上碰撞盒 `8×10 @(-4,-10)`。 |
| 水母怎么挂 | 抓着时悬浮正弦 `SineWave(0.3)` → **0.3 Hz / ±1px**（只对未被抓过的 bubble 平台生效）；玩家缓降见 §2.3。 |
| 水母自由物理 | 重力 **200**（`vy ≥ -30` 时 **100**），下落目标 **30**；X 摩擦 `vy<0 → 40`，`vy≥0 → (highFrictionTimer≤0 ? 10 : 40)`；地面 800 摩擦 + ±20 侧滑。 |
| 水母怎么碎 | **只有撞 `SeekerBarrier` 才碎**：掉手、速度 = 玩家速度×0.333，播 `glider_emancipate` + `death` 动画，**1.0s 后移除**。撞墙只反弹，不碎。 |
| 水母重生吗 | **不重生**。底部出界 `Top > Bounds.Bottom+16` 直接 `RemoveSelf`；`OnSquish` 也直接移除。原作没有"等重生"机制。 |

---

## 1. 金羽毛 FlyFeather

### 1.1 实体与外观参数

| 项 | 值 | 出处 |
|---|---|---|
| 碰撞盒 | `Hitbox(20, 20, -10, -10)`（居中 20×20） | `Celeste.FlyFeather.decompiled.cs:53` |
| 触发方式 | `PlayerCollider(OnPlayer)` | 同上 `:54` |
| 精灵 | `GFX.SpriteBank.Create("flyFeather")` | 同上 `:55`；动画见 `Sprites.xml:822-826` |
| 收集缩放抖动 | `Wiggler(1s, freq 4)` → `scale = 1 + v×0.2` | `Celeste.FlyFeather.decompiled.cs:56-59` |
| 光晕 | `BloomPoint(0.5, 20)` + `VertexLight(White, 1, 16, 48)` | 同上 `:60-61` |
| 光晕响应 | `light.Alpha → sprite.Visible ? 1 : 0`，速度 **4/s**；`bloom = light×0.8` | 同上 `:100-101` |
| 护盾圈 | `shielded && sprite.Visible` → `Draw.Circle(Pos+..., 10 - shieldWiggle×2, White, 3)` | 同上 `:108-111`、`:66-67` |
| 护盾弹开抖动 | `moveWiggle(0.8s, freq 2, StartZero)` | 同上 `:68-70` |
| 动画 | `loop(idle 0-20, 0.06s) ↔ flash(0-20, 0.06s)` | `Sprites.xml:824-825` |

### 1.2 悬浮（正弦）

| 项 | 值 | 出处 |
|---|---|---|
| 构造函数 | `new SineWave(0.6f, 0f).Randomize()` | `Celeste.FlyFeather.decompiled.cs:62` |
| 频率 | `0.6 Hz`（`SineWave.Update` 每帧 `counter += 2π·Frequency·Rate·dt`） | `Monocle.SineWave.decompiled.cs:55`、`:8`、`:10` |
| 相位 | `Randomize()` → `counter = rand × 4π`（0～2 个整周期） | `Monocle.SineWave.decompiled.cs:67-71` |
| 波形 | `Value = sin(counter)` | `Monocle.SineWave.decompiled.cs:33` |
| 位移 | `sprite.Y = bloom.Y = sine.Value × 2f`（X 固定 0） | `Celeste.FlyFeather.decompiled.cs:129-136` |
| 护盾位移叠加 | `sprite.Position += moveWiggleDir × moveWiggle.Value × -8f`（仅护盾弹开后 0.8s） | 同上 `:135` |
| ⇒ 等效公式 | `y = sin(2π·0.6·(t + φ)) × 2`，φ 由随机 counter 折算；**不叠加到实体 Position**，只动 sprite | 由 `:62`、`:133` 推得 |

> 注意：悬浮是 **sprite 局部偏移**，实体 `Position` 不动，所以 PlayerCollider 的判定框始终在原点。

### 1.3 被拿到：`OnPlayer` 与 `StartStarFly`

`Celeste.FlyFeather.decompiled.cs:139-171`，顺序：

| 条件 / 步骤 | 行为 | 行 |
|---|---|---|
| 计算 `player.Speed` | 用于 SlashFx 方向 | `:141` |
| `shielded && !player.DashAttacking` | `PointBounce(Center)`；`moveWiggle` / `shieldWiggle` 启动；`moveWiggleDir = (Center-player.Center).SafeNormalize(Up)`；播 `feather_bubble_bounce`；震动 Medium/Medium；**直接 return，不收集** | `:142-150` |
| 记录原状态 | `flag = StateMachine.State == 19` | `:152` |
| `player.StartStarFly()` | 见 §1.5；返回 false（状态 18 反射坠落）则什么都不做 | `:153` |
| 音效 | 原状态非 19：`feather_get` / `feather_bubble_get`；原状态 19：`feather_renew` / `feather_bubble_renew` | `:156-162` |
| 关闭可碰撞 | `Collidable = false` | `:163` |
| 收集协程 | `Add(Coroutine(CollectRoutine(player, speed)))` | `:164` |
| 重生标记 | `if (!singleUse) { outline.Visible = true; respawnTimer = 3f; }` | `:165-169` |

`CollectRoutine`（`:174-182`）：

| t | 行为 | 行 |
|---|---|---|
| 0 | `level.Shake()`；`sprite.Visible = false` | `:176-177` |
| 0.05s | 方向 = 玩家速度角（速度为 0 时用 `(Position - player.Center).Angle()`）；`P_Collect ×10`，散布半径 `One×6`；`SlashFx.Burst(Position, direction)` | `:178-181` |

### 1.4 重生时序

`respawnTimer` 在 `Update` 里按 `Engine.DeltaTime` 递减（`:91-98`），归零调 `Respawn()`（`:115-126`）：

| 项 | 值 | 出处 |
|---|---|---|
| 等待 | **3.0s**（`const RespawnTime = 3f`） | `:19`、`:168` |
| 等待期间外观 | `outline.Visible = true`，本体 `sprite.Visible = false` | `:167`、`:177` |
| 重生瞬间 | `outline.Visible=false`；`Collidable=true`；`sprite.Visible=true`；`wiggler.Start()` | `:119-122` |
| 重生音效 | `event:/game/06_reflection/feather_reappear` | `:123` |
| 重生粒子 | `P_Respawn ×16`，位置 `Position`，散布 `One×2` | `:124` |
| 单次羽毛 | `singleUse=true` 时不设 `respawnTimer`，**永不重生** | `:165-169` |

### 1.5 StarFly（玩家状态 19）时间线

状态注册：`Player.cs:1225`（`SetCallbacks(19, StarFlyUpdate, StarFlyCoroutine, StarFlyBegin, StarFlyEnd)`）；常量块 `Player.cs:748-780`。

| 阶段 | 行为 | 出处 |
|---|---|---|
| 入口 `StartStarFly` | `RefillStamina()`；状态 18 → 返回 false；状态已是 19 → `starFlyTimer=2` + 飞行色 + 震动，返回 true；否则 `State=19` | `Player.cs:4590-4608` |
| `StarFlyBegin` | 播 `startStarFly`；`starFlyTransforming=true`；`starFlyTimer=2`；`starFlySpeedLerp=0`；`jumpGraceTimer=0`；碰撞盒切 `starFlyHitbox 8×8 @(-4,-10)`；播循环音 `feather_state_loop` | `Player.cs:4611-4635`、`:626` |
| 变形收速 | `Speed → 0`，速度 **1000/s** | `Player.cs:4721-4724` |
| 发射条件 | 协程等 `startStarFly` 动画结束（4 帧×0.08s ≈ 0.32s）→ 等 `Speed==0`（250→0 约 0.25s）→ 再等 **0.1s**；合计 **≈0.42s** | `Sprites.xml:61`、`Player.cs:4680-4690` |
| 发射瞬间 | 发色切飞行色、`HairCount=7`、轮廓描边开启、`starFlyBloom` 出现、位移爆散；`RefillDash/RefillStamina`；方向 = `Input.Feather`（零则朝向）；`Speed = dir × 250`；`P_Boost ×12`；Strong 震动 + 方向震屏 | `Player.cs:4691-4708` |
| 变形结束 | `starFlyTransforming=false`；`starFlyTimer=2` | `Player.cs:4695-4696` |
| 计时过半警告 | `timer ≤ 0.5` 时播 `feather_state_warning` | `Player.cs:4709-4713` |

### 1.6 StarFly 飞行参数

| 项 | 值 | 出处 |
|---|---|---|
| 状态时长 | **2.0s** | `Player.cs:750`、`:4615`/`:4696` |
| 发射速度 | **250** | `Player.cs:752`、`:4704` |
| 方向转速 | **5.5850534 rad/s**（≈320°/s），`RotateTowards` | `Player.cs:764`、`:4735` |
| 速度·无输入 | **91** | `Player.cs:760`、`:4739-4741` |
| 速度·普通输入 | **140** | `Player.cs:754`、`:4747-4751` |
| 速度·对齐输入 | **190**（`dot ≥ 0.45` 才进入）；140→190 用 `starFlySpeedLerp` 在 **1.0s** 内线性爬升 | `Player.cs:756`、`:758`、`:4742-4746` |
| 速度逼近 | **1000/s** | `Player.cs:748`、`:4754` |
| 飞行粒子 | 每 **0.02s** 1 颗 `P_Flying`，方向 `(-Speed).Angle()` | `Player.cs:4756-4759` |
| 撞墙（H） | `timer < 0.2` → `Speed.X=0`；否则播 `feather_state_bump` + Light 震动 + `Speed.X ×= -0.5` | `Player.cs:2373-2383` |
| 撞墙（V） | `timer < 0.2` → `Speed.Y=0`；否则同音效 + `Speed.Y ×= -0.5` | `Player.cs:2471-2481` |

### 1.7 StarFly 结束条件与退出速度

`StarFlyUpdate`（`Player.cs:4717-4847`）在飞行中依次检查：

| 触发 | 结果 | 出处 |
|---|---|---|
| `Input.Jump.Pressed` + `OnGround(3)` | `Jump()` → 状态 0 | `:4760-4766` |
| `Input.Jump.Pressed` + 左右 `WallJumpCheck` | `WallJump(±1)` → 状态 0 | `:4767-4776` |
| `Input.GrabCheck` + `ClimbCheck(±1)` | 状态 1（抓墙）；NoGrabbing 时 `Speed=0` + `ClimbTrigger` → 0 | `:4778-4803` |
| `CanDash` | `StartDash()`（状态 2） | `:4805-4808` |
| `timer ≤ 0` | 退出：`MoveY==-1` → `Speed.Y=-100`；`MoveY<1` → 记 `varJumpSpeed`、`AutoJump`、`varJumpTimer=0.2`；`Speed.Y>0` → 0；`\|Speed.X\|>140` → 夹到 140；Medium 震动 | `:4809-4832` |
| 最后 0.5s | 每 0.05s 在飞行色 / 普通发色间闪烁 | `:4834-4844` |
| `StarFlyEnd` 回调 | `feather_state_end` 音效；停止警告 / 循环音；关闭描边、恢复发色与 `startHairCount`；`Displacement` 爆散；非状态 2 时 `P_Boost ×12` | `Player.cs:4638-4653` |
| 碰撞盒恢复 | `normalHitbox`；若卡墙依次尝试上移、蹲下上移，仍卡则 `Die()` | `Player.cs:4657-4678` |

常量对照：`StarFlyMaxExitY=0`、`StarFlyMaxExitX=140`、`StarFlyExitUp=-100`（`Player.cs:776-780`）；`StarFlyEndXVarJumpTime=0.1`（`:768`）用于 `StarFlyEnd` 的 varJump 窗；`StarFlyWallBounce=-0.5`（`:774`）。

发色：普通 `#AC3232`、飞行 `#F2EB6D`、星飞 `#ffd65c`（`Player.cs:636-638`、`:782`）。`startStarFly` 时叠加白色贴图（`Player.cs:1428-1431`）。头发元数据：`startStarFly hair="0,-2"`、`starFly hair="0,3"`（`Sprites.xml:137-138`）。

---

## 2. 水母 Glider

### 2.1 构造参数

| 项 | 值 | 出处 |
|---|---|---|
| 实体碰撞盒 | `Hitbox(8, 10, -4, -10)` | `Celeste.Glider.decompiled.cs:506` |
| 精灵 | `GFX.SpriteBank.Create("glider")`，`Justify(0.5, 0.58)` | 同上 `:509`；`Sprites.xml:828-835` |
| 抖动 | `Wiggler(0.25s, freq 4)` | 同上 `:510` |
| 深度 | `-5` | 同上 `:511` |
| 可搬运 | `Holdable(0.3)` → `cannotHoldDelay = 0.3s` | 同上 `:512`；`Celeste.Holdable.decompiled.cs:35`、`:57` |
| 拾取盒 | `PickupCollider = Hitbox(20, 22, -10, -16)` | 同上 `:513` |
| 缓降标记 | `SlowFall = true`；`SlowRun = false` | 同上 `:514-515` |
| 平台正弦 | `SineWave(0.3, 0)` | 同上 `:520` |
| 速度接口 | `Hold.SpeedGetter = () => Speed`；`SpeedSetter = v => Speed = v` | 同上 `:518`、`:61-64` |
| 初始速度 | `Speed = 0` | 构造前字段默认 |
| 持有时高摩擦 | `highFrictionTimer = 0.5s` | 同上 `:424`、`:21` |

### 2.2 拾取 / 投掷 / 松手时序

**拾取**：`Holdable.Pickup`（`Celeste.Holdable.decompiled.cs:91-106`）+ `Player.orig_Pickup`（`Player.cs:6789-6799`）+ `Glider.OnPickup`（`Celeste.Glider.decompiled.cs:412-428`）

| 步骤 | 值 | 出处 |
|---|---|---|
| 抓取条件 | `GrabCheck && !IsTired && !Ducking`；`cannotHoldTimer ≤ 0` | `Player.cs:2820`；`Celeste.Holdable.decompiled.cs:93` |
| 拾取动画 | `Speed=0`；0.16s `CubeInOut` Tween，`carryOffset` 从「水母相对位置」到 `(0,-12)` | `Player.cs:4396-4409`、`:316` |
| 搬运位置 | `Position + carryOffset + UnitY × Sprite.CarryYOffset`（常态目标 `(0,-12)`） | `Player.cs:2224`、`:316` |
| 拾取冷却 | `minHoldTimer = 0.35s`（防止瞬间被 `!GrabCheck` 判成投掷） | `Player.cs:6795`、`:2894`；递减 `:6105-6107` |
| 水母复位 | `AllowPushing=false`；`Speed=Zero`；`Persistent`；`highFrictionTimer=0.5`；`bubble=false` | `Celeste.Glider.decompiled.cs:421-427` |
| 拾取音 / 震 | `crystaltheo_lift` + Medium/Short 震动 | `Player.cs:4390-4391` |
| 向上拾取加速 | 结束时若 `vy<0` → `vy = min(vy, -105)` | `Player.cs:4422-4425`；常量 `:354` |
| 冲刺拾取加速 | `gliderBoostDir.Y<0` → `vy = min(vy, -240×\|gliderBoostDir.Y\|)`，并清零 boost 计时 | `Player.cs:4414-4421`；常量 `:356` |
| 拾取瞬间特效音 | `glider_platform_dissipate`（boost 中或 `Speed.Length()>180 && vy≤0`） | `Player.cs:4392-4395` |
| 持有 + 着地 + 下方向 | `holdCannotDuck = true` | `Player.cs:4426-4429`、`:2991-2993` |

**投掷 / 松手**：`Player.Throw`（`Player.cs:2250-2268`）、`Player.Drop`（`:2271-2279`）、`Glider.OnRelease`（`Celeste.Glider.decompiled.cs:431-446`）、`Holdable.Release`（`Celeste.Holdable.decompiled.cs:122-156`）

| 项 | 值 | 出处 |
|---|---|---|
| 投掷方向 | `Release(UnitX × Facing)` | `Player.cs:2261` |
| 玩家后坐 | `Speed.X += 80 × (0 - Facing)` → 反向 **80** | `Player.cs:2262` |
| 投掷音 / 精灵 | `crystaltheo_throw` + `sprite.play("throw")` | `Player.cs:2263-2264` |
| 力度换算 | `force.Y ×= 0.5`；`force.X≠0 && force.Y==0` → `force.Y=-0.4`；`Speed = force × 100` | `Celeste.Glider.decompiled.cs:439-444` |
| ⇒ 侧投 | `(±100, -40)` | 同上 |
| ⇒ 下放 / 松手 | `Speed = (0, 0)` | `Player.cs:2276`；`Celeste.Glider.decompiled.cs:444` |
| 松手脱困 | 水平最多试 10 步 1px；仍卡则逐像素上移 | `Celeste.Holdable.decompiled.cs:124-147` |
| 松手后重力延迟 | `gravityTimer = 0.1s`（期间 `ShouldHaveGravity=false`） | `Celeste.Holdable.decompiled.cs:150`、`:51` |
| 松手后再抓冷却 | `cannotHoldTimer = cannotHoldDelay = 0.3s` | `Celeste.Holdable.decompiled.cs:151` |

### 2.3 玩家持有水母时的缓降（`Holding.SlowFall`）

| 项 | 值 | 出处 |
|---|---|---|
| 空中水平上限 | **108**（普通 `OnGround` 时仍用 90；`SlowRun` 物才 70） | `Player.cs:350`、`:2940-2944` |
| 空中水平加速度 | `×0.5`（`num2 *= 0.5`） | `Player.cs:2943` |
| `maxFall` 目标 | `GliderMoveY==1 → 120`；`==-1 且逆风 → -32`；`==-1 → 24`；无输入 → 40（逆风时 0） | `Player.cs:338-346`、`:2969-2972` |
| `maxFall` 逼近速度 | **300/s** | `Player.cs:2971` |
| 竖直重力 | `Gravity × 0.5`（另叠加跳跃半重力） | `Player.cs:348`、`:3020-3023` |
| 墙滑 | `Holding != null` 时**不进入**墙滑 | `Player.cs:2997`、`:1147`（网页注释） |
| 蹬墙强制位移 | 松手物 `SlowFall` → `forceMoveX=dir`、`forceMoveXTimer=0.26s` | `Player.cs:358`、`:6693-6697` |
| 持有物碰撞时 | 每帧 `Hold.CheckAgainstColliders()` | `Celeste.Glider.decompiled.cs:249` |

### 2.4 水母自由物理（未被持有）

主循环 `Celeste.Glider.decompiled.cs:87-308`。

| 项 | 值 | 行 |
|---|---|---|
| bubble 平台 | `Position = startPos + UnitY × platformSine.Value × 1`（**0.3 Hz / ±1px**，无随机相位） | `:253`、`:520` |
| 旋转·持有 + 地面 | `ClampedMap(Speed.X, -300, 300, +0.6981317, -0.6981317)`（即 ±34°，随 X 反向） | `:96` |
| 旋转·持有 + 空中 | `ClampedMap(Speed.X, -300, 300, +π/3, -π/3)`（±60°） | `:96` |
| 旋转·未持有 | 目标 0 | `:100` |
| 旋转逼近 | `Math.PI × dt`（180°/s） | `:102` |
| 持有 + 下落张开音 | `vy>20 或逆风` → `glider_engage` 一次 + `glider_movement` 循环；参数 `Map(\|(vx×0.5, vy<0?vy×2:vy)\|, 0, 120, 0, 0.7)` | `:103-114` |
| 地面 X 摩擦 | `Speed.X → 0 / ∓20`（侧悬则往空侧滑 ±20），速度 **800/s** | `:152-163` |
| 地面承接平台速度 | 丢失 LiftSpeed 时继承 `prevLiftSpeed`，`Speed.Y = min(Speed.Y×0.6, 0)`；`Speed.X≠0 && Speed.Y==0` → `Speed.Y=-60`；向上则 `noGravityTimer=0.15` | `:164-178` |
| 空中重力 | `num = 200`；`Speed.Y ≥ -30` → `num ×= 0.5`（**100**） | `:190-194` |
| 空中下落目标 | `Speed.Y → 30`，逼近速度 **num**；上升气流时 → 0 | `:209-216` |
| 空中 X 摩擦 | `vy<0 → 40`；`vy≥0 → (highFrictionTimer ≤ 0 ? 10 : 40)` | `:195-204` |
| 重力/摩擦延迟 | `noGravityTimer` 期间跳过重力；`ShouldHaveGravity` 为假时连整个空中物理段跳过（松手 0.1s） | `:205-208`、`:188` |
| 左右上边界 | 夹到 `Bounds`，左右以 `-1` 反弹（`OnCollideH`） | `:220-243` |
| 下边界 | `Top > Bounds.Bottom + 16` → `RemoveSelf()`，**不重生** | `:244-248` |
| 撞墙 H | 播 `glider_wallbounce_left/right`；`Speed.X ×= -1`；`scale=(0.8,1.2)` | `:375-391` |
| 撞墙 V | `\|vy\|>8` → `scale=(1.2,0.8)` + `glider_land`；`vy<0 → ×-0.5`；否则 `vy=0` | `:394-409` |
| 压扁 | `TrySquishWiggle(3,3)` 失败 → `RemoveSelf()` | `:448-454` |
| 弹簧 | 地面 `vy=-160`、`vx×0.5`；左右墙 `vx=±160`、`vy=-80`；`noGravityTimer=0.15/0.1` | `:457-489` |
| 风 | 未持有时 `MoveH(wind.X×0.5)`、`MoveV(wind.Y)` | `:343-356` |

### 2.5 动画 / 粒子 / 音效

| 项 | 值 | 出处 |
|---|---|---|
| 动画 | `idle` / `held` 各 0.1s/帧；`fall` 0.06s → `fallLoop` 0.06s；`death` 0.06s（不循环） | `Sprites.xml:828-835` |
| 未持有 | 逆风 → `PlayOpen()`，否则 `idle` | `Celeste.Glider.decompiled.cs:256-266` |
| 持有 + `vy>20`/逆风 | 每 0.04s `P_Glide`（`Position - UnitY×10`，散布 `(6,4)`）；逆风改 `P_GlideUp`（`-20px`）；播 `fall`/`fallLoop`；按 `GliderMoveY` 压扁/拉长 `(0.7,1.4)` / `(1.2,0.8)`；Climb 震动短 | `:267-292` |
| 持有 + 其余 | `held` | `:295` |
| 缩放逼近 | 2/s | `:297-298` |
| `PlayOpen` | 非 `fall/fallLoop` 时切 `fall`、`scale=(1.5,0.6)`、`P_Expand ×16`（`Center + (0,-12).Rotate(rot)`，散布 `(8,3)`，方向 `-π/2+rot`）；持有时 Medium/Short 震动 | `:311-323` |
| 常驻光点 | 每 0.05s `P_Glow`（`Center + (0,-9)`，散布 `(10,4)`） | `:89-92` |
| bubble 平台点 | 24 个 `Draw.Point`，`y=-5+round(sin(TimeActive+num×0.2)×1.8)`，首尾 0.4 白、中间 0.8 白 | `:333-339`、`:359-372` |
| 拾取 bubble | 24 颗 `P_Platform` 撒在平台点上 | `:414-420` |
| 描边 | 未碎裂时 `sprite.DrawSimpleOutline()` | `:328-331` |

粒子定义（`yolo\Celeste.ParticleTypes.cs`）：

| 粒子 | 关键参数 | 行 |
|---|---|---|
| `P_Collect` | 羽片贴图；`#F2EB6D`↔`#fff20f` Blink；Life 0.6-0.9；Speed 60-70；SpeedMult 0.1；全向；Spin 30°-80° | `:814-832` |
| `P_Boost` | 继承 Collect；DirectionRange 1.396；Speed 20-80；SpeedMult 0.2 | `:833-839` |
| `P_Flying` | 同色 Blink；Life 0.4-0.8；Speed 60-70；SpeedMult 0.25；DirectionRange 60° | `:840-853` |
| `P_Respawn` | 继承 `Refill.P_Regen`；`#ffdca4`↔`#ffe95e`；Speed 30-40；SpeedMult 0.2 | `:854-858`、`:408-414` |
| `P_Glide` | Acceleration `(0,60)`；Speed 30-40；方向正上 ±90°；Life 0.6-1.2；`#4FFFF3`↔`#FFF899`；Size 0.5±0.2 | `:1303-1320` |
| `P_GlideUp` | 继承 Glide；Acceleration `(0,-10)`；Speed 50-60 | `:1321-1326` |
| `P_Platform` | Acceleration `(0,60)`；Speed 5-20；方向正上；Life 0.6-1.4 | `:1327-1337` |
| `P_Glow` | Speed 8-16；全向；Life 0.4-0.8；`#B7F3FF`↔`#F4FDFF` Blink | `:1338-1350` |
| `P_Expand` | 继承 Glow；Speed 40-80；SpeedMult 0.2；Life 0.6-1.2；DirectionRange 135° | `:1351-1359` |

### 2.6 碎裂时序（唯一触发：`SeekerBarrier`）

`Celeste.Glider.decompiled.cs:120-141`：

| 步骤 | 行为 | 行 |
|---|---|---|
| 检测 | 每帧遍历 `Scene.Tracker.GetEntities<SeekerBarrier>()`，临时 `Collidable=true` 做 `CollideCheck` | `:122-127` |
| 命中 | `destroyed=true`；`Collidable=false`；若被持有 → `Holder.Drop()`、`Speed = holder.Speed × 0.333`、Medium/Medium 震动 | `:129-137` |
| 动画协程 | `glider_emancipate` 音效 → `sprite.Play("death")` → **yield 1.0s** → `RemoveSelf()` | `:491-497` |
| 碎裂后 | `Update` 只走 `Position += Speed × dt`，不再碰撞 | `:304-307` |
| 重生 | **无**。没有任何 `respawnTimer` / 重生点逻辑 | 全文件 |

补充：墙壁、尖刺、掉出上/左/右边界都不触发碎裂；底部出界与压扁直接移除（§2.4）。

---

## 3. 铭记页现状 vs 原作（待改清单）

> 以当前 `blog-ui/celeste-farewell-remembered-demo.html` 与 `blog-ui/js/celeste-character.js` 为准；用符号名定位，行号只是快照。

### 3.1 金羽毛

| 主题 | 页面现状 | 原作 | 处理 |
|---|---|---|---|
| 悬浮正弦 | **没有**（`stepFeathers()` 只判收集；`phase` 只用于帧偏移） | 0.6 Hz / ±2px / 随机相位 | **改**：加 `f.sinePhase`，渲染 y 偏移 `sin(2π·0.6·t+φ)×2` |
| 收集判定 | 距离 `COLLECT_R=14`，对 `(m.x, m.y-6)` | `Hitbox(20,20)` vs 玩家碰撞盒 | **改**至矩形重叠（外观不变，仅判定） |
| 收集反馈 | 直接 `splice` + `startFly` | `Shake` + `P_Collect×10` + `SlashFx` + 0.05s 延迟 | **保留现状**（外观/贴图保持现状，粒子与 Slash 属于外观改动） |
| 重生 | 页面是"随机刷新池 + 上限 6" | 固定羽毛 3s 重生 / `singleUse` 永不重生 | **保留现状**（页面关卡设计）；如需原作重生需另开需求 |
| 护盾羽毛 | 不支持 | 非冲刺碰撞只弹开，不收集 | **不做**（页面无 shielded 羽毛实体） |
| 飞行中再拿 | `stepFeathers()` 在 `fly` 时不跑 → 不能续时 | 状态 19 再拿 → `timer=2` + renew 音 | **改**：`fly` 中也允许拾取并续时 |
| 发射延迟 | `chargeAnim 0.32` + `chargeTotal 0.42` | 动画 0.32 + 收速 0.25 + 0.1 ≈ 0.42 | 一致，**保留** |
| 发射速度 / 方向 | 250；读变形期末帧输入方向 | 250；`Input.Feather` 或朝向 | 一致，**保留** |
| 方向转速 | 5.5850534 | 5.5850534 | 一致，**保留** |
| 速度目标 | 91 / 140 / 190 直接二值切换 | 91 / 140 / 190，且 140→190 有 **1s lerp**（`dot≥0.45`） | **改**：加 `speedLerp` 1s 爬升 |
| 加速度 | 1000 | 1000 | 一致，**保留** |
| 撞墙 | `<0.2s` 归零，否则 `×-0.5` | 同 | 一致，**保留** |
| 结束 | 2s / `|vx|≤140` / ↑→-100 / 正 vy→0 | 同；另有 `varJumpTimer=0.2` + `AutoJump`（`MoveY<1`） | **改**：补 varJump 窗口（若引擎已有 `varJumpTimer`） |
| 结束方式 | 仅计时结束 | 另有落地跳 / 蹬墙 / 抓墙 / 冲刺 | **改**：补跳跃、抓墙、冲刺退出（依页面机关可用性） |
| 二段跳/冲刺粒子音效 | 无 | 多种音效、`P_Boost` | **保留现状**（音效与粒子 = 外观） |
| 发色 / 发数 | 变形期 4 根普通色，0.32s 切 7 根飞行色 | 动画结束 + 收速 + 0.1s 才切 7 根；`startStarFly` 4 帧 | 基本一致；切色时点需按 §1.5 对齐（0.42s） |

### 3.2 水母

| 主题 | 页面现状 | 原作 | 处理 |
|---|---|---|---|
| 悬浮正弦 | `sin((t+φ)×0.3×2π)×1`，φ 随机 | `SineWave(0.3)`，φ=0 | 幅值/频率一致；**改** φ 归零（外观一致，仅相位） |
| 抓取点 | `inPickupRange()`：`|dx|<14`、纵向 -16/+6 | `20×22 @(-10,-16)` vs 玩家盒 | 近似一致，**保留** |
| 拾取动画 | 瞬间吸附到 `m.y-16` | 0.16s `CubeInOut` 曲线到 `(0,-12)+CarryYOffset` | **改**：补 0.16s 位移曲线；偏移按实测 `-16` 等价 |
| 拾取加速 | 无 | 向上 `-105`；冲刺 `-240×|dirY|` | **改** |
| 抓取冷却 | `pickupDelay 0.35`、`regrabDelay 0.3` | 同 | 一致，**保留** |
| 投掷 | `(±100,-40)` + 后坐 80 | 同 | 一致，**保留** |
| 缓降 | 引擎 `holdSlowFall`：maxFall 120/24/40，逼近 300，重力 ×0.5，X 上限 108/加速 ×0.5 | 同（逆风 0/-32 本场景无风） | 一致，**保留** |
| 空中 X 摩擦 | `vy<0 ? 40 : (highFrictionTimer>0 ? 10 : 40)` | `vy<0 ? 40 : (highFrictionTimer≤0 ? 10 : 40)` | **页面分支写反**；**改** |
| 空中重力 | 200 / `vy>-30` 时 100 | 200 / `vy≥-30` 时 100 | 边界差 1 个等号，**改**为 `>= -30` |
| 下落目标 | 30 | 30 | 一致 |
| 地面 | 800 摩擦 + ±20 侧滑 | 同 | 一致；**平台 LiftSpeed 承接未实现**，可留 gap |
| 旋转限幅 | 地面 ±0.6981317，空中 ±1.0471976，逼近 π/s | 同 | 一致，**保留** |
| 撞墙 | 速度反弹 / `-0.5` / 归零、挤压缩放 | 同 | 一致，**保留** |
| 出界 | 底部 `y1+16` 移除，左右上夹取 | 同（不重生） | 一致，**保留** |
| 碎裂 | `deathT` 分支存在但**从未被置位**（测试里手动置 0） | 仅 `SeekerBarrier` 触发；1.0s 后移除 | **改**：删除永不触发的 `deathT` 分支与 `deathTime/deathStep`；本页无 `SeekerBarrier` → 不产生碎裂 |
| 重生 | 无 | **无**（明确结论） | 与页面一致；后续不要再加"等重生" |
| 张开/持有动画 | `openT = vy>20 ? +dt : 0`；`fall/fallLoop` 阈值 0.08s | `vy>20 或逆风`；`fall` 0.06 → `fallLoop` 0.06 | 阈值微差，**视需要统一为 0.06** |
| 压扁/拉长 | 未实现 | 持有 + 上/下输入 → `(1.2,0.8)/(0.7,1.4)` | **保留现状**（外观） |
| 粒子 / 音效 | 部分/无 | 见 §2.5 | **保留现状**（外观） |

### 3.3 网页帧率 / 输入延迟等效

| 项 | 原作（60fps 固定步长） | 网页做法 | 差值 |
|---|---|---|---|
| 所有速度 / 加速度 / 重力 | 每帧 `× Engine.DeltaTime` | 统一 `× dt`，dt 来自 rAF | 60fps 下等价；120fps 下按 dt 细分，轨迹更平滑，总位移不变 |
| 正弦 | `counter += 2π·f·dt` | 同式 | 等价 |
| `OnInterval(0.02 / 0.04 / 0.05)` | 由累计时间触发 | 渲染帧内用 `time` 取模/累计 | 高刷下触发更均匀，粒子数量按时间不变 |
| 输入 | `Input.Feather` 模拟量（死区 **0.25**）+ 每帧采样 | 键盘 8 向归一化（`inputDir()`） | 键盘无模拟量：斜向 = 单位向量，不存在 0.25 死区；转向角速度一致 |
| 抓取 | `Input.GrabCheck`（按住模式默认） | `input.grabHeld` | 等价 |
| 固定步长 | `Engine.DeltaTime` 被限幅 | 建议 `dt = min(dt, 1/30)` 防后台切回跳变 | 仅影响极端掉帧 |

---

## 4. 待确认（请审核后我再改实现）

1. 羽毛**重生**：页面目前是随机刷新池，是否保留？若改成原作 3s 定点重生，需要关卡里固定羽毛坐标。
2. 羽毛**收集反馈**（Shake / P_Collect / SlashFx / 音效）算"外观"，默认不改；如要补请明确。
3. 水母**碎裂**：原作只由 `SeekerBarrier` 触发，本页没有该实体，因此不会碎裂、也没有重生。是否接受"水母在本页永不碎裂"？这与此前"撞碎 / 等重生"的验收项冲突，按 REA 结论应删除 `deathT` 分支。
4. 水母**拾取加速**（-105 / -240）与 **0.16s 吸附曲线**属于手感改动，是否本轮一起做？
5. 飞行退出条件：是否补"落地跳 / 蹬墙 / 抓墙 / 冲刺"四种提前结束？页面当前只有计时结束。
