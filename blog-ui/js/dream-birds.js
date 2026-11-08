/* ===== js/dream-birds.js — dream 场景（shelf.html）雪脊上的鸟 =====
   来源：blog-ui/celeste-bird.html 的两类鸟 + 一张贴图表，按同一套口径搬到
   `.ds-left` 的雪脊上（雪线在画面全高 75.2% 处，与 #dsMadeline bottom:24.8% /
   #dsFire bottom:25% 对齐），作为梦境的"活物"层：
     · BirdNPC（characters/bird/，32×24，justify 0.5,1）—— 只保留 1 只普通大蓝鸟。
       站立时跑的是 Sprites.xml 的 `<Anim id="idle" goto="idle,peck">`：
       每 1s 用 1:1 权重在「继续站着」和「啄一下地」之间选，啄到第 6 帧播 bird_peck。
       这就是"站着站着突然啄地"的真正来源，不是 if 出来的。
       金色羽毛鸟及其首次引导（#dsBirdTip / Store.DREAM_BIRD_TIP）已整体移除。
     · FlutterBird（scenery/flutterbird/，10×10）—— 5 只。原版 idleRoutine：
       每 0.25~1.25s 一跳（0.25s 抬 14px、落地压扁 ±1.4/0.6）；指针靠近 48 世界像素
       （页面按 0.55× 放宽到 ~80px）触发 FlyAwayRoutine：先 bird_startle，再沿
       (dir·24, -96) 初速 + (dir·192, -384) 恒定加速飞走，2.5s 后原位重生。
       颜色在构造时从 4 个固定色随机取一个（multiply 染色），整局不变。
     · 巡航鸟（BirdPath / hover 口径）—— 已移除，不再生成。
   运动原语 / 音效池复用 js/bird-motion.js（未加载时静默降级）。 */
(function () {
    'use strict';

    var scene = document.getElementById('dreamScene');
    if (!scene) return;
    var left = scene.querySelector('.ds-left');
    var cv = document.getElementById('dsBirds');
    if (!left || !cv) return;

    var ENGINE = window.BirdMotion || null;
    var U = (ENGINE && ENGINE.util) || null;
    var SFX = (ENGINE && ENGINE.Sfx) || null;

    function v2(x, y) { return { x: x, y: y }; }
    var angleLerp = U ? U.angleLerp : function (a, b, p) { return a + (b - a) * p; };
    var approach = U ? U.approach : function (a, t, m) { return a < t ? Math.min(a + m, t) : Math.max(a - m, t); };
    function SimpleCurve(b, e, c) { this.p0 = b; this.p1 = e; this.c = c; }
    if (U && U.SimpleCurve) SimpleCurve = U.SimpleCurve;
    SimpleCurve.prototype.getPoint = function (t) {
        var u = 1 - t;
        return v2(u * u * this.p0.x + 2 * u * t * this.c.x + t * t * this.p1.x,
                  u * u * this.p0.y + 2 * u * t * this.c.y + t * t * this.p1.y);
    };

    function sfx(name) { if (SFX) SFX.play(name); }

    /* ================= 贴图表（Content/Graphics/Sprites.xml 逐条） ================= */
    var ATLAS = 'Atlases/Gameplay/';
    var BD = ATLAS + 'characters/bird/';
    var FB = ATLAS + 'scenery/flutterbird/';
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function seq(prefix, a, b) { var r = []; for (var i = a; i <= b; i++) r.push(prefix + pad2(i)); return r; }
    var CROW = seq(BD + 'crow', 0, 48);
    var FLYUP = [BD + 'flyup00'].concat(seq(BD + 'FlyUp', 1, 15));
    var HOVER = [BD + 'hover00', BD + 'hover01'].concat(seq(BD + 'Hover', 2, 5));

    var BANKS = {
        bird: {
            w: 32, h: 24, justify: [0.5, 1],
            anims: {
                idle:          { names: [CROW[0]], delay: 1000, goto: 'idle,peck' },
                idleRarePeck:  { names: [CROW[0]], delay: 1000,
                                 goto: 'idleRarePeck,idleRarePeck,idleRarePeck,idleRarePeck,peckRare' },
                croak:         { names: CROW.slice(0, 14),  delay: 80, goto: 'idle' },
                peck:          { names: CROW.slice(14, 27), delay: 80, goto: 'idle' },
                peckRare:      { names: CROW.slice(14, 27), delay: 80, goto: 'idleRarePeck' },
                jump:          { names: CROW.slice(29, 36), delay: 80, goto: 'fly' },
                fly:           { names: [BD + 'fly03', BD + 'fly00', BD + 'fly01', BD + 'fly02'], delay: 100, goto: 'fly' },
                fall:          { names: CROW.slice(42, 45), delay: 70, goto: 'fall' },
                sleep:         { names: CROW.slice(45, 49), delay: 150, goto: null },
                hover:         { names: HOVER,              delay: 100, goto: 'hover' },
                flyup:         { names: FLYUP,              delay: 100, goto: 'flyup' },
                flyupRoll:     { names: FLYUP,              delay: 100, goto: 'flyupIdle' },
                flyupIdle:     { names: FLYUP.slice(10),    delay: 100, goto: 'flyupIdle' },
                throw:         { names: seq(BD + 'Throw', 0, 6), delay: 80, goto: 'hover' }
            }
        },
        flutterbird: {
            w: 10, h: 10, justify: [0.5, 1],
            // 原版素材真的只有 10×10（它是 scenery），3× 下 30px 像雪地里的小亮点；
            // k 是纯显示放大，不影响站位与惊飞判定（那两条按世界像素算）。
            k: 1.3,
            // FlutterBird 的 4 个固定色（celeste-bird.html L801 BIRD_COLORS）
            colors: ['#89fbff', '#f0fc6c', '#f493ff', '#93baff'],
            anims: {
                idle: { names: [FB + 'idle00'], delay: 1000, goto: null },
                fly:  { names: [FB + 'flap00', FB + 'flap01'], delay: 100, goto: 'fly' }
            }
        }
    };

    /* Monocle.Chooser<string>：'a,b:3' 按权重随机（FromString 的编译结果） */
    function Chooser(str) {
        this.items = []; this.total = 0;
        var parts = String(str).split(',');
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i], obj = part, w = 1, cut = part.lastIndexOf(':');
            if (cut > 0) {
                var p = Number(part.slice(cut + 1));
                if (!isNaN(p)) { obj = part.slice(0, cut); w = p; }
            }
            this.items.push({ obj: obj, weight: w });
            this.total += w;
        }
    }
    Chooser.prototype.choose = function () {
        if (!this.items.length) return null;
        if (this.items.length === 1) return this.items[0].obj;
        var target = Math.random() * this.total;
        for (var i = 0; i < this.items.length; i++) {
            target -= this.items[i].weight;
            if (target < 0) return this.items[i].obj;
        }
        return this.items[this.items.length - 1].obj;
    };

    var IMG = {};
    (function compileBanks() {
        var banks = [BANKS.bird, BANKS.flutterbird];
        for (var b = 0; b < banks.length; b++) {
            var anims = banks[b].anims;
            for (var id in anims) {
                if (!Object.prototype.hasOwnProperty.call(anims, id)) continue;
                var a = anims[id];
                a.chooser = a.goto ? new Chooser(a.goto) : null;
                for (var n = 0; n < a.names.length; n++) {
                    var name = a.names[n];
                    if (IMG[name]) continue;
                    var im = new Image();
                    im.src = name + '.png';      // 帧表里的名字已含 Atlases/Gameplay/ 前缀
                    IMG[name] = im;
                }
            }
        }
    })();

    /* ================= Sprite：delay + goto（Monocle.Sprite 的最小子集） ================= */
    function Sprite(bank, anim) {
        this.bank = bank; this.anim = anim;
        this.frame = 0; this.acc = 0; this.rate = 1;
        this.onFrame = null;
    }
    Sprite.prototype.set = function (anim, restart) {
        if (this.anim === anim && !restart) return;
        this.anim = anim; this.frame = 0; this.acc = 0;
    };
    Sprite.prototype.update = function (dt) {
        var bank = BANKS[this.bank];
        var a = bank.anims[this.anim];
        if (!a) return;
        this.acc += dt * 1000 * (this.rate || 1);
        var guard = 0;
        while (this.acc >= a.delay && guard++ < 64) {
            this.acc -= a.delay;
            this.frame++;
            if (this.frame >= a.names.length) {
                this.frame = 0;
                if (a.chooser) {
                    var next = a.chooser.choose();
                    if (next && bank.anims[next]) {
                        this.anim = next; this.acc = 0;
                        a = bank.anims[next];
                    }
                }
            }
            if (this.onFrame) this.onFrame(this.anim, this.frame);
        }
    };

    /* ================= 世界尺度 ================= */
    var S = 3;                       // 1 素材像素 = 3 CSS 像素（与金羽毛层 32→96 同口径）
    // 雪脊顶面：scene.png 是 2540×1429 的 16:9 图，按 center bottom / cover 铺，
    // 雪线距图底 24.8%（#dsMadeline 的 bottom:24.8% 就是照这个定的）。
    // cover 在窄屏按高铺（雪线正好 24.8% 屏高），超宽屏改按宽铺、底部对齐后雪线会被顶高，
    // 所以按实际铺图高度算，不写死比例。
    var SCENE_AR = 2540 / 1429, SNOW_FROM_BOTTOM = 0.248;
    var CW = 1, CH = 1, DPR = 1, ctx = cv.getContext('2d');
    var snowY = 1;

    var clock = 0, lastT = 0, raf = 0, active = false;

    function resize() {
        var r = left.getBoundingClientRect();
        CW = Math.max(1, Math.round(r.width));
        CH = Math.max(1, Math.round(r.height));
        DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        cv.width = Math.round(CW * DPR);
        cv.height = Math.round(CH * DPR);
        cv.style.width = CW + 'px';
        cv.style.height = CH + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.imageSmoothingEnabled = false;
        snowY = Math.round(CH - SNOW_FROM_BOTTOM * Math.max(CW / SCENE_AR, CH));
        S = CW < 760 ? 2 : 3;        // 窄屏整体缩一号：雪桥那段放不下 3× 的一排鸟
    }

    /* ================= 绘制 ================= */
    // XNA 的 sprite.Color 是「纹理 × 颜色」：小鸟用一面 multiply 染色缓存（同 celeste-bird.html
    // 的 tinted()），每张帧只在首次使用时合成一次，运行时零额外开销。
    var TINT = {};
    function tintOf(im, color) {
        var key = im.src + '|' + color;
        if (TINT[key]) return TINT[key];
        var off = document.createElement('canvas');
        off.width = im.naturalWidth; off.height = im.naturalHeight;
        var g = off.getContext('2d');
        g.imageSmoothingEnabled = false;
        g.drawImage(im, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = color;
        g.fillRect(0, 0, off.width, off.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(im, 0, 0);
        TINT[key] = off;
        return off;
    }

    var lastPeckSfx = -9, lastHopSfx = -9;
    function drawSprite(sp, x, y, facing, sx, sy, rot, tint) {
        var bank = BANKS[sp.bank];
        var a = bank.anims[sp.anim];
        if (!a) return;
        var im = IMG[a.names[Math.min(sp.frame, a.names.length - 1)]];
        if (!im || !im.complete || !im.naturalWidth) return;
        if (tint) im = tintOf(im, tint);
        var k = bank.k || 1;
        var w = bank.w * S * k, h = bank.h * S * k;
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        if (rot) ctx.rotate(rot);
        ctx.scale(facing * (sx === undefined ? 1 : sx), sy === undefined ? 1 : sy);
        ctx.drawImage(im, -w / 2, -h, w, h);
        ctx.restore();
    }

    /* ================= 极光色像素星点 ================= */
    // 原来由 shelf.js 生成 30 个 <i>，每个挂一条 infinite opacity 动画：每个元素每帧都要在主线程
    // tick 一次，还会让整份文档每帧重算样式（实测 30 个合计约 0.45ms/帧）。改成画进这块画布——
    // 同层（星空先于鸟绘制，天然在鸟之下）、零 DOM、零 CSS 动画。
    var ASTAR_COLS = ['#6fd8ff', '#7dffc8'];            // 蓝 / 绿，与原来的 50/50 随机一致
    var astars = [];
    (function buildAstars() {
        for (var i = 0; i < 30; i++) {
            var sky = Math.random() < 0.62;              // 62% 天空、38% 桥底下
            astars.push({
                x: (2 + Math.random() * 96) / 100,
                y: (sky ? 6 + Math.random() * 28 : 55 + Math.random() * 17) / 100,
                col: ASTAR_COLS[Math.random() < 0.5 ? 0 : 1],
                dur: 0.9 + Math.random() * 1.1,
                del: Math.random() * 3.5
            });
        }
    })();
    function drawAstars() {
        for (var i = 0; i < astars.length; i++) {
            var s = astars[i];
            // 对应原 keyframes dsAuroraTw：0/100% 全暗、50% 最亮（ease-in-out 近似 sin 半周期）
            var a = Math.sin(((clock + s.del) % s.dur) / s.dur * Math.PI) * 0.95;
            if (a < 0.02) continue;
            ctx.globalAlpha = a;
            ctx.fillStyle = s.col;
            ctx.fillRect(Math.round(s.x * CW) - 1, Math.round(s.y * CH) - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
    }

    /* ================= 站位：雪脊左段（Madeline 左侧的雪坡） ================= */
    // 左界给雪墙/屏幕边留 5%；右界按 #dsMadeline 的实测左缘再回收 4%——
    // 所有鸟都落在 Madeline 左边，不写死某个屏幕宽度的 x 值。
    var SLOT_LO = 0.05, SLOT_HI = 0.34;
    function refreshSlots() {
        var lr = left.getBoundingClientRect(), W = lr.width || 1;
        var mad = document.getElementById('dsMadeline');
        var mr = mad ? mad.getBoundingClientRect() : null;
        var madL = (mr && mr.width > 1) ? (mr.left - lr.left) / W : 0.39;
        SLOT_HI = Math.max(0.16, Math.min(0.34, madL - 0.04));
        SLOT_LO = Math.max(0.03, Math.min(0.05, SLOT_HI - 0.10));
    }
    function slotX(slot) { return (SLOT_LO + (SLOT_HI - SLOT_LO) * slot) * CW; }

    /* ================= 大鸟（BirdNPC） ================= */
    function BigBird(slot, dy) {
        this.slot = slot;
        this.dy = dy || 0;                 // 相对雪线的像素偏移（负=站在雪脊更深处）
        this.x = 0; this.y = 0;
        this.facing = -1;                 // Facing.LEFT（素材 Scale.X = -1 即朝左）
        this.sprite = new Sprite('bird', 'idle');
        this.sx = 1; this.sy = 1; this.rot = 0;
        this.tint = null;
        this.sprite.onFrame = function (anim, frame) {
            if ((anim === 'peck' || anim === 'peckRare') && frame === 6) {
                // 原版每只鸟的 OnFrameChange 都播 bird_peck；连续啄地时全局 1.6s 节流一下，
                // 避免同一帧叠出两层音（纯音量层面的偏差）
                if (clock - lastPeckSfx > 1.6) { lastPeckSfx = clock; sfx('bird_peck'); }
            }
        };
    }
    BigBird.prototype.layout = function () { this.x = slotX(this.slot); this.y = snowY + this.dy; };
    BigBird.prototype.update = function (dt) { this.sprite.update(dt); };

    /* ================= 小鸟（FlutterBird） ================= */
    function FlutterBird(slot, dy) {
        this.slot = slot;
        this.dy = dy || 0;
        this.x = 0; this.y = 0;
        this.sprite = new Sprite('flutterbird', 'idle');
        this.facing = 1;
        this.sx = 1; this.sy = 1; this.rot = 0;
        // FlutterBird::.ctor：颜色在构造时就定下（4 个固定色里随机一个），整局不变
        this.tint = BANKS.flutterbird.colors[Math.floor(Math.random() * 4)];
        this.cool = 0.3 + Math.random() * 1.0;
        this.hop = null;
        this.landT = 0;
        this.fly = null;                  // 惊飞状态
        this.gone = false;
        this.respawnAt = 0;
        this.startleSfx = 0;
    }
    FlutterBird.prototype.groundY = function () { return snowY + this.dy; };
    FlutterBird.prototype.layout = function () {
        if (!this.fly) { this.x = slotX(this.slot); this.y = this.groundY(); }
    };
    FlutterBird.prototype.hopNow = function () {
        // <IdleRoutine>d__9：落点 = 家的锚点 ±4 世界像素，控制点抬 14，贝塞尔 0.25s 一跳
        // （不是正弦：原版起跳瞬间的横向位移就是这么来的）
        var home = slotX(this.slot), ty = this.groundY();
        var tx = home + (-4 + Math.random() * 8) * S;
        if (Math.abs(tx - this.x) > 0.01) this.facing = tx < this.x ? -1 : 1;
        this.hop = {
            t: 0, dur: 0.25,
            curve: new SimpleCurve(v2(this.x, this.y), v2(tx, ty),
                                   v2((this.x + tx) / 2, (this.y + ty) / 2 - 14 * S))
        };
        this.sprite.set('idle');
        // 原版每跳一下一声 birdbaby_hop；5 只小鸟各跳各的会糊成一片，全局 0.6s 节流
        if (clock - lastHopSfx > 0.6) { lastHopSfx = clock; sfx('bird_hop'); }
    };
    FlutterBird.prototype.startle = function () {
        if (this.fly || this.gone) return;
        if (clock - this.startleSfx < 0.6) return;
        this.startleSfx = clock;
        this.hop = null;
        this.sprite.set('fly', true);
        sfx('bird_startle');
        this.fly = {
            delay: 0.08 + Math.random() * 0.2,
            dir: Math.random() < 0.5 ? -1 : 1,
            launched: false, vx: 0, vy: 0
        };
    };
    FlutterBird.prototype.update = function (dt) {
        if (this.gone) return;

        if (this.fly) {
            var f = this.fly;
            if (!f.launched) {
                f.delay -= dt;
                if (f.delay > 0) return;
                f.launched = true;
                this.facing = f.dir;
                sfx('bird_flyaway');
                // FlyAwayRoutine：Scale = (-dir*1.25, 1.25)，初速 (dir*8, -32)*S，加速 (dir*64, -128)*S
                this.sx = 1.25; this.sy = 1.25;
                f.vx = f.dir * 8 * S;
                f.vy = -32 * S;
                this.y -= 6 * S;
            }
            f.vy -= 128 * S * dt;
            f.vx += f.dir * 64 * S * dt;
            this.x += f.vx * dt;
            this.y += f.vy * dt;
            this.rot = angleLerp(this.rot, Math.atan2(f.vy, f.vx) * 0.25, 0.2);
            if (this.y < -80 || this.x < -80 || this.x > CW + 80) {
                this.gone = true;
                this.respawnAt = clock + 2.5;      // respawnTimer = 2.5
            }
            return;
        }

        if (this.hop) {
            this.hop.t += dt;
            var k = Math.min(1, this.hop.t / this.hop.dur);
            var hp = this.hop.curve.getPoint(k);
            this.x = hp.x; this.y = hp.y;
            this.sx = 1; this.sy = 1;
            if (k >= 1) {
                this.hop = null;
                this.landT = 0.16;
                this.sx = 1.4; this.sy = 0.6;      // 落地压扁（原版 Scale = (sign*1.4, 0.6)）
            }
            return;
        }

        this.sx = approach(this.sx, 1, dt * 4);
        this.sy = approach(this.sy, 1, dt * 4);
        this.landT = Math.max(0, this.landT - dt);
        this.cool -= dt;
        if (this.cool <= 0) {
            this.hopNow();
            this.cool = 0.25 + Math.random() * 1.0;   // idleRoutine 的随机间隔
        }
    };

    /* ================= 实例集合 ================= */
    var bigs = [], flutters = [];

    function buildBirds() {
        if (bigs.length) return;
        refreshSlots();
        // 大鸟只留一只大蓝鸟：slot 0.88 / dy +5，站在左段最右端、离 Madeline 最近。
        var blue = new BigBird(0.88, 5);
        blue.facing = 1;
        bigs.push(blue);

        // 5 只小鸟错开 dy：单层 canvas 也有一点纵深，不像贴纸排排站
        var spots = [[0.24, 9], [0.36, -13], [0.60, 7], [0.72, -9], [0.97, 3]];
        for (var i = 0; i < spots.length; i++) flutters.push(new FlutterBird(spots[i][0], spots[i][1]));
    }

    function layoutAll() {
        resize();
        refreshSlots();
        for (var i = 0; i < bigs.length; i++) bigs[i].layout();
        for (var j = 0; j < flutters.length; j++) flutters[j].layout();
    }

    /* ================= 主循环 ================= */
    var pointer = null;

    var tweetCool = 2.5;
    function update(dt) {
        for (var i = 0; i < bigs.length; i++) bigs[i].update(dt);
        for (var j = 0; j < flutters.length; j++) {
            var fb = flutters[j];
            fb.update(dt);
            if (fb.gone && clock >= fb.respawnAt) {
                fb.gone = false; fb.fly = null; fb.rot = 0; fb.sx = 1; fb.sy = 1;
                fb.sprite.set('idle', true);
                fb.x = slotX(fb.slot); fb.y = fb.groundY();
                fb.cool = 0.4 + Math.random();
            }
            // 指针靠近 → 惊飞（原版 48 世界像素；页面按 0.55× 放宽，指针比玩家更容易扫过）
            if (pointer && !fb.gone && !fb.fly) {
                var dx = pointer.x - fb.x, dy = pointer.y - fb.y;
                if (Math.abs(dx) < 48 * S * 0.55 && dy > -40 * S && dy < 8 * S) fb.startle();
            }
        }
        // 偶发啾啾：每 3.5~8s 随机一只小鸟叫一声（一次性播放循环素材）
        tweetCool -= dt;
        if (tweetCool <= 0) {
            tweetCool = 3.5 + Math.random() * 4.5;
            if (flutters.length) {
                sfx('bird_tweet_loop');
            }
        }
    }

    function render() {
        ctx.clearRect(0, 0, CW, CH);
        drawAstars();

        // 按脚底 y 排序：雪台上的先画，偏前景的后画
        var list = [];
        var j;
        for (j = 0; j < bigs.length; j++) list.push(bigs[j]);
        for (j = 0; j < flutters.length; j++) if (!flutters[j].gone) list.push(flutters[j]);
        list.sort(function (a, b) { return a.y - b.y; });

        for (var n = 0; n < list.length; n++) {
            var b = list[n];
            drawSprite(b.sprite, b.x, b.y, b.facing, b.sx, b.sy, b.rot, b.tint);
        }
    }

    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!lastT) lastT = ts;
        var dt = Math.min(0.05, (ts - lastT) / 1000);
        lastT = ts;
        clock += dt;
        update(dt);
        render();
    }

    /* ================= 生命周期 ================= */
    function start() {
        if (active) return;
        buildBirds();
        layoutAll();
        active = true;
        lastT = 0;
        if (SFX) SFX.setGainSource(function () { return 0.5; });
        // 每次进梦都是一次全新的演出：位置与动画复位
        for (var i = 0; i < bigs.length; i++) {
            bigs[i].sprite.set('idle', true);
            bigs[i].rot = 0; bigs[i].sx = 1; bigs[i].sy = 1;
        }
        for (var j = 0; j < flutters.length; j++) {
            var fb = flutters[j];
            fb.gone = false; fb.fly = null; fb.hop = null;
            fb.rot = 0; fb.sx = 1; fb.sy = 1;
            fb.sprite.set('idle', true);
            fb.x = slotX(fb.slot); fb.y = fb.groundY();
        }
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        if (!active) return;
        active = false;
        cancelAnimationFrame(raf);
        raf = 0;
        ctx.clearRect(0, 0, CW, CH);
        if (SFX) SFX.stopAll();
    }

    document.addEventListener('dream:entered', start);
    document.addEventListener('dream:exiting', stop);

    // 指针位置（相对 .ds-left），给小鸟的接近惊飞用
    left.addEventListener('pointermove', function (e) {
        if (!active) return;
        var r = left.getBoundingClientRect();
        pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    left.addEventListener('pointerleave', function () { pointer = null; });

    window.addEventListener('resize', function () {
        if (!active) return;
        layoutAll();
    });

    // 暴露只读自检（无头回归用）
    window.DreamBirds = {
        _state: function () {
            return {
                active: active,
                birds: bigs.length + flutters.length,
                astars: astars.length,     // 极光星点数（现在画在画布上，不再有 DOM）
                flying: flutters.filter(function (f) { return !!f.fly || f.gone; }).length,
                colors: flutters.map(function (f) { return f.tint; }),
                flutterK: BANKS.flutterbird.k || 1
            };
        },
        // 星点相对坐标（画布像素）：回归测试用来回读 #dsBirds 像素，确认星点真的画上了
        _astars: function () {
            return astars.map(function (s) {
                return { x: Math.round(s.x * CW), y: Math.round(s.y * CH), col: s.col };
            });
        },
        // 站位几何：雪线、尺度、可用区段与每只鸟的 x（验证鸟没有钻到篝火/心门底下）
        _layout: function () {
            var lr = left.getBoundingClientRect();
            var fire = document.getElementById('dsFire');
            var door = document.getElementById('heartDoor');
            var xs = [];
            var i;
            for (i = 0; i < bigs.length; i++) xs.push(Math.round(bigs[i].x));
            for (i = 0; i < flutters.length; i++) xs.push(Math.round(flutters[i].x));
            return {
                w: CW, h: CH, scale: S, snowY: snowY,
                band: [SLOT_LO, SLOT_HI], xs: xs,
                fireRight: fire ? Math.round(fire.getBoundingClientRect().right - lr.left) : 0,
                doorW: door ? door.offsetWidth : 0
            };
        }
    };
})();
