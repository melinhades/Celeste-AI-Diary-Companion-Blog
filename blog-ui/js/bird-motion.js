/* ===== js/bird-motion.js — 小鸟运动引擎（从 blog-ui/celeste-bird.html 的反编译复刻层抽出） =====
   存在理由：celeste-bird.html 把 FlingBird / BirdNPC / BirdPath 的运动机器（二次贝塞尔飞行、
   甩出惯性物理、帧驱动协程、拖尾、振翅音效检测、FMOD 变体音效池）逐条 IL 复刻在了页面脚本里；
   圆桌会议的主持鸟（js/roundtable-bird.js）要用同一套「手感」，而不是自己再发明一遍直线趋近。
   本模块只含机器、不含画法：渲染（DOM <img> 还是 canvas）由宿主决定，宿主每帧把
   引擎步长喂进来（host.dt），引擎内部不拥有 rAF。

   对齐的源码口径（celeste-bird.html 行号）：
     · SimpleCurve / 向量与 Calc 原语        L440-495
     · 帧驱动协程 Runner                      L497-541
     · TimeRate / Freeze / Shake              L622-664
     · TrailManager 近似（32px 投放、1.2s 消散）L1385-1389 / L4298-4300
     · 音效层（变体表 / 池 / 淡出 / SoundSource）L1416-1560
     · BirdNPC.FlapSfxCheck                   L1889-1900
     · FlingBird（spriteOffset 盯人偏移 / 飞行旋转压扁 / 甩出时间线）L2372-2582
   坐标口径：1 单位 = 1 个素材像素（32×24 的原生尺度）。3× 显示换算、transform 拼装都是宿主的事。
   暴露 window.BirdMotion = { create(cfg), Trail, Sfx, TAU } */
(function () {
    'use strict';
    var TAU = Math.PI * 2;

    // ===== Calc / Vector2 原语（与 celeste-bird.html L440-475 等价） =====
    function v2(x, y) { return { x: x, y: y }; }
    function vadd(a, b) { return v2(a.x + b.x, a.y + b.y); }
    function vsub(a, b) { return v2(a.x - b.x, a.y - b.y); }
    function vmul(a, k) { return v2(a.x * k, a.y * k); }
    function vlen(a) { return Math.hypot(a.x, a.y); }
    function clampF(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    function lerpF(a, b, t) { return a + (b - a) * t; }
    function safeNorm(x, y, len) {
        len = len === undefined ? 1 : len;
        var l = Math.hypot(x, y);
        return l > 0.0001 ? v2(x / l * len, y / l * len) : v2(0, 0);
    }
    function angleDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
    function angleLerp(a, b, p) { return a + angleDiff(a, b) * p; }
    function approach(a, t, m) { return a < t ? Math.min(a + m, t) : Math.max(a - m, t); }
    function approachV(cur, target, maxDist) {
        var d = vsub(target, cur), len = vlen(d);
        if (len <= maxDist || len < 1e-5) return v2(target.x, target.y);
        return vadd(cur, vmul(d, maxDist / len));
    }
    function clampedMap(v, a, b, c, d) { return lerpF(c, d, clampF((v - a) / (b - a), 0, 1)); }
    function angleV(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
    function easeCubeOut(t) { t -= 1; return t * t * t + 1; }

    // ===== Monocle.SimpleCurve(Begin, End, Control)：二次贝塞尔 =====
    function SimpleCurve(begin, end, control) { this.p0 = begin; this.p1 = end; this.c = control; }
    SimpleCurve.prototype.getPoint = function (t) {
        var u = 1 - t;
        return v2(u * u * this.p0.x + 2 * u * t * this.c.x + t * t * this.p1.x,
                  u * u * this.p0.y + 2 * u * t * this.c.y + t * t * this.p1.y);
    };
    SimpleCurve.prototype.getLengthParametric = function (res) {
        res = res || 32;
        var prev = this.getPoint(0), len = 0;
        for (var i = 1; i <= res; i++) {
            var p = this.getPoint(i / res);
            len += vlen(vsub(p, prev)); prev = p;
        }
        return len;
    };

    /* ================= 音效层（FMOD 事件 → celeste-sounds/Birds/ 变体 wav） =================
       与 celeste-bird.html L1416-1560 同源。★ 有意偏差（开发阶段定的口径，全部在表现层）：
         · 变体等概率随机（权重在 bank 里，程序集没有）；
         · 3D 衰减用「离注视中心 520px 线性到 0.12」近似，注视中心由 hostGain 回调给；
         · 浏览器无手势不许自动播放 ⇒ 首次 pointerdown / keydown 把被拦下的源重放一次。 */
    var SFX_BASE = 'celeste-sounds/Birds/';
    var SFX_TABLE = {
        'bird_tweet_loop': ['baby_idletweet_01', 'baby_idletweet_02', 'baby_idletweet_03'],
        'bird_hop':        ['baby_hop_01', 'baby_hop_02', 'baby_hop_03',
                            'baby_hop_04', 'baby_hop_05', 'baby_hop_06'],
        'bird_peck':       ['peck_a_01', 'peck_a_02', 'peck_a_03', 'peck_a_04',
                            'peck_b_01', 'peck_b_02', 'peck_b_03', 'peck_b_04'],
        'bird_squawk':     ['squawk', 'squawk_st'],
        'bird_startle':    ['startle_01', 'startle_02', 'startle_st'],
        'bird_wingflap':   ['wingflap_01', 'wingflap_02', 'wingflap_03',
                            'wingflap_04', 'wingflap_05', 'wingflap_06'],
        'bird_relocate':   ['relocate_2d_01', 'relocate_2d_02', 'relocate_2d_03',
                            'relocate_2d_04', 'relocate_2d_05',
                            'relocate_3d_01', 'relocate_3d_02', 'relocate_3d_03',
                            'relocate_3d_04', 'relocate_3d_05'],
        'bird_throw':      ['grabandthrow_2d_01', 'grabandthrow_2d_02', 'grabandthrow_2d_03',
                            'grabandthrow_2d_04', 'grabandthrow_2d_05', 'grabandthrow_2d_06',
                            'grabandthrow_3d_01', 'grabandthrow_3d_02', 'grabandthrow_3d_03'],
        'bird_flyaway':    ['baby_flyaway_01', 'baby_flyaway_02', 'baby_flyaway_03',
                            'baby_flyaway_04', 'baby_flyaway_05'],
        'bird_land':       ['land_dirt']
    };
    var LOOP_SET = { 'bird_tweet_loop': true };
    var LOOP_GAIN = 0.5;                 // ★ 循环源统一压低，避免糊成一片（同 celeste-bird.html）
    var POOL_MAX = 3;
    var audioPools = new Map();          // 变体路径 → <audio> 池（同时响的多声互不打断）
    var pendingAudio = new Set();        // 被浏览器拦下的自动播放，等第一次手势重试
    var liveLoops = [];
    var audioUnbound = false;
    var sfxEnabled = true;
    var hostGain = null;                 // () => number，宿主提供的距离衰减；null = 恒定 1

    function unlockAudio() {
        pendingAudio.forEach(function (el) {
            pendingAudio.delete(el);
            tryPlay(el);
        });
    }
    function bindGesture() {
        if (audioUnbound || typeof document === 'undefined') return;
        audioUnbound = true;
        document.addEventListener('pointerdown', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
    }
    function tryPlay(el) {
        var r = el.play();
        if (r && typeof r.catch === 'function') r.catch(function () { pendingAudio.add(el); });
        else pendingAudio.delete(el);
    }
    function gainNow() { return hostGain ? clampF(hostGain(), 0, 1) : 1; }
    function oneShot(path, gain) {
        var pool = audioPools.get(path);
        if (!pool) { pool = []; audioPools.set(path, pool); }
        var el = null;
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].paused || pool[i].ended) { el = pool[i]; break; }
        }
        if (!el) {
            if (pool.length < POOL_MAX) { el = new Audio(path); pool.push(el); }
            else {
                pool.round = ((pool.round | 0) + 1) % pool.length;
                el = pool[pool.round];
            }
        }
        try { el.currentTime = 0; } catch (e) { void e; }
        el.loop = false; el.volume = gain;
        tryPlay(el);
        return el;
    }
    function stopAudioEl(el, allowFadeOut) {    // SoundSource.Stop(allowFadeOut)
        if (!allowFadeOut || typeof requestAnimationFrame !== 'function') { el.pause(); return; }
        var v0 = el.volume, t0 = performance.now();
        var step = function () {
            var k = Math.min(1, (performance.now() - t0) / 120);
            el.volume = v0 * (1 - k);
            if (k < 1) requestAnimationFrame(step);
            else { el.pause(); el.volume = v0; }
        };
        requestAnimationFrame(step);
    }
    var Sfx = {
        setEnabled: function (on) {
            sfxEnabled = !!on;
            if (!on) Sfx.stopAll();
        },
        isEnabled: function () { return sfxEnabled; },
        setGainSource: function (fn) { hostGain = fn; },
        /* 一次性事件音：name = SFX_TABLE 键；opts = { gain } 可覆盖距离衰减 */
        play: function (name, opts) {
            if (!sfxEnabled || typeof Audio !== 'function') return;
            bindGesture();
            var list = SFX_TABLE[name];
            if (!list || !list.length) return;
            var path = SFX_BASE + list[Math.floor(Math.random() * list.length)] + '.wav';
            oneShot(path, (opts && opts.gain !== undefined) ? opts.gain : gainNow());
        },
        /* 循环事件音：返回句柄 { stop }，对应 Monocle.SoundSource 的持有语义；
           非循环事件退化为一次性播放 */
        loop: function (name) {
            var noop = { stop: function () {} };
            if (!sfxEnabled || typeof Audio !== 'function') return noop;
            bindGesture();
            var list = SFX_TABLE[name];
            if (!list || !list.length) return noop;
            if (!LOOP_SET[name]) { Sfx.play(name); return noop; }
            var path = SFX_BASE + list[Math.floor(Math.random() * list.length)] + '.wav';
            var el = new Audio(path);
            el.loop = true; el.volume = gainNow() * LOOP_GAIN;
            tryPlay(el);
            var src = { el: el };
            liveLoops.push(src);
            return {
                stop: function (fade) {
                    if (src.el) { stopAudioEl(src.el, fade !== false); src.el = null; }
                    var i = liveLoops.indexOf(src);
                    if (i >= 0) liveLoops.splice(i, 1);
                }
            };
        },
        /* 每帧刷新循环源音量（近似 3D 衰减跟着注视点走） */
        update: function () {
            var g = gainNow() * LOOP_GAIN;
            for (var i = 0; i < liveLoops.length; i++) {
                if (liveLoops[i].el) liveLoops[i].el.volume = g;
            }
        },
        stopAll: function () {
            while (liveLoops.length) {
                var s = liveLoops.pop();
                if (s.el) { s.el.pause(); s.el = null; }
            }
            pendingAudio.forEach(function (el) { try { el.pause(); } catch (e) { void e; } });
            pendingAudio.clear();
        }
    };

    /* ================= Trail：TrailManager.Add(#639bff) 的点阵近似 =================
       与 celeste-bird.html 同口径：距上一点 > 32（本引擎的 1x 单位）投放一个点，
       寿命 1.2 秒，alpha = 0.45 × (1 - age/1.2)，半径 = 3 × (1 - age/1.2)。
       ★ 单位口径：这里存 1x 单位，宿主绘制时自行换算成显示像素。 */
    var Trail = {
        points: [],
        add: function (x, y, nowSec) {
            Trail.points.push({ x: x, y: y, born: nowSec });
            if (Trail.points.length > 160) Trail.points.splice(0, Trail.points.length - 160);
        },
        /* 沿路径走点：movedDist 为距上一个投放点的位移；返回累计位移由宿主自己保管更简单，
           这里做成无状态工具，宿主在 onMove 回调里判定。 */
        expire: function (nowSec, life) {
            life = life === undefined ? 1.2 : life;
            var keep = [];
            for (var i = 0; i < Trail.points.length; i++) {
                if (nowSec - Trail.points[i].born < life) keep.push(Trail.points[i]);
            }
            Trail.points = keep;
        },
        clear: function () { Trail.points.length = 0; }
    };

    /* ================= BirdActor：一只鸟的运动本体 =================
       cfg = {
         dt(): 引擎步长（秒，已含 timeRate 与 freeze 语义由宿主处理，freeze 期间宿主不调 update）,
         clock(): 引擎时钟（秒，Trail 投放与协程唤醒都读它）,
         frameMs: 动画帧表（毫秒）, frames: 动画帧数表,
         onSetAnim(name), onFrame(name, idx),        // 宿主换帧（切 img.src / 记状态）
         onFlapCheck(view): {inView:boolean},        // 视口裁剪（FlapSfxCheck 的宿主侧）
         gazeRange: [16, 64] 可选                    // Wait 态盯人偏移的 map 区间
       } */
    function BirdActor(cfg) {
        var self = this;
        this.cfg = cfg;
        this.pos = v2(0, 0);
        this.vel = v2(0, 0);
        this.rot = 0;                                  // 弧度，曲线切线
        this.scale = v2(1, 1);                         // 挤压（1.25/0.7 那套）
        this.spriteOffset = v2(0, 0);                  // Wait 态盯人偏移（Monocle.Sprite.Position）
        this.spriteOffsetTarget = v2(0, 0);
        this.anim = 'hover';
        this.frame = 0;
        this.animAcc = 0;
        this.facing = 1;                               // 1=左（素材原朝向），-1=右（scaleX(-1)）
        this.faceLocked = false;                       // 曲线飞行期间不翻脸（原版 moveOnCurve 恒 scale.x=1）
        this.flight = null;                            // { curve, duration, speed, onArrive }
        this.physics = null;                           // { speed, target, accel }
        this.flapGate = { hover: true, stressed: true, fly: true };  // 哪些动画首帧报振翅
        this.gazeActive = false;
        this.lastTrail = v2(0, 0);
        this.trailDist = 32;                           // 1x 单位
        this.runners = [];
        this.dead = false;
        Object.defineProperty(this, 'position', {
            get: function () { return self.pos; },
            set: function (v) { self.pos = v; }
        });
    }
    /* 帧推进（对应 Sprite.Update：goto 循环由宿主帧表只有 loop 语义，够用了） */
    BirdActor.prototype.setAnim = function (name) {
        if (this.anim === name) return;
        this.anim = name; this.frame = 0; this.animAcc = 0;
        if (this.cfg.onSetAnim) this.cfg.onSetAnim(name);
    };
    BirdActor.prototype.advanceAnim = function (dt) {
        var ms = this.cfg.frameMs[this.anim];
        if (!ms) return;
        var n = this.cfg.frames[this.anim];
        var prev = this.frame;
        var acc = this.animAcc + dt * 1000;
        while (acc >= ms) { acc -= ms; this.frame = (this.frame + 1) % n; }
        this.animAcc = acc;
        if (this.frame !== prev || prev === 0) {
            if (this.cfg.onFrame) this.cfg.onFrame(this.anim, this.frame);
            // BirdNPC.FlapSfxCheck：hover / hoverStressed / fly 的第 0 帧报振翅（先过视口裁剪）
            if (this.frame === 0 && this.flapGate[this.anim]) {
                var inView = true;
                if (this.cfg.onFlapCheck) inView = this.cfg.onFlapCheck(this.pos);
                if (inView) Sfx.play('bird_wingflap');
            }
        }
    };
    /* 曲线飞行：SimpleCurve 逐 t 取值，时长 = 弧长 / 速度（moveOnCurve 口径） */
    BirdActor.prototype.flyCurve = function (to, lift, speed, onArrive) {
        var from = v2(this.pos.x, this.pos.y);
        var mid = vmul(vadd(from, to), 0.5);
        // 控制点 = 中点沿垂线抬 lift（水平移动时垂线就是竖直方向，与原版 -30/-12 的用法同形）
        var d = vsub(to, from), len = vlen(d);
        var perp = len > 0.001 ? v2(-d.y / len, d.x / len) : v2(0, -1);
        if (perp.y > 0) perp = vmul(perp, -1);         // 永远朝「上」抬
        var control = vadd(mid, vmul(perp, Math.min(lift, 24 + len * 0.18)));
        var curve = new SimpleCurve(from, to, control);
        this.flight = {
            curve: curve,
            duration: Math.max(0.001, curve.getLengthParametric(32) / speed),
            t: 0,
            was: v2(from.x, from.y),
            onArrive: onArrive || null
        };
        this.faceLocked = true;
        return this.flight.duration;
    };
    BirdActor.prototype.stopFlight = function () { this.flight = null; };
    /* 甩出惯性物理：speed 以 accel 逼近 target（FlingBird::Update 的 FB.Fling 分支） */
    BirdActor.prototype.startPhysics = function (speed, target, accel) {
        this.flight = null;
        this.vel = v2(speed.x, speed.y);
        this.physics = { target: v2(target.x, target.y), accel: accel };
    };
    BirdActor.prototype.killPhysics = function () { this.physics = null; this.vel = v2(0, 0); };
    /* Wait 态盯人偏移：朝向目标点把 sprite 位置最多让出 amount px（1x），approach 32/s */
    BirdActor.prototype.setGaze = function (targetPoint) {
        this.gazeActive = true;
        this.gazePoint = targetPoint;
    };
    BirdActor.prototype.clearGaze = function () {
        this.gazeActive = false;
        this.spriteOffsetTarget = v2(0, 0);
    };
    /* 协程：yield null = 下一帧；yield <秒> = 等到 clock + 秒；
       兼容传入生成器函数（自动调用）或已实例化的生成器对象 */
    BirdActor.prototype.coroutine = function (gen) {
        var g = typeof gen === 'function' ? gen() : gen;
        var r = { gen: g, until: 0, alive: true };
        this.runners.push(r);
        return r;
    };
    BirdActor.prototype.killCoroutines = function () {
        for (var i = 0; i < this.runners.length; i++) this.runners[i].alive = false;
        this.runners.length = 0;
    };
    BirdActor.prototype.update = function (dt) {
        var clock = this.cfg.clock();
        var i;
        for (i = this.runners.length - 1; i >= 0; i--) {
            var r = this.runners[i];
            if (!r.alive || clock < r.until) { if (!r.alive) this.runners.splice(i, 1); continue; }
            var it = r.gen.next();
            if (it.done) { this.runners.splice(i, 1); continue; }
            r.until = clock + (typeof it.value === 'number' ? it.value : 0);
        }
        this.advanceAnim(dt);
        if (this.flight) {
            var f = this.flight;
            f.t += dt / f.duration;
            var p = f.curve.getPoint(Math.min(1, f.t));
            // ★ 有意偏差：原版 Calc.Floor 逐帧取整防飘；DOM 宿主由拼装时 round，这里保留浮点
            this.pos = p;
            var tang = angleV(f.curve.getPoint(Math.max(0, f.t - 0.05)),
                              f.curve.getPoint(Math.min(1, f.t + 0.05)));
            this.rot = angleLerp(this.rot, tang, 0.5);  // 原版口径：朝切线转一半
            this.scale = v2(1.25, 0.7);                // moveOnCurve：飞行时压扁
            if (vlen(vsub(p, f.was)) > this.trailDist) {
                Trail.add(p.x, p.y, clock);            // TrailManager.Add(this, #639bff, 1)
                f.was = v2(p.x, p.y);
            }
            if (f.t >= 1) {
                this.pos = v2(f.curve.p1.x, f.curve.p1.y);
                this.flight = null;
                if (f.onArrive) f.onArrive();
            }
        } else if (this.physics) {
            var ph = this.physics;
            if (ph.accel > 0) this.vel = approachV(this.vel, ph.target, ph.accel * dt);
            this.pos = vadd(this.pos, vmul(this.vel, dt));
            this.vel = this.vel;                       // 保留给宿主读
        } else {
            this.rot = angleLerp(this.rot, 0, 1 - Math.pow(0.0001, dt));   // 收翅回正（指数平滑）
            this.scale = v2(approach(this.scale.x, 1, 4 * dt), approach(this.scale.y, 1, 4 * dt));
        }
        // 无飞行时按速度翻脸（place 口径：向左飞=素材原朝向）
        if (!this.flight && !this.faceLocked) {
            if (this.physics && this.vel.x > 8) this.facing = -1;
            else if (this.physics && this.vel.x < -8) this.facing = 1;
        }
        // 盯人偏移：approachV(spriteOffset, target, 32·dt)，范围由 gazeRange 决定
        if (this.gazeActive && this.gazePoint) {
            var rg = this.cfg.gazeRange || [16, 64];
            var dist = vlen(vsub(this.gazePoint, this.pos));
            var amount = clampedMap(dist, rg[0], rg[1], rg[0] / 4, 0);   // 原版 12 → 0
            var dir = safeNorm(this.gazePoint.x - this.pos.x, this.gazePoint.y - this.pos.y);
            this.spriteOffsetTarget = vmul(dir, amount);
        }
        this.spriteOffset = approachV(this.spriteOffset, this.spriteOffsetTarget, 32 * dt);
    };
    /* 视觉中心 = 逻辑中心 + 盯人偏移（宿主拼装 transform 用） */
    BirdActor.prototype.renderPos = function () {
        return vadd(this.pos, this.spriteOffset);
    };

    /* ================= 引擎外壳 ================= */
    function create(cfg) {
        return {
            actor: new BirdActor(cfg),
            sfx: Sfx,
            trail: Trail,
            util: {
                v2: v2, vadd: vadd, vsub: vsub, vmul: vmul, vlen: vlen,
                clampF: clampF, lerpF: lerpF, safeNorm: safeNorm,
                angleDiff: angleDiff, angleLerp: angleLerp, approach: approach,
                approachV: approachV, clampedMap: clampedMap, angleV: angleV,
                easeCubeOut: easeCubeOut, SimpleCurve: SimpleCurve, TAU: TAU
            }
        };
    }

    window.BirdMotion = { create: create, Trail: Trail, Sfx: Sfx, TAU: TAU };
})();
