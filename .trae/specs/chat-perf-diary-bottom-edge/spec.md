# 聊天室性能优化 + 日记页底部白带修复

## 背景与现状

用户反馈两件事：

1. **farewell demo 场景聊天室卡顿**（已澄清：`celeste-farewell-remembered-demo.html`；表现为滚动、输入、打开加载、长时间挂着全部卡）。
2. **日记页屏幕最底部有一条横向白带**（"怎么又起来了"）。

本轮已在工作区完成、尚未提交的改动：

- demo 性能：`resize()` 里 `dpr = 1`；聊天卡展开时场景降到 30fps（`renderAcc` 节流），收起后恢复；移除 `#chatPane` / `.msg-side` / `.chat-input-row` 的大面积 `backdrop-filter`；`js/messages.js` 雪花 30fps；消息列表上限 500 条（仅停在底部时裁旧消息）。
- 日记体验（与本次白带无关，勿改动）：`js/diary.js` 只发送未回应过的 `delta`；`CompanionParam.delta`；`DiaryServiceImpl` / `PromptBuilder` 只读新内容；`js/text-fx.js` 镜像层对齐修复。

尚未完成：

1. `js/messages.js` 的 URL 版本号仍是 `20261101c`，浏览器会继续用旧脚本 → 性能改动实际不生效。
2. 日记底部白带未定位、未修复。已排除的怀疑点：
   - `celeste-areas/snow-front.webp` / `snow-back.webp`：alpha 几乎全 0（稀疏雪花），不是白带来源。
   - `celeste-gui/diary-bg.webp` 底部像素：米黄/褐色，不是白色。
   - 书页是否贴底：`#journalStage { position:fixed; bottom:0 }`，书页底边与视口底对齐。
   - 无头 Edge 截图（1600×900 / 1366×768 / 1536×864@1.25）均未复现白带。
3. 临时文件与两个本地 python 服务未清理。

## 目标

1. 让 demo 与 messages 页的性能改动真正生效（只做 cache-bust，不改逻辑）。
2. 在 `css/diary.css` 做与根因无关的结构性兜底，保证视口最底部不再出现白（固定背景从 `body` 迁到 `html` + 底部 4px 夜色覆盖层），不改变情绪蒙色、雪层、书页视觉。
3. 可验证：1366×768、1600×900、1920×1080、1536×864@125% 四组截图，底部 6 行近白像素占比 < 2%。
4. 清理临时产物与本地服务。

## 设计决策

### D1 聊天室性能：只补缓存版本号

两个页面都引用：

- `celeste-farewell-remembered-demo.html` L1795：`js/messages.js?v=20261101c`
- `messages.html` L143：`js/messages.js?v=20261101c`

统一改为 `js/messages.js?v=20261102a`。不改 `messages.js` 逻辑。

已知项：`messages.js` 雪花循环首次以 `(function loop(){…})()` 调用（`ts === undefined`），只会多画一帧，之后 `lastDraw` 为实数、节流正常，属可接受行为，不在本次改动范围内。

### D2 日记底部白带：结构性兜底

根因尚未确定，因此采用不依赖根因的修复，且不引入大幅视觉变化：

1. `css/diary.css` L85–103：
   - 把原来挂在 `body` 上的固定背景（`linear-gradient(...), url('../celeste-gui/diary-bg.webp') center / cover no-repeat fixed`）迁移到 `html`，`html` 保留 `var(--c-bg-night)` 底色与 `height:100%`。
   - `body` 去掉这层图片背景（`background:none`），保留 `body.emotion-*` 的 `background-color` 蒙色与 1.2s 过渡；补 `min-height:100%`。
   - 理由：`body` 现有 `padding:10px 16px 8px` + `height:100%`，`background-attachment:fixed` 会被裁剪到 body 的 padding box，底部 8px 只剩 html 底色；body/html 两层背景在分数像素（浏览器缩放/系统 DPI）下容易出现接缝。迁到 `html` 后背景不再被 padding 裁剪。
2. 新增固定兜底层 `body::after`：`position:fixed; left:0; right:0; bottom:0; height:4px; background:var(--c-bg-night); pointer-events:none; z-index:2;`，盖住亚像素接缝。
   - 层级低于 `#bg-snow-front`(z3) 与 `#journalStage`(z5)，不遮挡书页与前景雪；高于 `#emotion-bg`(z0) 与 `#bg-snow-back`(z1)。
3. `diary.html` L10 版本号 `css/diary.css?v=20261025b` → `20261102b`。
4. 不动 `#journalStage` / `fitBook` / 书页素材 `Atlases/Journal/*.png`。

### D3 验证方式

- 用本地 8123 的 `_tmp_diary_check.html`（已注入 dev token、自动关明信片）截图。

```powershell
& 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' --headless=new --disable-gpu --no-sandbox `
  --user-data-dir=C:\Users\28464\AppData\Local\Temp\edgeudsX `
  [--force-device-scale-factor=1.25] --window-size=W,H --virtual-time-budget=4000 `
  --screenshot=C:\Users\28464\AppData\Local\Temp\diarycheck\<name>.png `
  http://localhost:8123/_tmp_diary_check.html
```

- 四组：1366×768、1600×900、1920×1080、1536×864@1.25。
- Python 扫描每张图底部 6 行，统计 `r,g,b > 225` 的采样点占比，要求 < 2%。
- 注意：无头环境下书页大图若未加载，`fitBook()` 会提前 return，书页可能不可见；该截图只用于"底部是否白"判定，不作为书页视觉验收。
- demo：1366×768 截图确认场景与聊天卡正常；代码复核 `chatHidden` 分支与 `renderAcc` 30fps 节流。

### D4 清理

- 删除 `blog-ui/_tmp_diary_check.html`、`%TEMP%\diarycheck\*`、`%TEMP%\edgeuds*`。
- 停止本地 8123 / 8124 python 服务（后台命令 `53e3846db5f90d82b238a15b56234ba4`、`5e1c7bfbe3236be7e856fe717e3cb0b3`）。**验证通过后再停**。

## 风险与待确认

- 若白带实际是 `Atlases/Journal/page.png` 白纸底部留白本身（书页白纸直接贴到屏幕底），D2 的 4px 兜底层在书页之下，不会覆盖；此时需要用户提供截图或说明白带的水平范围（满屏宽 vs 仅书页宽），再决定是否调整 `fitBook`/书页定位，禁止盲目加大遮罩。
- 背景迁到 `html` 后需截图复核 `background-attachment:fixed` 在高 DPI/缩放下的表现（预期与现状一致）。
- 不得回退本轮已完成的日记 delta / TextFx 镜像逻辑。

## 验收标准

- [ ] `celeste-farewell-remembered-demo.html`、`messages.html` 的 `messages.js?v=` 均为 `20261102a`
- [ ] `css/diary.css` 中 `body` 不再挂固定背景图、`html` 承载完整背景；`body::after` 4px 兜底存在
- [ ] `diary.html` 引用 `css/diary.css?v=20261102b`
- [ ] 四组截图底部 6 行近白占比 < 2%，页面无新增报错
- [ ] 临时文件与本地服务已清理
- [ ] 用户确认日记底部白带消失（或提供截图以继续定位书页白纸情形）
