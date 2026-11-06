    // ===== 检测登录成功回跳：播登录成功音效 =====
    if (sessionStorage.getItem('justLoggedIn') === '1') {
        sessionStorage.removeItem('justLoggedIn');
        const yes = new Audio('sounds/ui_main_assistmode_whistle_page4.wav');
        yes.volume = 0.8;
        yes.play().catch(() => {
            const h = () => { yes.play().catch(() => {}); document.removeEventListener('click', h); document.removeEventListener('keydown', h); };
            document.addEventListener('click', h);
            document.addEventListener('keydown', h);
        });
    }

    const PAGE_SIZE = 10;

    // 初始化
    initHeader();

    // ===== Vue 驱动：分类条 / 搜索 / 文章列表 / 分页 / 热门 / 标签云 =====
    const { createApp, ref, computed, onMounted } = Vue;

    const RANK_ICONS = [
        'celeste-collectables/goldberry.png',
        'celeste-collectables/strawberry.png',
        'celeste-icons/heartgem1.png',
        'celeste-icons/heartgem0.png',
        'celeste-icons/fullclear.png'
    ];

    const categories = ref([]);
    const activeCat = ref('');
    const activeTag = ref('');
    const keyword = ref('');
    const articles = ref([]);
    const likeCounts = ref({});
    const listStatus = ref('loading'); // loading | ok | empty | error
    const currentPage = ref(1);
    const total = ref(0);
    const totalPages = computed(() => Math.ceil(total.value / PAGE_SIZE) || 1);
    const hotArticles = ref([]);
    const hotStatus = ref('loading');
    const hotTags = ref([]);
    const tagStatus = ref('loading');

    // 非匿名统一用默认头像；匿名文章显示「匿名」+ 匿名头像
    const DEFAULT_AVATAR = 'celeste-gui/user-avatar.webp';
    const ANONYMOUS_AVATAR = 'celeste-icons/beat.png';
    function isAnonymous(a) { return !!(a && Number(a.anonymous) === 1); }
    function authorName(a) {
        if (isAnonymous(a)) return '匿名';
        const n = typeof a.author === 'string' ? a.author : (a.author?.nickname || a.author?.username);
        return n || 'Celeste';
    }
    function authorImg(a) {
        return isAnonymous(a) ? ANONYMOUS_AVATAR : DEFAULT_AVATAR;
    }
    // 图片地址按实际归属改写：
    // - /uploads/*：历史图片随前端部署在静态站点根目录，保持本站路径（指到 API 域名会 404）
    // - /images/*：新图片存在数据库中，需要指向 API 域名
    function fixImageUrl(u) {
        if (!u) return u;
        let url = String(u).replace(/http:\/\/(?:localhost|127\.0\.0\.1):8888\/(uploads\/)/g, '/$1');
        url = url.replace(/http:\/\/(?:localhost|127\.0\.0\.1):8888/g, BASE_URL);
        if (url.indexOf('/images/') === 0) url = BASE_URL + url;
        return url;
    }
    function openArticle(id) { location.href = 'article.html?id=' + id; }

    function loadCategories() {
        api('/categorys', 'GET').then(res => {
            if (!res.success) return;
            categories.value = res.data || [];
        });
    }

    function loadLikeCounts(list) {
        const ids = (list || []).map(a => a.id).filter(Boolean).join(',');
        if (!ids) return;
        api('/likes/counts?ids=' + encodeURIComponent(ids), 'GET').then(res => {
            if (!res.success || !res.data) return;
            likeCounts.value = res.data;
        }).catch(() => {});
    }

    function loadArticles(page) {
        currentPage.value = page;
        listStatus.value = 'loading';
        const body = { page: page, pageSize: PAGE_SIZE };
        if (activeCat.value) body.categoryId = activeCat.value;
        if (activeTag.value) body.tagId = activeTag.value;
        if (keyword.value) body.keyword = keyword.value;
        api('/articles', 'POST', body).then(res => {
            if (!res.success) { listStatus.value = 'error'; return; }
            const list = res.data.records || res.data || [];
            articles.value = list.map(a => ({
                ...a,
                images: (a.images || []).map(fixImageUrl)
            }));
            likeCounts.value = {};
            listStatus.value = list.length ? 'ok' : 'empty';
            loadLikeCounts(list);
            total.value = res.data.total || 0;
        });
    }

    function loadHotArticles() {
        api('/articles/hot', 'POST').then(res => {
            hotStatus.value = 'ok';
            if (!res.success) return;
            hotArticles.value = (res.data || []).map(a => ({
                ...a,
                images: (a.images || []).map(fixImageUrl)
            }));
        });
    }

    function loadHotTags() {
        api('/tags/hot', 'GET').then(res => {
            tagStatus.value = 'ok';
            if (!res.success) return;
            hotTags.value = res.data || [];
        });
    }

    // ===== URL 参数直达筛选（?tag= / ?kw=），activeTag/keyword 直接驱动高亮 =====
    const _urlParams = new URLSearchParams(location.search);
    if (_urlParams.get('tag')) activeTag.value = _urlParams.get('tag');
    if (_urlParams.get('kw')) keyword.value = _urlParams.get('kw');

    function onFilterCat(c) {
        activeCat.value = String(c.id);
        activeTag.value = '';
        keyword.value = '';
        setSnowImageForCategory(c.id);
        loadArticles(1);
    }
    function onFilterAll() {
        activeCat.value = '';
        activeTag.value = '';
        keyword.value = '';
        setSnowImageForCategory(null);
        loadArticles(1);
    }
    function filterByTag(t) {
        activeTag.value = String(t.id);
        activeCat.value = '';
        keyword.value = '';
        setSnowImageForCategory(null);
        loadArticles(1);
    }
    function doSearch() {
        activeTag.value = '';
        activeCat.value = '';
        loadArticles(1);
    }

    createApp({
        setup() {
            onMounted(() => {
                loadCategories();
                loadArticles(1);
                loadHotArticles();
                loadHotTags();
            });
            return {
                categories, activeCat, activeTag, keyword,
                articles, likeCounts, listStatus, currentPage, total, totalPages,
                hotArticles, hotStatus, hotTags, tagStatus,
                rankIcons: RANK_ICONS,
                authorName, authorImg, openArticle, formatDate,
                loadArticles, onFilterCat, onFilterAll, filterByTag, doSearch
            };
        }
    }).mount('#indexApp');

    // ===== 雪花粒子系统 =====
    // 旧版「分类切换圆点雪花图片」覆盖段已移除：imageMap 一直为空、从未生效，
    // 且雪已升级为 Celeste 原作 1:1 HiresSnow（js/snow-bgm.js 统一驱动）。
    // Vue 方法里的 setSnowImageForCategory 调用保留为 no-op 兼容。
    function setSnowImageForCategory() {};
    // 分类/标签/All 点击时的雪flake切换已在 Vue 方法内直接调用 setSnowImageForCategory
