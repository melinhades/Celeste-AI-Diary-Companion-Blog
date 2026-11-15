/* 后台壳：hash 路由、侧边栏激活、时钟、退出登录 */
(function () {
    'use strict';

    const ROUTES = {
        dashboard: { title: '仪表盘', sub: '内容规模与近期动态' },
        article: { title: '文章管理', sub: '检索、预览、可见性与清理' },
        diary: { title: '日记管理', sub: '全部日记与情绪标注' },
        comment: { title: '评论管理', sub: '全站评论检索与清理' },
        taxonomy: { title: '分类与标签', sub: '维护文章的组织结构' },
        ai: { title: 'AI 调用观测', sub: 'blog-api 实际发生的检索、生成与评分 · 只读' },
        user: { title: '用户', sub: '站内注册用户（只读）' },
        permission: { title: '权限管理', sub: '管理员可访问的接口路径' }
    };

    function currentRoute() {
        const key = (location.hash || '#dashboard').replace(/^#/, '');
        return ROUTES[key] ? key : 'dashboard';
    }

    function render() {
        const key = currentRoute();
        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.classList.toggle('active', item.dataset.route === key);
        });
        document.getElementById('pageTitle').textContent = ROUTES[key].title;
        document.getElementById('pageSub').textContent = ROUTES[key].sub;

        const view = document.getElementById('view');
        view.innerHTML = '<div class="loading">载入中…</div>';
        window.scrollTo({ top: 0 });

        const page = window.AdminPages && window.AdminPages[key];
        if (!page) {
            AdminUI.empty(view, '页面不存在');
            return;
        }
        Promise.resolve()
            .then(function () { return page.render(view); })
            .catch(function (err) {
                view.innerHTML = '<div class="empty"><span class="big">!</span>'
                    + AdminUI.esc(err && err.message ? err.message : '加载失败') + '</div>';
            });
    }

    function tickClock() {
        const el = document.getElementById('clock');
        if (!el) return;
        const d = new Date();
        const p = function (n) { return String(n).padStart(2, '0'); };
        el.textContent = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    document.addEventListener('DOMContentLoaded', function () {
        AdminUI.bindDrawer();

        document.querySelectorAll('.nav-item').forEach(function (item) {
            item.addEventListener('click', function () {
                location.hash = '#' + item.dataset.route;
            });
        });

        const logout = document.getElementById('logoutBtn');
        if (logout) {
            logout.addEventListener('click', function () {
                fetch('/logout', { method: 'POST', credentials: 'same-origin' })
                    .finally(function () { location.href = '/login.html'; });
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') AdminUI.closeDrawer();
        });

        tickClock();
        setInterval(tickClock, 1000);
        window.addEventListener('hashchange', render);
        render();
    });
})();
