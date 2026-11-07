# Celeste 泡泡运送（Cassette Bubble）反编译取证

- 取证日期：2026-11-07
- 目标：A 面拿到磁带（Cassette）后，泡泡裹住 Madeline 送回出生点的完整逻辑
- 游戏：Steam 版 Celeste（`C:\Program Files (x86)\Steam\steamapps\common\Celeste`）
- 反编译：`ilspycmd`（`%TEMP%\celeste-rea\ilspy`），产物在 `%TEMP%\celeste-rea\bubble`
- 地图节点：复用 `%TEMP%\rea\mapdump.py` 解析 `Content\Maps\*.bin`（BinaryPacker）

---

## 0. 结论先行（三条会推翻原始描述的事实）

1. **游戏里没有 `Bubble` 实体类。**
   - 在 `Celeste.dll` 与 `orig\Celeste.exe` 的类型表（共 2517 个类）里搜索 `Bubb*`，**零命中**。
   - 解析 `LostLevels.bin`（第 9 章 Farewell）的 75 种实际摆放实体，**没有任何 `bubble` 实体**；字符串表里那条 `bubble` 是未被使用的残留字符串（地图字符串表不随实体删除而清理）。
   - 所以「进入判定框 → 膨胀 → 悬浮上浮 → 弹出」这套**关卡实体泡泡在官方原作里不存在**（那是 MOD 里的东西，例如 `FloatingBubble` 等）。不存在两套机制可对比，只有下面这一套剧情演出机制。

2. **A 面磁带场景的泡泡是玩家自己的状态机 + 精灵动画，不是独立实体。**
   - 类：`Celeste.Player`
   - 状态常量：`Player.StCassetteFly = 21`（`Player.cs:404`）
   - 精灵动画：`Sprites.xml` 中 `<Loop id="bubble" path="bubble" delay="0.08"/>`
   - 整个「泡泡」是一条精灵贴图（`characters/player/bubble.png`，Madeline 蜷成一团 + 白色泡泡轮廓），**单帧、无膨胀动画、无破裂帧**。

3. **目的地不是「关卡开头」。**
   - 代码：`Cassette.CollectRoutine` 里 `level.Session.RespawnPoint = level.GetSpawnPoint(nodes[1])`，随后 `player.StartCassetteFly(nodes[1], nodes[0])`。
   - `GetSpawnPoint` 是「全图所有出生点里离 nodes[1] 最近的一个」（`LevelData.Spawns.ClosestTo`）。
   - 实测第 1 章 A 面：磁带房间是 `lvl_11z`（房间坐标 `3032,-2640`，320×184），`nodes[1]` 绝对坐标 `(3328,-2504)`，最近出生点是**同一房间内的 player 标记 `(3344,-2480)`**（房间右下角入口）。
   - 第 1 章起始房间是 `lvl_1 (0,0)`，与返回点相距 3300+ px。
   - 结论：泡泡把人送回**磁带房间自己的入口/出生点**（并把这个点写成 RespawnPoint），不是整章开头。全 A 面各章实测都是「回到本房间的出生点」。

> 如果用户坚持「送回关卡开头」，那么和原作有出入：原作是回「该房间最近出生点」。实现时请以本条为准，或在 UI 上明确写成「回到房间入口」。

---

## 1. 触发链路（类名 / 方法名）

| 步骤 | 类.方法 | 行为 |
|---|---|---|
| 1 | `Celeste.Cassette.OnPlayer` | 碰到磁带：`player.RefillStamina()`、`Audio.Play("event:/game/general/cassette_get")`、`Celeste.Freeze(0.1f)`、启动 `CollectRoutine` |
| 2 | `Celeste.Cassette.CollectRoutine` | 演出主体（见 §2），结尾设置 RespawnPoint |
| 3 | `Celeste.Player.StartCassetteFly(target, control)` | `Holding?.Drop()`；`Sprite.Play("bubble")`；`Sprite.Y += 5`；`StateMachine.State = 21` |
| 4 | `Celeste.Player.CassetteFlyBegin` | `Sprite.Play("bubble")`、`Sprite.Y += 5` |
| 5 | `Celeste.Player.CassetteFlyCoroutine` | 泡泡飞行主体（见 §3） |
| 6 | `Celeste.Player.CassetteFlyUpdate` | `return 21`，**不读任何输入**（不可控、不可转向） |
| 7 | `Celeste.Player.CassetteFlyEnd` | `Sprite.Y -= 5`，状态收尾 |

`StartCassetteFly` 的 `target = nodes[1]`、`control = nodes[0]`（`Cassette` 构造函数里 `NodesOffset(offset)` 把节点转为世界坐标）。

---

## 2. 磁带演出前置（白闪/缩放/预览，属于「拿磁带」而不是「泡泡」）

> 这一段是**拿到磁带时的演出**。死亡复活如果要复用泡泡，不应照搬这段（尤其白闪和 B 面解锁 UI）。列在这里是为了说清「泡泡出现前到底发生了什么」。

| 顺序 | `Cassette.CollectRoutine` 代码 | 参数 |
|---|---|---|
| 1 | `level.PauseLock = true` / `level.Frozen = true` / `Tag |= Tags.FrozenUpdate` | 暂停锁 + 整关冻结 |
| 2 | `level.Session.Cassette = true` | 存档解锁 B 面 |
| 3 | `level.Session.RespawnPoint = level.GetSpawnPoint(nodes[1])` | 写复活点 |
| 4 | `UpdateLevelStartDashes()`、`RegisterCassette`、`Stop cassette blocks` | 关卡状态 |
| 5 | `Depth = -1000000`（磁带本体提到最上层） | — |
| 6 | `level.Shake()` + `level.Flash(Color.White)` | **白闪**：`flash` 以 10/s 升到 1，再以 3/s 衰减（约 0.33s 消失） |
| 7 | `level.Displacement.Clear()` | 清屏幕扭曲 |
| 8 | 摄像机对准磁带：`Camera.Position = Clamp(camTo, bounds)` + `ZoomSnap(中点, 2f)` | 2 倍放大 |
| 9 | 磁带自转：`rate` 从 2 起，每秒 +4，持续 1.5s，然后 `rate = 0; Frame = 0` | 接近满速约 8 rad/s |
| 10 | `yield return 0.25f` | 0.25s |
| 11 | 磁带上升到镜头上方：`Tween(Position.Y, camTo.Y - 90, 0.4f, Ease.CubeIn)`，同时 `Scale.X 1→0.1`、`Scale.Y 1→3` | 0.4s，`CubeIn` |
| 12 | `Visible = false`；播放 `event:/game/general/cassette_preview` | 预览音乐 |
| 13 | B 面解锁提示：`TotallyUnlockedBSide()` 0.5s EaseIn → 等待按键 → 0.5s EaseOut | 玩家按键才继续 |
| 14 | `ZoomBack(0.2f)`；摄像机 0.25s `SineInOut` 回到原位 | — |
| 15 | **`Audio.Play("event:/game/general/cassette_bubblereturn")` + `player.StartCassetteFly(nodes[1], nodes[0])`** | 泡泡从这里开始 |
| 16 | `level.Frozen = false`；`yield 0.25f`；`PauseLock = false`；`ResetZoom`；`RemoveSelf` | — |

---

## 3. 泡泡飞行核心参数（`CassetteFlyCoroutine`）

| 参数 | 值 | 出处 |
|---|---|---|
| 入场停留 | `yield return 0.4f`（0.4s，原地不动） | `Player.CassetteFlyCoroutine` |
| 路径 | `Monocle.SimpleCurve(begin=当前位置, end=nodes[1], control=nodes[0])` 的**二次贝塞尔** | `SimpleCurve.GetPoint` |
| 贝塞尔公式 | `P(t) = (1-t)²·Begin + 2(1-t)t·Control + t²·End` | `Monocle.SimpleCurve` |
| 进度推进 | `lerp += 1.6f * dt`（线性） | `CassetteFlyCoroutine` |
| 总飞行时长 | `1 / 1.6 = 0.625s`（60fps 约 37.5 帧） | 由上一行推出 |
| 位置缓动 | `curve.GetPoint(Ease.SineInOut(lerp))` | 同上 |
| `SineInOut` | `(1 - cos(π·t)) / 2` | `Monocle.Ease.SineInOut` |
| 摄像机 | 每帧 `level.Camera.Position = player.CameraTarget`，**无平滑、无前置延迟** | `CassetteFlyCoroutine` |
| `CameraTarget` | `(Position.X - 160, Position.Y - 90)`（320×180 视口居中；再加 CameraOffset） | `Player.CameraTarget` |
| 玩家可控性 | 无。`CassetteFlyUpdate` 直接 `return 21`，不读输入；无转向；`Holding` 被 `Drop()` | `Player.CassetteFlyUpdate` |
| 深度 | `Depth = -2000000`（盖住背景、地形、雪） | `CassetteFlyCoroutine` |
| 重试 | `level.CanRetry = false`（飞行中禁止重试） | 同上 |
| 冻结 | 飞行时 `level.Frozen = false`（世界照常更新） | `Cassette.CollectRoutine` |
| 背景压暗 | `FormationBackdrop`：`Display=true`、`Alpha=0.5`；黑屏 `fade` 以 3/s 升到 1；`Draw.Rect(322×182, Color.Black * fade * Alpha * 0.85)` → 最终黑 42.5%；同时 `Snow/WindSnowFG.Alpha = 1 - fade`；Depth `-1999900` | `Celeste.FormationBackdrop` |
| 到达瞬间 | `Sprite.Play("fallFast")`；`Sprite.Y -= 5`；`Sprite.Scale = 1.25`；`yield 0.2f` | `CassetteFlyCoroutine` |
| 结束 | `StateMachine.State = 0`（Normal）、`Depth = 0`，此时才恢复重力/可控 | 同上 |
| 落地 | 无额外落地动作/音效；直接进入 Normal 状态受重力 | 同上 |
| 泡泡消失方式 | **无破裂动画、无淡出**：精灵直接切回 `fallFast`，泡泡贴图下一帧就不画了 | 同上 |

飞行整体时间线：

```
0.000s  进入 StCassetteFly：贴图切 bubble，Sprite.Y += 5，Scale 1.25，背景开始压暗
0.000–0.400s  原地展示泡泡（0.4s）
0.400–1.025s  沿二次贝塞尔 SineInOut 飞向目标（0.625s），每 0.03s 喷 2 个粒子
1.025s  到达：贴图切 fallFast，Sprite.Y -= 5
1.025–1.225s  原地悬停 0.2s（仍不可控）
1.225s  State = 0，恢复重力/可控；背景退回
```

> `level.Frozen` 在 `StartCassetteFly` 调用的同一帧末被置回 false，因此 0.4s 等待期世界是活的，只是玩家不可控。

---

## 4. 贴图 / 帧数据

| 项 | 值 |
|---|---|
| 玩家精灵配置 | `Sprites.xml`：`<Loop id="bubble" path="bubble" delay="0.08"/>`，位于 sprite bank `player`（`path="characters/player/"`，`origin=(16,32)`，帧尺寸 32×32） |
| 贴图文件 | `Content\Graphics\characters\player\bubble.png`（仓库里在 `blog-ui\Atlases\Gameplay\characters\player\bubble.png`） |
| 尺寸 | 32×32，1 帧 |
| 非透明像素 | 234 / 1024，bbox `(5,5)-(28,28)`（23×23 的圆） |
| Alpha | 只有 0 和 255 两档，**没有半透明**；不是玻璃质感 |
| 颜色 | 白 `#FFFFFF` 78px（泡泡轮廓）；Madeline 配色：`#040000`/`#000000` 描边、`#AC3232` 头发、`#5A1A1A` 暗发、`#873724`、`#D9A066` 皮肤、`#5B6EE1` 蓝衣；共 12 种不透明色 |
| 动画帧数 | 1 帧（delay 0.08 无实际作用，视觉上是静态图） |
| 绘画缩放 | 全程 `Sprite.Scale = 1.25`（从脚底 origin 放大，泡泡整体变大 25%） |
| 相对位置 | `Sprite.Y += 5`：泡泡底部约与脚底齐平（帧内 bbox 下沿 28 + 5 ≈ 脚底） |

> 注意：`bubble.png` 是「蜷成一团的 Madeline + 白色泡泡线」，不是空泡泡。原作没有「先画泡泡再塞人」的过程，切帧即完成。

---

## 5. 粒子（`Player.P_CassetteFly`）

| 参数 | 值 |
|---|---|
| 贴图 | `particles/bubble`（4×4 白色小泡泡；仓库 `blog-ui\Atlases\Gameplay\particles\bubble.png`） |
| 颜色 | `Color.White * 0.6`（白色，alpha 0.6） |
| 发射 | 飞行期间每 `0.03s`，在 `player.Center` 一次喷 **2 个** |
| 生命 | `0.4–1.0s` 随机 |
| 大小 | `Size=1, SizeRange=0.5` → 起始约 0.75–1.25 px |
| 速度 | `8–16 px/s`，方向 `0–2π` 全向随机 |
| 加速度 | `(0, -24)` px/s²（向上加速） |
| 摩擦 | `0` |
| 淡出 | `FadeModes.Late`：生命最后 25% 才线性淡出（前 75% 满 alpha 0.6） |
| 混合 | 默认（非加色） |
| 位置 | 取整绘制（`Position = Round`） |

出处：`Celeste.ParticleTypes.P_CassetteFly`、`Monocle.Particle`。

---

## 6. 音效

| 事件 | 时机 | 仓库是否可用 |
|---|---|---|
| `event:/game/general/cassette_get` | 碰到磁带瞬间 | ❌ 无（FMOD `sfx.bank` 内只有事件名，未提取音频流） |
| `event:/game/general/cassette_bubblereturn` | 泡泡起飞瞬间（`StartCassetteFly` 前一行） | ❌ 无 |
| `event:/game/general/cassette_preview` | 磁带消失、预览 B 面时（参数 = 章节 ID） | ⚠️ 仓库有 `celeste-sounds/cassette_preview_*`，但与泡泡无关 |

FMOD 事件名在 `Content\FMOD\Desktop\sfx.bank` 中能搜到，但单个事件对应哪段 FSB5 采样需要解析 FMOD 事件 bank（本次未做）。**音频参数标「不确定/未提取」**，不要编造时长与波形。

---

## 7. 「两套泡泡机制」核对

| 机制 | 是否存在 | 说明 |
|---|---|---|
| 关卡实体泡泡（可进入、膨胀、上浮、弹出） | ❌ 官方不存在 | 全量类型表无 `Bubble`；Farewell 地图无 `bubble` 实体摆放；`bubble` 只是残留字符串 |
| 剧情演出泡泡（磁带回收） | ✅ | `Player.StCassetteFly=21` + `bubble` 精灵 + `Cassette.CollectRoutine` |

MOD 里倒是有很多同名实现（`FloatingBubble`、`Bubbler`、`ReturnBubbleTweaksController` 等），但那些不是原作参数，不纳入本表。`SorbetHelper` 的 `ReturnBubbleTweaksController` 也从侧面证明「return bubble = CassetteFly」这一条链路。

---

## 8. 不确定 / 未取证项

- FMOD 事件的音量、音高、时长、波形：**不确定**（未提取）。
- `bubble` 精灵在原作 60fps 下是否每帧对齐整数像素绘制：**不确定**（Chromium 复刻无此约束）。
- 第 9 章 `bubble` 残留字符串最初对应的实体：**不确定**（无类、无摆放，大概率是删房间后的残留）。
- 各章磁带房间的 `nodes[1]` 是否都紧贴房间入口：仅第 1 章逐坐标核对；其余章只核对了「最近出生点均为本房间出生点」，未逐像素核对门的位置。
- 泡泡在高处/低处死亡（非磁带）时的运镜：原作**没有**这种场景（原作死亡不是泡泡），所以没有可对齐的参数；本工程属于「借用 CassetteFly 演出」。

---

## 9. 本工程实现映射（供实现参考，不是原作参数）

| 原作 | 本工程 |
|---|---|
| `nodes[1]`（地图作者指定） | 死亡点 → `entryPoint`/出生位置；目标固定为出生点 |
| `nodes[0]`（地图作者指定） | 运行时合成控制点（死亡点动态，无地图节点）。建议：`midpoint + (0, -min(48, dist*0.2))`，即中点向上拱起，保留二次贝塞尔手感 |
| `StCassetteFly` 全程不可控 | 死亡判定后锁输入，直到 `State=0` |
| `FormationBackdrop` 压暗 | 背景 `#000` alpha 0→0.425（0.33s 进 / 0.33s 出） |
| `cassette_bubblereturn` 音效 | 仓库无素材 → 用 WebAudio 合成占位（软 whoosh），并在代码注释标「占位」 |
| 0.4s 展示 + 0.625s 飞行 + 0.2s 悬停 | 完全照搬 |
| 粒子每 0.03s ×2 | 完全照搬 |
| 到达后无破裂、直接 `fallFast` | 完全照搬（不做破裂/淡出） |
