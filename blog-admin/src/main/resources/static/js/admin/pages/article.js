/* 文章管理：检索 / 筛选 / 预览 / 切换可见性 / 删除 */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const state = { page: 1, size: 10, query: '', categoryId: '', visibility: '' };
    let categories = [];

    function toolbarHtml() {
        return '<div class="toolbar">'
            + '<input class="input" id="artQuery" placeholder="搜索标题…">'
            + '<select class="select" id="artCategory"><option value="">全部分类</option></select>'
            + '<select class="select" id="artVisibility">'
            + '<option value="">全部可见性</option><option value="1">公开</option><option value="0">私密</option>'
            + '</select>'
            + '<button class="btn" id="artSearch">搜索</button>'
            + '<button class="btn btn-ghost" id="artReset">重置</button>'
            + '</div>';
    }

    function rowsHtml(list) {
        if (!list.length) {
            return '<div class="empty"><span class="big">✦</span>没有匹配的文章</div>';
        }
        let html = '<div class="table-wrap"><table class="data"><thead><tr>'
            + '<th style="min-width:260px">标题</th><th>分类</th><th>标签</th>'
            + '<th>浏览 / 评论</th><th>可见性</th><th>创建时间</th><th style="min-width:220px">操作</th>'
            + '</tr></thead><tbody>';
        list.forEach(function (a) {
            html += '<tr data-id="' + a.id + '">'
                + '<td><div class="cell-title">' + ui.esc(a.title || '无题')
                + (a.weight ? ' <span class="badge gold">置顶</span>' : '')
                + '<span class="muted">' + ui.esc(a.summary || '') + '</span></div></td>'
                + '<td>' + (a.categoryName ? '<span class="badge">' + ui.esc(a.categoryName) + '</span>'
                    : '<span class="badge dim">未分类</span>') + '</td>'
                + '<td><div class="tag-list">'
                + (a.tags && a.tags.length ? a.tags.map(function (t) {
                    return '<span class="tag">' + ui.esc(t) + '</span>';
                }).join('') : '<span class="badge dim">无</span>')
                + '</div></td>'
                + '<td class="mono">' + (a.viewCounts || 0) + ' / ' + (a.commentCounts || 0) + '</td>'
                + '<td>' + (a.visibility === 1 ? '<span class="badge mint">公开</span>'
                    : '<span class="badge red">私密</span>') + '</td>'
                + '<td class="mono">' + ui.fmtTime(a.createDate) + '</td>'
                + '<td><div class="cell-acts">'
                + '<button class="btn btn-sm" data-act="preview">预览</button>'
                + '<button class="btn btn-sm btn-gold" data-act="toggle">'
                + (a.visibility === 1 ? '转私密' : '转公开') + '</button>'
                + '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener"'
                + ' href="https://instapix.icu/article.html?id=' + a.id + '">前台</a>'
                + '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>'
                + '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function bind(view) {
        document.getElementById('artSearch').onclick = function () {
            state.query = document.getElementById('artQuery').value.trim();
            state.page = 1;
            load();
        };
        document.getElementById('artQuery').onkeydown = function (e) {
            if (e.key === 'Enter') document.getElementById('artSearch').click();
        };
        document.getElementById('artCategory').onchange = function () {
            state.categoryId = this.value;
            state.page = 1;
            load();
        };
        document.getElementById('artVisibility').onchange = function () {
            state.visibility = this.value;
            state.page = 1;
            load();
        };
        document.getElementById('artReset').onclick = function () {
            state.query = '';
            state.categoryId = '';
            state.visibility = '';
            state.page = 1;
            document.getElementById('artQuery').value = '';
            document.getElementById('artCategory').value = '';
            document.getElementById('artVisibility').value = '';
            load();
        };

        document.getElementById('artList').onclick = function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            const act = btn.dataset.act;
            if (act === 'preview') preview(id);
            if (act === 'toggle') toggle(id, btn.textContent.indexOf('公开') >= 0 ? 1 : 0);
            if (act === 'delete') remove(id, tr);
        };
    }

    function preview(id) {
        ui.openDrawer('文章预览', '<div class="loading">载入中…</div>');
        window.AdminApi.get('/admin/article/' + id).then(function (a) {
            const meta = (a.categoryName ? '<span class="badge">' + ui.esc(a.categoryName) + '</span>' : '')
                + (a.visibility === 1 ? '<span class="badge mint">公开</span>' : '<span class="badge red">私密</span>')
                + (a.tags || []).map(function (t) { return '<span class="tag">' + ui.esc(t) + '</span>'; }).join('')
                + '<span class="badge dim">浏览 ' + (a.viewCounts || 0) + ' · 评论 ' + (a.commentCounts || 0) + '</span>'
                + '<span class="badge dim">' + ui.fmtTime(a.createDate) + '</span>';
            const body = a.contentHtml
                ? '<div class="article-body">' + ui.safeHtml(a.contentHtml) + '</div>'
                : '<div class="diary-content">' + ui.esc(a.content || '（无正文）') + '</div>';
            ui.openDrawer(a.title || '无题', body, meta);
        }).catch(function (err) {
            ui.toast(err.message, 'error');
            ui.closeDrawer();
        });
    }

    function toggle(id, next) {
        window.AdminApi.post('/admin/article/visibility', { id: id, visibility: next })
            .then(function () {
                ui.toast(next === 1 ? '已转为公开' : '已转为私密');
                load();
            }).catch(function (err) { ui.toast(err.message, 'error'); });
    }

    function remove(id, tr) {
        ui.confirm('删除文章', '确定删除《<b>' + ui.esc(tr.querySelector('.cell-title').textContent.trim())
            + '</b>》？<br>会同时清理正文、标签关联、评论与点赞记录，不可恢复。', '确认删除')
            .then(function (ok) {
                if (!ok) return;
                window.AdminApi.post('/admin/article/delete/' + id).then(function () {
                    ui.toast('文章已删除');
                    load();
                }).catch(function (err) { ui.toast(err.message, 'error'); });
            });
    }

    function load() {
        const listEl = document.getElementById('artList');
        ui.skeleton(listEl, 4);
        return window.AdminApi.post('/admin/article/page', {
            currentPage: state.page,
            pageSize: state.size,
            queryString: state.query,
            categoryId: state.categoryId ? Number(state.categoryId) : null,
            visibility: state.visibility === '' ? null : Number(state.visibility)
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('artPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.article = {
        render: function (view) {
            view.innerHTML = toolbarHtml()
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">文章列表<small>按创建时间倒序</small></div></div>'
                + '<div id="artList"></div><div class="pager" id="artPager"></div></div>';
            bind(view);
            return window.AdminApi.get('/admin/category/list').then(function (list) {
                categories = list || [];
                const select = document.getElementById('artCategory');
                categories.forEach(function (c) {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.categoryName;
                    select.appendChild(opt);
                });
                return load();
            });
        }
    };
})();
