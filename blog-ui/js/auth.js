// 初始化头部用户状态
function initHeader() {
    const token = localStorage.getItem('token');
    const nickname = localStorage.getItem('nickname');
    const el = document.getElementById('headerRight');
    if (!el) return;
    if (token && nickname) {
        el.innerHTML = `
            <div class="user-info">
                <div class="user-avatar"><img src="celeste-gui/user-avatar.png" alt=""></div>
                <span>${escHtml(nickname)}</span>
                <a href="messages.html" class="btn btn-outline btn-sm" style="position:relative" title="消息">🔔<i id="bellBadge" style="display:none;position:absolute;top:-7px;right:-7px;background:#e6517c;color:#fff;font-style:normal;font-size:10px;min-width:16px;height:16px;line-height:16px;border-radius:8px;text-align:center;padding:0 3px;"></i></a>
                <a href="me.html" class="btn btn-outline btn-sm">我的空间</a>
                <a href="write.html" class="btn btn-primary btn-sm">写文章</a>
                <button class="btn btn-outline btn-sm" onclick="doLogout()">退出</button>
            </div>`;
        refreshBell();
        setInterval(refreshBell, 30000);
    } else {
        el.innerHTML = `
            <a href="login.html" class="btn btn-outline" onclick="return navSfx(event, 'login.html', 'ui_main_assistmode_whistle_page1.wav')">登录</a>
            <a href="register.html" class="btn btn-primary" onclick="return navSfx(event, 'register.html', 'ui_main_assistmode_whistle_page2.wav')">注册</a>`;
    }
}

// ===== 导航音效：先播再跳转，避免页面切换把音效掐断 =====
function playNavSfx(name) {
    try {
        const a = new Audio('celeste-sounds/' + name);
        a.volume = 0.8;
        a.play().catch(() => {});
    } catch (e) { /* 无声降级 */ }
}
function navSfx(e, url, name) {
    if (e && e.preventDefault) e.preventDefault();
    playNavSfx(name);
    try { sessionStorage.setItem('sfxNavAt', String(Date.now())); } catch (err) {}
    setTimeout(() => location.href = url, 700);
    return false;
}

function doLogout() {
    const token = localStorage.getItem('token');
    try {
        const s = new Audio('celeste-sounds/ui_main_assistmode_whistle_no.wav');
        s.volume = 0.8;
        s.play().catch(() => {});
    } catch (e) { /* 无声降级 */ }
    const go = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('nickname');
        location.href = 'index.html';
    };
    if (token) {
        fetch('http://localhost:8888/logout', { headers: { 'Authorization': token } })
            .finally(() => setTimeout(go, 900));
    } else {
        setTimeout(go, 900);
    }
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
    }).catch(() => {});
}

function playNotifySound() {
    try {
        const s = new Audio('celeste-sounds/notify.wav');
        s.volume = 0.6;
        s.play().catch(() => {});
    } catch (e) {}
}
