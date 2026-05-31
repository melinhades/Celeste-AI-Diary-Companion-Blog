// API 基础地址，指向后端 8888 端口
const BASE_URL = 'http://localhost:8888';

function api(path, method, body) {
    const options = {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' }
    };
    const token = localStorage.getItem('token');
    if (token) options.headers['Authorization'] = token;
    if (body) options.body = JSON.stringify(body);
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
