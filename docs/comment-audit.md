# 占位式假注释审计（最终口径）

- 审计范围：整个项目（`blog-api` Java、`blog-api/src/main/resources` 配置、`blog-ui` JS/CSS、`blog-admin` Java、构建配置）
- 审计日期：2026-11-07
- 本阶段**只写文档，未修改任何源码**；本文件已按最终口径重写，之前任何锚点清单均作废，不在本清单中混入。

## 0. 搜索口径

按原文（大小写不敏感）搜索注释中的：

- 英文：`existing code` / `existing` / `rest of the code` / `...unchanged` / `remain(s) unchanged` / `same as before` / `unchanged`
- 中文：`原有代码` / `原有逻辑` / `原代码` / `其余不变` / `其他不变` / `保持不变` / `不变动` / `以下省略` / `省略` / `（略）` / `(略)`
- 纯占位：单独一行的 `// ...`、`// ……`、`/* ... */`、`// ***`、`// TODO: 保留`

红线：Java 文本块 `"""`、字符串字面量、正则里的同名文字不计；JSON、第三方库、压缩资源、`node_modules`、生成物不看；HTML 的 `<!-- ... -->` 只单独统计。

---

## 1. 总览

| 指标 | 数量 |
|---|---:|
| 源码注释命中总数 | **32 处 / 15 个文件** |
| 其中：纯占位（可删） | **6 处 / 1 个文件** |
| 其中：可疑（勿删，附上下文） | **9 处 / 1 个文件** |
| 其中：正常用途（排除） | **17 处 / 15 个文件** |
| 独立 `// ...` / `/* ... */` 占位 | **0 处** |
| HTML 注释命中（单独统计） | **1 处 / 1 个文件**（`blog-ui/shop.html:57`） |

### 按文件分布

| 文件 | 命中 | 纯占位 | 可疑 | 正常用途排除 |
|---|---:|---:|---:|---:|
| `blog-api/src/main/java/com/mszlu/blog/dao/pojo/DiaryChatLog.java` | 1 | 0 | 0 | 1 |
| `blog-api/src/main/java/com/mszlu/blog/handler/LoginIntercepter.java` | 1 | 0 | 0 | 1 |
| `blog-api/src/main/java/com/mszlu/blog/impl/DiaryServiceImpl.java` | 1 | 0 | 0 | 1 |
| `blog-api/src/main/java/com/mszlu/blog/service/ai/AiClient.java` | 1 | 0 | 0 | 1 |
| `blog-api/src/main/java/com/mszlu/blog/service/ai/PromptBuilder.java` | 1 | 0 | 0 | 1 |
| `blog-api/src/main/java/com/mszlu/blog/service/diarychat/DiaryChatLogService.java` | 1 | 0 | 0 | 1 |
| `blog-ui/js/badeline-crawlout.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/celeste-dust-bunny.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/diary-2.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/diary.js` | 16 | 6 | 9 | 1 |
| `blog-ui/js/internet_cafe-1.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/roundtable-portraits.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/shelf.js` | 1 | 0 | 0 | 1 |
| `blog-ui/js/shop.js` | 3 | 0 | 0 | 3 |
| `blog-ui/js/sing-studio.js` | 1 | 0 | 0 | 1 |

说明：纯占位与可疑全部集中在 `blog-ui/js/diary.js`，共 15 处 `// ... existing code ...`；其余 17 处是正常用词。

---

## 2. 纯占位清单（可照着删）

> 判据：占位行上下/下面代码完整，删掉这一行不影响任何逻辑。

| 文件 | 行号 | 原文（可删） |
|---|---|---|
| `blog-ui/js/diary.js` | L730 | `// ... existing code ...` |
| `blog-ui/js/diary.js` | L2655 | `// ... existing code ...` |
| `blog-ui/js/diary.js` | L2720 | `// ... existing code ...` |
| `blog-ui/js/diary.js` | L2869 | `// ... existing code ...` |
| `blog-ui/js/diary.js` | L2873 | `// ... existing code ...` |
| `blog-ui/js/diary.js` | L2981 | `// ... existing code ...` |

共 **6 处**，全部位于 `blog-ui/js/diary.js`，均为单行 `// ... existing code ...`。

---

## 3. 可疑清单（不要自己删，先看上下文）

> 判据：占位符缩进突然断裂（顶格出现在有缩进的代码块中）。代码下方看起来是完整的，但仍按要求列为可疑，附前后各 10 行。

### `blog-ui/js/diary.js:705`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
  695 |                 if (messages.length > 1) await sleep(240 + Math.random() * 200);
  696 |             }
  697 |             lastMsgEmotion = voiceEmotion;
  698 |         }
  699 |         pmReactToEmotion(lastMsgEmotion);
  700 |         if (useGameDialog && myToken === gameDialogToken) {
  701 |             stopPortraitAnim();
  702 |             scheduleGameDialogHide();
  703 |         }
  704 |     }
  705 | // ... existing code ...  ← 命中
  706 |     function addUserMessage(text) {
  707 |         const row = document.createElement('div');
  708 |         row.className = 'msg-row user-row';
  709 |         const bubble = document.createElement('div');
  710 |         bubble.className = 'msg-bubble';
  711 |         bubble.textContent = text;
  712 |         row.appendChild(bubble);
  713 |         chatMessages.appendChild(row);
  714 |         chatMessages.scrollTop = chatMessages.scrollHeight;
  715 |     }
```

### `blog-ui/js/diary.js:1485`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 1475 |         },
 1476 |         EMOTION_COLORS: {
 1477 |             '默认': '#A8E6CF', '不安': '#FF6B6B', '惊讶': '#7DCFFF',
 1478 |             '怨恨': '#FF4444', '不开心': '#9B59B6', '可爱': '#FF69B4', '无语': '#B0B0B0'
 1479 |         },
 1480 |         EMOTION_WEIGHTS: { '不安':1.2, '惊讶':1.0, '怨恨':1.3, '不开心':1.2, '可爱':1.0, '无语':0.8 }
 1481 |     };
 1482 |     // 暴露情绪词表/色板给 TextFx（日记关键词波浪高亮）
 1483 |     window.__DIARY_EMOTION_WORDS = REALTIME_CONFIG.EMOTION_WORDS;
 1484 |     window.__DIARY_EMOTION_COLORS = REALTIME_CONFIG.EMOTION_COLORS;
 1485 | // ... existing code ...  ← 命中
 1486 | 
 1487 |     const companionState = {
 1488 |         lastAnalyzedText: '',
 1489 |         lastAnalyzedLen: 0,
 1490 |         // 已经真正开口回应过的稿本前缀：新一轮只把这段之后的新内容送给她读，
 1491 |         // 避免把回复过的旧段落反复重读、说出意思差不多的第二遍。
 1492 |         repliedText: '',
 1493 |         currentEmotion: '默认',
 1494 |         previousEmotion: '默认',
 1495 |         emotionHistory: [],
```

### `blog-ui/js/diary.js:2236`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2226 |     async function saveDiary() {
 2227 | 
 2228 |         const title = titleInput.value.trim();
 2229 |         const content = contentInput.value.trim();
 2230 |         if (!content) { showToast('写点什么再保存吧~', 'error'); return; }
 2231 |         if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
 2232 | 
 2233 |         playSaveAnimation();
 2234 | 
 2235 |         try {
 2236 | // ... existing code ...  ← 命中
 2237 |             const extras = [];
 2238 |             for (let i = 0; i < localStorage.length; i++) {
 2239 |                 const k = localStorage.key(i);
 2240 |                 if (k && k.indexOf('jbook-') === 0) {
 2241 |                     const v = (localStorage.getItem(k) || '').trim();
 2242 |                     if (v && v.indexOf('[') !== 0) extras.push(v);
 2243 |                 }
 2244 |             }
 2245 |             const payload = { title: title || '无题', content: extras.length ? content + '\n\n' + extras.join('\n') : content };
 2246 |             if (editingDiaryId) payload.id = editingDiaryId;
```

### `blog-ui/js/diary.js:2457`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2447 |                 }
 2448 |             for (const c of cands) {
 2449 |                 if (!pmCaution || !blockedAt(c.x, c.y)) return { x: c.x, y: c.y };
 2450 |             }
 2451 |                 for (const fx of [0.04, 0.96, 0.15, 0.85]) {
 2452 |                 const tx = Math.min(maxX, window.innerWidth * fx);
 2453 |                     if (!pmCaution || !blockedAt(tx, gy)) return { x: tx, y: gy };
 2454 |             }
 2455 |                 return { x: 8, y: gy };
 2456 |             }
 2457 | // ... existing code ...  ← 命中
 2458 |             function pmDetour(now) {
 2459 |                 const book = document.getElementById('journalBook');
 2460 |                 const r = book ? book.getBoundingClientRect() : null;
 2461 |                 if (!r) { pmStartWalk(now); return; }
 2462 |                 const aboveY = Math.max(60, r.top - pm.offsetHeight - 18);
 2463 |                 const belowY = Math.min(pmGroundY(), r.bottom + 18);
 2464 |                 const ty = (pmState.y - aboveY < belowY - pmState.y) ? aboveY : belowY;
 2465 |                 if (!blockedAt(pmState.x, ty)) {
 2466 |                     pmState.targetY = ty;
 2467 |                     return;
```

### `blog-ui/js/diary.js:2591`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2581 |                     const rightX = rect.right + 18;
 2582 |                     if (leftX >= 4 && !blockedAt(leftX, gy)) px = leftX;
 2583 |                     else if (rightX <= maxX && !blockedAt(rightX, gy)) px = rightX;
 2584 |                 }
 2585 |                 pmState.targetX = px;
 2586 |                 pmState.targetY = gy;
 2587 |                 pmSetSrc(PM_SRC.move);
 2588 |             }
 2589 |             return;
 2590 |         }
 2591 | // ... existing code ...  ← 命中
 2592 |         if (pmState.mode === 'peek') { pmState.mode = 'idle'; pmState.modeUntil = 0; }
 2593 | 
 2594 |         if (pmState.mode === 'sleep') {
 2595 |             if (!pmState.nextMurmur) pmState.nextMurmur = now + 12000 + Math.random() * 15000;
 2596 |             if (now >= pmState.nextMurmur) {
 2597 |                 pmState.nextMurmur = now + 18000 + Math.random() * 22000;
 2598 |                 addMadelineMessage(dreamLines[Math.floor(Math.random() * dreamLines.length)], '默认');
 2599 |             }
 2600 |         }
 2601 | 
```

### `blog-ui/js/diary.js:2670`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2660 |                     let ny = pmState.y + (dy / dist) * speed * dt;
 2661 |                     // 自己还站在禁区里时先放行（正在逃离），出去了才恢复绕行
 2662 |                     if (pmCaution && !blockedAt(pmState.x, pmState.y) && blockedAt(nx, ny)) {
 2663 |                         if (!blockedAt(nx, pmState.y)) ny = pmState.y;
 2664 |                         else if (!blockedAt(pmState.x, ny)) nx = pmState.x;
 2665 |                         else { pmDetour(now); nx = pmState.x; ny = pmState.y; }
 2666 |                     }
 2667 |                     pmState.x = nx;
 2668 |                     pmState.y = ny;
 2669 |                 } else if (pmState.mode === 'walk') {
 2670 | // ... existing code ...  ← 命中
 2671 |                     pmState.mode = 'idle';
 2672 |                     pmState.modeUntil = now + 300 + Math.random() * 700;
 2673 |                 }else if (pmState.mode === 'celebrate') {
 2674 |                     pmState.mode = 'idle';
 2675 |                     pmState.modeUntil = now + 2600;
 2676 |                     pmState.poseUntil = now + 2200;
 2677 |                     pmState.poseReturn = PM_SRC.move;
 2678 |                     pmSetSrc(PM_SRC.fun);
 2679 |                 }
 2680 |             }
```

### `blog-ui/js/diary.js:2762`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2752 |     }
 2753 |     window.addEventListener('feather-finished', () => { sayAfterFeather(); });
 2754 |     window.addEventListener('feather-landed', (e) => {
 2755 |         sayAfterFeather();
 2756 |         if (window._featherBadMood) {
 2757 |             showFeatherNote();
 2758 |         } else {
 2759 |             if (bookCur === 0) { bookGoto(1); }
 2760 |         }
 2761 |     });
 2762 | // ... existing code ...  ← 命中
 2763 |     let lastComfortAt = 0;
 2764 |     function pmComfort() {
 2765 |         if (performance.now() - lastComfortAt < 10 * 60 * 1000) return;
 2766 |         lastComfortAt = performance.now();
 2767 |         const bk = document.getElementById('journalBook');
 2768 |         const rect = bk ? bk.getBoundingClientRect() : null;
 2769 |         const gy = pmGroundY();
 2770 |         const maxX = window.innerWidth - pm.offsetWidth - 8;
 2771 |         let px = Math.max(8, window.innerWidth * 0.12);
 2772 |         if (rect) {
```

### `blog-ui/js/diary.js:2903`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2893 |     shelfPanel.innerHTML =
 2894 |         '<div class="shelf-head"><h3>回忆书架</h3><button class="shelf-close">✕</button></div>' +
 2895 |         '<div id="shelfList"></div>' +
 2896 |         '<div id="shelfDetail">' +
 2897 |         '<button class="sd-back">← 返回列表</button>' +
 2898 |         '<div class="sd-title"></div><div class="sd-date"></div><div class="sd-content"></div>' +
 2899 |         '<div class="sd-actions"><button class="sd-edit">回去编辑这篇</button><button class="sd-del danger">删掉它</button></div>' +
 2900 |         '</div>';
 2901 |     document.body.appendChild(shelfPanel);
 2902 | 
 2903 | // ... existing code ...  ← 命中
 2904 | 
 2905 |     const shelfList = shelfPanel.querySelector('#shelfList');
 2906 |     const shelfDetail = shelfPanel.querySelector('#shelfDetail');
 2907 |     let shelfData = [];
 2908 |     let shelfCur = null;
 2909 | 
 2910 |     function shelfFmtDate(v) {
 2911 |         if (!v) return '';
 2912 |         const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
 2913 |         if (isNaN(d.getTime())) return String(v);
```

### `blog-ui/js/diary.js:2986`

- 原文：`// ... existing code ...`
- 可疑原因：缩进突然断裂（占位符顶格，上下代码有缩进）

```js
 2976 |         shelfDetail.querySelector('.sd-content').textContent = d.content || '';
 2977 |         shelfDetail.classList.add('show');
 2978 |         const created = new Date(typeof d.createDate === 'number' || /^\d+$/.test(String(d.createDate)) ? Number(d.createDate) : d.createDate);
 2979 |         const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
 2980 |         if (days > 0) addMadelineMessage('这是 ' + days + ' 天前写下的……那时候的你，还好吗？', '可爱');
 2981 |         // ... existing code ...
 2982 |         shelfMemoryRecall(d.content || '', days);
 2983 |     }
 2984 |     shelfBtn.addEventListener('click', () => { location.href = 'shelf.html'; });
 2985 |     shelfPanel.querySelector('.shelf-close').addEventListener('click', () => shelfPanel.classList.remove('open'));
 2986 | // ... existing code ...  ← 命中
 2987 |     shelfPanel.querySelector('.sd-back').addEventListener('click', shelfShowList);
 2988 |     shelfList.addEventListener('click', ev => {
 2989 |         const card = ev.target.closest('.shelf-card');
 2990 |         if (card) shelfShowDetail(+card.dataset.i);
 2991 |     });
 2992 |     shelfDetail.querySelector('.sd-edit').addEventListener('click', () => {
 2993 |         if (!shelfCur) return;
 2994 |         editingDiaryId = shelfCur.id;
 2995 |         titleInput.value = shelfCur.title || '';
 2996 |         contentInput.value = shelfCur.content || '';
```

---

## 4. 正常用途排除清单（不是占位符）

| 文件 | 行号 | 原文 | 排除理由 |
|---|---|---|---|
| `blog-api/src/main/java/com/mszlu/blog/dao/pojo/DiaryChatLog.java` | L12 | * Madeline 日记多轮反应 · 全链路日志（每轮必写，不可省略） | Javadoc 中的设计约束「每轮必写，不可省略」，不是省略代码的占位符。 |
| `blog-api/src/main/java/com/mszlu/blog/handler/LoginIntercepter.java` | L37 | // 2. 原有的 Token 校验逻辑（保持不变） | 步骤注释里的「保持不变」指保留原有 Token 校验路径，不是 diff 占位。 |
| `blog-api/src/main/java/com/mszlu/blog/impl/DiaryServiceImpl.java` | L787 | // —— v0 原有逻辑：人设 + 情绪画像 —— | v0 分区 banner 的版本说明，不是占位符。 |
| `blog-api/src/main/java/com/mszlu/blog/service/ai/AiClient.java` | L44 | * 向后兼容：所有现有 chat() / streamChat() / embed() 签名保持不变， | Javadoc 的 API 兼容契约：方法签名保持不变。 |
| `blog-api/src/main/java/com/mszlu/blog/service/ai/PromptBuilder.java` | L822 | // 无情绪时整块省略，不留空壳 | 行为说明：无情绪时不拼这一段，主动省略空壳。 |
| `blog-api/src/main/java/com/mszlu/blog/service/diarychat/DiaryChatLogService.java` | L12 | * Madeline 日记多轮反应 · 全链路日志写入（每轮必写，不可省略） | Javadoc 中的设计约束「每轮必写，不可省略」。 |
| `blog-ui/js/badeline-crawlout.js` | L20 | *   - 只用 atlases 现有素材，缺帧由位移补间补齐，不省略效果 | 行为约束：缺帧由补间补齐，不省略效果。 |
| `blog-ui/js/celeste-dust-bunny.js` | L143 | // 用 canvas 'multiply' 复刻同样的乘算（黑保持不变、白变红）。 | 渲染乘算说明：黑色保持不变、白色变红。 |
| `blog-ui/js/diary-2.js` | L1 | // 羽毛随笔弹框：开合/字数/保存状态交 Vue；FeatherGame 全局流程保持不变 | 模块契约：FeatherGame 全局流程保持不变。 |
| `blog-ui/js/diary.js` | L546 | // 凑够 45 字且落在句末标点（含省略号/换行）→ 收尾本段；新气泡推迟到下一位字符到来再建 | 标点集合说明：句末标点包含省略号。 |
| `blog-ui/js/internet_cafe-1.js` | L1047 | // angle 省略 = 向上全向爆散；传入弧度 = 沿该方向的锥形（原作 Dust.Burst(pos, angle, n)） | 参数语义：angle 省略=全向爆散，并标注原作 API。 |
| `blog-ui/js/roundtable-portraits.js` | L20 | freeze(emotion)    停止循环并定格 00 帧（emotion 省略则保持当前情绪） | API 文档：emotion 省略时保持当前情绪。 |
| `blog-ui/js/shelf.js` | L154 | if (!fin.fits) {                          // 框底截断：末尾补 "…"（行宽放不下就省略） | UI 截断行为：行宽放不下时末尾补省略号。 |
| `blog-ui/js/shop.js` | L28 | // ===== 开场备忘录：由右侧省略号按钮触发 ===== | UI 名称/兜底策略/移植说明中的正常用词，不是省略代码。 |
| `blog-ui/js/shop.js` | L1492 | // 素材兜底：Overworld 缺失 → Gameplay → 程序化软光斑（可替换钩子，不静默省略） | UI 名称/兜底策略/移植说明中的正常用词，不是省略代码。 |
| `blog-ui/js/shop.js` | L1972 | // ===== AbsorbOrb（IL 三阶段移植；原作的"目标死亡飞散"分支本项目不可达，省略） ===== | UI 名称/兜底策略/移植说明中的正常用词，不是省略代码。 |
| `blog-ui/js/sing-studio.js` | L14 | * 其中 char 的 MultibandEq(22000) 与 gameplay_sfx 的 Lowpass(22000) 都是旁通值 → 省略； | 音频总线说明：旁通值 22000 → 省略该级。 |

HTML（只统计，不列删改）：`blog-ui/shop.html:57` 的 `<!-- 白色省略号互动按钮：中 = 前台服务铃（召唤 Oshiro），右 = 留言簿（备忘录） -->`，其中「省略号」是 UI 名称，不是省略代码。

---

## 5. 执行提示与风险

1. **只删第 2 节 6 行**：`diary.js` 中 6 处缩进正常的 `// ... existing code ...`。其余 9 处虽然也像占位符，但已列入可疑，先不要动。
2. **不要连带删除相邻的 `Deleted:` 旧代码注释、`// =====` 分区 banner**：它们不属于本次“占位式假注释”口径。
3. **HTML 不动**：`shop.html:57` 只是正常 UI 注释，且 HTML 模板注释整体不在本次范围。
4. **Java 文本块 / 字符串 / 正则不动**：扫描器已排除；人工删除时不要用全局正则替换 `existing` / `省略`。
5. **第三方与生成物未扫描**：`node_modules`、minified、`Atlases` 生成 JSON、第三方 JS 均不在结果内。
6. **纯占位 0 处的独立省略号**：全项目没有单独成行的 `// ...`、`/* ... */`、`// ***`、`// TODO: 保留`。
