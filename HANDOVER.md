# 交接文档（2026-10-02）—— 给下一个 AI

> 你只剩 2 次对话额度。本文档自包含：读完后不需要探索代码库即可干活。
> 配合你的记忆系统（project_memory.md 已同步本轮快照）一起看。

---

## 一、项目概况

Celeste（游戏）主题个人博客 + AI 陪伴 demo 集合。

```
c:\Users\28464\IdeaProjects\blog\
├── blog-api\     Spring Boot 2.5 + MyBatis-Plus 后端（端口 8888，Java 17 语法但 Boot 2.5）
├── blog-ui\      纯原生 HTML/JS 前端（无框架无构建，静态文件直用）
└── cloudflare-keepalive\   Cloudflare Cron Worker 保活（每 5 分钟 ping 后端 health）
```

云端架构（已全线跑通，**不要动 DNS 记录**）：
- 前端：Cloudflare Pages 项目 `instapix`（instapix.pages.dev / 自定义域 instapix.icu）
- 后端：Render Docker 部署（api.instapix.icu），Dockerfile 多阶段构建，`SPRING_PROFILES_ACTIVE=prod`
- 数据库：TiDB Cloud Serverless（东京）；Redis 也在 prod 配置里（需要 commons-pool2 依赖）

## 二、环境与常用命令

```bash
# 前端本地服务（在项目根目录跑）
python -m http.server 8765 --directory blog-ui

# 后端编译检查（不启动）
D:\apache-maven-3.6.1-bin\apache-maven-3.6.1\bin\mvn.cmd compile -f blog-api/pom.xml

# 前端部署（素材不进 git，wrangler 直传 blog-ui 目录）
npx wrangler pages deploy blog-ui --project-name=instapix --branch=main
# wrangler 登录态在 %APPDATA%\xdg.config\.wrangler\config\default.toml
# 若未登录：npx wrangler login --browser=false（沙箱里浏览器 OAuth 会卡死，用手动链接模式）

# 后端部署：git push 后 Render 自动构建
```

**本地联调后端的固定流程**（每次测完必须回滚）：
1. `blog-ui/js/api.js` 的 BASE_URL 改成 `http://localhost:8888`
2. `blog-api/.../config/WebMVCConfig.java` 的 CORS 白名单加 `http://localhost:8765`
3. 启动后端（端口 8888）
4. 测完全部回滚，`mvn compile` 确认

## 三、当前状态（最重要）

**本轮所有改动都只在本地，线上（instapix.icu）还是旧版。**
用户此前看到"index 搜索按钮还是 emoji、还有奇怪行为"都是因为没部署。下一步如果用户没别的需求，提醒部署前端即可（一条 wrangler 命令，见上）。

本轮（2026-10-01 ~ 10-02）完成并实测的工作：

| 功能 | 状态 | 关键文件 |
|------|------|---------|
| 圆桌会议无限讨论模式（达成共识 avg≥75 自动收尾 / 用户 stop / 20 轮硬上限） | 完成 | 后端 RoundtableEngine.java、RoundtableController.java；前端 roundtable.html |
| 主持鸟 focusSeat 跟随发言人 | 完成 | blog-ui/js/roundtable-bird.js + roundtable.html 的 turn_prepare 事件 |
| Oshiro 禁止"大崎先生"开头、Badeline"亲爱的"限频、全员中文名称呼 | 完成 | 后端 RoundtablePersonas.java |
| 实时聊天 demo（SSE + 表情包 + 通知栏同页左右布局） | 完成 | blog-ui/realtime-chat.html（左聊天右通知，窄屏堆叠） |
| 聊天消息重复显示修复（SSE 与 API 回包竞态，pending 替换 + seenIds 去重） | 完成 | realtime-chat.html |
| index 搜索按钮 → "Search"（无 emoji）；message 按钮 → "Chat" | 完成 | index.html、js/auth.js（6 个页面引用已带 ？v=20261002） |
| article.html 卡片透明度 0.4 + 背景对齐 index + marked.js 本地化 + 5 系列表情包 | 完成 | article.html、js/marked.min.js（本地，防 CDN 被墙） |
| write.html 回退掉落动画（定时器泄漏修复 + y 下边界 clamp + 删"摔了一跤"提示） | 完成 | write.html |
| **fallPose 帧序列**：write 页蹦跳落地摔跤 + diary 页行为树随机 fall 模式 | 完成 | js/write-madeline.js、js/diary.js、css/diary.css（PM_FRAMES 帧机制，55ms/帧） |
| berryos PPT：第 4 页音效 fade 不存在导致报错 → 修复；封面标题改「{困境}与我」；localStorage 缓存 key 升 v2 废旧缓存 | 完成 | berryos.html、js/pptgen.js |
| internet_cafe 粒子密集铺到中央穹顶建筑周围（CORE 70% + ZONE 30%，16→44 颗） | 完成 | internet_cafe.html |
| archives 网咖按钮：加了又按用户要求**回退删除**了 | 保持回退态 | archives.html（勿再添加） |

## 四、已知待办

1. **部署前端**（唯一明确待办）：`npx wrangler pages deploy blog-ui --project-name=instapix --branch=main`
2. 后端本轮已改（RoundtableEngine 无限模式 + Personas 措辞），`mvn compile` 通过。部署后端 = git push（Render 自动构建）。**注意：若数据库有新列迁移，必须先跑迁移脚本再部署 jar**，否则 MyBatis 报 Unknown column。
3. 无其他明确待办。用户审美敏感，别主动加功能。

## 五、踩坑实录（必读，都是真金白银换来的）

**缓存三连坑**（本轮反复中招）：
- 改任何 js/css 必须给所有引用它的页面加/改版本号 `?v=YYYYMMDD`，否则浏览器缓存旧脚本，你会误判"改了没生效"然后白白调试半天
- berryos 的 PPT 内容缓存在 localStorage `berryos-ppt-cache-v2`（24h），改生成逻辑后要么换 key 要么清缓存
- 判断脚本是否新版：`performance.getEntriesByType('resource').some(r => r.name.includes('xxx.js?v=NNN'))`

**浏览器自动化测试的坑**（用 browser agent 实测时）：
- `element.click()` 合成点击**没有用户手势**，音频/全屏类全部被 Chrome 拒绝（NotAllowedError）。必须用 browser_click 工具（CDP 真实输入）
- 给 HTMLAudioElement.prototype.play 打 hook 容易写错污染整页（ReferenceError 后所有 play 失效）。berryos 里 `window.sfx` 是**顶层 var，全局可访问**，直接轮询每个 Audio 的 `paused/currentTime/error` 最可靠
- media 事件（play/error）不冒泡，document 冒泡监听收不到；注入监听器必须在 **reload 之后**做，否则被清空

** berryos PPT 音效表**：PAGE_SFX 的音效键必须是 sfx 表里存在的（cube/dissolve/spin/whoosh/impossible/easy/happy/on/off）。之前第 4 页写了不存在的 'fade' 导致 TypeError。delay 单位 ms，enterSfx 会 ×1.3 对齐动画节奏（历史调优值 9800→12740ms、10500→13650ms 不要乱动）。

**其他关键坑**（详见 project_memory.md，此处只列高频的）：
- AiClient 有熔断器：连续失败 5 次熔断 30s 返回 null；圆桌会议 callSpeaker 返回 null 会 notice 跳过该角色
- roundtable.html 的 EventSource error 即 close 不重连（防重复开会的刻意设计，别"修"它）
- BGM 必须 fetch→blob URL 播放（静态服务器不支持 Range 时直连 src 会 ERR_ABORTED）
- bird 帧文件名大小写敏感（`flyup00` + `FlyUp01-15`、`hover00/01` + `Hover02-05`），Linux 线上会炸
- 素材不进 git（blog-ui 的 Atlases 等 374MB），仓库里没有，部署走 wrangler 直传
- 接口语义：`POST /articles`（body {"page":1,"pageSize":N}）才是文章列表；curl 测 POST 必须 `--data-binary @file.json`（PowerShell 转义会污染请求体）
- fallPose 帧图 32×32，CSS 里 `[src*="fallPose"]` 用 100px 宽显示（write-madeline.js 内联 CSS 和 diary.css 都已有此规则）
- 联调后行为：改 BASE_URL/回滚、临时高权重/回滚、测试数据/清理——**测完必回滚**是铁律

## 六、关键文件地图

```
前端（blog-ui\）
├── index.html / archives.html / article.html / write.html / diary.html   主页面
├── realtime-chat.html        实时聊天+通知栏合并页（auth.js 的 Chat 按钮指向这里）
├── roundtable.html           AI 圆桌会议
├── berryos.html              像素桌面 OS（PPT 播放器、图标双击、音效全套）
├── internet_cafe.html        网咖彩蛋页（neon 招牌 15 帧动画 + 粒子）
├── js\
│   ├── api.js                BASE_URL 在这（联调要改、测完回滚）
│   ├── auth.js               顶部 Chat 按钮 + 未读角标
│   ├── write-madeline.js / diary.js / madeline-core.js   像素小人状态机（PM_FRAMES 帧机制）
│   ├── roundtable-bird.js / roundtable-portraits.js / roundtable-voice.js
│   ├── pptgen.js             PPT 内容生成（buildPrompt 角色化 prompt、GRID_TEMPLATE 格子模板、localStorage 缓存）
│   ├── seed.js               草莓籽动画（汇聚时 scale 固定 1，最后 14% 淡出）
│   └── marked.min.js         本地 markdown 渲染
├── css\diary.css             #pixelMadeline 尺寸规则
└── Atlases\                  全部素材（不进 git）

后端（blog-api\src\main\java\com\mszlu\blog\）
├── dao\controller\RoundtableController.java   圆桌 SSE（X-Accel-Buffering:no 已加，Nginx 防缓冲）
├── service\ai\roundtable\RoundtableEngine.java   无限讨论主循环（while + judge(avg≥75) 收尾 + 20 轮上限）
├── service\ai\roundtable\RoundtablePersonas.java 角色人设（中文名称呼硬规则、Oshiro/Badeline 措辞约束）
├── service\ai\roundtable\RoundtableSession.java
├── service\ai\PromptBuilder.java / AiClient.java（熔断器在这）
└── config\WebMVCConfig.java   CORS 白名单（联调要加 8765、测完回滚）
```

## 七、用户偏好（严格遵守，违反会返工）

1. **中文沟通**，回复简短直接，先结论后细节
2. **严格按指示做，不做额外修改**——让你回退就干净回退，让你加哪就只加哪
3. 像素/Celeste 风格神圣：像素图边缘清晰、色彩有限；**优先用原版素材**，别自己发挥设计（AI 味 = 上世纪的产物 = 重做）
4. demo 类功能纯内存实现即可，不过度精修，但要求前端完整可用
5. 改动要**实测验证**再报告完成（浏览器自动化验证是标配）；临时配置测完回滚
6. 对删除敏感：说过"在页面增加之前的消息通知栏而不是删除"——宁可合并保留，不要擅自删旧功能
7. PPT 生成文案要 Madeline 口吻（"好难！"不是"很难"），≤12 字短句，上世纪黑名单词汇禁令在 pptgen.js 的 prompt 里

## 八、下一个 AI 的第一步建议

用户说只剩 2 次额度。最可能的情况：
- 用户提新需求 → 按第五节坑位清单 + 第七节偏好直接干，测完回滚，报告简洁
- 用户问进度 → 答：全部本地完成待部署，一条命令 `npx wrangler pages deploy blog-ui --project-name=instapix --branch=main`，后端 git push 触发 Render
- 千万别做的：动 DNS 记录、动 git 里不存在的素材、重新设计像素元素、给 archives 加网咖按钮（已明确回退）
