/**
 * js/lib/png-anim.js —— PNG 序列帧播放器（Badeline 驻场动作用）
 *
 * 现有驻场动作吃的是 GIF（celeste-player/badeline/*.gif），而图集
 * Atlases/Gameplay/characters/badeline/ 只有逐帧 PNG、没有对应 GIF。
 * 这里照 badeline-crawlout.js 的预载写法（fetch → blob URL → 缓存）做一个
 * 只负责"切帧"的最小播放器：不认任何页面 DOM，不写 CSS，不负责定位。
 *
 * 尺寸口径（与 #badelineImg 现状一致，播放器不做任何缩放）：
 *   - 这些动作全部 32×32 画布，脚底贴画布底边（官方 Justify .5,1）
 *   - "脚底锚点对齐"由现有 CSS 负责（object-fit:contain + translate(-50%,-100%)）
 *   - 各姿势本体高 8–18px 是素材本身的差异，不拉伸、不加 scale：
 *       lookUp 13px 宽（现用静态 lookingUp_f 是 15px，差 2px）
 *       idle   11–12px 高（现用 spin 是 16px，矮约 25%）
 *       tired  8–10px 高（天然是垂头姿态）
 *
 * 帧表/参数（草案）：
 *   图集不含 Sprites.xml，逐帧 delay 无法核实；下面的取值与
 *   badeline-panel.js 立绘 120ms 的节奏同量级，先按可感知的节奏定：
 *
 *   名字    动画目录       帧数  delay   循环  播完回
 *   lookUp  lookUp         8     100ms   是    —         悬浮待机（替换 1 帧静态图）
 *   idle    idle           9     120ms   是    —         停下后的站立待机
 *   tired   tired          4     150ms   否    lookUp    叹气/垂头（一次性）
 *   laugh   laugh          6     110ms   否    lookUp    被点击/嘲弄反应（一次性）
 *   angry   angry          6     120ms   否    lookUp    暗紫版生气（只播 00–05，不接亮紫爆发）
 *
 * 用法：
 *   var anim = PngAnim.attach(document.getElementById('badelineImg'));
 *   anim.play('lookUp');        // 循环
 *   anim.play('laugh');         // 一次性；结束回调 onEnd，然后自动 play('lookUp')
 *   anim.stop();                // 中途停：停在当前帧，不再推进
 *   anim.playing(); anim.current();
 *
 * 加载/缓存：
 *   - play 时才拉该组帧；launch 时 0 号帧就绪才起表，播完前预取同组其余帧
 *   - 同一帧只 fetch 一次；fetch 失败（file:// / 断网）退回原始 URL，不重复重试
 *   - 组内帧 ≤ 9，URL 补零两位（与图集命名一致：lookUp00.png …）
 */
window.PngAnim = (function () {
    'use strict';

    var BASE = 'Atlases/Gameplay/characters/badeline/';

    // 帧表：唯一的一份"动作参数"，接线时直接引用，别在页面里再抄一遍
    var PRESETS = {
        lookUp: { anim: 'lookUp', n: 8, delay: 100, loop: true,  next: null },
        idle:   { anim: 'idle',   n: 9, delay: 120, loop: true,  next: null },
        tired:  { anim: 'tired',  n: 4, delay: 150, loop: false, next: 'lookUp' },
        laugh:  { anim: 'laugh',  n: 6, delay: 110, loop: false, next: 'lookUp' },
        angry:  { anim: 'angry',  n: 6, delay: 120, loop: false, next: 'lookUp' }
    };

    var urls = Object.create(null);      // 'idle#3' → blob URL / 原始 URL
    var inflight = Object.create(null);  // 同一帧并发只发一次请求

    function pad(i) { return i < 10 ? '0' + i : '' + i; }

    function frameUrl(name, i, dir) {
        return (dir || BASE) + name + pad(i) + '.png';
    }

    function key(name, i) { return name + '#' + i; }

    // 单帧：命中缓存直接返回；未命中则 fetch→blob（预解码，切帧不闪）
    function loadFrame(name, i, dir) {
        var k = key(name, i);
        if (urls[k]) return Promise.resolve(urls[k]);
        if (inflight[k]) return inflight[k];

        var raw = frameUrl(name, i, dir);
        if (!window.fetch) { urls[k] = raw; return Promise.resolve(raw); }

        inflight[k] = fetch(raw).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        }).then(function (b) {
            urls[k] = URL.createObjectURL(b);
            return urls[k];
        }).catch(function () {
            urls[k] = raw;   // file:// / 断网：直连，不重试
            return raw;
        }).then(function (u) {
            delete inflight[k];
            return u;
        });
        return inflight[k];
    }

    function preload(name, n, dir) {
        var jobs = [];
        for (var i = 0; i < n; i++) jobs.push(loadFrame(name, i, dir));
        return Promise.all(jobs);
    }

    // opts: { dir, presets } —— 默认用上面的 Badeline 帧表与图集目录
    function create(el, opts) {
        if (!el || !el.tagName) return null;
        opts = opts || {};
        var dir = opts.dir || BASE;
        var presets = opts.presets || PRESETS;
        var onFrameDefault = opts.onFrame || null;   // 每帧回调：页面用它同步叠层（如头发）

        var timer = 0, token = 0;
        var state = null;     // 当前动作：{name, anim, n, delay, loop, next, i, onEnd}
        var cur = 0;

        function clearTimer() {
            if (timer) { clearTimeout(timer); timer = 0; }
        }

        function delayAt(p, i) {
            if (Array.isArray(p.delay)) {
                return p.delay[i] != null ? p.delay[i] : p.delay[p.delay.length - 1];
            }
            return p.delay;
        }

        // 未进缓存时先用原始 URL 出画（HTTP 缓存兜底），避免首轮帧位空图；
        // 不把"正在显示的原始 URL"换成 blob，免得同帧二次解码闪一下
        function show(name, i) {
            cur = i;
            var k = key(name, i);
            if (urls[k]) {
                if (el.src !== urls[k]) el.src = urls[k];
            } else {
                el.src = frameUrl(name, i, dir);
                loadFrame(name, i, dir);   // 顺手填缓存，下一轮直接用 blob
            }
            // 帧回调：告知外部"现在是哪个动作的第几帧"，用于叠层逐帧跟随
            var p = state;
            if (p && p.onFrame) p.onFrame(p.name, i, el.src);
        }

        function tick() {
            timer = 0;
            if (!state) return;
            var p = state;
            var next = p.i + 1;

            if (next >= p.n) {
                if (p.loop) {
                    next = 0;
                } else {
                    state = null;
                    if (p.onEnd) p.onEnd(p.name);
                    if (p.next) play(p.next);
                    return;
                }
            }

            p.i = next;
            show(p.anim, next);
            if (!state) return;
            timer = setTimeout(tick, delayAt(p, next));
        }

        function play(name, override) {
            var base = presets[name];
            if (!base) return false;
            var p = {
                name: name,
                anim: base.anim || name,
                n: base.n,
                delay: base.delay,
                loop: base.loop !== false,
                next: base.next || null,
                i: 0,
                onEnd: (override && override.onEnd) || base.onEnd || null,
                onFrame: (override && override.onFrame) || base.onFrame || onFrameDefault || null
            };
            if (override) {
                if (override.loop != null) p.loop = !!override.loop;
                if (override.delay != null) p.delay = override.delay;
                if (override.next !== undefined) p.next = override.next;
            }

            clearTimer();
            var t = ++token;
            state = p;
            cur = 0;

            // 0 号帧就绪后才起表：避免第一帧空图；其余帧边播边填
            loadFrame(p.anim, 0, dir).then(function () {
                if (t !== token || !state) return;
                show(p.anim, 0);
                timer = setTimeout(tick, delayAt(p, 0));
            });
            preload(p.anim, p.n, dir);   // 同组预取（已缓存则立即 resolve）
            return true;
        }

        function stop() {
            clearTimer();
            token++;
            state = null;
        }

        return {
            play: play,
            stop: stop,
            playing: function () { return !!state; },
            current: function () { return { name: state ? state.name : null, index: cur }; },
            frameUrl: function (name, i) { return frameUrl(name, i, dir); },
            preload: function (name) { return preload(presets[name].anim, presets[name].n, dir); }
        };
    }

    var stats = function () {
        return { cached: Object.keys(urls).length, pending: Object.keys(inflight).length };
    };

    return {
        PRESETS: PRESETS,
        frameUrl: frameUrl,
        create: create,
        attach: create,
        preload: preload,
        preloadAll: function () {
            var jobs = [];
            Object.keys(PRESETS).forEach(function (k) {
                var p = PRESETS[k];
                jobs.push(preload(p.anim, p.n));
            });
            return Promise.all(jobs);
        },
        stats: stats
    };
})();
