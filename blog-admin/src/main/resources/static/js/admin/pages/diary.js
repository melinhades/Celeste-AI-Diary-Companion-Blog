/* 日记管理：检索 / 情绪筛选 / 详情 / 删除 */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const EMOTIONS = ['不安', '疲惫', '平静', '愤怒', '开心', '期待', '默认', '满足', '悲伤'];
    const state = { page: 1, size: 10, query: '', emotion: '' };

    function toolbarHtml() {
        let options = '<option value="">全部情绪</option>';
        EMOTIONS.forEach(function (e) {
            options += '<option value="' + e + '">' + e + '</option>';
        });
        return '<div class="toolbar">'
            + '<input class="input" id="dQuery" placeholder="搜索标题或正文…">'
            + '<select class="select" id="dEmotion">' + options + '</select>'
            + '<button class="btn" id="dSearch">搜索</button>'
            + '<button class="btn btn-ghost" id="dReset">重置</button>'
            + '</div>';
    }

    function rowsHtml(list) {
        if (!list.length) {
            return '<div class="empty"><span class="big">✦</span>没有匹配的日记</div>';
        }
        let html = '<div class="table-wrap"><table class="data"><thead><tr>'
            + '<th style="min-width:320px">标题 / 摘要</th><th>情绪</th><th>字数</th><th>时间</th>'
            + '<th style="min-width:200px">操作</th></tr></thead><tbody>';
        list.forEach(function (d) {
            html += '<tr data-id="' + ui.esc(d.id) + '">'
                + '<td><div class="cell-title">' + ui.esc(d.title || '无题日记')
                + '<span class="muted">' + ui.esc(d.excerpt || '') + '</span></div></td>'
                + '<td>' + ui.emotionBadge(d.emotion) + '</td>'
                + '<td class="mono">' + (d.charCount || 0) + '</td>'
                + '<td class="mono">' + ui.fmtTime(d.createDate) + '</td>'
                + '<td><div class="cell-acts">'
                + '<button class="btn btn-sm" data-act="detail">详情</button>'
                + '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener"'
                + ' href="https://instapix.icu/diary.html?edit=' + encodeURIComponent(d.id) + '">前台</a>'
                + '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>'
                + '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function bind() {
        document.getElementById('dSearch').onclick = function () {
            state.query = document.getElementById('dQuery').value.trim();
            state.page = 1;
            load();
        };
        document.getElementById('dQuery').onkeydown = function (e) {
            if (e.key === 'Enter') document.getElementById('dSearch').click();
        };
        document.getElementById('dEmotion').onchange = function () {
            state.emotion = this.value;
            state.page = 1;
            load();
        };
        document.getElementById('dReset').onclick = function () {
            state.query = '';
            state.emotion = '';
            state.page = 1;
            document.getElementById('dQuery').value = '';
            document.getElementById('dEmotion').value = '';
            load();
        };

        document.getElementById('dList').onclick = function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            if (btn.dataset.act === 'detail') detail(id);
            if (btn.dataset.act === 'delete') remove(id, tr);
        };
    }

    function detail(id) {
        ui.openDrawer('日记详情', '<div class="loading">载入中…</div>');
        window.AdminApi.get('/admin/diary/' + encodeURIComponent(id)).then(function (d) {
            const meta = ui.emotionBadge(d.emotion)
                + '<span class="badge dim">' + ui.fmtTime(d.createDate) + '</span>'
                + '<span class="badge dim">' + (d.content ? d.content.length : 0) + ' 字</span>'
                + '<span class="badge dim">陪伴记录 ' + (d.companionCount || 0) + '</span>';
            ui.openDrawer(d.title || '无题日记',
                '<div class="diary-content">' + ui.esc(d.content || '（无正文）') + '</div>', meta);
        }).catch(function (err) {
            ui.toast(err.message, 'error');
            ui.closeDrawer();
        });
    }

    function remove(id, tr) {
        ui.confirm('删除日记', '确定删除《<b>' +
            ui.esc(tr.querySelector('.cell-title').firstChild.textContent.trim())
            + '</b>》？<br>会同时清理陪伴记录与 RAG 检索分片，不可恢复。', '确认删除')
            .then(function (ok) {
                if (!ok) return;
                window.AdminApi.post('/admin/diary/delete/' + encodeURIComponent(id)).then(function () {
                    ui.toast('日记已删除');
                    load();
                }).catch(function (err) { ui.toast(err.message, 'error'); });
            });
    }

    function load() {
        const listEl = document.getElementById('dList');
        ui.skeleton(listEl, 4);
        return window.AdminApi.post('/admin/diary/page', {
            currentPage: state.page,
            pageSize: state.size,
            queryString: state.query,
            emotion: state.emotion
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('dPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.diary = {
        render: function (view) {
            view.innerHTML = toolbarHtml()
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">日记列表<small>按时间倒序</small></div></div>'
                + '<div id="dList"></div><div class="pager" id="dPager"></div></div>';
            bind();
            return load();
        }
    };
})();
