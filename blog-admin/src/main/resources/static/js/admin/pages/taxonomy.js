/* 分类与标签：列表、新增、编辑、删除（删除前检查引用） */
(function () {
    'use strict';
    const ui = window.AdminUI;

    function categoryRows(list) {
        if (!list.length) return '<div class="empty">还没有分类</div>';
        let html = '';
        list.forEach(function (c) {
            html += '<div class="tax-row">'
                + '<div class="name">' + ui.esc(c.categoryName)
                + (c.description ? '<div class="desc">' + ui.esc(c.description) + '</div>' : '') + '</div>'
                + '<div class="acts">'
                + '<button class="btn btn-sm" data-act="edit-cat" data-id="' + c.id + '">编辑</button>'
                + '<button class="btn btn-sm btn-danger" data-act="del-cat" data-id="' + c.id + '">删除</button>'
                + '</div></div>';
        });
        return html;
    }

    function tagRows(list) {
        if (!list.length) return '<div class="empty">还没有标签</div>';
        let html = '';
        list.forEach(function (t) {
            html += '<div class="tax-row">'
                + '<div class="name"><span class="tag">' + ui.esc(t.tagName) + '</span></div>'
                + '<div class="acts">'
                + '<button class="btn btn-sm" data-act="edit-tag" data-id="' + t.id + '">编辑</button>'
                + '<button class="btn btn-sm btn-danger" data-act="del-tag" data-id="' + t.id + '">删除</button>'
                + '</div></div>';
        });
        return html;
    }

    let categories = [];
    let tags = [];

    function loadCategories() {
        return window.AdminApi.get('/admin/category/list').then(function (list) {
            categories = list || [];
            document.getElementById('catList').innerHTML = categoryRows(categories);
        });
    }

    function loadTags() {
        return window.AdminApi.get('/admin/tag/list').then(function (list) {
            tags = list || [];
            document.getElementById('tagList').innerHTML = tagRows(tags);
        });
    }

    function editCategory(category) {
        const isNew = !category;
        ui.formModal(isNew ? '新增分类' : '编辑分类', [
            { key: 'categoryName', label: '分类名称', required: true, value: isNew ? '' : category.categoryName },
            { key: 'description', label: '描述', type: 'textarea', value: isNew ? '' : (category.description || '') }
        ]).then(function (values) {
            if (!values) return;
            const body = { categoryName: values.categoryName, description: values.description };
            if (!isNew) body.id = category.id;
            window.AdminApi.post('/admin/category/' + (isNew ? 'add' : 'update'), body).then(function () {
                ui.toast(isNew ? '分类已创建' : '分类已更新');
                loadCategories();
            }).catch(function (err) { ui.toast(err.message, 'error'); });
        });
    }

    function editTag(tag) {
        const isNew = !tag;
        ui.formModal(isNew ? '新增标签' : '编辑标签', [
            { key: 'tagName', label: '标签名称', required: true, value: isNew ? '' : tag.tagName }
        ]).then(function (values) {
            if (!values) return;
            const body = { tagName: values.tagName };
            if (!isNew) body.id = tag.id;
            window.AdminApi.post('/admin/tag/' + (isNew ? 'add' : 'update'), body).then(function () {
                ui.toast(isNew ? '标签已创建' : '标签已更新');
                loadTags();
            }).catch(function (err) { ui.toast(err.message, 'error'); });
        });
    }

    function bind() {
        document.getElementById('catAdd').onclick = function () { editCategory(null); };
        document.getElementById('tagAdd').onclick = function () { editTag(null); };

        document.getElementById('catList').onclick = function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.act === 'edit-cat') {
                editCategory(categories.find(function (c) { return String(c.id) === String(id); }));
            } else {
                ui.confirm('删除分类', '确定删除这个分类？<br>若分类下仍有文章会被拒绝。', '确认删除')
                    .then(function (ok) {
                        if (!ok) return;
                        window.AdminApi.post('/admin/category/delete/' + id).then(function () {
                            ui.toast('分类已删除');
                            loadCategories();
                        }).catch(function (err) { ui.toast(err.message, 'error'); });
                    });
            }
        };

        document.getElementById('tagList').onclick = function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.act === 'edit-tag') {
                editTag(tags.find(function (t) { return String(t.id) === String(id); }));
            } else {
                ui.confirm('删除标签', '确定删除这个标签？<br>若仍有文章使用会被拒绝。', '确认删除')
                    .then(function (ok) {
                        if (!ok) return;
                        window.AdminApi.post('/admin/tag/delete/' + id).then(function () {
                            ui.toast('标签已删除');
                            loadTags();
                        }).catch(function (err) { ui.toast(err.message, 'error'); });
                    });
            }
        };
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.taxonomy = {
        render: function (view) {
            view.innerHTML = '<div class="tax-grid">'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">分类<small>文章归属</small></div>'
                + '<button class="btn btn-sm btn-primary" id="catAdd">新增分类</button></div>'
                + '<div id="catList"></div></div>'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">标签<small>文章关键词</small></div>'
                + '<button class="btn btn-sm btn-primary" id="tagAdd">新增标签</button></div>'
                + '<div id="tagList"></div></div>'
                + '</div>';
            bind();
            return Promise.all([loadCategories(), loadTags()]);
        }
    };
})();
