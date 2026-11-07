# Celeste 原作演出取证 → shop 页对照

目标：本机安装的 Celeste 本体（XNA/MonoGame C# 程序集），不是博客项目源码。
本文只记录可复核的证据、时序表和差异；游戏安装目录未做任何修改。

## 0. 取证方法与身份

| 项 | 值 |
|---|---|
| 目标 | `C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll` |
| 文件大小 | 5,223,424 bytes |
| FileVersion | 1.0.0.0 |
| SHA-256 | `999024E23285ACC0C7AC37B6ED33874E16A1F0F9AF5FDEFF66A64050B78F8E24` |
| REA 能力 | `rea providers` 只提供 `rea-dotnet-static`（元数据/成员签名），无托管反编译引擎 |
| 反编译器 | ILSpyCmd `11.2.0.10050`（`ilspycmd.win-x64` 原生 AOT 包） |
| 反编译产物 | `%TEMP%\celeste-rea\`：`HeartGem.cs`、`Poem.cs`、`CS03_OshiroLobby.cs`、`NPC03_Oshiro_Lobby.cs`、`CutsceneEntity.cs`、`Level.cs`、`Player.cs`、`OshiroSprite.cs` |
| 文本 | `Content/Dialog/english.txt`、`Content/Dialog/Simplified Chinese.txt` |
| 精灵 | `Content/Graphics/Sprites.xml`、`SpritesGui.xml` |

命令形态：

```powershell
ilspycmd.exe -t Celeste.HeartGem 'C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll'
```

`Celeste.HeartGem` 的反编译结果包含两个方法体：vanilla 的 `orig_CollectRoutine` 与带补丁的 `CollectRoutine` 包装层；两者在演出相关行上一致，下文行号指 `HeartGem.cs`。

---

## 1. 水晶之心获得演出

### 1.1 证据摘录（`Celeste.HeartGem`）

```csharp
// HeartGem.cs L146-L163（CollectRoutine）
Celeste.Freeze(0.2f);
yield return null;
Engine.TimeRate = 0.5f;
player.Depth = -2000000;
for (int num2 = 0; num2 < 10; num2++) Add(new AbsorbOrb(Position, player));
level.Shake();
Input.Rumble(RumbleStrength.Strong, RumbleLength.Medium);
level.Flash(Color.White);
level.FormationBackdrop.Display = true;
level.FormationBackdrop.Alpha = 1f;
light.Alpha = (bloom.Alpha = 0f);
Visible = false;

// L917-L919（2 秒慢放，raw 时间）
for (float t = 0f; t < 2f; t += Engine.RawDeltaTime) {
    Engine.TimeRate = Calc.Approach(Engine.TimeRate, 0f, Engine.RawDeltaTime * 0.25f);
    yield return null;
}
yield return null;                       // 多等 1 帧
if (player.Dead) yield return 100f;

// L927-L949
Engine.TimeRate = 1f;
Tag = Tags.FrozenUpdate;
level.Frozen = true;
RegisterAsCollected(level, poemID);      // 写 Session / SaveData / 诗条目
poem = new Poem(text2, mode, (area.Mode == AreaMode.CSide || IsFake) ? 1f : 0.6f);
poem.Alpha = 0f;
Scene.Add(poem);
for (float t = 0f; t < 1f; t += Engine.RawDeltaTime) {
    poem.Alpha = Ease.CubeOut(t);        // 淡入 1s
    yield return null;
}

// 等待 MenuConfirm / MenuCancel 按下 → sfx.Param("end", 1f)

// L964-L967（未完成章节时）
level.FormationBackdrop.Display = false;
for (float t = 0f; t < 1f; t += Engine.RawDeltaTime * 2f) {
    poem.Alpha = Ease.CubeIn(1f - t);     // 淡出 0.5s
    yield return null;
}
player.Depth = 0;
EndCutscene(level);
```

音频事件（同一方法内）：

| 时机 | 事件 |
|---|---|
| `Collect()` 起始（L113/L120/L124） | `event:/game/general/crystalheart_blue_get` / `_red_get` / `_gold_get`（fake 为 `fakeheart_get`），事件内部 intro→loop |
| 确认关闭（`sfx.Param("end", 1f)`） | 同一事件触发 outro |
| 旋转循环回绕（L403/L407） | `crystalheart_pulse`（fake：`fakeheart_pulse`） |
| 非冲刺碰触（L532/L536） | `crystalheart_bounce`（fake：`fakeheart_bounce`） |

写入时机：`RegisterAsCollected` 在 2s 慢放结束、`level.Frozen = true` 之后；不在碰触瞬间。`RegisterPoemEntry(poemID)` 也在同一段。

### 1.2 时序表（60fps，raw delta）

| 时刻 | 时长 | 做了什么 |
|---|---|---|
| 0 ms | 1 帧 | 生成白心组件、墙体；`yield null` |
| 16.7 ms | 200 ms | `Celeste.Freeze(0.2)`；`yield null` |
| 216.7 ms | 2000 ms | `TimeRate=0.5`、`player.Depth=-2000000`、10 个 AbsorbOrb、Shake、Rumble、Flash、FormationBackdrop on、隐藏心与光；每帧 `TimeRate → 0`，步进 `RawΔ*0.25`（正好 0.5/2s） |
| 2216.7 ms | 16.7 ms | 多等 1 帧（检查死亡） |
| 2233.4 ms | 1 帧 | `TimeRate=1`、`Frozen=true`、写存档/诗条目 |
| 2233.4 ms | 1000 ms | `poem.Alpha = CubeOut(t)` 淡入 |
| 3233.4 ms → | 等待输入 | `MenuConfirm/MenuCancel` 按下；`sfx.Param("end",1)` |
| 按键帧 | 500 ms | 关闭 FormationBackdrop；`poem.Alpha = CubeIn(1-t)`，`t += RawΔ*2`；`player.Depth=0` |
| +500 ms | — | `EndCutscene`（`Frozen=false`） |

### 1.3 `Celeste.Poem` 排版常量

```csharp
private const float textScale = 1.5f;                  // L28
this.text = ActiveFont.FontSize.AutoNewline(text, 1024); // L71（1024 自动换行）
Heart.Position = new Vector2(1920f, 1080f) * 0.5f;     // L76/L139
float num = ActiveFont.Measure(text).X * 1.5f;         // L108
poemside.DrawCentered(vector - UnitX * (num / 2f + 64f)); // L110
ActiveFont.Draw(text, vector, new Vector2(0.5f, 0.5f), Vector2.One * 1.5f); // L111
poemside.DrawCentered(vector + UnitX * (num / 2f + 64f)); // L112
```

- 文本阴影：`DrawPoem(Offset, color)` 以四份 Black 副本偏移 ±2 绘制（1920 空间）。
- 粒子：80 个；`SineIn(Percent)`；`Heart.Position + Direction*(1-e)*1920`；`Scale=(1+e*2, 0.25*(0.25+(1-e)*0.75))`；`Rotation=Angle(-Direction)`；`Color*(1-e)`；`snow` 8×8。
- 大心：GUI `heartgem{mode}`，240px；`Heart.Position += Range(-1,1)*16*Shake`；`Scale=1+Shake*0.1`。
- smoke RT 为半分辨率，`White*0.3`；`poemside` 为 64px。

### 1.4 shop 对照（`blog-ui/js/shop.js`）

已经做对：

| 项 | shop 位置/实现 |
|---|---|
| Freeze 0.2s、TimeRate 0.5→0 共 2s（`rdt*0.25`） | `freezeT = 0.2`；`timeRate = 0.5`；`approach(..., rdt*0.25)` |
| 10 个 AbsorbOrb、Shake、Flash、黑幕 | `realAfterFreeze()`、`backdropTarget=1`、`veil` 0.85×fade |
| 诗淡入 1s CubeOut / 淡出 0.5s CubeIn | `updatePoem` 的 `in`/`out` |
| 80 粒子 SineIn 1920 / 非等比缩放 / 旋转 / 颜色衰减 | `drawPoem` 粒子段 |
| GUI 240px 心、spin `0*10,1-10 @0.08`、抖动 16×Shake、缩放 1+0.1×Shake | `GUI_SPIN_SEQ`、`drawPoem` 心段 |
| 文本四份 ±2 阴影、poemside 64px、±(w/2+64) | `drawPoemText` |
| 世界心 spin `0*10,1-13 @0.1`、OnLoop 脉冲、0.1s shine、bounce 延迟 0.1 | 心实体段 |
| PointBounce：220 速度、X×1.5、|X|<100 才写入、Y≤0.4 | `pointBounce` |
| Wiggler 0.5s/4Hz 与 0.8s/2Hz StartZero | `newWiggler` |
| 颜色、光晕 Lerp(White,0.5)、半分辨率 smoke 0.3 | 心与 `drawPoemGlow` |

参数/时序不一致：

| ID | 原作 | shop 现状 | 影响 |
|---|---|---|---|
| H1 | `tint = (CSide \|\| fake) ? 1 : 0.6`（蓝/红 0.6，黄/假 1） | `(yellow && !fake) ? 0.6 : 1`（蓝/红 1，黄 0.6） | 蓝/红心过亮、黄心过暗，直接反了 |
| H2 | 白心为 HeartGem 的 Sprite 组件，`Position = sprite.Position`（含 bob + moveWig） | 白心固定 `HEART_POS`，只跟随缩放 | 0.2s 冻结期白心与本体错位 |
| H3 | `moveWiggleDir` 用完整单位向量 `(Center-player.Center).SafeNormalize(UnitY)`，X/Y 都参与位移 | 只记录 Y；绘制只用 Y | 侧向顶开时心不会横向偏移 |
| H4 | 收集音效在 `Collect()` 第 0 帧播放 | `realAfterFreeze()`（冻结结束后，约 +200ms）才播 intro | 起音晚 200ms |
| H5 | 单个 FMOD 事件 intro→loop 自然续接 | intro 在 2.2s 诗阶段被暂停，同时起 loop.wav；本地 intro.wav 长 5.53s | 截掉约 3.3s 的 intro 尾段，可能听到断点 |
| H6 | `RegisterAsCollected` 在 2s 慢放结束、Frozen 之后 | 碰触瞬间 `recordHeart()` | 存档写入提前约 2.2s |
| H7 | 慢放结束后额外 `yield null` 一帧才 Frozen | `t >= 2` 直接进诗阶段 | 少 16.7ms 停顿 |
| H8 | 冲刺碰触时 `Collect` 立即 Freeze，无 bounce | shop 同（已对） | — |

完全缺失/只能近似：

| ID | 原作 | 说明 |
|---|---|---|
| H9 | 真心的 `crystalheart_bounce` 事件 | 本地无该音源；当前用 `fakeHeart/..._bounce_*.wav` 近似 |
| H10 | `P_BlueShine/RedShine/GoldShine/FakeShine` 粒子参数 | 反编译只看到 `Emit(shine,1,Center,One*8)` 与 0.1s 间隔；粒子本体定义未在 `HeartGem` 内 → 用 2px 白点近似 |
| H11 | `Distortion.AddBurst` 脉冲位移（shader 扭曲） | 门店版未实现，仅脉冲音 + 缩放抖动 |
| H12 | 诗条目 `RegisterPoemEntry(poemID)` | 商店模型无诗条目表；仅有 `heartDoorHearts` / `crystalHeart` |
| H13 | 原作只有诗句，没有“名字/描述”层级 | shop 的标题+描述是产品化扩展，保留即可（不视为缺陷） |

---

## 2. 第三章 Oshiro 首次出场（`Celeste.CS03_OshiroLobby`）

### 2.1 证据摘录

```csharp
// CS03_OshiroLobby.cs L50-L127
startLightAlpha = level.Lighting.Alpha;
float endLightAlpha = 1f;
float from = oshiro.Y;
player.StateMachine.State = 11;
player.StateMachine.Locked = true;
yield return 0.5f;
yield return player.DummyWalkTo(oshiro.X - 16f);   // 64 px/s，见 Player.cs L5086
player.Facing = Facings.Right;
sfx.Play("event:/game/03_resort/sequence_oshiro_intro");
Input.Rumble(RumbleStrength.Medium, RumbleLength.Medium);
yield return 1.4f;
level.Shake();
level.Lighting.Alpha += 0.5f;
while (level.Lighting.Alpha > startLightAlpha) {
    level.Lighting.Alpha -= Engine.DeltaTime * 4f;  // 0.125s
    yield return null;
}
VertexLight light = new VertexLight(new Vector2(0f,-8f), Color.White, 1f, 32, 64);
BloomPoint bloom = new BloomPoint(new Vector2(0f,-8f), 1f, 16f);
level.Lighting.SetSpotlight(light);
oshiro.Add(light); oshiro.Add(bloom);
oshiro.Y -= 16f;
Vector2 target = light.Position;
Tween tween = Tween.Create(TweenMode.Oneshot, Ease.CubeOut, 0.5f, start:true);
tween.OnUpdate = t => {
    light.Alpha = bloom.Alpha = t.Percent;
    light.Position = Vector2.Lerp(target - UnitY*48f, target, t.Percent);
    level.Lighting.Alpha = MathHelper.Lerp(startLightAlpha, endLightAlpha, t.Eased);
};
yield return tween.Wait();
yield return 0.2f;
yield return level.ZoomTo(new Vector2(170f, 126f), 2f, 0.5f);
yield return 0.6f;
level.Shake();
oshiro.Sprite.Visible = true;
oshiro.Sprite.Play("appear");                      // 0-30 帧 @0.08（Sprites.xml）
yield return player.DummyWalkToExact((int)(player.X - 12f), walkBackwards:true);
player.DummyAutoAnimate = false;
player.Sprite.Play("shaking");
Input.Rumble(RumbleStrength.Medium, RumbleLength.FullSecond);
yield return 0.6f;
createSparks = true; yield return 0.4f; createSparks = false;
yield return 0.2f;
level.Shake();
Input.Rumble(RumbleStrength.Strong, RumbleLength.Medium);
yield return 1.4f;

level.Lighting.UnsetSpotlight();
Tween tween2 = Tween.Create(TweenMode.Oneshot, Ease.CubeIn, 0.5f, start:true);
tween2.OnUpdate = t => {
    level.Lighting.Alpha = MathHelper.Lerp(endLightAlpha, startLightAlpha, t.Percent);
    bloom.Alpha = 1f - t.Percent;
};
while (oshiro.Y != from) {
    oshiro.Y = Calc.Approach(oshiro.Y, from, Engine.DeltaTime * 40f); // 16px → 0.4s
    yield return null;
}
yield return tween2.Wait();
Audio.SetMusic("event:/music/lvl3/oshiro_theme");
player.DummyAutoAnimate = true;
yield return Textbox.Say("CH3_OSHIRO_FRONT_DESK", ZoomOut);
// MrOshiroDoor.Open() → oshiro.MoveToAndRemove(Right+64)
// → SoundSource("event:/char/oshiro/move_01_0xa_exit") → yield 1.5f → EndCutscene

// ZoomOut: yield 0.2f; yield Level.ZoomBack(0.5f); yield 0.2f;
// OnEnd: Locked=false, State=0; skipped → doors InstantOpen + remove oshiro;
//        Lighting.Alpha=start; UnsetSpotlight; flag "oshiro_resort_talked_1"; music explore Progress=1
```

火花（`CS03_OshiroLobby.Update` L34-L38）：

```csharp
if (createSparks && Level.OnInterval(0.025f)) {
    Vector2 vector = oshiro.Position + new Vector2(0f,-12f)
        + new Vector2(Range(4,12)*Choose(1,-1), Range(4,12)*Choose(1,-1));
    Level.Particles.Emit(P_AppearSpark, vector, (vector - oshiro.Position).Angle());
}
```

`P_AppearSpark` 的 `ParticleType` 定义不在 `CS03_OshiroLobby` / `NPC03_Oshiro_Lobby` 的可见成员里（反编译未出现静态构造）→ **参数缺口**；目前只确证发射数量/位置/方向/间隔。

### 2.2 时序表（进入 `OnBegin` 为 0）

| 时刻 | 时长 | 做了什么 |
|---|---|---|
| 0 | — | 记录 `startLightAlpha`、`from=oshiro.Y`；玩家 `State=11`、`Locked=true` |
| 0–500ms | 500 | 等待（玩家原地锁定） |
| 500ms | 距离/64 px/s | `DummyWalkTo(oshiro.X-16)`，停下后面朝右 |
| 该刻 | — | `sequence_oshiro_intro`、Rumble Medium/Medium |
| +1400ms | 1400 | 静置 |
| 该刻 | 125ms | Shake；`Lighting.Alpha += 0.5`，以 4/s 衰减回原值 |
| 该刻 | 500ms | 聚光/泛光从 0→1（CubeOut）；聚光从目标上方 48px 滑到目标；`oshiro.Y -= 16` |
| +500ms | 200ms | 等待 |
| 该刻 | 500ms | `ZoomTo((170,126), 2×)`（SineInOut） |
| +500ms | 600ms | 等待 |
| 该刻 | 12px/64 px/s ≈ 190ms | Shake；Oshiro `appear` 可见；玩家背身走 12px |
| 该刻 | 600ms | 玩家 `shaking`；Rumble Medium/FullSecond |
| +600ms | 400ms | 每 25ms 发射 1 枚 P_AppearSpark（半径环 4–12px，方向朝外） |
| +1000ms | 200ms | 停止火花 |
| 该刻 | 1400ms | Shake；Rumble Strong/Medium |
| 该刻 | 500ms | UnsetSpotlight；泛光 1→0（CubeIn）；Oshiro Y 以 40/s 回到原位（0.4s，与 0.5s 并行） |
| 该刻 | — | 音乐切 `oshiro_theme`；`DummyAutoAnimate=true` |
| 该刻 | 对白 | `Textbox.Say("CH3_OSHIRO_FRONT_DESK")`；镜头保持 2× |
| 对白结束 | 200ms+500ms+200ms | `ZoomOut`：停 0.2 → `ZoomBack(0.5)` → 停 0.2 |
| 之后 | — | 开门；Oshiro 走到房间右外并移除；`move_01_0xa_exit`；1.5s 后 `EndCutscene` |

官方台词键 `CH3_OSHIRO_FRONT_DESK`（中文首句：“欢迎！有什么可为你效劳的吗？”；英文 “Welcome! May I help you?”），完整条目含 Madeline 的“你是…鬼？”与 Oshiro 的旅馆介绍，末尾为 “Of course we're open!” / “我们当然在正常营业！”。

### 2.3 shop 对照（`playOshiroIntro`）

已经做对：

| 项 | shop |
|---|---|
| 服务铃触发、Oshiro 96×96、origin 0.667、站位 (184,152) | `summonOshiro`、`osShowAtDesk` |
| `appear` 帧序列 0–30 @0.08 | `OS_ANIMS.appear` |
| 镜头目标 (170,126)、2× | `camTo(nXY(170,126), 2, ...)` |
| 对白期间保持 2×，关闭后拉回 | `holdZoomUntilDialogClosed` |
| Esc/按钮跳过 | `skipIntro` |
| 首次/后续台词分流、后续改为问候 | `osSummoned` 分支 |

参数/时序不一致：

| ID | 原作 | shop 现状 |
|---|---|---|
| O1 | `State=11` + `Locked=true`，先 `DummyWalkTo(oshiro.X-16)` 再到画面右侧 12px | 未锁玩家输入；玩家可在演出中自由移动，无走位 |
| O2 | 聚光在 1.9s 后出现，位置 = 脚底 (0,-8)，从上方 48px 滑下，0→1 用 0.5s CubeOut | 420ms 时 `opacity=1` 瞬间出现；渐变中心取 (184,136)，比原作（Y 上浮 16px 后世界 y=128）低 8px |
| O3 | `Lighting.Alpha += 0.5`，以 4/s 衰减（125ms） | 无环境光抬升 |
| O4 | `oshiro.Y -= 16` 上浮，光退时以 40/s 归位 | 无上浮/归位 |
| O5 | 0.5s → walk → 1.4s → 0.125s → 0.5s tween → 0.2s → 0.5s zoom → 0.6s → walk/0.6s → 0.4s → 0.2s → 1.4s → 0.5s | 420 → 950 → 520 → 620 → 650 → 450 → 250 → 1400 → 220ms（整体短约 2.6s） |
| O6 | 火花每 25ms 1 枚、持续 0.4s（≈16 枚），环形 4–12px、方向朝外、生命 0.4–0.7s、速度 30–60、重力 200、缩放 0.6–1.2 | 一次性 28 枚、单点、速度 ±190、重力 26、生命 0.32–0.62 |
| O7 | 结束后 `ZoomOut` 0.2/0.5/0.2 | 关闭对白后直接 520ms 拉回，无前后停顿 |
| O8 | 跳过时会 `InstantOpen` 门并移除 Oshiro | 跳过后仍保留 Oshiro（商店需要他继续营业，属于有意差异） |

完全缺失（需素材）：

| ID | 原作资源/行为 | 说明 |
|---|---|---|
| O9 | `event:/game/03_resort/sequence_oshiro_intro` | `blog-ui/celeste-sounds` 无此音源 |
| O10 | `event:/music/lvl3/oshiro_theme` | 无音源 |
| O11 | `event:/char/oshiro/move_01_0xa_exit` + 开门 + 退场 | 无音源；且商店要保留店主，主动省略退场 |
| O12 | 玩家 `shaking` 精灵帧 | `Atlases` 无该动画帧 |
| O13 | `P_AppearSpark` 的 `ParticleType` 参数 | 静态证据缺口；只能用现有白点近似 |
| O14 | 官方 `CH3_OSHIRO_FRONT_DESK` 台词 | shop 使用自定义迎宾句（有意保留店家口吻），官方文本已核对 |

---

## 3. 实施结果（`blog-ui/js/shop.js`）

已落地（无需新素材）：

- H1 tint 反转：`(fake || yellow) ? 1 : 0.6`
- H2 白心随本体 bob / moveWig：绘制位置与缩放同步
- H3 `moveWiggleDir` 改为完整单位向量，X/Y 都参与世界心位移
- H4 收集音效在碰触帧（`startRealRitual`）播放
- H5 intro 不再被诗阶段截断；`intro.wav` 的 `ended` 后接 loop
- H6 `recordHeart()` 后移到 `realPoemPhase`
- H7 慢放结束补 1 帧 `settle`
- O1 演出期间清空输入 + 64 px/s 脚本走位（`cutWalkTo`）
- O2 聚光从上方 48px 滑入目标，0→1 用 0.5s CubeOut；立绘按 `NPC03_Oshiro_Lobby` 的 `Sprite.Visible=false` 保持隐藏，直到 `appear`
- O3 环境光 +0.5，以 4/s 衰减
- O4 Oshiro 上浮 16px，光退时 40/s 归位（与 0.5s 淡出并行）
- O5 时间轴按 2.2 节重排（0.5 → walk → 1.4 → tween 0.5 → 0.2 → zoom 0.5 → 0.6 → walk → 0.6 → 0.4 → 0.2 → 1.4 → 0.5）
- O6 火花 25ms/枚、0.4s、环形 4–12px 朝外、重力 200、生命 0.4–0.7、缩放 0.6–1.2
- O7 ZoomOut 0.2 / 0.5 / 0.2

素材缺失，使用现有资源近似（已在代码注释标注）：

- O9 出场音效（`sequence_oshiro_intro`）：静默
- O10 `oshiro_theme`：沿用餐馆 BGM
- O11 退场音效/开门：商店保留店主，不执行退场
- O12 玩家 `shaking`：仅用等待与镜头抖动近似
- O13 `P_AppearSpark` 参数：按已确证的发射/速度/生命近似，白点绘制
- H9 真心 bounce 音源：无 `crystalheart_bounce`，保留合成 ping
- H10 shine 粒子：参数已从 `Celeste.ParticleTypes` 取到，但贴图缺失，仍用 2px 白点近似
- H11 Distortion 脉冲：未实现（仅音效 + 缩放抖动）
- H12 诗条目：无对应存档结构

有意保留的产品差异：H13（标题/描述）、O8（跳过后保留 Oshiro）、O14（自定义迎宾台词）。

---

## 4. 诗页粒子的复核（本轮修复）

### 4.1 结论

**不是没实现、也不是开关关掉，而是贴图选错了**。`Celeste.Poem` 的 80 粒子、SineIn、1920 扩散半径、
生命周期与缩放公式在 `shop.js` 里原本就已按源码写好；问题出在粒子贴图：

- `Poem.cs` L141：`MTexture mTexture = OVR.Atlas["snow"];`
- `Celeste.OVR.Load()`（反编译）：`Atlas.FromAtlas("Graphics/Atlases/Overworld", PackerNoAtlas)`
- 因此原作粒子贴图是 **`Atlases/Overworld/snow.png`（256×256 柔和白色光斑）**，
  而不是上一版使用的 `Atlases/Gameplay/particles/snow.png`（8×8，透明通道只有 3×2 个实心像素）。
- 再加上原作的纵向压扁 `0.25*(0.25+(1-e)*0.75)`，8×8 贴图会被压成约 1px 高的细丝，
  80 枚叠加后几乎不可见 —— 这就是“没有粒子”的直接原因。

### 4.2 原作参数（`Celeste.Poem`）

| 项 | 值 | 来源 |
|---|---|---|
| 数量 | 80（`new Particle[80]`） | Poem.cs L62 |
| 初始化 | `Direction=AngleToVector(NextFloat(2π),1)`、`Percent=NextFloat()`、`Duration=0.5+NextFloat()*0.5` | L20-L25 |
| 推进 | `Percent += DeltaTime/Duration*ParticleSpeed`，>1 以 0 重置 | L119-L126 |
| 发射中心 | `Heart.Position = Offset + (960,540)`（即屏幕中心） | L139 |
| 扩散半径 | `Direction * (1-SineIn(Percent)) * 1920` | L145-L146 |
| 缩放 | `(1+e*2, 0.25*(0.25+(1-e)*0.75))`，旋转 `Angle(-Direction)` | L147-L150 |
| 颜色 | `Poem.Color * (1-e)`（蓝 `8cc7fa` / 红 `ff668a` / 黄 `fffc24` / 假白） | L30-L36、L150 |
| 混合 | `BlendState.AlphaBlend`（非 additive） | L138 |
| 出现时间 | 构造时即初始化，随 `poem.Alpha = CubeOut(t)` 1s 淡入 | L65-L68 |

### 4.3 shop 修复

- 粒子贴图改为 `Atlases/Overworld/snow.png`；缺失时依次回退 `Gameplay/particles/snow.png`
  → 程序化 64×64 径向渐变软光斑（`makeSnowFallback`，可替换钩子）。
- 绘制尺寸改为贴图原始尺寸 × `g`（`DrawCentered` 语义），不再固定 8px。
- 80 枚、SineIn、1920、非等比缩放、`Color*(1-e)`、AlphaBlend、随 1s 淡入全部沿用原作。

### 4.4 关联但未改的部分

`Celeste.ParticleTypes` 静态初始化里已取到 shine 的真实参数：

| 类型 | 参数 |
|---|---|
| `HeartGem.P_BlueShine` | `Size=1`、`Color=#5caefa`、`Color2=White`、`Blink`、`InAndOut`、`Direction=-π/2`、`DirectionRange=1.3962634`（±40°）、`Speed 5–10`、`Life 0.6–1.0` |
| `P_RedShine` / `P_GoldShine` | 继承蓝心，仅换 `Color=#ff2457` / `#fffc24` |
| `P_FakeShine` | `Color=#bebdb8`、`Direction=+π/2`、`DirectionRange=0.34906584`（±10°）、`Life 2–4` |

发射：每 0.1s `Emit(shineParticle, 1, Center, One*8)`；`crystalheart_bounce` 为 FMOD 事件，
本地无对应音源，shop 仍用合成 ping 近似。以上两项不属于诗页 80 粒子系统，本轮未改动。

