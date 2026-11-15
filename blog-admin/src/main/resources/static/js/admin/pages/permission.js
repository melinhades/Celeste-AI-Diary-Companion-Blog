/* 权限管理：保留原教程功能，套用新样式 */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const state = { page: 1, size: 10, query: '' };

    function rowsHtml(list) {
        if (!list.length) return '<div class="empty"><span class="big">✦</span>没有权限记录</div>';
        let html = '<div class="table-wrap"><table class="data"><thead><tr>'
            + '<th>ID</th><th style="min-width:180px">名称</th><th style="min-width:220px">路径</th>'
            + '<th>描述</th><th style="min-width:140px">操作</th></tr></thead><tbody>';
        list.forEach(function (p) {
            html += '<tr data-id="' + p.id + '">'
                + '<td class="mono">' + p.id + '</td>'
                + '<td class="cell-title">' + ui.esc(p.name) + '</td>'
                + '<td class="mono">' + ui.esc(p.path) + '</td>'
                + '<td>' + (p.description ? ui.esc(p.description) : '<span class="badge dim">无</span>') + '</td>'
                + '<td><div class="cell-acts">'
                + '<button class="btn btn-sm" data-act="edit">编辑</button>'
                + '<button class="btn btn-sm btn-danger" data-act="delete">删除</button>'
                + '</div></td></tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    function edit(permission) {
        const isNew = !permission;
        ui.formModal(isNew ? '新增权限' : '编辑权限', [
            { key: 'name', label: '权限名称', required: true, value: isNew ? '' : permission.name },
            { key: 'path', label: '接口路径', required: true, placeholder: '/admin/xxx/**', value: isNew ? '' : permission.path },
            { key: 'description', label: '描述', type: 'textarea', value: isNew ? '' : (permission.description || '') }
        ]).then(function (values) {
            if (!values) return;
            const body = { name: values.name, path: values.path, description: values.description };
            if (!isNew) body.id = permission.id;
            window.AdminApi.post('/admin/permission/' + (isNew ? 'add' : 'update'), body)
                .then(function () {
                    ui.toast(isNew ? '权限已创建' : '权限已更新');
                    load();
                }).catch(function (err) { ui.toast(err.message, 'error'); });
        });
    }

    function bind() {
        document.getElementById('pSearch').onclick = function () {
            state.query = document.getElementById('pQuery').value.trim();
            state.page = 1;
            load();
        };
        document.getElementById('pQuery').onkeydown = function (e) {
            if (e.key === 'Enter') document.getElementById('pSearch').click();
        };
        document.getElementById('pAdd').onclick = function () { edit(null); };

        document.getElementById('pList').onclick = function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const tr = btn.closest('tr');
            const id = tr.dataset.id;
            const path = tr.children[2].textContent.trim();
            if (btn.dataset.act === 'edit') {
                window.AdminApi.post('/admin/permission/list', {
                    currentPage: 1, pageSize: 1000, queryString: ''
                }).then(function (page) {
                    const item = (page.list || []).find(function (p) { return String(p.id) === String(id); });
                    if (item) edit(item);
                }).catch(function (err) { ui.toast(err.message, 'error'); });
            } else {
                ui.confirm('删除权限', '确定删除路径 <b>' + ui.esc(path) + '</b> 的权限记录？', '确认删除')
                    .then(function (ok) {
                        if (!ok) return;
                        window.AdminApi.post('/admin/permission/delete/' + id).then(function () {
                            ui.toast('权限已删除');
                            load();
                        }).catch(function (err) { ui.toast(err.message, 'error'); });
                    });
            }
        };
    }

    function load() {
        const listEl = document.getElementById('pList');
        ui.skeleton(listEl, 4);
        return window.AdminApi.post('/admin/permission/list', {
            currentPage: state.page,
            pageSize: state.size,
            queryString: state.query
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('pPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.permission = {
        render: function (view) {
            view.innerHTML = '<div class="toolbar">'
                + '<input class="input" id="pQuery" placeholder="搜索名称 / 路径…">'
                + '<button class="btn" id="pSearch">搜索</button>'
                + '<span class="spacer"></span>'
                + '<button class="btn btn-primary" id="pAdd">新增权限</button>'
                + '</div>'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">权限列表<small>普通管理员按路径匹配</small></div></div>'
                + '<div id="pList"></div><div class="pager" id="pPager"></div></div>';
            bind();
            return load();
        }
    };
})();
