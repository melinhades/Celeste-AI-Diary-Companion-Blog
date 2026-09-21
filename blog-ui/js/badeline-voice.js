/* ===== Badeline 说话音效工具类（供 AI 聊天接口调用） =====
   方案对齐 diary 页 Madeline 说话声（js/diary.js VOICE 系统），风格保持一致：
   - 情绪 map：以 badeline-sounds/ 目录下各文件夹名为准（10 个循环组 + sad_solo 特殊组）
   - 播放规则：pre + abcabc 循环 —— 每句第一声 per（前置音效），随后 mid_A/B/C 轮转，
     每声在对应组内随机取 01-10 号音频
   - 节奏：逐字 45+20ms、每 3 字一声（由 shelf.html 演出层驱动），语速/音量随情绪微调
     （VOICE_RATE / VOICE_VOL 档位参考 diary 页 Madeline 的 VOICE_RATE / VOICE_VOL）
   - sad_solo：单文件特殊音效，仅 AI 情绪分析判定为特殊伤心（sad / 低落）时触发
   暴露 window.BadelineVoice：
   - play(emo)      播一声（emo = AI 情绪标记 / 立绘标签 / 中文情绪词）
   - resetSeq()     每句开头重置 pre+abc 序列
   - normalize(raw) AI 返回的情绪标记归一化（英文标记或中文情绪词 → 15 种立绘标签）
   - infer(text)    本地情绪分析兜底（AI 未给标记时按台词关键词推断，对齐 diary inferSentenceEmotion 思路） */
(function () {
    var BASE = 'badeline-sounds/';

    // 1) 情绪map —— badeline-sounds/ 下各文件夹名（循环音效组）
    var LOOP_DIRS = ['normal', 'angry', 'concerned', 'freak', 'scoff',
                     'serious', 'skeptical', 'upset', 'worried', 'yell'];
    var SOLO_DIR = 'sad_solo';    // 特殊伤心：单文件，不参与 pre+abc 循环

    // 2) AI 情绪标记（15 种立绘标签，与后端 badelineSystem 提示词词表一致）→ 音效文件夹
    var EMOTION_MAP = {
        normal: 'normal', angry: 'angry', angryAlt: 'angry', yell: 'yell',
        worried: 'worried', worriedAlt: 'worried', upset: 'upset',
        concerned: 'concerned', serious: 'serious', scoff: 'scoff',
        sigh: 'skeptical',                       /* sigh 无独立文件夹 → skeptical（最接近叹气） */
        freakA: 'freak', freakB: 'freak', freakC: 'freak',
        sad: SOLO_DIR                            /* 特殊伤心 → sad_solo 单文件 */
    };

    // 3) 中文情绪词 → 标记（AI 情绪分析结果归一化用，与 BL_EMO_ZH 对齐）
    var ZH_ALIAS = {
        '平静': 'normal', '低落': 'sad', '恼火': 'angry', '强压怒火': 'angryAlt',
        '喊叫': 'yell', '不安': 'worried', '强装镇定': 'worriedAlt', '委屈': 'upset',
        '关切': 'concerned', '叹息': 'sigh', '认真': 'serious', '嘲弄': 'scoff',
        '崩溃边缘': 'freakA', '风暴': 'freakB', '失控': 'freakC',
        '伤心': 'sad', '难过': 'sad'
    };

    // 4) 节奏参数：playbackRate 随情绪微调（参考 diary 页 VOICE_RATE 档位风格）
    var VOICE_RATE = {
        normal: [0.92, 1.04], angry: [0.95, 1.08], angryAlt: [0.93, 1.05], yell: [1.0, 1.14],
        worried: [0.88, 1.0], worriedAlt: [0.86, 0.98], upset: [0.85, 0.96],
        concerned: [0.9, 1.02], serious: [0.92, 1.04], scoff: [0.9, 1.06],
        sigh: [0.82, 0.92], freakA: [0.95, 1.1], freakB: [0.96, 1.12], freakC: [0.98, 1.14],
        sad: [0.8, 0.92]
    };
    var VOICE_VOL = {    /* 音量随情绪档位（参考 diary 页 VOICE_VOL 档位风格） */
        normal: 0.7, angry: 0.8, angryAlt: 0.75, yell: 0.85,
        worried: 0.65, worriedAlt: 0.6, upset: 0.6,
        concerned: 0.7, serious: 0.72, scoff: 0.75,
        sigh: 0.55, freakA: 0.82, freakB: 0.85, freakC: 0.88,
        sad: 0.5
    };

    var ABC = ['mid_A', 'mid_B', 'mid_C'];
    var seq = 0;                       // 句子级序列：per→A→B→C→A→B→C…（blDoSpeak 每句 resetSeq）
    var blip = new Audio();            // 循环 blip 共用一声道（新声打断旧声，对齐 Madeline）
    var solo = new Audio();            // sad_solo 独立声道，页面加载即预载，保证特殊触发即时
    solo.preload = 'auto';
    solo.src = BASE + SOLO_DIR + '/' + SOLO_DIR + '.wav';

    // 首次交互解锁音频（对齐 write-madeline.js；shelf 页此前无人设置该标记，音效永远不响）
    ['pointerdown', 'keydown'].forEach(function (ev) {
        window.addEventListener(ev, function () { window.__audioGestured = true; }, { once: true });
    });

    function resetSeq() { seq = 0; }

    // AI 情绪分析结果归一化：英文标记 / 中文情绪词 → 15 种立绘标签；无法识别返回 null
    function normalize(raw) {
        var s = String(raw || '').trim();
        if (!s) return null;
        var k = s.toLowerCase();
        if (EMOTION_MAP[k]) return k;
        return ZH_ALIAS[s] || null;
    }

    // 本地情绪分析兜底（AI 未给标记时）：按台词关键词推断标记
    function infer(t) {
        t = String(t || '');
        if (/！！|！{2,}|\?！|？！/.test(t) && t.length <= 26) return 'yell';
        if (/亲爱的|宝贝|真可爱|当然了|是吧\s*[？?]?\s*$/.test(t)) return 'scoff';
        if (/行吧|你赢了|随便你|无所谓/.test(t)) return 'upset';
        if (/(……[\s\S]*){2,}/.test(t) || (/^……/.test(t) && t.length <= 14)) return 'sigh';
        if (/别怕|没事的|有我在|活下来了|应得/.test(t)) return 'concerned';
        if (/对不起|抱歉|冲你发火/.test(t)) return 'worried';
        if (/早说了|跟每次一样|想太多|别回放/.test(t)) return 'angry';
        if (/干得不错|别得意|别飘/.test(t)) return 'serious';
        return 'normal';
    }

    // 播一声
    function play(emo) {
        try {
            if (!window.__audioGestured) return;
            var dir = EMOTION_MAP[emo] || 'normal';
            if (dir === SOLO_DIR) {
                /* sad_solo：仅 AI 检测到特殊伤心时触发，单文件直达，不参与循环 */
                solo.volume = (VOICE_VOL.sad || 0.5) + (Math.random() - 0.5) * 0.08;
                solo.playbackRate = VOICE_RATE.sad[0] + Math.random() * (VOICE_RATE.sad[1] - VOICE_RATE.sad[0]);
                try { solo.currentTime = 0; } catch (e) {}
                solo.play().catch(function () {});
                return;
            }
            /* pre + abcabc 循环：第 1 声 per（前置），之后 mid_A/B/C 轮转，各随机取 01-10 */
            var variant = (seq === 0) ? 'per' : ABC[(seq - 1) % 3];
            var num = String(Math.floor(Math.random() * 10) + 1).padStart(2, '0');
            seq++;
            var src = BASE + dir + '/' + variant + '/' + dir + '_' + variant + '_' + num + '.wav';
            var r = VOICE_RATE[emo] || VOICE_RATE.normal;
            blip.src = src;
            blip.playbackRate = r[0] + Math.random() * (r[1] - r[0]);
            blip.volume = (VOICE_VOL[emo] || 0.7) + (Math.random() - 0.5) * 0.08;
            blip.currentTime = 0;
            blip.play().catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    window.BadelineVoice = {
        play: play,
        resetSeq: resetSeq,
        normalize: normalize,
        infer: infer,
        EMOTION_MAP: EMOTION_MAP,
        LOOP_DIRS: LOOP_DIRS
    };
})();
