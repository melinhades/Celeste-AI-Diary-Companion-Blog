
const BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8888'
    : 'https://api.instapix.icu';

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
    if (!token) {
        // 未登录：记账 pending，登录后任意页面加载时自动补 POST
        if (n > 0) {
            const pending = parseInt(localStorage.getItem('berryPendingCredit') || '0');
            localStorage.setItem('berryPendingCredit', String(pending + n));
        }
        return;
    }
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

/**
 * 把未登录期间攒下的草莓补到服务端。
 * api.js 加载时即执行；登录后打开/刷新任意页面都会触发。
 */
function flushPendingBerries() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const pending = parseInt(localStorage.getItem('berryPendingCredit') || '0');
    if (pending <= 0) return;
    localStorage.removeItem('berryPendingCredit');
    api('/users/berry', 'POST', { delta: pending }).then(res => {
        if (res.success && res.data && typeof res.data.berry === 'number') {
            localStorage.setItem('berryBalance', String(res.data.berry));
            emitBerriesChange(res.data.berry);
        } else {
            // 失败放回，下次再试
            const back = parseInt(localStorage.getItem('berryPendingCredit') || '0');
            localStorage.setItem('berryPendingCredit', String(back + pending));
        }
    });
}
flushPendingBerries();

// ===== 用户级本地状态隔离 =====
// 这些 key 是「某个账号的」数据，存在全局 localStorage 里，换账号不清理就会出现
// 「登录 test 却看到上个账号的明信片署名 / 已点亮的心门」这类串号。
const USER_SCOPED_KEYS = [
    'badelineChatLog', 'berryBalance', 'berryOwned', 'berryPendingCredit', 'berrySpent',
    'crystalHeart', 'dailyPostcardCache', 'diaryChatSessionId', 'diaryFarewell',
    'diaryLastSaveDate', 'diarySaveCount', 'diarySnapshots', 'diaryStreak', 'diaryUnsaved',
    'heartCrystalDay', 'heartDoorHearts', 'heartDoorLit', 'heartDoorSplit',
    'lastEmotion', 'madeline_emotion', 'mirrorBroken', 'mirrorReroll',
    'pmLastVisit', 'postcardDate'
];
/** 纯展示/缓存类：登出即作废，避免下一个账号看到上一个人的明信片 */
const SESSION_DISPLAY_KEYS = ['dailyPostcardCache', 'postcardDate', 'pmLastVisit',
                              'lastEmotion', 'madeline_emotion'];

function clearUserScopedStorage() {
    USER_SCOPED_KEYS.forEach(k => localStorage.removeItem(k));
}

/**
 * 登录成功后绑定账号指纹。账号变化时清掉上一个账号的全部本地状态。
 * 无 __account（老数据）时用昵称差异兜底判断，覆盖「历史残留 + 直接换号登录」。
 */
function bindAccount(account, nickname) {
    const prevAccount = localStorage.getItem('__account');
    const prevNick = localStorage.getItem('nickname');
    const switched = prevAccount
        ? prevAccount !== account
        : !!(prevNick && nickname && prevNick !== nickname);
    if (switched) clearUserScopedStorage();
    localStorage.setItem('__account', account || '');
}

/** 登出：只作废展示缓存，保留本地游戏进度，同账号回来仍可续上 */
function clearSessionDisplayStorage() {
    SESSION_DISPLAY_KEYS.forEach(k => localStorage.removeItem(k));
}

/**
 * 一次性迁移历史串号数据：老版本没有 __account，且登出只清 token/nickname，
 * 所以本地可能留着上一个账号的明信片署名、心门进度等。升级后首次加载直接清空并按当前账号重建。
 * 之后 __account 存在即跳过；currentUser 失败（网络错误/token 无效）时不动数据，避免误删。
 */
(function reconcileAccountOnce() {
    if (localStorage.getItem('__account')) return;
    if (!localStorage.getItem('token')) return;
    api('/users/currentUser', 'GET', null, 5000).then(res => {
        if (!res || !res.success || !res.data) return;
        clearUserScopedStorage();
        localStorage.setItem('__account', res.data.account || '');
        location.reload();
    }).catch(() => {});
})();
