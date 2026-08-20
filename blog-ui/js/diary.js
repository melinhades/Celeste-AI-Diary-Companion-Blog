(function() {
    // ===== Celeste 日记本 =====
    const BOOK_PAGES = [
        { src: 'celeste-journal/spread1.jpg', fields: [
                { kind: 'line', id: 'titleInput', x: .104, y: .518, w: .364, h: .144 },
                { kind: 'area', id: 'contentInput', x: .104, y: .244, w: .364, h: .230 },
                { kind: 'area', x: .527, y: .230, w: .182, h: .396 },
                { kind: 'area', x: .737, y: .230, w: .173, h: .396 } ] },
        { src: 'celeste-journal/spread2.jpg', fields: [
                { kind: 'area', x: .104, y: .244, w: .364, h: .230 },
                { kind: 'area', x: .104, y: .518, w: .364, h: .144 },
                { kind: 'line', x: .536, y: .197, w: .364, h: .036 },
                { kind: 'line', x: .536, y: .255, w: .364, h: .036 },
                { kind: 'grid', x: .536, y: .309, w: .378, h: .396, cols: 12, rows: 10 } ] },
        { src: 'celeste-journal/spread3.jpg', fields: [
                { kind: 'area', x: .104, y: .230, w: .364, h: .216 },
                { kind: 'area', x: .104, y: .482, w: .364, h: .122 },
                { kind: 'area', x: .536, y: .215, w: .373, h: .216 },
                { kind: 'cols', x: .536, y: .532, w: .373, h: .094, n: 3 } ] }
    ];
    const bookEl = document.getElementById('journalBook');
    const dotsBox = document.getElementById('bookDots');
    const pageEls = [];
    let bookCur = 0, bookBusy = false;

    BOOK_PAGES.forEach((p, pi) => {
        const el = document.createElement('div');
        el.className = 'book-page';
        const img = document.createElement('img');
        img.src = p.src;
        img.alt = '日记本第 ' + (pi + 1) + ' 页';
        el.appendChild(img);
        p.fields.forEach((f, fi) => {
            const key = 'jbook-' + pi + '-' + fi;
            const pos = node => {
                node.style.left = (f.x * 100) + '%';
                node.style.top = (f.y * 100) + '%';
                node.style.width = (f.w * 100) + '%';
                node.style.height = ((f.h || .04) * 100) + '%';
            };
            let node;
            if (f.kind === 'area' || f.kind === 'line') {
                node = document.createElement(f.kind === 'area' ? 'textarea' : 'input');
                pos(node);
                if (f.id === 'titleInput') node.placeholder = '今天的标题...';
                else if (f.id === 'contentInput') node.placeholder = '今天发生了什么...';
                else {
                    node.value = localStorage.getItem(key) || '';
                    node.addEventListener('input', () => localStorage.setItem(key, node.value));
                }
            } else if (f.kind === 'grid') {
                node = document.createElement('div');
                node.className = 'gridzone';
                pos(node);
                node.style.gridTemplateColumns = 'repeat(' + f.cols + ',1fr)';
                node.style.gridTemplateRows = 'repeat(' + f.rows + ',1fr)';
                const saved = JSON.parse(localStorage.getItem(key) || '[]');
                for (let i = 0; i < f.cols * f.rows; i++) {
                    const cell = document.createElement('i');
                    if (saved.includes(i)) cell.classList.add('on');
                    cell.addEventListener('click', () => {
                        cell.classList.toggle('on');
                        const on = [...node.children].map((c, ci) => c.classList.contains('on') ? ci : -1).filter(v => v >= 0);
                        localStorage.setItem(key, JSON.stringify(on));
                    });
                    node.appendChild(cell);
                }
            } else if (f.kind === 'cols') {
                node = document.createElement('div');
                node.style.cssText = 'position:absolute; display:flex; gap:1.5%;';
                pos(node);
                for (let i = 0; i < f.n; i++) {
                    const inp = document.createElement('input');
                    inp.style.cssText = 'flex:1; position:static; width:auto; height:100%; border:none; outline:none; background:transparent; font:inherit; color:rgba(64,58,66,.92); caret-color:#e6517c;';
                    inp.value = localStorage.getItem(key + '-' + i) || '';
                    inp.addEventListener('input', () => localStorage.setItem(key + '-' + i, inp.value));
                    node.appendChild(inp);
                }
            }
            if (f.id) node.id = f.id;
            el.appendChild(node);
        });
        if (pi > 0) el.style.display = 'none';
        bookEl.appendChild(el);
        pageEls.push(el);
        const d = document.createElement('span');
        d.addEventListener('click', () => bookGoto(pi));
        dotsBox.appendChild(d);
    });
    dotsBox.children[0].classList.add('on');

    function bookGoto(idx) {
        if (bookBusy || idx === bookCur || idx < 0 || idx >= pageEls.length) return;
        const dir = idx > bookCur ? 1 : -1;
        bookBusy = true;
        const oldEl = pageEls[bookCur], newEl = pageEls[idx];
        bookCur = idx;
        [...dotsBox.children].forEach((d, i) => d.classList.toggle('on', i === idx));
        newEl.style.display = '';
        newEl.style.position = 'absolute';
        newEl.style.top = '0'; newEl.style.left = '0'; newEl.style.width = '100%';
        newEl.style.zIndex = 2;
        newEl.style.opacity = '0';
        newEl.style.transform = dir > 0 ? 'translateX(8%) scale(.96) rotateY(-7deg)' : 'translateX(-8%) scale(.96) rotateY(7deg)';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            newEl.style.opacity = '1';
            newEl.style.transform = 'none';
            oldEl.style.opacity = '0';
            oldEl.style.transform = dir > 0 ? 'translateX(-8%) scale(.96) rotateY(7deg)' : 'translateX(8%) scale(.96) rotateY(-7deg)';
        }));
        setTimeout(() => {
            oldEl.style.display = 'none';
            oldEl.style.position = ''; oldEl.style.opacity = '';
            oldEl.style.transform = ''; oldEl.style.zIndex = '';
            newEl.style.position = ''; newEl.style.zIndex = '';
            bookBusy = false;
        }, 580);
    }

    document.getElementById('bookPrev').addEventListener('click', () => bookGoto((bookCur - 1 + pageEls.length) % pageEls.length));
    document.getElementById('bookNext').addEventListener('click', () => bookGoto((bookCur + 1) % pageEls.length));
    const avatarMap = {
        '默认': 'celeste-portraits/madeline/normal00.png',
        '不安': 'celeste-portraits/madeline/panic00.png',
        '惊讶': 'celeste-portraits/madeline/surprised00.png',
        '怨恨': 'celeste-portraits/madeline/angry00.png',
        '不开心': 'celeste-portraits/madeline/sad00.png',
        '可爱': 'celeste-portraits/madeline/peaceful00.png',
        '无语': 'celeste-portraits/madeline/deadpan00.png'
    };
    const emotionBgMap = {
        '默认': 'celeste-areas/bg_default.png',
        '平静': 'celeste-areas/bg_calm.png',
        '开心': 'celeste-areas/bg_happy.png',
        '悲伤': 'celeste-areas/bg_sad.png',
        '愤怒': 'celeste-areas/bg_angry.png',
        '惊讶': 'celeste-areas/bg_surprised.png',
        '孤独': 'celeste-areas/bg_lonely.png',
        '满足': 'celeste-areas/bg_content.png',
        '希望': 'celeste-areas/bg_hopeful.png'
    };
    // ===== v2 情绪 → 场景主题映射 =====
    const emotionSceneMap = {
        '默认': '默认',
        '不安': '孤独',
        '惊讶': '惊讶',
        '怨恨': '愤怒',
        '不开心': '悲伤',
        '可爱': '开心',
        '无语': '平静'
    };
    const sceneClassMap = {
        '默认': 'default',
        '平静': 'calm',
        '开心': 'happy',
        '悲伤': 'sad',
        '愤怒': 'angry',
        '惊讶': 'surprised',
        '孤独': 'lonely',
        '满足': 'content',
        '希望': 'hopeful'
    };

    function updateThemeByEmotion(emotion) {
        const scene = emotionSceneMap[emotion] || emotion || '默认';
        document.body.className = 'emotion-' + (sceneClassMap[scene] || 'default');
        setAvatar(emotion);
        const bgSrc = emotionBgMap[scene] || emotionBgMap['默认'];
        emotionBg.style.backgroundImage = `url('${bgSrc}')`;
        emotionBg.classList.add('show');
    }

    // ===== DOM 引用 =====
    const wrapper = document.getElementById('madeline-wrapper');
    const floatButton = document.getElementById('madeline-float-button');
    const chatDialog = document.getElementById('madeline-chat-dialog');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const quickInputBox = document.getElementById('quickInputBox');
    const quickInput = document.getElementById('quickInput');
    const emotionBg = document.getElementById('emotion-bg');
    const titleInput = document.getElementById('titleInput');
    const contentInput = document.getElementById('contentInput');
    const saveBtn = document.getElementById('saveBtn');
    const floatAvatar = document.getElementById('floatAvatar');
    const chatAvatar = document.getElementById('chatAvatar');

    let currentEmotion = '默认';
    let chatOpen = false;
    let isTyping = false;
    let companionTimer = null;

    function setAvatar(emotion) {
        const src = avatarMap[emotion] || avatarMap['默认'];
        floatAvatar.src = src;
        chatAvatar.src = src;
        currentEmotion = emotion;
        localStorage.setItem('lastEmotion', emotion);
    }

    function splitSpeak(text) {
        const parts = String(text || '').split(/(?<=[。！？!?…\n])/).map(s => s.trim()).filter(Boolean);
        const merged = [];
        for (const p of parts) {
            const last = merged[merged.length - 1];
            if (last !== undefined && last.length < 12 && last.length + p.length <= 26) merged[merged.length - 1] = last + p;
            else merged.push(p);
        }
        const out = [];
        for (const s of merged) {
            if (s.length <= 42) { out.push(s); continue; }
            let buf = '';
            for (const piece of s.split(/(?<=[，,；;：:])/)) {
                if ((buf + piece).length > 42 && buf) { out.push(buf); buf = piece; }
                else buf += piece;
            }
            if (buf) out.push(buf);
        }
        return out.length ? out : [String(text)];
    }

    function splitIntoMessages(text) {
        const parts = String(text || '').split(/(?<=[。！？!?…\n])/).map(s => s.trim()).filter(Boolean);
        const msgs = [];
        let buf = '';
        for (const p of parts) {
            buf += p;
            if (buf.length >= 45) { msgs.push(buf); buf = ''; }
        }
        if (buf) msgs.push(buf);
        return msgs.length ? msgs : [String(text)];
    }

    function newMadelineRow(emotion) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.className = 'msg-row madeline-row';
        const avWrap = document.createElement('div');
        avWrap.className = 'msg-avatar-wrap';
        const avImg = document.createElement('img');
        avImg.src = avatarMap[emotion] || avatarMap['默认'];
        avWrap.appendChild(avImg);
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        row.appendChild(avWrap);
        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }
    const gameDialog = document.getElementById('gameDialog');
    const gameDialogPortraitImg = document.getElementById('gameDialogPortraitImg');
    const gameDialogText = document.getElementById('gameDialogText');
    let gameDialogHideTimer = null;

    function openGameDialog(emotion) {
        gameDialogPortraitImg.src = avatarMap[emotion] || avatarMap['默认'];
        const pmCenter = pmState.x + pm.offsetWidth / 2;
        gameDialog.classList.toggle('portrait-right', pmCenter > window.innerWidth / 2);
        gameDialog.classList.add('show');
    }

    function scheduleGameDialogHide() {
        clearTimeout(gameDialogHideTimer);
        gameDialogHideTimer = setTimeout(() => gameDialog.classList.remove('show'), 6000);
    }
    gameDialog.addEventListener('click', () => {
        clearTimeout(gameDialogHideTimer);
        gameDialog.classList.remove('show');
    });
    let msgQueue = Promise.resolve();
    function addMadelineMessage(text, emotion) {
        msgQueue = msgQueue.then(() => doAddMadelineMessage(text, emotion)).catch(e => console.warn('说话失败:', e));
    }

    async function doAddMadelineMessage(text, emotion) {
        text = String(text || '').replace(/[（(][^（）()]*[）)]/g, '').trim();
        if (!text) return;
        if (emotion) setAvatar(emotion);
        const messages = splitIntoMessages(text);
        const useGameDialog = !chatOpen;
        if (useGameDialog) {
            clearTimeout(gameDialogHideTimer);
            openGameDialog(emotion);
        }
        for (const msg of messages) {
            const histBubble = newMadelineRow(emotion);
            histBubble.textContent = msg;
            if (useGameDialog) {
                gameDialogText.textContent = '';
                let speakCount = 0;
                for (const ch of msg) {
                    gameDialogText.textContent += ch;
                    if (!/[\s。！？!?…，,、；;：:（）()*]/.test(ch)) {
                        speakCount++;
                        if (speakCount % 3 === 1) playSpeakSound(emotion);
                    }
                    await sleep(45 + Math.random() * 20);
                }
                if (messages.length > 1) await sleep(1000 + Math.random() * 600);
            } else {
                histBubble.textContent = '';
                let speakCount = 0;
                for (const ch of msg) {
                    histBubble.textContent += ch;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    if (!/[\s。！？!?…，,、；;：:（）()*]/.test(ch)) {
                        speakCount++;
                        if (speakCount % 3 === 1) playSpeakSound(emotion);
                    }
                    await sleep(45 + Math.random() * 20);
                }
                if (messages.length > 1) await sleep(240 + Math.random() * 200);
            }
        }
        if (useGameDialog) scheduleGameDialogHide();
    }
    function addUserMessage(text) {
        const row = document.createElement('div');
        row.className = 'msg-row user-row';
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = text;
        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ===== 快速输入框发送 =====
    async function sendQuickMessage() {
        const text = quickInput.value.trim();
        if (!text) return;
        quickInput.value = '';
        addUserMessage(text);
        chatOpen = true;
        chatDialog.classList.add('show');
        quickInputBox.style.display = 'none';
        chatInput.focus();

        try {
            const res = await api('/chat', 'POST', { content: text });
            if (res.success && res.data) {
                addMadelineMessage(res.data.content || '...', '默认');
            } else {
                addMadelineMessage('Hmm... I didn\'t catch that. Say it again?', '默认');
            }
        } catch (e) {
            addMadelineMessage('Network issue... try again?', '默认');
        }
    }

    quickInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendQuickMessage(); });

    function showQuickInput(show) {
        if (show) {
            quickInputBox.style.display = 'flex';
            quickInputBox.classList.remove('bubble-active');
        } else {
            quickInputBox.classList.add('bubble-active');
        }
    }

    // ===== 聊天发送 =====
    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || isTyping) return;
        chatInput.value = '';
        addUserMessage(text);
        isTyping = true;
        chatSendBtn.disabled = true;

        try {
            const res = await api('/chat', 'POST', { content: text });
            if (res.success && res.data) {
                const reply = res.data.content || '...';
                addMadelineMessage(reply, '默认');
            } else {
                addMadelineMessage('Hmm... I didn\'t catch that. Say it again?', '默认');
            }
        } catch (e) {
            addMadelineMessage('Network issue... try again?', '默认');
        }
        isTyping = false;
        chatSendBtn.disabled = false;
    }

    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') sendChatMessage();
    });

    // ===== 聊天开关（统一入口） =====
    function toggleChat(force) {
        chatOpen = (force === undefined) ? !chatOpen : force;
        chatDialog.classList.toggle('show', chatOpen);
        if (chatOpen) {
            quickInputBox.style.display = 'none';
            chatInput.focus();
        } else {
            showQuickInput(true);
        }
    }
    closeChatBtn.addEventListener('click', () => toggleChat(false));

    // ===== 浮动按钮拖拽（点击切换 / 拖拽移动，互不干扰） =====
    let isDragging = false;
    let dragMoved = false;
    let dragStartX, dragStartY;
    let btnStartLeft, btnStartTop;
    let wrapBtnDx = 0, wrapBtnDy = 0;

    function clampBtnPos(x, y) {
        return {
            x: Math.max(4, Math.min(x, window.innerWidth - 60)),
            y: Math.max(4, Math.min(y, window.innerHeight - 60))
        };
    }

    function applyButtonPos(btnX, btnY) {
        wrapper.style.position = 'fixed';
        wrapper.style.left = (btnX - wrapBtnDx) + 'px';
        wrapper.style.top = (btnY - wrapBtnDy) + 'px';
        wrapper.style.right = 'auto';
        wrapper.style.bottom = 'auto';
    }

    function resetButtonPos() {
        wrapper.style.left = '';
        wrapper.style.top = '';
        wrapper.style.right = '12px';
        wrapper.style.bottom = '12px';
    }

    floatButton.addEventListener('pointerdown', e => {
        e.preventDefault();
        isDragging = true;
        dragMoved = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const btnRect = floatButton.getBoundingClientRect();
        const wrapRect = wrapper.getBoundingClientRect();
        btnStartLeft = btnRect.left;
        btnStartTop = btnRect.top;
        wrapBtnDx = btnRect.left - wrapRect.left;
        wrapBtnDy = btnRect.top - wrapRect.top;
        wrapper.classList.add('dragging');
        floatButton.setPointerCapture(e.pointerId);
    });

    floatButton.addEventListener('pointermove', e => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (!dragMoved && Math.sqrt(dx * dx + dy * dy) < 5) return;
        dragMoved = true;
        const pos = clampBtnPos(btnStartLeft + dx, btnStartTop + dy);
        applyButtonPos(pos.x, pos.y);
    });

    floatButton.addEventListener('pointerup', () => {
        if (!isDragging) return;
        isDragging = false;
        if (!dragMoved) {
            wrapper.classList.remove('dragging');
            toggleChat();
        }
    });

    // 双击按钮 → 复位到右下角（防丢保险）
    floatButton.addEventListener('dblclick', resetButtonPos);

    // 窗口缩放后按钮若跑出可视区 → 自动回位
    window.addEventListener('resize', () => {
        const rect = floatButton.getBoundingClientRect();
        if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) {
            resetButtonPos();
        }
    });

    // ===== 雪花粒子系统 =====
    const snowCanvas = document.getElementById('snowCanvas');
    const snowCtx = snowCanvas.getContext('2d');
    let snowflakes = [];
    let snowAnimFrame = null;

    function resizeSnowCanvas() {
        snowCanvas.width = window.innerWidth;
        snowCanvas.height = window.innerHeight;
    }

    function createSnowflake() {
        return {
            x: Math.random() * snowCanvas.width,
            y: -10,
            r: Math.random() * 3 + 1,
            speed: Math.random() * 1.5 + 0.5,
            wind: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.6 + 0.2,
            swing: Math.random() * Math.PI * 2,
            swingSpeed: Math.random() * 0.02 + 0.01
        };
    }

    function initSnowflakes() {
        snowflakes = [];
        for (let i = 0; i < 80; i++) {
            const f = createSnowflake();
            f.y = Math.random() * snowCanvas.height;
            snowflakes.push(f);
        }
    }

    function drawSnowflakes() {
        snowCtx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
        for (const f of snowflakes) {
            f.y += f.speed;
            f.swing += f.swingSpeed;
            f.x += Math.sin(f.swing) * 0.5 + f.wind;
            if (f.y > snowCanvas.height + 10) { f.y = -10; f.x = Math.random() * snowCanvas.width; }
            if (f.x > snowCanvas.width + 10) f.x = -10;
            if (f.x < -10) f.x = snowCanvas.width + 10;
            snowCtx.beginPath();
            snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            snowCtx.fillStyle = `rgba(255,255,255,${f.opacity})`;
            snowCtx.fill();
        }
        snowAnimFrame = requestAnimationFrame(drawSnowflakes);
    }

    function startSnow() { resizeSnowCanvas(); initSnowflakes(); drawSnowflakes(); }
    function stopSnow() { if (snowAnimFrame) cancelAnimationFrame(snowAnimFrame); snowCtx.clearRect(0, 0, snowCanvas.width, snowCanvas.height); }

    // ===== 明信片打字机 =====
    async function typewritePostcard(el, text) {
        el.textContent = '';
        for (const ch of text) { el.textContent += ch; await sleep(60); }
    }

    // ===== 每日明信片主流程 =====
    async function showDailyPostcard() {
        const overlay = document.getElementById('postcard-overlay');
        const container = document.getElementById('postcard-container');
        const nameEl = document.getElementById('postcardName');
        const msgEl = document.getElementById('postcard-message');
        const closeBtn = document.getElementById('postcard-close');

        overlay.classList.add('show');
        startSnow();

        try {
            const res = await api('/diary/daily-postcard', 'GET');
            if (res.success && res.data) {
                nameEl.textContent = res.data.userName || 'Traveler';
                await sleep(800);
                container.classList.add('slide-in');
                await sleep(1200);
                await typewritePostcard(msgEl, res.data.message || 'A new day begins. Take it slow.');
                await sleep(500);
                closeBtn.classList.add('show');
            } else {
                nameEl.textContent = 'Traveler';
                container.classList.add('slide-in');
                await sleep(1000);
                await typewritePostcard(msgEl, 'A brand new day. Be gentle with yourself.');
                closeBtn.classList.add('show');
            }
        } catch (e) {
            nameEl.textContent = 'Traveler';
            container.classList.add('slide-in');
            await sleep(1000);
            await typewritePostcard(msgEl, 'Keep going, one step at a time. — Madeline');
            closeBtn.classList.add('show');
        }

        closeBtn.onclick = () => {
            document.getElementById('bgmPlayer').play().catch(() => {});
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.6s ease';
            stopSnow();
            setTimeout(() => {
                overlay.classList.remove('show');
                overlay.style.opacity = '';
                overlay.style.transition = '';
                container.classList.remove('slide-in');
                closeBtn.classList.remove('show');
            }, 600);
            localStorage.setItem('postcardDate', new Date().toDateString());
        };
    }

    // ================================================================
    // ===== Madeline 主动冒泡系统 =====
    // ================================================================
    let bubbleTimer = null;
    let isBubbling = false;
    let bubbleEl = null;

    ['pointerdown', 'keydown'].forEach(ev =>
        window.addEventListener(ev, () => { window.__audioGestured = true; }, { once: true })
    );


    function playBubbleSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
            osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
            setTimeout(() => ctx.close(), 500);
        } catch (e) { /* 无声降级 */ }
    }



    const VOICE_DIRS = {
        '默认': 'determined',
        '不安': 'upset',
        '惊讶': 'surprised',
        '怨恨': 'angry',
        '不开心': Math.random() < 0.5 ? 'sad' : 'sadder',
        '可爱': 'determined',
        '无语': 'deadpan',
        '冒泡': 'distracted'
    };
    const VOICE_VARIANTS = ['mid_A', 'mid_B', 'mid_C', 'per'];

    const blipAudio = new Audio();
    function playSpeakSound(emotion) {
        if (!window.__audioGestured) return;
        let voice = VOICE_DIRS[emotion] || VOICE_DIRS['冒泡'];
        if (emotion === '不开心') voice = Math.random() < 0.5 ? 'sad' : 'sadder';
        const variant = VOICE_VARIANTS[Math.floor(Math.random() * VOICE_VARIANTS.length)];
        const num = String(Math.floor(Math.random() * 10) + 1).padStart(2, '0');
        const src = 'celeste-sounds/' + voice + '/' + variant + '/' + voice + '_' + variant + '_' + num + '.wav';
        try {
            const a = blipAudio;
            a.src = src;
            a.volume = 0.8;
            a.playbackRate = 0.94 + Math.random() * 0.12;
            a.currentTime = 0;
            a.play().catch(() => {});
        } catch (e) { /* 无声降级 */ }
    }

    function createBubbleElement() {
        if (bubbleEl) bubbleEl.remove();
        bubbleEl = document.createElement('div');
        bubbleEl.id = 'madeline-bubble';
        const av = document.createElement('div');
        av.className = 'bubble-avatar';
        const img = document.createElement('img');
        img.src = avatarMap['默认'];
        av.appendChild(img);
        bubbleEl.appendChild(av);
        document.body.appendChild(bubbleEl);
    }

    async function showBubble(text, emotion) {
        if (isBubbling) return;
        isBubbling = true;

        createBubbleElement();
        const em = emotion || '默认';
        bubbleEl.querySelector('img').src = avatarMap[em] || avatarMap['默认'];

        // 清空内容但保留 avatar
        const avHtml = bubbleEl.querySelector('.bubble-avatar').outerHTML;
        bubbleEl.innerHTML = '';
        bubbleEl.innerHTML = avHtml;

        quickInputBox.classList.add('bubble-active');
        playBubbleSound();

        bubbleEl.style.display = 'block';
        await sleep(50);
        bubbleEl.classList.add('show');

        const textNode = document.createTextNode('');
        bubbleEl.insertBefore(textNode, bubbleEl.firstChild);

        for (const ch of text) {
            textNode.textContent += ch;
            await sleep(50 + Math.random() * 30);
        }

        await sleep(5000);

        bubbleEl.classList.remove('show');
        await sleep(500);
        bubbleEl.remove();
        bubbleEl = null;

        if (!chatOpen) {
            showQuickInput(true);
        }
        isBubbling = false;
    }

    async function proactiveBubble() {
        if (chatOpen || companionState.isTyping || contentInput.value.trim()) {
            scheduleNextBubble();
            return;
        }
        try {
            const res = await api('/diary/bubble', 'GET');
            if (res.success && res.data && res.data.message) {
                await addMadelineMessage(res.data.message, res.data.emotion || '默认');
            }
        } catch (e) {
            console.warn('主动对话失败:', e);
        }
        scheduleNextBubble();
    }
    function scheduleNextBubble() {
        const delay = (40 + Math.random() * 50) * 1000;
        bubbleTimer = setTimeout(proactiveBubble, delay);
    }

    // ================================================================
    // ===== 实时日记伴侣引擎 v2 — Madeline 实时陪写系统 =====
    // ================================================================

    // ===== 配置常量 =====
    const REALTIME_CONFIG = {
        MIN_CHARS_FOR_AI: 8,
        MIN_NEW_CHARS_FOR_AI: 12,
        MIN_NEW_CHARS_FOR_QUICK: 6,
        SENTENCE_ENDERS: ['。', '！', '？', '…', '...', '!', '?', '\n'],
        EMOTION_WORDS: {
            '不安': ['担心','焦虑','害怕','紧张','不安','忐忑','恐慌','患得患失','迷茫','彷徨','不知所措','心慌'],
            '惊讶': ['惊讶','意外','震惊','吃惊','惊喜','诧异','惊愕','目瞪口呆','没想到','居然','竟然','万万没想到'],
            '怨恨': ['怨恨','愤怒','生气','恨','憎恨','嫌弃','失望','郁闷','不公','凭什么','可恶','恼火'],
            '不开心': ['悲伤','难过','痛苦','忧郁','沮丧','颓废','消极','不开心','哭','泪','崩溃','绝望','孤独','寂寞'],
            '可爱': ['可爱','甜','暖心','感动','温馨','幸福','开心','快乐','棒','好极了','太棒了','感恩','满足'],
            '无语': ['无语','哑然','沉默','冷场','尴尬','不知道说什么','呵呵','算了','无言','服了','离谱']
        },
        EMOTION_COLORS: {
            '默认': '#A8E6CF', '不安': '#FF6B6B', '惊讶': '#7DCFFF',
            '怨恨': '#FF4444', '不开心': '#9B59B6', '可爱': '#FF69B4', '无语': '#B0B0B0'
        },
        EMOTION_WEIGHTS: { '不安':1.2, '惊讶':1.0, '怨恨':1.3, '不开心':1.2, '可爱':1.0, '无语':0.8 },
        COOLDOWN_AFTER_AI: 2000,
        MAX_LOCAL_REACTIONS: 3
    };

    // ===== 状态管理 =====
    const companionState = {
        lastAnalyzedText: '',
        lastAnalyzedLen: 0,
        currentEmotion: '默认',
        previousEmotion: '默认',
        emotionHistory: [],
        localReactionCount: 0,
        lastAiTime: 0,
        isAiPending: false,
        isTyping: false,
        typeTimer: null,
        peakEmotion: null,
        peakIntensity: 0
    };

    // ===== DOM 引用 =====
    const peekingEl = document.getElementById('madeline-peeking');
    const emotionBar = document.getElementById('emotion-analysis-bar');
    const emotionFill = document.getElementById('emotionFill');
    const emotionTagsEl = document.getElementById('emotionTags');
    const emotionIntensityEl = document.getElementById('emotionIntensity');
    const emotionWaveEl = document.getElementById('emotion-wave');
    const waveCanvas = document.getElementById('waveCanvas');

    // ===== 情绪波形可视化 =====
    const waveCtx = waveCanvas.getContext('2d');
    let waveAnimFrame = null;

    function initWaveCanvas() {
        waveCanvas.width = waveCanvas.offsetWidth * 2;
        waveCanvas.height = waveCanvas.offsetHeight * 2;
        waveCtx.scale(2, 2);
    }
    initWaveCanvas();

    function drawWave() {
        const w = waveCanvas.offsetWidth;
        const h = waveCanvas.offsetHeight;
        waveCtx.clearRect(0, 0, w, h);
        const color = REALTIME_CONFIG.EMOTION_COLORS[companionState.currentEmotion] || '#A8E6CF';
        const intensity = companionState.peakIntensity / 10;
        const amplitude = h * 0.3 * Math.max(0.2, intensity);
        const now = Date.now() / 1000;
        const speed = companionState.isTyping ? 3 : 1;

        waveCtx.beginPath();
        waveCtx.moveTo(0, h / 2);
        for (let x = 0; x < w; x++) {
            const t = x / w;
            const y = h / 2 + Math.sin(t * 6 + now * speed) * amplitude
                + Math.sin(t * 10 + now * speed * 1.5) * amplitude * 0.3
                + Math.sin(t * 15 + now * speed * 0.7) * amplitude * 0.15;
            waveCtx.lineTo(x, y);
        }
        waveCtx.strokeStyle = color;
        waveCtx.lineWidth = 1.5;
        waveCtx.globalAlpha = 0.6;
        waveCtx.stroke();
        waveCtx.globalAlpha = 1;

        waveAnimFrame = requestAnimationFrame(drawWave);
    }
    drawWave();

    // ===== 本地快速情绪分析（每次输入都触发） =====
    function analyzeLocalEmotion(text) {
        const scores = {};
        let totalHits = 0;
        for (const [emotion, keywords] of Object.entries(REALTIME_CONFIG.EMOTION_WORDS)) {
            scores[emotion] = 0;
            for (const kw of keywords) {
                let idx = 0;
                let count = 0;
                while ((idx = text.indexOf(kw, idx)) !== -1) {
                    count++;
                    idx += kw.length;
                }
                if (count > 0) {
                    const weight = REALTIME_CONFIG.EMOTION_WEIGHTS[emotion] || 1;
                    scores[emotion] += count * weight;
                    totalHits += count;
                }
            }
        }
        let maxEmotion = '默认';
        let maxScore = 0;
        for (const [emotion, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                maxEmotion = emotion;
            }
        }
        const intensity = Math.min(10, Math.round((maxScore / Math.max(1, totalHits)) * 5 + maxScore));
        const sorted = Object.entries(scores)
            .filter(([, s]) => s > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([e]) => e);
        return { emotion: maxEmotion, intensity, scores, topEmotions: sorted };
    }

    // ===== 更新情绪分析条 UI =====
    function updateEmotionBar(analysis) {
        emotionBar.classList.add('show');
        emotionWaveEl.classList.add('show');
        const pct = (analysis.intensity / 10) * 100;
        const color = REALTIME_CONFIG.EMOTION_COLORS[analysis.emotion] || '#A8E6CF';
        emotionFill.style.width = pct + '%';
        emotionFill.style.background = color;
        emotionIntensityEl.textContent = analysis.emotion + ' ' + analysis.intensity + '/10';
        emotionIntensityEl.style.color = color;

        const allEmotions = ['默认','不安','惊讶','怨恨','不开心','可爱','无语'];
        emotionTagsEl.innerHTML = '';
        for (const em of allEmotions) {
            const tag = document.createElement('span');
            tag.className = 'emotion-tag';
            if (analysis.topEmotions.includes(em) || em === analysis.emotion) {
                tag.classList.add('active');
                if (em === analysis.emotion) {
                    tag.style.background = color;
                    tag.style.color = '#111';
                }
            }
            tag.textContent = em;
            emotionTagsEl.appendChild(tag);
        }
    }

    // ===== 检测新增的句子 =====
    function getNewSentences(oldText, newText) {
        if (newText.length <= oldText.length) return [];
        const addedPart = newText.substring(oldText.length);
        const sentences = [];
        for (const ender of REALTIME_CONFIG.SENTENCE_ENDERS) {
            let idx = addedPart.indexOf(ender);
            if (idx !== -1) {
                const ctxStart = Math.max(0, oldText.length - 20);
                const sentenceText = newText.substring(ctxStart, oldText.length + idx + ender.length);
                sentences.push(sentenceText.trim());
            }
        }
        return sentences;
    }

    // ===== 显示 "Madeline 正在看..." =====
    function showPeeking(show) {
        if (show) {
            peekingEl.classList.add('show');
        } else {
            peekingEl.classList.remove('show');
        }
    }

    // ===== 本地快速反应（不等 AI，即时反馈） =====
    function localReact(analysis, newText) {
        if (companionState.localReactionCount >= REALTIME_CONFIG.MAX_LOCAL_REACTIONS) return;
        const prevEmotion = companionState.currentEmotion;
        const newEmotion = analysis.emotion;

        if (newEmotion !== prevEmotion && newEmotion !== '默认') {
            companionState.localReactionCount++;
            companionState.currentEmotion = newEmotion;
            updateThemeByEmotion(newEmotion);

            const reactions = {
                '不安': ['…怎么了？', '感觉到你有点不安…', '慢慢写，我在。'],
                '惊讶': ['哦？发生了什么！', '然后呢？！', '哇…'],
                '怨恨': ['…', '深呼吸…', '我听着呢。'],
                '不开心': ['…我在。', '写出来会好一些。', '嗯，继续写。'],
                '可爱': ['♥', '嗯嗯！', '看到你开心我也开心。'],
                '无语': ['…嗯。', '有时候就是会这样。', '无语也没关系。']
            };
            const pool = reactions[newEmotion] || ['…'];
            const reaction = pool[Math.floor(Math.random() * pool.length)];
            addMadelineMessage(reaction, '默认');
        }

        companionState.peakIntensity = Math.max(companionState.peakIntensity, analysis.intensity);
    }

    // ===== 触发 AI 分析 =====
    async function triggerAiAnalysis(text, triggerType) {
        if (companionState.isAiPending) return;
        companionState.isAiPending = true;
        companionState.lastAnalyzedText = text;
        companionState.lastAnalyzedLen = text.length;
        showPeeking(true);

        try {
            const res = await api('/diary/companion', 'POST', { draft: text });
            if (res.success && res.data) {
                const feedback = res.data.feedback || '';
                const emotion = res.data.emotion || '默认';
                const userEmotion = res.data.userEmotion || emotion;
                showPeeking(false);
                if (feedback) addMadelineMessage(feedback, emotion);
                updateThemeByEmotion(userEmotion);
                companionState.currentEmotion = userEmotion;
                companionState.previousEmotion = userEmotion;
                companionState.localReactionCount = 0;
                companionState.lastAiTime = Date.now();

                const analysis = analyzeLocalEmotion(text);
                updateEmotionBar(analysis);

                companionState.emotionHistory.push({
                    emotion: userEmotion, time: Date.now(), trigger: triggerType
                });
                if (companionState.emotionHistory.length > 50) {
                    companionState.emotionHistory = companionState.emotionHistory.slice(-50);
                }
            } else {
                showPeeking(false);
            }
        } catch (e) {
            console.warn('AI 分析失败:', e);
            showPeeking(false);
        } finally {
            companionState.isAiPending = false;
        }
    }

    // ===== 核心：输入事件处理 =====
    contentInput.addEventListener('input', () => {
        const text = contentInput.value.trim();

        companionState.isTyping = true;
        clearTimeout(companionState.typeTimer);
        companionState.typeTimer = setTimeout(() => {
            companionState.isTyping = false;
        }, 500);

        if (text.length < REALTIME_CONFIG.MIN_CHARS_FOR_AI) {
            emotionBar.classList.remove('show');
            emotionWaveEl.classList.remove('show');
            return;
        }

        const analysis = analyzeLocalEmotion(text);
        updateEmotionBar(analysis);

        const newSentences = getNewSentences(companionState.lastAnalyzedText, text);
        const newChars = text.length - companionState.lastAnalyzedLen;
        const hasSentenceEnd = newSentences.length > 0;
        const enoughNewChars = newChars >= REALTIME_CONFIG.MIN_NEW_CHARS_FOR_AI;
        const quickTrigger = newChars >= REALTIME_CONFIG.MIN_NEW_CHARS_FOR_QUICK && hasSentenceEnd;
        const timeSinceLastAi = Date.now() - companionState.lastAiTime;
        const pastCooldown = timeSinceLastAi > REALTIME_CONFIG.COOLDOWN_AFTER_AI;

        localReact(analysis, text);

        if (!companionState.isAiPending && pastCooldown) {
            if (quickTrigger || enoughNewChars) {
                triggerAiAnalysis(text, hasSentenceEnd ? 'sentence' : 'threshold');
            }
        }
    });

    // ===== 标题也监听（轻量） =====
    titleInput.addEventListener('input', () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (title.length > 2 && content.length > REALTIME_CONFIG.MIN_CHARS_FOR_AI) {
            const combined = title + '。' + content;
            const analysis = analyzeLocalEmotion(combined);
            updateEmotionBar(analysis);
        }
    });

    // ===== 保存日记（含最终分析 + 状态重置） =====
    async function saveDiary() {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!content) { showToast('写点什么再保存吧~', 'error'); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        try {
            const res = await api('/diary', 'POST', { title: title || '无题', content });
            if (res.success) {
                companionState.lastAnalyzedText = '';
                companionState.lastAnalyzedLen = 0;
                companionState.localReactionCount = 0;
                companionState.emotionHistory = [];
                companionState.peakIntensity = 0;
                updateThemeByEmotion('默认');

                const companionRes = await api('/diary/companion', 'POST', { draft: content });
                if (companionRes.success && companionRes.data) {
                    const feedback = companionRes.data.feedback || '';
                    const emotion = companionRes.data.emotion || '默认';
                    addMadelineMessage(feedback, emotion);
                    updateThemeByEmotion(emotion);
                }

                showToast('保存成功！', 'success');
                titleInput.value = '';
                contentInput.value = '';
                emotionBar.classList.remove('show');
                emotionWaveEl.classList.remove('show');
            } else {
                showToast(res.msg || '保存失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = '保存日记';
    }
    saveBtn.addEventListener('click', saveDiary);

    // ===== 测试情绪检测按钮 =====
    const testBtn = document.getElementById('testEmotionBtn');
    const emotionResult = document.getElementById('emotionResult');
    testBtn.addEventListener('click', () => {
        const text = contentInput.value.trim();
        if (!text) { emotionResult.style.display = 'none'; return; }
        const analysis = analyzeLocalEmotion(text);
        emotionResult.style.display = 'block';
        emotionResult.innerHTML =
            '<strong>情绪:</strong> ' + analysis.emotion + '<br>' +
            '<strong>强度:</strong> ' + analysis.intensity + '/10<br>' +
            '<strong>Top 情绪:</strong> ' + analysis.topEmotions.join(', ') + '<br>' +
            '<strong>详细得分:</strong> ' + (Object.entries(analysis.scores).filter(function(p){ return p[1] > 0; }).map(function(p){ return p[0] + ':' + p[1]; }).join(', ') || '无');
    });

    // ================================================================
    // ===== 初始化 =====
    // ================================================================
    // ===== 像素 Madeline 行为树 v3（贴地行走 + 坐/睡/醒/摔） =====
    const pm = document.getElementById('pixelMadeline');

    const PM_BASE_SIZE = 56;
    const PM_FRAC = {};
    let pmCurName = '';
    function pmCalibrate(src) {
        if (PM_FRAC[src] !== undefined) return;
        const im = new Image();
        im.onload = () => {
            const c = document.createElement('canvas');
            c.width = im.naturalWidth; c.height = im.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(im, 0, 0);
            let data;
            try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch (err) { return; }
            let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
            for (let y = 0; y < c.height; y++) {
                for (let x = 0; x < c.width; x++) {
                    if (data[(y * c.width + x) * 4 + 3] > 20) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0) return;
            PM_FRAC[src] = Math.max((maxX - minX + 1) / c.width, (maxY - minY + 1) / c.height);
            pmApplySize();
        };
        im.src = src;
    }
    function pmApplySize() {
        const base = PM_FRAC[PM_SRC.move];
        const cur = PM_FRAC[pmCurName];
        let s = 1;
        if (base && cur) s = Math.min(2.5, base / cur);
        pm.style.width = Math.round(PM_BASE_SIZE * s) + 'px';
        pm.style.height = Math.round(PM_BASE_SIZE * s) + 'px';
    }

    const PM_SRC = {
        move: 'celeste-gui/madeline-move.gif',
        fun: 'celeste-gui/madeline-fun.gif',
        sit: 'celeste-gui/madeline-sitdown.gif',
        sleep: 'celeste-gui/madeline-sleep.gif',
        wake: 'celeste-gui/madeline-wakeup.gif',
        fall: 'celeste-gui/madeline-fallpose.gif'
    };
    const pmState = {
        x: window.innerWidth * 0.15,
        y: window.innerHeight - 80,
        dir: 1,
        mode: 'walk',
        modeUntil: 0,
        targetX: null,
        targetY: null,
        hopT: -1,
        poseUntil: 0,
        poseReturn: '',
        wasHopping: false
    };

    function pmGroundY() { return window.innerHeight - pm.offsetHeight - 8; }
    function pmSetSrc(name) {
        if (pm.src.indexOf(name) === -1) pm.src = name;
        pmCurName = name;
        pmApplySize();
        pmCalibrate(name);
    }

    function blockedAt(tx, ty) {
        const m = 14;
        const zones = [];
        if (gameDialog.classList.contains('show')) zones.push(gameDialog.getBoundingClientRect());
        const book = document.getElementById('journalBook');
        if (book) zones.push(book.getBoundingClientRect());
        const acts = document.querySelector('.diary-actions');
        if (acts) zones.push(acts.getBoundingClientRect());
        for (const r of zones) {
            if (!r || (r.width === 0 && r.height === 0)) continue;
            if (tx < r.right + m && tx + pm.offsetWidth > r.left - m &&
                ty < r.bottom + m && ty + pm.offsetHeight > r.top - m) return true;
        }
        return false;
    }

    function pmPickTarget() {
                const gy = pmGroundY();
                const maxX = window.innerWidth - pm.offsetWidth - 8;
                const book = document.getElementById('journalBook');
                const r = book ? book.getBoundingClientRect() : null;
                const cands = [];
                for (let i = 0; i < 10; i++) {
                    cands.push({ x: 8 + Math.random() * (maxX - 16), y: 60 + Math.random() * (gy - 68) });
                }
                if (r) {
                    const leftW = r.left - 20 - pm.offsetWidth;
                    if (leftW > 16) {
                        for (let i = 0; i < 5; i++) cands.push({ x: 8 + Math.random() * (leftW - 8), y: 60 + Math.random() * (gy - 68) });
                    }
                    const rightX = r.right + 20;
                    if (rightX + pm.offsetWidth < maxX - 8) {
                        for (let i = 0; i < 5; i++) cands.push({ x: rightX + Math.random() * (maxX - rightX - 8), y: 60 + Math.random() * (gy - 68) });
                    }
                    const topH = r.top - 24 - pm.offsetHeight;
                    if (topH > 68) {
                        for (let i = 0; i < 5; i++) cands.push({ x: 8 + Math.random() * (maxX - 16), y: 60 + Math.random() * (topH - 60) });
                    }
                }
                for (const c of cands) {
                    if (!blockedAt(c.x, c.y)) return { x: c.x, y: c.y };
                }
                for (const fx of [0.04, 0.96, 0.15, 0.85]) {
                    const tx = Math.min(maxX, window.innerWidth * fx);
                    if (!blockedAt(tx, gy)) return { x: tx, y: gy };
                }
                return { x: 8, y: gy };
            }
// ... existing code ...
            function pmDetour(now) {
                const book = document.getElementById('journalBook');
                const r = book ? book.getBoundingClientRect() : null;
                if (!r) { pmStartWalk(now); return; }
                const aboveY = Math.max(60, r.top - pm.offsetHeight - 18);
                const belowY = Math.min(pmGroundY(), r.bottom + 18);
                const ty = (pmState.y - aboveY < belowY - pmState.y) ? aboveY : belowY;
                if (!blockedAt(pmState.x, ty)) {
                    pmState.targetY = ty;
                    return;
                }
                pmStartWalk(now);
            }
            function pmStartWalk(now) {
        pmState.mode = 'walk';
        const t = pmPickTarget();
        pmState.targetX = t.x;
        pmState.targetY = t.y;
        pmState.modeUntil = now + 9000;
        pmSetSrc(PM_SRC.move);
    }
    function pmCelebrate() {
        const gy = pmGroundY();
        const acts = document.querySelector('.diary-actions');
        const rect = acts ? acts.getBoundingClientRect() : null;
        if (!rect) return;
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        const cands = [
            rect.left - pm.offsetWidth - 18,
            rect.right + 18,
            rect.left + rect.width / 2 - pm.offsetWidth / 2
        ];
        const tx = cands.find(v => v >= 4 && v <= maxX && !blockedAt(v, gy));
        if (tx === undefined) return;
        pmState.mode = 'celebrate';
        pmState.targetX = tx;
        pmState.targetY = gy;
        pmState.modeUntil = performance.now() + 12000;
        pmSetSrc(PM_SRC.move);
    }

    function pmNextMode(now) {
        const e = companionState.currentEmotion;
        const gloomy = (e === '悲伤' || e === '孤独' || e === '不开心');
        const lively = (e === '开心' || e === '可爱' || e === '惊讶');
        const nearGround = pmState.y > pmGroundY() - 60;
        const hour = new Date().getHours();
        const night = hour >= 23 || hour < 6;
        let sitP = gloomy ? 0.34 : 0.18;
        let funP = lively ? 0.26 : 0.12;
        let walkP = lively ? 0.5 : 0.42;
        if (night) { sitP += 0.2; walkP -= 0.2; }
        const r = Math.random();
        if (r < sitP && nearGround) {
            pmState.mode = 'sit';
            pmState.modeUntil = now + 6000 + Math.random() * 10000;
            pmSetSrc(PM_SRC.sit);
        } else if (r < sitP + funP) {
            pmState.mode = 'idle';
            pmState.modeUntil = now + 1900;
            pmState.poseUntil = now + 1800;
            pmState.poseReturn = PM_SRC.move;
            pmSetSrc(PM_SRC.fun);
        } else if (r < sitP + funP + walkP) {
            pmStartWalk(now);
            if (lively && Math.random() < 0.5) pmState.hopT = 0;
        } else {
            pmState.mode = 'idle';
            pmState.modeUntil = now + 1200 + Math.random() * 2000;
            pmSetSrc(PM_SRC.move);
        }
    }

    function pmThink(now) {
        // ... existing code ...
        if (companionState.isTyping && pmState.mode !== 'celebrate') {
            if (pmState.mode !== 'peek') {
                pmState.mode = 'peek';
                const bk = document.getElementById('journalBook');
                const rect = bk ? bk.getBoundingClientRect() : null;
                const gy = pmGroundY();
                const maxX = window.innerWidth - pm.offsetWidth - 8;
                let px = Math.max(8, window.innerWidth * 0.1);
                if (rect) {
                    const leftX = rect.left - pm.offsetWidth - 18;
                    const rightX = rect.right + 18;
                    if (leftX >= 4 && !blockedAt(leftX, gy)) px = leftX;
                    else if (rightX <= maxX && !blockedAt(rightX, gy)) px = rightX;
                }
                pmState.targetX = px;
                pmState.targetY = gy;
                pmSetSrc(PM_SRC.move);
            }
            return;
        }
// ... existing code ...
        if (pmState.mode === 'peek') { pmState.mode = 'idle'; pmState.modeUntil = 0; }

        if (now >= pmState.modeUntil) {
            if (pmState.mode === 'sit') {
                const e = companionState.currentEmotion;
                const hour = new Date().getHours();
                const sleepy = (hour >= 23 || hour < 6 || e === '悲伤' || e === '孤独') ? 0.6 : 0.35;
                if (Math.random() < sleepy) {
                    pmState.mode = 'sleep';
                    pmState.modeUntil = now + 20000 + Math.random() * 25000;
                    pmSetSrc(PM_SRC.sleep);
                } else {
                    pmStartWalk(now);
                }
            } else if (pmState.mode === 'sleep') {
                pmState.mode = 'wake';
                pmState.modeUntil = now + 2300;
                pmSetSrc(PM_SRC.wake);
            } else if (pmState.mode === 'wake') {
                pmState.mode = 'idle';
                pmState.modeUntil = 0;
                pmNextMode(now);
            } else {
                pmNextMode(now);
            }
        }
    }

    let pmLast = performance.now();
    function pmLoop(now) {
        const dt = Math.min(0.05, (now - pmLast) / 1000);
        pmLast = now;

        if (pmState.poseUntil > 0 && now >= pmState.poseUntil) {
            pmState.poseUntil = 0;
            pmSetSrc(pmState.poseReturn || PM_SRC.move);
        }
        const posing = pmState.poseUntil > 0;

        if (!chatOpen) {
            pmThink(now);
            const speed = 85;
            const movable = !posing && (pmState.mode === 'peek' || pmState.mode === 'walk' || pmState.mode === 'celebrate') && pmState.targetX !== null
            if (movable) {
                const dx = pmState.targetX - pmState.x;
                const dy = pmState.targetY - pmState.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                // ... existing code ...
                if (dist > 5) {
                    if (dx > 0.5) pmState.dir = 1;
                    else if (dx < -0.5) pmState.dir = -1;
                    let nx = pmState.x + (dx / dist) * speed * dt;
                    let ny = pmState.y + (dy / dist) * speed * dt;
                    if (blockedAt(nx, ny)) {
                        if (!blockedAt(nx, pmState.y)) ny = pmState.y;
                        else if (!blockedAt(pmState.x, ny)) nx = pmState.x;
                        else { pmDetour(now); nx = pmState.x; ny = pmState.y; }
                    }
                    pmState.x = nx;
                    pmState.y = ny;
                } else if (pmState.mode === 'walk') {
// ... existing code ...
                    pmState.mode = 'idle';
                    pmState.modeUntil = now + 600 + Math.random() * 1200;
                }else if (pmState.mode === 'celebrate') {
                    pmState.mode = 'idle';
                    pmState.modeUntil = now + 2600;
                    pmState.poseUntil = now + 2200;
                    pmState.poseReturn = PM_SRC.move;
                    pmSetSrc(PM_SRC.fun);
                }
            }
            // ... existing code ...
            pmState.x = Math.max(4, Math.min(pmState.x, window.innerWidth - pm.offsetWidth - 4));
            pmState.y = Math.max(60, Math.min(pmState.y, pmGroundY()));
            if (pmState.mode !== 'peek' && blockedAt(pmState.x, pmState.y)) pmStartWalk(now);
// ... existing code ...
        }

        let hopOffset = 0;
        const hopping = pmState.hopT >= 0 && pmState.mode === 'walk' && !posing;
        if (pmState.hopT >= 0) {
            pmState.hopT += dt;
            if (pmState.hopT >= 0.5) {
                pmState.hopT = -1;
                if (pmState.wasHopping) {
                    pmState.poseUntil = now + 650;
                    pmState.poseReturn = PM_SRC.move;
                    pmSetSrc(PM_SRC.fall);
                }
            } else {
                hopOffset = Math.sin((pmState.hopT / 0.5) * Math.PI) * 26;
            }
        }
        pmState.wasHopping = hopping;
        if (hopOffset > 0) pmSetSrc(PM_SRC.move);

        pm.style.transform = 'translate(' + pmState.x + 'px,' + (pmState.y - hopOffset) + 'px)' + (pmState.dir < 0 ? ' scaleX(-1)' : '');
        requestAnimationFrame(pmLoop);
    }
    requestAnimationFrame(pmLoop);
    if (blockedAt(pmState.x, pmState.y)) { pmState.x = 8; pmState.y = pmGroundY(); }
    window.addEventListener('resize', () => { pmState.y = Math.min(pmState.y, pmGroundY()); });
    window.addEventListener('feather-finished', () => {
        addMadelineMessage('回来啦。刚才跟着羽毛的那一会儿，心里是不是安静了一点？', '可爱');
    });
    pm.addEventListener('click', () => toggleChat());


    (async function init() {
        if (!localStorage.getItem('token')) {
            alert('请先登录');
            location.href = 'login.html';
            return;
        }

        // BGM
        const bgmPlayer = document.getElementById('bgmPlayer');
        const savedDiaryTime = parseFloat(localStorage.getItem('bgmTimeDiary') || '0');
        if (savedDiaryTime > 0) bgmPlayer.currentTime = savedDiaryTime;
        bgmPlayer.volume = 0.3;
        bgmPlayer.play().catch(() => {});
        setInterval(() => { localStorage.setItem('bgmTimeDiary', bgmPlayer.currentTime); }, 2000);
        function tryPlayBGM() { bgmPlayer.play().then(() => { document.removeEventListener('click', tryPlayBGM); document.removeEventListener('keydown', tryPlayBGM); }).catch(() => {}); }
        document.addEventListener('click', tryPlayBGM);
        document.addEventListener('keydown', tryPlayBGM);

        const savedEmotion = localStorage.getItem('lastEmotion') || '默认';
        updateThemeByEmotion(savedEmotion);
        addMadelineMessage('Hey! I\'m Madeline. Let\'s record life together.', '默认');

        showQuickInput(true);
        scheduleNextBubble();

        // 每日明信片（每天只弹一次）
        const today = new Date().toDateString();
        const lastShown = localStorage.getItem('postcardDate');
        if (lastShown !== today) {
            await showDailyPostcard();
        }
    })();
})();
