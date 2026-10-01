
const BASE_URL = 'https://api.instapix.icu';

function api(path, method, body, timeoutMs) {
    const options = {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' }
    };
    const token = localStorage.getItem('token');
    if (token) options.headers['Authorization'] = token;
    if (body) options.body = JSON.stringify(body);
    if (timeoutMs) options.signal = AbortSignal.timeout(timeoutMs);
    return fetch(BASE_URL + path, options)
        .then(r => r.json())
        .catch(() => ({ success: false, msg: '网络错误' }));
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function showToast(msg, type) {
    let el = document.getElementById('__toast');
    if (!el) {
        el = document.createElement('div');
        el.id = '__toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `toast ${type || 'info'} show`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== berry wallet: 后端 ms_sys_user.berry 为权威值，localStorage 仅作同步缓存 =====
function berryBalance() {
    if (localStorage.getItem('berryBalance') === null) {
        // 首次访问（还没从后端同步过）：用旧本地口径兜底，syncBerryBalance 后会被后端值覆盖
        const init = Math.max(parseInt(localStorage.getItem('diarySaveCount') || '0') - parseInt(localStorage.getItem('berrySpent') || '0'), 0);
        localStorage.setItem('berryBalance', String(init));
    }
    return parseInt(localStorage.getItem('berryBalance') || '0');
}
function emitBerriesChange(balance) {
    window.dispatchEvent(new CustomEvent('berries:change', { detail: { balance: balance } }));
}
/** 从后端拉取权威余额并刷新本地缓存（me/日记/商店等页面加载时调用） */
function syncBerryBalance() {
    if (!localStorage.getItem('token')) return Promise.resolve(null);
    return api('/users/berry', 'GET').then(res => {
        if (res.success && res.data && typeof res.data.berry === 'number') {
            localStorage.setItem('berryBalance', String(res.data.berry));
            emitBerriesChange(res.data.berry);
        }
        return res;
    });
}
/**
 * 草莓增减（n 正=获得，负=消费）。
 * 已登录：先乐观更新本地 → POST 后端 → 用返回的权威值对账，失败回滚；
 * 未登录：只写本地（草莓籽动画等未登录场景仍可玩，登录后不同设备以服务端为准）。
 */
function addBerries(n) {
    n = parseInt(n) || 0;
    if (!n) return;
    const token = localStorage.getItem('token');
    const prev = berryBalance();
    const optimistic = Math.max(prev + n, 0);
    localStorage.setItem('berryBalance', String(optimistic));
    emitBerriesChange(optimistic);
    if (!token) return;
    api('/users/berry', 'POST', { delta: n }).then(res => {
        if (res.success && res.data && typeof res.data.berry === 'number') {
            // 权威值与本地乐观值不一致时对账（他端变动/服务端兜底扣减等）
            if (res.data.berry !== berryBalance()) {
                localStorage.setItem('berryBalance', String(res.data.berry));
                emitBerriesChange(res.data.berry);
            }
        } else {
            // 后端写失败：回滚乐观更新，避免"本地加了但库里没加"的假成功
            localStorage.setItem('berryBalance', String(prev));
            emitBerriesChange(prev);
        }
    });
}
function spendBerries(n) { addBerries(-Math.abs(n)); }
