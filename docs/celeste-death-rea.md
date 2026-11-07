# Celeste · Madeline 死亡与重生：REA 取证

> 取证对象：本机 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`（FNA/MonoGame C#）。
> 方法：ILSpyCmd 定向反编译 + 元数据核对；只读游戏安装目录，未做任何修改。
> 反编译源码与中间产物：`%TEMP%\celeste-rea\`（`Player.cs` / `PlayerDeadBody.cs` / `DeathEffect.cs` / `Level.cs` / `Spikes.cs` / `Session.cs` / `FadeWipe.cs` / `ScreenWipe.cs`；IL 转储在同目录 `death\`）。
> 行号均指上述反编译文件的行号（ILSpyCmd 输出，稳定可复查）。
> FMOD 事件内部参数（毫秒、曲线、bank 内容）**不在托管代码里**；代码只给事件路径与播放时机，凡是"事件资源定义"都会注明。

---

## 0. 一句话结论

| 问题 | 结论 |
|---|---|
| 怎么进入死亡 | `Player.Die()` → `orig_Die()`：置 `Dead / Speed=Zero / StateMachine.Locked / Collidable=false`，从场景移除玩家，`Scene.Add(new PlayerDeadBody(...))`。**不是切状态机状态，是换实体**。 |
| 尸体是物理体吗 | **不是**。`PlayerDeadBody` 没有重力、没有撞墙反弹、没有落地音效；尸体沿 `bounce * 24px` 的 0.5s `CubeOut` Tween 甩出，0.375s 时停表。 |
| "死亡粒子"是什么 | **不是 Particles 系统**，是 `DeathEffect`：8 条 `characters/player/hair00` 发丝，半径 `CubeOut(t)*24`，按 10% 进度在"发色 / 白色"间跳变，每条配 4 个 ±1px 黑描边副本。 |
| 有没有 "Dead" 提示 | **没有**。原作没有 Dead 文本；黑屏来自 `Level.DoScreenWipe(false, Reload)` 的 FadeWipe。 |
| 时间轴 | 方向死亡：0.05s 冻结 → 1 帧 → 0.375s 甩出 → 0.5421s 发丝爆散 → 0.5s 黑屏；虚空死亡跳过前两段。 |
| `Engine.TimeRate` | 死亡/重生的托管代码**没有改 TimeRate**；只有 `Level.Reload` 收尾把 `TimeRate` 复位为 1。冻结用的是 `Celeste.Freeze(0.05f)`。 |
| 镜头 | 只有两次 `Level.Shake()`（默认 0.3s），无缩放、无延迟跟随；重载时相机直接吸附到重生点。 |
| 重生有无敌帧 | **没有**。重生是"新 Player 实体 + StIntroRespawn(14) 0.6s 入场动画"，期间状态机被锁？——不，14 状态自身可操作在动画结束后才回到 0。 |

---

## 1. 死亡入口

### 1.1 公开入口：`Celeste.Player.Die(Vector2, bool, bool)`（`Player.cs` L2157-L2186）

```csharp
public PlayerDeadBody Die(Vector2 direction, bool evenIfInvincible = false,
                          bool registerDeathInStats = true)
{
    Level level = Scene as Level;
    PlayerDeadBody body = orig_Die(direction, evenIfInvincible, registerDeathInStats);
    if (body != null) { Everest.Events.Player.Die(this); /* ...防软锁计时... */ }
```

`Die` 只是 Everest 事件 + 防软锁，真正逻辑在 `orig_Die`。

### 1.2 实际流程：`orig_Die`（`Player.cs` L6535-L6588）

执行顺序（逐行）：

| 步骤 | 代码 | 行 |
|---|---|---|
| 无敌辅助直接返回 | `bool flag = !evenIfInvincible && SaveData.Instance.Assists.Invincible;` | L6538 |
| 已死 / 反射坠落中不重复死 | `if (!Dead && !flag && StateMachine.State != 18)`；18 = `StReflectionFall` | L6539 |
| 停墙滑音 | `Stop(wallSlideSfx);` | L6541 |
| 统计 | `session.Deaths++; session.DeathsInCurrentLevel++; SaveData.Instance.AddDeath(session.Area);` | L6542-L6546 |
| 找金草莓 | 遍历 `Leader.Followers` 找 `Strawberry.Golden && !Winged` | L6548-L6555 |
| 标记死亡 | `Dead = true;` | L6556 |
| 丢跟随者 | `Leader.LoseFollowers();` | L6557 |
| 渲染层级 | `Depth = -1000000;` | L6558 |
| 清速度 | `Speed = Vector2.Zero;` | L6559 |
| 锁状态机 | `StateMachine.Locked = true;` | L6560 |
| 关碰撞 | `Collidable = false;` | L6561 |
| 放手 | `Drop();` | L6562 |
| 通知 booster | `if (LastBooster != null) LastBooster.PlayerDied();` | L6563-L6566 |
| 退出过场 | `level.InCutscene = false;` | L6567 |
| 震屏 0.3s | `level.Shake();`（`Level.Shake(float time = 0.3f)`，`Level.cs` L1692） | L6568 |
| 手柄轻震 | `Input.Rumble(RumbleStrength.Light, RumbleLength.Medium);` | L6569 |
| 生成尸体 | `new PlayerDeadBody(this, direction)` | L6570 |
| 金草莓分支 | `HasGolden = true; DeathAction = ... LevelExit(GoldenBerryRestart ...)` | L6571-L6581 |
| 换实体 | `Scene.Add(playerDeadBody); Scene.Remove(this);` | L6582-L6583 |

要点：

- **死后不进某个特殊状态**；`StateMachine.Locked = true` 后玩家实体被移除，画面由 `PlayerDeadBody` 接管。
- **没有 `Stunned` 赋值**（全文件 grep 无 `Stunned` 在 Die 路径）；死亡等价于 `Speed=Zero + Collidable=false + 移除实体`。
- `Simulate` 不再跑，因为实体已 `Remove`。

### 1.3 哪些情况算死

| 触发 | 位置 | 方向参数 |
|---|---|---|
| 尖刺 | `Spikes.OnCollide`（`Spikes.cs` L240-L268） | 上刺：`Speed.Y >= 0 && Bottom <= Bottom` → `Die(0,-1)`；下刺：`Speed.Y <= 0` → `Die(0,1)`；左刺：`Speed.X >= 0` → `Die(-1,0)`；右刺：`Speed.X <= 0` → `Die(1,0)` |
| 掉出房间底 | `Level.EnforceBounds`（`Level.cs` L1975-L1978）：`player.Top > bounds.Bottom + 4` | `Die(Vector2.Zero)` |
| 锁定相机越出屏幕底 | 同函数 L1950-L1960 | `Die(Vector2.Zero)`（无敌辅助时改为贴底回弹） |
| 反射坠落过场 | `StateMachine.State == 18` 时 `orig_Die` 直接返回 | — |

**没有"被压死"致死机制**：`Player.cs` 全文件无 `Crush`/挤压死亡逻辑；被 Solid 推挤只会位移/卡住，不会 Die。

---

## 2. 死亡演出（尸体本体）

`Celeste.PlayerDeadBody`（`PlayerDeadBody.cs`）

### 2.1 构造与朝向（L37-L76）

```csharp
Depth = -1000000;              // L40，盖在最上层
Position = player.Position;    // L43
Add(hair = player.Hair);       // L44 发丝组件直接挪到尸体
Add(sprite = player.Sprite);   // L45
sprite.Color = Color.White;    // L47
initialHairColor = hair.Color; // L48
bounce = direction;            // L49
Add(new Coroutine(DeathRoutine()));
```

`Awake`（L54-L76）：
- `bounce == Zero` → **不换动画**，沿用玩家当前动画帧（虚空死亡常见）。
- `|bounce.X| > |bounce.Y|` → 播 `deadside`，`facing = -Sign(bounce.X)`。
- 否则把 `bounce` 的角度向 `(-Facing, 0)` 收 0.5 rad（`AngleApproach`），`bounce.Y < 0` → `deadup`，否则 `deaddown`。

动画资源：`characters/player/death_h`（`Sprites.xml` 内容资源，非托管代码；`death_h` 帧表 0-12、delay 0.02s，仓库 `blog-ui/Atlases/Gameplay/characters/player/` 有 `death_h00..14.png` 共 15 张贴图）。

### 2.2 甩出：`DeathRoutine`（L78-L117）

```csharp
if (bounce != Vector2.Zero)
{
    Audio.Play("event:/char/madeline/predeath", Position);   // L83
    scale = 1.5f;                                            // L84
    Celeste.Freeze(0.05f);                                   // L85
    yield return null;                                       // L86  冻结后再等 1 帧
    Vector2 from = Position;                                 // L87
    Vector2 to = from + bounce * 24f;                        // L88
    Tween tween = Tween.Create(Tween.TweenMode.Oneshot,
                               Ease.CubeOut, 0.5f, start: true);// L89
    tween.OnUpdate = t => {
        Position = from + (to - from) * t.Eased;             // L93
        scale = 1.5f - t.Eased * 0.5f;                       // L94  1.5 → 1.0
        sprite.Rotation = (float)(Math.Floor(t.Eased * 4f) * 6.2831855); // L95 4 次 90° 跳转
    };
    yield return tween.Duration * 0.75f;                     // L97  0.375s 停表
    tween.Stop();
}
Position += Vector2.UnitY * -5f;                             // L100 上移 5px
level.Displacement.AddBurst(Position, 0.3f, 0f, 80f);        // L101
level.Shake();                                               // L102 0.3s
Input.Rumble(RumbleStrength.Strong, RumbleLength.Long);      // L103
Audio.Play(HasGolden ? "event:/new_content/char/madeline/death_golden"
                     : "event:/char/madeline/death", Position);// L104
deathEffect = new DeathEffect(initialHairColor, Center - Position); // L105
deathEffect.OnUpdate = f => { light.Alpha = 1f - f; };       // L106-L109
Add(deathEffect);                                            // L110
yield return deathEffect.Duration * 0.65f;                   // L111 0.5421s
if (ActionDelay > 0f) yield return ActionDelay;              // L112-L115
End();                                                       // L116
```

**尸体的"初速"**：并不是速度，终点 = 位置 + 方向 × 24，0.5s `CubeOut` 插值，0.375s 处停止（等于走了 75% 的缓动，约 约 20.6px/方向）。虚空死亡（`bounce=0`）完全跳过这段，立即进入 L100。

### 2.3 "粒子"：`DeathEffect`（`DeathEffect.cs`）

- `Duration = 0.834f`（L17）；`Update` 每帧 `Percent = Approach(Percent,1, DeltaTime/Duration)`（L45）。
- 绘制 `Draw(position, color, ease)`（L61-L79）：
  - 颜色：`floor(ease*10) % 2 == 0 ? color : Color.White`（L63）→ 每 10% 进度在发色/白之间跳。
  - 尺寸：`num = ease < 0.5 ? 0.5 + ease : CubeOut(1 - (ease - 0.5) * 2)`（L65）→ 0.5 → 1 → 0。
  - 8 条（`for i < 8`，L66）：角度 `(i/8 + ease*0.25) * 2π`，半径 `CubeOut(ease) * 24`（L68）。
  - 每条先画 4 个黑描边副本，偏移 `(-1,0) / (1,0) / (0,-1) / (0,1)`（L69-L72），再画彩色本体（L77）。
  - 贴图 `GFX.Game["characters/player/hair00"]`（L64）。
- **不是 ParticleType**，无发射数量/初速/生命字段；`hair00.png` 是 10×10 单图。

### 2.4 尸体更新与渲染

- `Update`（L134-L143）：确认键可提前结束；`hair.Color = CurrentAnimationFrame == 0 ? White : initialHairColor`（L142）。
- `Render`（L145-L159）：`deathEffect == null` 时画 hair+sprite（`sprite.Scale.X = facing*scale`, `Scale.Y = scale`，L150-L151）；否则只画 `deathEffect`。
- 无拖尾：尸体的 DashTrail 不接管（`TrailManager` 里的旧残影按自己的生命周期消失）。

---

## 3. 时间轴（毫秒级）

以 `Die()` 被调用的那一刻为 t=0，60fps（1 帧 ≈ 16.7ms）。

### 3.1 方向死亡（尖刺 / 带方向）

| t | 事件 | 出处 |
|---|---|---|
| 0 | `predeath` 音效；`scale=1.5`；`Celeste.Freeze(0.05)` | PDB L83-L85 |
| 0 ~ 50ms | 全场冻结（约 3 帧），尸体不动 | PDB L85 |
| 50ms | 冻结结束；`yield return null` 再等 1 帧 | PDB L86 |
| ≈ 67ms | Tween 开始：位置 → +方向×24，`CubeOut`，同时 1.5→1.0 缩放、4 次 90° 旋转 | PDB L89-L96 |
| ≈ 442ms | Tween 在 75%（=375ms）处 `Stop()` | PDB L97-L98 |
| 442ms | `MoveV(-5)`；`Displacement.AddBurst(0.3, 0, 80)`；`Level.Shake()`；强震；`death` 音效；`DeathEffect` 生成 | PDB L100-L110 |
| 442ms ~ 984ms | DeathEffect 播放（总时长 0.834s，但只等到 65%） | PDB L111 |
| ≈ 984ms | `End()` → `Level.DoScreenWipe(false, Reload)`；FadeWipe 0.5s 渐黑 | PDB L116-L131；`ScreenWipe.cs` L48 |
| ≈ 1484ms | 黑屏完成 → `Level.Reload()` → `LoadLevel(IntroTypes.Respawn)` | `Level.cs` L657 |
| 重载帧 | 新 Player 放在 `Session.RespawnPoint`，相机直接吸附 | `Level.cs` L3688-L3700、L3706 |
| 重载帧 | 触发 `StIntroRespawn(14)`：`revive` 音效 + 0.6s Tween；同时 `DoScreenWipe(true)` 0.5s 淡入 | `Player.cs` L5454-L5478；`Level.cs` L3720 |
| ≈ +600ms | IntroRespawn 结束 → `StateMachine.State = 0`（可操作），Sprite 压成 `(1.5, 0.5)` | `Player.cs` L5470-L5477 |

**从 Die 到可操作 ≈ 1.48s + 重载耗时 + 0.6s ≈ 2.0 ~ 2.1s。**

### 3.2 虚空死亡（`bounce = Zero`）

| t | 事件 |
|---|---|
| 0 | 无 predeath、无冻结、无 Tween（尸体保持当前动画帧） |
| 0 | 直接 `MoveV(-5)` + `AddBurst(0.3,0,80)` + `Shake` + 强震 + `death` 音效 + `DeathEffect` |
| 542.1ms | `End()` → 0.5s 黑屏 |
| 1042.1ms | Reload → 0.6s IntroRespawn（+0.5s 淡入） |
| ≈ 1.64s | 可操作 |

### 3.3 关于 `Engine.TimeRate`

- `Player.cs` / `PlayerDeadBody.cs` 全文 grep **无 `TimeRate` 写入**（`Player.cs` L3543 只是读 `TimeRate > 0.25` 做判定）。
- 唯一相关：`Level.Reload` 收尾 `Engine.TimeRate = 1f;`（`Level.cs` L646）——复位上一关可能残留的变速，不是死亡演出。
- 冻结是 `Celeste.Freeze(0.05f)`（全局暂停计时器），不是慢动作。

---

## 4. 镜头

| 项 | 结论 | 出处 |
|---|---|---|
| 死亡当帧 | `level.Shake()`，默认 0.3s | `Player.cs` L6568；`Level.cs` L1692 |
| 爆散当帧 | 再次 `level.Shake()`，0.3s（与第一发取 max） | `PlayerDeadBody.cs` L102 |
| 震动实现 | 每 0.04s 取一次：`amp = ceil(shakeTimer * 10)`，X/Y 各在 `[-amp, +amp]` 随机整数 | `Level.cs` L1115-L1122 |
| 缩放 | **无**。死亡/重生流程里没有任何 `ZoomTo/ZoomSnap` | — |
| 延迟跟随 | **无**。玩家实体被移除后相机不再跟随；Reload 时 `Camera.Position = GetFullCameraTargetAt(player, player.Position)` 直接吸附 | `Level.cs` L3706 |
| 重生淡入 | 0.5s `DoScreenWipe(wipeIn: true)`；FadeWipe 用 `CubeIn(1-Percent)` 从黑到透明 | `Level.cs` L3720；`FadeWipe.cs` L28 |

---

## 5. 音效

| 时机 | 事件路径 | 出处 | 本地素材 |
|---|---|---|---|
| 方向死亡（Tween 前） | `event:/char/madeline/predeath` | `PlayerDeadBody.cs` L83 | **缺** |
| 发丝爆散当帧 | `event:/char/madeline/death` | L104 | **缺** |
| 金草莓死亡 | `event:/new_content/char/madeline/death_golden` | L104 | **缺** |
| 重生入场 | `event:/char/madeline/revive` | `Player.cs` L5456 | **缺** |
| 落地 / 撞墙 | 无（尸体不是物理体） | — | — |

说明：`blog-ui/celeste-sounds/` 没有以上三条导出素材；FMOD bank 在游戏安装目录 `Content/FMOD/` 内，未抽取。网页端目前用 WebAudio 合成近似音（gap 注释在 `blog-ui/js/celeste-character.js` 的 `playDeathSound`）。

---

## 6. 重生

### 6.1 重生点

- 存档/会话里的 `Session.RespawnPoint`（`Session.cs` L83）。
- `Level.LoadLevel`：`RespawnPoint` 为空时，优先 `StartPosition` 的最近出生点，否则 `DefaultSpawnPoint`（`Level.cs` L3688-L3697）。
- 玩家创建：`LoadNewPlayerForLevel(Session.RespawnPoint.Value, ...)`（L3700）。
- **尸体位置不参与**：死亡瞬间不会把尸体坐标写成重生点；重生点是最后一次进房间/检查点时的位置，而不是"原地"。

### 6.2 房间重载

- `PlayerDeadBody.End()` 默认 `DeathAction = level.Reload`（L126-L129），然后 `level.DoScreenWipe(false, DeathAction)`（L130）。
- `Level.Reload`：清 Particles/Trail、`UnloadLevel()`、`GC`、`LoadLevel(Player.IntroTypes.Respawn)`（`Level.cs` L639-L657）。
- `Session.Dashes = Session.DashesAtLevelStart`（L644）→ 冲刺数回到"进关时"的数量，不是无条件满冲刺。

### 6.3 角色状态复位

因为**新建 Player 实体**，所有状态回归构造默认：速度、状态机、体力、计时器、抓取、余量跳等全部重置；`Session.Inventory.DreamDash` 等关卡能力保留（重生不会拿走已获得的梦冲）。

### 6.4 无无敌帧

重生后直接 `StateMachine.State = 0`（`Player.cs` L5474），没有任何 `StFrozen`/无敌计时器；落点若仍与尖刺重叠会立刻再死（原作确实如此）。

---

## 7. 死亡计数与统计

| 统计 | 代码 | 出处 |
|---|---|---|
| 本会话死亡 | `session.Deaths++` | `Player.cs` L6544 |
| 本关死亡 | `session.DeathsInCurrentLevel++` | L6545 |
| 存档累计 | `SaveData.Instance.AddDeath(session.Area)` | L6546 |
| 是否可跳过 | `registerDeathInStats` 参数（默认 true）；`Die(Vector2.Zero, true, false)` 可只死不计 | `Player.cs` L2157 |
| 影响 | 只影响统计展示；不影响血量/道具/重生位置（Cell 里没有生命值概念） | — |

重置点：`Level.Reload` 里 `Session.Time = 0; Session.Deaths = 0;` 仅当"从关卡开头重开"分支（`Level.cs` L639-L643），普通死亡不会清计数。

---

## 8. 参数总表

| 参数 | 值 | 出处 |
|---|---|---|
| 方向死亡冻结 | 0.05s（≈3 帧） | `PlayerDeadBody.cs` L85 |
| 冻结后额外等待 | 1 帧 | L86 |
| 甩出距离 | 方向 × 24 px | L88 |
| 甩出 Tween | 0.5s，`Ease.CubeOut` | L89 |
| Tween 停表时刻 | 0.375s（75%） | L97 |
| 尸体缩放 | 1.5 → 1.0（线性随 Eased） | L84、L94 |
| 旋转 | `floor(Eased*4) * 2π`（4 次 90°） | L95 |
| 爆散前上移 | -5 px（Y 向上） | L100 |
| 位移爆发 | `AddBurst(Position, 0.3, 0, 80)` | L101 |
| 震屏 | 0.3s，两次；0.04s 采样，amp=ceil(t*10)，每轴随机 [-amp,amp] | L101-L102；`Level.cs` L1117-L1122 |
| 手柄震动 | Die：Light/Medium；爆散：Strong/Long | `Player.cs` L6569；PDB L103 |
| DeathEffect 时长 | 0.834s | `DeathEffect.cs` L17 |
| 发丝数量 | 8 | L66、L74 |
| 发丝半径 | `CubeOut(ease) * 24` | L68 |
| 发丝尺寸 | `ease<0.5 ? 0.5+ease : CubeOut(1-(ease-0.5)*2)` | L65 |
| 发丝颜色 | `floor(ease*10)%2==0 ? 发色 : White` | L63 |
| 黑描边偏移 | (-1,0)/(1,0)/(0,-1)/(0,1)，共 4 份/条 | L69-L72 |
| 等 DeathEffect | 0.834 × 0.65 = **0.5421s** | PDB L111 |
| 黑屏 | 0.5s FadeWipe（`CubeOut(Percent)` 渐黑） | `ScreenWipe.cs` L48；`FadeWipe.cs` L28 |
| 重生入场 | 0.6s Tween；`deadOffset` 从 `clamp(旧位置±40)` 收敛到 0；`introEase = 1 - Eased` | `Player.cs` L5458-L5469 |
| 重生淡入 | 0.5s `DoScreenWipe(wipeIn)` | `Level.cs` L3720 |
| 重生结束缩放 | Sprite `(1.5, 0.5)`，随后回到正常 | `Player.cs` L5475 |
| 死亡计数 | `Session.Deaths++` / `DeathsInCurrentLevel++` / `SaveData.AddDeath` | `Player.cs` L6542-L6546 |
| 玩家层级 | `Depth = -1000000` | `Player.cs` L6558 |
| 尸体渲染层级 | `Depth = -1000000` | `PlayerDeadBody.cs` L40 |
| 死亡音效 | predeath / death / death_golden | PDB L83、L104 |
| 重生音效 | revive | `Player.cs` L5456 |

---

## 9. 网页版落地差异（给第二段实现用）

> 本节只列"要简化什么、简化后差多少"，不改前端代码。

1. **没有 FMOD 素材**：`predeath / death / revive` 三条事件在 `blog-ui/celeste-sounds/` 不存在，bank 未抽取。网页用 WebAudio 合成短音占位（predeath 方波下滑 80ms、death 三角波下滑 300ms、revive 正弦上滑 240ms）。**观感差异**：音色不对，节奏与时机对齐。
2. **没有 `Displacement` shader**：原作 `AddBurst(0.3, 0, 80)` 是屏幕位移特效；网页用现有白色扩张环 `spawnRipple(radius 80, strength 0.3)` 近似。**观感差异**：没有画面扭曲，只有一圈白环。
3. **没有 60Hz 固定步长**：网页按 `requestAnimationFrame` dt 推进，冻结 0.05s 用计时器实现（非 3 帧精确）。
4. **没有真实 `Level.Reload`**：网页不重载整张地图，只把玩家复位到重生点并重建状态。视觉上等效；`Session.DashesAtLevelStart` 的语义用"满冲刺"替代（两页都无中途减冲刺机制）。
5. **虚空死亡已对齐（跳过 0.375s 甩出）**：`die(bounce, cause)` 的 `cause` 显式区分成因（`spike` 走完整序列；`void` / `dream` 当帧直接爆散）。真机测得 cafe 撞刺 2.05s、虚空 1.65s；remember 页虚空 1.65s。
6. **重生点 = 本房间入口**：页面注入 `entryPoint`（cafe `(280,136)`、remember `(0,0)`），统一由 `celeste-character.js` 的 `getRespawnPoint()` 读取；将来接检查点只改这一个函数。复活复位位置/速度/冲刺数/朝向（`facing` 回 Right），**无无敌帧**。
7. **无金草莓分支**：两页没有金草莓，`death_golden` 与 `GoldenBerryRestart` 不实现。
8. **无 `Input.Rumble`**：浏览器无手柄震动 API（可留空）。

---

## 10. 产物位置

| 内容 | 路径 |
|---|---|
| 反编译源码（本文件引用行号） | `%TEMP%\celeste-rea\Player.cs`、`PlayerDeadBody.cs`、`DeathEffect.cs`、`Level.cs`、`Spikes.cs`、`Session.cs`、`FadeWipe.cs`、`ScreenWipe.cs` |
| IL / 取证转储 | `%TEMP%\celeste-rea\death\`（`death_*_il.txt`、`pdie.txt`、`dr.txt`、`de_*.txt`、`pdb_*.txt`、`ir_begin.txt`、`loadlevel_il.txt`、`respawn_il.txt`、`lshake.txt`、`freeze_il.txt` 等） |
| 复现脚本 | `%TEMP%\celeste-rea\death\retool.py`（`dnfile/dncil` 元数据 + IL 检索） |
| 数值回归测试 | `%TEMP%\celeste-rea\death\death_test.js`（Node vm 桩，17 项断言） |
| 本仓库内未跟踪的原始转储 | `.screenshots/.tmp/rea/`（与上面 `death\` 同源，临时目录，可清理） |

> 游戏安装目录全程只读：`C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`。
