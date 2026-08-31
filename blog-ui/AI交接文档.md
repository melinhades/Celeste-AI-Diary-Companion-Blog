# Celeste 日记伴侣 —— AI 交接文档

> 交接时间：2026-08-30
> 状态：快速迭代中，用户以中文沟通，节奏快、需求口语化，需要自行定位代码。

---

## 1. 项目概况

Celeste（蔚蓝）主题的 AI 日记伴侣博客。用户写日记，AI 角色 **Madeline**（温暖、真诚、细腻）全程陪伴：陪写点评、主动冒泡、聊天、羽毛呼吸游戏、每日明信片、书架快照明信片；另有 **Oshiro**（旅馆老板，傲娇）在 shop 页。

- **前端**：原生 HTML + JS + CSS，无框架，全在 `blog-ui/`（直接浏览器打开或静态服务）
- **后端**：Java 17 + Spring Boot，端口 **8888**，模块 `blog-api`，包 `com.mszlu.blog`
- **AI**：GLM-4（chat，支持 JSON 模式 `AiClient.chat(messages, true)`）+ bge-m3（embedding，RAG 记忆检索）
- **数据库**：MySQL `blog@localhost:3306`
- **环境**：Windows 11 + IntelliJ IDEA + PowerShell

---

## 2. 协作铁律（血泪教训，务必遵守）

1. **IDE 的代码块 apply 经常静默失败**。每次给出修改后，用户回复异常时，第一件事是重新读文件核实真实状态，不要相信"上次应该改好了"。
2. **绝对不要把 `// ... existing code ...` 占位注释写进真实文件**——曾经真的留在文件里，把 `EMOTION_WORDS` 等三个对象顶掉导致运行时崩溃。
3. **整段替换函数时，确认旧函数残躯删干净**——曾出现新旧 `osWander` 并存，裸露代码导致"应为语句"语法错误。
4. JS 改动给**完整代码块 + 精确行号位置**；删 HTML 元素前必查 JS 引用并加防 null。
5. 全局字体：所有文字 **Renogare + CelesteZH**，只有 `#gameDialogName` 用 Press Start 2P。
6. 素材路径陷阱：`celeste-sounds/madeline/...` 有 `madeline/` 一层，拼路径别漏（write-madeline.js 曾 404）。
7. GIF 像素小人**不能用 canvas 扫描校准尺寸**（每帧透明边不同，会忽大忽小），直接钉死固定像素。
8. 用户说"提交"时，汇总未提交改动拟提交信息。

---

## 3. 关键文件地图

### 前端（blog-ui/）
| 文件 | 职责 |
|---|---|
| `js/api.js` | `api(path, method, body)` fetch 封装、`showToast`、草莓余额 `berryBalance` |
| `js/diary.js`（~2400 行） | 日记本主体：打字机对话、实时陪写引擎、情绪分析、羽毛游戏接入、保存逻辑、封面/明信片渲染 |
| `js/write-madeline.js` | write 页 Madeline 像素小人：姿势切换、`pmSetSrc`/`pmApplySize`、语音 `playSpeak` |
| `js/feather-game.js` | 羽毛呼吸游戏本体（重力物理、落地判定、`feather-landed` 事件） |
| `diary.html` | 日记本页面 |
| `write.html` | 写作页（金卡片框参考实现） |
| `shop.html`（~800 行） | Oshiro 旅馆：金卡聊天框、Oshiro 全屏游走、对话框点击即关 |
| `shelf.html`（~830 行） | 书架：日记卡片、**快照明信片系统**、`renderPostcardCanvas`、`exportPostcard` |
| `me.html` | 个人空间：卡片 + 票根（celeste-journal 叠层图案） |
| `css/diary.css`（~940 行） | 日记本全部样式：封面、每日明信片、`.cover-stamps` 徽章 |

### 后端（blog-api/）
| 文件 | 职责 |
|---|---|
| `service/ai/PromptBuilder.java` | 所有提示词：`chatSystem`、`diaryCompanion`（均含【情绪工具】规范）、`dailyPostcard`、`oshiroChat` |
| `service/ai/AiClient.java` | GLM-4 调用，`chat(messages, jsonMode)` |
| `impl/DiaryServiceImpl.java` | 日记 CRUD、`companion`（陪写点评）、`summary`、`snapReflect`（**新**）、`dailyPostcard`、`bubble`、`featherKeyword` |
| `impl/ChatServiceImpl.java` | 主聊天，AI 返回 JSON `{reply, emotion}` |
| `impl/MemoryServiceImpl.java` | 记忆提取 + RAG 检索 `searchContext`（注意 `ContextChunk` 是 4 参构造） |
| `impl/ProactiveServiceImpl.java` | 每日 9:30 主动关怀 |
| `utils/UserThreadLocal.java` | 当前用户（**在 utils 包，不是 common.cache**） |

---

## 4. 本轮已完成（按序）

1. **Oshiro 全屏二维游走**（shop.html）：定位从 `bottom` 改 `top:60px/left:40px`，`osWander` 重写为全屏 X/Y 移动；清理了旧函数残躯和无人调用的 `osCurX()`。
2. **Madeline 说话逻辑优化**（diary.js）：
   - 三道闸：句子写完（句号/感叹/问号/换行）、至少 18 个新字、距上次点评 ≥12 秒
   - 等用户停笔 0.7 秒再开口（`lastUserInputTime` + `waitUserPause`）
   - 说话去重：记最近 8 句，相同或开头雷同的跳过
   - **点评次数无限**（用户明确要求去掉 `MAX_AI_PER_DRAFT`，已确认删除干净）
3. **情绪工具化**（前后端）：情绪不再由关键词扫描猜测，改由 AI 在 JSON 回复中自选标签。七个合法值：**默认 / 可爱 / 不安 / 不开心 / 惊讶 / 怨恨 / 无语**（`normalizeHerEmotion` 白名单校验，非法回落"默认"）。惊讶有严格选用标准，不许乱惊讶。
4. **编译错误修复**：`ArticleController` 的 `UserThreadLocal` 导入改为 `com.mszlu.blog.utils`；`MemoryServiceImpl` L311 的 `ContextChunk` 补第 4 参 `sim`。
5. **write-madeline.js**：`playSpeak` 路径补 `madeline/` 层；Madeline 尺寸钉死 **56px**（删掉 `pmCalibrate` canvas 校准，`pmApplySize` 固定值）。
6. **羽毛游戏死循环修复**（feather-game.js）：落地瞬间 `loop()` 在 `finishLanding` 之后又排新帧导致每帧重复派发 `feather-landed`。修复：`finishLanding` 防重入 + 清 `landingPhase`，`loop` 在结束态不再续帧。
7. **月快照改版**（本轮主线，见下节）。

---

## 5. 月快照系统（当前焦点）

### 需求（用户原话要点）
- 时间显示**发出当天**（不再 from~to 区间），用户自然看出发送节奏
- 内容 = Madeline 对这段时间日记的感言（AI 生成）+ "你最近常常感到**情绪**"
- 情绪字**红色高亮**

### 实现（已全部确认 apply）
- **后端**：`POST /diary/snap-reflect`（`DiaryController` → `DiaryServiceImpl.snapReflect`），入参 `{content: 日记合集前1200字}`，返回 `{message}`，AI 失败有兜底句
- **前端**（shelf.html）：
  - `maybeGenerate`/`buildSnap` 已改 async，生成时拉感言存入 `reflect` 字段；标签"月度总结"改"月快照"
  - 书架卡：日期 = `fmt(createdAt)`，文案"你最近常常感到「X」"
  - `renderPostcardCanvas`：逐字测量绘制，`【】` 包裹的字用红色 `#c8433a`（`RED_INK`），书写区右界 `maxX = W * 0.56`
  - 触发条件不变：7 天 ≥3 篇出周快照，30 天 ≥8 篇出月快照，`hasType` 防重
- **数据结构**：`localStorage.diarySnapshots` 数组，新增 `reflect` 字段

### ⚠️ 最新交付、尚未验证：旧快照懒回填
**问题**：改动前已生成的旧快照没有 `reflect`，且防重机制导致永远不会重新生成 → 点开只有默认句"这段日子，你写下了 N 篇日记"。
**已交付方案**：`openSnapPostcard` 改 async，发现 `!s.reflect` 时按快照周期（month=30 天 / week=7 天，从 `createdAt` 往前）从 `data` 筛日记、现场调 `/diary/snap-reflect`、写回 localStorage。
**待办**：确认用户已 apply 这段；确认后端已重启（否则 404 回落默认句）。

---

## 6. 更早交付、状态不明（如用户再提可快速回锅）

- me.html 票根图案：8 张 `celeste-journal/*.png` 是与 ticket.png **同尺寸整张叠层**，`left:0;top:0;width:100%;height:100%` 直接堆叠即对齐，**禁止自创槽位坐标**
- 封面图案（`.cover-stamps`）：圆形徽章裁切方案（`object-fit:cover` + `border-radius:50%`），配 `nth-child` `object-position` 取景；diary.js L129-143 的 ±3deg 旋转在徽章方案下可能要去掉
- `#postcard-message` 字号已对齐用户名 `clamp(16px, 3vw, 28px)`，长寄语溢出时收 `line-height` 2→1.6

---

## 7. 常用排查速查

| 症状 | 先查 |
|---|---|
| 页面功能没生效 | 先读文件确认改动真在（apply 常失败），再看浏览器缓存 |
| 后端接口 404 | 是否重启了 8888 |
| 编译"找不到符号" | 包导入位置（UserThreadLocal 在 utils） |
| 构造器参数不匹配 | `@AllArgsConstructor` 字段顺序 = 参数顺序（ContextChunk: source, text, label, score） |
| 声音 404 | 路径是否漏 `madeline/` 层 |
| 情绪不对 | 白名单 7 值；AI JSON 返回，非法回落"默认" |
| `diarySaveCount` | localStorage 日记计数，保存成功且非编辑时 +1，驱动票根/封面图案（前 8 张） |

---

## 8. 下一步可能方向

1. 验证懒回填 + 后端重启后快照感言是否正常出现
2. 第 6 节遗留项的用户反馈回锅
3. 未提交改动较多（Oshiro 游走、说话优化、情绪工具化、快照改版等），用户说"提交"时按功能分块拟提交信息
