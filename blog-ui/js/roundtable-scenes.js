/* ===== 圆桌演播厅·舞台演出层（canvas 精灵表播放器，roundtable.html 专用） =====
   素材：roundtable-scenes/{mad_idle,oshiro_move,oshiro_idle}.webp + manifest.json
   演出顺序（AC-18 / TR-12.1）：
     start()             mad_idle 循环（入场待机）
     hostOpeningDone()   oshiro_move 仅播一次（纯装饰，不绑任何台词）
                         播放结束自动切 oshiro_idle 循环（全员待机）
     stop()              离开舞台时停 rAF、清画布
   技术要点：imageSmoothingEnabled=false；rAF tick + acc 按 manifest.frameMs 切帧。
   暴露 window.RoundtableScenes：
     attach(canvasEl)  绑定舞台 canvas
     start()           从头进入演出（mad_idle）
     hostOpeningDone() 主持开场结束后触发一次移动段
     stop()            停止并清场
     state()           {ready,cur,frameIdx,playing,movePlayed,seq} 供浏览器断言
*/
(function () {
    var BASE = 'roundtable-scenes/';
    var W = 1152, H = 720;

    var canvas = null, ctx = null;
    var M = null, imgs = {}, ready = false, loading = null;
    var cur = null, frameIdx = 0, acc = 0, last = 0, raf = 0;
    var playing = false, onEnd = null, started = false, movePlayed = false;
    var seq = [];                       // 已播放段落记录 [{key,t}]，供断言顺序与次数

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
        if (!ready || !cur || !imgs[cur]) return;
        var m = M[cur];
        var r = Math.floor(frameIdx / m.cols), c = frameIdx % m.cols;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(imgs[cur], c * m.frameW, r * m.frameH, m.frameW, m.frameH, 0, 0, W, H);
    }

    function tick(ts) {
        if (!playing) return;
        if (!last) last = ts;
        acc += ts - last;
        last = ts;
        var m = M[cur];
        while (acc >= m.frameMs) {
            acc -= m.frameMs;
            frameIdx++;
            if (frameIdx >= m.frames) {
                if (m.loop) {
                    frameIdx = 0;
                } else {
                    frameIdx = m.frames - 1;
                    playing = false;
                    drawFrame();
                    var cb = onEnd;
                    onEnd = null;
                    if (cb) cb();
                    return;
                }
            }
        }
        drawFrame();
        raf = requestAnimationFrame(tick);
    }

    function play(key) {
        if (!ready || !imgs[key]) return;
        cur = key;
        frameIdx = 0;
        acc = 0;
        last = 0;
        playing = true;
        onEnd = null;
        seq.push({ key: key, t: performance.now() });
        if (raf) cancelAnimationFrame(raf);
        drawFrame();
        raf = requestAnimationFrame(tick);
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
            seq = [];
            load().then(function () { if (started) play('mad_idle'); });
        },
        hostOpeningDone: function () {
            if (movePlayed) return;
            movePlayed = true;
            load().then(function () {
                if (!started) return;
                play('oshiro_move');
                onEnd = function () { play('oshiro_idle'); };
            });
        },
        stop: function () {
            started = false;
            playing = false;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            cur = null;
            if (ctx) ctx.clearRect(0, 0, W, H);
        },
        state: function () {
            return {
                ready: ready, cur: cur, frameIdx: frameIdx,
                playing: playing, movePlayed: movePlayed, seq: seq.slice()
            };
        }
    };
    window.RoundtableScenes = api;
})();
