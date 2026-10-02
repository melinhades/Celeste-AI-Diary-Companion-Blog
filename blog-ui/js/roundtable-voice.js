/* ===== 圆桌会议说话音效统一引擎（roundtable.html 专用） =====
   对齐既有工具类的说话声方案（js/diary.js 的 Madeline VOICE、js/badeline-voice.js）：
   - 每个角色一个 blip 声道（单 Audio 复用，新声打断旧声）；新角色开口先停掉其他角色
   - 句首 per（前置音）+ mid_A/B/C 轮转，每声在 01-10 号里随机，语速/音量随情绪档位
   - 发声节拍器：SSE delta 经网络合批成涌浪到达，旧实现收到一片就同步连播，
     共享声道互掐导致一句只剩一两声；现 pushText 只记账，泵循环按 150-210ms
     节奏出声（对齐 write 页打字节奏），一声核销约 9 字、积压跳读、流停顿自动静音
   - 情绪枚举与素材文件夹 1:1 冻结，按最新一句台词推断情绪逐段切换音色
   - 特殊音效（独立声道、即时预载、一场/一句最多触发一次）：
       · Theo  yolo/yolo_solo.wav   —— 散会时他最后发言透着累
       · 奶奶  laugh/oneha/…_01-24  —— 接话对象刚说了「没切身体会的大话」或「绝境里的极端乐观」
       · 暗面 sad_solo              —— 由 BadelineVoice 自身判定
   - 主持人/用户/大崎无素材：静音。回放历史不触发任何音效（setLive(false)）。
   暴露 window.RoundtableVoice：
     setLive(flag)        本场是否实时（false 时全部静音，回放用）
     setEnabled(flag)     总开关
     start(id, respondTo) 某席位开始说话（respondTo = 他回应的上一句全文，用于 oneha 判定）
     pushText(chunk)      流式追加文本（只记账，发声由节拍器泵出）
     end()                本句结束（余量念完自动收声）
     meetingEnd(transcript) 散会钩子（Theo yolo 判定）
     stopAll()            立即静音所有声道 */
(function () {
    var MADE_BASE = 'celeste-sounds/madeline/';
    var THEO_BASE = 'theo-sounds/';
    var GRAN_BASE = 'granny-sounds/';
    var ABC = ['mid_A', 'mid_B', 'mid_C'];
    /* ===== 发声节拍器参数（节奏对齐 write 页 doAddM：3 字一声 × 55ms/字 ≈ 165ms） ===== */
    var BLIP_GAP = 150;            // 两声基准间隔 ms
    var BLIP_JITTER = 60;          // 间隔抖动，避免机械感
    var CHARS_PER_BLIP = 9;        // 一声核销的非标点字符数（吸收网络合批涌浪）
    var PENDING_CAP = 27;          // 积压上限（≈3 声），超出跳读防拖尾
    var PUMP_MS = 40;              // 泵循环 tick
    var SKIP_CHARS = /[\s。！？!?…，,、；;：:（）()·—\-「」『』""'']/;   // 不发声字符

    var live = false;
    var enabled = true;

    // 首次交互解锁音频（与 badeline-voice.js / write-madeline.js 同一约定）
    ['pointerdown', 'keydown'].forEach(function (ev) {
        window.addEventListener(ev, function () { window.__audioGestured = true; }, { once: true });
    });

    function maySound() {
        // 手势解锁双通道：pointerdown/keydown 标记 + Chrome User Activation（CDP 点击等场景兜底）
        return enabled && live &&
            (window.__audioGestured || !!(navigator.userActivation && navigator.userActivation.hasBeenActive));
    }
    function randNum(n) { return String(Math.floor(Math.random() * n) + 1).padStart(2, '0'); }
    function pickRate(r) { return r[0] + Math.random() * (r[1] - r[0]); }

    /* ============ 通用角色 blip 播放器 ============ */
    function makeChannel() {
        var blip = new Audio();
        var solo = new Audio();
        solo.preload = 'auto';
        return {
            blip: blip, solo: solo,
            play: function (src, rate, vol) {
                try {
                    var a = this.blip;
                    a.src = src;
                    a.playbackRate = rate;
                    a.volume = vol;
                    a.currentTime = 0;
                    a.play().catch(function () {});
                } catch (e) {}
            },
            playSolo: function (src, rate, vol) {
                try {
                    var a = this.solo;
                    a.src = src;
                    a.playbackRate = rate;
                    a.volume = vol;
                    try { a.currentTime = 0; } catch (e) {}
                    a.play().catch(function () {});
                } catch (e) {}
            },
            silence: function () {
                try { this.blip.pause(); this.blip.currentTime = 0; } catch (e) {}
            }
        };
    }

    /* ============ Madeline（沿用 diary 页词表与档位） ============ */
    var MADE_DIRS = ['determined', 'upset', 'surprised', 'angry', 'sad', 'sadder', 'deadpan', 'distracted'];
    var MADE_RATE = {
        determined: [0.92, 1.06], upset: [0.88, 1.0], surprised: [1.0, 1.18], angry: [0.95, 1.12],
        sad: [0.82, 0.94], sadder: [0.8, 0.9], deadpan: [0.85, 0.95], distracted: [0.9, 1.05]
    };
    var MADE_VOL = {
        determined: 0.75, upset: 0.65, surprised: 0.85, angry: 0.85,
        sad: 0.55, sadder: 0.5, deadpan: 0.6, distracted: 0.7
    };
    function inferMadeline(t) {
        if (/抱抱|哭|难过|辛苦|不容易|委屈/.test(t)) return Math.random() < 0.5 ? 'sad' : 'sadder';
        if (/唉|算了|服了|离谱|无言|无语/.test(t)) return 'deadpan';
        if (/诶|居然|竟然|没想到|真的吗|天哪|真的假的/.test(t)) return 'surprised';
        if (/深呼吸|别怕|没事|慢慢来|不着急|不安|担心/.test(t)) return 'upset';
        if (/可恶|该死|凭什么|受够|生气|烦死/.test(t)) return 'angry';
        if (/哈哈|嘿嘿|哇|太棒|真好|开心|耶|加油|一起/.test(t)) return 'distracted';
        return 'determined';
    }

    /* ============ Theo（7 情绪，文件夹即枚举） ============ */
    var THEO_DIRS = ['normal', 'excited', 'nailedit', 'serious', 'thinking', 'worried', 'wtf'];
    var THEO_RATE = {
        normal: [0.95, 1.07], excited: [1.02, 1.16], nailedit: [0.98, 1.12],
        serious: [0.9, 1.02], thinking: [0.86, 0.98], worried: [0.85, 0.97], wtf: [1.0, 1.12]
    };
    var THEO_VOL = {
        normal: 0.7, excited: 0.85, nailedit: 0.8,
        serious: 0.72, thinking: 0.62, worried: 0.6, wtf: 0.82
    };
    function inferTheo(t) {
        if (/什么鬼|搞什么|不会吧|开玩笑的吧|离谱|真的假的|你认真的|逗我|啥情况/.test(t)) return 'wtf';
        if (/担心|害怕|好怕|焦虑|紧张|压力|撑不住|扛不住|危险|不安|糟糕|糟了/.test(t)) return 'worried';
        if (/我在想|也许|可能|或许|不确定|不知道该|想想|怎么说呢|算是|琢磨/.test(t)) return 'thinking';
        if (/听着|认真|必须|重要的是|说真的|严肃|千万别/.test(t)) return 'serious';
        if (/搞定|没问题|相信|稳了|小事|包在我|可以的|别担心|轻松|放心/.test(t)) return 'nailedit';
        if (/太棒|太好了|耶|哇哦|酷|激动|期待|哈哈|冲啊|爱了|有意思|太好了吧/.test(t)) return 'excited';
        return 'normal';
    }
    // 散会疲惫信号（yolo_solo 触发用）
    var THEO_TIRED = /累|疲惫|发倦|倦了|撑不住|扛不住|够呛|受不了|精疲力|喘不过气|辛苦|不容易|想歇|歇一歇|扛了这么久|压力好大/;

    /* ============ 奶奶（normal / laugh / mock + oneha 特殊） ============ */
    var GRAN_RATE = { normal: [0.88, 1.0], laugh: [0.95, 1.1], mock: [0.9, 1.02] };
    var GRAN_VOL = { normal: 0.72, laugh: 0.8, mock: 0.72 };
    function inferGranny(t) {
        if (/哈{2,}|呵呵|好笑|有趣|逗乐|可笑|乐了|嘻嘻/.test(t)) return 'laugh';
        if (/傻孩子|天真|做梦|得了吧|就这|你确定|小家伙|站着说话|你以为|大道理|哟|哦？|真的吗|哼|别找借口|你到底想|省省吧|凭你/.test(t)) return 'mock';
        return 'normal';
    }
    // oneha 场景一：没有切身体会的大话 —— 笃定空话 / 鸡汤模板 / 站着说话，且句中无自身经历
    var EMPTY_BOAST = [
        /只要[^。！？]{0,12}就/,
        /绝对|百分之百|百分百|毫无疑问|必然|肯定(能|会|可以|没)|我保证/,
        /相信自己|梦想总是|努力就(能|会)|一切皆有可能|没什么大不了|船到桥头|阳光总在/,
        /这有什么(难|好担心)|不就是[^。！？]{0,8}嘛|很简单啊|想太多了吧/
    ];
    var HAS_EXPERIENCE = /我(曾经|当时|当年|上次|那次|也经历过|自己也|当初|以前|那时候|那会儿|亲身)/;
    // oneha 场景二：绝境里的极端乐观（Farewell「我早就已经死翘翘了」式黑色幽默）
    var ADVERSITY = /死|完蛋|破产|一无所有|绝路|谷底|活不下去|最坏|烂透|没命|没命了/;
    var GALLOWS_LIGHT = /无所谓|早就|哈哈|怕什么|不过如此|不亏|赚了|也就(这|那)?样|挺好|乐子|来都来了/;

    /* ============ Oshiro（无音效席位，仅供头像情绪推断） ============ */
    function inferOshiro(t) {
        if (/！！|！{2,}|不行！|完了|要死|受不了|崩溃|全毁了|毁了|没救了/.test(t) && t.length <= 30) return 'lostcontrol';
        if (/振作|打起精神|不能输|加油|奋斗|顾客|努力|赶紧|必须做到|撑住/.test(t)) return 'drama';
        if (/太好了|好开心|荣幸|欢迎|喜欢|真不错|棒|感激|谢谢|温暖/.test(t)) return 'sidehappy';
        if (/真的吗|怀疑|该不会|你确定|不对劲|奇怪|当真|可信吗/.test(t)) return 'sidesuspicious';
        if (/求您|拜托|对不起|抱歉|不好意思|添麻烦|紧张|不安|冒昧|打扰/.test(t)) return 'nervous';
        if (/担心|好怕|害怕|忧虑|放心不下|糟糕|糟了|压力/.test(t)) return 'worried';
        if (/认真|必须|重要|听着|说真的|严肃|务必/.test(t)) return 'serious';
        return 'normal';
    }

    // 统一入口：席位 id + 最新一句 → 该角色的情绪 key（与头像文件夹 1:1）
    function infer(speakerId, text) {
        if (speakerId === 'madeline') return inferMadeline(text);
        if (speakerId === 'theo') return inferTheo(text);
        if (speakerId === 'granny') return inferGranny(text);
        if (speakerId === 'oshiro') return inferOshiro(text);
        if (speakerId === 'badeline' && window.BadelineVoice) return window.BadelineVoice.infer(text);
        return null;
    }

    function detectOneha(prevText) {
        var t = String(prevText || '');
        if (!t) return false;
        var boast = false;
        for (var i = 0; i < EMPTY_BOAST.length; i++) {
            if (EMPTY_BOAST[i].test(t)) { boast = true; break; }
        }
        if (boast && !HAS_EXPERIENCE.test(t)) return true;
        return ADVERSITY.test(t) && GALLOWS_LIGHT.test(t);
    }

    /* ============ 声道实例 ============ */
    var chMadeline = makeChannel();
    var chTheo = makeChannel();
    chTheo.solo.src = THEO_BASE + 'yolo/yolo_solo.wav';
    var chGranny = makeChannel();
    var allChannels = [chMadeline, chTheo, chGranny];

    var cur = null;          // { id, seq, chars, dir, granSpecial }
    var grannyOnehaUsed = false;
    var theoSoloUsed = false;

    function silenceOthers(ch) {
        allChannels.forEach(function (c) { if (c !== ch) c.silence(); });
        if (window.BadelineVoice && ch !== 'badeline') { /* BadelineVoice 内部单声道，换席时停 */ }
    }

    function stopBadeline() {
        // BadelineVoice 未暴露 stop：其 blip 极短（一两百毫秒），下一声自然顶替，无需强停
    }

    // 取最新一句（标点切分），用于逐段情绪推断
    function trailingSentence(text) {
        var parts = String(text).split(/[。！？!?…\n；;]+/);
        for (var i = parts.length - 1; i >= 0; i--) {
            if (parts[i].trim()) return parts[i].slice(-40);
        }
        return text.slice(-40);
    }

    function start(speakerId, respondTo) {
        cur = null;                 // 新开口硬切：上一人的发声余量直接作废
        if (!maySound()) return;
        cur = { id: speakerId, seq: 0, pending: 0, full: '', ended: false, nextBlipAt: 0 };
        if (speakerId === 'madeline') { silenceOthers(chMadeline); chMadeline.silence(); }
        else if (speakerId === 'theo') { silenceOthers(chTheo); chTheo.silence(); }
        else if (speakerId === 'granny') {
            silenceOthers(chGranny); chGranny.silence();
            // 剧情式 oneha：开场独立放一声，本句不再重复
            grannyOnehaUsed = false;
            if (detectOneha(respondTo)) {
                var n = randNum(24);
                chGranny.playSolo(GRAN_BASE + 'laugh/oneha/laugh_oneha_' + n + '.wav',
                    pickRate([0.92, 1.05]), 0.85);
                grannyOnehaUsed = true;
            }
        }
        else if (speakerId === 'badeline') {
            silenceOthers(null);
            if (window.BadelineVoice) window.BadelineVoice.resetSeq();
        }
        else { cur = null; }   // host / user / oshiro：无素材
    }

    function playLoopBlip(base, dir, seq, rate, vol, variantFor) {
        // variantFor：'std' = per+ABC；'laugh' = first_phrase+ABC；'mock' = ABC+end
        var variant;
        if (variantFor === 'laugh') {
            if (seq === 0) {
                // 第一声用独立文件名 laugh_firstphrase.wav
                var ch = base === GRAN_BASE ? chGranny : null;
                if (ch) ch.play(base + 'laugh/first_phrase/laugh_firstphrase.wav', rate, vol);
                return;
            }
            variant = ABC[(seq - 1) % 3];
        } else if (variantFor === 'mock') {
            if (seq > 0 && (seq % 4) === 0) variant = 'end';
            else variant = ABC[seq % 3];
        } else {
            variant = (seq === 0) ? 'per' : ABC[(seq - 1) % 3];
        }
        var num = randNum(10);
        var src = base + dir + '/' + variant + '/' + dir + '_' + variant + '_' + num + '.wav';
        if (base === MADE_BASE) chMadeline.play(src, rate, vol);
        else if (base === THEO_BASE) chTheo.play(src, rate, vol);
        else if (base === GRAN_BASE) chGranny.play(src, rate, vol);
    }

    /* ===== 节拍器泵：发声与 delta 到达时机彻底解耦 =====
       pushText 只记账；泵按节奏出声。一句完整发言 = per → A → B → C 轮转（seq 在 playOne 里推进） */
    var pumpTimer = null;
    /* Madeline 最近一次情绪（playOne 更新），退出页面时写入共享存储供 sing 页读取 */
    var lastMadelineEmotion = null;
    window.addEventListener('pagehide', function () {
        if (!lastMadelineEmotion) return;
        try {
            localStorage.setItem('madeline_emotion', JSON.stringify({
                emotion: lastMadelineEmotion, source: 'roundtable', ts: Date.now()
            }));
        } catch (e) {}
    });

    function startPump() { if (!pumpTimer) pumpTimer = setInterval(pump, PUMP_MS); }
    function stopPump() { if (pumpTimer) { clearInterval(pumpTimer); pumpTimer = null; } }

    function playOne() {
        var tail = trailingSentence(cur.full || '');
        if (cur.id === 'badeline') {
            if (window.BadelineVoice) window.BadelineVoice.play(window.BadelineVoice.infer(tail));
            return;   // Badeline 的 per+ABC 序列由 BadelineVoice 内部维护
        }
        if (cur.id === 'madeline') {
            var md = inferMadeline(tail);
            lastMadelineEmotion = md;   // 供退出时写入共享情绪存储
            playLoopBlip(MADE_BASE, md, cur.seq,
                pickRate(MADE_RATE[md]), MADE_VOL[md] + (Math.random() - 0.5) * 0.08, 'std');
        } else if (cur.id === 'theo') {
            var td = inferTheo(tail);
            playLoopBlip(THEO_BASE, td, cur.seq,
                pickRate(THEO_RATE[td]), THEO_VOL[td] + (Math.random() - 0.5) * 0.08, 'std');
        } else if (cur.id === 'granny') {
            var gd = inferGranny(tail);
            var policy = gd === 'normal' ? 'std' : gd; // laugh / mock 各自的 variant 规则
            playLoopBlip(GRAN_BASE, gd, cur.seq,
                pickRate(GRAN_RATE[gd]), GRAN_VOL[gd] + (Math.random() - 0.5) * 0.08, policy);
        }
        cur.seq++;
    }

    function pump() {
        if (!cur) { stopPump(); return; }
        var now = performance.now();
        if (now < cur.nextBlipAt) return;
        if (cur.pending < 3) {
            // 流停顿自动静音；turn_end 后余量念完自动收声
            if (cur.ended) { cur = null; stopPump(); }
            return;
        }
        playOne();
        cur.pending = Math.max(0, cur.pending - CHARS_PER_BLIP);
        cur.nextBlipAt = now + BLIP_GAP + Math.random() * BLIP_JITTER;
    }

    function pushText(chunk) {
        if (!maySound() || !cur || !chunk) return;
        var s = String(chunk);
        cur.full = ((cur.full || '') + s).slice(-200);   // 供情绪推断（只保留尾部 200 字）
        var add = 0;
        for (var i = 0; i < s.length; i++) {
            if (!SKIP_CHARS.test(s.charAt(i))) add++;
        }
        cur.pending = Math.min(cur.pending + add, PENDING_CAP);   // 涌浪自动跳读
        startPump();
    }

    function end() {
        if (!cur) return;
        cur.ended = true;
        if (cur.pending < 3) { cur = null; stopPump(); }   // 尾巴不够一声，直接收
        // 否则交给泵把余量念完（ended 且 pending<3 时自动收声）
    }

    // 散会：Theo 最后一次发言透着累 → yolo_solo（整场最多一次）
    function meetingEnd(transcript) {
        if (!maySound() || theoSoloUsed) return;
        var list = transcript || [];
        for (var i = list.length - 1; i >= 0; i--) {
            var sp = list[i];
            if (sp && (sp.speaker === 'theo' || sp.speakerId === 'theo' || sp.id === 'theo')) {
                var text = sp.text || sp.content || sp.speech || '';
                if (THEO_TIRED.test(text)) {
                    chTheo.silence();
                    chTheo.playSolo(THEO_BASE + 'yolo/yolo_solo.wav', pickRate([0.92, 1.02]), 0.8);
                    theoSoloUsed = true;
                    return true;
                }
                return false;
            }
        }
    }

    function stopAll() {
        allChannels.forEach(function (c) { c.silence(); });
        cur = null;
        stopPump();
    }

    function setLive(f) {
        live = !!f;
        theoSoloUsed = false;
        if (!live) stopAll();
    }
    function setEnabled(f) {
        enabled = !!f;
        if (!enabled) stopAll();
    }

    window.RoundtableVoice = {
        setLive: setLive,
        setEnabled: setEnabled,
        start: start,
        pushText: pushText,
        end: end,
        meetingEnd: meetingEnd,
        stopAll: stopAll,
        infer: infer,
        // 暴露判定函数便于测试/调参
        _detectOneha: detectOneha,
        _inferTheo: inferTheo,
        _inferGranny: inferGranny,
        _inferMadeline: inferMadeline,
        _inferOshiro: inferOshiro
    };
})();
