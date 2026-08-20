// ================= Madeline blip 音效（Web Audio 合成，无素材） =================
let audioCtx = null;
function playBlip() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume(); // 浏览器自动播放限制，首次交互后恢复
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    // Madeline 音高基调 ~700Hz，每字 ±50Hz 随机抖动
    osc.frequency.value = 700 + Math.random() * 100;
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
}

// ================= 打字机渲染 + blip =================
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SILENT = new Set([' ', '，', '。', '！', '？', '…', '、', '\n', ',', '.', '!', '?']);

async function typewrite(el, text) {
    let i = 0;
    for (const ch of text) {
        el.textContent += ch;
        i++;
        if (!SILENT.has(ch) && i % 2 === 0) playBlip();
        el.parentElement.scrollIntoView({ block: 'end' });
        await sleep(40);
    }
}

// ================= 消息渲染 =================
const msgList = document.getElementById('msgList');

function addMsg(role, text, personaName) {
    const div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
    if (role !== 'user') {
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = personaName || 'Madeline';
        div.appendChild(name);
    }
    const body = document.createElement('div');
    div.appendChild(body);
    msgList.appendChild(div);
    div.scrollIntoView({ block: 'end' });
    if (role === 'user') {
        body.textContent = text;
        return Promise.resolve();
    }
    return typewrite(body, text); // AI 消息打字机+音效，返回 Promise 方便等待
}

// ================= 主流程 =================
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const typing = document.getElementById('typing');

async function send() {
    const content = input.value.trim();
    if (!content) return;
    if (!localStorage.getItem('token')) {
        alert('请先登录');
        location.href = 'login.html';
        return;
    }
    input.value = '';
    sendBtn.disabled = true;
    await addMsg('user', content);
    typing.style.display = 'block';

    const res = await api('/chat', 'POST', { content });
    typing.style.display = 'none';
    sendBtn.disabled = false;
    input.focus();

    if (res.success) {
        document.getElementById('personaName').textContent = res.data.personaName || 'Madeline';
        await addMsg('ai', res.data.content, res.data.personaName);
    } else {
        await addMsg('ai', '（出错了：' + (res.msg || '未知') + '）');
    }
}

input.addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
});

// 页面加载：拉历史记录 + 检查有没有 AI 主动发来的话
(async function init() {
    if (!localStorage.getItem('token')) {
        location.href = 'login.html';
        return;
    }
    const res = await api('/chat/history?limit=50');
    if (res.success && res.data) {
        for (const m of res.data) {
            if (m.personaName) document.getElementById('personaName').textContent = m.personaName;
            // 历史记录直接显示，不走打字机
            const div = document.createElement('div');
            div.className = 'msg ' + (m.role === 'user' ? 'user' : 'ai');
            div.innerHTML = (m.role === 'user' ? '' : `<div class="name">${escHtml(m.personaName || 'Madeline')}</div>`)
                          + `<div>${escHtml(m.content)}</div>`;
            msgList.appendChild(div);
        }
        msgList.scrollTop = msgList.scrollHeight;
    }
    // 主动关怀：有未读消息则打字机播出来
    const pro = await api('/proactive/latest');
    if (pro.success && pro.data) {
        await sleep(800); // 停顿一下，像"对方刚好发来"
        await addMsg('ai', pro.data, document.getElementById('personaName').textContent);
    }
})();
