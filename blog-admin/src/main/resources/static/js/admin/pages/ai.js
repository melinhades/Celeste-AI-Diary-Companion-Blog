/* AI 调用观测：只读展示 blog-api 已发生的检索、生成与评分链路 */
(function () {
    'use strict';
    const ui = window.AdminUI;
    const state = { page: 1, size: 10, scene: '', status: '', userId: '', query: '', days: 7 };
    const SCENES = {
        diary_emotion: '日记情绪分析',
        diary_index: '日记知识库索引',
        diary_companion: '日记伴侣回复',
        rag_retrieval: 'RAG 上下文检索',
        memory_retrieval: '记忆检索',
        memory_extraction: '记忆提取'
    };
    const TYPES = {
        llm: { label: 'LLM', cls: 'llm' },
        embed: { label: '向量', cls: 'embed' },
        retrieval: { label: '检索', cls: 'retrieval' },
        score: { label: '评分', cls: 'score' }
    };

    function sceneName(scene) {
        return SCENES[scene] || scene || 'AI 调用';
    }

    function statusBadge(status) {
        const value = String(status || '');
        const cls = value === 'OK' ? 'mint' : value === 'FAIL' ? 'red' : 'gold';
        const label = value === 'OK' ? '成功' : value === 'FAIL' ? '失败' : value === 'RUNNING' ? '进行中' : value || '未知';
        return '<span class="badge ' + cls + '">' + ui.esc(label) + '</span>';
    }

    function duration(value) {
        const ms = Number(value || 0);
        return ms >= 1000 ? (ms / 1000).toFixed(ms >= 10000 ? 1 : 2) + ' s' : ms + ' ms';
    }

    function score(value) {
        return value == null || value === '' ? '-' : Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    }

    function tokenText(trace) {
        const prompt = Number(trace.promptTokens || 0);
        const completion = Number(trace.completionTokens || 0);
        if (!prompt && !completion) return '<span class="badge dim">未上报</span>';
        return '<span class="ai-token"><b>' + (prompt + completion) + '</b><small>输入 ' + prompt + ' · 输出 ' + completion + '</small></span>';
    }

    function toolbarHtml() {
        return '<div class="ai-readonly"><span class="user-dot"></span>这里只读呈现 blog-api 前台已经发生的 AI 流程，不会触发、重放或修改调用。</div>'
            + '<div class="toolbar ai-toolbar">'
            + '<select class="select" id="aiScene"><option value="">全部场景</option></select>'
            + '<select class="select" id="aiStatus"><option value="">全部状态</option><option value="OK">成功</option><option value="FAIL">失败</option><option value="RUNNING">进行中</option></select>'
            + '<input class="input ai-user" id="aiUser" placeholder="用户 ID">'
            + '<input class="input" id="aiQuery" placeholder="搜索标题 / 场景…">'
            + '<select class="select" id="aiDays"><option value="1">最近 24 小时</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="90">最近 90 天</option></select>'
            + '<button class="btn" id="aiSearch">筛选</button>'
            + '<button class="btn btn-ghost" id="aiReset">重置</button>'
            + '<span class="spacer"></span>'
            + '<button class="btn btn-ghost" id="aiRefresh">刷新</button>'
            + '</div>';
    }

    function rowsHtml(list) {
        if (!list.length) {
            return '<div class="empty"><span class="big">✦</span>暂无匹配的 AI 调用记录<br><small>在前台保存日记或使用日记伴侣后，可回到这里刷新查看。</small></div>';
        }
        let html = '<div class="table-wrap"><table class="data ai-table"><thead><tr>'
            + '<th style="min-width:145px">开始时间</th><th style="min-width:210px">业务场景 / 标题</th>'
            + '<th>用户</th><th>流程</th><th>Token</th><th>评分</th><th>状态</th><th>操作</th>'
            + '</tr></thead><tbody>';
        list.forEach(function (t) {
            html += '<tr data-id="' + ui.esc(t.id) + '">'
                + '<td><div class="ai-time">' + ui.fmtTime(t.startTime || t.createDate) + '<small>' + duration(t.durationMs) + '</small></div></td>'
                + '<td><div class="cell-title ai-trace-title">' + ui.esc(sceneName(t.scene))
                + '<span class="muted">' + ui.esc(t.title || t.scene || '未命名调用') + '</span></div></td>'
                + '<td class="mono">' + ui.esc(t.userId || '-') + '</td>'
                + '<td><div class="ai-flow-summary"><b>' + Number(t.stepCount || 0) + '</b> 步<small>' + ui.esc(t.model || '多阶段调用') + '</small></div></td>'
                + '<td>' + tokenText(t) + '</td>'
                + '<td class="ai-score">' + score(t.score) + '</td>'
                + '<td>' + statusBadge(t.status) + '</td>'
                + '<td><button class="btn btn-sm" data-act="detail">查看流程</button></td></tr>';
        });
        return html + '</tbody></table></div>';
    }

    function prettyMeta(value) {
        if (!value) return '';
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch (e) {
            return String(value);
        }
    }

    function ioBlock(label, value, open) {
        if (value == null || value === '') return '';
        return '<details class="ai-io"' + (open ? ' open' : '') + '><summary>' + ui.esc(label) + '</summary>'
            + '<pre>' + ui.esc(value) + '</pre></details>';
    }

    function stepHtml(step, index, total) {
        const type = TYPES[step.type] || { label: step.type || '步骤', cls: 'other' };
        let chips = '<span>+' + duration(step.startOffsetMs) + '</span>'
            + '<span>耗时 ' + duration(step.durationMs) + '</span>';
        if (step.model) chips += '<span>' + ui.esc(step.model) + '</span>';
        if (step.score != null) chips += '<span class="score">分数 ' + score(step.score) + '</span>';
        const meta = prettyMeta(step.meta);
        return '<div class="ai-step ' + type.cls + (index === total - 1 ? ' last' : '') + '">'
            + '<div class="ai-step-rail"><span>' + Number(step.seq || index + 1) + '</span></div>'
            + '<div class="ai-step-body"><div class="ai-step-head"><div>'
            + '<span class="ai-step-type">' + ui.esc(type.label) + '</span>'
            + '<b>' + ui.esc(step.name || '未命名步骤') + '</b></div>' + statusBadge(step.status) + '</div>'
            + '<div class="ai-step-chips">' + chips + '</div>'
            + ioBlock(step.type === 'retrieval' ? '检索查询' : '输入 / Prompt', step.inputText, false)
            + ioBlock(step.type === 'retrieval' ? '命中片段与相似度' : '模型输出 / 结果', step.outputText, step.type === 'score')
            + ioBlock('调用参数', meta, false)
            + (step.error ? '<div class="ai-error">' + ui.esc(step.error) + '</div>' : '')
            + '</div></div>';
    }

    function detail(id) {
        ui.openDrawer('AI 调用流程', '<div class="loading">正在读取链路…</div>');
        window.AdminApi.get('/admin/ai/trace/' + encodeURIComponent(id)).then(function (data) {
            const t = data.trace || {};
            const steps = data.steps || [];
            const meta = statusBadge(t.status)
                + '<span class="badge dim">' + ui.esc(t.scene || 'ai_call') + '</span>'
                + '<span class="badge dim">只读记录</span>';
            let html = '<div class="ai-detail-grid">'
                + '<div><label>开始时间</label><b>' + ui.fmtTime(t.startTime || t.createDate) + '</b></div>'
                + '<div><label>总耗时</label><b>' + duration(t.durationMs) + '</b></div>'
                + '<div><label>用户 ID</label><b>' + ui.esc(t.userId || '-') + '</b></div>'
                + '<div><label>模型</label><b>' + ui.esc(t.model || '-') + '</b></div>'
                + '<div><label>Token</label><b>' + Number(t.promptTokens || 0) + ' + ' + Number(t.completionTokens || 0) + '</b></div>'
                + '<div><label>最终评分</label><b>' + score(t.score) + '</b></div></div>'
                + (t.title ? '<div class="ai-trace-subject"><label>业务对象 / 主题</label><div>' + ui.esc(t.title) + '</div></div>' : '')
                + (t.error ? '<div class="ai-error trace">' + ui.esc(t.error) + '</div>' : '')
                + '<div class="ai-timeline-title">执行步骤<small>' + steps.length + ' 步 · 按实际执行顺序</small></div>'
                + '<div class="ai-timeline">';
            html += steps.length ? steps.map(function (step, index) {
                return stepHtml(step, index, steps.length);
            }).join('') : '<div class="empty">该链路尚无步骤记录</div>';
            html += '</div>';
            ui.openDrawer(sceneName(t.scene), html, meta);
        }).catch(function (err) {
            ui.toast(err.message, 'error');
            ui.closeDrawer();
        });
    }

    function collectFilters() {
        state.scene = document.getElementById('aiScene').value;
        state.status = document.getElementById('aiStatus').value;
        state.userId = document.getElementById('aiUser').value.trim();
        state.query = document.getElementById('aiQuery').value.trim();
        state.days = Number(document.getElementById('aiDays').value || 7);
        state.page = 1;
    }

    function loadScenes() {
        return window.AdminApi.get('/admin/ai/trace/scenes').then(function (scenes) {
            const select = document.getElementById('aiScene');
            let html = '<option value="">全部场景</option>';
            (scenes || []).forEach(function (scene) {
                html += '<option value="' + ui.esc(scene) + '">' + ui.esc(sceneName(scene)) + ' · ' + ui.esc(scene) + '</option>';
            });
            select.innerHTML = html;
            select.value = state.scene;
        });
    }

    function load() {
        const listEl = document.getElementById('aiList');
        ui.skeleton(listEl, 5);
        return window.AdminApi.post('/admin/ai/trace/page', {
            currentPage: state.page,
            pageSize: state.size,
            scene: state.scene,
            status: state.status,
            userId: state.userId,
            queryString: state.query,
            days: state.days
        }).then(function (page) {
            listEl.innerHTML = rowsHtml(page.list || []);
            ui.pager(document.getElementById('aiPager'), page.total || 0, state.page, state.size,
                function (next) { state.page = next; load(); });
        });
    }

    function bind() {
        document.getElementById('aiScene').value = state.scene;
        document.getElementById('aiStatus').value = state.status;
        document.getElementById('aiUser').value = state.userId;
        document.getElementById('aiQuery').value = state.query;
        document.getElementById('aiDays').value = String(state.days);
        document.getElementById('aiSearch').onclick = function () { collectFilters(); load(); };
        document.getElementById('aiRefresh').onclick = function () { loadScenes().then(load); };
        document.getElementById('aiReset').onclick = function () {
            Object.assign(state, { page: 1, scene: '', status: '', userId: '', query: '', days: 7 });
            document.getElementById('aiScene').value = '';
            document.getElementById('aiStatus').value = '';
            document.getElementById('aiUser').value = '';
            document.getElementById('aiQuery').value = '';
            document.getElementById('aiDays').value = '7';
            load();
        };
        ['aiUser', 'aiQuery'].forEach(function (id) {
            document.getElementById(id).onkeydown = function (e) {
                if (e.key === 'Enter') document.getElementById('aiSearch').click();
            };
        });
        document.getElementById('aiList').onclick = function (e) {
            const btn = e.target.closest('button[data-act="detail"]');
            if (btn) detail(btn.closest('tr').dataset.id);
        };
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.ai = {
        render: function (view) {
            view.innerHTML = toolbarHtml()
                + '<div class="card"><div class="card-head"><div class="card-title">AI 调用链路<small>blog-api 实际执行记录 · 按时间倒序</small></div></div>'
                + '<div id="aiList"></div><div class="pager" id="aiPager"></div></div>';
            bind();
            return Promise.all([loadScenes(), load()]);
        }
    };
})();
