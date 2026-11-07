# Badeline 出场 / 退场特效 REA 取证

> 取证对象：本地 Steam Celeste（`C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`）
> 工具：`ilspycmd`（`%TEMP%\celeste-rea\ilspy\win-x64\tools\any\win-x64\ilspycmd.exe`）
> 产物目录：`%TEMP%\celeste-rea\`（未改动游戏安装目录）
> 本文件只记录反编译可追溯的事实；查不到或不适用的一律标 **不确定**，不用近似值冒充原作。

---

## 0. 先给结论

1. **Farewell（内部章节 CS10）里 Badeline 的“出场”没有屏幕闪光。** 原作是：`event:/char/badeline/maddy_split` 音效 + `Displacement.AddBurst(0.5, 8→32, 0.5s)` 屏幕位移波纹 + 直接 `Level.Add(new BadelineDummy(...))`，随后 `FloatTo()` 飘到 Madeline 旁边。没有 `Level.Flash`、没有 cutscene 级的缩放弹入、没有 shader 闪白。
2. **缩放弹入（0 → 1，0.5s，`Ease.CubeIn`）只存在于 Chapter 2 追逐段的 `BadelineOldsite.PopIntoExistance`**，且只缩放 `Sprite` 与透明度，头发同步淡入；Farewell 的 `BadelineDummy` 出场不走这段。
3. **紫色粒子是 `BadelineOldsite.P_Vanish`，默认白色 1px 贴图染色**（`Draw.Particle`），12 颗、发射盒 6×6px、速度 5–10px/s、生命 0.6–1.2s、每 0.1s 在 `#6F2399` / `#EC76F7` 两色间闪烁、只在生命最后 25% 淡出。退场才喷；CS10 的出场不喷。
4. **震屏**：`BadelineDummy.Appear()` 和 `Vanish()` 用 `Input.Rumble(Medium, Medium)`；Farewell 的出场路径（直接 `Level.Add`）**没有**震屏，退场有。`BadelineBoost` 终段有 `Level.Flash(Color.White * 0.5)`，那是“终段助力起飞”的闪白，不是 Badeline 本人出场。
5. **聚焦/缩放**是场景级的，不在出场方法里：`CS10_BadelineHelps` 出场前先 `ZoomTo(焦点, 2.0x, 0.5s)`；`CS10_Gravestone` 用 `ZoomTo(160,90, 2.0x, 3s)`；`CS10_FinalRoom` / `CS10_CatchTheBird` 出场本身不缩放。
6. **头发/描边**：`Hair.Color = #9B3FB5`、`Hair.Border = Color.Black`、`Facing = Left`、4 段（`PlayerSprite.HairCount = 4`），绘制时每段先画上下左右 1px 黑描边再画本体（`PlayerHair.Render`）。没有“出场时头发变色”的动画。

---

## 1. 出场：Farewell 主线（`CS10_BadelineHelps`，本页采用的原型）

反编译文件：`%TEMP%\celeste-rea\Celeste.CS10_BadelineHelps.decompiled.cs`

| 时间 | 动作 | 参数 | 出处 |
|---|---|---|---|
| 出场前 | 镜头推近 | `Level.ZoomTo(new Vector2(spawn.X - level.Camera.X, 134f), 2f, 0.5f)`，0.5s | `Cutscene` L41 |
| 0ms | 播放分裂音效 | `Audio.Play("event:/char/badeline/maddy_split", player.Position)` | `BadelineAppears` L57 |
| 0ms | 生成本体 | `Level.Add(badeline = new BadelineDummy(player.Center))` | L58 |
| 0ms | 屏幕位移波纹 | `Displacement.AddBurst(badeline.Center, 0.5f, 8f, 32f, 0.5f)`；强度 0.5、半径 8→32px、0.5s | L59 |
| 0ms | Madeline 体力 | `player.Dashes = 1`（出场前改为 `2`，出场瞬间扣到 1） | L36 / L60 |
| 0ms | 朝向 | `badeline.Sprite.Scale.X = -1f`（面向左，与 Madeline 相对） | L61 |
| 0–约 414ms | 飘到目标点 | `FloatTo(player.Center + new Vector2(18f, -10f), -1, faceDirection:false)`；目标位移 ≈20.6px，速度 0→120px/s（加速度 240px/s²），位移全程处于加速段 | L62 + `BadelineDummy.FloatTo` |
| 约 250ms | 悬浮幅度到峰值 | `Floatness` 2→4（8/s），正弦摆幅从 ±2px 增到 ±4px | `FloatTo` |
| 到位后约 250ms | 悬浮幅度回落 | `Floatness` 4→2（8/s）；`quickEnd=false` 时会等完全回到 2 | `FloatTo` |
| 约 900ms | 收尾 | `yield return 0.2f`，随后把 Madeline 朝向转右 | L63-64 |
| 退场前 | 停留 | 对白期间保持 `fallSlow`，`SineWave` 上下浮动 | — |
| 退场 | 消失 | `badeline.Vanish()` → `disappear` 音效 + `Displacement.AddBurst(0.5, 24→96, 0.4s)` + 12 颗 `P_Vanish` + `Input.Rumble(Medium, Medium)`；`yield return 0.2f` | L88-95 |

### 1.1 同章其他出场点的差异

| 场景 | 出场位置 | 波纹 | 音效 | 附加 |
|---|---|---|---|---|
| `CS10_BadelineHelps` | `player.Center`，再 `FloatTo(+18,-10)` | `0.5, 8, 32, 0.5` | `maddy_split` | 先 Zoom 2x/0.5s |
| `CS10_FinalRoom` | `player.Position + (18, -8)` | `0.5, 8, 32, 0.5` | `maddy_split` | 无缩放 |
| `CS10_Gravestone` | `player.Position + (-12, -10)`，再 `FloatTo(0,-6)` | `0.5, 8, 32, 0.5` | `maddy_split` | 先 Zoom 2x/3s |
| `CS10_CatchTheBird` | `player.Position + (24, -8)` | `0.5, 8, 32, 0.5` | `maddy_split` @ player | 0.2s 后进场 |
| `CS10_MoonIntro` | `player.Position`，再 `FloatTo(-16,-16)` | `0.5, 8, 32, 0.5` | `maddy_split` | 无缩放 |

反编译文件：`Celeste.CS10_FinalRoom.decompiled.cs` L54-63、`Celeste.CS10_Gravestone.decompiled.cs` L72-80、`Celeste.CS10_CatchTheBird.decompiled.cs` L178-186、`Celeste.CS10_MoonIntro.decompiled.cs` L38-46。

### 1.2 出场“缩放”的真实来源（Chapter 2 追逐版）

反编译文件：`%TEMP%\celeste-rea\BadelineOldsite.cs`

`PopIntoExistance(float duration)`（L366-381）：

- `Visible = true`
- `Sprite.Scale = Vector2.Zero`
- `Sprite.Color = Color.Transparent`
- `Hair.Visible = true`，`Hair.Alpha = 0`
- `Tween.Create(Oneshot, Ease.CubeIn, duration)`
- 每帧：`Scale = One * eased`、`Color = White * eased`、`Hair.Alpha = eased`

调用处：`StartChasingRoutine` 中 `PopIntoExistance(0.5f)`（L213）；追到玩家用 `TweenToPlayer`，`TweenMode.Oneshot + Ease.CubeIn + 1.45s`（`followBehindTime - 0.1f`，L238）。**这套是追逐段专用，不是 Farewell 的出场。**

### 1.3 Chapter 2 镜子揭幕（气氛参考，非 Farewell）

`CS02_BadelineIntro.RevealBadeline`（`%TEMP%\celeste-rea\Celeste.CS02_BadelineIntro.decompiled.cs` L93-112）：

- 音效 `event:/game/02_old_site/sequence_badeline_intro`
- 0.1s 后 `Displacement.AddBurst(pos + (0,-4), 0.8f, 8f, 48f, 0.5f)`
- `Input.Rumble(Light, Medium)`
- `Hovering = true`、`Hair.Visible = true`、`Sprite.Play("fallSlow")`
- 位置 `from → to` 用 `Ease.CubeInOut`，逐帧 `t += Engine.DeltaTime`（约 1s）
- 全场叠加 `Distort.Anxiety`（0.3Hz 正弦 + 每 0.1s 随机抖动 ±0.1，`anxietyFade` 以 2.5/s 逼近目标）

**这里也没有 `Level.Flash`。** 原作的“闪光感”来自位移 shader + 音效，不是白屏。

---

## 2. 紫色粒子：`BadelineOldsite.P_Vanish`

初始化：`%TEMP%\celeste-rea\ParticleTypes.cs` L596-610；结构定义：`ParticleType.cs` L12-271。

| 参数 | 值 | 出处 / 语义 |
|---|---|---|
| 贴图 | 不指定 `Source` → `Draw.Particle`（1×1 白点） | `ParticleType.Create` L224-231 |
| 数量 | 12（每次出场/退场） | `BadelineDummy.Appear/Vanish`、`BadelineOldsite` L91/458/476 |
| 发射盒 | `Vector2.One * 6f` → 以中心为原点 6×6px 随机 | 同上 |
| 颜色 A / B | `#6F2399` / `#EC76F7` | `ParticleTypes.cs` L598-599 |
| 颜色模式 | `Blink`：每 0.1s 在 A/B 间切换 | `Particle.Update` L125-128 + `Calc.BetweenInterval` L1087-1090（`val % 0.2 > 0.1`） |
| 透明度 | `FadeModes.Late`：生命最后 25% 才线性淡出，前 75% 全不透明 | `Particle.Update` L95-98 |
| 尺寸 | 1（1px 白点按 1 倍绘制） | `ParticleTypes.cs` L602 |
| 方向 | `0`，范围 `2π`（全向） | L603-604 |
| 初速度 | 5–10 px/s | L605-606 |
| 速度衰减 | `SpeedMultiplier = 0.3`，每帧 `Speed *= 0.3^dt`（约 1.204/s 的指数衰减） | L609 + `Particle.Update` L141-144 |
| 加速度 / 摩擦 | 0 / 0 | 默认构造 L149-150 |
| 生命周期 | 0.6–1.2s | L607-608 |
| 实际扩散半径 | 以 5–10px/s 指数衰减，1s 内累计约 3–6px（含初始 ±3px 发射盒） | 由上式积分，**估算**；非原作硬编码 |
| 旋转 | 无（`RotationModes.None`） | 默认构造 L157 |

> 结论：这是“贴脸的小颗紫白闪烁像素”，不是大范围紫雾。网页实现不要做成 24px 大粒子四散。

---

## 3. 退场

### 3.1 `BadelineDummy.Vanish()`（Farewell 用这个）

`%TEMP%\celeste-rea\BadelineDummy.cs` L73-79：

1. `Audio.Play("event:/char/badeline/disappear", Position)`
2. `Shockwave()` → `Displacement.AddBurst(Center, 0.5f, 24f, 96f, 0.4f)`
3. `Particles.Emit(P_Vanish, 12, Center, One * 6f)`
4. `RemoveSelf()`（立即移除，无淡出）

### 3.2 `BadelineDummy.Appear()`（存在，但 Farewell 主线没有调用）

L62-70：

1. `Audio.Play("event:/char/badeline/appear", Position)`
2. `Input.Rumble(Medium, Medium)`
3. `Displacement.AddBurst(Center, 0.5f, 24f, 96f, 0.4f)`
4. `Particles.Emit(P_Vanish, 12, Center, One * 6f)`

> 注意区分：`Appear()` 是通用小道具；Farewell 的 `BadelineAppears()` 是 `Level.Add + maddy_split + 8→32 波纹`，**不用** `Appear()`。

### 3.3 追逐段退场（`BadelineOldsite.StopChasing`）

L452-459：`laugh` 动画 → 等 1s → `disappear` 音效 → `AddBurst(0.5, 24, 96, 0.4)` → 12 颗 `P_Vanish` → `RemoveSelf()`。

---

## 4. 本体运动 / 外观参数

反编译文件：`%TEMP%\celeste-rea\BadelineDummy.cs`

| 参数 | 值 | 出处 |
|---|---|---|
| 碰撞盒 | `Hitbox(6, 6, -3, -7)` | 构造 L26 |
| 精灵 | `PlayerSprite(PlayerSpriteMode.Badeline)` → sprite bank `badeline` → 图集 `characters/badeline/` | L27 + `PlayerSprite.cs` L219-230 |
| 初始动画 | `fallSlow`（`jumpSlow` 的 2、3 帧，0.1s/帧循环） | L28 + `Sprites.xml` L207 |
| 朝向 | `Sprite.Scale.X = -1`（默认面朝左） | L29 |
| 头发 | `PlayerHair`，`Color = #9B3FB5`，`Border = Black`，`Facing = Left`，4 段 | L30-33 + `BadelineOldsite.cs` L127 + `PlayerHair.cs` L14-15/38/174 |
| 竖直悬浮 | `SineWave(0.25Hz, phase 0)` → 周期 4s；`Sprite.Position = floatNormal * value * Floatness` | L44-49 + `Monocle.SineWave` Update L53-60 |
| 默认浮动幅度 | `Floatness = 2` → ±2px | L35 |
| 漂浮目标速度 / 加速度 | `FloatSpeed = 120`，`FloatAccel = 240` | L33-34 |
| 浮动法线 | `floatNormal = (0, 1)`，`FloatTo` 中以 12/s 转向运动方向的垂直方向 | L36 + `FloatTo` |
| 灯光 | `VertexLight((0,-8), PaleVioletRed, alpha 1, 20, 60)` | L58 |
| 死亡/消失节奏 | `Vanish()` 立即移除 | — |

### 4.1 `FloatTo` 的曲线（L88-137）

```
speed = Approach(speed, 120, 240 * dt)          // 0→120px/s，约 0.5s 到满速
Position = Approach(Position, target, speed*dt) // 朝目标直线推进
Floatness = Approach(Floatness, 4, 8*dt)        // 悬浮幅度 2→4
floatNormal = Approach(floatNormal, perp, 12*dt) // 法线转向运动垂直方向
到达后：Floatness = Approach(Floatness, 2, 8*dt)
```

- 位移本身**不是**缓动曲线，而是“加速度 + 逐帧逼近”；视觉上先慢后快，接近目标时线性减速。
- 浮动正弦是纯 `sin`，没有额外缓动。
- `quickEnd=true` 时跳过等待 `Floatness` 回到 2（`CS10_CatchTheBird` 的拥抱用它）。

---

## 5. 贴图资源 / 帧数

sprite bank：`Content\Graphics\Sprites.xml` 的 `<badeline path="characters/badeline/">`（L187-259）。
网页可用同源导出：`blog-ui/Atlases/Gameplay/characters/badeline/`。

| 动画 | 文件前缀 | 帧数 | 帧时长 | 出处 |
|---|---|---|---|---|
| `idle` | `idle00-08` | 9 | 0.1s 循环 | Sprites.xml L190 |
| `lookUp` | `lookUp00-07` | 8 | 0.1s，不循环 | L194 |
| `walk` | `walk00-11` | 12 | 0.06s 循环 | L195 |
| `runSlow / runFast` | `runSlow/runFast` | 12 / 12 | 0.07 / 0.05s | L197-198 |
| `fallSlow` | `jumpSlow02-03` | 2 | 0.1s，循环 | L207 |
| `fallFast` | `jumpFast02-03` | 2 | 0.1s，循环 | L208 |
| `dash` | `dash00-03` | 4 | 0.06s 循环 | L200 |
| `dreamDashIn` | `dreamDash00-03` | 4 | 0.04s → `dreamDashLoop` | L201 |
| `dreamDashLoop` | `dreamDash04-16` | 13 | 0.03s 循环 | L202 |
| `dreamDashOut` | `dreamDash17-20` | 4 | 0.04s | L203 |
| `sleep` | `sleep00-23` | 24 | 0.1s（0-10, 10×5, 11-23） | L216 |
| `pretendDead` | `sleep23` | 1 | 静态 | L227 |
| `spawn` | `spawn00-14` | 15 | 0.08s（0×3, 0-9）→ `fallSlow` | L222 |
| `laugh` | `laugh00-05` | 6 | 0.04s 循环 | L223 |
| `angry` | `angry00-05` | 6 | 0.04s 循环 | L224 |
| `boost` | `boost00-09` | 10 | 0.05s，不循环 | L225 |
| `hug` | `hug00` | 1 | 0.08s | L229 |
| `dangling` | `dangling00-09` | 10 | 0.11s 循环 | L221 |
| `faint` | `faint00-10` | 11 | 0.1s → `fainted` | L217 |

头发贴图是 Madeline 的通用资源：`characters/player/bangsXX`（刘海）+ `characters/player/hair00`（后段），**不随 Badeline 变紫色贴图，只换颜色**（`PlayerHair.GetHairTexture` L167-174）。

---

## 6. 音效清单

| 场景 | 事件路径 | 位置 | 音量/音高 | 出处 |
|---|---|---|---|---|
| Farewell 出场 | `event:/char/badeline/maddy_split` | `player.Position` | 无参数 | CS10 各 `BadelineAppears` |
| 通用出场 | `event:/char/badeline/appear` | 本体 | 无参数 | `BadelineDummy.Appear` L63 |
| 退场 | `event:/char/badeline/disappear` | 本体 | 无参数 | L75 |
| 追逐入场 | `event:/char/badeline/level_entry` | 本体 | `chaser_count=index` | `BadelineOldsite.TweenToPlayer` L236 |
| 落地 | `event:/char/badeline/landing` | 本体 | 无 | CS10_CatchTheBird |
| 下蹲 / 站起 | `event:/char/badeline/duck` / `stand` | 本体 | 无 | CS10_CatchTheBird |
| 羽毛/boost 归位 | `event:/new_content/char/badeline/maddy_join_quick` | 本体 | 无 | CS10_Gravestone |
| boost 首现 | `event:/new_content/char/badeline/booster_first_appear` | boost 点 | 无 | CS10_Gravestone/CatchTheBird |

**没有速度相关的音量/音高参数**：以上均为默认 `Audio.Play(path, position)`，未见 pitch/volume 变量。

---

## 7. 原作没有的东西（不要凭印象补）

| 常见误解 | 反编译事实 |
|---|---|
| 出场闪白 / `Level.Flash` | Farewell 出场方法里没有；只有 `BadelineBoost` 终段 `Level.Flash(White*0.5)`（L~300），属于起飞演出 |
| 出场时从 0 放大 | Farewell `BadelineDummy` 直接以 `Scale=1` 生成；`PopIntoExistance(0.5, CubeIn)` 只在 Chapter 2 追逐段 |
| 出场喷紫粒子 | Farewell 出场不喷；`Vanish()` 才喷 12 颗 |
| 粒子是大团紫雾 | 1px 白点、1 倍大小、初速 5–10px/s，实际扩散半径约 3–6px |
| 头发出场变色 | 固定 `#9B3FB5`，只有描边黑；`PopIntoExistance` 期间整条头发 alpha 0→1 |
| 音效随速度变调 | 无参数化 |
| 出场自带震屏 | Farewell 出场无 `Input.Rumble`；`Vanish()` 有 Medium/Medium |

---

## 8. 对本页实现的建议映射（测试版）

按“能查到就照搬、查不到就明说”的原则：

- **出场**：`maddy_split` 音效（网页用 `badeline-sounds` 里最近的现成音；若没有同名文件，标为近似）→ 屏幕波纹（网页可用 `Displacement` 同款“径向抖动脉冲”，或现有 ripple 近似）→ 本体从 `Scale 1` 直接在目标点出现（不要用大闪白）。
- **漂浮**：`SineWave(0.25Hz)`，幅度 2→4→2；`FloatTo` 加速度 240、上限 120；帧用 `fallSlow`（`jumpSlow02/03`，100ms）。
- **退场**：`disappear` + 12 颗 `P_Vanish`（1px、Blink 100ms、最后 25% 淡出）+ 波纹 `0.5, 24→96, 0.4s`。
- **可选缩放弹入**：如果测试版想要更“突然”，只能用 Chapter 2 的 `PopIntoExistance`（0→1，0.5s，CubeIn）并注明“这是追逐段参数，不是 Farewell 出场参数”。
- **不确定项**：`Displacement` shader 的精确视觉、`maddy_split` 音频的实际波形/是否有变体，均无法从当前反编译产物确认。

---

## 9. 反编译产物索引（均在 `%TEMP%\celeste-rea\`）

- `BadelineDummy.cs` —— 本体、Appear/Vanish/Shockwave/FloatTo/WalkTo/SmashBlock
- `BadelineOldsite.cs` —— 追逐版、P_Vanish 声明、HairColor、PopIntoExistance、StartChasingRoutine
- `ParticleTypes.cs` —— `P_Vanish` 初始化（L596-610）
- `ParticleType.cs` / `Particle.cs` / `Calc.cs` —— 粒子默认值、Blink/Late 语义、`BetweenInterval`
- `PlayerSprite.cs` —— `PlayerSpriteMode.Badeline → sprite bank "badeline"`
- `PlayerHair.cs` —— 头发颜色/描边/4 段绘制
- `Celeste.CS10_BadelineHelps.decompiled.cs` —— Farewell 出场/退场主参考
- `Celeste.CS10_FinalRoom.decompiled.cs` / `Celeste.CS10_Gravestone.decompiled.cs` / `Celeste.CS10_CatchTheBird.decompiled.cs` / `Celeste.CS10_MoonIntro.decompiled.cs`
- `Celeste.CS02_BadelineIntro.decompiled.cs` —— 镜子揭幕、anxiety 扭曲
- `Celeste.CS02_Mirror.cs` —— 镜子破碎 + DreamBlock 激活（旧任务参考）
- `Celeste.BadelineBoost.decompiled.cs` —— boost 首现/终段闪白（非本人出场）
- `Celeste.BadelineAutoAnimator.decompiled.cs` —— 对白立绘同步 laugh/angry，出场不自动播放
- `Monocle.SineWave.decompiled.cs` —— 0.25Hz = 4s 周期
- 游戏资源：`C:\Program Files (x86)\Steam\steamapps\common\Celeste\Content\Graphics\Sprites.xml`（L187-259）
