# Celeste 心门（HeartGemDoor）特效 — IL 反编译还原

> 交付物：本文档（README）+ 前端实现 [heartdoor-effect.js](./heartdoor-effect.js) + 可运行 demo [index.html](./index.html) + 数值断言 [verify-constants.js](./verify-constants.js)。
> 一切常量均来自对**本地已安装 Celeste 的 `Celeste.dll`** 的 IL 级反编译，未使用任何记忆或猜测数值。

---

## 0. 结论（TL;DR）

- 目标特效是第 7 章顶（以及核心/告别关卡）的**心门**：`Celeste.HeartGemDoor`（TypeDef `0x02000338`，基类 `Monocle.Entity`），配三个嵌套类型：
  | 嵌套类型 | TypeDef | 作用 |
  |---|---|---|
  | `HeartGemDoor/Particle` | `0x02000339` | struct，门内漂浮像素粒子（Position/Speed/Color） |
  | `HeartGemDoor/WhiteLine` | `0x0200033a` | 开门瞬间横贯屏幕的白线实体，淡出时向全屏发 P_Slice |
  | `HeartGemDoor/<Routine>d__32` | `0x0200033b` | 开门协程状态机（填充→0.5s→闪白→0.6s→1s 滑门） |
- 渲染管线四段：**Interior**（`#18668f` 底色 + 双层 50% 重叠雾 + 视差像素粒子）→ **Edges**（offset 滚动边条 + 顶/底封口）→ **Hearts**（CubeIn 逐颗点亮的心形图标网格）→ **Bloom**（五条 0.25/0.5/0.75/0.5/0.25 竖带，仅未开门）。
- 开门时间轴：玩家站门左 80px 内 → `Counter` 以 `dt*Requires*0.8` 填充（离开以 `dt*Requires*4` 回落）→ 填满后 `yield 0.5s` → **WhiteLine + Flash(White*0.5) + Shake(0.3) + offset=0** → `yield 0.6s` → **1s CubeIn 滑门**（双 Solid 各移 `openDistance=32`），滑动 40% 后每 0.1s 沿门缝两边发射 P_Shimmer。
- 数值断言：**256/256 通过**（`node verify-constants.js`）。

---

## 1. 取证环境与方法

- 工具：**REA 6.8.0**（`C:\Users\28464\AppData\Roaming\npm\rea`）。主命令
  `rea inspect-managed-members`，参数 `--type <array>`、`--format json`、`--evidence-bundle`。
- 目标：本地已安装的 **`Celeste.dll`**（Steam 版，MonoMod/Everest 补丁托管程序集；含 `orig_*` 方法，字段引用全部走 MemberRef `0x0a` 段）。
- **证据粒度：IL 级**（TypeDef/Field/MethodDef/MemberRef 元数据 + 完整 IL 指令流 + `ldstr` 字符串）。本机 REA 无 .NET `decompile` provider，因此**没有 C# 伪代码**，本文所有"伪代码"都是依据 IL 手工还原。
- 令牌体系：TypeDef `0x02`、Field `0x04`、MethodDef `0x06`、MemberRef `0x0a`、UserString `0x70`。IL 里出现的字段一般是 **MemberRef（0x0a）**，需用 `field_accesses` / `call_edges` 的 `field_token` / `target_token` 反查真实字段名与声明类型。
- 对嵌套类型（`<Routine>d__32`、`<>c`）`--type` 用裸名。
- 证据缓存（脚本产物，不入库）：`%TEMP%\rea\` 下的 `heartdoor.json`、`hd.txt`（HeartGemDoor 全量 IL + MemberRef 解析）、`heartdoor-routine.json`、`hd-routine.txt`（Routine/WhiteLine IL）、`ease.json`/`easec.json`（CubeIn）、`calc.json`（Approach/ClampedMap/Range）、`hd-pfind.txt`（P_Shimmer/P_Slice 写入点字节级搜索）。

---

## 2. 完整还原：`Celeste.HeartGemDoor`

类型：`Celeste.HeartGemDoor`（TypeDef `0x02000338`），基类 `Monocle.Entity`。18 字段、18 方法。

### 2.1 关键字段（IL 反查）

| 字段 | 类型 | 说明 |
|---|---|---|
| `Requires` | int | 需求宝石数，`.ctor` 里 `data.Int("requires", 0)` |
| `Counter` | float | 填充进度（驱动心形图标帧） |
| `Size` | int | 门宽 = `data.Width` |
| `openDistance` / `openPercent` | float | 滑程 32 / 开启比例，`openAmount = openPercent*openDistance` |
| `Opened` / `openDistance` | bool/float | 是否已开 / 滑动距离（有 node 时被 `|node.Y - Y|` 覆盖） |
| `offset` | float | 边条滚动相位，Update 中 `+= 12*dt` |
| `mist` | Vector2 | 雾偏移，Update 中 `X -= 4*dt, Y -= 24*dt` |
| `particles` | Particle[50] | 门内像素粒子 |
| `heartAlpha` | float | 心图标整体透明度（`.ctor` 初值 1，现身段从 0 淡入） |
| `TopSolid` / `BotSolid` | Solid | 上/下两扇实体门 |
| `icon` | `List<MTexture>` | `GFX.Game.GetAtlasSubtextures("objects/heartdoor/icon")`（7 帧） |
| `P_Shimmer` / `P_Slice` | ParticleType | 静态字段 `0x040010ba`/`0x040010bb`（**外观参数无写入点，见 §8 缺口**） |

### 2.2 `.ctor`（EntityData 构造）

依据 IL（`ctor @107-164` 等）手工还原：

```csharp
heartAlpha = 1f;
Requires   = data.Int("requires", 0);                    // ldstr "requires"
Size       = data.Width;
openDistance = 32f;                                      // ldc.r4 32
// 有 node 时：openDistance = |node.Y - Y|
icon = GFX.Game.GetAtlasSubtextures("objects/heartdoor/icon");  // ldstr "objects/heartdoor/icon"
particles  = new Particle[50];                           // ldc.i4.s 50
Add(new CustomBloom(RenderBloom));                       // 泛光渲染回调
// startHidden = data.Bool("startHidden", false) → Visible=false（现身段，见 §2.6）
```

### 2.3 `Added(Scene)`（IL @21-177）

```csharp
level = SceneAs<Level>();
for (i in 0..50):
  particles[i].Position = (NextFloat(Size), NextFloat(level.Bounds.Height)); // @12/@99 区域
  particles[i].Speed    = Calc.Range(Random, 4f, 12f);                       // Range(4,12)
  particles[i].Color    = Color.White * Calc.Range(Random, 0.2f, 0.6f);      // alpha∈[0.2,0.6)
// 两扇 Solid：SurfaceSoundIndex=32, SquishEvenInAssistMode=1, EnableAssistModeChecks=0
TopSolid = Solid(X, level.Bounds.Top - 32,    Size, Y - level.Bounds.Top + 32);
BotSolid = Solid(X, Y,                         Size, level.Bounds.Bottom - Y + 32);
if (level.Session.GetFlag("opened_heartgem_door_" + ...)):  // 已开过 → 直接全开
  Opened = true; openPercent = 1; Counter = Requires;
  TopSolid.Y -= openDistance; BotSolid.Y += openDistance;
else:
  Add(new Coroutine(Routine()));
```

### 2.4 `Update()`（MethodDef `0x06001766`）

```csharp
if (!Opened) {                          // Opened 后整段跳过（IL brtrue ret）
  offset += 12f * dt;                   // @24
  mist.X  -= 4f  * dt;                  // @57
  mist.Y  -= 24f * dt;                  // @80
  for (i in 0..50):                     // @121-143
    particles[i].Position.Y += particles[i].Speed * dt;   // 向下漂
}
heartAlpha = Calc.Approach(heartAlpha, 1f, dt * 2f);      // 现身段用，本移植恒 1
```

### 2.5 渲染（`Render` / `DrawInterior` / `DrawMist` / `DrawEdges` / `DrawBloom`）

```csharp
// DrawInterior：底色 Calc.HexToColor("18668f")           // ldstr "18668f"
// DrawMist：雾贴图 "objects/heartdoor/mist"，半块平铺（halfW=W/2, halfH=H/2 → 50% 重叠），
//   两层：DrawMist(mist.X, mist.Y) 与 DrawMist(mist.Y*1.5, mist.X*1.5)，透明度 White*0.6
// 内部粒子：drawPos = p.Position + camera*0.2（视差 0.2；Opened 后视差为 0），按门洞取模回绕
// DrawEdges：num = offset % 8；首条 GetSubtexture(0, 8-num, 7, num)，
//   之后每 8px 一块，左边条 FlipX、右边条正常，锚 (0.5,0)；顶/底每 8px DrawCentered("top")，底部 FlipY；
//   Opened 后边条 alpha=0.25
// Hearts：cols = (Size-8)/12；rows = ceil(Requires/cols)；末行 count = Requires - i*cols；
//   第 idx 颗帧 = icon[(int)(CubeIn(ClampedMap(Counter, idx, idx+1)) * (icon.Count-1))]；
//   位置 = 门中心 + (-count/2+0.5, -rows/2+i+0.5)*12；Opened 后上下半各行 ±(openAmount+8)
// DrawBloom（仅 !Opened && Visible）：White*{0.25, 0.5, 0.75, 0.5, 0.25} 五条竖带
```

### 2.6 `Routine()`（开门协程，嵌套状态机 `0x0200033b`）

```csharp
// —— startHidden 现身段（本移植未实现，见 §8）—
// 玩家 |X - Center.X| < 100 → 播 "event:/new_content/game/10_farewell/heart_door"，
// Visible=true，heartAlpha=0，双门从上方 -240 以 CubeIn 落位（p += dt*1.2），
// 落地 Shake(0.5) + Freeze(0.1)。

// —— 填充段（state 4-6）——
while (Counter < Requires) {
  if (player != null && |player.X - Center.X| < 80 && player.X < X)
    Counter = Approach(Counter, Min(HeartGems, Requires), dt * Requires * 0.8f); // 填充
  else
    Counter = Approach(Counter, 0f, dt * Requires * 4f);                          // 回落
  yield return null;
}
yield return 0.5f;                          // 开门前等待
// —— 开门瞬间 ——
Add(new WhiteLine(Position, Size));         // 横贯白线
level.Flash(White * 0.5f, ...); level.Shake(0.3f);
Audio.Play("event:/game/09_core/frontdoor_unlock");
Opened = true; offset = 0f;
yield return 0.6f;
// —— 滑动（1s）——
botFrom = TopSolid.Y;  topFrom = TopSolid.Y - openDistance;
botTo   = BotSolid.Y;  topTo   = BotSolid.Y + openDistance;
p = 0;
while (p < 1) {
  p += dt;  openPercent = Ease.CubeIn(p);
  TopSolid.Y = Lerp(botFrom, topFrom, openPercent);
  BotSolid.Y = Lerp(botTo,   topTo,   openPercent);
  if (p >= 0.4 && 每 0.1s):
    for (i = 4; i < Size; i += 4):
      Emit(P_Shimmer, 1, (TopSolid.Left+i+1, TopSolid.Bottom-2), (2,2), -π/2);
      Emit(P_Shimmer, 1, (BotSolid.Left+i+1, BotSolid.Top+2),    (2,2), +π/2);
  yield return null;
}
level.Session.SetFlag("opened_heartgem_door_" + ...);
```

`get_HeartGems`：`CheatMode ? Requires : SaveData.TotalHeartGems`。

### 2.7 `WhiteLine`（嵌套实体 `0x0200033a`）

```csharp
Update: fade = Approach(fade, 0, dt * 1);              // 1/s 淡出
        if (fade <= 0):                                 // 归零帧
          for (x in [camera.Left, camera.Right) 除门宽):
            Emit(P_Slice, 1, (x, Y));                   // 全屏碎条
          RemoveSelf();
Render: h = Max(1, 4 * fade);
        Rect(camera.Left - 10, Y - h/2, 340, h);        // 宽 340 的白色横线
```

---

## 3. Monocle 数学原语（IL 级确认）

| 函数 | 语义 | 证据 |
|---|---|---|
| `Ease.CubeIn(t)` | `t*t*t` | `Monocle.Ease/<>c.CubeIn`，MethodDef `0x06000cbe`（`<>c` 类 `0x0200017f`） |
| `Calc.Approach(v,t,step)` | 朝目标步进不超调 | `calc.json` |
| `Calc.ClampedMap(v,min,max,from,to)` | `clamp01((v-min)/(max-min))*(to-from)+from` | `calc.json` |
| `Calc.Range(rand,min,max)` | `rand()*(max-min)+min` | `calc.json` |
| `HeartGemDoor.Mod(a,b)` | `((a%b)+b)%b`（负值安全取模） | `hd.txt` |

---

## 4. 素材清单（本地 `blog-ui/Atlases`，逐一对齐 ldstr）

| IL 字符串 | 本地文件 | 尺寸 |
|---|---|---|
| `objects/heartdoor/mist` | `blog-ui/Atlases/Gameplay/objects/heartdoor/mist.png` | 320×320（半块 160 平铺） |
| `objects/heartdoor/edge` | `.../heartdoor/edge.png` | 8×8 |
| `objects/heartdoor/top` | `.../heartdoor/top.png` | 8×8 |
| `objects/heartdoor/icon` | `.../heartdoor/icon00.png` … `icon06.png` | 7 帧 10×10 |

---

## 5. 前端实现

- [heartdoor-effect.js](./heartdoor-effect.js)：全局 `CelesteHeartDoor`。
  - `create(opts)`：`{size, requires, openDistance, levelHeight, x, y, rng, textures}`，返回门对象。
  - `door.update(dt, playerX, camW)`：内部按 Monocle 顺序 = 协程/实体推进（`updateRoutine`）→ 填充/回落（`updateCounter`）→ 视觉滚动（`updateVisual`）。
  - `door.render(ctx, camX, camY)`：Interior → Edges → Hearts → WhiteLine → Bloom → 占位 shimmer/slice → Flash。
  - 常量表 `CelesteHeartDoor.C` 逐条标注 IL 来源；原语 `mod/approach/clampedMap/cubeIn` 一并导出。
- 单位约定：1 单位 = 1 游戏像素，y 轴向下，`dt = 1/60` 固定步长，`imageSmoothing` 关闭。
- 两个与原版一致的时序细节：
  1. **填充/回落只发生在协程 while 循环内**——Counter 填满后循环退出、Counter 冻结（不会边开门边回落）。
  2. **当帧 `Add` 的 WhiteLine 下一帧才 Update**——开门当帧 `fade=1`、`flash=0.5` 原样渲染；计时 yield 从下一帧起算（JS float64 累加 `30×(1/60)<0.5`，比较处加 `1e-9` 保护，等价于 Monocle float32 递减的触发帧）。
- [index.html](./index.html)：320×180 逻辑分辨率 ×4 放大 demo。鼠标移动玩家，站门左 80px 内填充；`G/g` 宝石 ±1，`+/-` 改需求数，`R` 重置，`C` 相机漂移（展示 `camera*0.2` 视差）。

---

## 6. 数值断言

`node verify-constants.js` → **256/256 通过**。覆盖：

- 原语：CubeIn/ClampedMap/Approach/Mod 语义与边界；
- 构造：50 粒子、Speed∈[4,12]、alpha∈[0.2,0.6)、openDistance=32、双 Solid 几何 `[levelTop-32, y]`/`[y, levelBottom+32]`；
- Update：offset/mist/粒子三速率，Opened 后冻结；
- Counter：填充 `dt*Requires*0.8`、回落 `dt*Requires*4`、右侧不填充、填满后冻结；
- 心图标网格：cols=2/rows=3、末行计数、帧公式 `icon[floor(CubeIn(ClampedMap(...))*6)]`；
- 开门时间轴：31 步（0.5s）开门、当帧 offset=0/WhiteLine fade=1/flash=0.5/shake=0.3、再 36 步（0.6s）进滑动、滑动首帧 `openPercent=CubeIn(dt)`、终位 ±32、shimmer 每批 14 个（i=4..28 双边）；
- WhiteLine：fade 1/s、`h=Max(1,4*fade)`、归零帧 slice 数 = `camW - Size` = 208。

---

## 7. 缺口清单（不猜测）

| 项 | 状态 |
|---|---|
| `P_Shimmer`(`0x040010ba`) / `P_Slice`(`0x040010bb`) 的 ParticleType 外观参数 | 在 `Celeste.dll`、`Celeste.Mod.mm.dll`、`MMHOOK_Celeste.dll` 三份二进制中**字节级搜索均无任何 stsfld 写入点**（疑似运行时注入）。本移植 shimmer/slice 用占位发光点渲染，**发射位置/时机/角度严格按 IL**，外观是缺口 |
| Bloom 泛光 | 原版画入独立 bloom 渲染目标再后处理；本移植用 `'lighter'` 加法混合近似 |
| Flash 衰减时长 | 引擎（Level.Flash）内部实现，未取证；本移植按近似速率衰减 |
| `CollideFirst<Player>` / `GetEntity` 的泛型实参 | REA 未解析该 IL 操作数；按语义取"场景内玩家" |
| startHidden 现身段（-240 落门 + 音效） | 有完整 IL 记录（§2.6 注释），本移植默认 `startHidden=false` 未实现 |
| 音效 | `frontdoor_heartfill`/`frontdoor_unlock`/`heart_door` 三个事件字符串已定位，前端不播 |

---

## 8. 复现

```bash
# 断言
node verify-constants.js
# demo（仓库根起任意静态服务，例如已有 8080）
# http://localhost:8080/../celeste-heartdoor/index.html  （按你的服务根调整）
```
