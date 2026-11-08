/**
 * js/badeline-panel.js —— Badeline 聊天面板 / 游戏对话框（书架页与日记页共用）
 *
 * 从 shelf.js 原样抽出：面板壳、消息生命周期、逐字演出、流式接收、加载态、错误态、
 * 历史、逐条头像、移动端。两个页面各自 mount 一次；页面相关的动作树/立绘尺寸/离场演出
 * 一律通过 mount 参数回调交给页面，模块内部不认识任何页面 DOM。
 *
 * 契约：
 *   BadelinePanel.mount(opts) → {
 *     openChat(), closeChat(), quickTalk(text), speak(text, emo, aiLocked),
 *     say(text, emo), killDialog(), isOpen(), reset(), resumeLast()
 *   }
 *   opts:
 *     openingLines   开场白数组（缺省用书架页那四句）
 *     payload()      每次请求前现算的心光谱载荷（JSON 字符串）
 *     onOpen()       面板打开（书架页在这里放大立绘）
 *     onClose()      面板关闭后调用，返回 'summoned' / 'free'（决定页面怎么演出）
 *     onSummoned()   onClose 返回 'summoned' 时调用（书架页让她退场）
 *     onEmotion(emo) 情绪变化（书架页驱动大立绘动作）
 *     onTalkEnd()    单击 quickTalk 演出结束（书架页恢复游荡）
 *     onStreamStart(ctrl)  一轮流式开始，把 AbortController 交给页面（打断按钮用）
 *     onStreamEnd(aborted) 一轮流式收尾（aborted=true 表示是用户主动打断）
 *     historyKey     历史存储键（默认 badelineChatLog，与书架页同一份）
 */
window.BadelinePanel = (function () {

    var PORTRAIT_DIR = 'celeste-portraits/badeline/';
    var HEAD_SRC = 'celeste-player/badeline/lookingUp_f.gif';
    var TXTBOX_DIR = 'textbox/';

    // 1) 情绪分类：celeste-portraits/badeline/ 下 15 组帧序列，键 = AI 情绪标记，值 = 帧数
    var PORTRAIT_FRAMES = {
        normal: 7, sad: 5, angry: 7, angryAlt: 7, yell: 7,
        worried: 7, worriedAlt: 7, upset: 7, concerned: 7,
        sigh: 14, serious: 30, scoff: 14,
        freakA: 11, freakB: 19, freakC: 18
    };
    // 中文标签统一走共享层（js/lib/emotion-map.js）
    function emoLabel(emo) {
        return window.EmotionMap ? EmotionMap.labelFor('badeline', emo) : emo;
    }
    // 生气 / 无语类情绪 → 追加一次"从文本框爬出"演出（共用模块见 js/badeline-crawlout.js）
    var CRAWL_EMO = {
        angry: 1, angryAlt: 1, yell: 1, freakA: 1, freakB: 1, freakC: 1,
        sigh: 1, scoff: 1, upset: 1
    };
    var DEFAULT_LINES = [
        '……是你在敲镜子吗？',
        '我出来透透气，你继续写你的。',
        '别怕。我只是你没说出口的那一部分。',
        '镜子碎了也没关系，我帮你看着你自己。'
    ];

    Object.keys(PORTRAIT_FRAMES).forEach(function (e) {
        var im = new Image(); im.src = PORTRAIT_DIR + e + '00.png'; // 预热每种情绪首帧
    });

    // ===== 历史存储：与 Store 同一份 JSON / 同一个键，页面不加载 store.js 也能用 =====
    function readHist(key) {
        try {
            var v = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }
    function writeHist(key, list, max) {
        try { localStorage.setItem(key, JSON.stringify(list.slice(-max))); } catch (e) {}
    }

    // ===== DOM：书架页沿用静态结构；日记页没有时按同一份结构注入 =====
    function ensureDom() {
        if (!document.getElementById('blChat')) {
            var wrap = document.createElement('div');
            wrap.id = 'blChat';
            wrap.innerHTML =
                '<div class="bl-head">' +
                    '<img id="blHeadImg" src="' + HEAD_SRC + '" alt="">' +
                    '<div class="bl-name">BADELINE</div>' +
                    '<button class="bl-close" id="blClose" title="她先走了">✕</button>' +
                '</div>' +
                '<div id="blMsgs"></div>' +
                '<div class="bl-input">' +
                    '<input id="blInput" type="text" maxlength="200" placeholder="说什么……她都听得见">' +
                    '<button id="blSend">说</button>' +
                '</div>';
            document.body.appendChild(wrap);
        }
        if (!document.getElementById('badelineDialog')) {
            var dlg = document.createElement('div');
            dlg.id = 'badelineDialog';
            dlg.setAttribute('role', 'button');
            dlg.title = '点一下让她闭嘴';
            dlg.innerHTML =
                '<div id="badelineDialogPortrait"><img id="blDialogImg" src="' + PORTRAIT_DIR + 'normal00.png" alt="Badeline" loading="lazy" decoding="async"></div>' +
                '<div id="badelineDialogBody">' +
                    '<div id="badelineDialogName">Badeline</div>' +
                    '<div id="badelineDialogText"></div>' +
                '</div>';
            document.body.appendChild(dlg);
        }
    }

    function mount(opts) {
        opts = opts || {};
        ensureDom();

        var panel = document.getElementById('blChat');
        var msgs = document.getElementById('blMsgs');
        var input = document.getElementById('blInput');
        var sendBtn = document.getElementById('blSend');
        var dialog = document.getElementById('badelineDialog');
        var dialogImg = document.getElementById('blDialogImg');
        var dialogPortrait = document.getElementById('badelineDialogPortrait');
        var dialogText = document.getElementById('badelineDialogText');
        var headImg = document.getElementById('blHeadImg');

        var historyKey = opts.historyKey || 'badelineChatLog';
        var historyMax = opts.historyMax || 20;
        var restoreCount = opts.restoreCount || 6;
        var openingLines = (opts.openingLines && opts.openingLines.length) ? opts.openingLines : DEFAULT_LINES;

        var hist = readHist(historyKey);
        var sending = false;
        var animTimer = null, curEmo = 'normal';
        var dialogToken = 0, dialogHideTimer = null;
        var queue = Promise.resolve();
        var quickMode = false;

        function payload() {
            return opts.payload ? opts.payload() : '[]';
        }
        function persist() { writeHist(historyKey, hist, historyMax); }
        function push(role, text) {
            hist.push({ role: role, content: text });
            persist();
        }

        function inferEmotion(t) {
            return (window.BadelineVoice && BadelineVoice.infer) ? BadelineVoice.infer(t) : 'normal';
        }
        function normalizeEmotion(raw) {
            return (window.BadelineVoice && BadelineVoice.normalize) ? BadelineVoice.normalize(raw) : raw;
        }

        function addMsg(role, text, emo) {
            emo = normalizeEmotion(emo);
            var d = document.createElement('div');
            d.className = 'bl-msg ' + role;
            if (role === 'assistant') {
                // 她的每条历史消息带小头像（用现有情绪立绘首帧）；用户消息不加
                var av = document.createElement('img');
                av.className = 'bl-avatar';
                av.alt = '';
                av.setAttribute('aria-hidden', 'true');
                av.src = PORTRAIT_DIR + ((emo && PORTRAIT_FRAMES[emo]) ? emo : 'normal') + '00.png';
                d.appendChild(av);
            }
            if (role === 'assistant' && emo && PORTRAIT_FRAMES[emo]) {
                var tag = document.createElement('span');
                tag.className = 'bl-emo';
                tag.textContent = emoLabel(emo);
                d.appendChild(tag);
            }
            var body = document.createElement('span');
            body.className = 'bl-body';
            if (window.TextFx && role === 'assistant') {
                body.insertAdjacentHTML('beforeend', TextFx.render(TextFx.autoMark(text)));  // 历史气泡也带三种动画
            } else {
                body.appendChild(document.createTextNode(text));
            }
            d.appendChild(body);
            msgs.appendChild(d);
            msgs.scrollTop = msgs.scrollHeight;
            return d;
        }
        // 流式过程中情绪帧/最终情绪变化时，同步气泡头像与情绪标签
        function setMsgEmotion(el, emo) {
            if (!el || !emo || !PORTRAIT_FRAMES[emo]) return;
            var av = el.querySelector('.bl-avatar');
            if (av) av.src = PORTRAIT_DIR + emo + '00.png';
            var tag = el.querySelector('.bl-emo');
            if (PORTRAIT_FRAMES[emo]) {
                if (!tag) {
                    tag = document.createElement('span');
                    tag.className = 'bl-emo';
                    var body = el.querySelector('.bl-body');
                    if (body) el.insertBefore(tag, body); else el.appendChild(tag);
                }
                tag.textContent = emoLabel(emo);
            }
        }
        // 流式断句：返回 from 之后第一个句末位置（含标点），没有则原样返回
        function nextSentenceEnd(t, from) {
            for (var i = from; i < t.length; i++) {
                if ('。！？!?…\n'.indexOf(t.charAt(i)) >= 0) return i + 1;
            }
            return from;
        }

        // ===== 游戏对话框（官方文本框 + 立绘逐帧动画） =====
        function startPortrait(emo) {
            emo = normalizeEmotion(emo);
            if (!PORTRAIT_FRAMES[emo]) emo = 'normal';
            curEmo = emo;
            clearInterval(animTimer);
            var n = PORTRAIT_FRAMES[emo], fi = 0;
            var set = function (i) {
                var s = PORTRAIT_DIR + emo + String(i).padStart(2, '0') + '.png';
                dialogImg.src = s; headImg.src = s;
            };
            set(0);
            for (var k = 1; k < n; k++) { var im = new Image(); im.src = PORTRAIT_DIR + emo + String(k).padStart(2, '0') + '.png'; }
            animTimer = setInterval(function () { fi = (fi + 1) % n; set(fi); }, 120);
        }
        function stopPortrait() {
            clearInterval(animTimer); animTimer = null;
            var s = PORTRAIT_DIR + curEmo + '00.png';
            dialogImg.src = s; headImg.src = s;
        }
        // 文本框弹出/收起音效（复用官方 textbox in/out 音效，音量压低）
        function textboxSfx(which) {
            if (window.Sfx) Sfx.play(TXTBOX_DIR + 'ui_game_textbox_madeline_' + which + '.wav', { volume: 0.4 });
        }
        function crawlOut(wait, token) {
            if (!window.BadelineCrawlOut) return;
            setTimeout(function () {
                if (token !== dialogToken || !dialog.classList.contains('show')) return;
                window.BadelineCrawlOut.play({
                    box: dialog,
                    portrait: dialogPortrait,
                    anchor: dialogPortrait
                });
            }, wait || 0);
        }
        function dialogOpen() {
            if (!dialog.classList.contains('show')) textboxSfx('in');
            dialog.classList.add('show');
            panel.classList.add('dialog-live');
        }
        function dialogClose() {
            clearTimeout(dialogHideTimer);
            stopPortrait();
            if (dialog.classList.contains('show')) textboxSfx('out');
            dialog.classList.remove('show');
            panel.classList.remove('dialog-live');
            // 单击 quickTalk 结束 → 通知页面恢复（面板会话的关闭不走这条通知）
            if (quickMode) {
                quickMode = false;
                if (opts.onTalkEnd) opts.onTalkEnd();
            }
        }
        function killDialog() {
            dialogToken++;
            dialogClose();
        }
        dialog.addEventListener('click', function () {
            dialogToken++;      // 点一下 = 打断：正在打的字立刻停下（对齐 Madeline 的世代号机制）
            dialogClose();
        });

        function splitPages(t) {
            var parts = t.split(/(?<=[。！？!?…\n])/).map(function (s) { return s.trim(); }).filter(Boolean);
            var merged = [];
            parts.forEach(function (p) {
                var last = merged[merged.length - 1];
                if (last !== undefined && last.length < 12 && last.length + p.length <= 26) merged[merged.length - 1] = last + p;
                else merged.push(p);
            });
            var out = [];
            merged.forEach(function (s) {
                if (s.length <= 42) { out.push(s); return; }
                for (var i = 0; i < s.length; i += 42) out.push(s.slice(i, i + 42));
            });
            return out.length ? out : [t];
        }
        function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

        // ===== 演出：入队串行 → 弹框 → 立绘动画 → 逐字（每 3 字一声 blip）→ 结束定格 → 6s 自动收起 =====
        //    aiLocked=true 表示情绪来自 AI 情绪分析标记（全句锁定）；否则逐句本地推断切换音色（对齐 Madeline）
        function speak(text, emo, aiLocked) {
            queue = queue.then(function () { return doSpeak(text, emo, aiLocked); }).catch(function () {});
        }
        async function doSpeak(text, emo, aiLocked) {
            text = String(text || '').replace(/[（(][^（）()]*[）)]/g, '').trim(); // 动作旁白不上屏（对齐 Madeline）
            if (!text) return;
            emo = normalizeEmotion(emo);
            if (!PORTRAIT_FRAMES[emo]) { emo = inferEmotion(text); aiLocked = false; }
            var my = dialogToken;
            var wasOpen = dialog.classList.contains('show');
            dialogOpen();
            startPortrait(emo);
            if (CRAWL_EMO[emo]) crawlOut(wasOpen ? 130 : 330, my);   // 等框体入场后再露头
            if (opts.onEmotion) opts.onEmotion(emo);
            clearTimeout(dialogHideTimer);
            var pages = splitPages(text);
            for (var p = 0; p < pages.length; p++) {
                if (my !== dialogToken) return;
                var fpage = window.TextFx ? TextFx.autoMark(pages[p]) : pages[p];  // 无标记台词自动补三种动画
                if (window.TextFx) { TextFx.set(dialogText, ''); dialogText.classList.add('tfx-typing'); }
                else dialogText.textContent = '';
                if (window.BadelineVoice && BadelineVoice.resetSeq) BadelineVoice.resetSeq();  /* 每句重置序列 */
                var voiceEmo = emo, sentenceBuf = '', sc = 0;
                for (var ci = 0; ci < fpage.length; ci++) {
                    if (my !== dialogToken) return;
                    var ch = fpage[ci];
                    if (window.TextFx) TextFx.set(dialogText, fpage.slice(0, ci + 1));
                    else dialogText.textContent += ch;
                    /* 动画标记符 { } ~ * 不参与音色逻辑；结尾定界 ! 紧跟 } 也不是句读 */
                    var isMark = ch === '{' || ch === '}' || ch === '~' || ch === '*';
                    var isSentEnd = /[。！？!?]/.test(ch) && fpage[ci + 1] !== '}';
                    if (isSentEnd) {
                        /* 句末：AI 未锁定时按本句关键词重推断音色（立绘保持 AI 标记不变） */
                        if (!aiLocked && window.BadelineVoice) {
                            var inf = BadelineVoice.infer(sentenceBuf);
                            if (inf) voiceEmo = inf;
                        }
                        sentenceBuf = '';
                    } else if (!isMark && !/[\s，,、；;：:（）()*「」·—。！？!?…]/.test(ch)) {
                        sentenceBuf += ch;
                        sc++;
                        if (sc % 3 === 1 && window.BadelineVoice) BadelineVoice.play(voiceEmo);
                    }
                    await sleep(45 + Math.random() * 20);
                }
                if (window.TextFx) { TextFx.set(dialogText, fpage); dialogText.classList.remove('tfx-typing'); }
                if (p < pages.length - 1) await sleep(900 + Math.random() * 500);
            }
            if (my === dialogToken) {
                stopPortrait();
                dialogHideTimer = setTimeout(dialogClose, 6000);
            }
        }

        // ===== 聊天面板消息 + 流式接收 =====
        var lastMsg = '';        // 上一句：被「打断」后点「继续」用它重发
        var activeCtrl = null;   // 正在跑的那一轮，关面板时一并掐断
        function sendMsg() {
            var v = input.value.trim();
            if (!v || sending) return;
            input.value = '';
            startSend(v, true);
        }
        // isNew=false：中断后继续同一句，不重复插入 / 记录用户消息
        function startSend(v, isNew) {
            if (!v || sending) return;
            lastMsg = v;
            sending = true;
            sendBtn.disabled = true;
            // 这一轮的 AbortController 交给页面（日记页的打断/继续按钮复用 Madeline 那套）
            var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var userAborted = false;
            activeCtrl = ctrl;
            if (isNew) {
                addMsg('user', v);
                push('user', v);
            }
            if (opts.onStreamStart) opts.onStreamStart(ctrl);
            var ld = addMsg('loading', '……');
            var text = '';
            var spoken = 0;
            var msgEl = null;
            var bodyEl = null;
            var aiEmo = '';
            var finished = false;
            function dropLd() { if (ld && ld.parentNode) ld.remove(); }
            // 所有路径都先清掉等待占位，再决定补什么；占位绝不残留
            function ensureBubble() {
                if (msgEl) return;
                msgEl = addMsg('assistant', '', aiEmo || undefined);
                bodyEl = msgEl.querySelector('.bl-body');
                dropLd();                         // 第一段内容到达，撤掉等待占位
            }
            function renderText() {
                if (!bodyEl) return;
                bodyEl.textContent = text;       // 流式阶段先走纯文本，done 再上 TextFx
                msgs.scrollTop = msgs.scrollHeight;
            }
            function applyEmotion(emo) {
                if (!emo || !PORTRAIT_FRAMES[emo]) return;
                aiEmo = emo;
                if (msgEl) setMsgEmotion(msgEl, emo);
                if (opts.onEmotion) opts.onEmotion(emo);
            }
            function speakReady(force) {
                var end = force ? text.length : nextSentenceEnd(text, spoken);
                if (end <= spoken) return;
                var chunk = text.slice(spoken, end);
                spoken = end;
                if (!chunk.trim()) return;
                var emo = aiEmo || inferEmotion(chunk);
                speak(chunk, emo, !!aiEmo);     // 首句不必等全文：边收边演
            }
            function finishBubble() {
                if (!msgEl && text.trim()) ensureBubble();
                if (!msgEl || !bodyEl) return;
                if (window.TextFx) {
                    bodyEl.innerHTML = '';
                    bodyEl.insertAdjacentHTML('beforeend', TextFx.render(TextFx.autoMark(text)));
                } else {
                    bodyEl.textContent = text;
                }
                if (!aiEmo) {
                    var inf = inferEmotion(text);
                    if (inf && inf !== 'normal') setMsgEmotion(msgEl, inf);
                }
                msgs.scrollTop = msgs.scrollHeight;
            }
            // 失败保留已显示内容；没有内容才换成一句她的提示。占位在任何路径都先清掉
            function fail(line) {
                if (finished) return;
                finished = true;
                dropLd();
                if (text.trim()) {
                    finishBubble();
                    var hint = document.createElement('div');
                    hint.className = 'bl-msg loading bl-fail';
                    hint.textContent = line;
                    msgs.appendChild(hint);
                    msgs.scrollTop = msgs.scrollHeight;
                } else {
                    if (msgEl) msgEl.remove();
                    addMsg('assistant', line);     // 失败提示不写进历史，避免污染下次请求上下文
                }
            }
            // 用户主动打断：保留已显示内容，不补失败提示（对齐 Madeline 的 streamer.cancel）
            function interrupted() {
                if (finished) return;
                finished = true;
                userAborted = true;
                dropLd();
                if (text.trim()) finishBubble();
                else if (msgEl) msgEl.remove();
                killDialog();
            }
            function succeed() {
                if (finished) return;
                var m = text.trim();
                if (!m) { fail('……信号断了，听不清你说话。别愣着，再发一次。'); return; }
                finished = true;
                dropLd();
                speakReady(true);                 // 收尾补最后一段没到句末的话
                finishBubble();
                push('assistant', m);
                if (!aiEmo) {
                    var inf = inferEmotion(m);
                    if (inf && opts.onEmotion) opts.onEmotion(inf);
                }
            }

            var stream;
            try {
                if (!window.DiaryApi || !DiaryApi.badelineChatStream) throw new Error('DiaryApi 未加载');
                stream = DiaryApi.badelineChatStream(v, hist, payload(), function (ev) {
                    if (finished || !ev) return;
                    if (ev.type === 'emotion') {
                        applyEmotion(normalizeEmotion(ev.data));
                    } else if (ev.type === 'delta') {
                        if (!ev.data) return;
                        text += ev.data;
                        ensureBubble();
                        renderText();
                        speakReady(false);
                    } else if (ev.type === 'done') {
                        try {
                            var meta = JSON.parse(ev.data || '{}');
                            if (!aiEmo && meta && meta.emotion) applyEmotion(normalizeEmotion(meta.emotion));
                        } catch (e) {}
                        succeed();
                    } else if (ev.type === 'error') {
                        if (ev.data === 'abort' || (ctrl && ctrl.signal.aborted)) interrupted();
                        else fail('……喂？那边没声了。急什么，再试一次。');
                    }
                }, ctrl);
            } catch (e) {
                stream = Promise.reject(e);
            }
            Promise.resolve(stream).catch(function () {
                fail('……喂？那边没声了。急什么，再试一次。');
            }).finally(function () {
                if (!finished) {
                    if (ctrl && ctrl.signal.aborted) interrupted();   // 用户主动打断不是失败
                    else fail('……喂？那边没声了。急什么，再试一次。');  // 流意外结束也不留占位
                }
                sending = false;
                sendBtn.disabled = false;
                if (activeCtrl === ctrl) activeCtrl = null;
                if (opts.onStreamEnd) opts.onStreamEnd(userAborted, ctrl);
                if (!userAborted) input.focus();
            });
        }
        sendBtn.addEventListener('click', sendMsg);
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendMsg(); });

        function openChat() {
            if (opts.onOpen) opts.onOpen();      // 页面在这里放大立绘 / 做进入态
            if (!hist.length) {
                var line = openingLines[Math.floor(Math.random() * openingLines.length)];
                addMsg('assistant', line);
                push('assistant', line);
                speak(line);   // 开场白也走游戏对话框演出
            } else if (!msgs.children.length) {
                // 她记得上次说到哪
                hist.slice(-restoreCount).forEach(function (m) {
                    addMsg(m.role === 'assistant' ? 'assistant' : 'user', m.content);
                });
            }
            panel.classList.add('show');
            requestAnimationFrame(function () { requestAnimationFrame(function () { panel.classList.add('vis'); }); });
            setTimeout(function () { input.focus(); }, 300);
        }
        function closeChat() {
            dialogToken++;      // 她走了：作废没说完的话并收起对话框
            dialogClose();
            // 关面板是否一并掐断这一轮（默认否，书架页保持原有「后台继续收完」的行为）
            if (opts.abortOnClose && activeCtrl) { try { activeCtrl.abort(); } catch (e) {} }
            panel.classList.remove('vis');
            setTimeout(function () {
                panel.classList.remove('show');
                var mode = opts.onClose ? opts.onClose() : 'summoned';
                if (mode === 'summoned' && opts.onSummoned) opts.onSummoned();
            }, 260);
        }
        document.getElementById('blClose').addEventListener('click', closeChat);

        // 动作树单击 Badeline：只弹原作对话框，不开历史面板
        function quickTalk(text) {
            text = String(text || '').trim();
            if (!text) { if (opts.onTalkEnd) opts.onTalkEnd(); return; }
            quickMode = true;
            var emo = inferEmotion(text);
            speak(text, emo, false);
        }

        function isOpen() { return panel.classList.contains('show'); }
        // 直接收起面板与对话框，不走关闭回调（页面切场景/重置时的静默清场）
        function reset() {
            dialogToken++;
            dialogClose();
            panel.classList.remove('vis', 'show');
        }

        return {
            openChat: openChat,
            closeChat: closeChat,
            quickTalk: quickTalk,
            speak: speak,
            say: function (text, emo) { speak(text, emo || inferEmotion(text), false); },
            killDialog: killDialog,
            reset: reset,
            isOpen: isOpen,
            // 中断后「继续」：重发上一句，不重复用户消息
            resumeLast: function () { if (sending || !lastMsg) return; startSend(lastMsg, false); }
        };
    }

    return { mount: mount, frames: PORTRAIT_FRAMES };
})();
