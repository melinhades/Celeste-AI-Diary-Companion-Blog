/* ===== 【废案 · 已停用】js/bird-ascent.js — CS10_FinalLaunch（第九章 Farewell 进入太空）过场的 REA 复刻 =====
   2026-11-01：用户决定不再把这段飞升过场放在 index 的鸟按钮点击链路里，
   改为「鸟飞出 → 统一加载动画 → 进纪念页」。本文件与 index-bird.ascent.css
   一起从 js/ 与 css/ 移到这里留档，不再被任何页面引用。
   原链路：index.html 的 #birdAscent 覆盖层 → 本引擎 mode:'intro' 演到 handoffAfter=9.3
   → 写 sessionStorage 种子跳 celeste-farewell-remembered-demo.html?ascent=1 → 白幕淡出。

   整段过场是「只依赖发射后名义时间 t 的确定性函数」，index 与 demo 两页共用同一套渲染。

   证据（本地 Celeste.dll 反编译，dump 在 .screenshots/.tmp/rea/）：
     · Celeste.CS10_FinalLaunch/`<Cutscene>d__14`
         fadeToWhite = p（p += dt/12）、streaks.Alpha = p、背景 FadeAlphaMultiplier = 1-p、
         cameraOffset = (0,-20)、EndCutscene 前 cameraOffset.Y → 180（Ease.BigBackIn，dt/2）……
     · Celeste.CS10_FinalLaunch/`<BirdRoutine>d__17`
         yield 0.8 → BackOut 4s（(200,220)→(128,66)）→ CubeInOut 2s（+64,0）→ BigBackIn 4s（(120,-100)）+ X += t*32
         timer 抖动：X += sin(t)*4、Y += sin(t*0.1)*4 + sin(t*0.25)*4
     · Celeste.CS10_FinalLaunch/`<WaveCamera>d__16`
         X = sin(timer)*16、Y = sin(timer*0.5)*16 + sin(timer*0.25)*8、timer += dt*2
     · Celeste.AscendManager/Streaks —— 80 个 slice 粒子（32×128），MinSpeed 600 / MaxSpeed 2000
     · Celeste.BlackholeBG —— 20 层 portal + 200 粒子 + 40 流（SM=3，Direction=-2.5，center(160,190)）
     · Celeste.Player.SummitLaunchBegin —— Sprite.Play("launch")、Speed = -UnitY*240
     · Celeste.Player.SummitLaunchUpdate —— 每 0.03s 喷 P_Move 粒子、Speed 恒为 -UnitY*240；
         Scene.OnInterval(0.2f) 发一枚 SpeedRing；全程无落地判定（匀速上升，不会「跃起再落地」）
     · Celeste.SpeedRing —— Update: lerp += 3*dt（1/3s 消失）、Position += normal*10*dt；
         Render: color*Lerp(0.6,0,lerp)；DrawRing 半径 Lerp(4,14,lerp) 且沿 normal 压到 0.5
   素材只来自 blog-ui/Atlases：characters/bird/{flyup00,FlyUp01..15}.png（32×24）、
   scenery/launch/slice00..02.png（32×128）、objects/temple/portal/portal.png（240×240）、
   characters/player/launch00..07.png（32×32，见 Content/Graphics/Sprites.xml：
   <Loop id="launch" path="launch" delay="0.06" frames="0-7"/>，Origin (16,32)）。
   唯一时间类偏差：TIME_SCALE = 1.5（原版起飞到全白约 16s，作为页面跳转过长），曲线与常量不变。
*/

(function () {
    'use strict';

    var AT = 'Atlases/Gameplay/';
    var BIRD_DIR = AT + 'characters/bird/';
    var SLICE_DIR = AT + 'scenery/launch/slice';
    var PORTAL_SRC = AT + 'objects/temple/portal/portal.png';
    var PLAYER_DIR = AT + 'characters/player/';

    /* ---------- 原作常量 ---------- */
    var VW = 320, VH = 180;                 // 原作 play 分辨率
    var TIME_SCALE = 1.5;                   // 名义秒是实耗秒的 1.5 倍（见文件头说明）
    var BIRD_IN = 0.8;                      // BirdRoutine 开头 yield 0.8
    var PH_A = 4.0, PH_B = 2.0, PH_C = 4.0; // t += dt/4 / dt/2 / dt/4
    var BIRD_END = BIRD_IN + PH_A + PH_B + PH_C;   // 10.8
    var HANDOFF = 9.3;                      // intro 模式的交接点（白化 0.775）
    var WHITE_AT = 12;                      // p = t/12
    var CAM_OFF_Y = -20;                    // Cutscene: cameraOffset = (0,-20)
    var CAM_DROP_TO = 180;                  // 收场 cameraOffset.Y → 180
    var CAM_SPEED = 240;                    // Player.SummitLaunchBegin: Speed = -UnitY*240

    /* BlackholeBG */
    var DIRECTION = -2.5;
    var SM = 3;                             // SnapStrength(2) → StrengthMultiplier 直接到位
    var CUBE_TIME_K = 1 + (SM - 1) * 0.7;   // 2.4
    var INNER = [0, 0, 0], OUTER_MILD = [0x51, 0x2a, 0x8b], OUTER_WILD = [0xbd, 0x21, 0x92];
    var MILD = [[0x6e, 0x31, 0x99], [0x85, 0x1f, 0x91], [0x30, 0x26, 0xb0]];
    var WILD = [[0xca, 0x4c, 0xa7], [0xb1, 0x4c, 0xca], [0xca, 0x4c, 0xa7]];
    var BG_STEPS = 20, PARTICLE_N = 200, STREAM_N = 40;
    var STREAK_N = 80;

    /* ---------- 数学（全部照 Ease 类） ---------- */
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function clampedMap(v, a, b, c, d) {
        var k = b === a ? 0 : (v - a) / (b - a);
        k = clamp01(k);
        return c + (d - c) * k;
    }
    function sineInOut(t) { return 0.5 - Math.cos(Math.PI * t) / 2; }
    function sineOut(t) { return Math.sin(t * 1.5707963); }
    function cubeIn(t) { return t * t * t; }
    function cubeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function backOut(t) { return 1 - Math.pow(1 - t, 2) * (1 - 2.70158 * t); }
    function bigBackIn(t) { return 33 * Math.pow(t, 5) - 59 * Math.pow(t, 4) + 32 * Math.pow(t, 3) - 5 * t * t; }
    function frac(v) { return v - Math.floor(v); }
    function mod(v, m) { return ((v % m) + m) % m; }

    function mix3(a, b, k) {
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    function rgbCss(c) {
        return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
    }
    function rgbaCss(c, a) {
        return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
    }
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function rangeOf(rnd, a, b) { return a + rnd() * (b - a); }

    /* ---------- 时间线：鸟（BirdRoutine 三段，屏幕坐标） ---------- */
    function birdPos(t) {
        if (t < BIRD_IN || t >= BIRD_END) return null;
        var x, y;
        if (t < BIRD_IN + PH_A) {
            var u1 = (t - BIRD_IN) / PH_A;
            var e1 = backOut(u1);
            x = 200 + (128 - 200) * e1;       // from (200,220)
            y = 220 + (66 - 220) * e1;        // to   (128,66)
        } else if (t < BIRD_IN + PH_A + PH_B) {
            var u2 = (t - BIRD_IN - PH_A) / PH_B;
            x = 128 + 64 * cubeInOut(u2);     // to 不更新，终点 (192,66)
            y = 66;
        } else {
            var u3 = (t - BIRD_IN - PH_A - PH_B) / PH_C;
            var e3 = bigBackIn(u3);
            x = 192 + (120 - 192) * e3 + u3 * 32;   // to2 (192,66) → from3 (120,-100)，再 X += t*32
            y = 66 + (-100 - 66) * e3;
        }
        // 位置每帧先重置，再叠正弦抖动（IL: birdScreenPosition 不累积）
        x += Math.sin(t) * 4;
        y += Math.sin(t * 0.1) * 4 + Math.sin(t * 0.25) * 4;
        return { x: x, y: y };
    }

    /* flyupIdle = FlyUp10..15 @0.1s 循环；flyupRoll = flyup00..FlyUp15 @0.1s 播一遍后转 idle */
    function birdFrameIndex(t) {
        var rolls = [BIRD_IN + PH_A, 8.2];
        for (var i = 0; i < rolls.length; i++) {
            var a = rolls[i], b = a + 1.6;
            if (t >= a && t < b) {
                var f = Math.floor((t - a) / 0.1);
                return f < 0 ? 0 : (f > 15 ? 15 : f);
            }
        }
        var g = Math.floor(t / 0.1) % 6;
        return 10 + g;
    }

    /* ---------- 时间线：相机（WaveCamera） ---------- */
    function waveAt(t) {                       // timer = t*2
        return {
            x: Math.sin(t * 2) * 16,
            y: Math.sin(t) * 16 + Math.sin(t * 0.5) * 8
        };
    }

    /* ---------- 时间线：SummitLaunch（Player.SummitLaunch） ---------- */
    function launchFrameIndex(t) {             // Sprites.xml: <Loop id="launch" delay="0.06" frames="0-7"/>
        return Math.floor(t / LAUNCH_DELAY) % 8;
    }
    function launchFlash(t) {                  // BoostRoutine 末段 Level.Flash(White*0.5, true)
        return 0.5 * Math.max(0, 1 - t / 0.45);
    }
    function launchShake(t) {                  // BoostRoutine 末段 DirectionalShake(-UnitY, 0.6)
        return { x: 0, y: -0.6 * Math.max(0, 1 - t / 0.35) };
    }

    /* SpeedRing：SummitLaunchUpdate 每 0.2s 在 Center 发一枚（angle=π/2 → normal 指向 +Y）。
       Update 里 lerp += 3*dt（1/3s 后移除）、Position += normal*10*dt；
       Render 走 DrawRing：半径 Lerp(4,14,lerp)，沿 normal 方向压到 0.5 → 竖直半径减半。 */
    function drawRings(g, t, px, py) {
        var k0 = Math.floor(t / RING_INTERVAL);
        for (var k = k0; k >= 0; k--) {
            var age = t - k * RING_INTERVAL;
            if (age >= RING_LIFE) break;
            var l = age / RING_LIFE;           // = lerp
            var a = 0.6 * (1 - l);             // color*Lerp(0.6, 0, lerp)
            if (a <= 0.002) continue;
            var r = 4 + 10 * l;                // Lerp(4, 14, lerp)
            g.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
            g.lineWidth = 1;
            g.beginPath();
            g.ellipse(px, py + RING_DRIFT * age, r, r * 0.5, 0, 0, Math.PI * 2);
            g.stroke();
        }
    }

    /* ---------- Streaks（AscendManager/Streaks，固定种子） ---------- */
    var STREAKS = (function () {
        var rnd = mulberry32(0x9e3779b9), out = [];
        for (var i = 0; i < STREAK_N; i++) {
            var side = rnd() < 0.5 ? -1 : 1;
            var x = 160 + rangeOf(rnd, 24, 144) * side;
            var y0 = rnd() * 436;
            var speed = clampedMap(Math.abs(x - 160), 0, 160, 0.25, 1) * rangeOf(rnd, 600, 2000);
            out.push({ x: x, y0: y0, speed: speed, idx: Math.floor(rnd() * 3), col: Math.floor(rnd() * 2) });
        }
        return out;
    })();

    function streakPos(s, t) {
        return { x: mod(s.x, 320), y: -128 + mod(s.y0 + s.speed * t, 436) };
    }

    /* ---------- BlackholeBG 数据 ---------- */
    var COLOR_LERP = (function () {
        var out = [], i;
        for (i = 0; i < 3; i++) out.push(mix3(MILD[i], WILD[i], (SM - 1) / 3));
        return out;
    })();
    var COLOR_BLACK = (function () {               // Lerp(color, Black, j/19)
        var out = [], i, j;
        for (i = 0; i < 3; i++) {
            out.push([]);
            for (j = 0; j < 20; j++) out[i].push(mix3(COLOR_LERP[i], [0, 0, 0], j / 19));
        }
        return out;
    })();
    var COLOR_TRANSPARENT = (function () {         // Lerp(color, Transparent, j/19) —— rgb 与 alpha 一起走
        var out = [], i, j;
        for (i = 0; i < 3; i++) {
            out.push([]);
            for (j = 0; j < 20; j++) out[i].push({ rgb: mix3(COLOR_LERP[i], [0, 0, 0], j / 19), a: 1 - j / 19 });
        }
        return out;
    })();
    var PORTAL_BASE = mix3(INNER, mix3(OUTER_MILD, OUTER_WILD, (SM - 1) / 3), 1);

    var BG = (function () {
        var rnd = mulberry32(0x1f2e3d4c), parts = [], streams = [], i;
        for (i = 0; i < PARTICLE_N; i++) {
            var a1 = rnd() * Math.PI * 2;
            parts.push({ nx: Math.cos(a1), ny: Math.sin(a1), p0: rnd(), col: Math.floor(rnd() * 3) });
        }
        for (i = 0; i < STREAM_N; i++) {
            var a2 = rnd() * Math.PI * 2;
            streams.push({ nx: Math.cos(a2), ny: Math.sin(a2), p0: rnd(), speed: rangeOf(rnd, 0.6, 1.4), col: Math.floor(rnd() * 3) });
        }
        return { parts: parts, streams: streams };
    })();

    function shakeAt(t) {                          // 每 0.025s 重取，半径 2*(SM-1)=4
        var k = Math.floor(t / 0.025);
        var h = mulberry32(k * 2654435761 + 7)();
        var a = h * Math.PI * 2;
        return { x: Math.cos(a) * 4, y: Math.sin(a) * 4 };
    }

    /* ---------- 素材 ---------- */
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    var FLYUP_SRC = (function () {
        var a = [BIRD_DIR + 'flyup00.png'];
        for (var i = 1; i < 16; i++) a.push(BIRD_DIR + 'FlyUp' + pad2(i) + '.png');
        return a;
    })();

    /* SummitLaunchBegin: Sprite.Play("launch")，动画定义见游戏 Content/Graphics/Sprites.xml：
       <Loop id="launch" path="launch" delay="0.06" frames="0-7"/>，Origin (16,32) */
    var LAUNCH_SRC = (function () {
        var a = [];
        for (var i = 0; i < 8; i++) a.push(PLAYER_DIR + 'launch0' + i + '.png');
        return a;
    })();
    var LAUNCH_DELAY = 0.06;
    var RING_INTERVAL = 0.2;            // SummitLaunchUpdate: Scene.OnInterval(0.2f)
    var RING_LIFE = 1 / 3;              // SpeedRing.Update: lerp += 3*dt → 1/3 秒
    var RING_DRIFT = 10;                // SpeedRing.Update: Position += normal * 10 * dt

    var IM = { fly: [], slice: [], portal: null, launch: [], pink: [] };
    var PORTAL_TINT = [];
    var cache = {};

    function loadImage(src) {
        if (cache[src]) return cache[src];
        cache[src] = new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('missing ' + src)); };
            im.src = src;
        });
        return cache[src];
    }

    function tintCanvas(src, color) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'multiply';
        g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'destination-in';   // 还原贴图自身 alpha
        g.drawImage(src, 0, 0);
        return c;
    }

    function bakeTints() {
        var i;
        PORTAL_TINT = [];
        for (i = 0; i < 16; i++) {
            PORTAL_TINT.push(tintCanvas(IM.portal, rgbCss(mix3(INNER, PORTAL_BASE, i / 15))));
        }
        IM.pink = [];
        for (i = 0; i < IM.slice.length; i++) IM.pink.push(tintCanvas(IM.slice[i], '#e69ecb'));
    }

    var loaded = null;
    function loadFullSet() {
        if (loaded) return loaded;
        loaded = Promise.all([
            Promise.all(FLYUP_SRC.map(loadImage)),
            Promise.all([0, 1, 2].map(function (i) { return loadImage(SLICE_DIR + pad2(i) + '.png'); })),
            loadImage(PORTAL_SRC),
            Promise.all(LAUNCH_SRC.map(loadImage))
        ]).then(function (r) {
            IM.fly = r[0]; IM.slice = r[1]; IM.portal = r[2]; IM.launch = r[3];
            bakeTints();
            return true;
        }).catch(function () { return false; });
        return loaded;
    }

    /* ---------- 状态 ---------- */
    var S = null;

    function resize() {
        if (!S) return;
        var cv = S.canvas;
        S.dpr = Math.min(window.devicePixelRatio || 1, 2);
        S.W = window.innerWidth; S.H = window.innerHeight;
        cv.width = Math.round(S.W * S.dpr);
        cv.height = Math.round(S.H * S.dpr);
        S.Z = Math.max(S.W / VW, S.H / VH);            // cover
        S.ox = (S.W - VW * S.Z) / 2;
        S.oy = (S.H - VH * S.Z) / 2;
        var ctx = S.ctx;
        ctx.imageSmoothingEnabled = false;
    }

    function open(opts) {
        opts = opts || {};
        if (!opts.canvas) return Promise.resolve(false);
        close();
        S = {
            canvas: opts.canvas,
            ctx: opts.canvas.getContext('2d'),
            bg: document.createElement('canvas'),
            bctx: null,
            mode: opts.mode || 'intro',
            onDone: opts.onDone || opts.onHandoff || null,   // 旧调用方传 onHandoff，语义相同
            onHandoff: opts.onHandoff || null,
            onPhase: opts.onPhase || null,
            handoffAfter: typeof opts.handoffAfter === 'number' ? opts.handoffAfter : HANDOFF,
            start: performance.now(), t: 0, p: 0, raf: 0,
            closing: false, closeAt: 0, closeFrom: 0, doneAt: 0, doneFired: false,
            phaseBird: false
        };
        S.bg.width = VW; S.bg.height = VH;
        S.bctx = S.bg.getContext('2d');
        resize();
        S.raf = requestAnimationFrame(loop);
        return loadFullSet().then(function (ok) { return ok; });
    }

    function beginClose(now) {
        if (!S || S.closing) return;
        S.closing = true;
        S.closeAt = now;
        S.closeFrom = S.p;
    }

    function fireDone() {
        if (!S || S.doneFired) return;
        S.doneFired = true;
        if (S.onDone) { try { S.onDone(); } catch (e) { void e; } }
    }

    function loop(now) {
        if (!S) return;
        var real = Math.max(0, now - S.start) / 1000;
        S.t = real * TIME_SCALE;

        // 阶段回调：鸟开始飞入时才把章节字样浮出来
        if (!S.phaseBird && S.t >= BIRD_IN) {
            S.phaseBird = true;
            if (S.onPhase) { try { S.onPhase('bird'); } catch (e) { void e; } }
        }

        var camOffY = CAM_OFF_Y, p;
        if (S.closing) {
            var q = Math.min(1, (now - S.closeAt) / (0.5 / TIME_SCALE * 1000));
            camOffY = CAM_OFF_Y + (CAM_DROP_TO - CAM_OFF_Y) * bigBackIn(q);
            var k = Math.min(1, (now - S.closeAt) / 1200);
            p = S.closeFrom + (1 - S.closeFrom) * sineInOut(k);
            if (k >= 1) {
                if (!S.doneAt) S.doneAt = now + 200;
                if (now >= S.doneAt) fireDone();
            }
        } else {
            p = Math.min(1, S.t / WHITE_AT);
            if (S.mode === 'intro' && S.t >= S.handoffAfter) beginClose(now);
        }
        if (!S) return;                 // onDone 里可能已经 takeSeed()/close()
        S.p = p;
        draw(p, camOffY);
        S.raf = requestAnimationFrame(loop);
    }

    /* ---------- 渲染 ---------- */
    function draw(p, camOffY) {
        var ctx = S.ctx, dpr = S.dpr, Z = S.Z;
        var cv = S.canvas;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.width, cv.height);

        // 相机位移：Level.CameraOffset = cameraOffset + cameraWaveOffset
        // 屏幕坐标 = 世界坐标 - CameraOffset，所以背影片和 Madeline 一起抖；
        // 鸟与速度线在 IL 里写成「Camera.Position + 屏幕坐标」，会被相机反向抵消，因此不抖。
        var wv = waveAt(S.t);
        var shk = launchShake(S.t);
        var camX = wv.x + shk.x;
        var camY = camOffY + wv.y + shk.y;

        // BlackholeBG：先在 320×180 的 buffer 里画，再整块贴屏（FadeAlphaMultiplier = 1-p）
        if (PORTAL_TINT.length) {
            drawBG(S.bctx, S.t, camX, camY);
            ctx.globalAlpha = Math.max(0, 1 - p);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(S.bg, S.ox * dpr, S.oy * dpr, VW * Z * dpr, VH * Z * dpr);
            ctx.globalAlpha = 1;
        }

        ctx.setTransform(Z * dpr, 0, 0, Z * dpr, S.ox * dpr, S.oy * dpr);

        // Madeline：SummitLaunch 匀速上升（-240/s，无落地），Sprite.Play("launch") 翻滚 8 帧；
        // Origin (16,32)；PlayerSprite.Render 会对渲染坐标取整。
        var px = Math.round(160 - camX);
        var py = Math.round(90 - camY);
        drawRings(ctx, S.t, px, py);
        if (IM.launch.length) {
            var lf = IM.launch[launchFrameIndex(S.t)];
            if (lf) ctx.drawImage(lf, px - 16, py - 32, 32, 32);
        }

        // 鸟：birdScreenPosition 直接就是屏幕坐标，origin (16,24)
        var bp = birdPos(S.t);
        if (bp && IM.fly.length) {
            var fr = IM.fly[birdFrameIndex(S.t)];
            if (fr) ctx.drawImage(fr, bp.x - 16, bp.y - 24, 32, 24);
        }

        // Streaks（Depth 20，在角色之前）：Alpha = p
        if (IM.slice.length && p > 0) {
            // slice 是柔光条，线性放大才像原作的光带（角色/鸟仍保持像素点的硬边）
            ctx.imageSmoothingEnabled = true;
            drawStreaks(ctx, S.t, p);
            ctx.imageSmoothingEnabled = false;
        }

        // 白幕：Draw.Rect(camX-1, camY-1, 322, 322, White*p)；
        // 起飞瞬间再叠一层 Level.Flash(White*0.5) 的余辉（launchFlash）。
        var wa = Math.min(1, p + launchFlash(S.t));
        if (wa > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + wa.toFixed(3) + ')';
            ctx.fillRect(-1, -1, VW + 2, VH + 2);
        }
    }

    function drawStreaks(g, t, p) {
        var a = sineInOut(p);
        if (a <= 0.001) return;
        g.globalAlpha = a;
        for (var i = 0; i < STREAKS.length; i++) {
            var s = STREAKS[i];
            var pos = streakPos(s, t);
            var k = clampedMap(s.speed, 600, 2000, 1, 4);
            var w = 32 * clampedMap(s.speed, 600, 2000, 1, 0.25) * k;
            var h = 128 * clampedMap(s.speed, 600, 2000, 1, 2) * k;
            var tex = s.col === 0 ? IM.slice[s.idx] : (IM.pink[s.idx] || IM.slice[s.idx]);
            if (!tex) continue;
            g.drawImage(tex, pos.x - w / 2, pos.y - h / 2, w, h);
        }
        // 左右边缘条：Draw.Rect(cam.X-10, cam.Y-10, 26, 200) 与 cam.X+320-16
        g.fillStyle = '#fff';
        g.fillRect(-10, -10, 26, 200);
        g.fillRect(304, -10, 26, 200);
        g.globalAlpha = 1;
    }

    function drawBG(g, t, camX, camY) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, VW, VH);

        var spin = (2 + SM) * t;                 // spinTime += (2+SM)*dt
        var sh = shakeAt(t);
        var cx = 160 - camX, cy = 190 - camY;    // 背影也吃 CameraOffset，才不会「只有 Madeline 在跳」
        var i, lt, k, idx, sc, px, py;

        // 20 层 portal：position = center + offset*t + shake*(1-t)，rot = 2πt，scale 0.1→4
        for (i = 0; i < BG_STEPS; i++) {
            lt = (1 - frac(spin)) * 0.05 + i / BG_STEPS;
            k = sineOut(clamp01(lt));
            idx = Math.min(15, Math.max(0, Math.round(k * 15)));
            sc = clampedMap(lt, 0, 1, 0.1, 4);
            px = cx + sh.x * (1 - lt);
            py = cy - 50 * lt + sh.y * (1 - lt);
            g.save();
            g.translate(px, py);
            g.rotate(Math.PI * 2 * lt);
            g.scale(sc, sc);
            g.drawImage(PORTAL_TINT[idx], -120, -120);
            g.restore();
        }

        // streams：V12/V13/V15 组成的四边形
        for (i = 0; i < BG.streams.length; i++) {
            var st = BG.streams[i];
            var P = frac(st.p0 + st.speed * CUBE_TIME_K * DIRECTION * t);
            var v8 = cubeIn(clampedMap(P, 0, 0.8, 0, 1));
            var v9 = cubeIn(clampedMap(P, 0.2, 1, 0, 1));
            var ax = st.nx * 16 + st.nx * (1 - v8) * 200, ay = st.ny * 16 + st.ny * (1 - v8) * 200;
            var bx = st.nx * 16 + st.nx * (1 - v9) * 280, by = st.ny * 16 + st.ny * (1 - v9) * 280;
            var w1 = (1 - v8) * 8, w2 = (1 - v9) * 8;
            var ppx = -st.ny, ppy = st.nx;
            var jj = Math.min(19, Math.floor(v8 * 0.6 * 19));
            g.fillStyle = rgbCss(COLOR_BLACK[st.col][jj]);
            g.beginPath();
            g.moveTo(cx + ax - ppx * w1, cy + ay - ppy * w1);
            g.lineTo(cx + ax + ppx * w1, cy + ay + ppy * w1);
            g.lineTo(cx + bx + ppx * w2, cy + by + ppy * w2);
            g.lineTo(cx + bx - ppx * w2, cy + by - ppy * w2);
            g.closePath();
            g.fill();
        }

        // particles：center + Normal*ClampedMap(V8,1,0,8,220)（V8 越大越靠内）
        for (i = 0; i < BG.parts.length; i++) {
            var pa = BG.parts[i];
            var P2 = frac(pa.p0 + t * (SM * 0.25) * DIRECTION);
            var v = cubeIn(clamp01(P2));
            var rad = clampedMap(v, 1, 0, 8, 220);
            var size = 1 + (1 - v) * 1.5;
            var j2 = Math.min(19, Math.floor(v * 19));
            var c2 = COLOR_TRANSPARENT[pa.col][j2];
            g.fillStyle = rgbaCss(c2.rgb, c2.a);
            var qx = cx + pa.nx * rad, qy = cy + pa.ny * rad;
            g.fillRect(qx - size / 2, qy - size / 2, size, size);
        }
    }

    /* ---------- 对外 API（index-bird.js / demo 页共用） ---------- */
    function finish() {
        if (!S || S.closing) return;
        beginClose(performance.now());
    }

    function close() {
        if (S && S.raf) cancelAnimationFrame(S.raf);
        S = null;
    }

    function armed() { return !!S && S.t >= 1.0; }
    function reduced() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
        catch (e) { return false; }
    }

    var SEED_KEY = 'birdAscentSeed';
    function writeSeed(seed) {
        try { sessionStorage.setItem(SEED_KEY, JSON.stringify(seed)); } catch (e) { void e; }
    }
    function takeSeed() {
        if (!S) return null;
        var t = S.t;
        close();
        return { lt: t, ts: Date.now() };
    }
    function readSeed() {
        try {
            var raw = sessionStorage.getItem(SEED_KEY);
            if (!raw) return null;
            sessionStorage.removeItem(SEED_KEY);
            var s = JSON.parse(raw);
            if (!s || Date.now() - (s.ts || 0) > 20000) return null;
            return s;
        } catch (e) { return null; }
    }

    window.BirdAscent = {
        open: open,
        finish: finish,
        close: close,
        armed: armed,
        reduced: reduced,
        loadFullSet: loadFullSet,
        takeSeed: takeSeed,
        readSeed: readSeed,
        writeSeed: writeSeed,
        SEED_KEY: SEED_KEY,
        get state() { return S; },
        // 纯函数出口：数值断言脚本用（不参与浏览器渲染路径）
        _test: {
            birdPos: birdPos,
            birdFrameIndex: birdFrameIndex,
            waveAt: waveAt,
            streakPos: streakPos,
            streaks: STREAKS,
            bigBackIn: bigBackIn,
            whiteAt: function (t) { return Math.min(1, t / WHITE_AT); },
            camDrop: function (q) { return CAM_OFF_Y + (CAM_DROP_TO - CAM_OFF_Y) * bigBackIn(q); },
            birdEnd: BIRD_END,
            birdIn: BIRD_IN,
            handoff: HANDOFF
        }
    };
})();
