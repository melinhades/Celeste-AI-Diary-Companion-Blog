/* ============================================================
 * MadelineMood —— 玛德琳「句内情绪切换」工具类
 *
 * 作用：让她在同一段话里，随着语气变化动态切换【表情帧】和【语气音色】。
 * 切换由 AI 自行判断，在回复文本中插入内联舞台指示，例如：
 *
 *   [emotion:不安] 嗯……你今天好像一直在撑着。[m:可爱]不过你肯写下来，
 *   就已经比昨天勇敢一点了。[m:默认]我在这儿陪你。
 *
 * 标记永远不会显示给用户：流式到达时由本工具剥离，打字机打到切换点时
 * 才换表情和音色（先到的标记只排队，绝不提前变脸）。
 *
 * 优先级：AI 显式标记 > 页面自己的语义推断。显式标记落在哪个情绪，
 * 之后的句子就归那个情绪管，直到下一个标记；页面推断只在 [m:默认] 段生效。
 *
 * 纯 vanilla、无依赖，挂 window.MadelineMood，任何对话窗口都可复用。
 * ============================================================ */
(function () {
    'use strict';

    /** 七种合法情绪（与 AI 白名单一致） */
    const EMOTIONS = ['默认', '不安', '惊讶', '怨恨', '不开心', '可爱', '无语'];

    /** 情绪 → 立绘帧序列（Atlases/Portraits/madeline/<stem>NN.png） */
    const PORTRAITS = {
        '默认':   { stem: 'normal',    frames: 7 },
        '不安':   { stem: 'panic',     frames: 5 },
        '惊讶':   { stem: 'surprised', frames: 7 },
        '怨恨':   { stem: 'angry',     frames: 7 },
        '不开心': { stem: 'sad',       frames: 7 },
        '可爱':   { stem: 'peaceful',  frames: 4 },
        '无语':   { stem: 'deadpan',   frames: 9 }
    };

    /** 情绪 → 静态头像（00 帧，聊天气泡用） */
    const AVATARS = {
        '默认':   'celeste-portraits/madeline/normal00.png',
        '不安':   'celeste-portraits/madeline/panic00.png',
        '惊讶':   'celeste-portraits/madeline/surprised00.png',
        '怨恨':   'celeste-portraits/madeline/angry00.png',
        '不开心': 'celeste-portraits/madeline/sad00.png',
        '可爱':   'celeste-portraits/madeline/peaceful00.png',
        '无语':   'celeste-portraits/madeline/deadpan00.png'
    };

    /** 情绪 → 语音采样目录（celeste-sounds/madeline/<dir>/...） */
    const VOICE_DIRS = {
        '默认': 'determined', '不安': 'upset', '惊讶': 'surprised',
        '怨恨': 'angry', '不开心': 'sad', '可爱': 'determined', '无语': 'deadpan'
    };
    const VOICE_VARIANTS = ['mid_A', 'mid_B', 'mid_C', 'per'];
    const VOICE_RATE = {
        '默认': [0.92, 1.06], '不安': [0.88, 1.0], '惊讶': [1.0, 1.18],
        '怨恨': [0.95, 1.12], '不开心': [0.82, 0.94], '可爱': [0.96, 1.1],
        '无语': [0.85, 0.95]
    };
    const VOICE_VOL = {
        '默认': 0.75, '不安': 0.65, '惊讶': 0.85, '怨恨': 0.85,
        '不开心': 0.55, '可爱': 0.8, '无语': 0.6
    };

    /**
     * 内联情绪标记：[m:情绪]（正文用，简短省 token）；
     * [emotion:情绪] 只允许出现在首行，但正文里误写时同样认。
     * 中英文冒号都兜得住。
     */
    const MARK_RE = /\[(?:m|emotion)\s*[:：]\s*(默认|不安|惊讶|怨恨|不开心|可爱|无语)\s*\]/g;
    /**
     * 结尾疑似写了一半的标记（跨 SSE 分块时先扣住不下发），不含 ] 以区别完整标记。
     * 情绪名可能被切在任意字中间（[m:可 | 爱]），冒号后允许 0~3 个汉字半截。
     */
    const PARTIAL_RE = /\[(?:m|emotion)?\s*(?:[:：]\s*[\u4e00-\u9fa5]{0,3}\s*)?$/;
    /** 首行流式标记（服务端约定，工具类顺带提供） */
    const HEAD_RE = /^\s*\[\s*(?:emotion\s*[:：]\s*)?(默认|不安|惊讶|怨恨|不开心|可爱|无语)\s*\]\s*/;

    function isValid(emo) { return EMOTIONS.indexOf(emo) !== -1; }
    function normalize(emo) { return isValid(emo) ? emo : '默认'; }
    function avatarSrc(emo) { return AVATARS[normalize(emo)]; }

    /* ---------- 立绘帧动画（对话框大图） ---------- */
    let portraitEl = null, portraitTimer = null, portraitEmo = null, portraitFi = 0;
    function startPortrait(el, emo) {
        emo = normalize(emo);
        if (el) portraitEl = el;
        if (!portraitEl) return;
        stopPortrait();
        const cfg = PORTRAITS[emo];
        portraitEmo = emo;
        portraitFi = 0;
        const setFrame = () => {
            portraitEl.src = 'Atlases/Portraits/madeline/' + cfg.stem
                + String(portraitFi).padStart(2, '0') + '.png';
        };
        setFrame();
        if (cfg.frames > 1) {
            portraitTimer = setInterval(() => {
                portraitFi = (portraitFi + 1) % cfg.frames;
                setFrame();
            }, 120);
        }
    }
    function stopPortrait() {
        if (portraitTimer) { clearInterval(portraitTimer); portraitTimer = null; }
    }

    /* ---------- 语气音效（复刻 Celeste madeline 短促 blip） ---------- */
    let speakSeq = 0;
    const blipAudio = new Audio();
    /**
     * 按情绪播一个说话音。不开心时在 sad/sadder 两个采样池间随机，
     * 与原版 diary.js 的听感保持一致。
     */
    function blip(emo) {
        if (!window.__audioGestured) return;
        emo = normalize(emo);
        let dir = VOICE_DIRS[emo];
        if (emo === '不开心' && Math.random() < 0.5) dir = 'sadder';
        speakSeq++;
        const variant = (speakSeq % 7 === 0)
            ? 'per'
            : VOICE_VARIANTS[speakSeq % 3];
        const num = String(Math.floor(Math.random() * 10) + 1).padStart(2, '0');
        const src = 'celeste-sounds/madeline/' + dir + '/' + variant + '/'
            + dir + '_' + variant + '_' + num + '.wav';
        try {
            const a = blipAudio;
            a.src = src;
            const range = VOICE_RATE[emo];
            a.playbackRate = range[0] + Math.random() * (range[1] - range[0]);
            a.volume = (VOICE_VOL[emo] || 0.75) + (Math.random() - 0.5) * 0.1;
            a.currentTime = 0;
            a.play().catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    /* ---------- 流式标记解析器 ----------
     * 用法（一次回复 new 一个）：
     *   const feeder = MadelineMood.feeder();
     *   const { text, moods } = feeder.feed(chunk);  // 每个 SSE delta
     *   const tail = feeder.flush();                  // 流结束吐出残余
     * moods 里的 pos 是【剥离后纯文本】中的绝对字符位置，
     * 打字机打到该位置再变脸，保证表情/音色与台词严格对齐。
     */
    function feeder() {
        let hold = '';      // 结尾半截标记缓冲
        let cleanLen = 0;   // 已产出纯文本总长度
        return {
            feed(chunk) {
                let buf = hold + (chunk || '');
                hold = '';
                // 检查结尾是否藏着一个写了一半的标记
                const lastOpen = buf.lastIndexOf('[');
                let processable = buf;
                if (lastOpen !== -1) {
                    const tail = buf.slice(lastOpen);
                    if (PARTIAL_RE.test(tail)) {
                        processable = buf.slice(0, lastOpen);
                        hold = tail;
                    }
                }
                return extract(processable);
            },
            flush() {
                const rest = extract(hold).text;
                hold = '';
                return rest;
            }
        };

        function extract(seg) {
            const moods = [];
            if (!seg) return { text: '', moods: moods };
            let text = '';
            let last = 0;
            MARK_RE.lastIndex = 0;
            let m;
            while ((m = MARK_RE.exec(seg)) !== null) {
                text += seg.slice(last, m.index);
                moods.push({ pos: cleanLen + text.length, emo: m[1] });
                last = m.index + m[0].length;
            }
            text += seg.slice(last);
            cleanLen += text.length;
            return { text: text, moods: moods };
        }
    }

    /* ---------- 整段文本解析（非流式回退路径） ----------
     * 返回剥离标记的纯文本 + 切换点（按纯文本位置升序）。
     */
    function parsePlan(text) {
        const f = feeder();
        const r = f.feed(String(text || ''));
        const tail = f.flush();
        return { clean: r.text + tail, switches: r.moods };
    }

    /** 剥离一段文本里的全部情绪标记（落库/纯展示用） */
    function strip(text) {
        return String(text || '').replace(MARK_RE, '').replace(HEAD_RE, '');
    }

    window.MadelineMood = {
        EMOTIONS: EMOTIONS,
        isValid: isValid,
        normalize: normalize,
        avatarSrc: avatarSrc,
        startPortrait: startPortrait,
        stopPortrait: stopPortrait,
        blip: blip,
        feeder: feeder,
        parsePlan: parsePlan,
        strip: strip,
        HEAD_RE: HEAD_RE
    };
})();
