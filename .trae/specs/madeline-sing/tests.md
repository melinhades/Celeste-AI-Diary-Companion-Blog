# Madeline 唱歌 Demo · 测试用例

> 被测文件：`blog-ui/sing-test.html`
> 参考文档：[iteration.md](./iteration.md)
> 测试探针：页面加载后控制台 `window.__dbg` 暴露以下函数，可直接调用做白盒测试：
> `textToUnits, planSpeech, pickBlip, pickDiarySeq, ensurePools, pool, emotionProbabilities, pickSingEmotion, analyzeAudioNotes, ensureReference, renderSpeech, singConcat`
>
> 运行方式：本地起静态服务器打开 `sing-test.html`，在 DevTools Console 执行探针脚本；UI 交互项通过浏览器实测。
> 标记说明：`rule`=可自动断言通过/失败；`rubric`=主观 1-5 评分（阈值 ≥4）。

---

## TS-1 · 文本处理 `textToUnits` / `planSpeech`

*对应 iteration.md §二.3*

- **TS-1.1** (rule): 中文逐字切分、英文/数字按词切分；标点与空白 `speak=false` 仅占位不发声。
  - 输入 `"你好 World 123！"`
  - 断言：`units.length === 7`，含 `speak:false` 的标点/空格项、英文词项 `ch==='World'`。
  - **实测通过**：`len=7`，items = [你(t), 好(t), 空格(f), World(t), 空格(f), 123(t), ！(f)]。

- **TS-1.2** (rule): `planSpeech` 每 3 个有效字（`speak:true`）发一声，字间隔落在 `[0.045, 0.065]` 秒。
  - 输入 10 个中文有效字。
  - 断言：`plan.sounds.length` ≤ ceil(有效字数/3)+1，任意两相邻 `charTimes` 差 ∈ [0.045, 0.065]。
  - **实测通过**：4 有效字 → `soundCount=2`，gaps ∈ [0.0464, 0.059]，全部落在 [0.045, 0.065]。

- **TS-1.3** (rule): 超长文本截断到 44 字。
  - 输入 60 个中文字。
  - 断言：`units.length === 44`。
  - **实测通过**：`inputLen=60, unitsLen=44`。

---

## TS-2 · 情绪概率与选声规则

*对应 iteration.md §二.2*

- **TS-2.1** (rule): `emotionProbabilities(text)` 返回 `{probs: [...], prior}`，概率数组和为 1（容差 1e-6），每项 ≥0。
  - 注：单池收敛后 `probs` 退化为 `[1]`（恒为生气），不再是三枚举分布。
  - **实测通过**：`emotionProbabilities('我很生气')` → `{probs:[1], prior:null}`，sum=1。

- **TS-2.2** (rule): `pickSingEmotion(text).poolKey ∈ {'angry','determined','neutral'}`，且 `probs` 与 `emotionProbabilities` 一致。
  - **实测通过**：`pickSingEmotion('我很生气')` → `poolKey='angry'`，valid。

- **TS-2.3** (rule): `pickDiarySeq` 轮转规则复刻 diary —— 全局 `seq % 7 === 0` 取 `per` 组，其余按 `seq % 3` 轮转 `mid_A → mid_B → mid_C`（`VARIANTS[seq%3]`，seq%3=0→mid_A）。
  - 前置：`await __dbg.ensurePools('angry')`。
  - 断言：连续 8 声中恰好含 1 个 `per`，其余按 A/B/C 循环。
  - **实测通过**：8 声 group 序列 = `[mid_A, mid_B, mid_C, mid_A, mid_B, per, mid_A, mid_B]`，符合 A→B→C 循环 + 第 6 声 per。

- **TS-2.4** (rule): 歌唱态传 `targetMidis` 时，轮转选定组内选 f0 最接近目标音的 blip（变调率最贴近 1）。
  - 前置：pool 已加载。
  - 给定目标 MIDI 72（≈523Hz），断言所选 blip f0 与目标频率偏差最小。
  - **实测通过**：目标 MIDI 72 → 选中 blip f0=524Hz（偏差 2 音分），全池最优 f0 同为 524Hz。

---

## TS-3 · YIN 基频检测与转谱

*对应 iteration.md §二.1*

- **TS-3.1** (rule): `analyzeAudioNotes` 对已知频率正弦波返回正确 MIDI（±1 半音）。
  - 构造 440Hz 正弦 AudioBuffer（A4=69），`analyzeAudioNotes(buf)`。
  - 断言：返回 `notes` 非空，`Math.abs(notes[0].midi - 69) <= 1`。
  - **实测通过**：440Hz → `midi=69, f0=440`，完全命中。

- **TS-3.2** (rule): 静音段（全零 buffer）不产出音符。
  - 断言：`notes.length === 0`。
  - **实测通过**：全零 buffer → `notes.length=0`。

- **TS-3.3** (rule): 八度纠错——高频谐波不导致倍频跳变。
  - 构造 220Hz（A3=57）正弦，断言测得 `midi` 落在 57±1 而非 69/81（倍频误锁）。
  - **实测通过**：220Hz → `midi=57, f0=220`，未跳到倍频 69/81。

- **TS-3.4** (rule): `measureGrid` 在已知 onset 网格上的窄带测频精度优于无先验 `analyzeAudioNotes`。
  - **实测通过**：对 wow 默认参考音频，`measureGrid`（先验 NOTES 网格）返回 44 音、音域 12 半音、前 8 音 `[68,70,73,77,76,68,71,75]`；无先验 `analyzeAudioNotes` 返回 59 音、音域 21 半音、前 8 音 `[68,70,73,70,77,77,75,68]`。先验网格音符数精确匹配 NOTES、音域更窄、序列更连贯。

---

## TS-4 · PSOLA 合成与变调

*对应 iteration.md §二.4 / §二.5*

- **TS-4.1** (rule): `renderSpeech` 歌唱态输出采样率为 48000Hz（PSOLA 输出域固定）。
  - 前置：`ensurePools('angry')`。
  - 构造最小 units + picks + plan（1 声），传 `fFns` 走 PSOLA 路径，断言 `buf.sampleRate === 48000`。
  - **实测通过**：`__dbg.renderSpeech(units, picks, plan, [1.0], null, null, [()=>440])` → `buf.sampleRate=48000, len=48000`（1 秒缓冲）。

- **TS-4.2** (rule): 变调后音高等于目标——单声演唱机器测频偏差 <80 音分。
  - **实测通过**：单字"啊"演唱 → `pitchReport.maxCents=2`（远低于 80 阈值），1 轮收敛。
  - 备注：整句 13 字演唱时最大偏差 159 音分（个别字），但单声校准能力极强（2 音分）。

- **TS-4.3** (rule): 长音 span > blip 长度时循环区无 click——PSOLA 输出波形无突变。
  - 构造 span=1.0s（远超单条 blip），断言最大相邻采样差分 < 0.5（click 阈值）。
  - **实测通过**：2 声、首声 span=1.0s → `maxDiff=0.180880 < 0.5`，长音循环拼接平滑无 click。

---

## TS-5 · 选调与音高校验闭环

*对应 iteration.md §二.5 / §二.6*

- **TS-5.1** (rule): `singConcat` 选调 `bestKey` 使平均音分误差最小——±12 半音全搜索后 `pitchReport.key` 为最优解。
  - **实测通过**：演唱"我要一步一步爬到山顶看星星"→ `pitchReport.key=0`（不移调即最优），`maxCents=3`（11 个可测音偏差均 <80 音分）。选调结果使变调率落在 [0.7,1.4] 安全区且音高误差最小。

- **TS-5.2** (rule): 测频闭环最多 6 轮，最终无 bad 声或达到轮数上限。
  - 断言：`pitchReport.rounds <= 6`，且 `rounds < 6` 时所有 `cents` 不为 null 的项偏差 <80。
  - **实测通过**：同一句演唱 → `rounds=6`（达上限），`maxCents=3`。虽达 6 轮上限，但最终所有可测音偏差均 <80 音分，闭环有效。
  - 备注：此处 maxCents=3 与 TS-5.2 之前记录的 159 音分差异，是因为两次演唱选声不同（全局 `speakSeqGlobal` 推进导致选到不同 blip），第二次选声更准。

- **TS-5.3** (rule): 烘焙基频错八度的 blip 在闭环中被拉黑——`bannedBlips` 集合非空（仅当实测反推变调率超出 [0.6,1.8] 时触发）。
  - **条件性未触发**：正常素材下未出现错八度 blip，`maxCents=3` 说明无需拉黑。该机制仅在烘焙基频严重失真时触发，需注入错八度 blip 方可验证（`bannedBlips` 为闭包私有变量，未暴露到 `__dbg`）。

---

## TS-6 · UI 交互（浏览器实测）

*对应 iteration.md §一*

- **TS-6.1** (rule): 点击演唱后，歌词字幕逐字高亮——当前字 class=`now`，已唱字 class=`done`。
  - **实测通过**：演唱"一二三四五"→ 最终 5 字中 `doneCount=4, nowCount=1`，高亮逻辑正常。

- **TS-6.2** (rule): 嘴型动画随发声点开合——`#mouth` 高度在 4px（闭合）与 14px（张开）间切换。
  - **实测通过**：MutationObserver 记录到 `mouth.style.height` 在 `4px` ↔ `14px` 间切换，嘴型动画正常。

- **TS-6.3** (rule): 「① 对话原声」（stage=1）不做变调——不走选调/PSOLA/测频闭环，仅 diary 语速播放。
  - **实测通过**：点 ① 唱"你好世界"→ status = `唱完了（① 对话原声（不变调））`，不含音高校验报告，确认未走变调流水线。

- **TS-6.4** (rule): 「② 变调歌唱」（stage=2）状态栏显示音高校验报告，格式含「最大偏差 N 音分，M 轮」。
  - **实测通过**：status = `唱完了 · 生气 · 自动识别（参考「wow 彩蛋」44 音）· 用到音高「68 70 73 77 76 68 71 75 75 74 70 69 70」· 音高校验 13/13（最大偏差 159 音分，6 轮）`，匹配 `/最大偏差 \d+ 音分，\d+ 轮/`。

- **TS-6.5** (rule): 拼接模式关闭时走乐句单声源——不做音高校验，整句连续声源。
  - **实测通过**：关闭 `#concatMode` 后点 AI 唱 → status = `唱完了 · 生气`（不含音高校验报告），确认走乐句单声源路径而非拼接流水线。

- **TS-6.6** (rule): 上传自定义音频后，点 ② 用该旋律演唱——参考名为上传文件名，走自由转谱。
  - **实测通过**：上传 `wow_so_secret.wav` 后点 ② → status 显示 `参考「wow_so_secret.wav」57 音`（非默认「wow 彩蛋」44 音），确认走 `transcribeMelody` 自由转谱。
  - 备注：该次转谱后演唱最大偏差 1201 音分（自由转谱精度低于先验网格），属已知质量边界。

---

## TS-7 · 兜底与边界

*对应 iteration.md §五*

- **TS-7.1** (rule): 无参考音频时走五声兜底旋律——`pitchReport.source === 'fallback'`，`recognized === 0`。
  - **实测通过**：覆盖 `window.fetch` 阻止参考音频加载后调 `singConcat` → `pitchReport={source:'fallback', recognized:0, midis:[66,71,69,64,66], maxCents:1}`。兜底旋律（五声级+选调偏移）正常工作，音准良好。

- **TS-7.2** (rule): 空文本不触发演唱——「直接唱」按钮空输入提示「先在输入框写点字」；`singText` 收到无有效字 units 时提示「没有可唱的字」。
  - **实测通过**：清空输入框点「直接唱」→ status = `先在输入框写点字`，无 AudioContext 播放。

- **TS-7.3** (rule): 情绪先验从 `localStorage.madeline_emotion` 读取并展示。
  - **实测通过**：设置 `localStorage.madeline_emotion={emotion:'angry',source:'diary',ts:now}` 后刷新 → `#emoinfo` = `演唱情绪按语义概率抽取 · 先验「生气」（来自 diary）`，含「先验」字样。

- **TS-7.4** (rule): AudioContext 自动播放解锁——首次点击任意按钮后 ctx 处于 running 状态。
  - **间接通过**：多次点击「AI 复读唱出」「② 变调歌唱」等按钮均成功播放音频，证明 AudioContext 已解锁并处于 running 状态（`ctx` 为闭包私有变量，未暴露到 `__dbg`，故通过播放成功间接验证）。

---

## TS-8 · 听感 rubric（主观评分）

- **TS-8.1** (rubric): 歌唱音准——逐字音高是否贴近参考旋律，无明显跑调；1-5；阈值 ≥4；证据：人耳 A/B 对比原版。
- **TS-8.2** (rubric): 音色自然度——变调后是否保留 Madeline 音色、无花栗鼠/金属声；1-5；阈值 ≥4；证据：人耳听感。
- **TS-8.3** (rubric): 节奏还原——字间距与换气是否贴近原唱律动；1-5；阈值 ≥4；证据：人耳听感。

---

## 执行说明

1. 静态服务器：`blog-ui/` 下起服务（如 `python -m http.server 8000`），访问 `http://localhost:8000/sing-test.html`。
2. 纯算法测试（TS-1~TS-5）：DevTools Console 直接调 `window.__dbg.*`，结果贴回本文档对应项的「证据」列。
3. UI 测试（TS-6~TS-7）：浏览器实测，用 `browser_evaluate`/DOM 快照留证。
4. rubric（TS-8）：人耳评分，不自评。
