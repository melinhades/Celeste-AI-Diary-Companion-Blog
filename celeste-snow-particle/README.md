<div align="center">
  <img src="./header-banner.png" alt="CELESTE · AI COMPANION BLOG — 反编译还原" width="90%" />
</div>

> 交付物：本文档（README）+ 前端实现 [`snow-effect.js`](./snow-effect.js) + 可运行 demo [`index.html`](./index.html) + 数值断言 [`verify-constants.js`](./verify-constants.js)。
> 一切常量均来自对**本地已安装 Celeste 的 `Celeste.dll`** 的 IL 级反编译，未使用任何记忆或猜测数值。

---

## 0. 结论（TL;DR）

- 你看到的「启动时（介绍开发者）背景雪花粒子特效」= **`Celeste.HiresSnow : Celeste.Backdrop`**。
- 三个启动/开场相关场景用的是**同一个类**：

  | 使用点 | 字段 | 类型 | 证据 |
  |---|---|---|---|
  | `Celeste.GameLoader`（开机加载画面） | `Snow` | `class:4408` | `.ctor` @42 `ldc.r4 0.45` → @47 `newobj 0x0a0015da` |
  | `Celeste.IntroVignette`（开场 vignette） | `snow` | `class:4408` | ctor @99 `newobj HiresSnow..ctor` |
  | `Celeste.CS07_Credits`（制作人员名单过场，即「介绍开发者」） | `snow` | `class:4408` | 字段表 `Celeste.CS07_Credits.snow : class:4408` |

  `class:4408` 即 `Celeste.HiresSnow`（TypeDef `0x0200044e`）。
- 核心参数：**50 个粒子**、方向 `(-1, 0)`（从右向左）、雪片贴图 `Overworld["snow"]` 的内嵌 `254×254`、
  叠加一张 `1920×1080` 的 `Overworld["overlay"]` 渐变并以 **32 px/s、20 px/s** 无缝平铺滚动、
  叠加层透明度 **0.45**、渲染顺序 **①雪片（Additive）→ ②overlay（Additive + LinearWrap）**。

---

## 1. 取证环境与方法

- 工具：**REA 6.8.0**（`C:\Users\28464\AppData\Roaming\npm\rea`）。主命令
  `rea inspect-managed-members`，参数 `--type <array>`、`--format json`、`--evidence-bundle`、`--filter-output`。
- 目标：本地已安装的 **`Celeste.dll`**（MonoMod/Everest 补丁版托管程序集；含 `Celeste.Mod.*`、
  `MonoMod.Patch*Attribute`、`orig_*` 方法）。
- **证据粒度：IL 级**（TypeDef/Field/MethodDef/MemberRef 元数据 + 完整 IL 指令流 + `ldstr` 字符串）。
  本机 REA 无 .NET `decompile` provider，因此**没有 C# 伪代码**，本文所有「伪代码」都是依据 IL 手工还原。
- 令牌体系：TypeDef `0x02`、Field `0x04`、MethodDef `0x06`、MemberRef `0x0a`、UserString `0x70`。
  IL 里出现的一般是 **MemberRef（0x0a）**，需用 `field_accesses` / `call_edges` 的
  `field_token` / `target_token` 反查真实字段名与声明类型。
- 证据缓存（脚本产出，不入库）：`%TEMP%\rea\` 下 `particles.json`、`startup.json`、
  `hsil.txt`（HiresSnow 全量 IL + MemberRef 解析）、`hs-particle.txt`（嵌套 Particle）等。

---

## 2. 完整还原：`Celeste.HiresSnow`

类型：`Celeste.HiresSnow`（TypeDef `0x0200044e`），基类 `Celeste.Backdrop`（`ext=0x0200015f`）。

### 2.1 字段（含 IL 中的 MemberRef 令牌）

| 字段 | 类型 | 访问 | 初值 | MemberRef 令牌 |
|---|---|---|---|---|
| `Alpha` | `float` | public | `1f` | `0x0a0015db` |
| `ParticleAlpha` | `float` | public | `1f` | `0x0a002919` |
| `Direction` | `Vector2` | public | `(-1, 0)` | `0x0a002913` |
| `AttachAlphaTo` | 引用类型 | public | `null` | `0x0a0015dd` |
| `particles` | `Particle[50]` | private | — | `0x0a002912` |
| `overlay` | `MTexture` | private | `GFX.Overworld["overlay"]` | `0x0a00291e` |
| `snow` | `MTexture` | private | `GFX.Overworld["snow"].GetSubtexture(1,1,254,254)` | `0x0a00291c` |
| `timer` | `float` | private | `0f` | `0x0a002918` |
| `overlayAlpha` | `float` | private | 构造参数 | `0x0a00291f` |

### 2.2 构造：`.ctor(float)`（MonoMod 补丁体）与 `orig_ctor(float)`

本地 `Celeste.dll` 里 `HiresSnow..ctor(r4)`（`0x06001c6b`，il=533）**不是**原始实现，而是
一个 MonoMod 补丁体：先对 `overlay` 贴图做**像素重着色**，末尾 @527 `callvirt 0x0a002911` 调 `orig_ctor`。

**原始构造 `orig_ctor`（`0x06001c6f`，il=136）逐条：**

```csharp
Alpha = 1f;                                     // @1  ldc.r4 1
ParticleAlpha = 1f;                             // @12 ldc.r4 1
Direction = new Vector2(-1f, 0f);               // @23 ldc.r4 -1 / @28 ldc.r4 0 / newobj Vector2
base..ctor();                                   // @44 call 0x0a000a4a
overlayAlpha = overlayAlphaArg;                 // @51 stfld overlayAlpha
overlay = GFX.Overworld["overlay"];             // @57 ldsfld Atlas / ldstr "overlay" / get_Item
snow    = GFX.Overworld["snow"]
            .GetSubtexture(1, 1, 254, 254, null); // @83 ldstr "snow" / @93..@95 ldc.i4 1,1
                                                  //   @95..@100 ldc.i4 254,254 / @106 GetSubtexture
particles = new Particle[50];                   // @117 ldc.i4.s 50 / newarr Particle
Reset();                                        // @130 callvirt Reset
```

**补丁体 `.ctor`（`0x06001c6b`）做的事**（与本还原无关，属偏差，见 §8）：
读取 `overlay` 纹理像素，若四个**角像素**为「全透明」或「不透明纯黑」，则替换为固定蓝色并 `SetData`：

| 角 | 新颜色 (r,g,b,a) | HEX |
|---|---|---|
| `[0]`（左上） | (65, 116, 225, 255) | `#4174E1` |
| `[w-1]`（右上） | (67, 117, 223, 255) | `#4375DF` |
| `[w*(h-1)]`（左下） | (66, 118, 225, 255) | `#4276E1` |
| `[w*h-1]`（右下） | (64, 116, 223, 255) | `#4074DF` |

（IL 证据：@73/@105/@202/@209/@214 `newobj Color(i4,i4,i4,i4)`，@519 `callvirt SetData`。）

### 2.3 `Reset()`（`0x06001c6c`，il=119）

```csharp
for (int i = 0; i < particles.Length; i++) {          // @107 ldc.i4.1 / ldlen / blt
    particles[i].Reset(Direction);                    // @22 call 0x0a002914
    particles[i].Position.X = Calc.Random.NextFloat(Engine.Width);   // @44  get_Width(0x0a000664)
    particles[i].Position.Y = Calc.Random.NextFloat(Engine.Height);  // @82  get_Height(0x0a000665)
}
```

> 注意：`Particle.Reset(Direction)` 本来会把粒子放在**屏幕外 ±128**，但紧接着两行
> 用 `[0,1)*Engine.Width/Height` 把它**覆盖**成整屏均匀随机。所以初始分布是**整屏随机**，
> 不是"从边缘飘入"。

### 2.4 `Update(Scene)`（`0x06001c6d`，il=388）

```csharp
base.Update(scene);                                   // @2 call 0x0a0009fa
if (AttachAlphaTo != null)                            // @8 ldfld AttachAlphaTo
    Alpha = AttachAlphaTo.Percent;                    // @22 ldfld Percent(0x0a001214)

for (int i = 0; i < particles.Length; i++) {
    // ① 水平/顺向推进：Position += Direction * Speed * DeltaTime
    //    @51..@105：Position + ((Direction * Speed) * Engine.DeltaTime)
    particles[i].Position += Direction * particles[i].Speed * Engine.DeltaTime;

    // ② 纵向正弦抖动：Y += sin(Sin) * 100f * DeltaTime
    particles[i].Position.Y += (float)Math.Sin(particles[i].Sin) * 100f * Engine.DeltaTime;  // @158 ldc.r4 100

    // ③ 相位累加
    particles[i].Sin += Engine.DeltaTime;             // @191

    // ④ 出界重生：X < -128 || X > W+128 || Y < -128 || Y > H+128
    //    @220 ldc.r4 -128 / @254 ldc.i4 128（+Width）/ @285 -128 / @319 128（+Height）
    if (particles[i].Position.X < -128f ||
        particles[i].Position.X > Engine.Width  + 128f ||
        particles[i].Position.Y < -128f ||
        particles[i].Position.Y > Engine.Height + 128f)
        particles[i].Reset(Direction);                // @346 call 0x0a002914
}

timer += Engine.DeltaTime;                            // @376
```

> `Engine.Width/Height`（MemberRef `0x0a000664/0x0a000665`，声明类型 `Monocle.Engine`）是**真实后台缓冲尺寸**，
> 与游戏世界的 320×180 虚拟分辨率无关。overlay 的 1920×1080 也印证了默认 `Engine = 1920×1080`。

### 2.5 `Render(Scene)`（`0x06001c6e`，il=443）

```csharp
float mag = Calc.Clamp(Direction.Length(), 0f, 20f);  // @6 Length / @21 Clamp ; Direction=(-1,0) → mag=1
float ang = 0f;                                       // @32
Vector2 scale = Vector2.One;                          // @33 get_One
bool spin = mag > 1f;                                 // @40 cgt（默认方向下 spin=false）

if (spin) {
    ang   = Direction.Angle();                        // @57 call 0x0a000a0e（推断 Atan2(y,x)）
    scale = new Vector2(mag, 0.2f + (1f - mag / 20f) * 0.8f);  // @66 ldc.r4 0.2 / @71 1f / @82 20 / @84 0.8
}

// ① 雪片：Additive 混合 + LinearWrap 采样 + ScreenMatrix
Draw.SpriteBatch.Begin(
    SpriteSortMode.Deferred,          // @101 ldc.i4.0
    BlendState.Additive,              // @102 ldsfld 0x0a001bb5
    SamplerState.LinearWrap,          // @107 ldsfld 0x0a002658
    null, null, null,                 // @112/@113/@114 ldnull
    Draw.ScreenMatrix);               // @115 ldsfld 0x0a00066c

float a = Alpha * ParticleAlpha;                       // @131（默认 = 1）
for (int i = 0; i < particles.Length; i++) {
    Color c   = particles[i].Color;                    // @161
    float rot = particles[i].Rotation;                 // @181
    if (a < 1f) c *= a;                                // @190 bge.un → @201 Color*float
    snow.DrawCentered(
        particles[i].Position,
        c,
        scale * particles[i].Scale,                    // @253 Vector2 * float
        spin ? ang : rot);                             // @259 brtrue
}

// ② overlay：1920x1080 源矩形在纹理内滚动（LinearWrap → 无缝平铺）
float ox = (timer * 32f) % overlay.Width;              // @298 ldc.r4 32 / @310 get_Width
float oy = (timer * 20f) % overlay.Height;             // @325 ldc.r4 20 / @337 get_Height
Color oc = Color.White * (Alpha * overlayAlpha);       // @351 get_White / @358 mul
Draw.SpriteBatch.Draw(
    overlay.Texture,
    Vector2.Zero,                                      // @392 get_Zero（目标位置）
    new Rectangle(-(int)ox, -(int)oy, 1920, 1080),     // @397..@410 ldc.i4 1920 / 1080
    oc);                                               // @427 SpriteBatch.Draw
Draw.SpriteBatch.End();                                // @432
```

**关键点**：滚动的 `-ox/-oy` 是**源矩形**（不是目标位置），目标位置恒为 `(0,0)`。
配合 `SamplerState.LinearWrap`，负 UV 会环绕 → overlay 视觉上**无缝平铺地以 32 px/s、20 px/s 向右下漂移**。

---

## 3. 嵌套粒子：`Celeste.HiresSnow/Particle`

TypeDef `0x0200044f`（`ext=System.ValueType`，即 struct）。字段：

| 字段 | 类型 | FieldDef 令牌 | MemberRef 令牌 |
|---|---|---|---|
| `Scale` | `float` | `0x0400166e` | `0x0a00291d` |
| `Position` | `Vector2` | `0x0400166f` | `0x0a002915` |
| `Speed` | `float` | `0x04001670` | `0x0a002916` |
| `Sin` | `float` | `0x04001671` | `0x0a002917` |
| `Rotation` | `float` | `0x04001672` | `0x0a00291b` |
| `Color` | `Color` | `0x04001673` | `0x0a00291a` |

### `Reset(Vector2 direction)`（`0x06001c70`，il=359）

```csharp
float num = Calc.Random.NextFloat();   // @5  call 0x0a000a44
num *= num * num * num;                // @11..@18  4×ldloc + 3×mul → num⁴（不是 num³）
Scale    = Calc.Map(num, 0f, 1f, 0.05f, 0.8f);          // @21..@41 Map / @52 ldc.r4 0.05 / @53 0.8
Speed    = Scale * (float)Calc.Range(2500, 5000);       // @61 ldc.i4 2500 / @68 5000 / @73 Range(int) / @78 conv.r4

// 依 direction 决定"屏幕外 128px"的出生边（随后被 HiresSnow.Reset 覆盖）
if      (direction.X < 0) Position = new Vector2(Engine.Width  + 128, Random.NextFloat(Engine.Height)); // @96
else if (direction.X > 0) Position = new Vector2(-128f,               Random.NextFloat(Engine.Height)); // @153
else if (direction.Y > 0) Position = new Vector2(Random.NextFloat(Engine.Width), -128f);               // @200
else                      Position = new Vector2(Random.NextFloat(Engine.Width), Engine.Height + 128);  // @247

Sin      = Calc.Random.NextFloat(6.2831855f);   // @294 ldc.r4 6.2831854820251465
Rotation = Calc.Random.NextFloat(6.2831855f);   // @315 ldc.r4 6.2831854820251465
Color    = Color.Lerp(Color.White, Color.Transparent, num * 0.8f);  // @331/@336 Lerp / @342 ldc.r4 0.8
```

> `Color.Lerp(White, Transparent, t)` 只有 Alpha 变化：`R=G=B=255`，`A = 255 * (1 - t)`。
> 因为 `num = u⁴`（u 均匀），大多数粒子 `num ≈ 0` → **小而近乎不透明**，少数大粒子更淡（`A` 低至 `0.2`）。

---

## 4. 常量速查表（前端实现与之逐条对齐）

| 常量 | 值 | 来源 IL |
|---|---|---|
| 粒子数 | `50` | `HiresSnow.orig_ctor` @117 `ldc.i4.s 50` |
| 方向 | `(-1, 0)` | `orig_ctor` @23/@28 |
| 出生/重生边界 | `±128` | `Update` @220/@254/@285/@319 |
| 纵向抖动振幅 | `100` | `Update` @158 `ldc.r4 100` |
| 纵向抖动相位 | `Sin`（每帧 `+= dt`） | `Update` @191 |
| Scale 映射 | `Map(n⁴, 0,1, 0.05,0.8)` | `Particle.Reset` @21..@53 |
| 随机底数 | `n = NextFloat(); n *= n*n*n` → **n⁴** | `Particle.Reset` @11..@18 |
| Speed | `Scale * Range(2500, 5000)` | `Particle.Reset` @61/@73 |
| Sin / Rotation | `NextFloat(2π)` | `Particle.Reset` @294/@315，`ldc.r4 6.2831855` |
| Color | `Lerp(White, Transparent, n*0.8)` | `Particle.Reset` @331..@348 |
| 混合 | `BlendState.Additive` | `Render` @102 |
| 采样 | `SamplerState.LinearWrap` | `Render` @107 |
| overlay 滚动 | `(timer*32) % W`、`(timer*20) % H` | `Render` @298/@325 |
| overlay 目标矩形 | `(-(int)ox, -(int)oy, 1920, 1080)` 源矩形 | `Render` @397..@410 |
| overlay 透明度 | `Alpha * overlayAlpha`，`overlayAlpha = 0.45` | `Render` @358；`GameLoader..ctor` @42 |
| 方向长度钳制 | `Clamp(len, 0, 20)` | `Render` @21 |

---

## 5. 素材

| 用途 | 游戏内路径 | 本仓库已解包文件 | 尺寸 | 说明 |
|---|---|---|---|---|
| 雪片 `snow` | `GFX.Overworld["snow"]` | [`blog-ui/Atlases/Overworld/snow.png`](../blog-ui/Atlases/Overworld/snow.png) | 256×256 | 一团柔和的白色绒毛/雪花；代码只取内嵌 `GetSubtexture(1,1,254,254)`（去掉 1px 边） |
| 叠加 `overlay` | `GFX.Overworld["overlay"]` | [`blog-ui/Atlases/Overworld/overlay.png`](../blog-ui/Atlases/Overworld/overlay.png) | 1920×1080 | 蓝→紫→粉的柔和渐变；Additive 叠加后形成"极光"底色，并随时间滚动 |

- `GFX.Overworld` 的判定依据：两个贴图在 atlas 目录里都位于 **`Overworld/`**（`overlay.png` 仅存在于该目录，
  排除了 `Gameplay` 等其它 atlas），且 `HiresSnow.orig_ctor` 用的是**同一个** `GFX.*` 静态属性（MemberRef `0x0a0024c5`）。
- 原始打包格式 `Content/Graphics/Atlases/**` 为 `.meta/.data`（PNG 极少），本仓库 `blog-ui/Atlases` 是已解包版本 —— **素材不缺**。

---

## 6. 前端实现与运行

- [`snow-effect.js`](./snow-effect.js)：`HiresSnow` 类 + `IL` 常量表，逐条对齐 §2/§3 的 IL。
  坐标约定与 IL 一致（屏幕像素、y 向下）。渲染用 Canvas2D：`globalCompositeOperation='lighter'` 等价于
  `BlendState.Additive`；`createPattern(overlay,'repeat')` + 平移等价于 `LinearWrap` 滚动。
- [`index.html`](./index.html)：1920×1080 逻辑分辨率、等比缩放、固定步长 `dt = 1/60`（Celeste 为固定步长）。
  素材直接引用 `../blog-ui/Atlases/Overworld/`。
- 运行（任选其一）：
  ```powershell
  # 1) 直接双击 index.html（file://，drawImage 不读像素，不受污染限制）
  # 2) 起静态服务器（若浏览器对 file:// 限制较严）
  npx serve .     # 或 python -m http.server
  ```
- 数值断言：
  ```powershell
  node verify-constants.js     # 18 组断言，全部通过
  ```

---

## 7. 与 `Celeste.Snow`（像素雪花）的区别

DLL 里还有另一个同名家族 `Celeste.Snow : Celeste.Backdrop`（TypeDef 见 `snow.json`），
它是**像素风**版本（世界坐标 320×180，`Draw.Pixel` 1×1 像素绘制，`Particle[60]`，
`ForegroundColors/BackgroundColors` 两套调色板，`Alpha/visibleFade/linearFade` 三重淡入淡出，
`Position.X -= Speed*dt`、`Y += sin(Sin)*Speed*0.2*dt`，`Render` 用 `mod(x,320)/mod(y,180)` 环绕）。

**它不使用于启动/开场画面**。启动相关的三个场景（`GameLoader` / `IntroVignette` / `CS07_Credits`）
一律用 `HiresSnow`，故本交付物只还原 `HiresSnow`。若需要 `Snow` 的还原，可基于同一批证据另出实现。

---

## 8. 未解项 / 缺口清单（不得当作事实）

1. **REA 无 .NET provider** → 无 C# 伪代码，本文伪代码均为 IL 手工还原；个别语义（分支合并、泛型实例化）为推断。
2. `Render` @387 `callvirt 0x06000d9e`（对 `overlay.Texture` 的再次取值）**未解析**：该 MethodDef 不在本次取证范围内。
   合理推断为取到可直接 `SpriteBatch.Draw` 的 `Texture2D`（Everest `VirtualTexture` 间接层），但**未经证实**。
3. `Direction.Angle()`（MemberRef `0x0a000a0e`）实现未展开；推断为 `Math.Atan2(y, x)`。
   默认 `Direction=(-1,0)` 时 `spin = (mag>1) = false`，`ang` **不参与绘制**，故不影响默认画面。
4. `AttachAlphaTo` 的目标类型（`class:7756`）与其 `Percent`（`0x0a001214`）语义未展开。
   默认 `null`，不影响启动画面。
5. `HiresSnow..ctor` 的**角像素重着色补丁**归属未定（Everest 本体还是某 mod），但 4 个角颜色已在 §2.2 精确记录。
6. `Engine.Width/Height` 的具体取值随用户设置变化（默认后台缓冲 1920×1080）。本还原与 demo 采用 1920×1080。
7. `Calc.Range(int,int)` 的闭开区间细节（Monocle 为 `Next(min, max+1)`）按闭区间实现，误差 ≤1/2500，可忽略。

---

## 9. 复现命令（REA）

```powershell
# 类型定位
rea inspect-managed-members --file <Celeste.dll> --type Celeste.HiresSnow --format json --evidence-bundle
rea inspect-managed-members --file <Celeste.dll> --type Celeste.GameLoader --format json
rea inspect-managed-members --file <Celeste.dll> --type Celeste.Snow       --format json
# 嵌套类型（HiresSnow/Particle）
rea inspect-managed-members --file <Celeste.dll> --type Celeste.HiresSnow/Particle --format json
```

解析脚本（本次使用，存放于 `%TEMP%\rea\`）：`hsil.js`（HiresSnow IL + MemberRef 解析）、
`hsp.js`（嵌套 Particle）、`cf.js`（启动相关字段表）。