# 验收清单 · Celeste 人物操作引擎

验证手段：Node 无头测试（38 项）+ 演示页内自检 `?selftest=1`（15 项，页内固定步长驱动，规避浏览器 rAF 节流）。

- [x] 头发锚点吃 scaleY、相位 (i-1)·0.8、节点 x 乘 |scaleX| —— 无头 [11]
- [x] 跑步 runSlow→runFast、极速 90、加速 1000 —— 无头 [1] / 自检第 4 行
- [x] 跑跳 vy=-105 钉住、HBoost vx=130、jumpFast/fastJump 粘滞 —— 无头 [2] / 自检 5-7 行
- [x] 可变跳高（长按远高于点按）—— 无头 [3]
- [x] 土狼 0.1s、跳跃缓冲 0.08s —— 无头 [4][5]
- [x] 快落 maxFall→240、vy>=200 拉伸、fallFast、落地 squash (1.57,0.43)、runStumble 触发与收尾 —— 无头 [6] / 自检 8-13 行
- [x] 蹲下 duck / 蹲中摩擦 / 起身回 idle —— 无头 [7] / 自检第 14 行
- [x] 急转 flip / 高速 skid —— 无头 [8]
- [x] 抬头 lookUp（播完停末帧、松上回 idle）—— 无头 [9] / 自检 2-3 行
- [x] 待机小动作 idleA/B/C 加权触发并回 idle —— 无头 [10] / 自检第 15 行（idleA）
- [x] 蹲跳保持 duck 上升、转下落空中解蹲 —— 无头 [12]
- [x] 演示页 Madeline 可控 + Badeline 漂浮对照，真机帧图渲染，无后端依赖 —— 截图 celeste-selftest-result.png
