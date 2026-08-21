(function () {
    'use strict';

    const AVATAR = 'celeste-portraits/madeline/normal00.png';
    const USER_AVATAR = 'celeste-gui/user-avatar.png';
    const PM_BASE_SIZE = 56;

    const pmCal = {};
    let pmCur = '';
    let pmMinFrac = 0;
    const pm = document.getElementById('wpPixelMadeline');
    const dialog = document.getElementById('wpGameDialog');
    const dialogPortrait = document.getElementById('wpGameDialogPortraitImg');
    const dialogText = document.getElementById('wpGameDialogText');

    const chatDialog = document.getElementById('madeline-chat-dialog');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatAvatar = document.getElementById('chatAvatar');

    const snowCanvas = document.getElementById('snowCanvas');
    const snowCtx = snowCanvas.getContext('2d');
    let snowflakes = [];
    let snowAnimFrame = null;

    const PM_SRC = {
        move: 'celeste-gui/madeline-move.gif',
        fun: 'celeste-gui/madeline-fun.gif',
        sit: 'celeste-gui/madeline-sitdown.gif',
        sleep: 'celeste-gui/madeline-sleep.gif',
        wake: 'celeste-gui/madeline-wakeup.gif',
        fall: 'celeste-gui/madeline-fun.gif'
    };

    const st = {
        x: 0, y: 0, dir: 1,
        mode: 'walk', modeUntil: 0,
        tx: null, ty: null,
        hopT: -1, wasHopping: false,
        poseUntil: 0, poseReturn: '',
        nextMurmur: 0
    };

    let chatOpen = false;
    let panel = null, panelMessages = null, panelInput = null;
    let reviewBtn = null, sendBtn = null;

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ===================== 雪花 =====================
    function resizeSnow() { snowCanvas.width = window.innerWidth; snowCanvas.height = window.innerHeight; }
    function mkFlake() {
        return { x: Math.random() * snowCanvas.width, y: -10, r: Math.random() * 3 + 1,
            speed: Math.random() * 1.5 + 0.5, wind: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.6 + 0.2, swing: Math.random() * Math.PI * 2,
            swingSpeed: Math.random() * 0.02 + 0.01 };
    }
    function initSnow() {
        snowflakes = [];
        for (let i = 0; i < 80; i++) { const f = mkFlake(); f.y = Math.random() * snowCanvas.height; snowflakes.push(f); }
    }
    function drawSnow() {
        snowCtx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
        for (const f of snowflakes) {
            f.y += f.speed; f.swing += f.swingSpeed;
            f.x += Math.sin(f.swing) * 0.5 + f.wind;
            if (f.y > snowCanvas.height + 10) { f.y = -10; f.x = Math.random() * snowCanvas.width; }
            if (f.x > snowCanvas.width + 10) f.x = -10;
            if (f.x < -10) f.x = snowCanvas.width + 10;
            snowCtx.beginPath();
            snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            snowCtx.fillStyle = 'rgba(255,255,255,' + f.opacity + ')';
            snowCtx.fill();
        }
        snowAnimFrame = requestAnimationFrame(drawSnow);
    }
    function startSnow() { resizeSnow(); initSnow(); drawSnow(); }
    window.addEventListener('resize', resizeSnow);

    // ===================== 行为树 =====================
    function pmGroundY() { return window.innerHeight - pm.offsetHeight - 8; }
    function pmSetSrc(name) {
        if (pm.src.indexOf(name) === -1) pm.src = name;
        pmCur = name; pmApplySize(); pmCalibrate(name);
    }
    function pmCalibrate(src) {
        if (pmCal[src] !== undefined) return;
        const im = new Image();
        im.onload = () => {
            const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(im, 0, 0);
            let data;
            try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch (e) { return; }
            let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
            for (let y = 0; y < c.height; y++) {
                for (let x = 0; x < c.width; x++) {
                    if (data[(y * c.width + x) * 4 + 3] > 20) {
                        if (x < minX) minX = x; if (x > maxX) maxX = x;
                        if (y < minY) minY = y; if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0) return;
            pmCal[src] = Math.max((maxX - minX + 1) / c.width, (maxY - minY + 1) / c.height);
            const allDone = Object.values(PM_SRC).every(s => pmCal[s] !== undefined);
            if (allDone) { pmMinFrac = Math.min(...Object.values(pmCal)); pmApplySize(); }
        };
        im.src = src;
    }
    function pmApplySize() {
        const cur = pmCal[pmCur];
        let s = 1;
        if (pmMinFrac && cur) s = Math.min(2.5, pmMinFrac / cur);
        pm.style.width = Math.round(PM_BASE_SIZE * s) + 'px';
        pm.style.height = Math.round(PM_BASE_SIZE * s) + 'px';
    }

    const blockedZones = [];
    function blockedAt(tx, ty) {
        for (const z of blockedZones) {
            const r = z.getBoundingClientRect();
            const m = z.margin || 14;
            if (!r || (r.width === 0 && r.height === 0)) continue;
            if (tx < r.right + m && tx + pm.offsetWidth > r.left - m &&
                ty < r.bottom + m && ty + pm.offsetHeight > r.top - m) return true;
        }
        return false;
    }
    function pmPickTarget() {
        const gy = pmGroundY(), maxX = window.innerWidth - pm.offsetWidth - 8;
        for (let i = 0; i < 12; i++) {
            const c = { x: 8 + Math.random() * (maxX - 16), y: 60 + Math.random() * (gy - 68) };
            if (!blockedAt(c.x, c.y)) return c;
        }
        return { x: 8 + Math.random() * (maxX - 16), y: gy };
    }
    function pmDetour(now) {
        const aboveY = Math.max(60, 200 - pm.offsetHeight - 18);
        const belowY = Math.min(pmGroundY(), 500 + 18);
        st.ty = (st.y - aboveY < belowY - st.y) ? aboveY : belowY;
        if (!blockedAt(st.x, st.ty)) return;
        pmStartWalk(now);
    }
    function pmStartWalk(now) {
        st.mode = 'walk';
        const t = pmPickTarget();
        st.tx = t.x; st.ty = t.y;
        st.modeUntil = now + 7000 + Math.random() * 5000;
        pmSetSrc(PM_SRC.move);
    }
    function pmNextMode(now) {
        const nearGround = st.y > pmGroundY() - 60;
        const hour = new Date().getHours();
        const night = hour >= 23 || hour < 6;
        const sitP = night ? 0.38 : 0.18, funP = 0.14, walkP = 0.48;
        const r = Math.random();
        if (r < sitP && nearGround) {
            st.mode = 'sit'; st.modeUntil = now + 6000 + Math.random() * 10000; pmSetSrc(PM_SRC.sit);
        } else if (r < sitP + funP) {
            st.mode = 'idle'; st.modeUntil = now + 1900;
            st.poseUntil = now + 1800; st.poseReturn = PM_SRC.move; pmSetSrc(PM_SRC.fun);
        } else if (r < sitP + funP + walkP) {
            pmStartWalk(now); if (Math.random() < 0.4) st.hopT = 0;
        } else {
            st.mode = 'idle'; st.modeUntil = now + 1200 + Math.random() * 2000; pmSetSrc(PM_SRC.move);
        }
    }
    function pmThink(now) {
        if (st.mode === 'peek') return;
        if (st.mode === 'sleep') {
            if (!st.nextMurmur) st.nextMurmur = now + 12000 + Math.random() * 15000;
            if (now >= st.nextMurmur) {
                st.nextMurmur = now + 18000 + Math.random() * 22000;
                const dl = ['\u55f7\u2026\u2026\u518d\u7761\u4e94\u5206\u949f\u2026\u2026',
                    '\uff08\u68a6\u8bdd\uff09\u96ea\u2026\u2026\u522b\u505c\u2026\u2026',
                    '\u55ef\u2026\u2026\u5c71\u9876\u2026\u2026\u5feb\u5230\u4e86\u2026\u2026',
                    '\u2026\u2026\u522b\u5173\u706f\u2026\u2026'];
                addM(dl[Math.floor(Math.random() * dl.length)], '\u9ed8\u8ba4');
            }
        }
        if (now >= st.modeUntil) {
            if (st.mode === 'sit') {
                const hour = new Date().getHours();
                if (Math.random() < ((hour >= 23 || hour < 6) ? 0.6 : 0.3)) {
                    st.mode = 'sleep'; st.modeUntil = now + 20000 + Math.random() * 25000; pmSetSrc(PM_SRC.sleep);
                } else pmStartWalk(now);
            } else if (st.mode === 'sleep') {
                st.mode = 'wake'; st.modeUntil = now + 2300; pmSetSrc(PM_SRC.wake);
            } else if (st.mode === 'wake') {
                st.mode = 'idle'; st.modeUntil = 0; pmNextMode(now);
            } else pmNextMode(now);
        }
    }

    let pmLast = performance.now();
    function pmLoop(now) {
        const dt = Math.min(0.05, (now - pmLast) / 1000);
        pmLast = now;
        if (st.poseUntil > 0 && now >= st.poseUntil) {
            st.poseUntil = 0; pmSetSrc(st.poseReturn || PM_SRC.move);
        }
        const posing = st.poseUntil > 0;
        pmThink(now);
        const speed = 85;
        const movable = !posing && (st.mode === 'walk' || st.mode === 'peek');
        if (movable && st.tx !== null) {
            const dx = st.tx - st.x, dy = st.ty - st.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                if (dx > 0.5) st.dir = 1; else if (dx < -0.5) st.dir = -1;
                let nx = st.x + (dx / dist) * speed * dt;
                let ny = st.y + (dy / dist) * speed * dt;
                if (blockedAt(nx, ny)) {
                    if (!blockedAt(nx, st.y)) ny = st.y;
                    else if (!blockedAt(st.x, ny)) nx = st.x;
                    else { pmDetour(now); nx = st.x; ny = st.y; }
                }
                st.x = nx; st.y = ny;
            } else if (st.mode === 'walk') {
                st.mode = 'idle'; st.modeUntil = now + 600 + Math.random() * 1200;
            }
        }
        st.x = Math.max(4, Math.min(st.x, window.innerWidth - pm.offsetWidth - 4));
        st.y = Math.max(60, Math.min(st.y, pmGroundY()));
        if (blockedAt(st.x, st.y)) pmStartWalk(now);

        let hopOffset = 0;
        if (st.hopT >= 0 && st.mode === 'walk' && !posing) {
            st.hopT += dt;
            if (st.hopT >= 0.5) {
                st.hopT = -1;
                if (st.wasHopping) { st.poseUntil = now + 650; st.poseReturn = PM_SRC.move; pmSetSrc(PM_SRC.fall); }
            } else hopOffset = Math.sin((st.hopT / 0.5) * Math.PI) * 26;
        }
        st.wasHopping = (st.hopT >= 0 && st.mode === 'walk' && !posing);
        if (hopOffset > 0) pmSetSrc(PM_SRC.move);
        pm.style.transform = 'translate(' + st.x + 'px,' + (st.y - hopOffset) + 'px)' + (st.dir < 0 ? ' scaleX(-1)' : '');
        requestAnimationFrame(pmLoop);
    }

    // ===================== 游戏对话框 =====================
    function openDialog(emotion) {
        dialogPortrait.src = AVATAR;
        dialog.classList.toggle('portrait-right', (st.x + pm.offsetWidth / 2) > window.innerWidth / 2);
        dialog.classList.add('show');
    }
    let dialogHideTimer = null;
    function scheduleDialogHide() {
        clearTimeout(dialogHideTimer);
        dialogHideTimer = setTimeout(() => dialog.classList.remove('show'), 6000);
    }
    dialog.addEventListener('click', () => { clearTimeout(dialogHideTimer); dialog.classList.remove('show'); });

    // ===================== 音效 =====================
    const VOICE_DIRS = {
        '\u9ed8\u8ba4': 'determined', '\u4e0d\u5b89': 'upset', '\u60ca\u8bb6': 'surprised',
        '\u6027\u6068': 'angry', '\u4e0d\u5f00\u5fc3': Math.random() < 0.5 ? 'sad' : 'sadder',
        '\u53ef\u7231': 'determined', '\u65e0\u8bed': 'deadpan', '\u5192\u6ce1': 'distracted'
    };
    const VOICE_VARIANTS = ['mid_A', 'mid_B', 'mid_C', 'per'];
    const blipAudio = new Audio();
    function playSpeak(emotion) {
        if (!window.__audioGestured) return;
        let voice = VOICE_DIRS[emotion] || VOICE_DIRS['\u5192\u6ce1'];
        if (emotion === '\u4e0d\u5f00\u5fc3') voice = Math.random() < 0.5 ? 'sad' : 'sadder';
        const variant = VOICE_VARIANTS[Math.floor(Math.random() * VOICE_VARIANTS.length)];
        const num = String(Math.floor(Math.random() * 10) + 1).padStart(2, '0');
        const src = 'celeste-sounds/' + voice + '/' + variant + '/' + voice + '_' + variant + '_' + num + '.wav';
        try { blipAudio.src = src; blipAudio.volume = 0.8; blipAudio.playbackRate = 0.94 + Math.random() * 0.12; blipAudio.currentTime = 0; blipAudio.play().catch(() => {}); } catch (e) {}
    }
    ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { window.__audioGestured = true; }, { once: true }));

    // ===================== 消息系统（游戏对话框 + 聊天历史） =====================
    let msgQueue = Promise.resolve();
    function addM(text, emotion) {
        msgQueue = msgQueue.then(() => doAddM(text, emotion)).catch(() => {});
    }
    function newChatRow(emotion) {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.alignItems = 'flex-start';
        row.className = 'msg-row madeline-row';
        const avWrap = document.createElement('div');
        avWrap.className = 'msg-avatar-wrap';
        const avImg = document.createElement('img');
        avImg.src = AVATAR;
        avWrap.appendChild(avImg);
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        row.appendChild(avWrap); row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }
    function addUserChatRow(text) {
        const row = document.createElement('div');
        row.className = 'msg-row user-row';
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = text;
        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function doAddM(text, emotion) {
        text = String(text || '').replace(/[（(][^（）()]*[）)]/g, '').trim();
        if (!text) return;
        const parts = String(text).split(/(?<=[。！？!?…\n])/).map(s => s.trim()).filter(Boolean);
        const msgs = [];
        let buf = '';
        for (const p of parts) { buf += p; if (buf.length >= 45) { msgs.push(buf); buf = ''; } }
        if (buf) msgs.push(buf);
        if (!msgs.length) return;

        const useGD = !chatOpen;
        if (useGD) { clearTimeout(dialogHideTimer); openDialog(emotion); }

        for (const msg of msgs) {
            if (useGD) {
                dialogText.textContent = '';
                let sc = 0;
                for (const ch of msg) {
                    dialogText.textContent += ch;
                    if (!/[\s。！？!?…，,、；;：:（）()*]/.test(ch)) { sc++; if (sc % 3 === 1) playSpeak(emotion); }
                    await sleep(45 + Math.random() * 20);
                }
                if (msgs.length > 1) await sleep(1000 + Math.random() * 600);
            } else {
                const histBubble = newChatRow(emotion);
                histBubble.textContent = '';
                let sc = 0;
                for (const ch of msg) {
                    histBubble.textContent += ch;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    if (!/[\s。！？!?…，,、；;：:（）()*]/.test(ch)) { sc++; if (sc % 3 === 1) playSpeak(emotion); }
                    await sleep(45 + Math.random() * 20);
                }
                if (msgs.length > 1) await sleep(240 + Math.random() * 200);
            }
        }
        if (useGD) scheduleDialogHide();
    }

    // ===================== 聊天对话框交互 =====================
    function toggleChat(force) {
        chatOpen = (force === undefined) ? !chatOpen : force;
        chatDialog.classList.toggle('show', chatOpen);
    }
    closeChatBtn.addEventListener('click', () => toggleChat(false));

    async function sendChatMsg() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        addUserChatRow(text);
        try {
            const res = await api('/chat', 'POST', { content: text });
            if (res.success && res.data) {
                addM(res.data.content || '...', '\u9ed8\u8ba4');
            } else {
                addM('\u545c...\u6ca1\u6536\u5230\u56de\u590d\uff0c\u518d\u8bd5\u4e00\u6b21\uff1f', '\u9ed8\u8ba4');
            }
        } catch (e) {
            addM('\u7f51\u7edc\u597d\u50cf\u6709\u70b9\u95ee\u9898...\u7b49\u4e0b\u518d\u8bd5\u8bd5\uff1f', '\u9ed8\u8ba4');
        }
    }
    chatSendBtn.addEventListener('click', sendChatMsg);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMsg(); });

    // ===================== 像素 Madeline 点击（与 diary 一致：单击摸摸走游戏对话框，双击开关历史框） =====================
    const petLines = ['\u563f\u563f\u2026\u518d\u6478\u4e00\u4e0b\u4e5f\u53ef\u4ee5\u54e6\u3002',
        '\u5514\uff0c\u5934\u53d1\u8981\u88ab\u4f60\u6478\u4e71\u5566\u3002',
        '\u8c22\u8c22\u4f60\uff0c\u4eca\u5929\u4e5f\u8f9b\u82e6\u4e86\u3002',
        '\u55ef\uff01\u611f\u89c9\u53c8\u5145\u4e0a\u7535\u4e86\u3002',
        '\u5199\u5f97\u597d\u68d2\uff0c\u7ee7\u7eed\u52a0\u6cb9\uff01'];
    const dreamLines = ['\u55f7\u2026\u2026\u518d\u7761\u4e94\u5206\u949f\u2026\u2026',
        '\uff08\u68a6\u8bdd\uff09\u96ea\u2026\u2026\u522b\u505c\u2026\u2026',
        '\u55ef\u2026\u2026\u5c71\u9876\u2026\u2026\u5feb\u5230\u4e86\u2026\u2026',
        '\uff08\u7ffb\u8eab\uff09\u2026\u2026\u8349\u8393\u2026\u2026',
        '\u2026\u2026\u522b\u5173\u706f\u2026\u2026'];
    function pmPet() {
        if (st.mode === 'sleep') {
            addM(dreamLines[Math.floor(Math.random() * dreamLines.length)], '\u9ed8\u8ba4');
            return;
        }
        addM(petLines[Math.floor(Math.random() * petLines.length)], '\u53ef\u7231');
        st.poseUntil = performance.now() + 1300;
        st.poseReturn = PM_SRC.move;
        pmSetSrc(PM_SRC.fun);
    }
    let pmClickTimer = null;
    pm.addEventListener('click', () => {
        if (pmClickTimer) return;
        pmClickTimer = setTimeout(() => { pmClickTimer = null; pmPet(); }, 260);
    });
    pm.addEventListener('dblclick', () => {
        if (pmClickTimer) { clearTimeout(pmClickTimer); pmClickTimer = null; }
        toggleChat();
    });

    // ===================== 启动行为树 + 雪花 =====================
    requestAnimationFrame(pmLoop);
    startSnow();
    st.x = window.innerWidth * 0.15;
    st.y = pmGroundY();
    if (blockedAt(st.x, st.y)) {
        for (let v = 8; v <= window.innerWidth - 72; v += 24) {
            if (!blockedAt(v, pmGroundY())) { st.x = v; st.y = pmGroundY(); break; }
        }
    }
    window.addEventListener('resize', () => { st.y = Math.min(st.y, pmGroundY()); });

    // ===================== 字数里程碑 =====================
    let lastMilestone = 0;
    const milestones = { 100: '\u4e00\u767e\u5b57\u4e86\uff01\u7ee7\u7eed\u5199\uff5e', 300: '\u4e09\u767e\u5b57\uff0c\u5199\u5f97\u771f\u987a\uff01', 500: '\u534a\u5343\u5b57\u4e86\uff0c\u597d\u5389\u5bb3\uff01', 1000: '\u4e00\u5343\u5b57\uff01\uff01\u4f60\u592a\u68d2\u4e86\uff01', 2000: '\u4e24\u5343\u5b57\u2026\u2026\u8fd9\u7bc7\u6587\u7ae0\u597d\u957f\uff0c\u6211\u597d\u559c\u6b22\u8bfb\uff01', 5000: '\u4e94\u5343\u5b57\uff01\uff01\u4f60\u662f\u771f\u6b63\u7684\u4f5c\u5bb6\uff01' };
    const bodyEl = document.getElementById('articleBody');
    if (bodyEl) {
        bodyEl.addEventListener('input', () => {
            const len = bodyEl.value.length;
            for (const [threshold, line] of Object.entries(milestones).sort((a, b) => b[0] - a[0])) {
                if (len >= Number(threshold) && lastMilestone < Number(threshold)) {
                    lastMilestone = Number(threshold);
                    addM(line, '\u53ef\u7231');
                    st.hopT = 0;
                    break;
                }
            }
        });
    }

    // ===================== 审稿面板（无浮动按钮） =====================
    function buildPanel() {
        const style = document.createElement('style');
        style.textContent =
            '#mr-panel{position:fixed;right:24px;bottom:24px;width:340px;height:420px;background:#16223c;border:2px solid #ffe36d;border-radius:10px;z-index:1100;display:none;flex-direction:column;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.5);}' +
            '#mr-panel.show{display:flex;}' +
            '.mr-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:2px solid #ffe36d;background:#1c2a4a;color:#ffe36d;font-size:13px;font-family:"Courier New",monospace;}' +
            '.mr-header img{width:28px;height:28px;border-radius:50%;border:1px solid #ffe36d;}' +
            '.mr-header span{flex:1;}' +
            '#mrClose{border:none;background:transparent;color:#8899bb;font-size:16px;cursor:pointer;}' +
            '#mrClose:hover{color:#fff;}' +
            '.mr-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}' +
            '.mr-msg{padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.6;word-break:break-word;max-width:92%;white-space:pre-wrap;}' +
            '.mr-msg.m{background:#fff;color:#222;border:1px solid #ffe36d;align-self:flex-start;border-bottom-left-radius:3px;}' +
            '.mr-msg.u{background:#2e7d6b;color:#fff;align-self:flex-end;border-bottom-right-radius:3px;}' +
            '.mr-actions{padding:8px 12px 0;display:flex;gap:6px;}' +
            '.mr-actions button{flex:1;padding:8px;background:transparent;border:1px dashed #ffe36d;color:#ffe36d;border-radius:6px;cursor:pointer;font-size:12px;font-family:"Courier New",monospace;}' +
            '.mr-actions button:hover{background:rgba(255,227,109,.12);}' +
            '.mr-actions button:disabled{opacity:.5;cursor:not-allowed;}' +
            '.mr-input-row{display:flex;gap:8px;padding:10px 12px;}' +
            '.mr-input-row input{flex:1;padding:8px 10px;border:1px solid #ffe36d;border-radius:6px;background:#0f1830;color:#e8e8f0;outline:none;font-size:13px;}' +
            '#mrSend{padding:8px 14px;border:none;border-radius:6px;background:#ffe36d;color:#111;cursor:pointer;font-size:12px;font-weight:bold;}' +
            '#mrSend:disabled{background:#555;color:#999;}' +
            '#polishPreview{position:fixed;inset:0;background:rgba(5,5,20,.96);z-index:2000;display:none;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:20px;}' +
            '#polishPreview.show{display:flex;}' +
            '.pv-box{width:min(90vw,700px);max-height:50vh;overflow-y:auto;padding:16px;background:rgba(22,34,60,.95);border:2px solid #ffe36d;border-radius:8px;color:#e8e8f0;font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;font-family:"Courier New",monospace;}' +
            '.pv-label{color:#ffe36d;font-size:13px;font-family:"Courier New",monospace;align-self:flex-start;margin-bottom:4px;}' +
            '.pv-actions{display:flex;gap:12px;}' +
            '.pv-actions button{padding:10px 28px;border:2px solid #ffe36d;border-radius:6px;background:rgba(22,34,60,.9);color:#ffe36d;font-size:13px;cursor:pointer;transition:background .2s;}' +
            '.pv-actions button:hover{background:rgba(255,227,109,.2);}' +
            '.pv-actions button.pv-reject{border-color:#888;color:#aaa;}' +
            '#polishLoadingOverlay{position:fixed;right:28px;bottom:28px;z-index:2001;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;}' +
            '.polish-run-anim{width:64px;height:64px;background-size:contain;background-repeat:no-repeat;background-position:center;animation:polishRun .9s steps(1,end) infinite;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));}' +
            '@keyframes polishRun{0%{background-image:url("celeste-gui/loading/00.png")}10%{background-image:url("celeste-gui/loading/01.png")}20%{background-image:url("celeste-gui/loading/02.png")}30%{background-image:url("celeste-gui/loading/03.png")}40%{background-image:url("celeste-gui/loading/04.png")}50%{background-image:url("celeste-gui/loading/05.png")}60%{background-image:url("celeste-gui/loading/06.png")}70%{background-image:url("celeste-gui/loading/07.png")}80%{background-image:url("celeste-gui/loading/08.png")}90%{background-image:url("celeste-gui/loading/09.png")}}' +
            '.polish-loading-text{color:#ffe36d;font-size:14px;font-family:"Renogare","CelesteZH",sans-serif;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8);}' +
            '.loading-dots::after{content:"";animation:ldDots 1.5s steps(4,end) infinite;}' +
            '@keyframes ldDots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}' +
            '#wpPixelMadeline{position:fixed;left:0;top:0;width:56px;height:56px;object-fit:contain;object-position:center bottom;z-index:800;image-rendering:pixelated;cursor:pointer;user-select:none;}';

        document.head.appendChild(style);

        panel = document.createElement('div');
        panel.id = 'mr-panel';
        panel.innerHTML =
            '<div class="mr-header">' +
            '  <img src="' + AVATAR + '" alt="">' +
            '  <span>Madeline \u00b7 \u5199\u4f5c\u52a9\u624b</span>' +
            '  <button id="mrClose">\u2715</button>' +
            '</div>' +
            '<div class="mr-messages" id="mrMessages"></div>' +
            '<div class="mr-actions">' +
            '  <button id="mrReviewBtn">\u2728 \u4e00\u952e\u5ba1\u7a3f</button>' +
            '  <button id="mrPolishBtn">\ud83d\udd8a \u4e00\u952e\u6da6\u8272</button>' +
            '</div>' +
            '<div class="mr-input-row">' +
            '  <input id="mrInput" type="text" placeholder="\u4e5f\u53ef\u4ee5\u76f4\u63a5\u95ee\u6211...">' +
            '  <button id="mrSend">\u53d1\u9001</button>' +
            '</div>';

        const pvModal = document.createElement('div');
        pvModal.id = 'polishPreview';

        document.body.appendChild(panel);
        document.body.appendChild(pvModal);

        panelMessages = document.getElementById('mrMessages');
        panelInput = document.getElementById('mrInput');
        reviewBtn = document.getElementById('mrReviewBtn');
        sendBtn = document.getElementById('mrSend');

        document.getElementById('mrClose').addEventListener('click', () => { panel.classList.remove('show'); });
        document.getElementById('mrReviewBtn').addEventListener('click', window.doReview);
        document.getElementById('mrPolishBtn').addEventListener('click', window.doPolish);
        document.getElementById('mrSend').addEventListener('click', sendPanelFree);
        panelInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendPanelFree(); });
    }

    window.togglePanel = function () {
        const show = !panel.classList.contains('show');
        panel.classList.toggle('show', show);
        if (show && panelMessages.children.length === 0) {
            addPanelM('Hey! \u628a\u6587\u7ae0\u4ea4\u7ed9\u6211\u5427\uff5e\u70b9\u300c\u4e00\u952e\u5ba1\u7a3f\u300d\u6211\u5e2e\u4f60\u68c0\u67e5\uff0c\u70b9\u300c\u4e00\u952e\u6da6\u8272\u300d\u6211\u5e2e\u4f60\u6539\u5199\uff01');
        }
    };

    function addPanelM(text) {
        const d = document.createElement('div');
        d.className = 'mr-msg m'; d.textContent = text;
        panelMessages.appendChild(d);
        panelMessages.scrollTop = panelMessages.scrollHeight;
    }
    function addPanelU(text) {
        const d = document.createElement('div');
        d.className = 'mr-msg u'; d.textContent = text;
        panelMessages.appendChild(d);
        panelMessages.scrollTop = panelMessages.scrollHeight;
    }

    async function sendPanelChat(text) {
        reviewBtn.disabled = true; sendBtn.disabled = true;
        const pending = document.createElement('div');
        pending.className = 'mr-msg m'; pending.textContent = '\u6b63\u5728\u8ba4\u771f\u9605\u8bfb...';
        panelMessages.appendChild(pending);
        panelMessages.scrollTop = panelMessages.scrollHeight;
        try {
            const res = await api('/chat', 'POST', { content: text });
            pending.remove();
            if (res.success && res.data && res.data.content) addPanelM(res.data.content);
            else addPanelM('\u545c...\u6ca1\u6536\u5230\u56de\u590d\uff0c\u53ef\u80fd\u662f\u7f51\u7edc\u95ee\u9898\uff0c\u518d\u8bd5\u4e00\u6b21\uff1f');
        } catch (e) {
            pending.remove();
            addPanelM('\u7f51\u7edc\u597d\u50cf\u6709\u70b9\u95ee\u9898...\u7b49\u4e0b\u518d\u8bd5\u8bd5\uff1f');
        }
        reviewBtn.disabled = false; sendBtn.disabled = false;
    }

    function sendPanelFree() {
        const text = panelInput.value.trim();
        if (!text) return;
        panelInput.value = '';
        addPanelU(text);
        sendPanelChat(text);
    }

    window.doReview = function () {
        const title = document.getElementById('articleTitle').value.trim();
        const body = document.getElementById('articleBody').value.trim();
        if (!title && !body) { if (typeof showToast === 'function') showToast('\u5148\u5199\u70b9\u5185\u5bb9\u518d\u8ba9\u6211\u5ba1\u7a3f', 'error'); return; }
        panel.classList.add('show');
        const short = body.length > 1500 ? body.slice(0, 1500) + '...(\u5df2\u622a\u65ad)' : body;
        const prompt = '\u8bf7\u4ee5\u5199\u4f5c\u52a9\u624b\u7684\u8eab\u4efd\u5ba1\u7a3f\u4e0b\u9762\u8fd9\u7bc7\u6587\u7ae0\uff1a1) \u6307\u51fa\u9519\u522b\u5b57\u3001\u6807\u70b9\u548c\u8bed\u6cd5\u95ee\u9898\uff1b2) \u8bc4\u4ef7\u53ef\u8bfb\u6027\u4e0e\u7ed3\u6784\uff1b3) \u7ed9\u51fa 2-3 \u6761\u5177\u4f53\u6da6\u8272\u5efa\u8bae\u3002\u56de\u590d\u8bf7\u7b80\u6d01\u3001\u53cb\u597d\uff0c\u7528\u4e2d\u6587\u5206\u6761\u5217\u51fa\u3002\n\n\u6807\u9898\uff1a' + title + '\n\n\u6b63\u6587\uff1a\n' + short;
        addPanelU('\u3010\u4e00\u952e\u5ba1\u7a3f\u3011\u300a' + (title || '\u65e0\u6807\u9898') + '\u300b');
        sendPanelChat(prompt);
    };

    window.doPolish = async function () {
        const bodyEl2 = document.getElementById('articleBody');
        const body = bodyEl2 ? bodyEl2.value.trim() : '';
        if (!body) { if (typeof showToast === 'function') showToast('Write something first!', 'error'); return; }
        reviewBtn.disabled = true;
        document.getElementById('mrPolishBtn').disabled = true;
        sendBtn.disabled = true;

        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'polishLoadingOverlay';
        loadingDiv.innerHTML = '<div class="polish-run-anim"></div><div class="polish-loading-text">Polishing<span class="loading-dots"></span></div>';
        document.body.appendChild(loadingDiv);

        const prompt = '\u8bf7\u6da6\u8272\u5e76\u6539\u8fdb\u4ee5\u4e0b\u6587\u7ae0\u5185\u5bb9\u3002\u8981\u6c42\uff1a1) \u4fee\u6b63\u9519\u522b\u5b57\u548c\u8bed\u6cd5\u9519\u8bef\uff1b2) \u6539\u5584\u53e5\u5b50\u7ed3\u6784\u548c\u8868\u8fbe\uff1b3) \u63d0\u5347\u6587\u7ae0\u6d41\u7545\u5ea6\u548c\u53ef\u8bfb\u6027\uff1b4) \u4fdd\u6301\u539f\u6587\u7684\u6838\u5fc3\u610f\u601d\u548c\u98ce\u683c\u4e0d\u53d8\u3002\u8bf7\u76f4\u63a5\u8fd4\u56de\u6da6\u8272\u540e\u7684\u5b8c\u6574\u6587\u7ae0\u6b63\u6587\uff0c\u4e0d\u8981\u52a0\u4efb\u4f55\u89e3\u91ca\u3001\u6807\u9898\u6216\u524d\u7f00\u3002\n\n' + body;
        try {
            const res = await api('/chat', 'POST', { content: prompt });
            const ld = document.getElementById('polishLoadingOverlay');
            if (ld) ld.remove();
            if (res.success && res.data && res.data.content) showPolishPreview(body, res.data.content);
            else if (typeof showToast === 'function') showToast('Polish failed, please try again', 'error');
        } catch (e) {
            const ld = document.getElementById('polishLoadingOverlay');
            if (ld) ld.remove();
            if (typeof showToast === 'function') showToast('Network issue, try again later', 'error');
        }
        reviewBtn.disabled = false;
        document.getElementById('mrPolishBtn').disabled = false;
        sendBtn.disabled = false;
    };

    function showPolishPreview(original, polished) {
        const modal = document.getElementById('polishPreview');
        modal.innerHTML =
            '<div class="pv-label">\ud83d\udcdd \u539f\u6587</div>' +
            '<div class="pv-box" id="pvOriginal"></div>' +
            '<div class="pv-label">\u2728 \u6da6\u8272\u540e</div>' +
            '<div class="pv-box" id="pvPolished"></div>' +
            '<div class="pv-actions">' +
            '  <button id="pvAccept">\u2705 \u91c7\u7528\u6da6\u8272</button>' +
            '  <button id="pvReject" class="pv-reject">\u274c \u4fdd\u7559\u539f\u6587</button>' +
            '</div>';
        document.getElementById('pvOriginal').textContent = original;
        document.getElementById('pvPolished').textContent = polished;
        modal.classList.add('show');
        document.getElementById('pvAccept').addEventListener('click', () => {
            document.getElementById('articleBody').value = polished;
            if (typeof updateCount === 'function') updateCount();
            modal.classList.remove('show');
            if (typeof showToast === 'function') showToast('Polished!', 'success');
        });
        document.getElementById('pvReject').addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildPanel);
    } else {
        buildPanel();
    }
})();