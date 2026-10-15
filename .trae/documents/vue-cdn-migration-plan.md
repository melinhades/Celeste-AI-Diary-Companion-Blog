# Vue 3 CDN 增量迁移计划

## Context（为什么做这件事）

当前 `blog-ui/` 是零构建工具的多页 vanilla JS 架构：20 个手写 HTML 页面 + 26 个全局 JS 模块（`window.api` / `window.BadelineVoice` / `window.RoundtableScenes` / `window.BerryPPT` 等），无 `package.json` / `node_modules` / Vite / webpack。表单状态、列表渲染全靠 `innerHTML +=` 与手写 DOM 操作，维护成本高、状态难追踪。

目标：在**原版效果 100% 不变**的前提下，用 Vue 3 的响应式与模板能力替换数据驱动部分（表单、列表、状态切换），复杂特效（像素动画、SSE 流、音效、自定义光标、字体）保持 vanilla 不动。

用户已拍板三项约束：

1. **Vue 3 via CDN**（不引 npm / Vite / SFC）
2. **先迁简单页面**（login / register / archives）做试点，再扩展
3. **全部** **`window.X`** **全局对象保持不变**，Vue 通过 `onMounted` 调用它们

## 关键发现（已核对实际文件）

* [login.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/login.html) 仅加载 `js/api.js` + `js/snow-bgm.js`，页内 IIFE 处理表单/密码强度/Caps Lock/slide-in/loading overlay

* [archives.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/archives.html) 加载 `js/api.js` + `js/text-fx.js` + `js/auth.js` + `js/seed.js`，用 `innerHTML +=` 拼年/月/文章树，事件委托切换 `.month-block.collapsed`，`IntersectionObserver` 给 `.year-group` 加 `in-view`

* 项目记忆明确记载 **Python SimpleHTTP 不支持 Range**（BGM 已 fetch→blob 兜底），因此**不能依赖 unpkg CDN 实时联网**——需把 `vue.global.prod.js` 自托管到 `blog-ui/js/`，走相对路径，与现有 `?v=` 缓存策略一致

## 接入模式（自托管 CDN 产物）

新增一个文件：`blog-ui/js/vue.global.prod.js`（约 130KB，Vue 3 官方 UMD 产物，非源码修改，属引入第三方库）。

每个迁移页在 `</body>` 前、`api.js` 之后引入：

```html
<script src="js/api.js?v=20261002"></script>
<script src="js/vue.global.prod.js?v=20261008a"></script>
<script src="js/snow-bgm.js"></script>
<!-- 页内 Vue 应用脚本 -->
```

访问方式：`const { createApp, ref, reactive, onMounted, nextTick, computed } = Vue;`。不使用 SFC、不使用 ES module import、不使用 TypeScript。

## 每页通用迁移模板

1. **识别挂载点**：选稳定容器（如 `.login-box`、`#archiveContent`）。Vue 接管容器内部 DOM；外部（`header`、`#snowCanvas`、`#bgmPlayer`、`.stars`、Madeline 行为树 IIFE、loading overlay）保持 vanilla
2. **替换 DOM 操作**：`innerHTML +=` / `appendChild` / `classList.toggle('show')` → `v-for` / `v-if` / `:class` / `{{ }}`。状态放进 `ref` / `reactive`
3. **接入 window\.X**：`onMounted` 内**直接按值调用** `window.api(...)`、`window.initHeader()`，返回值赋给 `ref`。**绝不** `ref(window.api)`（会触发深层响应式代理）
4. **保留 IIFE**：不涉及数据渲染的 IIFE（音效兜底、`document.fonts.ready`、`requestAnimationFrame` slide-in、雪花 canvas、Madeline 行为树、seed 彩蛋）整体保留为 vanilla `<script>`，**不进 Vue**
5. **自定义事件总线**：`onMounted(() => window.addEventListener('berries:change', e => state.berry = e.detail.balance))`，`onUnmounted` 里 `removeEventListener`。事件名沿用 `berries:change` / `notify:unread`，不改 [api.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/api.js) / [auth.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/auth.js)

## 三个试点页设计

### login.html

* 挂载到 `.login-box`

* 状态：`account, password, showPw, capsOn, errMsg, errShow, loading, avatarSrc, validClass`

* 模板内联在原 HTML（DOM 模板模式，`createApp({setup(){...}}).mount('.login-box')`）

* `:type="showPw ? 'text':'password'"`，密码框焦点用 `ref` 拿 input 实例

* Caps Lock：`@keyup="e => capsOn = e.getModifierState('CapsLock')"`、`@blur="capsOn = false"`

* 实时校验：`@input` 改 `validClass`

* 提交：`async submit()` 内 `await api('/login','POST',{account,password})`，成功走原逻辑（`localStorage` 存 token、隐藏 `.login-box`、显示 `#loginLoadingOverlay`、`setTimeout(location.href,1200)`）

* 动画/sfx/snow/stars/loading overlay 全部保留 vanilla

### register.html

* 同 login.html，挂载到 `.register-box`

* 状态多一项：`pw2, strength(0-3), matchHint`

* `computed` 算 `strengthLabel` 与三段 `strength-bar` 的 class

* 其余 sfx/slide-in/loading overlay 保留 vanilla

### archives.html

* 挂载到 `#archiveContent`

* 状态：`groups`(年→月→文章树)、`demo`(bool)、`totalPosts`、`mineCount`

* 模板用嵌套 `v-for` 渲染 year-group / month-block / archive-item，`:class="{collapsed: m.collapsed, 'in-view': m.inView}"`

* `onMounted`：`const res = await api('/articles/listArchives','POST')`，分组后赋值；token 存在则并行 `api('/articles/myCount','GET')`

* 折叠点击：`@click="m.collapsed = !m.collapsed"`，删旧事件委托

* IntersectionObserver：数据 ready 后 `await nextTick()` 再扫描 `.year-group` 并 `observe`，`onUnmounted` 里 `unobserve`

* `seed.js`、Madeline 行为树 IIFE、`initHeader()` 保留为 vanilla，不进 Vue

## 与 vanilla 共存（text-fx 等后期生效库）

* archives 当前 `text-fx.js` 只在 Madeline 彩蛋气泡里用，气泡由 IIFE 重建 `innerHTML`，**不在 Vue 渲染区**，无需特殊处理

* 后期 diary/messages 接入时：`onMounted(async () => { await nextTick(); window.TextFx.attachAll(root.value, 'textarea,input[type=text]', words); })`。Vue 更新数据后若重建 DOM，必须在 `watch` / `onUpdated` 里手动 `attachAll`，**或**用 `v-once` / `v-memo` 冻结那块 DOM 避免重渲染。打字机场景（diary.js SSE）保持 IIFE 直接 `TextFx.set(el, text)`，Vue 不接管该文本节点

## 像素艺术 / 字体 / 光标

`css/common.css`、`@font-face`、`<link rel="preload">`、`image-rendering:pixelated`、`celeste-portraits/*`、`cursor.png` 全部是页面级 CSS/资源，Vue 只接管容器内 DOM，**不影响**这些全局样式与资源。无需任何动作。

## 风险清单与缓解

| 风险                                                                       | 缓解                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `v-for` 重排 DOM 导致 text-fx 的监听丢失                                          | 文本动画节点用 `v-memo` 冻结，或挪出 Vue 挂载区由 IIFE 维护                                                    |
| `window.api` 等全局被装进 `ref()` 触发深层响应式代理                                    | 全局函数按值调用，绝不 `ref(window.api)`；状态用普通 `ref` 持标量                                               |
| SSE 流（diary.js `POST /diary/companion/stream`）无法被 Vue `onUnmounted` 干净中止 | 试点页无 SSE；后期 diary 迁移时把 `AbortController` 放在 `setup` 闭包，`onUnmounted` 调 `abort`（多页跳转不卸载，风险低） |
| IntersectionObserver 在 Vue 重渲染后失效                                        | 数据 ready 后 `await nextTick()` 再 `observe`，`onUnmounted` 里 `unobserve`                       |
| `e.target.closest('.month-row')` 事件委托失效（Vue 已用 `@click` 行内绑定）            | 直接改行内 `@click`，删旧委托监听                                                                       |
| 像素动画 GIF `madeline-move.gif` 切换 `pm.src` 被 Vue 接管会重置                     | Madeline 行为树 IIFE 保留在 Vue 挂载区外，互不干涉                                                         |
| localStorage 与 Vue 状态双写不一致                                               | localStorage 仍由 api.js/auth.js 单点读写，Vue 只读不写；写时显式调 `localStorage.setItem`                   |
| Caps Lock/密码强度等键盘事件在 Vue `@keyup` 下与原生行为差异                               | `@keyup.passive` + 显式 `e.getModifierState`，行为完全等价                                           |

## 验证策略（"原版效果不变"）

每个试点页跑一遍：

**login.html**：未登录访问 → 星星闪烁、雪花飘、slide-in 入场、BGM 触发；空提交 → 红框 + shake 错误 + Madeline 变 `sad00.png`；错误账号 → "Wrong account or password"；正确账号 → Madeline 变 `determined00.png`、loading overlay 显示、1.2s 后跳 `index.html`、`localStorage` 有 token+nickname；勾选 Remember me → 关闭重开账号回填；Caps Lock 按下 → 黄色提示

**register.html**：3-20 字符正则校验、密码 6 位下限、强度计三段颜色递进、确认密码 ✓/✗、提交成功 sfx `page3.wav`、loading overlay、跳转 `login.html`

**archives.html**：后端在线 → 标题 "X posts total" + "你写了 Y 篇"；后端离线 → DEMO\_ARCHIVES 五条 + "offline demo"；月份横线 hover 框架放大、点击折叠/展开 caret 旋转；年分组 IntersectionObserver 渐入；Madeline 行走 + 点击彩蛋气泡（TextFx 三种动画）；BGM 续播（`localStorage bgmTime`）；header 显示昵称/未读铃铛

建议用浏览器并排开迁移前后两版做视觉对照（同分辨率、同时间）。

## Roll-forward 可行性（后期扩展，本次不实现）

* **index.html**：文章卡片网格 → `v-for`，header 由 `initHeader()` 不动，浆果/未读用 `addEventListener`。可行

* **article.html**：单篇文章渲染 → 单 ref，评论列表 `v-for`，SSE 不动。可行

* **diary.html**：书页 `v-for` + `v-memo` 冻结每页 DOM，SSE/打字机/镜像层 TextFx 保留 IIFE。可行但需最谨慎

* **messages.html**：消息流 `v-for`，实时 SSE 用 `ref` push，TextFx 适配。可行

* **roundtable.html / berryos.html**：场景切换 `v-if` + `:is`，但 `RoundtableScenes` / `BerryDetect` 等全局保留 IIFE，Vue 仅做容器切换。可行

## 关键文件清单

* [login.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/login.html)（待改）

* [register.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/register.html)（待改）

* [archives.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/archives.html)（待改）

* [api.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/api.js)（只读引用，不改）

* [auth.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/auth.js)（只读引用，不改）

* [text-fx.js](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/js/text-fx.js)（只读引用，不改）

* `blog-ui/js/vue.global.prod.js`（**新增**，Vue 3 官方 UMD 产物，约 130KB）

