/* 评论管理：检索 / 按文章筛选 / 删除 */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const state = { page: 1, size: 12, query: '', articleId: '' };

    function rowsHtml(list) {
        if (!list.length) {
            return '<div class="empty"><span class="big">✦</span>没有匹配的评论</div>';
        }
        let html = '<div class="table-wrap"><table class="data"><thead><tr>'
            + '<th style="min-width:340px">内容</th><th style="min-width:200px">文章</th>'
            + '<th>作者</th><th>时间</th><th>操作</th></tr></thead><tbody>';
        list.forEach(function (c) {
            html += '<tr data-id="' + c.id + '">'
                + '<td><div class="cell-title">' + ui.esc(c.content || '')
                + (c.parentId ? '<span class="muted">回复评论 #' + c.parentId + '</span>' : '')
                + '</div></td>'
                + '<td><div class="cell-title">' + ui.esc(c.articleTitle || ('#' + (c.articleId || '-')))
                + '</div></td>'
                + '<td>' + (c.anonymous === 1 ? '<span class="badge dim">匿名</span>'
                    : '<span class="badge">' + ui.esc(c.authorName || ('用户 #' + (c.authorId || '-'))) + '</span>')
                + '</td>'
                + '<td class="mono">' + ui.fmtTime(c.createDate) + '</td>'
                + '<td><div class="cell-acts">'
                + '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>'
                + '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function bind() {
        document.getElementById('cSearch').onclick = function () {
            state.query = document.getElementById('cQuery').value.trim();
            state.page = 1;
            load();
        };
        document.getElementById('cQuery').onkeydown = function (e) {
            if (e.key === 'Enter') document.getElementById('cSearch').click();
        };
        document.getElementById('cArticle').onchange = function () {
            state.articleId = this.value;
            state.page = 1;
            load();
        };
        document.getElementById('cReset').onclick = function () {
            state.query = '';
            state.articleId = '';
            state.page = 1;
            document.getElementById('cQuery').value = '';
            document.getElementById('cArticle').value = '';
            load();
        };
        document.getElementById('cList').onclick = function (e) {
            const btn = e.target.closest('button[data-act="delete"]');
            if (!btn) return;
            const tr = btn.closest('tr');
            const preview = tr.querySelector('.cell-title').firstChild.textContent.trim();
            ui.confirm('删除评论', '确定删除这条评论？<br>「<b>' + ui.esc(preview.substring(0, 60)) + '</b>」'
                + '<br>若存在子回复会一并删除。', '确认删除').then(function (ok) {
                if (!ok) return;
                window.AdminApi.post('/admin/comment/delete/' + tr.dataset.id).then(function () {
                    ui.toast('评论已删除');
                    load();
                }).catch(function (err) { ui.toast(err.message, 'error'); });
            });
        };
    }

    function load() {
        const listEl = document.getElementById('cList');
        ui.skeleton(listEl, 5);
        return window.AdminApi.post('/admin/comment/page', {
            currentPage: state.page,
            pageSize: state.size,
            queryString: state.query,
            articleId: state.articleId || null
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('cPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    function loadArticles() {
        return window.AdminApi.post('/admin/article/page', {
            currentPage: 1, pageSize: 100, queryString: '', categoryId: null, visibility: null
        }).then(function (page) {
            const select = document.getElementById('cArticle');
            (page.list || []).forEach(function (a) {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.title || ('#' + a.id);
                select.appendChild(opt);
            });
        });
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.comment = {
        render: function (view) {
            view.innerHTML = '<div class="toolbar">'
                + '<input class="input" id="cQuery" placeholder="搜索评论内容…">'
                + '<select class="select" id="cArticle"><option value="">全部文章</option></select>'
                + '<button class="btn" id="cSearch">搜索</button>'
                + '<button class="btn btn-ghost" id="cReset">重置</button>'
                + '</div>'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">评论列表<small>按时间倒序</small></div></div>'
                + '<div id="cList"></div><div class="pager" id="cPager"></div></div>';
            bind();
            return loadArticles().then(load);
        }
    };
})();
