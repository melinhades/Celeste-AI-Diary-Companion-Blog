# Celeste Dash 冲刺状态机 · 反编译研究报告

> 目标：把 Celeste（原版）的冲刺系统逐行级移植到 `blog-ui/js/celeste-character.js` 的人物引擎。
> 取证日期：本报告所有 C# 代码均为 **逐字原文**，非改写、非记忆复述。

---

## 0. 取证方法与来源边界

| 项目 | 结论 |
|---|---|
| 上游 | `https://github.com/NoelFB/Celeste`（EXOK 官方放出的原版类文件，仓库已于 2023-03-16 归档只读） |
| 目标文件 | `Source/Player/Player.cs` |
| 实际取回 | HTTP 200，**186,844 字节 / 5,471 行**（直连 `raw.githubusercontent.com` 被重置，经 `ghproxy.net` 与 `gh-proxy.com` 两个代理分别取回，字节数一致） |
| 本地副本 | `C:\Users\28464\AppData\Local\Temp\Player.cs` |

### 重要边界（必须知道，否则会照着假代码移植）

该仓库 **不是** MonoGame 移植版全源码，只放出"少量类文件作为学习资源"。实测：

```
Source/Player/Player.cs                 → 200 / 186844
Source/Player/PlayerHair.cs             → 404
Source/Player/PlayerSprite.cs           → 404
Source/Input.cs                         → 404
Source/Player/Assists.cs                → 404
```

因此以下三处**无法给出原文**，本报告会明确标注为「缺口」，不做凭记忆补写：

1. `Input.GetAimVector(Facing)` 的实现 —— 8 向吸附、死区、零输入时回落到 Facing，全在这个函数体内。
2. `StateMachine`（Monocle）的 Begin/Coroutine/Update/End 精确调用顺序。
3. `PlayerHair` 的染色实现（发色常量本身在 Player.cs 里，已拿到）。

> 佐证：Monocle 镜像 `JamesMcMahon/monocle-engine` 的 `Monocle/Entity.cs:95-98` 为 `public virtual void Update() { Components.Update(); }`，可确认 `Player.Update()` 里的 `base.Update()` 会驱动挂在 Player 上的 StateMachine 组件；但 `StateMachine.cs` 在该镜像中 404，内部顺序仍未知。

---

## 1. 冲刺相关常量（原文，行 13–166 节选）

```csharp
// —— 基础移动 ——
public const float MaxFall = 160f;
private const float Gravity = 900f;
private const float HalfGravThreshold = 40f;
private const float FastMaxFall = 240f;
private const float FastMaxAccel = 300f;
public  const float MaxRun = 90f;
public  const float RunAccel = 1000f;
private const float RunReduce = 400f;
private const float AirMult = .65f;

// —— 跳跃 ——
private const float JumpGraceTime = 0.1f;
private const float JumpSpeed = -105f;
private const float JumpHBoost = 40f;
private const float VarJumpTime = .2f;
private const int   UpwardCornerCorrection = 4;
private const float WallSpeedRetentionTime = .06f;

// —— 墙滑 / 墙跳 ——
private const int   WallJumpCheckDist = 3;
private const float WallJumpForceTime = .16f;
private const float WallJumpHSpeed = MaxRun + JumpHBoost;   // = 130
public  const float WallSlideStartMax = 20f;
private const float WallSlideTime = 1.2f;

// —— Super / Super Wall ——
private const float SuperJumpSpeed      = JumpSpeed;              // -105
private const float SuperJumpH          = 260f;
private const float SuperWallJumpSpeed  = -160f;
private const float SuperWallJumpVarTime= .25f;
private const float SuperWallJumpForceTime = .2f;
private const float SuperWallJumpH      = MaxRun + JumpHBoost * 2;// = 170

// —— 冲刺（核心）——
private const float DashSpeed           = 240f;
private const float EndDashSpeed        = 160f;
private const float EndDashUpMult       = .75f;
private const float DashTime            = .15f;
private const float DashCooldown        = .2f;
private const float DashRefillCooldown  = .1f;
private const int   DashHJumpThruNudge  = 6;
private const int   DashCornerCorrection= 4;
private const int   DashVFloorSnapDist  = 3;
private const float DashAttackTime      = .3f;

// —— Ultra / 滑铲 ——
private const float DodgeSlideSpeedMult = 1.2f;
private const float DuckSuperJumpXMult  = 1.25f;
private const float DuckSuperJumpYMult  = .5f;

// —— 攀爬 ——
public  const float ClimbMaxStamina   = 110;
private const float ClimbUpCost       = 100 / 2.2f;   // 45.4545
private const float ClimbStillCost    = 100 / 10f;    // 10
private const float ClimbJumpCost     = 110 / 4f;     // 27.5
private const int   ClimbCheckDist    = 2;
private const int   ClimbUpCheckDist  = 2;
private const float ClimbNoMoveTime   = .1f;
public  const float ClimbTiredThreshold = 20f;
private const float ClimbUpSpeed      = -45f;
private const float ClimbDownSpeed    = 80f;
private const float ClimbSlipSpeed    = 30f;
private const float ClimbAccel        = 900f;
private const float ClimbGrabYMult    = .2f;
private const float ClimbHopY         = -120f;
private const float ClimbHopX         = 100f;
private const float ClimbHopForceTime = .2f;
private const float ClimbJumpBoostTime= .2f;
private const float ClimbHopNoWindTime= .3f;

// —— 其它与冲刺手感相关 ——
private const float BounceAutoJumpTime = .1f;
private const float FlyPowerFlashTime   = .5f;
private const float InfiniteDashesTime = 2f;
private const float InfiniteDashesFirstTime = .5f;
```

### 冲刺相关字段（行 168–294 节选）

```csharp
public int Dashes;
public float Stamina = ClimbMaxStamina;
public Vector2? OverrideDashDirection;

public bool AutoJump;
public float AutoJumpTimer;
private Vector2 lastAim;               // ★ 冲刺方向真正来源
private float dashCooldownTimer;
private float dashRefillCooldownTimer;
public Vector2 DashDir;                // ★ 公开的"本次冲刺方向"
private float dashAttackTimer;
private bool dashStartedOnGround;      // ★ 决定能否向下角修正
private Vector2 beforeDashSpeed;       // ★ 冲刺前速度（同向保留）
private bool wasDashB;
private bool calledDashEvents;
private int lastDashes;                // ★ 与 Dashes 比较触发闪白
private float dashTrailTimer;

// —— 发色（原文 hex）——
public static readonly Color NormalHairColor   = Calc.HexToColor("AC3232"); // 红
public static readonly Color FlyPowerHairColor = Calc.HexToColor("F2EB6D"); // 黄（羽毛专用）
public static readonly Color UsedHairColor     = Calc.HexToColor("44B7FF"); // 蓝
public static readonly Color FlashHairColor    = Color.White;               // 白闪
public static readonly Color TwoDashesHairColor= Calc.HexToColor("ff6def"); // 粉
private float hairFlashTimer;
```

---

## 2. 状态机接线（原文，行 321–355）

```csharp
StateMachine = new StateMachine(23);
StateMachine.SetCallbacks(StNormal, NormalUpdate, null,    NormalBegin, NormalEnd);
StateMachine.SetCallbacks(StClimb,  ClimbUpdate,  null,    ClimbBegin,  ClimbEnd);
StateMachine.SetCallbacks(StDash,   DashUpdate,   DashCoroutine, DashBegin, DashEnd);
...
Add(StateMachine);
```

状态不是 enum，而是 `const int`：

```csharp
public const int StNormal = 0;
public const int StClimb  = 1;
public const int StDash   = 2;
```

### 冲刺状态的三段式结构

| 回调 | 职责 |
|---|---|
| `DashBegin()` | 重置计时器、清空速度、清空 DashDir、记录 `dashStartedOnGround`、触发 0.05s 冻结 |
| `DashCoroutine()` | **真正决定方向和速度**（`yield return null` 后读 `lastAim`），并在 `yield return DashTime` 后做结束速度 |
| `DashUpdate()` | 每帧处理：跳跃打断 → 墙跳 / SuperWallJump / SuperJump、粒子、抓取 |
| `DashEnd()` | 只做 `CallDashEvents()`（音效、计数、事件），**不动速度** |

关键：**速度不是 begin 时给的，是协程第 2 帧给的。** 这是 1 帧延迟的来源，也是 demodash 技术成立的原因。

---

## 3. Dash 生命周期 · 逐行原文

### 3.1 触发条件（行 3358–3384）

```csharp
public int StartDash()
{
    wasDashB = Dashes == 2;
    Dashes = Math.Max(0, Dashes - 1);
    Input.Dash.ConsumeBuffer();
    return StDash;
}

public bool CanDash
{
    get
    {
        return Input.Dash.Pressed && dashCooldownTimer <= 0 && Dashes > 0 &&
            (TalkComponent.PlayerOver == null || !Input.Talk.Pressed);
    }
}
```

`NormalUpdate()` 内的调用点（行 2823–2828）：

```csharp
//Dashing
if (CanDash)
{
    Speed += LiftBoost;
    return StartDash();
}
```

### 3.2 DashBegin（行 3442–3467，原文）

```csharp
private void DashBegin()
{
    calledDashEvents = false;
    dashStartedOnGround = onGround;
    launched = false;

    if (Engine.TimeRate > 0.25f)
        Celeste.Freeze(.05f);          // ★ 3 帧冻结
    dashCooldownTimer = DashCooldown;  // 0.2
    dashRefillCooldownTimer = DashRefillCooldown; // 0.1
    StartedDashing = true;
    wallSlideTimer = WallSlideTime;
    dashTrailTimer = 0;

    level.Displacement.AddBurst(Center, .4f, 8, 64, .5f, Ease.QuadOut, Ease.QuadOut);
    Input.Rumble(RumbleStrength.Strong, RumbleLength.Medium);

    dashAttackTimer = DashAttackTime;   // 0.3 ★ 比 DashTime 长，形成"冲刺攻击窗口"
    beforeDashSpeed = Speed;            // ★ 记录冲刺前速度
    Speed = Vector2.Zero;               // ★ 速度清零！
    DashDir = Vector2.Zero;             // ★ 方向清零！

    if (!onGround && Ducking && CanUnDuck)
        Ducking = false;
}
```

### 3.3 DashCoroutine（行 3548–3634，原文）

```csharp
private IEnumerator DashCoroutine()
{
    yield return null;                 // ★ 第 1 帧速度仍为 0

    var dir = lastAim;
    if (OverrideDashDirection.HasValue)
        dir = OverrideDashDirection.Value;

    var newSpeed = dir * DashSpeed;    // ★ dir 已单位化 → 斜向每轴 169.7
    if (Math.Sign(beforeDashSpeed.X) == Math.Sign(newSpeed.X) &&
        Math.Abs(beforeDashSpeed.X) > Math.Abs(newSpeed.X))
        newSpeed.X = beforeDashSpeed.X;   // ★ 同向且更大 → 保留原水平速度

    Speed = newSpeed;

    if (CollideCheck<Water>())
        Speed *= SwimDashSpeedMult;

    DashDir = dir;
    SceneAs<Level>().DirectionalShake(DashDir, .2f);

    if (DashDir.X != 0)
        Facing = (Facings)Math.Sign(DashDir.X);

    CallDashEvents();

    //Feather particles
    if (StateMachine.PreviousState == StStarFly)
        level.Particles.Emit(FlyFeather.P_Boost, 12, Center, Vector2.One * 4, (-dir).Angle());

    //Dash Slide                              ★★ Ultra 的真正实现位置
    if (onGround && DashDir.X != 0 && DashDir.Y > 0 && Speed.Y > 0
        && (!Inventory.DreamDash || !CollideCheck<DreamBlock>(Position + Vector2.UnitY)))
    {
        DashDir.X = Math.Sign(DashDir.X);
        DashDir.Y = 0;
        Speed.Y = 0;
        Speed.X *= DodgeSlideSpeedMult;     // ×1.2
        Ducking = true;
    }

    SlashFx.Burst(Center, DashDir.Angle());
    CreateTrail();
    dashTrailTimer = .08f;

    //Swap Block check
    if (DashDir.X != 0 && Input.Grab.Check)
    {
        var swapBlock = CollideFirst<SwapBlock>(Position + Vector2.UnitX * Math.Sign(DashDir.X));
        if (swapBlock != null && swapBlock.Direction.X == Math.Sign(DashDir.X))
        {
            StateMachine.State = StClimb;
            Speed = Vector2.Zero;
            yield break;
        }
    }

    //Stick to Swap Blocks
    Vector2 swapCancel = Vector2.One;
    foreach (SwapBlock swapBlock in Scene.Tracker.GetEntities<SwapBlock>())
    {
        if (CollideCheck(swapBlock, Position + Vector2.UnitY))
        {
            if (swapBlock != null && swapBlock.Swapping)
            {
                if (DashDir.X != 0 && swapBlock.Direction.X == Math.Sign(DashDir.X))
                    Speed.X = swapCancel.X = 0;
                if (DashDir.Y != 0 && swapBlock.Direction.Y == Math.Sign(DashDir.Y))
                    Speed.Y = swapCancel.Y = 0;
            }
        }
    }

    yield return DashTime;             // 0.15s

    CreateTrail();

    AutoJump = true;                   // ★ 注意：AutoJumpTimer = 0
    AutoJumpTimer = 0;
    if (DashDir.Y <= 0)                // ★★ 只有"非向下"才重置速度
    {
        Speed = DashDir * EndDashSpeed;
        Speed.X *= swapCancel.X;
        Speed.Y *= swapCancel.Y;
    }
    if (Speed.Y < 0)                   // ★ 向上分量再 ×0.75
        Speed.Y *= EndDashUpMult;
    StateMachine.State = StNormal;
}
```

### 3.4 DashUpdate（行 3474–3546，原文核心）

```csharp
private int DashUpdate()
{
    StartedDashing = false;

    //Trail
    if (dashTrailTimer > 0) { dashTrailTimer -= Engine.DeltaTime; if (dashTrailTimer <= 0) CreateTrail(); }

    //Grab Holdables ...

    if (DashDir.Y == 0)                        // ★ 纯水平冲
    {
        //JumpThru Correction
        foreach (JumpThru jt in Scene.Tracker.GetEntities<JumpThru>())
            if (CollideCheck(jt) && Bottom - jt.Top <= DashHJumpThruNudge)
                MoveVExact((int)(jt.Top - Bottom));

        //Super Jump                            ★★ 条件：水平冲 + 跳跃缓冲 + 土狼期
        if (CanUnDuck && Input.Jump.Pressed && jumpGraceTimer > 0)
        {
            SuperJump();
            return StNormal;
        }
    }

    if (DashDir.X == 0 && DashDir.Y == -1)     // ★★ 纯上冲 → SuperWallJump（wallbounce）
    {
        if (Input.Jump.Pressed && CanUnDuck)
        {
            if (WallJumpCheck(1)) { SuperWallJump(-1); return StNormal; }
            else if (WallJumpCheck(-1)) { SuperWallJump(1); return StNormal; }
        }
    }
    else                                       // ★ 其余方向 → 普通墙跳
    {
        if (Input.Jump.Pressed && CanUnDuck)
        {
            if (WallJumpCheck(1)) { WallJump(-1); return StNormal; }
            else if (WallJumpCheck(-1)) { WallJump(1); return StNormal; }
        }
    }

    if (Speed != Vector2.Zero && level.OnInterval(0.02f))
        level.ParticlesFG.Emit(wasDashB ? P_DashB : P_DashA, ...);
    return StDash;
}
```

### 3.5 DashEnd（行 3469–3472）

```csharp
private void DashEnd()
{
    CallDashEvents();
}
```

---

## 4. 冲刺速度数学 · 精确表

前提：`lastAim` 是单位向量，`Speed = dir * 240`。

| 冲刺方向 | 冲刺中 vx | 冲刺中 vy | 冲刺结束 vx | 冲刺结束 vy | 说明 |
|---|---|---|---|---|---|
| 右 → | **240** | 0 | **160** | 0 | `DashDir.Y=0` → 重置 |
| 左 ← | -240 | 0 | -160 | 0 | 同上 |
| 上 ↑ | 0 | **-240** | 0 | **-120** | 重置 160 后 `Y*=0.75` |
| 下 ↓ | 0 | **240** | 0 | **240（不重置）** | `DashDir.Y>0` → 跳过重置 |
| 右上 ↗ | **169.7** | **-169.7** | **113.1** | **-84.9** | 169.7→×160/240=113.1，Y 再 ×0.75 |
| 左上 ↖ | -169.7 | -169.7 | -113.1 | -84.9 | |
| 右下 ↘ | 169.7 | **169.7** | 169.7 | **169.7（不重置）** | Y>0 跳过重置 |
| 左下 ↙ | -169.7 | 169.7 | -169.7 | 169.7 | |

**要点**
- 斜向**总速度仍为 240**，不是 1.414 倍。`169.7 = 240/√2`。
- 向下 / 下斜冲刺结束时**不做任何速度重置**，直接带着冲刺速度进入下落。
- 向上 / 上斜在重置后对 Y 再乘 0.75。
- `EndDashUpMult` 的判断是 `if (Speed.Y < 0)`，即对**最终速度的 Y** 判定，而不是对 `DashDir.Y`。

---

## 5. 两个冷却：为什么必须分开

```csharp
dashCooldownTimer       = DashCooldown;        // 0.2s = 12 tick @60Hz
dashRefillCooldownTimer = DashRefillCooldown;  // 0.1s = 6 tick  @60Hz
```

两者**都在 DashBegin 时启动**，但语义完全不同：

| 计时器 | 管什么 | 阻挡什么 |
|---|---|---|
| `dashCooldownTimer` | 动作能否再次发生 | `CanDash` 里 `dashCooldownTimer <= 0` |
| `dashRefillCooldownTimer` | 资源何时恢复 | Update 里回充分支整体被跳过 |

如果合并成一个值，贴地冲刺会在冲刺途中立刻回充 → 无限地面冲刺。
0.1s 的回充抑制窗口，正是 extended super / hyper / wavedash **必须滑行约 2 格跑道**才能被充能跳起的根本原因。

### 回充逻辑（原文，行 722–740）

```csharp
//Dashes
{
    if (dashCooldownTimer > 0)
        dashCooldownTimer -= Engine.DeltaTime;

    if (dashRefillCooldownTimer > 0)
        dashRefillCooldownTimer -= Engine.DeltaTime;
    else if (SaveData.Instance.AssistMode && SaveData.Instance.Assists.DashMode == Assists.DashModes.Infinite && !level.InCutscene)
        RefillDash();
    else if (!Inventory.NoRefills)
    {
        if (StateMachine.State == StSwim)
            RefillDash();
        else if (onGround)
            if (CollideCheck<Solid, NegaBlock>(Position + Vector2.UnitY) ||
                CollideCheckOutside<JumpThru>(Position + Vector2.UnitY))
                if (!CollideCheck<Spikes>(Position) ||
                    (SaveData.Instance.AssistMode && SaveData.Instance.Assists.Invincible))
                    RefillDash();
    }
}
```

```csharp
public bool RefillDash()
{
    if (Dashes < MaxDashes) { Dashes = MaxDashes; return true; }
    else return false;
}

public int MaxDashes
{
    get
    {
        if (SaveData.Instance.AssistMode && SaveData.Instance.Assists.DashMode != Assists.DashModes.Normal && !level.InCutscene)
            return 2;
        else
            return Inventory.Dashes;
    }
}
```

> 注意：**是满充（`Dashes = MaxDashes`），不是"补一发"**。仓库里不存在 `dashes = 1` 这种写法。
> 地面回充还要求：脚下正下方有实体、且**不在刺上**。

---

## 6. Ultra / Hyper / SuperJump / SuperWallJump · 精确触发条件

这是全篇最容易移植错的部分。社区常说的 "wallbounce 是水平冲撞墙" 是**错的**。

### 6.1 Ultra（Dash Slide）—— 两处实现

位置 A：`DashCoroutine` 内（冲刺**开始后第 2 帧**，见 3.3）
位置 B：`OnCollideV` 内（冲刺途中**落地瞬间**，行 2544–2552）

```csharp
//Dash Slide（OnCollideV，在 if (Speed.Y > 0) 分支内）
if (DashDir.X != 0 && DashDir.Y > 0 && Speed.Y > 0)
{
    DashDir.X = Math.Sign(DashDir.X);
    DashDir.Y = 0;
    Speed.Y = 0;
    Speed.X *= DodgeSlideSpeedMult;   // ×1.2
    Ducking = true;
}
```

**触发条件（三处共同）**
1. `DashDir.X != 0` —— 必须有水平分量（纯下冲不触发）
2. `DashDir.Y > 0` —— 必须是**下斜**方向
3. `Speed.Y > 0` —— 必须正在下落
4. 落地（`OnCollideV`）或起手就在地面（协程）

**结果**：`vy = 0`、`vx *= 1.2`、`Ducking = true`、`DashDir.Y` 被归零。
因为 `DashDir.Y` 归零，冲刺结束时 `DashDir.Y <= 0` 成立 → 速度会被重置为 `±160`。
所以 ultra 的收益不是"永久 1.2 倍"，而是**落地不清零、进入蹲滑、并在冲刺结束时拿到 160 的基准速度**。

社区常说的链式 ultra 每次 ×1.2 且无上限，来自**落地后不再处于 dash 状态**时的另一条路径（下一次下斜冲刺再触发），本仓库版本中确实没有速度上限检查。

### 6.2 Hyper / Wavedash —— 是 SuperJump 的蹲下变体

```csharp
private void SuperJump()
{
    Input.Jump.ConsumeBuffer();
    jumpGraceTimer = 0;
    varJumpTimer = VarJumpTime;
    AutoJump = false;
    dashAttackTimer = 0;
    wallSlideTimer = WallSlideTime;
    wallBoostTimer = 0;

    Speed.X = SuperJumpH * (int)Facing;   // 260
    Speed.Y = JumpSpeed;                  // -105
    Speed += LiftBoost;

    Play(Sfxs.char_mad_jump);

    if (Ducking)
    {
        Ducking = false;
        Speed.X *= DuckSuperJumpXMult;    // ×1.25 → 325
        Speed.Y *= DuckSuperJumpYMult;    // ×0.5  → -52.5
        Play(Sfxs.char_mad_jump_superslide);
    }
    else
        Play(Sfxs.char_mad_jump_super);

    varJumpSpeed = Speed.Y;
    launched = true;
    Sprite.Scale = new Vector2(.6f, 1.4f);
    Dust.Burst(BottomCenter, Calc.Up, 4);
    SaveData.Instance.TotalJumps++;
}
```

- **Super**：水平冲（`DashDir.Y == 0`）+ 跳跃缓冲 + `jumpGraceTimer > 0` → `(±260, -105)`
- **Hyper / Wavedash**：同上但当时 `Ducking == true` → `(±325, -52.5)`
- 起跳方向由 **Facing** 决定，与冲刺方向无关（所以能反向 super）

### 6.3 SuperWallJump（真正的 wallbounce）

`DashUpdate` 内要求 `DashDir.X == 0 && DashDir.Y == -1` —— **必须是纯正交向上冲**，上斜不行。

```csharp
private void SuperWallJump(int dir)      // 注意签名是 int，不是 Vector2
{
    Ducking = false;
    Input.Jump.ConsumeBuffer();
    jumpGraceTimer = 0;
    varJumpTimer = SuperWallJumpVarTime;  // 0.25（普通跳是 0.2）
    AutoJump = false;
    dashAttackTimer = 0;
    wallSlideTimer = WallSlideTime;
    wallBoostTimer = 0;

    Speed.X = SuperWallJumpH * dir;       // 170 * dir
    Speed.Y = SuperWallJumpSpeed;         // -160
    Speed += LiftBoost;
    varJumpSpeed = Speed.Y;
    launched = true;

    Play(dir < 0 ? Sfxs.char_mad_jump_wall_right : Sfxs.char_mad_jump_wall_left);
    Play(Sfxs.char_mad_jump_superwall);
    Sprite.Scale = new Vector2(.6f, 1.4f);
    ...
}
```

`dir` 的语义：`WallJumpCheck(1)` 查到**右边有墙** → 调用 `SuperWallJump(-1)` → `vx = 170 × (-1) = -170`，即**向左弹离右墙**。
所以 `dir` = 运动方向 = **背离墙**。

### 6.4 还有一条 NormalUpdate 里的 "延迟 wallbounce" 通道

`NormalUpdate()` 跳跃分支（行 2970–3004 节选）：

```csharp
if (canUnduck && WallJumpCheck(1))
{
    if (Facing == Facings.Right && Input.Grab.Check && Stamina > 0 && Holding == null && !ClimbBlocker.Check(...))
        ClimbJump();
    else if (DashAttacking && DashDir.X == 0 && DashDir.Y == -1)
        SuperWallJump(-1);
    else
        WallJump(-1);
}
else if (canUnduck && WallJumpCheck(-1))
{
    ...
    else if (DashAttacking && DashDir.X == 0 && DashDir.Y == -1)
        SuperWallJump(1);
    else
        WallJump(1);
}
```

`DashAttacking` 的定义：

```csharp
public bool DashAttacking
{
    get { return dashAttackTimer > 0 || StateMachine.State == StRedDash; }
}
```

`dashAttackTimer = DashAttackTime = 0.3s`，而 `DashTime = 0.15s`。
→ **冲刺状态结束后还有 0.15s 的窗口，仍能触发 SuperWallJump。** 这就是 wallbounce 手感宽容的来源。
同时这个分支还处理 `Grab + Stamina>0` → **ClimbJump**，即爬墙跳优先于墙跳。

### 6.5 普通墙跳

```csharp
private void WallJump(int dir)
{
    Ducking = false;
    Input.Jump.ConsumeBuffer();
    jumpGraceTimer = 0;
    varJumpTimer = VarJumpTime;
    AutoJump = false;
    dashAttackTimer = 0;
    wallSlideTimer = WallSlideTime;
    wallBoostTimer = 0;
    if (moveX != 0)
    {
        forceMoveX = dir;
        forceMoveXTimer = WallJumpForceTime;   // 0.16
    }
    ...
    Speed.X = WallJumpHSpeed * dir;   // 130 * dir
    Speed.Y = JumpSpeed;              // -105
    Speed += LiftBoost;
    varJumpSpeed = Speed.Y;
    ...
}
```

- 速度 **130 / -105**，`dir` 同样是背离墙方向。
- `forceMoveX` 只在**有方向输入**时锁定 0.16s —— 中立的墙跳可以立刻回头。
- `WallJumpCheck` 探测距离 **3px**（`WallJumpCheckDist`）。

### 6.6 三种"冲 + 跳"组合速查

| 动作 | 输入 | 结果速度 |
|---|---|---|
| Super | 水平冲 + 跳（土狼期内） | `(±260, -105)` |
| Hyper / Wavedash | 水平冲 + 跳到下蹲落地 | `(±325, -52.5)` |
| SuperWallJump（wallbounce） | **纯上冲** + 贴墙跳 | `(∓170, -160)`，varJump 0.25s |
| WallJump | 任意非纯上冲 + 贴墙跳 | `(∓130, -105)` |

---

## 7. 角修正（Corner Correction）· 全部原文

Celeste 手感的核心宽容机制，共四处，数值都是像素。

**基础常量**
```
UpwardCornerCorrection = 4    // 上撞天花板
DashCornerCorrection   = 4    // 冲刺撞边沿
DashVFloorSnapDist     = 3    // 水平冲离地吸附
DashHJumpThruNudge     = 6    // 从 JumpThru 下方吸上去
WallJumpCheckDist      = 3    // 墙跳探测
```

### 7.1 OnCollideH：冲刺撞水平墙（行 2398–2443）

```csharp
//Dash corner correction
if (StateMachine.State == StDash || StateMachine.State == StRedDash)
{
    if (onGround && DuckFreeAt(Position + Vector2.UnitX * Math.Sign(Speed.X)))
    {
        Ducking = true;
        return;
    }
    else if (Speed.Y == 0 && Speed.X != 0)
    {
        for (int i = 1; i <= DashCornerCorrection; i++)
        {
            for (int j = 1; j >= -1; j -= 2)
            {
                if (!CollideCheck<Solid>(Position + new Vector2(Math.Sign(Speed.X), i * j)))
                {
                    MoveVExact(i * j);
                    MoveHExact(Math.Sign(Speed.X));
                    return;
                }
            }
        }
    }
}

//Speed retention                        ★ 撞墙后 0.06s 内墙消失则返还速度
if (wallSpeedRetentionTimer <= 0)
{
    wallSpeedRetained = Speed.X;
    wallSpeedRetentionTimer = WallSpeedRetentionTime;   // 0.06
}

...
Speed.X = 0;
dashAttackTimer = 0;                    // ★ 撞墙会清掉 DashAttacking 窗口
```

### 7.2 OnCollideV：冲刺撞地/天花板（行 2504–2534）

```csharp
if (Speed.Y > 0)
{
    //Dash corner correction
    if ((StateMachine.State == StDash || StateMachine.State == StRedDash) && !dashStartedOnGround)
    {
        if (Speed.X <= 0)
            for (int i = -1; i >= -DashCornerCorrection; i--)
                if (!OnGround(Position + new Vector2(i, 0)))
                { MoveHExact(i); MoveVExact(1); return; }

        if (Speed.X >= 0)
            for (int i = 1; i <= DashCornerCorrection; i++)
                if (!OnGround(Position + new Vector2(i, 0)))
                { MoveHExact(i); MoveVExact(1); return; }
    }
    ...
}
```

### 7.3 Dash Floor Snapping（Update 内，行 917–921）

```csharp
//Dash Floor Snapping
if (!onGround && DashAttacking && DashDir.Y == 0)
{
    if (CollideCheck<Solid>(Position + Vector2.UnitY * DashVFloorSnapDist) ||
        CollideCheckOutside<JumpThru>(Position + Vector2.UnitY * DashVFloorSnapDist))
        MoveVExact(DashVFloorSnapDist);
}
```

### 7.4 JumpThru Assist（Update 内，行 912–916）

```csharp
if (!onGround && Speed.Y <= 0 && (StateMachine.State != StClimb || lastClimbMove == -1) &&
    CollideCheck<JumpThru>() && !JumpThruBoostBlockedCheck())
    MoveV(JumpThruAssistSpeed * Engine.DeltaTime);    // -40
```

---

## 8. 8 方向瞄准 · 归一化

### 8.1 Player 侧可核实的全部事实

```csharp
// Update() 内，行 796–797
//Aiming
lastAim = Input.GetAimVector(Facing);

// 初始值，行 350
lastAim = Vector2.UnitX;

// DashCoroutine 内 —— 没有任何二次归一化
var dir = lastAim;
var newSpeed = dir * DashSpeed;
```

### 8.2 缺口（重要）

`Input.GetAimVector(Facing)` 的实现**不在官方仓库**（`Source/Input.cs` 404）。因此：

- **无法逐字给出**：死区阈值、对角线吸附角度、零输入时回落到 `Facing` 的具体写法、摇杆模拟量处理。
- 可以确定的：`Player.cs` **不做二次归一化**，所以 `lastAim` 必须已经是单位向量。
- 间接证据（`CallDashEvents`，行 3405–3407）：

```csharp
var rightDashSound = DashDir.Y < 0 || (DashDir.Y == 0 && DashDir.X > 0);
if (DashDir == Vector2.Zero)
    rightDashSound = Facing == Facings.Right;
```

说明 **`DashDir` 确实可能是零向量**（在 `DashBegin` 清零后、协程赋值前）。而实际冲刺方向永远不会是零，因为 `GetAimVector` 在无输入时回落到 Facing。

### 8.3 移植结论

- 8 方向、单位化、斜向每轴 `240/√2 = 169.7`。
- 无方向输入时，**必须回落到 `Facing` 的正右/正左**，否则 `dir * 240 = 0`，冲刺原地不动。

---

## 9. 头发颜色语义（原文，行 1123–1160）

```csharp
public void UpdateHair(bool applyGravity)
{
    // color
    if (StateMachine.State == StStarFly)
    {
        Hair.Color = Sprite.Color;
        applyGravity = false;
    }
    else if (Dashes == 0 && Dashes < MaxDashes)
        Hair.Color = Color.Lerp(Hair.Color, UsedHairColor, 6f * Engine.DeltaTime);
    else
    {
        Color color;
        if (lastDashes != Dashes)
        {
            color = FlashHairColor;      // 白闪
            hairFlashTimer = .12f;
        }
        else if (hairFlashTimer > 0)
        {
            color = FlashHairColor;
            hairFlashTimer -= Engine.DeltaTime;
        }
        else if (Dashes == 2)
            color = TwoDashesHairColor;  // 粉
        else
            color = NormalHairColor;     // 红

        Hair.Color = color;
    }

    if (OverrideHairColor != null)
        Hair.Color = OverrideHairColor.Value;

    Hair.Facing = Facing;
    Hair.SimulateMotion = applyGravity;
    lastDashes = Dashes;
}
```

### 语义表（★ 纠正常见误解）

| 颜色 | hex | 含义 |
|---|---|---|
| 红 | `AC3232` | 有 1 格冲刺（正常） |
| 粉 | `FF6DEF` | 有 2 格冲刺 |
| 蓝 | `44B7FF` | **冲刺已用完**（`Dashes == 0 && Dashes < MaxDashes`），按 `6f × dt` 渐变 |
| 白 | `FFFFFF` | **闪白**，`hairFlashTimer = 0.12s`，在 `lastDashes != Dashes` 时触发（用掉、回充都会闪） |
| 黄 | `F2EB6D` | **只用于羽毛 / star-fly 状态**，与冲刺无关 |

`FlyPowerHairColor` 在 `Player.cs` 中**只出现在声明处**，全文无其他引用 —— 说明它由其他类（羽毛能力）使用。

**结论**：冲刺瞬间不是变黄，是**变白闪 0.12s**，之后若没冲刺了则渐变到蓝。

---

## 10. 与当前 demo 实现的偏差清单（本次移植要修的全部）

下表左列是本项目 `js/celeste-character.js` 现状，右列是原文事实。

| # | 当前实现 | 原作事实 | 影响 |
|---|---|---|---|
| **D1** | `beginDash` 立即设 `vx/vy = dir*240` | `DashBegin` 把速度**清零**，协程 `yield return null` 后下一帧才赋值 | 少 1 帧延迟；demodash 不成立；冲刺首帧轨迹不同 |
| **D2** | `aimX/aimY` 全为 0 时 `dashDir = {0,0}`，速度 0 | 必须回落 `Facing`（`GetAimVector` 保证非零） | **按住 J 不放方向键会原地不动（致命）** |
| **D3** | `endDash` 无条件 `vx/vy = dashDir*160`，Y<0 再 ×0.75 | 只有 `DashDir.Y <= 0` 才重置；**向下 / 下斜完全不重置** | 下冲结束后速度被错误砍到 160，丢失 240 惯性 |
| **D4** | 水平冲撞墙 → 直接 WallBounce `(±170,-160)` | 水平冲撞墙**只是清零 + 0.06s 速度保留**；wallbounce 必须**纯上冲 + 跳** | 核心机制错误：现在按方向冲墙会自动弹，且弹射方向逻辑不同 |
| **D5** | Ultra：`endDash` 时置 `ultraDashPending`，**着地时** ×1.2 | 在**冲刺途中落地（OnCollideV）**或**起手在地面（协程）**触发，且同时 `vy=0`、`Ducking=true`、`DashDir.Y=0` | 时机错一个阶段，且缺少蹲滑状态 |
| **D6** | 无 `DashAttackTime` 概念 | `dashAttackTimer = 0.3s`，冲刺状态只 0.15s → 后 0.15s 仍可 wallbounce / 判 `DashAttacking` | wallbounce 窗口短了一半，手感偏硬 |
| **D7** | 无 SuperJump（水平冲 + 跳） | 水平冲 + 跳 → `(±260,-105)`；蹲下 → `(±325,-52.5)` | 缺少 super / hyper / wavedash 整套 |
| **D8** | 无 `beforeDashSpeed` 同向保留 | 冲刺前同向且更大的水平速度会被保留 | 高速连冲会掉速 |
| **D9** | 冲刺头发变**黄** `F2EB6D` | 冲刺瞬间是**白闪 0.12s**；黄是羽毛专用；`dashes==0` 才渐变蓝 | 颜色语义错误 |
| **D10** | `autoJump` 在着地时**自动起跳** | `AutoJump = true; AutoJumpTimer = 0`，唯一作用是重力减半（`HalfGravThreshold` 判定里 `|| AutoJump`），**不自动跳** | 冲刺结束会莫名自动弹跳 |
| **D11** | 无角修正 | `DashCornerCorrection=4`、`DashVFloorSnapDist=3`、`DashHJumpThruNudge=6`、`UpwardCornerCorrection=4` | 擦边跳跃手感缺失（Celeste 手感的一半） |
| **D12** | 无 `WallSpeedRetentionTime` | 撞墙记录 `wallSpeedRetained`，0.06s 内可返还（cornerboost） | 缺机制 |
| **D13** | `SuperWallJump` 常量已定义但未使用 | 应对应 6.3 的真实触发路径 | 死代码 |

---

## 11. 移植实现方案（按原文顺序）

### 11.1 帧模型

- 固定 **60 Hz** 累加器，绝不用渲染帧推进物理。
- 每个 dash 的帧预算：**冻结 3 帧**（0.05s）+ **速度延迟 1 帧** + **冲刺 9 帧**（0.15s）= 13 帧；冷却 12 帧；回充抑制 6 帧；`dashAttackTimer` 窗口 18 帧。

### 11.2 代码结构

```js
// Dash 状态需要拆成"子相位"，因为原作是 Begin + Coroutine + Update 三件套
this.dashPhase   // 0 = begin（速度 0）  1 = 已赋速
                  // 用 dashPhase 复现协程的 yield return null
this.dashFreeze  // 0.05 秒冻结，倒计时 > 0 时跳过所有物理
```

伪代码顺序（严格对齐原作）：

```
update(dt):
  1. 冻结倒计时（>0 则只递减，return）
  2. 递减 dashCooldownTimer / dashRefillCooldownTimer
  3. 回充判断（dashRefillCooldownTimer<=0 && onGround && 脚下实体 && !刺）
  4. lastAim = getAimVector(facing)      // 零输入 → facing
  5. base.Update() → StateMachine 分发
       StDash: dashUpdate()
       StNormal: normalUpdate() 内含 CanDash → startDash()
  6. MoveH / MoveV（含角修正、速度保留）
  7. dash floor snapping / jumpthru assist
  8. UpdateHair()
```

### 11.3 dashUpdate 复现协程

```js
dashFrame(dt) {
  // —— 对应 yield return null：首帧不赋速 ——
  if (!this.dashSpeedSet) {
    let dir = this.lastAim;
    let ns = { x: dir.x * DASH_SPEED, y: dir.y * DASH_SPEED };
    // beforeDashSpeed 同向保留（D8）
    if (Math.sign(this.beforeDashSpeed.x) === Math.sign(ns.x) &&
        Math.abs(this.beforeDashSpeed.x) > Math.abs(ns.x))
      ns.x = this.beforeDashSpeed.x;
    this.vx = ns.x; this.vy = ns.y;
    this.dashDir = dir;
    if (dir.x !== 0) this.facing = Math.sign(dir.x);

    // Dash Slide（D5，起手即在地面）
    if (this.onGround && dir.x !== 0 && dir.y > 0 && this.vy > 0)
      this.dashSlide();          // vy=0, vx*=1.2, dashDir.y=0, ducking=true

    this.dashSpeedSet = true;
    return;                      // 本帧不再推进 dashTime
  }

  // —— 每帧：跳跃打断（D4/D7 唯一正确入口）——
  if (this.jumpBufferTimer > 0) {
    if (this.dashDir.y === 0 && this.jumpGraceTimer > 0) { this.superJump(); return; }
    if (this.dashDir.x === 0 && this.dashDir.y === -1) {
      if (this.wallCheck(+1)) { this.superWallJump(-1); return; }
      if (this.wallCheck(-1)) { this.superWallJump(+1); return; }
    } else {
      if (this.wallCheck(+1)) { this.wallJump(-1); return; }
      if (this.wallCheck(-1)) { this.wallJump(+1); return; }
    }
  }

  this.dashTime -= dt;
  if (this.dashTime <= 0) this.dashEnd();
}

dashEnd() {
  this.autoJump = true; this.autoJumpTimer = 0;      // D10：不自动跳
  if (this.dashDir.y <= 0) {                          // D3：只有非向下才重置
    this.vx = this.dashDir.x * END_DASH_SPEED;
    this.vy = this.dashDir.y * END_DASH_SPEED;
  }
  if (this.vy < 0) this.vy *= END_DASH_UP_MULT;
  this.state = ST_NORMAL;
}
```

---

## 12. 未解 / 未验证（诚实标注）

| 项 | 状态 |
|---|---|
| `Input.GetAimVector` 的死区与对角吸附阈值 | **无法从官方仓库取得实现**；本移植采用"8 向单位化 + 零输入回落 Facing"的等价实现 |
| `StateMachine` 的 Begin/Coroutine/Update/End 精确调用次序 | 官方仓库不含 Monocle；本移植用 `dashSpeedSet` 标记等价复现 `yield return null` |
| 发色 `hairFlashTimer = .12f` 的具体字面量 | 在本次取回的 `Player.cs` 中**未出现在常量块**，而是在方法体内联赋值，故为方法内字面量；已按 0.12s 实现 |
| "冲刺状态 10 tick" vs Celeste Wiki "15 帧" | 源码 `DashTime=0.15s` = 9 tick + 1 tick 延迟 = 10 tick；Wiki 的 15 帧实际量的是 `DashCooldown` 窗口（12 tick + 3 冻结） |
| 官方博客称墙跳离墙 2px，源码 `WallJumpCheckDist = 3` | 以源码 3px 为准，接受 ±1~2px 口径差 |
| 1.4.0/1.4.1 角修正行为变更（带刺角不再修正） | 仅据 changelog 摘要，未逐条核对，移植中不做刺处理 |

---

## 13. 参考链接

- [Player.cs 原文（EXOK 官方，归档）](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs)
- 可用镜像：`https://ghproxy.net/https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs`
- [Movement and Physics Constants Reference](https://teemo.dev/game-design/celeste/systems/movement-and-physics-constants-reference/)
- [Celeste Wiki · Dash](https://celeste.miraheze.org/wiki/Dash) · [Tech](https://celeste.miraheze.org/wiki/Tech) · [Ultras](https://celeste.miraheze.org/wiki/Ultras) · [Wallbounces](https://celeste.miraheze.org/wiki/Wallbounces) · [Superdashes](https://celeste.miraheze.org/wiki/Superdashes) · [Wavedashes](https://celeste.miraheze.org/wiki/Wavedashes) · [Dash Refills](https://celeste.miraheze.org/wiki/Dash_Refills)
- [官方博客 · Celeste and Forgiveness](https://www.mattmakesgames.com/articles/celeste_and_forgiveness/index.html)
- [官方 Changelog](https://www.celestegame.com/changelog.html)

---
---

# 第二轮：其余全部动作的二进制级反编译（REA · 全状态机）

> 第 1–13 章针对 `StDash`。第 14 章起把 **`Celeste.Player` 剩余的全部状态**（Swim / Boost / RedDash / HitSquash / Launch / Pickup / DreamDash / SummitLaunch / Dummy / Intro* / BirdDashTutorial / Frozen / ReflectionFall / StarFly / TempleFall / CassetteFly / Attract / FlingBird / IntroThinkForABit）用同一套 REA 管线反编译完全。

## 14. 取证方法与产物（REA 6.8.0）

| 项 | 值 |
|---|---|
| 工具 | `rea-agents@6.8.0`（CLI 175 命令 / MCP stdio 229 tools） |
| 关键命令 | `rea inspect-managed-members Celeste.dll --type Celeste.Player --format json` |
| 目标 | `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` |
| sha256 | `999024e23285acc0c7ac37b6ed33874e16a1f0f9af5fdeff66a64050b78f8e24` |
| byte_length | 5223424 · PE x86 · metadata v4.0.30319 |
| MVID | `4a26f9de-d670-4c87-a2f4-7e66d2d85163` · module name `Celeste.exe` |
| 规模 | TypeDef 3023 / MethodDef 18414 / MemberRef 28220 |
| `Celeste.Player` | token `0x020007c9` · 220 methods / 355 fields / 132 user_strings / 2664 call_edges / 2952 field_accesses |
| 覆盖度 | `coverage.state = "complete"`, `issues = []`；每个方法 `instruction_count == decoded_instruction_count`（**无截断**） |

**证据等级（必须知道）**：`rea decompile` 对托管程序集返回 `provider_unavailable`（`details.operation: procedure_pseudo_code`）；`rea doctor` 显示 provider `ghidra/ida/jadx/kuna` **全部未配置**，且四者都不是 .NET 反编译器。因此本轮**拿不到 C# 伪代码**，得到的是：

1. 完整元数据（类型 / 方法 / 字段 / MemberRef / 字符串字面量）；
2. **每个方法的完整 IL 指令流**（`il_offset` + opcode + operand token），已按 `token → 类型.成员名` 全量注名；
3. 用户字符串字面量（`#US` 堆，含动画 ID 与 **`States` 枚举成员名**）。

下文所有常数、条件、转移均来自第 2/3 项，标注为 **IL 级证据**；凡只有推测的地方一律进第 19 章「缺口」。

产物文件：

| 文件 | 内容 |
|---|---|
| `%TEMP%\rea\player.json` (18.4 MB) | `Celeste.Player` 全量元数据 + IL anchors |
| `%TEMP%\rea\hair.json` (15.2 MB) | `Celeste.PlayerHair` 全量 |
| `%TEMP%\rea\annotated.txt` (840 行 / 327 KB) | Player + PlayerHair **全部 231 个方法**的已注名 IL |
| `%TEMP%\rea\report-full.txt` (415 行) | 方法表 + 常量表 + 用户字符串 + 调用边 |
| `%TEMP%\rea\iloff.js` | 按 `il_offset` 打印单个方法 IL（可用 `node iloff.js <方法名…>` 复现本章任一结论） |

---

## 15. `Celeste.Player.States` 枚举 · 完整重建（双重证据）

**证据 A（#US 字面量顺序）**：`Celeste.Player` 的 `user_strings` 中，从 `"Normal"` 起连续出现 25 个状态名，顺序与声明顺序一致：

```
Normal Climb Dash Swim Boost RedDash HitSquash Launch Pickup DreamDash SummitLaunch
IntroWalk IntroJump IntroRespawn IntroWakeUp BirdDashTutorial Frozen ReflectionFall
StarFly TempleFall CassetteFly Attract IntroMoonJump FlingBird IntroThinkForABit
```

**证据 B（IL 常量，13 处独立命中）**：

| 位置 | IL 常量 | 含义 |
|---|---|---|
| `DashUpdate` / `StartDash` | `2` | Dash |
| `SwimUpdate` 尾部 | `3` | Swim |
| `Boost` / `BoostUpdate` | `4` | Boost |
| `RedDashUpdate` / `BoostUpdate` 红支 | `5` | RedDash |
| `OnCollideH/OnCollideV` 硬撞 | `6` | HitSquash |
| `ExplodeLaunch` / `FinalBossPushLaunch` / `BadelineBoostLaunch` / `LaunchUpdate` | `7` | Launch |
| `LaunchUpdate`/`NormalUpdate` 拾取支 | `8` | Pickup |
| `DreamDashUpdate` 尾部 | `9` | DreamDash |
| `SummitLaunch` | `10` | SummitLaunch |
| `DummyUpdate` 尾部 + `StartTempleMirrorVoidSleep` | `11` | **Dummy** |
| `Player.Added` IntroType=WalkIn* 分支 | `12` | IntroWalk |
| `Player.Added` IntroType=Jump 分支 | `13` | IntroJump |
| `Player.Added` IntroType=Respawn 分支 | `14` | IntroRespawn |
| `Player.Added` IntroType=WakeUp 分支 | `15` | IntroWakeUp |
| `BirdDashTutorialUpdate` | `16` | BirdDashTutorial |
| `FrozenUpdate` | `17` | Frozen |
| `ReflectionFallUpdate` + `Player.Added` 一支 | `18` | ReflectionFall |
| `StartStarFly` / `StarFlyUpdate` | `19` | StarFly |
| `TempleFallUpdate` | `20` | TempleFall |
| `StartCassetteFly` / `CassetteFlyUpdate` | `21` | CassetteFly |
| `StartAttract` / `AttractUpdate` | `22` | Attract |
| `DoFlingBird` / `FlingBirdUpdate` | `24` | FlingBird |
| `Player.Added` 最后一支 | `25` | IntroThinkForABit |

**结论表（数值 0–10 与 12–25 全部由 IL 直接证实；11 = Dummy 由 `DummyUpdate` 返回 11 证实，且 `"Dummy"` 字面量位于 #US 的另一段偏移，故不在证据 A 的连续序列里）：**

| # | 名称 | # | 名称 | # | 名称 |
|---|---|---|---|---|---|
| 0 | Normal | 9 | DreamDash | 18 | ReflectionFall |
| 1 | Climb | 10 | SummitLaunch | 19 | StarFly |
| 2 | Dash | 11 | **Dummy** | 20 | TempleFall |
| 3 | Swim | 12 | IntroWalk | 21 | CassetteFly |
| 4 | Boost | 13 | IntroJump | 22 | Attract |
| 5 | RedDash | 14 | IntroRespawn | 23 | IntroMoonJump |
| 6 | HitSquash | 15 | IntroWakeUp | 24 | FlingBird |
| 7 | Launch | 16 | BirdDashTutorial | 25 | IntroThinkForABit |
| 8 | Pickup | 17 | Frozen | | |

> **23 = IntroMoonJump** 由序列位置推定（B 项无直接命中，见第 19 章缺口 G7）。
> `Monocle.StateMachine` 的两条转移通道均已核对：`Update()` **返回 int** 时切到该编号（`SwimUpdate`/`BoostUpdate`/`HitSquashUpdate`/`LaunchUpdate`/`DreamDashUpdate`/`FrozenUpdate`… 全是 `ldc.i4.N ret`），或直接 `StateMachine.State = N`（`SummitLaunch`/`Boost`/`ExplodeLaunch`/`Player.Added`）。

---

## 16. 其余动作逐状态 IL 证据

### 16.1 Swim（3）

| 方法 | IL 事实 |
|---|---|
| `SwimCheck` | `Scene.CollideFirst<Water>(Position + UnitY * -8) != null`（`0x2b00021a` = `CollideFirst<Water>` 泛型 MethodSpec） |
| `SwimUnderwaterCheck` | `CollideFirst<Water>(Position + UnitY * -9) != null` |
| `SwimJumpCheck` | `CollideFirst<Water>(Position + UnitY * -14) == null` |
| `SwimRiseCheck` | `CollideFirst<Water>(Position + UnitY * -18) == null` |
| `UnderwaterMusicCheck` | `CollideFirst<Water>(Position)` **且** `CollideFirst<Water>(Position + UnitY * -12)` |
| `SwimBegin` | `if (Speed.Y > 0) Speed.Y *= 0.5;` · `Stamina = 110` |
| `SwimUpdate` | 见下 |

`SwimUpdate`（`il=763` / `ins=244`）顺序：

1. `if (!SwimCheck) return 0;`
2. `if (CanUnDuck) Ducking = false;`
3. `if (CanDash) { demoDashed = CrouchDashPressed; Dash.ConsumeBuffer(); CrouchDash.ConsumeBuffer(); return 2; }`
4. `underwater = SwimUnderwaterCheck`
5. **贴墙抓升**：`if (!underwater && Speed.Y < 0 && GrabCheck && !IsTired && CanUnDuck && Math.Sign(Speed.X) != -Facing && ClimbCheck(Facing, 0))`
   → `if (!NoGrabbing) ClimbTrigger(Facing); else if (!Actor.MoveVExact(-1)) { Ducking = false; return 1; }`
6. `feather = Calc.SafeNormalize(Input.Feather.Value, …)`；`maxX = underwater ? 80 : 60`；`maxY = 80`
7. 水平：`if (|Speed.X| > 80 && Sign(Speed.X) == Sign(feather.X)) Approach(maxX*feather.X, 400*dt) else Approach(maxX*feather.X, 600*dt)`
8. 垂直：`if (feather.Y == 0 && SwimRiseCheck) Approach(-60, 600*dt)`；`else if (feather.Y < 0 && underwater) { |Speed.Y|>80 && 同号 ? Approach(maxY*feather.Y, 400*dt) : Approach(maxY*feather.Y, 600*dt) }`
9. **水面翻越**：`if (!underwater && moveX != 0 && CollideCheck(Position + UnitX*moveX) && !CollideCheck(Position + (moveX, -3))) ClimbHop();`
10. `if (Jump.Pressed && SwimJumpCheck) { Jump(true, true); return 0; }`
11. `return 3;`

`NormalUpdate` 内另有一处入水跳跃：尾部 `var water = Scene.CollideFirst<Water>(Position + UnitY*2); if (water) { Jump(true,true); water.TopSurface.DoRipple(Position, 1f); }`（`0x2b000215` = `CollideFirst<Water>`）。

### 16.2 Boost（4）与 RedDash（5）

`Boost(Booster)` / `RedBoost(Booster)`（两者 IL 完全同构，只有 `boostRed` 一个字段不同）：

```
StateMachine.State = 4;
Speed = Vector2.Zero;
boostTarget = booster.Center;
boostRed = 0;               // RedBoost 为 1
CurrentBooster = LastBooster = booster;
```

`BoostBegin`：`if (MapData.Meta.TheoInBubble) { RefillDash(); RefillStamina(); } else orig_BoostBegin();`
`BoostEnd`：`var p = Calc.Floor(boostTarget - Collider.Center); MoveToX(p.X); MoveToY(p.Y);`

`BoostUpdate`（`ins=50`）：

```
offset  = Input.Aim.Value * 3f
target  = Calc.Approach(ExactPosition, boostTarget - Collider.Center, offset, 80f * dt)
MoveToX(target.X); MoveToY(target.Y);
if (DashPressed || CrouchDashPressed) {
    demoDashed = CrouchDashPressed;
    Dash.ConsumePress(); CrouchDash.ConsumeBuffer();
    return boostRed ? 5 : 2;      // 红球 → RedDash，绿球 → Dash
}
return 4;
```

`RedDashBegin`（`ins=68`，常量 `0.05 / 0.2 / 0.1 / 0.5 / 0 / 80 / 0.666 / 0.3 / 0.55`）：

```
calledDashEvents = false;  dashStartedOnGround = false;
Celeste.Freeze(0.05f);
Dust.Burst(Position, Calc.Angle(-DashDir), 8);
dashCooldownTimer = 0.2f;  dashRefillCooldownTimer = 0.1f;  StartedDashing = true;
level.Displacement.AddBurst(Center, 0.5f, 0f, 80f, 0.666f, Ease.QuadOut, Ease.QuadOut);
Input.Rumble(2, 1);
dashAttackTimer = 0.3f;   gliderBoostTimer = 0.55f;
Speed = DashDir = Vector2.Zero;
if (!onGround && CanUnDuck) Ducking = false;
DashAssistInit();
```

`RedDashUpdate`（`ins=192`；**第 2 轮按安装版 IL 逐指令复核，以下为最终版，含与首版的差异**）：

```
StartedDashing = false;
bool ch9 = LastBooster?.Ch9HubTransition ?? false;
gliderBoostTimer = 0.05f;
if (CanDash) { StartDash(); return 2; }          // ← 差异①：StartDash 后直接 return，不再继续下探
if (DashDir.Y == 0) {                            // 水平红冲：吸附 JumpThru（阈值 6px）
    foreach (var e in Scene.Tracker.GetEntities<JumpThru>())
        if (CollideCheck(e) && Bottom - e.Top <= 6f) MoveVExact((int)(e.Top - Bottom));
    if (CanUnDuck && Jump.Pressed && jumpGraceTimer > 0 && !ch9) { SuperJump(); return 0; }
}
if (ch9) return 5;                               // ← 差异②：ch9 的门是"跳过整个墙跳段"，不是"跳过 SuperJump"
if (SuperWallJumpAngleCheck && Jump.Pressed && CanUnDuck) {
    if (WallJumpCheck(1))  { SuperWallJump(-1); return 0; }
    if (WallJumpCheck(-1)) { SuperWallJump( 1); return 0; }
}
if (Jump.Pressed && CanUnDuck) {
    if (WallJumpCheck(1))  { if (Facing == 1  && GrabCheck && Stamina > 0 && !Holding && !ClimbBlocker.Check(Scene, Position + UnitX*3))  ClimbJump(); else WallJump(-1); return 0; }
    if (WallJumpCheck(-1)) { if (Facing == -1 && GrabCheck && Stamina > 0 && !Holding && !ClimbBlocker.Check(Scene, Position + UnitX*-3)) ClimbJump(); else WallJump( 1); return 0; }
}
return 5;
```

- **StRedDash 无自带结束计时器**：`RedDashUpdate` 恒 `return 5`（除墙跳/SuperJump/StartDash 出口）。若本帧未产生新转移，则状态**永久停在 RedDash**（由 `OnCollideH` 撞墙 → `HitSquash`、`OnBoundsH/V` → `StNormal` 等外部回调打破）。
- **差异①**：首版漏了 `return`，会把「已消费冲刺数」的一帧继续走到 JumpThru 吸附与墙跳判定；安装版是 `StartDash(); return 2;`。
- **差异②**：首版把 `!ch9` 拆成「SuperJump 分支内」与「后面所有墙跳」，安装版实际是 `if (ch9) return 5;` 一刀切（ch9 时连 SuperJump 都不走，因为 SuperJump 已被 `!ch9` 单独守过；ch9 一进来就 `return 5`）。

`RedDashEnd`：`CallDashEvents();`

### 16.3 HitSquash（6）

| 方法 | IL 事实 |
|---|---|
| `HitSquashBegin` | `hitSquashNoMoveTimer = 0.1f` |
| `HitSquashUpdate` | 见下（`ins=138`） |

```
Speed.X = Calc.Approach(Speed.X, 0f, 800f * dt);
Speed.Y = Calc.Approach(Speed.Y, 0f, 800f * dt);

if (Jump.Pressed) {
    if (onGround) Jump(true, true);
    else if (WallJumpCheck(1))  { if (Facing == 1  && GrabCheck && Stamina > 0 && !Holding && !ClimbBlocker.Check(Scene, Position + UnitX*3))  ClimbJump(); else WallJump(-1); }
    else if (WallJumpCheck(-1)) { if (Facing == -1 && GrabCheck && Stamina > 0 && !Holding && !ClimbBlocker.Check(Scene, Position + UnitX*-3)) ClimbJump(); else WallJump( 1); }
    Jump.ConsumeBuffer();
    return 0;
}
if (CanDash) StartDash();
if (GrabCheck && ClimbCheck(Facing, 0)) return 1;
if (hitSquashNoMoveTimer > 0f) hitSquashNoMoveTimer -= dt; else return 0;
return 6;
```

### 16.4 Launch（7）与 Pickup（8）

`ExplodeLaunch(Vector2 from, bool snapUp, bool sidesOnly)`（把整数 operand 与 `parameter_count` 一起核对后逐指令还原）：

```
Input.Rumble(2, 1);  Celeste.Freeze(0.1f);
launchApproachX = null;
Vector2 dir = (Center - from).SafeNormalize(-Vector2.UnitY);   // 零向量时回落到正上方
float dot   = Vector2.Dot(dir, Vector2.UnitY);                 // 即 dir.Y

if (snapUp && dot <= -0.7f)                  { dir.X = 0f; dir.Y = -1f; }
else if (dot >= -0.55f && dot <= 0.65f)      { dir.Y = 0f; dir.X = Math.Sign(dir.X); }
if (sidesOnly && dir.X != 0f)                { dir.Y = 0f; dir.X = Math.Sign(dir.X); }

Speed = dir * 280f;
if (Speed.Y <= 50f) { Speed.Y = Math.Min(-150f, Speed.Y); AutoJump = true; }   // 命中"向上弹"加成

if (Speed.X != 0f) {
    if (Input.MoveX.Value == Math.Sign(Speed.X)) { explodeLaunchBoostTimer = 0f;    Speed.X *= 1.2f; }
    else                                        { explodeLaunchBoostTimer = 0.01f; explodeLaunchBoostSpeed = Speed.X * 1.2f; }
}

SlashFx.Burst(Center, Calc.Angle(Speed));
if (!Inventory.NoRefills) { RefillDash(); RefillStamina(); }
dashCooldownTimer = 0.2f;
StateMachine.State = 7;
return dir;
```

- **同向输入**（`Input.MoveX.Value == Sign(Speed.X)`）→ 立刻 `Speed.X *= 1.2`（**explode launch 的 1.2 倍水平加速**）；**反向/无输入** → 只记录 `explodeLaunchBoostSpeed`，由 `explodeLaunchBoostTimer = 0.01s` 在 `Update` 里补一发（防止反向秒变）。
- **补速代码的真实位置（第 2 轮修正）**：补速不在 `LaunchUpdate` 内，而在 `Player.orig_Update`（`ins=1559`）里，紧跟 `moveX/moveY` 归约之后。逐指令：

```
// orig_Update，IL 331–371（紧随 moveX / moveY 计算）
if (explodeLaunchBoostTimer > 0f) {
    if (moveX.Value == Math.Sign(explodeLaunchBoostSpeed)) { Speed.X = explodeLaunchBoostSpeed; explodeLaunchBoostTimer = 0f; }
    else                                                   { explodeLaunchBoostTimer -= dt; }
}
```

  → 语义是「**计时窗口内的首个同向输入帧**才补速；窗口过期（0.01s）则作废，不补」。首版把它放在 `LaunchUpdate` 且在计时到期时赋速，是**错误**的，已修正。
- 常量：`0.1`（Freeze）/ `-0.7` / `-0.55` / `0.65` / `280` / `50` / `-150` / `1.2` / `0.01` / `0.2`。
- 兄弟入口 `FinalBossPushLaunch(int)`：`Speed.X = 0.9 * dir * 280`、`Speed.Y = -150`、`AutoJump = true`、`dashCooldownTimer = 0.28`、`State = 7`。
- 兄弟入口 `BadelineBoostLaunch(float)`：`Speed.X = 0`、`Speed.Y = -330`、`AutoJump = true`、`dashCooldownTimer = 0.2`、`State = 7`。

`LaunchBegin`：`launched = true;`
`LaunchUpdate`（`ins=107`）：

```
if (launchApproachX.HasValue) MoveTowardsX(launchApproachX.Value, 60f * dt);
if (CanDash) { StartDash(); return; }

if (GrabCheck && !IsTired && !Ducking)
    foreach (var h in Scene.Tracker.GetEntities<Holdable>())
        if (h.Check(this)) { if (Pickup(h)) return 8; }        // → Pickup

if (Speed.Y < 0f) Speed.Y = Calc.Approach(Speed.Y, 160f, 450f * dt);
else              Speed.Y = Calc.Approach(Speed.Y, 160f, 225f * dt);
Speed.X = Calc.Approach(Speed.X, 0f, 200f * dt);
return Speed.Length() < 220f ? 0 : 7;
```

`Pickup(Holdable)`：`if (Dead) return false; else return orig_Pickup(h);`（Everest 包装层，vanilla 逻辑在 `orig_Pickup`）

### 16.5 DreamDash（9）

`DreamDashBegin`（常量 `240 / -12000 / 0.1 / 110 / 0`）：

```
if (dreamSfxLoop == null) { dreamSfxLoop = new SoundSource(); Add(dreamSfxLoop); }
Speed = DashDir * 240f;
TreatNaive = true;
Depth = -12000;
dreamDashCanEndTimer = 0.1f;
Stamina = 110f;
dreamJump = false;
Play("event:/char/madeline/dreamblock_enter");
Loop(dreamSfxLoop, "event:/char/madeline/dreamblock_travel");
```

`DreamDashEnd`（`ins=63`）：

```
Depth = 0;
if (!dreamJump) { AutoJump = true; AutoJumpTimer = 0f; }
if (!Inventory.NoRefills) { RefillDash(); RefillStamina(); }
TreatNaive = false;
if (dreamBlock != null) {
    if (DashDir.X != 0f) { jumpGraceTimer = 0.1f; dreamJump = true; }
    else jumpGraceTimer = 0f;
    dreamBlock.OnPlayerExit(this); dreamBlock = null;
}
Stop(dreamSfxLoop);
Play("event:/char/madeline/dreamblock_exit");
Input.Rumble(1, 0);
```

`DreamDashUpdate`（`ins=213`）：`Rumble(0,1)` → 记录 `Position` → `NaiveMove(Speed*dt)` → 递减 `dreamDashCanEndTimer` → `var dreamBlock = Scene.CollideFirst<DreamBlock>(Position)`；若命中则缓存并继续；若 `DreamDashedIntoSolid()` 则（`Assists.Invincible` ? 回退位置 + `Speed *= -1` + `Play(assist_dreamblockbounce)` : `Die(Zero, false, true)`）；
`dreamDashCanEndTimer <= 0` 时：`Freeze(0.05)`；`Jump.Pressed && DashDir.X != 0` → `dreamJump = true; Jump(true,true); return 1`；
向下/侧向处理（`DashDir.X > 0 && CollideCheck(Position - UnitX*5)` → `MoveHExact(-5)`；`< 0` → `MoveHExact(5)`；再 `ClimbCheck(∓1, 0)`）；
`if (GrabCheck && ((moveX==1 && climbCheckRight) || (moveX==-1 && climbCheckLeft))) { Facing = moveX; if (!NoGrabbing) ClimbTrigger(moveX); Speed.X = 0; }`
`return 1 / 0`；
末尾持续 `CreateTrail()`（`level.OnInterval(0.1f)`）与 `Displacement.AddBurst(Center, 0.3, 0, 40, 1, null, null)`（`level.OnInterval(0.04f)`，`WorldClipCollider = dreamBlock.Collider`、`WorldClipPadding = 2`）；常量 `0.05 / -5 / 5 / 0.1 / 0.04 / 0.3 / 40 / 1 / 2 / 9`。

### 16.6 SummitLaunch（10）与 Dummy（11）

`SummitLaunch(float targetX)`：`summitLaunchTargetX = targetX; StateMachine.State = 10;`
`SummitLaunchBegin`：`wallBoostTimer = 0; Sprite.Play("launch"); Speed = -Vector2.UnitY * 240f; summitLaunchParticleTimer = 0.4f;`
`SummitLaunchUpdate`（常量 `0 / 0.03 / 4 / 20 / 240 / 0.2 / 1.5707964 / 40 / 12 / 0.3 / 0.01 / 10`）：

```
summitLaunchParticleTimer -= dt;
if (summitLaunchParticleTimer > 0f && Scene.OnInterval(0.03f))
    level.ParticlesFG.Emit(BadelineBoost.P_Move, 1, Center, Vector2.One * 4f);
Facing = 1;
MoveTowardsX(summitLaunchTargetX, 20f * dt);
Speed = -Vector2.UnitY * 240f;
if (level.OnInterval(0.2f)) level.Add(SpeedRing.Init(Center, 1.5707964f, Color.White));
var spinner = Scene.CollideFirst<CrystalStaticSpinner>(new Rectangle((int)X - 4, (int)Y - 40, 8, 12));
if (spinner != null) spinner.Destroy();
level.Shake(0.3f); Input.Rumble(1, 0); Celeste.Freeze(0.01f);
return 10;
```

`StopSummitLaunch`：`State = 0; Speed.Y = -140f; AutoJump = true; varJumpSpeed = Speed.Y;`

`DummyBegin` 无常量；`DummyUpdate`（`ins=164`，常量 `40 / 1 / 0.5 / 0.6 / 160 / 900 / 0 / 90 / 2500 / 1000 / 11`）——本引擎不移植，数值已留档。

### 16.7 Intro 系列（12–15、23、25）

`Player.Added` 里按 `IntroType`（`switch (IntroType - 1)`）分派：

| IntroType 分支 | 目标状态 | 附带字段 |
|---|---|---|
| Respawn | `14` IntroRespawn | `JustRespawned = true` |
| WalkInRight / WalkInLeft | `12` IntroWalk | `IntroWalkDirection = +1 / -1` |
| Jump | `13` IntroJump | — |
| WakeUp | `15` IntroWakeUp | `Sprite.Play(0x7000994c)`、`Facing = 1` |
| （Fall 支） | `0` Normal | — |
| 一支 | `18` | — |
| Sleep | `StartTempleMirrorVoidSleep()` → `11` Dummy | — |
| 末支 | `25` IntroThinkForABit | — |

`IntroRespawnBegin`（`ins=106`）：`Play(revive)`；`Depth = -1000000`；`introEase = 1`；`from` 取 `Clamp(Position, Bounds.Left+40 … Bounds.Right-40, Bounds.Top+40 … Bounds.Bottom-40)`；`deadOffset = from`；`from -= Position`；`respawnTween = Tween.Create(Tween.TweenMode.Oneshot, null, 0.6f, true)` + `OnUpdate/OnComplete`；`Add(respawnTween)`。
`IntroRespawnEnd`：`Depth = 0; deadOffset = Zero; Remove(respawnTween); respawnTween = null;`
`IntroWalkCoroutine` / `IntroJumpCoroutine` / `IntroMoonJumpCoroutine` / `IntroWakeUpCoroutine` / `IntroThinkForABitCoroutine`：`il=14`，仅 `newobj <…>d__N..ctor` —— 是**协程跳板**，不含状态逻辑（逻辑在编译器生成的 `<…>d__N.MoveNext` 里，本轮未展开，见缺口 G8）。

### 16.8 BirdDashTutorial（16）与 Frozen（17）

- `BirdDashTutorialBegin`：`DashBegin(); Play("event:/char/madeline/dash_red_right"); Sprite.Play("dash");`
- `BirdDashTutorialUpdate`：`ldc.i4.s 16 ret` —— **只有返回语句**（状态机停驻，行为全在 `BirdDashTutorialCoroutine`）。
- `FrozenUpdate`：`ldc.i4.s 17 ret` —— 同样只有返回语句。

> 这两处的"Update 极短"本身就是 IL 事实：它们**不是完整状态机**，而是协程驱动的停驻状态。冻结/教程逻辑在对应的 `MoveNext` 中。

### 16.9 ReflectionFall（18）/ StarFly（19）/ TempleFall（20）/ CassetteFly（21）/ Attract（22）/ FlingBird（24）

| 状态 | 关键 IL 事实 |
|---|---|
| ReflectionFall | `Begin`：`IgnoreJumpThrus = true`。`Update`（常量 `0.05 / 0.2 / -20 / 400 / 320 / 225 / 6 / 12 / 0.3 / 0.01 / 18`）：`Facing = 1`；`Scene.OnInterval(0.05)` → `wasDashB = true; CreateTrail();`；`ducking?` 分支 → `Speed.Y = Approach(-20, 400*dt)` 否则 `Approach(320, 225*dt)`；对 Tracker 中实体 `RemoveSelf()`；`CollideFirst<CrystalStaticSpinner>(new Rectangle(X-6, Y-6, 12, 12))` → `Destroy()`；`level.Shake(0.3); Rumble(1,1); Freeze(0.01)`；`return 18`。`End`：`FallEffects.Show(false); IgnoreJumpThrus = false;` |
| StarFly | `StartStarFly`：`StateMachine.State = 19`（常量 `2 / -6 / 16 / 1 / 12 / 4 / 0.25 / 8 / 32`）。`StarFlyBegin`：`Sprite.Play("startStarFly")` 等，`il=276`。`StarFlyEnd`：`Sprite.Play(0x70026c4e)`。`StarFlyUpdate`：`return 19`（保持）。羽毛飞行器状态，本章留档不移植 |
| TempleFall | `Update`（常量 `160 / 4 / 54.000004 / 325 / 320 / 225 / 20`）：`Facing = 1`；`var left = Bounds.Left + 160`；`dir = |left - X| > 4 ? Sign(left - X) : 0`；`Speed.X = Approach(54.000004f * dir, 325*dt)`；`if (!onGround && DummyGravity) Speed.Y = Approach(320, 225*dt)`；`return 20` |
| CassetteFly | `StartCassetteFly`：`StateMachine.State = 21`。`Begin`：常量 `5`。`Update`：`ldc.i4.s 21 ret` |
| Attract | `StartAttract`：`StateMachine.State = 22`。`Update`（常量 `1.5 / 200 / 22`）：`return 22` |
| FlingBird | `DoFlingBird`：`StateMachine.State = 24`（两处）。`Update`（常量 `250 / 8 / 250 / 24`）：`return 24` |
| Dummy | 见 16.6；`DummyUpdate` 尾部 `ldc.i4.s 11 ret` |

### 16.10 状态 → 动画映射（`orig_UpdateSprite` 全表，字面量已注名）

`orig_UpdateSprite` 开头两条即为 Scale 回弹，**证实 `SCALE_RECOVER = 1.75`**：

```
Sprite.Scale.X = Calc.Approach(Sprite.Scale.X, 1f, 1.75f * dt);
Sprite.Scale.Y = Calc.Approach(Sprite.Scale.Y, 1f, 1.75f * dt);
```

随后按 `StateMachine.State` 直取动画（`ldstr` 已解析为动画 ID）：

| State | 动画 ID（字面量） |
|---|---|
| 18/19/20/21/22 | `"fallFast"` |
| 10 SummitLaunch | `"launch"` |
| 8 Pickup | `"pickup"` |
| 3 Swim | `MoveY > 0` → `"swimDown"`；`MoveY < 0` → `"swimUp"`；否则 `"swimIdle"` |
| 9 DreamDash | `"dreamDashIn"` / `"dreamDashLoop"`（离开时 `"dreamDashOut"`） |
| 1 Climb | `lastClimbMove < 0` → `"climbUp"`；`> 0` → `"wallslide"`；前方无实体 → `"dangling"`；`MoveX == -Facing` → `"climbLookBackStart"`/`"climbLookBack"`；否则 `"wallslide"` |
| 11 Dummy（非 InSpace） | `Sprite.Rate = 0.5f`，否则 `1f` |

其余分支（已注名，供比对）：`duck`、`edge`/`edgeBack`、`skid`、`push`、`idle_carry`/`runSlow_carry`、`runWind`、`flip`、`jumpFast`/`jumpSlow`、`fallSlow`/`fallFast`、`throw`、`lookUp`、`idle`、`runSlow`/`runFast`。

### 16.11 本轮新增核对的常量/工具方法（全部 IL 直读）

| 成员 | IL 事实 |
|---|---|
| `get_IsTired` | `CheckStamina < 20f` |
| `get_SuperWallJumpAngleCheck` | `if (Math.Abs(DashDir.X) > 0.2f) return false; return !(DashDir.Y > -0.75f);`（即 `\|DashDir.X\| ≤ 0.2 && DashDir.Y ≤ -0.75`） |
| `get_CheckStamina` | `wallBoostTimer > 0 ? Stamina + 27.5f : Stamina` |
| `get_CanDash` | `(CrouchDashPressed \|\| DashPressed) && dashCooldownTimer <= 0 && Dashes > 0 && !(TalkComponent.PlayerOver && Talk.Pressed) && !(LastBooster?.Ch9HubTransition == true && !LastBooster.BoostingPlayer)` |
| `get_DashAttacking` | `dashAttackTimer > 0 \|\| StateMachine.State == 5` |
| `StartDash()` | `wasDashB = (Dashes == 2); Dashes = Math.Max(0, Dashes - 1); demoDashed = CrouchDashPressed; Dash.ConsumeBuffer(); CrouchDash.ConsumeBuffer(); return 2;` |
| `get_MaxDashes` | `Assists.DashMode && !(level?.InCutscene ?? false) ? 2 : Inventory.Dashes` |
| `RefillDash()` | `if (Dashes < MaxDashes) { Dashes = MaxDashes; return true; } return false;` |
| `RefillStamina()` | `Stamina = 110f` |
| `NormalBegin()` | `maxFall = 160f` |
| `NormalEnd()` | `wallBoostTimer = 0; wallSpeedRetentionTimer = 0; hopWaitX = 0;` |
| `ClimbTrigger(int)` | `climbTriggerDir = dir` |
| `StartJumpGraceTime()` | `jumpGraceTimer = 0.1f` |
| `CreateTrail()` | `TrailManager.Add(new Vector2(Math.Abs(Sprite.Scale.X) * Facing, Sprite.Scale.Y), Position, GetCurrentTrailColor(), 1f)` |
| `_IsOverWater()` | `var b = Collider.Bounds; b.Height += 2; return Scene.CollideCheck<Water>(b);` |
| `get_Ducking` | `Collider == duckHitbox \|\| Collider == duckHurtbox` |
| `Duck()` / `UnDuck()` | `Collider = duckHitbox` / `Collider = normalHitbox` |
| `get_CanUnDuck` | 未蹲 → true；否则临时换回 `normalHitbox` 检测是否可站立（`0x2b000075` = `CollideCheck<Solid>` 泛型实例） |
| `CanUnDuckAt(Vector2)` | 暂存 Position → 设为目标 → `CanUnDuck` → 还原 |
| `Pickup(Holdable)` | `if (Dead) return false; return orig_Pickup(h);` |

---

## 17. 素材可用性核对（`blog-ui\Atlases`，逐 glob 结果）

| 需要 | 目录 | 实到帧 | Sprites.xml 要求 | 结论 |
|---|---|---|---|---|
| `swim` | `Gameplay\characters\player` | `swim00–11`（12） | `swimIdle 0-5` / `swimUp 6-11` / `swimDown 12-17` | **缺 12–17**：`swimDown` 无法渲染 |
| `dreamDash` | `Gameplay\characters\player` | `dreamDash00–20`（21） | `0-3 / 4-16 / 17-20` | **齐** |
| `launch` | `Gameplay\characters\player` | `launch00–07`（8） | `0-7` | **齐** |
| `launchRecover` | 同上 | `launchRecover00–10`（11） | 全部帧 | **齐** |
| `pickup` | 同上 | `pickup00–04`（5） | 全部帧 | **齐** |
| `push` | 同上 | `push00–15`（16） | `0-15` | **齐** |
| `edge` / `edge_back` | 同上 | 各 `00–13`（14） | `edge 0-13` / `edgeBack` 全部 | **齐** |
| `dangling` | 同上 | `dangling00–09`（10） | `0-9` | **齐** |
| `climb` | 同上 | `climb00–14`（15） | `climbUp`/`climbDown`/`wallslide`/`climbLookBack*` | **齐** |
| `tired` | 同上 | `tired00–03`（4） | — | 齐 |
| 绿球 `booster` | `Gameplay\objects\booster` | `booster00–25`（26） | — | **齐** |
| 红球 `boosterRed` | 同上 | `boosterRed00–34`（35） | — | **齐** |
| 水 `water` | 全库 glob `**/water*.png` | **0** | — | **缺** |
| 梦幻方块 `dreamBlock` | `Gameplay\objects\dreamblock` | `particles.png`（21×7 = 3 片 7×7）+ `active.png` / `disabled.png`（24×24） | — | **齐**（第 3 轮补测；`active/disabled` 在 `Render` 中未使用，块体为程序化绘制） |

**booster 素材几何（第 2 轮 System.Drawing 实测）**：`Gameplay\objects\booster\` 共 62 个 PNG，含 `booster00–25`、`boosterRed00–34`、`outline.png`。全部 **32×32 未裁剪**（非紧贴包围盒），与本地 `Sprites.xml` L806–820 的 `Justify 0.5,0.5` 一致 → demo 侧按中心对齐绘制，不需要 per-frame offset。`Sprites.xml` 动画分组：`booster`（loop = `booster 0-4` delay 0.1；inside 5–8；spin 18–25 delay 0.06；pop 9–17 delay 0.08）、`boosterRed`（appear = `boosterRed 26-34` → loop；loop 0–4；inside 5–8；spin 18–25；pop 9–17）。

---

## 18. 第二轮偏差工单与移植判定（D14–D27）

| # | 原作行为（成员 + 条件） | 当前引擎 | 要求的改动 | 判定 |
|---|---|---|---|---|
| **D14** | `States` 完整 26 项（第 15 章表） | 只有 `ST_NORMAL/ST_CLIMB/ST_DASH` 三个魔数 | 补全常量与名字表，转移一律用常量 | **移植** |
| **D15** | `HitSquash(6)`：`Begin` 置 `hitSquashNoMoveTimer=0.1`；`Update` 以 `800/s` 摩擦归零，跳跃/墙跳/爬墙跳、`CanDash`、`GrabCheck && ClimbCheck(Facing,0)`、计时器到期后 `return 0` | **无此状态** | 新增 `ST_HIT_SQUASH` + `hitSquash()` 入口 + `hitSquashBegin/Update` | **移植** |
| **D16** | `Launch(7)`：`ExplodeLaunch` 的 `280` / `snapUp` `-0.7` / 侧向 `[-0.55,0.65]` / `Speed.Y<=50 → min(-150)` / `AutoJump` / 同向 `×1.2` / 反向 `0.01s` 延迟补速 / `dashCooldownTimer=0.2` | **无此状态** | 新增 `ST_LAUNCH` + `explodeLaunch(origin, snapUp, sidesOnly)` + `launchBegin/Update` | **移植** |
| **D17** | `Boost(4)`：`State=4; Speed=Zero; boostTarget=booster.Center`；`Update` 以 `Aim*3` 为基准、`80*dt` 逼近；`BoostEnd` 取整吸附 | **无此状态** | 新增 `ST_BOOST` + `boost(booster)` + `boostBegin/Update/End` | **移植**（绿球素材齐） |
| **D18** | `RedBoost` 与 `Boost` 仅 `boostRed` 不同；`BoostUpdate` 中红球按冲刺 → `5 RedDash` | **无此状态** | 新增 `ST_RED_DASH` + `redBoost()` + `redDashBegin/Update/End` | **移植**（红球素材齐） |
| **D19** | `CanDash` 是**会消费输入**的判定（`Dash/CrouchDash.ConsumeBuffer`）；`StartDash()` 自身不判 `CanDash` | 引擎 `beginDash` 逻辑集中在 `update()` 里直接判 | 拆出 `canDash()`（消费）与 `startDash()`（扣冲刺数） | **移植** |
| **D20** | `NormalBegin` 设 `maxFall = 160`；`NormalEnd` 清 `wallBoostTimer/wallSpeedRetentionTimer/hopWaitX` | 引擎未在进出 Normal 时复位 | 进入/离开 Normal 时对齐 | **移植** |
| **D21** | `RefillStamina() = 110`；`RefillDash()` 是**补满** | 引擎攀爬体力回充与回充冷却已部分对齐 | 统一走 `refillStamina/refillDash` | **移植** |
| **D22** | `IsTired = CheckStamina < 20`，`CheckStamina = Stamina + 27.5 (wallBoostTimer>0)` | 引擎 `CLIMB_TIRED_THRESHOLD=20` 只比 `Stamina` | 补 `checkStamina` | **移植** |
| **D23** | `UpdateSprite` 开头 `Scale → 1` 用 `1.75/s` | 引擎有 `SCALE_RECOVER=1.75`（已对齐） | 无 | 已合规 |
| **D24** | `Swim(3)` 全部判定与常数（第 16.1 节） | 无 | — | **不移植**：`Atlases` 无 `water` 素材，且 `swim` 帧 12–17 缺失 |
| **D25** | `DreamDash(9)` 全部判定与常数（第 16.5 节） | 无 | — | ~~不移植~~ → **移植**（第 3 轮完成，见第 21 章；`Atlases/Gameplay/objects/dreamblock/` 实到 `particles.png`） |
| **D26** | `SummitLaunch(10)` / `TempleFall(20)` / `ReflectionFall(18)` / `StarFly(19)` / `CassetteFly(21)` / `Attract(22)` / `FlingBird(24)` / Dummy(11) | 无 | — | **不移植**：关卡/剧情专属（依赖 `Level.Bounds`、`Tracker<CrystalStaticSpinner>`、`BadelineBoost`、`Summit` 目标点等本引擎不存在的世界对象） |
| **D27** | `Intro*`(12–15,23,25) / `BirdDashTutorial(16)` / `Frozen(17)` | 无 | — | **不移植**：剧情状态；且 `BirdDashTutorialUpdate`/`FrozenUpdate` 本身只有 `ldc.i4.N ret`，逻辑在未展开的编译器 `MoveNext` 内（缺口 G8） |

**本轮实施状态（第 2 轮，Step 5 断言 `passed 69/69`）**：

| ID | 实施落点（`blog-ui\js\celeste-character.js`） | 状态 |
|---|---|---|
| D14 | `ST` 26 项表 + `STATE_NAMES` + 导出 | ✅ 已修 |
| D15 | `beginHitSquash/hitSquashUpdate` + `postPhysics` 接线（撞墙/落地 → HitSquash） | ✅ 已修（触发链已接线） |
| D16 | `explodeLaunch/launchBegin/launchUpdate` + 补速移入 `update()` | ✅ 已修（补速位置修正） |
| D17 | `boost/boostBegin/boostUpdate/boostEnd` | ✅ 已修 |
| D18 | `beginRedDash/redDashUpdate` + `get superWallJumpAngleCheck()` + demo 红球 | ✅ 已修（RedDashUpdate 按安装版 IL 重写） |
| D19 | `canDash()`（消费输入）/ `startDash()`（扣冲刺） | ✅ 已修 |
| D20 | `normalBegin()` 设 `maxFall=160`；`normalEnd()` 清 3 计时器 | ✅ 已修 |
| D21 | `refillStamina/refillDash` 统一入口 | ✅ 已修 |
| D22 | `checkStamina` / `isTired` | ✅ 已修 |
| D23 | `SCALE_RECOVER=1.75` | 已合规（无需改） |
| D25 | `dreamDashCheck/beginDreamDash/dreamDashEnd/dreamDashUpdate` + 三处切入 + 动画/残影 | ✅ 已修（第 3 轮，见第 21 章） |
| D24 / D26 / D27 | — | 判定不移植，未实施 |

附带收口（非工单，Step 5 断言要求的状态一致性）：`wallJump()` / `climbJump()` 末尾补 `setState(ST_NORMAL)`，使 HitSquash/RedDash 调用墙跳后状态能正确回 Normal。

---

## 19. 缺口（诚实标注，不猜测）

| ID | 缺口 | 说明 |
|---|---|---|
| G1 | 无 C# 伪代码 | `rea decompile` 对托管程序集不可用（缺 .NET provider）。本章全部结论为 **IL 级**，非源码级 |
| G2 | `States = 23 (IntroMoonJump)` | 由 #US 顺序推定，IL 中无直接 `set_State 23` 命中 |
| G3 | `swim` 帧 12–17 缺失 | `Atlases` 只到 `swim11`；`swimDown` 无素材 → Swim 不可移植 |
| G4 | 无 `water` 素材（`dreamBlock` 已于第 3 轮落实） | `water` 全库 glob 0 命中 → Swim 不可移植；`Gameplay/objects/dreamblock/` 实有 `particles.png` / `active.png` / `disabled.png`，DreamBlock 改为程序化绘制（第 21 章） |
| G5 | `Input.Feather` / `Input.Aim` 死区 | 同第 12 章：Monocle `VirtualJoystick` 实现不在仓库内 |
| G6 | `MapMeta.TheoInBubble` / `Assists.*` | 引擎无存档系统，`BoostBegin` 的 Theo 支按"只走 `orig_BoostBegin`"处理 |
| G7 | `CollideFirst<T>` / `CollideCheck<T>` 泛型 MethodSpec | 以 `0x2b……` 出现（如 `0x2b00021a` = `CollideFirst<Water>`、`0x2b000215` = `CollideFirst<Water>`（带 `Vector2` 重载））。类型实参由调用点上下文（`Water`/`Holdable`/`CrystalStaticSpinner`）推定，非元数据直读 |
| G8 | 编译器生成的 `<…>d__N.MoveNext` | `IntroWalkCoroutine` 等只声明 `il=14` 的跳板；真正逻辑在生成类的 `MoveNext`，本轮未展开逐指令 |
| G9 | `Player.Added` 中 `18` 分支对应的 `IntroType` 名 | IL 常量 `18` 已证；对应 `IntroType` 成员名未直接证据 |
| G10 | `CanUnDuck` 在引擎里用 `!ducking` 近似 | `CanUnDuck` 原作是"临时换回 `normalHitbox` 再 `CollideCheck<Solid>`"（本仓库无碰撞体切换），引擎以 `!this.ducking` 近似，平地上等价、贴低顶时不等价 |
| G11 | `LastBooster.Ch9HubTransition`（`ch9`） | 引擎无 Ch9 气泡/存档，`ch9` 恒 false → `RedDashUpdate` 的 `if (ch9) return 5;` 分支在引擎中不可达（不影响其余逻辑） |

---

## 20. 三套流程与验收（沿用第 1 轮）

1. 取证：`rea inspect-managed-members` → `annotated.txt` → `iloff.js <方法名>` 逐条复现（第 14 章）。
2. 工单：第 18 章 D14–D27，每行一个可独立验证的偏差。
3. 改引擎：`blog-ui\js\celeste-character.js`，只改工单列出的行；状态号一律用第 15 章常量。
4. 帧表：动画 ID → `Atlases` 实际帧（第 17 章逐 glob 核对，绝不引用不存在的索引）。
5. 断言：Node `vm` 沙箱跑数值断言（`passed/total`，失败非零退出）。
6. 验收：`?v=` cache-buster 递增，逐条工单在 demo 中可观察。

### Step 6 验收记录（第 2 轮）

- **Step 5 断言**：`node port-test.js` → `passed 69/69`。
- **修复的 demo 缺陷**：`celeste-character-demo.html` 内联脚本曾在第 52、421 行各残留一个 Markdown 围栏 ` ``` `，导致整个内联脚本 `SyntaxError: Unexpected identifier 'boosterRed$'`（`node --check` 复现）。删除两行后 `node --check` 通过，`celeste-character.js` / `celeste-hair.js` 亦通过。
- **浏览器验收**（`http://localhost:8080/celeste-character-demo.html`，server root = `blog-ui`，Node `node --check` + 浏览器实测）：
  - 控制台**无错误/警告**（fresh 读数返回空列表；先前那条 `SyntaxError` 是同一浏览器会话里旧页面遗留的缓冲区条目）。
  - `#state` HUD 实时刷新（`state=NORMAL anim=idle`），证明脚本已执行、帧循环运行、素材从 `Atlases` 加载成功。
  - 实键验收通过：`X` → `state=DASH`（`anim=jumpFast`）；`C` → `vy` 变负（起跳）；按住 `→` → `vx>0` 右移；触碰**左侧绿球** → `state` 依次 `Boost` → `Dash`。
  - **未在浏览器复验**（本轮浏览器工具多次因新建标签页抢焦点导致按键不通，已到调用上限）：右侧红球 → `RedDash` → 撞墙 `HitSquash`；贴墙 `Z` → `CLIMB`。这两项由上列断言 T15/T16 与第 16.2/16.3 节 IL 证据覆盖，**列为待人工目视复核项**。
- **`?v=` cache-buster**：本轮未改 JS（仅改 demo HTML），维持 `?v=8`。

---

## 21. 第三轮：DreamBlock（第二章 Old Site）取证与移植落地

**目标**：把 `Celeste.DreamBlock : Solid`（地图实体名 `dreamBlock`）连同 `DreamDash(9)` 一起移植进 `blog-ui/internet_cafe.html`，使玩家获得梦境冲刺后可径直穿过这些方块。

### 21.1 `Celeste.DreamBlock` 成员 IL 证据

全部数值来自本地 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` 的 dnfile/dncil 反编译（`dream_il.txt`）；常量在调用处内联，故下表按方法归类。

| 成员 | IL 事实 |
|---|---|
| `.cctor` | `activeBackColor = Color.Black`；`disabledBackColor = #1F2E2D`；`activeLineColor = Color.White`；`disabledLineColor = #6A8480` |
| `.ctor` | `Depth = -11000`；`whiteHeight = 1f`；`wobbleFrom = wobbleTo = Calc.Random.NextFloat(2π)`；`particleTextures` 取 `Sprite.Texture` 的 `(14,0)` / `(7,0)` / `(0,0)` / `(7,0)` 四个 7×7 子图；`EntityData` 读取 `fastMoving` / `oneUse` / `below` |
| `Added` | `playerHasDreamDash = SceneAs<Level>().Session.Inventory.DreamDash`；为 `false` 时 `Add(new LightOcclude())` |
| `Setup` | 粒子数 `(int)(Width / 8f * Height / 8f * 0.7f)`；`Layer = Calc.Random.Choose(0, 1, 1, 2, 2, 2)`；`TimeOffset = Calc.Random.NextFloat(1f)`；颜色按层三选一：L0 `FFEF11`/`FF00D0`/`08A310`、L1 `5FCDE4`/`7FB25E`/`E0564C`、L2 `5B6EE1`/`CC3B3B`/`7DAA64` |
| `Update` | `animTimer += 6f * dt`；`wobbleEase += 2f * dt`，`> 1f` 时 `wobbleEase = 0`、`wobbleFrom = wobbleTo`、`wobbleTo = NextFloat(2π)` |
| `Render` | ① 底色 `Draw.Rect`（`activeBackColor` / `disabledBackColor`）② 粒子 ③ `whiteFill` 白覆盖（高 = `Height * whiteHeight`）④ 四条 `WobbleLine`（offset 依次 `0 / 0.7 / 1.5 / 2.5`）⑤ 四角 2×2 角块（`lineColor`） |
| 粒子位置 | `Position + Camera.Position * (0.3f + 0.25f * Layer)` → `PutInside`；仅绘制落在 `(X+2, Y+2)..(Right-2, Bottom-2)` 内的粒子 |
| 粒子帧选择 | L2 → `particleTextures[2]`；L1 → `(int)(TimeOffset*2 + animTimer) % 2` → 取 `[1+i]`；L0 → `(int)(TimeOffset*4 + animTimer) % 4` → 取 `[3-i]` |
| `PutInside` | 以块宽/高为周期把坐标回卷：`> Right` 减 `Width*ceil(…)`、`< X` 加、`> Bottom` 减 `Height*ceil(…)`、`< Y` 加 |
| `WobbleLine` | `i` 从 `2` 起、`step = 16`；`amp = Lerp(LineAmplitude(wobbleFrom+offset, i), LineAmplitude(wobbleTo+offset, i), wobbleEase)`；`i + 16 >= len` 时 `amp = 0`；每段画三条线（两条背景色错位铺底 + 一条主色） |
| `LineAmplitude` | `(sin(i/16 + sin(i*2/32 + offset) * 2π) + 1) * 1.5` |
| `OnPlayerExit` | `Dust.Burst(Center, Calc.Angle(Speed), 16, null)` |

**DreamDash(9) 侧的接入点**（细节见第 16.5 节）：

| 成员 | IL 事实 |
|---|---|
| `DreamDashCheck(Vector2 dir)` | `Inventory.DreamDash && DashAttacking && dir == new Vector2(Sign(DashDir.X), Sign(DashDir.Y)) && CollideFirst<DreamBlock>(Position + dir) != null` |
| 调用点 | `OnCollideH(0,4)` → `DreamDashCheck(UnitX * Sign(Speed.X))`；`OnCollideV(2+8+16+32, 0)` → `DreamDashCheck(UnitY * Sign(Speed.Y))`；命中后 `StateMachine.State = 9; dashAttackTimer = 0` |
| `DreamDashBegin` | `Speed = DashDir * 240f`、`TreatNaive = true`、`Depth = -12000`、`dreamDashCanEndTimer = 0.1f`、`Stamina = 110f`、`dreamJump = false` |
| `DreamDashEnd` | `Depth = 0`；`!dreamJump → AutoJump`；`RefillDash/RefillStamina`；`dreamBlock != null` 时 `DashDir.X != 0` → `jumpGraceTimer = 0.1f; dreamJump = true`，再 `OnPlayerExit` 并清空 |
| `DreamDashUpdate` | `NaiveMove` → 仍在块内则保持 9 → 出块后 `DreamDashedIntoSolid()` 失败则 `Die` → `dreamDashCanEndTimer <= 0` 时 `Freeze(0.05f)`、`Jump.Pressed && DashDir.X != 0` → `dreamJump = true; Jump()`、否则 `MoveHExact(∓5)` 贴墙、`GrabCheck` → 转 Climb；每 `0.1s` `CreateTrail()` |

### 21.2 引擎落点（[celeste-character.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-character.js)）

| 内容 | 落点 |
|---|---|
| 常量 `DREAM_DASH_SPEED/MIN_TIME/STAMINA/WALL_NUDGE/TRAIL_INTERVAL` | [L108–116](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-character.js#L108-L116) |
| 动画表 `dreamDashIn`（0–3, 0.04 → goto Loop）/ `dreamDashLoop`（4–16, 0.03, loop）/ `dreamDashOut`（17–20, 0.04） | L234–236 |
| 头发曲线 `HAIR.dreamDash`（Sprites.xml L111 的 21 条元数据） | L265 |
| `dreamDashCheck(dirX, dirY)`（含轴平移修正，用 `solidAt` 排除目标块） | L534 |
| `beginDreamDash()` / `dreamDashEnd()` / `dreamDashUpdate(dt, input)` | L573 / L587 / L613 |
| `jump(fromDreamBlock)`：出口跳末尾触发 `onDreamJump` | L684 |
| `moveHExact(amount)`：逐像素平移、撞到实心即停（对应 `Actor::MoveHExact(∓5, null, null)`） | L854 |
| `solidAt(dx, dy)`：`CollideCheck<Solid>` 的「不含 DreamBlock」版本 | L844 |
| `setState()` 离开 9 时调 `dreamDashEnd()` | L879 |
| `update()` 状态分派；记录 `startedDreamDash`，退出 9 的那一帧不再跑 `postPhysics` | L1011 / L1038 |
| 切入三处（均在角修正之后）：水平 `collidedH` 分支 / 天花板块末尾 / 地面碰撞整段之后（`groundHit`） | L1506 / L1582 / L1639 |
| `updateSpriteAnim` State 9 → `dreamDashIn`/`dreamDashLoop`；离开 9 首帧 → `dreamDashOut` | L1736 / L1746 |
| `updateDashTrail` 梦境冲刺残影（`dreamBlock` 非空才按 0.1s 推进） | L1676 / L1685 |

### 21.3 场景落点（[internet_cafe-1.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js)）

| 内容 | 落点 |
|---|---|
| `DREAM_BLOCKS` 数据 + 配色表 + `dreamParticles()`（数量/层/TimeOffset/颜色） | [L89–128](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L89-L128) |
| 预载 `objects/dreamblock/particles.png` | L243 |
| `dreamBlockAt(x, feetY)`：身体盒 8×11 四周内缩 0.5 与方块求交 | L403 |
| `groundY` / `wallCollideAt` / `wallAt` / `ceilingY` / `bodySolid` 五处 Solid 判定并入 `DREAM_BLOCKS` | L445 / L478 / L505 / L538 / L561 |
| `updateDreamBlocks(dt)`（`animTimer/wobbleEase` 按 Update IL 推进） | L1193 |
| `dreamPutInside` / `dreamLineAmplitude` / `dreamLerp` / `dreamTowardWhite` / `dreamWobbleLine` / `drawDreamBlocks` | L1207 / L1217 / L1220 / L1222 / L1242 / L1272 |
| 渲染层级：梦境冲刺中玩家先画（Depth -12000 在方块 -11000 之后） | L1458–1462 |
| `tick()` 内 `updateDreamBlocks(dt)` | L1518 |
| `bodySolid(x, feetY, skipDream)`：梦境块算 Solid；`otherSolid` 为其去掉 DreamBlock 的版本（供 `setSolidAt`） | [L548](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L548) / [L571](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L571) |
| `spawnDust(x, y, n, angle?)`：传入角度时按 `angle ± 0.4` 锥形爆散（对应 `Dust.Burst`） | [L987](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L987) |
| `dreamWobbleLine`：`whiteFill > 0` 时两色都向白 `Lerp`（`dreamTowardWhite`） | [L1242](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L1242) |
| `drawDreamBlocks`：所有绘制坐标加 `b.shakeX/shakeY`（本类型 `shaker` 从未赋值 → 恒 0） | [L1272](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/internet_cafe-1.js#L1272) |
| 接线：`setDreamBlockFn(dreamBlockAt)`、`setSolidAt(otherSolid)`、`dreamDashEnabled = true`、`onDreamDashExit`（玩家坐标 + 速度角、16 粒）、`onDreamJump`（4 粒 -π/2）、`onDreamDashDeath = die()` | L1599–1614 |

**素材**：`Atlases/Gameplay/objects/dreamblock/particles.png`（21×7 = 三片 7×7 子图，x=0/7/14）实到，按层/颜色 `tinted()` 后切片绘制；`active.png` / `disabled.png`（24×24）**存在但 Render 未使用**——原作块体本身是程序化绘制（黑底 + 粒子 + 抖动边 + 角块），故 demo 同样程序化绘制。

### 21.4 数值断言（Step 5）

`node dream_test.js`（Node `vm` 沙箱，stub `CelesteHair` / `Image`，合成几何：地面 y=160、贴地墙块 x=120..152、头顶块 y=100..160、出口实心 x=432..472）：

| 组 | 断言 | 结果 |
|---|---|---|
| 1 水平切入 | 进入 9 / `Speed = DashDir*240` / `canEndTimer = 0.1` / `Stamina = 110` / 切入帧停在 `block.x - 4`（x=116） / 切入帧不消耗最短时长 | 6/6 |
| 1 穿越与出口 | 穿越期间持续位移（不被方块阻挡） / 出块退 9 / 回 Normal / `RefillDash` / `RefillStamina` / 水平出口 `jumpGraceTimer = 0.1` / `AutoJump`（或 `dreamJump`） / 清空 `dreamBlock` / 首帧播 `dreamDashOut` | 9/9 |
| 3 未获得 DreamDash | 不进入 9 / 撞在 `x = 116` / `Speed.X = 0` | 3/3 |
| 4 向上切入 | 进入 9 / `Speed.Y = -240` / 穿块继续上移 / 结束后回 Normal | 4/4 |
| 5 出口撞实心 | `DreamDashedIntoSolid` 失败 → `onDreamDashDeath` / 离开 9 | 2/2 |
| 6 `DreamDashCheck` 轴平移 | 重叠实心时仍切入 / 沿 `axis=(0,1)` 挪 1px / 记录 `dreamBlock` / 水平坐标不变 / 四向全堵 → 不切入 | 5/5 |
| 7 `DreamDashedIntoSolid` 顺序 | 8 个「唯一空位」用例（含 `(±1,±1)`、`(±3,∓1)`、`(±1,∓3)`）都必须按四层顺序命中 | 8/8 |
| 8 残影门控 | `dreamBlock` 为空不推进 0.1s 计时 / 非空才推进 | 2/2 |
| 9 出口跳回调 | `jump(true)` 触发 `onDreamJump` 一次 / 普通 `jump()` 不触发 | 2/2 |

**合计 `41/41 passed`**（本轮首跑 40/41：唯一失败是「穿越期间持续位移」——出口帧的 `MoveHExact(-5)` 被写成了无条件 `x -= 5`，把玩家推回块内 1px，净位移 -1。按 IL 把 `MoveHExact` 改为「逐像素平移、撞到实心即停」后通过；改的是引擎语义，不是断言）。


### 21.5 缺口（第四轮修订）

| ID | 状态 | 说明 |
|---|---|---|
| G12 | ✅ 已按 IL 补齐 | `dreamDashOut` 播放点在 `player_normal_il.txt` L14394–14440 定位到：`LastAnimationID.StartsWith("dreamDash") && LastAnimationID != "dreamDashOut"` → `Play("dreamDashOut")`；且 `CurrentAnimationID != "dreamDashOut"` 才走普通分支。已按此实现（引擎 L1746–1750） |
| G13 | ✅ 已按 IL 补齐 | `DreamDashCheck` 的轴平移修正按 `player_dream_il.txt` L43–169 逐条实现：`axis = (|dir.Y|, |dir.X|)`，`flag/flag2` 按 `Speed` 决定方向，`i = -1..-4` / `j = 1..4`，命中即 `Position += axis*k` 并置 `dreamBlock`（引擎 L542–566） |
| G14 | ✅ 主体已接（§21.10） | `dreamblock_enter` / `dreamblock_travel` / `dreamblock_exit` 已按 `celeste-sounds/dreamblock/` 素材接入；`jump_dreamblock` / `assist_dreamblockbounce` 仍无素材 |
| G15 | 部分近似 | `Displacement.AddBurst`（0.04s，`0.3/40/1/WorldClipPadding=2`）未按 shader 移植：引擎无 Displacement 系统，以 G21 的扩张白环近似（参数保留 0.3/0.5 与半径 40） |
| G16 | 仍缺 | `Camera.Position` 用视口左上角近似：demo 无 `Level.Camera` 对象，粒子视差以 `cam.x - viewW()/2` 代入 |
| G17 | 仍缺 | `LightOcclude` 未移植：场景无光照系统 |
| G18 | 有意近似 | 抓墙出口：IL 在 `GrabCheck` 且 `moveX` 方向有墙时返回 1 → Climb；引擎以 `beginClimb(dir)` 近似（未走 `ClimbTrigger` 的 `Speed.X = 0` 路径），出口瞬间的朝向/速度由 `beginClimb` 自身设定 |
| G19 | 不适用 | `SurfaceSoundIndex = 11/12`、`BlockedCheck` / `TryActorWiggleUp`（实体相互推挤）、`PutInside` 的 `movementCounter` 回调：前者无音频，后两者本场景无实体生成进块内的需求 |
| G20 | 结构保留 | `Render` 的 `shake`：`shaker` 字段在本类型中从未赋值，故 `shake` 恒 `(0,0)`；引擎保留 `b.shakeX/shakeY` 偏移并在所有坐标上相加，以保证与 IL 结构一致 |

### 21.6 第四轮（REA 深度复刻）新增证据

在第三轮「能跑」的基础上，逐条复核 `DreamDashCheck` / `DreamDashUpdate` / `OnCollideH` / `OnCollideV` / `UpdateSprite` / `DreamBlock.WobbleLine` 的 IL，补齐以下偏差（dump 文件：`player_dream_il.txt`、`player_collide_il.txt`、`player_normal_il.txt`、`dream_il.txt`）：

| 主题 | IL 事实 | 落点 |
|---|---|---|
| 出口判定顺序 | `NaiveMove` → `if (dreamDashCanEndTimer > 0) timer -= dt` → `CollideFirst<DreamBlock>(Position)`；出块后先 `DreamDashedIntoSolid()`，失败且 `timer <= 0` 才 `Freeze(0.05)`、判定出口跳 / `MoveHExact(∓5)` / `GrabCheck` | 引擎 L613–690 |
| `DreamDashedIntoSolid` | 先 `CollideCheck<Solid>(Position)`，重叠则四层循环 `i=1..5 step2` → `j=-1,1` → `k=1..5 step2` → `l=-1,1`，偏移 `(i*j, k*l)`；首个非实心点立即平移并 `return 0`，25 点全实心 `return 1`（→ `Die`，Assist 无敌时反向弹回） | 引擎 L631–653 |
| 上斜冲刺出口 | `else if (DashDir.Y < 0 && DashDir.X != 0)` → 直接返回 0（跳过贴墙修正与抓墙判定） | 引擎 L667–672 |
| `MoveHExact` 语义 | IL 传 `onCollide = null, collidable = null`；`Actor::MoveHExact` 逐像素推进，遇到实心即停，不触发 `OnCollideH`、不改 `Speed` | 引擎 `moveHExact()` L854 |
| `CollideCheck<Solid>` 与目标块 | `DreamBlock : Celeste.Solid`（`dbg_type.py` 证实），但若把目标块本身计入 `CollideCheck<Solid>(Position + dir)`，则轴平移（垂直于运动方向 ±4px）无法把 11px 高的身体移出 64px 高的块内部 → 任何方向都进不了块，与游戏事实矛盾。故引擎在 `DreamDashCheck` 内用 `solidAt`（排除 DreamBlock 的实心）判定；出口贴墙仍用含 DreamBlock 的 `bodySolidAt` + 撞到即停的 `MoveHExact`，两者等价于「贴住身后的实心」 | 引擎 L844–862 |
| 三处 Check 时序 | 水平：`OnCollideH` 内 `DreamDashCheck` 位于 `DashCorrectCheck` 角修正之后（`player_collide_il.txt` L137d99–137db5）；向上：位于 `UpwardCornerCorrection` 与 `varJumpTimer < 0.15f → 0` 之后（L138102–13811e）；向下：位于 `OnGround` / `MoveHExact` / `MoveVExact(1)` 循环之后 | 引擎 L1506 / L1582 / L1639 |
| 退出 9 的帧不重复位移 | 原作 `StDreamDash` 的 `NaiveMove` 已在本帧完成，出块后 `State = 0` 不会再跑一次普通物理；引擎用 `startedDreamDash` 记录帧首状态，退出帧只跑 `updateSharedVisuals` | 引擎 L1011 / L1038 |
| `UpdateSprite` | `State == 9` → `dreamDashIn`/`dreamDashLoop`；否则 `LastAnimationID.StartsWith("dreamDash") && != "dreamDashOut"` → `dreamDashOut`；`CurrentAnimationID == "dreamDashOut"` 期间不再改播 | 引擎 L1736–1750 |
| `Jump(bool particles, bool fromDreamBlock)` | `fromDreamBlock = true` 时在 `BottomCenter` 播 4 粒 `-π/2` 尘土（另有 `jump_dreamblock` 音效，见 G14）；出口跳调用 `Jump(true, true)` | 引擎 L684–700 + 场景 `onDreamJump` |
| `OnPlayerExit` | `Dust.Burst(player.Position, Calc.Angle(player.Speed), 16, null)`——原点是玩家位置、角度是速度方向（不是方块中心） | 场景 L1606 |
| `WobbleLine` | `whiteFill > 0` 时 `lineColor / backColor = Color.Lerp(color, White, whiteFill)`（栈序为 color 在前、White 在后）；循环 `i = 2`、`step = 16`、`while (i < len - 2)`，`i + 16 >= len` 时 `amp = 0` | 场景 L1242–1269 |
| 残影门控 | `StDreamDash` 内仅当 `CollideFirst<DreamBlock>` 非空才 `Scene.OnInterval(0.1f) CreateTrail()` | 引擎 L1682–1689 |
| `Displacement` | 同 `0.04s OnInterval` 内另发 `AddBurst(Center, 0.3f, 0f, 40f, 1f)` 并设 `WorldClipCollider = dreamBlock.Collider`、`WorldClipPadding = 2` | 未移植，见 G15 |

### 21.7 第五轮（手感 / 操作逻辑 / 交互效果）新增证据

依据用户反馈「做的不像原作，手感和操作逻辑，以及与人物的交互效果都不如」，复核 `DreamDashCheck` 门禁、
`Player.Update` 着地 bookkeeping 与 `DreamDashBegin` 的字段写入（dump：`player_dream_il.txt`、
`player_normal_il.txt`、`dream_il.txt`）：

| 主题 | IL 事实 | 落点 |
|---|---|---|
| `DreamDashCheck` 门禁 | `player_dream_il.txt` L11–26：`dir.X == Sign(DashDir.X)` 命中即 `beq` 跳过 Y 检查；否则才 `if (dir.Y != Sign(DashDir.Y)) return false`（`bne.un`）。等价 `dirX==SignX \|\| dirY==SignY`；旧实现是双轴 AND → 斜向冲刺撞墙/撞地/撞顶全部进不了块（斜向冲刺 `dir=(±1,0)` 时 Y 分量为 0） | 引擎 L534–541 |
| 着地清 `AutoJump` | `Player.Update` L13043–13053：`if (onGround && State != StClimb) { AutoJump = false; Stamina = 110f; ... }`。引擎把 `AutoJump` 当「按住跳跃」参与半重力与 varJump，不清会长期发飘 | 引擎 L936–945 |
| `DashAttackTimer` | `DreamDashBegin` 只写 `Speed`/`TreatNaive`/`Depth`/`CanEndTimer`/`Stamina`/`dreamJump` 与音效，**不碰** `dashAttackTimer`；timer 由 `Player.Update` 顶层继续递减 → 出块后仍 `DashAttacking`，单次 dash 可链式穿过相邻多块 | 引擎 L575–588 |
| `FootstepRipple` | `DreamBlock.FootstepRipple(p)`：`playerHasDreamDash` 时 `Displacement.AddBurst(p, 0.5f, 0f, 40f, 1f)`；调用点：落地 `Position`、攀爬跳离 `Position + (Facing*3, -4)`、墙跳离 `Position + (dir*3, -4)` | 场景 `onLand`（落地）已接；攀爬/墙跳见 G22 |
| 块内 `Displacement` | `DreamDashUpdate` 块内：`OnInterval(0.04f) AddBurst(Center, 0.3f, 0f, 40f, 1f)` | 场景 `tick()` 近似，见 G21 |

第五轮缺口：

| 编号 | 状态 | 说明 |
|---|---|---|
| G21 | 表现近似 | `Displacement.AddBurst` 以白色扩张圆环近似（半径 2→40、0.25s 淡出，强度沿用 IL 的 0.3 / 0.5）；无屏幕像素位移与 `WorldClip` 裁剪 |
| G22 | 仍缺 | 攀爬跳离 / 墙跳离 DreamBlock 的 `FootstepRipple` 调用点未接：引擎未区分跳跃类型，需新增状态机回调，本轮不做 |

### 21.8 第六轮（REA + Atlases 全量复核）偏差工单

用户反馈：「手感和画面表现属于简约相似但不是近乎完全一致」。本轮对 `Celeste.DreamBlock` 全方法（含嵌套协程）、`Player.DreamDash*` 五方法、`OnCollideH/V`、Monocle `CollideCheck` 全重载做完整 IL dump，并逐帧核对 `Atlases/Gameplay/objects/dreamblock/` 素材。
证据文件（%TEMP%）：`dreamblock_il.txt`（1450 行）、`dreamblock_nested_il.txt`（1140 行）、`player_dreamdash_il.txt`、`oncollide_il.txt`、`collidecheck_il.txt`、`dump_methodspec.py`（MethodSpec 泛型实例表手写解码）。

**关键翻案（泛型解析）**：`DreamDashCheck` 修正循环里那处 `call 721420819` 不是 `CollideCheck<Solid>`，而是 MethodSpec `CollideCheck<Solid, DreamBlock>`；`collidecheck_il.txt` L119–176 证明 Monocle 双泛型版本是**排除语义**——遍历 `Tracker.Entities[typeof(Entity)]`（全体实体），`if (listT1.Contains(e)) continue; if (listT2.Contains(e)) continue;`，只与「既非 Solid 也非 DreamBlock」的可碰撞实体判定。§21.6「CollideCheck\<Solid\> 与目标块」一行的逼近推理作废（原作连瓦片实心都排除，不只是排除 DreamBlock）。

| ID | 原作行为（IL 出处） | 当前引擎行为 | 修复 |
|---|---|---|---|
| D-A | `LineAmplitude(offset, i) = (float)(Math.Sin(offset + i/16f + Math.Sin(offset*2f + i/32f) * 2π) + 1f) * 1.5f`（`dreamblock_il.txt` L1218–1243；调用处 L1121–1135 传 `wobbleFrom/To + offsetArg`） | 场景 `dreamLineAmplitude` 少了外层 `offset +` 项，内层误写 `i*2/32 + offset` → 四条边波形与原作不同 | 按 IL 重写公式 |
| D-B | ctor `particleTextures = [sub(14,0,7,7), sub(7,0,7,7), sub(0,0,7,7), sub(7,0,7,7)]`（`dreamblock_il.txt` L49–93）：idx 0..3 到图集横坐标是 `[14,7,0,7]`，非单调 | 场景直接 `sx = idx*7` → L0 粒子 idx=3 时 sx=21 越界画空（particles.png 仅 21px 宽），L0 层 1/4 时间粒子消失、各层帧位与原作错开 | 加 `DREAM_TEX_SX = [14, 7, 0, 7]` 映射表 |
| D-C | `DreamDashedIntoSolid` 四层循环：`i=1..5 step 1`、`j=-1..1 step 2`、`k=1..5 step 1`、`l=-1..1 step 2` → **100** 个探测点 (±1..±5, ±1..±5)，首个空位即平移（`player_dreamdash_il.txt` L504–573；探测用 `CollideCheck<Solid>` 单泛型，含梦境块） | 引擎 i/k 步长 2 → 只探 36 点，脱困位置可能与原作不同 | `i++` / `k++` |
| D-D | `DreamDashUpdate` 出口分支：`if (DashDir.Y >= 0f || DashDir.X != 0f)` → 贴墙修正段；**纯向上**（Y<0 且 X==0）直接返回 StNormal（`player_dreamdash_il.txt` L368–377：`bge.s 303` / `beq 542`） | 引擎条件写反：上斜（Y<0 且 X≠0）直通 Normal（漏贴墙吸附与抓墙），纯向上误入贴墙修正段（按抓+推方向会错误进攀爬） | 分支改为 `dashDir.y >= 0 || dashDir.x !== 0` |
| D-E | 修正循环触发与探测均为 `CollideCheck<Solid, DreamBlock>`（排除语义）：瓦片/果冻/前墙/梦境块全跳过，本场景只剩尖刺与车（非 Solid 可碰撞实体）可能触发；四块 dreamBlock 周围无此类实体 → 恒 false → 玩家必然直接进块 | 引擎用「不含 DreamBlock 的实心」（瓦片+果冻+前墙）判定 → 梦境块贴实心时错误触发修正，极端时 return false 进不了块 | 引擎新增 `setDreamForeignFn` 钩子（场景接尖刺+车矩形）；删除 `solidAt`/`setSolidAt` |
| D-F | `OnCollideH`/`OnCollideV`：`DreamDashCheck` 成功 → `StateMachine.State = 9` → **立即 `dashAttackTimer = 0; gliderBoostTimer = 0`**（`oncollide_il.txt` L232–243 / L535–546 / L825–836）。链式穿块靠 `TreatNaive` + 每帧 `CollideFirst<DreamBlock>`（相邻块不离开 StDreamDash），不靠 DashAttacking。§21.7「不碰 dashAttackTimer」结论作废 | 引擎未清 `dashAttackTimer` | `beginDreamDash` 内清零；引擎无 glider 系统，`gliderBoostTimer` 记 gap |
| D-G | 出口贴墙修正探测用 `CollideCheck<Solid>` 单泛型（MethodSpec 721420414，`player_dreamdash_il.txt` L390/L411），**含**梦境块 | 引擎 `bodySolidAt` → 场景 `bodySolid(skipDream=false)` 已含梦境块 ✓ | 无需修改，注释补 IL 出处 |
| D-H | 抓墙出口（默认 Assists.NoGrabbing=false）：`Facing = moveX; return 1`（StClimb），**不执行** `ClimbTrigger`/`Speed.X = 0`——清零是 NoGrabbing=true 分支（`player_dreamdash_il.txt` L449–461：`brfalse.s 540` → `ldc.i4.1 ret`） | 引擎在 `beginClimb` 前多写了 `this.vx = 0` | 删除两处 `vx = 0`（`ClimbBegin` 内部逻辑不动） |

本轮重核确认一致（不改）：`Freeze(0.05)`；出口跳 `Jump.Pressed && DashDir.X != 0` → `dreamJump=true` + `Jump(true,true)`；`DreamDashEnd` 全套（Depth=0 / AutoJump / RefillDash+RefillStamina / TreatNaive=false / jumpGraceTimer=0.1+dreamJump / `OnPlayerExit` / dreamSfx 停播 / Rumble(1,0)）；块内 `OnInterval(0.1) CreateTrail` + `OnInterval(0.04) AddBurst(Center,0.3,0,40,1)`（WorldClip=块体 Collider、Padding=2）；脱困 100 点全堵 → `Die(Vector2.Zero,false,true)`（Assist 无敌才弹回）；粒子层权重 `Choose(0,1,1,2,2,2)` = 1/6:2/6:3/6；L0/L1/L2 九色板；视差 `0.3+0.25*layer` + `PutInside` 回卷；`animTimer += 6dt`、`wobbleEase += 2dt`；WobbleLine `i=2/step=16/while(i<len-2)/i+16>=len→amp=0`；whiteFill 时 `Color.Lerp(color, White, whiteFill)` 栈序；粒子仅画块内 2px 边距内者；相机剔除。

`Activate` 协程（本场景不触发，备档）：yield 1s → `Rumble` → `shaker(0.02)` → `whiteFill=CubeIn(p)`（p+=dt）→ 停 shaker → yield 0.5s → `ActivateNoRoutine` + `whiteHeight=whiteFill=1` → p 1→0：`whiteHeight=p`、`OnInterval(0.1)` 每 4px 高 Emit `P_WingsBurst`、`Shake(0.3)`、p-=0.5dt → `whiteFill -= 3dt` 至 0。

**落地状态**：D-A ~ D-H 已全部移植（`internet_cafe-1.js`：D-A/D-B；`celeste-character.js`：D-C/D-D/D-E/D-F/D-H；D-G 确认无需改）。`internet_cafe.html` bump 至 `celeste-character.js?v=12` / `internet_cafe-1.js?v=20261029a`。Node vm 断言 29/29 通过（`%TEMP%\test_dreamblock.js`：振幅公式全扫逐点对 IL、取图映射、100 点脱困行为、三类出口分支、排除语义修正循环、进块清 dashAttackTimer、出口跳回归）。残留 gap：gliderBoostTimer 无对应系统；抓墙出口的 ClimbCheck 用引擎统一 3px 墙探（原作 2px），差异 ≤1px 未单独立项。

### 21.9 第七轮：交互逻辑与穿越表现（用户实测反馈 → REA 定位）

用户反馈原文：「穿越dreamblock的动画效果以及，Madeline站在dreamblock上不能跳，攀爬dreamblock也不行」。

新增取证（%TEMP%）：`dump_depth3.py`（DreamBlock..ctor 常量）、`dump_sort.py`（Monocle 排序链）。

| ID | 现象 | REA / 素材证据 | 根因与修复 |
|---|---|---|---|
| E-A | 站在 DreamBlock 顶上按跳，人被瞬间压回；贴块侧面按抓也爬不动 | `Player.OnCollideV`（`oncollide_il.txt` L1–120）：`Speed.Y < 0` 分支的撞顶判定是 `CollideCheck<Solid>(Position - Vector2.UnitY)` —— 语义是「**身体盒整体上移 1px** 后与实体重叠」，而不是「块底边低于头顶」 | 场景 `ceilingY()` 的 DreamBlock/果冻分支旧条件只有 `x` 重叠 + `dcb > head + 0.01`。站在块顶时脚底 = 块顶，`head = 块顶 - 11`，块底 `dcb = 块顶 + h` 必然 `> head`，于是块自身底面被当成头顶天花板；跳跃（vy = −105）、攀爬上移（vy = −45）一产生负速度就触发 `y = cy + BODY_H` 被压回。修复：`headUp = head - 1, feetUp = feetY - 1`，条件改为 `b.y + b.h > headUp && b.y < feetUp`（块顶在脚底之上者不参与），瓦片/前墙分支保持原有「本格上方」语义 |
| E-B | 梦冲穿过块时看不见 Madeline，只见黑块 | `DreamBlock..ctor` IL `L004b–0051`：`Depth = -11000f`（`oneUse` 时 `= 5000f`）；`Player.DreamDashBegin`：`Depth = -12000f`，`DreamDashEnd` 复位 `0`。Monocle `EntityList.UpdateLists` 调 `Sort(CompareDepth)`；`EntityList..cctor` 的 lambda `<>c::<.cctor>b__42_0` IL 为 `Sign(b.actualDepth - a.actualDepth)` → **按 actualDepth 降序**（Depth 大者先画，Depth 小者后画 = 在前面） | 旧 `render()` 在 `dreamDashing` 时把玩家**先**画、块后画，黑底把玩家完全盖住，方向与排序相反。修复：`!dreamDashing` 时玩家先画 → `drawDreamBlocks()` → `dreamDashing` 时玩家后画，对齐 −12000 < −11000 的最终叠序；注释落 IL 出处 |
| E-C | 穿越特效只是白色圆环，没有原作「推开像素」的质感 | `DreamDashUpdate`：块内 `OnInterval(0.04) AddBurst(Center, 0.3, 0, 40, 1)`；`Displacement` 的 `WorldClipCollider = dreamBlock.Collider`、`WorldClipPadding = 2`（第六轮 §21.8 已核） | 引擎无 shader，无法真做像素位移。近似升级：`spawnRipple` 增加 `angle`（`Math.atan2(vy, vx)`）与 `clipBlock`；绘制时 `ctx.clip()` 限制在块体向内 2px，`ctx.scale(1.7, 1)` 沿速度方向拉伸，位置改用身体中心 `m.y - 5.5`，形成「穿行气流」而非同心圆 |
| E-D | ——（复核项） | `groundY()` 的块顶分支带 `ref = min(m.y, feetPrev)` 就近过滤；`wallAt` / `wallCollideAt` 的块侧面分支带 `y` 重叠判定 | 均与原作 `CollideCheck<Solid>(Position + UnitX*dir)` 语义一致，**无需修改**。E-A 之所以「不能跳也不能爬」是同一条 `ceilingY` 错误同时污染了跳跃与攀爬上移 |

**落地状态**：E-A/E-B/E-C 已移植（均在 `internet_cafe-1.js`：`ceilingY` ≈ L531–566、`render()` ≈ L1540–1547、`spawnRipple`/`drawDreamRipples` ≈ L1029–1040 / L1483–1512、块内 AddBurst 调用点 ≈ L1620–1630）。`internet_cafe.html` bump 至 `internet_cafe-1.js?v=20261029b`（`celeste-character.js` 本轮未改，保持 `v=12`）。Node vm 断言 22/22 通过（`%TEMP%\test_dreamblock_interact.js`：`ceilingY` 新语义源码+行为（站块顶 null / 贴块底 112 / 块下 40px null）、站块顶按跳 vy = −105、贴块面 grab 进 Climb 且 `climbWallDir = 1`、渲染三段位置关系与 Depth 注释、Displacement 拉伸/裁剪源码、攀爬上移不被顶回）。

### 21.10 第八轮：DreamBlock 全套音效（G14 收口）

用户命题：「把 dreamblock 的音效加上……上面都写了文字」，即按 §16.5 已取证的 FMOD event 名接本地素材。

**IL 事实（§16.5 已记录，本轮直接用）**：

| 时机 | 原作调用 | 语义 |
|---|---|---|
| `DreamDashBegin` | `Play("event:/char/madeline/dreamblock_enter")` | 一次 dash 只在 Begin 播一次（链式穿相邻块不重播） |
| `DreamDashBegin` | `Loop(dreamSfxLoop, "event:/char/madeline/dreamblock_travel")` | 独立的 SoundSource 循环，覆盖整个块内穿行 |
| `DreamDashEnd` | `Stop(dreamSfxLoop); Play("event:/char/madeline/dreamblock_exit")` | 顺序为 `OnPlayerExit` → 停 travel → 播 exit |
| `Jump(true, true)` | `jump_dreamblock` | 出口跳；素材缺，保留 gap |
| `DreamDashedIntoSolid` 脱困失败 + `Assists.Invincible` | `assist_dreamblockbounce` | 本场景无 Assist，走 `Die`，无需素材 |

**素材核对**：`blog-ui/celeste-sounds/dreamblock/` 实到 `dreamblock_enter_01~04.wav`（FMOD event 内 4 变体，`Play` 随机取）、`dreamblock_travel_loop.wav`（循环段）、`dreamblock_exit_01~04.wav`（4 变体）。`jump_dreamblock` / `assist_dreamblockbounce` 全库 glob 0 命中。

**落地**（`internet_cafe-1.js`）：
- L699–718：`DB_SND` 常量 + `DB_ENTER/DB_EXIT` 各 4 个 `snd()` 实例 + `sfxDreamTravel`（`loop = true`）+ `dreamTravelStart/Stop`；沿用场景既有 `muted`/`unlock` 门禁与 `playSfx` 范式（未引入 GaplessAudio——`internet_cafe.html` 未加载 `gapless-audio.js`）。
- L1718–1737：`onDreamDashEnter`（随机 enter + 起 travel）、`onDreamDashExit`（Dust 后停 travel + 随机 exit）、`onDreamDashDeath`（停 travel 再 `die()`）。
- `respawn()` L1074：`dreamTravelStop()`，覆盖中途死亡/重开导致的残留循环。

**验收**：`node --check` 通过；`%TEMP%\test_dreamblock_sfx.js` 22/22 通过（9 个素材文件存在、路径/4 变体/循环源码、三处回调接线、死亡/重生停播、`dreamTravelStart/Stop` 行为级：播放一次 / 暂停归零 / 未解锁不播）。`internet_cafe.html` bump 至 `internet_cafe-1.js?v=20261029c`。

**残留**：`jump_dreamblock`（出口跳）无素材；`assist_dreamblockbounce` 不适用。

---

## 22. 第四轮：灰尘兔（`Celeste.DustGraphic`）取证与商店页移植

**用户命题**：「用 REA 仔细研究第三章的 duodustbunny 并实现在 shop 页面」。

**取证结论（与命题不一致，必须先说）**：

| 命题 | 二进制事实 |
|---|---|
| 存在名为 `DustBunny` 的实体类型 | ❌ 全库 TypeDef 无 `DustBunny` / `Dust` 开头的危险物；「灰尘兔」对应 `Celeste.DustGraphic` |
| 出自第三章（Celestial Resort） | ⚠ 部分正确：第三章的 `Spinner` 变体 `Celeste.DustStaticSpinner` / `DustTrackSpinner` / `DustRotateSpinner` **各自 `newobj` 一只 `DustGraphic`**（第二轮 REA 补正，见 §22.6），但它们只是把兔子挂在 spinner 上做位移，不是独立的地图实体类型；credits 的 `Celeste.CS07_Credits+<DustyRoutine>d__30` 是第 4 个宿主 |
| 第三章相关 | ⚠ 仅配色表 `DustStyles` 的 Area 3（resort）是「默认回退样式」，含红眼 `danger/dustcreature/eyes`；素材确实属 resort 目录 |

因此本轮移植的是 **`DustGraphic` 类本身**（4 节点绒毛 + center + 眼 + 眨眼 + 自旋）。初版外层运动曲线取 credits 里 `DustyRoutine` 的原文数值（3 只一组、向左跑、各背一只破箱）；**第二轮 REA（§22.6）补上第三章三种 spinner 的轨道**，商店页改为「数量 + 轨道家族 + 参数」三层随机组合。

### 22.1 `Celeste.DustGraphic` 成员 IL 证据

来自本地 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` 的 dnfile/dncil 反编译（dump：`dustgraphic_il.txt`、`dust_helpers_il.txt`、`blink_il.txt`、`credits_il.txt`）。

| 成员 | IL 事实 |
|---|---|
| `.ctor` | `Scale = 1`；`EyeFlip = 1`；`leftEyeVisible = rightEyeVisible = true`；`center = Calc.Random.Choose(GFX.Game.GetAtlasSubtextures("danger/dustcreature/center"))`；`offset = rand*4`（未使用）；`timer = rand`；`EyeDirection = EyeTargetDirection = Calc.AngleToVector(rand*2π, 1)`；`eyeTextureIndex = Random.Next(128)`；`eyesExist = true`；`autoControlEyes = false` 时不掷 0.5/0.3 概率，`eyesFollowPlayer` 恒 `false` |
| `.Update` | `timer += DeltaTime * 0.6`；眼睛缓动 `EyeDirection = Calc.Approach(EyeDirection, EyeTargetDirection, 12*dt)`；`blink?.Update()`；`nodes` 为空且未 `Establish` → `AddDustNodesIfInCamera()` 后 `return`；否则逐个 `node.Rotation += DeltaTime * 0.5` |
| `AddDustNodesIfInCamera` | 4 个节点方向 = `SafeNormalize(±1, ±1)`；`ignoreSolids = true` 时 `Enabled` 全 `true`；`eyesMoveByRotation = (启用的节点数 < 4)`；`eyesExist` → `blink = Coroutine(BlinkRoutine())`；眼贴图 = `DustStyles.Get(scene).EyeTextures[eyeTextureIndex % count]` |
| `DustGraphic+Node` | `Base = Choose("danger/dustcreature/base" 的 3 张)`；`Overlay = Choose(".../overlay" 的 3 张)`；`Rotation = rand*2π`；`Angle = 方向 * (1,1)`（`ignoreSolids` 时不做贴墙拉伸）；字段为 `Base/Overlay/Rotation/Angle/Enabled`（无条件 `.ctor`） |
| `.Render` | `InView` 才绘制；每个 `Enabled` 节点：`Base.Render(Position + Angle*Scale, White, Scale, Rotation)`，`Overlay` 同位置、角度取反；最后 `center.Render(Position, White, Scale, timer)` |
| `DustGraphic+Eyeballs.Render` | 眼位 = `RenderPosition + (EyeDirection*5 ± perp*3) * Scale`，`perp = SafeNormalize(-dir.Y, dir.X)`；颜色 = `DustStyles.Get(scene).EyeColor`；`Depth = 兔深度 - 1`（画在兔本体之上） |
| `DustGraphic+<BlinkRoutine>d__45` | 循环：等 `2 + rand*1.5` → 左眼闭 → 等 `0.02 + rand*0.05` → 右眼闭 → 等 `0.25` → 双眼睁开 |
| `DustStyles.cctor` | Area 3（默认回退）：`EdgeColors = #f25a10 / #ff0000 / #f21067`，`EyeColor = Color.Red`，`EyeTextures = "danger/dustcreature/eyes"`（eyes00–02） |
| `DustGraphic.OnHitPlayer` | `shakeTimer = 0.6`、眼睛换 `deadEyes`；**全库无调用者**（credits 里兔子不参与受伤流程） |

`CS07_Credits+<DustyRoutine>d__30`（外层运动）：

| 项 | IL 事实 |
|---|---|
| 起点 | `oshiro.Position + (220, -24)`，`Entity.Depth = -50` |
| 数量 / 排布 | 3 只，第 i 只 `X = offset.X + i*24` |
| 生成参数 | `ignoreSolids = true`、`autoControlEyes = false`、`autoExpandDust = true` |
| 携带物 | 每只附加 `decals/3-resort/brokenbox_<a\|b\|c>`，`JustifyOrigin(0.5, 1)` 且 `Position (0, -4)`（**商店页不画**，见 22.5 D7） |
| 时序 | 先生成、`yield return 3.8f`，之后每帧：摆位 → `offset.Y = Approach(offset.Y, start.Y + 16, dt*16)` → `offset.X -= 26*dt` → `timer += dt` |
| 摆动 | `bunny[i].Y = offset.Y + sin(timer*4 + i*0.8) * 4` |
| 终止 | `offset.X < level.Bounds.Left + 120` 时停 |

### 22.2 移植常量（[celeste-dust-bunny.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js)，L66–79）

| 常量 | 值 | 出处 |
|---|---|---|
| `SPEED` | 26 | `offset.X -= 26*dt` |
| `SPACING` | 24 | `offset.X + i*24` |
| `BOB_FREQ` / `BOB_PHASE` / `BOB_AMP` | 4 / 0.8 / 4 | `sin(timer*4 + i*0.8) * 4` |
| `SINK_RATE` / `SINK_DIST` | 16 / 16 | `Approach(offset.Y, start.Y + 16, dt*16)` |
| `EYE_OFFSET` / `EYE_SEP` | 5 / 3 | `Eyeballs.Render` |
| `NODE_SPIN` / `CENTER_SPIN` | 0.5 / 0.6 | `Update` 两处自增 |
| `DIAG` | `√½` | `SafeNormalize(1,1)` |
| `GROUP_SIZE` / `GROUP_DELAY` | 3 / 3.8 | `DustyRoutine` |
| `EYE_COLOR` | `#ff0000` | `DustStyles[3].EyeColor = Color.Red` |

眼贴图原作是「黑底 + 纯白像素」再用 `Color.Red` 乘算，故 `tintRed()` 用 canvas `globalCompositeOperation = 'multiply'` + 纯红 `fillRect` 复刻同一乘算（黑不变、白变红）。**坑**：`multiply` 的合成方式仍是 source-over，alpha=0 的像素会被直接涂成不透明红色 → 整张 8×8 变成红方块；所以后面必须再以 `destination-in` 画一次原图，还原原始 alpha（黑环、中空、透明边）。此前线上就是漏了这一步。

**外观复核（第二轮 IL，针对「样貌不像」反馈）**：`Render` 的节点位置是 `RenderPosition + Node.Angle * Scale`（IL `0042–004d`），而 `Scale = 1`、`Angle = 方向 * (1,1) = ±0.7071` → 4 个 16×16 绒毛贴图（base/overlay 各一层）几乎完全重叠，只靠各自随机 `Rotation` 叠出绒毛层次，**不是四个分开的球**；最后再叠一张 16×16 的 `center`（角速度 `timer`），眼贴图 8×8 画在 `dir*5 ± perp*3` 处。因此「≈16×16 黑绒球 + 黑环红瞳双眼」是原作素材与 IL 本身的样子，商店页与之一致；再「更像」只能靠偏离原作的风格化（换蓝/白瞳、放大、固定视线），本轮未做。

### 22.3 落点

| 内容 | 落点 |
|---|---|
| `load()` 预载 3 base / 3 overlay / 3 eyes（经 `tintRed`）/ center00 / deadEyes，缺图不阻断（共 11 张） | [L121–133](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js#L121-L133) |
| `createBunny(x, y)`：4 节点方向 / `Angle` / `Enabled=true` / `Base/Overlay/Rotation` 随机、`eyeTextureIndex = rand*128`、`timer = rand` | [L140–174](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js#L140-L174) |
| `bunny.update(dt)`：`timer += dt*0.6`、眨眼状态机、`node.Rotation += dt*0.5` | [L176–198](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js#L176-L198) |
| `bunny.draw`：4×(Base 正转 / Overlay 反转) → center（`timer` 角）→ 双眼（`dir*5 ± perp*3`） | [L200–240](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js#L200-L240) |
| `createGroup`：3 只、`wait = 3.8`；`step(dt)` **每帧都驱动 `bunny.update`**，位移被 `wait` 门控；`draw` 在等待期内不画 | [L253–282](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js#L253-L282) |
| shop 接线：`DUST.load()`、`DUST_START_X/Y = 336 / -24`（三只 `x = 336/360/384` 全部在右墙 320 之外） | [shop.js L770–774](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/shop.js#L770-L774) |
| 主循环：组步进 / `offset.x + 2*24 <= WALL_L` 时整组离场并立刻换下一组（固定路线循环） | [shop.js L1509–1518](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/shop.js#L1509-L1518) |
| 绘制层级：在 Madeline 之前（`Depth = -50`，与人同层但更靠后） | [shop.js L1619](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/shop.js#L1619) |
| HTML 引入 + 版本号 | [shop.html L86–88](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/shop.html#L86-L88)（`celeste-dust-bunny.js?v=20261029b`、`shop.js?v=20261029b`） |

**场景层有意改动（非原作数值，代码内已标注「场景决定」）**：原作 `DustyRoutine` 是 credits 的一次性演出，跑出边界即结束；商店页是常驻房间，故改为固定路线循环——三只全部越过左墙（`offset.x + 2*24 <= WALL_L`）即整组换新，从 `(336, -24)` 重新入场。`336` 在右墙（`ROOM_W = 320`）之外（三只 `x = 336/360/384`），配合 3.8s 等待，保证三只始终从屏幕外自然走入，不会半空凭空出现；`-24` 是让「下沉 16」后的中心 `y = -8` 落在 `16×16` 贴图贴地的位置。**按用户要求不绘制箱子**（见 22.5 D7）。

### 22.4 数值断言（Step 5）

`node test_dust_bunny.js`（Node `vm` 沙箱，`sandbox.window = sandbox`，stub `Image` / `document`）：

| 组 | 断言 | 结果 |
|---|---|---|
| 1 常量 | `SPEED 26 / SPACING 24 / BOB 4·0.8·4 / SINK 16·16 / EYE 5·3 / SPIN 0.5·0.6 / GROUP 3·3.8 / DIAG √½ / EYE_COLOR` | 8/8 |
| 2 组创建 | 3 只 / 初始 `x = start + i*24` / `wait = 3.8` / `start` 快照 | 4/4 |
| 3 节点与眼 | 4 节点 / 方向 `±DIAG` / `Enabled` 全真 / `Angle` 四象限齐备 / `Base`、`Overlay` 落在 0–2 / `eyeTextureIndex < 128` / 双眼初始可见 / `timer ∈ [0,1)` | 8/8 |
| 4 3.8s 等待 | 等待期内不位移 / `wait` 单调递减 / `bunny.update` 仍在推进（`timer`、节点 `Rotation` 增长）/ 越过 0 后开始位移 | 5/5 |
| 5 运动 | `x` 每帧减 `26*dt` / 组内间隔恒 24 / `sin(timer*4 + i*0.8)*4` 振幅与相位 / 下沉 `Approach` 上限 `start.Y+16` | 8/8 |
| 6 眨眼 | 首段 `2 + rand*1.5` / 左闭 → 右闭 → 双开三段状态迁移 / 闭合时长 `0.02+rand*0.05` 与 `0.25` | 3/3 |
| 7 素材 | 11 张 dustcreature 素材存在（base00–02、overlay00–02、eyes00–02、center00、deadEyes）+ 3 条「无箱子」回归（`assets.box` 不存在 / 源码无 `BOX_DIR` / 源码无 `A.box`） | 14/14 |

**合计 `50/50 passed`**（首跑 47/50：3 条失败是把断言写在 `step()` 之后比对 `x`，而 IL 顺序是「先按当前 `offset` 摆位、再移动 `offset`」；测试改为先取 `offset` 快照再步进后通过，实现未改）。

素材实测尺寸：base/overlay/center 均 `16×16`，eyes/deadEyes 均 `8×8`；`brokenbox_*` 同为 `16×16` 但已不载入（D7）。`bristle.png`、`templeeyes00–02` 存在但 `DustGraphic` IL 未引用。

### 22.5 缺口（诚实标注）

| 编号 | 状态 | 说明 |
|---|---|---|
| D1 | 未移植 | `DustEdge` / `DustEdges`（dust 边缘渲染钩子与整屏 dust 噪声）：商店页没有 level 级 dust 边缘系统，`DustEdge` 仅是把兔子 `Render` 转交给 `DustEdges` 的钩子 |
| D2 | 未接线 | `OnHitPlayer`（`shakeTimer = 0.6` + `deadEyes`）：全库无调用者，自创「触碰受伤」会偏离原作，故不接 |
| D3 | 不可复现 | `randomSeed` + `System.Random` 序列：贴图 / 眼贴图选择用 `Math.random`，随机分布一致、具体序列不可复现 |
| D4 | 已由 §22.6 取代 | 场景节奏：初版是「三只跑出左墙 → 整组重来」的固定路线；第二轮 REA 改为四条闭环基元随机组合 |
| D5 | 未使用 | `bristle.png` 未被 `DustGraphic` IL 引用 |
| D6 | 未接 | 音效：`DustGraphic` 无音源引用，`Atlases` 也无对应音频，故无声音 |
| D7 | 已按用户要求移除 | 箱子（`brokenbox_a/b/c`）：`DustyRoutine` 里它是每只兔子额外挂的独立 decal（`JustifyOrigin(0.5, 1)`、`Position (0, -4)`），与 `DustGraphic` 本体无关；商店页不绘制，兔子只按固定路线移动 |

---

### 22.6 第二轮 REA：`DustGraphic` 的四个宿主与「随机轨道排列组合」

**用户命题**：「shop 里的 dustbunny 是重复动画、实现形式偏低级，希望像游戏里那样做**重复轨道运动**，且每次刷新页面的**数量与运动轨迹随机排列组合**」。

取证方式：`Celeste.dll`（5.22 MB）→ `dnfile` 扫 TypeDef / MemberRef / FieldRva，`dncil` 逐条 dump IL（TypeDef 全表筛 `Dust` 前缀）。

#### A. 补正：全库 `newobj Celeste.DustGraphic` 共 4 处（不是 1 处）

| # | 宿主 | 构造实参 |
|---|---|---|
| 1 | `CS07_Credits+<DustyRoutine>d__30::MoveNext` | credits 演出（3 只 + 破箱） |
| 2 | `Celeste.DustStaticSpinner::.ctor` | `new DustGraphic(this, bool, true, true)` |
| 3 | `Celeste.DustTrackSpinner::.ctor` | `new DustGraphic(this, true, false, false)` |
| 4 | `Celeste.DustRotateSpinner::.ctor` | `new DustGraphic(this, true, false, false)` |

三种 `Dust*Spinner` 都是 `Celeste.Spinner` 的子类（第三章 Celestial Resort 的旋转/轨道机关），只把 `DustGraphic` 当作贴在身上的装饰粒子，所以**第三章地图实体表里没有独立 dust 实体**——但它们的位移曲线就是原作真实存在的「灰尘兔运动轨迹」，这正是本轮要移植的东西。

#### B. 轨道数值（IL 原文 + `FieldRva` 实测）

| 项 | IL 事实 |
|---|---|
| `TrackSpinner.Update` | `Percent = Calc.Approach(Percent, Up ? 1 : 0, DeltaTime / MoveTimes[Speed])`；到位 → `Up = !Up`、`PauseTimer = PauseTimes[Speed]`、`OnTrackEnd()`；`PauseTimer > 0` 时只递减不移动 |
| `TrackSpinner.UpdatePosition` | `Position = Vector2.Lerp(Start, End, Ease.SineInOut(Percent))` |
| `TrackSpinner..cctor` | `MoveTimes = {0.9, 0.4, 0.3}`（Float32 字节 `6666663f cdcccc3e 9a99993e`）、`PauseTimes = {0.3, 0.2, 0.6}`（`9a99993e cdcc4c3e 9a99193f`）→ 三档速度：一程 0.9 / 0.4 / 0.3 s，端点停 0.3 / 0.2 / 0.6 s |
| `DustTrackSpinner::.ctor` | `EyeTargetDirection = EyeDirection = SafeNormalize(End - Start)`（眼睛盯着去程方向） |
| `RotateSpinner.Update` | `rotationPercent += (Clockwise ? -1 : 1) * DeltaTime / 1.8f` → **1.8 s 一圈**，顺/逆时针只差符号 |
| `RotateSpinner.GetPosition` | `Angle = Lerp(-π/2, 3π/2, Percent)`（起于正上方）；`Position = Center + AngleToVector(Angle) * length`，`length` 由 ctor 用 `|Position - Center|` 记下 |
| `DustRotateSpinner::.ctor` | 眼睛方向 = `AngleToVector(Angle + π/2 * (Clockwise ? -1 : 1))` → 始终朝**切线**（即前进方向） |
| `DustStaticSpinner.Update` | 本体不位移，只 `OnInterval(0.05)` 发粒子 |
| `DustGraphic.Update` | `EyeDirection = Calc.Approach(EyeDirection, EyeTargetDirection, 12 * DeltaTime)` → 本轮补上眼睛缓动 |

#### C. 四条闭环基元（[celeste-dust-bunny.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/celeste-dust-bunny.js) 第三章段）

| 基元 | 对应原作 | 曲线 | 商店页闭环处理 |
|---|---|---|---|
| `trackTraj` | `DustTrackSpinner` | `Lerp(Start, End, SineInOut(Percent))` + 端点停顿 | 往返本身就是闭环，无需改造 |
| `orbitTraj` | `DustRotateSpinner` | `Center + AngleToVector(-π/2 + p*2π) * r`，眼睛取切线；`mult` 可把周期拉成 1.8 / 2.7 / 3.6 s | 圆周本身闭环 |
| `rowTraj` | `Credits.DustyRoutine` | 26 px/s 直线 + `sin(t*4 + i*0.8) * 4`，间距 24 | 原作是**一次性**演出（跑出边界即止）；商店页改成「列车绕环」：环长 `L = 可见弧 + 一格隐藏弧(24)`，每只 `u = mod(u0 + i*24 + dir*26*t, L)`，隐藏弧内 `alpha = 0` → 右墙走出一只的同时左墙走进一只，既无空窗也不穿墙瞬移 |
| `staticTraj` | `DustStaticSpinner` | 不位移（每帧回写基准值，供 bob 叠层不累加） | 原地 |
| `addBob` | credits 的纵向摆动 | `y += sin(t*4 + phase) * 4` | 可叠到任意基元上（orbit 45% / track 35% / static 50% 概率） |

#### D. 排列组合（三层随机）

1. **数量**：`3 + floor(rand*6)` → 每次刷新 3~8 只；
2. **家族组合**：75% 概率出 1~2 行 `row`（每行 3~5 只，行内 24 px 间隔共享相位 `i*0.8`），剩余按 `orbit` 45% / `track` 40% / `static` 15% 抽 `solo`；
3. **参数**：`orbit` 半径 8~26、周期 1.8/2.7/3.6、顺/逆时针、初相位；`track` 两点距离 40~150、任意角度、三档速度、初始去向与进度；`row` 车道高度、方向、整行相位 `u0`；`static` 落点与 bob 相位。

**房间约束**：`makeDustProbe()` 把世界坐标（原生像素，脚底 y=0）映射回归一化房间轮廓 `ROOM_POLY_N`，用贴图四角（±7 px）做 `pointInPoly` 判定；轮廓直接在归一化域上判（`nToXY` 是同一个仿射变换，两域等价），因此不依赖 `roomGeo` 快照，窗口缩放后依然成立。规划期再套 `padded(probe, BOB_AMP)` 为 bob 的 ±4 预留余量，`planOrbit` 用 `circleInside`、`planTrack` 用 `segmentInside` 保证整条轨迹不出墙。

#### E. 断言（`target/test_dust_ensemble.js`，Node vm 沙箱）

| 组 | 断言 | 结果 |
|---|---|---|
| 1 常量 | `MOVE_TIMES` / `PAUSE_TIMES` / `ORBIT_PERIOD 1.8` / `EYE_APPROACH 12` / credits 常量未回归 | 6/6 |
| 2 track | `Percent = dt/MoveTimes`、`SineInOut` 取点、到位掉头、`PauseTimer` 三档、停顿期不动（含「停满那一帧仍不动」，IL 本帧 `return`）、眼睛翻向 | 12/12 |
| 3 orbit | 起于正上方、1.8 s 回原点、半径恒定、顺/逆时针各 1/4 圈、眼睛 = 切线 = 速度方向、`mult=2` 半速 | 9/9 |
| 4 row | 环长 `可见弧+24`、同排 24 间距（正/反向）、`sin(t*4 + i*0.8)*4`、26 px/s、下沉 16 px/s、一个周期回到原 x | 8/8 |
| 5 static | 不位移、`addBob` 摆幅 ±4 且不累加漂移 | 2/2 |
| 6 组合体 | 3~8 只、`plan.total` 与展开后只数一致、20 s 内可见个体恒在房内且从不清屏、至少一条轨道家族 | 4/4 |
| 7 随机性 | 200 次刷新 × 2 s：全不出房、数量覆盖 ≥5 种、轨迹组合 ≥4 种、同数量下亦有不同组合 | 4/4 |
| 8 眼睛 | `12*dt` 缓动 + 收敛到目标方向 | 2/2 |
| 9 兼容 | 旧 `createGroup` 仍可用（3.8 s 等待期不动） | 2/2 |

**合计 `49/49 passed`**；另跑 400 组 × 60 s 压测：出房 0 次、全黑帧 0 帧、可见数 1~8（`≤1 只` 仅出现在「整组都是 row」的极端组合，最长连续 2 帧）。

#### F. 本轮新缺口

| 编号 | 状态 | 说明 |
|---|---|---|
| D8 | 不可复现 | `Dust{Static,Track,Rotate}Spinner` 的 `P_Move` 拖尾粒子：`P_Move` 是静态字段，本机全库字段令牌扫描 **0 命中写入点**（`FieldDef` + `stsfld` 全扫），只能凭场景语义近似——商店页用 1.5 px 橙色小方点、`TTL 0.36 s`、`track/orbit 0.02 s`、`static 0.05 s` 的发射间隔，颜色取 `DustStyles[3].EdgeColors[0] = #f25a10` |
| D9 | 有意近似 | spinner 的 `OnTrackEnd` / `OnSpin` 回调（原作里触发机关音效与地图事件）在商店页无对应系统，未接线 |


---

## 23. 第五轮：`CS10_FinalLaunch`（第九章进太空过场）取证与博客过场移植

**用户命题**：「REA 复刻第九章开头进入太空的过场动画，作为点击头部鸟图标跳转新页面的过场；现在根本一点不像；另外鸟按钮容器太小，喊叫动作被裁」。

**取证目标**：`Celeste.CS10_FinalLaunch` 及其协程 `<Cutscene>d__14`、`<BirdRoutine>d__17`、`<WaveCamera>d__16`，外加它依赖的 `BlackholeBG`、`AscendManager/Streaks`、`Ease`、`Player.SummitLaunch*`。dump 在 `.screenshots/.tmp/rea/`。

### 23.1 逐成员 IL 证据

| 成员 | IL 事实 |
|---|---|
| `CS10_FinalLaunch.OnBegin` | `Audio.SetMusic(null,1,1)`；`ScreenWipe.WipeColor = White`；遍历 Followers 找金草莓 → `hasGolden`；`Add(Cutscene())` |
| `<Cutscene>d__14` | `TimeRate=1`；`boost.Active=false`；`yield 1`；对白 `CH9_LAST_BOOST` 或 `yield 0.152`；`cameraOffset=(0,-20)`；`boost.Active=true`；设 BlackholeBG：`Direction=-2.5`、`SnapStrength(2)`、`CenterOffset.Y=100`、`OffsetOffset.Y=-50`；加 `WaveCamera`、`BirdRoutine(0.8)`、`Streaks(level,null)`；`for p:0→1 (p+=dt/12)`：`fadeToWhite=p`、`streaks.Alpha=p`、`GetEach<Parallax>("blackhole").FadeAlphaMultiplier=1-p`；`while(bird!=null) yield`；`FadeWipe Duration=4`、`WipeColor=White`；`p=cameraOffset.Y; to=180; p5:0→1 (dt/2): cameraOffset.Y = p+(to-p)*Ease.BigBackIn(p5)`；`EndCutscene(true)` |
| `CS10_FinalLaunch.Update` | `timer += dt`；鸟在：`bird.Position = Camera.Position + birdScreenPosition`，`X += sin(timer)*4`，`Y += sin(timer*0.1)*4 + sin(timer*0.25)*4`（每帧先重置，不累积）；`Level.CameraOffset = cameraOffset + cameraWaveOffset` |
| `<WaveCamera>d__16` | `timer=0`；`cameraWaveOffset.X = sin(timer)*16`；`.Y = sin(timer*0.5)*16 + sin(timer*0.25)*8`；`timer += dt*2` |
| `<BirdRoutine>d__17` | `yield 0.8` → `new BirdNPC(level, Zero, 6)`、`Play("flyupIdle")`；`screen=(160,90)`、`topCenter=(160,0)`、`from=(160,180)+(40,40)=(200,220)`、`to=(128,66)`；阶段1 `t+=dt/4`（4s）：`from+(to-from)*Ease.BackOut(t)`，**循环结束后**才 `Play("flyupRoll")`；阶段2 `t+=dt/2`（2s）：`to + (64,0)*Ease.CubeInOut(t)`（to 不更新）；阶段3 `t+=dt/4`（4s）：`to=(192,66)`、`from=topCenter+(-40,-100)=(120,-100)`，`t>=0.35` 时 `Play("flyupRoll")`，`birdScreenPosition = to+(from-to)*Ease.BigBackIn(t)`，再 `X += t*32`；结束 `bird.RemoveSelf()`（≈10.8s） |
| `Ease` | `SineInOut=0.5-Cos(PI*t)/2`；`SineOut=Sin(t*1.570796)`；`CubeIn=t^3`；`CubeInOut` 分段；`BackOut=1-(1-t)^2*(1-2.70158*t)`；**`BigBackIn=33t^5-59t^4+32t^3-5t^2`** |
| `AscendManager/Streaks` | `Alpha=1`；80 粒子；`MinSpeed=600/MaxSpeed=2000`；`manager==null||!Dark` → colors=`[White,#e69ecb]`；`Depth=20`；纹理 `scenery/launch/slice`（32×128，3 张）；每粒子：`x=160+Range(24,144)*Choose(-1,1)`、`y=NextFloat()*436`、`speed=ClampedMap(|x-160|,0,160,0.25,1)*Range(600,2000)`；`Update: Y += Speed*dt`；`Render: a=SineInOut(manager?fade:1 * Alpha)`，位置 `(Mod(x,320), -128+Mod(y,436)) + camera.Position`，scale=`(ClampedMap(speed,600,2000,1,0.25), ClampedMap(...,1,2))*ClampedMap(...,1,4)`，`DrawCentered`；左右 `Draw.Rect(cam.X-10, cam.Y-10, 26, 200)` 与 `cam.X+304` |
| `BlackholeBG` | `BG_STEPS=20`、streams 30~50、particles 150~220、spirals 0~10（12 段）；`Direction=Scale=Alpha=StrengthMultiplier=1`；`bgColorInner=#000000`、`bgColorOuterMild=#512a8b`、`bgColorOuterWild=#bd2192`；mild=`[#6e3199,#851f91,#3026b0]*0.8`、wild=`[#ca4ca7,#b14cca,#ca4ca7]`；portal 贴图 240×240；粒子贴图 `bgs/10/blackhole/particle`（64×64） |
| `Player.SummitLaunchBegin` | `Sprite.Play("launch")`；`Speed = -UnitY*240`；`summitLaunchParticleTimer=0.4` |

### 23.2 移植落地（`blog-ui/js/bird-ascent.js` 整体重写）

整段过场改成 **只依赖发射后名义时间 t 的确定性函数**（`t = 实耗秒 × TIME_SCALE`），跨页只传 `lt` 种子：

| 层 | 实现 |
|---|---|
| 视口 | 固定 320×180 + `Z=max(W/320,H/180)` 的 cover 变换（与原作 play 分辨率一致） |
| 背景 | 离屏 320×180 buffer：20 层 portal（`lt=(1-5t%1)*0.05+i/20`、`scale=ClampedMap(lt,0,1,0.1,4)`、`rot=2πlt`、`pos=center+offset*lt+shake*(1-lt)`）+ 40 streams + 200 particles；整层 `globalAlpha=1-p` |
| 角色 | Madeline `y=-240t`（匀速上升，无落地），`madScreen=(160-camX, 90-camY)`、`camX/Y = cameraOffset+cameraWaveOffset`；姿态 `launch00..07`（`Sprites.xml` delay 0.06 循环），Origin (16,32)；`SpeedRing` 每 0.2s 一枚 |
| 鸟 | 三段屏幕空间飞行 + 正弦抖动；`flyupIdle=FlyUp10..15@0.1`、`flyupRoll=flyup00..FlyUp15@0.1`（4.8s / 8.2s 两次触发） |
| 速度线 | 80 条 slice，`Alpha=p`，`y(t)=y0+speed*t` 闭式；白 / `#e69ecb`；左右 26×200 边缘条 |
| 白化 | `p=t/12`，最后一层整屏白 `alpha=p` |
| 收场 | `finish()`：相机 `-20→180`（BigBackIn，0.5 名义秒）+ 白幕 1.2 实秒推满 + 0.2s hold → `onDone` 跳页；demo 页接一块白幕 1.4s 淡出 |

### 23.3 偏差工单

| ID | 原作行为（成员） | 本轮实现 | 类型 |
|---|---|---|---|
| X1 | 时间基准 `dt` / `TimeRate=1` | `TIME_SCALE=1.5`（曲线、常量不变，只整体播放速率 ×1.5；原版起飞到全白约 16s，作页面跳转过长） | 有意压缩 |
| X2 | `spirals`（0~10 个，12 段弧形） | 未移植 | 缺口 |
| X3 | streams 越界时重取 `Normal=AngleToVector(NextFloat()*2π,1)` | 闭式 `mod`，Normal 固定不重取 | 缺口 |
| X4 | `FadeWipe Duration=4` 的独立白场擦除 | 由 `finish()` 的 1.2s 白幕推进合并 | 有意压缩 |
| X5 | `Parallax("blackhole")` 前景视差层 | 本项目无该素材层，未移植 | 缺口 |
| X6 | `Textbox.Say("CH9_LAST_BOOST")`、`granny_farewell` 音乐、金草莓分支 | 无对应资源/交互，未移植 | 缺口 |

### 23.4 素材与尺寸（全部 `blog-ui/Atlases`）

| 用途 | 路径 | 尺寸 |
|---|---|---|
| 鸟 flyup 帧 | `Gameplay/characters/bird/flyup00.png`、`FlyUp01..15.png` | 32×24，origin (16,24) |
| 速度线 | `Gameplay/scenery/launch/slice00..02.png` | 32×128 |
| 黑洞 portal | `Gameplay/objects/temple/portal/portal.png` | 240×240 |
| Madeline 上升 | `Gameplay/characters/player/launch00..07.png`（`Sprites.xml <Loop id="launch" delay="0.06" frames="0-7"/>`） | 32×32，origin (16,32) |

### 23.5 数值断言

`node .screenshots/.tmp/birdascent/assert.js` → **22/22 passed**（鸟 5 个时刻坐标 ±1、`p=t/12`、WaveCamera 三条正弦、Streaks 80 条与 `y(t)` 闭式、`camDrop(0/0.5/1)`、flyupRoll/flyupIdle 帧窗）。
浏览器（`test.js`）：图标 `disp=32x24 / overflow=visible`；关键帧 `t=0.72/3.17/6.44/9.54/10.82` 对应 `p=0.060/0.264/0.537/0.781/0.985`；跳页后白幕 `.white.show.done` → 移除；`errors: none`。

### 23.6 训练记录

| 项 | 结论 |
|---|---|
| 容器裁剪 | `common.css` 的 `.chat-crow-box` 是 19×18 + `overflow:hidden`，img 40×30 负 margin；只露鸟头。改为 `width/height:auto` + `overflow:visible` + img 32×24，喊叫 `translateY(-6px) scale(1.16)` 不再被裁 |
| 鸟帧命名 | atlas 里是 `flyup00.png` + `FlyUp01..15.png`（大小写混杂）；`Glob flyup*` 只能命中 1 张，必须按 Sprites.xml 的 `flyup0-15` 逐一确认 |
| 速度线观感 | `slice*` 平均 alpha 75/255、29% 像素 >100 → 80 条叠加在中段会接近全白；这是原作 `Alpha=p` 的真实结果，不是 bug |

### 23.7 第六轮：用户问「是不是先跃起再落地」——按 IL 定案

**用户命题**：「Madeline 进入太空的出场动画是不是先跃起再落地？用 REA 反编译复刻效果，过场也要用 REA 优化」。

**定案：没有落地。** `SummitLaunch` 是**匀速直线上升**，整段没有落点/着地判定：

| 成员 | IL 事实 |
|---|---|
| `Player.SummitLaunchBegin` | `wallBoostTimer=0`、`Sprite.Play("launch")`、`Speed=-UnitY*240`、`summitLaunchParticleTimer=0.4` |
| `Player.SummitLaunchUpdate` | 每 0.03s `ParticlesFG.Emit(BadelineBoost.P_Move,...)`；`Facing=1`；`MoveTowardsX(targetX, 20*dt)`；**每帧强制 `Speed=-UnitY*240`**；每 0.2s `SpeedRing.Init(Center, 1.5707964, White)`；只有 `ShouldStopSummitLaunch()` 才 `StopSummitLaunch`（高度/剧情判定），无 `OnGround` 判定 |
| `Content/Graphics/Sprites.xml` | `<player ...><Origin x="16" y="32"/><Loop id="launch" path="launch" delay="0.06" frames="0-7"/>` |
| `SpeedRing.Update` | `lerp += 3*dt`（寿命 1/3s）、`Position += normal*10*dt`；`Normal=AngleToVector(π/2)= (0,1)` → 相对上升中的 Madeline 向下飘 |
| `SpeedRing.DrawRing` | 半径 `Lerp(4,14,lerp)`；`GetVectorAtAngle` 里 `Lerp(maxR, maxR*0.5, |Dot(v,normal)|)` → 沿 normal 压扁一半（竖直半径减半的椭圆） |
| `SpeedRing.Render` | `color * Lerp(0.6, 0, lerp)`；`SamplerState.PointClamp` |

**为什么会看成「跃起又落地」**：不是动画本身，而是抖屏只作用在 Madeline 身上。`CS10_FinalLaunch.Update` 写的是 `Level.CameraOffset = cameraOffset + cameraWaveOffset` —— 这是**整台相机**位移（世界坐标整体反方向移动），背影片与 Madeline 一起抖；而鸟是 `bird.Position = Camera.Position + birdScreenPosition`、速度线是 `particle.Position + Camera.Position`，两者被相机反向抵消，在屏幕上**不动**。旧实现把 `-wave` 只加在 Madeline 的屏幕坐标上，背景与速度线纹丝不动 → 一个人上下摆 ±24px，读起来就是「跃起、落地」。

**修复**：

1. `bird-ascent.js` 的 `drawBG` 接收 `camX/camY`，涡流中心 `cx=160-camX`、`cy=190-camY`（portal/streams/particles 全部随之位移）；Madeline 用同一组 `camX/camY`。背景与角色一起抖 = 相机抖动。
2. 姿态换成 `launch00..07`（去掉 `madeline-move.gif`）：`launchFrameIndex(t)=floor(t/0.06)%8`，`Origin (16,32)`，`drawImage(fr, px-16, py-32, 32, 32)`。
3. 补 `SpeedRing`：`drawRings(t,px,py)` 按 `k0=floor(t/0.2)` 倒序，`age=t-k*0.2`、`l=age/(1/3)`、`a=0.6*(1-l)`、`r=4+10*l`、`ellipse(px, py+10*age, r, r*0.5)`。
4. 补起飞瞬间：`launchFlash(t)=0.5*max(0,1-t/0.45)`（`Level.Flash(White*0.5,true)` 余辉，叠加到白幕 alpha）、`launchShake(t)`（`DirectionalShake(-UnitY,0.6)`，0.35s 内衰减）。

**验证**：`assert.js` 22/22 仍全绿；`probe5.js`（`.screenshots/.tmp/birdascent/`）8 张 launch png 全部 200、`t=0.3/2.1/4.75/7.55` 四个取样点均无 console error，截图可见翻滚帧 + 脚下 SpeedRing 椭圆 + 涡流背景；`probe6.js` 交接 `→ celeste-farewell-remembered-demo.html?ascent=1`、`.white.show` → 淡出后 `__scene` 在跑、`errors: none`。

---

## 24. 第六轮：跟随者与金羽毛飞行（聊天室互动移植）

**用户命题**：「草莓 emoji → 身后跟随草莓；水母 emoji → 身旁浮出水母；金羽毛 emoji → 场景随机刷新羽毛，Madeline 触碰后进入 StarFly 飞行」。

**取证强度声明**：本轮**没有重新运行 REA 反编译**，也没有新的 IL dump。本章结论只有三个来源：(a) 项目内既有 REA 产物与移植注释（`blog-ui/js/shelf.js` L1928–1966、demo 内联脚本 L851–858 的「证据（Celeste.dll）」注释）；(b) 已落地实现代码（`celeste-farewell-remembered-demo.html` L851–1200、`shelf.js` L2504–2669）；(c) `.trae/specs/chat-scene-collectibles/spec.md` §9。此前章节已有的原文（第 9 节 `UpdateHair`、第 16.9 节 StarFly 行）直接复用；本轮新增数值一律标注「既有注释 / 移植代码」，**不补写 IL 行号**。

### 24.1 移植范围与产品约束

| 互动 | 触发 token | 上限 | 落点 | 行为 |
|---|---|---|---|---|
| 草莓跟随 | `🍓` / `[c:berry]` | 10 | `addBerry()` L938 → `stepFollowers()` L965 | 每颗草莓按 Leader 轨迹索引取跟随点，`DelayTimer` 0.3s 后才开始插值 |
| 水母 | `🪼` / `[c:jelly]` | 4 | `addJelly()` L946 → `stepJellies()` L978 | 身侧交替（`i % 2` 取 ±1），正弦浮动 |
| 金羽毛 + StarFly | `🪶` / `[c:feather]` | 6 | `spawnFeather()` L955 → `stepFeathers()` L988 → `startFly()` L999 | 相机可见区左右两侧随机刷新；与角色中心距离 `< 14` 即触碰 → 变形 0.42s → 2s 飞行 |

两条产品约束：

1. **历史消息不回放**：`ChatScene.consume()` 只在 SSE 实时消息回调里被调用，`quiet` 的历史回放路径不触发（L1109 注释「实时消息 → 场景物件（历史回放不调用）」）。
2. **不结算**：草莓 / 水母 / 羽毛无碰撞、不计分、永不消失；`ChatScene.reset()` 是唯一清空入口（结算入口留给外层页面）。

> 启动竞态（不是历史回放）：`window.ChatScene` 在场景脚本执行时即同步暴露，`ready=false` 期间的 `consume` 入队 `sceneQueue`，`main()` 完成后回放（L1176–1187）。目的是不丢「脚本未跑完就到达的实时消息」。

### 24.2 Leader/Follower 算法证据

| 事实 | 常数 / 公式 | 证据来源 | 取证强度 |
|---|---|---|---|
| `Celeste.Leader` 轨迹容量 | `MaxPastPoints = 350` → `FOLLOW.maxPoints` | demo L853 / L859 | 既有移植注释；本轮未重新反编译 |
| 采样节拍 | `OnInterval(0.02)` → `FOLLOW.sample = 0.02` | demo L854 / L859 | 同上 |
| 插点门限 | 与队首距离 `>= 3` 才 `Insert(0,pos)` → `FOLLOW.minDist = 3` | demo L933 | 同上 |
| `Celeste.Follower` 取点 | `PastPoints[5*(i+1)]`，`num += 5` → `FOLLOW.stepIndex = 5` | demo L854 / L940 / L970 | 同上 |
| `Celeste.Follower` 更新条件 | 只看 `DelayTimer`，到 0 才跟随 | demo L855 / L969 | 同上 |
| `Celeste.Strawberry::Added` | `FollowDelay = 0.3` → `FOLLOW.delay = 0.3` | demo L855 / L942；spec §6.1 | 同上 |
| 逼近公式 | `pos += (target - pos) * (1 - pow(0.01, dt))` | demo L856 / L880 | 同上 |

```
sample :  acc += dt; if (acc < 0.02) return; acc -= 0.02
insert :  |pos - past[0]| >= 3 → past.unshift(pos)，长度夹到 350
follower i: idx = min(5*(i+1), past.length - 1)，target = past[idx]
            delayTimer -= dt；> 0 时本帧不移动
            p += (target - p) * (1 - 0.01^dt)
```

- 采样点取 `{x: m.x, y: m.y - 10}`（脚底上方 10 像素）：这是**实现取点**，原作 `Leader` 采样的是被跟随实体的哪个字段本轮未核对（见 24.7 U2）。
- `stepLeader` 用「加 `dt`、减 `0.02`」的累加器：60 fps 下平均 0.02s 采样一次；单帧 `dt > 0.02` 时该帧最多只插一个点，余额滞留在 `acc` 里（长帧会少采样，属实现近似，不是 `while` 循环）。

### 24.3 帧序与时序

| 素材 | 动画 | 帧序 | 单帧时长 | 一轮 | 来源 |
|---|---|---|---|---|---|
| 草莓 `strawberry/wings` | `flap` | `0-8,0-8,0-7,9`（27 帧） | 0.08s | 2.16s | `Sprites.xml` 注释（demo L870）+ `BERRY_SEQ`（L871） |
| 水母 `glider` | `idle` | `0-9`（10 帧） | 0.1s | 1.0s | spec §3；demo L1135 |
| 金羽毛 `flyFeather` | `loop`：`idle00-20` → `flash00-20` | 42 帧 | 0.06s | 2.52s | `Sprites.xml` 注释（`shelf.js` L1979–1983）；demo L1148 |
| 变形 `startStarFly` | `startStarFly` | `00-03`（4 帧） | 0.08s | 0.32s | `Sprites.xml` 注释（`shelf.js` L1998）；demo L1164 |

- 草莓是**把 10 张 `wings` 贴图按 `0-8,0-8,0-7,9` 展开成 27 帧播放**，不是「10 帧循环」：`berryFrame(t) = BERRY_SEQ[floor(t / 0.08) % 27]`（L1120）。两拍振翅 + 收翅的节奏来自帧序，单靠 10 帧循环复现不出来。
- 水母对齐 `Justify(0.5,0.58)`：绘制左上角 = 目标点 `(-24Z, -27.8Z)`（48×48，`shelf.js` 的 0.58 → 27.84 取 27.8，L1142）。
- 金羽毛对齐 `Justify(0.5,0.5)`：左上角 = 目标点 `(-16Z, -16Z)`，另加 `sin(t*2 + phase) * 3` 的上下浮动（L1148–1153）。
- 鸟类待机不在本章范围（第 23 章已记 `flyup`）。

### 24.4 StarFly 常量表（`STARFLY`，demo L861–867）

| 字段 | 值 | 实现语义 | 落点 |
|---|---|---|---|
| `chargeAnim` | 0.32 | 变形动画时长：`startStarFly` 4 × 0.08 | L1026 / L1161 |
| `chargeTotal` | 0.42 | 变形总时长（动画播完 + `Speed == Zero` + 0.1s） | L1023 / L1034 |
| `speedStart` | 250 | 发射初速 | L1038 |
| `accel` | 1000 | 速度逼近斜率（单位/s） | L1049 |
| `turnRate` | 5.5850534 | `moveDir` 转向角速度（rad/s ≈ 320°/s） | L1046 |
| `vIdle` | 91 | 无方向输入时的目标速率 | L884 |
| `vTurn` | 140 | 掉头分支目标速率 | L885 |
| `vFast` | 190 | 同向分支目标速率 | L885 |
| `sameDot` | 0.45 | 同向 / 掉头判定点积阈值 | L885 |
| `time` | 2.0 | 飞行计时初值（原作 2s；不采用 `shelf.js` 页面的 4s） | L1005 |
| `warnTime` | 0.5 | 末段警告开始阈值 | L1080 |
| `warnStep` | 0.05 | 警告闪切换间隔 | L1082 |
| `wallDead` | 0.2 | 撞墙「快到点」阈值 | L1063 |
| `wallRest` | 0.5 | 撞墙单轴反弹系数 | L1067 |
| `exitX` | 140 | `StarFlyEnd` 水平速度夹取上限 | L1097 |
| `exitUp` | 100 | `StarFlyEnd` 按住 ↑ 的竖向速度 | L1089 |

常量 → `Player.StStarFly` 语义：

| 常量 | 在 `Player.StStarFly` 里的语义 |
|---|---|
| `chargeAnim` 0.32 | `StarFlyCoroutine` 先等 `startStarFly` 播完（4 帧 × 0.08） |
| `chargeTotal` 0.42 | 再等 `Speed == Zero`（1000/s 减速早已达成）+ `yield 0.1s` |
| `speedStart` 250 | 协程尾部 `Speed = dir * 250f`，`dir` 取变形期按住的 `Input.Feather` 方向 |
| `accel` 1000 | `Approach(\|Speed\|, target, 1000f * dt)` |
| `turnRate` 5.5850534 | `moveDir = RotateTowards(moveDir, dir, 5.5850534f * dt)` |
| `vIdle` 91 | 无 `Input.Feather` 输入时的目标速率 |
| `vTurn` 140 | `Dot(moveDir, dir) < 0.45`（掉头）时的目标速率 |
| `vFast` 190 | `Dot >= 0.45`（同向）时的目标速率，`lerp` 从 140 → 190 |
| `sameDot` 0.45 | 两个速率分支的唯一分界 |
| `time` 2.0 | `StarFlyBegin` 的 `starFlyTimer = 2f` |
| `warnTime` 0.5 | `timer < 0.5` 起进入警告闪 |
| `warnStep` 0.05 | 每 0.05s 在 `#ffd65c` ⇄ `#AC3232` 间翻转 |
| `wallDead` 0.2 | `OnCollideH/V` 的 `StStarFly` 分支：`timer < 0.2` → 该轴 `Speed = 0` |
| `wallRest` 0.5 | 否则该轴 `Speed *= -0.5` |
| `exitX` 140 | `StarFlyEnd`：`\|Speed.X\| <= 140f` 夹取 |
| `exitUp` 100 | `StarFlyEnd`：按住 ↑ → `Speed.Y = -100f` |

**结束条件只有一个**：`timer <= 0` → `StarFlyEnd`（实现 L1084）。`Speed.Y > 0 → 0` 是收尾归一化，不是结束条件。`vTurn = 140` 与 `exitX = 140` 数值相同但语义无关（前者是飞行中的掉头目标速率，后者是结束后的水平速度夹取）——不可因同值把 `|len| <= 140` 写成结束条件（见 24.6 的 K1）。

### 24.5 球体与变形锚点

| 锚点 | 数值 / 公式 | 证据 |
|---|---|---|
| `starFly00` 贴图 | 32×32，`Origin (16,32)` | `shelf.js` L1950 注释；`Sprites.xml` `<player>` 的 Origin |
| 球心 | 脚底 `(0,-6)` | spec §3；demo L1168 注释 |
| 球体左上角 | 球心 `+ (-16,-26)`（等价于脚底 `(-16,-32)`） | demo L1172：`orb.x - 16Z, orb.y - 26Z` |
| `startStarFly` 对齐 | `Justify(0.5,1)` → 左上角 = 脚底 `(-16,-32)` | demo L1162–1166 |
| 变形缩放 | `sc = 1 - 0.4 * (t / 0.42)`（`1 → 0.6`） | demo L1163 |
| 球体绘制 | 32×32 原尺寸，`#ffd65c` 乘法染色；末 0.5s 闪 `#AC3232` | demo L1169–1172 |
| 层序 | `hair.draw` 先于球体（Player ctor `Add(Hair)` 早于 `Add(Sprite)`） | `shelf.js` L1943–1945；demo L1160 |
| 变形期头发 | `HairCount = 4`、`setColor('normal')`、`HairOffset (0,-2)` | demo L1011–1013 / L1031 |
| 飞行期头发 | `HairCount = 7`、`setColor('fly')`、`HairOffset (0,3)`（发根落在球心） | demo L1026–1029 / L1077 |

- `drawFly` 以 `f.t < chargeAnim` 分流：前 0.32s 只画 `startStarFly` 帧、不画球体；0.32s 起画 `#ffd65c` 球体（L1167–1173）；`f.t >= chargeTotal` 才给 `speedStart` 初速并开始位移（L1034–1040）。
- `(0,-2)` / `(0,3)` 是**世界像素偏移**（`shelf.js` L1958–1961 的 `Nodes[0] = Sprite.RenderPosition + (0,-9) + HairOffset` 化简）；飞行期 `(0,3)` 让发根正好落在球心 `(0,-6)`。

### 24.6 偏差表（spec §9 的 D1–D8 + 本轮显式记录）

| ID | 原作行为 | 本实现 | 判定 |
|---|---|---|---|
| D1 | 草莓跟随时仍参与地面碰撞 | 仅按 Leader 轨迹插值 | 刻意（关卡无草莓实体） |
| D2 | `FollowDelay = 0.3` | 同值 | 无偏差 |
| D3 | 非翼草莓播 `normal/idle`（18×16） | 统一播 `wings` 的 `flap`（40×24） | 刻意，跟随可读性 |
| D4 | StarFly 2s | 2s（不采用 `shelf.js` 页面的 4s） | 无偏差 |
| D5 | 撞墙 `timer < 0.2` 归零 / 否则 `-0.5` | `bodySolidFn` 预判下一步；单轴翻转 + `len *= 0.5` | 语义等价 |
| D6 | 羽毛方向由关卡配置 | 触碰瞬间 `sign(feather.x - m.x)`，同 x 用 `m.facing` | 场景无方向羽毛 |
| D7 | 飞行结束羽毛重生 | 不重生（无结算，需再发消息） | 按需求 |
| D8 | 头发变形 4 → 飞行 7，`offY` `-2` / `3` | 同 | 无偏差 |

**已知偏差（显式记录，本轮未修）**：

| # | 项 | 原作 | 本实现 | 说明 |
|---|---|---|---|---|
| K1 | StarFly 结束条件 | `StarFlyUpdate` 里只有 `starFlyTimer <= 0` 走 `StarFlyEnd`；`\|Speed.X\| <= 140` 是 `StarFlyEnd` 的收尾夹取 | `stepFly` 只在 `if (f.timer <= 0) endFly(false)`；`exitX` 只在 `endFly` 里夹取 | **与 spec 早期文案不一致**：spec §6.3 早期写「`timer <= 0` 或 `\|len\| <= 140`」。实现按既有 IL 证据只保留 `timer <= 0`；140 是收尾夹取，不是结束条件 |
| K2 | 草莓动画分支 | 非翼草莓是 `normal/idle`；`wings` 的 `flap` 只给「有翼」形态 | 统一播 `flap`（27 帧） | 可读性取舍（跟随中的草莓必须一眼看出在飞） |
| K3 | 飞行发色与时点 | `UpdateHair`：`State == StStarFly → Hair.Color = Sprite.Color`，`Sprite.Color = starFlyColor #ffd65c`；`shelf.js` 注释记为 0.32–0.42s 帧已切 `starFly` 但仍为白，0.42s 才变色 + `HairCount = 7` | `setColor('fly') = #F2EB6D`，在 `chargeAnim = 0.32s` 即切 7 节 | 色值（`#F2EB6D` vs `#ffd65c`）与时点（0.32s vs 0.42s）各差一点；证据来自第 9 节原文 + `shelf.js` 注释，本轮未重新反编译 |

### 24.7 未验证 / 未取证（诚实单列）

| ID | 项 | 说明 |
|---|---|---|
| U1 | 本轮未跑 REA | 无新 dump、无新 IL 行号；所有 `Celeste.*` 成员结论均引自第 9 / 16.9 节原文或既有移植注释 |
| U2 | `Leader` / `Follower` 数值未重新对照 IL | `MaxPastPoints=350`、`OnInterval(0.02)`、`>= 3`、`PastPoints[5*(i+1)]`、`FollowDelay=0.3` 全部引用既有注释；采样点 `(m.x, m.y-10)` 是实现取点，原作采样字段未核对 |
| U3 | 多人并发未压测 | 未在真实双客户端下同时连续发草莓；轨迹短于 `5*(i+1)` 时 `idx` 夹到末尾，多颗草莓会落在同一点（代码行为，L970），真机队列观感未验证 |
| U4 | 水母非原作实体 | 原作无「水母伴飞」机制，纯产品需求；`side`/`26 + i*16`/`sin(t*1.6 + i*1.1)*6` 全为页面参数，无 IL 依据 |
| U5 | 羽毛生成区间无 IL 依据 | `f ∈ [0.06,0.30] ∪ [0.70,0.94]`、`y ∈ [0.18,0.45]`、上限 6、不重生，均为产品参数（`spawnFeather` L955–963） |
| U6 | 视觉尺寸未重新实测 | 40×24 / 48×48 / 32×32 取自 spec §3 与既有核对记录，本轮未用 `System.Drawing` 复测像素 |

### 24.8 素材清单

本轮 glob 复核（`blog-ui/Atlases/Gameplay/`）实到情况：

| 用途 | 路径 | 实到帧 | 尺寸 | 对齐 / 时序 |
|---|---|---|---|---|
| 草莓跟随 | `collectables/strawberry/wings00-09` | 10 | 40×24 | `flap` 27 帧 × 0.08s；绘制 40Z × 24Z 居中于跟随点 |
| 水母 | `objects/glider/idle0-9` | 10 | 48×48 | `idle` 0.1s；`Justify(0.5,0.58)` → 左上 `(-24Z, -27.8Z)` |
| 金羽毛 | `objects/flyFeather/idle00-20` + `flash00-20` | 42（另有 `outline.png`，本页未用） | 32×32 | `loop` 0.06s；绘制 32Z × 32Z，左上 = 目标点 `(-16Z,-16Z)` |
| 星飞球体 | `characters/player/starFly00` | 1 | 32×32 | `Origin (16,32)`；球心 = 脚底 `(0,-6)`，左上 = 球心 `+ (-16,-26)` |
| 变形帧 | `characters/player/startStarFly00-03` | 4（另有 `startStarFlyWhite00-03`，本页未用） | 32×32 | 0.08s/帧；`Justify(0.5,1)` → 左上 = 脚底 `(-16,-32)` |

预载落点：`preload()` L321–330（`berry0-9` / `jelly0-9` / `feather0-41`（21 idle + 21 flash）/ `orb` / `morph0-3`）。

## 25. 第七轮：水母 Glider 可持有物件（聊天室互动改造）

**用户命题（修正上一轮）**：「水母不应该是背景版吧，它是 madeline 可以用的物品，像羽毛一样随机刷新在 madeline 周围，用 REA 实现 madeline 和水母的交互。」

**结论**：第 24 节把水母当作「身侧伴飞的装饰物」是错的。原作 `Celeste.Glider` 是一个 `Holdable`：可抓取、可携带、缓降、可投掷/丢弃、未持有时有独立物理并与玩家碰撞销毁。本轮按原作语义重做：`🪼` 只负责在相机可见区随机刷新一只水母实体，之后完全由 Madeline 的抓取/持有/投掷驱动。

### 25.1 语义变更与产品约束

| 项 | 旧（第 24 节） | 新（本轮） |
|---|---|---|
| 触发 | `🪼` → 身侧水母 | `🪼` → 随机刷新一只 `Glider` 物品 |
| 上限 | 4（装饰） | 4（场上同时存在的物品，含手持） |
| 位置 | `m.x + side*(26+i*16)` 正弦浮动 | 相机可见区左右两侧随机（同羽毛的取点策略），避开实心块 |
| 交互 | 无 | 按住抓取键拾取 → 持有；松开 / 下压投掷或丢弃 |
| 缓降 | 无 | 持有期间 `maxFall` 目标 40（下压 120 / 上抬 24）、重力 ×0.5、空中 `maxRun` 108 |
| 回收 | 永存 | 未持有撞到玩家 → 销毁动画 0.64s → 移除；掉出下边界 → 移除 |

产品约束不变：**不结算**（无计分、无碰撞收集），历史消息不回放，`ChatScene.reset()` 是唯一清空入口。

### 25.2 取证来源与程序集身份

本轮**重新运行了 REA**（与第 24 节不同）。程序集与产物：

| 项 | 值 |
|---|---|
| 程序集 | `C:\Users\28464\IdeaProjects\blog\.screenshots\.tmp\Celeste.dll` |
| SHA-256 | `999024e23285acc0c7ac37b6ed33874e16a1f0f9af5fdeff66a64050b78f8e24` |
| Module / MVID | `Celeste.exe` / `4a26f9de-d670-4c87-a2f4-7e66d2d85163` |
| REA | 6.8.0，`inspect-managed-members --format json` |
| 产物 | `%TEMP%\rea\glider.json`（15.4MB）、`glider_ctor.txt`、`glider_il.txt`、`holdable.json`、`holdable_il.txt`、`player3.json`（18.4MB）、`player_glider_il.txt`、`input_grab.txt`、`playersprite.json`、`playersprite_il.txt` |

引用的方法（token 为元数据 MethodDef）：

| 类型.成员 | token | IL 指令数 |
|---|---|---|
| `Glider.orig_ctor` | `0x060016f3` | 128 |
| `Glider.Update` | `0x060016e5` | 748 |
| `Glider.OnPickup` | `0x060016ed` | 50 |
| `Glider.OnRelease` | `0x060016ee` | 43 |
| `Glider.OnCollideH` / `OnCollideV` | `0x060016eb` / `0x060016ec` | 49 / 36 |
| `Glider.PlayOpen` | `0x060016e6` | 56 |
| `Holdable..ctor` / `Pickup` / `Carry` / `Release` | `0x06003281` / `85` / `86` / `87` | 11 / 40 / 13 / 89 |
| `Holdable.get_ShouldHaveGravity` | `0x06003289` | 7 |
| `Player.UpdateCarry` / `Throw` / `orig_Pickup` | `0x06003318` / `1b` / `33b4` | 26 / 50 / 17 |
| `Player.NormalUpdate` | `0x0600332e` | 973 |
| `Input.get_GrabCheck` | `0x0600308e` | 15 |
| `PlayerSprite.get_CarryYOffset` | `0x060030cd` | 20 |

> 下文 `IL xxxx` 指该方法体内的 IL 偏移，不是文档行号。

### 25.3 Holdable 契约与输入顺序

`Glider.orig_ctor`（IL 33–64 / 163–227 / 348–376）逐项：

```text
Collider        = Hitbox(8, 10, -4, -10)         // 8×10，中心偏上
Depth           = -5
Hold            = new Holdable(0.3)              // 参数 = cannotHoldDelay
Hold.PickupCollider = Hitbox(20, 22, -10, -16)   // 抓取判定
Hold.SlowFall   = true
Hold.SlowRun    = false
Hold.OnPickup   = Glider.OnPickup
Hold.OnRelease  = Glider.OnRelease
Sprite          = "glider"
```

`Glider.OnPickup`（IL 0–137）：`Speed = Zero`、加 `Tags.Persistent`、`highFrictionTimer = 0.5`、`AllowPushing = false`、`bubble = false`、`tutorial = false`、`wiggler.Start()`。bubble 粒子分支本场景无。

`Glider.OnRelease`（IL 0–135）：

```text
if (dir.X == 0) 播放 glider_drop
AllowPushing = true；移除 Tags.Persistent
dir.Y *= 0.5
if (dir.X != 0 && dir.Y == 0) dir.Y = -0.4
Speed = dir * 100
wiggler.Start()
```

`Holdable.Pickup`（IL 0–110）：`cannotHoldTimer > 0` 或实体不在场景 → `false`；否则记录 `idleDepth`、把实体 Depth 设为 `holder.Depth - 1`、`Visible = true`、`Holder = holder`、执行 `OnPickup`。

`Holdable.Release`（IL 0–241）：

```text
若实体仍与实心块重叠：
  dir.X != 0 → 沿 X 方向最多尝试 10 次“向外挪 1px”
  否则       → 沿 UnitY 最多尝试 10 次“向上挪 1px”
Depth = idleDepth；Holder = null
gravityTimer = 0.1
cannotHoldTimer = cannotHoldDelay   // Glider 为 0.3
执行 OnRelease
```

`Holdable.get_ShouldHaveGravity`（IL 0–16）：`gravityTimer <= 0`。`Player.orig_Pickup`（IL 0–37）：`Pickup` 成功 → `Ducking = false`、`Holding = picked`、`minHoldTimer = 0.35`、返回 1。

`Input.get_GrabCheck`（IL 0–54）：默认 `GrabMode` 分支返回 `Input.Grab.Check`（按住），不是切换。

`Player.NormalUpdate` 的持有顺序（IL 75–204 / 823–1048）：

1. IL 75：`Holding != null` → 跳 823，**整个抓墙/攀爬分支被跳过**。
2. IL 85–307：未持有且 `GrabCheck && !IsTired && !Ducking` → 遍历 `Holdable`，`Holdable.Check` 命中即 `Pickup`，返回状态 8（`StClimb`）。
3. IL 823–849：`!GrabCheck && minHoldTimer <= 0` → `Throw()`。
4. IL 849–947：`!Ducking && onGround && MoveY == 1 && Speed.Y >= 0 && !holdCannotDuck` → `Drop()` + `Ducking = true` + scale(1.4, 0.6)。
5. IL 949–1006：地面蹲下且 `Speed.Y >= 0` → `CanUnDuck` 决定起身或 `Drop()`。
6. IL 1008–1043：`onGround && MoveY != 1 && holdCannotDuck` → `holdCannotDuck = false`（下一帧才允许下压丢弃）。

`Player.Throw`（IL 0–137）：`MoveY == 1` → `Drop()`；否则 `Holding.Release(UnitX * Facing)`、`Speed.X += 80 * -Facing`、播放 `crystaltheo_throw` 与 `throw` 动画；最后 `Holding = null`。`Player.Drop` → `Release(Vector2.Zero)` + `Holding = null`。

### 25.4 持有缓降（SlowFall）

| 项 | 原作 IL | 语义 |
|---|---|---|
| `SlowRun` | `Glider.orig_ctor` IL 250 | `false`，地面 `maxRun` 仍 90 |
| 空中 `maxRun` | `Player.NormalUpdate` IL 1223–1296 | `Holding.SlowFall && !onGround` → `maxRun = 108`，水平加速度乘 **0.5**（`mult`：空中原 0.65 → 0.325） |
| `maxFall` 目标 | IL 1530–1713 | `GliderMoveY == 1` → **120**；`== -1` → **24**；否则 **40**；`windMovedUp` 的 `-32` / `0` 分支本场景无风 |
| `maxFall` 过渡 | IL 1682–1708 | `Approach(maxFall, target, 300 * dt)` |
| 重力 | IL 2418–2460 | `Holding.SlowFall && forceMoveXTimer <= 0` → 重力系数 **0.5**（900 → 450/s） |
| 墙滑 | IL 2101 | 墙滑条件含 `Holding == null`，手持水母时不进入墙滑 |
| `holdCannotDuck` | IL 1964–2010 | `Holding.SlowFall` → `holdCannotDuck = (MoveY == 1)` |

实现（`celeste-character.js`）：

```js
// 水平：IL 1252-1296
const maxRun = (this.holdSlowFall && !this.onGround) ? 108 : MAX_RUN;
if (this.holdSlowFall && !this.onGround) mult *= 0.5;

// maxFall：IL 1530-1713
if (this.holdSlowFall) {
    const slowMax = moveY === 1 ? 120 : moveY === -1 ? 24 : 40;
    this.maxFall = approach(this.maxFall, slowMax, 300 * dt);
}

// 重力：IL 2419-2515
this.vy = approach(this.vy, this.maxFall, GRAVITY * half * (this.holdSlowFall ? 0.5 : 1) * dt);

// 墙滑：IL 2101
const wallSliding = ... && !this.holdSlowFall;
```

> `SlowRun` 为 `false` 只影响地面分支；真正改变手感的是上表的空中 108 / 加速度 ×0.5。上一轮只移植了 `maxFall` 与重力，本轮补上这两项。

### 25.5 未持有物理与销毁

`Glider.Update` 未持有分支（IL 787–1980）：

| 情形 | 行为 | IL |
|---|---|---|
| 高摩擦计时 | `highFrictionTimer > 0` → `-= dt` | 827–853 |
| 地面 | 向前 3px 与向后 3px 做 `OnGround` 探测：前空 → 目标 `+20`，后空 → `-20`，都踩实 → `0`；`Approach(Speed.X, target, 800 * dt)` | 858–1000 |
| 空中 | `Hold.ShouldHaveGravity` 为 false（`gravityTimer > 0`）→ **同时跳过横向摩擦与重力**；否则 `g = 200`（`Speed.Y < -30` 时 `g = 100`）；横向摩擦：`Speed.Y < 0 → 40`，否则 `highFrictionTimer > 0 → 10`，否则 `40`；重力：风向上时 `Approach(vy, 0, g*dt)`，否则 `Approach(vy, 30, g*dt)` | 1268–1553 |
| 位移 | `MoveH(Speed.X*dt, OnCollideH)`、`MoveV(Speed.Y*dt, OnCollideV)` | 1553–1614 |
| 左/右/上越界 | 夹回 `Bounds` 并以对应 `CollisionData` 调 `OnCollideH/V`；`Top > Bounds.Bottom + 16` → `RemoveSelf()` | 1615–1919 |
| 撞玩家 | 遍历 `Player`，临时置其 `Collidable = true` 做 `CollideCheck`，命中 → `destroyed = true`、`Collidable = false`；若正被持有 → `holder.Drop()` 且 `Speed = holder.Speed * 0.333`；启动 `DestroyAnimationRoutine` | 548–720 |

`OnCollideH`（IL 0–163）：`Speed.X *= -1`，`scale = (0.8, 1.2)`，播放左右撞墙音。
`OnCollideV`（IL 0–121）：`|Speed.Y| > 8` → `scale = (1.2, 0.8)` 并播放落地音；`Speed.Y < 0` → `*= -0.5`，否则 `= 0`。

实现对应：`gliderSolidAt()` 用 **8×10 @(-4,-10)**（与 `Glider.orig_ctor` 的实体 Collider 同盒），地面探测用 `gliderSolidAt(x, y+1)` 与 `±3`，空中用 `gravityTimer` 跳过摩擦+重力，碰撞反弹/夹取/下边界删除、与玩家碰撞 → `deathT = 0`。

### 25.6 持有时表现（旋转 / 动画 / 锚点 / 层序）

| 项 | 原作 | IL |
|---|---|---|
| 旋转目标 | `ClampedMap(holder.Speed.X, -300, 300, +0.6981317, -0.6981317)`（持有人在 `onGround`）或 `±1.0471976`（空中）；未持有目标 `0` | `Glider.Update` IL 82–216 |
| 旋转过渡 | `Approach(rotation, target, PI * dt)` | IL 217–251 |
| 持有时物理 | `IsHeld` → `prevLiftSpeed = 0`，跳过全部未持有物理 | IL 787–816 |
| 动画 | `holder.Speed.Y > 20 || Wind.Y < 0` → `PlayOpen()`（`fall` → 等播完再 `fallLoop`）；否则 `held` 帧 | IL 1994–2375 |
| 持有时缩放 | `GliderMoveY > 0` → 目标 `(0.7, 1.4)`；`< 0` → `(1.2, 0.8)`；`Approach(scale, target, 2 * dt)` | IL 2284–2443 |
| 携带点 | `Holdable.Carry(Position + carryOffset + UnitY * Sprite.CarryYOffset)` | `Player.UpdateCarry` IL 0–83 |
| carryOffset | `CarryOffsetTarget = (0, -12)`，实例 `carryOffset` 逐帧逼近该值 | `Player..cctor` |
| Depth | `Pickup` 时 `Depth = holder.Depth - 1`（玩家 Depth 在前，水母 -6 左右），`Release` 恢复 `idleDepth = -5` | `Holdable.Pickup` / `Release` |

`PlayerSprite.get_CarryYOffset`（IL 0–58）按当前动画帧元数据返回 `FrameMetadata.CarryYOffset * Scale.Y`；该元数据文件不在本仓库素材内，因此**总携带偏移 `-16` 是 `-12 + (-4)` 的推定**（见 25.8 D13 / 25.9 U7）。

实现：持有分支每帧 `Carry` 到 `m.y + GLIDER.carryY`，旋转角速度 `PI * dt` 且空中幅度 1.047 / 地面 0.698，`fall`/`fallLoop` 由 `openT` 驱动（`fall` 3×0.08 播完再循环），`held` 单帧；绘制在人物之后（Depth 在前），Sprite origin `(24, 27.8)`。

### 25.7 实现映射（`GLIDER` 常量与函数）

常量（`celeste-farewell-remembered-demo.html` L889–900）：

| 字段 | 值 | 来源 |
|---|---|---|
| `gravAir` / `gravAirUp` | 200 / 100 | `Glider.Update` IL 1284–1317 |
| `frictionUp` / `frictionDown` | 40 / 10 | IL 1337–1373 |
| `groundFriction` | 800 | IL 984 |
| `groundSlide` | 20 | IL 905 / 949 |
| `pickupDelay` | 0.35 | `Player.orig_Pickup` IL 24–29 |
| `releaseGravity` | 0.1 | `Holdable.Release` IL 199–204 |
| `regrabDelay` | 0.3 | `Glider.orig_ctor` IL 173–178（`new Holdable(0.3)`） |
| `throwX` | 100 | `Glider.OnRelease` IL 109–114 |
| `throwY` | -40 | 同上：`dir = (100, 0)` → `Y *= 0.5` 后 `(100, 0)` → `X≠0 && Y==0` → `Y = -0.4` → `Speed * 100` |
| `recoil` | 80 | `Player.Throw` IL 80–94 |
| `carryY` | -16 | `-12 + CarryYOffset` 推定（D13） |
| `pickX` / `pickTop` / `pickBottom` | 10 / 16 / 6 | `PickupCollider(20,22,-10,-16)` |
| `deathTime` | 0.64 | 8 帧 × 0.08 推定（D12） |
| `idleStep` / `fallStep` | 0.1 / 0.08 | 素材动画 |
| `originY` | 27.8 | `Justify(0.5, 0.58)` |

函数：

| 函数 | 对应原作 | 行为 |
|---|---|---|
| `spawnJelly()` | 关卡放置（本场景改为消息触发） | 相机左右两侧随机、8 次避实心重试、上限 4 |
| `gliderSolidAt()` | `Glider.Collider 8×10 @(-4,-10)` | 实心块重叠检测 |
| `inPickupRange()` | `Holdable.Check` + `PickupCollider` | 20×22 抓取盒与玩家 8×11 身体盒相交 |
| `tryPickupJelly()` | `Player.orig_Pickup` + `Holdable.Pickup` | 拒绝已持有/蹲下/飞行/冷却中；最近一只；`minHoldTimer=.35`、`highFriction=.5`、速度清零、carry 到 `m.y-16` |
| `releaseJelly()` | `Player.Throw` / `Drop` + `Holdable.Release` | `cannotHoldTimer=.3`、`gravityTimer=.1`、速度 `dir×100`（Y=0 且 X≠0 → -40）、高摩擦 .5、最多 10px 向上脱困 |
| `throwJelly()` | `Player.Throw` / `Player.Drop` | 下压 → Drop（零速度）；否则 `Release(Facing)` + 后坐 -80 |
| `stepJellies()` | `Glider.Update` | 持有 carry/旋转/动画；未持有高摩擦、地面侧滑、空中重力与摩擦、MoveH/V 反弹、越界、撞玩家销毁、冷却递减 |
| `jellyImage()` | `Glider.Update` 动画分支 + `DestroyAnimationRoutine` | 死亡帧、`fall`→`fallLoop`→`held`、idle 10 帧 |
| `drawJellies()` | `Glider.Render` | 旋转/缩放/拉伸，`drawImage(img, -24, -27.8, 48, 48)` |
| `tick()` 持有段 | `Player.NormalUpdate` IL 823–947 | `minHoldTimer` 递减；松开抓取键 → Throw；地面下压 → Drop；未持有按住抓取键 → 拾取 |
| `render()` | Depth 顺序 | 水母画在人物之后 |

输入接线：`grabHeld = Shift / Z`（与原作 `Grab.Check` 同义），持有期间传给引擎的 `grabHeld` 强制为 `false`，等价于 `Holding != null` 跳过攀爬分支（`NormalUpdate` IL 75）。

### 25.8 偏差表（D9–D17）

| ID | 原作 | 本实现 | 判定 |
|---|---|---|---|
| D9 | 水母由关卡实体放置 | `🪼` 消息触发、相机可见区随机生成 | 产品需求；语义仍是 Holdable |
| D10 | `Holdable.Check` 用完整碰撞盒 | 20×22 抓取盒与 8×11 身体盒手工相交 | 语义等价；避免引入完整物理盒 |
| D11 | 抓取需要按住抓取键且未疲惫 | 只检查按住，不模拟 `IsTired` / `NoGrabbing` | 场景无体力消耗（本作有体力，但抓水母不耗） |
| D12 | 死亡协程时长由 `DestroyAnimationRoutine` MoveNext 决定 | 固定 0.64s（8 帧 × 0.08） | 推定，见 U8 |
| D13 | `carryOffset` 目标 `(0,-12)` + 每帧 `CarryYOffset` | 固定总偏移 `-16` | 推定，见 U7 |
| D14 | 风场 `windMovedUp` / `WindMode` / `windY<0` 分支 | 未实现（场景无风） | 缺口，见 U9 |
| D15 | 持有时缩放 `Approach(2*dt)` | 直接设为目标缩放 | 视觉差异极小；见 U12 |
| D16 | `holdCannotDuck` 门控下压 Drop | 仅检查 `onGround && MoveY==1 && Speed.Y>=0` | 少一个边界：空中开伞落地后需先松 ↓ 才能丢弃；见 U10 |
| D17 | `Throw` 播放 `throw` 精灵与音效 | 仅物理与后坐，无 throw 动画/音效 | 引擎无 `throw` 动画，场景静音 |

### 25.9 未验证 / 未取证

| ID | 项 | 说明 |
|---|---|---|
| U7 | `carryY = -16` | `CarryOffsetTarget=(0,-12)` 已取证；`CarryYOffset` 是逐动画元数据，仓库无该元数据，`-4` 是推定 |
| U8 | 死亡 0.64s | `DestroyAnimationRoutine` 的 MoveNext 未 dump，帧数与单帧时长按素材命名/常规 0.08 推定 |
| U9 | 风/气泡/弹簧/教程分支 | `bubble`、`WindMode`、`HitSpring`、`tutorial` 未在本场景启用，未逐条验证 |
| U10 | `holdCannotDuck` | 未实现原作“空中按 ↓ 开伞后落地需先松开 ↓ 才能 Drop”的门控 |
| U11 | `IsTired` / `NoGrabbing` | 拾取分支的疲惫与辅助选项未模拟 |
| U12 | 持有缩放过渡 | 原作为 2/s 的 `Approach`，实现为直接赋值 |
| U13 | 撞玩家判定 | 原作临时把玩家 Collidable 置真做 `CollideCheck`，实现用 8×11 身体盒距离判定 |
| U14 | 双客户端 SSE | 后端未启动，真实多人连续发 `🪼` 未压测 |

### 25.10 素材清单

`blog-ui/Atlases/Gameplay/objects/glider/` 实到：

| 用途 | 文件 | 帧数 | 尺寸 | 时序 |
|---|---|---|---|---|
| 待机 | `idle0..9.png` | 10 | 48×48 | 0.1s |
| 持有 | `held0.png` | 1 | 48×48 | 单帧 |
| 开伞 | `fall0..2.png` | 3 | 48×48 | 0.08s |
| 开伞循环 | `fallLoop0..1.png` | 2 | 48×48 | 0.08s |
| 死亡 | `death00..07.png` | 8 | 48×48 | 0.08s（推定） |

Sprite origin `(24, 27.8)`（`Justify(0.5, 0.58)`），绘制为 `drawImage(img, -24, -27.8, 48, 48)`。

### 25.11 验证

- 无头 Chromium（1280×800）`?scenetest`：**49 pass / 0 fail / 0 exceptions**。
- 水母专项断言：刷新避实心、`PickupCollider` 判定、抓取 carry(0,-16)、缓降 `maxFall=40/vy=40`、空中 `maxRun=108`、下压 `maxFall=120/vy=120`、投掷 `(100,-40)` + 后坐 `-80`、Drop 零速度、重新抓取冷却 0.3s、`tick` 抓取/松开投掷接线、撞玩家销毁、死亡动画后回收。
- 缓存版本：`js/celeste-character.js?v=20261102b`（引擎新增 `holdSlowFall` 的 maxRun 分支）。
