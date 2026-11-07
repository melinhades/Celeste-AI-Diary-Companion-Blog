# 发布元信息（粘贴进博客前删除本节）

## 主标题

Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现

## 备选标题

1. 0.15 秒与 13 帧：把 Celeste 的 Dash 状态机搬进浏览器
2. 从 5,471 行 Player.cs 到可玩 Demo：Celeste 冲刺手感逆向实录
3. 别把“撞墙反弹”当 Wallbounce：Celeste Dash 的 IL 取证与 JS 复刻

## 摘要

以 Noel Berry 公开归档的 `Player.cs` 与本机安装版 `Celeste.dll` 的 IL 为证据，拆解 Celeste 的 Dash 生命周期、速度数学，以及 SuperWallJump、Super/Hyper、Ultra 与角修正的真实触发条件；说明哪些结论是源码级事实、哪些是 IL 级事实、哪些只是移植中的近似，并给出浏览器 demo 与可复现步骤。

## 标签

逆向工程、游戏开发、Celeste、状态机、JavaScript、前端、反编译、手感设计

## 封面图建议

- 尺寸：1600×900，深色底 `#0B0A14`，像素网格。
- 元素：中心一个 8 向速度矢量图，标注 `240`、`169.7`、`0.15s`、`160`；右下角放一个很小的 Madeline 剪影（如使用游戏内素材，需在封面角落注明版权归 Extremely OK Games，仅学习演示）。
- 更稳妥的方案：完全不使用游戏精灵图，只用矢量箭头、帧格与状态机节点，避免把同人素材用作商业宣传封面。

## 文内配图 / 视频位置

| 位置 | 形式 | 内容建议 |
|---|---|---|
| 第 2 章后 | 流程图 P1 | 三条证据链：归档 `Player.cs`、安装版 IL、JS 实现；标出 404 缺口 |
| 第 3 章后 | 时序图 P2 | `DashBegin` → 协程首帧 `yield return null` → 赋速 → `DashUpdate` → `DashEnd` |
| 第 5 章后 | 矢量图 P3 | 8 方向冲刺速度分解，突出斜向每轴 169.7，总速度仍为 240 |
| 第 6 章后 | 对比图 P4 | “水平冲撞墙”与“纯上冲 + 贴墙跳”两条路径，标出 `DashAttackTime = 0.3s` 的延迟窗口 |
| 第 7 章后 | 像素图 P5 | 4px 角修正、3px 地面吸附、6px JumpThru 吸附的三个容差 |
| 第 9 章后 | 截图 P6 | demo HUD：`Dash 240 / 0.15s · End 160 · Cooldown 0.2s · DashAttack 0.3s` |
| 第 9 章末 | 视频 V1 | B 站《与Madeline写日记｜Celeste AI日记博客demo展示》，`BV13QYT64EDX`，UP 主 `Spongebob452`，3:33；建议用链接卡片，不强行嵌入 iframe |

---

# Celeste 冲刺状态机逆向：从 IL 到 Web 可运行实现

## 0. 结论先行

- **Dash 不是“按下即赋速”。** `DashBegin` 会把速度清零，真正赋速发生在协程的下一帧；再加上 0.05 秒冻结，输入到可见位移之间存在明确的帧预算。
- **240 不是斜向总速度的 1.414 倍。** 瞄准向量先单位化，斜向每轴 `240/√2 ≈ 169.7`，合速度仍然是 240。
- **Wallbounce 不是“水平冲撞墙”。** 源码要求 `DashDir.X == 0 && DashDir.Y == -1`，也就是纯上冲 + 贴墙跳；水平撞墙只会清零水平速度，并留下 0.06 秒的速度返还窗口。
- **冲刺结束后仍有 0.15 秒的“冲刺攻击窗口”。** `DashAttackTime = 0.3s`，`DashTime = 0.15s`；`DashAttacking` 在状态回到 Normal 后还会继续为真。
- **手感的一半来自四个角修正。** 4px 的撞边修正、3px 的离地吸附、6px 的 JumpThru 吸附、3px 的墙跳探测，都是“看起来差一点却能过”的来源。

这篇文章只做一件事：把“证据 → 方法 → 实现 → 验证”这条链完整摊开。文中每个关键结论都会标注证据等级；没有拿到的实现，会明确写成缺口，而不是用记忆补全。

---

## 1. 问题背景：为什么不能只照着 Wiki 调参

Celeste 的移动手感被讨论得很多，但社区文档大多描述“现象”：冲刺 0.15 秒、墙反弹、Ultra、Hyper、Wavedash。它们能告诉你“有这个技巧”，却不一定能告诉你：

- 速度是在状态进入时给的，还是在下一帧给的；
- 冲刺结束重置速度的条件，是看 `DashDir.Y` 还是看 `Speed.Y`；
- 墙反弹的入口是在 `DashUpdate` 里，还是在 `NormalUpdate` 里；
- 为什么同一个“撞墙”动作，有时弹、有时不弹；
- 为什么向下冲刺结束后没有掉速。

如果目标只是“做一个看起来像的平台跳跃”，照着常量表调参就够了。但如果目标是**在浏览器里复现可解释的帧行为**，就必须知道状态机的调用顺序和每个分支的精确条件。否则会出现两种典型错误：

1. 把“水平冲撞墙自动反弹”写进去，结果所有贴墙冲刺都变成 wallbounce；
2. 把“冲刺结束统一重置为 160”写进去，结果向下冲刺丢失 240 的惯性。

这也是为什么本文选择从源码和 IL 两条证据链入手，而不是从二手结论入手。

---

## 2. 取证方法与证据等级

### 2.1 两条证据链

**证据链 A：公开归档的源码。** Noel Berry 在 GitHub 上保留了 `NoelFB/Celeste` 仓库，并于 2023-03-16 归档为只读。其中 `Source/Player/Player.cs` 可以取回，实测 **186,844 字节 / 5,471 行**。取证时直连 `raw.githubusercontent.com` 会被重置，改走两个第三方代理分别取回，字节数一致。

但必须强调：这个仓库**不是完整游戏源码**，只放出了少量类文件作为学习资源。实测以下文件均为 404：

```text
Source/Player/Player.cs       200 / 186844
Source/Player/PlayerHair.cs   404
Source/Player/PlayerSprite.cs 404
Source/Input.cs               404
Source/Player/Assists.cs      404
```

这意味着 `Input.GetAimVector(Facing)`、`PlayerHair` 的染色实现、`Assists` 的行为，都不能从这条链里逐字取得。

**证据链 B：本机安装版的 IL。** 对 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` 使用 REA 的托管程序集检查：

| 项 | 值 |
|---|---|
| SHA-256 | `999024e23285acc0c7ac37b6ed33874e16a1f0f9af5fdeff66a64050b78f8e24` |
| 大小 | 5,223,424 字节，PE32 il-only |
| 模块名 / MVID | `Celeste.exe` / `4a26f9de-d670-4c87-a2f4-7e66d2d85163` |
| `Celeste.Player` | token `0x020007c9`，220 methods / 355 fields / 132 user_strings / 2952 field_accesses |
| 覆盖度 | `coverage.state = "complete"`，每个方法的 `instruction_count == decoded_instruction_count` |

**关键限制：拿不到 C# 伪代码。** `rea decompile` 对托管程序集返回 `provider_unavailable`；REA 的 Ghidra / IDA / JADX / Kuna provider 都没有配置，而且它们也不是 .NET 反编译器。因此第二轮得到的是完整元数据、完整 IL 指令流和用户字符串字面量，**不是源码级伪代码**。

另外，这台机器上的 `Celeste.dll` 是**已合并 Everest 补丁的安装版**，包含 `Celeste.Mod.Entities.*`、`orig_*` 方法。IL 结论与纯净 vanilla 可能存在差异，所以本文只在明确标注处使用 IL，源码级结论以归档 `Player.cs` 为准。

### 2.2 五类标注

从这一节开始，文中使用以下标注：

| 标注 | 含义 |
|---|---|
| 【事实·源码级】 | 能在归档 `Player.cs` 中逐字找到的代码或常量 |
| 【事实·IL 级】 | 由安装版 `Celeste.dll` 的 IL 指令流、元数据或字符串字面量直接支持 |
| 【推断】 | 由多处事实交叉推出，但没有单点逐字证据 |
| 【近似】 | Web 实现中为了可运行而做的等价替换或简化 |
| 【缺口】 | 当前材料无法回答，明确不编造 |

### 2.3 为什么要把缺口写出来

如果你要拿这篇文章做技术判断，最重要的不是“知道了多少”，而是“知道哪些还不知道”。本文涉及的三个核心缺口是：

1. `Input.GetAimVector(Facing)` 的死区、对角吸附角度、零输入回落的具体写法；
2. Monocle `StateMachine` 的 Begin / Coroutine / Update / End 精确调用顺序；
3. 编译器生成的 `<…>d__N.MoveNext` 中，部分协程的真实逻辑尚未逐指令展开。

这三个缺口分别影响“瞄准”“首帧时序”“剧情状态”，不影响本文给出的 Dash 主链结论，但在复刻时必须以近似实现落地，并明确标注。

---

## 3. Dash 的接线：一个状态，四个回调

【事实·源码级】`Player.cs` 里给状态机注册回调的方式如下：

```csharp
StateMachine = new StateMachine(23);
StateMachine.SetCallbacks(StNormal, NormalUpdate, null,    NormalBegin, NormalEnd);
StateMachine.SetCallbacks(StClimb,  ClimbUpdate,  null,    ClimbBegin,  ClimbEnd);
StateMachine.SetCallbacks(StDash,   DashUpdate,   DashCoroutine, DashBegin, DashEnd);
```

状态不是 `enum`，而是 `const int`：

```csharp
public const int StNormal = 0;
public const int StClimb  = 1;
public const int StDash   = 2;
```

Dash 这条链由四段组成：

| 回调 | 职责 |
|---|---|
| `DashBegin()` | 重置计时器、清空速度、清空 `DashDir`、记录 `dashStartedOnGround`、触发冻结 |
| `DashCoroutine()` | 真正决定方向和速度；`yield return null` 后读 `lastAim`，再 `yield return DashTime` 后做结束速度 |
| `DashUpdate()` | 每帧处理跳跃打断：SuperJump、SuperWallJump、普通墙跳、抓墙 |
| `DashEnd()` | 只调用 `CallDashEvents()`，**不动速度** |

这里最容易移植错的是第三列和第二列的分工：**速度不是在 `DashBegin` 给的，而是在协程的第二帧给的。** 这产生了 1 帧延迟，也让“demodash”这类技巧在帧层面成立。

---

## 4. 生命周期与常量

### 4.1 DashBegin：先把速度清零

【事实·源码级】

```csharp
private void DashBegin()
{
    calledDashEvents = false;
    dashStartedOnGround = onGround;
    launched = false;

    if (Engine.TimeRate > 0.25f)
        Celeste.Freeze(.05f);          // 3 帧冻结

    dashCooldownTimer = DashCooldown;        // 0.2
    dashRefillCooldownTimer = DashRefillCooldown; // 0.1
    StartedDashing = true;
    wallSlideTimer = WallSlideTime;
    dashTrailTimer = 0;

    dashAttackTimer = DashAttackTime;        // 0.3
    beforeDashSpeed = Speed;                 // 记录冲刺前速度
    Speed = Vector2.Zero;                    // 速度清零
    DashDir = Vector2.Zero;                  // 方向清零

    if (!onGround && Ducking && CanUnDuck)
        Ducking = false;
}
```

有三个细节值得单独拎出来：

- `Celeste.Freeze(.05f)` 受 `Engine.TimeRate > 0.25f` 保护。也就是说，在极慢动作下不会触发这 3 帧冻结。
- `dashAttackTimer` 在 Begin 就被设为 0.3 秒，它比冲刺本身更长。这不是笔误，而是“冲刺攻击窗口”的来源。
- `beforeDashSpeed` 在速度清零前记录。它决定了“冲刺前同向速度更大时是否保留”，也就是高速连冲不掉速的原因。

### 4.2 DashCoroutine：第二帧才赋速

【事实·源码级】核心段落：

```csharp
private IEnumerator DashCoroutine()
{
    yield return null;                 // 第 1 帧速度仍为 0

    var dir = lastAim;
    if (OverrideDashDirection.HasValue)
        dir = OverrideDashDirection.Value;

    var newSpeed = dir * DashSpeed;    // dir 已单位化 → 斜向每轴 169.7
    if (Math.Sign(beforeDashSpeed.X) == Math.Sign(newSpeed.X) &&
        Math.Abs(beforeDashSpeed.X) > Math.Abs(newSpeed.X))
        newSpeed.X = beforeDashSpeed.X;

    Speed = newSpeed;
    DashDir = dir;

    if (DashDir.X != 0)
        Facing = (Facings)Math.Sign(DashDir.X);

    // ... Ultra / Dash Slide 在这里（见第 6 章）

    yield return DashTime;             // 0.15s

    AutoJump = true;
    AutoJumpTimer = 0;

    if (DashDir.Y <= 0)                 // 只有非向下才重置
    {
        Speed = DashDir * EndDashSpeed; // 160
    }
    if (Speed.Y < 0)                    // 对最终速度的 Y 判定
        Speed.Y *= EndDashUpMult;       // 0.75

    StateMachine.State = StNormal;
}
```

这段代码里有四个“反直觉”：

1. **`yield return null` 是真实存在的 1 帧延迟**，不是写法风格。
2. **`beforeDashSpeed` 的保留只发生在 X 轴**，而且要求同向且原速度更大。
3. **向下冲刺不重置速度**：`DashDir.Y > 0` 时整个 `Speed = DashDir * 160` 被跳过，所以直下冲刺结束仍是 240，下斜仍是每轴 169.7。
4. **`EndDashUpMult` 的判断是 `Speed.Y < 0`**，不是 `DashDir.Y < 0`。虽然在这条路径里两者通常一致，但把判断对象写错会在有外部速度注入时出现偏差。

### 4.3 DashUpdate：跳跃打断的唯一入口

【事实·源码级】核心分支：

```csharp
private int DashUpdate()
{
    if (DashDir.Y == 0)                        // 纯水平冲
    {
        // JumpThru Correction
        foreach (JumpThru jt in Scene.Tracker.GetEntities<JumpThru>())
            if (CollideCheck(jt) && Bottom - jt.Top <= DashHJumpThruNudge)
                MoveVExact((int)(jt.Top - Bottom));

        if (CanUnDuck && Input.Jump.Pressed && jumpGraceTimer > 0)
        {
            SuperJump();
            return StNormal;
        }
    }

    if (DashDir.X == 0 && DashDir.Y == -1)     // 纯上冲
    {
        if (Input.Jump.Pressed && CanUnDuck)
        {
            if (WallJumpCheck(1)) { SuperWallJump(-1); return StNormal; }
            else if (WallJumpCheck(-1)) { SuperWallJump(1); return StNormal; }
        }
    }
    else                                       // 其余方向
    {
        if (Input.Jump.Pressed && CanUnDuck)
        {
            if (WallJumpCheck(1)) { WallJump(-1); return StNormal; }
            else if (WallJumpCheck(-1)) { WallJump(1); return StNormal; }
        }
    }

    // ... 粒子、抓取

    return StDash;
}
```

注意：普通墙跳和 SuperWallJump 是**互斥分支**，不是“先尝试 wallbounce，失败再普通墙跳”。纯上冲走第一条，其余方向走第二条。上斜冲刺（`DashDir.X != 0` 且 `DashDir.Y < 0`）不满足 `DashDir.X == 0`，所以只能普通墙跳。

### 4.4 DashEnd：只发事件

【事实·源码级】

```csharp
private void DashEnd()
{
    CallDashEvents();
}
```

速度已经在协程尾部处理完了，`DashEnd` 不再碰速度。把结束速度写在这里，是另一个常见移植错误。

### 4.5 常量表

【事实·源码级】以下常量来自 `Player.cs` 第 13–166 行：

| 常量 | 值 | 作用 |
|---|---|---|
| `DashSpeed` | 240 | 冲刺中每轴速度上限（单位向量方向） |
| `EndDashSpeed` | 160 | 冲刺结束重置速度 |
| `EndDashUpMult` | 0.75 | 向上分量结束再乘 |
| `DashTime` | 0.15 | 冲刺持续时间（60Hz 下 9 tick） |
| `DashCooldown` | 0.2 | 两次冲刺动作的最小间隔 |
| `DashRefillCooldown` | 0.1 | 冲刺资源回充抑制 |
| `DashAttackTime` | 0.3 | 冲刺攻击窗口，长于 DashTime |
| `DashCornerCorrection` | 4 | 冲刺撞边修正像素 |
| `DashVFloorSnapDist` | 3 | 水平冲离地吸附像素 |
| `DashHJumpThruNudge` | 6 | JumpThru 吸附像素 |
| `UpwardCornerCorrection` | 4 | 上撞天花板修正像素 |
| `WallJumpCheckDist` | 3 | 墙跳探测像素 |
| `WallSpeedRetentionTime` | 0.06 | 撞墙后速度返还窗口 |
| `SuperJumpH` | 260 | Super 水平速度 |
| `SuperWallJumpH` | 170 | Wallbounce 水平速度 |
| `SuperWallJumpSpeed` | -160 | Wallbounce 垂直速度 |
| `SuperWallJumpVarTime` | 0.25 | Wallbounce 可变跳高时间 |
| `DuckSuperJumpXMult` | 1.25 | Hyper 水平倍率 → 325 |
| `DuckSuperJumpYMult` | 0.5 | Hyper 垂直倍率 → -52.5 |
| `DodgeSlideSpeedMult` | 1.2 | Ultra 水平倍率 |

---

## 5. 速度数学：240、169.7、160、120

【事实·源码级】前提是 `lastAim` 已经是单位向量，`Speed = dir * DashSpeed`。

| 冲刺方向 | 冲刺中 vx | 冲刺中 vy | 结束 vx | 结束 vy | 说明 |
|---|---|---|---|---|---|
| 右 | 240 | 0 | 160 | 0 | `DashDir.Y = 0`，重置 |
| 左 | -240 | 0 | -160 | 0 | 同上 |
| 上 | 0 | -240 | 0 | -120 | 重置 160 后 `Y *= 0.75` |
| 下 | 0 | 240 | 0 | 240 | `DashDir.Y > 0`，跳过重置 |
| 右上 | 169.7 | -169.7 | 113.1 | -84.9 | 每轴 160/√2，再乘 0.75 |
| 左上 | -169.7 | -169.7 | -113.1 | -84.9 | 同上 |
| 右下 | 169.7 | 169.7 | 169.7 | 169.7 | `Y > 0`，跳过重置 |
| 左下 | -169.7 | 169.7 | -169.7 | 169.7 | 同上 |

几个容易被忽略的点：

- **斜向总速度仍是 240。** `√(169.7² + 169.7²) ≈ 240`。如果先乘 240 再归一化，斜向会变成 240；如果先归一化再乘 240，每轴才是 169.7。源码是后者。
- **向下 / 下斜完全不重置。** 这不是 bug，而是设计：向下冲刺的收益是保留惯性，代价是落地/撞墙后的处理。
- **向上分量结束后是 -120，不是 -160。** 因为先重置为 -160，再乘 0.75。
- **上斜水平分量是 113.1，不是 160。** 因为 169.7 × (160/240) = 113.1。

### 5.1 两个冷却为什么必须分开

【事实·源码级】两个计时器都在 `DashBegin` 启动：

```csharp
dashCooldownTimer       = DashCooldown;        // 0.2s = 12 tick @60Hz
dashRefillCooldownTimer = DashRefillCooldown;  // 0.1s = 6 tick  @60Hz
```

| 计时器 | 管什么 | 阻挡什么 |
|---|---|---|
| `dashCooldownTimer` | 动作能否再次发生 | `CanDash` 里的 `dashCooldownTimer <= 0` |
| `dashRefillCooldownTimer` | 资源何时恢复 | 回充分支整体被跳过 |

如果合并成一个值，贴地冲刺会在冲刺途中立刻回充，导致无限地面冲刺。0.1 秒的回充抑制窗口，正是 extended super / hyper / wavedash **必须滑行一段跑道**才能再次被充能的原因。

回充逻辑还有两个细节：

```csharp
public bool RefillDash()
{
    if (Dashes < MaxDashes) { Dashes = MaxDashes; return true; }
    else return false;
}
```

【事实·源码级】是**满充**，不是“补一发”。地面回充还要求脚下正下方有实体，且不在刺上。

### 5.2 帧预算

【推断】按 60Hz 把时间量换算成帧：

- 冻结：0.05s ≈ 3 帧；
- 协程首帧延迟：1 帧；
- 冲刺：0.15s = 9 帧；
- 合计：13 帧；
- 冷却：0.2s = 12 帧；
- 回充抑制：0.1s = 6 帧；
- `DashAttack` 窗口：0.3s = 18 帧。

这也解释了一个常见口径差：源码 `DashTime = 0.15s` 是 9 tick，加上 1 帧延迟是 10 tick；Wiki 上说的“15 帧”很可能量的是包含冻结与冷却的窗口，而不是 Dash 状态本身的长度。两者不是谁写错了，而是量法不同。

---

## 6. 关键分支：以 SuperWallJump 为核心

### 6.1 先纠正一个社区误解

“Wallbounce 是水平冲刺撞墙后反弹”——这个说法不准确。源码里壁反弹的入口是：

```csharp
if (DashDir.X == 0 && DashDir.Y == -1)
```

【事实·源码级】必须是**纯正交向上冲**。上斜冲（`DashDir.X != 0`）不满足条件；水平冲更不满足。水平冲撞墙走的是 `OnCollideH` 的另一条路径：清零水平速度、记录速度保留，并在冲刺状态下把 `dashAttackTimer` 清零。

### 6.2 SuperWallJump 的真实路径

【事实·源码级】

```csharp
private void SuperWallJump(int dir)      // dir = 运动方向 = 背离墙
{
    Ducking = false;
    Input.Jump.ConsumeBuffer();
    jumpGraceTimer = 0;
    varJumpTimer = SuperWallJumpVarTime;  // 0.25
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
    // ...
}
```

方向语义很容易写反：`WallJumpCheck(1)` 查到**右边有墙**，调用 `SuperWallJump(-1)`，得到 `vx = 170 × (-1) = -170`，即**向左弹离右墙**。所以 `dir` 是“运动方向”，也是“背离墙的方向”。

### 6.3 为什么冲刺结束后还能 wallbounce

【事实·源码级】`NormalUpdate` 里还有一条延迟通道：

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
```

`DashAttacking` 的定义是：

```csharp
public bool DashAttacking
{
    get { return dashAttackTimer > 0 || StateMachine.State == StRedDash; }
}
```

`dashAttackTimer = 0.3s`，`DashTime = 0.15s`。所以**冲刺状态结束后还有 0.15 秒的窗口，仍然可以触发 SuperWallJump**。这就是很多“明明冲刺已经结束了，怎么还能弹”的手感来源。

但注意：水平撞墙会把 `dashAttackTimer` 清零。也就是说，撞墙会提前关闭这个窗口；只有“纯上冲 + 贴墙 + 跳”才能吃到完整的 0.15 秒宽容。

### 6.4 Super / Hyper：源码里没有“Hyper”这个函数

【事实·源码级】`SuperJump()` 的尾部：

```csharp
Speed.X = SuperJumpH * (int)Facing;   // 260
Speed.Y = JumpSpeed;                  // -105
Speed += LiftBoost;

if (Ducking)
{
    Ducking = false;
    Speed.X *= DuckSuperJumpXMult;    // 1.25 → 325
    Speed.Y *= DuckSuperJumpYMult;    // 0.5  → -52.5
}
```

- **Super**：水平冲（`DashDir.Y == 0`）+ 跳跃缓冲 + `jumpGraceTimer > 0` → `(±260, -105)`。
- **Hyper / Wavedash**：同一分支，但当时 `Ducking == true` → `(±325, -52.5)`。

源码里没有名为 `Hyper` 的方法；它只是 `SuperJump()` 在蹲下状态下的分支。方向由 **Facing** 决定，与冲刺方向无关，所以可以反向 Super。

### 6.5 Ultra：源码里叫 Dash Slide

【事实·源码级】它有两处实现：

**位置 A：`DashCoroutine` 内，冲刺开始后第 2 帧。**

```csharp
if (onGround && DashDir.X != 0 && DashDir.Y > 0 && Speed.Y > 0
    && (!Inventory.DreamDash || !CollideCheck<DreamBlock>(Position + Vector2.UnitY)))
{
    DashDir.X = Math.Sign(DashDir.X);
    DashDir.Y = 0;
    Speed.Y = 0;
    Speed.X *= DodgeSlideSpeedMult;     // 1.2
    Ducking = true;
}
```

**位置 B：`OnCollideV` 内，冲刺途中落地瞬间。**

```csharp
if (DashDir.X != 0 && DashDir.Y > 0 && Speed.Y > 0)
{
    DashDir.X = Math.Sign(DashDir.X);
    DashDir.Y = 0;
    Speed.Y = 0;
    Speed.X *= DodgeSlideSpeedMult;   // 1.2
    Ducking = true;
}
```

触发条件可以归纳为四条：

1. `DashDir.X != 0`：必须有水平分量，纯下冲不触发；
2. `DashDir.Y > 0`：必须是下斜；
3. `Speed.Y > 0`：必须正在下落；
4. 起手就在地面，或冲刺途中落地。

结果：`vy = 0`、`vx *= 1.2`、`Ducking = true`、`DashDir.Y` 归零。因为 `DashDir.Y` 被归零，冲刺结束时 `DashDir.Y <= 0` 成立，速度会被重置为 `±160`。所以 Ultra 的收益不是“永久 1.2 倍”，而是**落地不清零、进入蹲滑、并在结束时拿到 160 的基准速度**。

本仓库版本里没有看到对 `vx` 的上限检查；但每次触发都要重新进入下斜冲刺并满足落地/起手条件，不能简化为“按住就无限加速”。

### 6.6 三种“冲 + 跳”速查

【事实·源码级】

| 动作 | 输入条件 | 结果速度 |
|---|---|---|
| Super | 水平冲 + 跳（土狼期内） | `(±260, -105)` |
| Hyper / Wavedash | 同上，但 `Ducking == true` | `(±325, -52.5)` |
| SuperWallJump | **纯上冲** + 贴墙跳 | `(∓170, -160)`，varJump 0.25s |
| WallJump | 任意非纯上冲 + 贴墙跳 | `(∓130, -105)` |

再次强调：**水平冲撞墙不在这个表里。** 它只是清零 + 0.06 秒速度保留。

---

## 7. 角修正：手感的一半

【事实·源码级】`Player.cs` 里有四处角修正，数值都以像素为单位：

| 常量 | 值 | 触发场景 |
|---|---|---|
| `DashCornerCorrection` | 4 | 冲刺撞水平墙 / 落地时，水平偏移 1–4px 试空位 |
| `DashVFloorSnapDist` | 3 | 水平冲时离地 3px 内自动吸附 |
| `DashHJumpThruNudge` | 6 | 从 JumpThru 下方 6px 内吸上去 |
| `UpwardCornerCorrection` | 4 | 上撞天花板时水平修正 |

`OnCollideH` 的冲刺角修正：

```csharp
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
```

`OnCollideV` 的落地修正只对冲刺状态且**不是起手就在地面**的冲刺生效：

```csharp
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
```

这些修正不是“作弊”，而是明确的容差设计。Matt Makes Games 的博客文章《Celeste and Forgiveness》讨论过这套思路；本文引用它作为背景，而不是把博客当作源码证据。

还有一个容易忽略的细节：`OnCollideH` 在撞墙时会记录速度保留：

```csharp
if (wallSpeedRetentionTimer <= 0)
{
    wallSpeedRetained = Speed.X;
    wallSpeedRetentionTimer = WallSpeedRetentionTime;   // 0.06
}
```

0.06 秒内如果墙消失（比如可破坏块被打破），速度可以返还。这就是 cornerboost 一类技巧的底层条件之一。

**未验证项**：1.4.x changelog 提到“带刺角不再修正”，但本文没有逐条核对版本差异，因此移植中不做刺处理。这是一个明确的版本边界，而不是遗漏。

---

## 8. 从 C# 到 JS：怎么落到浏览器

目标实现是 `blog-ui/js/celeste-character.js`，运行在 `blog-ui/celeste-character-demo.html`。坐标约定：**1 单位 = 原作 1 像素，y 向下**，物理固定 60Hz 累加，不用渲染帧推进。

### 8.1 状态枚举：26 项，不只是 0/1/2

【事实·IL 级】从 `Celeste.Player` 的 `#US` 字符串字面量顺序，加上 13 处独立的 `ldc.i4` 常量命中，可以重建完整状态表：

| # | 名称 | # | 名称 | # | 名称 |
|---|---|---|---|---|---|
| 0 | Normal | 9 | DreamDash | 18 | ReflectionFall |
| 1 | Climb | 10 | SummitLaunch | 19 | StarFly |
| 2 | Dash | 11 | Dummy | 20 | TempleFall |
| 3 | Swim | 12 | IntroWalk | 21 | CassetteFly |
| 4 | Boost | 13 | IntroJump | 22 | Attract |
| 5 | RedDash | 14 | IntroRespawn | 23 | IntroMoonJump |
| 6 | HitSquash | 15 | IntroWakeUp | 24 | FlingBird |
| 7 | Launch | 16 | BirdDashTutorial | 25 | IntroThinkForABit |
| 8 | Pickup | 17 | Frozen | | |

【缺口】`23 = IntroMoonJump` 是由序列位置推定的，IL 中没有直接命中 `set_State 23`。其余 0–10、12–25 都有直接证据。

Web 引擎实现了其中一部分：`Normal`、`Climb`、`Dash`、`Boost`、`RedDash`、`HitSquash`、`Launch`、`DreamDash`。`Swim` 不移植，因为 `Atlases` 里没有 `water` 素材，且 `swim` 帧只到 11，12–17 缺失；剧情状态（`SummitLaunch`、`TempleFall`、`FlingBird` 等）依赖本引擎不存在的世界对象，也不移植。这不是“偷懒”，而是素材与场景边界。

### 8.2 协程 → 相位标记

JS 没有 `IEnumerator`，用 `dashSpeedSet` 复现 `yield return null`：

```js
beginDash(onGroundAtStart) {
    this.setState(ST_DASH);
    this.dashSpeedSet = false;       // 首帧仍未赋速
    this.freezeTimer = FREEZE_TIME;  // 0.05
    this.dashTime = DASH_TIME;       // 0.15
    this.dashDir = { x: 0, y: 0 };
    this.beforeDashSpeed = { x: this.vx, y: this.vy };
    this.vx = 0;
    this.vy = 0;
    this.dashCooldownTimer = DASH_COOLDOWN;       // 0.2
    this.dashRefillCooldownTimer = DASH_REFILL_COOLDOWN; // 0.1
    this.dashAttackTimer = DASH_ATTACK_TIME;      // 0.3
    this.dashStartedOnGround = !!onGroundAtStart;
    this.wallSlideTimer = WALL_SLIDE_TIME;
    this.lastAim = this.lastAim || { x: this.facing, y: 0 };
    if (!this.onGround && this.ducking) this.ducking = false;
}
```

冲刺数的扣减放在 `startDash()`，对应原作的 `StartDash()`；`beginDash` 只做 `DashBegin` 的事。两者拆开，才能让 `WasDashB`（是否消耗了第二格冲刺）和发色语义正确。

### 8.3 dashUpdate：首帧赋速，之后才推进计时

```js
dashUpdate(dt, input, moveX, moveY) {
    if (!this.dashSpeedSet) {
        const dir = this.lastAim;
        let nx = dir.x * DASH_SPEED;
        let ny = dir.y * DASH_SPEED;
        if (Math.sign(this.beforeDashSpeed.x) === Math.sign(nx) &&
            Math.abs(this.beforeDashSpeed.x) > Math.abs(nx))
            nx = this.beforeDashSpeed.x;
        this.vx = nx;
        this.vy = ny;
        this.dashDir = { x: dir.x, y: dir.y };
        if (dir.x !== 0) this.facing = Math.sign(dir.x);
        if (this.onGround && dir.x !== 0 && dir.y > 0 && this.vy > 0)
            this.dashSlide();
        this.dashSpeedSet = true;
        return;                       // 本帧不推进 dashTime
    }

    if (this.jumpBufferTimer > 0) {
        if (this.dashDir.y === 0 && this.jumpGraceTimer > 0) {
            this.superJump();
            return;
        }
        if (this.dashDir.x === 0 && this.dashDir.y === -1) {
            if (this.wallCheck(+1)) { this.superWallJump(-1); return; }
            if (this.wallCheck(-1)) { this.superWallJump(+1); return; }
        } else {
            if (this.wallCheck(+1)) { this.wallJump(+1); return; }
            if (this.wallCheck(-1)) { this.wallJump(-1); return; }
        }
    }

    this.dashTime -= dt;
    if (this.dashTime <= 0 || Math.abs(this.dashTime) < 1e-9)
        this.endDash();
}
```

这里有一个很容易被忽略的浮点细节：60Hz 下 9 帧累加后，`dashTime` 可能剩下 `+2e-17` 而不是精确的 0。如果只写 `<= 0`，冲刺会多跑一帧。代码里用 `Math.abs(this.dashTime) < 1e-9` 兜底，这不是“优化”，而是帧边界正确性问题。

### 8.4 endDash：只有非向下才重置

```js
endDash() {
    this.autoJump = true;
    this.autoJumpTimer = 0;
    if (this.dashDir.y <= 0) {
        this.vx = this.dashDir.x * END_DASH_SPEED;
        this.vy = this.dashDir.y * END_DASH_SPEED;
    }
    if (this.vy < 0) this.vy *= END_DASH_UP_MULT;
    this.setState(ST_NORMAL);
    this.dashSpeedSet = false;
}
```

`autoJump = true` 不触发跳跃。它只参与半重力判定：当 `|vy| < 40` 且 `jumpHeld || autoJump` 时，重力乘 0.5。JS 里还必须在地面时清掉 `autoJump`（Climb 除外），否则 DreamDash 等状态写入的 `autoJump` 会让角色落地后永久“发飘”。

### 8.5 superWallJump：方向别写反

```js
superWallJump(dir) {
    this.ducking = false;
    this.jumpBufferTimer = 0;
    this.jumpGraceTimer = 0;
    this.varJumpTimer = SUPER_WALL_JUMP_VAR_TIME;  // 0.25
    this.autoJump = false;
    this.autoJumpTimer = 0;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = WALL_SLIDE_TIME;
    this.wallBoostTimer = 0;
    this.vx = SUPER_WALL_JUMP_H * dir;             // 170 * dir
    this.vy = SUPER_WALL_JUMP_SPEED;               // -160
    this.varJumpSpeed = this.vy;
    this.facing = dir;
    this.scaleX = 0.6; this.scaleY = 1.4;
    this.onGround = false;
    this.setState(ST_NORMAL);
    this.dashSpeedSet = false;
}
```

`dir` 是背离墙的方向。`wallCheck(+1)` 表示右边有墙，所以调用 `superWallJump(-1)`，得到负的 `vx`，向左弹离。

### 8.6 瞄准：一个明确的近似

【事实·源码级】原作在 `Update()` 里写：

```csharp
//Aiming
lastAim = Input.GetAimVector(Facing);
```

`lastAim` 的初始值是 `Vector2.UnitX`。`DashCoroutine` 里**没有二次归一化**，所以 `lastAim` 必须已经是单位向量。

【缺口】`Input.GetAimVector` 的实现不在归档仓库里。死区、对角吸附角度、零输入时回落到 Facing 的具体写法，都无法逐字给出。

【近似】JS 用“8 向输入 + 单位化 + 零输入回落 Facing”等价实现：

```js
let ax = input.aimX || 0, ay = input.aimY || 0;
if (ax === 0 && ay === 0) ax = this.facing;
const amag = Math.hypot(ax, ay) || 1;
this.lastAim = { x: ax / amag, y: ay / amag };
```

这个近似能满足键盘 8 向与“按住冲刺不放方向键时不会原地不动”的需求，但它不是原作的摇杆死区实现。文章中所有涉及死区精度的结论都应视为近似。

### 8.7 角修正与碰撞接口

浏览器 demo 的场地是少量实心方块，不是原作 tile 地图。因此 JS 没有复刻 `CollideCheck<Solid>`，而是注入两个函数：

- `setWallAt(fn)`：6px 容差的贴墙探测，对应 `WallJumpCheckDist = 3` 的双向扩展；
- `setWallCollideFn(fn)`：严格碰撞，用于水平撞墙与速度保留。

角修正按第 7 章的条件落在 `postPhysics` / `OnCollideH` / `OnCollideV` 附近：

- 冲刺水平撞墙：在 `±4px` 内找空位，找到就 `MoveVExact` 再前进 1px；
- 冲刺落地：在 `±4px` 内找不在地面的位置，找到就水平修正再下移 1px；
- 水平冲离地 3px：吸附；
- JumpThru 下方 6px：吸上去。

这是“近似”而不是“等价”：6px 贴墙容差比原作的 3px 更宽容，方块场地也没有 tile 的边角组合，容差行为在复杂地图上不会与原作完全一致。

### 8.8 移植偏差清单：13 个最容易写错的点

下面这张表是第一轮移植时逐条核出来的偏差。除 D2 的“零输入回落 Facing”是【推断】（`GetAimVector` 不在归档仓库）外，其余 12 条均为【事实·源码级】。D1–D13 都可以在 demo 里用一次操作观察到，它也是“证据 → 实现”之间最实用的检查表。

| # | 容易写成 | 原作事实 | 直接后果 |
|---|---|---|---|
| D1 | `DashBegin` 立即赋速 | Begin 清零，协程 `yield return null` 后下一帧赋速 | 少 1 帧延迟，demodash 不成立 |
| D2 | 零输入时方向为 `(0,0)` | `GetAimVector` 零输入回落到 Facing | 按住冲刺不放方向键会原地不动 |
| D3 | 结束统一重置为 160 | 只有 `DashDir.Y <= 0` 才重置 | 向下 / 下斜冲刺丢失 240 惯性 |
| D4 | 水平冲撞墙触发 wallbounce | 只有纯上冲 + 贴墙跳才触发；水平撞墙清零 + 0.06s 保留 | 所有贴墙冲刺都乱弹 |
| D5 | Ultra 在冲刺结束后 / 着地时触发 | 协程起手地面或 `OnCollideV` 落地瞬间；`vy=0`、`Ducking=true`、`DashDir.Y=0` | 时机错一个阶段，且没有蹲滑 |
| D6 | 没有 `DashAttackTime` | 0.3s，比 DashTime 0.15s 长 | 冲刺结束后 0.15s 的 wallbounce 窗口丢失 |
| D7 | 没有 SuperJump | 水平冲 + 跳 = `(±260, -105)`；蹲下 `(±325, -52.5)` | 缺 Super / Hyper 整套 |
| D8 | 没有 `beforeDashSpeed` | 同向且更大的 X 速度被保留 | 高速连冲掉速 |
| D9 | 冲刺时头发变黄 | 白闪 0.12s；黄是羽毛专用；0 格才渐变蓝 | 发色语义错误 |
| D10 | `AutoJump` 自动起跳 | 只参与半重力判定，不触发跳跃 | 冲刺结束莫名弹跳 |
| D11 | 没有角修正 | 4px / 3px / 6px / 3px 四处容差 | 擦边跳跃手感缺失 |
| D12 | 没有速度保留 | 撞墙后 0.06s 内墙消失可返还 | cornerboost 类技巧缺失 |
| D13 | `SuperWallJump` 常量闲置 | 必须接到纯上冲 + 贴墙跳路径 | 常量是死代码，wallbounce 不成立 |

这 13 条里，D4、D5、D6、D10 是最容易“看起来能跑、手感却不对”的四条。它们不是数值问题，而是分支顺序和计时器语义问题。

---

## 9. 验证：怎么证明“不是看起来像”

### 9.1 可交互 demo

线上地址：

```text
https://www.instapix.icu/celeste-character-demo
```

本文写作时复核：HTTP 200，标题为 `Celeste 人物引擎 · 测试展示（Climb + Dash + Boost）`。

操作：

- `A / D` 移动，`C` 跳（缓冲 0.08s、土狼 0.1s、可变跳高）；
- `S` 蹲下 / 空中快落，`W` 抬头，`F` 强风，`R` 复位；
- `Z` 抓墙攀爬，`X` 冲刺（方向键 8 向），蹲下 + `X` 蹲冲。

HUD 直接写出关键常量：

```text
Dash 240 / 0.15s · End 160 · Cooldown 0.2s · DashAttack 0.3s · Stamina 110
地面横冲 + C = Super 260 · 蹲着横冲 + C = Hyper 325 · 纯上冲贴墙 + C = WallBounce 170/-160
```

### 9.2 六个可观察实验

| # | 操作 | 预期观察 | 对应结论 |
|---|---|---|---|
| 1 | 地面水平冲 + `C` | 水平速度跳到 260 左右，垂直 -105 | Super |
| 2 | 同上，但先按 `S` 蹲下再冲 + `C` | 水平约 325，垂直约 -52.5 | Hyper 是 SuperJump 的蹲下分支 |
| 3 | 贴墙，按 `↑` + `X` 纯上冲，再按 `C` | 向背离墙方向弹开，水平约 170，垂直约 -160 | Wallbounce 必须纯上冲 |
| 4 | 按 `↓` + `X` 向下冲，落地后看速度 | 不重置为 160，保留 240 惯性；下斜保留每轴 169.7 | 向下不重置 |
| 5 | 斜向冲，读 HUD 或看轨迹 | 每轴约 169.7，合速度仍约 240 | 单位化 |
| 6 | 冲刺瞬间看发色 | 先白闪约 0.12s；无冲刺后渐变蓝 | 冲刺不是变黄 |

如果实验 3 在“水平冲撞墙”时也自动弹，那说明实现仍然把 wallbounce 写错了；如果实验 4 向下冲结束掉到 160，说明 `endDash` 无条件重置了。

### 9.3 已有的验证记录与边界

【事实·研究记录】移植阶段用 Node `vm` 沙箱跑数值断言，记录为 `passed 69/69`；浏览器实测覆盖了 `X → DASH`、`C → vy` 变负、`→` 右移、绿球 `Boost → Dash`，并记录了当轮未复验的两项：红球 `RedDash → HitSquash` 与贴墙 `Z → CLIMB`。

需要诚实说明：**本次写文章时没有重跑 69/69**。Dash 专用的断言脚本是研究阶段的临时产物，当前工作区没有保留。因此本文把 69/69 标为“研究记录”，而不是“本次新验证”。

### 9.4 线上视频

B 站视频 `BV13QYT64EDX` 已通过公开接口核对：

- `code = 0`，视频存在；
- 标题：《与Madeline写日记｜Celeste AI日记博客demo展示》；
- UP 主：`Spongebob452`；
- 时长：213 秒（3:33）。

它不是 Dash 技术演示，而是整个博客项目的 demo。放在本文末尾合适；不要把它描述成“Dash 逆向的官方演示”，也不要用播放/点赞数做技术背书。

> **视频链接**：[《与Madeline写日记｜Celeste AI日记博客demo展示》](https://www.bilibili.com/video/BV13QYT64EDX/)（B 站，3:33）
>
> 这是整个博客项目的运行 demo，不是 Dash 逆向的专项演示；技术结论仍以本文的文字与代码为准。

---

## 10. 可复现步骤

以下步骤只读使用素材，不修改游戏目录。

### 10.1 取回 Player.cs 并校验字节数

```powershell
curl.exe -L --fail --output Player.cs "https://ghproxy.net/https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs"
(Get-Item Player.cs).Length
```

预期 `186844`。如果代理不可用，可以换另一个代理，或直接在浏览器打开归档仓库的文件页。第三方代理的可用性不受本文控制。

### 10.2 确认缺口

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "https://ghproxy.net/https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Input.cs"
```

预期 `404`。`PlayerHair.cs`、`PlayerSprite.cs`、`Assists.cs` 同理。先确认这些 404，再决定哪些结论只能标为缺口。

### 10.3 取 IL

```powershell
rea inspect-managed-members "C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll" --type Celeste.Player --format json
```

要点：

- 先核对 `sha256` 和 `byte_length`，确认你分析的是同一个安装版；
- 看 `coverage.state` 是否为 `complete`；
- `rea decompile` 对托管程序集不可用时，不要把它当成失败重试；直接读 IL 与元数据；
- 用方法名定位 `DashBegin`、`DashCoroutine`、`DashUpdate`、`DashEnd`、`SuperWallJump`、`SuperJump`、`WallJump`。

### 10.4 本地跑 demo

在仓库根目录：

```powershell
cd blog-ui
python -m http.server 8080
```

打开：

```text
http://localhost:8080/celeste-character-demo.html
```

不要直接双击 HTML 用 `file://` 打开；素材加载和同源策略在不同浏览器下表现不一致。线上版是 `https://www.instapix.icu/celeste-character-demo`。

### 10.5 语法与帧行为自检

```powershell
node --check js/celeste-character.js
node --check js/celeste-hair.js
```

然后按 9.2 的六个实验逐项观察。若要重建自动化断言，建议至少覆盖：

1. `beginDash` 首帧 `vx/vy == 0`；
2. 第二帧水平冲 `vx == 240`；
3. 下斜冲 `vx/vy == ±169.7`；
4. 向上结束 `vy == -120`；
5. 向下结束 `vy == 240`；
6. 纯上冲 + 贴墙 + 跳 → `vx == ∓170, vy == -160`；
7. 水平冲 + 跳 → `vx == ±260, vy == -105`；
8. 蹲下水平冲 + 跳 → `vx == ±325, vy == -52.5`；
9. `dashAttackTimer` 在冲刺结束后仍大于 0；
10. 9 帧后 `dashTime` 的浮点容差分支能正确结束。

---

## 11. 缺口与边界

【缺口】以下是本文明确无法回答、或只能给出近似的内容：

| ID | 缺口 | 影响 |
|---|---|---|
| G1 | 没有 C# 伪代码，第二轮只有 IL 级证据 | 所有“IL 级事实”不是源码级；不要把它们写成逐字 C# |
| G2 | 状态 23 = `IntroMoonJump` 由序列位置推定 | 26 状态表中这一项不是直接命中 |
| G3 | `swim` 帧 12–17 缺失 | Swim 不移植 |
| G4 | 没有 `water` 素材 | Swim 不移植；DreamBlock 是程序化绘制 |
| G5 | `Input.Feather` / `Input.Aim` 死区实现缺失 | 瞄准只能近似 |
| G7 | `CollideFirst<T>` 泛型类型实参由上下文推定 | 个别碰撞对象的类型不是元数据直读 |
| G8 | 编译器生成的 `<…>d__N.MoveNext` 未逐指令展开 | 部分剧情协程的真实逻辑未知 |
| G10 | `CanUnDuck` 用 `!ducking` 近似 | 平地等价，贴低顶不等价 |
| G11 | `LastBooster.Ch9HubTransition` 在引擎中不可达 | 红冲的 Ch9 分支不影响其余逻辑 |

另外还有三个口径边界：

- 发色 `hairFlashTimer = .12f` 是方法内字面量，不在常量块里；
- 1.4.x 带刺角修正变更只据 changelog 摘要，未逐条核对；
- Wiki 的“15 帧”与源码的 10 tick 是量法差异，不是错误。

如果你要把这篇文章的结论用于自己的实现，建议按这个顺序引用：

1. 先引用【事实·源码级】；
2. 再用【事实·IL 级】补源码缺失的部分；
3. 把【推断】和【近似】当作实现假设，不要当作原作行为；
4. 遇到【缺口】，要么补取证，要么在代码注释里写清楚。

---

## 12. 版权与声明

Celeste 的游戏素材、角色、音频、代码片段及相关知识产权归 **Extremely OK Games** 所有。本文与 Extremely OK Games 无关联，未获其授权、赞助或背书；文中出现的“源码”“原作”等表述仅指公开归档的类文件与本机安装版的逆向观察，不构成官方声明。

本项目是非商用同人二创，仅用于个人学习、技术演示与手感研究。仓库中的游戏素材不用于商业分发；如果权利方认为某处使用不当，应删除对应素材或页面。本文的文字部分由项目作者撰写，引用请注明出处；仓库代码以其自身许可证为准。

本文不鼓励绕过 DRM、不分发游戏本体、不提供盗版资源。所有逆向观察都基于本机已购买/已安装的游戏与公开归档文件，取证过程只读，不修改游戏目录。

---

## 13. 参考

- Noel Berry 公开归档仓库：`https://github.com/NoelFB/Celeste`
- `Player.cs` 归档文件：`https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs`
- 可用镜像：`https://ghproxy.net/https://raw.githubusercontent.com/NoelFB/Celeste/master/Source/Player/Player.cs`
- Celeste Wiki：Dash、Tech、Ultras、Wallbounces、Superdashes、Wavedashes、Dash Refills
- Matt Makes Games 博客：Celeste and Forgiveness
- 游戏 Changelog：`https://www.celestegame.com/changelog.html`
- 本仓库实现：`blog-ui/js/celeste-character.js`、`blog-ui/celeste-character-demo.html`
- 研究底稿：`celeste-dash-反编译研究.md`

---

*本文为技术学习与演示用途，非官方文档。*
