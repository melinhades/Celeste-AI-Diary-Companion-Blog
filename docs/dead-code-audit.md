# 死代码 / 冗余代码审计清单

- 审计范围：`blog-api/src`（202 个 `.java`）、`blog-ui`（72 个 `.js`、29 个 `.html`、24 个 `.css` 及全部静态资源）
- 审计日期：2026-11-06
- 审计方式：全库正则计数 + 调用点人工复核；CSS 按括号深度只解析选择器，避免把十六进制颜色误判为 id
- 证据口径：`引用次数=1` 表示只出现在定义处；`外部命中=0` 表示除定义文件外全库无引用（含测试、文档）
- 排除项：动态拼接类名（`emotion-*` / `rank-*` / `tb-*`）、MyBatis Mapper、Spring Bean/Controller、Jackson 序列化字段、外部直接访问页面

> 本文档只记录结论，不改任何源码。本次请求中已额外执行两个页面删除，见第 0 节。

---

## 0. 本次已执行（页面删除）

- [x] **P0-1｜删除 `blog-ui/api-key-setup.html`**
  - 复检：删除前全库检索 `api-key-setup.html`，命中 0；删除后再次检索，命中 0。
  - 连带检查：该页加载的 `js/celeste-complete-transition.js`、`js/snow-effect.js`、`js/madeline-mood.js` 仍被 `api-key-setup-enhanced.html` 等 10+ 页面引用，无孤立脚本。
  - 说明：同功能的 `api-key-setup-enhanced.html` 才是 `register-2.js` / `auth.js` 实际链接的版本。

- [x] **P0-2｜删除 `blog-ui/celeste-hair-demo.html`**
  - 复检：删除前全库检索 `celeste-hair-demo.html`，命中 0；删除后再次检索，命中 0。
  - 连带检查：该页唯一脚本 `js/celeste-hair.js` 删除后仍被 7 个页面引用（`celeste-character-demo.html:42`、`celeste-farewell-remembered-demo.html:243`、`celeste-mirror.html:197`、`internet_cafe.html:33`、`index.html:149`、`shelf.html:215`、`shop.html:100`），脚本保留。
  - 结论：无连带失效的 JS。

---

## 1. 执行顺序总览

| 阶段 | 序号 | 内容 | 风险 |
|---|---|---|---|
| 1 | 1-2 | 备份文件、临时脚本 | 零 |
| 2 | 3-10 | 整文件死 JS、死函数/变量、废弃绑定 | 零 |
| 3 | 11-17 | 死 CSS 规则 | 零 |
| 4 | 18-22 | 无引用静态资源 | 低（URL 直达会 404） |
| 5 | 23-33 | 后端无调用类/方法/字段/枚举 | 低（不改外部 HTTP 行为） |
| 6 | 34-45 | 无入口页面、链式 JS、需确认资源 | 中（需确认无外部直达 URL） |
| 7 | 46-50 | 疑似项、测试专用 API | 中（需人工判断） |
| 8 | 51-52 | 重复实现合并 | 低收益重构，建议最后做 |

---

## 2. 确定可删（D 档，33 条）

### 2.1 零风险文件

- [ ] **D-01（执行序号 1）备份文件**
  - `blog-ui/api-key-setup.html.backup`（33.5KB，L1-736）
  - `blog-ui/shelf.html.bak`（6.2KB，L1-102）
  - 证据：全库 HTML/JS/CSS/文档 0 引用；无脚本加载；Cloudflare Pages 无入口。

- [ ] **D-02（执行序号 2）临时校验脚本**
  - `blog-ui/.tmp/p3-verification.js`（2.7KB，L1-69）
  - 证据：无 `<script src>`；全库仅注释中出现 `.tmp` 字样，文件名 0 命中。

### 2.2 整文件死 JS

- [ ] **D-03（执行序号 3）`blog-ui/js/chat.js`**
  - 规模：4.3KB / 116 行；证据：文件名全库外部命中 0，无 `script` 标签、无动态加载。

- [ ] **D-04（执行序号 4）`blog-ui/js/Tone.js`**
  - 规模：337.4KB；证据：外部命中 0；全库无 `Tone.` 调用。

- [ ] **D-05（执行序号 5）`blog-ui/js/soundtouch.js`**
  - 规模：24.4KB / 786 行；证据：外部命中 0；全库无 `SoundTouch` 调用。

- [ ] **D-06（执行序号 6）`blog-ui/js/wow_vox.js`**
  - 规模：29.9KB / 4 行；证据：外部命中 0；`VOX_T` 仅在本文件出现。

### 2.3 活文件内的死函数（全库仅定义处 1 次）

- [ ] **D-07（执行序号 7）11 个未调用函数**

  | 位置 | 函数 |
  |---|---|
  | `blog-ui/js/api.js:72` | `spendBerries`（2026-11-06 已删除） |
  | `blog-ui/js/article.js:356` | `loadRelated` |
  | `blog-ui/js/diary.js:326` | `splitSpeak` |
  | `blog-ui/js/diary.js:2811` | `pmShoo` |
  | `blog-ui/js/feather-game.js:249` | `nextGuide` |
  | `blog-ui/js/roundtable-voice.js:200` | `stopBadeline` |
  | `blog-ui/js/shelf.js:3394` | `spawnDoorFx` |
  | `blog-ui/js/shelf.js:3961` | `doorBurst` |
  | `blog-ui/js/shop.js:794` | `osCelebrate` |
  | `blog-ui/js/sing-v5.js:38` | `corrCoeff` |
  | `blog-ui/js/write-madeline.js:83` | `pmCalibrate` |

  证据：函数名在 29 个 HTML + 全部 JS 的合并文本中仅 1 次命中；无 `window['name']`、无字符串拼接调用。

### 2.4 只声明未使用的常量 / 变量（全库仅 1 次命中）

- [ ] **D-08（执行序号 8）23 个死变量**

  | 位置 | 变量 |
  |---|---|
  | `blog-ui/js/celeste-character.js:52/56/57/90` | `CLIMB_GRAB_Y_MULT`、`CLIMB_JUMP_BOOST_TIME`、`CLIMB_HOP_NO_WIND_TIME`、`DASH_H_JUMPTHRU_NUDGE` |
  | `blog-ui/js/celeste-mirror.js:24/111` | `ctx_ready`、`zoomTween` |
  | `blog-ui/js/detect.js:46/117` | `STOP_WORDS`（整段停用词表）、`topN` |
  | `blog-ui/js/diary.js:307/2570` | `companionTimer`、局部 `e0` |
  | `blog-ui/js/index-bird.js:17/19` | `SLOT_ID`、`FLY_MS` |
  | `blog-ui/js/internet_cafe-1.js:672` | `sfxUp` |
  | `blog-ui/js/me.js:25` | `SIG_PLACEHOLDER` |
  | `blog-ui/js/pptgen.js:297` | `solv` |
  | `blog-ui/js/roundtable-bird.js:102` | `GRAB_FOLLOW` |
  | `blog-ui/js/roundtable-voice.js:85/105` | `MADE_DIRS`、`THEO_DIRS` |
  | `blog-ui/js/shelf.js:2075` | `FRAMES_HALF` |
  | `blog-ui/js/write-madeline.js:5/6` | `USER_AVATAR`、`PM_BASE_SIZE` |

### 2.5 已废弃的事件绑定

- [ ] **D-09（执行序号 9）`blog-ui/js/diary.js:219-223`**
  - 内容：`getElementById('bookPrev'/'bookNext')` 与两个 `addEventListener`。
  - 证据：源码注释已写明“侧面箭头已移除”；两个 id 在 29 个 HTML 中 0 命中。

- [ ] **D-10（执行序号 10）`blog-ui/js/shelf.js:831`**
  - 内容：`const sbStrawImg = document.getElementById('sbStrawImg');`
  - 证据：变量在后续代码中 0 引用（全文件仅此 1 次）；`shelf.html` 无该 id。

### 2.6 死 CSS 规则

判据：选择器中的 class/id 在全部 HTML + JS 中 0 命中，且不属于 `emotion-*` / `rank-*` / `tb-*` 动态拼接。共约 60+ 选择器 / 40 条规则块。

- [ ] **D-11（执行序号 11）`blog-ui/css/common.css:166,171`**
  - `.btn-danger` 两条规则；HTML/JS 0 命中。

- [ ] **D-12（执行序号 12）`blog-ui/css/diary.css`**
  - `L29-45`：每个情绪类下的 `.content-editor`（9 处）
  - `L130,141,142,153,160`：`.content-editor` 旧编辑器样式
  - `L162,180,200,201`：`.save-btn`
  - `L186,199`：`#testEmotionBtn`
  - `L264`：`#quickSendBtn`
  - `L434,451-453,460,466-467,475,480`：`#emotion-analysis-bar`、`.emotion-label/track/fill/tags/tag/intensity`
  - `L568,577,578`：`#emotion-wave`
  - `L644`：`.portrait-right`
  - `L821`：`.sb-fire-base`
  - 证据：以上 class/id 在 29 个 HTML + 全部 JS 中均为 0 命中。

- [ ] **D-13（执行序号 13）`blog-ui/css/internet_cafe.css:30`**
  - `.eyebrow`；0 命中。

- [ ] **D-14（执行序号 14）`blog-ui/css/messages.css:99,103`**
  - `#sideChat`、`#sideNotify`；0 命中。

- [ ] **D-15（执行序号 15）`blog-ui/css/roundtable.css:70,470,475,537`**
  - `.sugg-list`（页面实际使用 `sugg-head/card/...`）、`.observer-badge`、`.live-empty`；0 命中。

- [ ] **D-16（执行序号 16）`blog-ui/css/shelf.css:150,165-181,579`**
  - `.sb-flash`；整块 `#snapJournalModal` / `.sj-*`（19 个选择器）；`.ds-stars`；0 命中。

- [ ] **D-17（执行序号 17）`blog-ui/css/write.css:112`**
  - `.portrait-right`；0 命中。

### 2.7 无引用静态资源

- [ ] **D-18（执行序号 18）`blog-ui/celeste-gui/shelf-screen.png`**
  - 4.81MB；文件名 0 命中；同目录 `shelf-screen.webp` 被 CSS 引用。

- [ ] **D-19（执行序号 19）`blog-ui/celeste-gui/shop-screen.png`**
  - 4.31MB；文件名 0 命中；`shop-screen.webp` 在用。

- [ ] **D-20（执行序号 20）`blog-ui/Atlases/WaveDashing/凌波微步.ppt.pptx`**
  - 6.89MB；文件名 0 命中；`berryos.html` 仅显示标题文字，`pptgen.js` 在前端生成 `.ppt`，不读取该文件。

- [ ] **D-21（执行序号 21）Atlases 下未被引用的叶子目录**
  - 规模：1205 个文件 / 560.2KB；判据：目录名与其中全部文件名在 HTML/JS/CSS/JSON 中 0 命中；典型如 `badelineBoss`、`decals/0-prologue` 等。

- [ ] **D-22（执行序号 22）空目录 `blog-ui/celeste-mountain/`**
  - 0 个文件；无任何引用。

### 2.8 后端无调用代码

- [x] **D-23（执行序号 23）`blog-api/.../utils/QiniuUtils.java:15-47`（`url` L19、`upload` L26）**
  - 已删除：整个 `QiniuUtils.java`；同步移除 `blog-api/pom.xml`、根 `pom.xml` 的 qiniu 依赖，以及 `application.properties`、`application-prod.yml` 的 qiniu 配置。
  - 复检：`QiniuUtils` / `com.qiniu` / `qiniu.accessKey` / `qiniu-java-sdk` 在源码与配置中均为 0 命中；`mvn clean compile` 通过。
  - 接替：`UploadController.upload` 使用 `R2Utils`，R2 不可用时回退数据库 `UploadImageService`。
  - 文档残留：`README.md`、`README.src.md` 仍保留 qiniu 示例配置说明，属文档层残留，未改动。

- [ ] **D-24（执行序号 24）`blog-api/.../service/diarychat/ValidationTemplates.java:14-78`**
  - 成员：`JUDGE_SYSTEM_PROMPT` L19、`formatJudgeUserPrompt` L44、`JUDGE_SINGLE_SYSTEM_PROMPT` L59、`truncate` L73。
  - 证据：类名与三个公开成员在全库（含测试）外部命中 0；非 Spring Bean。

- [ ] **D-25（执行序号 25）`blog-api/.../utils/IpUtils.java` 的 5 个死方法（复核改判：不删，保留原样）**
  - `internalIp(String)` L58-61、`internalIp(byte[])` L70-111、`textToNumericFormatV4()` L113-198、`getHostIp()` L200-217、`getHostName()` L218-262。
  - 零引用证据：`internalIp` 全库 3 次，全部在 IpUtils 内部（2 个声明 + 1 次死方法自调用）；其余 3 个方法各 1 次（定义处）。外部只调用 `getIpAddr()`（`LogAspect`）。
  - 不删理由：仅满足“零调用”，不满足“具体接替符号”；`getIpAddr()` 不是这 5 个方法的上位替代，JDK `InetAddress` 也不能作为项目内接替符号。

- [x] **D-26（执行序号 26）`blog-api/.../service/ai/AiClient.java:257`**
  - 已删除：`testKey(String)` 方法及其 Javadoc。
  - 复检：`testKey(` 排除定义处与文档后源码命中 0；`probeKey`、`testKeyModel` 保留。
  - 接替：`testKeyModel`（`SysUserServiceImpl:298` 调用）；提供商探测仍走 `probeKey`（`SysUserServiceImpl:250/292/305`）。

- [ ] **D-27（执行序号 27）`ArticleService.java:12` + `ArticleServiceImpl.java:115`**
  - `listArticlesPage(PageParams)`；方法名全库 2 次（接口 + 实现），无调用方/测试，不在 Controller 暴露。

- [x] **D-28（执行序号 28）`SysUserService.java:12` + `SysUserServiceImpl.java:63`**
  - 已删除：接口声明与实现方法已一并移除。
  - 复检：`findUser(` 排除定义处与文档后全库源码命中 0（含 `src/test`）；无 XML/脚本/前端引用。
  - 接替：`findUserByAccount`（`LoginServiceImpl:57/159` 调用），密码校验由 `passwordEncoder.matches` / MD5 / 明文比对完成（`LoginServiceImpl:63-75`）。

- [ ] **D-29（执行序号 29）`TagService.java:19,21` + `TagServiceImpl.java:70,75`**
  - `findAllDetailByCategoryId`、`findDetailById`；各 2 次（接口 + 实现），无调用方。

- [x] **D-30（执行序号 30，部分删除）`DiaryChatLogService.java:48`**
  - 已删除：`recordFeedback(Long,String)`；`listByUserAndSession` 按用户要求保留。
  - 复检：`recordFeedback(` 排除定义处与文档后源码命中 0；`listByUserAndSession` 保留。
  - 接替：`recordFeedbackBySession`（`DiaryController:126` 调用）。

- [ ] **D-31（执行序号 31）`DiaryChatInterruptManager.java:73`**
  - `isReplying(sessionId)`；全库仅定义处 1 次。

- [ ] **D-32（执行序号 32）`MemoryServiceImpl.java:65` + `application.properties`（现 L79）`rag.quota.lore`（复核改判：不删，保留）**
  - 字段 `loreQuota` 与配置 `rag.quota.lore=0.2`；字段全类仅声明 1 次，实际配额由 `lorQuota = cap-memQuota-diaQuota`（L236）计算，配置值读取后丢弃。
  - 零引用证据：`loreQuota` 仅 `MemoryServiceImpl:64-65` 声明处；`rag.quota.lore` 仅 `application.properties` 与同一 `@Value` 各 1 处；无 `@ConfigurationProperties` 绑定。
  - 不删理由：满足零引用，但无具体接替符号；`reRank()` 内局部变量 `lorQuota`（L236）是另行计算的结果，不是该配置项/字段的替代者。

- [ ] **D-33（执行序号 33）`RoundtablePersonas.java:55`（复核改判：不删，保留）**
  - `isAiSpeaker()`；全库仅定义处 1 次；圆桌返回值为手工 Map，枚举不被 Jackson 直接序列化。
  - 零引用证据：`isAiSpeaker(` 在源码（含 `src/test`）、脚本、前端、文档中除定义处外 0 命中。
  - 不删理由：满足零引用，但无具体接替符号；`aiSpeakers()`（L83）使用的是字段 `aiSpeaker`，不是该 getter 的替代者。

---

## 3. 大概率可删（L 档，14 条）

> 判据：代码引用为 0，但存在“外部直接 URL 访问”或“作者预留”可能。删除前建议确认没有对外分享过的链接。

### 3.1 无入口 HTML 页面

- [x] **L-01｜`blog-ui/api-key-setup.html`（已于本次请求删除）**
  - 删除前全库 0 命中；与 `api-key-setup-enhanced.html` 功能重复。

- [x] **L-02｜`blog-ui/celeste-hair-demo.html`（已于本次请求删除）**
  - 删除前全库 0 命中；其脚本 `celeste-hair.js` 保留。

- [ ] **L-03（执行序号 34）`blog-ui/celeste-aurora-demo.html`**
  - 7KB；文件名在 HTML/JS/CSS/文档/README 中 0 命中；独立 demo。

- [ ] **L-04（执行序号 35）`blog-ui/celeste-mirror.html`**
  - 13.5KB；0 命中；其脚本 `celeste-mirror.js` 仍被 `shelf.html` 使用。

- [ ] **L-05（执行序号 36）`blog-ui/sing.html`**
  - 17.4KB；0 命中；旧 SVS 调试页，已被 `sing-test.html` 体系替代。

- [ ] **L-06（执行序号 37）`blog-ui/sing-v5.html`**
  - 9.7KB；0 命中。

- [ ] **L-07（执行序号 38）`blog-ui/secret-voice.html`**
  - 13KB；0 命中。

### 3.2 因页面无入口而链式失效的 JS

- [ ] **L-08（执行序号 39）`blog-ui/js/melody.js`**
  - 27.9KB / 570 行；仅被 `sing.html` 加载。

- [ ] **L-09（执行序号 40）`blog-ui/js/sing-studio.js`**
  - 25.5KB / 548 行；仅被 `sing.html` 加载。

- [ ] **L-10（执行序号 41）`blog-ui/js/sing-v5.js`**
  - 64.7KB / 1224 行；仅被 `sing.html`、`sing-v5.html` 加载。

- [ ] **L-11（执行序号 42）`blog-ui/js/secret-voice.js`**
  - 16.2KB / 375 行；仅被 `secret-voice.html` 加载。

### 3.3 其它

- [ ] **L-12（执行序号 43）`DiaryChatEmotionExtractor.java:181,182,184,187,188,192`**
  - 6 个未使用访问器：`getTextScore` L181、`setTextScore` L182、`setTrajectoryScore` L184、`getConfidence` L187、`setConfidence` L188、`setSpeakReadiness` L192。
  - 证据：各方法名全库仅定义处 1 次；`EmotionResult` 只进内存缓存 `PRE_PROCESS_CACHE`（L124-132），不序列化/落库。因是公开 DTO 访问器，保守归入此档。

- [ ] **L-13（执行序号 44）`blog-ui/attic/cs10-launch-transition/` 归档文件**
  - `bird-ascent.js`、`index-bird.ascent.css`；0 页面引用。
  - 说明：属作者主动归档的旧实现，建议保留或确认后删。

- [ ] **L-14（执行序号 45）`blog-ui/Atlases/Mountain/`**
  - 41.3MB / 36 个 PNG；目录名与全部文件名在 HTML/JS/CSS/JSON 中 0 命中（`grep -i mountain` 仅命中无关的 `mymountain_icon`）。
  - 说明：设计草案提到“山景 hero 候选”但代码从未接入；确认不做后删除可减约 41MB 部署体积。

---

## 4. 需人工确认（M 档，5 条）

- [ ] **M-01（执行序号 46）`blog-ui/js/diary.js:300` 的 `saveBtn` 绑定**
  - 证据：`document.getElementById('saveBtn')` 在 29 个 HTML 与 JS 模板中均无 `id="saveBtn"`；后续 4 处使用均有 `if (saveBtn)` 保护。
  - 判断点：绑定永远不触发，但可能是“待恢复保存按钮”的预留代码。

- [ ] **M-02（执行序号 47）`blog-ui/js/shop.js:45` 的 `oshiroPortrait`**
  - 证据：`shop.html` 无该元素；L59 有 `if (oshiroPortrait)` 保护；立绘实际走 `dialogPortraitImg`。
  - 判断点：只是分支空转，删除会影响动画函数结构可读性。

- [ ] **M-03（执行序号 48）`DiaryChatInterruptManager.java:43` 的 `clear()`**
  - 证据：生产代码 0 调用，测试代码 1 处调用。
  - 判断点：删除需同步改测试，不属于“生产死代码”。

- [ ] **M-04（执行序号 49）`SessionBus.java:70` 的 `subscriberCount()`**
  - 证据：生产代码 0 调用，测试 1 处调用（`SessionBusTest:52`）。
  - 判断点：测试专用观测 API，保留成本低。

- [ ] **M-05（执行序号 50）`blog-api/.../controller/TestController.java`**
  - 证据：类名外部引用 0，但含 `@RequestMapping` 端点。
  - 判断点：看似调试代码，但属可被外部 HTTP 直接访问的入口，删除前需确认线上无人调用。

---

## 5. 框架机制不可删（F 档，9 类）

> 这些项在 grep 中同样只有 1 处或 0 处引用，但由框架/运行时驱动，不得按死代码删除。

- **F-01 AOP 切面**：`common/aop/LogAspect.java`、`common/aop/CacheAspect.java`
  - 类外部引用 0，但 `@LogAnnotation`（`ArticleController`）与 `@Cache(...)`（多处）是切点；删除会让日志/缓存静默失效。

- **F-02 Spring Bean**：所有 `@Service` 实现类、`@RestController`、`@Configuration`、`@Bean` 方法
  - 由容器注入，源码中无类名引用。

- **F-03 MyBatis**：`dao/mapper/*.java` 与 XML statement
  - 由代理调用；Mapper 接口方法不要按“无调用”删除。

- **F-04 Web 容器回调**：`UTF8EncodingFilter`、`TraceIdFilter`、`LoginIntercepter`、`WebMVCConfig` 的 `addCorsMappings`/`addInterceptors`、`HttpServletRequestWrapper` 覆写方法
  - 由 Servlet/Spring MVC 回调。

- **F-05 启动任务**：`SchemaInitializer.java`、`tool/LoreIngest.java`、`ReminderServiceImpl.dispatchDue`
  - `CommandLineRunner` / `@Scheduled` 驱动。

- **F-06 序列化字段**：POJO/VO 的 getter/setter、Lombok 生成访问器
  - Jackson/MyBatis 使用，静态无引用。

- **F-07 动态 CSS**：`.emotion-*`、`.rank-1/2/3`、`.tb-*`
  - JS 分别以 `'emotion-' + sceneClassMap[..]`、`'rank-' + n`、`'tb-' + speakerId` 拼接生成。

- **F-08 动态 JS**：`window.*` 暴露对象、`MadelineMood`、`FeltPiano` 等
  - 由其它脚本按全局名调用。

- **F-09 外部页面入口**：`celeste-character-demo.html`、`celeste-chapter-complete-demo.html`、`celeste-farewell-remembered-demo.html`、`messages.html`
  - 文档给出线上/本地 URL，或作为当前聊天入口；不得按“无内链”删除。

---

## 6. 重复实现（R 档，2 条，不属直接删除）

- [ ] **R-01（执行序号 51）实体 → VO 拷贝**
  - `ArticleServiceImpl.java:105`（`copyList`）
  - `CategoryServiceImpl.java:48,55`（`copy` / `copyList`）
  - `TagServiceImpl.java:23,30`（`copy` / `copyList`）
  - `CommentsServiceImpl.java:100,107`（`copy` / `copyList`）
  - 证据：4 个类各写一遍 `BeanUtils.copyProperties` 循环；类型不同，只能抽象，不能直接删。

- [ ] **R-02（执行序号 52）SSE 帧写入**
  - `DiaryServiceImpl.java:1116-1132`
  - `MadelineAgentEngine.java:222-237`
  - 证据：两段 17 行方法体逐行相同，仅参数全限定名不同；可合并为公共工具。

已排除的同名但**不算重复**：`truncate`（3 处，参数/语义不同）、`clamp`（2 处，类型/区间不同）、`doFilter`（Servlet 接口实现）。

---

## 7. 汇总

| 档位 | 条目数 | 说明 |
|---|---|---|
| 确定可删（D） | 33 | 含 11 个死函数、23 个死变量为 1 条分组、约 40 条 CSS 规则块、约 58MB 静态资源 |
| 大概率可删（L） | 14 | 含 7 个无入口页面（2 个已删除）、4 个链式 JS、2 个预留/归档项、Mountain |
| 需人工确认（M） | 5 | 2 个空转绑定、2 个测试专用 API、1 个调试端点 |
| 框架机制不可删（F） | 9 类 | 仅记录，不执行删除 |
| **四档合计** | **61** | 一级条目；D-07/D-08 内部共 34 个子项 |
| 重复实现（R） | 2 | 合并建议，不计入四档 |

**执行建议**：严格按第 1 节序号执行；1-33 为无争议清理，34-45 需先确认外部直达 URL，46-50 需产品/测试确认，51-52 建议单独作为重构任务，不与清理混做。

**2026-11-06 第二批复核结果**：实际删除 4 条（D-23 七牛云、D-26 `AiClient.testKey`、D-28 `SysUserService.findUser`、D-30 的 `recordFeedback`）；D-25 `IpUtils`、D-32 `loreQuota`、D-33 `isAiSpeaker` 复核后不满足“具体接替符号”条件，改判不删并保留原样。`mvn clean compile` 通过。
