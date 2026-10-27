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
  function particleReset(p, direction, engineW, engineH, rng) {
    // float num = Calc.Random.NextFloat();
    var n = rng();
    // num *= num * num * num;   （IL 11-18：4 次 ldloc + 3 次 mul → n^4）
    n = n * n * n * n;

    // Scale = Calc.Map(num, 0f, 1f, 0.05f, 0.8f);
    p.Scale = map(n, IL.SCALE_MAP.inMin, IL.SCALE_MAP.inMax,
      IL.SCALE_MAP.outMin, IL.SCALE_MAP.outMax);

    // Speed = Scale * (float)Calc.Range(2500, 5000);
    p.Speed = p.Scale * rangeInt(rng, IL.SPEED_RANGE.min, IL.SPEED_RANGE.max);

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
   * @param {function} [opts.random]     随机源（默认 Math.random），便于断言复现
   */
  function HiresSnow(opts) {
    if (!opts || !opts.snowImage || !opts.overlayImage) {
      throw new Error('HiresSnow: 需要 snowImage 与 overlayImage');
    }
    this.width = opts.width;
    this.height = opts.height;
    this.random = opts.random || Math.random;

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
    this.particles = [];
    for (var i = 0; i < IL.PARTICLE_COUNT; i++) this.particles.push(makeParticle());
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
      particleReset(p, this.Direction, this.width, this.height, this.random);
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
        particleReset(p, this.Direction, W, H, this.random);
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
    ctx.globalAlpha = this.Alpha * this.overlayAlpha;
    if (overlayPattern) {
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

  return {
    IL: IL,
    TAU: TAU,
    map: map,
    clamp: clamp,
    rangeInt: rangeInt,
    particleReset: particleReset,
    HiresSnow: HiresSnow
  };
});