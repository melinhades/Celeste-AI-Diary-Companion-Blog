# Tasks — farewell demo 聊天室 + 场景互动

> 依据 `spec.md`。按顺序执行，每项完成即勾选；未通过验证不得进入下一项。

* [x] T1 · 聊天室结构补齐（HTML + 内联 CSS）

  * 文件：`blog-ui/celeste-farewell-remembered-demo.html`

  * 内容：`.msg-side` rail（山间聊天单项）；`#hud` 两行；`#mute` 右上；`#chatToggle` + `.scene-hint`；内联 CSS 改为居中卡片、`#chatLog` 内部滚动、`chat-hidden` 动画、窄屏底部抽屉。

  * 完成条件：1280×800 下卡片垂直居中；390px 宽不溢出；rail 可见；旧场景元素位置不被 HUD 遮挡。

  * 验证：主卡 900×530、中心偏移 `dx=0/dy=0`；390×844 下 390×523 贴底、rail 隐藏、无横向溢出。

* [x] T2 · 收集品表情与渲染

  * 文件：`blog-ui/js/messages.js`

  * 内容：`COLLECT_SRC`、`EMOJI_PACKS.col`、`seriesList` 第 6 项、`currentEmojis` 分支、`renderChatContent` 的 `🍓/🪼/🪶` 归一化与 `[c:*]` 图片替换。

  * 完成条件：插入与手输 emoji 均渲染正确；收集图标不被 `EmojiAnim` 绑定；`messages.html` 表情面板无回归。

  * 验证：`messages.js:159-161` 归一化 + 三张素材均 200；`bindEmojis` 只扫非 collect 系列。

* [x] T3 · 聊天显隐与滚动自适应

  * 文件：`blog-ui/js/messages.js`

  * 内容：`logScrollEl()` 自适应滚动；`chatHidden` / `showChat` / `hideChat` / `toggleChat`；仅存在 `#chatToggle` 时绑定 Enter / Esc / 移动键隐藏 / 胶囊点击 / `chat:reveal` 事件；`onInputKey` 支持 Esc；`doSend` 聚焦条件。

  * 完成条件：A/D 隐藏并可操作角色；Enter 显示并聚焦；Esc 隐藏；他人消息自动显示不抢焦点；`messages.html` 仍按页面滚动回底。

  * 验证：`A` → `chat-hidden` + `opacity:0` + `pointer-events:none` + 胶囊出现；`Enter` → 淡入且焦点 `#chatInput`；`chat:reveal` → 淡入但焦点停在 `BODY`。

  * 追加修复：就地 DOM 模板挂载不会 patch 容器根级属性，原 `:class="{'chat-hidden': chatHidden}"` 恒不生效 → 新增 `syncChatHiddenClass()`（`showChat` / `hideChat` / `onMounted` 三处同步），并移除 demo 根节点上的死绑定。

* [x] T4 · 素材与场景状态

  * 文件：`blog-ui/celeste-farewell-remembered-demo.html`（内联脚本）

  * 内容：`preload()` 追加 10 草莓 wings、10 水母、42 羽毛、球体与 4 变形帧；`leader/berries/jellies/feathers/fly` 状态；IIFE 顶部同步暴露 `window.ChatScene`（含 `ready` 与待处理队列）。

  * 完成条件：所有素材 200；`ChatScene` 在 `messages.js` 挂载时即可调用（不因异步加载丢失消息）。

  * 验证：`?scenetest` 页面 `preload()` 全量 resolve 后进入 `runSelfTest()`，无素材 404；`sceneReady` 后回放 `sceneQueue`。

* [x] T5 · 草莓跟随

  * 文件：同上

  * 内容：`stepLeader`（0.02s / ≥3px / 350）、`addBerry`（上限 10、`FollowDelay=0.3`、`1-0.01^dt`、`wings` 10 帧 0.08s、`spawnT`）、`drawBerries`、`updateHud`。

  * 完成条件：3 颗草莓跟随；累计停在 10；HUD 同步。

  * 验证：12 颗输入 → 10；延迟期 18 帧位置差 0。

  * 备注：水母伴飞版本已被 T11 取代（原作水母是 `Holdable`，不是装饰物）。

* [x] T6 · 金羽毛 + StarFly

  * 文件：同上

  * 内容：`spawnFeather`（相机左右侧随机、上限 6）、羽毛 idle/flash 循环、触碰半径 14、变形 0.42s、飞行常量与边界/实心反弹、末 0.5s 闪烁、`endFly` 收尾与头发恢复、`respawn` 清理。

  * 完成条件：羽毛随机出现在卡片外侧；触碰后飞行 2s 正常落地；不重生；空无与坠落逻辑在飞行期不误触发。

  * 验证：8 个羽毛输入 → 6，坐标全在 `[-304,304]×[-288,48]`；触碰 → 飞行 146 帧结束；结束后 `count=4 / colorIdx=0 / rigid=false`。

* [x] T7 · SSE 接线与入口切换

  * 文件：`blog-ui/js/messages.js`、`blog-ui/js/auth.js`、`blog-ui/js/seed.js`

  * 内容：SSE 回调 `ChatScene.consume` + `revealChat`（排除 bird/自己）；`auth.js` 聊天鸟链接指向 demo；`seed.js` 注册文件指向 demo（id 保持 `messages`）。

  * 完成条件：从任意页面点聊天鸟进入新页面；发言触发互动；他人消息显现聊天框；草莓籽正常散落。

  * 验证：`consume` 仅 SSE 回调一处（历史回放不触发）；`auth.js:14` 与 `seed.js:77` 均指向 demo；23 处 `js/*.js` 引用统一 `?v=20261101c`。

* [x] T8 · 数值断言

  * 文件：临时目录脚本（不入库）

  * 内容：`spec.md §10.1` 的 `__test` 断言。

  * 完成条件：全部通过，退出码 0。

  * 验证：Node vm **19 pass / 0 fail**。

* [x] T9 · 浏览器验收 + 缓存版本

  * 内容：`spec.md §10.2` 的 10 条验收；`auth.js` / `messages.js` / `seed.js` 版本号按 `§10.3`。

  * 完成条件：全部通过、无 console 错误。

  * 验证：无头 Chromium 两套视口实测（详见 `checklist.md`）；`?scenetest` **49 pass / 0 fail**；无新增异常。后端 `localhost:8888` 未启动，真实双客户端 SSE 收发未跑（`chat:reveal` 用事件直投等价验证）。

* [x] T10 · 研究文档

  * 文件：`celeste-dash-反编译研究.md`

  * 内容：Leader/Follower 证据、草莓 flap、Glider idle、FlyFeather loop/flash、StarFly 移植状态与偏差表；第七轮水母 `Holdable` 全链路取证。

  * 完成条件：每条结论标注 `Celeste.dll` 类型/成员；未决项单列。

  * 验证：新增第 24 节（24.1–24.8，偏差 K1–K3 / 未验证 U1–U6）与第 25 节（25.1–25.11，偏差 D9–D17 / 未验证 U7–U14），含程序集 SHA-256 与方法 token。

* [x] T11 · 水母 Holdable 改造（第七轮）

  * 文件：`blog-ui/celeste-farewell-remembered-demo.html`（内联脚本）、`blog-ui/js/celeste-character.js`

  * 内容：`GLIDER` 常量（`Holdable(0.3)`、`releaseGravity .1`、`throw (100,-40)`、`recoil -80`、`PickupCollider 20×22`、`carryY -16`）；`🪼` → `spawnJelly()`（相机可见区随机、避实心、上限 4）；`inPickupRange` / `tryPickupJelly` / `releaseJelly` / `throwJelly`；`stepJellies` 的持有/未持有物理、碰撞反弹、撞玩家销毁、死亡回收；`jellyImage` / `drawJellies`（idle / held / fall→fallLoop / death，图层在人物之后）；`tick` 持有段（按住拾取 / 松开 Throw / 地面 ↓ Drop）；引擎新增 `holdSlowFall`（maxFall 40/120/24、重力 ×0.5、空中 maxRun 108 + 加速度 ×0.5、屏蔽墙滑）。

  * 完成条件：水母随机刷新、可抓取持有缓降、投掷/丢弃、未持有独立物理、撞玩家销毁；不结算。

  * 验证：`?scenetest` 水母专项全 PASS（详见 T12）。

* [x] T12 · 水母数值断言 + 无头验收

  * 文件：临时 CDP 脚本（不入库）

  * 内容：`spec.md §10.2` 的 4 / 4a / 4b / 4c；刷新避实心、`PickupCollider`、carry、缓降、投掷/后坐、Drop、冷却、撞玩家销毁、死亡回收。

  * 完成条件：全部通过、无 console 异常。

  * 验证：无头 Chromium（1280×800）`?scenetest` **49 pass / 0 fail / 0 exceptions**；缓存 `celeste-character.js?v=20261102b`。

# Task Dependencies

* T5 依赖 T4

* T6 依赖 T4、T5（共用 `leader` 与 `updateHud`）

* T7 依赖 T2、T3、T4

* T9 依赖 T1–T8；T10 可与 T9 并行
* T11 依赖 T4、T6（复用相机可见区取点；与 `fly` 互斥）
* T12 依赖 T11

