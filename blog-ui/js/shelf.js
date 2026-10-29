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
        function draw() {
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
    const savedTime = parseFloat(localStorage.getItem('bgmTimeShelf') || '0');
    if (savedTime > 0) bgmPlayer.currentTime = savedTime;
    bgmPlayer.volume = 0.3;
    bgmPlayer.play().catch(() => {});
    setInterval(() => { localStorage.setItem('bgmTimeShelf', bgmPlayer.currentTime); }, 2000);
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
var PC_SOUNDS = {};
function pcPlay(name) {
    try {
        if (!PC_SOUNDS[name]) PC_SOUNDS[name] = new Audio('celeste-sounds/' + name);
        var a = PC_SOUNDS[name];
        a.currentTime = 0;
        a.volume = 0.9;
        a.play().catch(function(){});
    } catch (e) { }
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
    renderPostcardCanvas(canvas, data.title, data.date, data.content, data.summary, parseInt(localStorage.getItem('diarySaveCount') || '0')).then(function () {
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
    const PAGE_AUDIO = {};
    function playPageSfx(dir) {
        try {
            const list = PAGE_SFX[dir];
            const name = list[Math.floor(Math.random() * list.length)];
            if (!PAGE_AUDIO[name]) PAGE_AUDIO[name] = new Audio('celeste-sounds/' + name);
            const a = PAGE_AUDIO[name];
            a.currentTime = 0;
            a.volume = 0.20;
            a.play().catch(() => {});
        } catch (e) { /* 无声降级 */ }
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
        const res = await api('/diary/list?page=1&pageSize=50&type=day', 'GET');
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
        const res = await api('/diary?diaryId=' + encodeURIComponent(cur.id), 'DELETE');
        if (res.success) { showToast('这一页合上了'); showList(); load(); }
        else showToast(res.msg || '删除失败');
    });
    // 一键发成博客：后端默认私密，再点一次可切换公开/私密
    detail.querySelector('.publish').addEventListener('click', async () => {
        if (!cur) return;
        const btn = detail.querySelector('.publish');
        btn.disabled = true;
        try {
            const res = await api('/articles/publish-from-diary', 'POST', { diaryId: cur.id });
            if (!res.success) { showToast(res.msg || '发布失败'); return; }
            const articleId = res.data && res.data.id;
            const current = res.data && res.data.visibility === 1 ? 1 : 0;
            if (res.data && res.data.existed) {
                // 已发布过：这一下当作切换可见性（公开 ↔ 私密）
                const to = current === 1 ? 0 : 1;
                const r2 = await api('/articles/visibility', 'POST', { articleId, visibility: to });
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
        function getSnaps() {
            try {
                const arr = JSON.parse(localStorage.getItem('diarySnapshots') || '[]');
                return arr.map(s => {
                    if (s.type === 'week') s.label = 'Weekly Recap';
                    else if (s.type === 'month') s.label = 'Monthly Recap';
                    return s;
                });
            } catch (e) { return []; }
        }
        function setSnaps(s) { localStorage.setItem('diarySnapshots', JSON.stringify(s)); }

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
                keySentence: '',
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
                        const res = await api('/diary/emotion-analyze', 'POST', { content: joined.slice(0, 1500) });
                        if (res.success && res.data) emotionData = res.data;
                    } catch (e) {}
                }
                try {
                    const res = await api('/diary/snap-reflect', 'POST', { content: joined.slice(0, 1200), emotion: emotionSummaryText(emotionData) });
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
                    keySentence: emotionData ? (emotionData.keySentence || '') : '',
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
            if (s.keySentence) emotionLine += '\n「' + s.keySentence + '」';
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
        try { owned = JSON.parse(localStorage.getItem('berryOwned') || '[]'); } catch (e) {}
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
            const c = parseInt(localStorage.getItem('diarySaveCount') || '0');
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
            if (document.hidden) return;
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
            if (document.hidden || !curFrames || !curFrames.length) return;
            flameImg.src = curFrames[fi % curFrames.length];
            fi++;
        }, 70);

        function updateBonfire() {
            const fire = document.getElementById('sbFire');
            const s = parseInt(localStorage.getItem('diaryStreak') || '0');
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
        var maskImgs = [];
        for (var mi = 0; mi < 6; mi++) {
            var mk = addLayer('mirrormask' + String(mi).padStart(2, '0') + '.png', 2, 'm-mask', 'm-glass');
            if (mi > 0) mk.style.display = 'none';
            maskImgs.push(mk);
        }
        addLayer('glassfg.png', 3, '', 'm-glass');
        var breakImgs = [];
        for (var bi = 0; bi < 10; bi++) {
            var bk = addLayer('glassbreak' + String(bi).padStart(2, '0') + '.png', 4, '', 'm-glass');
            bk.style.display = 'none';
            breakImgs.push(bk);
        }
        var frameImg = addLayer('frame.png', 5, '', 'm-frame');

        // 截图镜框中心（cropped 2453×1429 中的分数坐标）
        var MR_FX = 1269 / 2453, MR_FY = 936 / 1429;
        // 清除旧调节面板持久化的值，让 CSS 默认值生效
        try { localStorage.removeItem('shelfAdj'); } catch (e) {}
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

        function showFrame(list, idx) {
            list.forEach(function (im, i) { im.style.display = i === idx ? 'block' : 'none'; });
        }

        // 镜内影子慢慢变幻
        var maskFi = 0;
        setInterval(function () {
            if (busy || document.hidden) return;
            maskFi = (maskFi + 1) % maskImgs.length;
            showFrame(maskImgs, maskFi);
        }, 700);

        // Badeline 待机帧已改为 lookingUp.gif（HTML 默认 src），动作树 IIFE 接管所有动作切换
        // —— idle00-08 帧序列与 walk00-11 已删除，不再需要 setInterval 切帧

        // 玻璃碎裂声（WebAudio 合成，点击即手势，无需音频文件）
        function crackSound() {
            try {
                var ctx = window.__mirrorAC || (window.__mirrorAC = new (window.AudioContext || window.webkitAudioContext)());
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
        var blHist = [];
        var blSending = false;
        try {
            blHist = JSON.parse(localStorage.getItem('badelineChatLog') || '[]');
        } catch (e) { blHist = []; }
        if (!Array.isArray(blHist)) blHist = [];

        function heartsPayload() {
            try {
                var h = JSON.parse(localStorage.getItem('heartDoorHearts') || 'null');
                if (!h || !h.length) {
                    var c = JSON.parse(localStorage.getItem('crystalHeart') || 'null');
                    h = c ? [c] : [];
                }
                return JSON.stringify(Array.isArray(h) ? h.slice(-4) : []);
            } catch (e) { return '[]'; }
        }
        function blPersist() {
            try { localStorage.setItem('badelineChatLog', JSON.stringify(blHist.slice(-20))); } catch (e) {}
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
        var BL_SFX = {};
        function blTextboxSfx(which) {
            try {
                var name = 'textbox/ui_game_textbox_madeline_' + which + '.wav';
                if (!BL_SFX[name]) BL_SFX[name] = new Audio('celeste-sounds/' + name);
                var a = BL_SFX[name]; a.currentTime = 0; a.volume = 0.4;
                a.play().catch(function () {});
            } catch (e) { /* 无声降级 */ }
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
            blDialogOpen();
            blStartPortrait(emo);
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
            // 玩家提出"dream 模式"：标记镜子刷新判定，下次进 dream 时 50% 复原 / 50% 保持破碎
            if (/dream/i.test(v)) { try { localStorage.setItem('mirrorReroll', '1'); } catch (e) {} }
            blSending = true;
            blSendBtn.disabled = true;
            var ld = blAdd('loading', '……');
            api('/diary/badeline-chat', 'POST',
                { message: v, history: JSON.stringify(blHist.slice(-10)), hearts: heartsPayload() }, 15000)
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
            try { return localStorage.getItem('mirrorBroken') === '1'; } catch (e) { return false; }
        }
        function byeSheLeaves() {
            badelineWrap.classList.remove('done');     // 离场：移除驻留态，让 badelineBye 动画接管
            mirror.classList.add('bye');
            setTimeout(function () {
                mirror.classList.remove('summoned');
                mirror.classList.remove('bye');
                // 镜子保持破碎（打破后不再自动复原，直到"dream 模式"刷新判定）；碎帧留在镜面
                busy = false;
                if (window.__mirrorBGM) window.__mirrorBGM.refresh(); // 她离开 → 回阶段1（0:00–2:11）
            }, 750);
        }
        document.getElementById('blClose').addEventListener('click', closeChat);

        mirror.addEventListener('click', function () {
            if (busy) return;
            busy = true;
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
            try { localStorage.setItem('mirrorBroken', '1'); } catch (e) {}   // 破碎持久化：持续保持直到刷新判定
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
        function startFreeRoam(initialX, initialY, withFade, fromSummon) {
            if (roaming) return;
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
        // closeChat 钩子：模式 A 返回 'summoned'（让外部走 byeSheLeaves 让她走）；模式 B 返回 'free'（恢复游荡）
        window.__badelineCloseChat = function () {
            if (!roaming) return 'summoned';
            if (summonedMode) {
                stopFreeRoam();           // 模式 A：DOM 复位回 #shelfMirror，让 byeSheLeaves 的 .bye 动画接管
                return 'summoned';
            } else {
                inDialog = false;         // 模式 B：恢复游荡（若积了生气情绪 → 先 roll）
                if (pendingRoll) enterRollChain(); else enterMode('roam');
                return 'free';
            }
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
        function makeStar(prefillDelay) {
            var t = TYPES[Math.floor(Math.random() * TYPES.length)];
            var el = document.createElement('i');
            el.className = 'star';
            el.style.width = el.style.height = SIZE + 'px';
            el.style.background = cache[t][Math.floor(Math.random() * FRAMES)];
            el.style.setProperty('--x', (Math.random() * 96).toFixed(1) + '%');
            el.style.setProperty('--dist', (room.clientHeight + 64) + 'px');
            var dur = 6 + Math.random() * 9;                 // 下降时长：6–15s
            el.style.animationDuration = dur.toFixed(2) + 's';
            if (prefillDelay > 0) el.style.animationDelay = (-prefillDelay).toFixed(2) + 's';
            var frameIdx = Math.floor(Math.random() * FRAMES);
            var interval = setInterval(function () {
                if (!el.parentNode) { clearInterval(interval); return; }
                frameIdx = (frameIdx + 1) % FRAMES;
                el.style.background = cache[t][frameIdx];
            }, 160 + Math.random() * 160);                   // 切帧也略快
            el.addEventListener('animationend', function () { el.remove(); });
            layer.appendChild(el);
        }

        var wasPanned = false;
        function spawn() {
            var panned = !document.hidden && dsWorld.classList.contains('panned');
            if (panned) {
                if (!wasPanned) {
                    // 刚进入镜之房间：一次性预填满屏，各粒子处于随机下落相位（不再从零慢慢积累）
                    layer.innerHTML = '';
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
        }
    })();

    // ===== dream 金羽毛：REA 还原第六章（Reflection）FlyFeather + 星飞 StStarFly =====
    // 待机 FlyFeather：精灵 loop(idle00-20) ↔ flash(00-20) 逐帧 0.06s；sine(0.6Hz) 上下 ±2 世界像素浮动；
    //   light/bloom 柔光；重生瞬间 wiggler(1s / 4Hz) 弹一下（Scale = 1 + Value * 0.2）
    // 收集 OnPlayer → CollectRoutine：Shake(0.3) → sprite.Visible=false → 0.05s 后 P_Collect×10 + SlashFx
    // 星飞 StStarFly：Speed=dir×250；无输入 91 / 逆向 140 / 顺向 140→190（1000/s 逼近）；
    //   moveDir 以 5.585rad/s 追输入；每 0.02s 发射 P_Flying；starFlyTimer=2s；末 0.5s 每 0.05s 警告闪
    // 结束 → P_Boost×12；羽毛 3s 后（respawnTimer）原位重生 + P_Respawn×16
    // 对页面里的 Madeline 不做任何交互（不驱动玩家、无变身）
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
        IMG.rect = loadImg('Atlases/Gameplay/particles/rect.png');          // P_Flying（默认 Source）
        IMG.smoke = loadImg('Atlases/Gameplay/particles/smoke0.png');       // P_Regen / P_Respawn（Dust 系）
        ['00', '01', '02', '03'].forEach(function (k) { IMG.slash.push(loadImg('Atlases/Gameplay/effects/slash/' + k + '.png')); });

        // ---------- 数值（均取自 Celeste.dll IL / Sprites.xml） ----------
        var FRAME_MS = 60;             // <Anim delay="0.06"/>
        var FRAMES_HALF = 21;          // idle / flash 各 21 帧
        var RESPAWN_MS = 3000;         // respawnTimer = 3
        var FLY_TIME = 2;              // starFlyTimer = 2
        var WARN_TIME = 0.5;           // timer < 0.5 开始警告闪
        var WARN_STEP = 0.05;
        var CHARGE = 0.26;             // startStarFly 播完 + Speed==Zero 再等 0.1s（压缩到点击手感）
        var TURN_RATE = 5.5850534;     // RotateTowards(..., 5.5850534 * dt)
        var ACCEL = 1000;              // Approach(|Speed|, target, 1000 * dt)
        var V_START = 250, V_IDLE = 91, V_TURN = 140, V_FAST = 190;
        var SLASH_FRAME = 0.1, SLASH_LIFE = 0.4;   // SlashFx：<Anim delay="0.1" frames 0-3>
        // 像素倍率：场景其它美术都是 3 倍（篝火 64→~200px、Madeline 32→~100px），
        // 所以原图 32px 对应 CSS 96px；canvas 再按 devicePixelRatio 取整数倍，保证一个美术像素=整数设备像素
        var DPR = 1, SPR_S = 3, FSIZE = 96, PXF = 3;
        var GAP_MIN = 144, GAP_MAX = 288, GAP_FLOOR = 101;
        var GOLD = [[255, 253, 240], [255, 235, 140], [255, 203, 52], [206, 130, 16]];
        var RED = [[255, 244, 238], [255, 158, 130], [232, 84, 62], [150, 32, 28]];

        // ---------- 粒子（ParticleTypes::Load 里 FlyFeather.P_* 的字段值，逐条来自 IL） ----------
        // P_Collect: Source=particles/feather, Color=FlyPowerHairColor, Color2=fff20f, ColorMode/FadeMode=2,
        //            RotationMode=1, Size=1, Life .6-.9, Speed 60-70, SpeedMultiplier .1, DirectionRange 2π,
        //            SpinFlippedChance=1, SpinMin 30° SpinMax 80°
        // P_Boost  : new ParticleType(P_Collect) { DirectionRange 80°, Speed 20-80, SpeedMultiplier .2 }
        // P_Flying : 默认 Source(rect), 同色, FadeMode 2, Size 1, Life .4-.8, Speed 60-70, mult .25, dirRange 60°
        // P_Respawn: new ParticleType(P_Regen=P_Dust) { Color ffdca4, Color2 ffe95e }, Life .8-1.6, Speed 8-12, Size 1.2±.5
        var PT = {
            collect: { tex: 'feather', cols: ['#f2eb6d', '#fff20f'], dir: Math.PI * 2, spd: [60, 70], mult: 0.1, life: [0.6, 0.9], size: 1, sizeRange: 0, spin: [Math.PI / 6, 1.3962634], spinChance: 1 },
            boost: { tex: 'feather', cols: ['#f2eb6d', '#fff20f'], dir: 1.3962634, spd: [20, 80], mult: 0.2, life: [0.6, 0.9], size: 1, sizeRange: 0, spin: [Math.PI / 6, 1.3962634], spinChance: 1 },
            flying: { tex: 'rect', cols: ['#f2eb6d', '#fff20f'], dir: 1.0471976, spd: [60, 70], mult: 0.25, life: [0.4, 0.8], size: 1, sizeRange: 0, spin: [0, 0], spinChance: 0 },
            respawn: { tex: 'smoke', cols: ['#ffdca4', '#ffe95e'], dir: Math.PI * 2, spd: [8, 12], mult: 0.9, life: [0.8, 1.6], size: 1.2, sizeRange: 0.5, spin: [0, 0], spinChance: 0 }
        };

        // ---------- 状态 ----------
        var active = false, raf = 0, prevT = 0, clock = 0;
        var feathers = [], placed = [], orb = null, parts = [], slashes = [], ghosts = [];
        var keys = {}, keysActive = false;
        var cv = null, ctx2 = null, hint = null, shakeTimer = null;
        var orbCache = { size: 0, px: 0, gold: null, red: null, glow: null };
        var TINTS = {};
        var DIR_KEYS = { arrowup: 1, arrowdown: 1, arrowleft: 1, arrowright: 1, w: 1, a: 1, s: 1, d: 1 };

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
        function hash(a, b) { var v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); }
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
        function orbCellPx() { return Math.max(2, Math.round(FSIZE / 16)); }
        function orbRadius() { return orbCellPx() * 6; }
        function featherCenter(f) {
            return { x: f.x / 100 * left.clientWidth, y: f.y / 100 * left.clientHeight };
        }

        // ---------- 粒子 ----------
        function emit(type, n, x, y, rangePx, baseAngle) {
            for (var k = 0; k < n; k++) {
                var ang = baseAngle + (Math.random() - 0.5) * type.dir;
                var spd = (type.spd[0] + Math.random() * (type.spd[1] - type.spd[0])) * PXF;
                var spin = 0;
                if (type.spinChance) {
                    spin = type.spin[0] + Math.random() * (type.spin[1] - type.spin[0]);
                    if (Math.random() < type.spinChance) spin = -spin;   // SpinFlippedChance
                }
                parts.push({
                    x: x + (Math.random() - 0.5) * 2 * rangePx,
                    y: y + (Math.random() - 0.5) * 2 * rangePx,
                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                    rot: Math.random() * Math.PI * 2, spin: spin,
                    mult: type.mult, tex: type.tex, col: type.cols[Math.random() < 0.5 ? 0 : 1],
                    life: 0, ttl: type.life[0] + Math.random() * (type.life[1] - type.life[0]),
                    sz: Math.max(0.5, (type.size + (Math.random() - 0.5) * type.sizeRange) * PXF)
                });
            }
        }

        // ---------- 音效（无原版音源，WebAudio 合成；复用镜之房间的共享 AudioContext） ----------
        var AC = null;
        function sfx(kind) {
            try {
                AC = AC || window.__mirrorAC;
                if (!AC) {
                    var C = window.AudioContext || window.webkitAudioContext;
                    if (!C) return;
                    AC = window.__mirrorAC = new C();
                }
                if (AC.state === 'suspended') AC.resume();
                var t0 = AC.currentTime, g = AC.createGain(), o = AC.createOscillator();
                o.connect(g); g.connect(AC.destination);
                g.gain.setValueAtTime(0.0001, t0);
                if (kind === 'boost') {
                    o.type = 'sawtooth';
                    o.frequency.setValueAtTime(360, t0);
                    o.frequency.exponentialRampToValueAtTime(900, t0 + 0.09);
                    g.gain.linearRampToValueAtTime(0.05, t0 + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
                    o.start(t0); o.stop(t0 + 0.18);
                } else if (kind === 'end') {
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(720, t0);
                    o.frequency.exponentialRampToValueAtTime(260, t0 + 0.25);
                    g.gain.linearRampToValueAtTime(0.06, t0 + 0.015);
                    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
                    o.start(t0); o.stop(t0 + 0.32);
                } else {
                    var f0 = kind === 'get' ? 760 : (kind === 'renew' ? 620 : 480);
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(f0, t0);
                    o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t0 + 0.13);
                    g.gain.linearRampToValueAtTime(kind === 'reappear' ? 0.05 : 0.085, t0 + 0.012);
                    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
                    o.start(t0); o.stop(t0 + 0.26);
                }
            } catch (e) { /* 无声降级 */ }
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
            cv.width = Math.max(1, left.clientWidth);
            cv.height = Math.max(1, left.clientHeight);
            ctx2 = cv.getContext('2d');
            ctx2.imageSmoothingEnabled = false;
            orbCache.size = 0;
        }
        function showHint(on) {
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'featherFlyHint';
                hint.textContent = '方向键 / WASD 操控 · Esc 让羽毛回来';
                scene.appendChild(hint);
            }
            hint.classList.toggle('show', !!on);
        }
        function shake() {
            clearTimeout(shakeTimer);
            left.classList.remove('ff-shake');
            void left.offsetWidth;
            left.classList.add('ff-shake');
            shakeTimer = setTimeout(function () { left.classList.remove('ff-shake'); }, 380);
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
        function ramp(stops, t) {
            var f = t * (stops.length - 1), i0 = Math.floor(f), i1 = Math.min(stops.length - 1, i0 + 1), m = f - i0;
            var a = stops[i0], b = stops[i1];
            return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * m) + ',' +
                            Math.round(a[1] + (b[1] - a[1]) * m) + ',' +
                            Math.round(a[2] + (b[2] - a[2]) * m) + ')';
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
        // 光球像素格（确定性 hash → 逐帧不闪；两套色板对应 starFlyColor ↔ NormalHairColor 警告闪）
        function buildOrb() {
            var px = orbCellPx(), n = 6, tmp = [];
            for (var gy = -n; gy <= n; gy++) {
                for (var gx = -n; gx <= n; gx++) {
                    var d = Math.sqrt(gx * gx + gy * gy);
                    if (d > n + 0.2) continue;
                    var t = Math.min(1, d / n) + (hash(gx * 3 + 1, gy * 7 - 2) - 0.5) * 0.12;
                    t = Math.max(0, Math.min(1, t));
                    tmp.push({ dx: gx * px, dy: gy * px, cg: ramp(GOLD, t), cr: ramp(RED, t) });
                }
            }
            orbCache.size = FSIZE;
            orbCache.px = px;
            orbCache.gold = tmp.map(function (c) { return { dx: c.dx, dy: c.dy, c: c.cg }; });
            orbCache.red = tmp.map(function (c) { return { dx: c.dx, dy: c.dy, c: c.cr }; });
            orbCache.glow = makeGlow(px * 12);
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
                x: p.x, y: p.y, phase: Math.random() * Math.PI * 2,
                state: 'idle', respawnAt: 0, burstAt: 0, burstAng: 0, renewAt: 0,
                wigT: -1, wigDur: 1, wigFreq: 4, drawn: -1
            };
            applyScale(f);
            b.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                onFeatherClick(f);
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
        function onFeatherClick(f) {
            if (!active || f.state !== 'idle' || orb) return;
            startStarFly(f);
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
                var bob = f.state === 'idle'
                    ? Math.round(Math.sin(clock * 0.001 * Math.PI * 2 * 0.6 + f.phase) * 2 * PXF)
                    : 0;
                // wiggler.MoveNext：Value = cos(sineCounter) * Counter，Counter 从 1 线性衰减到 0
                // → Scale = One * (1 + Value * 0.2)，重生瞬间是 1.2 倍，随后带余弦抖动收回
                var sc = 1;
                if (f.wigT >= 0) {
                    f.wigT += dt;
                    if (f.wigT >= f.wigDur) f.wigT = -1;
                    else sc = 1 + 0.2 * Math.cos(f.wigT * Math.PI * 2 * f.wigFreq) * (1 - f.wigT / f.wigDur);
                }
                f.el.style.transform = 'translate(-50%,-50%)' +
                    (bob ? ' translateY(' + bob + 'px)' : '') +
                    (sc !== 1 ? ' scale(' + sc.toFixed(3) + ')' : '');
            }
        }

        // ---------- 星飞光球（StStarFly 逐行移植） ----------
        function startStarFly(f) {
            var c = featherCenter(f);
            var dir = inputDir() || { x: 1, y: 0 };
            orb = {
                x: c.x, y: c.y, mx: dir.x, my: dir.y, last: dir,
                len: 0, lerp: 0, glow: 0,
                charge: 0, timer: FLY_TIME, emitT: 0, ghostT: 0,
                warnT: 0, flash: false
            };
            f.state = 'wait';
            f.respawnAt = nowMs() + RESPAWN_MS;    // 必须用真实时刻：clock 是上一帧时间戳，掉帧时会偏旧
            f.el.classList.add('wait');
            f.drawn = -1;
            f.burstAt = nowMs() + 50;              // CollectRoutine：隐藏后再等 0.05s
            f.burstAng = Math.atan2(dir.y, dir.x);
            shake();                                    // level.Shake(0.3)
            showHint(true);
            bindActive(true);
            ensureCanvas();
            sfx('get');
        }
        function stepOrb(dt) {
            if (!orb) return;
            var o = orb;
            o.glow = approach(o.glow, 1, dt * 4);       // light.Alpha = Approach(..., dt*4)

            if (o.charge < CHARGE) {
                // starFlyTransforming：Speed = Approach(Speed, Zero, 1000 * dt)
                o.charge += dt;
                o.len = approach(o.len, 0, ACCEL * PXF * dt);
                if (o.charge >= CHARGE) {
                    o.timer = FLY_TIME;
                    o.len = V_START * PXF;              // Speed = dir * 250
                    o.mx = o.last.x; o.my = o.last.y;
                    emit(PT.boost, 12, o.x, o.y, 4 * PXF, Math.atan2(-o.my, -o.mx));
                    shake();
                    sfx('boost');
                }
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

            var target;
            if (idle) { o.lerp = 0; target = V_IDLE; }
            else if (dot(m, dir) >= 0.45) { o.lerp = approach(o.lerp, 1, dt); target = V_TURN + (V_FAST - V_TURN) * o.lerp; }
            else { o.lerp = 0; target = V_TURN; }

            o.len = approach(o.len, target * PXF, ACCEL * PXF * dt);   // Approach(|Speed|, target, 1000 * dt)
            o.x += o.mx * o.len * dt;
            o.y += o.my * o.len * dt;

            // 房间边界（左屏）：贴边滑行
            var w = left.clientWidth, h = left.clientHeight, R = orbRadius();
            if (o.x < R) { o.x = R; o.len *= 0.94; }
            if (o.x > w - R) { o.x = w - R; o.len *= 0.94; }
            if (o.y < R) { o.y = R; o.len *= 0.94; }
            if (o.y > h - R) { o.y = h - R; o.len *= 0.94; }

            // Scene.OnInterval(0.02) → Emit(P_Flying, 1, Center, One*2, Angle(-Speed))
            o.emitT += dt;
            while (o.emitT >= 0.02) {
                o.emitT -= 0.02;
                emit(PT.flying, 1, o.x, o.y, 2 * PXF, Math.atan2(-o.my, -o.mx));
            }
            // 网页端补一点运动残影（原作靠 P_Flying 粒子；这里让快速移动更连贯）
            o.ghostT += dt;
            if (o.ghostT >= 0.03) {
                o.ghostT = 0;
                if (orbCache.glow) ghosts.push({ x: o.x, y: o.y, t: 0, ttl: 0.12 });
            }

            // starFlyTimer -= DeltaTime；末 0.5s 每 0.05s 在 starFlyColor ↔ NormalHairColor 间闪
            o.timer -= dt;
            if (o.timer < WARN_TIME) {
                o.warnT += dt;
                if (o.warnT >= WARN_STEP) { o.warnT = 0; o.flash = !o.flash; }
            }
            if (o.timer <= 0) { endFly(false); return; }

            // 飞行中碰到别的羽毛 → feather_renew：timer 回满，羽毛不消失
            for (var k = 0; k < feathers.length; k++) {
                var f = feathers[k];
                if (f.state !== 'idle' || nowMs() < f.renewAt) continue;
                var fc = featherCenter(f);
                if (Math.hypot(fc.x - o.x, fc.y - o.y) > R + FSIZE * 0.42) continue;
                f.renewAt = nowMs() + 500;
                f.wigT = 0; f.wigDur = 1; f.wigFreq = 4;
                o.timer = FLY_TIME; o.flash = false; o.warnT = 0;
                emit(PT.boost, 4, fc.x, fc.y, 2 * PXF, Math.atan2(-o.my, -o.mx));
                sfx('renew');
            }
        }
        function endFly(silent) {
            bindActive(false);
            showHint(false);
            if (!orb) return;
            var o = orb;
            orb = null;
            if (silent) return;
            // StarFlyEnd：P_Boost ×12（Angle(-Speed)）+ 光球余晖
            emit(PT.boost, 12, o.x, o.y, 4 * PXF, Math.atan2(-o.my, -o.mx));
            ghosts.push({ x: o.x, y: o.y, t: 0, ttl: 0.2 });
            sfx('end');
        }
        function stepFx(dt) {
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                p.life += dt;
                if (p.life >= p.ttl) { parts.splice(i, 1); continue; }
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.rot += p.spin * dt;                      // RotationMode=1：粒子自转（SpinMin 30°~SpinMax 80°/s）
                var drag = Math.pow(p.mult, dt);           // SpeedMultiplier：每秒按该系数衰减
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
            for (var g = ghosts.length - 1; g >= 0; g--) {
                ghosts[g].t += dt;
                if (ghosts[g].t >= ghosts[g].ttl) ghosts.splice(g, 1);
            }
            if (parts.length > 400) parts.splice(0, parts.length - 400);
        }

        // ---------- 渲染 ----------
        function drawOrb(o) {
            if (orbCache.size !== FSIZE) buildOrb();
            var cx = Math.round(o.x), cy = Math.round(o.y), half = orbCache.px >> 1;
            if (orbCache.glow && o.glow > 0.02) {
                ctx2.globalAlpha = 0.6 * o.glow;           // starFlyBloom.Alpha → 0.7
                var gs = orbCache.glow;
                ctx2.drawImage(gs, cx - gs.width / 2, cy - gs.height / 2 - orbCache.px * 1.5);
                ctx2.globalAlpha = 1;
            }
            var cells = o.flash ? orbCache.red : orbCache.gold;
            for (var i = 0; i < cells.length; i++) {
                ctx2.fillStyle = cells[i].c;
                ctx2.fillRect(cx + cells[i].dx - half, cy + cells[i].dy - half, orbCache.px, orbCache.px);
            }
            if (o.charge < CHARGE) {                       // 变形期白闪（startStarFly 起手）
                var q = 1 - o.charge / CHARGE;
                ctx2.globalAlpha = q * 0.85;
                ctx2.fillStyle = '#fffdf2';
                ctx2.beginPath();
                ctx2.arc(cx, cy, orbCache.px * (2 + 4 * q), 0, Math.PI * 2);
                ctx2.fill();
                ctx2.globalAlpha = 1;
            }
        }
        function drawFrame() {
            if (!ctx2) return;
            ctx2.clearRect(0, 0, cv.width, cv.height);

            // 1) 光球余晖 / 运动残影
            if (orbCache.glow) {
                for (var g = 0; g < ghosts.length; g++) {
                    var gh = ghosts[g], ga = 1 - gh.t / gh.ttl;
                    ctx2.globalAlpha = ga * 0.42;
                    ctx2.drawImage(orbCache.glow, gh.x - orbCache.glow.width / 2, gh.y - orbCache.glow.height / 2);
                }
                ctx2.globalAlpha = 1;
            }

            // 2) 粒子（P_Collect / P_Boost 用 feather 贴图并自转，P_Flying 用 rect，P_Respawn 用 smoke0）
            for (var k = 0; k < parts.length; k++) {
                var p = parts[k];
                var a = 1 - p.life / p.ttl;                // FadeMode=2：随寿命淡出
                if (a <= 0.02) continue;
                ctx2.globalAlpha = a;
                var tex = tintFor(p.tex, p.col);
                if (tex) {
                    var dw = tex.width * p.sz, dh = tex.height * p.sz;
                    if (p.spin) {
                        ctx2.save();
                        ctx2.translate(p.x, p.y);
                        ctx2.rotate(p.rot);
                        ctx2.drawImage(tex, -dw / 2, -dh / 2, dw, dh);
                        ctx2.restore();
                    } else {
                        ctx2.drawImage(tex, p.x - dw / 2, p.y - dh / 2, dw, dh);
                    }
                } else {
                    ctx2.fillStyle = p.col;
                    ctx2.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
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
        }
        function onKeyUp(e) { var k = (e.key || '').toLowerCase(); if (DIR_KEYS[k]) keys[k] = false; }
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
            var x = 0, y = 0;
            if (keys.arrowleft || keys.a) x -= 1;
            if (keys.arrowright || keys.d) x += 1;
            if (keys.arrowup || keys.w) y -= 1;
            if (keys.arrowdown || keys.s) y += 1;
            if (!x && !y) return null;
            var l = Math.sqrt(x * x + y * y);
            return { x: x / l, y: y / l };
        }

        // ---------- dream 进出 ----------
        function countFeathers(done) {
            if (typeof api !== 'function') { done(3); return; }
            api('/feather/count', 'GET').then(function (res) {
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
            bindTrack(true);
            host.innerHTML = '';
            feathers = []; placed = []; parts = []; slashes = []; ghosts = []; orb = null;
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
            host.innerHTML = '';
            feathers = []; placed = []; parts = []; slashes = []; ghosts = []; orb = null;
            if (ctx2 && cv) ctx2.clearRect(0, 0, cv.width, cv.height);
        }

        document.addEventListener('dream:entered', enterDream);
        document.addEventListener('dream:exiting', exitDream);
        window.addEventListener('resize', function () {
            if (!active) return;
            updateSizes();
            resizeCanvas();
            for (var k = 0; k < feathers.length; k++) applyScale(feathers[k]);
        });
        window.addEventListener('blur', function () { keys = {}; });
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
            return api('/diary/list?page=1&pageSize=50&type=dream', 'GET').then(function (res) {
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
            playSeq(idle, 80, true);
            return { flash: flash, playSeq: playSeq, playIdle: function () { playSeq(idle, 80, true); }, busy: false };
        })();
        // 记梦入口：点击 dream 场景现有的绿色篝火本身
        document.getElementById('dsFire').addEventListener('click', function () {
            // 镜子刷新机制：玩家提出过"dream 模式"后再次进 dream → 50% 保持破碎 / 50% 恢复完好
            try {
                if (localStorage.getItem('mirrorReroll') === '1') {
                    localStorage.removeItem('mirrorReroll');
                    if (localStorage.getItem('mirrorBroken') === '1' && Math.random() < 0.5) {
                        localStorage.removeItem('mirrorBroken');   // 恢复完好（呈现于下次进镜之房间）
                    }
                }
            } catch (e) {}
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
            api('/diary/dream', 'POST', { title: titleEl.value.trim(), content: content }, 20000)
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
            api('/diary/dream-night-talk', 'POST', { dreamId: id, message: '', history: '[]' }, 20000)
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
            api('/diary/dream-night-talk', 'POST',
                { dreamId: ntDreamId, message: v, history: JSON.stringify(ntHist.slice(-10)) }, 20000)
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
        var pool = {};
        NAMES.forEach(function (n) {
            var a = new Audio(DIR + n + '.wav');
            a.preload = 'auto'; a.volume = VOL; a.muted = false;
            pool[n] = a;
        });
        // play 支持多实例：每次 new Audio 避免同标签重入打断
        function play(name) {
            var src = pool[name]; if (!src) return;
            var a = new Audio(src.src); a.volume = VOL; a.play().catch(function () {});
        }
        window.__hdSfx = { play: play };
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
        var splitDone = false;
        try { splitDone = localStorage.getItem('heartDoorSplit') === '1'; } catch (e) {}
        if (splitDone) { opened = true; door.classList.add('split'); }

        // ===== 开启条件：四心为初始条件——心门由商店炼制的水晶心驱动（heartDoorHearts 数组） =====
        // 每炼一颗心点亮一颗，满 TOTAL 颗门就绪；之后继续炼心不再进门，只改变 Badeline 人格
        // 预览可加 ?opendoor 强制点亮全部
        function forceOpen() { return new URLSearchParams(location.search).has('opendoor'); }
        function targetOf() {
            if (forceOpen()) return TOTAL;
            var n = 0;
            try {
                var arr = JSON.parse(localStorage.getItem('heartDoorHearts') || 'null');
                if (Array.isArray(arr) && arr.length) n = arr.length;
                else {
                    var c = JSON.parse(localStorage.getItem('crystalHeart') || 'null');
                    n = (c && c.color) ? 1 : 0;
                }
            } catch (e) {}
            return Math.max(0, Math.min(TOTAL, n));
        }
        function persist() { try { localStorage.setItem('heartDoorLit', String(litNow)); } catch (e) {} }
        function refreshState() {
            door.classList.toggle('locked', litNow < TOTAL);
            door.classList.toggle('ready', litNow >= TOTAL && !opened && !splitting);
        }
        function paint(im, lit) { im.src = lit ? 'heartdoor/icon06.png' : 'heartdoor/icon00.png'; }

        // 极光色像素星点：天空与桥底下随机位置闪烁（蓝/绿，每点独立节奏）
        (function initAuroraStars() {
            var host = document.querySelector('#dreamScene .ds-left');
            var box = document.getElementById('dsAStars');
            if (!host || !box || box.children.length) return;
            for (var k = 0; k < 30; k++) {
                var i = document.createElement('i');
                var sky = Math.random() < 0.62;                                  // 62% 天空、38% 桥底下
                i.style.left = (2 + Math.random() * 96).toFixed(2) + '%';
                i.style.top = (sky ? 6 + Math.random() * 28 : 55 + Math.random() * 17).toFixed(2) + '%';
                i.style.background = Math.random() < 0.5 ? '#6fd8ff' : '#7dffc8';
                i.style.setProperty('--dur', (0.9 + Math.random() * 1.1).toFixed(2) + 's');
                i.style.setProperty('--del', (Math.random() * 3.5).toFixed(2) + 's');
                document.getElementById('dsAStars').appendChild(i);
            }
        })();

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
            if (!poem) { if (poemEl) poemEl.style.opacity = '0'; return; }
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
            tickRitual(rdt);
            updatePoem(rdt);
            drawPoem();
            requestAnimationFrame(poemTick);
        }
        requestAnimationFrame(poemTick);

        // 从 localStorage 拿最近那颗心的颜色和文案（heartCrystalDay / crystalHeart 兜底）
        function latestHeartMeta() {
            try {
                var hc = JSON.parse(localStorage.getItem('heartCrystalDay') || 'null');
                if (hc && POEM_COLORS[hc.color]) return { color: hc.color, title: hc.title || '一道光', desc: hc.desc || undefined };
                var ch = JSON.parse(localStorage.getItem('crystalHeart') || 'null');
                if (ch && POEM_COLORS[ch.color]) return { color: ch.color, title: ch.title || '一道光', desc: ch.desc || undefined };
            } catch (e) {}
            return { color: 'blue', title: '一道光', desc: '照进心里最柔软的角落' };
        }

        // 一次性开门 → CollectRoutine 前置仪式（Freeze → AbsorbOrb+Flash+Backdrop+2s slow → Poem 淡入）
        // Poem hold → 点击 → 淡出 → 自动 panRight 进镜之房间
        function triggerSplit() {
            if (splitDone || splitting || ritual) return;
            splitting = true;
            door.classList.remove('ready');
            door.title = '走进门后……';
            try { localStorage.setItem('heartDoorSplit', '1'); } catch (e) {}
            // 隐藏门 DOM（fade out 动画），Poem 期间不显示
            door.style.transition = 'opacity 0.4s ease';
            door.style.opacity = '0';
            // 启动 CollectRoutine 状态机（Freeze → slow → Poem）
            startRitual();
            // Poem 淡出结束 → 自动 panRight（hook poem phase='out' → !poem）
            var hook = setInterval(function () {
                if (!poem) {
                    clearInterval(hook);
                    splitDone = true; opened = true; splitting = false;
                    // 恢复门可见（镜之房间侧仍保留 split 态）
                    door.classList.add('split');
                    door.style.opacity = ''; door.style.transition = '';
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
        function applyTarget(target, animate) {
            target = Math.max(0, Math.min(TOTAL, target));
            var seq = ++applySeq;
            // 第一次有心点亮 → heartdoor_entry
            if (animate && litNow === 0 && target > 0 && window.__hdSfx) window.__hdSfx.play('heartdoor_entry');
            if (target <= litNow || !animate) {
                hearts.forEach(function (im, i) { paint(im, i < target); });
                litNow = target; persist(); refreshState();
                if (target >= TOTAL) {
                    // 满心静默校正 → frontdoor_unlock
                    if (window.__hdSfx) window.__hdSfx.play('frontdoor_unlock');
                    maybePlaySplit(650);
                }
                return;
            }
            refreshState();                    // 动画期间保持锁定
            hearts.forEach(function (im, i) { if (i < litNow) paint(im, true); });  // 先还原已有进度，再逐颗点亮新增
            (function next() {
                if (seq !== applySeq) return;  // 已被更新的推进取代，整链作废
                if (litNow >= target) {
                    persist(); refreshState();
                    if (target >= TOTAL) {
                        // 最后一颗 pop 落定 → frontdoor_unlock
                        if (window.__hdSfx) window.__hdSfx.play('frontdoor_unlock');
                        maybePlaySplit(580);
                    }
                    return;
                }
                var idx = litNow;  // 当前要填第几颗（0-based，对应 heartfill idx+1）
                fillHeart(hearts[litNow], function () {
                    if (seq !== applySeq) return;   // 过期链不计进度
                    // 每颗心填充完成 → frontdoor_heartfill_{idx+1}
                    if (window.__hdSfx) window.__hdSfx.play('frontdoor_heartfill_' + (idx + 1));
                    litNow++; setTimeout(next, 300);
                });
            })();
        }

        // 初始：按已炼心数恢复（heartDoorHearts 驱动，有新增则动画点亮）
        var saved = parseInt(localStorage.getItem('heartDoorLit') || '0', 10);
        litNow = Math.max(0, Math.min(TOTAL, isNaN(saved) ? 0 : saved));
        applyTarget(targetOf(), litNow < targetOf());

        // 书架日记加载完成后推进进度（按已炼心数，真实数据优先）
        window.__setDoorProgress = function () { applyTarget(targetOf(), true); };

        function panRight() {
            dsWorld.classList.add('panned');
            if (window.__dreamBGM) window.__dreamBGM.pause();   // Starjump 暂停留位，让位 Resurrections
            if (window.CampfireAudio) window.CampfireAudio.suspend();   // 镜之房间不要篝火声
            // 不再 door.classList.add('away') — 心门在镜之房间侧只露一半，可点击回书架
            if (window.__mirrorBGM) window.__mirrorBGM.enter();
            // 镜子破碎态优先：破碎 → 碎镜呈现 + Badeline 强制出场；完好 → 随机模式 A/B
            if (!(window.__mirrorState && window.__mirrorState.sync())) {
                if (window.__badelineEnterRoom) window.__badelineEnterRoom();
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
            // 爆裂音：高频噪声 + 水晶 ping
            try {
                var AC = window.__mirrorAC || (window.__mirrorAC = new (window.AudioContext || window.webkitAudioContext)());
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
    (function () {
        var SRC = 'bgm/Resurrections.mp3';
        var P = { p1: { start: 0, end: 131 }, p2: { start: 131, end: 265 } }; // 2:11=131s，4:25=265s
        var VOL = 0.32;
        var actx = null, master = null;
        var bufs = {}, ready = false, failed = false, loading = false;
        var cur = null, curPhase = null, wantOn = false;
        var fbAudio = null, fbPhase = null, fbTimer = null;

        function ensureCtx() {
            if (actx) return actx;
            try {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { failed = true; return null; }
                actx = window.__mirrorAC || new AC();   // 与碎裂音效共用上下文
                window.__mirrorAC = actx;
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
                    if (wantOn) playPhase(phaseOf());
                })
                .catch(function () { failed = true; if (wantOn) fbStart(phaseOf()); });
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
            if (!ready || !wantOn) return;
            if (curPhase === ph && cur) return;      // 已在播该片段
            stopCur();
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
            if (!fbAudio) {
                try {
                    fbAudio = new Audio(SRC);
                    fbAudio.volume = VOL;
                    fbAudio.preload = 'auto';
                    fbAudio.addEventListener('error', function () { fbAudio = null; }, { once: true });
                } catch (e) { fbAudio = null; return; }
            }
            fbPhase = ph;
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

        function enter() {
            wantOn = true;
            preload();
            // 压过全站 BGM，避免两首叠播
            var bp = document.getElementById('bgmPlayer');
            if (bp && !bp.paused) { bp.pause(); window.__mirrorBGMDucked = true; }
            if (ready) playPhase(phaseOf());
            else if (failed) fbStart(phaseOf());
        }
        function exit() {
            wantOn = false;
            stopCur();
            fbStop();
            var bp = document.getElementById('bgmPlayer');
            if (bp && window.__mirrorBGMDucked) { bp.play().catch(function () {}); window.__mirrorBGMDucked = false; }
        }
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { stopCur(); fbStop(); }
            else if (wantOn) { if (ready) playPhase(phaseOf()); else if (failed) fbStart(phaseOf()); }
        });

        window.__mirrorBGM = {
            enter: enter, exit: exit,
            refresh: function () { if (wantOn) { ready ? playPhase(phaseOf()) : (failed && fbStart(phaseOf())); } },
            // 自检：切片时长 / 当前阶段 / 上下文状态
            status: function () {
                return {
                    ready: ready, failed: failed, wantOn: wantOn,
                    phase: curPhase || (fbPhase ? 'fb-' + fbPhase : null),
                    ctxState: actx ? actx.state : null,
                    p1Len: bufs.p1 ? bufs.p1.duration : 0,
                    p2Len: bufs.p2 ? bufs.p2.duration : 0
                };
            }
        };
    })();
