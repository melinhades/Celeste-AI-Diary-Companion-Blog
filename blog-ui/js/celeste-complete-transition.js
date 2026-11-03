/* ===== js/celeste-complete-transition.js =====
   章节完成过场（LevelExit → AreaComplete）的独立封装。

   二进制取证（本地安装版 Celeste.dll）：
     assembly Celeste, Version=1.0.0.0；MVID 4a26f9de-d670-4c87-a2f4-7e66d2d85163
     · Celeste.LevelExit::Begin —— HiresSnow(0.45)、Direction=(0,16)、FadeWipe(this,true,null)
     · Celeste.LevelExit::<Routine>d__14::MoveNext —— timer>=3.3 才切 AreaComplete
     · Celeste.AreaComplete::.ctor —— new CompleteRenderer(xml, atlas, 1f, onDone)
     · Celeste.CompleteRenderer::.ctor —— fadeAlpha=1、SlideDuration=1.5
     · Celeste.CompleteRenderer::<SlideRoutine>d__23::MoveNext —— 延迟→SineOut 滑入→0.2s 停顿
     · Celeste.CompleteRenderer::RenderContent —— scroll = -Scroll；结束后 Draw.Rect 黑幕 * fadeAlpha
     · Celeste.CompleteRenderer::Layer::GetScrollPosition —— P + scroll * ScrollFactor
     · Celeste.HiresSnow::.ctor/Update/Render + Particle::Reset —— 50 粒、Direction 决定生成边
     · Content/Graphics/CompleteScreens.xml —— 每章的 start/center/layers 一律来自这里

   分层刻意照搬原作的两个场景：
     FadeWipe           ← LevelExit 的收尾黑幕
     HiresSnow          ← 两段共用的大雪
     CompleteRenderer   ← AreaComplete 里的过场渲染器（可单独复用）
     ChapterCompleteSequence ← 只负责“谁在什么时候接管”，不碰绘制细节
   ============================================================ */
(function (global) {
    'use strict';

    var VIRTUAL_W = 1920;
    var VIRTUAL_H = 1080;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function lerpClamp(a, b, t) {
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        return a + (b - a) * t;
    }

    function approach(value, target, maxDelta) {
        if (value < target) return Math.min(value + maxDelta, target);
        return Math.max(value - maxDelta, target);
    }

    // Monocle.Ease.SineOut：sin(t * π/2)
    function sineOut(t) { return Math.sin(t * Math.PI / 2); }

    // Monocle.Ease.CubeIn / CubeOut
    function cubeIn(t) { return t * t * t; }
    function cubeOut(t) { var u = 1 - t; return 1 - u * u * u; }

    // Calc.Map / Calc.Range
    function mapRange(v, inMin, inMax, outMin, outMax) {
        return outMin + (v - inMin) * (outMax - outMin) / (inMax - inMin);
    }
    function randomRange(min, max) { return min + Math.random() * (max - min); }

    /* ---------- Celeste.FadeWipe（ScreenWipe 的子类） ---------- */
    function FadeWipe(wipeIn, duration) {
        this.wipeIn = wipeIn !== false;
        this.duration = duration || 0.5;
        this.percent = 0;
        this.finished = false;
    }
    FadeWipe.prototype.update = function (dt) {
        if (this.finished) return;
        this.percent += dt / this.duration;
        if (this.percent >= 1) {
            this.percent = 1;
            this.finished = true;
        }
    };
    // FadeWipe.Render：wipeIn → 1-CubeIn(p)，wipeOut → CubeOut(p)
    FadeWipe.prototype.getAlpha = function () {
        return this.wipeIn ? 1 - cubeIn(this.percent) : cubeOut(this.percent);
    };

    /* ---------- Celeste.HiresSnow ---------- */
    function HiresSnow(overlayAlpha) {
        this.alpha = 1;
        this.direction = { x: -1, y: 0 };
        this.overlayAlpha = overlayAlpha;
        this.timer = 0;
        this.attachAlphaTo = null;
        this.particles = [];
        for (var i = 0; i < 50; i++) this.particles.push({});
        this.reset();
    }
    // HiresSnow/Particle::Reset(direction)
    HiresSnow.prototype.resetParticle = function (p) {
        var s = Math.random();
        s = s * s * s;
        p.scale = mapRange(s, 0, 1, 0.05, 0.8);
        p.speed = p.scale * randomRange(2500, 5000);

        var d = this.direction;
        if (d.x < 0) {
            p.x = VIRTUAL_W + 128;
            p.y = Math.random() * VIRTUAL_H;
        } else if (d.x > 0) {
            p.x = -128;
            p.y = Math.random() * VIRTUAL_H;
        } else if (d.y > 0) {
            p.x = Math.random() * VIRTUAL_W;
            p.y = -128;
        } else if (d.y < 0) {
            p.x = Math.random() * VIRTUAL_W;
            p.y = VIRTUAL_H + 128;
        }
        p.sin = Math.random() * Math.PI * 2;
        p.rotation = Math.random() * Math.PI * 2;
        // Color.Lerp(White, Transparent, s * 0.8) → 不透明度 1 - 0.8s
        p.colorAlpha = 1 - s * 0.8;
    };
    // HiresSnow::Reset —— 先按方向放在入场边，再均匀铺满整屏
    HiresSnow.prototype.reset = function () {
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            this.resetParticle(p);
            p.x = Math.random() * VIRTUAL_W;
            p.y = Math.random() * VIRTUAL_H;
        }
    };
    // HiresSnow::Update
    HiresSnow.prototype.update = function (dt) {
        if (this.attachAlphaTo) this.alpha = this.attachAlphaTo.percent;
        var d = this.direction;
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            p.x += d.x * p.speed * dt;
            p.y += d.y * p.speed * dt;
            p.y += Math.sin(p.sin) * 100 * dt;
            p.sin += dt;
            if (p.x < -128 || p.x > VIRTUAL_W + 128 || p.y < -128 || p.y > VIRTUAL_H + 128) {
                this.resetParticle(p);
            }
        }
        this.timer += dt;
    };
    HiresSnow.prototype.render = function (ctx, assets) {
        if (!assets || !assets.snow) return;
        // HiresSnow.Render：方向长度决定“拉丝”比例
        var dirLen = Math.sqrt(this.direction.x * this.direction.x + this.direction.y * this.direction.y);
        var clampLen = Math.max(0, Math.min(20, dirLen));
        var hasAngle = clampLen > 1;
        var angle = hasAngle ? Math.atan2(this.direction.y, this.direction.x) : 0;
        var scaleX = hasAngle ? clampLen : 1;
        var scaleY = hasAngle ? 0.2 + (1 - clampLen / 20) * 0.8 : 1;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // overlay：1920×1080 纹理按 timer 平移平铺，alpha = Alpha * overlayAlpha
        if (assets.overlay) {
            var ow = assets.overlay.naturalWidth;
            var oh = assets.overlay.naturalHeight;
            var ox = (this.timer * 32) % ow;
            var oy = (this.timer * 20) % oh;
            ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha * this.overlayAlpha));
            for (var y = -oy; y < VIRTUAL_H; y += oh) {
                for (var x = -ox; x < VIRTUAL_W; x += ow) {
                    ctx.drawImage(assets.overlay, x, y);
                }
            }
        }

        // particles：snow = OVR.Atlas["snow"].GetSubtexture(1,1,254,254)
        for (var i = 0; i < this.particles.length; i++) {
            var p = this.particles[i];
            var base = 254 * p.scale;
            var w = base * scaleX;
            var h = base * scaleY;
            var rot = hasAngle ? angle : p.rotation;
            ctx.globalAlpha = Math.max(0, Math.min(1, p.colorAlpha * this.alpha));
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(rot);
            ctx.drawImage(assets.snow, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
        ctx.restore();
    };

    /* ---------- Celeste.CompleteRenderer ---------- */
    function CompleteRenderer(config, images, delay, onDone) {
        this.config = config;
        this.images = images;
        this.delay = delay;
        this.onDone = onDone;
        this.slideDuration = 1.5;          // CompleteRenderer..ctor
        this.fadeAlpha = 1;                // CompleteRenderer..ctor
        this.startScroll = config.start;
        this.centerScroll = config.center;
        this.scroll = { x: config.start.x, y: config.start.y };
        this.layers = config.layers.map(function (l) {
            return {
                img: l.img,
                x: l.x || 0,
                y: l.y || 0,
                scroll: l.scroll || 0,
                scale: l.scale || 1,
                alpha: l.alpha == null ? 1 : l.alpha
            };
        });
        this.state = 'delay';
        this.p = 0;
        this.pause = 0;
        this.finishedSlide = false;
    }
    CompleteRenderer.prototype.update = function (dt) {
        if (this.state === 'delay') {
            this.delay -= dt;
            if (this.delay <= 0) this.state = 'slide';
            return;
        }
        if (this.state === 'slide') {
            // 原作先按当前 p 取样，再累加 p（SlideRoutine.MoveNext）
            this.scroll = {
                x: lerp(this.startScroll.x, this.centerScroll.x, sineOut(this.p)),
                y: lerp(this.startScroll.y, this.centerScroll.y, sineOut(this.p))
            };
            this.fadeAlpha = lerpClamp(1, 0, this.p * 2);
            this.p += dt / this.slideDuration;
            if (this.p >= 1) {
                this.scroll = { x: this.centerScroll.x, y: this.centerScroll.y };
                this.fadeAlpha = 0;
                this.state = 'pause';
                this.pause = 0.2;
            }
            return;
        }
        if (this.state === 'pause') {
            this.pause -= dt;
            if (this.pause <= 0) {
                this.state = 'done';
                this.finishedSlide = true;
                if (this.onDone) this.onDone();
            }
        }
    };
    CompleteRenderer.prototype.render = function (ctx) {
        // Render 里传 -Scroll（controlScroll 在过场阶段为 0，见缺口 U1）
        var scroll = { x: -this.scroll.x, y: -this.scroll.y };
        for (var i = 0; i < this.layers.length; i++) {
            var layer = this.layers[i];
            var img = this.images[layer.img];
            if (!img) continue;
            // Layer.GetScrollPosition：Position + scroll * ScrollFactor
            var px = layer.x + scroll.x * layer.scroll;
            var py = layer.y + scroll.y * layer.scroll;
            var s = layer.scale;
            var w = img.naturalWidth * s;
            var h = img.naturalHeight * s;
            ctx.globalAlpha = layer.alpha;
            // Calc.Floor：原作对中心点向下取整
            ctx.drawImage(img, Math.floor(px - w / 2), Math.floor(py - h / 2), w, h);
        }
        ctx.globalAlpha = 1;
        if (this.fadeAlpha > 0) {
            ctx.fillStyle = 'rgba(0,0,0,' + this.fadeAlpha + ')';
            ctx.fillRect(-10, -10, VIRTUAL_W + 20, VIRTUAL_H + 20);
        }
    };

    /* ---------- 序列编排：只决定“谁在什么时候接管” ---------- */
    function ChapterCompleteSequence(config, images, options) {
        options = options || {};
        this.config = config;
        this.images = images;
        this.time = 0;
        this.skipHold = !!options.skipHold;
        this.phase = 'fadeIn';                 // fadeIn → hold → complete → done
        this.snow = new HiresSnow(0.45);       // LevelExit.Begin
        this.snow.direction = { x: 0, y: 16 }; // Completed 模式
        this.snow.alpha = 1;
        this.wipe = new FadeWipe(true, 0.5);   // FadeWipe(this, true, null)
        this.complete = null;
        this.finished = false;
    }
    ChapterCompleteSequence.HOLD_TIME = 3.3;   // LevelExit.Routine
    ChapterCompleteSequence.SLIDE_DELAY = 1.0; // AreaComplete..ctor → CompleteRenderer
    ChapterCompleteSequence.enterComplete = function (seq) {
        seq.complete = new CompleteRenderer(seq.config, seq.images,
            ChapterCompleteSequence.SLIDE_DELAY, null);
        seq.phase = 'complete';
    };
    ChapterCompleteSequence.prototype.update = function (dt) {
        if (this.finished) {
            this.snow.update(dt);   // 结束后雪仍按 AreaComplete.Update 继续衰减
            return;
        }
        this.time += dt;
        this.snow.update(dt);

        if (this.phase === 'fadeIn') {
            this.wipe.update(dt);
            if (this.wipe.finished) this.phase = 'hold';
            return;
        }
        if (this.phase === 'hold') {
            if (this.skipHold || this.time >= ChapterCompleteSequence.HOLD_TIME) {
                ChapterCompleteSequence.enterComplete(this);
            }
            return;
        }
        if (this.phase === 'complete') {
            // AreaComplete.Update：Alpha→0（0.5/s），Direction.Y→24（24/s）
            this.snow.alpha = approach(this.snow.alpha, 0, dt * 0.5);
            this.snow.direction.y = approach(this.snow.direction.y, 24, dt * 24);
            this.complete.update(dt);
            if (this.complete.finishedSlide) {
                this.phase = 'done';
                this.finished = true;
            }
        }
    };
    // 跳过 LevelExit 的 3.3s 等待（demo 用，原作没有这个入口）
    ChapterCompleteSequence.prototype.skip = function () {
        if (this.phase === 'hold' || this.phase === 'fadeIn') {
            this.wipe.percent = 1;
            this.wipe.finished = true;
            this.skipHold = true;
            this.time = Math.max(this.time, ChapterCompleteSequence.HOLD_TIME);
            ChapterCompleteSequence.enterComplete(this);
        }
    };
    ChapterCompleteSequence.prototype.render = function (ctx, assets) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

        if (this.complete) this.complete.render(ctx);
        this.snow.render(ctx, assets);

        if (this.phase === 'fadeIn') {
            var a = this.wipe.getAlpha();
            if (a > 0) {
                ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
                ctx.fillRect(-10, -10, VIRTUAL_W + 20, VIRTUAL_H + 20);
            }
        }
    };
    ChapterCompleteSequence.prototype.phaseLabel = function () {
        if (this.phase === 'fadeIn') return 'LevelExit · FadeWipe(wipeIn) 0.5s';
        if (this.phase === 'hold') return 'LevelExit · 黑场 + HiresSnow 等待 3.3s';
        if (this.phase === 'complete') {
            if (this.complete && this.complete.state === 'delay') return 'AreaComplete · CompleteRenderer 延迟 1.0s';
            if (this.complete && this.complete.state === 'slide') return 'AreaComplete · SineOut 滑入 1.5s（黑幕 0.75s 淡出）';
            return 'AreaComplete · 收尾停顿 0.2s';
        }
        return '完成 · 结束帧';
    };

    /* ---------- 素材与章节数据 ---------- */
    // Content/Graphics/CompleteScreens.xml · ForsakenCity（原样抄录）
    var FORSAKEN_CITY = {
        atlas: 'ForsakenCity',
        start: { x: -10, y: 2000 },
        center: { x: -10, y: 1200 },
        scale: 2,
        layers: [
            { img: '01', x: 0, y: 0, scroll: 0, scale: 2 },
            { img: '02', x: -800, y: -700, scroll: 0.02, scale: 2 },
            { img: '03', x: -800, y: -700, scroll: 0.03, scale: 2 },
            { img: '04', x: -800, y: -700, scroll: 0.04, scale: 2 },
            { img: '05', x: -800, y: -700, scroll: 0.05, scale: 2 },
            { img: 'snow-back', x: -920, y: -720, scroll: 0.06, scale: 2 },
            { img: '06', x: -800, y: -700, scroll: 0.07, scale: 2 },
            // <ui scroll="0.62"/> 属于标题/统计 UI，demo 不绘制（见缺口 U2）
            { img: '07', x: -800, y: -700, scroll: 0.08, scale: 2 },
            { img: '08a', x: -800, y: -700, scroll: 0.10, scale: 2 },
            { img: '08b', x: -800, y: -700, scroll: 0.10, scale: 2 },
            { img: '09', x: -920, y: -720, scroll: 0.10 },
            { img: '10', x: -920, y: -720, scroll: 0.10 },
            { img: 'snow-front', x: -920, y: -720, scroll: 0.12, scale: 2 },
            { img: '11', x: -800, y: -520, scroll: 0.14, scale: 2 }
        ]
    };

    global.CelesteComplete = {
        VIRTUAL_WIDTH: VIRTUAL_W,
        VIRTUAL_HEIGHT: VIRTUAL_H,
        FadeWipe: FadeWipe,
        HiresSnow: HiresSnow,
        CompleteRenderer: CompleteRenderer,
        ChapterCompleteSequence: ChapterCompleteSequence,
        FORSAKEN_CITY: FORSAKEN_CITY
    };
})(typeof window !== 'undefined' ? window : globalThis);
