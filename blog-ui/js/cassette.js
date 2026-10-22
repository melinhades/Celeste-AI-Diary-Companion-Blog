/* =====================================================================
   cassette.js
   ① window.CassetteAudio —— 磁带三联音控制器：intro → loop（无限循环）→ outro（停下时）
      供 cassette.html（白噪音 App）与 shelf.html（点开往期日记）共用。
   ② 下方 IIFE 只在 cassette.html（页面里有 #cxApp）初始化磁带机，
      shelf.html 引入本文件时只会用到 ①，不会碰到 App 逻辑。
   ===================================================================== */
window.CassetteAudio = (function () {
    var DIR = 'celeste-sounds/cassette_preview_';
    var vol = 0.9;
    var parts = null;
    var active = false;   // 是否处于「开过、还没停」的状态；没开过就不放 outro
    var introDone = false; // intro 是否已经自然走完（走完以后磁带机里只动 loop，不再来 intro）

    function ensure() {
        if (parts) return parts;
        parts = {
            intro: new Audio(DIR + 'intro.wav'),
            loop: new Audio(DIR + 'loop.wav'),
            outro: new Audio(DIR + 'outro.wav')
        };
        parts.loop.loop = true;
        applyVolume();
        // intro 自然放完 → 接上循环（中途被 pause 不会触发 ended）
        parts.intro.addEventListener('ended', function () {
            introDone = true;
            startLoop();
        });
        return parts;
    }
    function applyVolume() {
        if (!parts) return;
        parts.intro.volume = vol;
        parts.loop.volume = vol;
        parts.outro.volume = vol;
    }
    function setVolume(v) {
        vol = Math.max(0, Math.min(1, v));
        applyVolume();
    }
    function startLoop() {
        var p = ensure();
        p.loop.currentTime = 0;
        p.loop.play().catch(function () {});
    }

    /* 点开：先放 intro，结束后自动进 loop 循环。返回播放 Promise，供页面做自动播放兜底。
       shelf 点开日记 / 磁带机首次入场用。 */
    function play() {
        var p = ensure();
        p.outro.pause(); p.outro.currentTime = 0;
        p.loop.pause(); p.loop.currentTime = 0;
        p.intro.currentTime = 0;
        introDone = false;
        active = true;
        var pr = p.intro.play();
        // 被浏览器拦截时不强行 startLoop（同样会被拦），交给调用方在首次手势里重试 play()
        if (pr && pr.catch) pr.catch(function () {});
        return pr;
    }

    /* 磁带机 PAUSE：静默挂起，保留位置，不放 outro、不重置 */
    function suspendTape() {
        if (!parts) return;
        parts.intro.pause();
        parts.loop.pause();
    }

    /* 磁带机 PLAY：续播 —— intro 没走完续 intro，走完了就一直是 loop */
    function resumeTape() {
        var p = ensure();
        active = true;
        var a = introDone ? p.loop : p.intro;
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function () {});
        return pr;
    }

    /* 磁带机切回磁带：入场 intro 已过，直接从 loop 开始，不再举行 intro 仪式 */
    function enterTape() {
        if (!introDone) return play();
        var p = ensure();
        p.outro.pause(); p.outro.currentTime = 0;
        p.intro.pause(); p.intro.currentTime = 0;
        p.loop.currentTime = 0;
        active = true;
        var pr = p.loop.play();
        if (pr && pr.catch) pr.catch(function () {});
        return pr;
    }

    /* 点出：停掉循环并放 outro（没开过则什么都不做）。三联音整套结束，下次 play 从 intro 开始 */
    function stop() {
        if (!active) return;
        var p = ensure();
        p.intro.pause(); p.intro.currentTime = 0;
        p.loop.pause(); p.loop.currentTime = 0;
        p.outro.currentTime = 0;
        active = false;
        introDone = false;
        p.outro.play().catch(function () {});
    }

    /* 静默停下：切歌 / 离开页面用，不放 outro */
    function halt() {
        active = false;
        if (!parts) return;
        parts.intro.pause(); parts.intro.currentTime = 0;
        parts.loop.pause(); parts.loop.currentTime = 0;
        parts.outro.pause(); parts.outro.currentTime = 0;
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
   注意：loop 文件名带一个空格「campfire_loop .wav」，src 原样写即可，浏览器自行编码。
   ===================================================================== */
window.CampfireAudio = (function () {
    var vol = 0.14;
    var parts = null;
    var phase = 'off';      // off | intro | loop
    var suspended = false;

    function ensure() {
        if (parts) return parts;
        parts = {
            intro: new Audio('celeste-sounds/campfire_start.wav'),
            loop: new Audio('celeste-sounds/campfire_loop .wav')
        };
        parts.loop.loop = true;
        applyVolume();
        parts.intro.addEventListener('ended', function () {
            if (phase !== 'intro') return;
            phase = 'loop';
            parts.loop.currentTime = 0;
            parts.loop.play().catch(function () {});
        });
        return parts;
    }
    function applyVolume() {
        if (!parts) return;
        parts.intro.volume = vol;
        parts.loop.volume = vol;
    }
    function setVolume(v) {
        vol = Math.max(0, Math.min(1, v));
        applyVolume();
    }

    /* 开始烧火：start → loop。已在烧则忽略（不重来 intro） */
    function play() {
        if (phase !== 'off') return;
        var p = ensure();
        p.intro.currentTime = 0;
        phase = 'intro';
        suspended = false;
        var pr = p.intro.play();
        if (pr && pr.catch) pr.catch(function () {});
        return pr;
    }

    /* 挂起：保留位置，恢复时接着烧（镜之房间让位用） */
    function suspend() {
        if (phase === 'off' || suspended) return;
        parts.intro.pause();
        parts.loop.pause();
        suspended = true;
    }
    function resume() {
        if (!suspended) return;
        suspended = false;
        var a = phase === 'intro' ? parts.intro : parts.loop;
        a.play().catch(function () {});
    }

    /* 熄火：静默全停归零（切歌 / 离开页面） */
    function halt() {
        phase = 'off';
        suspended = false;
        if (!parts) return;
        parts.intro.pause(); parts.intro.currentTime = 0;
        parts.loop.pause(); parts.loop.currentTime = 0;
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
    var gVol = volEl ? volEl.value / 100 : 0.9;
    var cur = null;        // 'cassette' | 'window' | 'waterfall' | SINGLES 的 key
    var playing = false;
    var wind = 'large';
    var wf = { size: 'big', near: 0.5, depth: 0.5, chans: [] };

    var amb = new Audio();
    amb.loop = true;
    amb.volume = gVol;

    /* ---------- 磁带转动：只要当前源在响，磁带就转 ---------- */
    var FRAMES = [], FRAME_MS = 90, fi = 0, timer = null;
    for (var k = 0; k < 19; k++) FRAMES.push('celeste-collectables/cassette/idle' + (k < 10 ? '0' + k : k) + '.png');
    function spin(on) {
        if (on && !timer) {
            timer = setInterval(function () {
                fi = (fi + 1) % FRAMES.length;
                if (tapeImg) tapeImg.src = FRAMES[fi];
            }, FRAME_MS);
        } else if (!on && timer) {
            clearInterval(timer); timer = null;
        }
        if (tapeBox) tapeBox.classList.toggle('playing', !!on);
    }
    function say(text, hot) {
        if (!nowEl) return;
        nowEl.textContent = text;
        nowEl.classList.toggle('on', !!hot);
    }

    /* ---------- 当前源高亮 ---------- */
    function mark() {
        var roots = app.querySelectorAll('[data-src],[data-scene]');
        for (var i = 0; i < roots.length; i++) {
            var key = roots[i].getAttribute('data-src') || roots[i].getAttribute('data-scene');
            roots[i].classList.toggle('on', key === cur);
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
            wf.chans[i].a.pause();
            wf.chans[i].a.src = '';
        }
        wf.chans = [];
    }
    function wfBuild() {
        wfTeardown();
        var files = wfFiles();
        for (var i = 0; i < files.length; i++) {
            var a = new Audio(AMB + files[i].f);
            a.loop = true;
            a.volume = wfGain(files[i].key) * gVol;
            wf.chans.push({ key: files[i].key, a: a });
        }
    }
    function wfApplyGains() {
        for (var i = 0; i < wf.chans.length; i++) {
            wf.chans[i].a.volume = wfGain(wf.chans[i].key) * gVol;
        }
    }
    function wfPlay() {
        for (var i = 0; i < wf.chans.length; i++) wf.chans[i].a.play().catch(function () {});
    }
    function wfPause(reset) {
        for (var i = 0; i < wf.chans.length; i++) {
            wf.chans[i].a.pause();
            if (reset) wf.chans[i].a.currentTime = 0;
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
        amb.pause();
        wfPause(false);
    }
    function activate(name) {
        silenceAll();
        cur = name;
        playing = true;
        spin(true);
        mark();
        if (name === 'cassette') {
            var pr = window.CassetteAudio.enterTape();
            say('SIDE A · 磁带', true);
            return pr;
        }
        if (name === 'campfire') {
            var pr2 = window.CampfireAudio.play();
            say('篝火 · 哔剥作响', true);
            return pr2;
        }
        if (name === 'window') {
            amb.src = AMB + WINDS[wind].f;
            amb.currentTime = 0;
            amb.play().catch(function () {});
            say('破窗 · ' + WINDS[wind].n, true);
            return null;
        }
        if (name === 'waterfall') {
            wfBuild();
            wfPlay();
            wfSyncTag();
            say('瀑布 · ' + wfDescribe(), true);
            return null;
        }
        var s = SINGLES[name];
        amb.src = AMB + s.f;
        amb.currentTime = 0;
        amb.play().catch(function () {});
        say(s.n, true);
        return null;
    }
    function doPause() {
        if (!playing) return;
        // 磁带机里磁带没有「收尾」：PAUSE 只是静默挂起 loop，再按 PLAY 续播，不碰 intro/outro
        if (cur === 'cassette') window.CassetteAudio.suspendTape();
        else if (cur === 'campfire') window.CampfireAudio.suspend();
        else if (cur === 'waterfall') wfPause(false);
        else amb.pause();
        playing = false; spin(false);
        say('暂停 · 再点 ▶ 继续', false);
    }
    function doStop() {
        if (!cur) return;
        // 磁带机内 STOP 静默归零（outro 是 shelf 点出日记的专属仪式，这里不放）
        if (cur === 'cassette') window.CassetteAudio.halt();
        else if (cur === 'campfire') window.CampfireAudio.halt();
        else if (cur === 'waterfall') wfPause(true);
        else { amb.pause(); amb.currentTime = 0; }
        playing = false; spin(false);
        say('停了 · 按 ▶ 让磁带继续转', false);
    }
    function doPlay() {
        if (playing) return;
        if (!cur) { bootCassette(); return; }
        playing = true; spin(true);
        if (cur === 'cassette') window.CassetteAudio.resumeTape();
        else if (cur === 'campfire') window.CampfireAudio.resume();
        else if (cur === 'waterfall') wfPlay();
        else amb.play().catch(function () {});
        if (cur === 'waterfall') say('瀑布 · ' + wfDescribe(), true);
        else if (cur === 'window') say('破窗 · ' + WINDS[wind].n, true);
        else if (cur === 'cassette') say('SIDE A · 磁带', true);
        else if (cur === 'campfire') say('篝火 · 哔剥作响', true);
        else say(SINGLES[cur].n, true);
    }

    /* ---------- 默认磁带：进页面就放；被浏览器拦截时，首次轻触补播 ---------- */
    var armed = false;
    function armUnlock() {
        if (armed) return;
        armed = true;
        say('轻触任意位置 · 磁带开始转动', false);
        var unlock = function () {
            armed = false;
            var pr = window.CassetteAudio.play();
            if (pr && pr.catch) pr.catch(function () {});
            say('SIDE A · 磁带', true);
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
    }
    function bootCassette() {
        cur = 'cassette'; playing = true;
        spin(true); mark();
        var pr = window.CassetteAudio.play();
        say('SIDE A · 磁带', true);
        if (pr && pr.catch) pr.catch(function () { armUnlock(); });
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
    var winSegs = app.querySelectorAll('[data-win]');
    for (var wi = 0; wi < winSegs.length; wi++) {
        winSegs[wi].addEventListener('click', function () {
            wind = this.getAttribute('data-win');
            for (var j = 0; j < winSegs.length; j++) winSegs[j].classList.toggle('on', winSegs[j] === this);
            if (winTag) winTag.textContent = WINDS[wind].n;
            if (cur !== 'window') activate('window');
            else if (playing) {
                amb.src = AMB + WINDS[wind].f;
                amb.currentTime = 0;
                amb.play().catch(function () {});
                say('破窗 · ' + WINDS[wind].n, true);
            }
        });
    }

    /* ---------- 事件：瀑布大小开关 ---------- */
    var sizeSegs = app.querySelectorAll('[data-size]');
    for (var si = 0; si < sizeSegs.length; si++) {
        sizeSegs[si].addEventListener('click', function () {
            var size = this.getAttribute('data-size');
            if (size === wf.size) return;
            wf.size = size;
            for (var j = 0; j < sizeSegs.length; j++) sizeSegs[j].classList.toggle('on', sizeSegs[j] === this);
            syncDepthEnabled();
            wfSyncTag();
            if (cur !== 'waterfall') activate('waterfall');
            else if (playing) { wfBuild(); wfPlay(); say('瀑布 · ' + wfDescribe(), true); }
        });
    }

    /* ---------- 事件：瀑布推子（实时交叉渐变；拖推子本身也是手势，可直接起播） ---------- */
    nearEl.addEventListener('input', function () {
        wf.near = nearEl.value / 100;
        if (cur !== 'waterfall') { activate('waterfall'); return; }
        wfApplyGains();
        wfSyncTag();
        if (playing) say('瀑布 · ' + wfDescribe(), true);
    });
    depthEl.addEventListener('input', function () {
        wf.depth = depthEl.value / 100;
        if (cur !== 'waterfall') { activate('waterfall'); return; }
        wfApplyGains();
        wfSyncTag();
        if (playing) say('瀑布 · ' + wfDescribe(), true);
    });

    /* ---------- 传输键 / 音量 ---------- */
    var playBtn = document.getElementById('cxPlay');
    var pauseBtn = document.getElementById('cxPause');
    var stopBtn = document.getElementById('cxStop');
    if (playBtn) playBtn.addEventListener('click', doPlay);
    if (pauseBtn) pauseBtn.addEventListener('click', doPause);
    if (stopBtn) stopBtn.addEventListener('click', doStop);
    if (volEl) volEl.addEventListener('input', function () {
        gVol = volEl.value / 100;
        amb.volume = gVol;
        wfApplyGains();
        window.CassetteAudio.setVolume(gVol);
        window.CampfireAudio.setVolume(gVol * 0.38);   // 篝火做底噪，永远压一头，不跟主声抢
        if (volNum) volNum.textContent = volEl.value;
    });

    // 离开页面：静默收尾，别让声音跟着走
    window.addEventListener('pagehide', function () {
        window.CassetteAudio.halt();
        window.CampfireAudio.halt();
        amb.pause();
        wfPause(false);
    });

    syncDepthEnabled();
    wfSyncTag();
    window.CampfireAudio.setVolume(gVol * 0.38);
    bootCassette();
})();
