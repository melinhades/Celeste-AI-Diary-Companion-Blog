# Celeste 第二章（Old Site）镜子过场：BGM 与 Badeline 站位取证

> 目标：给 `blog-ui/shelf.html` 的镜子房间提供可复现的原作依据。
> 取证对象：本机 `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll`（FNA/MonoGame C#）。
> 方法：REA 元数据 + `ilspycmd -t <Type>` 定向反编译。中间产物在 `%TEMP%\celeste-rea\`，不进仓库。
> 说明：FMOD 事件内部参数（淡出毫秒、曲线、bank 内容）**不在托管代码里**，凡是代码未给出的数值都会明确标注为“事件资源定义，代码不可见”。

---

## 0. 一句话结论

| 问题 | 结论 |
|---|---|
| 碎镜时 BGM 怎么切 | **不是 crossfade**。进触发框时 `Audio.SetMusic(null)` → `Stop(ALLOWFADEOUT)` 淡出旧曲；整个过场**没有音乐**，只有 3 个 sting/音效；`OnEnd` 才把 `Music.Event` 设为 `event:/music/lvl2/mirror` 并 `Apply(false)` **直接 start**（无淡入、无旧轨 stop） |
| 是否随演出分段 | **不按演出进度分段切歌**。过场里只有 `pt1` / `sequence_mirror` / `pt2` 三个声音事件；音乐只在“过场结束”这一帧一次性起播 |
| Badeline 站位 | **绝对世界坐标**。`Scene.Add(badeline)` 到 `(mirror.X, player.Y)`，没有任何 `Position` tween，也不跟随玩家/镜头。镜头在 zoom 2 下先固定看镜子，之后才上移 80px、再 `ZoomBack(3)` |
| 进场方式 | 构造函数位置 + `Scene.Add`；`Floatness = 0`（关闭上下浮动）；朝向 = 镜中倒影的镜像朝向，起跑时改成 `Scale.X = -direction`；跑到 60/128px 后 `RemoveSelf` |

---

## 1. BGM 链路（逐行证据）

### 1.1 触发与停旧曲：`Celeste.DreamMirror.InteractRoutine`

```csharp
while (!hitbox.Collide(player)) yield return null;
hitbox.Width += 32f;          // 触发框左右各扩 16px
hitbox.Position.X -= 16f;
Audio.SetMusic(null);         // ← 旧曲在这里开始淡出
while (hitbox.Collide(player)) yield return null;
Scene.Add(new CS02_Mirror(player, this));
```

- 触发框扩大后玩家还要“走出去”，才 `Add` 过场实体——所以**淡出起点比过场起点早**，两者之间是一段可变步行时间。
- `Audio.SetMusic(null)` 内部走 `Stop(currentMusic, allowFadeOut: true)`，最终 `STOP_MODE.ALLOWFADEOUT`（`Celeste.Audio.cs`）。
- `ALLOWFADEOUT` 的时长由 **FMOD 事件资源**决定，`Celeste.dll` 里没有毫秒常量。shelf 用 `FADE_SEC = 1.0` 作为校准值（见 §4.1），可单点替换。

### 1.2 过场首帧：`Celeste.CS02_Mirror.Cutscene`

```csharp
Add(sfx = new SoundSource());
sfx.Position = mirror.Center;
sfx.Play("event:/music/lvl2/dreamblock_sting_pt1");   // ← 过场第一帧，3D 定位在镜心
direction = Math.Sign(player.X - mirror.X);
player.StateMachine.State = 11;
playerEndX = 8 * direction;
yield return 1f;
player.Facing = (Facings)(-direction);
yield return 0.4f;
yield return player.DummyRunTo(mirror.X + playerEndX);
yield return 0.5f;
yield return level.ZoomTo(mirror.Position - level.Camera.Position - Vector2.UnitY * 24f, 2f, 1f);
yield return 0.5f;
yield return mirror.BreakRoutine(direction);
```

### 1.3 碎镜段：`Celeste.DreamMirror.BreakRoutine`

```csharp
reflection.X += (float)(direction * 32) * Engine.DeltaTime;   // 倒影 32px/s 走向中心
...
reflectionSprite.Play("idle");
yield return 0.65f;
Add(sfx = new SoundSource());
sfx.Play("event:/game/02_old_site/sequence_mirror");          // ← 碎镜序列音
yield return 0.15f;
Add(sfxSting = new SoundSource("event:/music/lvl2/dreamblock_sting_pt2"));  // ctor 内立即 Play
...
smashed = true;  breakingGlass.Play("break");
yield return 0.6f;                                            // 玻璃裂开动画
... Shake + P_Shatter ...
badeline = new BadelineDummy(reflection.Position + Position - breakingGlass.Origin);
```

- `Monocle.SoundSource(string path)` 构造函数直接 `Play(path)`，所以 `pt2` **在 `sequence_mirror` 之后 150ms 的同一帧起播**，不需要额外调用。
- `pt2` 是音乐 sting，不是 BGM；它不会改变 `Session.Audio.Music.Event`。

### 1.4 起新曲：`Celeste.CS02_Mirror.OnEnd`

```csharp
level.Session.Audio.Music.Event = "event:/music/lvl2/mirror";
level.Session.Audio.Apply(false);
```

`Apply(false)` 内部：

```csharp
Audio.SetMusic(Music.Event, startPlaying: false);
// 若 Event 与当前实例不同 → 创建新事件；随后 startPlaying=false 不启动
// 然后由 Apply 的统一收尾对“新且未播放”的事件执行 start()
```

- 此时旧音乐实例在 §1.1 已被 stop 并清空，所以这里**没有 fade / crossfade**：新事件直接从 0 音量包络起播（事件自身可能有 attack，属于 FMOD 资源，代码不可见）。
- `OnEnd` 由 `EndCutscene(level)` 触发，位于 `yield return 0.5f` 之后（见 §1.5 时序）。

### 1.5 BGM 时刻表（原作语义）

| 时刻 | 事件 | 路径 | 方式 |
|---|---|---|---|
| 进入扩大触发框 | 停旧曲 | （当前 session 曲目，第二章由关卡数据决定） | `SetMusic(null)` → `STOP_MODE.ALLOWFADEOUT`，时长＝FMOD 定义 |
| 过场第 0 帧 | pt1 sting | `event:/music/lvl2/dreamblock_sting_pt1` | `SoundSource.Play`，3D 位置 = `mirror.Center` |
| 倒影到中心 + 650ms | 碎镜序列音 | `event:/game/02_old_site/sequence_mirror` | `SoundSource.Play` |
| 再 +150ms | pt2 sting | `event:/music/lvl2/dreamblock_sting_pt2` | `new SoundSource(path)` 构造即 Play |
| 过场结束（`EndCutscene` / `OnEnd`） | 新 BGM | `event:/music/lvl2/mirror` | `Music.Event` 赋值 + `Apply(false)` → **直接 start**，无淡入/非 crossfade |

**结论：没有“Badeline 出现时再切一次”这种分段 BGM。** Badeline 出场（约 5.7s）只伴随 `pt2` 与碎玻璃音效。

---

## 2. Badeline 站位（绝对世界坐标）

### 2.1 spawn 坐标推导

镜面渲染时（`DreamMirror.BeforeRender`）倒影位置：

```csharp
reflection.Position = new Vector2(X - entity.X, entity.Y - Y) + breakingGlass.Origin;
```

`BreakRoutine` 先关闭 `autoUpdateReflection`，把 `reflection.X` 沿 X 轴推到镜心：

```csharp
while (Math.Abs(reflection.X - breakingGlass.Width / 2f) > 3f)
    reflection.X += (float)(direction * 32) * Engine.DeltaTime;
```

之后：

```csharp
badeline = new BadelineDummy(reflection.Position + Position - breakingGlass.Origin);
```

代入 `reflection.X = breakingGlass.Width / 2 = origin.X`：

```text
badeline.X = reflection.X + mirror.X - origin.X = origin.X + mirror.X - origin.X = mirror.X
badeline.Y = reflection.Y + mirror.Y - origin.Y
           = (player.Y - mirror.Y + origin.Y) + mirror.Y - origin.Y = player.Y
```

即 **spawn = (mirror.X, player.Y)**：X 是镜心，Y 是玩家脚下（本关里约等于镜座 `264`）。

- `BreakRoutine` 只改 `reflection.X`，`reflection.Y` 保持玩家高度 → Badeline 站在玩家所站的地面。
- 没有任何 `Position` tween / `Tween` / `PositionApproach`；后续只有直接改 `badeline.X/Y`。

### 2.2 进场方式与朝向

```csharp
badeline.Floatness = 0f;                       // 关掉上下浮动
for (int i = 0; i < badeline.Hair.Nodes.Count; i++)
    badeline.Hair.Nodes[i] = reflectionHair.Nodes[i];   // 头发从镜内状态接上
Scene.Add(badeline);                            // 绝对世界坐标入场
badeline.Sprite.Play("idle");
badeline.Sprite.Scale = reflectionSprite.Scale; // X = (0 - player.Facing) * |Scale.X|（镜像朝向）
reflection = null;
yield return 1.2f;
float speed = -direction * 32f;
badeline.Sprite.Scale.X = -direction;           // 起跑时改朝跑动方向
badeline.Sprite.Play("runFast");
```

- `BadelineDummy` 的 `Sprite.Position = floatNormal * f * Floatness`，`Floatness=0` → 完全不做浮动偏移。
- 构造函数**没有**调用 `Appear()`，所以镜子里没有出现音/出现粒子。
- `Scene.Add` 后没有等待/位移：她先在镜心 idle 站 1.2s，再起跑。

### 2.3 跑出画面（可直接量化的两段）

```csharp
while (Math.Abs(badeline.X - X) < 60f) {          // 第一段：到距镜心 60px
    speed += DT * (-direction) * 128f;
    badeline.X += speed * DT;
    yield return null;
}
badeline.Sprite.Play("jumpFast");
while (Math.Abs(badeline.X - X) < 128f) {          // 第二段：到 128px，边跑边升
    speed += DT * (-direction) * 128f;
    badeline.X += speed * DT;
    badeline.Y -= Math.Abs(speed) * DT * 0.8f;
    yield return null;
}
badeline.RemoveSelf();
yield return 1.5f;
```

初速 32px/s、加速度 128px/s²：

| 段 | 距离 | 方程 | 用时 |
|---|---|---|---|
| 第一段 | 0→60px | `64t² + 32t − 60 = 0` | ≈ 0.750s |
| 第二段 | 60→128px | `64t² + 128t − 68 = 0` | ≈ 0.436s |
| 消失 | 128px | `RemoveSelf` | 1.186s 后她已离场 |

### 2.4 镜头：不是 `PositionApproach`

- `Level.ZoomTo(focus, 2, 1)`：只改 `Zoom`，焦点是**屏幕空间**的 `mirror.Position - Camera.Position - UnitY*24`；`Zoom` 用 `Ease.SineInOut`（`Level.cs`）。
- `BreakRoutine` 返回后：相机 `from → from + (0,-80)`，`ease += DT * 1.2` → **0.833s**，`Ease.CubeInOut`。
- 同时 `Add(new Coroutine(ZoomBack()))`：先 `yield 1.2s`，再 `ZoomBack(3)`（3s，`SineInOut`）把 zoom 回 1。
- 全过场没有任何 `Camera.PositionApproach`；那是玩家 `Follow` 的平滑，不属于演出脚本。

---

## 3. shelf 现状与偏差（改前）

| 项 | shelf 现状 | 问题 |
|---|---|---|
| Badeline 渲染 | `drawBadeline:false`，交给 `#shelfMirror` 里的 DOM `.badeline-wrap` | DOM 是**相对镜框容器**定位；过场里相机 zoom 2 + 上移 80px，而 `msPosition()` 只在进房/resize 调用 → 她留在旧屏幕位置，整段脱节（用户抱怨的根因） |
| 召唤时刻 | `onBreak`（碎镜那一帧）→ `summon()` | 比原作 spawn 早 0.6s，且 DOM 版没有“镜心 idle 1.2s → 跑出”的世界坐标过程 |
| 旧曲切换 | 点镜瞬间 `stopCur()` 后直接起 p2（硬切） | 原作是先 `SetMusic(null)` 淡出、过场全程无 BGM；硬切既没有淡出，也让 sting 与旧曲叠在一起 |
| 新曲起点 | 碎镜时 | 原作是 `OnEnd`（过场结束）才起 `lvl2/mirror` |
| 相机收尾 | `panTo(160,196)` | 过场后房间构图比进房时上移 20px，DOM 命中区/后续交互对不上；且结束点不是原作的 `EndCutscene` |

---

## 4. shelf 落地改动

### 4.1 BGM 状态机（`blog-ui/js/shelf.js`）

新增 `cutSilent` / `FADE_SEC` / `fadeTimer`：

- `beginCut()`：敲镜瞬间调用。WebAudio 把 `master.gain` 在 `FADE_SEC` 内线性拉到 0，定时 `stopCur()` 并复位增益；HTMLAudio 降级按同一时程压 `volume`。随后进入 `cutSilent`，**过场期间任何 `refresh()` / 解码完成都不起播**。
- `endCut(ph)`：`OnEnd` 帧调用。清除淡出定时器、复位增益、`cutSilent=false`，然后 `playPhase(ph)` **硬起**（无 ramp/fade）。
- `enter/exit/preload/visibilitychange/refresh` 全部加 `cutSilent` 守卫，避免过场中被重新起播。
- `playPhase` 起播前 `resetGain()`，防止淡出后 master 停在 0。

> `FADE_SEC` 是唯一需要按听觉校准的值：代码只给了 `ALLOWFADEOUT`，FMOD 事件里的真实毫秒不可见。

### 4.2 Badeline 绝对坐标（`blog-ui/js/celeste-mirror.js`）

- `drawBadeline:true`：过场全程由 canvas 按**世界坐标**绘制；`bdSpawn(x,y)` 的 `x,y` 来自与 IL 同一条公式 `refl.x + mirror.x - originX`、`refl.y + mirror.y - originY`，本页代入 `(27,29)+(160,264)-(27,29)` → **`(160,264)`**。
- `onBreak` 不再 `summon()`；DOM 层等到 `onDone`（相机归位后）才接管，避免相对定位在 zoom/pan 中漂移。
- 朝向：spawn `scaleX=-1`（= 镜中倒影的镜像朝向；本页无玩家，等价于 IL 的 `Scale = reflectionSprite.Scale`），起跑 `scaleX=-dir`。
- 跑出两段与 IL 同参数：32px/s、加速度 128、60/128px、`jumpFast` 段 `y -= |speed|*DT*0.8`。

### 4.3 相机

- `zoomTo` / `zoomBack` 缓动从 `CubeInOut` 改为 **`SineInOut`**（对齐 `Level.ZoomTo/ZoomBack`）。
- 相机上移 80px 仍用 `CubeInOut` + `dt*1.2`（对齐 IL）。
- 过场结束后回到**进房机位 `(160,216)`**（原作由玩家跟随回到玩家附近；本页无玩家，用 1.2s 归位补偿，保证 DOM 命中区与进房构图一致）。这一段在原作里不存在，单独标注。

### 4.4 缺失素材（明确缺口 + 钩子）

| 原作事件/资源 | shelf 现状 | 处理 |
|---|---|---|
| `event:/music/lvl2/dreamblock_sting_pt1` | 仓库无音源 | `MirrorScene.init({ sting1Src })` 钩子；不注入则静默，**不拿别的曲子顶替** |
| `event:/music/lvl2/dreamblock_sting_pt2` | 无原事件音源，既有近似 `celeste-sounds/dreamblock/dreamblock_exit_01.wav` | 保留既有近似；替换点即 `mkSfx('sting', …)` |
| `event:/game/02_old_site/sequence_mirror` | 既有 `ambience/mirror_sequence.wav` | 保留 |
| `event:/music/lvl2/mirror` | 仓库无音源 | 用 `bgm/Resurrections.mp3` 的 p2 段（2:11–4:25）作为替身；替换点 `SRC` / `P.p2`，文档与代码均已注明，非静默换曲 |
| 美术素材 | `Atlases/Gameplay/characters/badeline/{idle00-08, runFast00-11, jumpFast00-03}.png`、`objects/mirror/*`、`particles/shatter.png`、`particles/starfield/00.png` 等 | **全部存在**，无需补图 |

---

## 5. 毫秒级时序对照表（shelf 版，60Hz 取整）

前提：本页无玩家，`player.DummyRunTo` 用固定 `yield 0.5` 代替（原作该段时长随走位变化）。时间从 `CS02_Mirror.Cutscene` 第 0 帧算起。

| 毫秒 | 帧@60 | 原作行为 | 事件/参数 | shelf 实现 |
|---:|---:|---|---|---|
| ≤ 0（触发早于过场） | — | 进入扩大触发框 → 停旧曲 | `Audio.SetMusic(null)` → `STOP_MODE.ALLOWFADEOUT` | shelf 无玩家：点击镜子即 `beginCut()`，与过场 t=0 同帧开始 1.0s 淡出 |
| 0 | 0 | 过场首帧：pt1 sting | `event:/music/lvl2/dreamblock_sting_pt1`，位置 `mirror.Center` | `playSfx('sting1')`（无源 → 静默，钩子） |
| 1000 | 60 | 等待结束，玩家转向 | `yield 1` | `yield 1.0` |
| 1400 | 84 | facing = −direction | `yield 0.4` | `yield 0.4` |
| 1400–1900 | 84–114 | 玩家走到 `mirror.X + 8*direction` | `DummyRunTo`（时长可变） | 固定 `yield 0.5` 代替 |
| 2400 | 144 | 开始 ZoomTo | `ZoomTo(focus, 2, 1)`，`SineInOut` | `zoomTo(160,240,2,1)`，`SineInOut` |
| 3400 | 204 | ZoomTo 结束 | — | — |
| 3900 | 234 | BreakRoutine 开始 | 倒影 `runFast`，32px/s | 同 |
| 4150 | 249 | 倒影到镜心（8px/32px·s⁻¹） | `yield 0.65` | 同 |
| **4800** | **288** | 碎镜序列音 | `event:/game/02_old_site/sequence_mirror` | `playSfx('mirror')` |
| **4950** | **297** | pt2 sting | `new SoundSource("event:/music/lvl2/dreamblock_sting_pt2")` 即 Play | `playSfx('sting')`（近似源） |
| ~5075 | 305 | shine 收束（alpha 0.5→1，120/s、4/s） | `Calc.Approach` | 同参数 |
| 5075 | 305 | `smashed=true`，玻璃裂开 | `breakingGlass.Play("break")` | `MIRROR.smashed`，`onBreak` |
| 5675 | 341 | 0.6s 后：震屏 + `P_Shatter` + **Badeline spawn** | `Scene.Add` 到 `(mirror.X, player.Y)`，`Floatness=0` | 0.6s 后 `bdSpawn(160,264)`，`emitShatter` |
| 6875 | 413 | idle 1.2s 结束，起跑 | 32px/s，accel 128 | 同 |
| 7625 | 458 | 到 60px → `jumpFast` | `|x−mirror.X| ≥ 60` | 同 |
| 8061 | 484 | 到 128px → `RemoveSelf` | `|x−mirror.X| ≥ 128` | `BD.alive=false` |
| 9561 | 574 | BreakRoutine 返回 | `yield 1.5` | 同 |
| 9561–10394 | 574–624 | 相机上移 80px | `Ease.CubeInOut`，`dt*1.2` | 同 |
| 10394 | 624 | 启动 `ZoomBack` | 协程：先等 1.2s | 同 |
| 11594–14594 | 696–876 | zoom 2 → 1，3s | `Level.ZoomBack(3)`，`SineInOut` | 同 |
| 10394–15227 | 624–914 | DreamBlock 激活 | 1s 等待＋1s 白场＋0.5s＋2s 扫落＋0.333s 退白 | `activateBlock()` |
| 15728 | 944 | `yield 0.5` 后 `EndCutscene` → **OnEnd：起新曲** | `Music.Event = event:/music/lvl2/mirror` + `Apply(false)`（**直接 start**） | `onEnd` → `endCut('p2')`（p2 为替身，硬起） |
| 15728–16928 | 944–1016 | **原作无此段**（玩家恢复控制，相机跟随） | — | shelf 专用：`panTo(160,216,1.2)` 回进房机位 |
| 16928 | 1016 | — | — | `onDone` → `msPosition()` + `summon()`（DOM Badeline 从碎镜升起） |

### 帧级检查点（可直接对照调试）

| 毫秒 | 应看到/听到 |
|---:|---|
| 0 | 旧曲已在淡出；pt1 sting（若挂上音源） |
| 4800 | 碎镜序列音；约 275ms 后玻璃碎裂（+150ms 出 pt2） |
| 5675 | 震屏 + 碎玻璃粒子 + 镜心 Badeline 出现（世界坐标，非 DOM） |
| 6875 | Badeline 起跑，约 1.19s 后离场 |
| 15728 | 新 BGM 起播（本页为 p2 替身），无淡入 |
| 16928 | 镜头归位完成，DOM 层 Badeline 从碎镜升起，聊天打开 |

---

## 6. 验证

- `node --check blog-ui/js/celeste-mirror.js` ✅
- `node --check blog-ui/js/shelf.js` ✅
- 按用户要求未做浏览器/自动化验证，未 `git commit`。

## 7. 保留的既有演出（未回退）

- 碎镜玻璃 10 帧动画、`P_Shatter`、`Shake`、`emitVanish` 冲击环（后者是 shelf 既有装饰，原作 `BadelineDummy` 入场无 `Appear()`）。
- `summon()` / `#badelineImg` / 行为树自由漫游 / 聊天 / `bye` 后 `refresh()` 回 p1。
- 全站 `bgmPlayer` 在进房时暂停、离房恢复的既有逻辑。
