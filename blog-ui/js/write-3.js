    // BGM
    const bgmPlayer = document.getElementById('bgmPlayer');
    const savedTime = parseFloat(localStorage.getItem('bgmTime') || '0');
    if (savedTime > 0) bgmPlayer.currentTime = savedTime;
    bgmPlayer.volume = 0.25;
    bgmPlayer.play().catch(() => {});
    setInterval(() => { localStorage.setItem('bgmTime', bgmPlayer.currentTime); }, 2000);
    function tryPlayBGM() { bgmPlayer.play().then(() => { document.removeEventListener('click', tryPlayBGM); document.removeEventListener('keydown', tryPlayBGM); }).catch(() => {}); }
    document.addEventListener('click', tryPlayBGM);
    document.addEventListener('keydown', tryPlayBGM);

    if (!localStorage.getItem('token')) {
        showToast('Please login first', 'error');
        setTimeout(() => location.href = 'login.html', 800);
    }
    initHeader();

    // ===== Vue 接管编辑表单：标题/正文/分类/标签/摘要/字数/图片预览 =====
    // insertMd / AI 生成 / 上传 / edit 预填等 vanilla 流程在直接改完 .value 后
    // dispatch 一个 input 事件，v-model 即同步；字数、图片预览由 computed 驱动。
    const { createApp, ref, computed, onMounted } = Vue;
    const title = ref('');
    const body = ref('');
    const summary = ref('');
    const tagsRaw = ref('');
    const categoryId = ref('');
    const categories = ref([]);
    const imgSrcs = computed(() => {
        const srcs = [];
        const re = /<img[^ loading="lazy" decoding="async">]+src="([^"]+)"/g;
        let m;
        while ((m = re.exec(body.value)) !== null) srcs.push(m[1]);
        return srcs;
    });
    function loadCategories() {
        api('/categorys', 'GET').then(res => {
            if (!res.success) return;
            categories.value = res.data || [];
        });
    }
    createApp({
        setup() {
            onMounted(loadCategories);
            return { title, body, summary, tagsRaw, categoryId, categories, imgSrcs };
        }
    }).mount('#writeApp');

    // Vue 挂载 #writeApp 时会重建内部 DOM，冲掉在 mount 之前用 addEventListener
    // 绑定的工具栏按钮事件。因此「Madeline / 润色 / 生成文章」三个按钮必须在
    // mount 之后重新绑定，否则点击无反应。
    document.getElementById('openMadelineBtn').addEventListener('click', function() {
        if (typeof togglePanel === 'function') togglePanel();
    });
    document.getElementById('toolbarPolishBtn').addEventListener('click', function() {
        if (typeof doPolish === 'function') doPolish();
    });
    document.getElementById('toolbarGenBtn').addEventListener('click', function() {
        if (typeof doGenerate === 'function') doGenerate();
    });

    // vanilla 预填后同步 v-model
    function setVal(id, val) {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input'));
    }

    function insertMd(before, after) {
        const ta = document.getElementById('articleBody');
        const start = ta.selectionStart, end = ta.selectionEnd;
        const selected = ta.value.substring(start, end);
        const replacement = before + selected + after;
        ta.value = ta.value.substring(0, start) + replacement + ta.value.substring(end);
        ta.focus();
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + selected.length;
        updateCount();
    }

    // 兼容旧调用：派发 input 让 v-model 刷新（字数/图片预览随之响应式更新）
    function updateCount() {
        document.getElementById('articleBody').dispatchEvent(new Event('input'));
    }

    // edit mode: write.html?edit=articleId
    const EDIT_ID = new URLSearchParams(location.search).get('edit');
    if (EDIT_ID) {
        api('/articles/article/view/' + EDIT_ID, 'POST').then(res => {
            if (!res.success || !res.data) { showToast('文章不存在', 'error'); return; }
            const a = res.data;
            setVal('articleTitle', a.title || '');
            setVal('articleBody', (a.body && a.body.content) || '');
            setVal('summaryInput', a.summary || '');
            setVal('tagsInput', (a.tags || []).map(t => t.tagName || t.name).join(','));
            // v-model 保留待选值，分类选项异步加载完会自动选中，无需轮询
            if (a.category && a.category.id) categoryId.value = String(a.category.id);
            document.getElementById('publishBtn').textContent = 'Save Changes';
        });
    }

    function uploadImage(input) {
        const file = input.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('image', file);
        showToast('Uploading...', 'info');
        fetch(BASE_URL + '/upload', {
            method: 'POST',
            headers: { 'Authorization': localStorage.getItem('token') || '' },
            body: fd
        }).then(r => r.json()).then(res => {
            if (res.success && res.data) {
                insertMd('<img src="' + BASE_URL + res.data + '" style="max-width:100%;border-radius:8px;margin:12px 0;" loading="lazy" decoding="async">\n', '');
                showToast('Image added', 'success');
            } else {
                showToast(res.msg || 'Upload failed', 'error');
            }
        }).catch(() => showToast('Upload failed', 'error'))
            .finally(() => { input.value = ''; });
    }
    function publishArticle() {
        const title = document.getElementById('articleTitle').value.trim();
        const body = document.getElementById('articleBody').value.trim();
        const categoryId = document.getElementById('categorySelect').value;
        const summary = document.getElementById('summaryInput').value.trim();
        const tagsRaw = document.getElementById('tagsInput').value.trim();

        if (!title) {
            showToast('Please enter a title', 'error');
            return;
        }
        if (!body) {
            showToast('Please enter content', 'error');
            return;
        }

        const tags = tagsRaw ? tagsRaw.split(',').map(t => ({ tagName: t.trim() })).filter(t => t.tagName) : [];
        const payload = { title, summary, body: { content: body }, tags, };
        if (categoryId) payload.category = { id: categoryId };
        if (EDIT_ID) payload.id = EDIT_ID;

        const btn = document.getElementById('publishBtn');
        btn.disabled = true;
        btn.textContent = EDIT_ID ? 'Save Changes' : 'Publishing...';

        api(EDIT_ID ? '/articles/update' : '/articles/publish', 'POST', payload).then(res => {
            btn.disabled = false;
            btn.textContent = EDIT_ID ? 'Save Changes' : 'Publish';
            if (res.success) {
                showToast('Published!', 'success');
                setTimeout(() => location.href = res.data?.id ? `article.html?id=${res.data.id}` : 'index.html', 1000);
            } else {
                showToast(res.msg || 'Publish failed', 'error');
            }
        });
    }
