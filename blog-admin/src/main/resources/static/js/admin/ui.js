/* 后台通用 UI：转义 / 时间 / Toast / 确认框 / 表单弹窗 / 抽屉 / 分页 / 骨架屏 */
(function () {
    'use strict';

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function fmtTime(value) {
        if (value == null || value === '') return '-';
        let d;
        if (typeof value === 'number') {
            d = new Date(value);
        } else if (Array.isArray(value)) {
            d = new Date(value[0], (value[1] || 1) - 1, value[2] || 1,
                value[3] || 0, value[4] || 0, value[5] || 0);
        } else {
            const s = String(value);
            d = new Date(s.indexOf('T') >= 0 ? s : s.replace(' ', 'T'));
        }
        if (isNaN(d.getTime())) return String(value);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function toast(message, type) {
        let wrap = document.querySelector('.toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'toast-wrap';
            document.body.appendChild(wrap);
        }
        const el = document.createElement('div');
        el.className = 'toast' + (type ? ' ' + type : '');
        el.textContent = message;
        wrap.appendChild(el);
        setTimeout(function () {
            el.style.transition = 'opacity .25s, transform .25s';
            el.style.opacity = '0';
            el.style.transform = 'translateX(20px)';
            setTimeout(function () { el.remove(); }, 260);
        }, 2600);
    }

    function modalRoot() {
        let root = document.getElementById('uiModal');
        if (!root) {
            root = document.createElement('div');
            root.id = 'uiModal';
            root.className = 'modal-mask';
            document.body.appendChild(root);
        }
        return root;
    }

    function closeModal(root) {
        root.classList.remove('show');
        root.innerHTML = '';
    }

    function confirm(title, html, okText) {
        return new Promise(function (resolve) {
            const root = modalRoot();
            root.innerHTML =
                '<div class="modal">' +
                '<h3>' + esc(title) + '</h3>' +
                '<div class="confirm-text">' + html + '</div>' +
                '<div class="modal-foot">' +
                '<button class="btn btn-ghost" data-act="no">取消</button>' +
                '<button class="btn btn-danger" data-act="yes">' + esc(okText || '确定删除') + '</button>' +
                '</div></div>';
            root.classList.add('show');
            root.querySelector('[data-act="no"]').onclick = function () { closeModal(root); resolve(false); };
            root.querySelector('[data-act="yes"]').onclick = function () { closeModal(root); resolve(true); };
            root.onclick = function (e) {
                if (e.target === root) { closeModal(root); resolve(false); }
            };
        });
    }

    /**
     * 表单弹窗。fields: [{key,label,type,placeholder,value,required,options}]
     * resolve(values) / resolve(null)
     */
    function formModal(title, fields, submitText) {
        return new Promise(function (resolve) {
            const root = modalRoot();
            let html = '<div class="modal"><h3>' + esc(title) + '</h3>';
            fields.forEach(function (f) {
                html += '<div class="field"><label>' + esc(f.label) + '</label>';
                if (f.type === 'textarea') {
                    html += '<textarea class="input" data-key="' + esc(f.key) + '" placeholder="'
                        + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
                } else if (f.type === 'select') {
                    html += '<select class="select" data-key="' + esc(f.key) + '">';
                    (f.options || []).forEach(function (o) {
                        const selected = String(o.value) === String(f.value == null ? '' : f.value) ? ' selected' : '';
                        html += '<option value="' + esc(o.value) + '"' + selected + '>' + esc(o.label) + '</option>';
                    });
                    html += '</select>';
                } else {
                    html += '<input class="input" data-key="' + esc(f.key) + '" type="' + (f.type || 'text')
                        + '" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(f.value || '') + '">';
                }
                html += '</div>';
            });
            html += '<div class="modal-foot">' +
                '<button class="btn btn-ghost" data-act="cancel">取消</button>' +
                '<button class="btn btn-primary" data-act="ok">' + esc(submitText || '保存') + '</button>' +
                '</div></div>';
            root.innerHTML = html;
            root.classList.add('show');

            root.querySelector('[data-act="cancel"]').onclick = function () { closeModal(root); resolve(null); };
            root.onclick = function (e) { if (e.target === root) { closeModal(root); resolve(null); } };
            root.querySelector('[data-act="ok"]').onclick = function () {
                const values = {};
                fields.forEach(function (f) {
                    const input = root.querySelector('[data-key="' + f.key + '"]');
                    values[f.key] = input ? input.value.trim() : '';
                    if (f.required && !values[f.key]) {
                        toast('请填写「' + f.label + '」', 'warn');
                        input && input.focus();
                        values.__invalid = true;
                    }
                });
                if (values.__invalid) return;
                closeModal(root);
                resolve(values);
            };
        });
    }

    // ===== 抽屉 =====
    function openDrawer(title, html, metaHtml) {
        const mask = document.getElementById('drawerMask');
        const drawer = document.getElementById('drawer');
        document.getElementById('drawerTitle').textContent = title;
        document.getElementById('drawerBody').innerHTML =
            (metaHtml ? '<div class="meta">' + metaHtml + '</div>' : '') + html;
        mask.classList.add('show');
        drawer.classList.add('show');
    }

    function closeDrawer() {
        document.getElementById('drawerMask').classList.remove('show');
        document.getElementById('drawer').classList.remove('show');
    }

    function bindDrawer() {
        const mask = document.getElementById('drawerMask');
        const close = document.getElementById('drawerClose');
        if (mask) mask.onclick = closeDrawer;
        if (close) close.onclick = closeDrawer;
    }

    // ===== 分页 =====
    function pager(el, total, page, size, onGo) {
        const pages = Math.max(1, Math.ceil(total / size));
        const nums = [];
        const start = Math.max(1, Math.min(page - 2, pages - 4));
        const end = Math.min(pages, start + 4);
        for (let i = start; i <= end; i++) nums.push(i);

        let html = '<span class="info">共 ' + total + ' 条 · 第 ' + page + ' / ' + pages + ' 页</span>';
        html += '<button data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>‹</button>';
        nums.forEach(function (n) {
            html += '<button data-page="' + n + '"' + (n === page ? ' class="active"' : '') + '>' + n + '</button>';
        });
        html += '<button data-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>›</button>';
        el.innerHTML = html;
        el.querySelectorAll('button[data-page]').forEach(function (btn) {
            btn.onclick = function () {
                const next = Number(btn.dataset.page);
                if (next >= 1 && next <= pages && next !== page) onGo(next);
            };
        });
    }

    function skeleton(el, rows) {
        let html = '';
        for (let i = 0; i < (rows || 5); i++) html += '<div class="skeleton-row"></div>';
        el.innerHTML = html;
    }

    function empty(el, text) {
        el.innerHTML = '<div class="empty"><span class="big">✦</span>' + esc(text || '这里什么也没有') + '</div>';
    }

    function safeHtml(html) {
        const box = document.createElement('div');
        box.innerHTML = html || '';
        box.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(function (n) { n.remove(); });
        box.querySelectorAll('*').forEach(function (n) {
            Array.prototype.slice.call(n.attributes).forEach(function (a) {
                if (/^on/i.test(a.name)) n.removeAttribute(a.name);
                if ((a.name === 'href' || a.name === 'src') && /^javascript:/i.test(a.value)) {
                    n.removeAttribute(a.name);
                }
            });
        });
        return box.innerHTML;
    }

    function emotionBadge(emotion) {
        if (!emotion) return '<span class="badge dim">未标注</span>';
        const key = String(emotion);
        const tone = /开心|满足|期待/.test(key) ? 'mint'
            : /愤怒|不安|悲伤/.test(key) ? 'red'
                : /疲惫/.test(key) ? 'gold' : '';
        return '<span class="badge ' + tone + '">' + esc(key) + '</span>';
    }

    window.AdminUI = {
        esc: esc,
        fmtTime: fmtTime,
        toast: toast,
        confirm: confirm,
        formModal: formModal,
        openDrawer: openDrawer,
        closeDrawer: closeDrawer,
        bindDrawer: bindDrawer,
        pager: pager,
        skeleton: skeleton,
        empty: empty,
        safeHtml: safeHtml,
        emotionBadge: emotionBadge
    };
})();
