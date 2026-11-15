/* 用户列表（只读） */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const state = { page: 1, size: 12, query: '' };

    function rowsHtml(list) {
        if (!list.length) return '<div class="empty"><span class="big">✦</span>没有匹配的用户</div>';
        let html = '<div class="table-wrap"><table class="data"><thead><tr>'
            + '<th style="min-width:200px">昵称 / 账号</th><th>邮箱</th><th>身份</th>'
            + '<th>草莓</th><th>注册时间</th><th>最后登录</th></tr></thead><tbody>';
        list.forEach(function (u) {
            const name = u.nickname || u.account || ('用户 #' + u.id);
            html += '<tr>'
                + '<td><div class="cell-title">' + ui.esc(name)
                + '<span class="muted">@' + ui.esc(u.account || '-') + '</span></div></td>'
                + '<td>' + (u.email ? ui.esc(u.email) : '<span class="badge dim">未填写</span>') + '</td>'
                + '<td>' + (u.admin ? '<span class="badge gold">管理员</span>'
                    : '<span class="badge">用户</span>')
                + (u.deleted ? ' <span class="badge red">已注销</span>' : '') + '</td>'
                + '<td class="mono">' + (u.berry == null ? 0 : u.berry) + '</td>'
                + '<td class="mono">' + ui.fmtTime(u.createDate) + '</td>'
                + '<td class="mono">' + ui.fmtTime(u.lastLogin) + '</td>'
                + '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function bind() {
        document.getElementById('uSearch').onclick = function () {
            state.query = document.getElementById('uQuery').value.trim();
            state.page = 1;
            load();
        };
        document.getElementById('uQuery').onkeydown = function (e) {
            if (e.key === 'Enter') document.getElementById('uSearch').click();
        };
    }

    function load() {
        const listEl = document.getElementById('uList');
        ui.skeleton(listEl, 5);
        return window.AdminApi.post('/admin/user/page', {
            currentPage: state.page,
            pageSize: state.size,
            queryString: state.query
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('uPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.user = {
        render: function (view) {
            view.innerHTML = '<div class="toolbar">'
                + '<input class="input" id="uQuery" placeholder="搜索昵称 / 账号 / 邮箱…">'
                + '<button class="btn" id="uSearch">搜索</button>'
                + '</div>'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">站内用户<small>只读 · 按注册时间倒序</small></div></div>'
                + '<div id="uList"></div><div class="pager" id="uPager"></div></div>';
            bind();
            return load();
        }
    };
})();
