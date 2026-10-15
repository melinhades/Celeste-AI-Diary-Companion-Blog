    initHeader();

    // ===== 实时聊天（SSE 订阅 + POST 发送，历史/消息均存服务端内存） =====
    // 消息流/状态/面板切换交 Vue；SSE、EmojiAnim 帧引擎、FeltPiano 保持原生
    (function () {
        const { createApp, ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

        const EMOJI_PACKS = {
            mad: { dir: 'madeline', names: ['normal', 'peaceful', 'determined', 'distracted', 'panic', 'sad', 'sadder', 'surprised', 'angry', 'deadpan', 'upset', 'together'] },
            bade: { dir: 'ghost', names: ['normal', 'angry', 'angryAlt', 'concerned', 'freakA', 'freakB', 'freakC', 'sad', 'scoff', 'serious', 'sigh', 'upset', 'worried', 'worriedAlt', 'yell'] },
            granny: { dir: 'granny', names: ['normal', 'creepA', 'creepB', 'laugh', 'mock'] },
            theo: { dir: 'theo', names: ['normal', 'excited', 'nailedit', 'serious', 'thinking', 'worried', 'wtf', 'yolo'] },
            oshiro: { dir: 'oshiro', names: ['normal', 'nervous', 'serious', 'sidehappy', 'sideworried', 'sidesuspicious', 'drama', 'lostcontrol', 'worried'] }
        };
        // ===== 表情包帧动画引擎：循环播放同一情绪的所有帧，做成动图 =====
        // 帧数与 roundtable-portraits.js 一致（已按实际目录冻结）；
        // 连续帧用数字 N（00..N-1），断号帧（如 granny creepA/B）用数组显式列出
        const EMOJI_FRAMES = {
            madeline: { angry:7, deadpan:9, determined:11, distracted:10, normal:7, panic:5, peaceful:4, sad:7, sadder:7, surprised:7, together:7, upset:7 },
            ghost:    { angry:7, angryAlt:7, concerned:7, freakA:11, freakB:19, freakC:18, normal:7, sad:5, scoff:14, serious:30, sigh:14, upset:7, worried:7, worriedAlt:7, yell:7 },
            granny:   { normal:15, laugh:4, mock:6, creepA:[0,4,5,6,7,8], creepB:[0,4,5,6,7,8] },
            theo:     { normal:10, excited:7, nailedit:4, serious:7, thinking:7, worried:7, wtf:7, yolo:4 },
            oshiro:   { normal:13, nervous:8, worried:8, serious:8, sidehappy:8, sidesuspicious:8, sideworried:9, drama:6, lostcontrol:6 }
        };
        const SERIES_DIR = { mad:'madeline', bade:'ghost', granny:'granny', theo:'theo', oshiro:'oshiro' };
        const EmojiAnim = (() => {
            const FRAME_MS = 110;
            const BASE = 'Atlases/Portraits/';
            const items = new Map();            // img -> state
            const blobCache = new Map();        // src -> blobURL（切帧零网络，避免 ERR_ABORTED 闪烁）
            const loading = new Set();
            let raf = 0;
            const pad2 = n => n < 10 ? '0' + n : '' + n;
            const frameList = (dir, emo) => {
                const v = EMOJI_FRAMES[dir] && EMOJI_FRAMES[dir][emo];
                if (v == null) return null;
                return Array.isArray(v) ? v : Array.from({ length: v }, (_, i) => i);
            };
            const frameSrc = (dir, emo, idx) => BASE + dir + '/' + emo + pad2(idx) + '.png';
            const preload = src => {
                if (blobCache.has(src) || loading.has(src)) return;
                loading.add(src);
                fetch(src).then(r => r.ok ? r.blob() : Promise.reject()).then(b => {
                    blobCache.set(src, URL.createObjectURL(b));
                    loading.delete(src);
                }).catch(() => loading.delete(src));
            };
            const warm = (dir, emo) => {
                const fl = frameList(dir, emo);
                if (fl) fl.forEach(i => preload(frameSrc(dir, emo, i)));
            };
            const show = (img, st) => {
                const src = frameSrc(st.dir, st.emo, st.frames[st.idx]);
                const blob = blobCache.get(src);
                if (blob) img.src = blob;
                else preload(src);   // 未加载完保持上一帧，不切 src 避免破图
            };
            const loop = now => {
                raf = 0;
                for (const [img, st] of items) {
                    if (!img.isConnected) { items.delete(img); continue; }
                    if (now - st.last >= FRAME_MS) {
                        st.last = now;
                        st.idx = (st.idx + 1) % st.frames.length;
                        show(img, st);
                    }
                }
                if (items.size) raf = requestAnimationFrame(loop);
            };
            return {
                add(img, series, emo) {
                    const dir = SERIES_DIR[series];
                    const frames = frameList(dir, emo);
                    if (!frames) return;
                    // 同一 img 元素已被 Vue v-for 复用（key 相同的 emoji 名跨系列共享），
                    // 若 dir/emo 未变则跳过，变了则覆盖旧状态→切到正确角色的帧
                    const prev = items.get(img);
                    if (prev && prev.dir === dir && prev.emo === emo) return;
                    warm(dir, emo);
                    const st = { dir, emo, frames, idx: 0, last: performance.now() };
                    items.set(img, st);
                    show(img, st);          // 若 00 帧已缓存则立刻换 blob URL
                    if (!raf) raf = requestAnimationFrame(loop);
                },
                remove(img) { items.delete(img); }
            };
        })();

        const BIRD_ID = '__bird__';
        const BIRD_NAME = 'bird';

        function pad(n) { return String(n).padStart(2, '0'); }
        function fmtClock(ts) {
            const d = new Date(Number(ts));
            return pad(d.getHours()) + ':' + pad(d.getMinutes());
        }
        function fmtFull(ts) {
            const d = new Date(Number(ts));
            return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + fmtClock(ts);
        }
        // 时间分组标签：今天 / 昨天 / M月D日（IG 风格居中分隔）
        function fmtDivider(ts) {
            const d = new Date(Number(ts));
            const today = new Date();
            const yest = new Date(); yest.setDate(today.getDate() - 1);
            if (d.toDateString() === today.toDateString()) return '今天 ' + fmtClock(ts);
            if (d.toDateString() === yest.toDateString()) return '昨天 ' + fmtClock(ts);
            return (d.getMonth() + 1) + '月' + d.getDate() + '日';
        }
        // 字母头像：按用户 id 哈希出稳定色相（消息数据无头像字段）
        function hashHue(seed) {
            var s = String(seed), h = 0;
            for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
            return h % 360;
        }
        // 渲染消息内容：先整体转义，再把白名单内的表情标记替换为图片（防 XSS）
        function renderChatContent(text) {
            let s = escHtml(text);
            s = s.replace(/\[(mad|bade|granny|theo|oshiro):([a-zA-Z]+)\]/g, (m, series, name) => {
                const pack = EMOJI_PACKS[series];
                return (pack && pack.names.includes(name))
                    ? `<img class="chat-emoji" loading="lazy" src="Atlases/Portraits/${pack.dir}/${name}00.png" alt="${series}:${name}" data-series="${series}" data-emo="${name}" decoding="async">`
                    : m;
            });
            return s;
        }

        createApp({
            setup() {
                const token = localStorage.getItem('token');
                const loggedIn = ref(!!token);

                // ===== 左侧 rail：聊天 / notify 切换 =====
                const pane = ref('chat');
                const unread = ref(0);
                const badgeText = computed(() => unread.value > 99 ? '99+' : String(unread.value));

                // ===== 连接状态 =====
                const statusState = ref('');
                const statusText = ref('连接中…');
                function setStatus(state, text) {
                    statusState.value = state;
                    statusText.value = text;
                }

                // ===== 消息流（time 分隔 / sys 系统 / msg 消息；typing 独立钉底） =====
                const logStatus = ref('loading');   // loading | ok | empty | error
                const items = ref([]);
                const typingName = ref(null);
                let seq = 0;
                let myUserId = null;
                let myNickname = null;
                const seenIds = {};   // 简单去重（历史和实时推送可能重叠）
                let lastTs = 0, lastSender = null;   // 时间分组 + 连续消息合并
                let typingHideTimer = null;

                // 消息流为页面级滚动（不再有独立滚动容器）
                function atBottom() {
                    return innerHeight + scrollY >= document.documentElement.scrollHeight - 90;
                }
                function scrollToBottom() { scrollTo(0, document.documentElement.scrollHeight); }

                function bindEmojis() {
                    document.querySelectorAll('#chatLog img.chat-emoji, #emojiGrid img').forEach(img => {
                        EmojiAnim.add(img, img.dataset.series, img.dataset.emo);
                    });
                }

                function showTyping(name) {
                    typingName.value = name;
                    const stick = atBottom();
                    clearTimeout(typingHideTimer);
                    typingHideTimer = setTimeout(() => { typingName.value = null; }, 3000);
                    if (stick) nextTick(scrollToBottom);
                }

                function pushMsg(m) {
                    if (seenIds[m.id]) return;
                    seenIds[m.id] = true;
                    const stick = atBottom();
                    const ts = Number(m.ts) || Date.now();
                    const mine = String(m.userId) === String(myUserId);
                    const sender = mine ? '__me__' : String(m.userId);

                    // 距上一条 >10 分钟 → 插入时间分隔（同时打断连续消息合并）
                    let divided = false;
                    if (!lastTs || ts - lastTs > 10 * 60 * 1000) {
                        items.value.push({ t: 'time', key: 'd' + (++seq), label: fmtDivider(ts) });
                        divided = true;
                    }
                    const chain = !divided && lastSender === sender;
                    lastTs = ts;
                    lastSender = sender;

                    const it = {
                        t: 'msg', key: 'm' + (++seq), ik: 'ik' + seq,
                        mine, chain, isBird: false,
                        name: '', initial: '?', hue: 0,
                        title: fmtFull(ts), html: renderChatContent(m.content || '')
                    };
                    if (mine) {
                        const myName = myNickname || '我';
                        it.name = myName;
                        it.initial = (myName[0] || '?').toUpperCase();
                        it.hue = hashHue(myUserId);
                    } else {
                        const name = m.name || '匿名';
                        it.name = name;
                        it.isBird = String(m.userId) === BIRD_ID;
                        it.initial = (name[0] || '?').toUpperCase();
                        it.hue = hashHue(m.userId);
                    }
                    items.value.push(it);
                    nextTick(() => { bindEmojis(); if (stick) scrollToBottom(); });
                }

                function pushSys(text) {
                    const stick = atBottom();
                    items.value.push({ t: 'sys', key: 's' + (++seq), text });
                    if (stick) nextTick(scrollToBottom);
                }

                /* ===== birdAI：群聊吉祥物小鸟 =====
                   触发：对每条新消息做确定性哈希（消息 id），全端一致判定"回不回"，
                   约 30% 概率、2~6 秒延迟冒泡 —— 不定时、不必回；
                   回复：调后端裸 AI（/chat/generate-article，不写聊天历史），
                   提示词按 QQ 群 AI 助手风格写；失败回落本地语料。
                   bird 的消息只本地渲染（不广播），userId 固定 __bird__。 */
                let lastBirdAt = 0;
                function birdHash(s) {
                    s = String(s); let h = 5381;
                    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
                    return h;
                }
                const BIRD_FALLBACK = [
                    '啾？有人在叫我吗',
                    '说得好，赏你一颗草莓 🍓',
                    '本鸟已阅，继续继续',
                    '爬山累了就歇会儿，群我盯着',
                    '啾啾，这个我熟！',
                    '在？看看风景（扇翅）'
                ];
                const BIRD_PROMPT =
                    '你是 Celeste 登山群聊的吉祥物小鸟"bird"，一只会打字的北美金翅雀，兼任群 AI 助手（类似 QQ 群机器人）。' +
                    '性格：活泼嘴碎、热心肠、偶尔懒洋洋，喜欢在句子里偶尔带"啾"。\n' +
                    '规则：像群友一样自然接话，一两句短口语；可以鼓励、吐槽、玩梗、给登山上的人文关怀；' +
                    '禁止长篇大论、禁止说教、禁止自称 AI 或语言模型；不超过 50 字。\n' +
                    '群友「%NAME%」说：「%MSG%」\n你的接话：';
                function maybeBird(m) {
                    if (!m || !m.content) return;
                    if (String(m.userId) === BIRD_ID || m.name === BIRD_NAME) return;   // 不理自己
                    const h = birdHash(m.id || (m.content + m.ts));
                    // @bird（或句子里直呼 bird）→ 必定接话，无视概率与冷却
                    const called = /(^|[^a-z])@?bird([^a-z]|$)/i.test(String(m.content));
                    if (!called && h % 100 >= 30) return;                               // 平时 30% 触发
                    const now = Date.now();
                    if (!called && now - lastBirdAt < 45000) return;                    // 普通触发冷却 45s
                    lastBirdAt = now;
                    const delay = called ? (800 + h % 2200) : (2000 + (h % 4000));      // @ 时更快：0.8~3s
                    setTimeout(() => birdReply(m), delay);
                }
                function birdSay(text) {
                    pushMsg({
                        id: 'bird' + Date.now(), userId: BIRD_ID, name: BIRD_NAME,
                        content: text, ts: Date.now()
                    });
                }
                function birdReply(m) {
                    const prompt = BIRD_PROMPT
                        .replace('%NAME%', m.name || '群友')
                        .replace('%MSG%', String(m.content).slice(0, 200));
                    api('/chat/generate-article', 'POST', { content: prompt }).then(res => {
                        if (res.success && res.data && res.data.content) {
                            let t = String(res.data.content).trim().replace(/\s+/g, ' ');
                            if (t.length > 60) t = t.slice(0, 60) + '…';
                            birdSay(t);
                        } else {
                            birdSay(BIRD_FALLBACK[birdHash(m.content) % BIRD_FALLBACK.length]);
                        }
                    }).catch(() => {
                        birdSay(BIRD_FALLBACK[birdHash(m.content) % BIRD_FALLBACK.length]);
                    });
                }

                // ===== 输入区 =====
                const draft = ref('');
                const sending = ref(false);
                let lastTypeReport = 0;
                function doSend() {
                    const content = draft.value.trim();
                    if (!content || sending.value) return;
                    FeltPiano.send();
                    sending.value = true;
                    // 自己发的消息不本地插入，等服务端广播回来（保证单一口径 + 多标签页同步）
                    api('/realtime-chat/send', 'POST', { content }).then(res => {
                        if (!res.success) pushSys('发送失败：' + (res.msg || '未知错误'));
                        draft.value = '';
                    }).catch(() => {
                        pushSys('发送失败，网络异常');
                    }).finally(() => {
                        sending.value = false;
                        const inp = document.getElementById('chatInput');
                        if (inp) inp.focus();
                    });
                }
                // 毛毡钢琴打字音效：Enter 发送 → 播 send 音
                function onInputKey(e) {
                    if (e.key === 'Enter') { e.preventDefault(); doSend(); }
                }
                // 输入中上报：防抖 2s 一次，有内容才发
                function onTypeInput() {
                    const now = Date.now();
                    if (draft.value.trim() && now - lastTypeReport > 2000) {
                        lastTypeReport = now;
                        api('/realtime-chat/typing', 'POST');
                    }
                }

                // ===== 表情包面板（五系列） =====
                const emojiOpen = ref(false);
                const emojiSeries = ref('mad');
                const seriesList = [
                    { key: 'mad', label: 'Madeline' },
                    { key: 'bade', label: 'Badeline' },
                    { key: 'granny', label: 'Granny' },
                    { key: 'theo', label: 'Theo' },
                    { key: 'oshiro', label: 'Oshiro' }
                ];
                const currentEmojis = computed(() => {
                    const pack = EMOJI_PACKS[emojiSeries.value];
                    return pack.names.map(n => ({
                        n,
                        mark: '[' + emojiSeries.value + ':' + n + ']',
                        src: 'Atlases/Portraits/' + pack.dir + '/' + n + '00.png'
                    }));
                });
                watch(currentEmojis, () => nextTick(bindEmojis));
                function insertEmoji(mark) {
                    const inp = document.getElementById('chatInput');
                    if (!inp) return;
                    const start = typeof inp.selectionStart === 'number' ? inp.selectionStart : inp.value.length;
                    const end = typeof inp.selectionEnd === 'number' ? inp.selectionEnd : inp.value.length;
                    inp.setRangeText(mark, start, end, 'end');
                    inp.dispatchEvent(new Event('input'));   // 同步 v-model
                    inp.focus();
                }
                function onDocClick(e) {
                    if (!e.target.closest('.emoji-wrap')) emojiOpen.value = false;
                }

                // ===== SSE 订阅（EventSource 无法加 Header，token 走 query） =====
                let es = null;
                function connect() {
                    setStatus('', '连接中…');
                    es = new EventSource(BASE_URL + '/realtime-chat/stream?token=' + encodeURIComponent(token));
                    es.addEventListener('chat', e => {
                        try {
                            const m = JSON.parse(e.data);
                            pushMsg(m);
                            maybeBird(m);
                        } catch (err) {}
                    });
                    es.addEventListener('typing', e => {
                        try {
                            const p = JSON.parse(e.data);
                            if (String(p.userId) !== String(myUserId)) showTyping(p.name || '有人');
                        } catch (err) {}
                    });
                    es.addEventListener('presence', e => {
                        try {
                            const p = JSON.parse(e.data);
                            setStatus('online', '在线 ' + p.online + ' 人');
                        } catch (err) { setStatus('online', '已连接'); }
                    });
                    es.onopen = () => setStatus('online', '已连接');
                    es.onerror = () => {
                        // EventSource 浏览器内置自动重连，这里只更新状态
                        setStatus('offline', '连接断开，重连中…');
                    };
                }

                // ===== 通知列表（点赞/评论你的文章） =====
                const TYPE_TEXT = { like: '赞了你的文章', comment: '评论了你的文章' };
                const notifStatus = ref('loading');   // loading | ok | empty | error
                const notifItems = ref([]);
                function fmtNotifTime(ts) {
                    const d = new Date(Number(ts)), t = new Date();
                    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                    if (d.toDateString() === t.toDateString()) return hm;
                    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
                }
                function loadNotify() {
                    notifStatus.value = 'loading';
                    api('/notifications/list', 'GET').then(res => {
                        if (res.success && Array.isArray(res.data)) {
                            notifItems.value = res.data.map((n, i) => {
                                const name = n.fromName || '有人';
                                return {
                                    key: 'n' + i,
                                    id: n.articleId || '',
                                    name,
                                    initial: (name[0] || '?').toUpperCase(),
                                    hue: hashHue(name),
                                    act: TYPE_TEXT[n.type] || '互动了你的文章',
                                    title: n.articleTitle || '',
                                    tm: fmtNotifTime(n.createDate),
                                    unread: Number(n.isRead) === 0
                                };
                            });
                            notifStatus.value = notifItems.value.length ? 'ok' : 'empty';
                        } else {
                            notifStatus.value = 'error';
                        }
                    });
                    // 打开即全部已读，同步清掉头部铃铛徽标
                    api('/notifications/readAll', 'POST').then(() => {
                        unread.value = 0;
                        if (typeof refreshBell === 'function') refreshBell();
                    });
                }
                function openArticle(id) {
                    if (id) location.href = 'article.html?id=' + encodeURIComponent(id);
                }
                watch(pane, v => { if (v === 'notify') loadNotify(); });

                // 未读数统一由 auth.js 轮询（refreshBell），这里只监听广播，不重复请求
                function onNotifyUnread(e) {
                    const n = Number(e.detail.unread || 0);
                    unread.value = n;
                    // 正停留在 notify 面板时来了新通知 → 刷新列表
                    if (n > 0 && pane.value === 'notify') loadNotify();
                }
                function onBeforeUnload() { if (es) es.close(); }

                onMounted(() => {
                    if (!loggedIn.value) return;
                    // 当前用户 id + 昵称（区分自己/他人气泡，渲染自己的头像与名字）
                    api('/users/currentUser', 'GET').then(res => {
                        if (res.success && res.data) {
                            myUserId = res.data.id;
                            myNickname = res.data.nickname || res.data.account || '我';
                        }
                    });
                    // 历史消息（早 -> 晚）
                    api('/realtime-chat/history', 'GET').then(res => {
                        if (res.success && Array.isArray(res.data)) {
                            items.value = [];
                            seq = 0;
                            lastTs = 0; lastSender = null;
                            if (res.data.length === 0) {
                                logStatus.value = 'empty';
                            } else {
                                res.data.forEach(pushMsg);
                                logStatus.value = 'ok';
                                scrollToBottom();
                            }
                            nextTick(bindEmojis);
                        } else {
                            logStatus.value = 'error';
                        }
                    });
                    connect();
                    nextTick(() => {
                        const inp = document.getElementById('chatInput');
                        if (inp) FeltPiano.bind(inp, { enterSend: true });
                        bindEmojis();
                    });
                    document.addEventListener('click', onDocClick);
                    window.addEventListener('notify:unread', onNotifyUnread);
                    window.addEventListener('beforeunload', onBeforeUnload);
                });
                onUnmounted(() => {
                    if (es) es.close();
                    clearTimeout(typingHideTimer);
                    document.removeEventListener('click', onDocClick);
                    window.removeEventListener('notify:unread', onNotifyUnread);
                    window.removeEventListener('beforeunload', onBeforeUnload);
                });

                return {
                    loggedIn, pane, unread, badgeText,
                    statusState, statusText,
                    logStatus, items, typingName,
                    draft, sending, doSend, onInputKey, onTypeInput,
                    emojiOpen, emojiSeries, seriesList, currentEmojis, insertEmoji,
                    notifStatus, notifItems, openArticle
                };
            }
        }).mount('#chatContainer');
    })();

    // ===== 雪花（与首页同款，精简） =====
    (function () {
        const cv = document.getElementById('snowCanvas');
        const c = cv.getContext('2d');
        function resize() { cv.width = innerWidth; cv.height = innerHeight; }
        resize(); addEventListener('resize', resize);
        const fs = [];
        for (let i = 0; i < 70; i++) fs.push({
            x: Math.random() * innerWidth, y: Math.random() * innerHeight,
            r: Math.random() * 3 + 1, sp: Math.random() * 1.5 + 0.5,
            w: Math.random() * 0.5 - 0.25, o: Math.random() * 0.6 + 0.2,
            sw: Math.random() * Math.PI * 2, sws: Math.random() * 0.02 + 0.01
        });
        (function loop() {
            c.clearRect(0, 0, cv.width, cv.height);
            for (const f of fs) {
                f.y += f.sp; f.sw += f.sws;
                f.x += Math.sin(f.sw) * 0.5 + f.w;
                if (f.y > cv.height + 10) { f.y = -10; f.x = Math.random() * cv.width; }
                if (f.x > cv.width + 10) f.x = -10;
                if (f.x < -10) f.x = cv.width + 10;
                c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                c.fillStyle = 'rgba(255,255,255,' + f.o + ')'; c.fill();
            }
            requestAnimationFrame(loop);
        })();
    })();
