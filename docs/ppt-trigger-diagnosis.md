# BerryPPT 自动触发诊断报告

- 诊断对象：`blog-ui/js/detect.js`（判定 + 抽词）、`blog-ui/js/pptgen.js`（生成）、保存链路 `blog-ui/js/diary.js`、`berryos.html` 自动入口
- 诊断日期：2026-11-07
- 边界声明：**诊断轮未修改任何产品代码、未改提示词**。2026-11-07 后续单独授权修复保存链路快照，改动与验证见第 10 节；判定阈值、三指标、抽词、提示词仍未改动。数据库只做了 `SELECT`。诊断与验证脚本都在临时目录，用完即弃，未新建测试账号、未启动常驻服务。
- 判定口径：按「**要具体的事，不是情绪；情绪只是引子**」重标。三条占两条：A 明确对象、B 明确阻碍、C「做了但没成」的痕迹。

---

## 0. 结论（先看这里）

1. **漏判有两层，层一比层二更致命。**
   - 路径层（**已修复，见第 10 节**）：`diary.js` 在保存成功后先用 4 秒延时挂起检测，随后**立即清空 `jbook-*` 草稿**（[diary.js#L2277-L2287](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2277-L2287)、[diary.js#L2299-L2302](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2299-L2302)）。保存当下已改为先拍正文快照，检测读快照——实测文本长度从 0 变为 196。**但日记页还有第二道闸门**：`triggerAndOpen()` 要求 `window.BerryPPT`（[pptgen.js#L495](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L495)），而 `diary.html` 不加载播放器，所以定时器拿到快照后仍在检测前返回 false。详见 10.4。
   - 判定层：就算文本还在，三个指标也测不出「有没有一件能拆的事」。真实语料 6 个应触发样本**全部漏判（6/6）**，同时误触发 2 条。
2. **阈值调不出可接受结果。** 把阈值放到最松（0.20/0.005/0.02），合计 recall 0.76 但 precision 只有 0.52；真实集 TP=4 / FP=10——宁可漏不可错的场景也不成立。原因不是阈值位置，而是**指标轴错了**。
3. **三个指标本身不适合这个任务。**
   - `concentration` 是「top10 n-gram 频次占全部 ≥2 次 n-gram 频次的比例」，随文本长度和重复度剧烈漂移：短文无重复=0，短文中出现一个重复词=1，全文只讲一件事的长文只有 0.097，极端纯重复也只有 0.422。
   - `density` 的阈值 0.01 约等于「300 字里出现 3 次」，几乎无筛选作用；且在标注集上**负例均值（0.040）高于正例均值（0.016）**，方向是反的。
   - `negRatio` 不是「负面内容占比」，而是「24 个负面词里命中了几个」，满值需要 24 个词全部出现。它测的是**情绪词汇覆盖率**，与「具体的事」不是一条轴。17 个正例里有 9 个**只**因它而漏判。
4. **抽词失败是同一个根因的延伸。** 「一件」能当主题，是因为 `STOP_WORDS` 定义了却**从未被调用**（死代码），且 n-gram 合并只做单向覆盖，高频短碎片 `一件`(5 次) 压过更正确的 `一件一件`(3 次)。现有 `topKeyword` 在 17 个正例上只命中 5 个；**抽原句**（原文里那半句）能命中 13 个。
5. **建议：判定换成模型判断，本地规则只做兜底。** 理由不是成本（调用免费），而是准确率：新口径的本地关键词近似 recall 0.94 但 precision 0.67（真实集只有 0.38），无法区分「提到项目」和「卡在项目」。抽词改为**双字段**：`topic_quote`（原文半句）+ `topic_title`（短名词），因为现有 PPT 模板把 topic 当名词短语拼进标题（`{topic}与我`、`你在{topic}上卡壳了？`），长句会直接破坏语法。

---

## 1. 真实代码定位

### 1.1 调用链（三处入口）

| 入口 | 位置 | 行为 |
|---|---|---|
| 保存日记后自动触发 | [diary.js#L2275-L2284](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2275-L2284) | `setTimeout(..., 4000)` → `BerryPPTGen.triggerAndOpen()`；同一次会话只触发一次（`_pptTriggeredThisSession`） |
| 打开 berryos 页面自动触发 | [berryos.html#L1075-L1085](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1075-L1085) | 页面加载即 `BerryDetect.shouldTrigger()` → `generate(topic, rawText, evidence)` |
| 显式触发 | [pptgen.js#L494-L511](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L494-L511) | `triggerAndOpen()` 内部仍先调 `shouldTrigger()`；手工改主题只能绕过它（例如直接调 `generate('想做的事太多', ...)`） |

> 注：`triggerAndOpen()` 不接受 topic 参数（[pptgen.js#L494](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L494)），所以「人工改成显式触发、主题传『想做的事太多』」必然是绕过了 `shouldTrigger`，这也解释了为什么手工能跑通、自动跑不通。

### 1.2 判定函数与三指标算法

核心在 [detect.js#L86-L184](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L86-L184)。

| 指标 | 代码 | 实际公式 | 阈值 |
|---|---|---|---|
| `concentration` | [L116-L120](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L116-L120) | `sum(freq[top10 significant]) / sum(freq[all significant])`，`significant` = 出现 ≥2 次的 2/3/4-gram | `> 0.40`（[L161](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L161)） |
| `density` | [L123-L124](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L123-L124) | `freq[merged[0]] / text.length`（`text` 含标点、换行） | `> 0.01`（[L162](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L162)） |
| `negRatio` | [L127-L133](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L127-L133) | `NEG.filter(w => text.includes(w)).length / NEG.length`（24 个词） | `> 0.10`（[L163](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L163)） |
| 触发 | [L165-L168](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L165-L168) | 三个 `&&` | — |

### 1.3 抽词

- 分词：`tokenize()` 只切 2/3/4-gram 并保留纯中文串（[L60-L84](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L60-L84)），**没有词性、没有停用词、没有真正的分词**。
- 选词：`significant` 按「频次降序 → 长度降序」排序（[L102-L106](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L102-L106)），再做单向覆盖合并（[L109-L114](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L109-L114)），`merged[0]` 即 `topKeyword`（[L123](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L123)）。

### 1.4 已发现的确定性缺陷（与准确率无关，属实现 bug）

| # | 缺陷 | 证据 | 影响 |
|---|---|---|---|
| 1 | 保存后先清草稿、再延时检测 | [diary.js#L2279-L2302](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2279-L2302) | 自动触发在保存路径上恒为空文本 |
| 2 | `STOP_WORDS` 是死代码 | 定义在 [L46-L57](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L46-L57)，`tokenize()` 从未引用 | `时候`、`已经`、`自己`、`心里`、`没有`、`可以` 等成为主题；正例 #5 主题=「已经」、#11=「时候」、#20=「心里」 |
| 3 | 合并规则与注释意图不一致 | [L107-L114](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L107-L114)：注释要求「A 是 B 的子串且 freq 接近时去掉 A」，但代码只在新词被「已保留词」包含时丢弃新词；排序又是频次优先（L102-L105），高频短碎片先入队，长词后到无法替换它。另 [L122](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L122) 注释称「取合并后最长的那个」，实际取 `merged[0]` | 「一件」(5) 压过「一件一件」(3)，主题落在量词上 |
| 4 | 注释写 Top 3、代码用 Top 10，`topN` 变量算完没用 | [L116-L118](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L116-L118) | concentration 语义与文档不符 |
| 5 | 三处阈值不一致 | 文档注释 0.60（[L11](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L11)）、规则注释 0.45（[L158](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L158)）、实际 0.40（[L161](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L161)）、对外暴露 0.45（[L193](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L193)） | 任何读 `BerryDetect.thresholds` 的调参/展示都是错的 |
| 6 | 负面词表缺「卡/卡住/失败/拖延/逃避/没做成/没进展/白费/对不上/跑不出」 | [L127-L131](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L127-L131) | 最典型的困境表达反而不计分 |
| 7 | density 分母含标点与换行 | [L124](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L124) | 阈值随排版漂移 |
| 8 | 非中文文本被当成空文本 | `tokenize()` 只保留中文 n-gram（[L68](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L68)）；`analyze()` 在 tokens 为空时提前返回 `{reason:'empty'}`（[L89](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L89)） | 纯英文日记（语料 #44，3491 字）被判「日记内容为空」；`shouldTrigger` 的错误原因具有误导性 |

---

## 2. 复现那次漏判

### 2.1 用户观测 vs 阈值

| 指标 | 实测 | 阈值 | 是否通过 | 差距 |
|---|---|---|---|---|
| concentration | 0.31 | > 0.40 | 否 | **-0.09** |
| density | 0.033 | > 0.01 | 是 | +0.023 |
| negRatio | 0.21 | > 0.10 | 是 | +0.11 |

结论：**只差 concentration 一项**，而 concentration 恰恰是随长度/重复度漂移、最难稳定达标的那一项。

### 2.2 同量级文本复现（同一套 `analyze()`，Node 内跑）

| 样本 | 字数 | concentration | density | negRatio | 判定 | 差距 |
|---|---|---|---|---|---|---|
| 用户观测 | ? | 0.310 | 0.033 | 0.210 | false | conc -0.090 |
| 复现 M（全篇只讲「想做的事太多」） | 369 | **0.366** | 0.041 | 0.250 | false | conc **-0.034** |
| 复现 N（同上，叙事更细） | 359 | **0.240** | 0.028 | 0.208 | false | conc **-0.160** |
| 「想做的事太多」70 字短稿 | 70 | **0.000** | **0.000** | 0.080 | false | 三项全挂 |
| 保存后再读（清空草稿后） | — | — | — | — | false | `日记内容为空` |

要点：这三个样本的共同特征是「**全文 100% 围绕同一个具体困境**」。即便如此，concentration 仍然到不了 0.40。说明不是「这篇不够集中」，而是这个指标无法表达「集中」。

### 2.3 保存链路复现（决定性）

模拟 `diary.js` 的真实顺序：

```
写入 jbook 草稿 → shouldTrigger()  →  {triggered:false, conc:0, dens:0, neg:0.08, len:70}
4 秒后 jbook 已被清空 → shouldTrigger() →  {triggered:false, reason:'日记内容为空'}
```

即：**这篇日记在清空前就已经判 false；清空后连文本都没有。** 两层叠加，自动路径没有任何一次能命中。

---

## 3. 按新口径重做定量评估（报告核心）

### 3.1 标注口径

- **A 明确对象**：能填进「她在做/想做的 X」，且 X 是具体活动或事项（项目、代码、面试、算法题、论文、减肥、口语、副业、择校……），不是「生活/未来/自己/心情」。
- **B 明确阻碍**：能填进「卡在 Y」，Y 是具体步骤或动作（某个 bug、某道题、某一步流程、某个环节），不是「没动力/不自律/状态差」。
- **C 做了但没成**：有尝试动作 + 未达成或卡住的痕迹（投了没回音、练了没效果、重跑还是对不上、调了两小时才定位）。
- **命中**：A+B+C ≥ 2。纯情绪、无事可拆 → 不触发。
- 安全类（自伤/中考/家庭冲突等需要分流而非做 PPT 的）单独标记，**不计入** PPT 指标。

### 3.2 语料

- 真实：本地 MySQL `blog.ms_diary`，93 行、18,915 字；按全文去重后 **50 条**（含歌词、代码、测试文本、虚构小说、梦境等非日记噪声，原样保留）。
- 合成：自写 **20 条**，覆盖「具体卡点 / 纯情绪 / 成功日记 / 流水账 / 歌词 / 低集中度多主题 / 反刍」。
- 标注结果：真实 6 正 / 43 负 / 1 安全；合成 11 正 / 9 负；合计 17 正 / 52 负。
- ⚠️ 合成集是为了覆盖意图而写、且本地规则原型在它上面调过，**存在过拟合**；真实集才是主证据。

### 3.3 真实语料（49 条，阈值 0.40/0.01/0.10）

| | 预测触发 | 预测不触发 |
|---|---|---|
| **应触发（6）** | TP 0 | **FN 6** |
| **不应触发（43）** | **FP 2** | TN 41 |

- 漏判率 **6/6 = 100%**；误触发率 2/43 = **4.7%**；50 条去重文本里触发率 2/50 = 4%。
- 两个误触发：`#10 宿舍人际消耗`（主题=「自己」）、`#21 纯情绪紧绷`（主题=「自己」）。即使弹出来，PPT 也会以「自己与我」为题——主题和判定一起错。

**6 个正例的三指标明细**（全部 pred=0）：

| # | 字数 | conc | dens | neg | 现有 topKeyword | 该不该出 | 卡在哪 |
|---|---|---|---|---|---|---|---|
| #3 | 38 | 1.000 | 0.053 | 0.04 | 面试 | 该出 | 只败 negRatio |
| #5 | 205 | 1.000 | 0.020 | 0.00 | **已经** | 该出 | 只败 negRatio |
| #11 | 411 | 0.316 | 0.010 | 0.04 | **时候** | 该出 | 三项全败（density 原始值 0.00973，差 0.0003 压线） |
| #12 | 642 | 0.556 | 0.006 | 0.17 | 项目 | 该出 | 只败 density |
| #20 | 555 | 0.381 | 0.009 | 0.13 | **心里** | 该出 | conc+density |
| #34 | 55 | 0.000 | 0.000 | 0.00 | （空） | 该出 | 短文无重复 n-gram，三项全挂 |

> #34 是最典型的「短日记」：55 字、没有重复 n-gram → `significant` 为空 → concentration=0、density=0、全空主题。这类条目在真实语料里占多数（0–100 字共 29 条，49 条标注集内）。

### 3.4 合成集（20 条）

| | 预测触发 | 预测不触发 |
|---|---|---|
| **应触发（11）** | TP 4 | **FN 7** |
| **不应触发（9）** | **FP 2** | TN 7 |

漏判 7/11 = 63.6%，误触发 2/9 = 22.2%。误触发分别是 `S4 纯情绪无具体事`、`S9 对未来焦虑无对象`——两者都因为负面词命中足够多而被判「有困扰」。

### 3.5 漏判归因（合计 17 个正例，13 个漏判）

| 只败在哪 | 条数 | 样本 |
|---|---|---|
| **只败 negRatio** | **9** | #3 #5 S2 S7 S8 S14 S16 S18 S20 |
| conc + density + neg 全败 | 2 | #11 #34 |
| 只败 density | 1 | #12 |
| conc + density | 1 | #20 |

**negRatio 是最大的漏判来源**：这 9 篇都在讲具体、明确的卡点（面试没邀请、减肥卡在晚上、连读听不出、整数拆分卡三天、副业选品没水花、UI 像素对不齐、择校信息不全），但因为正文里没有出现词表里的「频繁负面词」，被判为「不困扰」。

### 3.6 误判例子（情绪 → 被当成困扰）

| # | 真实内容 | 现有判定 | 为什么误判 |
|---|---|---|---|
| #10 | 宿舍相处消耗、想做自己的事 | 触发（conc 0.432 / dens 0.014 / neg 0.21） | `#10` 含「难/烦/累/总是」等词，主题=「自己」；A=1、B=0、C=0，按新口径不该出 |
| #21 | 纯情绪紧绷，没有具体事 | 触发（conc 1.0 / dens 0.012 / neg 0.17） | 负面词够多；A=B=C=0 |
| S4 | 纯情绪低落，「没有发生什么具体的事」 | 触发 | 同上 |
| S9 | 对未来焦虑，无具体对象 | 触发 | 同上 |

规律：**能把「情绪浓度」推过阈值的文本，恰好都是没有具体事的文本。** 这不是巧合，是三个指标的构造决定的。

---

## 4. 指标诊断：为什么调阈值也没用

### 4.1 单指标判别力（69 条，正=该出 PPT）

| 指标 | AUC | 正例均值 | 负例均值 | 正例范围 | 负例范围 |
|---|---|---|---|---|---|
| concentration | 0.693 | 0.829 | 0.482 | [0, 1] | [0, 1] |
| density | **0.564** | 0.016 | **0.040** | [0, 0.053] | [0, 0.5] |
| negRatio | 0.714 | 0.076 | 0.036 | [0, 0.21] | [0, 0.33] |

- `density` 的负例均值**高于**正例均值，AUC 接近 0.5——方向反了，因为歌词、虚构文本、重复废话最容易出高 density（#16 0.017、#48 0.5、S13 0.098）。
- 三个指标都做不到 0.75 以上；而这条任务需要的是「有没有一件具体的事」，三者都不测这个。

### 4.2 单闸门通过率（真实 49 条）

| 闸门 | 整库通过 | 6 个正例中通过 | 43 个负例中通过 |
|---|---|---|---|
| concentration > 0.40 | 21/49 (43%) | 3/6 | **18/43** |
| density > 0.01 | 22/49 (45%) | 2/6 | **20/43** |
| negRatio > 0.10 | 6/49 (12%) | 2/6 | 4/43 |

前两个闸门几乎一半条目都过、且负例过得多；第三个闸门掐掉了 2/3 的正例。**三个闸门同时通过 = 2 条，全是误报。**

### 4.3 concentration 的数学性质（关键）

它不是「主题占比」，而是「top10 n-gram 频次 / 所有 ≥2 次 n-gram 频次」。同一句话会同时贡献 2-gram、3-gram、4-gram，分母被重叠片段放大，所以：

| 实验 | 字数 | concentration | 说明 |
|---|---|---|---|
| 同一主题，原文（无重复词） | 76 | **0.000** | `significant` 为空 |
| 同一主题 + 1 段无关流水账（出现第二个「中午」） | 162 | **1.000** | top10 覆盖了全部 significant，比值恒为 1 |
| 同一主题 + 2 段无关流水账 | 248 | **0.046** | significant 从 1 涨到 76，分母爆炸 |
| 同一主题 + 3 段无关流水账 | 334 | **0.044** | 同上 |

> 注意第 2 行：**主题没有任何变化，只因为多出现一个「中午」，concentration 从 0 变成 1。** 主题是「中午」。

真实语料按长度分桶：

| 长度 | n | concentration 中位数 |
|---|---|---|
| 0–100 字 | 29 | **0.000** |
| 100–300 字 | 7 | **1.000** |
| 300–600 字 | 6 | 0.381 |
| 600+ 字 | 7 | 0.306 |

`concentration=1` 的条目共 34/69（真实 17/49）。只要 `significant` ≤ 10 项，比值必然为 1——这不是「很集中」，是「样本太小」。

**极限集中度实验**：

| 文本 | concentration |
|---|---|
| 「凌波微步真的好难。」×20（纯重复） | **0.422** |
| 一整段只讲凌波微步的 225 字日记（成段重复） | **0.097** |

即：**最理想情况下这个指标也只到 0.422，而普通长文只有 0.097。** 阈值 0.40 要么靠「文本太短」蒙混过关，要么根本到不了。

### 4.4 阈值敏感性（合计 69 条；真实集另列）

| conc | dens | neg | TP | FP | FN | TN | Recall | Precision | 真实 TP/FP/FN |
|---|---|---|---|---|---|---|---|---|---|
| 0.20 | 0.005 | 0.02 | 13 | 12 | 4 | 40 | **0.76** | **0.52** | 4/10/2 |
| 0.25 | 0.005 | 0.05 | 8 | 9 | 9 | 43 | 0.47 | 0.47 | 2/7/4 |
| 0.30 | 0.005 | 0.05 | 8 | 9 | 9 | 43 | 0.47 | 0.47 | 2/7/4 |
| 0.35 | 0.01 | 0.10 | 4 | 4 | 13 | 48 | 0.24 | 0.50 | 0/2/6 |
| **0.40** | **0.01** | **0.10** | **4** | **4** | **13** | **48** | **0.24** | **0.50** | **0/2/6** |
| 0.40 | 0.005 | 0.02 | 11 | 10 | 6 | 42 | 0.65 | 0.52 | 2/8/4 |
| 0.45 | 0.01 | 0.10 | 4 | 3 | 13 | 49 | 0.24 | 0.57 | 0/1/6 |
| 0.50 | 0.01 | 0.10 | 4 | 3 | 13 | 49 | 0.24 | 0.57 | 0/1/6 |

- 放宽到最松：recall 0.76，但**每两个触发里就有一个是错的**（precision 0.52）；真实集弹出 14 次，其中 10 次是错的。
- 收紧：recall 掉到 0.24，真实集 recall = 0。
- 中间没有平台区。因为 TP 和 FP 由同一批信号（负面词、重复度）驱动，**无法通过调阈值把它们分开**。

单/双指标组合也印证这一点（合计）：

| 规则 | R | P |
|---|---|---|
| 仅 concentration>0.40 | 0.82 | 0.36 |
| 仅 density>0.01 | 0.76 | 0.33 |
| 仅 negRatio>0.10 | 0.35 | 0.50 |
| conc + density | 0.76 | 0.35 |
| conc + neg | 0.29 | 0.56 |

**结论：这套指标本身不适合「有没有一件具体的事」这个判断。** 不是阈值没调好。

---

## 5. 对照实验：新口径的本地近似能做到多少

用 A/B/C 三标记的朴素关键词版（对象词 / 阻碍标记 / 失败痕迹，三条占两条）在 69 条上跑：

| | 预测触发 | 预测不触发 |
|---|---|---|
| **应触发（17）** | TP 16 | FN 1 |
| **不应触发（52）** | **FP 8** | TN 44 |

- 合计 R 0.94 / P 0.67 / A 0.87；**真实集 R 0.83 / P 0.38**（TP 5、FP 8、FN 1）。
- 误报是「**提到了对象**」但并没有「卡在对象」：`#18`（明确写「没有发生任何大事」，但提了刷题/卡壳）、`#19`（刷题且最终都懂了）、`#27`（调试代码但报错不具体）、`#1`、`#42`、`#49`、`#50`。
- 漏报 `#34`（组员的锅），因「甩锅/熬夜交付」不在词表里。

这说明两件事：
1. 换轴（情绪 → 具体的事）能显著救回 recall；
2. **关键词规则的天花板在 precision**：它读不出「提到项目」和「卡在项目」的差别，也读不出「没有发生任何大事」这种否定。再补词表只能缓一口气，不能到可上线水平。

---

## 6. 抽词失败：为什么是「一件」

### 6.1 生成路径

以「想做的事太多，清单列了一堆，真做没几个……」这类文本为例，`analyze()` 的输出：

```
topKeywords = [一件(5), 一件一件(3), 清单(2), 列了(2), 了一(2)]
topKeyword  = 一件
```

「一件」系 n-gram 全量频次：

```
一件:5, 一件一:3, 件一件:3, 一件一件:3, 了一件:1, 一件排:1, ...
```

成因有三层：

1. **没有停用词过滤**：`STOP_WORDS` 定义在 [L46-L57](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L46-L57)，但 `tokenize()` 从未引用。`一件` 不在表里，即使过滤也拦不住；但 `时候/已经/自己/心里` 本应被拦。
2. **n-gram 与真词同权**：2-gram 碎片 `一件` 可以和 4-gram `一件一件`、真短语 `想做的事太多` 一起按频次排序。量词碎片天然高频。
3. **合并规则单向**：[L110-L114](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L110-L114) 只判断「新词是否被已保留词包含」。`一件`(freq 5, len 2) 先入队；后到的 `一件一件`(freq 3, len 4) 不属于被覆盖情形（`一件`.indexOf(`一件一件`) = -1），于是被追加，**但 `merged[0]` 仍是 `一件`**。排序是「频次优先」，长词在频次相同时才占优——而这里频次不同。

所以「一件」不是唯一候选，而是**排序第一的高频碎片**。即使修好合并规则，也只是把「一件一件」提上来，仍然是碎片，不是她卡住的那件事。

### 6.2 现有抽词 vs 抽原句

对 17 个正例（6 真实 + 11 合成）逐个对比：

| 方案 | 命中（主题包含期望语义） | 真实 6 条 |
|---|---|---|
| 现有 `topKeyword` | **5/17** | **1/6**（只有 #3「面试」勉强可用） |
| 抽原句（评分选句） | **13/17** | 4/6 |
| 抽原句（首个「对象+阻碍」半句） | **13/17** | **5/6**（只漏 #34） |

典型对比：

| # | 现有 | 原句 |
|---|---|---|
| #5 | 已经 | 可之后却迟迟开启不了算法的训练 |
| #11 | 时候 | 但像素块的位置就是差那么几像素 |
| #12 | 项目 | 唯独整数拆分那道记忆化DFS把我卡住很久 |
| #20 | 心里 | 平衡数因为 == 写成 = 低级bug卡很久 |
| #34 | （空） | 组员把烂摊子全甩给我 |
| S3 | 列了 | 想做的事太多，清单列了一堆，真做没几个 |

失败样本（评分选句 4 条）：

- `#12`：评分版选中「今天白天大部分时间都在啃算法」，没有落到「整数拆分那道记忆化DFS把我卡住很久」——长句应优先按「对象+阻碍共现」而不是长度打分。
- `#20`：同理，落到「明明还在打基础」而不是「平衡数……低级bug卡很久」。
- `S10`：落到「我把实验重跑了三次，每次跑完指标都对不上」，语义上仍成立，只是没命中期望键——说明「关键词命中」这个判据本身偏严。
- `S14`：落到「明明别的 DP 题我都能做出来」而不是「整数拆分这道题卡了三天」。

首个命名句版的 4 条失败：`#34`（阻碍词表缺「甩锅/熬夜/说改就改」）、`S2`（过早命中「其中一家笔试也挂了」）、`S8`（首句「练了快两周英语口语」不含阻碍标记）、`S12`（首句「最近同时推两件事，都有点卡」没有具体对象）。

→ 抽原句是可行方向，但**定位规则要按「对象+阻碍共现」+ 信息量最大**，而不是「第一个出现的句子」或「最长句」。4 条失败里 3 条是词表/规则覆盖问题，不是方法本身不可行。

### 6.3 抽原句的代价（必须先说清楚）

**比抽词好在哪**：不丢语境、不需要维护词表、能保住她自己对困境的命名（13/17 vs 5/17），也更贴合「她那半句就是命名」的产品意图。

**比抽词差在哪**：

1. 原句经常超过模板字数上限（`p1_title` 6–9 字、`p2_head` ≤12 字），不能直接替换 topic；
2. 定位规则可能抽到一整句没有阻碍的叙述（如「今天白天大部分时间都在啃算法」），反而丢掉真正的卡点；
3. 原句可能包含姓名、单位、隐私细节，会直接出现在封面；
4. `readCache(topic)` 与 `toSlug(topic)` 都由 topic 派生，长句会让缓存 key 和资源名失控；
5. 若交给模型返回原句，必须做 `text.includes(quote)` 逐字校验，否则模型会「顺手改写」，原句就不再是她的原话。

现有生成链把 topic 当**名词短语**用：

- `p1_title = "{topic}与我"`（≤6-9 字）
- `p2_head = "你在{topic}上卡壳了？"`（≤12 字）
- `p2_fact = "事实：{topic}真的好难！"`
- `p2_impossible = "不可能{XX}的{XX}？"`，公式里明确要求 topic 名词
- 全部 fallback 文案也是字符串拼接：`topic + '与我'`、`'先把' + topic + '拆成小动作'`（[pptgen.js#L412](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L412) 附近）
- `toSlug(topic)` 取前 6 字符做缓存/资源名（[pptgen.js#L31-L40](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L31-L40)）

把「想做的事太多，清单列了一堆，真做没几个」直接塞进 `{topic}与我`，会得到语法崩坏且超字数的标题；fallback 路径更会直接拼出病句。**因此抽原句不能简单地替换 topic，必须拆成两个字段。**

---

## 7. 建议与代价（本轮不动手）

### 7.1 判定：该「换」，并交给模型；本地只做兜底

| 方案 | 做法 | 准确率（本报告可给出的） | 延迟 | 代价/风险 |
|---|---|---|---|---|
| **A. 交给模型（推荐）** | 保存日记时，与 `/diary/summary` **并行**或复用同一次调用，返回 `{should_ppt, quote, reason}`；4 秒后的自动触发只读结果 | 理论上限 = 人工标注；本地无法实测（dev 配置的 `ai.api-key` 是占位符）。需用 20–50 条回归集实测 | 并行时用户感知**新增延迟≈0**（与 summary 同时返回）；独立接口则 +1 RTT（需测 p50/p95） | ①`/diary/summary` 只喂前 600 字（[DiaryServiceImpl.java#L1191](file:///C:/Users/28464/IdeaProjects/blog/blog-api/src/main/java/com/mszlu/blog/impl/DiaryServiceImpl.java#L1191)），长日记后段的「那半句」会丢；②模型可能返回非 JSON；③日记全文出网，需确认隐私口径；④需要改提示词/新增接口（下一轮） |
| B. 只修现有判定 | 修 8 个实现 bug + 重定义 density/negRatio | 最多接近 5 节的原型：R 0.94 / P 0.67（真实 P 0.38） | 0 新增延迟 | 改动小（1 个文件），但**轴没变**，precision 上不去；属于「修了也不够」 |
| C. 换成本地规则 | A/B/C 三标记，2/3 命中 | 同上（R 0.94 / P 0.67） | 0 新增延迟（约 0.1 ms/次） | 词表要按人群/写法持续维护；否定句、反讽、隐喻读不懂；**直接弹 PPT 的误报率不可接受** |

**更稳的接入点是「并行的独立判定调用」**（喂日记全文），而不是改 `/diary/summary` 的提示词——后者是按「直接输出文字，不要 JSON，不要引号」调好的温柔总结（[DiaryServiceImpl.java#L1191-L1196](file:///C:/Users/28464/IdeaProjects/blog/blog-api/src/main/java/com/mszlu/blog/impl/DiaryServiceImpl.java#L1191-L1196)），强行改成结构化输出会改变它的表现，且仍只喂 600 字。独立调用在保存时与 summary 并行发出，用户感知延迟≈0，代价是后端多一个接口与一次调用。

**推荐组合**：A 负责判定，C 只做「模型超时/失败时的保守兜底」（例如只在明显 A+B+C 共现时才出，其余静默）。这样既不依赖本地判断的准确率，也不会因为模型故障而漏掉明显案例。

补充：**延迟可以做到用户无感**——判定在保存时算好、写入会话状态，4 秒后只读标志位。生成 PPT 本身还有一次 LLM + 4 张图，判定不是瓶颈。

模型方案的实测方案（本轮未做，缺可用 Key）：

1. 用附录 A 的 50 条 + 附录 D 的 20 条作为回归集，标签即 A/B/C 结果；
2. 每条调用 3 次，记录端到端耗时，取 p50 / p95；
3. 用同一批算 precision / recall / 误触发率，与 5 节的本地近似对照；
4. 额外构造 10 条「纯情绪」「歌词」「成功日记」做负例压力测试，专门看误报。

样本量 70 条足够判断方向，不需要全量跑。

### 7.2 抽词：抽原句 + 双字段

推荐输出两个字段，而不是一个 topic：

- `topic_quote`：原文里那半句，**逐字**用于 `p2_hard1/p2_worst/p3_desc` 的素材锚定，并展示给用户确认；
- `topic_title`：从原句压出 2–6 字名词短语，仅供 `{topic}与我` 这类模板拼装。

落地方式（按可靠性排序）：

1. **模型返回原句**：在判定调用里顺带返回 `quote`（要求逐字、≤40 字），前端用 `text.includes(quote)` 校验，失败则回退到规则定位。最稳，且天然带语义。
2. **规则定位**：按 `。！？；，` 切半句，取**同时包含对象词与阻碍标记**、且信息量最高的那一句。本报告试了两种变体：首个命名句 13/17（真实 5/6）、评分选句 13/17（真实 4/6）。
3. **纯关键词**（现状）：5/17，不建议继续投入。

代价：
- 生成器与提示词要区分 `quote` / `title`（本轮不动，需下一轮改）；
- fallback 文案要重写，否则会拼病句；
- `readCache(topic)` 的 key 会变长（[pptgen.js#L413](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L413)、[L515](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L515)），建议 key 用归一化后的 title + hash；
- 原句可能含敏感内容并直接出现在封面上，需要用户确认或脱敏。

### 7.3 必须一起修的非算法问题

1. **保存链路**：把刚保存的 `content` 直接传给触发逻辑（`triggerAndOpen(content)` 或 `shouldTrigger(content)`），不要依赖 4 秒后仍存在的 localStorage 草稿；`jbook-*` 的清空可以保留。
2. **阈值暴露值**：`BerryDetect.thresholds` 必须与实际阈值同源，否则后续调参/灰度都会被误导。
3. **短文兜底**：0–100 字的条目占真实语料 29/49 ≈ 59%，而现有算法在短文上必然 `conc=0`。要么模型判断，要么至少用「句级对象+阻碍」而不是 n-gram 频次。

---

## 8. 复现方法

### 8.1 语料导出（只读）

```sql
SELECT JSON_OBJECT('id',id,'title',title,'content',content,'emotion',emotion,'date',create_date)
FROM ms_diary ORDER BY create_date;
```

```powershell
& 'D:\mysql-5.7.24-winx64\mysql-5.7.24-winx64\bin\mysql.exe' -uroot -p1234 `
  --default-character-set=utf8mb4 -N -B --raw blog -e "<上面的 SQL>" |
  Set-Content -Encoding utf8 diary.jsonl
```

### 8.2 判定复现（Node 内加载真实 `detect.js`，不改代码）

```js
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('blog-ui/js/detect.js', 'utf8');

// detect.js:28 用 Object.keys(localStorage)，所以要能被枚举
function makeLS(init = {}) {
  const data = Object.assign({}, init);
  const base = {
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i],
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
  return new Proxy(base, {
    ownKeys: () => Reflect.ownKeys(data),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (t, p) => (p in t ? t[p] : data[p]),
    set: (t, p, v) => { data[p] = String(v); return true; },
    deleteProperty: (t, p) => { delete data[p]; return true; },
  });
}

const window = {};
const sandbox = { window, localStorage: makeLS(), console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'detect.js' });
window.BerryDetect.analyze('想做的事太多，清单列了一堆，真做没几个。');
```

### 8.3 统计口径

- 真实集：按 `content.trim()` 全文去重 → 50 条；安全类 1 条不计入 → 49 条。
- 合成集：20 条（全文见附录 D）。
- 漏判率 = FN / 正例数；误触发率 = FP / 负例数。
- 阈值扫描：对同一批 69 条的 `conc/dens/neg` 逐组合重算，不重新跑分词。

### 8.4 运行环境

- Node（`node -v` 可用）、Python 3（仅用于编码检查）、本地 MySQL 5.7（`127.0.0.1:3306`，库 `blog`）。
- 未启动 Spring Boot 服务，未产生任何写操作，未留测试账号。

---

## 9. 局限

1. 真实语料只有 3 位作者、93 行、50 条去重文本，且以情绪散文为主；「6/6 漏判」是这个语料的结论，不是全人群结论。但它同时说明：**按现状，这个功能在真实使用中几乎不会触发（2/50）**。
2. 合成集是自写的、且本地规则原型在上面调过，存在过拟合；真实集是主证据，合成集只用于覆盖意图、暴露边界。
3. 人工标注是单人标注，没有第二人复核；标注规则已写在 3.1，逐条结果见附录 A，可重新标注后复算。
4. 模型方案的准确率与延迟**未实测**：本地 dev 的 AI key 是占位符。本报告只能给出「理论上限 = 人工标注」和测量方案，不能给具体数字。
5. 未在浏览器里跑完整 UI 流程（本报告直接对数据库文本调用真实 `detect.js` 函数），因此「4 秒后文本被清空」是代码路径推断 + 等价模拟，未做真实点击复现。**该缺口已在第 10 节补做（2026-11-07，浏览器真实保存路径）。**

---

## 10. 修复记录：保存链路「正文快照」（2026-11-07 追加，已授权）

> 本轮只修路径 bug。判定阈值、三指标、抽词、`shouldTrigger()` 判据、`pptgen.js`、提示词**均未改动**。

### 10.1 改了什么

| 文件 | 位置 | 改动 |
|---|---|---|
| [diary.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2277-L2287) | L2277-L2287 | 保存成功块内，清草稿之前新增 `window._pptDiarySnapshot = payload.content;`；4 秒定时器的 `finally` 里置回 `null` |
| [detect.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L27-L31) | L27-L31 | `extractDiaryText()` 开头优先返回快照；快照为空/非字符串时走原来的 `jbook-*` 分支 |
| [diary.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/diary.html#L120-L121) | L120-L121 | `diary.js?v=20261102a → v=20261107b`；`detect.js` 补版本 `v=20261107a` |
| [berryos.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1072) | L1072 | `detect.js` 补版本 `v=20261107a` |

`shouldTrigger()` 的判据（[detect.js#L149-L184](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/detect.js#L149-L184)）一行未动；`tokenize`、`significant`、单向合并、`NEG`、`thresholds` 同样未动。

### 10.2 为什么只换文本来源不算改判定

`extractDiaryText()` 只决定「拿哪段文本」，不参与打分。三个公式与三个阈值原样，快照为空时完全退回旧逻辑（包括 berryos 页面加载时的自动入口）。风险面仅限「检测现在读到的是保存的正文，而不是草稿」——这正是本次目的。

### 10.3 真实保存路径验证

- 环境：headless Chromium（Playwright 自带 chromium-1248），真实 `diary.html` + 真实 `diary.js` / `detect.js` / `pptgen.js`，真实 `localStorage`，真实 Ctrl+S 保存路径。
- 只把后端接口打桩（`/diary`、`/diary/summary` 返回 success），并用一个假 token 绕过登录门；未连真实后端、未注册测试账号、未写数据库。被改的每一行都在真实页面里执行。
- 保存流程里有一段打字机动画（`await summarySpoken`），实测要 **1.2–3.0 秒**才走到快照行（L2281）；所以验证时等 `contentInput.value` 变空后再读数，而不是固定等 700 ms。
- 测试正文 196 字（「想做的事太多、清单列了十七件、真做的只有两件、卡在对不上/跑不出」）。
- 「修前」的复刻方式：在同一页面、同一文本下把 `window._pptDiarySnapshot` 置空——旧代码没有快照分支，此时 `extractDiaryText()` 必然落到已被清空的 `jbook-*` 分支，等价于修前读法。

| 场景 | 保存后正文框 | `jbook-*` 键 | 快照长度 | 检测读到的文本长度 | concentration | density | negRatio | `shouldTrigger()` |
|---|---|---|---|---|---|---|---|---|
| 修前（快照置空） | 0 | 0 | null | **0** | — | — | — | **false**，`reason='日记内容为空'` |
| 修后（有 `BerryPPT` 的等价环境） | 0 | 0 | 196 | **196** | 1.000000 | 0.010204 | 0.041667 | **false**，`score={1, 0.01, 0.04}` |
| 修后（日记页原样，无 `BerryPPT`） | 0 | 0 | 196 | 196（直接调用）/ 定时器未进入检测 | 1.000000 | 0.010204 | 0.041667 | **false**（被 [L495](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L495) 提前返回） |

`analyze(snapshot)` 的精确值：`concentration=1`、`density=0.01020408163265306`、`negRatio=0.041666666666666664`、`topKeyword='对不上'`、`significantCount=4`。

**结论原样照报**：`shouldTrigger()` 返回 false，没有为了让它是 true 去调阈值。逐项看：

- `density 0.010204 > 0.01` 通过（只高出 0.0002）；
- `concentration 1.0 > 0.40` 通过；
- `negRatio 0.041667 > 0.10` **不通过** → 总体 false。

这正是第 3.5 节归因里的「只败 negRatio」类型。196 字短文里 `significant` 只有 4 个 n-gram，所以 concentration 被抬到 1——也再次印证 4.3 节说的「该指标在短文本上会饱和」。

**附带发现**：保存前 `jbook-*` 键数就是 **0**，而正文有 196 字。原因在 [diary.js#L42-L45](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L42-L45)：只有**没有 `id` 的附加字段**才会写 `jbook-*`，`titleInput` / `contentInput` 带 `id`，从不进 localStorage。所以旧检测不仅被「清草稿」坑，它**本来就看不到正文**，只能看到心情格子之类的附加字段。快照修法不只是时序解耦，而是第一次让检测拿到正文。

### 10.4 第二道闸门：日记页没有 `BerryPPT`（本次未修）

[pptgen.js#L495](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L495) 第一行：

```js
if (!window.BerryDetect || !window.BerryPPT) return false;
```

`window.BerryPPT` 只在 `berryos.html` 里定义，`diary.html` 没有加载播放器（实测 `typeof window.BerryPPT === 'undefined'`）。浏览器验证里定时器确实调用了 `triggerAndOpen()`（1 次），但它直接 `return false`，`shouldTrigger()` **一次都没被调用**（检测日志里只有我们手动调的那 1 次）。

后果：即使快照让检测恢复、甚至判定为 true，日记页也没有播放器，PPT 无处展示。要让「写完日记 → 自动弹 PPT」真正成立，得先做产品决策（在日记页引入播放器 / 跳转 berryos / 只生成不展示），这不在本次授权范围。

所以准确的表述是：**快照修复让「检测这一层」恢复；自动触发整体仍未恢复，卡在第二个闸门 + 判定轴错。**

### 10.5 对既有行为的影响

| 场景 | 影响 |
|---|---|
| 空日记 | `saveDiary` 开头 `if (!content)` 直接 return，走不到快照代码；不设快照、不挂定时器。**不变** |
| 保存失败（`res.success=false`） | 快照赋值在 success 分支内，不执行。**不变** |
| 网络异常 | 走 `catch`，不设快照。**不变** |
| 未加载 `BerryDetect` / `BerryPPTGen` | 外层条件不成立。**不变** |
| 同一次会话第二次保存 | `_pptTriggeredThisSession` 已为 true，不重拍快照、不重挂定时器。**不变** |
| 附加字段 | 快照 = `payload.content`（正文 + 附加字段拼接）。旧检测只看附加字段；现在能读全正文。**有意的行为变化**，标题仍不参与 |

### 10.6 快照生命周期

- **写入**：保存成功、`_pptTriggeredThisSession` 置 true 之后、清 `jbook-*` 之前（L2281）。
- **存放**：仅 `window` 变量，不写 `localStorage` / `sessionStorage`；不跨标签页。
- **消费**：4 秒后 `triggerAndOpen()` → `shouldTrigger()` → `extractDiaryText()` 优先读它。
- **清除**：`finally` 中置 `null`（L2286），无论 `triggerAndOpen` 成功、返回 false 还是抛错。
- **刷新/关闭**：4 秒内刷新或关页，定时器随页面销毁，快照一起消失，不会残留；下次保存重新拍。
- **重复保存**：同一会话只在第一次保存时拍，后续不再拍，也不会覆盖旧快照。

### 10.7 本次结论

1. 路径 bug 已修：**修前检测读到 0 字（`日记内容为空`）→ 修后读到 196 字**。
2. 修后三指标真值 `1.0 / 0.010204 / 0.041667`，`shouldTrigger()` 仍返回 **false**（只败 `negRatio`），原样照报。
3. 自动触发**没有**因此整体恢复：日记页缺 `BerryPPT` 播放器，定时器在检测前就返回 false（10.4）。
4. 判定准确率不受影响，仍受第 3–5 节问题限制：真实语料 6/6 漏判、阈值扫描无折中区。
5. 版本号：`diary.js v20261107b`、`detect.js v20261107a`。

---

## 11. 生成物落 berryos 桌面格子（2026-11-07 追加，已授权）

> 本轮把「写完日记 → 自动生成」的落点改成 **berryos 桌面的 `icoPpt` 格子**：日记页不弹、不加载播放器，只把结果写进现有缓存；用户回桌面想看再点开。判定阈值、三指标、抽词、提示词、`shouldTrigger()` 判据**均未改动**。

### 11.1 桌面格子结构

| 格子 | 类型 | 数据来源 | 点开行为 | 能否放内容 |
|---|---|---|---|---|
| `icoMountain`「我的大山」 | Vue `deskicon` | `ICONS[0]` 写死（[L373](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L373)） | 第一次点击选中，第二次 `location.href='index.html'` | 否，页面入口 |
| `icoPpt`「凌波微步与我.ppt」 | Vue `deskicon` | `ICONS[1]` 写死（[L374](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L374)），`player:'monthly'` | 第二次点击 → `window.BerryPPT.open()`，播当前 `SLIDES` | **是**，唯一接播放器的格子 |
| `icoSing`「玛德琳唱歌」 | Vue `deskicon` | `ICONS[2]` 写死 | 第二次点击 → `sing-test.html` | 否 |
| `icoCassette`「cassette.exe」 | Vue `deskicon` | `ICONS[3]` 写死 | 第二次点击 → `cassette.html` | 否 |
| 回收站 | 静态 `<img>` + 静态文字 | DOM 写死 | 无交互 | 否 |

格子 DOM 由 `v-for="ic in icons"` 渲染；播放内容是可热替换的 `SLIDES` 数组（`setSlides()` 重建 DOM）；持久化只有 `berryos-ppt-cache-v5` 一个 key。

### 11.2 选 `icoPpt` 的理由与限制

- **唯一「点开 = 播内容」的格子**：其余三个都是固定 `href` 跳转，没有内容槽。
- **能放任意页**：`SLIDES` 本来就是数组，`setSlides()` 可在播放器关闭状态下预装，点开即播。
- **标签可跟随内容**：`ICONS[1].label` 是普通数据，改成 `${topic}与我.ppt` 后与「桌面上的一个 PPT 文件」语义一致，不新增格子类型。
- **刷新恢复走现有机制**：沿用 `berryos-ppt-cache-v5` 的 24h 单槽缓存，未新造存储。

**限制（先说清）**：这个格子只有一份。第二篇日记触发生成会覆盖第一份课件。但这与格子原语义一致（桌面上只有一个 `.ppt` 文件），且原缓存本来就是单槽；没有第二份并存的设计，因此不按「致命冲突」暂停，也未新增多份机制。

### 11.3 改了什么

| 文件 | 位置 | 改动 |
|---|---|---|
| [pptgen.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L402-L409) | L402-L409 | 新增 `readLatest()`：不要求 topic 匹配，只要 24h 内且有非空 `slides` 就返回缓存 |
| [pptgen.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L421-L426) | L421-L426 | `generate()` 在本地兜底生成后**立即** `writeCache`，不再等后台 AI 返回 |
| [pptgen.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L461-L470) | L461-L470 | `generateImages()` 不再因缺 `BerryPPT` 直接 return；有播放器才 `patchImage`，无播放器也把图片写进 slides/缓存 |
| [pptgen.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L505-L517) | L505-L517 | 新增 `triggerAndGenerate()`：只依赖 `BerryDetect`，检测命中 → `generate` → 写缓存，**不打开播放器**；`triggerAndOpen()` 原样保留 |
| [pptgen.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L541) | L541 | 导出 `triggerAndGenerate` / `readLatest` |
| [diary.js](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js#L2277-L2288) | L2277-L2288 | 4 秒定时器由 `triggerAndOpen()` 改为 `triggerAndGenerate()`；快照赋值/清理不变 |
| [berryos.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L426-L434) | L426-L434 | 新增 `window.setPptIconLabel(label)`：同步改 `ICONS[1].label` 与 `#icoPpt .di-label` |
| [berryos.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1083-L1103) | L1083-L1103 | 启动先 `readLatest()` 装回格子并改名，再跑检测补生成；空内容一律跳过 |
| [diary.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/diary.html#L120-L123) | L120-L123 | `diary.js?v=20261107c`、`pptgen.js?v=20261107e` |
| [berryos.html](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1083) | L1083 | `pptgen.js?v=20261107e` |

`detect.js` 本机未改（仍 `v=20261107a`）；`tokenize` / `significant` / `NEG` / `thresholds` / `shouldTrigger()` / `buildPrompt` 一行未动。

### 11.4 真机验收

环境：真实后端（`mvn -o -DskipTests package` 产物，Spring Boot 3.2.6，dev profile，连本地 MySQL + Redis）、真实 `diary.html` / `berryos.html` / 本地静态服务、headless Chromium（真实 `localStorage`、真实 Ctrl+S 保存路径）。测试账号为临时注册，验收后已删除（见 11.8）。

测试正文 119 字：

```
我又搞不定凌波微步了。凌波微步真的好难，我每次都失败。
凌波微步为什么这么难？我总是做不到。凌波微步太难了，我又失败。
凌波微步搞不定，凌波微步学不会，凌波微步真的好难。
凌波微步每次差最后一步，凌波微步一直过不去，凌波微步我真的做不到。
```

| 步骤 | 实际看到 |
|---|---|
| 1. 打开日记页，填写标题/正文 | `title=凌波微步`、`content=119`；`BerryDetect` / `BerryPPTGen` 存在，**`window.BerryPPT` 为 `undefined`**（日记页无播放器） |
| 2. Ctrl+S 保存 | 正文框变空（`contentInput.value.length=0`），保存成功后 `jbook-*` 被清；4 秒后缓存出现：`berryos-ppt-cache-v5` 有 `topic='凌波微步'`、`slides=6` |
| 3. 检测那次的三指标 | `concentration=0.5433070866141733`（>0.40）、`density=0.08403361344537816`（>0.01）、`negRatio=0.375`（>0.10）；`topKeyword='凌波微步'`、`topFreq=10`、命中 9 个负面词、`significantCount=15`；`shouldTrigger()` 返回 **true**，检测读到 `textLength=119` |
| 4. 回 berryos 桌面 | `#icoPpt` 标签变为「**凌波微步与我.ppt**」；缓存 `topic='凌波微步'`、`slides=6`；`window.BerryPPT` 存在 |
| 5. 双击 `icoPpt` | 播放器 `#pptPlayer` 打开；首屏文案为「凌波微步与我 / 学不会？来看看」 |
| 6. 刷新 berryos | 标签仍为「凌波微步与我.ppt」，缓存仍在（`readLatest()` 装回格子） |
| 7. 刷新后再双击 | 播放器仍能打开，首屏文案不变 |

这次检测**判定为 true**，不是 false；三指标与判定值均按实际记录，未改阈值。`window.BerryPPT` 在日记页始终不存在，但生成仍然发生并写入了缓存——这是 10.4 节那道假闸门已被移除的直接证据。

关于配图：`generateImages()` 现在不再要求播放器，日记页后台也能把图片 URL 写进 slides/缓存；但若保存后立刻离开日记页，后台请求会随页面销毁而中断，此时缓存里是文字页 + 配图占位。桌面打开仍可正常播放。

### 11.5 失败/空内容保护

- `generate()` 无论如何都会先返回本地兜底 `safe`（6 页），并在返回前写缓存；只有 `window.api` 缺失等极端情况下仍是这 6 页。
- `triggerAndGenerate()` 若 `slides` 为空数组则**不写缓存**，返回 `{triggered:true, slides:[]}`。
- `readLatest()` 校验 `Array.isArray(slides) && slides.length>0` 且 24h 内；损坏/过期缓存返回 `null`。
- berryos 的 `applyToDesk()` 对空结果直接 return，格子和标签保持默认「凌波微步与我.ppt」，不会变成空白/坏格子。

### 11.6 单槽限制

- 缓存仍是一个 key、一份数据；新课件覆盖旧课件。
- 24 小时后缓存失效，`readLatest()` 返回 null，格子回到写死的默认 6 页示例。
- 这是原有设计，不是本轮新增缺陷。

### 11.7 未动的部分

- 阈值 `0.40 / 0.01 / 0.10`、三指标公式、`tokenize`、`NEG`、`shouldTrigger()` 判据：未动。
- 抽词（`topKeyword`）与提示词 `buildPrompt`：未动。
- `triggerAndOpen()` 与 berryos 内播放器 `PPT`：未动（仅新增桌面标签同步函数）。

### 11.8 环境清理

- 临时测试账号（`pptveri`）及其 `ms_diary` / 关联表数据已从 MySQL 删除，复查剩余 0。
- Redis 中该 token 已删除。
- 后端 jar 进程、静态服务进程已停止（8888 / 8000 均不再监听）。
- 验证脚本、Chromium profile、截图等临时文件已从 `%TEMP%` 删除，未留在仓库。

---

## 12. 多份课件 + 回收站拖拽删除（2026-11-07 追加，已授权）

> 11 节的单槽方案被否：桌面要能同时放多份课件，每份各自一格、各自标题、点开播自己的内容；把格子拖到回收站即删除。**判定阈值、三指标、抽词、提示词、`shouldTrigger()` 判据、`detect.js` 均未改动**。`berryos.html` 只做增量修改，未整段重写。

### 12.1 桌面结构（改后）

| 格子 | 类型 | 说明 |
|---|---|---|
| `icoMountain` / `icoSing` / `icoCassette` | Vue `deskicon` | 原样不动 |
| `icoPpt`（默认格） | Vue `deskicon`，`player:'monthly'` | 仅在**没有任何课件**时显示（`v-show`），作为无缓存时的默认示例；有课件时隐藏 |
| 课件格 ×N | Vue `deskicon` + `data-ppt-id` | N ≤ 6，每份一格；标题取该份 `label`；第二次点击播该份自己的 `slides` |
| 回收站 | 原静态 `<img>` + 原静态文字 | **图标本体、外观、定位均未改**；只新增「作为拖放目标」的行为（拖入高亮、放下即删） |

课件格位置为右侧 3 列 × 2 行（`PPT_LAYOUT`，[berryos.html#L412-L415](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L412-L415)），按缓存顺序填充：先第一行、再第二行。

### 12.2 存储结构：单份 → v6 列表

`pptgen.js` 的缓存结构改为：

```json
{ "items": [ { "id": "ppt-…", "topic": "微积分", "label": "微积分与我.ppt", "slides": [ … ], "ts": 1794… } ] }
```

| 规则 | 实现 |
|---|---|
| 新 key | `berryos-ppt-cache-v6`（[pptgen.js#L9](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L9)） |
| 旧单份缓存 | `berryos-ppt-cache-v5`；v6 缺失或非法时读取，生成 `id` 后写成 v6，**v5 保留不删**（[pptgen.js#L402-L421](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L402-L421)） |
| 每份独立 id | `genId()` 生成；`generate(topic, raw, evidence, itemId)` 按 id 更新同一份，避免后台 AI 两次回填生成两份（[pptgen.js#L473-L488](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L473-L488)、[#L566-L580](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L566-L580)） |
| 上限 6 | `MAX_ITEMS = 6`；超出时 `shift()` 移除最早的一份并直接清（不进回收站），同时记入 `removedIds`（[pptgen.js#L394-L396](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L394-L396)、[#L444-L448](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L444-L448)） |
| 删除防复活 | `removeItem(id)` 记入 `removedIds`；后台迟到的 `saveItem(topic, slides, id)` 见到该 id 直接丢弃，不会把已删/被挤出的那份写回来（[pptgen.js#L428](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L428)、[#L451-L455](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L451-L455)） |
| 导出 | `readAll` / `removeItem` 替代 11 节的 `readLatest`（[pptgen.js#L602-L606](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/js/pptgen.js#L602-L606)） |

### 12.3 桌面格子与拖拽删除

- **渲染**：`pptCells`（`Vue.reactive`）由 `refreshPptCells()` 从 `readAll()` 重建，key 为 `pptcell-<itemId>`；模板 `v-for` 渲染 `data-ppt-id`（[berryos.html#L354-L369](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L354-L369)、[#L416-L430](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L416-L430)）。
- **打开自己那份**：第二次点击同格 → `openPptItem(itemId, icon)` → `BerryPPT.setSlides(该份 slides)` → `BerryPPT.open(icon)`（[berryos.html#L434-L441](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L434-L441)、[#L503-L504](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L503-L504)）。
- **splash 原点跟随格子**：新增 `lastOriginEl`；`open(originEl)` 记录传入的格子，`close()` 优先用它。顺带修掉一个既有问题：`setSlides()` 会把 `rendered` 提前置 true 但不挂 `#pptSplash`，导致从格子打开时没有启动遮罩；`open()` 现在补挂（[berryos.html#L693-L696](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L693-L696)、[#L989-L1005](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L989-L1005)）。
- **拖拽（pointer events，鼠标/触摸统一）**：`#stage` 上 `pointerdown` 委托 → `setPointerCapture` → `pointermove` 超过 **8px** 才进入拖动态 → 指针落在 `#icoRecycle` 矩形内时给回收站加 `.drop-hot`（只改 `filter`，不动图标外观/位置）→ `pointerup` 时若在回收站内：加 `.ppt-removing`（260ms 缩小淡出）→ `removeItem` + `refreshPptCells()`（其余格子按新顺序平滑重排）（[berryos.html#L443-L489](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L443-L489)）。
- **点/拖不混淆**：拖动结束后写 `window.__pptDragEndedAt`，`onStageClick` 在 350ms 内直接忽略这一次 click；没超过 8px 的按下仍按原规则「第一次选中、第二次打开」（[berryos.html#L497-L509](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L497-L509)）。
- **触摸**：课件格 `touch-action: none`，拖动全程走 pointer 事件（[berryos.html#L101-L103](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L101-L103)）。
- **启动**：`readAll()`（首次触发 v5→v6 迁移）→ `refreshPptCells()` → `shouldTrigger()` 命中则 `triggerAndGenerate().then(refreshPptCells)`（[berryos.html#L1206-L1222](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1206-L1222)）。
- **版本**：`pptgen.js?v=20261107f`（[berryos.html#L1201](file:///C:/Users/28464/IdeaProjects/blog/blog-ui/berryos.html#L1201)）。

### 12.4 真机验收

环境同 11.4：真实后端（jar + 本地 MySQL/Redis）、真实 `diary.html` / `berryos.html`、本地静态服务 8000、headless Chrome（原生 CDP，视口 1280×720）。全程走真实保存链路（Ctrl+S，非直接改缓存）。每次验收运行时随机注册临时账号，验收后已删除。

| 验收项 | 实际结果 |
|---|---|
| v5 单份 → v6 迁移 | 先人工写入 v5 单份（topic=迁移主题）→ 打开 berryos：`v6.items=1`、`label='迁移主题与我.ppt'`、桌面 1 格、`v5` 仍在（未被删） |
| 连续 3 篇不同主题日记 | 依次保存「微积分 / 失眠 / 英语单词」三段正文：`v6.items=3`，`label` 分别为 **微积分与我.ppt / 失眠与我.ppt / 英语单词与我.ppt**，id 各不相同；桌面 3 格，标题各不相同（x=840/945/1050，y=187，均 87×104） |
| 逐个点开播各自那份 | 3 次均 `#pptPlayer.show`；首屏实际文本与「该份缓存的第一页文本」完全一致：`微积分与我｜学不会？来看看`、`失眠与我｜学不会？来看看`、`英语单词与我｜学不会？来看看`（`same=true` ×3） |
| splash 原点 | 依次为 `883.273px 238.5px` / `988.305px 238.5px` / `1093.34px 238.5px`，与各自格子中心一致（此前会落到 `0px 0px`） |
| 鼠标拖一份到回收站 | 用 CDP 真实鼠标（mousePressed → 12 步 mouseMoved → mouseReleased）拖「微积分」：拖到回收站上方时 `.drop-hot=true`、`filter=brightness(1.8) drop-shadow(...)`；松手后该格消失，`items=2`、`label` 只剩失眠 / 英语单词，`deletedGone=true` |
| 删除后刷新 | 刷新 berryos：`items=2`、id 与顺序不变（失眠 → 英语单词），桌面仍 2 格 |
| 触摸路径 | 用 CDP `Input.dispatchTouchEvent`（touchStart → 10 步 touchMove → touchEnd）拖「失眠」：页面捕获到 `pointerType='touch'`，该格被删除，`items=1`、仅剩英语单词；无需退回合成事件 |
| 触摸后刷新 | 刷新后 `items=1`、仅英语单词，标题与 id 不变 |
| 上限 6 | 临时禁用 `window.api` 后连续 `generate()` 7 份不同主题：最终 `items=6`，最早的「上限测试主题0」被挤出（保留 1~6），未撑破布局 |

补充：回收站的静态图标 HTML/CSS 未改；高亮只作用于 `#icoRecycle` 的 `filter`，松手后立即移除。

### 12.5 未动的部分

- `detect.js`（`v=20261107a`）：`tokenize` / `significant` / `NEG` / 三指标 / 阈值 `0.40 / 0.01 / 0.10` / `shouldTrigger()` 一行未动。
- 抽词（`topKeyword`）与 `buildPrompt`：未动；3 篇验收的 `topic` 仍由原抽词逻辑得出（微积分 / 失眠 / 英语单词）。
- 回收站图标本体（图片、尺寸、左侧 5.025% / 顶部 23.77%、文字位置）：未动。
- `triggerAndOpen()` 保留原行为，未改。

### 12.6 环境清理

- 本轮所有 `pptverify*` 临时账号及其在 `ms_diary` / 会话 / 记忆 / 情绪等关联表的数据已删除，复查 `users_left=0`。
- Redis 侧复查无匹配 `pptverify` 的 `Token_*`。
- 后端 jar 进程、静态服务进程、headless Chrome 均已停止；验证脚本、结果 JSON、浏览器 profile 已从 `%TEMP%` 删除，未留在仓库。

---

## 附录 A：真实 50 条标注（A/B/C）

> 编号对应语料导出顺序（按 `create_date` 去重后）。`1`=命中，`0`=未命中；`SAFE`=安全类，不计入指标。

| # | 字数 | A | B | C | 期望触发 | 现有预测 | 现有 topKeyword |
|---|---|---|---|---|---|---|---|
| 1 | 115 | 0 | 0 | 0 | 0 | 0 | 只是 |
| 2 | 11 | 0 | 0 | 0 | 0 | 0 | — |
| 3 | 38 | 1 | 1 | 1 | 1 | 0 | 面试 |
| 4 | 41 | 0 | 0 | 0 | 0 | 0 | — |
| 5 | 205 | 1 | 1 | 1 | 1 | 0 | 已经 |
| 6 | 75 | 0 | 0 | 0 | 0 | 0 | 那我睡了 |
| 7 | 79 | 0 | 0 | 0 | 0 | 0 | 迟迟 |
| 8 | 10 | 0 | 0 | 0 | 0 | 0 | 粉色 |
| 9 | 34 | 0 | 0 | 0 | 0 | 0 | 哇哇 |
| 10 | 429 | 1 | 0 | 0 | 0 | **1** | 自己 |
| 11 | 411 | 1 | 1 | 1 | 1 | 0 | 时候 |
| 12 | 642 | 1 | 1 | 1 | 1 | 0 | 项目 |
| 13 | 18 | 0 | 0 | 0 | 0 | 0 | — |
| 14 | 762 | 0 | 0 | 0 | 0 | 0 | 一段 |
| 15 | 37 | 0 | 0 | 0 | 0 | 0 | — |
| 16 | 1412 | 0 | 0 | 0 | 0 | 0 | 阿帕次 |
| 17 | 2154 | 0 | 0 | 0 | 0 | 0 | 萨瓦迪卡 |
| 18 | 673 | 0 | 0 | 0 | 0 | 0 | 有人 |
| 19 | 408 | 1 | 0 | 0 | 0 | 0 | 没有 |
| 20 | 555 | 1 | 1 | 1 | 1 | 0 | 心里 |
| 21 | 253 | 0 | 0 | 0 | 0 | **1** | 自己 |
| 22 | 85 | 0 | 0 | 0 | 0 | 0 | 害怕 |
| 23 | 78 | 0 | 0 | 0 | 0 | 0 | — |
| 24 | 187 | 1 | 0 | 0 | 0 | 0 | 我不 |
| 25 | 27 | 0 | 0 | 0 | 0 | 0 | — |
| 26 | 636 | 0 | 0 | 0 | 0 | 0 | 呜呜 |
| 27 | 175 | 1 | 0 | 0 | 0 | 0 | 代码 |
| 28 | 113 | 0 | 0 | 0 | 0 | 0 | 自己 |
| 29 | 31 | 0 | 0 | 0 | 0 | 0 | — |
| 30 | 11 | 0 | 0 | 0 | 0 | 0 | — |
| 31 | 76 | SAFE | | | — | 0 | 了我的 |
| 32 | 3 | 0 | 0 | 0 | 0 | 0 | — |
| 33 | 7 | 0 | 0 | 0 | 0 | 0 | — |
| 34 | 55 | 1 | 1 | 0 | 1 | 0 | — |
| 35 | 9 | 0 | 0 | 0 | 0 | 0 | — |
| 36 | 47 | 0 | 0 | 0 | 0 | 0 | 今天 |
| 37 | 9 | 0 | 0 | 0 | 0 | 0 | — |
| 38 | 8 | 0 | 0 | 0 | 0 | 0 | — |
| 39 | 25 | 0 | 0 | 0 | 0 | 0 | — |
| 40 | 2 | 0 | 0 | 0 | 0 | 0 | — |
| 41 | 14 | 1 | 0 | 0 | 0 | 0 | — |
| 42 | 7 | 0 | 0 | 0 | 0 | 0 | — |
| 43 | 337 | 0 | 0 | 0 | 0 | 0 | 丈夫 |
| 44 | 3491 | 0 | 0 | 0 | 0 | 0 | — |
| 45 | 36 | 0 | 0 | 0 | 0 | 0 | — |
| 46 | 75 | 0 | 0 | 0 | 0 | 0 | 说话 |
| 47 | 64 | 0 | 0 | 0 | 0 | 0 | 可以 |
| 48 | 12 | 0 | 0 | 0 | 0 | 0 | 我的 |
| 49 | 378 | 1 | 0 | 0 | 0 | 0 | 停下来 |
| 50 | 188 | 1 | 0 | 0 | 0 | 0 | 停下来 |

## 附录 B：合成样本（20 条）

| ID | 字数 | 期望 | 现有 | conc / dens / neg | topKeyword | 要点 |
|---|---|---|---|---|---|---|
| S1 | 166 | 1 | **1** | 1 / 0.018 / 0.17 | 打包 | 打包白屏，试了三种方案 |
| S2 | 152 | 1 | 0 | 1 / 0.013 / 0.08 | 简历 | 投 30 家 0 面试，简历改三版 |
| S3 | 152 | 1 | **1** | 1 / 0.013 / 0.21 | 列了 | 想做的事太多，清单一堆，来回挑 |
| S4 | 99 | 0 | **1** | 1 / 0.030 / 0.17 | 什么 | 纯情绪，明确说无具体事 |
| S5 | 94 | 0 | 0 | 0 / 0 / 0 | — | 项目上线，正面 |
| S6 | 83 | 0 | 0 | 1 / 0.024 / 0 | 看了 | 流水账 |
| S7 | 137 | 1 | 0 | 1 / 0.015 / 0.08 | 九点就 | 减肥卡在晚上吃，三次失败 |
| S8 | 143 | 1 | 0 | 1 / 0.014 / 0.04 | 连读 | 口语卡在连读，听二十遍 |
| S9 | 88 | 0 | **1** | 1 / 0.023 / 0.17 | 不知道 | 对未来焦虑，无对象 |
| S10 | 121 | 1 | **1** | 1 / 0.017 / 0.13 | 数据 | 论文数据跑不出，重跑三次 |
| S11 | 70 | 0 | 0 | 1 / 0.029 / 0 | 明天 | 只列计划，无阻碍无失败 |
| S12 | 145 | 1 | **1** | 1 / 0.014 / 0.13 | 两边都 | 项目 + 考研两件卡点（低集中度） |
| S13 | 51 | 0 | 0 | 1 / 0.098 / 0 | 啦啦 | 歌词 |
| S14 | 144 | 1 | 0 | 0.833 / 0.014 / 0.04 | 什么时候 | 整数拆分卡三天 |
| S15 | 78 | 0 | 0 | 0 / 0 / 0.08 | — | 抱怨室友但无具体事 |
| S16 | 119 | 1 | 0 | 1 / 0.017 / 0 | 方向都 | 副业选品，两方向没水花 |
| S17 | 66 | 0 | 0 | 1 / 0.030 / 0 | 有时候 | 反刍人生 |
| S18 | 137 | 1 | 0 | 1 / 0.015 / 0.04 | 两个小时 | UI 像素错位，padding 没清零 |
| S19 | 21 | 0 | 0 | 1 / 0.476 / 0 | 我的 | 无意义重复文本 |
| S20 | 138 | 1 | 0 | 1 / 0.022 / 0 | 有的 | 考研择校，信息不全，报名截止 |

## 附录 C：关键数据一览

- `analyze()` 平均耗时 **0.103 ms/次**（14,000 次调用，Node / 单线程）。
- `concentration=1` 的条目：34/69（真实 17/49）。
- 真实语料（50 条去重）触发率：**2/50 = 4%**，且 2 条均为误报。
- 真实正例漏判率：**6/6**；合成正例漏判率 7/11；合计 13/17。
- 现有 `topKeyword` 主题命中：5/17；抽原句：13/17。

---

## 附录 D：合成样本全文（20 条）

> 复现用。期望标签 1=该出 PPT、0=不该出；判定口径见 3.1。

**S1**（期望 1，166 字）

> 今天一整天都在弄项目的打包，本地跑得好好的，一打包就白屏。 我先怀疑是路由，改了两版没解决；又怀疑是资源路径，把 publicPath 改成相对路径还是白屏；最后试了把动态 import 全部写死，才勉强出来一个页面。 从下午两点弄到晚上十点，中间重启了七八次，控制台那条报错一直没变。 真的很烦，也很累，感觉自己连个打包都搞不定。

**S2**（期望 1，152 字）

> 秋招从九月开始投简历，一共投了三十多家。 每天刷邮箱，大部分是已读不回，只有两家给了笔试，其中一家笔试也挂了。 我改了三版简历，找了学长看，把项目描述重写了一遍，投出去还是没动静。 上周终于约到一次面试，结果一面就挂了，面试官问的那个分布式问题我完全答不上来。 很难受，也怕自己是不是真的不适合这个方向。

**S3**（期望 1，152 字）

> 想做的事太多，清单列了一堆，真做没几个。 这周我试着只留三件最重要的，可到了第二天又忍不住往上加。 先做项目还是先刷题？我每次都要在这两件之间来回挑，挑到中午还没开始。 上周列了十二件事，最后只完成了一件半。 我发现问题不是没时间，是我一直在排优先级，排完就累了。 很烦，也很难受，不知道自己到底卡在哪。

**S4**（期望 0，99 字）

> 今天一整天情绪都很低，说不上原因。 没有发生什么具体的事，就是心里堵得慌，什么都不想做。 晚上躺在床上想哭，又哭不出来。 我知道自己状态不对，可也说不出到底在难过什么。 只想快点睡着，明天能好一点。

**S5**（期望 0，94 字）

> 今天项目终于上线了，收到好多人夸。 下午把 README 补完，又截了几张图发到群里，有人问能不能试用。 晚上一个人出去吃了顿好的，回来的路上风很舒服。 很久没有这种踏实的感觉了，记一下。

**S6**（期望 0，83 字）

> 今天早上九点起床，吃了面包和牛奶。 上午去了图书馆，看了两章书，中途睡了一会儿。 中午和同学一起吃饭，聊了会儿天。 下午回宿舍洗了衣服，晚上看了部电影。 普通的一天。

**S7**（期望 1，137 字）

> 减肥又失败了。 我白天控制得很好，早饭午饭都按计划吃，可一到晚上九点就忍不住想吃东西，昨天又吃了一整包薯片。 这已经是这个月第三次了。前两次我试过晚饭多吃一点，也试过九点就刷牙，还是没用。 每次吃完都很后悔，第二天又接着减。 我很想瘦下来，可就是卡在晚上这一关，真的做不到。

**S8**（期望 1，143 字）

> 练了快两周英语口语，卡在连读上。 跟着录音一句一句读，单词都认识，可一到连读我就听不出来在说什么。 我把一段两分钟的材料反复听了二十遍，还是分不清 "want to" 和 "wanna"。 试过慢速播放，也试过把音标全查出来，跟读的时候还是跟不上。 有点泄气，不知道是不是我耳朵的问题。

**S9**（期望 0，88 字）

> 最近总是害怕未来。 一想到毕业以后要工作、要生活、要面对很多不确定的东西，就很慌。 不知道自己会变成什么样，也不知道现在做的这些有没有用。 很难受，可又说不出具体在怕哪一件事。

**S10**（期望 1，121 字）

> 毕业论文的数据跑不出来。 我把实验重跑了三次，每次跑完指标都对不上，loss 一直在震荡。 换了学习率、加了 dropout、也试过换数据集划分，结果还是不稳定。 导师让我先找原因，可我连是哪一步出的问题都定位不到。 拖了快两周了，越拖越慌。

**S11**（期望 0，70 字）

> 今天列了明天的计划：七点起床，背单词，刷两道题，改项目，跑步。 写完之后觉得安排得挺合理，心情也不错。 希望明天能按计划来。 现在准备睡了。

**S12**（期望 1，145 字）

> 最近同时推两件事，都有点卡。 项目那边，登录页的表单校验一直有 bug，提交之后有时候不报错也不跳转，我查了半天没找到原因。 考研那边，专业课第二轮的笔记做了三分之一就推不动了，每次坐下都想先干别的。 两边都想做好，可每天的时间只够顾一边，结果两边都没进展。 很累，也不知道该先放弃哪一边。

**S13**（期望 0，51 字）

> 窗外的雨下了一整夜 我把你的名字写在纸上 又轻轻擦掉 有些话说不出口 就让它跟着风走吧 啦啦啦 啦啦啦

**S14**（期望 1，144 字）

> 整数拆分这道题卡了三天。 记忆化 DFS 的刹车逻辑我始终绕不过来：什么时候该继续拆，什么时候该直接停，递归里那条分支到底怎么收。 我看了解析，也照着敲了一遍，跑出来的答案还是不对。 昨天又重写了一次，改到凌晨一点，样例过了但提交还是错。 明明别的 DP 题我都能做出来，就这一道过不去。

**S15**（期望 0，78 字）

> 我真的受不了我室友了。 每天晚上打游戏打到一两点，声音还特别大，说过好几次也没用。 白天在宿舍也是，东西乱放，垃圾不扔。 就是很讨厌这种人，不想再跟她住了。

**S16**（期望 1，119 字）

> 想做点副业，结果卡在选品上。 先试了卖手工饰品，进了两百块的货，挂了半个月一单没出；后来又想做资料整理，写了几篇笔记，也没人买。 查了很多教程，说要做垂类、要养号，可我连卖什么方向都定不下来。 试了两个方向都没水花，现在有点不敢再投钱了。

**S17**（期望 0，66 字）

> 人活着到底是为了什么。 想了很多，也没想明白。 有时候觉得自己在往前走，有时候又觉得只是在原地打转。 可能想这些也没用，但还是会想。

**S18**（期望 1，137 字）

> 今天又在改项目 UI，像素块的位置总是差几个像素。 逻辑都跑通了，就是视觉上对不齐，我盯着屏幕调了快两个小时。 试过改 margin，试过给容器加 flex，都没用。 最后发现是父容器的 padding 没清零，改完那一刻整个人都松了。 虽然解决了，但这两个小时真的很折磨。

**S19**（期望 0，21 字）

> 我的我的我的我的我的我的我的我的我的我的。

**S20**（期望 1，138 字）

> 考研择校卡了半个月。 三个候选学校，我在网上查了很多资料，可每个学校的信息都不全：有的只公布总分，有的复试比例查不到，有的连专业课参考书都换过。 我做了个表格对比，填了一半就填不下去了，因为很多格子只能靠猜。 问了两个学长，说法也不一样。 到现在报名都快截止了，我还没定下来。
