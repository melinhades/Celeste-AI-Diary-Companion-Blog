/* =====================================================================
   cassette.js
   ① window.CassetteAudio —— 磁带三联音控制器：intro → loop（无限循环）→ outro（停下时）
      供 cassette.html（白噪音 App）与 shelf.html（点开往期日记）共用。
      底层走 GaplessAudio（Web Audio）：intro 的末帧和 loop 的首帧排在同一条时间线上，
      loop 在音频渲染线程内部回绕 —— 不再是「element 放完 → 重置管线 → 再 play」那样卡一下。
   ② 下方 IIFE 只在 cassette.html（页面里有 #cxApp）初始化磁带机，
      shelf.html 引入本文件时只会用到 ①，不会碰到 App 逻辑。
   ===================================================================== */
window.CassetteAudio = (function () {
    var DIR = 'celeste-sounds/cassette_preview_';
    var vol = 0.9;
    var seq = null;
    var active = false;   // 是否处于「开过、还没停」的状态；没开过就不放 outro

    function ensure() {
        if (!seq && window.GaplessAudio) {
            seq = window.GaplessAudio.sequence({
                intro: DIR + 'intro.wav',
                loop: DIR + 'loop.wav',
                outro: DIR + 'outro.wav',
                volume: vol
            });
        }
        return seq;
    }
    function setVolume(v) {
        vol = Math.max(0, Math.min(1, v));
        if (seq) seq.setVolume(vol);
    }

    /* 点开：先放 intro，结束处无缝接 loop。返回 Promise，供页面做自动播放兜底。 */
    function play() {
        var s = ensure();
        if (!s) return Promise.resolve();
        active = true;
        return s.start();
    }

    /* 磁带机 PAUSE：静默挂起，保留位置，不放 outro、不重置 */
    function suspendTape() { if (seq) seq.suspend(); }

    /* 磁带机 PLAY：续播 —— intro 没走完续 intro，走完了就一直是 loop */
    function resumeTape() {
        var s = ensure();
        if (!s) return Promise.resolve();
        active = true;
        return s.resume();
    }

    /* 磁带机切回磁带：入场 intro 已过，直接从 loop 开始，不再举行 intro 仪式 */
    function enterTape() {
        var s = ensure();
        if (!s) return Promise.resolve();
        active = true;
        return s.state() === 'loop' ? s.playLoop() : s.start();
    }

    /* 点出：停掉循环并放 outro（没开过则什么都不做）。三联音整套结束，下次 play 从 intro 开始 */
    function stop() {
        if (!active) return;
        active = false;
        var s = ensure();
        if (s) s.stop();
    }

    /* 静默停下：切歌 / 离开页面用，不放 outro */
    function halt() {
        active = false;
        if (seq) seq.halt();
    }

    return {
        play: play,          // shelf 点开 / App 首次入场：intro → loop
        stop: stop,          // shelf 点出：outro 收尾
        halt: halt,          // 切歌 / 离开：静默全停
        suspendTape: suspendTape, // App PAUSE：静默挂起、保留位置
        resumeTape: resumeTape,   // App PLAY：续播（intro 过后只续 loop）
        enterTape: enterTape,     // App 切回磁带：直接 loop
        setVolume: setVolume
    };
})();


/* =====================================================================
   window.CampfireAudio —— 篝火双联音：start → loop（无限循环）
   供 cassette.html（篝火源）与 shelf.html（书架常态 + dream 场景）共用。
   底层同样走 GaplessAudio：start 的末尾与 loop 首帧对齐，loop 本身无接缝。
   注意：loop 文件名带一个空格「campfire_loop .wav」，src 原样写即可，浏览器自行编码。
   ===================================================================== */
window.CampfireAudio = (function () {
    var vol = 0.14;
    var seq = null;
    var on = false;         // 已点火（含挂起）

    function ensure() {
        if (!seq && window.GaplessAudio) {
            seq = window.GaplessAudio.sequence({
                intro: 'celeste-sounds/campfire_start.wav',
                loop: 'celeste-sounds/campfire_loop .wav',
                volume: vol
            });
        }
        return seq;
    }
    function setVolume(v) {
        vol = Math.max(0, Math.min(1, v));
        if (seq) seq.setVolume(vol);
    }

    /* 开始烧火：start → loop。已在烧则忽略（不重来 intro） */
    function play() {
        if (on) return Promise.resolve();
        var s = ensure();
        if (!s) return Promise.resolve();
        on = true;
        return s.start();
    }

    /* 挂起：保留位置，恢复时接着烧（镜之房间让位用） */
    function suspend() { if (on && seq) seq.suspend(); }
    function resume() {
        // 没点火过：要么已经点着（无事可做），要么起播被浏览器拦过 / 已熄火 —— 得重新点着，
        // 否则会出现「面板显示在播、其实一点声都没有」
        if (!on) return play();
        return seq ? seq.resume() : Promise.resolve();
    }

    /* 熄火：静默全停归零（切歌 / 离开页面） */
    function halt() {
        on = false;
        if (seq) seq.halt();
    }

    return { play: play, suspend: suspend, resume: resume, halt: halt, setVolume: setVolume };
})();


/* ===================== cassette.exe · 磁带机环境混音台 =====================
   音源只有一个「当前源」权威状态（cur + playing），所有播放/暂停/切换都走它，
   不允许场景内另起播放入口 —— 防止多套播放状态互相覆盖。
   瀑布场景内部是多通道混音：主声 / 走近（小瀑布再分深潭、浅滩）同时循环，
   推子实时改各通道音量做交叉渐变。 */
(function () {
    var app = document.getElementById('cxApp');
    if (!app) return;   // 非 App 页：只取用上面的 CassetteAudio

    var AMB = 'ambience/';
    // 单曲场景（一个文件循环到底）
    var SINGLES = {
        hot:    { f: 'hot.wav',                        n: '热浪' },
        lava:   { f: 'lavagate_idle.wav',              n: '岩浆之门' },
        mirror: { f: 'mirror_sequence.wav',            n: '镜之房间' },
        under:  { f: 'underwater.wav',                 n: '水下' }
    };
    // 破窗三档风
    var WINDS = {
        large:  { f: 'brokenwindow_large_loop.wav',    n: '大风' },
        small1: { f: 'brokenwindow_small_loop_01.wav', n: '小风 ①' },
        small2: { f: 'brokenwindow_small_loop_02.wav', n: '小风 ②' }
    };

    var tapeImg = document.getElementById('cxTapeImg');
    var tapeBox = document.getElementById('cxTape');
    var nowEl = document.getElementById('cxNow');
    var volEl = document.getElementById('cxVol');
    var volNum = document.querySelector('.vol-r');
    var winTag = document.getElementById('winTag');
    var wfTag = document.getElementById('wfTag');
    var nearEl = document.getElementById('wfNear');
    var depthEl = document.getElementById('wfDepth');
    var depthRow = document.getElementById('depthRow');

    /* ---------- 全局唯一状态 ---------- */
    var LS = 'cx.';
    function lsGet(k, dft) {
        try { var v = localStorage.getItem(LS + k); return v == null ? dft : v; }
        catch (e) { return dft; }
    }
    function lsSet(k, v) {
        try { localStorage.setItem(LS + k, String(v)); } catch (e) {}
    }
    function clamp01(v) {
        v = parseFloat(v);
        if (isNaN(v)) return 0;
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }

    var gVol = clamp01(parseFloat(lsGet('vol', 90)) / 100);
    var muted = lsGet('mute', '0') === '1';
    var cur = null;        // 'cassette' | 'window' | 'waterfall' | 'campfire' | SINGLES 的 key
    var playing = false;
    var armed = false;     // 自动播放被拦，等首次手势
    var unlockFn = null;   // 已挂上的解锁监听，disarm 时摘掉
    var wind = WINDS[lsGet('wind', 'large')] ? lsGet('wind', 'large') : 'large';
    var wf = {
        size: lsGet('wfSize', 'big') === 'small' ? 'small' : 'big',
        near: clamp01(parseFloat(lsGet('wfNear', 50)) / 100),
        depth: clamp01(parseFloat(lsGet('wfDepth', 50)) / 100),
        chans: [],
        chansSize: null   // 已建通道对应的尺寸；与 wf.size 不一致时必须重建
    };
    var elapsed = 0, clock = null;

    // 静音也走同一个出口：所有音量都乘它，不另存一份状态
    function effVol() { return muted ? 0 : gVol; }

    // 单段环境声（破窗风 / 各类 SINGLES）：底层同样走 GaplessAudio，循环在音频渲染线程内回绕
    var amb = null, ambUrl = null;
    function ambHalt() { if (amb) amb.halt(); }
    function ambSuspend() { if (amb) amb.suspend(); }
    function ambSet(url, autoplay) {
        if (amb && ambUrl === url) {
            if (autoplay && amb.state() !== 'playing') ambStart();
            return;
        }
        ambHalt();
        ambUrl = url;
        amb = window.GaplessAudio.loop(url, { volume: effVol() });
        if (autoplay) ambStart();
    }
    function ambStart() {
        if (!amb) return null;
        var p = amb.start();
        if (p && p.catch) p.catch(function (err) { blocked(err); });
        return p;
    }

    // 传输键 / 开关组集中取一次，下面所有同步都只读这几个引用
    var winSegs = app.querySelectorAll('[data-win]');
    var sizeSegs = app.querySelectorAll('[data-size]');
    var playBtn = document.getElementById('cxPlay');
    var pauseBtn = document.getElementById('cxPause');
    var stopBtn = document.getElementById('cxStop');
    var muteBtn = document.getElementById('cxMute');
    var nowText = document.getElementById('cxNowText');
    var timeEl = document.getElementById('cxTime');
    var deckEl = document.querySelector('.cx-deck');

    // 对准（鼠标悬停）或聚焦在磁带机上时，方向键才归我们调音量
    var deckHover = false;
    if (deckEl) {
        deckEl.addEventListener('pointerenter', function () { deckHover = true; });
        deckEl.addEventListener('pointerleave', function () { deckHover = false; });
    }
    function deckHot() {
        return deckHover || !!(deckEl && deckEl.contains(document.activeElement));
    }
    // 系统开了「减少动态效果」就不转帧，只靠亮灯表示状态
    var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------- 磁带转动：rAF 驱动（后台标签自动停），帧预解码 ---------- */
    var FRAMES = [], FRAME_MS = 90, fi = 0, spinRaf = 0, spinLast = 0;
    for (var k = 0; k < 19; k++) FRAMES.push('celeste-collectables/cassette/idle' + (k < 10 ? '0' + k : k) + '.png');
    // 先把 19 帧解好：否则每换一帧都可能掉一次解码，转动会一顿一顿
    for (var pk = 0; pk < FRAMES.length; pk++) {
        var pre = new Image();
        pre.src = FRAMES[pk];
        if (pre.decode) pre.decode().catch(function () {});
    }
    function spinStep(ts) {
        if (!spinLast) spinLast = ts;
        if (ts - spinLast >= FRAME_MS) {
            spinLast = ts;
            fi = (fi + 1) % FRAMES.length;
            if (tapeImg) tapeImg.src = FRAMES[fi];
        }
        spinRaf = requestAnimationFrame(spinStep);
    }
    function spin(on) {
        if (tapeBox) tapeBox.classList.toggle('playing', !!on);
        if (REDUCE) return;   // 尊重系统设置：不转帧（停在当前帧）
        if (on && !spinRaf) {
            spinLast = 0;
            spinRaf = requestAnimationFrame(spinStep);
        } else if (!on && spinRaf) {
            cancelAnimationFrame(spinRaf); spinRaf = 0;
        }
    }

    /* ---------- LCD：文案 + 计时 ---------- */
    function say(text, hot) {
        if (nowText) nowText.textContent = text;
        else if (nowEl) nowEl.textContent = text;
        if (nowEl) nowEl.classList.toggle('on', !!hot);
    }
    function fmtClock(s) {
        var m = Math.floor(s / 60), r = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
    }
    function paintClock() { if (timeEl) timeEl.textContent = fmtClock(elapsed); }
    function stopClock() { if (clock) { clearInterval(clock); clock = null; } }
    function startClock() {
        stopClock();
        clock = setInterval(function () { elapsed++; paintClock(); }, 1000);
    }

    /* ---------- 状态 → UI：单向同步的唯一出口 ---------- */
    function paintRange(el) {
        if (!el) return;
        var min = parseFloat(el.min || 0), max = parseFloat(el.max || 100);
        var p = max > min ? (parseFloat(el.value) - min) / (max - min) : 0;
        el.style.setProperty('--p', (p * 100).toFixed(1) + '%');
    }
    function mark() {
        var roots = app.querySelectorAll('[data-src],[data-scene]');
        for (var i = 0; i < roots.length; i++) {
            var key = roots[i].getAttribute('data-src') || roots[i].getAttribute('data-scene');
            var on = !!cur && key === cur;
            roots[i].classList.toggle('on', on);
            roots[i].classList.toggle('is-live', on && playing);
            if (roots[i].hasAttribute('data-src')) {
                roots[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        }
    }
    function syncSegs() {
        var i, on;
        for (i = 0; i < winSegs.length; i++) {
            on = winSegs[i].getAttribute('data-win') === wind;
            winSegs[i].classList.toggle('on', on);
            winSegs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        for (i = 0; i < sizeSegs.length; i++) {
            on = sizeSegs[i].getAttribute('data-size') === wf.size;
            sizeSegs[i].classList.toggle('on', on);
            sizeSegs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }
    function syncUI() {
        app.classList.toggle('playing', playing);
        if (playBtn) playBtn.classList.toggle('is-on', playing);
        if (pauseBtn) pauseBtn.classList.toggle('is-on', !playing && !!cur);
        if (muteBtn) {
            muteBtn.classList.toggle('on', muted);
            muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        }
        mark();
        paintRange(volEl); paintRange(nearEl); paintRange(depthEl);
        if (volNum) volNum.textContent = Math.round(gVol * 100);
        syncDepthEnabled();
    }

    /* 电平柱只建一次，状态切换靠 class */
    function buildEq() {
        var rows = app.querySelectorAll('[data-src], .sc-head');
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].querySelector('.sr-eq')) continue;
            var eq = document.createElement('span');
            eq.className = 'sr-eq';
            eq.setAttribute('aria-hidden', 'true');
            eq.innerHTML = '<i></i><i></i><i></i>';
            rows[i].appendChild(eq);
        }
    }

    /* ---------- 瀑布多通道 ---------- */
    function wfFiles() {
        if (wf.size === 'big') {
            return [
                { key: 'main', f: 'waterfall_big_main.wav' },
                { key: 'in',   f: 'waterfall_big_in.wav' }
            ];
        }
        return [
            { key: 'main',    f: 'waterfall_small_main.wav' },
            { key: 'deep',    f: 'waterfall_small_in_deep.wav' },
            { key: 'shallow', f: 'waterfall_small_in_shallow.wav' }
        ];
    }
    // 远近：主声 0 ←→ 走近 1；深浅仅作用在小瀑布「走近」层：深潭 0 ←→ 浅滩 1
    function wfGain(key) {
        if (key === 'main') return 1 - wf.near;
        if (key === 'in') return wf.near;
        if (key === 'deep') return wf.near * (1 - wf.depth);
        return wf.near * wf.depth; // shallow
    }
    function wfTeardown() {
        for (var i = 0; i < wf.chans.length; i++) {
            wf.chans[i].l.halt();
        }
        wf.chans = [];
        wf.chansSize = null;
    }
    // autoplay：建完通道是否立即出声。切大小/首次进入传当前是否在播，改档不留声但也不丢状态
    function wfBuild(autoplay) {
        wfTeardown();
        var files = wfFiles();
        for (var i = 0; i < files.length; i++) {
            // 每个通道都是独立的无缝循环，推子只改它自己的增益
            wf.chans.push({
                key: files[i].key,
                l: window.GaplessAudio.loop(AMB + files[i].f, { volume: wfGain(files[i].key) * effVol() })
            });
        }
        wf.chansSize = wf.size;
        if (autoplay) wfPlay();
    }
    function wfApplyGains() {
        var v = effVol();
        for (var i = 0; i < wf.chans.length; i++) {
            wf.chans[i].l.setVolume(wfGain(wf.chans[i].key) * v);
        }
    }
    function wfPlay() {
        for (var i = 0; i < wf.chans.length; i++) {
            var pr = wf.chans[i].l.start();
            if (pr && pr.catch) pr.catch(function (err) { blocked(err); });
        }
    }
    function wfPause(reset) {
        for (var i = 0; i < wf.chans.length; i++) {
            wf.chans[i].l[reset ? 'halt' : 'suspend']();
        }
    }
    function wfDescribe() {
        var t = wf.size === 'big' ? '大瀑布' : '小瀑布';
        t += ' · 走近 ' + Math.round(wf.near * 100) + '%';
        if (wf.size === 'small') t += ' · 浅滩 ' + Math.round(wf.depth * 100) + '%';
        return t;
    }
    function wfSyncTag() {
        if (wfTag) wfTag.textContent = wfDescribe();
    }
    function syncDepthEnabled() {
        if (depthRow) depthRow.classList.toggle('is-off', wf.size === 'big');
        if (depthEl) depthEl.disabled = wf.size === 'big';
    }

    /* ---------- 切源 / 传输控制 ---------- */
    function silenceAll() {
        window.CassetteAudio.halt();   // 切走磁带：静默收尾，不放 outro
        window.CampfireAudio.halt();   // 切走篝火：熄火
        ambHalt();
        wfPause(false);
    }
    
    // 单文件源（破窗/其他场景）统一走这两个装载入口：换文件与“要不要出声”分开
    function loadWindow(autoplay) {
        ambSet(AMB + WINDS[wind].f, autoplay);
    }
    function loadSingle(name) {
        ambSet(AMB + SINGLES[name].f, true);
    }
    
    /* 自动播放被拦：只认 NotAllowedError；用户主动暂停引发的 AbortError 不算 */
    function blocked(err) {
        if (err && err.name && err.name !== 'NotAllowedError') return;
        playing = false;
        spin(false);
        stopClock();
        say('轻触任意位置 · 开始播放', false);
        syncUI();
        armUnlock();
    }
    function disarm() {
        armed = false;
        if (!unlockFn) return;
        window.removeEventListener('pointerdown', unlockFn, true);
        window.removeEventListener('keydown', unlockFn, true);
        unlockFn = null;
    }
    function armUnlock() {
        if (armed) return;
        armed = true;
        unlockFn = function (e) {
            disarm();
            // 点在音源列表上的话，交给它自己的 click，别抢它
            if (e && e.target && e.target.closest && e.target.closest('#cxApp')) return;
            doPlay();
        };
        window.addEventListener('pointerdown', unlockFn, true);
        window.addEventListener('keydown', unlockFn, true);
    }
    
    function describeCur() {
        if (cur === 'cassette') return 'SIDE A · 磁带';
        if (cur === 'campfire') return '篝火 · 哔剥作响';
        if (cur === 'window') return '破窗 · ' + WINDS[wind].n;
        if (cur === 'waterfall') return '瀑布 · ' + wfDescribe();
        return SINGLES[cur] ? SINGLES[cur].n : '待机';
    }
    
    function activate(name) {
        silenceAll();
        cur = name;
        lsSet('src', name);
        playing = true;
        elapsed = 0; paintClock(); startClock();
        spin(true);
        mark();
        if (name === 'cassette') {
            var pr = window.CassetteAudio.enterTape();
            say('SIDE A · 磁带', true);
            if (pr && pr.catch) pr.catch(function (err) { blocked(err); });
        } else if (name === 'campfire') {
            var pr2 = window.CampfireAudio.play();
            say('篝火 · 哔剥作响', true);
            if (pr2 && pr2.catch) pr2.catch(function (err) { blocked(err); });
        } else if (name === 'window') {
            loadWindow(true);
            say('破窗 · ' + WINDS[wind].n, true);
        } else if (name === 'waterfall') {
            wfBuild(true);
            wfSyncTag();
            say('瀑布 · ' + wfDescribe(), true);
        } else {
            loadSingle(name);
            say(SINGLES[name].n, true);
        }
        syncUI();
    }
    
    function doPause() {
        if (!playing) return;
        // 磁带机里磁带没有“收尾”：PAUSE 只是静默挂起 loop，再按 PLAY 续播，不碰 intro/outro
        if (cur === 'cassette') window.CassetteAudio.suspendTape();
        else if (cur === 'campfire') window.CampfireAudio.suspend();
        else if (cur === 'waterfall') wfPause(false);
        else ambSuspend();
        playing = false;
        spin(false); stopClock();
        say('暂停 · 再点 ▶ 继续', false);
        syncUI();
    }
    function doStop() {
        if (!cur) return;
        // 磁带机内 STOP 静默归零（outro 是 shelf 点出日记的专属仪式，这里不放）
        if (cur === 'cassette') window.CassetteAudio.halt();
        else if (cur === 'campfire') window.CampfireAudio.halt();
        else if (cur === 'waterfall') wfPause(true);
        else { ambHalt(); }
        playing = false;
        spin(false); stopClock();
        elapsed = 0; paintClock();
        say('停了 · 按 ▶ 让磁带继续转', false);
        flashStop();
        syncUI();
    }
    function doPlay() {
        disarm();
        if (playing) return;
        if (!cur) { activate('cassette'); return; }
        playing = true;
        spin(true); startClock();
        if (cur === 'cassette') { var pr3 = window.CassetteAudio.resumeTape(); if (pr3 && pr3.catch) pr3.catch(function () {}); }
        else if (cur === 'campfire') window.CampfireAudio.resume();
        else if (cur === 'waterfall') {
            // 暂停期间换过大小：必须先按新尺寸重建通道，否则播的是旧那套
            if (wf.chansSize !== wf.size) wfBuild(false);
            wfPlay();
        } else if (cur === 'window') {
            // 暂停期间换过风档：按当前 wind 重新装文件
            loadWindow(true);
        } else {
            ambStart();
        }
        say(describeCur(), true);
        syncUI();
    }
    
    // STOP 不是持续态，只闪 0.4s
    var stopFlash = 0;
    function flashStop() {
        if (!stopBtn) return;
        stopBtn.classList.add('is-on');
        clearTimeout(stopFlash);
        stopFlash = setTimeout(function () { stopBtn.classList.remove('is-on'); }, 420);
    }
    
    /* ---------- 音量：一条口径管到底（静音 = 乘 0） ---------- */
    function applyVolumes() {
        var v = effVol();
        if (amb) amb.setVolume(v);
        window.CassetteAudio.setVolume(v);
        window.CampfireAudio.setVolume(v * 0.38);   // 篝火做底噪，永远压一头
        wfApplyGains();
        if (volEl) volEl.value = Math.round(gVol * 100);
        if (volNum) volNum.textContent = Math.round(gVol * 100);
        paintRange(volEl);
    }
    function unmuteIfNeeded() {
        if (muted && gVol > 0) { muted = false; lsSet('mute', '0'); }
    }
    function setVol(v) {
        gVol = clamp01(v);
        unmuteIfNeeded();
        lsSet('vol', Math.round(gVol * 100));
        applyVolumes();
        syncUI();
    }
    function toggleMute() {
        muted = !muted;
        lsSet('mute', muted ? '1' : '0');
        applyVolumes();
        syncUI();
    }

    /* ---------- 事件：单曲 / 磁带行 ---------- */
    app.addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.src-row') : null;
        if (!row) return;
        var key = row.getAttribute('data-src');
        if (cur === key) { playing ? doPause() : doPlay(); return; }
        activate(key);
    });

    /* ---------- 事件：破窗分段开关 ---------- */
    for (var wi = 0; wi < winSegs.length; wi++) {
        winSegs[wi].addEventListener('click', function () {
            wind = this.getAttribute('data-win');
            lsSet('wind', wind);
            syncSegs();
            if (winTag) winTag.textContent = WINDS[wind].n;
            if (cur !== 'window') { activate('window'); return; }
            // 关键：不论当前是不是在播，都要把文件换成新那档
            loadWindow(playing);
            if (playing) say('破窗 · ' + WINDS[wind].n, true);
            syncUI();
        });
    }

    /* ---------- 事件：瀑布大小开关 ---------- */
    for (var si = 0; si < sizeSegs.length; si++) {
        sizeSegs[si].addEventListener('click', function () {
            var size = this.getAttribute('data-size');
            if (size === wf.size) return;
            wf.size = size;
            lsSet('wfSize', size);
            syncSegs();
            syncDepthEnabled();
            wfSyncTag();
            if (cur !== 'waterfall') { activate('waterfall'); return; }
            // 关键：重建通道；在播就接上出声，暂停中就只换好等着
            wfBuild(playing);
            if (playing) say('瀑布 · ' + wfDescribe(), true);
            syncUI();
        });
    }

    /* ---------- 事件：瀑布推子（实时交叉渐变；拖推子本身也是手势，可直接起播） ---------- */
    if (nearEl) nearEl.addEventListener('input', function () {
        wf.near = clamp01(parseFloat(nearEl.value) / 100);
        lsSet('wfNear', nearEl.value);
        paintRange(nearEl);
        if (cur !== 'waterfall') { activate('waterfall'); return; }
        wfApplyGains();
        wfSyncTag();
        if (playing) say('瀑布 · ' + wfDescribe(), true);
    });
    if (depthEl) depthEl.addEventListener('input', function () {
        wf.depth = clamp01(parseFloat(depthEl.value) / 100);
        lsSet('wfDepth', depthEl.value);
        paintRange(depthEl);
        if (cur !== 'waterfall') { activate('waterfall'); return; }
        wfApplyGains();
        wfSyncTag();
        if (playing) say('瀑布 · ' + wfDescribe(), true);
    });

    /* ---------- 传输键 / 音量 / 静音 ---------- */
    if (playBtn) playBtn.addEventListener('click', doPlay);
    if (pauseBtn) pauseBtn.addEventListener('click', doPause);
    if (stopBtn) stopBtn.addEventListener('click', doStop);
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    if (volEl) volEl.addEventListener('input', function () {
        gVol = clamp01(parseFloat(volEl.value) / 100);
        unmuteIfNeeded();                   // 拖音量本身就是“我要听见”
        lsSet('vol', Math.round(gVol * 100));
        applyVolumes();
        syncUI();
    });

    /* ---------- 键盘：空格 / M / ↑↓ ---------- */
    document.addEventListener('keydown', function (e) {
        var t = e.target;
        var tag = t && t.tagName;
        // 焦点在表单控件里时不抢键（方向键要留给 range 原生调值）
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        var onBtn = tag === 'BUTTON' || tag === 'A' || (t && t.closest && t.closest('button, a'));
        if (e.code === 'Space' || e.key === ' ') {
            // 焦点在按钮/链接上：交给原生 Space 触发它自己的 click，
            // 否则 Tab 到音源行再按空格会被误解成“播放/暂停”
            if (onBtn) return;
            e.preventDefault();
            if (playing) doPause(); else doPlay();
        } else if (e.key === 'm' || e.key === 'M') {
            e.preventDefault();
            toggleMute();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // 只在对着磁带机时接管上下键，不然会抢掉页面本身的滚动
            if (!deckHot()) return;
            e.preventDefault();
            setVol(gVol + (e.key === 'ArrowUp' ? 0.05 : -0.05));
        }
    });

    // 离开页面：静默收尾，别让声音跟着走
    window.addEventListener('pagehide', function () {
        window.CassetteAudio.halt();
        window.CampfireAudio.halt();
        ambHalt();
        wfPause(false);
        stopClock();
    });

    /* ---------- 启动：先复原上次的音量/档位，再开启音源 ---------- */
    function restoreUI() {
        if (volEl) volEl.value = Math.round(gVol * 100);
        if (nearEl) nearEl.value = Math.round(wf.near * 100);
        if (depthEl) depthEl.value = Math.round(wf.depth * 100);
        if (winTag) winTag.textContent = WINDS[wind].n;
        syncSegs();
        syncDepthEnabled();
        wfSyncTag();
    }
    function boot() {
        buildEq();
        restoreUI();
        applyVolumes();
        var last = lsGet('src', 'cassette');
        var known = last === 'cassette' || last === 'campfire' || last === 'window' ||
                    last === 'waterfall' || !!SINGLES[last];
        activate(known ? last : 'cassette');
        paintClock();
    }
    boot();
})();
