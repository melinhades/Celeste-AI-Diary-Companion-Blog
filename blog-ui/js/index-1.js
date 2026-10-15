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

    function authorName(a) {
        const n = typeof a.author === 'string' ? a.author : (a.author?.nickname || a.author?.username);
        return n || '匿名';
    }
    function authorImg(a) {
        const n = typeof a.author === 'string' ? a.author : (a.author?.nickname || a.author?.username);
        return n ? 'celeste-portraits/madeline/normal00.png' : 'celeste-icons/beat.png';
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
            articles.value = list;
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
            hotArticles.value = res.data || [];
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

    // ===== 雪花粒子系统增强：支持分类切换雪花图片 =====
    let snowImage = null; // 添加到雪花系统变量中

    // 保存原始函数引用（如果你原来的函数名正好是这些）
    const _createSnowflake = typeof createSnowflake === 'function' ? createSnowflake : null;
    const _drawSnowflakes  = typeof drawSnowflakes  === 'function' ? drawSnowflakes  : null;
    const _initSnowflakes  = typeof initSnowflakes  === 'function' ? initSnowflakes  : null;
    const _startSnow       = typeof startSnow       === 'function' ? startSnow       : null;

    // 重新定义创建雪flake（如果原来存在则在其基础上加 img 属性）
    createSnowflake = function() {
        const flake = _createSnowflake ? _createSnowflake() : {
            x: Math.random()*snowCanvas.width, y:-10,
            r: Math.random()*3+1,
            speed: Math.random()*1.5+0.5,
            wind: Math.random()*0.5-0.25,
            opacity: Math.random()*0.6+0.2,
            swing: Math.random()*Math.PI*2,
            swingSpeed: Math.random()*0.02+0.01
        };
        flake.img = snowImage;
        return flake;
    };

    // 重新定义绘制雪flake
    drawSnowflakes = function() {
        snowCtx.clearRect(0,0,snowCanvas.width,snowCanvas.height);
        for(const f of snowflakes){
            f.y += f.speed;
            f.swing += f.swingSpeed;
            f.x += Math.sin(f.swing)*0.5 + f.wind;
            if(f.y > snowCanvas.height+10){ f.y=-10; f.x=Math.random()*snowCanvas.width; }
            if(f.x > snowCanvas.width+10) f.x=-10;
            if(f.x < -10) f.x = snowCanvas.width+10;
            if(f.img){
                snowCtx.drawImage(f.img, f.x-f.r, f.y-f.r, f.r*2, f.r*2);
            }else{
                snowCtx.beginPath();
                snowCtx.arc(f.x,f.y,f.r,0,Math.PI*2);
                snowCtx.fillStyle = `rgba(255,255,255,${f.opacity})`;
                snowCtx.fill();
            }
        }
        snowAnimFrame = requestAnimationFrame(drawSnowflakes);
    };

    // 重新定义初始化（保持原来的行为）
    initSnowflakes = function() {
        snowflakes = [];
        for(let i=0;i<80;i++){
            const f = createSnowflake();
            f.y = Math.random()*snowCanvas.height;
            snowflakes.push(f);
        }
    };

    // 重新定义启动函数
    startSnow = function(){
        resizeSnowCanvas();
        initSnowflakes();
        drawSnowflakes();
    };
    window.addEventListener('resize', resizeSnowCanvas);
    if (window.location.pathname.endsWith('/index.html') || window.location.pathname === '/' || window.location.pathname === '') {
        startSnow();   // 确保页面打开时就开始
    }

    // 设置分类对应的雪flake图片
    function setSnowImageForCategory(categoryId) {
        // ==== 在这里填写你准备好的雪flake图片映射 ====
        // key 为你后端返回的 category.id（或你在 filter-item[data-id] 中存的值）
        // value 为相对路径（相对于 index.html）
        const imageMap = {
            // 示例（请根据你实际的图片名称修改）：
            // "forsaken-city": "celeste-areas/ForsakenCity_snowleaf.png",
            // "celestial-resort": "celeste-areas/CelestialResort_snowstar.png",
            // 如果没有映射或想使用默认圆点雪flake，则返回 null
        };
        const imgSrc = imageMap[categoryId] || null;

        if (imgSrc) {
            const img = new Image();
            img.src = imgSrc;
            img.onload = () => {
                snowImage = img;
                // 立即更新一次雪flake显示
                drawSnowflakes();
            };
            img.onerror = () => {
                console.warn('雪flake图片加载失败:', imgSrc);
                snowImage = null;
            };
        } else {
            snowImage = null; // 恢复为默认圆点雪flake
        }
    };
    // 分类/标签/All 点击时的雪flake切换已在 Vue 方法内直接调用 setSnowImageForCategory
