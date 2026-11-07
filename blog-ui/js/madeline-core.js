// ================================================================
// madeline-core.js —— 像素 Madeline 行为树共享内核
// 抽取 diary.js / write-madeline.js 通用的、无 DOM 耦合的逻辑：
//   · 情绪分组（isPositive / isGloomy / isNight）
//   · 加权随机（weightedPick）
//   · 模式定义表（DEFAULT_MODES）+ enterMode 工厂
//   · 中断优先级（canInterrupt / tryInterrupt）
// 页面通过 createCore(deps) 注入各自的状态对象与回调，复用同一套数据驱动状态机。
// archives.html 的 Madeline 形态差异过大（贴底左右走 + 彩蛋气泡），不接入本内核。
// ================================================================
(function (global) {
    'use strict';

    // ===== 情绪分组：集中定义，避免多处硬编码 =====
    const EMOTION_GROUP = {
        positive: ['开心', '可爱', '惊讶'],
        gloomy:   ['悲伤', '孤独', '不开心', '不安']
    };
    function isPositive(e) { return EMOTION_GROUP.positive.indexOf(e) !== -1; }
    function isGloomy(e)   { return EMOTION_GROUP.gloomy.indexOf(e) !== -1; }
    function isNight()     { const h = new Date().getHours(); return h >= 23 || h < 6; }
    function rnd(span)     { return Math.random() * span; }

    // ===== 加权随机：items = [[key, weight], ...]，权重自动归一化 =====
    // avoidKey 可选：尽量避开刚做过的模式（池中还有其他选项时过滤掉），减少连续复读同一动作
    function weightedPick(items, avoidKey) {
        if (avoidKey !== undefined && items.length > 1) {
            const filtered = items.filter(([k]) => k !== avoidKey);
            if (filtered.length > 0) items = filtered;
        }
        const total = items.reduce((s, it) => s + it[1], 0);
        let r = Math.random() * total;
        for (const [k, w] of items) { r -= w; if (r <= 0) return k; }
        return items[items.length - 1][0];
    }

    // ===== 默认模式表：素材 / 可移动 / 可蹦 / 贴地 / 优先级 / 时长 集中一处 =====
    // key 为 state.mode 实际值；'fun'/'look' 是行为别名（落地为 idle/lookaround）
    const DEFAULT_MODES = {
        walk:       { src: 'move',   movable: true,  canHop: true,  priority: 10,  route: true,  dur: () => 9000 },
        idle:       { src: 'move',   movable: false, canHop: false, priority: 10,  dur: () => 1200 + rnd(2000) },
        bounce:     { src: 'bounce', movable: false, canHop: false, priority: 30,  ground: true, dur: () => 2600 + rnd(2000) },
        lookaround: { src: 'fun',    movable: false, canHop: false, priority: 20,  dur: () => 2200 + rnd(2000) },
        sit:        { src: 'sit',    movable: false, canHop: false, priority: 20,  ground: true, dur: () => 6000 + rnd(10000) },
        sleep:      { src: 'sleep',  movable: false, canHop: false, priority: 100, ground: true, dur: () => 20000 + rnd(25000) },
        wake:       { src: 'wake',   movable: false, canHop: false, priority: 25,  dur: () => 2300 },
        peek:       { src: 'move',   movable: true,  canHop: false, priority: 80,  dur: () => 0 },
        celebrate:  { src: 'move',   movable: true,  canHop: true,  priority: 90,  route: true,  dur: () => 12000 },
        fun:  { mode: 'idle',       src: 'fun', pose: 1800, poseReturn: 'move', priority: 20, dur: () => 1900 },
        look: { mode: 'lookaround', src: 'fun', priority: 20, dur: () => 2200 + rnd(2000) }
    };

    // ===== 触发仲裁参数 =====
    // MIN_DWELL：模式最小驻留时间——刚进入的模式不被同级触发瞬间顶掉，避免视觉抖动；
    // 但优先级差距 ≥ HARD_GAP 时仍允许硬打断（如 celebrate 打断 idle）
    const MIN_DWELL = 800;
    const HARD_GAP = 40;
    // REACTIVE_COOLDOWN：同一模式的反应式触发冷却，防止连续消息导致动作刷屏
    const REACTIVE_COOLDOWN = 2500;

    // ===== 工厂：注入页面依赖，返回绑定后的状态机内核 =====
    // deps: {
    //   state,        // 页面状态对象（pmState / st），需含 mode/modeUntil/hopT/poseUntil/poseReturn/y
    //   src,          // 素材表 PM_SRC
    //   setSrc,       // 换素材函数（处理帧动画 / 尺寸）
    //   startWalk,    // 选路并开始行走
    //   groundY,      // () => 地面 Y 坐标
    //   celebrate,    // 可选：庆祝动作
    //   getEmotion,   // 可选：() => 当前情绪（默认返回 '默认'）
    //   walkHop,      // 可选：行走时随机蹦跳概率（默认按情绪：正向 0.5，否则 0）
    //   modes         // 可选：覆盖 / 扩展默认模式表
    // }
    function createCore(deps) {
        const modes = Object.assign({}, DEFAULT_MODES, deps.modes || {});
        const state = deps.state;
        const getEmotion = deps.getEmotion || function () { return '默认'; };
        const lastRequest = {};   // requestMode 的逐模式冷却表

        function enterMode(key, now) {
            const def = modes[key];
            if (!def) return;
            now = now || performance.now();
            state.enteredAt = now;                                  // 记录进入时刻，供最小驻留判定
            if (def.ground && state.y <= deps.groundY() - 60) return;   // 需贴地但在空中：放弃
            if (def.route) {                                        // walk / celebrate 需要选路
                if (key === 'celebrate' && deps.celebrate) { deps.celebrate(); }
                else {
                    deps.startWalk(now);
                    const hopChance = (deps.walkHop !== undefined) ? deps.walkHop : (isPositive(getEmotion()) ? 0.5 : 0);
                    if (hopChance > 0 && Math.random() < hopChance) state.hopT = 0;
                }
                return;
            }
            state.mode = def.mode || key;
            state.modeUntil = now + (def.dur ? def.dur() : 0);
            if (!def.canHop) state.hopT = -1;
            if (def.pose) {
                state.poseUntil = now + def.pose;
                state.poseReturn = deps.src[def.poseReturn || 'move'];
            }
            deps.setSrc(deps.src[def.src]);
        }

        function canInterrupt(key, now) {
            now = now || performance.now();
            const cur = modes[state.mode] || { priority: 0 };
            const nxt = modes[key] || { priority: 0 };
            if (nxt.priority < cur.priority) return false;
            // 最小驻留：模式刚开始时同级触发不打断；优先级差距足够大才硬打断
            const dwell = now - (state.enteredAt || 0);
            if (dwell < MIN_DWELL && nxt.priority - cur.priority < HARD_GAP) return false;
            return true;
        }
        function tryInterrupt(key, now) {
            if (!canInterrupt(key, now)) return false;
            enterMode(key, now || performance.now());
            return true;
        }
        // ===== 反应式触发入口（事件驱动）：带逐模式冷却 + 驻留仲裁 =====
        // 供情绪回调等外部事件使用；冷却期内或无法打断时静默拒绝，返回 false
        function requestMode(key, now) {
            now = now || performance.now();
            if (now - (lastRequest[key] || -1e9) < REACTIVE_COOLDOWN) return false;
            if (!tryInterrupt(key, now)) return false;
            lastRequest[key] = now;
            return true;
        }
        function modeDef(key) { return modes[key] || {}; }

        return {
            modes: modes,
            enterMode: enterMode,
            canInterrupt: canInterrupt,
            tryInterrupt: tryInterrupt,
            requestMode: requestMode,
            modeDef: modeDef
        };
    }

    // ===== 台词分段：全站唯一实现 =====
    // 收口前存在三套并行逻辑：diary.js 的死函数 splitSpeak（按逗号切、上限 42）、
    // diary.js 的 splitIntoMessages 与流式循环内的内联判断（只认句末标点、上限 45）、
    // write-madeline.js 的内联拷贝。三套阈值/切分字符不一致，长句会漏切。
    // 注意：后端 DiaryServiceImpl.nextSentenceCut 不在此列——它只负责把模型输出切成 SSE delta
    // （传输层分块 + 句级安全闸门），不下发任何“分段边界”；前端会把 delta 拼回完整文本后按本规则重新切。
    // 统一规则（整段回退与流式打字共用）：
    //   1) 软上限 45 字：遇句末标点（。！？!?…换行，含英文句点）收尾；
    //   2) 分句兜底 60 字：一直没句末标点时，遇逗号/分号/冒号/顿号收尾；
    //   3) 硬上限 72 字：什么标点都没有也强制切，避免整段挤在一个气泡里。
    // 长度按 UTF-16 单元计（emoji 占 2，与旧实现一致）；硬切时避开代理对，不把 emoji 劈成两半。
    const SEG_SOFT_MAX = 45;
    const SEG_CLAUSE_MAX = 60;
    const SEG_HARD_MAX = 72;
    const SEG_SENTENCE_END = /[。！？!?…\n.]/;
    const SEG_CLAUSE_END = /[，,；;：:、]/;
    /** 段边界空白：空格/制表/换行/CRLF 等，归属前一段段尾 */
    const SEG_WS_CHAR = /\s/;

    /** 码点长度：emoji / 代理对按 1 计（与不变式测试的段长口径一致） */
    function speechLength(str) {
        const s = String(str == null ? '' : str);
        let n = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                const d = s.charCodeAt(i + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) i++;
            }
            n++;
        }
        return n;
    }

    /** 当前段（seg 已含刚打出的字）是否该收尾 */
    function speechShouldBreak(seg) {
        const n = seg.length;
        if (!n) return false;
        const code = seg.charCodeAt(n - 1);
        if (n >= SEG_HARD_MAX) return !(code >= 0xD800 && code <= 0xDBFF);  // 高代理结尾：等 emoji 补全
        if (n >= SEG_SOFT_MAX && SEG_SENTENCE_END.test(seg.charAt(n - 1))) return true;
        if (n >= SEG_CLAUSE_MAX && SEG_CLAUSE_END.test(seg.charAt(n - 1))) return true;
        return false;
    }

    /** 整段台词 → 气泡数组；切口与流式打字完全一致 */
    function segmentSpeech(text) {
        const src = String(text == null ? '' : text);
        // 整段回复的两条例外：第一块不留前导空白，最后一块不留尾随空白
        let start = 0;
        while (start < src.length && SEG_WS_CHAR.test(src.charAt(start))) start++;
        let end = src.length;
        while (end > start && SEG_WS_CHAR.test(src.charAt(end - 1))) end--;
        if (start >= end) return [src];      // 空串 / 全空白：保持旧行为

        const out = [];
        let displayStart = start;   // 本段实际输出的起点（已跳过前导空白）
        let logicalStart = start;   // 判定切点用的起点：上一刀之后（含段间空白），与改前口径一致
        let i = start;
        while (i < end) {
            // 按码点推进：整段切分不会把 emoji 拆成半字
            const ch = String.fromCodePoint(src.codePointAt(i));
            const next = i + ch.length;
            if (speechShouldBreak(src.slice(logicalStart, next))) {
                // 边界空白归属：切点之后的空白/换行/CRLF 默认并进本段段尾；
                // 但硬上限优先——并入后本段超过 72 码点就不并，这段空白留在下一段段首。
                let j = next;
                let cp = speechLength(src.slice(displayStart, next));   // 本段已含触发切点的字符
                while (j < end && SEG_WS_CHAR.test(src.charAt(j))) {
                    if (cp + 1 > SEG_HARD_MAX) break;
                    cp++;
                    j++;
                }
                out.push(src.slice(displayStart, j));
                displayStart = j;
                logicalStart = next;   // 下一段长度仍从切点之后算，保证切点与改前一致
                i = j;
            } else {
                i = next;
            }
        }
        if (displayStart < end) out.push(src.slice(displayStart, end));
        return out.length ? out : [src];
    }

    global.MadelineCore = {
        EMOTION_GROUP: EMOTION_GROUP,
        isPositive: isPositive,
        isGloomy: isGloomy,
        isNight: isNight,
        rnd: rnd,
        weightedPick: weightedPick,
        DEFAULT_MODES: DEFAULT_MODES,
        createCore: createCore,
        SEG_SOFT_MAX: SEG_SOFT_MAX,
        SEG_CLAUSE_MAX: SEG_CLAUSE_MAX,
        SEG_HARD_MAX: SEG_HARD_MAX,
        speechLength: speechLength,
        speechShouldBreak: speechShouldBreak,
        segmentSpeech: segmentSpeech
    };
})(typeof window !== 'undefined' ? window : this);
