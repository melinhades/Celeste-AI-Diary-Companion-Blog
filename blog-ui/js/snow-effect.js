/**
 * Celeste.HiresSnow —— 启动/开场背景雪花粒子特效 · 前端还原实现
 *
 * 证据来源：REA 6.8.0 对本地 Celeste.dll（MonoMod/Everest 补丁版）的 IL 级反编译。
 * 本文件所有常量均逐一对应 IL 指令，注释里给出原始 IL 偏移与令牌。
 * 详细推导见同目录 README.md。
 *
 * 坐标约定：与 IL 一致 —— 单位是「屏幕像素」（Engine.Width/Height，默认 1920x1080），
 *           原点在左上角，x 向右，y 向下。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CelesteSnow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 6.2831855f —— IL: ldc.r4 6.2831854820251465 */
  var TAU = 6.2831854820251465;

  /**
   * 与 IL 一一对应的常量表。
   * 每一项都可在 README.md「常量速查表」中找到对应的 IL 指令。
   */
  var IL = {
    // HiresSnow.orig_ctor @117: ldc.i4.s 50 / newarr Particle[50]
    PARTICLE_COUNT: 50,
    // HiresSnow.orig_ctor @106: GetSubtexture(1,1,254,254,null)
    SNOW_SUBRECT: { x: 1, y: 1, w: 254, h: 254 },
    // HiresSnow.Render @405/@410: ldc.i4 1920 / ldc.i4 1080
    OVERLAY_RECT: { w: 1920, h: 1080 },
    // HiresSnow.Render @298/@325: timer*32f , timer*20f
    OVERLAY_SCROLL: { x: 32, y: 20 },
    // Particle.Reset @21-41: Calc.Map(n, 0f, 1f, 0.05f, 0.8f)
    SCALE_MAP: { inMin: 0, inMax: 1, outMin: 0.05, outMax: 0.8 },
    // Particle.Reset @60/@61: Calc.Range(2500, 5000)
    SPEED_RANGE: { min: 2500, max: 5000 },
    // Particle.Reset @342: Lerp(White, Transparent, n * 0.8f)
    COLOR_LERP: 0.8,
    // HiresSnow.Update @158: ldc.r4 100
    SIN_AMPLITUDE: 100,
    // HiresSnow.Update @220/@285: ldc.r4 -128  /  @254/@319: ldc.i4 128
    BOUNDARY: 128,
    // HiresSnow.Render @16/@21: Calc.Clamp(Direction.Length(), 0f, 20f)
    CLAMP_DIR_MAX: 20,
    // GameLoader..ctor @42: ldc.r4 0.45 → newobj HiresSnow(0.45f)
    DEFAULT_OVERLAY_ALPHA: 0.45
  };

  /** Calc.Map */
  function map(v, inMin, inMax, outMin, outMax) {
    return outMin + (v - inMin) / (inMax - inMin) * (outMax - outMin);
  }

  /** Calc.Clamp */
  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /**
   * Calc.Range(Random, int min, int max) —— IL 中为 int 重载（@73 后接 conv.r4）。
   * Monocle 中该重载为 random.Next(min, max + 1)，两端闭区间。
   */
  function rangeInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function makeParticle() {
    return {
      // 嵌套类型 Celeste.HiresSnow/Particle（TypeDef 0x0200044f）
      Scale: 0,
      Position: { x: 0, y: 0 },
      Speed: 0,
      Sin: 0,
      Rotation: 0,
      // Microsoft.Xna.Framework.Color(r,g,b,a)，0-255
      Color: { r: 255, g: 255, b: 255, a: 255 }
    };
  }

  /**
   * Celeste.HiresSnow/Particle.Reset(Vector2 direction)
   * IL：0x06001c70 / 0x0200044f —— 见 README「嵌套 Particle」。
   */
  function particleReset(p, direction, engineW, engineH, rng, speedRange) {
    // float num = Calc.Random.NextFloat();
    var n = rng();
    // num *= num * num * num;   （IL 11-18：4 次 ldloc + 3 次 mul → n^4）
    n = n * n * n * n;

    // Scale = Calc.Map(num, 0f, 1f, 0.05f, 0.8f);
    p.Scale = map(n, IL.SCALE_MAP.inMin, IL.SCALE_MAP.inMax,
      IL.SCALE_MAP.outMin, IL.SCALE_MAP.outMax);

    // Speed = Scale * (float)Calc.Range(2500, 5000);
    // speedRange：网页下落场景的适配入口；缺省仍取原作 IL 值，1:1 不变
    var sr = speedRange || IL.SPEED_RANGE;
    p.Speed = p.Scale * rangeInt(rng, sr.min, sr.max);

    // 按 Direction 决定在屏幕哪条边外 128px 处出生
    var B = IL.BOUNDARY;
    if (direction.x < 0) {
      p.Position.x = engineW + B;
      p.Position.y = rng() * engineH;
    } else if (direction.x > 0) {
      p.Position.x = -B;
      p.Position.y = rng() * engineH;
    } else if (direction.y > 0) {
      p.Position.x = rng() * engineW;
      p.Position.y = -B;
    } else {
      p.Position.x = rng() * engineW;
      p.Position.y = engineH + B;
    }

    // Sin      = Calc.Random.NextFloat(6.2831855f);
    p.Sin = rng() * TAU;
    // Rotation = Calc.Random.NextFloat(6.2831855f);
    p.Rotation = rng() * TAU;

    // Color = Color.Lerp(Color.White, Color.Transparent, num * 0.8f);
    // 仅 Alpha 通道变化：255 → 0，t = num*0.8
    p.Color.r = 255;
    p.Color.g = 255;
    p.Color.b = 255;
    p.Color.a = 255 * (1 - n * IL.COLOR_LERP);
  }

  /**
   * Celeste.HiresSnow : Celeste.Backdrop
   *
   * @param {object} opts
   * @param {number} opts.width          Engine.Width
   * @param {number} opts.height         Engine.Height
   * @param {number} [opts.overlayAlpha] 构造参数，GameLoader 传入 0.45
   * @param {CanvasImageSource} opts.snowImage     Overworld/atlas 的 "snow"
   * @param {CanvasImageSource} opts.overlayImage  Overworld/atlas 的 "overlay"
   * @param {number} [opts.particleCount] 粒子数（原作固定 50；网页小画布可调少）
   * @param {{min:number,max:number}} [opts.speedRange] 速度区间（原作 Scale×[2500,5000]；
   *        垂直下落场景建议 [100,260]——大粒子明显飘过、小粒子近悬浮，保留原作视差感）
   * @param {function} [opts.random]     随机源（默认 Math.random），便于断言复现
   */
  function HiresSnow(opts) {
    if (!opts || !opts.snowImage || !opts.overlayImage) {
      throw new Error('HiresSnow: 需要 snowImage 与 overlayImage');
    }
    this.width = opts.width;
    this.height = opts.height;
    this.random = opts.random || Math.random;
    this.speedRange = opts.speedRange || null;

    // Alpha = 1f; ParticleAlpha = 1f;               // orig_ctor @1/@12
    this.Alpha = 1;
    this.ParticleAlpha = 1;
    // Direction = new Vector2(-1f, 0f);             // orig_ctor @23/@28
    this.Direction = { x: -1, y: 0 };
    // AttachAlphaTo = null（本实现不支持，见 README 缺口清单）
    this.AttachAlphaTo = null;

    // overlayAlpha = <构造参数>;  overlay = GFX.Overworld["overlay"];
    this.overlayAlpha = opts.overlayAlpha != null
      ? opts.overlayAlpha : IL.DEFAULT_OVERLAY_ALPHA;
    this.overlay = opts.overlayImage;
    // snow = GFX.Overworld["snow"].GetSubtexture(1,1,254,254,null);
    this.snow = opts.snowImage;

    // timer = 0f
    this.timer = 0;

    // particles = new Particle[50]; Reset();
    // particleCount：原作固定 50（IL newarr [50]）；网页场景可通过 opts 调整。
    // 显式传 0 时不生成粒子，只剩 overlay 雾层（供网页圆点雪模式复用）。
    var count = opts.particleCount != null ? Math.max(0, opts.particleCount | 0) : IL.PARTICLE_COUNT;
    this.particles = [];
    for (var i = 0; i < count; i++) this.particles.push(makeParticle());
    this.Reset();
  }

  /**
   * HiresSnow.Reset()  IL：0x06001c6c
   * 先对每个粒子 Reset(Direction)，再用整屏均匀随机覆盖其 X/Y。
   * （即"边外出生"被立即覆盖 → 初始分布是整屏随机的）
   */
  HiresSnow.prototype.Reset = function () {
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      particleReset(p, this.Direction, this.width, this.height, this.random, this.speedRange);
      // particles[i].Position.X = Calc.Random.NextFloat(Engine.Width);   // @44
      p.Position.x = this.random() * this.width;
      // particles[i].Position.Y = Calc.Random.NextFloat(Engine.Height);  // @82
      p.Position.y = this.random() * this.height;
    }
  };

  /**
   * HiresSnow.Update(Scene)  IL：0x06001c6d
   * @param {number} dt Engine.DeltaTime（秒）
   */
  HiresSnow.prototype.Update = function (dt) {
    // if (AttachAlphaTo != null) Alpha = AttachAlphaTo.Percent;
    if (this.AttachAlphaTo) this.Alpha = this.AttachAlphaTo.Percent;

    var W = this.width, H = this.height, B = IL.BOUNDARY;

    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];

      // particles[i].Position += Direction * particles[i].Speed * Engine.DeltaTime;
      p.Position.x += this.Direction.x * p.Speed * dt;
      p.Position.y += this.Direction.y * p.Speed * dt;

      // particles[i].Position.Y += (float)Math.Sin(particles[i].Sin) * 100f * Engine.DeltaTime;
      p.Position.y += Math.sin(p.Sin) * IL.SIN_AMPLITUDE * dt;

      // particles[i].Sin += Engine.DeltaTime;
      p.Sin += dt;

      // 出界（±128 于屏幕外）则重生
      if (p.Position.x < -B || p.Position.x > W + B ||
          p.Position.y < -B || p.Position.y > H + B) {
        particleReset(p, this.Direction, W, H, this.random, this.speedRange);
      }
    }

    // timer += Engine.DeltaTime;
    this.timer += dt;
  };

  /**
   * HiresSnow.Render  IL：0x06001c6e
   * 两趟绘制：
   *   ① 雪花：Additive 混合，逐粒子 DrawCentered(snow 子纹理, Color, scale*Scale, rot)
   *   ② overlay：Additive + LinearWrap，用 1920x1080 的源矩形在纹理内滚动采样
   * @param {CanvasRenderingContext2D} ctx
   * @param {CanvasPattern} overlayPattern 由 overlayImage 生成的重复图案（只创建一次）
   */
  HiresSnow.prototype.Render = function (ctx, overlayPattern) {
    // float mag = Calc.Clamp(Direction.Length(), 0f, 20f);
    var mag = clamp(Math.sqrt(this.Direction.x * this.Direction.x +
      this.Direction.y * this.Direction.y), 0, IL.CLAMP_DIR_MAX);
    // bool spin = mag > 1f;
    var spin = mag > 1;

    var scaleX = 1, scaleY = 1, ang = 0;
    if (spin) {
      // ang = Direction.Angle();  // 推断 Math.Atan2(y,x)，默认方向下不生效
      ang = Math.atan2(this.Direction.y, this.Direction.x);
      scaleX = mag;
      scaleY = 0.2 + (1 - mag / IL.CLAMP_DIR_MAX) * 0.8;
    }
    var scale = { x: scaleX, y: scaleY };

    // SpriteBatch.Begin(Deferred, BlendState.Additive, SamplerState.LinearWrap, null, null, null, ScreenMatrix)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var a = this.Alpha * this.ParticleAlpha;   // @131
    var sub = IL.SNOW_SUBRECT;

    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var alpha = p.Color.a / 255;
      if (a < 1) alpha *= a;                   // Color * a

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(p.Position.x, p.Position.y);
      ctx.rotate(spin ? ang : p.Rotation);
      var dw = sub.w * (scale.x * p.Scale);
      var dh = sub.h * (scale.y * p.Scale);
      ctx.drawImage(this.snow,
        sub.x, sub.y, sub.w, sub.h,
        -dw / 2, -dh / 2, dw, dh);              // DrawCentered
      ctx.restore();
    }

    // float ox = (timer * 32f) % overlay.Width;   @292
    // float oy = (timer * 20f) % overlay.Height;  @319
    var ow = this.overlay.width || this.overlay.naturalWidth || IL.OVERLAY_RECT.w;
    var oh = this.overlay.height || this.overlay.naturalHeight || IL.OVERLAY_RECT.h;
    var ox = (this.timer * IL.OVERLAY_SCROLL.x) % ow;
    var oy = (this.timer * IL.OVERLAY_SCROLL.y) % oh;

    // Color oc = Color.White * (Alpha * overlayAlpha);   @346
    // overlayAlpha = 0 表示调用方不要雾层：直接跳过，不做无谓的整屏填充
    if (overlayPattern && this.overlayAlpha > 0) {
      ctx.globalAlpha = this.Alpha * this.overlayAlpha;
      // Draw(overlay.Texture, Vector2.Zero, new Rectangle(-ox, -oy, 1920, 1080), oc)
      // 源矩形起始为负 → 配合 LinearWrap 采样形成无缝平铺滚动
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.fillStyle = overlayPattern;
      ctx.fillRect(0, 0, this.width + ow, this.height + oh);
      ctx.restore();
    }

    ctx.restore(); // globalCompositeOperation / globalAlpha
  };

  /* ============================================================
   * attach(canvas, opts) —— 网页场景统一工厂
   *
   * 把 1:1 复刻的 HiresSnow 直接挂到任意 canvas 上：
   * 自动加载 Overworld 纹理、按 devicePixelRatio 缩放、监听 resize、
   * 固定步长(1/60)推进 Update，复用 api-key-setup 页验证过的驱动方式。
   *
   * 与原作默认的差别（均可通过 opts 恢复原值）：
   *   · Direction 默认归一化的斜向左下 (-0.22, 1)——网站各页保留「下落感」，
   *     长度=1 不会触发 Render 的拉丝分支；
   *   · speedRange 默认 [100,260]（原作 [2500,5000] 是刮风穿越速度）；
   *   · 粒子数按画布面积自适应（36~100，1920×1080 时约 52，贴近原作 50）。
   *
   * @param {HTMLCanvasElement} canvas 画布（CSS 尺寸决定逻辑分辨率）
   * @param {object} [opts]
   * @param {number[]} [opts.direction=[-0.22, 1]] 任意非零向量，内部归一化
   * @param {'texture'|'dots'} [opts.particleStyle='texture']
   *        texture = 原作纹理雪；dots = 网页原版圆点雪（雾层由 overlayAlpha 单独控制）
   * @param {number}   [opts.overlayAlpha=0.45]  原作 GameLoader 传 0.45；传 0 = 不要雾层
   *        （雾层关闭时连 overlay.png 都不请求，纯圆点模式零纹理开销）
   * @param {{min:number,max:number}} [opts.speedRange]
   * @param {number}   [opts.count]  强制粒子数（默认按面积自适应）
   * @param {number}   [opts.dprCap=2]  devicePixelRatio 上限
   * @param {string}   [opts.snowSrc] / [opts.overlaySrc] 纹理路径
   * @returns {{stop: function, snow: Promise<HiresSnow>|null}}
   *          stop() 取消循环与监听；snow 为实例 Promise（纹理加载失败时 resolve(null)，
   *          画布保持透明，调用方可自行降级）
   */
  var ASSET_DIR = 'Atlases/Overworld/';

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function attach(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    opts = opts || {};

    var ctx = canvas.getContext('2d');
    var dprCap = opts.dprCap != null ? opts.dprCap : 2;
    var overlayAlpha = opts.overlayAlpha != null ? opts.overlayAlpha : IL.DEFAULT_OVERLAY_ALPHA;

    // 方向归一化：长度=1 → Render 的 mag=1 → spin=false，走原作默认自转分支
    var dx = (opts.direction ? opts.direction[0] : -0.22) || 0;
    var dy = (opts.direction ? opts.direction[1] : 1) || 0;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var direction = { x: dx / len, y: dy / len };

    var speedRange = opts.speedRange || { min: 100, max: 260 };
    // 粒子风格：'texture'（原作纹理雪，默认）| 'dots'（网页原版圆点雪，只保留 overlay 雾层）
    var particleStyle = opts.particleStyle === 'dots' ? 'dots' : 'texture';
    var dotCount = opts.count != null ? opts.count : 80;
    var dots = [];
    var snow = null, pattern = null, size = { W: 1, H: 1 };
    var rafId = 0, disposed = false, curDpr = 1;

    function resize() {
      curDpr = Math.min(window.devicePixelRatio || 1, dprCap);
      var rect = canvas.getBoundingClientRect();
      var W = Math.max(1, Math.round(rect.width || window.innerWidth));
      var H = Math.max(1, Math.round(rect.height || window.innerHeight));
      canvas.width = Math.round(W * curDpr);
      canvas.height = Math.round(H * curDpr);
      ctx.setTransform(curDpr, 0, 0, curDpr, 0, 0);
      if (snow) { snow.width = W; snow.height = H; }
      size = { W: W, H: H };
      return size;
    }

    var handle = {
      stop: function () {
        disposed = true;
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
        window.removeEventListener('resize', onResize);
      },
      snow: null
    };

    function onResize() { resize(); }

    /* ---------- 圆点雪（网页原版 snow-bgm 的粒子） ---------- */
    function makeDot(initScatter) {
      var o = Math.random() * 0.6 + 0.2;
      return {
        x: Math.random() * size.W,
        y: initScatter ? Math.random() * size.H : -10,
        r: Math.random() * 3 + 1,
        speed: Math.random() * 1.5 + 0.5,
        wind: Math.random() * 0.5 - 0.25,
        opacity: o,
        css: 'rgba(255,255,255,' + o + ')',   // 颜色不变，避免每帧拼字符串
        swing: Math.random() * TAU,
        swingSpeed: Math.random() * 0.02 + 0.01
      };
    }

    function drawDots(dt) {
      var k = dt * 60;            // 原实现按 60fps 每帧步进，这里换算成与帧率无关
      var W = size.W, H = size.H;
      for (var i = 0; i < dots.length; i++) {
        var f = dots[i];
        f.y += f.speed * k;
        f.swing += f.swingSpeed * k;
        f.x += (Math.sin(f.swing) * 0.5 + f.wind) * k;
        if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
        if (f.x > W + 10) f.x = -10;
        if (f.x < -10) f.x = W + 10;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.fillStyle = f.css;
        ctx.fill();
      }
    }

    resize();   // 先按当前布局定尺寸，纹理加载期间画布不停留在默认 300×150

    var needTexture = particleStyle === 'texture';
    var needFog = overlayAlpha > 0;

    function initDots() {
      for (var i = 0; i < dotCount; i++) dots.push(makeDot(true));
    }

    // 固定步长推进（与 api-key-setup 内联驱动一致），渲染随 rAF
    function startLoop() {
      var STEP = 1 / 60, acc = 0, last = performance.now();
      (function frame(now) {
        if (disposed || !canvas.isConnected) return;
        var dt = Math.min((now - last) / 1000, 0.25);
        last = now;
        acc += dt;
        while (acc >= STEP) {
          if (snow) snow.Update(STEP);            // 雾层滚动 / 纹理雪位置
          acc -= STEP;
        }

        ctx.setTransform(curDpr, 0, 0, curDpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        if (snow) snow.Render(ctx, pattern);      // 纹理雪，或仅 overlay 雾层
        if (dots.length) drawDots(dt);
        rafId = requestAnimationFrame(frame);
      })(performance.now());
    }

    // 纯圆点且不要雾层：不请求任何纹理，直接开跑
    if (!needTexture && !needFog) {
      initDots();
      startLoop();
      return handle;
    }

    Promise.all([
      loadImage(opts.snowSrc || ASSET_DIR + 'snow.png'),
      loadImage(opts.overlaySrc || ASSET_DIR + 'overlay.png')
    ]).then(function (imgs) {
      if (disposed) return;
      var sz = resize();
      window.addEventListener('resize', onResize);

      if (imgs[0] && imgs[1]) {
        pattern = ctx.createPattern(imgs[1], 'repeat');
        var count = needTexture
          ? (opts.count != null ? opts.count
            : Math.min(100, Math.max(36, Math.round(sz.W * sz.H / 40000))))
          : 0;                                    // 圆点模式：只借它画雾层
        snow = new HiresSnow({
          width: sz.W, height: sz.H,
          overlayAlpha: needFog ? overlayAlpha : 0,
          snowImage: imgs[0],
          overlayImage: imgs[1],
          speedRange: speedRange,
          particleCount: count,
          random: opts.random
        });
        snow.Direction = direction;
        handle.snow = Promise.resolve(snow);
      } else if (needTexture) {
        handle.snow = Promise.resolve(null);      // 纹理缺失：画布保持透明，静默降级
        return;
      }

      if (!needTexture) initDots();
      startLoop();
    });

    return handle;
  }

  return {
    IL: IL,
    TAU: TAU,
    map: map,
    clamp: clamp,
    rangeInt: rangeInt,
    particleReset: particleReset,
    HiresSnow: HiresSnow,
    attach: attach
  };
});