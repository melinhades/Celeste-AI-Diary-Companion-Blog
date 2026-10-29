# 任务清单 · Celeste 人物操作引擎

依据 `spec.md`（同目录）。全部参数以反编译结论为准，禁止拍脑袋改数值。

- [x] **T1 头发库对齐修正** — `blog-ui/js/celeste-hair.js`
  - `update()` 增加 `scaleY=1` 形参；锚点 `n0.y = feetY - 9*scaleY + offY`
  - 第 i 节正弦相位 `sin(wave + (i-1)*0.8)`
  - `draw()` 增加 `spriteScaleX=1` 形参；节点 x 缩放乘 `Math.abs(spriteScaleX)`

- [x] **T2 引擎元数据 + 资源加载** — 新建 `blog-ui/js/celeste-character.js`
  - 内嵌 ANIMS 表（spec §2.4 全部 14 个动画）与 HAIR 表（逐字 xml）
  - 帧图懒加载（按 path 去重）、CelesteHair.load 加载头发贴图
  - `CelesteCharacter.create({base, color, hairCount, mode})`

- [x] **T3 精灵播放器**
  - Play(id) 幂等、Anim 播完走 goto / 无 goto 停末帧、Loop 循环、OnLastFrame 回调、Running 判定（last=="flip" || last.startsWith("run")）

- [x] **T4 物理步进**（spec §2.2 全流程 1-12 逐条实现）
  - 水平 RunAccel/RunReduce/AirMult、duck 摩擦
  - maxFall 过渡、重力 + 顶点半重力
  - Jump()（缓冲消费、HBoost、varJump）、可变跳高、土狼、0.08s 输入缓冲
  - 着地检测（vy>=0 且过地面线）+ 落地 squash + runStumble 条件 + onLand 回调
  - scale 回弹 1.75/s、快落拉伸、facing 更新（含蹲中转向 squash）

- [x] **T5 动画状态机 + 待机小动作**（spec §2.3）
  - 地面/空中全部分支、fastJump 粘滞、idleTimer + idleA/B/C 加权随机（5/3/1）

- [x] **T6 头发联动与绘制**
  - update 传 scaleY、draw 传 spriteScaleX、刘海帧 = 当前帧 hair 元数据 bang 值
  - 身体绘制：原点 (16,32)、scale=(|scaleX|·facing, scaleY)、屏幕坐标 floor

- [x] **T7 演示页** — 新建 `blog-ui/celeste-character-demo.html`
  - 键位/面板/状态行/Badeline 对照，无后端依赖

- [x] **T8 校验与实测**
  - [x] `node --check` ×2（通过）
  - [x] 无头逻辑测试 38/38 通过（物理/状态机/土狼/缓冲/快落/runStumble/蹲跳/头发锚点）
  - [x] browser_use 走 http://localhost:8080/celeste-character-demo.html?selftest=1 页内自检 15/15 通过并截图（celeste-selftest-result.png）
