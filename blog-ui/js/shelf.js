    // dream 场景（#dreamScene，z-index 1500）会把书架整屏盖住：书架侧的逐帧动画（雪花 / 篝火 / 奖杯 /
    // 夜话按钮）那个时候一点也看不见，却仍在 decode + 绘制。下面的逐帧循环统一用这个判断跳过。
    var __dreamSceneEl = null;
    function dreamCoveringShelf() {
        if (document.hidden) return true;
        if (!__dreamSceneEl) __dreamSceneEl = document.getElementById('dreamScene');
        return !!(__dreamSceneEl && __dreamSceneEl.classList.contains('show'));
    }

    // ===== 雪花动画（mountainSnow 原版贴图） =====
    (function () {
        const canvas = document.getElementById('shelfSnow');
        const ctx = canvas.getContext('2d');
        const flakeImg = new Image();
        flakeImg.src = 'celeste-gui/mountain-snow.png';
        let flakes = [];
        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        function mk(randomY) {
            return {
                x: Math.random() * canvas.width,
                y: randomY ? Math.random() * canvas.height : -20,
                s: Math.random() * 10 + 5,
                speed: Math.random() * 1 + 0.4,
                wind: Math.random() * 0.4 - 0.2,
                opacity: Math.random() * 0.55 + 0.3,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.02,
                swing: Math.random() * Math.PI * 2,
                swingSpeed: Math.random() * 0.02 + 0.008
            };
        }
        function init() { flakes = []; for (let i = 0; i < 50; i++) flakes.push(mk(true)); }
        // 性能：dream 场景整屏盖住这层雪花时它一点也看不见，原来的 rAF 照样每帧全屏 clearRect +
        // 50 片 save/rotate/drawImage —— 进 dream 后就白烧。盖住期间不再排 rAF（每帧一次空回调也会
        // 让浏览器每帧都留一次唤醒），改成 200ms 轮询探一下：退出 dream 后最多 0.2s 就自动接回逐帧，
        // 雪片位置不跳、立刻接着飘（判断见顶部 dreamCoveringShelf）。
        function draw() {
            if (dreamCoveringShelf()) { setTimeout(draw, 200); return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (flakeImg.complete && flakeImg.naturalWidth > 0) {
                for (const f of flakes) {
                    f.y += f.speed; f.swing += f.swingSpeed; f.rot += f.rotSpeed;
                    f.x += Math.sin(f.swing) * 0.5 + f.wind;
                    if (f.y > canvas.height + 20) Object.assign(f, mk(false));
                    if (f.x > canvas.width + 20) f.x = -20;
                    if (f.x < -20) f.x = canvas.width + 20;
                    ctx.save();
                    ctx.globalAlpha = f.opacity;
                    ctx.translate(f.x, f.y);
                    ctx.rotate(f.rot);
                    ctx.drawImage(flakeImg, -f.s / 2, -f.s / 2, f.s, f.s);
                    ctx.restore();
                }
            }
            requestAnimationFrame(draw);
        }
        window.addEventListener('resize', resize);
        resize(); init(); draw();
    })();

    const bgmPlayer = document.getElementById('bgmPlayer');
    // 默认 Dearest Friends（磁带选曲已删，用户无法手动切换 BGM）
    const savedTime = Store.getFloat(Store.KEYS.BGM_TIME_SHELF);
    if (savedTime > 0) bgmPlayer.currentTime = savedTime;
    bgmPlayer.volume = 0.3;
    bgmPlayer.play().catch(() => {});
    setInterval(() => { Store.set(Store.KEYS.BGM_TIME_SHELF, bgmPlayer.currentTime); }, 2000);
    function tryPlayBGM() {
        bgmPlayer.play().then(() => { document.removeEventListener('click', tryPlayBGM); document.removeEventListener('keydown', tryPlayBGM); }).catch(() => {});
        // 书架常态篝火：start → loop 底噪（音量压 BGM 之下）；进 dream 不断，镜之房间让位
        if (window.CampfireAudio) {
            window.CampfireAudio.setVolume(0.12);
            var cp = window.CampfireAudio.play(); if (cp && cp.catch) cp.catch(function () {});
        }
    }
    document.addEventListener('click', tryPlayBGM);
    document.addEventListener('keydown', tryPlayBGM);

    // ===== 磁带选曲已删：进紫色空间自动切 Resurrections，回书架自动切回 Dearest Friends =====

function renderPostcardCanvas(canvas, title, dateStr, content, summary, strawCount) {
    var ctx = canvas.getContext('2d');
    var INK = '#8f4a3c';
    var INK_SOFT = 'rgba(143,74,60,.78)';
    return loadPostcardImg().then(function (img) {
        var W = 1200, H = 800;
        if (img) {
            H = Math.round(W * img.naturalHeight / img.naturalWidth);
            canvas.width = W; canvas.height = H;
            ctx.drawImage(img, 0, 0, W, H);
        } else {
            canvas.width = W; canvas.height = H;
            ctx.fillStyle = '#f2e2d5'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = INK_SOFT; ctx.lineWidth = 3;
            ctx.strokeRect(18, 18, W - 36, H - 36);
        }

        // ===== To: 两条横线上写标题和日期 =====
        ctx.fillStyle = INK;
        ctx.font = 'italic 30px "Renogare","CelesteZH","Microsoft YaHei",sans-serif';
        ctx.fillText((title || '无题').substring(0, 26), W * 0.14, H * 0.130);
        ctx.font = 'italic 19px "Renogare","CelesteZH","Microsoft YaHei",sans-serif';
        ctx.fillStyle = INK_SOFT;
        ctx.fillText(dateStr || '', W * 0.14, H * 0.200);

        // ===== 中间大片书写区：内容总结（【】里的字红色高亮） =====
        // 自动适配书写框：字号按字数二分试探（21→11.5px 连续取最大可容字号）；实在装不下才在框底截断补 "…"
        var RED_INK = '#c8433a';
        var FONT_STACK = '"Renogare","CelesteZH","Microsoft YaHei",sans-serif';
        var full = (content || '').substring(0, 1000);
        var segs = [], mSeg, reSeg = /【([^】]*)】/g, lastI = 0;
        while ((mSeg = reSeg.exec(full)) !== null) {
            if (mSeg.index > lastI) segs.push({ t: full.slice(lastI, mSeg.index), r: false });
            segs.push({ t: mSeg[1], r: true });
            lastI = reSeg.lastIndex;
        }
        if (lastI < full.length) segs.push({ t: full.slice(lastI), r: false });
        var lx = W * 0.07, maxX = W * 0.56, ly0 = H * 0.34, mh = H * 0.62;
        // 逐字排版走查：draw=false 仅模拟（看装不装得下），draw=true 落笔；超出书写框底即停
        function layoutSegs(list, fs, lh, draw) {
            ctx.font = fs + 'px ' + FONT_STACK;
            var ly = ly0, x = lx, fits = true, px = lx, py = ly0;
            for (var si = 0; si < list.length; si++) {
                var chars = list[si].t.split('');
                for (var ci = 0; ci < chars.length; ci++) {
                    var ch = chars[ci];
                    if (ch === '\n') { x = lx; ly += lh; continue; }
                    var cw = ctx.measureText(ch).width;
                    if (x + cw > maxX) { x = lx; ly += lh; }
                    if (ly > mh) { fits = false; si = list.length; break; }
                    px = x; py = ly;
                    if (draw) {
                        ctx.fillStyle = list[si].r ? RED_INK : INK;
                        ctx.fillText(ch, x, ly);
                    }
                    x += cw;
                }
            }
            return { fits: fits, ly: ly, x: x, px: px, py: py };
        }
        var pick = null;
        (function () {
            var lhFull = Math.round(21 * 1.71);
            if (layoutSegs(segs, 21, lhFull, false).fits) { pick = { fs: 21, lh: lhFull }; return; }   // 短文：直接用最大字号
            var lo = 11.5, hi = 21;                                                                    // lo=字号下限，hi=已知装不下
            for (var it = 0; it < 6; it++) {                                                           // 二分：按字数连续取最大可容字号
                var mid = Math.round(((lo + hi) / 2) * 4) / 4, lhMid = Math.round(mid * 1.71);
                if (layoutSegs(segs, mid, lhMid, false).fits) { pick = { fs: mid, lh: lhMid }; lo = mid; }
                else hi = mid;
            }
            if (!pick) pick = { fs: 11.5, lh: Math.round(11.5 * 1.71) };                               // 11.5px 也装不下：框底截断
        })();
        var fin = layoutSegs(segs, pick.fs, pick.lh, true);
        if (!fin.fits) {                          // 框底截断：末尾补 "…"（行宽放不下就省略）
            ctx.font = pick.fs + 'px ' + FONT_STACK;
            var ew = ctx.measureText('\u2026').width;
            if (fin.x + ew <= maxX) { ctx.fillStyle = INK; ctx.fillText('\u2026', fin.x, fin.py); }
        }
        var endLy = fin.fits ? fin.ly : (fin.py + pick.lh), endX = fin.fits ? fin.x : fin.px;
        if (endX > lx) endLy += pick.lh;

        // ===== 金句（最打动的一句）=====
        if (summary) {
            var sy2 = Math.min(endLy + 20, H * 0.74);
            ctx.strokeStyle = 'rgba(143,74,60,.35)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(W * 0.07, sy2 - 10); ctx.lineTo(W * 0.57, sy2 - 10); ctx.stroke();
            ctx.fillStyle = INK;
            ctx.font = 'italic 20px "Renogare","CelesteZH";'
            ctx.fillText('\u201c' + summary.substring(0, 60) + '\u201d', W * 0.08, sy2 + 22);
        }

        // ===== 落款（右下角，避开素材左下角的 Postcard~）=====
        ctx.fillStyle = INK_SOFT;
        ctx.font = 'italic 17px "Renogare","CelesteZH";'
        ctx.textAlign = 'right';
        ctx.fillText('\u00d7' + (strawCount || 0) + '  \u2014 Madeline', W * 0.92, H * 0.9);
        ctx.textAlign = 'left';
    });
}
var PC_IMG = null;
function loadPostcardImg() {
    return new Promise(function (res) {
        if (PC_IMG) return res(PC_IMG);
        var im = new Image();
        im.onload = function () { PC_IMG = im; res(im); };
        im.onerror = function () { res(null); };
        im.src = 'celeste-gui/postcard.webp';
    });
}
// 明信片开合音：走全站音效池（js/lib/sfx.js），音量口径保持 0.9
function pcPlay(name) {
    Sfx.play(name, { volume: 0.9 });
}
function exportPostcard(data) {
    var modal = document.getElementById('postcardExportModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'postcardExportModal';
        modal.innerHTML = '<canvas class="pe-snow" id="peSnow"></canvas>' +
            '<div class="pe-stage"><canvas id="postcardCanvas"></canvas>' +
            '<div class="pe-actions"><button id="peDownload">\u2b07 下载明信片</button><button class="pe-close" id="peClose">Keep \u2665</button></div></div>';
        document.body.appendChild(modal);
        var closePe = function() {
            pcPlay('ui_main_postcard_variants_out.wav');
            stopPeSnow();
            modal.style.transition = 'opacity .6s ease';
            modal.style.opacity = '0';
            setTimeout(function () {
                modal.classList.remove('show');
                modal.style.opacity = '';
                modal.style.transition = '';
                modal.querySelector('.pe-stage').classList.remove('slide-in');
                modal.querySelector('.pe-actions').classList.remove('show');
            }, 600);
        };
        document.getElementById('peClose').addEventListener('click', closePe);
        modal.addEventListener('click', function(e) { if (e.target === modal) closePe(); });
    }
    var canvas = document.getElementById('postcardCanvas');
    renderPostcardCanvas(canvas, data.title, data.date, data.content, data.summary, Store.count(Store.KEYS.DIARY_SAVE_COUNT)).then(function () {
        modal.classList.add('show');
        startPeSnow();
        setTimeout(function () { modal.querySelector('.pe-stage').classList.add('slide-in'); }, 400);
        setTimeout(function () { modal.querySelector('.pe-actions').classList.add('show'); }, 1600);
    });
    document.getElementById('peDownload').onclick = function() {
        var url = canvas.toDataURL('image/png');
        var a = document.createElement('a');
        a.download = 'mountain-diary-' + (data.date || '').replace(/\D/g, '').slice(0, 8) + '.png';
        a.href = url;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    pcPlay('ui_main_postcard_variants_in.wav');
}

// ===== 弹窗内飘雪（与每日明信片同款，精简版） =====
var peSnowRaf = null, peFlakes = [];
function startPeSnow() {
    var cv = document.getElementById('peSnow');
    if (!cv || peSnowRaf) return;
    var c = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    peFlakes = [];
    for (var i = 0; i < 60; i++) {
        peFlakes.push({
            x: Math.random() * cv.width, y: Math.random() * cv.height,
            r: Math.random() * 2.5 + 1, sp: Math.random() * 1.2 + 0.4,
            w: Math.random() * 0.4 - 0.2, o: Math.random() * 0.5 + 0.2,
            sw: Math.random() * Math.PI * 2, sws: Math.random() * 0.02 + 0.01
        });
    }
    function loop() {
        c.clearRect(0, 0, cv.width, cv.height);
        for (var j = 0; j < peFlakes.length; j++) {
            var f = peFlakes[j];
            f.y += f.sp; f.sw += f.sws;
            f.x += Math.sin(f.sw) * 0.5 + f.w;
            if (f.y > cv.height + 10) { f.y = -10; f.x = Math.random() * cv.width; }
            if (f.x > cv.width + 10) f.x = -10;
            if (f.x < -10) f.x = cv.width + 10;
            c.beginPath();
            c.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            c.fillStyle = 'rgba(255,255,255,' + f.o + ')';
            c.fill();
        }
        peSnowRaf = requestAnimationFrame(loop);
    }
    loop();
}
function stopPeSnow() {
    if (peSnowRaf) { cancelAnimationFrame(peSnowRaf); peSnowRaf = null; }
}

(async function () {
    // dev: 自动注入假 token 绕过登录（保留一行原逻辑作注释）
    try { if (!localStorage.getItem('token')) localStorage.setItem('token', 'dev-bypass'); } catch (e) {}
    // if (!localStorage.getItem('token')) { alert('请先登录'); location.href = 'login.html'; return; }
    const cards = document.getElementById('cards');
    const detail = document.getElementById('detail');
    let data = [], cur = null;
    function fmt(v) {
        if (!v) return '';
        const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
        if (isNaN(d.getTime())) return String(v);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const CN_MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    /** 时间戳（数字/纯数字字符串）或日期字符串 → Date，无效返回 Invalid Date */
    function toDateObj(v) {
        return new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
    }
    /* ===== 日记情绪 → 像素色点颜色（每篇保存时后端 AI 已分析，落在 emotionDetail） ===== */
    const MOOD_COLORS = [
        [['开心','高兴','快乐','幸福','喜悦','兴奋','欢喜'], '#f4b740'],
        [['感动','温暖','感激','温馨'], '#f2994a'],
        [['平静','放松','安心','安宁','宁静','舒缓'], '#56c2ef'],
        [['低落','难过','悲伤','伤心','沮丧','失落','抑郁','哀伤'], '#6f83f0'],
        [['焦虑','紧张','不安','担心','害怕','恐惧','迷茫','慌乱','担忧'], '#b579e8'],
        [['愤怒','恼火','生气','暴躁','气愤','气'], '#ef5f5f'],
        [['孤独','寂寞'], '#8aa0b8'],
        [['期待','希望','憧憬'], '#e58fe0'],
        [['疲惫','疲倦','劳累','累'], '#a78bfa']
    ];
    function moodOf(d) {
        if (!d || !d.emotionDetail) return null;
        let det;
        try { det = JSON.parse(d.emotionDetail); } catch (e) { return null; }
        const name = det.emotions && det.emotions[0] ? det.emotions[0].name : null;
        if (!name) return null;
        for (const pair of MOOD_COLORS) {
            if (pair[0].some(k => name.indexOf(k) >= 0)) return { name: name, color: pair[1] };
        }
        return { name: name, color: '#b08d3f' };
    }
    function fmtEn(v) {
        if (!v) return '';
        const d = new Date(typeof v === 'number' || /^\d+$/.test(String(v)) ? Number(v) : v);
        if (isNaN(d.getTime())) return String(v);
        return MONTHS_EN[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }
    // ===== 日记翻页音效：forward = 抽出/向右，back = 向左（官方素材，变体随机） =====
    const PAGE_SFX = {
        forward: ['ui_world_journal_page_cover_forward_01.wav', 'ui_world_journal_page_cover_forward_02.wav', 'ui_world_journal_page_cover_forward_03.wav'],
        back: ['ui_world_journal_page_main_back_01.wav', 'ui_world_journal_page_main_back_02.wav', 'ui_world_journal_page_main_back_03.wav']
    };
    function playPageSfx(dir) {
        const list = PAGE_SFX[dir];
        if (!list || !list.length) return;
        Sfx.play(list[Math.floor(Math.random() * list.length)], { volume: 0.20 });
    }
    // ===== 滚动进场：往下滑 → 新行从下方上滑入；往上翻 → 上方行从上方下滑入 =====
    const shelfIO = new IntersectionObserver(list => {
        list.forEach(en => {
            const el = en.target;
            if (en.isIntersecting) {
                el.classList.add(en.boundingClientRect.top > 0 ? 'from-below' : 'from-above');
                requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
            } else {
                el.classList.remove('in', 'from-below', 'from-above');
            }
        });
    }, { threshold: 0.08 });
    function observeShelfRows() {
        cards.querySelectorAll('.shelf-row:not(.observed)').forEach(el => {
            el.classList.add('observed');
            shelfIO.observe(el);
        });
    }
    function replayAnim(el, cls) {
        el.classList.remove('anim-up', 'anim-down');
        void el.offsetWidth;
        el.classList.add(cls);
    }
    let groups = [], curGroup = null, curIdx = 0;
    function buildGroups() {
        const map = new Map();
        for (const d of data) {
            const key = fmt(d.updateDate || d.createDate);
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(d);
        }
        groups = [...map.values()].map(es => ({ date: es[0].updateDate || es[0].createDate, entries: es }));
    }
    // 点出（返回列表 / 删除后回列表）：磁带预览收尾放 outro（未播过则内部自动跳过）
    function showList() { if (window.CassetteAudio) window.CassetteAudio.stop(); detail.classList.remove('show'); cards.style.display = ''; }
    function renderEntry() {
        cur = curGroup.entries[curIdx];
        detail.querySelector('.t').textContent = cur.title || '无题';
        detail.querySelector('.d').textContent = fmtEn(cur.updateDate || cur.createDate);
        detail.querySelector('.c').textContent = cur.content || '';
        detail.querySelector('.pos').textContent = (curIdx + 1) + ' / ' + curGroup.entries.length;
        detail.querySelector('.prev-e').disabled = curIdx === 0;
        detail.querySelector('.next-e').disabled = curIdx === curGroup.entries.length - 1;
    }
    function showDetail(i) {
        curGroup = groups[i]; if (!curGroup) return;
        curIdx = 0;
        cards.style.display = 'none';
        renderEntry();
        detail.classList.add('show');
        replayAnim(detail, 'anim-up');
    }
    detail.querySelector('.prev-e').addEventListener('click', () => { if (curIdx > 0) { playPageSfx('back'); curIdx--; renderEntry(); replayAnim(detail, 'anim-down'); } });
    detail.querySelector('.next-e').addEventListener('click', () => { if (curGroup && curIdx < curGroup.entries.length - 1) { playPageSfx('forward'); curIdx++; renderEntry(); replayAnim(detail, 'anim-up'); } });
    document.addEventListener('keydown', e => {
        if (!detail.classList.contains('show')) return;
        if (e.key === 'ArrowLeft') detail.querySelector('.prev-e').click();
        if (e.key === 'ArrowRight') detail.querySelector('.next-e').click();
    });
    // 纸张自适应：内容高度超过单张纸按宽度铺满的自然高度时，
    // 加 .tall 走「纸头+纸身无限拼接+纸尾」卷轴模式，否则保持单张纸
    function fitPaper() {
        var natH = cards.clientWidth * 901 / 603; // 素材 603×901
        cards.classList.toggle('tall', cards.scrollHeight > natH + 16);
    }
    var _fitT;
    window.addEventListener('resize', function () {
        clearTimeout(_fitT);
        _fitT = setTimeout(fitPaper, 150);
    });
    // ===== Vue 接管日记列表渲染（#diaryVue）；详情/翻页/快照/游戏场景仍为 vanilla =====
    const vRef = Vue.ref, vNextTick = Vue.nextTick;
    const status = vRef('loading');   // loading | empty | error | ok
    const errMsg = vRef('未知错误');
    const totalPosts = vRef(0);
    const totalDays = vRef(0);
    const viewGroups = vRef([]);

    function buildViewGroups() {
        // 每月篇数统计（月份分隔条用）
        const monthCountMap = new Map();
        for (const g of groups) {
            const d = toDateObj(g.date);
            const mk = d.getFullYear() + '-' + d.getMonth();
            monthCountMap.set(mk, (monthCountMap.get(mk) || 0) + g.entries.length);
        }
        let lastMonth = null;
        viewGroups.value = groups.map((g, i) => {
            const d = toDateObj(g.date);
            const mk = d.getFullYear() + '-' + d.getMonth();
            const divider = mk !== lastMonth;
            lastMonth = mk;
            const first = g.entries[0];
            const title = (first.title && first.title.trim()) ? first.title.trim()
                : (g.entries.length > 1 ? g.entries.length + ' 篇日记' : '无题');
            const snip = String(first.content || '').replace(/\s+/g, ' ').trim().slice(0, 96);
            return {
                key: i, i,
                divider,
                monEn: MONTHS_EN[d.getMonth()].toUpperCase(),
                year: d.getFullYear(),
                monCn: CN_MONTHS[d.getMonth()],
                monthCnt: monthCountMap.get(mk),
                title, snip,
                mood: moodOf(first),
                enDate: fmtEn(g.date),
                multi: g.entries.length > 1,
                entryCount: g.entries.length
            };
        });
        totalPosts.value = data.length;
        totalDays.value = groups.length;
    }

    Vue.createApp({
        setup() { return { status, errMsg, totalPosts, totalDays, viewGroups }; }
    }).mount('#diaryVue');

    async function load() {
        status.value = 'loading';
        const res = await DiaryApi.listDays();
        if (res.success && res.data && Array.isArray(res.data.list)) {
            data = res.data.list;
            if (window.__setDoorProgress) window.__setDoorProgress(data.length);
            if (!data.length) { status.value = 'empty'; return; }
            buildGroups();
            buildViewGroups();
            status.value = 'ok';
        } else {
            errMsg.value = res.msg || '未知错误';
            status.value = 'error';
        }
        await vNextTick();
        observeShelfRows();
        fitPaper();
    }
    cards.addEventListener('click', ev => {
        const c = ev.target.closest('.shelf-row');
        if (!c || c.classList.contains('snapshot')) return;
        // 点开往期日记：磁带三联音 —— 先 intro，接 loop 循环，点出时由 showList() 放 outro
        //（每周/每月快照明信片走各自的 variants 音效，不在此列）
        if (window.CassetteAudio) {
            var cp2 = window.CassetteAudio.play(); if (cp2 && cp2.catch) cp2.catch(function () {});
        } else pcPlay('cassette_preview_intro.wav');
        showDetail(+c.dataset.i);
    });

    detail.querySelector('.back').addEventListener('click', showList);

    detail.querySelector('.export-postcard').addEventListener('click', () => {
        if (!cur) return;
        exportPostcard({ title: cur.title, date: fmt(cur.updateDate || cur.createDate), content: cur.content, summary: '' });
    });

    detail.querySelector('.edit').addEventListener('click', () => {
        if (cur) location.href = 'diary.html?edit=' + encodeURIComponent(cur.id);
    });
    detail.querySelector('.del').addEventListener('click', async () => {
        if (!cur) return;
        if (!confirm('确定要删掉这篇日记吗？删了就找不回来了。')) return;
        const res = await DiaryApi.remove(cur.id);
        if (res.success) { showToast('这一页合上了'); showList(); load(); }
        else showToast(res.msg || '删除失败');
    });
    // 一键发成博客：后端默认私密，再点一次可切换公开/私密
    detail.querySelector('.publish').addEventListener('click', async () => {
        if (!cur) return;
        const btn = detail.querySelector('.publish');
        btn.disabled = true;
        try {
            const res = await DiaryApi.publishFromDiary(cur.id);
            if (!res.success) { showToast(res.msg || '发布失败'); return; }
            const articleId = res.data && res.data.id;
            const current = res.data && res.data.visibility === 1 ? 1 : 0;
            if (res.data && res.data.existed) {
                // 已发布过：这一下当作切换可见性（公开 ↔ 私密）
                const to = current === 1 ? 0 : 1;
                const r2 = await DiaryApi.setArticleVisibility(articleId, to);
                if (!r2.success) { showToast(r2.msg || '切换失败'); return; }
                btn.dataset.vis = String(to);
                showToast(to === 1 ? '这篇公开了' : '这篇收回私密了');
            } else {
                btn.dataset.vis = '0';
                showToast('已发到博客（私密，再点一次公开）');
            }
        } finally {
            btn.disabled = false;
        }
    });
    await load();

    // ================================================================
    // ===== 快照：一段时间后，Madeline 把这段日子做成一张明信片 =====
    // 书架上悬停自己翻书，点开是明信片（variants 音效）
    // ================================================================
    (function () {
        const EMOTION_DICT = {
            '开心': ['开心', '高兴', '快乐', '哈哈', '太棒', '喜欢', '幸福', '笑', '兴奋', '顺利'],
            '悲伤': ['难过', '伤心', '哭', '失落', '遗憾', '心痛', '委屈', '崩溃'],
            '孤独': ['孤独', '一个人', '寂寞', '没人', '想念', '空荡'],
            '不安': ['焦虑', '紧张', '担心', '害怕', '不安', '慌', '压力', '失眠'],
            '愤怒': ['生气', '愤怒', '烦躁', '讨厌', '气死', '火大'],
            '满足': ['满足', '踏实', '安心', '平静', '值得', '感恩', '治愈'],
            '希望': ['期待', '希望', '明天', '以后', '加油', '计划', '梦想'],
            '惊讶': ['没想到', '居然', '竟然', '惊', '突然', '万万']
        };
        function countEmotion(texts) {
            const scores = {};
            for (const t of texts) {
                for (const emo in EMOTION_DICT) {
                    for (const kw of EMOTION_DICT[emo]) {
                        const m = t.split(kw).length - 1;
                        if (m > 0) scores[emo] = (scores[emo] || 0) + m;
                    }
                }
            }
            let best = null, max = 0;
            for (const emo in scores) { if (scores[emo] > max) { max = scores[emo]; best = emo; } }
            return best || '平静';
        }
        function extractQuote(entries) {
            const sents = [];
            for (const e of entries) {
                const parts = String(e.content || '').split(/(?<=[。！？!?])|[\n]/);
                for (const p of parts) {
                    const s = p.trim();
                    if (s.length >= 6 && s.length <= 46) sents.push(s);
                }
            }
            if (!sents.length) return '这段日子字还不多，但每一页都算数。';
            let best = sents[0], bestScore = -1;
            for (const s of sents) {
                let score = 0;
                for (const emo in EMOTION_DICT) {
                    if (EMOTION_DICT[emo].some(kw => s.indexOf(kw) !== -1)) score += 2;
                }
                score += Math.min(s.length, 30) / 15;
                score += Math.random();
                if (score > bestScore) { bestScore = score; best = s; }
            }
            return best;
        }
        // 周度快照：从本周日记里挑 3-5 条原话（不重复，优先带情绪关键词的句子）
        function extractQuotes(entries, max) {
            const sents = [];
            for (const e of entries) {
                const parts = String(e.content || '').split(/(?<=[。！？!?])|[\n]/);
                for (const p of parts) {
                    const s = p.trim();
                    if (s.length >= 6 && s.length <= 46 && sents.indexOf(s) === -1) sents.push(s);
                }
            }
            if (!sents.length) return '';
            const scored = sents.map(s => {
                let score = 0;
                for (const emo in EMOTION_DICT) {
                    if (EMOTION_DICT[emo].some(kw => s.indexOf(kw) !== -1)) score += 2;
                }
                score += Math.min(s.length, 30) / 15;
                return { s: s, score: score };
            }).sort((a, b) => b.score - a.score);
            return scored.slice(0, max || 5).map(o => '“' + o.s + '”').join('\n');
        }
        // 周度快照：按时间顺序看每篇日记的 valence / intensity，给出一句趋势描述
        function emotionTrend(entries) {
            const pts = [];
            for (const d of entries) {
                if (!d.emotionDetail) continue;
                let det;
                try { det = JSON.parse(d.emotionDetail); } catch (e) { continue; }
                const t = new Date(d.updateDate || d.createDate).getTime();
                if (isNaN(t)) continue;
                pts.push({
                    t: t,
                    v: det.valence === 'positive' ? 1 : det.valence === 'negative' ? -1 : 0,
                    i: det.intensity || 3
                });
            }
            if (pts.length < 2) return '样本不足，只按这周的整体情绪与占比来写。';
            pts.sort((a, b) => a.t - b.t);
            const avg = arr => arr.reduce((s, p) => s + p.v, 0) / arr.length;
            const n = Math.max(1, Math.floor(pts.length / 2));
            const first = avg(pts.slice(0, n));
            const last = avg(pts.slice(-n));
            const delta = last - first;
            const overall = avg(pts);
            const vs = pts.map(p => p.v);
            const vol = Math.max.apply(null, vs) - Math.min.apply(null, vs);
            let dir = Math.abs(delta) < 0.25 ? '整体平稳' : (delta > 0 ? '后半段略微回升' : '后半段更往下');
            if (vol >= 1.5) dir = '来回波动很大';
            const lo = Math.min.apply(null, pts.map(p => p.i));
            const hi = Math.max.apply(null, pts.map(p => p.i));
            return '整体偏向：' + (overall < -0.2 ? '偏负面' : overall > 0.2 ? '偏正面' : '中性')
                + '；走势：' + dir
                + '；波动幅度：' + (vol >= 1.5 ? '高' : vol >= 0.8 ? '中' : '低')
                + '（情绪强度 ' + lo + '-' + hi + '/5）';
        }
        function getSnaps() {
            // 脏数据（非数组 / 解析失败）一律当空书架，与改造前 try/catch 返回 [] 的口径一致
            const arr = Store.getJson(Store.KEYS.DIARY_SNAPSHOTS, []);
            if (!Array.isArray(arr)) return [];
            return arr.map(s => {
                if (s.type === 'week') s.label = 'Weekly Recap';
                else if (s.type === 'month') s.label = 'Monthly Recap';
                return s;
            });
        }
        function setSnaps(s) { Store.set(Store.KEYS.DIARY_SNAPSHOTS, s); }

        // ===== 聚合每篇日记落库的情绪数据（保存时后端 AI 已分析好） =====
        function aggregateStoredEmotions(list) {
            const emoSum = {};
            const intensities = [];
            const events = [];
            const concerns = [];
            let analyzed = 0;
            for (const d of list) {
                if (!d.emotionDetail) continue;
                let det;
                try { det = JSON.parse(d.emotionDetail); } catch (e) { continue; }
                analyzed++;
                (det.emotions || []).forEach(e => {
                    emoSum[e.name] = (emoSum[e.name] || 0) + (e.percent || 0);
                });
                if (det.intensity) intensities.push(det.intensity);
                (det.events || []).forEach(ev => { if (events.indexOf(ev) === -1) events.push(ev); });
                if (det.concern && concerns.indexOf(det.concern) === -1) concerns.push(det.concern);
            }
            if (!analyzed) return null;
            const emotions = Object.entries(emoSum)
                .map(([name, sum]) => ({ name: name, percent: Math.round(sum / analyzed) }))
                .sort((a, b) => b.percent - a.percent)
                .slice(0, 4);
            return {
                topEmotion: emotions[0] ? emotions[0].name : null,
                emotions: emotions,
                intensity: intensities.length ? Math.round(intensities.reduce((a, b) => a + b, 0) / intensities.length) : null,
                events: events.slice(0, 5),
                concerns: concerns.slice(0, 3)
            };
        }

        function emotionSummaryText(agg) {
            if (!agg || !agg.emotions || !agg.emotions.length) return '';
            let t = '主要情绪：' + agg.emotions.map(e => e.name + ' ' + e.percent + '%').join('、');
            if (agg.intensity) t += '；平均强度 ' + agg.intensity + '/5';
            if (agg.events && agg.events.length) t += '；期间的事：' + agg.events.join('、');
            if (agg.concerns && agg.concerns.length) t += '；挂心的事：' + agg.concerns.join('、');
            return t;
        }

        // ===== 检查是否到了生成快照的时候 =====
        async function maybeGenerate() {
            const now = Date.now();
            const snaps = getSnaps();
            const inRange = (days) => data.filter(d => {
                const t = new Date(d.updateDate || d.createDate).getTime();
                return !isNaN(t) && now - t <= days * 86400000;
            });
            const hasType = (type, fromT) => snaps.some(s => s.type === type && s.createdAt >= fromT);
            const created = [];

            const week = inRange(7);
            if (week.length >= 3 && !hasType('week', now - 7 * 86400000)) {
                created.push(await buildSnap('week', week, 'Weekly Recap'));
            }
            const month = inRange(30);
            if (month.length >= 8 && !hasType('month', now - 30 * 86400000)) {
                created.push(await buildSnap('month', month, 'Monthly Recap'));
            }
            if (created.length) {
                setSnaps(created.concat(snaps));
                renderSnapCards();
                pcPlay('ui_main_postcard_variants_in.wav');
                showToast(created.length > 1 ? '两张新快照明信片收进书架了' : '一张新的快照明信片收进书架了');
            }
            async function buildSnap(type, list, label) {
                const times = list.map(d => new Date(d.updateDate || d.createDate).getTime()).sort((a, b) => a - b);
                const joined = list.map(d => d.content || '').join('\n');
                let reflect = '';
                let emotionData = aggregateStoredEmotions(list);
                if (!emotionData) {
                    try {
                        const res = await DiaryApi.emotionAnalyze(joined);
                        if (res.success && res.data) emotionData = res.data;
                    } catch (e) {}
                }
                try {
                    const res = await DiaryApi.snapReflect(
                        joined,
                        emotionSummaryText(emotionData),
                        extractQuotes(list, 5),
                        emotionTrend(list),
                        type
                    );
                    if (res.success && res.data && res.data.message) reflect = res.data.message;
                } catch (e) {}
                return {
                    id: type + '-' + now,
                    type: type,
                    label: label,
                    from: fmt(times[0]),
                    to: fmt(times[times.length - 1]),
                    count: list.length,
                    topEmotion: emotionData ? emotionData.topEmotion : countEmotion(list.map(d => d.content || '')),
                    emotions: emotionData ? (emotionData.emotions || []) : [],
                    intensity: emotionData ? emotionData.intensity : null,
                    events: emotionData ? (emotionData.events || []) : [],
                    concerns: emotionData ? (emotionData.concerns || []) : [],
                    quote: extractQuote(list),
                    reflect: reflect,
                    createdAt: now
                };
            }
        }

        // ===== 书架上的快照卡 =====
        function snapCardHtml(s) {
            return '<div class="shelf-row snapshot" data-snap="' + s.id + '">' +
                '<img class="row-icon" src="namespace/remix.png" alt="" loading="lazy" decoding="async">' +
                '<div class="row-main"><div class="row-title">' + escHtml(s.label) + '</div>' +
                '<div class="row-snip">共 ' + s.count + ' 篇 · ' + fmt(s.from) + ' ~ ' + fmt(s.to) + '</div></div>' +
                '<div class="row-date">' + fmt(s.createdAt) + '</div>' +
                '</div>';
        }
        function renderSnapCards() {
            const snapSlot = document.getElementById('snapSlot');
            snapSlot.querySelectorAll('.shelf-row.snapshot').forEach(el => el.remove());
            const snaps = getSnaps();
            if (!snaps.length) return;
            snapSlot.innerHTML = snaps.map(snapCardHtml).join('');
            observeShelfRows();
        }


        // ===== 点击：做成明信片，内容总结写在上面（variants 音效） =====
        function openSnapPostcard(s) {
            const body = s.reflect || ('这段日子，你写下了 ' + s.count + ' 篇日记。');
            let emotionLine = '';
            if (s.emotions && s.emotions.length) {
                emotionLine = '\n\n这段日子的情绪：' + s.emotions.map(e => e.name + ' ' + e.percent + '%').join(' · ');
                if (s.intensity) emotionLine += '（强烈程度 ' + s.intensity + '/5）';
            } else if (s.topEmotion) {
                emotionLine = '\n\n你最近常常感到【' + s.topEmotion + '】。';
            }
            if (s.events && s.events.length) emotionLine += '\n这些日子：' + s.events.slice(0, 4).join('、');
            if (s.concerns && s.concerns.length) emotionLine += '\n你心里挂念着：' + s.concerns.join('、');
            exportPostcard({
                title: s.label + ' · 共 ' + s.count + ' 篇',
                date: fmt(s.createdAt),
                content: body + emotionLine,
                summary: s.quote
            });
        }
        cards.addEventListener('click', ev => {
            const c = ev.target.closest('.shelf-row.snapshot');
            if (!c) return;
            const s = getSnaps().find(x => x.id === c.dataset.snap);
            if (s) openSnapPostcard(s);
        });

        // ===== 入场：先渲染已有快照，再检查要不要生成新的 =====
        renderSnapCards();
        setTimeout(maybeGenerate, 800);
    })();
})();

    // ===== 篝火渲染（原版 campfire 逐帧动画） =====
    (function () {
        const TROPHIES = {
            goldberry: 'celeste-collectables/goldberry/idle00.png',
            cassette: 'celeste-collectables/cassette/idle00.png',
            heartgem: 'celeste-collectables/heartgem/0/spin00.png',
            moonberry: 'celeste-collectables/moonberry/normal00.png'
        };
        let owned = [];
        try { owned = Store.getJson(Store.KEYS.BERRY_OWNED, []); } catch (e) {}
        const trophy = document.getElementById('berryTrophy');
        owned.forEach(id => {
            if (!TROPHIES[id]) return;
            const im = document.createElement('img');
            im.src = TROPHIES[id]; im.title = id; im.dataset.id = id;
            trophy.appendChild(im);
        });
        if (trophy.children.length) trophy.classList.remove('empty');
        function mkTrophyFrames(prefix, n) { const a = []; for (let i = 0; i < n; i++) a.push(prefix + String(i).padStart(2, '0') + '.png'); return a; }
        function heartTier() {
            const c = Store.count(Store.KEYS.DIARY_SAVE_COUNT);
            return c >= 100 ? 3 : c >= 60 ? 2 : c >= 30 ? 1 : 0;
        }
        const TROPHY_FRAMES = {
            goldberry: mkTrophyFrames('celeste-collectables/goldberry/idle', 12),
            moonberry: mkTrophyFrames('celeste-collectables/moonberry/normal', 52),
            cassette: mkTrophyFrames('celeste-collectables/cassette/idle', 19)
        };
        const STRAW_FRAMES = mkTrophyFrames('celeste-collectables/strawberry/normal', 62);
        STRAW_FRAMES.forEach(s => { const im = new Image(); im.src = s; });
        let tfi = 0;
        const trophyImgs = trophy.querySelectorAll('img');
        const sbStrawImg = document.getElementById('sbStrawImg');
        setInterval(() => {
            if (dreamCoveringShelf()) return;
            trophyImgs.forEach(im => {
                if (im.dataset.id === 'heartgem') {
                    const tier = heartTier();
                    if (tier >= 3) {
                        im.src = 'celeste-collectables/heartgem/3/FakeHeart' + String(tfi % 33).padStart(4, '0') + '.png';
                    } else {
                        im.src = 'celeste-collectables/heartgem/' + tier + '/spin' + String(tfi % 11).padStart(2, '0') + '.png';
                    }
                    return;
                }
                const f = TROPHY_FRAMES[im.dataset.id];
                if (f) im.src = f[tfi % f.length];
            });
            if (sbStrawImg) sbStrawImg.src = STRAW_FRAMES[tfi % STRAW_FRAMES.length];
            tfi++;
        }, 90);

        const FIRE_FRAMES = [];
        for (let i = 0; i < 16; i++) FIRE_FRAMES.push('celeste-gui/campfire/fire' + String(i).padStart(2, '0') + '.png');
        const SMOKE_FRAMES = [];
        for (let i = 0; i < 8; i++) SMOKE_FRAMES.push('celeste-gui/campfire/smoking' + String(i).padStart(2, '0') + '.png');
        FIRE_FRAMES.concat(SMOKE_FRAMES).forEach(src => { const im = new Image(); im.src = src; });

        const flameImg = document.getElementById('sbFlameImg');
        let curFrames = null, fi = 0;
        setInterval(() => {
            if (dreamCoveringShelf() || !curFrames || !curFrames.length) return;
            flameImg.src = curFrames[fi % curFrames.length];
            fi++;
        }, 70);

        function updateBonfire() {
            const fire = document.getElementById('sbFire');
            const s = Store.count(Store.KEYS.DIARY_STREAK);
            fire.querySelectorAll('.sb-label').forEach(e => e.remove());
            if (s >= 1) {
                curFrames = FIRE_FRAMES; fi = 0;
                flameImg.style.width = (s >= 30 ? 120 : s >= 7 ? 104 : s >= 3 ? 90 : 76) + 'px';
            } else {
                curFrames = SMOKE_FRAMES; fi = 0;
                flameImg.style.width = '64px';
            }
            const lb = document.createElement('div');
            lb.className = 'sb-label';
            lb.textContent = 'Day ' + s;
            fire.appendChild(lb);
            const flag = document.getElementById('sbFlag');
            if (s >= 30) { flag.src = 'celeste-gui/checkpoint/flag30.png'; flag.title = 'Day ' + s; flag.style.display = ''; }
            else if (s >= 7) { flag.src = 'celeste-gui/checkpoint/flag7.png'; flag.title = 'Day ' + s; flag.style.display = ''; }
            else if (s >= 3) { flag.src = 'celeste-gui/checkpoint/flag3.png'; flag.title = 'Day ' + s; flag.style.display = ''; }
            else { flag.style.display = 'none'; }
        }
        updateBonfire();
        // 注意：#strawberryBonfire 的 click 已用作 dream 模式入口（见 dream IIFE），
        // 这里不再绑定 showToast 燃烧进度提示，避免与入梦逻辑冲突。
    })();

    // ===== 镜子：图层叠加 + 点击破碎召唤 Badeline =====
    (function () {
        var M_DIR = 'celeste-journal/mirror/';
        var M_SCALE = 7;
        var GLASS_HK = 1.19;   // 玻璃层纵向系数：原始尺度对齐 cropped 玻璃高（241/29/7）
        var mirror = document.getElementById('shelfMirror');
        if (!mirror) return;
        var badelineWrap = mirror.querySelector('.badeline-wrap');

        // Canvas 镜子房间模式：MirrorScene 全权接管「背景 + 镜子本体 + 破碎过场 + 星场」整间房的绘制，
        // 跳过 DOM 镜子图层（玻璃/掩膜/碎帧/镜框）的构建。Badeline 的 DOM 图层、.summoned/.bye 的
        // BGM 切换契约、动作树、对话系统全部原样保留。MirrorScene 或 canvas 缺失时回退原 DOM 镜子。
        var CANVAS_MIRROR = !!(window.MirrorScene && document.getElementById('mirrorScene'));
        var maskImgs = [], breakImgs = [];
        function showFrame(list, idx) {
            list.forEach(function (im, i) { im.style.display = i === idx ? 'block' : 'none'; });
        }

        if (!CANVAS_MIRROR) {
        function addLayer(src, zIndex, cls, kind) {
            var im = new Image();
            im.className = 'm-layer' + (kind ? ' ' + kind : '') + (cls ? ' ' + cls : '');
            im.style.zIndex = zIndex;
            im.src = M_DIR + src;
            im.addEventListener('load', function () {
                if (src === 'glassfg.png') {
                    im.style.width = 54 * M_SCALE + 'px';
                    im.style.height = 29 * M_SCALE * GLASS_HK + 'px';
                    return;
                }
                if (src === 'frame.png') {
                    im.style.width = im.naturalWidth * M_SCALE * 1.06 + 'px';
                    im.style.height = im.naturalHeight * M_SCALE * 1.06 + 'px';
                    return;
                }
                im.style.width = im.naturalWidth * M_SCALE * 1.05 + 'px';
                im.style.height = im.naturalHeight * M_SCALE * GLASS_HK + 'px';
            });
            mirror.insertBefore(im, badelineWrap);
            return im;
        }

        // 叠加顺序：玻璃底 → 影子 → 玻璃高光 → 破碎帧 → 镜框
        // .m-glass = 镜面系（玻璃 + 反射 + 破碎 + Badeline 角色）
        // .m-frame = 镜框（frame.png，雕花边框）
        addLayer('glassbg.png', 1, '', 'm-glass');
        for (var mi = 0; mi < 6; mi++) {
            var mk = addLayer('mirrormask' + String(mi).padStart(2, '0') + '.png', 2, 'm-mask', 'm-glass');
            if (mi > 0) mk.style.display = 'none';
            maskImgs.push(mk);
        }
        addLayer('glassfg.png', 3, '', 'm-glass');
        for (var bi = 0; bi < 10; bi++) {
            var bk = addLayer('glassbreak' + String(bi).padStart(2, '0') + '.png', 4, '', 'm-glass');
            bk.style.display = 'none';
            breakImgs.push(bk);
        }
        var frameImg = addLayer('frame.png', 5, '', 'm-frame');

        // 截图镜框中心（cropped 2453×1429 中的分数坐标）
        var MR_FX = 1269 / 2453, MR_FY = 936 / 1429;
        // 清除旧调节面板持久化的值，让 CSS 默认值生效
        Store.remove(Store.KEYS.SHELF_ADJ);
        function positionMirror() {
            var room = document.getElementById('mirrorRoom');
            var rw = room.clientWidth, rh = room.clientHeight;
            if (!rw || !rh) return;
            // cover 映射换算（只算位置，不再覆盖 --frame-scale / --glass-scale，用 CSS 默认值）
            var scale, ox = 0, oy = 0;
            if (rw / rh > 2453 / 1429) { scale = rw / 2453; oy = (rh - 1429 * scale) / 2; }
            else { scale = rh / 1429; ox = (rw - 2453 * scale) / 2; }
            var cx = ox + MR_FX * 2453 * scale;
            var cy = oy + MR_FY * 1429 * scale;
            mirror.style.left = (cx - 64 * M_SCALE / 2) + 'px';
            mirror.style.top = (cy - 39 * M_SCALE / 2) + 'px';
        }
        frameImg.addEventListener('load', function () {
            mirror.style.width = frameImg.naturalWidth * M_SCALE + 'px';
            mirror.style.height = frameImg.naturalHeight * M_SCALE + 'px';
            positionMirror();
        });
        window.addEventListener('resize', positionMirror);
        // 监听 #mirrorRoom 尺寸变化（display:none → flex 切换、首次进入 dream 时）自动对齐
        if (window.ResizeObserver) {
            new ResizeObserver(function () { positionMirror(); }).observe(document.getElementById('mirrorRoom'));
        }
        // 进入/离开 dream 时主动对齐一次（dream-active 切换后 #mirrorRoom 才有尺寸）
        new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (m.attributeName === 'class') positionMirror();
            });
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // 镜内影子慢慢变幻
        var maskFi = 0;
        setInterval(function () {
            if (busy || dreamCoveringShelf()) return;
            maskFi = (maskFi + 1) % maskImgs.length;
            showFrame(maskImgs, maskFi);
        }, 700);
        }   // ===== end if (!CANVAS_MIRROR)：以下 DOM 镜子图层机制仅在回退模式下构建 =====

        // Badeline 待机帧已改为 lookingUp.gif（HTML 默认 src），动作树 IIFE 接管所有动作切换
        // —— idle00-08 帧序列与 walk00-11 已删除，不再需要 setInterval 切帧

        // 玻璃碎裂声（WebAudio 合成，点击即手势，无需音频文件）
        function crackSound() {
            try {
                var ctx = Sfx.ac();
                if (!ctx) return;
                var dur = 0.35;
                var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
                var d = buf.getChannelData(0);
                for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
                var src = ctx.createBufferSource();
                src.buffer = buf;
                var hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 1800;
                var g = ctx.createGain();
                g.gain.value = 0.5;
                src.connect(hp); hp.connect(g); g.connect(ctx.destination);
                src.start();
            } catch (e) { /* 无声降级 */ }
        }

        var busy = false;
        var LINES = [
            '……是你在敲镜子吗？',
            '我出来透透气，你继续写你的。',
            '别怕。我只是你没说出口的那一部分。',
            '镜子碎了也没关系，我帮你看着你自己。'
        ];

        // ===== Badeline 聊天：方案C 关系状态由服务端从日记推导，心光谱随请求带上 =====
        var blPanel = document.getElementById('blChat');
        var blMsgs = document.getElementById('blMsgs');
        var blInput = document.getElementById('blInput');
        var blSendBtn = document.getElementById('blSend');
        var blHist = Store.getJson(Store.KEYS.BADELINE_CHAT_LOG, []);
        if (!Array.isArray(blHist)) blHist = [];
        var blSending = false;

        function heartsPayload() {
            var h = Store.getJson(Store.KEYS.HEART_DOOR_HEARTS, null);
            if (!h || !h.length) {
                var c = Store.getJson(Store.KEYS.CRYSTAL_HEART, null);
                h = c ? [c] : [];
            }
            return JSON.stringify(Array.isArray(h) ? h.slice(-4) : []);
        }
        function blPersist() {
            Store.set(Store.KEYS.BADELINE_CHAT_LOG, blHist.slice(-20));
        }
        function blAdd(role, text, emo) {
            var d = document.createElement('div');
            d.className = 'bl-msg ' + role;
            if (role === 'assistant' && emo && BL_EMO_ZH[emo]) {
                var tag = document.createElement('span');
                tag.className = 'bl-emo';
                tag.textContent = BL_EMO_ZH[emo];
                d.appendChild(tag);
            }
            if (window.TextFx && role === 'assistant') {
                d.insertAdjacentHTML('beforeend', TextFx.render(TextFx.autoMark(text)));  // 历史气泡也带三种动画
            } else {
                d.appendChild(document.createTextNode(text));
            }
            blMsgs.appendChild(d);
            blMsgs.scrollTop = blMsgs.scrollHeight;
            return d;
        }
        function blPush(role, text) {
            blHist.push({ role: role, content: text });
            blPersist();
        }

        // ===== Badeline 情绪对话框系统（参照 diary 页 Madeline gameDialog 架构） =====
        // 1) 情绪分类：celeste-portraits/badeline/ 下 15 组帧序列，键 = AI 情绪标记，值 = 帧数
        var BL_PORTRAIT_FRAMES = {
            normal: 7, sad: 5, angry: 7, angryAlt: 7, yell: 7,
            worried: 7, worriedAlt: 7, upset: 7, concerned: 7,
            sigh: 14, serious: 30, scoff: 14,
            freakA: 11, freakB: 19, freakC: 18
        };
        var BL_EMO_ZH = {
            normal: '平静', sad: '低落', angry: '恼火', angryAlt: '强压怒火', yell: '喊叫',
            worried: '不安', worriedAlt: '强装镇定', upset: '委屈', concerned: '关切',
            sigh: '叹息', serious: '认真', scoff: '嘲弄',
            freakA: '崩溃边缘', freakB: '风暴', freakC: '失控'
        };
        Object.keys(BL_PORTRAIT_FRAMES).forEach(function (e) {
            var im = new Image(); im.src = 'celeste-portraits/badeline/' + e + '00.png'; // 预热每种情绪首帧
        });
        // 2) 情绪 ↔ 台词 关系：AI 标记（res.data.emotion）优先，缺失时按台词关键词推断兜底
        //    （推断词表由 js/badeline-voice.js 工具类统一维护）
        function blInferEmotion(t) {
            return window.BadelineVoice ? BadelineVoice.infer(t) : 'normal';
        }
        // 3) 对话框组件：官方 badeline 文本框 + 立绘逐帧动画（120ms/帧，对齐 Madeline 对话框）
        var blDialog = document.getElementById('badelineDialog');
        var blDialogImg = document.getElementById('blDialogImg');
        var blDialogPortrait = document.getElementById('badelineDialogPortrait');
        // 生气 / 无语类情绪 → 追加一次"从文本框爬出"演出（共用模块见 js/badeline-crawlout.js）
        var BL_CRAWL_EMO = {
            angry: 1, angryAlt: 1, yell: 1, freakA: 1, freakB: 1, freakC: 1,
            sigh: 1, scoff: 1, upset: 1
        };
        function blCrawlOut(wait, token) {
            if (!window.BadelineCrawlOut) return;
            setTimeout(function () {
                if (token !== blDialogToken || !blDialog.classList.contains('show')) return;
                window.BadelineCrawlOut.play({
                    box: blDialog,
                    portrait: blDialogPortrait,
                    anchor: blDialogPortrait
                });
            }, wait || 0);
        }
        var blDialogText = document.getElementById('badelineDialogText');
        var blHeadImg = document.getElementById('blHeadImg');
        var blAnimTimer = null, blCurEmo = 'normal';
        var blDialogToken = 0, blDialogHideTimer = null;
        var blQueue = Promise.resolve();
        function blStartPortrait(emo) {
            if (!BL_PORTRAIT_FRAMES[emo]) emo = 'normal';
            blCurEmo = emo;
            clearInterval(blAnimTimer);
            var n = BL_PORTRAIT_FRAMES[emo], fi = 0;
            var set = function (i) {
                var s = 'celeste-portraits/badeline/' + emo + String(i).padStart(2, '0') + '.png';
                blDialogImg.src = s; blHeadImg.src = s;
            };
            set(0);
            for (var k = 1; k < n; k++) { var im = new Image(); im.src = 'celeste-portraits/badeline/' + emo + String(k).padStart(2, '0') + '.png'; }
            blAnimTimer = setInterval(function () { fi = (fi + 1) % n; set(fi); }, 120);
        }
        function blStopPortrait() {
            clearInterval(blAnimTimer); blAnimTimer = null;
            var s = 'celeste-portraits/badeline/' + blCurEmo + '00.png';
            blDialogImg.src = s; blHeadImg.src = s;
        }
        // 文本框弹出/收起音效（复用官方 textbox in/out 音效，音量压低）
        function blTextboxSfx(which) {
            Sfx.play('textbox/ui_game_textbox_madeline_' + which + '.wav', { volume: 0.4 });
        }
        // 4) 说话声：真实音效文件 —— 由专用工具类 js/badeline-voice.js 提供
        //    情绪map（badeline-sounds/ 文件夹名）+ pre+abcabc 循环 + sad_solo 特殊音效，
        //    语速/音量档位与逐字节奏（每 3 字一声）均对齐 diary 页 Madeline 方案
        function blResetVoiceSeq() { BadelineVoice.resetSeq(); }   /* blDoSpeak 每句调用 */
        function blVoice(emo) { BadelineVoice.play(emo); }
        function blDialogOpen() {
            if (!blDialog.classList.contains('show')) blTextboxSfx('in');
            blDialog.classList.add('show');
            blPanel.classList.add('dialog-live');
        }
        var blQuickMode = false;
        function blDialogClose() {
            clearTimeout(blDialogHideTimer);
            blStopPortrait();
            if (blDialog.classList.contains('show')) blTextboxSfx('out');
            blDialog.classList.remove('show');
            blPanel.classList.remove('dialog-live');
            // 单击 quickTalk 结束 → 通知动作树恢复（面板会话的关闭不走这条通知）
            if (blQuickMode) {
                blQuickMode = false;
                if (window.__badelineTalkEnded) window.__badelineTalkEnded();
            }
        }
        // 动作树单击 Badeline：只弹原作对话框，不开历史面板
        window.__badelineQuickTalk = function (text) {
            text = String(text || '').trim();
            if (!text) { if (window.__badelineTalkEnded) window.__badelineTalkEnded(); return; }
            blQuickMode = true;
            var emo = window.BadelineVoice ? BadelineVoice.infer(text) : 'normal';
            blSpeak(text, emo, false);
        };
        blDialog.addEventListener('click', function () {
            blDialogToken++;      // 点一下 = 打断：正在打的字立刻停下（对齐 Madeline 的世代号机制）
            blDialogClose();
        });
        window.__blDialogKill = function () { blDialogToken++; blDialogClose(); };
        function blSplitPages(t) {
            var parts = t.split(/(?<=[。！？!?…\n])/).map(function (s) { return s.trim(); }).filter(Boolean);
            var merged = [];
            parts.forEach(function (p) {
                var last = merged[merged.length - 1];
                if (last !== undefined && last.length < 12 && last.length + p.length <= 26) merged[merged.length - 1] = last + p;
                else merged.push(p);
            });
            var out = [];
            merged.forEach(function (s) {
                if (s.length <= 42) { out.push(s); return; }
                for (var i = 0; i < s.length; i += 42) out.push(s.slice(i, i + 42));
            });
            return out.length ? out : [t];
        }
        function blSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
        // 5) 演出：入队串行 → 弹框 → 立绘动画 → 逐字（每 3 字一声 blip）→ 结束定格 → 6s 自动收起
        //    aiLocked=true 表示情绪来自 AI 情绪分析标记（全句锁定）；否则逐句本地推断切换音色（对齐 Madeline）
        function blSpeak(text, emo, aiLocked) {
            blQueue = blQueue.then(function () { return blDoSpeak(text, emo, aiLocked); }).catch(function () {});
        }
        async function blDoSpeak(text, emo, aiLocked) {
            text = String(text || '').replace(/[（(][^（）()]*[）)]/g, '').trim(); // 动作旁白不上屏（对齐 Madeline）
            if (!text) return;
            if (!BL_PORTRAIT_FRAMES[emo]) { emo = blInferEmotion(text); aiLocked = false; }
            var my = blDialogToken;
            var wasOpen = blDialog.classList.contains('show');
            blDialogOpen();
            blStartPortrait(emo);
            if (BL_CRAWL_EMO[emo]) blCrawlOut(wasOpen ? 130 : 330, my);   // 等框体入场后再露头
            // 驱动大立绘 emo 切换（之前对话期间大立绘完全冻结，只有右下角小头像切表情）
            if (window.__badelineOnEmotion) window.__badelineOnEmotion(emo);
            clearTimeout(blDialogHideTimer);
            var pages = blSplitPages(text);
            for (var p = 0; p < pages.length; p++) {
                if (my !== blDialogToken) return;
                var fpage = window.TextFx ? TextFx.autoMark(pages[p]) : pages[p];  // 无标记台词自动补三种动画
                if (window.TextFx) { TextFx.set(blDialogText, ''); blDialogText.classList.add('tfx-typing'); }
                else blDialogText.textContent = '';
                blResetVoiceSeq();     /* 每句重置序列：per→A→B→C→A→B→C…（句子过短只播 per 也不强求循环） */
                var voiceEmo = emo, sentenceBuf = '', sc = 0;
                for (var ci = 0; ci < fpage.length; ci++) {
                    if (my !== blDialogToken) return;
                    var ch = fpage[ci];
                    if (window.TextFx) TextFx.set(blDialogText, fpage.slice(0, ci + 1));
                    else blDialogText.textContent += ch;
                    /* 动画标记符 { } ~ * 不参与音色逻辑；结尾定界 ! 紧跟 } 也不是句读 */
                    var isMark = ch === '{' || ch === '}' || ch === '~' || ch === '*';
                    var isSentEnd = /[。！？!?]/.test(ch) && fpage[ci + 1] !== '}';
                    if (isSentEnd) {
                        /* 句末：AI 未锁定时按本句关键词重推断音色（立绘保持 AI 标记不变） */
                        if (!aiLocked) {
                            var inf = BadelineVoice.infer(sentenceBuf);
                            if (inf) voiceEmo = inf;
                        }
                        sentenceBuf = '';
                    } else if (!isMark && !/[\s，,、；;：:（）()*「」·—。！？!?…]/.test(ch)) {
                        sentenceBuf += ch;
                        sc++;
                        if (sc % 3 === 1) blVoice(voiceEmo);
                    }
                    await blSleep(45 + Math.random() * 20);
                }
                if (window.TextFx) { TextFx.set(blDialogText, fpage); blDialogText.classList.remove('tfx-typing'); }
                if (p < pages.length - 1) await blSleep(900 + Math.random() * 500);
            }
            if (my === blDialogToken) {
                blStopPortrait();
                blDialogHideTimer = setTimeout(blDialogClose, 6000);
            }
        }
        function blSendMsg() {
            var v = blInput.value.trim();
            if (!v || blSending) return;
            blInput.value = '';
            blAdd('user', v);
            blPush('user', v);
            blSending = true;
            blSendBtn.disabled = true;
            var ld = blAdd('loading', '……');
            DiaryApi.badelineChat(v, blHist, heartsPayload())
                .then(function (res) {
                    ld.remove();
                    var m = (res && res.success && res.data && res.data.message)
                        ? res.data.message
                        : '……（她别过脸去，没接话。）';
                    var aiEmo = (res && res.success && res.data) ? BadelineVoice.normalize(res.data.emotion) : null;
                    var emo = aiEmo || blInferEmotion(m); // AI 情绪分析标记优先（归一化），缺失按台词推断
                    blAdd('assistant', m, emo);
                    blPush('assistant', m);
                    blSpeak(m, emo, !!aiEmo);   // 情绪立绘 + 逐字演出（AI 标记锁定音色）
                    // 生气类情绪 → 通知动作树：对话结束恢复后走 roll 链
                    if (window.__badelineOnEmotion) window.__badelineOnEmotion(emo);
                })
                .finally(function () {
                    blSending = false;
                    blSendBtn.disabled = false;
                    blInput.focus();
                });
        }
        blSendBtn.addEventListener('click', blSendMsg);
        blInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') blSendMsg(); });

        function openChat() {
            if (!blHist.length) {
                var line = LINES[Math.floor(Math.random() * LINES.length)];
                blAdd('assistant', line);
                blPush('assistant', line);
                blSpeak(line);   // 开场白也走游戏对话框演出
            } else if (!blMsgs.children.length) {
                // 她记得上次说到哪
                blHist.slice(-6).forEach(function (m) {
                    blAdd(m.role === 'assistant' ? 'assistant' : 'user', m.content);
                });
            }
            blPanel.classList.add('show');
            requestAnimationFrame(function () { requestAnimationFrame(function () { blPanel.classList.add('vis'); }); });
            setTimeout(function () { blInput.focus(); }, 300);
        }
        function closeChat() {
            blDialogToken++;      // 她走了：作废没说完的话并收起对话框
            blDialogClose();
            blPanel.classList.remove('vis');
            setTimeout(function () {
                blPanel.classList.remove('show');
                // 动作树接管：模式 A（召唤出来）让她走 byeSheLeaves；模式 B（自由游荡）恢复游荡
                var mode = window.__badelineCloseChat ? window.__badelineCloseChat() : 'summoned';
                if (mode === 'summoned') byeSheLeaves();
            }, 260);
        }
        function isMirrorBroken() {
            return Store.getFlag(Store.KEYS.MIRROR_BROKEN);
        }
        function byeSheLeaves() {
            badelineWrap.classList.remove('done');     // 离场：移除驻留态，让 badelineBye 动画接管
            mirror.classList.add('bye');
            setTimeout(function () {
                mirror.classList.remove('summoned');
                mirror.classList.remove('bye');
                // 破碎事实已写入 localStorage，永不复原；下次进房按 5:5 决定「这趟显示破/完好」
                busy = false;
                if (window.__mirrorBGM) window.__mirrorBGM.refresh(); // 她离开 → 回阶段1（0:00–2:11）
            }, 750);
        }
        document.getElementById('blClose').addEventListener('click', closeChat);

        mirror.addEventListener('click', function (ev) {
            if (ev) ev.stopPropagation();
            if (busy) return;
            busy = true;
            // Canvas 模式：触发 MirrorScene 完整碎镜过场。
            // BGM 时序对齐原作：敲镜 = DreamMirror.InteractRoutine 的 Audio.SetMusic(null)
            // （旧曲 ALLOWFADEOUT 淡出）→ 过场期间静默只留 sting/碎镜音 → OnEnd 才起下一段
            if (CANVAS_MIRROR) {
                if (window.MirrorScene.isReady()) {
                    // 本次进房按「已破」渲染：结果已在场，敲镜只召唤，不重播完整破碎过场
                    if (window.__mirrorRoomBroken) { summon(); return; }
                    if (window.__mirrorBGM) window.__mirrorBGM.beginCut();   // 先淡出旧曲，再开演
                    window.MirrorScene.reset();     // 告别后再敲：先复位成完好镜，干净重演整段过场
                    window.MirrorScene.breakNow();
                    // 调试专用：?ff=秒 —— 无头验证时同步快进过场（真实浏览器无此参数，行为不变）
                    var mff = /[?&]ff=([\d.]+)/.exec(location.search);
                    if (mff) window.MirrorScene.ff(parseFloat(mff[1]));
                } else {
                    summon();                        // 素材未就绪时的兜底
                }
                return;
            }
            if (isMirrorBroken()) { summon(); return; }   // 已碎：不重播碎裂动画，直接再召唤
            crackSound();
            mirror.classList.add('mirror-shake');
            setTimeout(function () { mirror.classList.remove('mirror-shake'); }, 600);
            var bf = 0;
            showFrame(breakImgs, 0);
            var bTimer = setInterval(function () {
                bf++;
                if (bf >= breakImgs.length) {
                    clearInterval(bTimer);
                    summon();
                    return;
                }
                showFrame(breakImgs, bf);
            }, 95);
        });

        function summon() {
            // 影子离开镜面
            maskImgs.forEach(function (im) { im.style.display = 'none'; });
            // DOM 回退模式才持久化破碎态；canvas 模式不持久化 —— 刷新后镜子永远完好，重演过场
            if (!CANVAS_MIRROR) { Store.set(Store.KEYS.MIRROR_BROKEN, '1'); }
            badelineWrap.classList.remove('done');     // 重新召唤：清除上次驻留态，让 badelineRise 动画从头播
            mirror.classList.add('summoned');
            // animationend → 加 .done 类，由静态 CSS 接管 transform（含 --glass-scale），避免 forwards 冻结 scale(1)
            var onRise = function (e) {
                if (e.animationName !== 'badelineRise') return;
                badelineWrap.classList.add('done');
                badelineWrap.removeEventListener('animationend', onRise);
            };
            badelineWrap.addEventListener('animationend', onRise);
            if (window.__mirrorBGM) window.__mirrorBGM.refresh(); // 切入阶段2（2:11–4:25）
            openChat();
            // 剧情版 mirror 房间保持安静：不摆聊天气泡/台词面板遮住梦块（点块才是这一段的交互）
            if (window.MirrorScene && MirrorScene.storyStage && MirrorScene.storyStage() === 'sleep') {
                setTimeout(function () {
                    var blp = document.getElementById('blChat');
                    if (blp) blp.classList.remove('vis', 'show');
                    if (window.__blDialogKill) window.__blDialogKill();
                }, 1500);
            }
            // 召唤动画（badelineRise 0.9s）走完后，启动自由游荡（模式 A 标记）
            setTimeout(function () {
                if (window.__badelineStartFreeRoam) window.__badelineStartFreeRoam(50, 50, false, true);
            }, 900);
        }
        // 镜子破碎状态呈现：碎帧留镜面 + Badeline 强制出场（破碎时她必须在）
        // 返回 true 表示当前破碎（调用方跳过常规的"随机模式 A/B"逻辑）
        window.__mirrorState = {
            sync: function () {
                if (!isMirrorBroken()) return false;
                maskImgs.forEach(function (im) { im.style.display = 'none'; });
                showFrame(breakImgs, breakImgs.length - 1);   // 保持最终碎裂帧
                if (window.__badelineStartFreeRoam) {
                    var ix = 20 + Math.random() * 60, iy = 30 + Math.random() * 35;
                    window.__badelineStartFreeRoam(ix, iy, true, false);   // 破镜而出，自由游荡
                }
                return true;
            }
        };
        // 暴露 openChat 给动作树 IIFE 调用（点击 Badeline 本人时触发对话）
        window.__badelineOpenChat = openChat;

        // ===== Canvas 镜子房间挂载点：panRight 调 enter、goBack 调 leave（在 dream IIFE 里接） =====
        if (CANVAS_MIRROR) {
            document.body.classList.add('mirror-canvas');
            window.__CANVAS_MIRROR = true;   // 动作树 IIFE 据此决定 closeChat 不让退场（旧版失误修正）
            // canvas 模式全局错误探针：静默失败落到 body[data-err]，无头验证/线上排错可见
            window.addEventListener('error', function (e) {
                document.body.setAttribute('data-err', (e.message || 'err') + ' @' + (e.filename || '') + ':' + (e.lineno || 0));
            });
            var msCanvasEl = document.getElementById('mirrorScene');
            var msInited = false;
            // 本次停留是否按「已破」渲染：每次进房只掷一次，停留期间不再重掷（否则会闪烁）
            var roomShowsBroken = false;
            function msPosition() {
                var r = window.MirrorScene.mirrorRect && window.MirrorScene.mirrorRect();
                if (!r || !r.width) return false;
                mirror.style.left = r.left + 'px';
                mirror.style.top = r.top + 'px';
                mirror.style.width = r.width + 'px';
                mirror.style.height = r.height + 'px';
                // DOM Badeline 尺寸绑定 canvas 角色：32 游戏像素精灵框 × Z，与碎镜过场里的人物大小一致
                var zs = window.MirrorScene.scale && window.MirrorScene.scale();
                if (zs) document.body.style.setProperty('--bd-size', Math.round(32 * zs) + 'px');
                return true;
            }
            window.__mirrorScene = {
                enter: function () {
                    if (!msInited) {
                        msInited = true;
                        window.MirrorScene.init(msCanvasEl, {
                            // 过场期间 Badeline 由 canvas 按世界坐标绘制（绝对锚定在镜心），
                            // 不再用 DOM wrap 相对 #shelfMirror 定位 —— 相机 zoom/pan 时不会脱节
                            drawBadeline: true, autoStart: false,
                            // 真实碎裂帧：写入不可逆事实（镜子已破 + 梦块已激活），并让本次停留剩余时间
                            // 按已破处理 —— 之后再敲镜只召唤，不再重播完整过场
                            onBreak: function () {
                                Store.setFlag(Store.KEYS.MIRROR_BROKEN, true);
                                Store.setFlag(Store.KEYS.DREAM_DASH, true);
                                roomShowsBroken = true;
                                window.__mirrorRoomBroken = true;
                            },
                            // IL: CS02_Mirror.OnEnd → Music = event:/music/lvl2/mirror → Apply(false) 直接起播。
                            // 这一帧对应过场真正的结束点；仓库缺 lvl2/mirror 音源，用 p2 兜底（见 docs）。
                            onEnd: function () {
                                if (window.__mirrorBGM) window.__mirrorBGM.endCut('p2');   // 硬起下一段，无淡入
                            },
                            // 过场收尾：相机已回到进房机位 → 对齐 DOM 命中区 → 走既有召唤演出（Badeline 从镜中升起）
                            onDone: function () {
                                msPosition();
                                summon();
                            }
                        });
                    }
                    window.MirrorScene.reset();
                    // 持久化事实：镜子已破 / 梦块已激活（不可逆）。5:5 只作用于「本次进房怎么渲染」：
                    // 每次进房掷一次，停留期间保持；未掷中已破就呈现完好镜，敲镜仍可正常重演过场。
                    // 梦块激活不受 5:5 影响：只要事实发生过，房间里的果冻就保持已激活的彩色终态。
                    var brokenFact = Store.getFlag(Store.KEYS.MIRROR_BROKEN);
                    var dashFact = Store.getFlag(Store.KEYS.DREAM_DASH) || brokenFact;
                    roomShowsBroken = brokenFact && Math.random() < 0.5;
                    window.__mirrorRoomBroken = roomShowsBroken;
                    window.MirrorScene.applyState(roomShowsBroken, dashFact);
                    // 重置 DOM 镜子态：上次召唤后未告别就回书架，重进时她不在场 + 对话/演出收起
                    mirror.classList.remove('summoned');
                    mirror.classList.remove('bye');
                    badelineWrap.classList.remove('done');
                    blDialogToken++;      // 作废没说完的话
                    blDialogClose();
                    blPanel.classList.remove('vis');
                    blPanel.classList.remove('show');
                    if (window.__badelineLeaveRoom) window.__badelineLeaveRoom();   // 行为树复位（wrap 移回镜面）
                    badelineWrap.style.display = '';   // 剧情穿走后隐藏过的立绘，重新进房时复位
                    if (window.MirrorScene.storyEnter) window.MirrorScene.storyEnter();   // 持久化剧情：dived→出场
                    busy = false;   // 每次进入都可敲镜：完好渲染→重演完整过场；已破渲染→直接召唤
                    var tries = 0;
                    (function align() {   // 等房间布局完成（canvas 有非零尺寸）再摆镜子命中区
                        if (msPosition() || ++tries > 30) return;
                        requestAnimationFrame(align);
                    })();
                },
                leave: function () { if (window.MirrorScene.reset) window.MirrorScene.reset(); }
            };
            window.addEventListener('resize', function () { if (msInited) msPosition(); });
        }
    })();

    // ===== Badeline 动作树：镜之房间内自由游荡（5 套 gif + 状态机 + 全屏定位）=====
    (function () {
        var room = document.getElementById('mirrorRoom');
        var mirror = document.getElementById('shelfMirror');
        var wrap = mirror ? mirror.querySelector('.badeline-wrap') : null;
        var img = document.getElementById('badelineImg');
        if (!room || !mirror || !wrap || !img) return;

        var DIR = 'celeste-player/badeline/';
        // gif 动作表（*_f.gif = 重编码修复 delay）
        var GIF = {
            roam: 'spin_f.gif',              // 25 FPS 流畅版（原 spin.gif 200ms delay = 5FPS 卡死）
            lookUp: 'lookingUp_f.gif',        // 裁白边重排到 32×32 画布，与其他动作同规格
            sleep: 'sleep_f.gif',
            pretendDead: 'pretendDead.gif',
            roll: 'roll_f.gif',
            rollGetUp: 'rollGetUp_f.gif'
        };
        // 生气类情绪 → 才有 roll 链（战斗态立绘：亮紫发+红眼）
        var ANGRY = { angry:1, angryAlt:1, yell:1, freakA:1, freakB:1, freakC:1 };
        // emo → 大立绘 GIF mode 映射（对话期间也能驱动，不再只是右下角小头像切表情）
        var EMO_TO_MODE = {
            angry: 'roll', angryAlt: 'roll', yell: 'roll',
            freakA: 'roll', freakB: 'roll', freakC: 'roll',
            sad: 'pretendDead', upset: 'pretendDead', sigh: 'pretendDead',
            worried: 'lookUp', worriedAlt: 'lookUp', concerned: 'lookUp',
            serious: 'lookUp', scoff: 'roam', normal: 'roam'
        };
        // 常态动作时长（ms）
        var DUR = {
            lookUp: [2000, 4000],
            sleep:  [3000, 6000]
        };
        // roll 链各段时长 = gif 实际时长
        var ROLL_MS = 650, GETUP_MS = 610, ROAM_SAFETY = 12000;

        var st = {
            x: 0, y: 0, dir: 1,
            mode: 'lookUp', modeUntil: 0,
            tx: null, ty: null
        };
        var roaming = false, inDialog = false, summonedMode = false, pendingRoll = false;
        var rafId = null, lastNow = performance.now();

        // 6 gif 预加载
        Object.keys(GIF).forEach(function (k) { var im = new Image(); im.src = DIR + GIF[k]; });

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
        // 活动边界（房间 px）：x 10–90%、y 22–76%，与旧版一致
        function bounds() {
            return {
                minX: room.clientWidth * .10, maxX: room.clientWidth * .90,
                minY: room.clientHeight * .22, maxY: room.clientHeight * .76
            };
        }
        function pickTarget() {
            var b = bounds();
            return {
                x: b.minX + Math.random() * (b.maxX - b.minX),
                y: b.minY + Math.random() * (b.maxY - b.minY)
            };
        }
        function render() {
            wrap.style.transform =
                'translate(' + st.x + 'px,' + st.y + 'px) translate(-50%,-50%)' +
                ' scaleX(' + st.dir + ')';
        }
        // 切模式（对齐 write 页：只换素材/目标/时长，不做 transition 位移）
        function enterMode(name) {
            st.mode = name;
            var now = performance.now();
            img.classList.remove('big');
            if (name === 'roam') {
                img.src = DIR + GIF.roam;
                var t = pickTarget();
                st.tx = t.x; st.ty = t.y;
                st.modeUntil = now + ROAM_SAFETY;
            } else if (name === 'lookUp') {
                img.src = DIR + GIF.lookUp;
                img.classList.add('big');
                st.tx = st.ty = null;
                st.modeUntil = now + DUR.lookUp[0] + Math.random() * (DUR.lookUp[1] - DUR.lookUp[0]);
            } else if (name === 'sleep') {
                img.src = DIR + GIF.sleep;
                st.tx = st.ty = null;
                st.modeUntil = now + DUR.sleep[0] + Math.random() * (DUR.sleep[1] - DUR.sleep[0]);
            } else if (name === 'roll') {
                img.src = DIR + GIF.roll;
                st.tx = st.ty = null;
                st.modeUntil = now + ROLL_MS;
            } else if (name === 'rollGetUp') {
                img.src = DIR + GIF.rollGetUp;
                st.modeUntil = now + GETUP_MS;
            }
        }
        // 常态加权选模式（排除当前模式，不连续重复）
        function pickMode() {
            var pool = [['roam', .42], ['sleep', .30], ['lookUp', .28]]
                .filter(function (p) { return p[0] !== st.mode; });
            var total = pool.reduce(function (s, p) { return s + p[1]; }, 0);
            var r = Math.random() * total, acc = 0;
            for (var i = 0; i < pool.length; i++) {
                acc += pool[i][1];
                if (r < acc) { enterMode(pool[i][0]); return; }
            }
            enterMode(pool[0][0]);
        }
        function enterRollChain() {
            pendingRoll = false;
            enterMode('roll');
        }
        function think(now) {
            if (!roaming || inDialog || now < st.modeUntil) return;
            if (st.mode === 'roll') enterMode('rollGetUp');
            else if (st.mode === 'rollGetUp') enterMode('roam');
            else pickMode();
        }
        // 单主循环：时间差驱动，速度与 write 页 Madeline 一致（85 px/s）
        function loop(now) {
            var dt = Math.min(.05, (now - lastNow) / 1000);
            lastNow = now;
            think(now);
            if (roaming && !inDialog && st.mode === 'roam' && st.tx !== null) {
                var dx = st.tx - st.x, dy = st.ty - st.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    if (dx > .5) st.dir = 1; else if (dx < -.5) st.dir = -1;
                    st.x += dx / dist * 85 * dt;
                    st.y += dy / dist * 85 * dt;
                } else {
                    pickMode();   // 走到目标 → 停下选下一个动作（write 同款）
                }
            }
            if (roaming) render();
            rafId = requestAnimationFrame(loop);
        }
        // 看门狗：rAF 在后台/headless 标签被饿死时，用定时器踢帧（防止她莫名定住、速度卡死）
        setInterval(function () {
            if (roaming && performance.now() - lastNow > 300) {
                lastNow = performance.now();
                loop(lastNow);
            }
        }, 250);
        window.addEventListener('resize', function () {
            if (!roaming) return;
            var b = bounds();
            st.x = clamp(st.x, b.minX, b.maxX);
            st.y = clamp(st.y, b.minY, b.maxY);
        });

        // ===== 自由游荡模式启动：DOM 移到 #mirrorRoom 子级，开启 .free 类 =====
        var storyHidden = false;   // 剧情穿走后压制 DOM 立绘（重进房间时由 stopFreeRoam 解除）
        function startFreeRoam(initialX, initialY, withFade, fromSummon) {
            if (roaming || storyHidden) return;
            wrap.classList.remove('done');    /* 离镜面：移除驻留态，由 inline transform 接管 */
            room.appendChild(wrap);
            wrap.classList.add('free');
            var b = bounds();
            st.x = clamp(room.clientWidth * initialX / 100, b.minX, b.maxX);
            st.y = clamp(room.clientHeight * initialY / 100, b.minY, b.maxY);
            st.tx = st.ty = null;
            st.dir = 1;
            wrap.style.transition = 'opacity .8s ease';   /* 位置全由 rAF transform 驱动，杜绝 left/top transition */
            wrap.style.left = '0';
            wrap.style.top = '0';
            wrap.style.display = '';
            render();
            if (withFade) {
                wrap.style.opacity = '0';
                requestAnimationFrame(function () { wrap.style.opacity = '1'; });
            }
            roaming = true; inDialog = false;
            summonedMode = !!fromSummon;
            pendingRoll = false;
            enterMode('roam');
        }
        function stopFreeRoam() {
            roaming = false; inDialog = false; summonedMode = false; pendingRoll = false;
            storyHidden = false;   // 进房/离房复位：下次敲镜可正常召唤
            if (rafId) { /* 主循环保留，供下次进房复用 */ }
            st.tx = st.ty = null;
            wrap.classList.remove('free');
            wrap.style.opacity = '';
            wrap.style.transition = '';
            wrap.style.left = '';
            wrap.style.top = '';
            wrap.style.transform = '';
            wrap.classList.add('done');      /* 回镜面：加驻留态，由 CSS 接管 transform（含 --glass-scale） */
            mirror.appendChild(wrap);   // DOM 移回 #shelfMirror
        }

        // ===== 钩子暴露 =====
        window.__badelineStartFreeRoam = startFreeRoam;
        window.__badelineLeaveRoom = stopFreeRoam;
        // 梦境剧情（mirror 房间测试版）：把 DOM 立绘的当前位置（房间 CSS px，脚底）交给 canvas，
        // 穿走时由 canvas 接管演出，DOM 立绘就地隐藏，避免出现两个 Badeline。
        if (window.MirrorScene && window.MirrorScene.setHostBadeline) {
            window.MirrorScene.setHostBadeline(function () {
                if (!roaming || storyHidden) return null;
                var size = wrap.offsetHeight || 128;
                return { x: st.x, y: st.y + size / 2 };
            }, function () {
                stopFreeRoam();
                storyHidden = true;
                wrap.style.display = 'none';
                // 穿走这一段是安静的：收起对话面板与字幕，不留任何气泡
                var blp = document.getElementById('blChat');
                if (blp) blp.classList.remove('vis', 'show');
                if (window.__blDialogKill) window.__blDialogKill();
            }, function () {
                // 穿越演完再切场景：回雪夜 → 由 dream 场景播 Badeline 出场与台词
                if (window.__heartDoorGoBack) window.__heartDoorGoBack();
            });
        }
        // closeChat 钩子：模式 A 返回 'summoned'（让外部走 byeSheLeaves 让她走）；模式 B 返回 'free'（恢复游荡）
        // Canvas 模式例外：镜子已碎、她常驻房间，关面板不退场（旧版失误），双击本人可重开聊天面板
        window.__badelineCloseChat = function () {
            if (!roaming) return 'summoned';
            if (summonedMode && !window.__CANVAS_MIRROR) {
                stopFreeRoam();           // 模式 A：DOM 复位回 #shelfMirror，让 byeSheLeaves 的 .bye 动画接管
                return 'summoned';
            }
            inDialog = false;             // 模式 B / canvas 常驻：恢复游荡（若积了生气情绪 → 先 roll）
            if (pendingRoll) enterRollChain(); else enterMode('roam');
            return 'free';
        };
        // 情绪事件：通用 emo → 大立绘 mode（无论对话/游荡）；ANGRY 额外记账 pendingRoll（对话结束补 rollChain）
        window.__badelineOnEmotion = function (emo) {
            // 通用：对话期间也切大立绘！（之前只处理 ANGRY 且对话期间完全冻结大立绘）
            var targetMode = EMO_TO_MODE[emo];
            if (targetMode && !inDialog) {
                // 游荡中 → 正常 enterMode
                enterMode(targetMode);
            } else if (targetMode && inDialog && roaming) {
                // 对话期间也切大立绘 GIF（用 enterMode 但跳过 think 的动作树流程）
                enterMode(targetMode);
            }
            // ANGRY 类 → 对话结束后补一个 rollChain（翻滚战斗态）
            if (ANGRY[emo]) {
                if (!roaming || inDialog) { pendingRoll = true; return; }
                if (st.mode === 'roll' || st.mode === 'rollGetUp') return;
                enterRollChain();
            }
        };
        // quickTalk（单击）演出结束回调 → 恢复游荡（若积了生气情绪 → 先 roll）
        window.__badelineTalkEnded = function () {
            if (!inDialog) return;
            inDialog = false;
            if (pendingRoll) enterRollChain(); else enterMode('roam');
        };
        // 进镜之房间时随机选模式
        window.__badelineEnterRoom = function () {
            var modeA = Math.random() < .5;
            if (modeA) {
                stopFreeRoam();                                    // 模式 A：留镜子里，等敲镜子召唤
                img.src = DIR + GIF.lookUp;
            } else {
                var ix = 20 + Math.random() * 60;                  // 模式 B：直接破镜出来游荡
                var iy = 30 + Math.random() * 35;
                startFreeRoam(ix, iy, true, false);
            }
        };

        // ===== 点击 Badeline 本人（对齐 write 页 Madeline）：单击=原作对话框，双击=历史面板 =====
        var PET_LINES = [
            '……别乱戳，我又不会跑。',
            '哼，你闲得慌？写你的去。',
            '又找我？行吧，听着呢。',
            '放心，有我盯着，出不了事。',
            '写累了就歇会儿，别硬撑。'
        ];
        function facePlayer() {
            st.tx = st.ty = null;
            st.dir = st.x < room.clientWidth / 2 ? 1 : -1;   // 朝向房间中央的玩家
            render();
        }
        function beginQuickTalk() {
            inDialog = true;
            facePlayer();
            var line = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
            if (window.__badelineQuickTalk) window.__badelineQuickTalk(line);
            else { inDialog = false; enterMode('roam'); }   /* 钩子缺失的兜底 */
        }
        function openFullChat() {
            if (inDialog || !roaming) return;
            inDialog = true;
            facePlayer();
            img.src = DIR + GIF.lookUp;
            img.classList.add('big');
            if (window.__badelineOpenChat) window.__badelineOpenChat();
        }
        var clickTimer = null;
        img.addEventListener('click', function (e) {
            if (!roaming) return;   // 模式 A 未召唤时不响应（点镜子才召唤）
            e.stopPropagation();
            if (clickTimer) return;
            clickTimer = setTimeout(function () { clickTimer = null; beginQuickTalk(); }, 260);
        });
        img.addEventListener('dblclick', function (e) {
            if (!roaming) return;
            e.stopPropagation();
            if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
            openFullChat();
        });

        // 启动主循环（空闲时只转 rAF，开销可忽略）
        rafId = requestAnimationFrame(loop);
    })();

    // ===== 紫色空间粒子：3 类星点 PNG 纯竖直下落 + 独立切帧 + 蓝色拖尾 =====
    (function () {
        var room = document.getElementById('mirrorRoom');
        var dsWorld = document.querySelector('.ds-world');
        if (!room || !dsWorld) return;
        var layer = document.createElement('div');
        layer.className = 'mv-layer';
        room.appendChild(layer);

        var DIR = 'Atlases/Gameplay/bgs/02/stars/';
        var TYPES = ['a', 'b', 'c'];
        var FRAMES = 4;
        // 预加载 12 张 PNG + 缓存 background url 字符串
        var cache = {};
        TYPES.forEach(function (t) {
            cache[t] = [];
            for (var i = 0; i < FRAMES; i++) {
                var src = DIR + t + String(i).padStart(2, '0') + '.png';
                cache[t].push('url("' + src + '") center / 100% 100% no-repeat');
                var im = new Image(); im.src = src;
            }
        });

        var SIZE = 50;
        var MAX_STARS = 36;   // 同屏上限（略增）

        // 生成一颗星点；prefillDelay>0 时用负 animation-delay 让它"已经在下落途中"（随机相位遍布全屏）
        // 性能：原来每颗星各起一个 setInterval（同屏最多 36 个定时器、约 150+ 次 background 写/秒）。
        // 改成一颗共享节拍器统一推进切帧（定时器 36 → 1，各自节奏靠单星 next 时间保留）。
        var live = [], ticker = null;
        function pump() {
            var now = nowClock();
            for (var i = live.length - 1; i >= 0; i--) {
                var s = live[i];
                // 到期就自己收尾，不依赖 animationend：只动 transform/opacity 的动画在合成器上跑，
                // 那些「负延迟已经过了终点」的星不会派发 animationend，否则 36 个槽位会被占死
                if (!s.el.parentNode || now >= s.endAt) {
                    if (s.el.parentNode) s.el.remove();
                    live.splice(i, 1);
                    continue;
                }
                if (now < s.next) continue;
                s.next = now + s.period;
                s.idx = (s.idx + 1) % FRAMES;
                s.el.style.background = cache[s.t][s.idx];
            }
            if (!live.length && ticker) { clearInterval(ticker); ticker = null; }
        }
        function nowClock() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
        function makeStar(prefillDelay) {
            var t = TYPES[Math.floor(Math.random() * TYPES.length)];
            var el = document.createElement('i');
            el.className = 'star';
            el.style.width = el.style.height = SIZE + 'px';
            var frameIdx = Math.floor(Math.random() * FRAMES);
            el.style.background = cache[t][frameIdx];
            el.style.setProperty('--x', (Math.random() * 96).toFixed(1) + '%');
            el.style.setProperty('--dist', (room.clientHeight + 64) + 'px');
            var dur = 6 + Math.random() * 9;                 // 下降时长：6–15s
            // 预填相位夹到 dur 之内：否则「已经播完」的星进场就是结束态，屏幕会先空一块再慢慢补回来
            var pre = prefillDelay > 0 ? Math.min(prefillDelay, dur * 0.92) : 0;
            el.style.animationDuration = dur.toFixed(2) + 's';
            if (pre > 0) el.style.animationDelay = (-pre).toFixed(2) + 's';
            var period = 160 + Math.random() * 160;
            var now = nowClock();
            live.push({ el: el, t: t, idx: frameIdx, period: period, next: now + period, endAt: now + (dur - pre) * 1000 });
            el.addEventListener('animationend', function () { el.remove(); });
            layer.appendChild(el);
            if (!ticker) ticker = setInterval(pump, 80);
        }

        var wasPanned = false;
        function spawn() {
            var panned = !document.hidden && dsWorld.classList.contains('panned');
            if (panned) {
                if (!wasPanned) {
                    // 刚进入镜之房间：一次性预填满屏，各粒子处于随机下落相位（不再从零慢慢积累）
                    layer.innerHTML = '';
                    live.length = 0;
                    for (var i = 0; i < MAX_STARS; i++) makeStar(Math.random() * 15);
                } else if (layer.children.length < MAX_STARS) {
                    makeStar(0);                             // 稳态：补足飘走的
                }
                wasPanned = true;
                setTimeout(spawn, 300 + Math.random() * 700);
                return;
            }
            wasPanned = false;
            layer.innerHTML = '';
            live.length = 0;
            if (ticker) { clearInterval(ticker); ticker = null; }
            setTimeout(spawn, 800);
        }
        spawn();
    })();

    // ===== dream 模式：点击 shelf 上 Madeline 旁边的草莓篝火 → 极光梦境场景 =====
    (function () {
        var bonfire = document.getElementById('strawberryBonfire');   // dream 入口已合并到这个篝火上
        var scene = document.getElementById('dreamScene');
        var dsFire = document.getElementById('dsFire');
        var dsMadeline = document.getElementById('dsMadeline');
        if (!bonfire || !scene) return;
        var FRAMES = [];
        for (var i = 0; i <= 8; i++) FRAMES.push('celeste-gui/campfire/dream0' + i + '.png');
        var SLEEP_GIF = 'celeste-gui/madeline-sleep.gif';
        var SLEEP_LAST = 'celeste-gui/madeline-sleep-last.png';   // sleep.gif 最后一帧静态 PNG：播一次就停
        var SLEEP_MS = 2800;   // sleep.gif 29 帧约 2.8s，播完后换静态 PNG
        var WAKE_GIF = 'celeste-gui/madeline-wakeup.gif';
        var WAKE_MS = 2400;        // wakeup.gif 实测总时长 2.4s（24 帧），播完再离开梦境
        var timer = null, playing = false, waking = false, sleepTimer = null;
        // 预加载睡觉 gif / 最后一帧 PNG / 睡醒 gif，保证点击叫醒时即时切换不闪白
        [SLEEP_GIF, SLEEP_LAST, WAKE_GIF].forEach(function (src) { var im = new Image(); im.src = src; });

        // 1×1 透明 GIF 中间态：同步连赋两次（先 data URI 再目标 URL），
        // 让浏览器把同一 URL 视为新请求 → 命中本地缓存、零网络、解码器重建、gif 从第 1 帧重播
        var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        function replayGif(img, url) {
            img.src = PIXEL;
            img.src = url;
        }

        // 9 帧篝火预载门控：全部就绪或 800ms 超时（单帧 404 也不挡入梦）后才允许切帧
        var framesReady = (function () {
            var jobs = FRAMES.map(function (src) {
                return new Promise(function (done) {
                    var im = new Image();
                    im.onload = done;
                    im.onerror = done;
                    im.src = src;
                });
            });
            return Promise.race([
                Promise.all(jobs),
                new Promise(function (r) { setTimeout(r, 800); })
            ]);
        })();

        // dsMadeline 资源失败时按「当前意图 URL」补拉一次（不能取 src，中间态/旧值都可能误导）
        var madelineIntent = SLEEP_GIF;
        if (dsMadeline) {
            dsMadeline.addEventListener('error', function () {
                if (dsMadeline.dataset.retried === madelineIntent) return;
                dsMadeline.dataset.retried = madelineIntent;
                var u = madelineIntent;
                setTimeout(function () { replayGif(dsMadeline, u); }, 250);
            });
        }

        // ===== 梦境剧情：Badeline 在睡着的 Madeline 旁突然出现（REA）+「亲爱的，祝你好梦」 =====
        // mirror 房间只负责穿块，不出现 Madeline；出场与台词在切回雪夜时由这里播放。
        // 参数取自 docs/badeline-appear-rea.md：
        //   Scale=1 直接生成（无闪光）；AddBurst(.5, 8→32)；FloatTo(Center+(18,-10))、FloatSpeed 120 / Accel 240；
        //   悬浮正弦 0.25Hz、Floatness 2→4→2；P_Vanish 12 颗 1px 白点、5–10px/s、Life .6–1.2s、
        //   每 .1s 在 #6F2399/#EC76F7 切换、末 25% 淡出。
        var DS_STORY_KEY = 'badelineMirrorStoryV1';
        var DS_STORY_TEXT = '亲爱的，祝你好梦';
        var dsLeft = scene.querySelector('.ds-left');
        var dsStory = { img: null, bubble: null, ring: null, parts: null, btn: null,
            playing: false, shown: false, timers: [], anims: [] };

        function dsStoryStage() {
            if (window.MirrorScene && window.MirrorScene.storyStage) return window.MirrorScene.storyStage();
            try {
                var r = JSON.parse(localStorage.getItem(DS_STORY_KEY) || 'null');
                if (!r || !r.stage) return 'sleep';
                if (r.expiresAt && Date.now() > r.expiresAt) { localStorage.removeItem(DS_STORY_KEY); return 'sleep'; }
                return r.stage;
            } catch (e) { return 'sleep'; }
        }
        function dsClearTimers() {
            dsStory.timers.forEach(clearTimeout);
            dsStory.timers = [];
            dsStory.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
            dsStory.anims = [];
        }
        function dsEnsureEls() {
            if (!dsLeft || dsStory.img) return;
            var img = document.createElement('img');
            img.id = 'dsBadeline';
            img.alt = 'Badeline';
            img.src = 'celeste-player/badeline/lookingUp_f.gif';
            img.style.cssText = 'position:absolute;z-index:5;pointer-events:none;display:none;' +
                'image-rendering:pixelated;transform-origin:50% 100%;';
            dsLeft.appendChild(img);
            dsStory.img = img;
        }
        function dsClearVisuals() {
            dsClearTimers();
            dsStory.playing = false; dsStory.shown = false;
            if (dsStory.img) { dsStory.img.style.display = 'none'; dsStory.img.style.opacity = '0'; }
            if (dsStory.bubble) dsStory.bubble.remove();
            if (dsStory.ring) dsStory.ring.remove();
            if (dsStory.parts) dsStory.parts.remove();
            dsStory.bubble = dsStory.ring = dsStory.parts = null;
        }
        // 位置：Badeline 脚底 = Madeline 脚底右移 18 世界像素、上浮 10 世界像素（REA FloatTo 目标）
        function dsPlace() {
            if (!dsLeft || !dsMadeline || !dsStory.img) return null;
            var lr = dsLeft.getBoundingClientRect();
            var mr = dsMadeline.getBoundingClientRect();
            if (!mr.width) return null;
            var ws = mr.width / 32;                       // 1 游戏像素 = 多少 CSS 像素
            var footX = (mr.left - lr.left) + mr.width / 2 + 18 * ws;
            var footBottom = (lr.bottom - mr.bottom) + 10 * ws;
            dsStory.img.style.width = Math.round(mr.width) + 'px';
            dsStory.img.style.height = Math.round(mr.height) + 'px';
            dsStory.img.style.left = Math.round(footX - mr.width / 2) + 'px';
            dsStory.img.style.bottom = Math.round(footBottom) + 'px';
            return { lr: lr, mr: mr, ws: ws, footX: footX, footBottom: footBottom };
        }
        function dsParticles(cx, topY, ws) {
            var box = document.createElement('div');
            box.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;';
            dsLeft.appendChild(box);
            for (var i = 0; i < 12; i++) {
                var a = Math.random() * Math.PI * 2;
                var dist = rndPx(8, 32) * ws;
                var dx = Math.cos(a) * dist, dy = Math.sin(a) * dist;
                var life = rndPx(0.6, 1.2);
                var dot = document.createElement('i');
                dot.style.cssText = 'position:absolute;width:2px;height:2px;border-radius:1px;' +
                    'left:' + cx + 'px;top:' + topY + 'px;' +
                    'background:' + (i % 2 ? '#EC76F7' : '#6F2399') + ';';
                box.appendChild(dot);
                var colors = ['#6F2399', '#EC76F7'];
                var frames = [];
                for (var k = 0; k <= 10; k++) {
                    frames.push({
                        backgroundColor: colors[k % 2],
                        transform: 'translate(' + (dx * k / 10) + 'px,' + (dy * k / 10) + 'px)',
                        opacity: k >= 8 ? (10 - k) / 2.5 : 1
                    });
                }
                dsStory.anims.push(dot.animate(frames, { duration: life * 1000, easing: 'linear', fill: 'forwards' }));
            }
            dsStory.parts = box;
            dsStory.timers.push(setTimeout(function () { if (box.parentNode) box.remove(); }, 1400));
        }
        function rndPx(a, b) { return a + Math.random() * (b - a); }
        function dsShowBubble(cx, bottomPx) {
            var b = document.createElement('div');
            b.textContent = DS_STORY_TEXT;
            b.style.cssText = 'position:absolute;z-index:6;pointer-events:none;white-space:nowrap;' +
                'padding:7px 14px;border-radius:4px;background:rgba(16,8,26,.9);' +
                'border:1px solid #9B3FB5;box-shadow:0 0 0 2px rgba(6,6,20,.6);' +
                'color:#F2E9FF;font:13px "Renogare","CelesteZH","Microsoft YaHei",sans-serif;' +
                'letter-spacing:1px;opacity:0;transform:translate(-50%,6px);';
            b.style.left = Math.round(cx) + 'px';
            b.style.bottom = Math.round(bottomPx) + 'px';
            dsLeft.appendChild(b);
            dsStory.bubble = b;
            dsStory.timers.push(setTimeout(function () {
                b.animate([{ opacity: 0, transform: 'translate(-50%,6px)' },
                           { opacity: 1, transform: 'translate(-50%,0)' }],
                          { duration: 250, easing: 'ease-out', fill: 'forwards' });
            }, 850));
            dsStory.timers.push(setTimeout(function () {
                b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease-in', fill: 'forwards' });
            }, 4250));
            dsStory.timers.push(setTimeout(function () { if (b.parentNode) b.remove(); }, 4850));
        }
        // dived → 播 REA 出场；appeared → 静态补位（不重复演出）
        function dsMaybeStory() {
            if (!scene.classList.contains('show') || !dsLeft || !dsMadeline) return;
            if (dsStory.playing) return;
            dsEnsureEls();
            var stage = dsStoryStage();
            dsSyncResetBtn(stage !== 'sleep');
            if (stage === 'sleep' || stage === 'diaryShown') { dsClearVisuals(); return; }
            if (stage === 'appeared') {                 // 已出场过：只补一个静态立绘
                var pos = dsPlace();
                if (!pos) return;
                dsStory.img.style.display = 'block';
                dsStory.img.style.opacity = '1';
                dsStory.img.style.transform = 'none';
                dsStory.shown = true;
                return;
            }
            // stage === 'dived'：出场
            var p = dsPlace();
            if (!p) { dsStory.timers.push(setTimeout(dsMaybeStory, 120)); return; }
            dsStory.playing = true;
            dsStory.img.style.display = 'block';
            dsStory.img.style.opacity = '0';
            dsStory.img.style.transform = 'scale(.3)';
            // Scale=1 直接生成：0.5s 内从 .3 放大到 1（无闪光）
            var intro = dsStory.img.animate(
                [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }],
                { duration: 500, easing: 'cubic-bezier(.2,.9,.2,1)', fill: 'forwards' });
            dsStory.anims.push(intro);
            // Displacement.AddBurst(.5, 8→32)：半径 8→32 世界像素
            var ring = document.createElement('div');
            var d1 = 64 * p.ws, cx = p.footX, topY = p.lr.height - (p.footBottom + p.mr.height * 0.5);
            ring.style.cssText = 'position:absolute;z-index:5;pointer-events:none;border-radius:50%;' +
                'border:2px solid #dcb4ff;width:' + d1 + 'px;height:' + d1 + 'px;' +
                'left:' + (cx - d1 / 2) + 'px;top:' + (p.mr.top - p.lr.top + p.mr.height * 0.3) + 'px;' +
                'transform:scale(.25);opacity:1;';
            dsLeft.appendChild(ring);
            dsStory.ring = ring;
            dsStory.anims.push(ring.animate(
                [{ transform: 'scale(.25)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }],
                { duration: 500, easing: 'ease-out', fill: 'forwards' }));
            dsStory.timers.push(setTimeout(function () { if (ring.parentNode) ring.remove(); }, 520));
            // P_Vanish：12 颗 1px 白点（贴图染色 → 紫）
            dsParticles(cx, topY, p.ws);
            // 落地后 0.25Hz 正弦悬浮（Floatness 2→4→2 在 1s 内收敛）
            dsStory.timers.push(setTimeout(function () {
                dsStory.img.style.opacity = '1';
                dsStory.img.style.transform = '';
                dsStory.anims.push(dsStory.img.animate(
                    [{ transform: 'translateY(1px)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(1px)' }],
                    { duration: 4000, iterations: Infinity, easing: 'ease-in-out' }));
            }, 520));
            // 出场播完（0.9s）写入 appeared；台词随后出现并持续约 3.4s
            dsStory.timers.push(setTimeout(function () {
                dsStory.shown = true;
                dsStory.playing = false;
                if (window.MirrorScene && window.MirrorScene.storyMark) window.MirrorScene.storyMark('appeared');
                dsSyncResetBtn(true);
                dsShowBubble(p.footX, p.footBottom + p.mr.height + 8);
            }, 900));
        }
        function dsSyncResetBtn(show) {
            if (!show) { if (dsStory.btn) dsStory.btn.style.display = 'none'; return; }
            if (!dsStory.btn && dsLeft) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = '恢复 Madeline';
                btn.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:14;' +
                    'padding:5px 10px;border:1px solid rgba(255,255,255,.22);border-radius:4px;' +
                    'background:rgba(12,8,20,.72);color:rgba(255,255,255,.72);cursor:pointer;' +
                    'font:12px "Renogare","CelesteZH","Microsoft YaHei",sans-serif;';
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (window.MirrorScene && window.MirrorScene.storyReset) window.MirrorScene.storyReset();
                    else { try { localStorage.removeItem(DS_STORY_KEY); } catch (err) {} }
                    dsClearVisuals();
                    dsSyncResetBtn(false);
                });
                dsLeft.appendChild(btn);
                dsStory.btn = btn;
            }
            if (dsStory.btn) dsStory.btn.style.display = '';
        }
        document.addEventListener('mirrorstory:back', dsMaybeStory);

        // 逐帧驱动：只更新 dream 场景内的大火（shelf 上的草莓篝火维持原 FIRE_FRAMES 动画，互不干扰）
        function playSeq(list, ms, loop) {
            clearInterval(timer);
            var idx = 0;
            timer = setInterval(function () {
                dsFire.src = list[idx];
                idx++;
                if (idx >= list.length) {
                    if (loop) idx = 1;   // 循环时跳回第 1 帧，火焰持续摇曳不跳变
                    else { clearInterval(timer); playing = false; }
                }
            }, ms);
        }

        // ===== dream 雪夜 BGM：Starjump 0–34s 循环（进 dream 起播、离 dream 停止；与全站 BGM 互斥） =====
        var DJ_SRC = 'bgm/Starjump.mp3', DJ_SEG_END = 34, DJ_VOL = 0.32;
        var djLoop = null;
        function djDuck(on) {
            var bp = document.getElementById('bgmPlayer');
            if (!bp) return;
            if (on && !bp.paused) { bp.pause(); window.__dreamBGMDucked = true; }
            else if (!on && window.__dreamBGMDucked) { bp.play().catch(function () {}); window.__dreamBGMDucked = false; }
        }
        function djEnsure() {
            // 0–34s 片段在音频渲染线程内回绕，采样精确，没有 element loop 的管线重置空隙
            if (!djLoop && window.GaplessAudio) {
                djLoop = window.GaplessAudio.loop(DJ_SRC, { duration: DJ_SEG_END, volume: DJ_VOL });
            }
            return djLoop;
        }
        function djStart() {       // 进 dream：从 0 起播并压过全站 BGM
            var l = djEnsure();
            if (l) { var p = l.start(); if (p && p.catch) p.catch(function () {}); }
            djDuck(true);
        }
        function djPause() {       // 进镜之房间：暂停留位（Resurrections 接管）
            if (djLoop) djLoop.suspend();
        }
        function djResume() {      // 回雪夜：从暂停处续播
            if (!djLoop) return;
            var p = djLoop.resume(); if (p && p.catch) p.catch(function () {});
        }
        function djStop() {        // 离 dream：彻底停止并复位，同时恢复全站 BGM
            if (djLoop) djLoop.halt();
            djDuck(false);
        }
        window.__dreamBGM = { pause: djPause, resume: djResume };

        bonfire.addEventListener('click', function () {
            if (playing) return;                  // 防重复触发
            playing = true;
            waking = false;
            // 先淡入极光场景，让玩家看到 Madeline 完整的入睡动画，定格后再激活 dream 模式
            scene.classList.add('show');
            if (dsMadeline) {
                dsMadeline.classList.remove('waking');
                madelineIntent = SLEEP_GIF;
                replayGif(dsMadeline, SLEEP_GIF);
            }
            // sleep.gif 播完整后定格到最后一帧，再过渡到完整 dream 模式
            clearTimeout(sleepTimer);
            sleepTimer = setTimeout(function () {
                if (waking) return;
                if (dsMadeline) { madelineIntent = SLEEP_LAST; dsMadeline.src = SLEEP_LAST; }
                // 定格停留片刻后激活心门 + 镜之房间 + 篝火全燃 + BGM
                setTimeout(function () {
                    if (waking) return;
                    document.body.classList.add('dream-active');
                    setTimeout(dsMaybeStory, 100);   // 刷新后状态仍是 dived 时补播出场
                    framesReady.then(function () {
                        if (!scene.classList.contains('show')) return;
                        dsFire.src = FRAMES[8];               // 篝火直接全燃
                        playSeq(FRAMES.slice(2), 130, true);  // 立即进入火焰摇曳小循环
                    });
                    djStart();                            // dream BGM：Starjump 0–34s 循环
                    document.dispatchEvent(new CustomEvent('dream:entered'));   // 通知金羽毛入场散布
                }, 400);
            }, SLEEP_MS);
        });

        // 叫醒 Madeline：睡觉 → 睡醒动画（2.4s）→ 离开梦境；动画期间防重复点击
        function wakeMadeline() {
            if (waking || !scene.classList.contains('show')) return;
            waking = true;
            if (dsMadeline) {
                dsMadeline.classList.add('waking');
                madelineIntent = WAKE_GIF;
                replayGif(dsMadeline, WAKE_GIF);   // 缓存重播睡醒 gif，不走网络
                setTimeout(exitDream, WAKE_MS);
            } else {
                exitDream();
            }
        }
        if (dsMadeline) dsMadeline.addEventListener('click', wakeMadeline);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && scene.classList.contains('show')) wakeMadeline();
        });

        function exitDream() {
            // 兜底：若在镜之房间态直接离场（如 Esc），复位镜头并停房间 BGM，避免与全站 BGM 叠播
            var w = scene.querySelector('.ds-world');
            if (w && w.classList.contains('panned')) {
                w.classList.remove('panned');
                if (window.__blDialogKill) window.__blDialogKill();
                if (window.__mirrorBGM) window.__mirrorBGM.exit();
                if (window.__badelineLeaveRoom) window.__badelineLeaveRoom();
                if (window.CampfireAudio) window.CampfireAudio.resume();   // 从镜之房间直接离场：篝火回书架续烧
            }
            djStop();                              // 停 dream BGM（Starjump）并恢复全站 BGM
            scene.classList.remove('show');
            document.body.classList.remove('dream-active');   // 心门 + 镜之房间收起
            document.dispatchEvent(new CustomEvent('dream:exiting'));  // 通知记梦/夜话面板收起
            clearInterval(timer);
            clearTimeout(sleepTimer);
            playing = false;
            waking = false;
            if (dsMadeline) { dsMadeline.classList.remove('waking'); madelineIntent = SLEEP_GIF; dsMadeline.src = SLEEP_GIF; }
            dsFire.src = FRAMES[0];
            dsClearVisuals();   // 离梦即清：Badeline / 气泡 / 粒子都不留在 shelf 正页
        }
    })();

    // ===== dream 金羽毛：REA 还原第六章（Reflection）FlyFeather + Player.StStarFly =====
    // 待机 FlyFeather（IL 0000-0193）：精灵 loop(idle00-20) ↔ flash(00-20) 逐帧 0.06s；
    //   SineWave(0.6Hz).Randomize() 上下 ±2 世界像素；bloom(0.5, r20) + light(α1, 16, 48)；
    //   light.Alpha = Approach(..., sprite.Visible?1:0, 4*dt) → bloom.Alpha = light.Alpha * 0.8
    //   重生（Respawn）：outline 隐 / 可碰 / wiggler(1s / 4Hz) → Scale = 1 + Value * 0.2 + P_Respawn×16
    // 收集（OnPlayer → CollectRoutine）：Collidable=false → Shake(0.3) → sprite.Visible=false → 0.05s
    //   → P_Collect×10（One×6）+ SlashFx.Burst(Pos, Angle(playerSpeed))；羽毛 3s 后原位重生
    //   飞行中撞到另一根走的是同一条协程（StartStarFly 的 renew 分支：timer 回满 + Sprite.Color=starFlyColor）
    // 星飞（StarFlyBegin / Coroutine / Update）：
    //   0.42s 变形（startStarFly 4×0.08 播完 + Speed 归零 + 0.1s）→ Speed=dir×250 + P_Boost×12
    //   + DirectionalShake(dir, 0.3)；之后无输入 91 / 逆向 140 / 顺向 140→190（1000/s 逼近，lerp 速率 1/s）；
    //   moveDir 以 5.5850534 rad/s 追输入；每 0.02s 发射 P_Flying；starFlyTimer=2s（页面调到 4s）；
    //   末 0.5s 每 0.05s 在 starFlyColor(#ffd65c) ⇄ NormalHairColor 间闪；
    //   撞墙：timer<0.2 → Speed.axis=0，否则 Speed.axis *= -0.5（OnCollideH/V）
    //   结束（StarFlyEnd）：Speed 夹取（|X|≤140、按↑则 Y=-100、Y>0→0）后交回普通状态 + P_Boost×12
    // 星飞时"操作的那个东西"长什么样（Player.Render + PlayerHair.Render/AfterUpdate 逐行，这才是像不像的关键）：
    //   Player::.ctor 里是 Add(Hair) 然后才 Add(Sprite)（ctor @01bd / @01c9）⇒ Entity.Render 按添加顺序跑，
    //   ⇒ 屏幕上从底到顶恒为这 4 层（顺序错了整个观感就废了）：
    //     (1) 精灵黑边：DrawPlayerSpriteOutline=true 时 Hair.Render 开头先把 Border(=Black)*Alpha 的精灵
    //         在 Position+(0,-1)/(0,1)/(-1,0)/(1,0) 各 Render 一次 —— 4 次纯黑剪影在最底层（@0033-00e6）
    //     (2) 头发描边趟：i=0→HairCount-1，每节 4 次 ±1 世界像素的 Border 偏移（@011d-01e8）
    //     (3) 头发本体趟：i=HairCount-1→0，从梢到根叠上去（@01f9-022d）
    //     (4) 精灵本体：Entity.Render → Sprite.Render（starFly00 是 32×32 里只有 10×9 的实心圆盘，origin=(16,32)）
    //     (5) 仅 startStarFly 帧：Player.Render 在 base.Render() 之后再叠一张 startStarFlyWhite[N]，
    //         颜色 starFlyColor * (Frame/TotalFrames)（player_render_il.txt @01cd-0229）—— 金色是这么“点亮”的
    //   ⇒ 头发被球体压住，只从边缘露出来、尾巴从球后面伸出（贴图中心 = Node，origin=(5,5)）
    //     GetHairScale(i) = 0.25 + (1 - i/HairCount)*0.75 ⇒ 发根 1.0、末端 0.357（描边宽度不随缩放变，恒 1 世界像素）
    //     GetHairColor(i) = Hair.Color*Alpha；而 UpdateHair 里 State==19 → Hair.Color = Sprite.Color ⇒ 跟精灵同色同闪
    //   颜色语义是 MTexture.Draw 的**乘法**：hair00 是纯白贴图（乘成什么就是什么），bangs00 带 134,134,134 高光
    //     ⇒ 必须乘法染色才能留住刘海明暗；startStarFly00-03 是本色 Madeline ⇒ Sprite.Color=White 时原样画，不能染白
    //   头发跟随：Nodes[0] = Sprite.RenderPosition + (0,-9) + HairOffset*(Facing,1)，starFly 的 HairOffset=(0,3)
    //     ⇒ 发根正好落在球心 (0,-6)；StarFly 时 SimulateMotion=false（applyGravity=false）⇒ 不走 Approach，
    //     只剩 |V2-Nodes[i]|>3 的硬链约束 ⇒ 被 Node0 一帧一拽，拉成 3 世界像素/节 × 6 节的直线拖尾（总长 18）
    //   变形时序：0–0.32s 播 startStarFly×4（Sprite.Color 仍是 White、HairOffset=(0,-2)、HairCount=4）
    //     → 0.32–0.42s 帧已切 starFly 但仍白 → 0.42s 才 #ffd65c + HairCount=7；bloom 在球心、半径 16、α→0.7
    // 取证：playerhair_il.txt（AfterUpdate/Render）+ player_ctor_il.txt（Add 顺序）+ player_render_il.txt
    //   + hair_helpers_il.txt + player_updatehair_il.txt + player_cctor_il.txt（NormalHairColor="AC3232"）
    //   + feather_il.txt（starFlyColor="ffd65c"）；贴图像素用 decode_png.js 核过
    // 对页面里的 Madeline 不做任何交互（不驱动玩家、无变身）；shielded(泡泡) / singleUse 页面无 EntityData，未实现
    // 取证：.screenshots/.tmp/celeste-re/feather_il.txt（FlyFeather / Player.StarFly* / SlashFx）+ feather_collide.txt
    (function () {
        var scene = document.getElementById('dreamScene');
        var host = document.getElementById('dsFeathers');
        if (!scene || !host) return;
        var left = scene.querySelector('.ds-left');
        if (!left) return;

        // ---------- 素材 ----------
        function pad2(v) { return (v < 10 ? '0' : '') + v; }
        var SRC_F = 'Atlases/Gameplay/objects/flyFeather/';
        // Content/Graphics/Sprites.xml：
        //   <flyFeather path="objects/flyFeather/" start="loop">
        //     <Justify x="0.5" y="0.5"/>
        //     <Anim id="loop"  path="idle"  delay="0.06" frames="0-20" goto="flash"/>
        //     <Anim id="flash" path="flash" delay="0.06" frames="0-20" goto="loop"/>
        // → 42 帧一轮：idle 21 帧（呼吸渐暗）→ flash 21 帧（第 2-4 帧爆亮）→ 回 idle
        var FRAMES = [];
        (function () {
            for (var a = 0; a < 21; a++) FRAMES.push(SRC_F + 'idle' + pad2(a) + '.png');
            for (var b = 0; b < 21; b++) FRAMES.push(SRC_F + 'flash' + pad2(b) + '.png');
        })();
        var IMG = { frames: [], outline: null, feather: null, rect: null, smoke: null, slash: [] };
        function loadImg(src) { var im = new Image(); im.src = src; return im; }
        FRAMES.forEach(function (s) { IMG.frames.push(loadImg(s)); });
        IMG.outline = loadImg(SRC_F + 'outline.png');
        IMG.feather = loadImg('Atlases/Gameplay/particles/feather.png');    // P_Collect / P_Boost 的 Source
        // P_Flying（飞行拖尾）/ P_Respawn（重生）没有 Source，原作落的是 Draw.Particle = 1×1 纯白像素，
        // 不用贴图、直接 fillRect，所以这里不预载 rect.png / smoke0.png
        ['00', '01', '02', '03'].forEach(function (k) { IMG.slash.push(loadImg('Atlases/Gameplay/effects/slash/' + k + '.png')); });
        // 星飞时玩家本体的素材（Content/Graphics/Atlases/Gameplay/characters/player/）：
        //   Sprites.xml <Anim id="startStarFly" path="startStarFly" delay="0.08" goto="starFly"/> 4 帧
        //              <Loop id="starFly" path="starFly" delay="0.08"/> 只有 1 帧
        //              GetHairTexture：i==0 → bangs[HairFrame]（3 帧），i>0 → hair00（10×10）
        var SRC_P = 'Atlases/Gameplay/characters/player/';
        IMG.startFly0 = loadImg(SRC_P + 'startStarFly00.png');
        IMG.startFly1 = loadImg(SRC_P + 'startStarFly01.png');
        IMG.startFly2 = loadImg(SRC_P + 'startStarFly02.png');
        IMG.startFly3 = loadImg(SRC_P + 'startStarFly03.png');
        IMG.starFly = loadImg(SRC_P + 'starFly00.png');
        IMG.hair00 = loadImg(SRC_P + 'hair00.png');
        IMG.bangs0 = loadImg(SRC_P + 'bangs00.png');
        // Player::Render 的 startStarFly 专用叠加层：同形的白色剪影，按 starFlyColor*帧比例逐帧点亮
        IMG.startWhite0 = loadImg(SRC_P + 'startStarFlyWhite00.png');
        IMG.startWhite1 = loadImg(SRC_P + 'startStarFlyWhite01.png');
        IMG.startWhite2 = loadImg(SRC_P + 'startStarFlyWhite02.png');
        IMG.startWhite3 = loadImg(SRC_P + 'startStarFlyWhite03.png');

        // ---------- 数值（均取自 Celeste.dll IL / Sprites.xml） ----------
        var FRAME_MS = 60;             // <Anim delay="0.06"/>
        var FRAMES_HALF = 21;          // idle / flash 各 21 帧
        var RESPAWN_MS = 3000;         // respawnTimer = 3
        var FLY_TIME = 4;              // starFlyTimer：原作 2s，页面按手感延长到 4s（唯一非原作的时长）
        var WARN_TIME = 0.5;           // timer < 0.5 开始警告闪
        var WARN_STEP = 0.05;
        // StarFlyCoroutine：等 startStarFly 播完（Sprites.xml delay=0.08 × 4 帧 = 0.32s）
        //   → 等 Speed == Zero（1000/s 减速，早已达成）→ 再等 0.1s ⇒ 0.42s
        var CHARGE_ANIM = 0.32;        // 前 0.32s 仍是 startStarFly 的白色变形帧
        var CHARGE = CHARGE_ANIM + 0.1;
        var TURN_RATE = 5.5850534;     // RotateTowards(..., 5.5850534 * dt)
        var ACCEL = 1000;              // Approach(|Speed|, target, 1000 * dt)
        var V_START = 250, V_IDLE = 91, V_TURN = 140, V_FAST = 190;
        var SLASH_FRAME = 0.1, SLASH_LIFE = 0.4;   // SlashFx：<Anim delay="0.1" frames 0-3>
        // Player::OnCollideH / OnCollideV（State == StStarFly 分支）：
        //   starFlyTimer < 0.2 → Speed.axis = 0；否则 Speed.axis *= -0.5 + feather_state_bump
        var WALL_REST = 0.5, WALL_DEAD = 0.2;
        // 收集判定按矩形，不是圆形：FlyFeather.Hitbox(20,20,-10,-10) 对角 starFlyHitbox(8,8,-4,-10)。
        // 原位正弦只动 sprite、不动实体 Position ⇒ 判定框始终留在锚点上（点击检测也按锚点，不含浮动偏移）。
        var HIT_HW = 10, HIT_HH = 10;   // 羽毛 20×20 的半宽 / 半高（世界像素）
        var ORB_HALF = 4;               // starFlyHitbox 8×8 的半宽
        // FlyFeather..ctor：new SineWave(0.6f, 0).Randomize() → 0.6 Hz / ±2 世界像素 / 相位 [0,4π)
        var SINE_FREQ = 0.6, SINE_AMP = 2;
        // StarFlyUpdate 收尾：|Speed.X| 夹到 140；按住 ↑ 则 Speed.Y = -100；Speed.Y > 0 → 0
        var EXIT_X = 140, EXIT_UP = 100;
        // 四种提前结束把状态交回普通状态时的入口速度（Player::Jump / WallJump / ClimbBegin / StartDash）
        var JUMP_V = 105;               // JumpSpeed = -105（Jump / WallJump 共用）
        var JUMP_VX = 8;                // Jump 水平分量：Speed.X = 8 * Input.MoveX
        var WALLJUMP_VX = 108;          // WallJumpHSpeed = 108，方向背离墙
        var DASH_V = 240;               // DashSpeed = 240
        var GROUND_SNAP = 3;            // OnGround(3) / WallJumpCheck 的 3 世界像素窗口
        var EXIT_TTL = 0.35;           // 交回普通状态后余晖的存活时间（原作交给 gravity）
        var GRAV = 900, MAX_FALL = 160;    // Player 普通状态 gravity / maxFall
        // 像素倍率：场景其它美术都是 3 倍（篝火 64→~200px、Madeline 32→~100px），
        // 所以原图 32px 对应 CSS 96px；canvas 再按 devicePixelRatio 取整数倍，保证一个美术像素=整数设备像素
        var DPR = 1, SPR_S = 3, FSIZE = 96, PXF = 3;
        var GAP_MIN = 144, GAP_MAX = 288, GAP_FLOOR = 101;
        // ---- 星飞视觉常量（Player / PlayerHair / Sprites.xml 取证） ----
        var STAR_COLOR = '#ffd65c';    // Player::starFlyColor = HexToColor("ffd65c")
        var NORMAL_HAIR = '#ac3232';   // Player::NormalHairColor = HexToColor("AC3232")（.cctor）
        var STAR_WHITE = '#ffffff';    // 变形期与 0.32–0.42s 之间 Sprite.Color 仍是 Color.White
        var STAR_FRAME_MS = 80;        // <Anim path="startStarFly" delay="0.08"/>
        var HAIR_SEG = 3;              // AfterUpdate：|V2 - Nodes[i]| > 3 → 夹回 3 世界像素
        // StepPerSegment=(0,2) / StepInFacingPerSegment=0.5 只在 SimulateMotion=true 的 Approach 分支里用；
        // 星飞时 applyGravity=false → SimulateMotion=false，那两个值不参与计算
        var HAIR_N_MORPH = 4;          // 普通 PlayerSprite.HairCount = 4
        var HAIR_N_FLY = 7;            // 星飞时 PlayerSprite.HairCount = 7（0.42s 才切）
        var STAR_BLOOM_R = 16;         // starFlyBloom = BloomPoint(offset(0,-6), 0, 16)
        var STAR_R = 4;                // starFlyHitbox = Hitbox(8, 8, -4, -10) → 以球心为中心的 8×8，半宽 4

        // ---------- 粒子（Monocle ParticleSystem 的逐行移植；字段全部来自 ParticleTypes::Load 的 IL） ----------
        // P_Collect: Source=particles/feather, Color=FlyPowerHairColor(F2EB6D), Color2=fff20f,
        //            ColorMode=2, FadeMode=2, RotationMode=1(自转), Size=1, Life .6-.9, Speed 60-70,
        //            SpeedMultiplier .1, DirectionRange 2π, SpinFlippedChance=1, Spin 30°-80°
        // P_Boost  : new ParticleType(P_Collect){ DirectionRange 80°, Speed 20-80, SpeedMultiplier .2 }
        // P_Flying : **new ParticleType()，全篇没有设 Source** ⇒ ParticleType.Create 里
        //            `if (Source == null) Source = Draw.Particle`，而 Draw::.cctor 是
        //            `Draw.Particle = new MTexture(1, 1, 1, 1)` —— 一个 1×1 的纯白像素。
        //            ⇒ 飞行拖尾是**单像素金点**，不是 particles/rect(4×2)。这一条以前搞错了：
        //            按 rect 画，每个点变成 12×6 CSS px 的小方块排成一条带子，所以“散落粒子”看着不对。
        //            ColorMode=2, FadeMode=2, Size=1, Life .4-.8, Speed 60-70, mult .25, dirRange 60°
        // P_Respawn: new ParticleType(Refill.P_Regen){ Color ffdca4, Color2 ffe95e }；
        //            P_Regen = new ParticleType(Refill.P_Glow){ Speed 30-40, mult .2, dirRange 2π }；
        //            P_Glow 同样没有 Source ⇒ 也是单像素点，Life 继承 .4-.6、Size 1、ColorMode/FadeMode=2
        // 两个共同语义（Particle.Update，照 IL 抄）：
        //   ColorMode=2 → Color ⇄ Color2 按**剩余寿命**每 0.1s 交替（Calc.BetweenInterval(Life, .1)
        //                 = (Life % .2) > .1）
        //   FadeMode=2  → alpha = min(1, (Life/StartLife) / .25)：前 3/4 完全不透明，最后 1/4 才淡出
        var PT = {
            collect: { src: 'feather', col: ['#f2eb6d', '#fff20f'], colorMode: 2, fadeMode: 2, rotMode: 1, size: 1, sizeRange: 0, life: [0.6, 0.9], spd: [60, 70], mult: 0.1, dir: Math.PI * 2, spin: [0.5235988, 1.3962634], spinFlip: true },
            boost: { src: 'feather', col: ['#f2eb6d', '#fff20f'], colorMode: 2, fadeMode: 2, rotMode: 1, size: 1, sizeRange: 0, life: [0.6, 0.9], spd: [20, 80], mult: 0.2, dir: 1.3962634, spin: [0.5235988, 1.3962634], spinFlip: true },
            flying: { src: 'pixel', col: ['#f2eb6d', '#fff20f'], colorMode: 2, fadeMode: 2, rotMode: 0, size: 1, sizeRange: 0, life: [0.4, 0.8], spd: [60, 70], mult: 0.25, dir: 1.0471976, spin: [0, 0], spinFlip: false },
            respawn: { src: 'pixel', col: ['#ffdca4', '#ffe95e'], colorMode: 2, fadeMode: 2, rotMode: 0, size: 1, sizeRange: 0, life: [0.4, 0.6], spd: [30, 40], mult: 0.2, dir: Math.PI * 2, spin: [0, 0], spinFlip: false }
        };

        // ---------- 状态 ----------
        var active = false, raf = 0, prevT = 0, clock = 0;
        // CW/CH：.ds-left 的尺寸缓存（resizeCanvas 时更新）。原来 featherCenter / stepOrb 每帧都读
        // left.clientWidth/clientHeight，会让浏览器在每帧里强制同步布局（一帧最多 7 次），纯属白烧。
        // painted：上一帧画布是否还有内容（无粒子/光球时跳过每帧全画布 clearRect）。
        var CW = 1, CH = 1, painted = false;
        var feathers = [], placed = [], orb = null, parts = [], slashes = [], exits = [];
        var keys = {}, keysActive = false;
        var jumpEdge = false, dashEdge = false;   // Input.Jump.Pressed / Input.Dash.Pressed 边沿
        var ptr = null, ptrLast = null;    // 指针速度（≈ 原作的 player.Speed，决定 SlashFx 朝向）
        var cv = null, ctx2 = null, hint = null, shakeTimer = null;
        var starGlow = null, starGlowSize = 0;   // starFlyBloom 的柔光贴图（随 FSIZE 重建）
        var TINTS = {};
        var DIR_KEYS = { arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, w: 1, a: 1, s: 1, d: 1 };
        // 原作默认动作键：跳跃 Space/C、冲刺 X/K、抓墙 Shift/Z（只在飞行期拦截默认行为）
        var ACTION_KEYS = { ' ': 1, c: 1, x: 1, k: 1, shift: 1, z: 1 };

        // ---------- 小工具 ----------
        function approach(a, b, d) { return a < b ? Math.min(a + d, b) : Math.max(a - d, b); }
        function norm(x, y) { var l = Math.sqrt(x * x + y * y); return l > 0.0001 ? { x: x / l, y: y / l } : null; }
        function dot(a, b) { return a.x * b.x + a.y * b.y; }
        function rotateToward(from, to, step) {
            var a0 = Math.atan2(from.y, from.x), a1 = Math.atan2(to.y, to.x), d = a1 - a0;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) <= step) return { x: to.x, y: to.y };
            var a = a0 + (d > 0 ? step : -step);
            return { x: Math.cos(a), y: Math.sin(a) };
        }
        // 场景统一像素倍率：32px 原图铺成 ~96 CSS px；canvas 再按 dpr 取整数倍备份，避免美术像素被拉伸成 1/2px
        function updateSizes() {
            DPR = Math.max(1, window.devicePixelRatio || 1);
            SPR_S = Math.max(2, Math.round(96 * DPR / 32));
            FSIZE = 32 * SPR_S / DPR;
            PXF = FSIZE / 32;
            GAP_MIN = Math.round(FSIZE * 1.5);
            GAP_MAX = Math.round(FSIZE * 3);
            GAP_FLOOR = Math.round(FSIZE * 1.05);
        }
        function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
        function orbRadius() {
            // starFlyHitbox = Hitbox(8, 8, -4, -10)：以球心 (0,-6) 为中心的 8×8 ⇒ 碰墙半径 4 世界像素
            return STAR_R * PXF;
        }
        // Player::Render 的 startStarFlyWhite 叠加用：把 #rrggbb 整体乘一个系数（对应 XNA 的 Color * float）
        function scaleHex(hex, k) {
            var n = parseInt(hex.slice(1), 16);
            var r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        // 当前动画帧号（Sprites.xml：startStarFly delay=0.08 共 4 帧，之后 goto starFly 单帧）
        function starFrame(charge) { return Math.min(3, Math.floor(charge / (STAR_FRAME_MS / 1000))); }
        function featherCenter(f) {
            return { x: f.x / 100 * CW, y: f.y / 100 * CH };
        }
        // 原作的兜底：Calc.Angle(feather.Position - player.Center)——页面里就是睡着的 Madeline
        function madelineCenter() {
            var md = document.getElementById('dsMadeline');
            if (!md) return null;
            var a = md.getBoundingClientRect(), b = left.getBoundingClientRect();
            if (!a.width) return null;
            return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
        }
        // SlashFx.Burst 的朝向：原作取 Calc.Angle(playerSpeed)，速度为零才退化到"羽毛→玩家"
        function slashAngle(f, e) {
            if (ptr && nowMs() - ptr.t < 150) return Math.atan2(ptr.y, ptr.x);
            var fc = featherCenter(f), mc = madelineCenter();
            if (mc) return Math.atan2(fc.y - mc.y, fc.x - mc.x);
            return Math.atan2(e && e.movementY || 0, e && e.movementX || 0) || 0;
        }

        // ---------- 粒子 ----------
        // ParticleType.Create 逐条：
        //   位置 = ParticleSystem.Emit 的 Calc.Range(Random, pos - range, pos + range)（range 是**半宽**）
        //   Size：SizeRange 非 0 时 SizeRange 半宽随机，否则就是 Size
        //   方向 = direction - DirectionRange/2 + Random * DirectionRange；速度 = Range(SpeedMin, SpeedMax)
        //   RotationMode 1 → 随机初始角；2 → 取发射方向；0 → 0
        //   Spin = Range(SpinMin, SpinMax)，SpinFlippedChance 为真时再乘 Choose(Random, 1, -1)
        function emit(type, n, x, y, rangePx, baseAngle) {
            for (var k = 0; k < n; k++) {
                var sz = type.sizeRange
                    ? type.size - type.sizeRange * 0.5 + Math.random() * type.sizeRange
                    : type.size;
                var ang = baseAngle + (Math.random() - 0.5) * type.dir;
                var spd = (type.spd[0] + Math.random() * (type.spd[1] - type.spd[0])) * PXF;
                var rot = type.rotMode === 1 ? Math.random() * Math.PI * 2 : (type.rotMode === 2 ? ang : 0);
                var spin = type.spin[0] + Math.random() * (type.spin[1] - type.spin[0]);
                if (type.spinFlip && Math.random() < 0.5) spin = -spin;   // SpinFlippedChance=1 ⇒ 正负随机
                var life = type.life[0] + Math.random() * (type.life[1] - type.life[0]);
                parts.push({
                    t: type,
                    x: x + (Math.random() - 0.5) * 2 * rangePx,
                    y: y + (Math.random() - 0.5) * 2 * rangePx,
                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                    rot: rot, spin: spin, size: sz,
                    life: life, startLife: life, alpha: 1, col: type.col[0]
                });
            }
        }

        // ---------- 音效（celeste-sounds/feather/ 下的原作事件采样） ----------
        // 对应原作 FMOD 事件（FlyFeather / Player.StStarFly 里触发的那几个）：
        //   feather_get            FlyFeather::OnPlayer 首次收集（CollectRoutine）
        //   feather_renew          飞行中撞到另一根羽毛（StartStarFly 的 renew 分支）
        //   feather_reappear       FlyFeather::Respawn（3s 后回来）
        //   feather_state_warning  StarFlyUpdate：timer < 0.5 起响一次
        //   feather_state_end      StarFlyEnd（交回普通状态）
        //   feather_state_slow_loop / feather_state_fast_loop
        //                          飞行循环：同一个事件的 "faster" 参数在两条 12s 轨之间交叉淡化
        //   feather_state_bump     撞墙反弹——没采到这个事件，沿用原来的合成短音（音量压得很低）
        var SND_F = 'celeste-sounds/feather/';
        var ONESHOT = {
            get: 'feather_get', renew: 'feather_renew', reappear: 'feather_reappear',
            warn: 'feather_state_warning', end: 'feather_state_end'
        };
        var VOL = { get: 0.55, renew: 0.5, reappear: 0.5, warn: 0.45, end: 0.5 };
        var AC = null;
        function bumpSfx() {
            try {
                AC = AC || Sfx.ac();
                if (!AC) return;
                if (AC.state === 'suspended') AC.resume();
                var t0 = AC.currentTime, g = AC.createGain(), o = AC.createOscillator();
                o.connect(g); g.connect(AC.destination);
                g.gain.setValueAtTime(0.0001, t0);
                o.type = 'square';
                o.frequency.setValueAtTime(180, t0);
                o.frequency.exponentialRampToValueAtTime(96, t0 + 0.1);
                g.gain.linearRampToValueAtTime(0.05, t0 + 0.008);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
                o.start(t0); o.stop(t0 + 0.15);
            } catch (e) { /* 无声降级 */ }
        }
        function sfx(kind) {
            if (kind === 'bump') { bumpSfx(); return; }
            var n = ONESHOT[kind];
            if (n) Sfx.play(n, { dir: SND_F, volume: VOL[kind] });
        }
        // 飞行循环：两条等长的 12s 无缝轨同时起播（起点对齐 ⇒ 永远同相），只改 volume 做 slow→fast
        // 交叉淡化。淡化量 = |Speed| 归一到 [V_TURN, V_FAST]：闲置 91 → 0，巡航 140 → 0，急速 190 → 1。
        var LOOP_VOL = 0.30;
        var loops = null, loopRun = false, fadeTimer = 0;
        function ensureLoops() {
            if (loops) return loops;
            function mk(n) {
                var a = new Audio(SND_F + n);
                a.loop = true; a.preload = 'auto'; a.volume = 0;
                return a;
            }
            loops = { slow: mk('feather_state_slow_loop.wav'), fast: mk('feather_state_fast_loop.wav'), mix: -1 };
            return loops;
        }
        function startLoops() {
            var L = ensureLoops();
            if (loopRun) return;
            loopRun = true; L.mix = -1;
            clearInterval(fadeTimer); fadeTimer = 0;
            L.slow.currentTime = 0; L.fast.currentTime = 0;
            L.slow.volume = 0; L.fast.volume = 0;
            L.slow.play().catch(function () {});
            L.fast.play().catch(function () {});
            mixLoops(0);
        }
        function mixLoops(t) {
            var L = loops;
            if (!L || !loopRun) return;
            if (Math.abs(t - L.mix) < 0.03) return;      // 音量写太密没必要，0.03 一档
            L.mix = t;
            L.slow.volume = LOOP_VOL * (1 - t);
            L.fast.volume = LOOP_VOL * t;
        }
        function stopLoops() {
            var L = loops;
            if (!L || !loopRun) return;
            loopRun = false; L.mix = -1;
            clearInterval(fadeTimer);
            var v0s = L.slow.volume, v0f = L.fast.volume, t0 = nowMs();
            fadeTimer = setInterval(function () {        // 0.2s 淡出，直接 pause 会“啪”一声
                var k = 1 - (nowMs() - t0) / 200;
                if (k <= 0) {
                    clearInterval(fadeTimer); fadeTimer = 0;
                    L.slow.volume = 0; L.fast.volume = 0;
                    L.slow.pause(); L.fast.pause();
                    return;
                }
                L.slow.volume = v0s * k; L.fast.volume = v0f * k;
            }, 25);
        }
        // 进 dream 时把一次性音效建成实例（循环轨 12s 大文件，起播那刻再拉也够快，这里一并预热）
        function preheatSfx() {
            Sfx.preload(Object.keys(ONESHOT).map(function (k) { return ONESHOT[k]; }), { dir: SND_F });
            ensureLoops();
        }

        // ---------- 画布 / 提示 ----------
        function ensureCanvas() {
            if (cv) return;
            cv = document.createElement('canvas');
            cv.id = 'featherFlyCanvas';
            left.appendChild(cv);
            resizeCanvas();
        }
        function resizeCanvas() {
            if (!cv) return;
            CW = Math.max(1, left.clientWidth);
            CH = Math.max(1, left.clientHeight);
            cv.width = CW;
            cv.height = CH;
            ctx2 = cv.getContext('2d');
            ctx2.imageSmoothingEnabled = false;
            starGlowSize = 0;
            painted = false;       // 改画布尺寸本身就会清空
            TINTS = {};            // PXF 变了 → 染色/描边缓存全部作废
        }
        function showHint(on) {
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'featherFlyHint';
                hint.textContent = '方向键 / WASD 操控 · 空格跳 · Shift 抓 · X 冲刺 · Esc 让羽毛回来';
                scene.appendChild(hint);
            }
            hint.classList.toggle('show', !!on);
        }
        // level.Shake(0.3)：无参 = 随机抖（收集）；传方向 = DirectionalShake(dir, 0.3)（发射）
        function shake(dx, dy) {
            clearTimeout(shakeTimer);
            left.classList.remove('ff-shake');
            left.classList.remove('ff-shake-dir');
            void left.offsetWidth;
            if (dx || dy) {
                left.style.setProperty('--ffdx', (dx || 0).toFixed(3));
                left.style.setProperty('--ffdy', (dy || 0).toFixed(3));
                left.classList.add('ff-shake-dir');
            } else {
                left.classList.add('ff-shake');
            }
            shakeTimer = setTimeout(function () {
                left.classList.remove('ff-shake');
                left.classList.remove('ff-shake-dir');
            }, 380);
        }

        // ---------- 材质染色（particles/feather/rect/smoke0.png → ParticleType 的 Color / Color2） ----------
        function tintFor(tex, color) {
            var key = tex + color;
            if (TINTS[key]) return TINTS[key];
            var src = IMG[tex];
            if (!src || !src.naturalWidth) return null;
            var c = document.createElement('canvas');
            c.width = src.naturalWidth; c.height = src.naturalHeight;
            var g = c.getContext('2d');
            g.drawImage(src, 0, 0);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = color;
            g.fillRect(0, 0, c.width, c.height);
            TINTS[key] = c;
            return c;
        }
        // 原作的着色语义是 MTexture.Draw(pos, origin, color, scale) 里的 color —— 它是**乘法**，不是替换：
        //   hair00 是纯白贴图（乘什么就是什么）、bangs00 带 134,134,134 的灰高光、startStarFlyWhite 是白剪影。
        //   用 source-in 直接刷色会把高光抹平（刘海就变成一块死色），所以必须乘法；
        //   canvas 没有“乘色并保留 alpha”，所以 multiply 之后用 destination-in 把透明区裁回去。
        //   乘白 = 原图，直接返回省一次预烘。
        var WHITE_TAG = '#ffffff';
        function mulTint(tex, color) {
            var src = IMG[tex];
            if (!src || !src.naturalWidth) return null;
            if (color === WHITE_TAG) return src;
            var key = tex + '|m|' + color;
            if (TINTS[key]) return TINTS[key];
            var c = document.createElement('canvas');
            c.width = src.naturalWidth; c.height = src.naturalHeight;
            var g = c.getContext('2d');
            g.imageSmoothingEnabled = false;
            g.drawImage(src, 0, 0);
            g.globalCompositeOperation = 'multiply';
            g.fillStyle = color;
            g.fillRect(0, 0, c.width, c.height);
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(src, 0, 0);
            TINTS[key] = c;
            return c;
        }
        // starFlyBloom = BloomPoint(offset(0,-6), alpha 0, radius 16)；offset 就是球心
        function buildStarGlow() {
            starGlow = makeGlow(STAR_BLOOM_R * PXF);
            starGlowSize = FSIZE;
        }
        function makeGlow(r) {
            var c = document.createElement('canvas');
            c.width = c.height = Math.max(8, Math.round(r * 2));
            var g = c.getContext('2d');
            var rg = g.createRadialGradient(c.width / 2, c.height / 2, 1, c.width / 2, c.height / 2, c.width / 2);
            rg.addColorStop(0, 'rgba(255,248,214,.9)');
            rg.addColorStop(0.22, 'rgba(255,222,120,.52)');
            rg.addColorStop(0.55, 'rgba(242,235,109,.22)');
            rg.addColorStop(1, 'rgba(255,190,60,0)');
            g.fillStyle = rg;
            g.fillRect(0, 0, c.width, c.height);
            return c;
        }
        // ---------- 羽毛（FlyFeather） ----------
        function randPos(need, ignoreMax) {
            for (var t = 0; t < 300; t++) {
                var x = 4 + Math.random() * 66, y = 7 + Math.random() * 28, ok = true, near = Infinity;
                for (var k = 0; k < placed.length; k++) {
                    var dx = (x - placed[k].x) * innerWidth / 100;
                    var dy = (y - placed[k].y) * innerHeight / 100;
                    var d2 = dx * dx + dy * dy;
                    if (d2 < need * need) { ok = false; break; }
                    if (d2 < near * near) near = Math.sqrt(d2);
                }
                if (ok && (ignoreMax || !placed.length || near <= GAP_MAX)) return { x: x, y: y };
            }
            return null;
        }
        function applyScale(f) {
            f.sprS = SPR_S;
            f.cssPx = 32 * SPR_S / DPR;
            f.el.style.width = f.cssPx.toFixed(2) + 'px';
            f.el.style.height = f.cssPx.toFixed(2) + 'px';
            f.cvs.width = f.cvs.height = 32 * SPR_S;
            f.ctx = f.cvs.getContext('2d');
            f.ctx.imageSmoothingEnabled = false;
            f.drawn = -1;
        }
        function addFeather() {
            var need = GAP_MIN, p = null;
            while (need > GAP_FLOOR && !(p = randPos(need))) need = Math.round(need * 0.8);
            if (!p) p = randPos(GAP_FLOOR, true);
            if (!p) return;
            placed.push(p);
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'feather';
            b.title = '金羽毛 · 点一下';
            b.style.left = p.x.toFixed(2) + 'vw';
            b.style.top = p.y.toFixed(2) + 'vh';
            var cvs = document.createElement('canvas');
            b.appendChild(cvs);
            host.appendChild(b);
            var f = {
                el: b, cvs: cvs, ctx: null, sprS: SPR_S, cssPx: FSIZE,
                x: p.x, y: p.y,
                // SineWave.Randomize：counter = Random * 4π（不是 2π），0～2 个整周期的随机起点
                phase: Math.random() * Math.PI * 4,
                state: 'idle', respawnAt: 0, burstAt: 0, burstAng: 0,
                wigT: -1, wigDur: 1, wigFreq: 4, drawn: -1, tf: ''
            };
            applyScale(f);
            b.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onFeatherClick(f, e);
            });
            feathers.push(f);
            return f;
        }
        // sprite.Visible=true → 播 idle↔flash；收集后 sprite.Visible=false，只剩 outline（Sprite 组件，满不透明、不随 sine 浮动）
        function drawFeather(f, idx) {
            var c = f.ctx, size = 32 * f.sprS;
            c.clearRect(0, 0, size, size);
            var im = f.state === 'idle' ? IMG.frames[idx] : IMG.outline;
            if (im && im.naturalWidth) c.drawImage(im, 0, 0, size, size);
        }
        // FlyFeather.Hitbox(20,20,-10,-10) 的点击判定：以羽毛锚点为中心 ±10 世界像素的正方形。
        // sprite 本身 32×32（外圈只是美术），正弦浮动也只改 sprite 的 translateY ⇒ 判定框固定在锚点。
        function inCollectBox(f, e) {
            var b = left.getBoundingClientRect(), fc = featherCenter(f);
            return Math.abs(e.clientX - b.left - fc.x) <= HIT_HW * PXF &&
                   Math.abs(e.clientY - b.top - fc.y) <= HIT_HH * PXF;
        }
        function onFeatherClick(f, e) {
            if (!active || f.state !== 'idle' || orb) return;
            if (!inCollectBox(f, e)) return;
            startStarFly(f, e);
        }
        // FlyFeather::OnPlayer → CollectRoutine（两击共用同一条协程）：
        //   Level.Shake(0.3) → sprite.Visible=false → yield 0.05s → Emit(P_Collect,10,Pos,One*6) + SlashFx.Burst
        //   飞行中撞到另一根羽毛也走这里（StartStarFly 的 renew 分支只把 timer 回满 + 把 Sprite.Color 改回 starFlyColor）
        function collect(f, renew, ang) {
            shake();                                     // level.Shake(0.3)
            f.state = 'wait';
            f.el.classList.add('wait');                  // sprite.Visible=false → light.Alpha 于 0.25s 内淡到 0
            f.drawn = -1;
            f.burstAt = nowMs() + 50;                    // yield return 0.05f
            f.burstAng = ang;
            f.respawnAt = nowMs() + RESPAWN_MS;          // respawnTimer = 3（singleUse 才跳过）
            sfx(renew ? 'renew' : 'get');
        }
        function stepFeathers(dt) {
            var idx = Math.floor(clock / FRAME_MS) % FRAMES.length;
            for (var k = 0; k < feathers.length; k++) {
                var f = feathers[k];
                if (f.burstAt && clock >= f.burstAt) {
                    f.burstAt = 0;
                    var bc = featherCenter(f);
                    emit(PT.collect, 10, bc.x, bc.y, 6 * PXF, 0);              // Emit(P_Collect, 10, Pos, One*6)
                    slashes.push({ x: bc.x, y: bc.y, ang: f.burstAng, t: 0 });  // SlashFx.Burst(Pos, angle)
                }
                if (f.state === 'wait' && clock >= f.respawnAt) {
                    // Respawn：outline.Visible=false / Collidable=true / sprite.Visible=true / wiggler.Start() / P_Respawn×16
                    f.state = 'idle';
                    f.el.classList.remove('wait');
                    f.wigT = 0; f.wigDur = 1; f.wigFreq = 4;
                    f.drawn = -1;
                    var rc = featherCenter(f);
                    emit(PT.respawn, 16, rc.x, rc.y, 2 * PXF, 0);
                    sfx('reappear');
                }
                if (f.state === 'idle') {
                    if (f.drawn !== idx) { drawFeather(f, idx); f.drawn = idx; }
                } else if (f.drawn !== -2) {          // outline 只在状态切换时重画一次
                    drawFeather(f, idx); f.drawn = -2;
                }
                // UpdateY：sprite.Y = SineWave.Value * 2（SineWave.Value = sin(counter) ∈ [-1,1] → ±2 世界像素）
                // counter = 2π * 0.6 * t + φ，φ 来自 Randomize 的 [0,4π)；只动 sprite，判定框不动
                var bob = f.state === 'idle'
                    ? Math.round(Math.sin(clock * 0.001 * Math.PI * 2 * SINE_FREQ + f.phase) * SINE_AMP * PXF)
                    : 0;
                // wiggler.MoveNext：Value = cos(sineCounter) * Counter，Counter 从 1 线性衰减到 0
                // → Scale = One * (1 + Value * 0.2)，重生瞬间是 1.2 倍，随后带余弦抖动收回
                var sc = 1;
                if (f.wigT >= 0) {
                    f.wigT += dt;
                    if (f.wigT >= f.wigDur) f.wigT = -1;
                    else sc = 1 + 0.2 * Math.cos(f.wigT * Math.PI * 2 * f.wigFreq) * (1 - f.wigT / f.wigDur);
                }
                // 上下浮动 ±2 世界像素只有 13 个整数档位（bob 已 round），稳定态下绝大多数帧算出来的是同一个
                // transform；只在字符串真的变了才写 style，省掉每帧 6 次样式失效 + 合成器更新
                var tf = 'translate(-50%,-50%)' +
                    (bob ? ' translateY(' + bob + 'px)' : '') +
                    (sc !== 1 ? ' scale(' + sc.toFixed(3) + ')' : '');
                if (tf !== f.tf) { f.tf = tf; f.el.style.transform = tf; }
            }
        }

        // ---------- 星飞光球（Player::StStarFly 逐行移植） ----------
        // StartStarFly → StateMachine.State = 19；StarFlyBegin 里 timer=FLY_TIME / Bloom(0,-6,r16,α→0.7)；
        // 变形期由 StarFlyCoroutine 卡住：startStarFly 播完（4×0.08）=0.32s → Speed 已归零 → 再等 0.1s
        function startStarFly(f, e) {
            // 收起按钮焦点：否则飞行结束后再按 Space，浏览器会把它当成按钮的默认激活 → 又收集一次
            if (f.el.blur) f.el.blur();
            var c = featherCenter(f);
            var ax = axisX(), ay = axisY();
            var l = Math.sqrt(ax * ax + ay * ay);
            // 无输入 → UnitX * Facing（页面没有朝向，取 +x）
            var dir = l ? { x: ax / l, y: ay / l } : { x: 1, y: 0 };
            orb = {
                x: c.x, y: c.y, mx: dir.x, my: dir.y, last: dir,
                len: 0, lerp: 0, glow: 0,
                charge: 0, timer: FLY_TIME, emitT: 0,
                warnT: 0, flash: false, warned: false,
                hair: [], hairCount: HAIR_N_MORPH
            };
            // PlayerHair.Start：所有 node 一次性设成 Position + (-Facing*200, 200)（左下方）。
            // 紧接着 AfterUpdate 的 |V2-Nodes[i]|>3 夹取会在同一帧把整条链摄成 3 世界像素/节，
            // 方向就是「从左下指向头部」——所以预铺时直接按这个方向摆链，省两帧乱动。
            var bx = -Math.SQRT1_2, by = Math.SQRT1_2;
            for (var hi = 0; hi < HAIR_N_FLY; hi++) {
                orb.hair.push({ x: c.x + bx * hi * HAIR_SEG * PXF, y: c.y - 5 * PXF + by * hi * HAIR_SEG * PXF });
            }
            collect(f, false, slashAngle(f, e));         // 同一个协程：Shake → 隐藏 → 0.05s → 粒子 + SlashFx
            showHint(true);
            bindActive(true);
            ensureCanvas();
        }
        // PlayerHair::AfterUpdate 在星飞状态下的化简（SimulateMotion=false / StepYSinePerSegment=0 / Scale=1）：
        //   Nodes[0] = Sprite.RenderPosition + (0,-9*Scale.Y) + HairOffset*(Facing,1)
        //     RenderPosition 就是 Player.Position（脚底），所以 starFly 的 HairOffset=(0,3) ⇒ 发根 = 球心；
        //     startStarFly 的 HairOffset=(0,-2) ⇒ 发根在球心上 5 世界像素
        //   SimulateMotion=false（UpdateHair: State==19 → applyGravity=false）⇒ 不进
        //     Nodes[i] = Approach(Nodes[i], V1, ...) 那一支，只剩 |V2 - Nodes[i]| > 3 夹回 3 世界像素。
        //     于是飞行时 Node0 每帧把链条往外拽一截、超出 3 就夹回来 ⇒ 自然拉成一条直线拖尾。
        function stepHair(o) {
            if (!o.hair.length) return;
            var seg = HAIR_SEG * PXF;
            var ay = (o.charge < CHARGE_ANIM) ? o.y - 5 * PXF : o.y;
            var head = o.hair[0];
            head.x = o.x; head.y = ay;
            var px = o.x, py = ay;
            for (var i = 1; i < o.hair.length; i++) {
                var nd = o.hair[i];
                var dx = nd.x - px, dy = nd.y - py, d = Math.sqrt(dx * dx + dy * dy);
                if (d > seg) { nd.x = px + dx / d * seg; nd.y = py + dy / d * seg; }
                px = nd.x; py = nd.y;
            }
        }
        function stepOrb(dt) {
            if (!orb) { jumpEdge = dashEdge = false; return; }
            var o = orb;
            // Input.Jump.Pressed / Input.Dash.Pressed 都是边沿：本帧读走就清；变形期不进入 StarFlyUpdate
            var jumpPressed = jumpEdge, dashPressed = dashEdge;
            jumpEdge = dashEdge = false;
            o.glow = approach(o.glow, 0.7, dt * 2);       // starFlyBloom.Alpha = Approach(..., 0.7, 2*dt)

            if (o.charge < CHARGE) {
                // starFlyTransforming：Speed = Approach(Speed, Zero, 1000 * dt)
                o.charge += dt;
                o.len = approach(o.len, 0, ACCEL * PXF * dt);
                if (o.charge >= CHARGE) {
                    // 协程尾部才读 Input.Feather ⇒ 变形期（0.42s）里按住的方向才是发射方向
                    var d0 = inputDir() || o.last;
                    o.mx = d0.x; o.my = d0.y; o.last = d0;
                    o.len = V_START * PXF;                // Speed = dir * 250
                    o.timer = FLY_TIME;
                    o.flash = false; o.warnT = 0; o.warned = false;
                    o.hairCount = HAIR_N_FLY;             // Sprite.HairCount = 7（与变金色同一时刻）
                    emit(PT.boost, 12, o.x, o.y, 4 * PXF, Math.atan2(-o.my, -o.mx));
                    shake(o.mx, o.my);                    // level.DirectionalShake(starFlyLastDir, 0.3)
                    startLoops();                         // feather_state_*_loop：变形结束才起循环
                }
                stepHair(o);
                return;
            }

            // Input.Feather：无输入 → 沿用上一次朝向（dir = starFlyLastDir）
            var dir = inputDir();
            var idle = !dir;
            if (idle) dir = o.last;
            // moveDir = RotateTowards(moveDir, dir, 5.5850534 * dt)
            var m = norm(o.mx, o.my);
            m = m ? rotateToward(m, dir, TURN_RATE * dt) : dir;
            o.mx = m.x; o.my = m.y; o.last = m;

            // Dot(moveDir, dir) < 0.45 → 掉头，目标速度回到 140 并清空 lerp
            var target;
            if (idle) { o.lerp = 0; target = V_IDLE; }
            else if (dot(m, dir) >= 0.45) { o.lerp = approach(o.lerp, 1, dt); target = V_TURN + (V_FAST - V_TURN) * o.lerp; }
            else { o.lerp = 0; target = V_TURN; }

            o.len = approach(o.len, target * PXF, ACCEL * PXF * dt);   // Approach(|Speed|, target, 1000 * dt)
            // 循环轨的 "faster" 参数：V_TURN 以下全 slow（闲置 91 / 掉头 140），V_FAST 全 fast
            mixLoops(Math.min(1, Math.max(0, (o.len / PXF - V_TURN) / (V_FAST - V_TURN))));
            o.x += o.mx * o.len * dt;
            o.y += o.my * o.len * dt;

            // 房间边界（左屏 = 游戏房间）：OnCollideH / OnCollideV 的 StStarFly 分支
            var w = CW, h = CH, R = orbRadius();
            var hx = false, hy = false;
            if (o.x < R) { o.x = R; hx = true; }
            else if (o.x > w - R) { o.x = w - R; hx = true; }
            if (o.y < R) { o.y = R; hy = true; }
            else if (o.y > h - R) { o.y = h - R; hy = true; }
            if (hx || hy) {
                var vx = o.mx * o.len, vy = o.my * o.len;
                if (o.timer < WALL_DEAD) {                 // 快结束时贴墙：Speed.axis = 0，不反弹
                    if (hx) vx = 0;
                    if (hy) vy = 0;
                } else {                                   // Speed.axis *= -0.5 + feather_state_bump
                    if (hx) vx *= -WALL_REST;
                    if (hy) vy *= -WALL_REST;
                    sfx('bump');
                }
                o.len = Math.sqrt(vx * vx + vy * vy);
                if (o.len > 0.001) { o.mx = vx / o.len; o.my = vy / o.len; }
                else { o.mx = 0; o.my = 0; }               // SafeNormalize → Zero，下帧重取输入朝向
            }

            // StarFlyUpdate 的四条提前结束（Player.cs:4760-4808），按原作顺序判定：
            //   1) Jump.Pressed + OnGround(3)       → Jump
            //   2) Jump.Pressed + WallJumpCheck(±1) → WallJump
            //   3) Grab.Check + ClimbCheck(±1)     → 抓墙
            //   4) CanDash                          → StartDash
            // 撞墙本身只反弹（上面已处理），不结束飞行。
            // 页面没有实心块 ⇒ 左屏下边界当地面、左右边界当可抓/可蹬的墙。
            var gnd = o.y >= h - R - GROUND_SNAP * PXF;
            var wall = o.x <= R + GROUND_SNAP * PXF ? -1 : (o.x >= w - R - GROUND_SNAP * PXF ? 1 : 0);
            if (jumpPressed && gnd) { endFly(false, 'jump'); return; }
            if (jumpPressed && wall) { endFly(false, 'walljump', wall); return; }
            if ((keys.shift || keys.z) && wall) { endFly(false, 'grab'); return; }
            if (dashPressed) { endFly(false, 'dash'); return; }

            // Scene.OnInterval(0.02) → Emit(P_Flying, 1, Center, One*2, Angle(-Speed))
            o.emitT += dt;
            while (o.emitT >= 0.02) {
                o.emitT -= 0.02;
                emit(PT.flying, 1, o.x, o.y, 2 * PXF, Math.atan2(-o.my, -o.mx));
            }
            // 头发拖尾（原作没有“彗星残影”，方向感全靠这条硬链）
            stepHair(o);

            // starFlyTimer -= DeltaTime；末 0.5s 每 0.05s 在 starFlyColor ⇄ NormalHairColor 间闪
            o.timer -= dt;
            if (o.timer < WARN_TIME) {
                if (!o.warned) { o.warned = true; sfx('warn'); }   // feather_state_warning（< 0.5s 时响起）
                o.warnT += dt;
                if (o.warnT >= WARN_STEP) { o.warnT = 0; o.flash = !o.flash; }
            }
            if (o.timer <= 0) { endFly(false); return; }

            // 飞行中碰到别的羽毛 → StartStarFly 的 renew 分支：timer 回满 + 清掉警告闪，
            // 然后照样走 CollectRoutine（羽毛隐没、3s 后重生）
            for (var k = 0; k < feathers.length; k++) {
                var f = feathers[k];
                if (f.state !== 'idle') continue;
                var fc = featherCenter(f);
                // 同一套 Hitbox 判定：20×20 羽毛盒 vs 8×8 starFlyHitbox ⇒ 半宽 10+4、半高 10+4 的矩形重叠
                if (Math.abs(fc.x - o.x) > (HIT_HW + ORB_HALF) * PXF ||
                    Math.abs(fc.y - o.y) > (HIT_HH + ORB_HALF) * PXF) continue;
                o.timer = FLY_TIME; o.flash = false; o.warnT = 0; o.warned = false;
                collect(f, true, Math.atan2(o.my, o.mx));   // 原作此处 playerSpeed = 当前飞行 Speed
            }
        }
        // StarFlyEnd：P_Boost ×12 + 交回普通状态。
        // 计时到 / Esc：原作在此处夹取 Speed（|Speed.X|≤140、按住 ↑ 则 Speed.Y=-100、向下速度归零）。
        // 四种提前结束则由各自入口给速度（Player.cs:4760-4808）：
        //   jump     Player::Jump      → Speed = (8*MoveX, -105)
        //   walljump Player::WallJump  → Speed = (-墙侧*108, -105)
        //   grab     Player::ClimbBegin→ Speed = Zero（贴墙抓住）
        //   dash     Player::StartDash → Speed = DashDir * 240
        // 随后由 gravity 接管——页面里用一段带重力的余晖把“被抛出去”读出来。
        function endFly(silent, mode, wallDir) {
            var ax = axisX(), ay = axisY(), din = inputDir();   // 必须在 bindActive(false) 清空 keys 之前读
            bindActive(false);
            showHint(false);
            stopLoops();               // 飞行循环 0.2s 淡出（silent 的 exitDream 也要停）
            jumpEdge = dashEdge = false;
            if (!orb) return;
            var o = orb;
            orb = null;
            if (silent) return;
            var vx = o.mx * o.len, vy = o.my * o.len;
            if (mode === 'jump') {
                vx = ax * JUMP_VX * PXF; vy = -JUMP_V * PXF;
            } else if (mode === 'walljump') {
                vx = -wallDir * WALLJUMP_VX * PXF; vy = -JUMP_V * PXF;
            } else if (mode === 'grab') {
                vx = 0; vy = 0;
            } else if (mode === 'dash') {
                // Input.GetDashVector()：有方向输入就取八向；没有就 UnitX * Facing（页面用水平速度方向当朝向）
                var dd = din || { x: o.mx < 0 ? -1 : 1, y: 0 };
                vx = dd.x * DASH_V * PXF; vy = dd.y * DASH_V * PXF;
            } else {
                if (ay === -1) vy = -EXIT_UP * PXF;                  // Input.MoveY == -1
                if (vy > 0) vy = 0;                                  // Speed.Y > 0 → 0
                if (Math.abs(vx) > EXIT_X * PXF) vx = (vx < 0 ? -1 : 1) * EXIT_X * PXF;
            }
            emit(PT.boost, 12, o.x, o.y, 4 * PXF, Math.atan2(-o.my, -o.mx));   // Angle(-Speed)
            exits.push({ x: o.x, y: o.y, vx: vx, vy: vy, t: 0, ttl: EXIT_TTL });
            sfx('end');
        }
        function stepFx(dt) {
            // Particle.Update（IL）：t = Life/StartLife → Life -= dt → 旋转 → FadeMode/ColorMode
            //   → Position += Speed*dt → Speed *= SpeedMultiplier^dt
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i], ty = p.t;
                var t = p.life / p.startLife;              // 注意：比例用的是**减之前**的 Life
                p.life -= dt;
                if (p.life <= 0) { parts.splice(i, 1); continue; }
                if (ty.rotMode === 2) {                    // SameAsDirection
                    if (p.vx || p.vy) p.rot = Math.atan2(p.vy, p.vx);
                } else {
                    p.rot += p.spin * dt;
                }
                p.alpha = 1;
                if (ty.fadeMode === 1) p.alpha = t;
                else if (ty.fadeMode === 2) p.alpha = Math.min(1, t / 0.25);
                else if (ty.fadeMode === 3) p.alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : (t < 0.25 ? t / 0.25 : 1);
                // ColorMode=2（Flicker）：Calc.BetweenInterval(Life, .1) = (Life % .2) > .1
                p.col = (ty.colorMode === 2 && (p.life % 0.2) <= 0.1) ? ty.col[1] : ty.col[0];
                p.x += p.vx * dt; p.y += p.vy * dt;
                var drag = Math.pow(ty.mult, dt);          // SpeedMultiplier：每秒按此系数衰减
                p.vx *= drag; p.vy *= drag;
            }
            for (var j = slashes.length - 1; j >= 0; j--) {
                var sl = slashes[j];
                sl.t += dt;
                if (sl.t >= SLASH_LIFE) { slashes.splice(j, 1); continue; }
                // SlashFx.Update：Position += AngleToVector(angle, 1) * 8 * dt
                sl.x += Math.cos(sl.ang) * 8 * PXF * dt;
                sl.y += Math.sin(sl.ang) * 8 * PXF * dt;
            }
            // StarFlyEnd 之后的余晖：Speed 已被夹取，此处只交给 gravity（Player 普通状态）
            for (var x = exits.length - 1; x >= 0; x--) {
                var ex = exits[x];
                ex.t += dt;
                if (ex.t >= ex.ttl) { exits.splice(x, 1); continue; }
                ex.vy = Math.min(ex.vy + GRAV * PXF * dt, MAX_FALL * PXF);
                ex.x += ex.vx * dt;
                ex.y += ex.vy * dt;
            }
            if (parts.length > 400) parts.splice(0, parts.length - 400);
        }

        // ---------- 渲染 ----------
        // 层级严格照 Player 的组件顺序：Hair 先 Add（ctor @01bd）⇒ Hair.Render 先跑，Sprite 后 Add（@01c9）。
        // 底到顶 = 精灵黑边×4（在 Hair.Render 开头）→ 头发描边趟 → 头发本体趟 → 精灵本体 → startStarFlyWhite 叠加。
        // Sprites.xml Justify(0.5,1) ⇒ origin=(16,32)；球心 = Player.Position + (0,-6)
        // ⇒ 32×32 贴图左上角 = 球心 + (-16,-26) 世界像素。
        function drawSprite(x, y, tex, color, alpha) {
            var src = mulTint(tex, color);
            if (!src || alpha <= 0) return;
            var w = 32 * PXF;
            ctx2.globalAlpha = alpha;
            ctx2.drawImage(src, Math.round(x - 16 * PXF), Math.round(y - 26 * PXF), w, w);
            ctx2.globalAlpha = 1;
        }
        // DrawPlayerSpriteOutline：Sprite.Color = Border(=Black)*Alpha，Position 依次 ±(0,1)/±(1,0) 再 Render 一次
        function drawSpriteOutline(x, y, tex, alpha) {
            var black = mulTint(tex, '#000000');
            if (!black || alpha <= 0) return;
            var w = 32 * PXF, pad = Math.round(PXF);
            var l = Math.round(x - 16 * PXF), t = Math.round(y - 26 * PXF);
            ctx2.globalAlpha = alpha;
            ctx2.drawImage(black, l, t - pad, w, w);        // ( 0,-1)
            ctx2.drawImage(black, l, t + pad, w, w);        // ( 0, 1)
            ctx2.drawImage(black, l - pad, t, w, w);        // (-1, 0)
            ctx2.drawImage(black, l + pad, t, w, w);        // ( 1, 0)
            ctx2.globalAlpha = 1;
        }
        // 余晖（已交回普通状态）：留一层带黑边的金色精灵淡出
        function drawStar(x, y, tex, color, alpha) {
            drawSpriteOutline(x, y, tex, alpha);
            drawSprite(x, y, tex, color, alpha);
        }
        // PlayerHair.Render 原序（两趟不能合）：先 i=0→n-1 把每节描边全画完，再 i=n-1→0 画本体（梢先根后）。
        // 合成一节一节画的话，后一节的黑边会压住前一节的本体，拖尾上会冒出一圈圈黑色分节缝。
        // 描边偏移恒为 1 世界像素（IL 是 Nodes[i] + (±1,0)/(0,±1)，不经 GetHairScale），缩放只作用在贴图尺寸上。
        // i==0 的 GetHairTexture 是 bangs[HairFrame]；星飞状态不会调 UpdateHairFrame，页面取 bangs00。
        function drawHair(o, color, alpha) {
            var n = Math.min(o.hairCount, o.hair.length), i, nd, s, body, black;
            var pad = Math.round(PXF);
            for (i = 0; i < n; i++) {
                black = mulTint(i === 0 ? 'bangs0' : 'hair00', '#000000');
                if (!black) continue;
                nd = o.hair[i];
                s = 10 * (0.25 + (1 - i / n) * 0.75) * PXF;    // GetHairScale：10×10 贴图 × 0.357…1.0
                var bx = Math.round(nd.x - s / 2), by = Math.round(nd.y - s / 2);
                ctx2.globalAlpha = alpha;
                ctx2.drawImage(black, bx - pad, by, s, s);
                ctx2.drawImage(black, bx + pad, by, s, s);
                ctx2.drawImage(black, bx, by - pad, s, s);
                ctx2.drawImage(black, bx, by + pad, s, s);
            }
            for (i = n - 1; i >= 0; i--) {
                body = mulTint(i === 0 ? 'bangs0' : 'hair00', color);
                if (!body) continue;
                nd = o.hair[i];
                s = 10 * (0.25 + (1 - i / n) * 0.75) * PXF;
                ctx2.globalAlpha = alpha;
                ctx2.drawImage(body, Math.round(nd.x - s / 2), Math.round(nd.y - s / 2), s, s);
            }
            ctx2.globalAlpha = 1;
        }
        function drawOrb(o) {
            // 两个不同步的门槛：0–0.32s 才是 startStarFly 动画；Sprite.Color 的白色一直到 0.42s
            var anim = o.charge < CHARGE_ANIM;
            var morph = o.charge < CHARGE;
            var tex = anim ? 'startFly' + starFrame(o.charge) : 'starFly';
            var col = morph ? STAR_WHITE : (o.flash ? NORMAL_HAIR : STAR_COLOR);
            drawSpriteOutline(o.x, o.y, tex, 1);       // (1) 精灵黑边 ×4：压在最底
            drawHair(o, col, 1);                       // (2)(3) 头发两趟：被本体压住，只从球体边缘露出来
            drawSprite(o.x, o.y, tex, col, 1);         // (4) 精灵本体（startStarFly 是本色贴图，乘 White = 原样）
            if (anim) {                                // (5) startStarFlyWhite 叠加：颜色 = starFlyColor * (帧/4)
                // XNA 的 Color * float 是连 A 一起乘，SpriteBatch 又按预乘混合
                // ⇒ 屏幕上看到的等效值是「starFlyColor×t 的颜色」+ 「t 的不透明度」
                var fr = starFrame(o.charge), t = fr / 4;
                drawSprite(o.x, o.y, 'startWhite' + fr, scaleHex(STAR_COLOR, t), t);
            }
            // (6) starFlyBloom = BloomPoint(offset(0,-6), 0→0.7, r16)：Monocle 的 bloom 是 Level
            //     把所有实体画完之后再 Additive 叠上去，所以放最后、用 lighter，球体自己被点亮
            if (starGlowSize !== FSIZE) buildStarGlow();
            if (starGlow && o.glow > 0.02) {
                ctx2.globalCompositeOperation = 'lighter';
                ctx2.globalAlpha = o.glow * 0.55;
                ctx2.drawImage(starGlow, Math.round(o.x - starGlow.width / 2), Math.round(o.y - starGlow.height / 2));
                ctx2.globalCompositeOperation = 'source-over';
                ctx2.globalAlpha = 1;
            }
        }
        function drawFrame() {
            if (!ctx2) return;
            // 没粒子 / 余晖 / 刀光 / 光球时整帧没有内容，只要上一帧已经清空过就不必再 clearRect
            var busy = !!orb || parts.length > 0 || slashes.length > 0 || exits.length > 0;
            if (!busy && !painted) return;
            painted = busy;
            ctx2.clearRect(0, 0, CW, CH);

            // 1) 星飞结束后的余晖（原作交回普通状态：Speed 夹取 → gravity；这里用金色精灵淡出收尾）
            for (var q2 = 0; q2 < exits.length; q2++) {
                var exi = exits[q2], ea = 1 - exi.t / exi.ttl;
                drawStar(exi.x, exi.y, 'starFly', STAR_COLOR, ea * ea);
            }
            // 2) 粒子（Particle.Render 是“先截断成整数世界像素，再按原点=贴图中心、scale=Size 画”）
            //    P_Flying / P_Respawn 的源是 Draw.Particle（1×1）⇒ 一个世界像素的方块：PXF×PXF
            //    P_Collect / P_Boost 的源是 particles/feather（5×3）⇒ 自转后按 Size=1 画原大
            for (var k = 0; k < parts.length; k++) {
                var p = parts[k], a = p.alpha;
                if (a <= 0.004) continue;
                var wx = Math.round(p.x / PXF) * PXF;     // (int)Position.X
                ctx2.globalAlpha = a;
                if (p.t.src === 'pixel') {
                    var side = Math.max(1, Math.round(p.size)) * PXF;
                    ctx2.fillStyle = p.col;
                    ctx2.fillRect(wx, Math.round(p.y / PXF) * PXF, side, side);
                    continue;
                }
                var tex = tintFor(p.t.src, p.col);
                if (!tex) continue;
                var dw = tex.width * p.size * PXF, dh = tex.height * p.size * PXF;
                if (p.t.rotMode) {
                    ctx2.save();
                    ctx2.translate(wx, Math.round(p.y / PXF) * PXF);
                    ctx2.rotate(p.rot);
                    ctx2.drawImage(tex, -dw / 2, -dh / 2, dw, dh);
                    ctx2.restore();
                } else {
                    ctx2.drawImage(tex, wx - dw / 2, Math.round(p.y / PXF) * PXF - dh / 2, dw, dh);
                }
            }
            ctx2.globalAlpha = 1;

            // 3) SlashFx（4 帧 × 0.1s；|angle-π|<=0.01 时不旋转，其余按玩家速度角度转）
            for (var s = 0; s < slashes.length; s++) {
                var sl = slashes[s];
                var im = IMG.slash[Math.min(3, Math.floor(sl.t / SLASH_FRAME))];
                if (!im || !im.naturalWidth) continue;
                var sw = im.width * PXF, sh = im.height * PXF;
                ctx2.save();
                ctx2.translate(sl.x, sl.y);
                if (Math.abs(sl.ang - Math.PI) > 0.01) ctx2.rotate(sl.ang);
                ctx2.drawImage(im, -sw / 2, -sh / 2, sw, sh);
                ctx2.restore();
            }

            // 4) 光球本体
            if (orb) drawOrb(orb);
            ctx2.globalAlpha = 1;
        }

        // ---------- 主循环 ----------
        function startLoop() { if (!raf) { prevT = 0; raf = requestAnimationFrame(tick); } }
        function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
        function tick(t) {
            if (!active) { raf = 0; return; }
            var dt = prevT ? Math.min(0.05, Math.max(0.001, (t - prevT) / 1000)) : 0.016;
            prevT = t;
            clock = t;
            stepFeathers(dt);
            stepOrb(dt);
            stepFx(dt);
            drawFrame();
            raf = requestAnimationFrame(tick);
        }

        // ---------- 键位（飞行中才拦截 Esc / 方向键默认行为） ----------
        function onKeyDown(e) {
            var k = (e.key || '').toLowerCase();
            if (k === 'escape') { e.preventDefault(); e.stopPropagation(); endFly(false); return; }
            if (e.repeat) return;
            if (DIR_KEYS[k]) { keys[k] = true; e.preventDefault(); e.stopPropagation(); }
            else if (ACTION_KEYS[k]) {
                keys[k] = true;
                if (k === ' ' || k === 'c') jumpEdge = true;      // Input.Jump.Pressed
                if (k === 'x' || k === 'k') dashEdge = true;       // Input.Dash.Pressed
                e.preventDefault(); e.stopPropagation();           // Space 默认滚页 / 会触发聚焦按钮
            }
        }
        function onKeyUp(e) {
            var k = (e.key || '').toLowerCase();
            if (DIR_KEYS[k] || ACTION_KEYS[k]) keys[k] = false;
        }
        function bindActive(on) {
            if (on === keysActive) return;
            keysActive = on;
            if (on) {
                document.addEventListener('keydown', onKeyDown, true);
                document.addEventListener('keyup', onKeyUp, true);
            } else {
                document.removeEventListener('keydown', onKeyDown, true);
                document.removeEventListener('keyup', onKeyUp, true);
                keys = {};
            }
        }
        function onTrack(e) { var k = (e.key || '').toLowerCase(); if (DIR_KEYS[k]) keys[k] = true; }
        function onTrackUp(e) { var k = (e.key || '').toLowerCase(); if (DIR_KEYS[k]) keys[k] = false; }
        // 指针速度 ≈ 原作 player.Speed：收集瞬间的 SlashFx 就朝这个方向
        function onPointer(e) {
            var t = nowMs();
            if (ptrLast && t - ptrLast.t < 150) {
                var dx = e.clientX - ptrLast.x, dy = e.clientY - ptrLast.y, l = Math.sqrt(dx * dx + dy * dy);
                if (l > 2) ptr = { x: dx / l, y: dy / l, t: t };
            }
            ptrLast = { x: e.clientX, y: e.clientY, t: t };
        }
        function bindTrack(on) {
            if (on) {
                document.addEventListener('keydown', onTrack);
                document.addEventListener('keyup', onTrackUp);
            } else {
                document.removeEventListener('keydown', onTrack);
                document.removeEventListener('keyup', onTrackUp);
            }
        }
        function inputDir() {
            var x = axisX(), y = axisY();
            if (!x && !y) return null;
            var l = Math.sqrt(x * x + y * y);
            return { x: x / l, y: y / l };
        }
        // Input.Feather 的整数轴（原文两处判断都比对 -1 / 1）
        function axisX() {
            var v = 0;
            if (keys.arrowleft || keys.a) v -= 1;
            if (keys.arrowright || keys.d) v += 1;
            return v;
        }
        function axisY() {
            var v = 0;
            if (keys.arrowup || keys.w) v -= 1;
            if (keys.arrowdown || keys.s) v += 1;
            return v;
        }

        // ---------- dream 进出 ----------
        function countFeathers(done) {
            DiaryApi.featherCount().then(function (res) {
                var n = (res && res.success && res.data && res.data.count) || 0;
                done(n > 0 ? Math.min(n, 6) : 3);         // 有记录 → min(n,6)；空 → 3 根
            }).catch(function () { done(3); });
        }
        function enterDream() {
            if (active) return;
            active = true;
            updateSizes();
            ensureCanvas();
            resizeCanvas();
            preheatSfx();
            bindTrack(true);
            document.addEventListener('pointermove', onPointer, { passive: true });
            host.innerHTML = '';
            feathers = []; placed = []; parts = []; slashes = []; exits = []; orb = null;
            countFeathers(function (n) {
                if (!active) return;
                for (var k = 0; k < n; k++) addFeather();
            });
            startLoop();
        }
        function exitDream() {
            if (!active) return;
            endFly(true);
            active = false;
            stopLoop();
            bindTrack(false);
            document.removeEventListener('pointermove', onPointer);
            host.innerHTML = '';
            feathers = []; placed = []; parts = []; slashes = []; exits = []; orb = null;
            if (ctx2 && cv) { ctx2.clearRect(0, 0, CW, CH); painted = false; }
        }

        document.addEventListener('dream:entered', enterDream);
        document.addEventListener('dream:exiting', exitDream);
        window.addEventListener('resize', function () {
            if (!active) return;
            updateSizes();
            resizeCanvas();
            for (var k = 0; k < feathers.length; k++) applyScale(feathers[k]);
        });
        window.addEventListener('blur', function () { keys = {}; jumpEdge = dashEdge = false; });
        // 切走标签页时 rAF 会停，循环轨必须自己收掉；回来若还在飞就续上
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stopLoops();
            else if (orb && orb.charge >= CHARGE) startLoops();
        });
        // 叫醒 Madeline 时立刻收掉飞行，避免与睡醒动画叠在一起
        var mdEl = document.getElementById('dsMadeline');
        if (mdEl) mdEl.addEventListener('click', function () { if (orb) endFly(false); });
    })();

    // ===== dream 功能：梦境日记（Madeline 解梦）+ Badeline 夜话（影子视角读梦） =====
    (function () {
        var scene = document.getElementById('dreamScene');
        var jPanel = document.getElementById('dreamJournalPanel');
        var nPanel = document.getElementById('dreamNightPanel');
        if (!scene || !jPanel || !nPanel) return;

        // 面板内飘浮光尘（蓝光尘/紫光尘各一组）
        document.querySelectorAll('.dp-motes').forEach(function (box) {
            for (var i = 0; i < 14; i++) {
                var m = document.createElement('i');
                m.style.left = (Math.random() * 100) + '%';
                m.style.animationDuration = (9 + Math.random() * 11) + 's';
                m.style.animationDelay = (-Math.random() * 16) + 's';
                m.style.setProperty('--drift', (Math.random() * 90 - 45) + 'px');
                m.style.transform = 'scale(' + (0.6 + Math.random() * 1.1) + ')';
                box.appendChild(m);
            }
        });

        var dreams = [];
        function dreamDate(d) {
            try { var dt = new Date(d.createDate); return isNaN(dt) ? '' :
                (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0'); }
            catch (e) { return ''; }
        }
        function loadDreams() {
            return DiaryApi.listDreams().then(function (res) {
                dreams = (res && res.success && res.data && Array.isArray(res.data.list)) ? res.data.list : [];
                renderDreamList();
                renderDreamPick();
                return dreams;
            }).catch(function () { dreams = []; renderDreamList(); renderDreamPick(); return dreams; });
        }

        // ---------- 面板开关 ----------
        function openPanel(p) { closeAll(); p.classList.add('show'); }
        function closePanel(p) { p.classList.remove('show'); }

        // ---------- dream 功能按钮动画 ----------
        // 夜话按钮：badelineboost idle00-25 循环；点击播 flash00-06（一次性）后回调开面板
        var nightBoost = (function () {
            var img = document.getElementById('nightBoostImg');
            var BASE = 'Atlases/Gameplay/objects/badelineboost/';
            var idle = [], flash = [], t = null, k = 0;
            for (var i = 0; i <= 25; i++) idle.push(BASE + 'idle' + String(i).padStart(2, '0') + '.png');
            for (var j = 0; j <= 6; j++) flash.push(BASE + 'flash' + String(j).padStart(2, '0') + '.png');
            idle.concat(flash).forEach(function (s) { var im = new Image(); im.src = s; });
            function playSeq(list, ms, loop, done) {
                clearInterval(t);
                k = 0;
                t = setInterval(function () {
                    img.src = list[k]; k++;
                    if (k >= list.length) {
                        if (loop) k = 0;
                        else { clearInterval(t); t = null; if (done) done(); }
                    }
                }, ms);
            }
            // 不在加载时就起播（idle00 静态帧就是 HTML 里的初始图），等 dream:entered 再转
            return {
                flash: flash, playSeq: playSeq,
                playIdle: function () { playSeq(idle, 80, true); },
                stopIdle: function () { clearInterval(t); t = null; k = 0; },
                busy: false
            };
        })();
        // 夜话按钮只在 dream 场景里看得见：进 dream 才起播，离场就停。
        // 原来从页面加载起就整页 80ms 刷一次 img.src（12.5 次/秒空转）。
        document.addEventListener('dream:entered', function () { nightBoost.busy = false; nightBoost.playIdle(); });
        document.addEventListener('dream:exiting', function () { nightBoost.stopIdle(); });
        // 记梦入口：点击 dream 场景现有的绿色篝火本身
        document.getElementById('dsFire').addEventListener('click', function () {
            loadDreams().then(function () { openPanel(jPanel); });
        });

        function closeAll() { closePanel(jPanel); closePanel(nPanel); }
        function somePanelOpen() { return jPanel.classList.contains('show') || nPanel.classList.contains('show'); }

        document.getElementById('dreamNightBtn').addEventListener('click', function () {
            // 先播 badelineboost flash 动画（一次性），播完再打开夜话面板；播放期间防重入。
            // 请求与动画并行：点击瞬间即发 loadDreams，flash 播完直接汇合开面板（无网络延迟叠加）
            if (nightBoost.busy) return;
            nightBoost.busy = true;
            var loading = loadDreams();
            nightBoost.playSeq(nightBoost.flash, 70, false, function () {
                nightBoost.busy = false;
                nightBoost.playIdle();
                loading.then(function () { openPanel(nPanel); ensureNightOpening(); });
            });
        });
        document.getElementById('djClose').addEventListener('click', function () { closePanel(jPanel); });
        document.getElementById('ntClose').addEventListener('click', function () { closePanel(nPanel); });
        document.addEventListener('dream:exiting', closeAll);
        // 面板打开时 Esc 只关面板（捕获阶段拦在"叫醒 Madeline"监听之前）
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && somePanelOpen()) { e.stopPropagation(); closeAll(); }
        }, true);

        // ---------- 梦境日记 ----------
        var titleEl = document.getElementById('dreamTitle');
        var contentEl = document.getElementById('dreamContent');
        var saveBtn = document.getElementById('dreamSaveBtn');
        var listEl = document.getElementById('dreamList');
        var replyBox = document.getElementById('dreamReply');
        var replyText = document.getElementById('dreamReplyText');
        var replyTimer = null;

        function renderDreamList() {
            listEl.innerHTML = '';
            if (!dreams.length) {
                var empty = document.createElement('li');
                empty.className = 'dl-empty';
                empty.textContent = '还没有旧梦。醒来时别忘了写下来。';
                listEl.appendChild(empty);
                return;
            }
            dreams.forEach(function (d) {
                var li = document.createElement('li');
                var t = document.createElement('div');
                t.className = 'dl-t';
                t.textContent = d.title && d.title.trim() ? d.title : (d.content || '').slice(0, 18) || '无题的梦';
                var dt = document.createElement('div');
                dt.className = 'dl-d';
                dt.textContent = dreamDate(d);
                li.appendChild(t); li.appendChild(dt);
                li.addEventListener('click', function () {
                    [].forEach.call(listEl.children, function (c) { c.classList.remove('active'); });
                    li.classList.add('active');
                    titleEl.value = d.title || '';
                    contentEl.value = d.content || '';
                    replyBox.classList.remove('show');   // 旧梦不再重播当时的回应（回应是一次性私语）
                });
                listEl.appendChild(li);
            });
        }

        function typeReply(text) {
            clearInterval(replyTimer);
            replyText.textContent = '';
            replyBox.classList.add('show');
            replyBox.classList.remove('done');
            var i = 0;
            replyTimer = setInterval(function () {
                replyText.textContent = text.slice(0, ++i);
                if (i >= text.length) { clearInterval(replyTimer); replyBox.classList.add('done'); }
            }, 38);
        }

        saveBtn.addEventListener('click', function () {
            var content = contentEl.value.trim();
            if (!content) { contentEl.focus(); return; }
            saveBtn.disabled = true;
            saveBtn.textContent = '封存中…';
            DiaryApi.saveDream(titleEl.value.trim(), content)
                .then(function (res) {
                    if (res && res.success && res.data) {
                        typeReply(res.data.message || '……我在呢。');
                        titleEl.value = ''; contentEl.value = '';
                        loadDreams();
                    } else {
                        typeReply((res && res.msg) ? res.msg : '梦没存住……再试一次，好吗？');
                    }
                })
                .catch(function () { typeReply('梦没存住……网络那边雾太大了。'); })
                .finally(function () { saveBtn.disabled = false; saveBtn.textContent = '封存这个梦'; });
        });

        // ---------- Badeline 夜话 ----------
        var pick = document.getElementById('ntDreamPick');
        var msgs = document.getElementById('ntMsgs');
        var ntInput = document.getElementById('ntInput');
        var ntSend = document.getElementById('ntSend');
        var ntHist = [], ntDreamId = null, ntBusy = false, ntOpenedFor = null;
        var NT_EMO = ['normal','concerned','serious','scoff','angry','angryAlt','yell','upset','sad','sigh','worried','worriedAlt','freakA','freakB','freakC'];

        function portrait(emo) {
            if (NT_EMO.indexOf(emo) === -1) emo = 'normal';
            return 'celeste-portraits/badeline/' + emo + '00.png';
        }
        function renderDreamPick() {
            pick.innerHTML = '';
            if (!dreams.length) {
                var o = document.createElement('option');
                o.value = ''; o.textContent = '（还没有梦）';
                pick.appendChild(o);
                return;
            }
            dreams.forEach(function (d) {
                var o = document.createElement('option');
                o.value = d.id;
                o.textContent = (d.title && d.title.trim()) ? d.title.slice(0, 12) : (d.content || '无题的梦').slice(0, 12);
                pick.appendChild(o);
            });
        }
        function addRow(role, text, emo) {
            var row = document.createElement('div');
            row.className = 'nt-row ' + (role === 'user' ? 'user' : 'bl');
            if (role !== 'user') {
                var img = document.createElement('img');
                img.src = portrait(emo);
                img.alt = 'Badeline';
                img.onerror = function () { img.src = portrait('normal'); };
                row.appendChild(img);
            }
            var bub = document.createElement('div');
            bub.className = 'nt-bub';
            if (window.TextFx && role !== 'user') bub.innerHTML = TextFx.render(TextFx.autoMark(text));  // 梦境夜谈气泡
            else bub.textContent = text;
            row.appendChild(bub);
            msgs.appendChild(row);
            msgs.scrollTop = msgs.scrollHeight;
            return bub;
        }
        function showEmpty() {
            msgs.innerHTML = '';
            var box = document.createElement('div');
            box.className = 'nt-empty';
            box.innerHTML = '她在梦的边缘等着。<br>你还没写下任何梦——没有梦，她读什么？';
            var b = document.createElement('button');
            b.className = 'dp-primary';
            b.textContent = '去记一个梦';
            b.addEventListener('click', function () { closePanel(nPanel); openPanel(jPanel); contentEl.focus(); });
            box.appendChild(b);
            msgs.appendChild(box);
        }
        function resetNight(dreamId) {
            ntHist = []; ntDreamId = dreamId; ntOpenedFor = dreamId;
            msgs.innerHTML = '';
        }
        function ensureNightOpening() {
            if (!dreams.length) { ntDreamId = null; showEmpty(); return; }
            var id = pick.value || dreams[0].id;
            pick.value = id;
            if (ntOpenedFor === id && msgs.children.length) return;  // 这个梦已经开聊过，保留现场
            resetNight(id);
            ntBusy = true; ntSend.disabled = true;
            addRow('bl', '……', 'normal').classList.add('nt-typing');
            DiaryApi.dreamNightTalk(id, '', [])
                .then(function (res) {
                    msgs.innerHTML = '';
                    if (res && res.success && res.data) {
                        addRow('bl', res.data.message, res.data.emotion || 'normal');
                        ntHist.push({ role: 'assistant', content: res.data.message });
                    } else {
                        addRow('bl', (res && res.msg) ? res.msg : '……梦太散了，我什么都没抓到。', 'sigh');
                    }
                })
                .catch(function () { msgs.innerHTML = ''; addRow('bl', '……雾太大。靠近火堆再说。', 'sigh'); })
                .finally(function () { ntBusy = false; ntSend.disabled = false; ntInput.focus(); });
        }
        pick.addEventListener('change', function () { ensureNightOpening(); });

        function sendNight() {
            var v = ntInput.value.trim();
            if (!v || ntBusy || !ntDreamId) return;
            ntInput.value = '';
            addRow('user', v);
            ntHist.push({ role: 'user', content: v });
            ntBusy = true; ntSend.disabled = true;
            DiaryApi.dreamNightTalk(ntDreamId, v, ntHist)
                .then(function (res) {
                    if (res && res.success && res.data) {
                        addRow('bl', res.data.message, res.data.emotion || 'normal');
                        ntHist.push({ role: 'assistant', content: res.data.message });
                    } else {
                        addRow('bl', (res && res.msg) ? res.msg : '……（她别过脸，没接话。）', 'sigh');
                    }
                })
                .catch(function () { addRow('bl', '……信号断了。像做梦做到一半被人摇醒。', 'worried'); })
                .finally(function () { ntBusy = false; ntSend.disabled = false; ntInput.focus(); });
        }
        ntSend.addEventListener('click', sendNight);
        ntInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendNight(); });
    })();

    // 硬防横向滚动：overflow-x:clip 的兼容兜底 —— 任何来源的横向滚动（如点击门时浏览器把门滚回视野）立即归零，
    // 否则 body.scrollLeft 残留会让平移后的镜之房间错位、露出 body 背景
    document.addEventListener('scroll', function () {
        if (document.body && document.body.scrollLeft) document.body.scrollLeft = 0;
        if (document.documentElement && document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
    }, true);

    // ===== 心门音效：7 个 WAV 预加载 + 按需触发（避开 BGM 音量） =====
    (function () {
        var DIR = 'heartdoor/sounds/';
        var NAMES = ['heartdoor_entry','heartdoor_slam','frontdoor_heartfill_1','frontdoor_heartfill_2','frontdoor_heartfill_3','frontdoor_heartfill_4','frontdoor_unlock'];
        var VOL = 0.7;
        Sfx.preload(NAMES, { dir: DIR, volume: VOL });   // 先建实例触发下载，首次点击零延迟
        // play 支持多实例：每次新建 Audio 避免同标签重入打断
        function play(name) {
            if (NAMES.indexOf(name) === -1) return;
            Sfx.fire(name, { dir: DIR, volume: VOL });
        }
        window.__hdSfx = { play: play };
    })();

    // ===== 双屏接缝：把左侧梦境屏右缘的 1px 色带按 cover 口径铺进过渡区 =====
    // .ds-left 用 background: url(scene.png) center bottom / cover，不同宽高比下可见右缘并不是
    // 图片最右列（窄屏左右各裁掉一段）。这里实时复算显示尺寸与裁切偏移，让 1px 皮肤元素
    // 正好取到「可见右缘那一列」，再由 .ds-bridge::before 的 scaleX 横铺，接缝两侧颜色连续。
    (function () {
        var left = document.querySelector('.ds-world > .ds-left');
        var bridge = document.querySelector('.ds-bridge');
        if (!left || !bridge) return;
        var IW = 2540, IH = 1429;   // celeste-gui/dream/scene.png 原生尺寸
        function layout() {
            var cw = left.clientWidth, ch = left.clientHeight;
            var bw = bridge.clientWidth;
            if (cw < 2 || ch < 2 || bw < 1) return;
            var k = Math.max(cw / IW, ch / IH);       // 与 CSS cover 同口径
            var dw = IW * k, dh = IH * k;
            // center bottom 布局下，左屏右缘可见点在图片显示宽度里的位置 = (cw + dw) / 2；
            // 1px 元素把该点对到 x=1，正好露出一列，再 scaleX(bw) 展开成整条缓冲带
            bridge.style.setProperty('--bridge-skin-w', dw + 'px');
            bridge.style.setProperty('--bridge-skin-h', dh + 'px');
            bridge.style.setProperty('--bridge-skin-x', (1 - (cw + dw) / 2) + 'px');
            bridge.style.setProperty('--bridge-skin-scale', String(bw));
        }
        layout();
        window.addEventListener('resize', layout);
        if (typeof ResizeObserver === 'function') new ResizeObserver(layout).observe(left);
    })();

    // ===== 心门：初始全空 → 每达成一次解锁条件逐颗点亮 → 四心填满自动播放一次性分裂 → 点击进门 =====
    (function () {
        var door = document.getElementById('heartDoor');
        var dsWorld = document.querySelector('.ds-world');
        if (!door || !dsWorld) return;
        var hearts = door.querySelectorAll('.hd-hearts img');
        var TOTAL = hearts.length;            // 4 颗心
        var opened = false;                    // 分裂已完成（此后点击进门）
        var litNow = 0;                        // 当前已点亮的颗数
        var splitting = false;                 // 分裂动画播放中
        // 分裂为一次性动画：播过即永久保持最终态，刷新直接恢复 split 态、不再重播
        var splitDone = Store.getFlag(Store.KEYS.HEART_DOOR_SPLIT);
        if (splitDone) { opened = true; door.classList.add('split'); }

        // ===== 开启条件：四心为初始条件——心门由商店炼制的水晶心驱动（heartDoorHearts 数组） =====
        // 每炼一颗心点亮一颗，满 TOTAL 颗门就绪；之后继续炼心不再进门，只改变 Badeline 人格
        // 预览可加 ?opendoor 强制点亮全部
        function forceOpen() { return new URLSearchParams(location.search).has('opendoor'); }
        function targetOf() {
            if (forceOpen()) return TOTAL;
            var n = 0;
            var arr = Store.getJson(Store.KEYS.HEART_DOOR_HEARTS, null);
            if (Array.isArray(arr) && arr.length) n = arr.length;
            else {
                var c = Store.getJson(Store.KEYS.CRYSTAL_HEART, null);
                n = (c && c.color) ? 1 : 0;
            }
            return Math.max(0, Math.min(TOTAL, n));
        }
        function persist() { Store.set(Store.KEYS.HEART_DOOR_LIT, litNow); }
        function refreshState() {
            // 门已开过（opened）就不再回到「锁住」：那会变成 not-allowed 指针，
            // 明明点一下就进镜之房间却看着像不能点
            door.classList.toggle('locked', !opened && litNow < TOTAL);
            door.classList.toggle('ready', !opened && !splitting && litNow >= TOTAL);
        }
        function paint(im, lit) { im.src = lit ? 'heartdoor/icon06.png' : 'heartdoor/icon00.png'; }

        // 极光色像素星点已改为画进 #dsBirds 画布（见 dream-birds.js 的 drawAstars）：
        // 原来这里生成 30 个 <i> + CSS opacity 动画，实测每个元素每帧都要主线程 tick，
        // 合计约 0.45ms/帧，而且让整份文档每帧重算样式。

        // 开门特效：白闪 / 门底残影暗斑，挂到 #dreamScene，动画结束自清理
        function spawnDoorFx() {
            var scene = document.getElementById('dreamScene');
            if (!scene) return;
            ['doorFlash', 'doorResidue'].forEach(function (id) {
                var el = document.createElement('div');
                el.id = id;
                el.addEventListener('animationend', function () { el.remove(); });
                scene.appendChild(el);
            });
        }

        // ===== 一次性开门 → 替换为 Poem 仪式（IL: Celeste.Poem —— 80 粒子 + GUI 240px 巨心 + poemside + 辉光） =====
        // COLOR_SUBDIR: 0=blue, 1=red, 2=yellow, 3=fake（与 shop.js 一致）
        var POEM_COLORS = { blue: '#8cc7fa', red: '#ff668a', yellow: '#fffc24', fake: '#ffffff' };
        var COLOR_SUBDIR = { blue:'0', red:'1', yellow:'2', fake:'3' };
        function pad2(i) { return String(i).padStart(2, '0'); }
        function promImg(src) { return new Promise(function (r) { var im = new Image(); im.onload = function () { r(im); }; im.onerror = function () { r(null); }; im.src = src; }); }
        function sineIn(t) { return 1 - Math.cos(t * Math.PI / 2); }
        function cubeIn(t) { return t * t * t; }
        function cubeOut(t) { return 1 - cubeIn(1 - t); }
        function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
        function tintCopy(img, cssColor) {
            if (!img) return null;
            if (img.__tint && img.__tint[cssColor]) return img.__tint[cssColor];
            var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            var g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in';
            g.fillStyle = cssColor; g.fillRect(0, 0, c.width, c.height);
            img.__tint = img.__tint || {}; img.__tint[cssColor] = c; return c;
        }
        // Poem 素材加载（与 shop.js 同源）
        var GUI_SPIN_SEQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        var GUI_FRAME_DELAY = 0.08;
        var GUI_HG = 'Atlases/Gui/collectables/heartgem';
        var GUI_HEART_FRAMES = { blue: [], red: [], yellow: [], fake: [] };
        Object.keys(COLOR_SUBDIR).forEach(function (c) {
            if (c === 'fake') return;      // heartgem/3 只打包了 FakeHeart 帧（没有 spin），别去预载 11 张不存在的图
            for (var i = 0; i < 11; i++) (function (c, i) {
                GUI_HEART_FRAMES[c].push(null);
                promImg(GUI_HG + '/' + COLOR_SUBDIR[c] + '/spin' + pad2(i) + '.png')
                    .then(function (im) { GUI_HEART_FRAMES[c][i] = im; });
            })(c, i);
        });
        for (var fi = 0; fi < 33; fi++) (function (i) {
            GUI_HEART_FRAMES.fake.push(null);
            promImg(GUI_HG + '/3/FakeHeart' + String(i).padStart(4, '0') + '.png')
                .then(function (im) { GUI_HEART_FRAMES.fake[i] = im; });
        })(fi);
        var snowImg = null, poemsideImg = null;
        promImg('Atlases/Gameplay/particles/snow.png').then(function (im) { snowImg = im; });
        promImg('Atlases/Gui/poemside.png').then(function (im) { poemsideImg = im; });

        // Poem 状态（仅 shelf 版本：淡入→hold→淡出 三阶段；无 AbsorbOrb / fake break）
        var poem = null;
        var poemEl = document.getElementById('heartGet');
        var poemTip = poemEl ? poemEl.querySelector('.hg-poem-tip') : null;
        var fxc = document.getElementById('hgFx');
        var fxctx = fxc ? fxc.getContext('2d') : null;
        var poemSharp = null, poemGlow = null;
        function resizePoemFx() {
            if (!fxc) return;
            fxc.width = window.innerWidth; fxc.height = window.innerHeight;
            fxctx.imageSmoothingEnabled = true;
        }
        if (fxc) { window.addEventListener('resize', resizePoemFx); resizePoemFx(); }
        function poemsideFor(col) { return poemsideImg ? tintCopy(poemsideImg, col) : null; }
        function showPoem(clickable) {
            if (!poemEl) return;
            poemEl.style.opacity = '0';
            poemEl.classList.add('show');
            poemEl.classList.add('display');
            if (poemTip) poemTip.style.visibility = clickable === false ? 'hidden' : '';
            resizePoemFx();
        }
        function newPoemParticle() {
            var a = Math.random() * Math.PI * 2;
            return { dir: { x: Math.cos(a), y: Math.sin(a) }, p: Math.random(), dur: 0.5 + Math.random() * 0.5 };
        }
        function openPoem(color, title, desc) {
            var fake = color === 'fake';
            poem = {
                color: color, fake: fake,
                spinFrames: fake ? null : GUI_HEART_FRAMES[color],
                frameI: 0, frameT: 0, delay: GUI_FRAME_DELAY,
                tint: (color === 'yellow' && !fake) ? 0.6 : 1,
                title: title || '', desc: desc || '',
                textAlpha: 1, particleSpeed: 1, shake: 0,
                particles: [], timer: 0,
                alpha: 0, t: 0, phase: 'in',
                autoStarted: false
            };
            for (var i = 0; i < 80; i++) poem.particles.push(newPoemParticle());
            if (poemEl) { poemEl.classList.add('show'); poemEl.style.opacity = '0'; }
        }
        function closePoem() {
            poem = null;
            if (poemEl) { poemEl.classList.remove('show'); poemEl.style.opacity = '0'; }
            if (poemTip) poemTip.style.visibility = '';
        }
        function updatePoem(rdt) {
            if (!poem) {
                // 原来这里每帧都写一次 style.opacity='0'，即使根本没开过 Poem（书架常态）
                // → 每帧一次样式失效。只在真的需要复位时写
                if (poemEl && poemEl.style.opacity !== '0') poemEl.style.opacity = '0';
                return;
            }
            poem.timer += rdt;
            // 巨心 spin 帧推进
            if (!poem.fake && poem.spinFrames) {
                poem.frameT += rdt;
                while (poem.frameT >= poem.delay) {
                    poem.frameT -= poem.delay;
                    poem.frameI = (poem.frameI + 1) % GUI_SPIN_SEQ.length;
                }
            }
            // 粒子推进
            for (var i = 0; i < poem.particles.length; i++) {
                var p = poem.particles[i];
                p.p += rdt / p.dur * poem.particleSpeed;
                if (p.p > 1) { var np = newPoemParticle(); np.p = 0; poem.particles[i] = np; }
            }
            // 淡入 → hold → 淡出
            if (poem.phase === 'in') {
                poem.t += rdt;
                poem.alpha = poem.t >= 1 ? 1 : cubeOut(poem.t);
                if (poem.t >= 1) poem.phase = 'hold';
            } else if (poem.phase === 'out') {
                poem.t += rdt * 2;
                poem.alpha = poem.t >= 1 ? 0 : cubeIn(1 - poem.t);
                if (poem.t >= 1) { closePoem(); return; }
            }
            if (poemEl) poemEl.style.opacity = poem.alpha.toFixed(3);
        }
        function poemHeartImg() {
            if (!poem) return null;
            if (poem.fake) return GUI_HEART_FRAMES.fake[GUI_SPIN_SEQ[poem.frameI]] || null;
            return poem.spinFrames ? poem.spinFrames[GUI_SPIN_SEQ[poem.frameI]] : null;
        }
        // IL: Poem.DrawPoem —— 文本两侧 poemside 64px 装饰 + 5 次描边（4 黑 1 彩）
        function drawPoemText(ctx, cx, cy, g, color, dx, dy) {
            var title = poem.title || '', desc = poem.desc || '';
            var ts = Math.max(12, Math.round(84 * g));
            var ds = Math.max(9, Math.round(34 * g));
            var family = "'CelesteZH','Renogare','Microsoft YaHei',sans-serif";
            ctx.save(); ctx.translate(dx, dy); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            var descLines = [], maxW = 1024 * g, cur = '';
            if (desc) {
                ctx.font = ds + 'px ' + family;
                for (var i = 0; i < desc.length; i++) {
                    var next = cur + desc[i];
                    if (ctx.measureText(next).width > maxW && cur) { descLines.push(cur); cur = desc[i]; }
                    else cur = next;
                }
                if (cur) descLines.push(cur);
            }
            ctx.font = ts + 'px ' + family;
            var w = ctx.measureText(title).width;
            ctx.font = ds + 'px ' + family;
            for (var k = 0; k < descLines.length; k++) w = Math.max(w, ctx.measureText(descLines[k]).width);
            var tLH = ts * 1.15, dLH = ds * 1.5, gap = descLines.length ? ts * 0.18 : 0;
            var totalH = tLH + (descLines.length ? gap + dLH * descLines.length : 0);
            var top = cy - totalH / 2;
            ctx.font = ts + 'px ' + family;
            ctx.fillText(title, cx, top + tLH / 2);
            if (descLines.length) {
                ctx.font = ds + 'px ' + family;
                for (var k2 = 0; k2 < descLines.length; k2++) {
                    ctx.fillText(descLines[k2], cx, top + tLH + gap + dLH * (k2 + 0.5));
                }
            }
            var side = poemsideFor(color);
            if (side) {
                var ss = 64 * g;
                ctx.drawImage(side, cx - (w / 2 + 64 * g) - ss / 2, cy - ss / 2, ss, ss);
                ctx.drawImage(side, cx + (w / 2 + 64 * g) - ss / 2, cy - ss / 2, ss, ss);
            }
            ctx.restore();
        }
        function drawPoemGlow(ctx, cx, cy, g, col) {
            var R = 520 * g;
            var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
            bg.addColorStop(0, hexA(col, 0.5));
            bg.addColorStop(0.45, hexA(col, 0.18));
            bg.addColorStop(1, hexA(col, 0));
            ctx.fillStyle = bg;
            ctx.fillRect(ctx.canvas.width * -0.1, ctx.canvas.height * -0.1, ctx.canvas.width * 1.2, ctx.canvas.height * 1.2);
        }
        function poemLayer(el, w, h) {
            if (!el) el = document.createElement('canvas');
            if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
            return el;
        }
        function drawPoem() {
            if (!fxctx || !poem) return;
            var W = fxc.width, H = fxc.height;
            fxctx.clearRect(0, 0, W, H);
            var g = Math.min(W / 1920, H / 1080);
            var cx = W / 2, cy = H / 2;
            var col = POEM_COLORS[poem.color] || POEM_COLORS.blue;

            poemSharp = poemLayer(poemSharp, W, H);
            var p = poemSharp.getContext('2d');
            p.clearRect(0, 0, W, H); p.imageSmoothingEnabled = true;
            var snow = tintCopy(snowImg, col);
            if (snow) {
                for (var i = 0; i < poem.particles.length; i++) {
                    var pt = poem.particles[i];
                    var e = sineIn(pt.p);
                    var px = cx + pt.dir.x * (1 - e) * 1920 * g;
                    var py = cy + pt.dir.y * (1 - e) * 1920 * g;
                    var sx = 1 + e * 2;
                    var sy = 0.25 * (0.25 + (1 - e) * 0.75);
                    p.save(); p.translate(px, py);
                    p.rotate(Math.atan2(-pt.dir.y, -pt.dir.x));
                    p.globalAlpha = Math.max(0, 1 - e);
                    p.scale(sx, sy);
                    p.drawImage(snow, -4, -4, 8, 8);
                    p.restore();
                }
                p.globalAlpha = 1;
            }
            var img = poemHeartImg();
            if (img) {
                var jx = (Math.random() * 2 - 1) * 16 * poem.shake;
                var jy = (Math.random() * 2 - 1) * 16 * poem.shake;
                var hs = img.width * g * (1 + poem.shake * 0.1);
                p.globalAlpha = poem.tint;
                p.drawImage(img, cx - hs / 2 + jx, cy - hs / 2 + jy, hs, hs);
                p.globalAlpha = 1;
            }
            if (poem.textAlpha > 0) {
                var off = 2 * g;
                p.globalAlpha = poem.textAlpha;
                drawPoemText(p, cx, cy, g, '#000000', -off, 0);
                drawPoemText(p, cx, cy, g, '#000000', off, 0);
                drawPoemText(p, cx, cy, g, '#000000', 0, -off);
                drawPoemText(p, cx, cy, g, '#000000', 0, off);
                drawPoemText(p, cx, cy, g, col, 0, 0);
                p.globalAlpha = 1;
            }
            // smoke RT：半分辨率 + 高斯模糊 → 0.3 alpha 叠加
            var hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2));
            poemGlow = poemLayer(poemGlow, hw, hh);
            var q = poemGlow.getContext('2d');
            q.clearRect(0, 0, hw, hh); q.imageSmoothingEnabled = true;
            drawPoemGlow(q, hw / 2, hh / 2, g * 0.5, col);
            q.filter = 'blur(' + Math.max(2, 6 * g) + 'px)';
            q.drawImage(poemSharp, 0, 0, hw, hh);
            q.filter = 'none';
            fxctx.globalAlpha = 0.3;
            fxctx.drawImage(poemGlow, 0, 0, W, H);
            fxctx.globalAlpha = 1;
            fxctx.drawImage(poemSharp, 0, 0);

            // ===== CollectRoutine 前置：AbsorbOrb + 白闪 + FormationBackdrop 黑幕 =====
            // shelf 没有 Madeline → AbsorbOrb 目标 = 画面中心（即 Poem 巨心位置）
            // 注意：orbs 的更新已在 tickRitual(rdt) slow 阶段完成，这里只做渲染
            if (orbs.length) {
                var orbIm2 = orbImg;
                if (!orbIm2) { orbIm2 = new Image(); orbIm2.src = 'Atlases/Gameplay/collectables/heartGem/orb.png'; }
                var cx2 = W / 2, cy2 = H / 2;
                for (var i = 0; i < orbs.length; i++) {
                    var o = orbs[i];
                    var wx = o.x * (W / 1920), wy = o.y * (H / 1080);
                    fxctx.save();
                    fxctx.translate(cx2 + wx - o.x * (W / 1920), cy2 + wy - o.y * (H / 1080));
                    fxctx.translate(wx, wy);
                    fxctx.rotate(o.rot);
                    fxctx.globalAlpha = o.alpha;
                    fxctx.scale(o.sx, o.sy);
                    if (orbIm2.complete && orbIm2.naturalWidth > 0)
                        fxctx.drawImage(orbIm2, -orbIm2.width / 2, -orbIm2.height / 2);
                    else {
                        fxctx.fillStyle = '#ffffff';
                        fxctx.fillRect(-8, -8, 16, 16);
                    }
                    fxctx.restore();
                }
            }
            // IL: Level.Flash → Approach(1, dt*10) 后 Approach(0, dt*3)（0.33s 内衰减）
            if (flashA > 0) {
                fxctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, flashA).toFixed(3) + ')';
                fxctx.fillRect(0, 0, W, H);
            }
            // IL: FormationBackdrop → Black * backdropFade * 0.85
            if (backdropFade > 0.002) {
                fxctx.fillStyle = 'rgba(0,0,0,' + (0.85 * backdropFade).toFixed(3) + ')';
                fxctx.fillRect(0, 0, W, H);
            }
        }

        // ===== CollectRoutine 前置仪式（IL: HeartGem.CollectRoutine 时间轴移植）=====
        // Freeze(0.2) → TimeRate=0.5 + 10×AbsorbOrb + Flash(White) + FormationBackdrop.Display=true + 2s slow → TimeRate=1 → Poem
        var orbs = [], flashA = 0, backdropFade = 0, backdropTarget = 0, freezeT = 0, slowElapsed = 0, ritual = null;
        function approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); }
        function yoyo(t) { return t < 0.5 ? t * 2 : (1 - t) * 2; }
        function bezPoint(c, t) { var u = 1 - t; return { x: u * u * c.sx0 + 2 * u * t * c.cx + t * t * c.ex, y: u * u * c.sy0 + 2 * u * t * c.cy + t * t * c.ey }; }
        function bezLen10(c) { var len = 0, prev = bezPoint(c, 0); for (var i = 1; i <= 10; i++) { var p = bezPoint(c, i / 10); len += Math.sqrt((p.x - prev.x) * (p.x - prev.x) + (p.y - prev.y) * (p.y - prev.y)); prev = p; } return len; }
        function orbScale(v) { return { x: Math.min(2, 0.5 + v * 0.02), y: Math.max(0.05, 0.5 - v * 0.004) }; }
        // shelf 世界坐标：AbsorbOrb target = (0, 0) 即 Poem 画面中心（相对 1920×1080）
        function newOrb() {
            var a = Math.random() * Math.PI * 2;
            var r = 200 + Math.random() * 100;
            return {
                x: Math.cos(a) * r, y: Math.sin(a) * r,
                alpha: 1,
                consumeDelay: 0.7 + Math.random() * 0.3,
                burstSpeed: 80 + Math.random() * 40,
                burstDir: Math.random() * Math.PI * 2,
                percent: 0, duration: 0, curve: null,
                rot: 0, sx: 1, sy: 1, dead: false
            };
        }
        function updateOrb(o, rdt) {
            var tx = 0, ty = 0;                      // Poem 中心
            if (o.consumeDelay > 0) {
                o.x += Math.cos(o.burstDir) * o.burstSpeed * rdt;
                o.y += Math.sin(o.burstDir) * o.burstSpeed * rdt;
                o.burstSpeed = approach(o.burstSpeed, 0, rdt * 120);
                o.rot = o.burstDir;
                var s = orbScale(o.burstSpeed); o.sx = s.x; o.sy = s.y;
                o.consumeDelay -= rdt;
                if (o.consumeDelay <= 0) {
                    var dx = tx - o.x, dy = ty - o.y;
                    var len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
                    var off = len * (0.05 + Math.random() * 0.45) * (Math.random() < 0.5 ? -1 : 1);
                    o.curve = { sx0: o.x, sy0: o.y, ex: tx, ey: ty,
                                cx: (o.x + tx) / 2 - dy / len * off, cy: (o.y + ty) / 2 + dx / len * off };
                    o.duration = 0.3 + Math.random() * 0.25;
                }
            } else {
                o.curve.ex = tx; o.curve.ey = ty;
                o.percent = approach(o.percent, 1, rdt / o.duration);
                var e = cubeIn(o.percent);
                var q = bezPoint(o.curve, e);
                o.x = q.x; o.y = q.y;
                var v = yoyo(e) * bezLen10(o.curve);
                var s2 = orbScale(v); o.sx = s2.x; o.sy = s2.y;
                o.rot = Math.atan2(q.y - o.y, q.x - o.x);
                o.alpha = 1 - e;
                if (o.percent >= 1) o.dead = true;
            }
        }
        // orb 贴图预加载
        var orbImg = null;
        promImg('Atlases/Gameplay/collectables/heartGem/orb.png').then(function (im) { orbImg = im; });

        // CollectRoutine 状态机
        function startRitual() {
            ritual = { kind: 'real', phase: 'freeze', t: 0 };
            freezeT = 0.2;           // IL: Celeste.Freeze(0.2)
            // 同时隐藏 #heartDoor 视觉（Poem 期间门应该淡出）
            door.style.transition = 'opacity 0.25s ease';
            door.style.opacity = '0';
        }
        function afterFreeze() {
            ritual.phase = 'slow'; ritual.t = 0; slowElapsed = 0;
            for (var i = 0; i < 10; i++) orbs.push(newOrb());  // IL: 10 × AbsorbOrb(Position)
            flashA = 1;                                          // IL: level.Flash(White)
            backdropTarget = 1;                                  // IL: FormationBackdrop.Display = true
        }
        function poemPhase() {
            ritual.phase = 'poem';
            var meta = latestHeartMeta();
            showPoem(true);
            openPoem(meta.color, meta.title, meta.desc);
        }
        function endRitual() {
            backdropTarget = 0;
            if (poem) { poem.phase = 'out'; poem.t = 0; }
        }
        function tickRitual(rdt) {
            if (!ritual) return;
            // Freeze —— 整个场景停 0.2s，但 flash/backdrop 仍按 rdt 走
            if (ritual.phase === 'freeze') {
                freezeT -= rdt;
                if (freezeT <= 0) afterFreeze();
                return;
            }
            // slow —— 2s，TimeRate 近似：orb 速度在接近 0 前持续更新
            if (ritual.phase === 'slow') {
                ritual.t += rdt; slowElapsed += rdt;
                // orbs 更新（IL: AbsorbOrb 持续飞行）
                for (var i = 0; i < orbs.length; i++) updateOrb(orbs[i], rdt);
                orbs = orbs.filter(function (o) { return !o.dead; });
                if (ritual.t >= 2) poemPhase();
            }
            // flash 衰减：IL: Flash(White) → Approach(0, dt*3)（约 0.33s 衰减到 0）
            if (flashA > 0) flashA = approach(flashA, 0, rdt * 3);
            // backdrop fade：IL: fade = Approach(Display ? 1 : 0, RawDeltaTime*3)
            backdropFade = approach(backdropFade, backdropTarget, rdt * 3);
            // Poem hold → 点一下淡出 → 淡出结束自动 panRight（hook 在 triggerSplit 里设）
        }

        // shelf 专属 rAF 驱动（Poem + CollectRoutine + 其它动画）
        var poemLast = 0;
        var rdtSaved = 1 / 60;
        function poemTick(ts) {
            var rdt = poemLast ? Math.min((ts - poemLast) / 1000, 0.05) : 1 / 60;
            poemLast = ts;
            rdtSaved = rdt;
            // 空闲（无心门仪式 / 无 Poem / 无闪光 / 无黑幕 / 无吸收光球）时整帧跳过：
            // 只留一个几乎零成本的 rAF 回调，醒着时再接管
            if (!ritual && !poem && flashA <= 0 && backdropFade <= 0.002 && !orbs.length) {
                requestAnimationFrame(poemTick);
                return;
            }
            tickRitual(rdt);
            updatePoem(rdt);
            drawPoem();
            requestAnimationFrame(poemTick);
        }
        requestAnimationFrame(poemTick);

        // 取最近那颗心的颜色和文案（Store.HEART_CRYSTAL_DAY / CRYSTAL_HEART 兜底）
        function latestHeartMeta() {
            var hc = Store.getJson(Store.KEYS.HEART_CRYSTAL_DAY, null);
            if (hc && POEM_COLORS[hc.color]) return { color: hc.color, title: hc.title || '一道光', desc: hc.desc || undefined };
            var ch = Store.getJson(Store.KEYS.CRYSTAL_HEART, null);
            if (ch && POEM_COLORS[ch.color]) return { color: ch.color, title: ch.title || '一道光', desc: ch.desc || undefined };
            return { color: 'blue', title: '一道光', desc: '照进心里最柔软的角落' };
        }

        // 一次性开门 → CollectRoutine 前置仪式（Freeze → AbsorbOrb+Flash+Backdrop+2s slow → Poem 淡入）
        // Poem hold → 点击 → 淡出 → 自动 panRight 进镜之房间
        function triggerSplit() {
            if (splitDone || splitting || ritual) return;
            splitting = true;
            door.classList.remove('ready');
            door.title = '走进门后……';
            Store.set(Store.KEYS.HEART_DOOR_SPLIT, '1');
            // 隐藏门 DOM（fade out 动画），Poem 期间不显示
            door.style.transition = 'opacity 0.4s ease';
            door.style.opacity = '0';
            // 启动 CollectRoutine 状态机（Freeze → slow → Poem）
            startRitual();
            // 四心齐、Badeline 解锁：章节明信片音效（一次性，门开过后不再播）
            pcPlay('ui_main_postcard_ch2_in.wav');
            // Poem 淡出结束 → 自动 panRight（hook poem phase='out' → !poem）
            var hook = setInterval(function () {
                if (!poem) {
                    clearInterval(hook);
                    splitDone = true; opened = true; splitting = false;
                    // 恢复门可见（镜之房间侧仍保留 split 态）
                    door.classList.add('split');
                    door.style.opacity = ''; door.style.transition = '';
                    pcPlay('ui_main_postcard_ch2_out.wav');
                    panRight();
                }
            }, 40);
        }
        function maybePlaySplit(delay) { if (!splitDone && !splitting) setTimeout(triggerSplit, delay); }

        // 单颗心：7 帧填充动画 + pop 弹跳反馈
        function fillHeart(im, done) {
            var f = 0;
            var iv = setInterval(function () {
                f++;
                if (f >= 6) {
                    clearInterval(iv);
                    paint(im, true);
                    im.classList.add('pop');
                    setTimeout(function () { im.classList.remove('pop'); }, 580);
                    if (done) done();
                } else {
                    im.src = 'heartdoor/icon0' + f + '.png';
                }
            }, 70);
        }

        // 把点亮数推进到 target：新增部分逐颗动画点亮，减少则静默校正
        // applySeq 链序号：新的推进会作废上一条填充链，防止双链并发把 litNow 跳奇数颗
        var applySeq = 0;
        var entryPlayed = false;        // 入场音每次加载只响一次（applyTarget 会被初始化和日记加载各调一遍）
        var filledSeen = {};            // 第 n 颗的填充音每次加载只响一次
        function applyTarget(target, animate) {
            target = Math.max(0, Math.min(TOTAL, target));
            var seq = ++applySeq;
            // 门已经开过（分裂已播）：之后再有任何变化都只静默更新显示，
            // 不重播 entry / heartfill / unlock，也不走逐颗填充动画
            if (splitDone) animate = false;
            // 第一次有心点亮 → heartdoor_entry
            if (animate && !entryPlayed && litNow === 0 && target > 0 && window.__hdSfx) {
                entryPlayed = true;
                window.__hdSfx.play('heartdoor_entry');
            }
            if (target <= litNow || !animate) {
                hearts.forEach(function (im, i) { paint(im, i < target); });
                litNow = target; persist(); refreshState();
                // 注意：这里不再播 frontdoor_unlock —— 静默校正不是「开门那一下」。
                // 开门音效只在真正从「不满」推进到「满」的填充链末尾播一次（见下）。
                if (target >= TOTAL) maybePlaySplit(650);
                return;
            }
            refreshState();                    // 动画期间保持锁定
            hearts.forEach(function (im, i) { if (i < litNow) paint(im, true); });  // 先还原已有进度，再逐颗点亮新增
            (function next() {
                if (seq !== applySeq) return;  // 已被更新的推进取代，整链作废
                if (litNow >= target) {
                    persist(); refreshState();
                    if (target >= TOTAL) {
                        // 真正攒满的那一下 → frontdoor_unlock（门已开过的不再播）
                        if (!splitDone && window.__hdSfx) window.__hdSfx.play('frontdoor_unlock');
                        maybePlaySplit(580);
                    }
                    return;
                }
                var idx = litNow;  // 当前要填第几颗（0-based，对应 heartfill idx+1）
                fillHeart(hearts[litNow], function () {
                    if (seq !== applySeq) return;   // 过期链不计进度
                    // 每颗心填充完成 → frontdoor_heartfill_{idx+1}（同一颗只响一次）
                    if (!splitDone && window.__hdSfx && !filledSeen[idx + 1]) {
                        filledSeen[idx + 1] = 1;
                        window.__hdSfx.play('frontdoor_heartfill_' + (idx + 1));
                    }
                    litNow++;
                    persist();              // 逐颗落盘：中途被打断（刷新/切页）下次不会再重播已亮过的填充音
                    setTimeout(next, 300);
                });
            })();
        }

        // ===== 旧数据一次性补齐 =====
        // 旧版「商店炼金」删掉后 heartDoorHearts 就没人写了，于是门开过的用户
        // 存储里一颗心也没有（心门永远显示零星一颗）。门开过必然意味着曾经攒满四颗，
        // 所以按四颗补记占位（legacy 标记 + 空日期），之后收下的心继续追加、颗数封顶四。
        (function migrateLegacyHearts() {
            if (!splitDone) return;
            var arr = Store.getJson(Store.KEYS.HEART_DOOR_HEARTS, null);
            if (Array.isArray(arr) && arr.length) return;
            var ch = Store.getJson(Store.KEYS.CRYSTAL_HEART, null) || {};
            var out = [];
            for (var i = 0; i < TOTAL; i++) {
                out.push({ color: ch.color || 'blue', title: ch.title || '', desc: ch.desc || '', date: '', legacy: 1 });
            }
            Store.set(Store.KEYS.HEART_DOOR_HEARTS, out);
        })();

        // 初始：按已点心数恢复；门已开过的直接静默对齐，不再播开门音效与填充动画
        var saved = Store.getInt(Store.KEYS.HEART_DOOR_LIT);
        litNow = Math.max(0, Math.min(TOTAL, isNaN(saved) ? 0 : saved));
        applyTarget(targetOf(), litNow < targetOf() && !splitDone);

        // 书架日记加载完成后推进进度（按已炼心数，真实数据优先）
        // 入参（日记篇数）故意忽略：颗数只认已收集的心；门已开过时 applyTarget 内部静默对齐，不重播开门音效
        window.__setDoorProgress = function () { applyTarget(targetOf(), true); };

        function panRight() {
            dsWorld.classList.add('panned');
            if (window.__dreamBGM) window.__dreamBGM.pause();   // Starjump 暂停留位，让位 Resurrections
            if (window.CampfireAudio) window.CampfireAudio.suspend();   // 镜之房间不要篝火声
            // 不再 door.classList.add('away') — 心门在镜之房间侧只露一半，可点击回书架
            // Canvas 镜子房间：先挂载/复位（完好镜 + 重置 DOM 镜子态 → Badeline 只在破镜后由 summon() 出场），
            // 再让 BGM 进场（phaseOf 读 .summoned 决定 p1/p2，完好镜必须从 p1 起播）
            if (window.__mirrorScene) {
                window.__mirrorScene.enter();
                if (window.__mirrorBGM) window.__mirrorBGM.enter();
            } else {
                if (window.__mirrorBGM) window.__mirrorBGM.enter();
                // DOM 回退模式：镜子破碎态优先：破碎 → 碎镜呈现 + Badeline 强制出场；完好 → 随机模式 A/B
                if (!(window.__mirrorState && window.__mirrorState.sync())) {
                    if (window.__badelineEnterRoom) window.__badelineEnterRoom();
                }
            }
        }

        // ===== 破门星尘：白色像素尘埃以横向为主从门心爆散（参照 Farewell 开门） =====
        function doorBurst() {
            // 挂到 #dreamScene 的全屏 fixed 层：门体溶解时星尘仍独立存活
            var scene = document.getElementById('dreamScene') || document.body;
            var layer = document.createElement('div');
            layer.style.cssText = 'position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:1590;';
            scene.appendChild(layer);
            var r = door.getBoundingClientRect();
            var cx = r.left + r.width / 2, cy = r.top + r.height * 0.645;   // 开口中心（55~74% 中点）
            var pieces = [];
            for (var k = 0; k < 56; k++) {
                var horiz = Math.random() < 0.62;          // 六成沿横向喷成一条光带
                var i = document.createElement('i');
                var s = Math.random() < 0.75 ? 2 : 3;      // 2~3px 像素尘
                i.style.cssText = 'position:absolute;left:' + (cx - s / 2) + 'px;top:' + (cy - s / 2) +
                    'px;width:' + s + 'px;height:' + s + 'px;background:' +
                    (Math.random() < 0.3 ? '#d8f4ff' : '#ffffff') +
                    ';box-shadow:0 0 4px rgba(200,240,255,.9);';
                layer.appendChild(i);
                var ang, spd, dir = Math.random() < 0.5 ? -1 : 1;
                if (horiz) { ang = Math.random() * 0.9 - 0.45; spd = 180 + Math.random() * 300; }
                else { ang = Math.random() * Math.PI * 2; spd = 60 + Math.random() * 160; }
                pieces.push({
                    el: i, x: cx, y: cy,
                    vx: Math.cos(ang) * spd * dir,
                    vy: Math.sin(ang) * spd * (horiz ? 0.5 : 1) - 40,
                    life: 0, ttl: 0.8 + Math.random() * 0.9
                });
            }
            // 爆裂音：高频噪声 + 水晶 ping（拿不到 WebAudio 时只飞星尘、不出声）
            var AC = Sfx.ac();
            if (AC) {
                try {
                    var buf = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.35), AC.sampleRate);
                    var d = buf.getChannelData(0);
                    for (var n = 0; n < d.length; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / d.length, 2.2);
                    var src = AC.createBufferSource(); src.buffer = buf;
                    var hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
                    var g = AC.createGain(); g.gain.value = 0.35;
                    src.connect(hp); hp.connect(g); g.connect(AC.destination); src.start();
                    [3200, 2500].forEach(function (f, i2) {
                        var o = AC.createOscillator(), og = AC.createGain();
                        o.type = 'triangle';
                        o.frequency.setValueAtTime(f, AC.currentTime);
                        o.frequency.exponentialRampToValueAtTime(f * 0.55, AC.currentTime + 0.22);
                        og.gain.setValueAtTime(i2 ? 0.07 : 0.11, AC.currentTime);
                        og.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.28);
                        o.connect(og); og.connect(AC.destination);
                        o.start(); o.stop(AC.currentTime + 0.3);
                    });
                } catch (e) {}
            }
            // 物理：微重力横向扩散，逐渐淡出
            var last = performance.now();
            function tick(now) {
                var dt = Math.min(0.05, (now - last) / 1000); last = now;
                var alive = false;
                pieces.forEach(function (p) {
                    p.life += dt;
                    if (p.life >= p.ttl) { p.el.style.opacity = '0'; return; }
                    alive = true;
                    p.vy += 160 * dt;
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    p.el.style.opacity = String(1 - p.life / p.ttl);
                    p.el.style.transform = 'translate(' + (p.x - cx) + 'px,' + (p.y - cy) + 'px)';
                });
                if (alive) requestAnimationFrame(tick); else layer.remove();
            }
            requestAnimationFrame(tick);
        }

        // 回书架：心门已随镜头出画，改由点击镜之房间背景返回
        function goBack() {
            if (!dsWorld.classList.contains('panned')) return;
            dsWorld.classList.remove('panned');
            if (window.__blDialogKill) window.__blDialogKill();
            if (window.__mirrorBGM) window.__mirrorBGM.exit();
            if (window.__mirrorScene) window.__mirrorScene.leave();   // Canvas 镜子房间：离开复位
            // 切回雪夜：dream 场景据此播 Badeline 出场（stage=dived 时）或补位（appeared 时）
            document.dispatchEvent(new CustomEvent('mirrorstory:back'));
            if (window.__dreamBGM) window.__dreamBGM.resume();   // 回雪夜：Starjump 从暂停处续播
            if (window.CampfireAudio) window.CampfireAudio.resume();    // 回雪夜：篝火接着烧
            if (window.__badelineLeaveRoom) window.__badelineLeaveRoom();
        }
        window.__heartDoorGoBack = goBack;

        door.addEventListener('click', function (e) {
            e.stopPropagation();          // 防止 tryPlayBGM 等全局 click 监听重新播放 bgm
            if (ritual) return;           // CollectRoutine 进行中：忽略（门已淡出）
            if (opened) { panRight(); return; }        // 分裂终态：点击进入镜之房间
            if (splitting) return;                     // 分裂动画播放中：忽略
            if (litNow >= TOTAL) { triggerSplit(); return; }   // 满心就绪：点击可立即触发分裂
            door.classList.add('shake');
            setTimeout(function () { door.classList.remove('shake'); }, 650);
            showToast('心门纹丝不动……（' + litNow + ' / ' + TOTAL + '）');
        });
        // Poem hold 期间点击 → endRitual（backdrop 淡出 + Poem 淡出 → 结束后自动 panRight）
        if (poemEl) {
            poemEl.addEventListener('click', function () {
                if (!poem) return;
                if (poem.phase === 'hold') endRitual();
            });
        }

        // 点击镜之房间背景（非镜子/Badeline）回书架
        var room = document.getElementById('mirrorRoom');
        if (room) {
            room.addEventListener('click', function (e) {
                if (e.target === room) goBack();
            });
        }
    })();

    // 阶段1（心门未全开 · Badeline 未解锁）：0:00–2:11 循环
    // 阶段2（四心齐 · Badeline 解锁）：2:11–4:25 循环
    // 实现：WebAudio 按秒切片 → AudioBufferSourceNode loop=true 采样级无缝循环；
    //       解码失败降级 HTMLAudio + 60ms 轮询回跳；加载失败静默（不影响页面其他功能）
    // ---------------------------------------------------------------------
    // 镜子过场 BGM 时序（源自 Celeste.dll，取证见 docs/celeste-shelf-mirror-rea.md）：
    //   1. 敲镜 = DreamMirror.InteractRoutine → Audio.SetMusic(null)
    //      → Stop(currentMusic, ALLOWFADEOUT)：旧曲淡出（时长在 FMOD 事件里，代码无毫秒值）
    //   2. CS02_Mirror 过场全程不设 Music：只有 pt1 / sequence_mirror / pt2 三个音效
    //   3. OnEnd → Music.Event = event:/music/lvl2/mirror; Apply(false) → start() 直接起播
    //      没有淡入也没有 crossfade（旧轨此时已是 null，Stop 不会再作用）
    // 本仓库只有 bgm/Resurrections.mp3：p1 充当前半段，p2 是 lvl2/mirror 的替身
    // （该事件音源缺失，补档时只改 SRC/P 或接一处独立音源，不要在别处静默换曲）。
    (function () {
        var SRC = 'bgm/Resurrections.mp3';
        var P = { p1: { start: 0, end: 131 }, p2: { start: 131, end: 265 } }; // 2:11=131s，4:25=265s
        var VOL = 0.32;
        // IL 只给了 STOP_MODE.ALLOWFADEOUT，毫秒值在 FMOD 事件资源里查不到。
        // 这里取 1.0s（与 pt1 sting 的 1.0s 前奏同拍），要精确复刻时只改这一个常量。
        var FADE_SEC = 1.0;
        var actx = null, master = null;
        var bufs = {}, ready = false, failed = false, loading = false;
        var cur = null, curPhase = null, wantOn = false;
        var cutSilent = false;      // 过场静默期：拒绝任何 playPhase/refresh 起播
        var fadeTimer = null;       // 淡出结束的定时器（停源 + 复位增益）
        var fbAudio = null, fbPhase = null, fbTimer = null;

        function clearFade() {
            if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
        }
        function resetGain() {
            if (!master || !actx) return;
            try {
                var now = actx.currentTime;
                master.gain.cancelScheduledValues(now);
                master.gain.setValueAtTime(VOL, now);
            } catch (e) {}
        }

        function ensureCtx() {
            if (actx) return actx;
            try {
                actx = Sfx.ac();                 // 与碎裂音效/羽毛合成音共用同一上下文
                if (!actx) { failed = true; return null; }
                master = actx.createGain();
                master.gain.value = VOL;
                master.connect(actx.destination);
            } catch (e) { failed = true; }
            return actx;
        }
        // 自动播放策略兜底：首次任意点击恢复被挂起的上下文
        document.addEventListener('click', function resumeAC() {
            if (actx && actx.state === 'suspended') { actx.resume().catch(function () {}); }
            if (actx && actx.state === 'running') document.removeEventListener('click', resumeAC);
        });

        function badelineUnlocked() {
            // 映射：镜中 Badeline 现身（召唤中且非告别动画）= 解锁状态
            var m = document.getElementById('shelfMirror');
            return !!(m && m.classList.contains('summoned') && !m.classList.contains('bye'));
        }
        function phaseOf() { return badelineUnlocked() ? 'p2' : 'p1'; }

        function preload() {
            if (loading || failed || ready) return;
            if (!ensureCtx()) return;
            loading = true;
            fetch(SRC).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
                .then(function (ab) { return actx.decodeAudioData(ab); })
                .then(function (buf) {
                    ['p1', 'p2'].forEach(function (k) { bufs[k] = sliceBuffer(buf, P[k].start, P[k].end); });
                    ready = true;
                    if (wantOn && !cutSilent) playPhase(phaseOf());   // 过场静默期解码完成也不起播
                })
                .catch(function () { failed = true; if (wantOn && !cutSilent) fbStart(phaseOf()); });
        }
        // 按秒切片：采样级精确（无缝循环的关键——loop 在切片端点处零间隙）
        function sliceBuffer(buf, s, e) {
            var sr = buf.sampleRate;
            var a = Math.max(0, Math.floor(s * sr));
            var b = Math.min(buf.length, Math.floor(e * sr));
            var out = actx.createBuffer(buf.numberOfChannels, b - a, sr);
            for (var ch = 0; ch < buf.numberOfChannels; ch++) {
                out.copyToChannel(buf.getChannelData(ch).subarray(a, b), ch);
            }
            return out;
        }

        function playPhase(ph) {
            if (!ready || !wantOn || cutSilent) return;
            if (curPhase === ph && cur) return;      // 已在播该片段
            stopCur();
            resetGain();                             // 淡出后 master 可能停在 0：起播前复位
            curPhase = ph;
            try {
                cur = actx.createBufferSource();
                cur.buffer = bufs[ph];
                cur.loop = true;
                cur.connect(master);
                cur.start(0, 0);                      // 切换耗时 <10ms
            } catch (e) { cur = null; curPhase = null; }
        }
        function stopCur() {
            try { if (cur) { cur.stop(); cur.disconnect(); } } catch (e) {}
            cur = null; curPhase = null;
        }

        // 降级路径：HTMLAudio + 60ms 轮询回跳（循环点可能有极短接缝，属可接受降级）
        function fbStart(ph) {
            if (cutSilent) return;
            if (!fbAudio) {
                try {
                    fbAudio = new Audio(SRC);
                    fbAudio.volume = VOL;
                    fbAudio.preload = 'auto';
                    fbAudio.addEventListener('error', function () { fbAudio = null; }, { once: true });
                } catch (e) { fbAudio = null; return; }
            }
            fbPhase = ph;
            try { fbAudio.volume = VOL; } catch (e) {}   // 上一次淡出可能把音量压到 0
            var seg = P[ph];
            var seek = function () {
                try { fbAudio.currentTime = seg.start; } catch (e) {}
                fbAudio.play().catch(function () {});
            };
            if (fbAudio.readyState >= 1) seek();
            else fbAudio.addEventListener('loadedmetadata', seek, { once: true });
            if (fbTimer) clearInterval(fbTimer);
            fbTimer = setInterval(function () {
                if (!wantOn || !fbAudio || fbAudio.paused) return;
                var s2 = P[fbPhase];
                if (fbAudio.currentTime >= s2.end || fbAudio.currentTime < s2.start) {
                    try { fbAudio.currentTime = s2.start; } catch (e) {}
                }
            }, 60);
        }
        function fbStop() {
            try { if (fbAudio) fbAudio.pause(); } catch (e) {}
            if (fbTimer) { clearInterval(fbTimer); fbTimer = null; }
        }

        // 敲镜 → 旧曲淡出并进入静默期（IL: Audio.SetMusic(null) → STOP_MODE.ALLOWFADEOUT）
        function beginCut() {
            if (cutSilent) return;
            cutSilent = true;
            clearFade();
            var durMs = FADE_SEC * 1000;
            // WebAudio：master 线性拉到 0（不改各 buffer 的音量，结束后统一停源）
            if (ready && cur && master && actx) {
                try {
                    var now = actx.currentTime;
                    master.gain.cancelScheduledValues(now);
                    master.gain.setValueAtTime(master.gain.value, now);
                    master.gain.linearRampToValueAtTime(0, now + FADE_SEC);
                } catch (e) {}
            }
            // HTMLAudio 降级：没有 gain 节点，按同一时程压 volume
            if (fbAudio) {
                var v0 = fbAudio.volume, t0 = Date.now();
                (function step() {
                    if (!fbAudio) return;
                    var k = Math.min(1, (Date.now() - t0) / durMs);
                    try { fbAudio.volume = Math.max(0, v0 * (1 - k)); } catch (e) {}
                    if (k < 1) setTimeout(step, 50);
                })();
            }
            fadeTimer = setTimeout(function () {
                fadeTimer = null;
                stopCur();
                fbStop();
                resetGain();
            }, durMs + 30);
        }
        // 过场结束 → 硬起下一段（IL: OnEnd 的 Apply(false) 直接 start，无淡入/非 crossfade）
        // ph 缺省按 .summoned 判定；shelf 的召唤比 OnEnd 晚 1.2s（等相机归位），所以显式传 'p2'
        function endCut(ph) {
            clearFade();
            cutSilent = false;
            resetGain();
            if (!wantOn) return;
            ph = ph || phaseOf();
            if (ready) playPhase(ph);
            else if (failed) fbStart(ph);
        }

        function enter() {
            wantOn = true;
            cutSilent = false;      // 重新进房：无论上次是否停在静默期，都复位
            clearFade();
            resetGain();
            preload();
            // 压过全站 BGM，避免两首叠播
            var bp = document.getElementById('bgmPlayer');
            if (bp && !bp.paused) { bp.pause(); window.__mirrorBGMDucked = true; }
            if (ready) playPhase(phaseOf());
            else if (failed) fbStart(phaseOf());
        }
        function exit() {
            wantOn = false;
            cutSilent = false;
            clearFade();
            stopCur();
            fbStop();
            resetGain();
            var bp = document.getElementById('bgmPlayer');
            if (bp && window.__mirrorBGMDucked) { bp.play().catch(function () {}); window.__mirrorBGMDucked = false; }
        }
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stopCur(); fbStop(); }
            else if (wantOn && !cutSilent) { if (ready) playPhase(phaseOf()); else if (failed) fbStart(phaseOf()); }
        });

        window.__mirrorBGM = {
            enter: enter, exit: exit, beginCut: beginCut, endCut: endCut,
            refresh: function () { if (wantOn && !cutSilent) { ready ? playPhase(phaseOf()) : (failed && fbStart(phaseOf())); } },
            // 自检：切片时长 / 当前阶段 / 上下文状态 / 是否处于过场静默
            status: function () {
                return {
                    ready: ready, failed: failed, wantOn: wantOn, cutSilent: cutSilent,
                    fadeSec: FADE_SEC,
                    phase: curPhase || (fbPhase ? 'fb-' + fbPhase : null),
                    ctxState: actx ? actx.state : null,
                    p1Len: bufs.p1 ? bufs.p1.duration : 0,
                    p2Len: bufs.p2 ? bufs.p2.duration : 0
                };
            }
        };
    })();
