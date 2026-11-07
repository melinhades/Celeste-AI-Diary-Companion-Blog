    // ===== 加载层：最短可见时长 + 空闲预热图集 =====
    // 数据早到时也不能只跑一轮就撤（0.8s × 2 = 1.6s，至少两轮）
    const ARTICLE_LOADING_MIN_MS = 1700;
    // 退场两段（与 css/article.css 的 transition 同值）：光晕先暗 320ms，整层再延迟 320ms 淡出 650ms
    const ARTICLE_LOADING_GLOW_MS = 320;
    const ARTICLE_LOADING_FADE_DELAY_MS = 320;
    const ARTICLE_LOADING_FADE_MS = 650;
    const ARTICLE_LOADING_EXIT_MS = Math.max(ARTICLE_LOADING_GLOW_MS, ARTICLE_LOADING_FADE_DELAY_MS + ARTICLE_LOADING_FADE_MS);
    const articleOverlayShownAt = performance.now();
    (function () {
        const img = document.querySelector('#articleLoadingOverlay .loading-madeline-sprite');
        if (!img || !img.decode) return;
        const go = () => img.decode().catch(() => {});
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 500 });
        else setTimeout(go, 500);
    })();

    // ===== 加载层内雪花（圆点雪 + overlay 雾层，与登录页口径一致） =====
    (function () {
        const c = document.getElementById('ldSnowCanvas');
        if (!c) return;
        function go() {
            if (!(window.CelesteSnow && window.CelesteSnow.attach)) return;
            window.CelesteSnow.attach(c, { particleStyle: 'dots' });   // 层被移除后渲染循环自动停机
        }
        if (window.CelesteSnow && window.CelesteSnow.attach) {
            go();
        } else {
            const s = document.createElement('script');
            s.src = 'js/snow-effect.js?v=20261106c';
            s.onload = go;
            s.onerror = function () {};   // 加载失败：无雪降级
            document.head.appendChild(s);
        }
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
    const commentAnonymous = ref(false);
    const replyTarget = ref(null);
    const replyName = ref('');

    const likeReady = ref(false);
    const likeCount = ref(0);
    const liked = ref(false);
    const likePop = ref(false);
    const likersText = ref('');
    const canEdit = ref(false);

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
    // 评论：非匿名统一默认头像；匿名评论由接口抹掉 author，这里按 anonymous 标记显「匿名」+ 匿名头像
    function commentAuthorName(c) {
        if (c && Number(c.anonymous) === 1) return '匿名';
        return (c && c.author && (c.author.nickname || c.author.username)) || 'Celeste';
    }
    function commentAvatar(c) {
        return (c && Number(c.anonymous) === 1) ? ANONYMOUS_AVATAR : DEFAULT_AVATAR;
    }
    function openTag(id) { location.href = 'index.html?tag=' + id; }
    function openArticle(id) { location.href = 'article.html?id=' + id; }
    function editArticle() { location.href = 'write.html?edit=' + articleId; }

    // 一键删除自己的文章：二次确认 → 调接口 → 回首页
    const deleting = ref(false);
    async function deleteArticle() {
        if (deleting.value) return;
        if (!confirm('确定要删除这篇文章吗？正文、标签和评论会一起删掉，无法恢复。')) return;
        deleting.value = true;
        try {
            const res = await api(`/articles/delete/${articleId}`, 'POST');
            if (res.success) {
                alert('已删除');
                location.href = 'index.html';
            } else {
                alert(res.msg || '删除失败，请稍后重试');
            }
        } catch (e) {
            alert('删除失败，请稍后重试');
        }
        deleting.value = false;
    }

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
            if (overlay) {
                // 至少可见两轮：未跑满就把剩余时间等完，再加 .done 走两段退场
                const wait = Math.max(0, ARTICLE_LOADING_MIN_MS - (performance.now() - articleOverlayShownAt));
                setTimeout(() => {
                    overlay.classList.add('done');
                    setTimeout(() => overlay.remove(), ARTICLE_LOADING_EXIT_MS);
                }, wait);
            }
            if (!res.success) {
                headerStatus.value = 'error';
                return;
            }
            const a = res.data;
            article.value = a;
            document.title = `${a.title} - Celeste Blog`;

            const plain = (a.body?.contentHtml || a.body?.content || '').replace(/<[^>]+>/g, '');
            readMin.value = Math.max(1, Math.ceil(plain.length / 400));

            // 正文：优先用原始 Markdown content 解析（代码块里的 <script setup> 会被 marked 转义，不再触发“含 HTML 就跳过”的危险分支）
            const rawContent = a.body?.content;
            let body = rawContent || a.body?.contentHtml || '';
            if (rawContent) {
                body = rawContent.replace(/^```[a-z]*\s*/, '').replace(/```\s*$/, '');
                body = marked.parse(body);
            }
            // 旧文章正文里可能保存了本机地址或相对路径，按图片的实际归属分别改写：
            // - /uploads/*：历史图片文件随前端一起部署在静态站点根目录，改回本站相对路径（指到 API 域名会 404）
            // - /images/*：新图片存在数据库中由后端提供，必须映射到 API 域名
            body = body.replace(/(src|href)="http:\/\/(?:localhost|127\.0\.0\.1):8888\/(uploads\/[^"]+)"/g, (m, attr, p) => `${attr}="/${p}"`);
            body = body.replace(/http:\/\/(?:localhost|127\.0\.0\.1):8888/g, BASE_URL);
            body = body.replace(/(src|href)="(\/images\/[^"]+)"/g, (m, attr, p) => `${attr}="${BASE_URL}${p}"`);
            // 最终交给 v-html 的 HTML 必须清洗；保留标题/列表/表格/代码块/图片/链接等正常 Markdown 排版
            if (window.DOMPurify) {
                body = window.DOMPurify.sanitize(body, { USE_PROFILES: { html: true } });
            } else {
                // 库未加载时 fail-closed：转义为纯文本，宁可丢排版也不执行注入 HTML
                body = escHtml(body).replace(/'/g, '&#39;');
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
            comments.value = list;
            commentStatus.value = 'ok';
        });
    }

    function submitComment() {
        if (!requireLogin()) return;
        const content = commentText.value.trim();
        if (!content) { showToast('Please enter a comment', 'error'); return; }
        const anonymous = commentAnonymous.value;
        const payload = { articleId, content, anonymous };
        if (replyTarget.value) { payload.parent = replyTarget.value.parent; payload.toUserId = replyTarget.value.toUserId; }
        api('/comments/create/change', 'POST', payload).then(res => {
            if (res.success) {
                commentText.value = '';
                // 匿名是一次性决定，不沿用上次勾选，避免下一条无意中又匿了
                commentAnonymous.value = false;
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
            avatarOf(c) { return commentAvatar(c); },
            nameOf(c) { return commentAuthorName(c); },
            onReply() {
                const c = this.c;
                const parent = this.isChild ? this.topId : c.id;
                const uid = (c.author && c.author.id) || '';
                setReply(parent, uid, commentAuthorName(c));
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
                loggedIn, comments, commentStatus, commentText, commentAnonymous, replyTarget, replyName,
                likeReady, likeCount, liked, likePop, likersText, canEdit,
                authorName, authorImg, commentAuthorName, openTag, openArticle, editArticle, formatDate,
                deleting, deleteArticle,
                renderCommentContent, clearReply, submitComment, toggleLike
            };
        }
    });
    app.component('comment-node', commentNode);
    // 递归组件模板内直接调用的全局工具
    app.config.globalProperties.formatDate = formatDate;
    app.config.globalProperties.renderCommentContent = renderCommentContent;
    app.mount('#articleApp');
