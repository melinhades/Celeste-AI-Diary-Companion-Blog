# Celeste 人物操作引擎 · 规格说明书

## 1. 目标

在博客前端实现一个**逐参数对齐原作（Celeste.exe 反编译）**的人物操作引擎，包装已建成的 `celeste-hair.js` 头发模块，提供：

- 原作 Normal 状态（State 0）移动物理：跑、跳、可变跳高、土狼时间、跳跃输入缓冲、蹲下、快落
- 原作动画状态机（`orig_UpdateSprite`）：idle / lookUp / runSlow / runFast / jumpSlow / jumpFast / fallSlow / fallFast / duck / flip / skid / runStumble + 待机小动作（idleA/B/C）
- 原作 squash & stretch（起跳拉伸、落地压扁、快落拉伸、duck 压扁、scale 回弹）
- 头发与身体联动（锚点随 squash 缩放、刘海帧元数据、朝向翻转）
- 美术 100% 使用游戏原帧图（`blog-ui/Atlases/Gameplay/characters/player*/`）

**原版排除项已失效**：初版明确排除的冲刺（dash）、攀爬/抓取、墙面滑，以及「演示页无墙体几何，所以 push/edge/edgeBack 不进状态机」，在 v2 已全部实现（依据见 §2.4）。仍不实现：水中（Swim）、搬运（Pickup/Throw）、剧情态。

## 2. 反编译研究结论（全部为原作精确值）66

来源：`Celeste.dll` 反编译类 `Player.cs` / `PlayerSprite.cs` / `PlayerHair.cs` / `Input.cs` 与游戏 `Sprites.xml`。

### 2.1 物理常数（Player.cs 常量区 + NormalUpdate L2805-3082）

| 项 | 值 | 说明 |
|---|---|---|
| MaxRun | 90 | 跑步极速（u/s） |
| RunAccel | 1000 | 加速度（向目标速） |
| RunReduce | 400 | 超速衰减（\|vx\|>90 且同向时） |
| AirMult | 0.65 | 空中水平操控系数 |
| DuckFriction | 500 | 蹲时地面摩擦 |
| MaxFall | 160 | 默认下落极速 |
| FastMaxFall | 240 | 按住下的下落极速 |
| maxFall 过渡率 | 300/s | maxFall 向目标 Approach |
| 重力率 | 900/s | vy 向 maxFall Approach |
| HalfGravThreshold | 40 | \|vy\|<40 且按住跳 → 重力 ×0.5（悬浮顶点） |
| JumpSpeed | -105 | 起跳初速 |
| JumpHBoost | 40 | 起跳水平加成 vx += 40·moveX |
| VarJumpTime | 0.2 | 可变跳窗（s） |
| JumpGraceTime | 0.1 | 土狼时间（s） |
| 跳跃输入缓冲 | 0.08 | Input.cs L443 `Jump = new VirtualButton(..., 0.08f, 0.2f)` |

### 2.2 帧内流程（NormalUpdate）

1. 蹲下判定：地面 + moveY==1 + vy>=0 → duck，scale=(1.4, 0.6)；起身 → scale=(0.8, 1.2)
2. 水平：duck 且在地面 → vx→0 @500；否则 mult = 地面1 / 空中0.65；\|vx\|>90 且 sign==moveX → 400·mult 减速，否则 1000·mult 加速，目标 90·moveX
3. maxFall：按下 且 vy>=160 → 向 240 过渡；否则向 160 过渡（@300/s）
4. 重力（空中）：halfMult = (\|vy\|<40 且按住跳) ? 0.5 : 1；vy → maxFall @ 900·halfMult·dt
5. 可变跳：varJumpTimer>0 时，按住跳 → vy=min(vy, varJumpSpeed)，松开 → varJumpTimer=0
6. 跳跃触发：jumpPressed（含 0.08s 缓冲）且 jumpGraceTimer>0 → Jump()：vx+=40·moveX；vy=-105；varJumpTimer=0.2；varJumpSpeed=vy；scale=(0.6,1.4)；清空 grace
7. 土狼：在地面 → jumpGraceTimer=0.1，否则逐帧递减
8. 着地（MoveV 碰撞落地）：amount=min(vy/240,1)；scaleX=lerp(1,1.6,a)；scaleY=lerp(1,0.4,a)；若下落高度>50 且 vy>=160 且 \|vx\|>=90 → 播 runStumble
9. scale 回弹：scaleX/scaleY 各自向 1 Approach @1.75/s（orig_UpdateSprite 开头）
10. 快落拉伸：按下 且 vy>=200 → a=min(1,(vy-200)/40)；scale=(lerp(1,.5,a), lerp(1,1.5,a))
11. 朝向：moveX!=0 → facing=moveX；若正蹲且转向 → scale=(0.8,1.2)
12. idleTimer：每帧 +=dt；vx 或 vy 非 0 → 清零

### 2.3 动画状态机（orig_UpdateSprite L6308-6517，State 0 分支）

- duck → `duck`
- 地面（fastJump 清零）：
  - \|vx\|<=25 且 moveX==0：moveY==-1 且上一动画!=lookUp → `lookUp`；否则当前不是 idle 系 → `idle`
  - sign(vx)==-moveX 且 moveX!=0（反向急转）：\|vx\|>90 → `skid`；否则当前!=skid → `flip`
  - 否则若 !Running（PlayerSprite.Running：LastAnimationID=="flip" 或以 "run" 开头）：\|vx\|<45 → `runSlow`，否则 `runFast`
- 空中：
  - vy<0：fastJump 或 \|vx\|>90 → fastJump=true，`jumpFast`；否则 `jumpSlow`
  - vy>=0：fastJump 或 vy>=160 → fastJump=true，`fallFast`；否则 `fallSlow`
- 待机小动作：`idle` 播完一轮（OnLastFrame）且 idleTimer>3 且 20% 概率 → 加权随机 idleA(5)/idleB(3)/idleC(1)（Madeline 常温权重），动画 goto 回 idle

### 2.4 v2 动作系统复核（对 `Celeste.dll` 的 `Celeste.Player` 重新反汇编）

方法：`dnfile` + `dncil` 取元数据与 IL；`ilat.py` 打印带真实 `ins.offset` 的指令以解析分支跳转目标。

**动画（`orig_UpdateSprite`）**

- State 2/5（Dash / RedDash）：`DashAttacking && onGround && DashDir.Y==0 && !Ducking && Speed.X!=0 && moveX != Sign(Speed.X)` → `skid`；`Ducking` → `duck`；否则 → `dash`（初版误用 `jumpFast`）
- State 1（Climb）：`lastClimbMove<0` → `climbUp`；`>0` → `wallslide`；`!CollideCheck<Solid>(Position + UnitX*Facing*6)` → `dangling`；`moveX == -Facing` → `climbLookBackStart` / `climbLookBack`；否则 `wallslide`
- State 0 地面，判定顺序：`push`（`!Holding && moveX!=0 && CollideCheck<Solid>(Position + UnitX*moveX)`）→ `|Speed.X|<=25 && moveX==0` 时 `edge`（`(Facing*2,2)` 与 `(Facing*4,2)` 处均无实心）→ `edgeBack`（反向同理）→ `lookUp` → `idle` → `skid`/`flip` → `runSlow`/`runFast`
- State 0 空中：`wallSlideDir != 0 && !Holding` → `wallslide`（力竭时 `tired`）→ `Speed.Y<0` 走 `jumpFast`/`jumpSlow` → 下落走 `fallFast`/`fallSlow`
- 新增动画表项：`dash`(.09, 0-3)、`slide`(.03, 0-2)、`tired`(.18, 0-3)、`push`(.10, 0-15)、`edge`(.25, 0-13)、`edgeBack`(path `edge_back`, .25, 0-13)、`dangling`(.11, 0-9)、`climbLookBackStart`(climb, .08, 6-8 → climbLookBack)、`climbLookBack`(climb, [8])

**物理**

- 天花板（`OnCollideV` 的 `Speed.Y<0` 分支）：`num = UpwardCornerCorrection(4)`，`DashAttacking && |Speed.X|<0.01` 时 `5`；先按 `Speed.X` 方向逐 px 试 `Position + (±i,-1)`，都不通则撞停，且 `varJumpTimer<0.15 → 0`。初版完全没有头部碰撞
- 墙滑（`NormalUpdate`）：`(moveX==Facing || (moveX==0 && GrabCheck)) && MoveY!=1 && Speed.Y>=0 && wallSlideTimer>0 && !Holding && ClimbBoundsCheck(Facing) && CollideCheck<Solid>(Position+UnitX*Facing)` → `Ducking=false; wallSlideDir=Facing`。初版写成 `moveX<=0 且左墙`，方向语义相反
- 碰撞盒：`Hitbox 8×11`（初版按 8×10）
- 接口：`setCeiling(fn)`（头顶天花板）、`setBodySolid(fn)`（`CollideCheck<Solid>(Position+offset)` 的等价物，push/edge/dangling 共用）

### 2.5 精灵系统语义（Monocle Sprite + Sprites.xml）

- `Loop`：循环；`Anim`：播一轮后 goto（无 goto 则停末帧）；`Play(id)` 已是当前动画则无操作
- 帧文件：`{path}{两位序号}.png`，原点 (16,32) 脚底中心，水平翻转 = \|scaleX\|·facing，绘制坐标 floor
- 本引擎动画表（delay/frames/goto/path 均摘自 xml；frames 为 path 内文件序号）：

| id | path | delay | frames | goto |
|---|---|---|---|---|
| idle | idle | 0.10 | 0-8 | idle |
| idleA | idleA | 0.12 | 0-11 | idle |
| idleB | idleB | 0.16 | 0-23 | idle |
| idleC | idleC | 0.05 | 0-11 | idle |
| lookUp | lookUp | 0.10 | 2-7 | — |
| runSlow | runSlow | 0.07 | 0-11 | runFast |
| runFast | runFast | 0.05 | 0-11 | (loop) |
| jumpSlow | jumpSlow | 0.10 | 0,1 | (loop) |
| jumpFast | jumpFast | 0.10 | 0,1 | (loop) |
| fallSlow | jumpSlow | 0.10 | 2,3 | — |
| fallFast | jumpFast | 0.10 | 2,3 | — |
| duck | duck | 0 | 0 | (loop) |
| flip | flip | 0.04 | 0-7 | runFast |
| skid | flip | 0.04 | 8 | (loop) |
| runStumble | runStumble | 0.05 | 10,11,0-11 | runFast |

- hair 元数据逐字采用 xml `<Frames path="...">`（x 乘朝向，":N"=刘海帧号），含 idle/idleA/lookUp/runSlow/runFast/jumpSlow/jumpFast/duck/flip/runStumble

### 2.6 头发锚点（PlayerHair.cs 精确复核，修正现有库两处）

1. 锚点 = 脚底 + (offX·facing, **-9·scaleY** + offY) —— 现库漏乘 scaleY
2. 第 i 节正弦相位 = wave + **(i-1)**·0.8（第一节用 sin(wave)）—— 现库误用 i·0.8
3. 节点绘制 x 缩放 = (i==0 ? facing : 递减系数) · **\|spriteScaleX\|** —— 现库漏乘 \|scaleX\|
4. 其余（追赶率 (1-i/count·0.5)·64dt、3px 钳制、±1 四向描边、倒序绘制、node0 floor）现库已正确

## 3. 交付物

### 3.1 修改 `blog-ui/js/celeste-hair.js`
- `update(feetX, feetY, facing, offX, offY, dt, scaleY=1)`：锚点 y = feetY - 9·scaleY + offY；正弦相位改 (i-1)·0.8
- `draw(ctx, toScreen, zoom, bangIdx, spriteScaleX=1)`：节点 x 缩放乘 \|spriteScaleX\|
- 向后兼容（新参数均有默认值）

### 3.2 新建 `blog-ui/js/celeste-character.js`
全局 `window.CelesteCharacter`，零依赖（仅用 celeste-hair.js）。

- `await CelesteCharacter.create({ base, color, hairCount=4 })` → 实例；预加载所需 path 帧图 + 头发贴图
- 实例属性只读暴露：`x, y`(脚底), `vx, vy`, `facing`, `onGround`, `ducking`, `anim`, `scaleX, scaleY`
- `ch.update(dt, input)`，`input = { left, right, down, up, jumpHeld, jumpPressed }`（jumpPressed 由引擎内部做 0.08s 缓冲与消费）
- `ch.setGround(groundYFn)`：供演示页注入地面高度函数（默认平地 y=0）；落地检测：vy>=0 且脚底越过地面 → 吸附 + 落地事件
- `ch.onLand = null` 回调（演示页挂粒子/尘土用）
- `ch.draw(ctx, toScreen, zoom)`：身体（原点 16,32、scale=(scaleX·facing, scaleY)、floor 坐标）+ 头发
- 内部模块：ANIMS 元数据表、HAIR 表、Sprite 播放器（Anim/Loop/goto/OnLastFrame/Running 语义）、物理步进（§2.2 全流程）、状态机（§2.3）、squash 系统、头发联动（§2.6 修正版调用）
- Badeline 模式：`create({ mode:'badeline' })` 仅换 base 目录与发色，物理一致（原作 Badeline 播放级角色物理同源）

### 3.3 新建 `blog-ui/celeste-character-demo.html`
- 平地为床的操作测试场：A/D 或 ←→ 移动、Space 跳、S/↓ 蹲（空中=快落）、W/↑ 抬头、F 强风
- Madeline 可控 + Badeline 待机漂浮对照（沿用 0.25Hz ±2 浮动）
- 面板：缩放滑杆、debug 开关（锚点/发节/碰撞点）、实时状态行（anim、vx/vy、scale、onGround、ducking、grace/buffer 计时）
- 底部 HUD 注明关键操作与原作参数
- **不请求任何后端接口**（browser_use 沙箱访问不了 8888）

## 4. 验证

1. `node --check` 两个 js 文件语法校验
2. browser_use 打开 `http://localhost:8080/celeste-character-demo.html`（前端静态服务已在后台运行）：
   - 页面加载无 console 报错，canvas 渲染角色
   - 按 D：runSlow→(0.84s 后)runFast，头发后甩
   - Space：起跳拉伸 → jumpFast（带速跳）→ 顶点悬浮 → fallSlow；落地下蹲压扁
   - 按住 S 快落：身体拉长；着地 scale 压扁回弹
   - 地面按住 S：duck 单帧；移动中急转反向：flip 或 skid
   - 静止 >3s 概率触发 idleA/B/C；W 触发 lookUp
   - 截图核对：发丝连贯、刘海帧正确、朝向翻转正确
