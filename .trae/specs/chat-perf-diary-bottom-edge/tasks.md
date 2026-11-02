# 任务清单 · 聊天室性能 + 日记底部白带

> 说明：聊天室性能的主体改动已完成，本轮只做 cache-bust 与验证；日记白带做结构性兜底。验证通过后清理临时文件并停服务。

## T1 聊天室脚本 cache-bust（高）

* [x] `blog-ui/celeste-farewell-remembered-demo.html`：L1795 `js/messages.js?v=20261101c` → `js/messages.js?v=20261102a`

* [x] `blog-ui/messages.html`：L143 同样改为 `js/messages.js?v=20261102a`

* 验收：两处版本号一致；页面仍能正常加载（截图/控制台无新增报错）

## T2 diary.css 背景迁移与底部兜底（高）

文件：`blog-ui/css/diary.css`

* [x] L85–103 区段：`html` 承接原 body 的固定背景（渐变 + `../celeste-gui/diary-bg.webp`，`center / cover no-repeat fixed`），保留 `height:100%` 与 `var(--c-bg-night)` 底色

* [x] `body` 改为 `background:none`，补 `min-height:100%`；保留 `body.emotion-*` 的 `background-color` 蒙色与 `transition: background-color 1.2s ease`

* [x] 新增 `body::after`：`position:fixed; left:0; right:0; bottom:0; height:4px; background:var(--c-bg-night); pointer-events:none; z-index:2;`

* [x] 不改 582–596 行雪层、707–731 行日记本定位，不改 `Atlases/Journal/*.png`

## T3 diary.css 版本号（高）

* [x] `blog-ui/diary.html` L10：`css/diary.css?v=20261025b` → `css/diary.css?v=20261102b`

## T4 截图验证底部无白（高）

前置：`http://localhost:8123/_tmp_diary_check.html` 可访问。

* [x] 1366×768、1600×900、1920×1080、1536×864@`--force-device-scale-factor=1.25` 各截图一张

* [x] Python 扫描每张图底部 6 行，`r,g,b > 225` 采样占比 < 2%

* [x] 复核白带是否消失；若仍存在，记录白带水平范围（满屏宽 / 书页宽）并向用户索取截图

## T5 demo 性能复核（中）

* [x] 1366×768 截图确认场景画布 + 居中聊天卡正常渲染

* [x] 代码复核：`chatHidden` 时满帧、展开时 30fps；`#chatPane` 等三处无 `backdrop-filter`

* [x] 确认无新增 JS 报错（可复用一次 browser 工具或观察页面行为）

## T6 清理（中，验证通过后执行）

* [x] 删除 `blog-ui/_tmp_diary_check.html`

* [x] 删除 `%TEMP%\diarycheck\*` 与 `%TEMP%\edgeuds*`

* [x] 停止后台 python 服务：`53e3846db5f90d82b238a15b56234ba4`、`5e1c7bfbe3236be7e856fe717e3cb0b3`

## 交付

* 代码改动：`css/diary.css`、`diary.html`、`celeste-farewell-remembered-demo.html`、`messages.html`

* 报告：白带修复结论（是否已消除 / 是否需用户截图继续定位）、四组截图底部像素统计

## 执行结果（2026-11-02）

* T1：两处 `messages.js` 版本号已改为 `20261102a`。

* T2 / T3：`diary.css` 固定背景迁到 `html`，新增 `body::after` 4px 兜底；`diary.html` 引用 `css/diary.css?v=20261102b`。

* T4：四组截图底部 6 行近白占比均为 **0.000%**；最后一行为夜色 rgb(25,39,69)。

  * 1366×768、1600×900、1920×1080、1536×864\@125%（输出 1920×1080）。

* T5：demo 1366×768 场景正常；注入 token 后聊天卡正常渲染，控制台无页面级 Uncaught（仅有扩展日志）。

* T6：`blog-ui/_tmp_diary_check.html`、`blog-ui/_tmp_demo_check.html`、`%TEMP%\diarycheck`、`%TEMP%\edgeuds*` 已删除；8123 / 8124 python 服务已停止。

* 未决：无头环境下书页大图未载入，无法复现用户的白带；需用户在实际浏览器确认。若白带仍存在且水平范围仅等于书页宽度，则来源是 `Atlases/Journal/page.png` 白纸底部留白贴到屏幕底，需用户截图后再单独处理。

