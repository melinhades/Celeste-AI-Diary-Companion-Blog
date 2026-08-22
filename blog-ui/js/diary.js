(function() {
    // ===== Celeste 日记本 =====
    const BOOK_PAGES = [
        { src: 'celeste-journal/spread1.jpg', fields: [
                { kind: 'line', id: 'titleInput', x: .104, y: .518, w: .364, h: .144, ph: '想去爬的那座山…' },
                { kind: 'area', id: 'contentInput', x: .104, y: .244, w: .364, h: .230, ph: '从小步开始。今天发生了什么…' },
                { kind: 'area', x: .527, y: .230, w: .182, h: .396, ph: '愿望清单：第一件…' },
                { kind: 'area', x: .737, y: .230, w: .173, h: .396 } ] },
        { src: 'celeste-journal/spread2.jpg', fields: [
                { kind: 'area', x: .104, y: .244, w: .364, h: .230, ph: '把大目标拆成能做到的小步…' },
                { kind: 'area', x: .104, y: .518, w: .364, h: .144, ph: '想疯狂尝试一次的体验…' },
                { kind: 'line', x: .536, y: .197, w: .364, h: .036, ph: '我想去——' },
                { kind: 'line', x: .536, y: .255, w: .364, h: .036, ph: '因为——' },
                { kind: 'grid', x: .536, y: .309, w: .378, h: .396, cols: 12, rows: 10 } ] },
        { src: 'celeste-journal/spread3.jpg', fields: [
                { kind: 'area', x: .104, y: .230, w: .364, h: .216, ph: '想对自己慢慢说的话…' },
                { kind: 'area', x: .104, y: .482, w: .364, h: .122, ph: '弄丢了，但没忘记…' },
                { kind: 'area', x: .536, y: .215, w: .373, h: .216, ph: '想起来会笑的回忆…' },
                { kind: 'cols', x: .536, y: .532, w: .373, h: .094, n: 3, phs: ['想谢的人…', '想谢的小事…', '想谢的自己…'] } ] }
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
                if (f.ph) node.placeholder = f.ph;
                if (!f.id) {
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
                    if (f.phs && f.phs[i]) inp.placeholder = f.phs[i];
                    inp.value = localStorage.getItem(key + '-' + i) || '';
                    inp.addEventListener('input', () => localStorage.setItem(key + '-' + i, inp.value));
                    node.appendChild(inp);
                }
            }
            if (f.id) node.id = f.id;
            node.dataset.tk = key;
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

    // ===== 调框模式（可视化面板：左下角按钮开关） =====
    const tuneStore = JSON.parse(localStorage.getItem('jbookTune') || '{}');
    document.querySelectorAll('#journalBook [data-tk]').forEach(n => {
        const t = tuneStore[n.dataset.tk];
        if (!t) return;
        if (t.l !== undefined) n.style.left = t.l + '%';
        if (t.t !== undefined) n.style.top = t.t + '%';
        if (t.w !== undefined) n.style.width = t.w + '%';
        if (t.h !== undefined) n.style.height = t.h + '%';
    });
    let tuneSel = null;

    const tuneBtn = document.createElement('button');
    tuneBtn.id = 'tuneToggle';
    tuneBtn.textContent = '🔧 调框';
    document.body.appendChild(tuneBtn);

    const tunePanel = document.createElement('div');
    tunePanel.id = 'tunePanel';
    tunePanel.innerHTML =
        '<div class="tp-title">点选一个文本框，再用下面按钮微调</div>' +
        '<div class="tp-row"><button data-act="left">◀ 左</button><button data-act="up">▲ 上</button><button data-act="down">▼ 下</button><button data-act="right">▶ 右</button></div>' +
        '<div class="tp-row"><button data-act="wMinus">宽 −</button><button data-act="wPlus">宽 ＋</button><button data-act="hMinus">高 −</button><button data-act="hPlus">高 ＋</button></div>' +
        '<div class="tp-row"><button data-act="resetOne">重置此框</button><button data-act="resetAll">全部重置</button><button data-act="done">完成</button></div>' +
        '<div class="tp-tip">按住按钮可连续移动 · 自动保存</div>';
    document.body.appendChild(tunePanel);

    function tuneSave(n) {
        tuneStore[n.dataset.tk] = {
            l: +parseFloat(n.style.left).toFixed(2),
            t: +parseFloat(n.style.top).toFixed(2),
            w: +parseFloat(n.style.width).toFixed(2),
            h: +parseFloat(n.style.height).toFixed(2)
        };
        localStorage.setItem('jbookTune', JSON.stringify(tuneStore));
    }
    function tuneApply(act) {
        if (!tuneSel) return;
        const step = 0.3, s = tuneSel.style;
        if (act === 'left') s.left = (parseFloat(s.left) - step) + '%';
        else if (act === 'right') s.left = (parseFloat(s.left) + step) + '%';
        else if (act === 'up') s.top = (parseFloat(s.top) - step) + '%';
        else if (act === 'down') s.top = (parseFloat(s.top) + step) + '%';
        else if (act === 'wMinus') s.width = (parseFloat(s.width) - step) + '%';
        else if (act === 'wPlus') s.width = (parseFloat(s.width) + step) + '%';
        else if (act === 'hMinus') s.height = (parseFloat(s.height) - step) + '%';
        else if (act === 'hPlus') s.height = (parseFloat(s.height) + step) + '%';
        else if (act === 'resetOne') { delete tuneStore[tuneSel.dataset.tk]; localStorage.setItem('jbookTune', JSON.stringify(tuneStore)); location.reload(); return; }
        else if (act === 'resetAll') { localStorage.removeItem('jbookTune'); location.reload(); return; }
        else if (act === 'done') { tuneBtn.click(); return; }
        else return;
        tuneSave(tuneSel);
    }
    tuneBtn.addEventListener('click', () => {
        document.body.classList.toggle('tune-mode');
        const on = document.body.classList.contains('tune-mode');
        tunePanel.style.display = on ? 'block' : 'none';
        tuneBtn.textContent = on ? '❌ 退出调框' : '🔧 调框';
        if (!on && tuneSel) { tuneSel.classList.remove('tune-sel'); tuneSel = null; }
    });
    tunePanel.querySelectorAll('button').forEach(b => {
        let timer = null;
        b.addEventListener('mousedown', ev => {
            ev.preventDefault();
            tuneApply(b.dataset.act);
            timer = setInterval(() => tuneApply(b.dataset.act), 60);
        });
        b.addEventListener('mouseup', () => clearInterval(timer));
        b.addEventListener('mouseleave', () => clearInterval(timer));
    });
    bookEl.addEventListener('mousedown', ev => {
        if (!document.body.classList.contains('tune-mode')) return;
        const n = ev.target.closest('[data-tk]');
        if (!n) return;
        ev.preventDefault(); ev.stopPropagation();
        if (tuneSel) tuneSel.classList.remove('tune-sel');
        tuneSel = n;
        n.classList.add('tune-sel');
        if (n.blur) n.blur();
    }, true);

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

    document.getElementById('bookPrev').addEventListener('click', () => { jpPlay('back'); bookGoto((bookCur - 1 + pageEls.length) % pageEls.length); });
    document.getElementById('bookNext').addEventListener('click', () => { jpPlay('forward'); bookGoto((bookCur + 1) % pageEls.length); });
    const avatarMap = {
        '默认': 'celeste-portraits/madeline/normal00.png',
        '不安': 'celeste-portraits/madeline/panic00.png',
        '惊讶': 'celeste-portraits/madeline/surprised00.png',
        '怨恨': 'celeste-portraits/madeline/angry00.png',
        '不开心': 'celeste-portraits/madeline/sad00.png',
        '可爱': 'celeste-portraits/madeline/peaceful00.png',
        '无语': 'celeste-portraits/madeline/deadpan00.png'
    };
    // ... existing code ...
    const PORTRAIT_FRAMES = { normal: 7, panic: 5, surprised: 7, angry: 7, sad: 7, peaceful: 4, deadpan: 9 };
    let portraitAnimTimer = null;
    function startPortraitAnim(emotion) {
        clearInterval(portraitAnimTimer);
        const src = avatarMap[emotion] || avatarMap['默认'];
        const stem = src.split('/').pop().replace(/00\.png$/, '');
        const n = PORTRAIT_FRAMES[stem] || 1;
        if (n <= 1) { gameDialogPortraitImg.src = src; return; }
        let fi = 0;
        gameDialogPortraitImg.src = 'Atlases/Portraits/madeline/' + stem + '00.png';
        portraitAnimTimer = setInterval(() => {
            fi = (fi + 1) % n;
            gameDialogPortraitImg.src = 'Atlases/Portraits/madeline/' + stem + String(fi).padStart(2, '0') + '.png';
        }, 120);
    }
    function stopPortraitAnim() { clearInterval(portraitAnimTimer); portraitAnimTimer = null; }
// ... existing code ...
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
    // 暖色场景：原图已经够暖，不叠场景图
    const warmScenes = ['默认', '开心', '满足', '希望'];
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
        if (warmScenes.includes(scene)) {
            emotionBg.classList.remove('show');
            return;
        }
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

    // ... existing code ...
    function openGameDialog(emotion) {
        startPortraitAnim(emotion);
        const pmCenter = pmState.x + pm.offsetWidth / 2;
        const onRight = pmCenter > window.innerWidth / 2;

        gameDialogPortraitImg.parentElement.style.transform = onRight ? 'scaleX(-1)' : '';
        gameDialog.classList.add('show');
    }
// ... existing code ...
        function scheduleGameDialogHide() {
            clearTimeout(gameDialogHideTimer);
            gameDialogHideTimer = setTimeout(() => {
                stopPortraitAnim();
                gameDialog.classList.remove('show');
            }, 6000);
        }
        gameDialog.addEventListener('click', () => {
            clearTimeout(gameDialogHideTimer);
            stopPortraitAnim();
            gameDialog.classList.remove('show');
        });
// ... existing code ...
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
                        // Deleted:if (speakCount % 3 === 1) { playSpeakSound(emotion); stepPortraitAnim(); }
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
        if (useGameDialog) stopPortraitAnim();
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

    let nightCareSaid = false;

    // ===== 聊天发送 =====
    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text || isTyping) return;
        chatInput.value = '';
        addUserMessage(text);
        if (nightCareSaid && /再写|再待|一会|再陪我|不困|不想睡|睡不着|还早/.test(text)) {
            nightCareSaid = false;
            addMadelineMessage('嗯，那我陪着你。不过写完这一段，真的要睡哦。', '可爱');
            return;
        }
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
    // ===== 明信片音效：csides 对 = 发出（每日明信片） / variants 对 = keep（导出明信片） =====
    const PC_SOUNDS = {};
    function pcPlay(name) {
        try {
            if (!PC_SOUNDS[name]) PC_SOUNDS[name] = new Audio('celeste-sounds/' + name);
            const a = PC_SOUNDS[name];
            a.currentTime = 0;
            a.volume = 0.9;
            a.play().catch(() => {});
        } catch (e) { /* 无声降级 */ }
    }

    // ===== 日记本翻页音效：forward = 向右 / back = 向左（官方素材，变体随机） =====
    const JP_SFX = {
        forward: ['ui_world_journal_page_cover_forward_01.wav', 'ui_world_journal_page_cover_forward_02.wav', 'ui_world_journal_page_cover_forward_03.wav'],
        back: ['ui_world_journal_page_main_back_01.wav', 'ui_world_journal_page_main_back_02.wav', 'ui_world_journal_page_main_back_03.wav']
    };
    const JP_AUDIO = {};
    function jpPlay(dir) {
        try {
            const list = JP_SFX[dir];
            const name = list[Math.floor(Math.random() * list.length)];
            if (!JP_AUDIO[name]) JP_AUDIO[name] = new Audio('celeste-sounds/' + name);
            const a = JP_AUDIO[name];
            a.currentTime = 0;
            a.volume = 0.20;
            a.play().catch(() => {});
        } catch (e) { /* 无声降级 */ }
    }


    // ===== 每日明信片主流程 =====
    async function showDailyPostcard() {
        const overlay = document.getElementById('postcard-overlay');
        const container = document.getElementById('postcard-container');
        const nameEl = document.getElementById('postcardName');
        const msgEl = document.getElementById('postcard-message');
        const closeBtn = document.getElementById('postcard-close');

        overlay.classList.add('show');
        pcPlay('ui_main_postcard_csides_in.wav');
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
            pcPlay('ui_main_postcard_csides_out.wav');
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
                const msg = res.data.message.trim();
                if (bubbleSaid.indexOf(msg) === -1) {
                    bubbleSaid.push(msg);
                    if (bubbleSaid.length > 8) bubbleSaid.shift();
                    await addMadelineMessage(msg, res.data.emotion || '默认');
                }
            }
        } catch (e) {
            console.warn('主动对话失败:', e);
        }
        scheduleNextBubble();
    }
    const bubbleSaid = [];
    function scheduleNextBubble() {
        const delay = (150 + Math.random() * 120) * 1000;
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
                if (userEmotion === '不开心') pmComfort();
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
        saveBtn.textContent = 'Saving...';
        try {
            const extras = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf('jbook-') === 0) {
                    const v = (localStorage.getItem(k) || '').trim();
                    if (v && v.indexOf('[') !== 0) extras.push(v);
                }
            }
            const payload = { title: title || '无题', content: extras.length ? content + '\n\n' + extras.join('\n') : content };
            if (editingDiaryId) payload.id = editingDiaryId;
            const res = await api('/diary', 'POST', payload);
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

                showToast(editingDiaryId ? '更新成功！' : '保存成功！', 'success');
                pmCelebrate();
                pmSummarize();
                if (!editingDiaryId) {
                    const saveCnt = parseInt(localStorage.getItem('diarySaveCount') || '0') + 1;
                    localStorage.setItem('diarySaveCount', String(saveCnt));
                    addBerries(1);
                    pmMilestone(saveCnt);
                    playBerrySound();
                }
                onSaveStreak();
                editingDiaryId = null;
                titleInput.value = '';
                contentInput.value = '';
                emotionBar.classList.remove('show');
                emotionWaveEl.classList.remove('show');
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k && k.indexOf('jbook-') === 0) localStorage.removeItem(k);
                }
                document.querySelectorAll('#journalBook input:not(#titleInput), #journalBook textarea:not(#contentInput)').forEach(n => n.value = '');
            } else {
                showToast(res.msg || '保存失败', 'error');
            }
        } catch (e) {
            showToast('网络错误', 'error');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE';
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
    const PM_FRAMES = {};
    PM_FRAMES[PM_SRC.fall] = (function () {
        const a = [];
        // Deleted:for (let i = 0; i < 12; i++) a.push('celeste-player/fallPose' + String(i).padStart(2, '0') + '.png');
        for (let i = 0; i < 11; i++) a.push('celeste-player/fallPose' + String(i).padStart(2, '0') + '.png');
        return a;
    })();
    let pmFrameTimer = null;
    function pmSetSrc(name) {
        if (pmFrameTimer) { clearInterval(pmFrameTimer); pmFrameTimer = null; }
        const frames = PM_FRAMES[name];
        if (frames) {
            let i = 0;
            pm.src = frames[0];
            pmFrameTimer = setInterval(() => {
                i++;
                if (i >= frames.length) { clearInterval(pmFrameTimer); pmFrameTimer = null; return; }
                pm.src = frames[i];
            }, 55);
        } else if (pm.src.indexOf(name) === -1) {
            pm.src = name;
        }
        pmCurName = name;
        pmApplySize();
        pmCalibrate(name);
    }

    let zoneScoldUntil = 0;
    let pmCaution = false;
    function blockedAt(tx, ty) {
        const zones = [];
        if (gameDialog.classList.contains('show')) zones.push({ r: gameDialog.getBoundingClientRect(), m: 14 });
        const book = document.getElementById('journalBook');
        if (book) zones.push({ r: book.getBoundingClientRect(), m: 14 });
        const acts = document.querySelector('.diary-actions');
        if (acts) zones.push({ r: acts.getBoundingClientRect(), m: 26 });
        const extra = performance.now() < zoneScoldUntil ? 26 : 0;
        for (const z of zones) {
            const r = z.r, m = z.m + extra;
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
                if (!pmCaution || !blockedAt(c.x, c.y)) return { x: c.x, y: c.y };
            }
                for (const fx of [0.04, 0.96, 0.15, 0.85]) {
                const tx = Math.min(maxX, window.innerWidth * fx);
                    if (!pmCaution || !blockedAt(tx, gy)) return { x: tx, y: gy };
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
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        let tx;
        if (rect) {
            const cands = [
                rect.left - pm.offsetWidth - 18,
                rect.right + 18,
                rect.left + rect.width / 2 - pm.offsetWidth / 2
            ];
            tx = cands.find(v => v >= 4 && v <= maxX && !blockedAt(v, gy));
        }
        if (tx === undefined) {
            for (let v = 4; v <= maxX; v += 24) {
                if (!blockedAt(v, gy)) { tx = v; break; }
            }
        }
        if (tx === undefined) return;
        pmState.hopT = 0;
        pmState.mode = 'celebrate';
        pmState.targetX = tx;
        pmState.targetY = gy;
        pmState.modeUntil = performance.now() + 12000;
        pmSetSrc(PM_SRC.move);
    }

    async function pmSummarize() {
        const content = contentInput.value.trim();
        if (!content) return;
        try {
            const res = await api('/diary/summary', 'POST', { title: titleInput.value.trim(), content: content });
            if (res.success && res.data && res.data.message) addMadelineMessage(res.data.message, res.data.emotion || '默认');
        } catch (e) { }
    }


    function pmNextMode(now) {
        const e = companionState.currentEmotion;
        const gloomy = (e === '悲伤' || e === '孤独' || e === '不开心');
        const lively = (e === '开心' || e === '可爱' || e === '惊讶');
        const nearGround = pmState.y > pmGroundY() - 60;
        const hour = new Date().getHours();
        const night = hour >= 23 || hour < 6;
        let sitP = gloomy ? 0.2 : 0.08;
        let funP = lively ? 0.18 : 0.1;
        let walkP = lively ? 0.66 : 0.6;
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
        const e0 = companionState.currentEmotion;
        pmBadeline(e0 === '悲伤' || e0 === '孤独' || e0 === '不开心', now);
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

        if (pmState.mode === 'sleep') {
            if (!pmState.nextMurmur) pmState.nextMurmur = now + 12000 + Math.random() * 15000;
            if (now >= pmState.nextMurmur) {
                pmState.nextMurmur = now + 18000 + Math.random() * 22000;
                addMadelineMessage(dreamLines[Math.floor(Math.random() * dreamLines.length)], '默认');
            }
        }

        if (now >= pmState.modeUntil) {
            if (pmState.mode === 'sit') {
                const e = companionState.currentEmotion;
                const hour = new Date().getHours();
                const sleepy = (hour >= 23 || hour < 6 || e === '悲伤' || e === '孤独') ? 0.4 : 0.2;
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
            const speed = 120;
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
                    // 自己还站在禁区里时先放行（正在逃离），出去了才恢复绕行
                    if (pmCaution && !blockedAt(pmState.x, pmState.y) && blockedAt(nx, ny)) {
                        if (!blockedAt(nx, pmState.y)) ny = pmState.y;
                        else if (!blockedAt(pmState.x, ny)) nx = pmState.x;
                        else { pmDetour(now); nx = pmState.x; ny = pmState.y; }
                    }
                    pmState.x = nx;
                    pmState.y = ny;
                } else if (pmState.mode === 'walk') {
// ... existing code ...
                    pmState.mode = 'idle';
                    pmState.modeUntil = now + 300 + Math.random() * 700;
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
            // Deleted:if (pmCaution && pmState.mode !== 'peek' && blockedAt(pmState.x, pmState.y)) pmStartWalk(now);
            // 已经在走/逃跑途中不再重选目标，避免每帧换方向瞎动
            if (pmCaution && pmState.mode !== 'peek' && pmState.mode !== 'walk' && pmState.mode !== 'celebrate' && blockedAt(pmState.x, pmState.y)) pmStartWalk(now);

// ... existing code ...
        }

        let hopOffset = 0;
        const hopping = pmState.hopT >= 0 && (pmState.mode === 'walk' || pmState.mode === 'celebrate') && !posing;
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
    const bd = document.createElement('img');
    bd.id = 'pixelBadeline';
    bd.style.cssText = 'position:fixed;left:0;top:0;z-index:99;pointer-events:none;opacity:0;transition:opacity .8s;image-rendering:pixelated;filter:drop-shadow(0 0 6px rgba(140,120,255,.45));';
    document.body.appendChild(bd);
    const BD_IDLE = [];
    for (let i = 0; i < 9; i++) BD_IDLE.push('celeste-player/badeline/idle' + String(i).padStart(2, '0') + '.png');
    BD_IDLE.forEach(s => { const im = new Image(); im.src = s; });
    let bdOn = false, bdFi = 0;
    setInterval(() => {
        if (!bdOn) return;
        bd.src = BD_IDLE[bdFi % BD_IDLE.length];
        bdFi++;
    }, 110);
    function pmBadeline(gloomy, now) {
        if (gloomy && !bdOn) { bdOn = true; bd.style.opacity = '0.92'; bd.style.width = '52px'; }
        if (!gloomy && bdOn) { bdOn = false; bd.style.opacity = '0'; }
        if (!bdOn) return;
        const off = Math.sin(now / 700) * 5;
        const bx = Math.min(window.innerWidth - 60, Math.max(8, pmState.x + pmState.dir * 72));
        bd.style.transform = 'translate(' + bx + 'px,' + (pmState.y - 14 + off) + 'px)' + (pmState.dir < 0 ? ' scaleX(-1)' : '');
    }
    requestAnimationFrame(pmLoop);
    if (pmCaution && blockedAt(pmState.x, pmState.y)) {
        let found = false;
        for (let v = 8; v <= window.innerWidth - 72; v += 24) {
            if (!blockedAt(v, pmGroundY())) { pmState.x = v; pmState.y = pmGroundY(); found = true; break; }
        }
        if (!found) { pmState.x = 8; pmState.y = 60; }
    }
    window.addEventListener('resize', () => { pmState.y = Math.min(pmState.y, pmGroundY()); });
    window.addEventListener('feather-finished', () => {
        addMadelineMessage('回来啦。刚才跟着羽毛的那一会儿，心里是不是安静了一点？', '可爱');
    });
    let lastComfortAt = 0;
    function pmComfort() {
        if (performance.now() - lastComfortAt < 10 * 60 * 1000) return;
        lastComfortAt = performance.now();
        const bk = document.getElementById('journalBook');
        const rect = bk ? bk.getBoundingClientRect() : null;
        const gy = pmGroundY();
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        let px = Math.max(8, window.innerWidth * 0.12);
        if (rect) {
            const rightX = rect.right + 18;
            const leftX = rect.left - pm.offsetWidth - 18;
            if (rightX + pm.offsetWidth <= maxX && !blockedAt(rightX, gy)) px = rightX;
            else if (leftX >= 4 && !blockedAt(leftX, gy)) px = leftX;
        }
        pmState.mode = 'peek';
        pmState.targetX = px;
        pmState.targetY = gy;
        pmSetSrc(PM_SRC.move);
    }

    const dreamLines = ['唔……再睡五分钟……', '（梦话）雪……别停……', '嗯……山顶……快到了……', '（翻身）……草莓……', '……别关灯……'];
    function pmMilestone(cnt) {
        const lines = {
            5: '第五篇啦！这本日记越来越像你了。',
            10: '第十篇！看，坚持一件事也没那么难，对吧？',
            20: '二十篇了……回头看看第一篇，你会吓一跳的。',
            30: '三十篇……这本子快装不下你的故事了，我好喜欢。',
            50: '五十篇！要不要给自己鼓个掌？',
            100: '第一百篇。这座山，你一步一步走上来了。'
        };
        if (lines[cnt]) addMadelineMessage(lines[cnt], '可爱');
    }
    let pauseTimer = null;
    let lastPauseCare = 0;
    const pauseLines = ['写到一半停下来也没关系，我等你。', '慢慢想，字会自己来的。', '深呼吸一下……我在旁边呢。'];
    contentInput.addEventListener('input', () => {
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => {
            if (chatOpen || !contentInput.value.trim()) return;
            if (performance.now() - lastPauseCare < 5 * 60 * 1000) return;
            lastPauseCare = performance.now();
            addMadelineMessage(pauseLines[Math.floor(Math.random() * pauseLines.length)], '可爱');
        }, 25000);
    });

    const petLines = ['嘿嘿…再摸一下也可以哦。', '唔，头发要被你摸乱啦。', '谢谢你，今天也辛苦了。', '嗯！感觉又充上电了。', '山顶的风，都没你这么温柔。'];
    const shooLines = ['好～我去别处逛逛！', '那我走啦，想找我双击就行。', '溜了溜了～想我了就写进日记里。', '收到！换个地方待着～'];
    function pmShoo() {
        if (pmState.mode === 'sleep') {
            addMadelineMessage(dreamLines[Math.floor(Math.random() * dreamLines.length)], '默认');
            pmState.mode = 'wake';
            pmState.modeUntil = performance.now() + 2300;
            pmSetSrc(PM_SRC.wake);
            return;
        }
        addMadelineMessage(shooLines[Math.floor(Math.random() * shooLines.length)], '可爱');
        pmStartWalk(performance.now());
        pmState.hopT = 0;
    }
    const scoldLines = ['呀！？对、对不起！我挡到你了，马上挪开！', '呜哇！抱歉抱歉，我这就走，接下来一阵子都不靠近这里！', '噫！是我不对…我绕远路走，真的！'];
    function pmScold() {
        addMadelineMessage(scoldLines[Math.floor(Math.random() * scoldLines.length)], '惊讶');
        pmCaution = true;
        zoneScoldUntil = performance.now() + 8 * 60 * 1000;
        pmState.poseUntil = performance.now() + 900;
        pmState.poseReturn = PM_SRC.move;
        pmSetSrc(PM_SRC.fun);
        const gy = pmGroundY();
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        const farX = pmState.x < window.innerWidth / 2 ? maxX - 8 : 8;
        if (!blockedAt(farX, gy)) { pmState.targetX = farX; pmState.targetY = gy; }
        else { const t = pmPickTarget(); pmState.targetX = t.x; pmState.targetY = t.y; }
        pmState.mode = 'walk';
        pmState.modeUntil = performance.now() + 9000;
        pmState.hopT = 0;
    }
    function pmPet() {
        if (pmState.mode === 'sleep') {
            addMadelineMessage(dreamLines[Math.floor(Math.random() * dreamLines.length)], '默认');
            return;
        }
        addMadelineMessage(petLines[Math.floor(Math.random() * petLines.length)], '可爱');
        pmState.poseUntil = performance.now() + 1300;
        pmState.poseReturn = PM_SRC.move;
        pmSetSrc(PM_SRC.fun);
    }
    let pmClickTimer = null;
    pm.addEventListener('click', () => {
        if (pmClickTimer) return;
        pmClickTimer = setTimeout(() => {
            pmClickTimer = null;
            if (blockedAt(pmState.x, pmState.y)) pmScold();
            else pmPet();
        }, 260);
    });
    // 双击像素 Madeline → 开关聊天历史记录框
    pm.addEventListener('dblclick', () => {
        if (pmClickTimer) { clearTimeout(pmClickTimer); pmClickTimer = null; }
        toggleChat();
    });



    // ===== 主线2：回忆书架 =====
    let editingDiaryId = null;
    const shelfBtn = document.createElement('button');
    shelfBtn.id = 'shelfBtn';
    shelfBtn.textContent = '📚 回忆书架';
    document.body.appendChild(shelfBtn);

    const shelfPanel = document.createElement('div');
    shelfPanel.id = 'shelfPanel';
    shelfPanel.innerHTML =
        '<div class="shelf-head"><h3>回忆书架</h3><button class="shelf-close">✕</button></div>' +
        '<div id="shelfList"></div>' +
        '<div id="shelfDetail">' +
        '<button class="sd-back">← 返回列表</button>' +
        '<div class="sd-title"></div><div class="sd-date"></div><div class="sd-content"></div>' +
        '<div class="sd-actions"><button class="sd-edit">回去编辑这篇</button><button class="sd-del danger">删掉它</button></div>' +
        '</div>';
    document.body.appendChild(shelfPanel);

    const shelfList = shelfPanel.querySelector('#shelfList');
    const shelfDetail = shelfPanel.querySelector('#shelfDetail');
    let shelfData = [];
    let shelfCur = null;

    function shelfFmtDate(v) {
        if (!v) return '';
        const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
        if (isNaN(d.getTime())) return String(v);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    async function shelfLoad() {
        shelfList.innerHTML = '<div class="shelf-empty">正在搬书……</div>';
        const res = await api('/diary/list', 'GET');
        if (res.success && Array.isArray(res.data)) {
            shelfData = res.data;
            if (!shelfData.length) { shelfList.innerHTML = '<div class="shelf-empty">书架还空着。<br>写下第一篇，它就有了位置。</div>'; return; }
            shelfList.innerHTML = shelfData.map((d, i) =>
                '<div class="shelf-card" data-i="' + i + '">' +
                '<div class="sc-title">' + escHtml(d.title || '无题') + '</div>' +
                '<div class="sc-date">' + shelfFmtDate(d.updateDate || d.createDate) + '</div>' +
                '<div class="sc-snippet">' + escHtml((d.content || '').slice(0, 60)) + '</div>' +
                '</div>').join('');
        } else {
            shelfList.innerHTML = '<div class="shelf-empty">书架暂时打不开（' + escHtml(res.msg || '未知错误') + '）</div>';
        }
    }
    function shelfShowList() { shelfDetail.classList.remove('show'); shelfList.style.display = ''; }
    // ===== 主线2.5：记忆联动 =====
    let memCache = null;
    const memMentioned = new Set();
    async function shelfLoadMemories() {
        try {
            const res = await api('/memory/list', 'GET');
            memCache = (res.success && Array.isArray(res.data)) ? res.data : [];
        } catch (e) { memCache = []; }
    }
    function shelfMemoryRecall(text, days) {
        if (!text || days <= 0) return;
        if (!memCache) { shelfLoadMemories().then(() => shelfMemoryRecall(text, days)); return; }
        const clean = t => String(t).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
        const grams = t => { const g = []; const c = clean(t); for (let i = 0; i < c.length - 1; i++) g.push(c.slice(i, i + 2)); return g; };
        let best = null, bestScore = 0;
        for (const m of memCache) {
            if (!m.content || memMentioned.has(m.id)) continue;
            let score = 0;
            for (const g of grams(m.content)) if (clean(text).indexOf(g) !== -1) score++;
            if (score > bestScore) { bestScore = score; best = m; }
        }
        if (!best || bestScore < 2) {
            const cand = memCache.filter(m => m.content && !memMentioned.has(m.id))
                .sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
            if (cand && memMentioned.size === 0) { best = cand; bestScore = 1; }
        }
        if (best) {
            memMentioned.add(best.id);
            const lines = bestScore >= 2
                ? ['说起来，你之前提到过——' + best.content + '……现在怎么样了？',
                   '我记得你说过，' + best.content + '。后来有好一点吗？',
                   '这一页让我想起你提过的那件事：' + best.content + '。我一直记着哦。']
                : ['翻到这一页，忽然想起你之前说过——' + best.content + '。'];
            setTimeout(() => addMadelineMessage(lines[Math.floor(Math.random() * lines.length)], '可爱'), 3400);
        }
    }
    function shelfShowDetail(i) {
        const d = shelfData[i];
        if (!d) return;
        shelfCur = d;
        shelfList.style.display = 'none';
        shelfDetail.querySelector('.sd-title').textContent = d.title || '无题';
        shelfDetail.querySelector('.sd-date').textContent = shelfFmtDate(d.updateDate || d.createDate);
        shelfDetail.querySelector('.sd-content').textContent = d.content || '';
        shelfDetail.classList.add('show');
        const created = new Date(typeof d.createDate === 'number' || /^\d+$/.test(String(d.createDate)) ? Number(d.createDate) : d.createDate);
        const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
        if (days > 0) addMadelineMessage('这是 ' + days + ' 天前写下的……那时候的你，还好吗？', '可爱');
        // ... existing code ...
        shelfMemoryRecall(d.content || '', days);
    }
    shelfBtn.addEventListener('click', () => { location.href = 'shelf.html'; });
    shelfPanel.querySelector('.shelf-close').addEventListener('click', () => shelfPanel.classList.remove('open'));
// ... existing code ...
    shelfPanel.querySelector('.sd-back').addEventListener('click', shelfShowList);
    shelfList.addEventListener('click', ev => {
        const card = ev.target.closest('.shelf-card');
        if (card) shelfShowDetail(+card.dataset.i);
    });
    shelfDetail.querySelector('.sd-edit').addEventListener('click', () => {
        if (!shelfCur) return;
        editingDiaryId = shelfCur.id;
        titleInput.value = shelfCur.title || '';
        contentInput.value = shelfCur.content || '';
        shelfPanel.classList.remove('open');
        addMadelineMessage('我把那一页翻开放好了，改完记得保存哦。', '可爱');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    shelfDetail.querySelector('.sd-del').addEventListener('click', async () => {
        if (!shelfCur) return;
        if (!confirm('确定要删掉这篇日记吗？删了就找不回来了。')) return;
        const res = await api('/diary?diaryId=' + encodeURIComponent(shelfCur.id), 'DELETE');
        if (res.success) {
            addMadelineMessage('好，我替你合上这一页了。', '默认');
            shelfShowList();
            shelfLoad();
        } else {
            showToast(res.msg || '删除失败', 'error');
        }
    });

    (async function init() {
        if (!localStorage.getItem('token')) {
            alert('请先登录');
            location.href = 'login.html';
            return;
        }

        // BGM
        const bgmPlayer = document.getElementById('bgmPlayer');
        applyBerryBgm();
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
        // ===== 主线5：时段人格 =====
        const _nowH = new Date().getHours();
        const morningLines = ['早安……我刚醒。今天也一起写点什么吧。', '早上好呀！清晨的山上空气最新鲜了。', '早~ 我刚睡醒，你来得正好。'];
        const dayLines = ['Hey! I\'m Madeline. Let\'s record life together.', '你来啦。我一直在这儿等你呢。', '今天想记点什么？一件小事也可以哦。'];
        const eveningLines = ['回来啦。这一天，过得还好吗？', '晚上好~ 坐下来慢慢说。', '天快黑了，正是写几笔的好时候。'];
        const deepNightLines = ['这么晚还没睡呀……那我陪你，但别太晚哦。', '夜里山上很安静。写一点，我们就去睡好不好？', '唔……好晚了。我在呢，陪着你。'];
        let _greet;
        if (_nowH >= 5 && _nowH < 9) {
            _greet = morningLines[Math.floor(Math.random() * morningLines.length)];
            pmState.poseUntil = performance.now() + 2000;
            pmState.poseReturn = PM_SRC.move;
            pmSetSrc(PM_SRC.wake);
        } else if (_nowH >= 9 && _nowH < 18) {
            _greet = dayLines[Math.floor(Math.random() * dayLines.length)];
        } else if (_nowH >= 18 && _nowH < 23) {
            _greet = eveningLines[Math.floor(Math.random() * eveningLines.length)];
        } else {
            _greet = deepNightLines[Math.floor(Math.random() * deepNightLines.length)];
        }
        addMadelineMessage(_greet, '可爱');

        // 久别重逢（超过 7 天没来）
        const _lastVisit = parseInt(localStorage.getItem('pmLastVisit') || '0');
        const _gapDays = _lastVisit ? Math.floor((Date.now() - _lastVisit) / 86400000) : 0;
        localStorage.setItem('pmLastVisit', String(Date.now()));
        if (_gapDays >= 7) {
            const reunionLines = [
                '你回来了……已经过了 ' + _gapDays + ' 天了呢，还好吗？',
                '又见到你了。这段时间发生的事，想说给我听吗？',
                '我把本子都擦干净了，就在等你回来呀。'
            ];
            setTimeout(() => addMadelineMessage(reunionLines[Math.floor(Math.random() * reunionLines.length)], '可爱'), 2600);
        }

        // 深夜催睡（23 点后，停留满 8 分钟，只催一次）
        if (_nowH >= 23 || _nowH < 5) {
            setTimeout(() => {
                const h2 = new Date().getHours();
                if ((h2 >= 23 || h2 < 5) && !nightCareSaid) {
                    nightCareSaid = true;
                    const careLines = ['已经好晚了……写完这一段，我们就去睡好不好？', '我都有点困了。你早点写完，早点休息哦。', '别熬太久嘛，明天我还会在这里的。'];
                    addMadelineMessage(careLines[Math.floor(Math.random() * careLines.length)], '可爱');
                }
            }, 8 * 60 * 1000);
        }

        showQuickInput(true);
        scheduleNextBubble();

        const editId = new URLSearchParams(location.search).get('edit');
        if (editId) {
            history.replaceState(null, '', 'diary.html');
            api('/diary/list', 'GET').then(r => {
                if (r.success && Array.isArray(r.data)) {
                    const d = r.data.find(x => String(x.id) === String(editId));
                    if (d) {
                        editingDiaryId = d.id;
                        titleInput.value = d.title || '';
                        contentInput.value = d.content || '';
                        addMadelineMessage('从书架翻出来啦，改完记得 SAVE 哦。', '可爱');
                    }
                }
            });
        }

        // 每日明信片（每天只弹一次）
        const today = new Date().toDateString();
        const lastShown = localStorage.getItem('postcardDate');
        if (lastShown !== today) {
            await showDailyPostcard();
        }

    // ================================================================
    // ===== 主线4：草莓与篝火（收集系统） =====
    // ================================================================
        const berrySound = new Audio('celeste-sounds/strawberry.wav');
        berrySound.volume = 0.7;
        function playBerrySound() {
            if (!window.__audioGestured) return;
            try { berrySound.currentTime = 0; berrySound.play().catch(() => {}); } catch (e) {}
        }

        function berryBalance() {
            return window.berryBalance();
        }
        function applyBerryBgm() {
            const p = localStorage.getItem('berryBgm');
            const src = document.querySelector('#bgmPlayer source');
            if (src && p) { src.src = 'bgm/' + p + '.mp3'; }
        }

        function refreshShopUI() {
            const c = document.getElementById('sbCount');
            if (c) c.textContent = berryBalance();
        }
        function initStrawberryShop() {
            if (document.getElementById('strawberryBonfire')) return;
            const w = document.createElement('div');
            w.id = 'strawberryBonfire';
            w.innerHTML =
                '<div class="sb-straw"><img src="celeste-collectables/strawberry.png" alt="strawberry"><span id="sbCount">0</span></div>' +
                '<a class="sb-shop-link" id="sbShopLink" href="shop.html" title="草莓商店">商店</a>';
            document.body.appendChild(w);
            w.addEventListener('click', e => {
                if (e.target.closest('#sbShopLink')) return;
                addMadelineMessage('你现在有 ' + berryBalance() + ' 颗草莓。点「商店」去换好东西～', '可爱');
            });
            refreshShopUI();
        }
    function updateBonfire(d) {
        const fire = document.getElementById('sbFire');
        const cnt = document.getElementById('sbCount');
        if (!fire || !cnt) return;
        cnt.textContent = d.total;
        const s = d.streak;
        let sz, clr, clr2, show = false;
        if (s >= 30)      { sz = 26; clr = '#ff4444'; clr2 = '#ffe36d'; show = true; }
        else if (s >= 7)  { sz = 20; clr = '#ff6600'; clr2 = '#ffcc00'; show = true; }
        else if (s >= 3)  { sz = 15; clr = '#ff8800'; clr2 = '#ffaa33'; show = true; }
        else if (s >= 1)  { sz = 9;  clr = '#ffaa44'; clr2 = '#ffcc66'; show = true; }
        else              { sz = 0; clr = '#888'; clr2 = '#aaa'; }
        fire.querySelectorAll('.sb-flame,.sb-spark,.sb-smoke,.sb-label').forEach(e => e.remove());
        if (show) {
            const fl = document.createElement('div');
            fl.className = 'sb-flame';
            fl.style.cssText = 'width:' + sz + 'px;height:' + (sz * 1.4) + 'px;background:radial-gradient(ellipse at bottom,' + clr2 + ',' + clr + ' 70%,transparent);box-shadow:0 0 ' + (sz / 2) + 'px ' + clr + ';';
            fire.insertBefore(fl, fire.firstChild);
            if (s >= 3) for (let i = 0; i < 2; i++) {
                const sp = document.createElement('div');
                sp.className = 'sb-spark';
                sp.style.cssText = 'left:' + (30 + Math.random() * 40) + '%;bottom:' + (4 + sz * 0.6) + 'px;animation-delay:' + (Math.random() * 1.2) + 's;';
                fire.appendChild(sp);
            }
            const lb = document.createElement('div');
            lb.className = 'sb-label';
            lb.textContent = s >= 30 ? '\u2605' + s : s + '天';
            fire.appendChild(lb);
        } else {
            const sm = document.createElement('div');
            sm.className = 'sb-smoke';
            sm.style.cssText = 'left:50%;bottom:6px;transform:translateX(-50%);';
            fire.insertBefore(sm, fire.firstChild);
        }
    }
    function onSaveStreak() {
        const today = new Date().toDateString();
        const last = localStorage.getItem('diaryLastSaveDate') || '';
        const prev = parseInt(localStorage.getItem('diaryStreak') || '0');
        let streak;
        if (!last) streak = 1;
        else if (last === today) streak = prev;
        else {
            const y = new Date(); y.setDate(y.getDate() - 1);
            streak = (last === y.toDateString()) ? prev + 1 : 1;
        }
        localStorage.setItem('diaryStreak', String(streak));
        localStorage.setItem('diaryLastSaveDate', today);
        const total = parseInt(localStorage.getItem('diarySaveCount') || '0');
        updateBonfire({ total: total, streak: streak });
        const lines3 = ['三天了！篝火生起来了……我们在这里扎营了。', '连续三天！山上的篝火最温暖。'];
        const lines7 = ['一周了！你真的坚持下来了……我很感动。', '七天连续，这篝火够照亮整个山脊了。'];
        const lines30 = ['三十天……你已经是山上的老朋友了。', '传说连续写三十天日记的人，能看见山顶的星星。'];
        if (streak === 3) addMadelineMessage(lines3[Math.floor(Math.random() * lines3.length)], '可爱');
        if (streak === 7) addMadelineMessage(lines7[Math.floor(Math.random() * lines7.length)], '可爱');
        if (streak === 30) addMadelineMessage(lines30[Math.floor(Math.random() * lines30.length)], '可爱');

        refreshShopUI();
    }

    // ================================================================
    // ===== 主线7：明信片导出 =====
    // ================================================================
    function renderPostcardCanvas(canvas, title, dateStr, content, summary, strawCount) {
        var ctx = canvas.getContext('2d');
        var W = 1200, H = 800;
        canvas.width = W; canvas.height = H;
        ctx.fillStyle = '#0f1729'; ctx.fillRect(0, 0, W, H);
        var grad = ctx.createLinearGradient(0, 0, 0, 320);
        grad.addColorStop(0, '#1a2744'); grad.addColorStop(1, '#0f1729');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, W, 320);
        for (var i = 0; i < 50; i++) {
            ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.4 + 0.1) + ')';
            var sx = Math.random() * W, sy = Math.random() * 260, ss = Math.random() * 2 + 0.5;
            ctx.fillRect(Math.floor(sx), Math.floor(sy), ss, ss);
        }
        ctx.fillStyle = '#1e2d4a';
        ctx.beginPath(); ctx.moveTo(0, 300);
        ctx.lineTo(120, 170); ctx.lineTo(280, 230); ctx.lineTo(480, 110);
        ctx.lineTo(680, 190); ctx.lineTo(880, 130); ctx.lineTo(1060, 200);
        ctx.lineTo(W, 260); ctx.lineTo(W, 320); ctx.lineTo(0, 320);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#253552';
        ctx.beginPath(); ctx.moveTo(0, 310);
        ctx.lineTo(200, 250); ctx.lineTo(400, 280); ctx.lineTo(600, 220);
        ctx.lineTo(800, 265); ctx.lineTo(1000, 235); ctx.lineTo(W, 285);
        ctx.lineTo(W, 320); ctx.lineTo(0, 320);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe36d';
        ctx.font = '22px "Press Start 2P",monospace';
        ctx.fillText('MOUNTAIN DIARY', 60, 380);
        ctx.fillStyle = 'rgba(255,227,109,.45)';
        ctx.font = '13px "Press Start 2P",monospace';
        ctx.fillText(dateStr || '', 60, 410);
        ctx.fillStyle = '#ffe36d';
        ctx.fillRect(60, 425, W - 120, 2);
        ctx.fillStyle = '#fff';
        ctx.font = '24px "Renogare","Microsoft YaHei",sans-serif';
        var dt = (title || '无题').substring(0, 36);
        ctx.fillText(dt, 60, 470);
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.font = '15px "Renogare","CelesteZH","Microsoft YaHei",sans-serif';
        var snip = (content || '').substring(0, 280);
        var words = snip.split('');
        var line = '', ly = 510, mh = 630, ml = Math.floor((W - 120) / 15);
        for (var ci = 0; ci < words.length; ci++) {
            if (words[ci] === '\n') { ctx.fillText(line, 60, ly); line = ''; ly += 28; if (ly > mh) break; continue; }
            if ((line + words[ci]).length > ml) { ctx.fillText(line, 60, ly); line = words[ci]; ly += 28; if (ly > mh) break; }
            else line += words[ci];
        }
        if (line && ly <= mh) ctx.fillText(line, 60, ly);
        if (summary) {
            var sy2 = Math.min(ly + 45, 660);
            ctx.fillStyle = 'rgba(255,227,109,.5)';
            ctx.fillRect(60, sy2 - 12, W - 120, 1);
            ctx.fillStyle = 'rgba(255,227,109,.75)';
            ctx.font = '14px "Renogare","CelesteZH","Microsoft YaHei",sans-serif';
            var st = summary.substring(0, 80);
            ctx.fillText('\u201c' + st + '\u201d', 80, sy2 + 14);
        }
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.font = '11px "Press Start 2P",monospace';
        ctx.fillText('\u00d7' + (strawCount || 0) + '  \u2014 Madeline', 60, H - 36);
        ctx.fillStyle = 'rgba(255,230,109,.25)';
        for (var bx = 0; bx < W; bx += 8) { ctx.fillRect(bx, 0, 4, 4); ctx.fillRect(bx, H - 4, 4, 4); }
        for (var by = 0; by < H; by += 8) { ctx.fillRect(0, by, 4, 4); ctx.fillRect(W - 4, by, 4, 4); }
    }
        function exportPostcard(data) {
            var modal = document.getElementById('postcardExportModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'postcardExportModal';
                modal.innerHTML = '<canvas id="postcardCanvas"></canvas><div class="pe-actions"><button id="peDownload">\u2b07 下载明信片</button><button class="pe-close" id="peClose">\u2715 关闭</button></div>';
                document.body.appendChild(modal);
                document.getElementById('peClose').addEventListener('click', function() { modal.classList.remove('show'); pcPlay('ui_main_postcard_variants_out.wav'); });
                modal.addEventListener('click', function(e) { if (e.target === modal) { modal.classList.remove('show'); pcPlay('ui_main_postcard_variants_out.wav'); } });
            }
            var canvas = document.getElementById('postcardCanvas');
            renderPostcardCanvas(canvas, data.title, data.date, data.content, data.summary, parseInt(localStorage.getItem('diarySaveCount') || '0'));
            document.getElementById('peDownload').onclick = function() {
                var url = canvas.toDataURL('image/png');
                var a = document.createElement('a');
                a.download = 'mountain-diary-' + (data.date || '').replace(/\D/g, '').slice(0, 8) + '.png';
                a.href = url;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            };
            modal.classList.add('show');
            pcPlay('ui_main_postcard_variants_in.wav');
        }

    // ===== 书架面板集成导出按钮 =====
    (function shelfPostcardHook() {
        var tryHook = setInterval(function() {
            var editBtn = document.querySelector('#shelfDetail .sd-edit');
            if (!editBtn || editBtn.dataset.hooked) return;
            editBtn.dataset.hooked = '1';
            var exp = document.createElement('button');
            exp.textContent = '🖼 导出明信片';
            exp.addEventListener('click', function() {
                if (!shelfCur) return;
                var dd = shelfFmtDate(shelfCur.updateDate || shelfCur.createDate);
                exportPostcard({ title: shelfCur.title, date: dd, content: shelfCur.content, summary: '' });
            });
            editBtn.parentNode.insertBefore(exp, editBtn.nextSibling);
        }, 500);
        setTimeout(function() { clearInterval(tryHook); }, 30000);
    })();
        // ===== 节日彩蛋（公历自动判定 + 农历硬编码表） =====
        const HOLIDAY_EGGS = {
            '1-1':   { e: '可爱', l: ['新年快乐！今年的山刚开门，我们一起慢慢爬。', '新的一年，新的路线。我还是走在你前面等你。'] },
            '2-14':  { e: '可爱', l: ['情人节快乐～今天我就是你的 Valentine！', '山顶那颗心是最好的礼物，我们去把它取下来吧。'] },
            '4-1':   { e: '惊讶', l: ['嘿嘿，我把你的草莓藏起来了～……开玩笑的，在页面里呢。', '愚人节快乐！今天的雪是柠檬味的，别尝。'] },
            '5-1':   { e: '可爱', l: ['劳动节快乐！今天不写日记也算正经休息。', '登山的人也要有休息日，今天推荐躺平。'] },
            '6-1':   { e: '可爱', l: ['儿童节快乐！今天谁都可以当小孩。', '今日任务：尽情玩。日记嘛，可写可不写。'] },
            '10-1':  { e: '可爱', l: ['国庆快乐！长假正好用来慢慢爬山。', '假期模式开启～写一篇，还是出去走走？'] },
            '10-24': { e: '惊讶', l: ['1024！程序员节快乐，愿你的代码一次跑通、日记永不丢失～', '今天的 bug 都被我吓跑啦，放心写。'] },
            '10-31': { e: '不安', l: ['万圣夜……镜子里那位 Badeline 今天化了妆。', '不给草莓就捣蛋！……好吧，给你唱首歌也行。'] },
            '11-11': { e: '无语', l: ['双十一……购物车是空的，背包里全是故事。', '别冲动消费，我念一段日记给你冷静一下？'] },
            '12-25': { e: '可爱', l: ['圣诞快乐～雪山就是全世界最大的圣诞树！', '叮叮当～你的草莓今天挂上去当装饰了。'] },
            '1-25':  { e: '惊讶', l: ['今天是 Celeste 的生日！谢谢你陪我爬这座山。', '1 月 25，登山纪念日。还记得第一次冲刺吗？'] },
            // 农历固定表（2026-2027），到期可续加
            '2026-2-16':  { e: '可爱', l: ['除夕夜！山下的灯都亮了，吃完饺子再写也不迟。'] },
            '2026-2-17':  { e: '可爱', l: ['春节快乐！新年第一页日记，留给最想说的话。', '过年好～红包拿来……啊不，草莓拿来！'] },
            '2026-6-19':  { e: '可爱', l: ['端午安康！粽子要趁热吃，日记要趁想写。'] },
            '2026-9-25':  { e: '可爱', l: ['中秋快乐～山顶的月亮，比哪里的都圆。'] },
            '2027-2-5':   { e: '可爱', l: ['除夕夜！这一年辛苦啦，山上见。'] },
            '2027-2-6':   { e: '可爱', l: ['春节快乐！新的一年，继续一步一步来。'] },
            '2027-6-9':   { e: '可爱', l: ['端午安康！今天的风里有粽叶香。'] },
            '2027-9-15':  { e: '可爱', l: ['中秋快乐～把月亮写进今天的日记里吧。'] }
        };
        (function holidayGreet() {
            const d = new Date();
            const fullKey = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
            const mdKey = (d.getMonth() + 1) + '-' + d.getDate();
            const egg = HOLIDAY_EGGS[fullKey] || HOLIDAY_EGGS[mdKey];
            if (!egg) return;
            const stamp = 'diaryHoliday_' + mdKey + '_' + d.getFullYear();
            if (localStorage.getItem(stamp) === d.toDateString()) return;
            localStorage.setItem(stamp, d.toDateString());
            setTimeout(() => addMadelineMessage(egg.l[Math.floor(Math.random() * egg.l.length)], egg.e), 2500);
        })();


    // ===== 迭代7：道别 =====
    const farewellLines = ['下次见啦，我把你没写完的部分收好了。', '别担心，这一页我替你记着呢。', '去忙吧，山在这里，我也在这里。'];
    window.addEventListener('beforeunload', () => {
        const t = titleInput.value.trim();
        const c = contentInput.value.trim();
        if (c) {
            localStorage.setItem('diaryUnsaved', JSON.stringify({ t: t, c: c }));
            localStorage.setItem('diaryFarewell', farewellLines[Math.floor(Math.random() * farewellLines.length)]);
        }
    });
    const _fw = localStorage.getItem('diaryFarewell');
    const _unsaved = localStorage.getItem('diaryUnsaved');
    if (_fw) {
        localStorage.removeItem('diaryFarewell');
        addMadelineMessage(_fw, '可爱');
    }
    if (_unsaved) {
        localStorage.removeItem('diaryUnsaved');
        try {
            const u = JSON.parse(_unsaved);
            if (!contentInput.value.trim() && u.c) {
                titleInput.value = u.t || '';
                contentInput.value = u.c;
            }
        } catch (e) { }
    }

    const idleCareLines = ['还在吗？…我先坐着等你。', '慢慢来，我不催你。', '要是累了，就歇一会儿再写。'];
    let lastIdleCare = 0;
    let idleCareTimer = setTimeout(idleCare, 180000);
    function idleCare() {
        if (!chatOpen && contentInput.value.trim() && performance.now() - lastIdleCare > 5 * 60 * 1000) {
            lastIdleCare = performance.now();
            addMadelineMessage(idleCareLines[Math.floor(Math.random() * idleCareLines.length)], '可爱');
        }
        idleCareTimer = setTimeout(idleCare, 180000);
    }
    ['mousedown', 'keydown', 'touchstart'].forEach(evt =>
        document.addEventListener(evt, () => {
            clearTimeout(idleCareTimer);
            idleCareTimer = setTimeout(idleCare, 180000);
        }, { passive: true })
    );
        initStrawberryShop();
    })();

})();
