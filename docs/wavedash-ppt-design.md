# wavedash PPT 生成器：事实核验与 AI 补全方案

> 状态：调研 + 方案，未改业务代码、未新增依赖。
> 日期：2026-11-06
> 结论版本：播放器是**能跑的实现**；缺的两段是 **AI 文本生成** 和 **AI 图片生成**，不是播放器，也不是版式。
> 范围：`blog-ui/berryos.html` 内嵌的 6 页 wavedash 幻灯片；`blog-api` 的 AI/存储能力；免费图像生成路线。

---

## 0. 事实核验：播放器能跑，不是空壳

### 0.1 判定

**能跑的实现**：桌面图标可进入，6 页数据是硬编码的完整内容，DOM 真实存在，实际能打开、自动翻页、方向键翻页，控制台无报错。

但“能跑”的边界要说清：

| 对象 | 状态 | 说明 |
|---|---|---|
| 播放器/转场/逐字/音效 | ✅ 能跑 | `berryos.html:563-999`，实测可播放 |
| 6 页 deck 数据 | ✅ 有 | `berryos.html:508-551`，硬编码 6 页，不是空数组 |
| 桌面入口 | ✅ 有 | 双击 `凌波微步与我.ppt` 图标进入 |
| AI 文本生成 | ❌ 未落地 | `pptgen.js` 请求的 `/ppt/generate` 在后端不存在 |
| AI 图片生成 | ❌ 未落地 | `pptgen.js` 请求的 `/ppt/image` 在后端不存在 |
| 可填内容的模板系统 | ❌ 未实现 | 6 页的坐标/文案/配图仍写死；这是“模板抽象”缺失，不是播放器缺失 |

所以：**不需要重写播放器，也不需要从视觉参考重做。** 方案只围绕补齐 AI 文本、AI 图片两段。

### 0.2 四项证据

#### 1）437 行渲染器确实被调用

- 图标定义：`berryos.html:371`，`icoPpt` 的 `player: 'monthly'`。
- 桌面点击入口：`berryos.html:387-398`，第二次点击执行 `window.BerryPPT.open(player)`（`392`）。
- 全局导出：`berryos.html:1000`，`window.BerryPPT = PPT`。
- 打开链路：`PPT.open()`（`854-894`）→ `render()`（`577-627`）→ `go(0)`（`805-821`）→ `land(0)`/`scheduleNext(0)`。
- 键盘入口：`berryos.html:1003-1009`，`ArrowRight/Space` 下一页，`ArrowLeft` 上一页，`Esc` 退出。

不是“没入口”。入口是 BerryOS 桌面图标 + 打开后的键盘/点击。

#### 2）数据是硬编码的 6 页，不是接口数据

- `SLIDES` 在 `berryos.html:508-551`，6 个对象，含 `bg / tr / dur / items[]`；P1 有标题和副标题，P2 有 5 条要点，P6 有结尾和 Bird 图。
- 没有任何 `fetch('/ppt/...')` 在播放器里取数据；`pptgen.js` 是外部脚手架，默认仅在 AI 不可用时把 fallback 数据交给 `setSlides`。
- `pptgen.js:403-454` 的 `generate()` 尝试 `POST /ppt/generate`（`414`）；`blog-api` 的 Controller 中没有 `/ppt` 映射，请求必然失败，随后走 `buildFallbackFromDiary`。
- `pptgen.js:460-489` 的 `genImage()` 尝试 `POST /ppt/image`（`481`），同样不存在。
- `detect.js:27-42` 从 `localStorage` 的 `jbook-*` 取日记；但 `diary.js:2303-2305` 保存成功后清空这些 key，`pptgen.js:491-508` 的 `triggerAndOpen` 在 `diary.html` 里也没有播放器可调。这条“自动生成”链路是断的，不应作为能力基线。

#### 3）播放器需要的 DOM 真实存在

- `#pptPlayer / #pptTurn / #pptTurnBox / #pptHint` 在 `berryos.html:354-360`。
- `#pptSplash` 不是静态 HTML，是 `render()` 动态创建并挂到 `body`（`577-579`），也存在。
- 样式在 `176-331`；`.slide` 默认 `display:none`，`.active` 才显示；`#pptTurnBox` 常驻 6 个 `section.slide`。
- 没有“JS 找不存在的节点”的问题；`render()` 里 `document.getElementById` 都有对应节点。

#### 4）实际翻页验证

本地起 `python -m http.server 8123`（`blog-ui` 根目录），用浏览器实际点击：

- 桌面加载成功，`凌波微步与我.ppt` 图标可见。
- 两次点击图标后，播放器打开。
- 页面出现浅黄色 P2“学不会 凌波微步？”；原因是 P1 的 `dur=6000`，`scheduleNext` 按 `dur*1.3=7800ms` 自动翻页，截图时已经自动进入 P2，不是“跳过 P1”。
- 按 `ArrowRight` 后背景依次切到浅绿、粉色、浅紫，说明转场和翻页都在工作。
- `browser_console_messages` 返回无 JS 错误。

结论：**能跑的实现**。如果只看“模板系统/自动生成”，那确实没实现；但播放器和 6 页 deck 本身是实现的。

---

## 1. 现有播放器复用点

### 1.1 输入形状（不要改）

`BerryPPT.setSlides()` 接受的就是现有 `SLIDES` 结构，前端不需要新的布局引擎：

```js
[
  {
    bg: '#9FC5E8',
    tr: 'cube',          // '' | fade | scale | spin | blocky | cube
    dur: 6000,           // 毫秒；null = 不自动翻
    items: [
      {
        cls: 't-cover anim-zoom',
        chars: true,
        stream: true,
        d: 0.15,
        x: 7.28, y: 12.87, w: 85.4,
        t: '凌波微步与我'
      },
      {
        kind: 'ph',       // 占位图
        t: '本月配图位',
        ratio: 10.87 / 6.11,
        x: 29.63, y: 21.27, w: 40.76
      }
    ]
  }
]
```

这意味着：**AI 文本和图片都由后端/适配层组装成这个形状，前端只调用 `setSlides`。** 不需要抽取渲染器，也不需要重写 `berryos.html`。

### 1.2 可直接用的 API

`window.BerryPPT`（`berryos.html:1000`）已暴露：

| 方法 | 行为 | 用途 |
|---|---|---|
| `setSlides(slides)` | 重建 `#pptTurnBox`，`cur=-1`，不自动播 | 换新 deck |
| `open()` | 显示播放器、等 BGM、`go(0)` | 从桌面打开 |
| `show(n)` | `go(n)` | 已在播放器内时跳到某页 |
| `next()/prev()` | 翻页 | 受控播放 |
| `close()` | 关闭 | 退出 |
| `rebuild()` | `setSlides(SLIDES)` | 恢复当前 deck |
| `isOpen` | 是否显示 | 状态判断 |

集成方式：

```js
BerryPPT.setSlides(newSlides);
if (BerryPPT.isOpen) BerryPPT.show(0);
else BerryPPT.open();
```

注意：`setSlides` 会把 `cur` 归零但不自动 `go(0)`；如果播放器已经打开，必须再 `show(0)`，否则新 DOM 全部是 `display:none`，看起来像“黑屏/空白”。

### 1.3 播放器唯一需要的小改动

如果 AI 图片在文本之后异步到达，直接 `setSlides` 重建会重播整页动画。建议只加一个小能力：

- `render`/`setSlides` 给图片 item 加 `data-key`；
- 暴露 `BerryPPT.patchImage(key, url)`：找到对应 `img` 或 `.ph`，替换 `src`/移除占位内层，不重建整页。

预计 10-20 行，属于“小补丁”，不是重写。若第一版图片是同步生成、随文本一起返回，则暂时不需要这个补丁。

---

## 2. AI 文本生成

### 2.1 复用现有 `AiClient`

`blog-api/src/main/java/com/mszlu/blog/service/ai/AiClient.java` 已具备：

- 主模型/快模型两套配置：`ai.base-url / ai.api-key / ai.model / ai.fast-model / ai.fast-base-url / ai.fast-api-key`（`51-85`）。
- JSON 模式：`chat(messages, jsonMode, model)`，`jsonMode=true` 时请求体带 `response_format={"type":"json_object"}`（`483-485`）。
- 限流与容错：全局最小间隔 800ms（`117-128`）、429 重试 3 次、指数退避（`121-126`）、读超时 30s（`99-101`）、熔断器（`107-113`、`400-426`）。
- BYOK：优先用户 Key，其次系统 Key（`141-154`）。

**不新引模型依赖，不新引 SDK。** 文本生成直接调用 `AiClient`。

一个需要知道的现状：`chat()` 里 `temperature` 硬编码 `0.8`（`482`），对结构化文案偏高。建议加一个可选 `temperature/maxTokens` 的重载（小改动，不新增依赖），PPT 文案用 `0.2-0.4`；如果不改，就靠 JSON 模式 + 服务端校验兜住。

### 2.2 新 Controller 还是复用 `/chat`？

| 方案 | 代价 | 结论 |
|---|---|---|
| **新建 `POST /ppt/generate`（推荐）** | 新增 `PptController` + `PptService` + prompt builder + DTO；后端要部署一次 | 契约清楚、可 JSON 模式、可服务端校验/重试/缓存、可统一编排图片；不新增依赖 |
| 复用 `POST /chat/generate-article` | 零后端改动；但它返回纯文本、无 JSON 模式、无 schema 校验、无页级重试；前端要自己解析和兜底 | 只适合原型，不建议作为正式链路 |
| 复用 `POST /chat` | 零后端改动；但会带 Madeline 人设/历史上下文，输出不是稳定 JSON，容易污染对话 | 不推荐 |

推荐：**新建 `PptController`**，路径 `/ppt/generate`，内部只调 `AiClient`，不碰 ChatService 的人设与历史。

接口草案：

```json
POST /ppt/generate
{
  "topic": "凌波微步",
  "outline": ["是什么", "为什么难", "怎么练", "常见坑"],
  "tone": "轻松、自嘲、像朋友聊天",
  "pageCount": 6,
  "sourceText": "可选：一篇文章/日记原文"
}
```

响应直接是播放器可吃的 `slides` 形状（见 1.1），外加 `meta`：

```json
{
  "meta": { "topic": "凌波微步", "source": "ai|fallback", "model": "..." },
  "slides": [ { "bg": "#9FC5E8", "tr": "", "dur": 6000, "items": [ ... ] } ]
}
```

### 2.3 提示词设计：AI 只填 slots

系统提示词（骨架）：

```text
你是“wavedash 主题 PPT”的文案作者。
只输出一个 JSON 对象，不要 markdown、不要解释、不要 HTML。
页面固定 6 页，版式由系统决定；你只填每页 slots 的文本。
风格：轻松、具体、有自嘲感；不要空话；不要编造事实。
每页字数必须遵守给定上限；imagePrompt 只描述画面，不要出现文字。
```

用户提示词：

```text
主题：{{topic}}
大纲：{{outline}}
语气：{{tone}}
来源文本：{{sourceText}}

输出结构：
{
  "meta": { "title": "..." },
  "pages": [
    { "layout": "cover", "slots": { "title": "...", "subtitle": "..." } },
    { "layout": "bullets", "slots": { "heading": "...", "bullets": ["...", "..."], "aside": "..." } },
    { "layout": "feature", "slots": { "heading": "...", "caption": "...", "kicker": "...", "imagePrompt": "..." } },
    { "layout": "two-column", "slots": { "heading": "...", "left": { "warning": "...", "imagePrompt": "..." }, "right": { "warning": "...", "imagePrompt": "..." } } },
    { "layout": "end", "slots": { "endLine": "...", "imagePrompt": "..." } }
  ]
}
```

字段与长度上限（按现有版式的实际可用宽度估算，服务端强制校验）：

| 字段 | 上限 | 理由 |
|---|---|---|
| `cover.title` | 16 字 | 6.4cqw × 85.4% 宽，约 13 字/行，2 行内 |
| `cover.subtitle` | 28 字 | 1.9cqw × 85.4%，约 45 字/行 |
| `bullets.heading` | 16 字 | 5.4cqw × 70%，约 13 字/行 |
| `bullets.bullets` | 3-5 条，每条 ≤ 20 字，合计 ≤ 90 | 25%-27% 宽，约 14-15 字/行 |
| `bullets.aside` | 8 字 | 6.8cqw × 46%，约 6-7 字/行 |
| `feature.heading` | 18 字 | 5.36% / 90% 宽 |
| `feature.caption` | 30 字 | 1.75cqw × 33%，约 19 字/行 |
| `feature.kicker` | 10 字 | 6.8cqw × 70% |
| `two-column.warning` | 12 字/侧 | 1.5cqw × 17%-28% |
| `end.endLine` | 20 字 | 6.4cqw × 95% |
| `imagePrompt` | 120-200 字 | 只描述画面、风格、构图；不含文字 |
| `notes`（可选） | 80 字/页 | 演讲备注，第一版可不渲染 |

映射规则：AI 返回 `pages[]` 的 slots；`PptLayoutMapper` 按 `layout` 把 slots 转成现有 `items[]`（x/y/w/class）。**AI 不输出坐标、class、CSS、HTML。**

### 2.4 JSON 模式与校验

- `AiClient.chat(messages, true, model)` 开启 JSON 模式。
- JSON 模式只保证“是 JSON”，不保证字段/长度；服务端必须做：
  1. `JSON.parseObject` 解析；
  2. 校验 `pages.length`、`layout` 白名单、必填 slots；
  3. 长度超限时优先在句号/逗号处截断，不硬切；
  4. 丢弃多余字段，不把 AI 文本直接 `innerHTML`；
  5. 任一步失败进入 2.5 的失败路径。
- 如果当前 `ai.base-url` 的服务商不支持 `response_format`，保留 JSON 提示词约束 + 解析容错；上线前用真实 Key 实测一次。
- 安全：播放器非 `chars` 分支使用 `innerHTML`（`berryos.html:988`）。AI 内容应只允许纯文本；`PptLayoutMapper` 输出前做 HTML 转义，或把播放器该行改成 `textContent`（小改动）。

### 2.5 失败路径

| 失败 | 处理 | 结果 |
|---|---|---|
| JSON 解析失败 | 追加一次“只输出 JSON”的修复请求 | 仍失败 → 本地 fallback |
| 30s 超时 / 429 重试耗尽 / 熔断开 | `AiClient` 返回 null | 本地 fallback |
| 字段缺失/超长 | 逐字段用 fallback 补齐/截断 | 该页仍可用 |
| 某一页完全坏 | 用该页的本地模板 | 不空页 |
| 全部失败 | `PptFallback` 按主题生成 6 页 | deck 仍能播放，`meta.source='fallback'` |

本地 fallback 可以直接复用 `blog-ui/js/pptgen.js:282-335` 的 6 页文案骨架，迁到 Java 或留在前端；第一版建议**后端返回 fallback**，保证接口契约统一。

---

## 3. AI 图片生成

### 3.1 先摆事实：项目现在没有图片生成能力

- 后端没有图像生成 Controller/Service；没有 CogView、Flux、SD、DALL·E、Replicate、Stability 等 SDK 或 HTTP 调用。
- 只有“图片上传/存储/读取”：
  - `UploadController`：`POST /upload`，校验 png/jpg/gif/webp、8MB、魔数（`UploadController.java:33-94`）。
  - `R2Utils`：Cloudflare R2，S3 兼容，`put(id, contentType, bytes)` / `get(id)`（`R2Utils.java:81-136`）。
  - `ImageController`：`GET /images/{id}`，优先 R2，回退数据库（`ImageController.java:31-51`）。
- `application.properties:21-27` 有 `r2.enabled/endpoint/bucket/access-key/secret/region/key-prefix`；默认关闭，线上用环境变量。
- 没有图像生成的 API Key 配置。现有 `ai.api-key` 是对话模型 Key，不能假定它同时能调图像 API；需要单独的 `ppt.image.api-key`（可以与智谱/硅基流动同一个 Key，但配置项要分开）。

结论：**图片生成是全新的一段，必须新增 provider 调用 + 下载 + R2 入库；但没有新的存储依赖，R2 已经现成。**

### 3.2 免费图像路线实测与对比（访问日期 2026-11-06）

| 路线 | 真免费？ | 需要新 Key？ | 国内直连 | 单张耗时 | 返回格式 | 额度/限制 | 最坏降级 |
|---|---|---|---|---|---|---|---|
| **智谱 CogView-3-Flash** | ✅ 官方定价“免费” | 否（用现有智谱 Key） | ✅ 国内平台；本机 POST 端点可达 | 官方：“平均只需数秒” | `data[0].url` | 图像模型并发按账号等级；CogView-4 公开页 V0-V3 为 5/10/15/20；CogView-3-Flash 以控制台为准 | 换 SiliconFlow → Pollinations → 占位/atlas |
| **硅基流动 Kolors** | ✅ 官方价格页“免费” | 否（与现有 SiliconFlow Key 通用） | ✅ 国内平台；本机端点可达 | 官方无 SLA；通常数秒 | `images[0].url`，URL 1 小时有效 | 图像模型 IPM 2+、IPD 400+；免费模型固定限流 | 换智谱 → Pollinations → 占位 |
| **Pollinations Classic** | ✅ 无需注册/Key | 否 | ✅ 本机实测 512×512 返回 51,652 bytes / 1.077s；第三方 2026 指南称旧版直连可用 | 受队列影响；免费 IP 每 45 秒只能 1 张 | 直接返回 JPEG | 单 IP 同时 1 张、间隔 ≥45s；超限 402 + `Retry-After`；最大 768×768；带 Pollinations logo；同 URL 公开缓存；无 uptime 保证 | 仅作最后兜底；失败用占位/atlas |
| **Cloudflare Workers AI** | ✅ 每天 10,000 Neurons 免费 | 是（Cloudflare Account ID + API Token） | 本机 api.cloudflare.com 可连通；国内无节点保障 | flux-1-schnell 低延迟；通常数秒 | `result.image` Base64 | 10,000 Neurons/天；flux-1-schnell 1024² 约 57.6 Neurons/张 ≈ 173 张/天；flux-2-klein-4b 约 125.7 ≈ 79 张/天；超额报错，需 Paid 计划 | 不作为首选；失败换智谱/硅基 |
| 其他 | 未找到可核实、稳定、国内直连的“永久免费”图像 API | — | — | — | — | 免费试用额度不适合当生产 | 不纳入第一版 |

补充说明：

- 智谱 CogView-3-Flash 官方页面明确写了“PPT 配图”场景，且支持 1024×1024、1344×768、1440×720 等分辨率（`docs.bigmodel.cn/cn/guide/models/free/cogview-3-flash`）。
- 智谱图像 API 是自有协议：`POST https://open.bigmodel.cn/api/paas/v4/images/generations`，Bearer 鉴权，响应 `data[0].url`，不是 base64；`watermark_enabled` 默认 `true`，关闭需签免责声明。
- 硅基流动 API 是 OpenAI 风格：`POST https://api.siliconflow.cn/v1/images/generations`，响应 `images[0].url`，URL 1 小时有效，必须立即下载到 R2。
- Pollinations 新版 `gen.pollinations.ai` 需要 Key；Classic `image.pollinations.ai` 仍免费但限流严格、带 logo、最大 768。第一版只把 Classic 当兜底，不作为主链路。
- Cloudflare Workers AI 免费额度是“Neurons/天”，不是“无限张”；且需要新账号/Token，国内访问不如智谱/硅基稳定。

### 3.3 付费量级（如果以后要稳定/高并发）

| 路线 | 官方价格 | 约合每千张 | 备注 |
|---|---|---|---|
| 智谱 CogView-4 | 0.06 元/次 | 60 元 | 比 Flash 质量高，适合正式封面 |
| 智谱 GLM-Image | 0.1 元/次 | 100 元 | 文字渲染更强，PPT 场景官方推荐 |
| 硅基流动付费生图 | 约 0.1-0.3 元/张 | 100-300 元 | 模型不同价格不同；免费 Kolors 仍可用 |
| Cloudflare Workers AI | $0.011/1000 Neurons | 约 $0.63（flux-1-schnell 1024²） | 先用免费 10k/天，超额才付费 |
| Pollinations Key | $1 pollen 起；x402 $0.01/次 | 约 $10（按次） | 免费 Classic 不适合量产 |

价格只用于量级判断，最终以各平台实时定价页为准。

### 3.4 推荐路线

**主：智谱 CogView-3-Flash。**
理由：真正免费、官方明确支持 PPT 配图、国内直连、用户已有智谱 Key、返回 URL 可直接下载进 R2；6 页 deck 只需要 1-2 张图，V0 并发 5 足够。

**备：硅基流动 Kolors。**
理由：同样免费、与现有 SiliconFlow Key 通用、OpenAI 风格接口、URL 1 小时有效；限流 IPM 2+/IPD 400+，对 1-2 张/次足够。

**兜底：Pollinations Classic。**
理由：无 Key、国内本机可直连；但 45 秒/张、768 上限、带 logo，只适合“所有 Key 都挂了”的应急，不适合默认链路。

**可选：Cloudflare Workers AI。**
理由：如果项目已经在 Cloudflare 生态、愿意新建 Token，免费额度够个人用量；但国内稳定性和账号配置成本不如前两条。

**无预算时：`ppt.image.provider=none`。**
不调用任何图像 API，直接用 `Atlases/WaveDashing` 的 Guy/Bird/moveset/desktop 图标 + 程序化拼贴；所有图片位仍填满，deck 视觉完整。

### 3.5 图片与版式的绑定

不是“每页固定一个配图位”，而是**由版式决定**：

| 版式 | 图片槽位 | 策略 | 失败/无预算 fallback |
|---|---|---|---|
| `cover` | 0-1（可选装饰） | 默认不生成，保持标题留白 | 无图 |
| `bullets` | 1（右侧可选） | 有 `imagePrompt` 才生成 | Guy 剪贴画 / `ph` |
| `feature` | 1（必需视觉中心） | 必生成；失败用占位 | moveset / `ph` |
| `two-column` | 2（左右各一） | 有 prompt 才生成；可只生成一侧 | 左右图标 / `ph` |
| `end` | 1（可选） | 默认 Bird，不生成 | Bird 剪贴画 |

每张图带 `imageKey`（如 `p3-feature`），用于异步回填；`PptLayoutMapper` 决定 `kind:'ph'` 还是 `kind:'img'`。

### 3.6 生成、存储、降级

1. 文本 deck 先返回，图片位是 `kind:'ph'`，带 `imageKey + imagePrompt + size`。
2. 前端收集最多 2 个图片任务，`POST /ppt/images`。
3. 后端按 `sha256(provider|model|prompt|size)` 生成缓存 id：
   - 先 `R2Utils.get(id)` 命中 → 直接返回 `/images/{id}`；
   - 未命中 → 调 provider → 下载 → 校验魔数/大小 → `R2Utils.put(id, contentType, bytes)`；
   - R2 未启用/写入失败 → 回退 `UploadImageService` 存库，仍返回 `/images/{id}`。
4. 返回 `{ "p3-feature": "/images/..." }`；前端 `BerryPPT.patchImage(key, url)` 原地换图。
5. 单张超时 20s，重试 1 次；仍失败返回 `null`，前端保留占位/atlas，不阻塞播放。
6. 不在浏览器里直连 provider：Key、CORS、R2 入库都在后端做。

配置草案（不新增依赖，只加配置项）：

```properties
ppt.image.provider=${PPT_IMAGE_PROVIDER:none}   # none | zhipu | siliconflow | pollinations | cloudflare
ppt.image.base-url=${PPT_IMAGE_BASE_URL:https://open.bigmodel.cn/api/paas/v4}
ppt.image.api-key=${PPT_IMAGE_API_KEY:}
ppt.image.model=${PPT_IMAGE_MODEL:cogview-3-flash}
ppt.image.size=${PPT_IMAGE_SIZE:1344x768}
ppt.image.timeout-ms=${PPT_IMAGE_TIMEOUT_MS:20000}
ppt.image.max-per-deck=${PPT_IMAGE_MAX_PER_DECK:2}
```

注意：`ppt.image.api-key` 不要无条件复用 `ai.api-key`。如果 `AI_BASE_URL` 指向硅基流动，`AI_API_KEY` 是硅基 Key，不能拿去调智谱；如果 `AI_BASE_URL` 已经指向智谱，才可以回退复用。

---

## 4. 端到端链路

```text
用户在 BerryOS 输入主题 / 大纲
        │
        ▼
POST /ppt/generate
        │
        ├─ PptService 组装 system/user prompt
        ├─ AiClient.chat(messages, jsonMode=true, model)
        ├─ 解析 JSON → 校验 layout/slots/长度
        ├─ 失败 → 修复重试 1 次 → 仍失败 → PptFallback 6 页
        │
        ▼
PptLayoutMapper：slots → 现有 items[]（x/y/w/class/bg/tr/dur）
        │
        ▼
返回 { slides, meta }   // 图片位是 kind:'ph' + imageKey
        │
        ▼
BerryPPT.setSlides(slides) → open()/show(0)   // 文本版立即可翻
        │
        ▼
POST /ppt/images（最多 2 张）
        │
        ├─ R2 哈希命中 → 直接返回 /images/{id}
        ├─ 未命中 → 智谱 → 硅基 → Pollinations → 占位/atlas
        └─ 下载、校验、R2 入库
        │
        ▼
BerryPPT.patchImage(key, url)   // 原地换图，不重播整页
        │
        ▼
播放完成 / 关闭
```

### 4.1 缓存策略

| 层 | 内容 | 位置 | TTL |
|---|---|---|---|
| 文本 deck | `sha256(topic|outline|tone|model)` → `slides` | 第一版 `localStorage`；后续可 Redis | 24h |
| 图片 | `sha256(provider|model|prompt|size)` → R2 对象 id | R2（`ppt/img/` 前缀可复用 `r2.key-prefix`） | 长期；同 prompt 复用 |
| 前端最近一版 | `slides + imageUrls` | `localStorage` | 24h / 手动清 |

第一版不建议上 Redis/队列：6 页文本一次调用，图片最多 2 张，同步串行即可。并发再高时再加任务队列。

### 4.2 失败回退总原则

1. 文本永远有 fallback，接口挂了也能出 6 页。
2. 图片永远有占位/atlas，单张失败不阻塞播放。
3. 先出文字版，再补图；不要等图片全部生成才打开播放器。
4. 任何 AI 输出都经过服务端 schema/长度校验，不直接进 `innerHTML`。
5. 图片下载后校验魔数/大小，复用 `UploadController` 的校验口径（`33-69`）。

---

## 5. 最小可用版本

### 5.1 第一版范围

**文本**
- 6 页固定页序；4 种核心版式（`cover / bullets / feature / end`），`two-column` 作为第 5 种放末尾或延后。
- 输入：主题 + 可选大纲；文章/日记先归一到大纲。
- AI 只填 slots；`PptLayoutMapper` 本地分配版式。
- JSON 模式 + 服务端校验 + 本地 fallback。

**图片**
- provider 默认 `none`（本地开发无 Key 也能跑）。
- 线上主选智谱 CogView-3-Flash；失败自动切硅基流动 Kolors；再失败用 Pollinations/atlas/占位。
- 每套 deck 最多 2 张图：`feature` 1 张必选，`end` 或 `bullets` 1 张可选；不每页配图。
- 图片下载进 R2，返回 `/images/{id}`；按 prompt 哈希缓存。

**播放**
- 复用现有 `BerryPPT`，不重写、不抽取。
- 文本先播；图片异步 `patchImage` 回填。
- 保留现有转场/逐字/音效；音效可默认开（沿用原行为）。

### 5.2 第一版不做

- 图表/数据页/目录页（现有模板没有，新增版式不属于“补 AI”）。
- AI 自由选版式/自由 HTML/自由坐标。
- 每页自动配图、图片编辑、重绘、风格迁移。
- `.pptx` / PDF / 单文件 HTML 导出。
- 独立 `wavedash-ppt.html` 页面（那会需要把播放器抽出来；第一版入口放 BerryOS，避免重写）。
- 任务队列、Redis 缓存、后端分享链接、多人协作。
- 新的主题皮肤。

### 5.3 改动面

| 文件 | 动作 | 说明 |
|---|---|---|
| `blog-api/.../controller/PptController.java` | 新增 | `POST /ppt/generate`、`POST /ppt/images` |
| `blog-api/.../service/PptService.java` | 新增 | prompt、AiClient 调用、解析校验、fallback 编排 |
| `blog-api/.../service/PptLayoutMapper.java` | 新增 | slots → 现有 items[]；6 页坐标/class |
| `blog-api/.../service/PptImageService.java` | 新增 | 智谱/硅基/Pollinations 调用、下载、R2/DB 入库、哈希缓存 |
| `blog-api/.../vo/params/PptGenerateParam.java` | 新增 | topic/outline/tone/sourceText/pageCount |
| `blog-api/.../vo/PptDeckVO.java` | 新增 | `meta + slides` |
| `application.properties` / `application-prod.yml` | 修改 | 增加 `ppt.image.*` 配置；无新依赖 |
| `blog-ui/js/pptgen.js` | 修改 | 调用 `/ppt/generate`、`/ppt/images`；把返回的 slides 交给 `BerryPPT` |
| `blog-ui/berryos.html` | 小改 | 图片 `data-key` + `patchImage`（约 10-20 行）；生成入口可复用现有图标/菜单 |
| `blog-ui/js/detect.js` / `diary.js` | 可选 | 若要保留“日记自动生成”，修掉“先清 localStorage 再触发”的断链 |

**无需改动**：`pom.xml`（不新增依赖，复用现有 `RestTemplate`、fastjson、AWS S3 SDK、R2Utils）、播放器 CSS/动画/转场、6 页模板数据。

### 5.4 验收

- 不配任何图片 Key：输入主题，能生成 6 页并播放；图片位是 atlas/占位，排版不塌。
- 配智谱 Key：文本 + 1 张 `feature` 图生成成功，图存入 R2，`/images/{id}` 可访问；刷新后仍能显示。
- 智谱失败：自动切硅基；硅基也失败：占位/atlas，播放不中断。
- AI 返回坏 JSON：自动修复一次；仍坏则 fallback 6 页。
- 播放器原手动 deck 仍可打开、翻页、退出，控制台无报错。
- 所有 AI 文案长度在限制内；不出现 `undefined`、HTML 标签、空白页。

---

## 6. 需要拍板

1. **文本接口**：新建 `/ppt/generate`（推荐）还是复用 `/chat/generate-article`？
2. **图片主供应商**：智谱 CogView-3-Flash（推荐，免费+已有 Key）还是硅基流动 Kolors（同 Key 通用）？
3. **图片数量**：第一版 1 张（只 `feature`）还是 2 张（`feature` + `end`/`bullets`）？
4. **入口**：先放 BerryOS 桌面/菜单（推荐，零抽取）还是新增独立页（需要先抽播放器）？
5. **无预算模式**：默认 `none` + atlas/占位（推荐）还是必须每套都调免费 API？
6. **鉴权**：`/ppt/generate` 跟随 `/chat` 登录，还是公开 + IP 限流？AI 有成本，建议登录或限流。
7. **缓存**：第一版 `localStorage + R2` 够用，还是要直接上 Redis？

---

## 7. 查证来源

- 智谱 API 定价（CogView-3-Flash 免费）：<https://docs.bigmodel.cn/cn/guide/start/pricing>
- 智谱 CogView-3-Flash 免费模型页（含 PPT 配图场景、平均数秒、分辨率）：<https://docs.bigmodel.cn/cn/guide/models/free/cogview-3-flash>
- 智谱图像生成 API 参考（`/api/paas/v4/images/generations`、`data[0].url`、`cogview-3-flash`）：<https://docs.bigmodel.cn/api-reference/模型-api/图像生成>
- 智谱速率限制（并发维度、错误码 1302/1305）：<https://docs.bigmodel.cn/cn/api/rate-limit>
- 智谱 CogView-4 并发权益（V0-V3 5/10/15/20，作为图像模型参考）：<https://docs.bigmodel.cn/cn/guide/models/image-generation/cogview-4>
- 硅基流动定价（Kolors 免费、付费生图价格）：<https://siliconflow.cn/pricing>
- 硅基流动图像生成 API（`/v1/images/generations`、`images[0].url`、URL 1 小时）：<https://docs.siliconflow.cn/docs/api/images-generations-post>
- 硅基流动 Rate Limits（图像 IPM 2+ / IPD 400+）：<https://docs.siliconflow.com/cn/userguide/rate-limits/rate-limit-and-upgradation>
- Pollinations Classic API（免费、无需 Key、`image.pollinations.ai/prompt/...`、45 秒/张、768 上限、logo）：<https://github.com/pollinations/pollinations/blob/master/APIDOCS.md>
- Pollinations 新版 API（需要 Key，`gen.pollinations.ai`）：<https://gen.pollinations.ai/docs>
- Pollinations 服务条款（更新 2026-09-16；商用/模型许可需自行确认）：<https://pollinations.ai/terms>
- Cloudflare Workers AI 定价（10,000 Neurons/天，$0.011/1000 Neurons，最近更新 2026-10-20）：<https://developers.cloudflare.com/workers-ai/platform/pricing/>
- Cloudflare flux-1-schnell（Base64、默认 4 steps）：<https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/>
- Cloudflare flux-2-klein-4b（Base64）：<https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/>
- Cloudflare Workers AI 模型目录（最近更新 2026-08-12）：<https://developers.cloudflare.com/workers-ai/models/>

> 说明：上述“真免费/额度/返回格式”均来自官方文档或官方定价页；国内直连与耗时为本机（Asia/Shanghai）实测或官方描述，未做长期可用性 SLA 验证。

---

## 8. 水印核实与替换方案（2026-11-07）

> 本节结论推翻第 6 节第 2 条的默认推荐。CogView-3-Flash 免费档的「AI生成」角标无法靠提示词去掉（返回 URL 带 `_watermark`，图右下角固定水印），需换供应商。

### 8.1 逐家核实

| 供应商 / 模型 | 可见水印 | 免费性质 | 绑卡 / 门槛 | 国内直连 | 单张耗时 | 扁平教材风可控度 |
|---|---|---|---|---|---|---|
| 智谱 CogView-3-Flash | **强制**「AI生成」角标 + URL `_watermark` | 免费模型 | 智谱账号，不绑卡 | 是（已验证） | 14–15s（实测） | 中：能调出教材风，但水印去不掉 |
| 硅基流动 Kolors | 默认加「AI生成」；请求头 `X-Enable-Watermark: 0` **可关显式水印**；隐式水印固定添加 | 每图片 ¥0，免费模型；图像 IPM 2 / IPD 400 | **不绑卡**，免费模型需实名认证 | 是（4s 级） | **4.06s / 4.19s（实测）** | **高：同一段提示词直接出教材风** |
| Pollinations 免费匿名 | **有**：右下角 `pollinations.ai` logo；`nologo=true` 实测无效 | 免费、无需 Key、45 秒/张/IP、最长边 768 | 不需要 | 实测可连 | 7.09s / 7.35s（实测） | 低–中：FLUX 偏写实，logo 去不掉 |
| Pollinations 自带 Key | 官方称无 logo | 需账号 + pollen 额度（quest 发放，非稳定免费） | 不绑卡 | 跨境 | 未测 | 中 |
| Cloudflare Workers AI `flux-1-schnell` | 官方文档未声明加水印，输出为纯 Base64；社区实测无水印。**但同平台第三方模型 seedream 被强制加水印** → 平台并非统一无水印，需上线前抽验 | 10,000 Neurons/天免费；1024²/4 steps 约 172.8 Neurons ≈ **57 张/天** | **官方明示不需要信用卡** | 可达（401/0.64s），跨境 | 未实测（无账号） | 中：FLUX schnell 无 negative_prompt，需微调提示词 |
| 阿里云百炼 万相 | 官方 `watermark` 参数**默认 false** → 默认无可见水印 | 新人免费额度，图像类按张计（官方示例 500 张/90 天，具体以控制台为准）；之后按量付费 | 需阿里云实名；免费额度不绑卡，但要防欠费 | 是（华北2 北京） | 未实测（异步任务） | 高：支持负向提示、中文；支持 1280×720 |
| ModelScope API-Inference | 官方文档未明确 API 是否加水印；网页端 AI 标识可选 | 每天 2000 次、单模型 500 次 | 需绑定阿里云账号（实名） | 是 | 未实测 | 高：Qwen-Image 等，支持 1664×928 |

### 8.2 本机实测记录

- **Kolors 1024×1024**：`X-Enable-Watermark: 0`，4.06s；图四角无任何文字/logo，扁平矢量教材风，单人单脚平衡，零字母。
- **Kolors 1344×768**：4.19s，实际返回 **1344×768**；图四角仍无文字/水印，风格与上一张一致，可直接填现有 16:9 配图位（不裁切、不变形）。注意：1344×768 不在官方推荐尺寸列表里，实测可用但长期稳定性未获保证。
- **Pollinations**：默认请求与 `nologo=true` 各下一张，右下角均有 `pollinations.ai` logo；`elapsed≈7s`。
- **Cloudflare**：无账号，未实际出图；仅验证 `api.cloudflare.com` 可达（无 token 返回 401，0.64s）。
- **CogView-3-Flash**：此前实测 3 张，URL 均带 `_watermark.png`，图右下角「AI生成」，Expires 7 天。

### 8.3 换家要改多少

| 替换目标 | 后端代码改动 | `IMAGE_STYLE` / 生图提示词 |
|---|---|---|
| 硅基流动 Kolors | 改 `ai.image-base-url=https://api.siliconflow.cn/v1`、`model=Kwai-Kolors/Kolors`、`size=1344x768`；响应从 `data[0].url` 改为 `images[0].url`；加请求头 `X-Enable-Watermark: 0`；**R2 必须开启**（返回 URL 仅 1 小时有效，不能像 CogView 那样回退原始 URL） | **不改**。同一段 `STYLE_TEXTBOOK` + 禁止文字描述，实测直接出教材风、零文字；可选把禁止项挪到 `negative_prompt` |
| Cloudflare flux-1-schnell | 换端点与鉴权（Account ID + API Token）；请求体改为 `{prompt, steps, seed}`；响应改为 Base64，需落 R2 或 data URI；文档未开放宽高，按 1024×1024 方形估算 | 保留常量，但要补强 `2D flat vector`、`no text`；FLUX 风格遵循弱于 Kolors，预计需 1–2 轮微调，不必重写 |
| 阿里云百炼 万相 | 异步 submit + 轮询；`parameters.size=1280*720`、`watermark:false`；结果 URL 24h | 提示词可能要中文化或中英混合，属中等调整 |
| ModelScope API-Inference | OpenAI 兼容 base_url + Token；响应格式/URL 有效期需实测 | 中文模型，提示词可基本复用，轻微调整 |
| Pollinations 免费 | 不建议：logo 去不掉；Key 版才有 no-logo，但额度不稳 | — |

**判断**：只换 `base-url/model` 不够，任何一家都要改响应解析；Kolors 另加一个请求头并强制 R2。提示词层面，Kolors **不用改**；FLUX 系（Cloudflare/Pollinations）要微调，但 `IMAGE_STYLE` 常量结构可保留。

### 8.4 推荐（等拍板）

- **方案 A（工程首选）**：硅基流动 Kolors + `X-Enable-Watermark: 0` + 开启 R2。理由：国内 4s 级、免费、1344×768 与现有配图位完全对齐、现有 `IMAGE_STYLE` 原样可用。
  - 合规注意：关闭显式水印后，按《人工智能生成合成内容标识办法》，开发者需自行对最终输出添加显著提示。建议在 PPT 界面角标/页脚加一行小字「本页配图由 AI 生成」，不压在图面上。
  - 注意：SiliconFlow 的「隐式水印」固定添加（不可见），不影响观感。
- **方案 B（图上零标识）**：Cloudflare `flux-1-schnell`。真无可见水印、不绑卡、长期免费额度约 57 张/天；代价是方形输出（现有 16:9 框会留黑边）、跨境、需 Cloudflare 账号，且平台第三方模型存在强制水印先例，上线前要抽验。
- **方案 C（必须 16:9 且不裁剪）**：阿里云万相 1280×720，`watermark:false` 默认无水印；但免费额度仅 90 天/按张计，长期要付费。
- **方案 D（不推荐）**：Pollinations 免费匿名版，logo 实测两次都有；自带 Key 去 logo 但额度不稳定。

> 结论一句话：**要“免费 + 不加可见水印 + 少改代码”，选 Kolors 并自己加界面 AI 提示；要“图上绝对没有任何标识”，选 Cloudflare，但接受方形与跨境。**

### 8.5 本节来源（访问日期 2026-11-07）

- 硅基流动图片 API（`X-Enable-Watermark` 默认 1、传 0 可关显式水印、隐式固定、URL 1 小时、`images[0].url`）：<https://docs.siliconflow.cn/docs/api/images-generations-post>
- 硅基流动图片能力说明（同上，含 `X-Enable-Watermark` 法律义务说明）：<https://docs.siliconflow.cn/docs/userguide/capabilities/images>
- 硅基流动定价（`Kwai-Kolors/Kolors` 每图片免费）：<https://siliconflow.cn/pricing>
- 硅基流动 Rate Limits（图像 IPM 2 / IPD 400；免费模型需实名）：<https://docs.siliconflow.cn/cn/userguide/rate-limits/rate-limit-and-upgradation>
- Pollinations Classic APIDOCS（免费匿名每张带 Pollinations logo、45 秒/张、768 上限；自带 Key 才无 logo）：<https://github.com/pollinations/pollinations/blob/master/APIDOCS.md>
- Pollinations 新版 API（需 Key）：<https://gen.pollinations.ai/docs>
- Cloudflare Workers AI 定价（10,000 Neurons/天；flux-1-schnell 4.8 Neurons/512 tile + 9.6 Neurons/step，最近更新 2026-10-20）：<https://developers.cloudflare.com/workers-ai/platform/pricing/>
- Cloudflare flux-1-schnell（仅 prompt/steps/seed，输出 Base64）：<https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/>
- Cloudflare 免费计划无需信用卡：<https://www.cloudflare.com/products/workers-ai/>
- Cloudflare 社区帖：同平台 seedream-5-pro 被强制加「AI generated」水印且无法关闭（说明平台非统一无水印）：<https://community.cloudflare.com/t/expose-watermark-false-for-third-party-image-models-bytedance-seedream-5-pro/943702>
- 阿里云万相文生图 V1（支持 1024×1024 / 720×1280 / 1280×720）：<https://help.aliyun.com/zh/model-studio/text-to-image-api-reference>
- 阿里云万相 2.6（`watermark` 默认 false，URL 24 小时）：<https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference>
- 阿里云百炼新人免费额度（90 天、实名、用完即停）：<https://help.aliyun.com/zh/model-studio/new-free-quota>
- 阿里云图像 API FAQ（图像免费额度按张计，官方示例 500 张）：<https://help.aliyun.com/zh/model-studio/image-faq>
- ModelScope 免费推理 API（每天 2000 次、单模型 500 次）：<https://modelscope.cn/headlines/article/795>
- ModelScope API-Inference 文档入口：<https://modelscope.cn/docs/model-service/API-Inference/intro>
- 《人工智能生成合成内容标识办法》（2025-09-01 施行，显式/隐式标识义务）：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm>
