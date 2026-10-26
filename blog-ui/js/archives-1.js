    // 雪花粒子系统与 BGM 由 js/snow-bgm.js 统一提供

    initHeader();

    // ===== Vue 应用：接管归档列表数据驱动部分（#archiveContent） =====
    const { createApp, ref, onMounted, nextTick, onUnmounted } = Vue;

    // 离线演示数据：后端不可达时也能看到月份横线结构（不跳转文章）
    const DEMO_ARCHIVES = [
        { id: -1, title: '山顶的呼吸练习', year: 2026, month: 9, createDate: '2026-09-10' },
        { id: -1, title: '镜子里的另一个我', year: 2026, month: 9, createDate: '2026-09-03' },
        { id: -1, title: '金草莓与暗面琳', year: 2026, month: 8, createDate: '2026-08-21' },
        { id: -1, title: '心之水晶的炼成', year: 2026, month: 5, createDate: '2026-05-14' },
        { id: -1, title: '塞莱斯特的雪', year: 2025, month: 12, createDate: '2025-12-31' }
    ];

    const ARC_DIR = 'celeste-gui/archive/';
    const MONTH_COVERS = ['intro', 'city', 'oldsite', 'cliffside', 'resort', 'temple', 'reflection', 'Summit', 'core', 'pico8', 'lock', 'farewell'];
    const EN_MONTH = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

    createApp({
        setup() {
            const groups = ref([]);
            const demo = ref(false);
            const totalPosts = ref(0);

            let io = null;

            function formatDate(d) {
                if (!d) return '';
                const dt = new Date(d);
                if (isNaN(dt)) return String(d);
                return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
            }

            function buildGroups(list) {
                // 按年份分组
                const g = {};
                list.forEach(item => {
                    const year = item.year || (item.createDate ? new Date(item.createDate).getFullYear() : '未知');
                    if (!g[year]) g[year] = [];
                    g[year].push(item);
                });
                const years = Object.keys(g).sort((a, b) => b - a);
                return years.map(year => {
                    const items = g[year];
                    // 年份内按月分组
                    const monthMap = {};
                    items.forEach(it => {
                        const m = it.month || (it.createDate ? new Date(it.createDate).getMonth() + 1 : 1);
                        (monthMap[m] = monthMap[m] || []).push(it);
                    });
                    const months = Object.keys(monthMap).sort((a, b) => b - a).map(m => {
                        const mItems = monthMap[m];
                        const cover = MONTH_COVERS[m - 1] || 'intro';
                        const mm = String(m).padStart(2, '0');
                        return {
                            m: Number(m),
                            items: mItems,
                            collapsed: false,
                            cover,
                            mm,
                            enMonth: EN_MONTH[m - 1] || ''
                        };
                    });
                    return { year, posts: items.length, months };
                });
            }

            function toggleMonth(m) {
                m.collapsed = !m.collapsed;
            }

            function goArticle(item, isDemo) {
                if (isDemo || item.id < 0) return;
                location.href = 'article.html?id=' + item.id;
            }

            onMounted(async () => {
                // 预加载月份封面
                MONTH_COVERS.forEach(c => {
                    const pre = new Image();
                    pre.decoding = 'async';
                    pre.src = ARC_DIR + c + '.png';
                });

                // 拉取归档数据
                try {
                    const res = await api('/articles/listArchives', 'POST');
                    if (res.success && res.data && res.data.length) {
                        groups.value = buildGroups(res.data);
                        totalPosts.value = res.data.length;
                        demo.value = false;
                    } else {
                        groups.value = buildGroups(DEMO_ARCHIVES);
                        totalPosts.value = DEMO_ARCHIVES.length;
                        demo.value = true;
                    }
                } catch (e) {
                    groups.value = buildGroups(DEMO_ARCHIVES);
                    totalPosts.value = DEMO_ARCHIVES.length;
                    demo.value = true;
                }

                // 更新标题（.archives-title 在 Vue 挂载区外，vanilla DOM 更新）
                const titleEl = document.querySelector('.archives-title');
                if (titleEl) {
                    titleEl.innerHTML = demo.value
                        ? ' Archives <span class="archive-count">offline demo · 后端未连接</span>'
                        : ' Archives <span class="archive-count">' + totalPosts.value + ' posts total</span>';
                }

                // 我的文章数（数据隔离：只算当前用户写的）
                if (localStorage.getItem('token')) {
                    try {
                        const r = await api('/articles/myCount', 'GET');
                        if (r.success && r.data != null && titleEl) {
                            const mine = document.createElement('span');
                            mine.className = 'archive-count';
                            mine.style.marginLeft = '8px';
                            mine.textContent = '你写了 ' + r.data + ' 篇';
                            titleEl.appendChild(mine);
                        }
                    } catch (e) {}
                }

                // IntersectionObserver：等 Vue 渲染完成后再扫描 .year-group
                await nextTick();
                io = new IntersectionObserver(entries => {
                    entries.forEach(en => {
                        if (en.isIntersecting) {
                            en.target.classList.add('in-view');
                            io.unobserve(en.target);
                        }
                    });
                }, { threshold: 0.12 });
                const yearGroups = document.querySelectorAll('.year-group');
                yearGroups.forEach((g, i) => {
                    g.style.transitionDelay = (i * 0.08) + 's';
                    io.observe(g);
                });
            });

            onUnmounted(() => {
                if (io) io.disconnect();
            });

            return {
                groups, demo, totalPosts, ARC_DIR,
                formatDate, toggleMonth, goArticle
            };
        }
    }).mount('#archiveContent');
