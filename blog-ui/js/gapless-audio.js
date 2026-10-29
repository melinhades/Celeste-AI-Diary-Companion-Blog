/* =====================================================================
   gapless-audio.js —— 无缝循环 / 无缝三联音（intro → loop → outro）

   为什么原来的写法会「卡一下」：
   <audio loop> 的循环在 Chromium 里是「播到末尾 → 重置媒体管线 → 从 0 重新起播」，
   中间必然丢掉几十~几百毫秒（解码器 flush + 输出回调重新排队）；mp3 还多一段编码器补零。
   intro 放完靠 ended 事件再 play() 另一个 element，等于又经历一次同样的起播延迟。
   60ms 轮询 currentTime 回跳（dream BGM、降级路径）更糟：最多多放出 60ms 才回跳，接缝明显。

   Web Audio 的 AudioBufferSourceNode.loop 在音频渲染线程内部完成回绕，采样精确、零空隙；
   而且知道 intro 的精确时长，就能把 loop 的首帧排在 intro 末帧的同一时间点上（同一条时间线），
   中间一个采样都不留。素材本身首尾相连时，听起来就是一个连续的声音。

   接口：
     GaplessAudio.loop(url, opt)                   opt: { start, duration, volume }
       → { start(offset), stop(fade), halt(), suspend(), resume(), setVolume(v), state() }
     GaplessAudio.sequence(opt)                    opt: { intro, loop, outro, volume }
       → { start(), stop(), halt(), suspend(), resume(), playLoop(), setVolume(v), state() }
   无 WebAudio / 解码失败时自动退回 <audio> 元素（行为同旧实现，只是没有无缝保证）。
   ===================================================================== */
window.GaplessAudio = (function () {
    var VC = window.AudioContext || window.webkitAudioContext;
    var ok = !!VC;
    var ctx = null;
    var cache = {};

    function ac() {
        if (!ok) return null;
        if (!ctx) {
            try { ctx = window.__gaplessAC || (window.__gaplessAC = new VC()); }
            catch (e) { ok = false; return null; }
        }
        if (ctx.state === 'suspended') {
            try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        }
        return ctx;
    }

    /* 解码缓存：同 URL 只 fetch + decode 一次 */
    function load(url) {
        if (!url) return Promise.resolve(null);
        if (cache[url]) return cache[url];
        if (!ok || typeof fetch !== 'function') { cache[url] = Promise.resolve(null); return cache[url]; }
        cache[url] = fetch(url).then(function (r) {
            if (!r.ok) throw new Error('http ' + r.status);
            return r.arrayBuffer();
        }).then(function (raw) {
            var c = ac();
            if (!c) return null;
            return new Promise(function (res) {
                try { c.decodeAudioData(raw, function (b) { res(b); }, function () { res(null); }); }
                catch (e) { res(null); }
            });
        }).catch(function () { return null; });
        return cache[url];
    }

    /* 只保留需要的循环区间，省内存（长 mp3 整轨解码出来几十 MB） */
    function trim(c, b, start, len) {
        var a = Math.max(0, Math.floor(start * b.sampleRate));
        var n = Math.min(b.length - a, Math.floor(len * b.sampleRate));
        if (n <= 0 || (a === 0 && n === b.length)) return b;
        var out = c.createBuffer(b.numberOfChannels, n, b.sampleRate);
        for (var ch = 0; ch < b.numberOfChannels; ch++) {
            try { out.copyToChannel(b.getChannelData(ch).subarray(a, a + n), ch); } catch (e) {}
        }
        return out;
    }

    /* 起播前确认 AudioContext 真的在跑；被自动播放策略拦下时抛 NotAllowedError（页面原有的兜底逻辑认这个名字） */
    function gate() {
        var c = ac();
        if (!c) return Promise.reject(new Error('audio unsupported'));
        if (c.state === 'running') return Promise.resolve();
        return new Promise(function (res, rej) {
            var bad = function () {
                var e = new Error('autoplay blocked');
                try { e.name = 'NotAllowedError'; } catch (x) {}
                rej(e);
            };
            var settle = function () { setTimeout(function () { c.state === 'running' ? res() : bad(); }, 60); };
            var p = null;
            try { p = c.resume(); } catch (e) { bad(); return; }
            if (p && p.then) p.then(settle, bad); else settle();
        });
    }

    function audioEl(url) { var a = new Audio(url); a.preload = 'auto'; return a; }

    /* ---------------- 单段循环 ---------------- */
    function mkLoop(url, opt) {
        opt = opt || {};
        var vol = opt.volume == null ? 1 : opt.volume;
        var startAt = opt.start || 0;
        var span = opt.duration || 0;
        var gain = null, node = null, buf = null;
        var gen = 0, state = 'idle', pausedAt = startAt;
        var t0 = 0, beginOff = startAt;
        var el = null;

        function wrap(off) {                     // 把任意位置折回循环区间 [startAt, dur)
            var dur = buf ? buf.duration : 0;
            var s = dur - startAt;
            if (s <= 0) return startAt;
            return startAt + (((off - startAt) % s + s) % s);
        }
        function nowPos() {
            if (state !== 'playing' || !buf) return pausedAt;
            var c = ac();
            if (!c) return pausedAt;
            return wrap(beginOff + (c.currentTime - t0));   // loop 在渲染线程内回绕，只需按时间推位置
        }
        function stopNode(fade) {
            if (!node) return;
            var n = node, gnode = n.__g;
            node = null;
            try {
                var c = ac();
                if (c && gnode && fade > 0) {
                    var t = c.currentTime;
                    gnode.gain.cancelScheduledValues(t);
                    gnode.gain.setValueAtTime(gnode.gain.value, t);
                    gnode.gain.linearRampToValueAtTime(0.0001, t + fade);
                    n.stop(t + fade + 0.02);
                } else n.stop();
            } catch (e) {}
        }
        function elemPlay(off) {
            try {
                if (!el) { el = audioEl(url); el.loop = true; }
                el.volume = vol;
                el.currentTime = Math.max(0, off || 0);
                el.play().catch(function () {});
            } catch (e) {}
        }

        function start(offset) {
            var off = offset == null ? pausedAt : offset;
            var my = ++gen;
            stopNode(0.02);                 // 再起播时先收掉上一段，避免两条循环叠在一起
            state = 'playing';
            pausedAt = off;
            if (!ok) { elemPlay(off); return Promise.resolve(); }
            var g = gate();
            load(url).then(function (b) {
                if (my !== gen) return;
                var c = ac();
                if (!b || !c) { elemPlay(off); return; }
                if (span) {
                    var trimmed = trim(c, b, startAt, span);
                    if (trimmed !== b) {
                        b = trimmed;
                        startAt = 0;
                        cache[url] = Promise.resolve(b);   // 缓存换成裁好的，别留整轨大缓冲
                    }
                }
                buf = b;
                if (!gain) { gain = c.createGain(); gain.connect(c.destination); }
                gain.gain.cancelScheduledValues(c.currentTime);
                gain.gain.setValueAtTime(vol, c.currentTime);
                node = c.createBufferSource();
                var gnode = c.createGain();
                gnode.connect(gain);
                node.__g = gnode;
                node.buffer = b;
                node.loop = true;
                if (startAt) { node.loopStart = startAt; node.loopEnd = b.duration; }
                node.connect(gnode);
                t0 = c.currentTime + 0.01;
                beginOff = off;
                node.start(t0, wrap(off));
            });
            return g;
        }

        function stop(fade) {
            gen++;
            state = 'idle';
            pausedAt = startAt;
            if (el) { try { el.pause(); } catch (e) {} }
            stopNode(fade == null ? 0.03 : fade);
        }
        function suspend() {
            if (state !== 'playing') return;
            pausedAt = nowPos();
            state = 'paused';
            stopNode(0.02);
            if (el) { try { el.pause(); } catch (e) {} }
        }
        function resume() {
            if (state !== 'paused') return Promise.resolve();
            return start(pausedAt);
        }
        function setVolume(v) {
            vol = Math.max(0, Math.min(1, v));
            var c = ac();
            if (gain && c) {
                try {
                    gain.gain.cancelScheduledValues(c.currentTime);
                    gain.gain.setTargetAtTime(vol, c.currentTime, 0.03);
                } catch (e) { gain.gain.value = vol; }
            }
            if (el) el.volume = vol;
        }
        return {
            start: start, stop: stop, halt: function () { stop(0); },
            suspend: suspend, resume: resume, setVolume: setVolume,
            state: function () { return state; }
        };
    }

    /* ---------------- intro → loop → outro ---------------- */
    function mkSequence(opt) {
        var vol = opt.volume == null ? 1 : opt.volume;
        var gain = null;
        var iNode = null, lNode = null, oNode = null;
        var gen = 0, mode = 'idle';          // idle | intro | loop
        var paused = false, pauseMode = 'intro', pausePos = 0;
        var tIntro = 0, tLoop = 0, introLen = 0, loopLen = 0, introOff = 0;
        var timers = [];
        var fb = null;                        // <audio> 降级路径

        function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }
        function later(ms, fn) { timers.push(setTimeout(fn, Math.max(0, ms))); }

        function ensureGain(c) {
            if (!gain) { gain = c.createGain(); gain.connect(c.destination); }
            try {
                gain.gain.cancelScheduledValues(c.currentTime);
                gain.gain.setValueAtTime(vol, c.currentTime);
            } catch (e) { gain.gain.value = vol; }
            return gain;
        }
        function kill(v, fade) {
            if (!v) return;
            try {
                var c = ac();
                if (c && v.g && fade > 0) {
                    var t = c.currentTime;
                    v.g.gain.cancelScheduledValues(t);
                    v.g.gain.setValueAtTime(v.g.gain.value, t);
                    v.g.gain.linearRampToValueAtTime(0.0001, t + fade);
                    v.s.stop(t + fade + 0.02);
                } else v.s.stop();
            } catch (e) {}
        }
        function playBuf(c, b, loop, offset, when) {
            var g = c.createGain();
            g.connect(gain);
            var s = c.createBufferSource();
            s.buffer = b;
            s.loop = !!loop;
            s.connect(g);
            s.start(when, offset || 0);
            return { s: s, g: g };
        }
        function nowPos() {
            var c = ac();
            if (!c) return pausePos;
            if (mode === 'intro') return Math.min(introLen || 0, introOff + Math.max(0, c.currentTime - tIntro));
            if (mode === 'loop') return loopLen ? (((c.currentTime - tLoop) % loopLen) + loopLen) % loopLen : 0;
            return pausePos;
        }

        /* intro 从 offset 起播，loop 精确排在 intro 剩余长度的末尾（同一时间线，零接缝） */
        function beginIntro(offset) {
            mode = 'intro';
            pauseMode = 'intro';
            pausePos = offset || 0;
            paused = false;
            var my = ++gen;
            var off = Math.max(0, offset || 0);
            Promise.all([load(opt.intro), load(opt.loop)]).then(function (bs) {
                if (my !== gen) return;
                var ib = bs[0], lb = bs[1], c = ac();
                if (!ib || !lb || !c) { fbStart(off); return; }
                ensureGain(c);
                var t = c.currentTime + 0.02;
                introOff = Math.min(off, ib.duration);
                var remain = Math.max(0, ib.duration - introOff);
                iNode = remain > 0 ? playBuf(c, ib, false, introOff, t) : null;
                lNode = playBuf(c, lb, true, 0, t + remain);
                tIntro = t;
                tLoop = t + remain;
                introLen = ib.duration;
                loopLen = lb.duration;
                if (!remain) mode = 'loop';
                else later(remain * 1000 + 10, function () { if (my === gen) mode = 'loop'; });
            });
        }
        /* 直接从 loop 起播（enterTape / 从 loop 挂起后恢复） */
        function beginLoop(offset) {
            mode = 'loop';
            pauseMode = 'loop';
            pausePos = offset || 0;
            paused = false;
            var my = ++gen;
            var off = offset || 0;
            load(opt.loop).then(function (lb) {
                if (my !== gen) return;
                var c = ac();
                if (!lb || !c) { fbLoop(off); return; }
                ensureGain(c);
                lNode = playBuf(c, lb, true, off, c.currentTime + 0.02);
                tLoop = c.currentTime + 0.02;
                loopLen = lb.duration;
            });
        }
        function killAll(fade) {
            kill(iNode, fade); iNode = null;
            kill(lNode, fade); lNode = null;
        }
        function killOutro() {
            if (!oNode) return;
            kill(oNode, 0.02); oNode = null;
        }
        function stopAll() {
            gen++;
            clearTimers();
            killAll(0.03);
            killOutro();
            mode = 'idle';
            paused = false;
            pausePos = 0;
            if (fb) { try { fb.intro.pause(); fb.loop.pause(); if (fb.outro) fb.outro.pause(); } catch (e) {} }
        }

        /* ---- <audio> 降级（无 WebAudio） ---- */
        function fbEnsure() {
            if (fb) return fb;
            fb = { intro: audioEl(opt.intro), loop: audioEl(opt.loop), outro: opt.outro ? audioEl(opt.outro) : null };
            fb.loop.loop = true;
            fb.intro.addEventListener('ended', function () {
                if (mode !== 'intro' || paused) return;
                mode = 'loop';
                fb.loop.volume = vol;
                fb.loop.currentTime = 0;
                fb.loop.play().catch(function () {});
            });
            return fb;
        }
        function fbStart(off) {
            var f = fbEnsure();
            f.loop.pause(); if (f.outro) f.outro.pause();
            f.intro.volume = vol;
            try { f.intro.currentTime = off || 0; } catch (e) {}
            f.intro.play().catch(function () {});
        }
        function fbLoop(off) {
            var f = fbEnsure();
            f.intro.pause();
            f.loop.volume = vol;
            try { f.loop.currentTime = off || 0; } catch (e) {}
            f.loop.play().catch(function () {});
        }

        function start() {
            if (!ok) { mode = 'intro'; paused = false; fbStart(0); return Promise.resolve(); }
            var g = gate();
            beginIntro(0);
            return g;
        }
        function playLoop() {
            if (!ok) { fbLoop(0); return Promise.resolve(); }
            var g = gate();
            beginLoop(0);
            return g;
        }
        function stop() {
            var f = fb;
            stopAll();                                  // 淡出当前段（含降级元素）
            var my = gen;
            if (!ok) {
                if (f && f.outro) { f.outro.volume = vol; f.outro.currentTime = 0; f.outro.play().catch(function () {}); }
                return;
            }
            load(opt.outro).then(function (ob) {
                if (my !== gen) return;
                var c = ac();
                if (!ob || !c) {                        // outro 没解码出来：有 <audio> 降级就退回它
                    if (f && f.outro) { f.outro.volume = vol; f.outro.currentTime = 0; f.outro.play().catch(function () {}); }
                    return;
                }
                ensureGain(c);
                oNode = playBuf(c, ob, false, 0, c.currentTime + 0.01);
            });
        }
        function halt() {
            stopAll();
            mode = 'idle';
        }
        function suspend() {
            if (mode === 'idle' || paused) return;
            pauseMode = mode;
            pausePos = nowPos();
            paused = true;
            var my = ++gen;
            clearTimers();
            killAll(0.02);
            if (fb) { try { fb.intro.pause(); fb.loop.pause(); } catch (e) {} }
        }
        function resume() {
            if (!paused) return Promise.resolve();
            paused = false;
            if (!ok) {
                if (pauseMode === 'loop') { fbLoop(pausePos); return Promise.resolve(); }
                fbStart(pausePos); return Promise.resolve();
            }
            var g = gate();
            if (pauseMode === 'loop') beginLoop(pausePos);
            else beginIntro(pausePos);
            return g;
        }
        function setVolume(v) {
            vol = Math.max(0, Math.min(1, v));
            var c = ac();
            if (gain && c) {
                try { gain.gain.setTargetAtTime(vol, c.currentTime, 0.03); } catch (e) { gain.gain.value = vol; }
            }
            if (fb) { try { fb.intro.volume = vol; fb.loop.volume = vol; if (fb.outro) fb.outro.volume = vol; } catch (e) {} }
        }
        return {
            start: start, stop: stop, halt: halt,
            suspend: suspend, resume: resume, playLoop: playLoop,
            setVolume: setVolume, state: function () { return mode; }
        };
    }

    return { loop: mkLoop, sequence: mkSequence };
})();
