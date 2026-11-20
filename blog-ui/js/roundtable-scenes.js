/* ===== 圆桌演播厅·舞台演出层（canvas 精灵表播放器，roundtable.html 专用） =====
   素材：roundtable-scenes/{mad_idle,oshiro_move}.webp + manifest.json
   演出模型改成原作尾声 CS08_Ending 的一次性时间轴（见 celeste-dash-反编译研究.md 第 30 章）：
     淡出 1.5s → 黑屏 0.25s（换场）→ 淡入 1.0s → 定格 0.25s → oshiro_move 只播一次 → 停在末帧
   与旧版差异：oshiro_move 播完不再进入 oshiro_idle 循环，整段演出收敛到静止画面。
   暴露 window.RoundtableScenes：
     attach(canvasEl)  绑定舞台 canvas
     start()           淡入并进入 mad_idle 待机
     hostOpeningDone() 触发一次聚集演出（只生效一次）
     stop()            停止 rAF、清场
     state()           {ready,cur,frameIdx,playing,stage,fade,movePlayed,seq} 供断言
*/
(function () {
    var BASE = 'roundtable-scenes/';
    var W = 1152, H = 720;

    // 尾声节奏，取证自 Celeste.CS08_Ending / <OshiroEnters>d__20
    var T_OUT = 1.5, T_BLACK = 0.25, T_IN = 1.0, T_HOLD = 0.25;

    var canvas = null, ctx = null;
    var M = null, imgs = {}, ready = false, loading = null;
    var cur = null, frameIdx = 0, acc = 0, last = 0, raf = 0;
    var running = false, playing = false, onEnd = null;
    var started = false, movePlayed = false;
    var stage = 'idle';                  // idle | out | black | in | hold | move | done
    var seq = [];                        // 已播放段落记录 [{key,t}]

    var fade = 1, fadeFrom = 1, fadeTo = 1, fadeT = 1, fadeDur = 1, fadeDone = null;
    var hold = 0, holdDone = null;

    function load() {
        if (loading) return loading;
        loading = fetch(BASE + 'manifest.json')
            .then(function (r) { return r.json(); })
            .then(function (m) {
                M = m;
                return Promise.all(Object.keys(M).map(function (k) {
                    return new Promise(function (res) {
                        var im = new Image();
                        im.onload = function () { imgs[k] = im; res(); };
                        im.onerror = function () { res(); };   // 单张失败不阻塞其余段落
                        im.src = BASE + M[k].src;
                    });
                }));
            })
            .then(function () { ready = true; return api; });
        return loading;
    }

    function drawFrame() {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        if (ready && cur && imgs[cur] && M[cur]) {
            var m = M[cur];
            var r = Math.floor(frameIdx / m.cols), c = frameIdx % m.cols;
            ctx.drawImage(imgs[cur], c * m.frameW, r * m.frameH, m.frameW, m.frameH, 0, 0, W, H);
        }
        if (fade > 0) {
            ctx.globalAlpha = Math.max(0, Math.min(1, fade));
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
    }

    function setFade(to, dur, done) {
        fadeFrom = fade;
        fadeTo = to;
        fadeT = 0;
        fadeDur = Math.max(0.001, dur);
        fadeDone = done || null;
    }

    function play(key) {
        if (!ready || !imgs[key] || !M[key]) return false;
        cur = key;
        frameIdx = 0;
        acc = 0;
        playing = true;
        onEnd = null;
        seq.push({ key: key, t: performance.now() });
        drawFrame();
        return true;
    }

    function startLoop() {
        if (running) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(tick);
    }

    function tick(ts) {
        if (!running) return;
        var dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
        last = ts;

        if (fadeT < fadeDur) {
            fadeT = Math.min(fadeDur, fadeT + dt);
            var k = fadeT / fadeDur;
            fade = fadeFrom + (fadeTo - fadeFrom) * k;
            if (fadeT >= fadeDur && fadeDone) {
                var fd = fadeDone;
                fadeDone = null;
                fd();
            }
        }

        if (hold > 0) {
            hold -= dt;
            if (hold <= 0) {
                hold = 0;
                var hd = holdDone;
                holdDone = null;
                if (hd) hd();
            }
        }

        if (playing && cur && M[cur]) {
            var m = M[cur];
            acc += dt * 1000;
            while (acc >= m.frameMs) {
                acc -= m.frameMs;
                frameIdx++;
                if (frameIdx >= m.frames) {
                    if (m.loop) {
                        frameIdx = 0;
                    } else {
                        frameIdx = m.frames - 1;
                        playing = false;
                        var cb = onEnd;
                        onEnd = null;
                        if (cb) cb();
                        break;
                    }
                }
            }
        }

        drawFrame();

        if (!playing && hold <= 0 && fadeT >= fadeDur) {
            running = false;
            raf = 0;
            return;
        }
        raf = requestAnimationFrame(tick);
    }

    function enterBlack() {
        // 黑屏期间换场：直接切到聚集后的第一帧，避免看到中间状态
        cur = 'oshiro_move';
        frameIdx = 0;
        acc = 0;
        playing = false;
        stage = 'black';
        drawFrame();
        hold = T_BLACK;
        holdDone = function () {
            stage = 'in';
            setFade(0, T_IN, function () {
                stage = 'hold';
                hold = T_HOLD;
                holdDone = function () {
                    stage = 'move';
                    play('oshiro_move');
                    onEnd = function () {
                        stage = 'done';
                        playing = false;
                        frameIdx = M['oshiro_move'].frames - 1;
                        drawFrame();
                    };
                };
            });
        };
    }

    var api = {
        attach: function (canvasEl) {
            canvas = canvasEl;
            ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            load();
        },
        start: function () {
            started = true;
            movePlayed = false;
            stage = 'idle';
            seq = [];
            hold = 0;
            holdDone = null;
            onEnd = null;
            playing = false;
            cur = null;
            fade = 1;
            fadeT = fadeDur = 1;
            load().then(function () {
                if (!started) return;
                setFade(0, T_IN, null);
                startLoop();
                play('mad_idle');
            });
        },
        hostOpeningDone: function () {
            if (movePlayed) return;
            movePlayed = true;
            load().then(function () {
                if (!started) return;
                stage = 'out';
                seq.push({ key: 'gather', t: performance.now() });
                setFade(1, T_OUT, enterBlack);
                startLoop();
            });
        },
        stop: function () {
            started = false;
            running = false;
            playing = false;
            hold = 0;
            holdDone = null;
            fadeDone = null;
            onEnd = null;
            stage = 'idle';
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            cur = null;
            if (ctx) ctx.clearRect(0, 0, W, H);
        },
        state: function () {
            return {
                ready: ready, cur: cur, frameIdx: frameIdx, playing: playing,
                stage: stage, fade: fade, movePlayed: movePlayed,
                gathered: stage === 'done', seq: seq.slice()
            };
        }
    };
    window.RoundtableScenes = api;
})();
