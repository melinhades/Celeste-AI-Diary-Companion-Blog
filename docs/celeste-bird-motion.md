# Celeste 鸟类实体的运动逻辑（从出货程序集逆向）

## 0. 证据来源与可复现性

| 项 | 值 |
|---|---|
| 目标文件 | `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` |
| SHA-256 | `999024e23285acc0c7ac37b6ed33874e16a1f0f9af5fdeff66a64050b78f8e24` |
| 大小 / 格式 | 5,223,424 B / PE32 il-only（`rea inspect_managed_artifact`，evidence `ev_897bac43…`）|
| 模块名 / MVID | `Celeste.exe` / `4a26f9de-d670-4c87-a2f4-7e66d2d85163` |
| 运行时 | `net8.0`，且**已被 Everest 补丁**（含 `Celeste.Mod.Entities.*`、`orig_*` 方法） |

方法：REA 的托管 provider 只到元数据层（Ghidra 明确拒绝 managed），所以用**游戏自带**的 `Mono.Cecil.dll` 在 PowerShell 5.1 里直接读 IL 方法体。全程只读，不写入游戏目录。

脚本与原始 IL（可重跑）：`.screenshots/.tmp/celeste-re/`
- `dump_bird_il.ps1` → `bird_il.txt`（37 个鸟类类型 / 8,013 行 IL）
- `dump_helpers.ps1` → `helpers_il.txt`（Monocle 辅助函数的真实语义）
- `summarize.py`（每个类型的被调方法 + 全部浮点常量摘要）
- 本轮补充取证：`tutorial_gui_il.txt`（`BirdTutorialGui` 的 `Update`/`Render`/`UpdateControlsSize`）、`monocle_sprite_il.txt`（`Sprite::Update` 的帧驱动与 `OnFrameChange` 触发时机）、`chooser_il.txt`（`goto` 权重随机）、`particle_types_il.txt`（`P_WingsBurst` → `P_Feather`）、`gfx2.txt` / `gfx_il.txt`（`GFX.Gui` 图集名）
- **FlingBird 这一轮**（§6）：`bird_il.txt` L1717-3081（`FlingBird` 全部方法 + 四个协程状态机）、`lightning_il.txt`（`Lightning` 的 `.ctor`/`Update`/`ToggleCheck`/`InView`/`OnPlayer`/`Shatter`/`SetBreakValue`/`Removed` 与 `<Move>d__16` / `<MoveRoutine>d__15` / `<RemoveRoutine>d__21`）、`collider_il.txt`（`Monocle.Collider/Circle/Hitbox/Collide/PlayerCollider` + `Scene::FreezeFrameUpdate`）、`timerate_il.txt`（`Engine::Update`、`Level::Update` 的 TimeRateB、`Level::FreezeFrameUpdate`）、`coroutine_il.txt`（`Coroutine::Update` 对 `yield` 值的解释）、`speedring_il.txt`、`player_consts_il.txt`（六个 Hitbox / `StateMachine(26)` / `Depth=0`）、`player_origupdate_il.txt`（IL_1110..IL_11b6 的 `PlayerCollider` 扫描与 `launched`）、`player_fling_il.txt`（`DoFlingBird`/`FinishFlingBird`/`Hurt`）、`camera_il.txt`（`Level::Render` 的那一次 blit、`ZoomTo/ZoomBack/ResetZoom`）、`level_il.txt`（`Level` 全类型 26 个方法）
- **电闸这一轮**（§7）：`breaker_il.txt`（`LightningBreakerBox` 的 `.ctor(EntityData, Vector2)` / `.ctor(Vector2, bool)` / `<.ctor>b__23_0` / `Added` / `Awake` / `Break` / `Dashed` / `Pulse` / `Render` / `SmashParticles` / `Update` 全量 857 行）、`lightning_pulse_il.txt` + `lightning_pulse_routine_il.txt`（`SetPulseValue` 的 0.075 / 1.2）、`monocle_shake_il.txt`（`SineWave` / `Wiggler` / `Shaker`）、`calc_rva_arrays.txt`（`shakeVectorOffsets` 的 RVA blob = `int[5]{-1,-1,0,1,1}`）、`player_dashentry_il.txt` / `player_dashupdate_il.txt` / `player_dash_il.txt`（dash 状态 2 的全链与 `OnCollideH/V` 的 `OnDashCollide` 派发）、`particletype_ctor_il.txt` / `particle_types_il.txt`（`P_Smash` / `P_Sparks` 的逐字段常数）
- **回归验证**（改页面后必跑，两个都是 `exit 1` 即失败）：
  - `node .screenshots/.tmp/celeste-re/verify_js.js` —— 静态：语法、图集帧名的**磁盘大小写**逐帧比对、GUI 素材白名单、每个协程旁的 `<Xxx>d__NN` 编号直接从 `bird_il.txt` / `lightning_il.txt` / `breaker_il.txt` 反查、**页面上出现的 27 个状态机编号全部要在 IL 取证文件里原样命中**、正文表格与 IL 一致性、阈值正则、面板几何公式、帧控制流的**出现顺序**（`UpdateLists → freeze 分支 → Level::Update → DrawToBuffer → 相机 blit`）、鸟音效 13 个事件名对 IL + 60 个变体对磁盘
  - `node .screenshots/.tmp/celeste-re/verify_runtime.js` —— 把页面的数学层/精灵层/`BirdNPC`/`FlingBird`/`Lightning`/`LightningBreakerBox`/`PlayerEntity` 装进无 DOM 桩，真实推帧跑完整管线（喊叫→啄地→面板逐帧展开→靠近飞走→翻面→过场触发；抓取→TimeRate 0.8→Freeze→ZoomTo→甩出→SpeedRing→relocation→电网拦截与拆除；电闸→第一击 squeeze/Shaker/Pulse/Fork→第二击 Break→RefillDash→RemoveRoutine→整屏电网清空）

复刻成品：`blog-ui/celeste-bird.html`（只读仓库自带的 `blog-ui/Atlases/`）。支持 `?vanilla=1&angleFix=0&art=4&invincible=1&px=700&py=430&down=1&fling=1&lightning=1&dash=1&pause=1` 直接分享某个判定瞬间（`px/py` = 把“玩家”摆到坐标，`down` = `Player.State == 1` 即挂墙爬，`fling/lightning` = 那两只可抱可甩的大鸟与拦在它们面前的电网是否入场，`dash` = 键盘模式；`lightning` 入场时电闸（`LightningBreakerBox`）一起投放）；本地预览用同目录的 `serve.js`（只开放 bird/flutterbird/particles-feather 与 4 条 `Gui/` 前缀）。

> 下文每条常数都对应 IL 偏移，不是凭印象写的。**这是当前安装（Everest 已合并）的版本**，与纯净 vanilla 的差异已在 §4 标注。

---

## 1. `FlutterBird` —— 会跳来跳去的小鸟（装饰 + 惊飞）

最"有生命感"的一个，也是最适合搬到网页上的一个。7 个字段：`colors[4] / sprite / start / routine / flyingAway / tweetingSfx / flyawaySfx`。

### 1.1 外观初始化（`.ctor` IL_0012–005c，`.cctor`）
- `Depth = -9999`（画在 Player 前面）
- `start = Position`（记住出生点，之后所有跳跃都围绕它，**不会漂移**）
- 颜色从 4 个固定色里随机取一个：`#89fbff / #f0fc6c / #f493ff / #93baff`
- 常驻鸣叫循环 `birdbaby_tweet_loop`

### 1.2 待机：隔一段时间跳一下（`<IdleRoutine>d__9::MoveNext`）

```
player = Scene.Tracker.GetEntity<Player>()
delay  = 0.25f + Calc.NextFloat(1f)      // 0.25 ~ 1.25 秒的随机间隔
p      = 0
// —— 等待阶段 ——
while (p < delay) {
    if (player != null &&
        Math.Abs(player.X - X) < 48 &&   // 水平 48px
        player.Y > Y - 40 &&             // 上方最多 40px
        player.Y < Y + 8) {              // 下方最多 8px
        FlyAway(Math.Sign(player.X - X), Calc.NextFloat(0.2f));
        yield break;
    }
    yield return null;
    p += Engine.DeltaTime;
}
// —— 起跳 ——
Audio.Play("event:/game/general/birdbaby_hop", Position);
target = start + new Vector2(-4 + Calc.NextFloat(8f), 0);   // 出生点 ±4px
sprite.Scale.X = Math.Sign(target.X - Position.X);          // 只取 ±1，先定朝向
bezier = new SimpleCurve(Position, target, (Position + target) / 2 - Vector2.UnitY * 14f);
p = 0;
while (p < 1) {
    Position = bezier.GetPoint(p);
    yield return null;
    p += Engine.DeltaTime * 4;           // 0.25 秒一跳
}
// —— 落地压扁 ——
sprite.Scale.X = Math.Sign(sprite.Scale.X) * 1.4f;
sprite.Scale.Y = 0.6f;
Position = target;
goto 重新取 player 和 delay;             // IL_02ab 跳回 IL_0029
```

要点：
- **接近判定框是偏置的**：水平 ±48，垂直 `-40（上方）～ +8（下方）`，即 `player.Y ∈ (Y-40, Y+8)`。带子几乎全在鸟的上方，说明鸟的原点 `Position` 落在身体偏上位置、玩家在同一地面行走时 Y 略大于它；具体是几何结果，不要当成设计意图读。
- **跳跃弧线用二次贝塞尔**：控制点在「起终点中点」上方 14px，实际轨迹最高点只上升 **7px**（\(\tfrac14 A+\tfrac12 C+\tfrac14 B\)）。所以它是"弹跳"而不是"飞"。
- **落地 squash**：X×1.4、Y×0.6，然后由 `Update` 弹回原尺寸。

### 1.3 尺寸回弹（`Update`）
```
sprite.Scale.X = Calc.Approach(sprite.Scale.X, Math.Sign(sprite.Scale.X), 4 * Engine.DeltaTime);
sprite.Scale.Y = Calc.Approach(sprite.Scale.Y, 1, 4 * Engine.DeltaTime);
```
即 4 units/second 的线性回弹（不是插值，是定速逼近）。

### 1.4 惊飞（`FlyAway` + `<FlyAwayRoutine>d__10`）

`FlyAway(dir, delay)`：`flyingAway` 为真则直接忽略；停掉鸣叫循环，播 `birdbaby_flyaway`，**替换** `routine` 协程。

```
yield return delay;                      // 协程 yield 一个 float = 等待这么多「秒」（§3.4 已验证）
sprite.Play("fly", false, false);
sprite.Scale = new Vector2(-dir * 1.25f, 1.25f);       // 起飞瞬间拉伸
level.ParticlesFG.Emit(Calc.Choose<Dust>(ParticleTypes.Dust), Position, -Math.PI / 2);
from = Position;
to   = Position + new Vector2(dir * 4, -8);
p    = 0;
while (p < 1) {                          // 蹬地弹射段
    Position = from + (to - from) * Ease.CubeOut(p);   // 三次缓出：起手最快
    yield return null;
    p += Engine.DeltaTime * 3;           // 约 0.33 秒
}
Depth = -10001;                          // 拉到最前
sprite.Scale.X = -sprite.Scale.X;        // 翻身（朝向飞行方向）
to = new Vector2(dir, -4) * 8;           // 初速度 (±8, -32) px/s
while (Y + 8 > level.Bounds.Top) {       // 没飞出房间顶部就继续
    to       += new Vector2(dir * 64, -128) * Engine.DeltaTime;   // 恒定加速度
    Position += to * Engine.DeltaTime;
    // 连锁惊飞：每 0.1 秒检查一次
    if (Scene.OnInterval(0.1f) && Y > level.Camera.Top + 32)
        foreach (other in Tracker.GetEntities<FlutterBird>())
            if (|X - other.X| < 48 && |Y - other.Y| < 48 && !other.flyingAway)
                other.FlyAway(dir, Calc.NextFloat(0.25f));
    yield return null;
}
Scene.Remove(this);                      // 飞出房间即销毁
```

- 起飞段用 `CubeOut`（先快后慢）→ 视觉上"蹬地弹射"。
- 巡航段是**显式速度 + 显式加速度**的积分（\(\Delta v=(64,\,-128)\cdot dt\)），不是插值，所以越飞越快、越来越斜。
- **连锁惊飞**只在逃离鸟还在镜头附近（`Y > Camera.Top + 32`）时发生，且节流 0.1s、半径 48px 立方、且对方尚未起飞。这是"一窝鸟被惊起"的效果来源。

---

## 2. `BirdPath` —— 沿节点链飞行、带物理滞后的鸟（Farewell 用）

字段：`start / sprite / nodes[] / trailColor / target / speed / maxspeed / lastTrail / speedMult / oldAngle / oldAngleInit / angleFix / angleFixMaxRotation / inVanilla`。

### 2.1 出生参数（`.ctor`）
- `trailColor = #639bff`，`Tag = Tags.TransitionUpdate`（转场期间仍更新）
- `maxspeed = 150 * speedMult`（`speedMult` 来自地图 EntityData，默认 1）
- sprite `"bird"`，动画 `"flyupRoll"`，`JustifyOrigin(0.5, 0.75)`（抓握点在身体下方偏脚）
- `Awake`：`onlyIfLeft` 为真且 `player.X > X` 时 `RemoveSelf()`（只在玩家从左侧来时存在）

### 2.2 路径推进（`<Routine>d__18::MoveNext`）——「目标点」沿贝塞尔链走

```
from = start;
for (i = 0; i <= nodes.Length - 2; i += 2) {      // 节点成对：控制点 + 落点
    at   = nodes[i];                              // 控制点
    next = nodes[i + 1];                          // 该段终点
    curve    = new SimpleCurve(from, next, at);
    duration = curve.GetLengthParametric(32) / maxspeed;   // 按弧长换算时间
    playedSfx = false;
    p = 0;
    while (p < 1) {
        target = curve.GetPoint(p);               // ← 只写 target，不写 Position！
        if (p > 0.9 && !playedSfx && sprite.CurrentAnimationID != "flyupRoll") {
            Add(new SoundSource("…/bird_flyuproll") { RemoveOnOneshotEnd = true });
            playedSfx = true;
            sprite.Play("flyupRoll", false, false);
        }
        yield return null;
        p += Engine.DeltaTime * (inVanilla ? speedMult : 1) / duration;
    }
    from = next;
}
RemoveSelf();
```

**这是整段逻辑的核心设计**：协程只负责**算目标点**，真正的位移交给 `Update` 的物理追赶，于是鸟会**滞后、惯性、过冲再收敛**，看起来像活的，而不是贴着曲线滑。

### 2.3 位移积分（`Update`）——「位置」追「目标」

```
if ((Scene as Level).Transitioning) { 只同步音效位置; return; }   // 转场时冻结
base.Update();
prevSign = Math.Sign(X - target.X);
dir      = Calc.SafeNormalize(target - Position);
speed   += dir * 800 * Engine.DeltaTime;                    // 恒定加速度 800 px/s²
if (speed.Length() > maxspeed) speed = Calc.SafeNormalize(speed, maxspeed);
Position += speed * Engine.DeltaTime;
if (Math.Sign(X - target.X) != prevSign) speed.X *= 0.75f; // 横向过冲 → 阻尼
float ang = angleFix ? CalcAngle()
      : Calc.AngleLerp(Calc.Angle(speed), Calc.Angle(Position, target), 0.5f);
sprite.Rotation = ang + Math.PI / 2;                        // 贴图朝上，故 +90°
if ((lastTrail - Position).Length() > 32) { TrailManager.Add(this, trailColor, 1, false, false); lastTrail = Position; }
```

- 加速度 **800**、上限 **150·speedMult**、过冲阻尼 **×0.75**、朝向 **速度方向与指向目标方向的等权角度插值**（`t=0.5`）、拖尾每 **32px** 一节。
- 贴图默认朝上，所以旋转一律 `+π/2`。

### 2.4 角度限幅（`CalcAngle`，`angleFix=true` 时）
```
if (!oldAngleInit) { oldAngleInit = true; oldAngle = Calc.Angle(speed); }
else {
    maxRot = angleFixMaxRotation * Engine.DeltaTime;
    goal   = Calc.AngleLerp(Calc.Angle(speed), oldAngle, 0.5f);
    oldAngle = Calc.AngleApproach(oldAngle, goal, maxRot);
}
return oldAngle + Math.PI / 2;
```
`angleFixMaxRotation` 从 EntityData 读**度数**并 `Calc.ToRad` 后取绝对值 → 地图里填「度/秒」。

---

## 3. 被依赖的 Monocle 原语（已逐个核对 IL，不是猜的）

### 3.1 `SimpleCurve`
字段顺序 `(Begin, End, Control)`，`GetPoint` 为标准二次贝塞尔（内部用 double 累加再降回 float）：
\[
P(t)=(1-t)^2\,\text{Begin}+2(1-t)t\,\text{Control}+t^2\,\text{End}
\]
`GetLengthParametric(res)` = 把 \([0,1]\) 均分 `res` 段折线求和（BirdPath 用 32）。

### 3.2 角度族
- `Calc.Angle(v) = Atan2(v.Y, v.X)`；`Angle(from, to) = Atan2(to.Y-from.Y, to.X-from.X)`（先转 double 再降 float）
- `Calc.AngleDiff(a, b)` = 把 `b - a` 折到 \((-\pi,\pi]\)
- `Calc.AngleLerp(a, b, p)` = `a + AngleDiff(a, b) * p`
- `Calc.AngleApproach(val, target, maxMove)`：`diff = AngleDiff(val, target)`；`|diff| < maxMove` 直接到 target，否则 `val + Clamp(diff, -maxMove, maxMove)`

### 3.3 逼近与归一
- `Calc.Approach(val, target, maxMove)` = `val > target ? Max(val - maxMove, target) : Min(val + maxMove, target)`（**定速**逼近，不是插值）
- `Calc.SafeNormalize(v[, len])`：零向量返回 `Vector2.Zero`（或 `ifZero`），否则归一化并乘长度

### 3.4 随机、缓动与协程
- `Calc.NextFloat(max)` = `Random.NextDouble() * max`
- `Ease.Invert(f)(t) = 1 - f(1 - t)`；`CubeIn(t) = t³`（double 运算）⇒ **`CubeOut(t) = 1 - (1-t)³`**
- `Coroutine.Update`（vanilla 部分）：`waitTimer > 0` 时按 `UseRawDeltaTime ? RawDeltaTime : DeltaTime` 递减并跳过。因此 **`yield return <float 或 int>` = 暂停这么多「秒」**（会随暂停/慢动作变慢），`yield return null` = 下一帧，`yield return <IEnumerator>` = 嵌套协程。

---

## 4. vanilla 的一个真实 bug（Everest 在 IL 层修的）

补丁说明原文（`Celeste.xml`）：

> This extra `bird.speedMult` in the percentage calculation is not supposed to be there, it causes the bird to be too fast or too slow if that field is not set to one, consider this as a vanilla bug.
> —— `MonoMod.MonoModRules.PatchBirdPathRoutine`

由 §2.2 + §2.3 可直接算出后果：`duration` 已经含 `maxspeed = 150·speedMult`，而进度推进又乘了一次 `speedMult`，于是目标点的走完时长
\[
t_{\text{seg}}=\frac{\text{len}/(150\cdot \text{speedMult})}{\text{speedMult}}=\frac{\text{len}}{150\cdot \text{speedMult}^{2}}
\]
**速度是平方关系**，`speedMult=2` 时目标点快了 4 倍，而物理追赶的上限只快了 2 倍 → 鸟会明显「跟不上自己的路径」。

第二条补丁（`PatchBirdPathUpdate`）：`speedMult` 很小时，`target` 可能落到鸟身后，`AngleLerp(speed, Pos→target, 0.5)` 的两个角度互相抵消，鸟会**侧身 90°**飞；新增 `angleFix` / `angleFixMaxRotation` 只用速度向量定朝向并限幅。

`inVanilla = (GetLevelSet(Session.Area) == "Celeste")`（在 `Added` 里赋值）→ 原版章节保留旧行为，MOD 章节走修正行为。**如果你要复刻给网页用，按修正版实现，别照抄 vanilla。**

---

## 5. `BirdNPC` —— 教学鸟（会喊叫、啄地、举面板、靠近就飞走）

取证方式同上：用游戏自带的 `Mono.Cecil.dll` dump `BirdNPC` / `BirdTutorialGui` / `Monocle.Sprite` / `Monocle.Chooser` 的方法体。证据文本在 `.screenshots/.tmp/celeste-re/`（`bird_il.txt`、`tutorial_gui_il.txt`、`monocle_sprite_il.txt`、`chooser_il.txt`），两个验证脚本会把页面里的每个阈值与**状态机编号**回头对这份 IL。

### 5.1 `SetMode`：一个 Mode = 一个协程
`SetMode(Modes)`（`bird_il.txt` L4508）先 `tutorialRoutine?.RemoveSelf()`，再按分支 `Add(new Coroutine(<Xxx>Routine(), true))`。八个分支在 `newobj Coroutine(IEnumerator,Boolean)` 前**全是 `ldc.i4.1`** ⇒ `updateUntilRender = true`，教程协程在同一帧里可以连着推进好几步。

编译器生成的状态机编号（从 IL 的 `BirdNPC/<Name>d__NN` 抓，不要按印象写）：

| 协程 | # | 协程 | # | 协程 | # |
|---|---|---|---|---|---|
| `Caw` | 27 | `ShowTutorial` | 28 | `HideTutorial` | 29 |
| `StartleAndFlyAway` | 30 | `FlyAway` | 31 | `ClimbingTutorial` | 32 |
| `DashingTutorial` | 33 | `DreamJumpTutorial` | 34 | `SuperWallJumpTutorial` | 35 |
| `HyperJumpTutorial` | 36 | `WaitRoutine` | 37 | `Startle` | 38 |
| `FlyTo` | 39 | `MoveToNodesRoutine` | 40 | `WaitForLightningOffRoutine` | 41 |

`Modes.None` 无分支；`Modes.Sleeping` 不开协程，只 `Sprite.Play("sleep")` + `Facing = (Facings)1`。

### 5.2 每个 Mode 盯玩家的距离（全是不同的值）

| Mode | 条件 | 后果 |
|---|---|---|
| `FlyAway`(`WaitRoutine`) | `Abs(p.X - X) < 120` | `Caw()` |
| 同上 | `Distance(p.Center, Position) < 32` | `StartleAndFlyAway()` |
| `MoveToNodes` | `Distance(p.Center, Position) < 80` | 逐节点 `FlyTo(nodes[i], 0.6, true)` |
| 同上收尾 | `Y > Bounds.Top - 200` | 先 `Tag |= Tags.Persistent`；离场竖直加速度 `-60`（不是 `FlyAway` 的 `-120`） |
| `DreamJump` | 32px（或 `p.X > X`）收面板；再等 **24**px | 两档不同阈值，不是同一个圆 |
| `SuperWallJump` | `p.Y <= Y && p.X >= X + 144` | 才算“学会了”，否则循环重举 |
| `Climbing` | `p.State == 1 && p.Y > Y` | 翻面 `tutorial_note_flip_back`；`willEnd = !(p.Y > Y + 4)` |
| `HyperJump` | 无判定 | `yield 0.3` 后 `ShowTutorial(tut, caw:true)`，**永不收起** |
| `Dashing` | `p.X > Start.X-92 && p.Y ∈ (Start.Y-20, Start.Y-10)` | **不是教程**：`Scene.Add(new CS00_Ending(player, this, bridge))`；`Assists.Invincible` 换 `(-60, 0, +34)` |

### 5.3 喊叫 → 啄地 → 出文本（`SuperWallJumpTutorial`）
```
Facing = (Facings)1; yield 0.25;
tut1 = new BirdTutorialGui(this, (0,-16), GFX.Gui["hyperjump/tutorial00"], "DASH", new Vector2(0,-1));
tut2 = …"hyperjump/tutorial01"…, "JUMP";
loop {
  ShowTutorial(tut1, first);                     // first=true 时先 Caw()
  Sprite.Play("idleRarePeck", false, false);
  yield 2;  tut2 直接 Scale=1 硬切（不走展开动画）;  yield 2;
  HideTutorial();  yield 2;  first = false;
  if (p != null && p.Y <= Y && p.X >= X + 144) break;
}
StartleAndFlyAway();
```
两个关键细节：
- **`Caw()` 不是开场就响**：`Sprite.Play("croak")` 后 `do yield null while (Sprite.frame < 9)`，第 9 帧才 `Audio.Play("event:/game/general/bird_squawk")`。
- **`idleRarePeck` 是带权重的 goto**：`Sprites.xml` 里 `idle` 重复 4 次 : `peckRare` 1 次，平均每 5 次才真啄一下（`Monocle.Chooser`：按 `,` 切、支持 `值:权重`、`Random * TotalWeight` 逐项累加）。啄地音效挂在 `OnFrameChange`：`id` 为 `peck`/`peckRare` 且 **`frame == 6`** 时 `event:/game/general/bird_peck`。

### 5.4 `BirdTutorialGui` 的面板几何
```
Update:  Scale = Approach(Scale, Open ? 1 : 0, Engine.RawDeltaTime * 8)   // RawDeltaTime，时停不冻结
Render:  w = (Max(controlsWidth, infoWidth) + 64) * Scale
         h =  infoHeight + LineHeight + 32            // 高不乘 Scale
         x = pos.X - w/2 ;  y = pos.Y - h - 32
         Rect(x-6,y-6,w+12,h+12) 白；Rect(x,y,w,h) #061526；文字 #6179e2
         for (i = 0..36) ww = (73 - 2i) * Scale        // 37 行尾巴，ww > 12 时中间挖空
         内容只在 w > 3 时画；info 与控件的 scale 均为 (Scale, 1)
```
控件行（`params object[]`）四种类型，宽度取自 `UpdateControlsSize`：`string` 用文本宽**不加 padding**；`ButtonPrompt` 用 `Input.GuiButton(...)` 贴图宽 + `buttonPadding*2`（=16）；`Vector2` 固定 72 + 16，贴图 `controls/directions/<x>x<y>.png`；`MTexture` 用 `texture.Width`（如 `GFX.Gui["tinyarrow"]` 的 30）不加 padding。实测：图面板 `240 + 64 = 304`，文字面板 `h = 24 + 24 + 32 = 80`。另：`MTexture.Draw(pos, origin, color, scale)` 第二参是 **origin** 不是偏移，所以控件行以面板行为垂直中心。

### 5.5 素材库实际情况（本轮重点盘过）
- `Sprites.xml` L261-284 的 `bird` 图集共 **19 条动画**：`idle / idleRarePeck / croak / peck / peckRare / jump / fly / dash / fall / sleep / hover / hoverStressed / flyup / flyupIdle / flyupRoll / throw / hurt / recover / hold`。
- 磁盘 `Atlases/Gameplay/characters/bird/` 共 **125 帧**，被引用 120 帧，**剩下 8 帧连游戏自己都不用**（孤儿帧）：`crow27 crow28`（在 `peck 14-26` 与 `jump 29-35` 之间）、`crow36-41`（在 `jump` 与 `fall 42-44` 之间）。文件名大小写混杂且不可推：`crow00-48` 全小写，但 `FlyUp01-15 / HoverStressed00-05 / Hurt01-21 / Recover00-07 / Throw00-06 / Hold00-05` 大写，而 `flyup00 / hover00-01 / hurt00` 又是小写 —— 验证脚本现在逐帧比对磁盘真名。
- `Atlases/Gui/`：`hyperjump/tutorial00|01.png`（240×140）、`tinyarrow.png`（30×64）、`controls/keyboard/*.png`（80×80，宽键 120×80）、`controls/directions/*.png`（72×72）。键盘字形本身是**纯黑**，必须叠在 `base/base2` 白色键帽上（网页里离线合成）。
- `Atlases/Gameplay/particles/feather.png`（5×3）是 `BirdNPC.P_Feather` 的 `Source`（从 `Strawberry.P_WingsBurst` clone，只改 `Color = #639BFF`、`LifeMin = 2`），与玩家掉的 `Gameplay/feather` 无关；`Gui/feather/` 是 HUD 翼计量图标。
- 鸟叫／啄地音效**本轮已经补齐**：`blog-ui/celeste-sounds/Birds/` 里有 **72 个 wav**（FMOD 事件拆出来的变体），文件名 = 变体名；事件名全部来自 IL 的 `ldstr`，映射见 §8。注意仓库里**没有** `fusebox_hit_1/2` 的素材，所以电闸两击在本页是无声的（事件名照样照抄）。

### 5.6 与原版不同的三处（有意为之）
1. 原版飞走后 `Session.SetFlag("bird_fly_away_" + Level)` 永不回来；演示里 `remove()` 后 3.5s `respawn()`。`respawn()` 必须同时清掉该鸟名下的**所有** `BirdTutorialGui`（按 `entity` 扫），否则旧面板会永远挂在 HUD 层——这是上一轮实拍时发现的真实 bug，另需复位 `Persistent / Depth`（`MoveToNodesRoutine` 会置）。
2. `Coroutine(IEnumerator, Boolean)` 的第二参是 **`removeOnComplete`**（`SetMode` 各分支在 `newobj` 前一律 `ldc.i4.1`，跑完就把这个 Component 从实体上摘掉），**不是**「同一帧连跑好几步」；真正没复刻的是第三参 `updateUntilRender`（帧内不会追跑多次，`yield null` 永远等下一帧）。
3. 相机裁剪：原版 `OnFrameChange` 里的音效额外要求 `X ∈ (Camera.Left+64, Camera.Right-64)`，演示里整个场景就在一张屏内，未建模。

---

## 6. `FlingBird` —— 抓住 → 甩出去 → 逐节点 relocation → 等电网清空

它和 `BirdNPC` 是**两个不同的实体**：`BirdNPC` 只负责说话/举面板，`Modes.WaitForLightning` 在 IL 里根本没有分支。

### 6.1 `States` 与 `Update`

| State | 值 | `Update` 里干的事 |
|---|---|---|
| `Wait` | 0 | `p.X - X >= 100`（`SkipDist`）或 `SegmentsWaiting[segmentIndex] && LightningRemoved` → `Skip()` |
| `Fling` | 1 | `flingAccel > 0` 时 `flingSpeed = Approach(flingSpeed, flingTargetSpeed, flingAccel*dt)`；`Position += flingSpeed*dt` |
| `Move` | 2 | **空分支**：位移全在 `MoveOnCurve` 协程里直接写 `Position` |
| `WaitForLightningClear` | 3 | 房间内已无 `Lightning`，或 `X > Bounds.Right` → `Leaving` + `LeaveRoutine()` |
| `Leaving` | 4 | 无（由 `LeaveRoutine` 驱动） |

`Update` 的 switch **之前**：
```
if (State != States.Wait)
    Sprite.Position = Approach(Sprite.Position, spriteOffset, 32f * dt);   // 贴图回中
```
`Wait` 分支里那条「怕人」的算式（本体一动不动，只有贴图被推开）：
```
amount = Calc.ClampedMap(Vector2.Distance(p.Center, Position), 16f, 64f, 12f, 0f);
Sprite.Position = Approach(Sprite.Position,
    spriteOffset + Calc.SafeNormalize(p.Center - Position) * amount, 32f * dt);
```
★ switch **之后没有任何代码**（四个分支都以 `ret` 收尾），所以调试 HUD 只能放在 switch 之前。

### 6.2 抓取判定在 Player 那一侧

全程序集 `PlayerCollider::Check` 的唯一调用点是 `Player::orig_Update` IL_1110..IL_11b6：
```
if (!Dead && State != 21) {
    Collider previous = Collider;
    Collider = hurtbox;                                  // ★ 临时换成受击盒
    foreach (pc in Scene.Tracker.GetComponents<PlayerCollider>())
        if (pc.Check(this)) { … }
    if (Collider == hurtbox) Collider = previous;
}
```
- 撞鸟用的是 **`normalHurtbox = Hitbox(8, 9, -4, -11)`**（中心 = `Position + (0, -4.5)`），**不是** `normalHitbox(8, 11, -4, -11)`。
- 遍历由 Player 每帧驱动，`PlayerCollider` 自己**没有 Update**；`FlingBird` 的两个 collider 参数都是 `null` ⇒ 走「直接 `p.CollideCheck(entity)`」分支，命中半径是鸟的 `Circle(16, 0, 0)`。

### 6.3 `OnPlayer` 与 `DoFlingRoutine` 时间线
```
OnPlayer(p):                                        // 只在 Wait 生效，返回值决定能不能抱
  if (State == Wait && p.DoFlingBird(this)) {
      flingSpeed = p.Speed * 0.4f; flingSpeed.Y = 120f;          // 先跟着玩家往下沉
      flingTargetSpeed = Zero; flingAccel = 1000f;
      p.Speed = Zero; State = Fling;
      Add(new Coroutine(DoFlingRoutine(p), true));               // ★ 协程挂在鸟自己身上
      Audio.Play("event:/new_content/game/10_farewell/bird_throw", Center);
  }

DoFlingRoutine:
  camPt = p.Position - Camera.Position；X 夹到 [145, 215]、Y 夹到 [85, 95]
  Add(Coroutine(level.ZoomTo(camPt, 1.1f, 0.2f), true))         // 焦点与 ZoomTarget 瞬变，只有缩放值走 SineInOut
  Engine.TimeRate = 0.8f;  Input.Rumble(0, 1);
  while (flingSpeed != Zero) yield null;                        // 等「往下沉」收住
  Sprite.Play("throw"); Sprite.Scale.X = 1f;
  flingSpeed = (-140f, 140f); target = Zero; accel = 1400f;      // 先反着弹一下
yield 0.1; Celeste.Freeze(0.05f); target = FlingSpeed; accel = 6000f; yield 0.1;
  Input.Rumble(2, 1); Engine.TimeRate = 1f; level.Shake(0.3f);
  Add(Coroutine(level.ZoomBack(0.1f), true));
  p.FinishFlingBird(); target = Zero; accel = 4000f;
yield 0.3; Add(Coroutine(MoveRoutine(), true));
```
Player 侧：`DoFlingBird` 里 `State = 24`（并丢下手里拿的东西），抱着的整段时间每帧被拎到
`(bird.X, bird.Y + 8 + Collider.Height)` = 鸟下方 **19px**，定速 **250** × dt；
`FinishFlingBird()` 把速度交还成 **`(380, -100)`**（`FlingBird.FlingSpeed` 是 `static`），同时 `AutoJump = true`、`ForceMoveX = 1`、`ForceMoveXTimer = 0.2`、`VarJumpTimer = Speed.Y / 0.2`。

### 6.4 `MoveOnCurve` / `MoveRoutine` / `LeaveRoutine`
```
MoveRoutine: Sprite.Play("fly"); Sprite.Scale.X = 1f;
             Audio.Play("…/bird_relocate");
             nodes 成对消费（i += 2：i 是控制点、i+1 是落点）

MoveOnCurve(from, anchor, to):
  curve    = new SimpleCurve(from, to, anchor)              // 参数序是 (begin, end, control)
  duration = curve.GetLengthParametric(32) / 500f            // 500 px/s，比 BirdPath 的 150 快得多
  t 从 0.016f 起、每帧 += dt / duration
  Position = Calc.Floor(curve.GetPoint(t))
  rotation = Calc.Angle(GetPoint(max(0, t - 0.05f)), GetPoint(min(1, t + 0.05f)))  // 前后各 5% 的割线当切线
  Scale    = (1.25f, 0.7f)                                    // 飞行时被压扁
  与上一节 > 32px 时 TrailManager.Add(this, #639bff, 1)       // 与 BirdPath 同色，因为同一个字段

LeaveRoutine: 飞向 Bounds.Right + 32，途中继续 bird_relocate，末尾 RemoveSelf()
```

### 6.5 时间层的三条硬规则（`Engine::Update` IL_009a..IL_0183）
1. `DeltaTime = RawDeltaTime × TimeRate × TimeRateB × GetTimeRateComponentMultiplier(恒 1)`，且在**帧首**算 ⇒ `TimeRate = 0.8` 要到**下一帧**才生效（实测：`FinishFlingBird` 交还 380 的那一帧，`NormalUpdate` 仍按 0.8 结算，水平只掉 `400×0.65×(1/60×0.8) = 3.47`）。
2. `Entities.UpdateLists()` 排在 freeze 判定**之前** ⇒ 定格那几帧 `Add` / `Remove` 照样提交，只是没人 `Update`。
3. `FreezeTimer > 0` 时整帧只跑 `scene.FreezeFrameUpdate()`，而它只遍历 `this[TagsExt.FreezeFrameUpdate]`；全程序集搜这个标签只有 **4 个**引用点（`Engine::Update` / `Scene::` / `Level::` / `Tags::Initialize`），**没有任何实体给它赋过值** ⇒ `Freeze(0.05)` 的三帧里整个场景**一个 Update 都不跑**：`TimeActive` 不推进、震动既不重算也不衰减、flash 不回落、协程不推进。倒计时用的是 **`RawDeltaTime`**。

入场层也有个反直觉点（`EntityList::Add` / `UpdateLists` IL_0037..IL_006d）：是「**加一个、立即 `Awake` 一个**」，不是一批批；而 `FlingBird::Awake` 的合并只在 `all[0] === this` 那只身上发生 ⇒ **必须让右边那只先入场**，最左那只 `Awake` 时才看得见它，两段才会并成一条链。

---

## 7. `Lightning` 与 `LightningBreakerBox` —— 电网与它的电源

### 7.1 `Lightning`：一根电网
```
Collider       = Hitbox(VisualWidth - 2, VisualHeight - 2, 1, 1)   // 比视觉小 2px、内缩 1px
PlayerCollider = PlayerCollider(OnPlayer, null, null)
toggleOffset   = Calc.NextFloat()                                  // 每根相位不同，不会整屏一起闪
有 nodes 就挂 MoveRoutine（SineInOut 来回，永不停）
Update:  base.Update() 在**最后**；Collidable 时每 OnInterval(0.25, offset) 复查，
         不 Collidable 时提速到 0.05
InView:  用 Camera（不是 viewport）的 320×180 ± 16px；Visible = Collidable = InView()
OnPlayer: 非消散中且 !Assists.Invincible → p.Die(UnitX * (Sign(p.X - X) 或 -1))
```
两种「闪」是两套数字：`PulseRoutine` 把 `Glitch.Value` 拉 **0.075**、`Bloom.Strength` 拉 **1.2**；`BreakRoutine` 拉 **0.15** / **1.5**。

`<RemoveRoutine>d__21`：屏幕外的先 `RemoveSelf` → 停氛围音、冻结种子 → `t += dt*4` 爬到 1（`SetBreakValue`）
→ `level.Shake(0.3)` → 倒序逐根 `Shatter`（8px 网格、起点 4，发射 `P_Shatter`）→ `t += dt*8` 回落 → 全部 `RemoveSelf`
→ `Scene.Tracker.FindFirst<FlingBird>().LightningRemoved = true`（★ 只标**第一只**）。

`P_Shatter`：色 `#B9FEFE`/`#FFF263`、`ColorMode 2`、`FadeMode 2`、`Size 1`、`Speed 5~30`、`Acceleration (0, 20)`、`Direction -π/2 ± π/4`、`Life 0.8~2`。

### 7.2 `LightningBreakerBox`：两下冲刺砸开电闸
原版是 Farewell 里那个 **32×32 的 Solid**，`health = 2`。砸开时它调用 `Lightning::RemoveRoutine` —— 所以它也是「整屏电网是怎么消失的」唯一入口。

```
.ctor(Vector2 position, bool flipX)   // IL_0000..0122
  base(position, 32f, 32f, true)；SurfaceSoundIndex = 9
  start  = Position                        // 快照，Update 每帧从它重算，只读
  sprite = SpriteBank.Create("breakerBox")；Sprite.Position = Size/2 = (16,16)；FlipX = 实参
  SineWave(0.5f, 0f) + Wiggler.Create(1f, 0.5f, null, false, false)(StartZero=false) + Shaker(false, null)
  OnDashCollide = Dashed
.ctor(EntityData, Vector2)  只读五个属性：flipX / flag / music / music_progress / music_session
Added: flag && Session.GetFlag("disable_lightning") → RemoveSelf
Awake: Position ∓ UnitY / UnitX 各探一次 Spikes（spikesUp/Down/Left/Right）
```
`Dashed(Player p, Vector2 dir)`（IL_0000..01c9）：
```
若该方向贴着尖刺（Invincible 关闭时）→ 返回 NormalOverride(1)     // 让玩家被尖刺扎死，而不是砸箱子
DirectionalShake(dir, 0.3f)
Sprite.Scale = (1 + |dir.Y|*0.4 - |dir.X|*0.4, 1 + |dir.X|*0.4 - |dir.Y|*0.4)
   ⇒ 正面撞压成 (0.6, 1.4)、侧面撞拉成 (1.4, 0.6)
health -= 1
health > 0:  firstHitSfx = new SoundSource("…/fusebox_hit_1") + Add；Celeste.Freeze(0.1f)
             ShakeCounter = 0.2f；Shaker.On = true；bounceDir = dir；Wiggler.Start()
             SmashParticles = true；Pulse()；Input.Rumble(1, 1)
else:        firstHitSfx.Stop(true)；Audio.Play("…/fusebox_hit_2", Position)；Celeste.Freeze(0.2f)
             p.RefillDash()（★ 砸开电闸顺手把冲刺还给玩家）；Break()；Input.Rumble(2, 2)
             SmashParticles(Perpendicular(dir)) 与 -(…)
return Rebound(0)                                          // IL_01c9 的 ldc.i4.0 是唯一出口
```
`Break()`（IL_0000..0174，顺序即 IL 顺序）：`RumbleTrigger.ManuallyTrigger(Center.X, 1.2f)` → `Tag = Persistent`
→ `ShakeCounter = 0` → `Shaker.On = false` → `Sprite.Play("break")` → **`Collidable = false`** → `DestroyStaticMovers()`
→ `flag` 则 `Session.SetFlag("disable_lightning", true)` → music 三支（`AudioState.Music.Event` / `SetProgress` / `Apply`）
→ `pulseRoutine.Active = false` → `Add(new Coroutine(Lightning::RemoveRoutine(Level, RemoveSelf), true))`。

`Pulse()`：**不是**自己闪，而是 `Add(new Coroutine(Lightning::PulseRoutine(Level), true))`，协程照样挂在箱子自己身上。

`Update()`（IL_0000..022f，**`base.Update()` 在第一行**）：
```
makeSparks && OnInterval(0.03f) → Emit(P_Sparks, 1, Center, One * 12f)
ShakeCounter > 0: 减 DeltaTime；≤ 0 那一帧 → Shaker.On = false、Sprite.Scale = One * 1.2f、Sprite.Play("open")
Collidable: sink = Approach(sink, Rider ? 1 : 0, 2f * dt)；SineWave.Rate = Lerp(1f, 0.5f, sink)
            at = start 的**局部副本**
            at.Y += sink * 6f + sine.Value * Lerp(4f, 2f, sink)
            at  += (bounce.Value * bounceDir) * 12f          // Wiggler 弹动，方向就是被撞的方向
            MoveToX/MoveToY(at)；SmashParticles 标志一置位就发两簇
末尾: Scale 两分量各自 Approach(…, 1f, 4f*dt)；LiftSpeed = Zero
```
★ 关键纠正：`at.Y` 改的是 **`start` 的局部副本**（IL_0105..010b 先 `stloc.1` 拷贝），不是 `this.start` 的字段地址 ⇒ `start` 不被污染，`sink` 与 `sine` 每帧从快照重算，**不会累积漂移**。

`Render()`：`Sprite.Position` 临时 `+= Shaker.Value`，画完还原 ⇒ 抖动只动贴图、不动判定框。

`SmashParticles(dir)`：四向各一套锚点/抖动范围/角度，`count` 统一 `+2`：

| dir | angle | at | range | count |
|---|---|---|---|---|
| `+UnitX` | `0` | `CenterRight - UnitX*12` | `UnitY*(H-6)*0.5` | `(32/8)*4 + 2 = 18` |
| `-UnitX` | `π` | `CenterLeft + UnitX*12` | `UnitY*(H-6)*0.5` | 18 |
| `+UnitY` | `π/2` | `BottomCenter - UnitY*12` | `UnitX*(W-6)*0.5` | 18 |
| 其余（向上） | `-π/2` | `TopCenter + UnitY*12` | `UnitX*(W-6)*0.5` | 18 |

`P_Smash`：色 `#FFFC75`/`#6BFFFF`、`RotationMode 2`（跟着速度转）、`Size 0.5 ±0.2`、`Life 0.6~1.2`、`Speed 50~150`、`Multiplier 0.2`；
`P_Sparks`：同色、`Size 0.4 ±0.1`、`Life **0.1~0.2**`、`Speed 30~40`、`Multiplier 0.8` ⇒ 寿命极短，稳态同屏只有 3~6 粒（**不会**无限叠加）。

### 7.3 落地时与原版不同的地方
1. 原版 32×32，网页按 `vs(32) = 96` 落地；但 `count / 12 / (H-6)*0.5` 全是**虚拟像素与虚拟尺寸**，这一段必须用常量 32 算（拿 96 算会变成 50 粒）。
2. **`new SoundSource(event)` 这个重载的 ctor 体在语料里零命中**（68 个文件搜不到 `TYPE SoundSource`），但第二击对**同一个源**直接 `Stop(true)`、两击之间没有任何 `Play` ⇒ 唯一自洽的解释是「构造即播放」。网页照这个解释实现，并标为**推断**；因为它不是 `Audio.Play`，所以右下角 SFX 日志里只有 `hit_2`。
3. 音乐三支（`SetMusic` / `SetMusicParam` / `CurrentMusicEventInstance`）整段跳过 —— 网页没有 `AudioState.Music` 这层状态机。
4. `RumbleTrigger` / `Input.Rumble` 只做页内提示（没有手柄，不伪造震动曲线）。
5. `Awake` 的四向 `Spikes` 探测照写，但网页没有尖刺实体 ⇒ 四个字段恒 `false`、`NormalOverride` 那四支不可达。`Session` 用本地表 `sessionFlags` 替身，只有 `disable_lightning` 一个键。

---

## 8. 音效：事件名 → `celeste-sounds/Birds` 的具体变体

`blog-ui/celeste-sounds/Birds/` 的 **72 个 wav** 就是 FMOD 事件拆出来的变体，文件名 = 变体名；网页用一张 `BIRD_SFX` 表接回去，音量只由「到玩家的距离」决定。

| 事件（`ldstr` 原字符串） | 宿主方法 | 播放方式 |
|---|---|---|
| `event:/game/general/birdbaby_tweet_loop` | `FlutterBird::.ctor` IL_00a4..00ba | `SoundSource` 循环 |
| `event:/game/general/birdbaby_flyaway` | `FlutterBird::FlyAway` IL_001c..0032 | `SoundSource` |
| `event:/game/general/birdbaby_hop` | `<IdleRoutine>d__9` IL_012b..0136 | `Audio.Play` |
| `event:/game/general/bird_peck` | `BirdNPC::<.ctor>b__20_0`（frame 6） | `Audio.Play` |
| `event:/game/general/bird_squawk` | `<Caw>d__27`（frame 9） | `Audio.Play` |
| `event:/game/general/bird_startle` | `<StartleAndFlyAway>d__30` | `Audio.Play` |
| `event:/new_content/game/10_farewell/bird_startle` | `<MoveToNodesRoutine>d__40` | `Audio.Play` |
| `event:/new_content/game/10_farewell/bird_wingflap` | `BirdNPC::FlapSfxCheck` | `Audio.Play` |
| `event:/new_content/game/10_farewell/bird_relocate` | `<FlyTo>d__39` / `<MoveRoutine>d__24` | `Audio.Play` |
| `event:/new_content/game/10_farewell/bird_throw` | `FlingBird::OnPlayer` | `Audio.Play` |
| `event:/new_content/game/10_farewell/fusebox_hit_1` | `LightningBreakerBox::Dashed`（第一击） | `SoundSource`（★ 推断构造即播） |
| `event:/new_content/game/10_farewell/fusebox_hit_2` | `LightningBreakerBox::Dashed`（第二击） | `Audio.Play` |
| `event:/game/general/bird_in` / `bird_land_dirt` | `CS00_Ending::<Cutscene>d__7` | 已备料未用 |

三个 FlutterBird 音的时序（待机鸟的「生命感」全在这三行）：
```
.ctor        tweetingSfx = new SoundSource() → Add → Play(tweet_loop)   // 出生就在啾，与协程无关
IdleRoutine  每跳一次（等完 delay = 0.25 + NextFloat(1)）先 Audio.Play(hop) 再算 target
FlyAway      先 tweetingSfx.Stop(**true**)（Stop 在 flyingAway = true **之前**！）再 flyawaySfx.Play(flyaway)
```
`SoundSource.Play(path, parameter, value)` 的第三参是**事件参数值**不是音量（IL 恒 `ldnull` + `ldc.r4 0f`），所以网页也不拿它当音量；`Stop(allowFadeOut: true)` 走 120ms 线性淡出。

★ 有意偏差（全在表现层，静态/运行时断言都不受影响）：bank 里的变体权重没有产物 ⇒ 同名变体等概率随机；3D 衰减参数（min/max distance、curve）没有产物 ⇒ 离玩家 520px 线性到 0.12、循环源每帧刷新；循环源再乘 0.5（6 只待机鸟同时按 1.0 啾会糊成一片）；事件内的 pitch / ducking 轨道没有产物 ⇒ 一律 1.0 倍速；浏览器禁止无手势自动播放 ⇒ 首次 `pointerdown` / `keydown` 把被拦下的源重新 `play`；`BirdPath` 的 `bird_flyuproll` 只有 `new SoundSource(event)` + `Add`、**没有 `Play` 调用证据** ⇒ 网页不接。

---

## 9. 鸟类实体清单与覆盖状态

| 类型 | 角色线索 | 已提取的运动常量 | 状态 |
|---|---|---|---|
| `BirdNPC` | 教学鸟（`Actor` 子类，11 种 `Modes`，带 `StaticMover`） | 已展开，见 §5 | ✅ 本轮完成 |
| `FlingBird` | 抓住后被甩出去的鸟 | `MoveOnCurve`: `SimpleCurve` + `500, 0.05, 0.016, 1.25, 0.7, 32`；`DoFlingRoutine`: `6000/4000` 抛掷加速度、`Input.Rumble`、`Camera.Shake` | ✅ 已展开，见 §6 |
| `Lightning` / `LightningBreakerBox` | 电网与它的电源（Farewell） | 已展开，见 §7 | ✅ 本轮完成 |
| `FlingBirdIntro` | Farewell 开场抓住玩家的鸟 | `FlyTo`: `0.3, 8, 2`；`DoGrabbingRoutine`: `Freeze` + `Shake` + 大量 `Vector2` 累加 | 方法体未展开（只参与取证，未落页） |
| `CS10_CatchTheBird` / `MissTheBird` / `FreeBird` / `HubIntro.Bird` | 结局演出 | 演出型，不是运动模型 | 未展开 |
| `ForsakenCitySatellite.CodeBird` | 彩蛋 | `AimlessFlightRoutine` | 未展开 |

## 10. 结论边界

- 全部为**静态** IL 证据：没有 attach 运行中的游戏，没有验证帧序与浮点累积误差；`Engine.DeltaTime` 的实际取值、`OnInterval` 的相位都来自代码语义而非观测。
- `Depth` 的 `-9999 / -10001` 排序含义（越负越靠前）是 Monocle 约定推断，未从渲染代码验证。
- 目标是**已被 Everest 补丁**的安装：BirdPath 的 §2.2/§2.4 是补丁后的形态；纯 vanilla 需要去掉 `inVanilla / angleFix` 分支。
- 反编译产物不是官方源码，常量与分支可信，命名（如 `p / delay / to`）是按 C# 习惯名还原的。
- §7 里的 `SoundSource(string)`「构造即播放」是**推断**（ctor 体没有产物，依据是两击对同一源 `Play`/`Stop` 的交错关系），网页已按此实现并在正文标注。
- 网页把虚拟单位统一乘了 `vs(1) = 3`（32×32 → 96×96），所以§7.2 的 `12 / (H-6)*0.5 / count` 仍按常量 32 计算；改倍率不会改变粒子粒数。
