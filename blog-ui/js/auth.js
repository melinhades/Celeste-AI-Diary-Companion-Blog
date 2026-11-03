// 初始化头部用户状态
function initHeader() {
    const token = localStorage.getItem('token');
    const nickname = localStorage.getItem('nickname');
    const el = document.getElementById('headerRight');
    if (!el) return;
    if (token && nickname) {
        el.innerHTML = `
            <div class="user-info">
                <a href="me.html" class="user-self" title="我的空间">
                    <div class="user-avatar"><img src="celeste-gui/user-avatar.webp" alt=""></div>
                    <span>${escHtml(nickname)}</span>
                </a>
                <a href="celeste-farewell-remembered-demo.html" class="chat-crow" title="Chat"><span class="chat-crow-box"><img src="Atlases/Gameplay/characters/bird/crow00.png" alt="Chat"></span><i id="bellBadge" style="display:none;position:absolute;top:-7px;right:-7px;background:#e6517c;color:#fff;font-style:normal;font-size:10px;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center;padding:0 3px;"></i></a>
                <button class="btn btn-outline btn-sm" onclick="openApiKeyModal()" title="AI 助手 API Key 设置" style="padding:4px 8px;font-size:12px;">🔑 AI</button>
                <a href="write.html" class="btn btn-primary btn-sm">写文章</a>
                <button class="btn btn-outline btn-sm" onclick="doLogout()">退出</button>
            </div>`;
        refreshBell();
        setInterval(refreshBell, 30000);
    } else {
        el.innerHTML = `
            <a href="login.html" class="btn btn-outline">登录</a>
            <a href="register.html" class="btn btn-primary">注册</a>`;
    }
}

function doLogout() {
    const token = localStorage.getItem('token');
    try {
        const s = new Audio('celeste-sounds/ui_main_assistmode_whistle_no.wav');
        s.volume = 0.8;
        s.play().catch(() => {});
    } catch (e) { /* 无声降级 */ }
    if (token) {
        // 必须在删除本地 token 前调用：api() 此时才能读到 Authorization
        // api() 内部使用项目已有 BASE_URL，生产走 https://api.instapix.icu
        api('/logout', 'GET').catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('nickname');
    // 明信片署名等展示缓存随登出作废，否则未登录/下个账号会看到上一个人的名字
    if (typeof clearSessionDisplayStorage === 'function') clearSessionDisplayStorage();
    initHeader();
}

function requireLogin() {
    if (!localStorage.getItem('token')) {
        showToast('请先登录', 'error');
        setTimeout(() => location.href = 'login.html', 1000);
        return false;
    }
    return true;
}

let lastUnread = -1;
function refreshBell() {
    const b = document.getElementById('bellBadge');
    if (!b) return;
    api('/notifications/unread', 'GET').then(res => {
        const n = res.success ? Number(res.data || 0) : 0;
        b.textContent = n > 99 ? '99+' : String(n);
        b.style.display = n > 0 ? 'inline-block' : 'none';
        if (lastUnread >= 0 && n > lastUnread) playNotifySound();
        lastUnread = n;
        // 单一轮询源：把未读数广播给各页面（messages 页侧栏徽标等），避免重复请求
        window.dispatchEvent(new CustomEvent('notify:unread', { detail: { unread: n } }));
    }).catch(() => {});
}

function playNotifySound() {
    try {
        const s = new Audio('celeste-sounds/notify.wav');
        s.volume = 0.6;
        s.play().catch(() => {});
    } catch (e) {}
}

// ===== AI Key 设置 Modal（所有页面共享，auth.js 挂载后全站可用）=====
(function injectApiKeyModalCss() {
    if (document.getElementById('apiKeyModalCss')) return;
    const s = document.createElement('style');
    s.id = 'apiKeyModalCss';
    s.textContent = `
#apiKeyModalMask{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
#apiKeyModal{background:#1c1f26;border-radius:14px;padding:24px 28px;min-width:360px;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:inherit;border:1px solid #2d3139;}
#apiKeyModal h3{margin:0 0 6px 0;font-size:1.05rem;color:#e8e8e8;}
#apiKeyModal .sub{font-size:.78rem;opacity:.55;margin-bottom:16px;}
.akm-option{border:2px solid #2d3139;border-radius:10px;padding:12px 14px;margin:8px 0;cursor:pointer;transition:.12s;background:rgba(255,255,255,.02);}
.akm-option:hover{border-color:#7c5cff;background:rgba(124,92,255,.08);}
.akm-option.active{border-color:#7c5cff;background:rgba(124,92,255,.14);}
.akm-option .t{font-weight:600;font-size:.92rem;color:#e8e8e8;display:flex;justify-content:space-between;align-items:center;}
.akm-option .d{font-size:.75rem;opacity:.55;margin-top:3px;}
.akm-option .radio{color:#7c5cff;font-size:.9rem;font-weight:700;}
.akm-input{width:100%;padding:9px 11px;margin-top:10px;border-radius:7px;border:1px solid #2d3139;background:rgba(0,0,0,.35);color:#e8e8e8;font-family:inherit;font-size:.85rem;box-sizing:border-box;}
.akm-input:focus{outline:none;border-color:#7c5cff;}
.akm-row{display:flex;gap:10px;margin-top:16px;}
.akm-row button{flex:1;padding:8px;border-radius:7px;font-size:.85rem;cursor:pointer;border:none;font-family:inherit;transition:.1s;}
.akm-save{background:#7c5cff;color:#fff;}
.akm-save:hover{background:#6a4be6;}
.akm-save:disabled{opacity:.5;cursor:not-allowed;}
.akm-cancel{background:transparent;color:#aaa;border:1px solid #3a3f4b;}
.akm-cancel:hover{background:rgba(255,255,255,.05);}
.akm-err{font-size:.75rem;color:#ff6b6b;margin-top:6px;min-height:1em;}
`;
    document.head.appendChild(s);
})();

function openApiKeyModal() {
    if (document.getElementById('apiKeyModalMask')) return;

    const mask = document.createElement('div');
    mask.id = 'apiKeyModalMask';
    mask.innerHTML = `
    <div id="apiKeyModal">
        <h3>🔑 AI 助手设置</h3>
        <div class="sub">选择 Madeline 对话使用的 AI Key</div>
        <div class="akm-option" data-choice="default">
            <div class="t"><span>使用系统默认 Key</span><span class="radio" id="akmRadioDefault">○</span></div>
            <div class="d">由站长统一提供，开箱即用</div>
        </div>
        <div class="akm-option" data-choice="custom">
            <div class="t"><span>使用自己的 API Key</span><span class="radio" id="akmRadioCustom">○</span></div>
            <div class="d">SiliconFlow / DeepSeek / OpenAI 兼容端点</div>
            <input class="akm-input" type="password" id="akmInput" placeholder="粘贴你的 API Key（sk-...）" style="display:none;">
        </div>
        <div class="akm-err" id="akmErr"></div>
        <div class="akm-row">
            <button class="akm-cancel" id="akmCancel">取消</button>
            <button class="akm-save" id="akmSave">保存</button>
        </div>
    </div>`;
    document.body.appendChild(mask);

    let choice = 'default';
    const cards = mask.querySelectorAll('.akm-option');
    const input = mask.querySelector('#akmInput');
    const errEl = mask.querySelector('#akmErr');

    function render() {
        mask.querySelector('#akmRadioDefault').textContent = choice === 'default' ? '●' : '○';
        mask.querySelector('#akmRadioCustom').textContent = choice === 'custom' ? '●' : '○';
        input.style.display = choice === 'custom' ? 'block' : 'none';
        mask.querySelector('[data-choice="default"]').classList.toggle('active', choice === 'default');
        mask.querySelector('[data-choice="custom"]').classList.toggle('active', choice === 'custom');
        errEl.textContent = '';
    }
    cards.forEach(c => c.addEventListener('click', () => { choice = c.dataset.choice; render(); }));
    render();

    function close() { mask.remove(); }
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    mask.querySelector('#akmCancel').addEventListener('click', close);
    document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape' && document.getElementById('apiKeyModalMask')) { close(); document.removeEventListener('keydown', escClose); }
    });

    mask.querySelector('#akmSave').addEventListener('click', async () => {
        const token = localStorage.getItem('token');
        if (!token) { showToast('登录态丢失', 'error'); close(); return; }
        let payload = {};
        if (choice === 'custom') {
            const k = input.value.trim();
            if (!k) { errEl.textContent = '请填入 API Key 或选"系统默认"'; return; }
            if (k.length < 10) { errEl.textContent = 'Key 看起来太短，请检查'; return; }
            payload = { apiKey: k };
        } else {
            payload = { apiKey: '' };
        }
        const btn = mask.querySelector('#akmSave');
        btn.disabled = true; btn.textContent = '保存中…';
        const res = await api('/users/api-key', 'PUT', payload);
        btn.disabled = false; btn.textContent = '保存';
        if (res.success) {
            showToast('AI 设置已保存', 'success');
            close();
        } else {
            errEl.textContent = res.msg || '保存失败';
        }
    });
}
