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
                <a href="me.html" class="btn btn-outline btn-sm">我的空间</a>
                <a href="write.html" class="btn btn-primary btn-sm">写文章</a>
                <button class="btn btn-outline btn-sm" onclick="doLogout()">退出</button>
            </div>`;
    } else {
        el.innerHTML = `
            <a href="login.html" class="btn btn-outline">登录</a>
            <a href="register.html" class="btn btn-primary">注册</a>`;
    }
}

function doLogout() {
    const token = localStorage.getItem('token');
    if (token) {
        fetch('http://localhost:8888/logout', { headers: { 'Authorization': token } })
            .finally(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('nickname');
                location.href = 'index.html';
            });
    } else {
        location.href = 'index.html';
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
