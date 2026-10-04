# Madeline 唱歌 Demo · 迭代文档

> 文件：`blog-ui/sing-test.html`
> 定位：独立可运行的"AI 回话 → Madeline 逐字变调唱出"实验场，复现并演进 diary 的选声规则，叠加参考音频自动转谱、TD-PSOLA 变调合成、机器测频闭环修正。
> 依赖：`js/blip_data.js`（情绪池烘焙基频/响度）、`celeste-sounds/wow_so_secret.wav`（默认参考旋律）、`sounds/{emo}/`（对话音效素材）。

---

## 一、功能总览

| 入口 | 行为 |
|---|---|
| **AI 复读唱出** | 取输入框文字（无则兜底"我要一步一步爬到山顶"），按语义抽情绪，加载音效池，走拼接流水线唱出 |
| **直接唱输入框文字** | 同上，但要求输入框非空 |
| **听原版对比** | 播 `wow_so_secret.wav`，供 A/B 对比还原度 |
| **① 对话原声** | `singText(text, emo, stage=1)`：只渲染 diary 式对话原声，不变调 |
| **② 变调歌唱** | `singText(text, emo, stage=2)`：拼接流水线，自动识别参考音频 → 一字一音贴旋律 + 滑音 |
| **拼接模式开关**（默认开） | 开：拼接流水线（识别驱动的逐字歌唱）；关：乐句单声源长音垫模式 |
| **喂一首歌（AI 自动转谱）** | 上传任意音频 → `transcribeMelody` 自由转谱 → 点 ② 即用该旋律唱 |

演唱情绪**固定生气池**（注释说明"生气池 blip 基频清晰、最像原版"），其他情绪池仅作先验展示。

---

## 二、核心模块

### 1. 参考音频识别（YIN 基频检测）

**单帧 YIN** `yinFrame(d, i0, frame, lo, hi, sr)`：
- 差分函数 → 累积均值归一化（CMND）→ 绝对阈值 0.15 → 局部极小 → 抛物线插值（亚采样精度）
- tau 搜索限人声 200~900Hz

**预置网格识别** `measureGrid(buf, NOTES)`：
- 输入域已知每个预期 onset 的位置（wow 旋律的 `NOTES` 先验），在 onset 小窗内（onset+20ms ~ onset+min(0.12, dur×0.7)）用 YIN 测频取中位
- 先验音高 ±4 半音窄 lag 窗，防 YIN 八度跳变 / 和声误锁

**整段自动转谱** `analyzeAudioNotes(buf)`（旧路径，整段无先验）：
- 能量门控（相对峰值 -24dB）+ 连续八度纠错（消倍频跳变）
- 帧→音符：静音 >80ms 断句、音高跳变 >0.9 半音断音
- 能量审查：低于局部 ±0.9s 强音 20% 的音（滑音/气口尾音）并入宿主真音
- MIDI 量化 → 同音近邻（缺口 ≤0.2s）合并 → <0.07s 短音并入邻音（迭代到稳定）

**自定义歌曲转谱** `transcribeMelody(buf, startSec, maxSec=24)`（**新增**，支持喂任意歌）：
- 能量 onset 分段（上升沿 ×1.35、最小间隔 90ms）
- 段内元音区 YIN 测频，**连续 3 帧偏离段中位 >1 半音即切分**（消"一段里连着几个不同音高的音"）
- 同音连段合并

### 2. 音效池与选声

**加载** `loadEmo(emo)`：
- 4 组（mid_A/B/C + per）× 10 条 = 40 条 wav
- 烘焙基频（`BLIP_DATA`）用朴素自相关，易锁错八度 → **加载时用 YIN 复测**，以 YIN 为准
- `findLoopRegion`：稳态段内找基频周期整数倍的正向过零点对做循环区（相位+幅度匹配 → 无缝循环）
- 池内中位响度归一；池内中位基频供气声 blip 做变调基准

**选声复刻 diary** `pickDiarySeq(poolKey, n, targetMidis)`：
- `speakSeqGlobal` 跨句累计：`seq%7===0` 用 per，其余按 `seq%3` 轮转 `mid_B→mid_C→mid_A`
- 歌唱态（`targetMidis` 给定时）：组内选 f0 最接近目标音的 item，变调率自然贴近 1

### 3. 文本与节奏

`textToUnits(text)`：中日韩逐字、英文数字按词、标点/空白 `speak=false` 只占位不发声；截断 44 字。

`planSpeech(units)`：字间隔 45~65ms 随机，每 3 个有效字发一声。

### 4. 合成核心：TD-PSOLA（**v4 关键升级**）

`psolaVoice(it, span, fFn)` 是相对"playbackRate 重采样"的质变：
- playbackRate 的根本缺陷：变调必变共振峰 → 变调率大就"花栗鼠"
- PSOLA 按基频周期重排脉冲，音高走任意轨迹（`fFn`），谱包络近似不动
- 流程：1kHz 单极低通 → 名义周期网格 + 峰值吸附找 epochs → 头部逐采样重采样（含 scoop 起音下滑）→ PSOLA 主段相位累计布粒（OLA 幅度归一、窗=2×分析周期、粒内 1:1 读取不重采样）→ 12ms 尾淡出 → 峰值归一

**长音垫** `makePad(buf, seconds, f0)`：乐句单声源模式用，重叠窗口=1 周期、片段长取整周期 → 相位对齐无梳状滤波金属声。

### 5. 渲染与音高校验闭环

`renderSpeech(units, picks, plan, noteRates, glideRates, expr, fFns)`：
- 歌唱态（有 `fFns`）：PSOLA 合成
- 对话态 / PSOLA epoch 不足回退：playbackRate 重采样 + 滑音对数弯音 + 颤音曲线 + 长音循环区
- 表情层：scoop（起音从低 1.5 半音滑正）、颤音（5.8~6.5Hz / 18~32 音分，35% 起振 65% 全深）、力度弧线（高音更亮）
- 新声 15ms 截断淡出旧声

**机器测频** `verifyPitch(buf, sounds, targetMidis, ...)`：
- 每声在元音稳定区（越开辅音段）YIN 测频，期望频率 ±5 半音窄带
- 测频窗口避开滑音区（65% 起）和颤音区（长音收窄到前 32%）
- 偏差 >80 音分标记 bad

**闭环重渲染**（最多 6 轮）：
- bad 声：实测频率反推 blip 真实基频 → 若到位变调率超 [0.6,1.8] 说明烘焙基频错八度 → 拉黑 `bannedBlips` 换声
- 按反推基频重算 rates / glideRates → 重渲染 → 再测，循环到无 bad 或 6 轮

### 6. 演唱主流程

**拼接流水线** `singConcat(units, boosted, t0, srcs, stage)`（v4，默认路径）：
1. 节奏规划（diary 基础，会被识别节奏覆盖）
2. 步骤1：`ensureReference()` 识别参考音频（自定义歌或 wow 默认），失败走五声兜底
3. 一字一音映射：发声字依次落到旋律网格，标点占位跟随前一声
4. **选调**：±12 半音全搜索，代价 = 钳制 [0.7,1.4] 后的音分误差（让所有音变调率都落安全区）
5. 选声（按移调后目标重选）→ 变调率 → 滑音率
6. 表情层（颤音/起音/力度/时机拟人化 ±10ms）
7. `fFn` 瞬时频率轨迹（变调+scoop+颤音+滑音对数合成）
8. 渲染 → 测频校验 → 闭环重渲染

**乐句单声源模式**（拼接模式关闭时）：
- 每句一个连续长音垫声源，字间只变调不重触发（消除"卡"感），40ms 弯音滑字间，咬字音量凹陷保留节奏感

---

## 三、版本演进（从代码注释与结构还原）

| 阶段 | 标志性改动 | 解决的问题 |
|---|---|---|
| **v1 重采样直变调** | 每条 blip `playbackRate = 目标频率 / f0`，一字一声 | 能用但变调率大就花栗鼠，且断续 |
| **v2 乐句长音垫** | `makePad` 重叠拼接长音，整句一个声源 + 滑音 | 消除断续感，但仍是共振峰联动变调 |
| **v3 三枚举情绪 + wow 固定旋律** | `SING_POOLS` 多选，NOTES 44 音先验网格 `measureGrid` | 引入情绪系统与参考旋律 |
| **v4 拼接流水线 + TD-PSOLA**（当前） | `psolaVoice`、`singConcat`、选调、表情层、测频闭环 | 变调保留音色、音准可机器校验自动修正 |
| **补丁1：自定义歌曲转谱** | `transcribeMelody` 自由 onset 分段 + 音高跳变切分 | 脱离 wow 固定旋律，支持喂任意歌 |
| **补丁2：单池收敛** | `SING_POOLS=['angry']`、`PRIOR_MAP` 全部归一到 angry | 多池下听感不稳，生气池基频最清晰 |
| **补丁3：烘焙基频纠错** | 加载时 YIN 复测、测频闭环反推真实 f0、`bannedBlips` 黑名单 | 朴素自相关烘焙数据易锁错八度 |

---

## 四、关键配置与常量

| 项 | 值 | 说明 |
|---|---|---|
| `SING_POOLS` | `['angry']` | 演唱池固定生气 |
| `NOTES` | 44 音符 `[t, dur, midi]` | wow 彩蛋旋律先验网格 |
| `CHAR_MIN / CHAR_VAR` | 0.045 / 0.02 | diary 字间隔（s） |
| 变调率安全区 | `[0.7, 1.4]` | 选调与 rate 钳制范围 |
| 音高校验阈值 | 80 音分 | 超过则进入闭环重渲染 |
| 闭环最大轮数 | 6 | |
| 颤音 | 5.8~6.5Hz / 18~32 音分 | 长音（≥0.25s）才有 |
| 起音 scoop | -1.5 半音 / 45ms | 句首/换气后 |
| `window.__dbg` | 暴露核心函数 | 供自动化测试量化 |

---

## 五、已知约束与注意事项

- 演唱情绪固定生气，其他情绪池只参与先验展示，不直接演唱。
- 带伴奏的歌转谱易混入乐器音：建议用 Demucs 分离纯人声再喂。
- 情绪先验从 `localStorage.madeline_emotion` 读取（diary / 圆桌会议写入），结构 `{emotion, source, ts}`。
- 浏览器自动播放策略：所有按钮首击先 `ctx.resume()`。
- 控制台探针 `window.__dbg` 暴露 `renderSpeech / planSpeech / pickBlip / pickDiarySeq / ensurePools / textToUnits / pool / singConcat / ensureReference / analyzeAudioNotes / emotionProbabilities / pickSingEmotion`。
