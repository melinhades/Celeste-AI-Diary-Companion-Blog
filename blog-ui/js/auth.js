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
                <a href="api-key-setup-enhanced.html" class="btn btn-outline btn-sm api-key-btn" title="AI 助手 API Key 设置" style="padding:4px 6px;">
                    <img src="Atlases/Gameplay/collectables/key/idle01.png" alt="🔑" class="api-key-icon" width="20" height="20">
                </a>
                <a href="write.html" class="btn btn-primary btn-sm">写文章</a>
                <button class="btn btn-outline btn-sm" onclick="doLogout()">退出</button>
            </div>`;
        refreshBell();
        setInterval(refreshBell, 30000);
        bindKeyButtonHover();
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

// ===== Key 按钮 hover 动画：idle00~13 共 14 帧 10fps =====
function bindKeyButtonHover() {
    const btn = document.querySelector('.api-key-btn');
    if (!btn) return;
    const img = btn.querySelector('.api-key-icon');
    if (!img || img.__bound) return;
    img.__bound = true;

    const FRAMES = 14;                         // idle00.png ~ idle13.png
    const BASE = 'Atlases/Gameplay/collectables/key/idle';
    let idx = 0, tick = null;

    function play() {
        if (tick) return;
        idx = 0;
        tick = setInterval(() => {
            idx = (idx + 1) % FRAMES;
            img.src = BASE + String(idx).padStart(2, '0') + '.png';
        }, 100);                              // 10fps，Celeste 原作 idle 节奏
    }
    function stop() {
        if (tick) { clearInterval(tick); tick = null; }
        img.src = BASE + '01.png';            // 静态回到 idle01（用户指定）
    }
    btn.addEventListener('mouseenter', play);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('focus', play);
    btn.addEventListener('blur', stop);
}

// ===== AI Key 设置入口：钥匙按钮直接跳 api-key-setup-enhanced.html =====
