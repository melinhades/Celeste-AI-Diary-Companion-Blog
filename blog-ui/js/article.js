    // ===== 加载层内雪花（snow-bgm 同款，登录页风格） =====
    (function () {
        const c = document.getElementById('ldSnowCanvas');
        if (!c) return;
        const ctx = c.getContext('2d');
        function resize() { c.width = window.innerWidth; c.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);
        const flakes = [];
        for (let i = 0; i < 80; i++) {
            flakes.push({
                x: Math.random() * c.width, y: Math.random() * c.height,
                r: Math.random() * 3 + 1, speed: Math.random() * 1.5 + 0.5,
                wind: Math.random() * 0.5 - 0.25, opacity: Math.random() * 0.6 + 0.2,
                swing: Math.random() * Math.PI * 2, swingSpeed: Math.random() * 0.02 + 0.01
            });
        }
        (function loop() {
            if (!document.getElementById('ldSnowCanvas')) return;
            ctx.clearRect(0, 0, c.width, c.height);
            for (const f of flakes) {
                f.y += f.speed; f.swing += f.swingSpeed;
                f.x += Math.sin(f.swing) * 0.5 + f.wind;
                if (f.y > c.height + 10) { f.y = -10; f.x = Math.random() * c.width; }
                if (f.x > c.width + 10) f.x = -10;
                if (f.x < -10) f.x = c.width + 10;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,' + f.opacity + ')';
                ctx.fill();
            }
            requestAnimationFrame(loop);
        })();
    })();

    // 雪花粒子系统与 BGM 由 js/snow-bgm.js 统一提供

    // 阅读进度条 + 回顶
    const readProgress = document.getElementById('readProgress');
    const backToTop = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        readProgress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
        backToTop.classList.toggle('show', h.scrollTop > 400);
    });
    backToTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

    const articleId = new URLSearchParams(location.search).get('id');
    if (!articleId) location.href = 'index.html';

    initHeader();

    // ===== Vue 驱动：文章头部/正文/点赞/评论树/侧栏 =====
    const { createApp, ref, nextTick, onMounted } = Vue;

    const RANK_ICONS = [
        'celeste-collectables/goldberry.png',
        'celeste-collectables/strawberry.png',
        'celeste-icons/heartgem1.png',
        'celeste-icons/heartgem0.png',
        'celeste-icons/fullclear.png'
    ];

    const headerStatus = ref('loading'); // loading | ok | error
    const article = ref({});
    const bodyHtml = ref('');
    const readMin = ref(1);
    const tocReady = ref(false);
    const related = ref([]);
    const hotArticles = ref([]);
    const hotStatus = ref('loading');

    const loggedIn = ref(!!localStorage.getItem('token'));
    const comments = ref([]);
    const commentStatus = ref('loading'); // loading | ok | empty | error
    const commentText = ref('');
    const replyTarget = ref(null);
    const replyName = ref('');

    const likeReady = ref(false);
    const likeCount = ref(0);
    const liked = ref(false);
    const likePop = ref(false);
    const likersText = ref('');
    const canEdit = ref(false);

    function authorName(a) {
        const n = typeof a.author === 'string' ? a.author : (a.author?.nickname || a.author?.username);
        return n || 'Anonymous';
    }
    function openTag(id) { location.href = 'index.html?tag=' + id; }
    function openArticle(id) { location.href = 'article.html?id=' + id; }
    function editArticle() { location.href = 'write.html?edit=' + articleId; }

    function buildToc() {
        const headings = document.querySelectorAll('.article-body h1,.article-body h2,.article-body h3');
        if (headings.length < 2) return;
        const toc = document.getElementById('tocList');
        headings.forEach((h, i) => {
            h.id = `heading-${i}`;
            const indent = h.tagName === 'H1' ? 0 : h.tagName === 'H2' ? 10 : 20;
            const item = document.createElement('a');
            item.className = 'toc-item';
            item.style.paddingLeft = `${10 + indent}px`;
            item.textContent = h.textContent;
            item.onclick = () => h.scrollIntoView({ behavior: 'smooth', block: 'start' });
            toc.appendChild(item);
        });
        tocReady.value = true;
    }

    function loadArticle() {
        api(`/articles/article/view/${articleId}`, 'POST').then(res => {
            const overlay = document.getElementById('articleLoadingOverlay');
            if (overlay) { overlay.remove(); }
            if (!res.success) {
                headerStatus.value = 'error';
                return;
            }
            const a = res.data;
            article.value = a;
            document.title = `${a.title} - Celeste Blog`;

            const plain = (a.body?.contentHtml || a.body?.content || '').replace(/<[^>]+>/g, '');
            readMin.value = Math.max(1, Math.ceil(plain.length / 400));

            // 正文：优先用 marked 解析原始 Markdown（含 # 标题、** 加粗、``` 代码块等），兜底纯文本自动分段
            let body = a.body?.content || a.body?.contentHtml || '';
            // 去掉可能的 ```markdown 或 ``` 整体包裹
            body = body.replace(/^```[a-z]*\s*/, '').replace(/```\s*$/, '');
            if (body && !/<[a-z][^>]*>/i.test(body)) {
                // 是 Markdown 内容，用 marked 渲染
                body = marked.parse(body);
            }
            bodyHtml.value = `<div class="article-body">${body}</div>`;
            headerStatus.value = 'ok';
            nextTick(() => buildToc());

            loadComments();

            // 编辑入口：仅作者本人可见
            const myNick = localStorage.getItem('nickname');
            const an = authorName(a);
            canEdit.value = !!(myNick && an && myNick === an);

            loadLikeState();
        });
    }

    const MAD_PORTRAITS = ['normal00.png', 'peaceful00.png', 'determined00.png', 'distracted00.png'];

    // ===== 评论表情包：五系列（Atlases/Portraits 各情绪 00 帧；暗面琳素材目录为 ghost） =====
    const EMOJI_PACKS = {
        mad: { dir: 'madeline', names: ['normal', 'peaceful', 'determined', 'distracted', 'panic', 'sad', 'sadder', 'surprised', 'angry', 'deadpan', 'upset', 'together'] },
        bade: { dir: 'ghost', names: ['normal', 'angry', 'angryAlt', 'concerned', 'freakA', 'freakB', 'freakC', 'sad', 'scoff', 'serious', 'sigh', 'upset', 'worried', 'worriedAlt', 'yell'] },
        granny: { dir: 'granny', names: ['normal', 'creepA', 'creepB', 'laugh', 'mock'] },
        theo: { dir: 'theo', names: ['normal', 'excited', 'nailedit', 'serious', 'thinking', 'worried', 'wtf', 'yolo'] },
        oshiro: { dir: 'oshiro', names: ['normal', 'nervous', 'serious', 'sidehappy', 'sideworried', 'sidesuspicious', 'drama', 'lostcontrol', 'worried'] }
    };
    let emojiSeries = 'mad';

    // 表情面板/毛毡钢琴绑定依赖挂载后的 DOM，放进 onMounted
    function initCommentExtras() {
        const emojiBtn = document.getElementById('emojiBtn');
        const emojiPanel = document.getElementById('emojiPanel');
        const emojiGrid = document.getElementById('emojiGrid');
        if (!emojiGrid) return;
        function renderEmojiGrid() {
            const pack = EMOJI_PACKS[emojiSeries];
            emojiGrid.innerHTML = pack.names.map(n =>
                `<button type="button" class="emoji-cell" data-mark="[${emojiSeries}:${n}]" title="${n}"><img loading="lazy" src="Atlases/Portraits/${pack.dir}/${n}00.png" alt="${n}" decoding="async"></button>`
            ).join('');
        }
        renderEmojiGrid();

        if (emojiBtn && emojiPanel) {
            emojiBtn.addEventListener('click', e => {
                e.stopPropagation();
                emojiPanel.classList.toggle('open');
            });
            emojiPanel.addEventListener('click', e => e.stopPropagation());
            document.addEventListener('click', e => {
                if (!e.target.closest('.emoji-wrap')) emojiPanel.classList.remove('open');
            });
        }
        document.querySelectorAll('.emoji-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                emojiSeries = tab.dataset.series;
                renderEmojiGrid();
            });
        });
        emojiGrid.addEventListener('click', e => {
            const cell = e.target.closest('.emoji-cell');
            if (!cell) return;
            insertEmojiMark(cell.dataset.mark);
        });

        // 毛毡钢琴打字音效（textarea：Enter 换行也响打字音）
        FeltPiano.bind(document.getElementById('commentContent'));
    }

    function insertEmojiMark(mark) {
        const ta = document.getElementById('commentContent');
        if (!ta) return;
        const start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
        const end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : ta.value.length;
        ta.setRangeText(mark, start, end, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input'));
    }

    // 渲染评论内容：先整体转义，再把白名单内的表情标记替换为图片（保证无 XSS 注入面）
    function renderCommentContent(text) {
        let s = escHtml(text);
        s = s.replace(/\[(mad|bade|granny|theo|oshiro):([a-zA-Z]+)\]/g, (m, series, name) => {
            const pack = EMOJI_PACKS[series];
            return (pack && pack.names.includes(name))
                ? `<img class="comment-emoji" loading="lazy" src="Atlases/Portraits/${pack.dir}/${name}00.png" alt="${series}:${name}" decoding="async">`
                : m;
        });
        return s;
    }

    // ===== 二级评论回复 =====
    function setReply(parentId, toUserId, name) {
        if (!requireLogin()) return;
        replyTarget.value = { parent: parentId, toUserId: toUserId };
        replyName.value = name;
        document.getElementById('commentForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('commentContent').focus();
    }
    function clearReply() {
        replyTarget.value = null;
    }

    function loadComments() {
        commentStatus.value = 'loading';
        api(`/comments/article/${articleId}`, 'GET').then(res => {
            if (!res.success) { commentStatus.value = 'error'; return; }
            const list = res.data || [];
            if (list.length === 0) { commentStatus.value = 'empty'; return; }
            // 按深度优先顺序分配头像序号，复刻原 avIdx 全局递增效果
            let i = 0;
            const walk = c => { c._portrait = i++; (c.childrens || []).forEach(walk); };
            list.forEach(walk);
            comments.value = list;
            commentStatus.value = 'ok';
        });
    }

    function submitComment() {
        if (!requireLogin()) return;
        const content = commentText.value.trim();
        if (!content) { showToast('Please enter a comment', 'error'); return; }
        const payload = { articleId, content };
        if (replyTarget.value) { payload.parent = replyTarget.value.parent; payload.toUserId = replyTarget.value.toUserId; }
        api('/comments/create/change', 'POST', payload).then(res => {
            if (res.success) {
                commentText.value = '';
                clearReply();
                showToast('Comment posted', 'success');
                FeltPiano.send();
                loadComments();
            } else {
                showToast(res.msg || 'Failed to post comment', 'error');
            }
        });
    }

    // ===== 心之宝石点赞 =====
    function applyLikeUI(count, isLiked) {
        likeCount.value = count;
        liked.value = !!isLiked;
    }
    function loadLikeState() {
        api(`/likes/info/${articleId}`, 'GET').then(res => {
            if (!res.success) return;
            applyLikeUI(res.data.likeCount || 0, !!res.data.liked);
            likeReady.value = true;
        }).catch(() => {});
        loadLikers();
    }

    function loadLikers() {
        api(`/likes/users/${articleId}`, 'GET').then(res => {
            const names = res.success ? (res.data || []) : [];
            likersText.value = names.length
                ? '✨ ' + names.join('、') + ' 点亮了这篇文章'
                : '';
        }).catch(() => {});
    }

    function toggleLike() {
        if (!requireLogin()) return;
        api('/likes/toggle', 'POST', { articleId }).then(res => {
            if (!res.success) { showToast(res.msg || '操作失败', 'error'); return; }
            applyLikeUI(res.data.likeCount || 0, !!res.data.liked);
            loadLikers();
            // 双 rAF 先移除再挂回 pop，重放宝石弹跳动画
            likePop.value = false;
            requestAnimationFrame(() => requestAnimationFrame(() => { likePop.value = true; }));
            showToast(res.data.liked ? '心之宝石点亮了这篇文章 ✨' : '已取消点亮', 'success');
        });
    }

    // 相关文章（原页面定义但未调用，保持不触发）
    function loadRelated(categoryId) {
        api('/articles', 'POST', { page: 1, pageSize: 8, categoryId: String(categoryId) }).then(res => {
            const records = (res && res.success && res.data && (res.data.records || res.data)) || [];
            related.value = records.filter(x => String(x.id) !== String(articleId)).slice(0, 4);
        }).catch(() => {});
    }

    function loadHotArticles() {
        api('/articles/hot', 'POST').then(res => {
            hotStatus.value = 'ok';
            if (!res.success) return;
            hotArticles.value = res.data || [];
        });
    }

    // 递归评论组件
    const commentNode = {
        name: 'CommentNode',
        template: '#commentNodeTpl',
        props: { c: { type: Object, required: true }, topId: { default: '' }, isChild: { type: Boolean, default: false } },
        methods: {
            portraitFor(c) { return MAD_PORTRAITS[(c._portrait || 0) % MAD_PORTRAITS.length]; },
            onReply() {
                const c = this.c;
                const parent = this.isChild ? this.topId : c.id;
                const uid = (c.author && c.author.id) || '';
                const name = (c.author && (c.author.nickname || c.author.username)) || 'Anonymous';
                setReply(parent, uid, name);
            }
        }
    };

    const app = createApp({
        setup() {
            onMounted(() => {
                loadHotArticles();
                loadArticle();
                if (loggedIn.value) nextTick(initCommentExtras);
            });
            return {
                headerStatus, article, bodyHtml, readMin, tocReady, related,
                hotArticles, hotStatus, rankIcons: RANK_ICONS,
                loggedIn, comments, commentStatus, commentText, replyTarget, replyName,
                likeReady, likeCount, liked, likePop, likersText, canEdit,
                authorName, openTag, openArticle, editArticle, formatDate,
                renderCommentContent, clearReply, submitComment, toggleLike
            };
        }
    });
    app.component('comment-node', commentNode);
    // 递归组件模板内直接调用的全局工具
    app.config.globalProperties.formatDate = formatDate;
    app.config.globalProperties.renderCommentContent = renderCommentContent;
    app.mount('#articleApp');
