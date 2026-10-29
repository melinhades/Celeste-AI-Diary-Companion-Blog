/* ============================================================================
   Internet Cafe · 星空背景（stylegrounds）
   逐行复刻 Celeste.MapData::ParseBackdrop 与 Starfield / Planets / Parallax 的渲染，
   数据取自 LostLevels.bin 的 /Map/Style 中 tag="bright" 的那一组
   （lvl_f-door / f-00 / f-01 / f-02 与 e-* 共用同一套星空）。
   ========================================================================== */
(function () {
  'use strict';

  function create(opt) {
    var ctx = opt.ctx;          // 2D 上下文
    var getTex = opt.getTex;    // (key, color, flipX, flipY) -> Canvas | Image
    var getSize = opt.getSize;  // () -> { W, H }

    var mod = function (x, m) { return ((x % m) + m) % m; };
    var cubeIn = function (t) { return t * t * t; };                 // Ease.CubeIn

    // 固定种子随机：构图不随刷新/resize 跳变
    function makeRng(seed) {
      var s = seed;
      return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }
    // XNA Color.Lerp(c, Transparent, t)：通道与 alpha 一起向 0 插值
    function shadeHex(hex, f) {
      var n = parseInt(hex.slice(1), 16);
      var r = Math.round(((n >> 16) & 255) * (1 - f));
      var g = Math.round(((n >> 8) & 255) * (1 - f));
      var b = Math.round((n & 255) * (1 - f));
      return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    }

    // Starfield.cs：15 个 Y 节点连成横向星带（StepSize 32），128 颗星沿带流动、沿法线呼吸摆动
    function Starfield(speed, scrollX, scrollY, color, seed) {
      this.speed = speed;
      this.scrollX = scrollX; this.scrollY = scrollY;
      this.color = color;
      var rnd = makeRng(seed);
      var nodes = [], y = rnd() * 180, i;
      for (i = 0; i < 15; i++) {
        nodes.push(y);
        y += (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 24);
      }
      // 末 4 节点向首节点插值闭合，形成首尾相接的环
      for (i = 0; i < 4; i++) {
        var idx = nodes.length - 1 - i;
        nodes[idx] += (nodes[0] - nodes[idx]) * (1 - i / 4);
      }
      this.nodes = nodes;
      this.stars = [];
      for (i = 0; i < 128; i++) {
        var r = rnd();
        var shade = Math.round(r * 2) / 4 * 0.5;   // 与原作一样量化成 5 档亮度贴图
        var star = {
          nodeIndex: Math.floor(rnd() * (nodes.length - 1)),
          nodePercent: rnd(),
          distance: 4 + r * 20,
          sine: rnd() * Math.PI * 2,
          shade: shade,
          alpha: 1 - shade,
          tex: Math.max(0, Math.min(3, Math.floor(cubeIn(1 - r) * 4))),
          x: 0, y: 0
        };
        var p = this.targetOf(star);
        star.x = p.x; star.y = p.y;
        this.stars.push(star);
      }
    }
    Starfield.prototype.targetOf = function (s) {
      var x1 = s.nodeIndex * 32, y1 = this.nodes[s.nodeIndex];
      var x2 = (s.nodeIndex + 1) * 32, y2 = this.nodes[s.nodeIndex + 1];
      var px = x1 + (x2 - x1) * s.nodePercent;
      var py = y1 + (y2 - y1) * s.nodePercent;
      var dx = x2 - x1, dy = y2 - y1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var d = s.distance * Math.sin(s.sine);
      return { x: px + (-dy / len) * d, y: py + (dx / len) * d };
    };
    Starfield.prototype.update = function (dt) {
      var k = dt * 60;                            // 原作逐帧 /50，按 60fps 归一
      for (var i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        s.sine += dt * this.speed;
        s.nodePercent += dt * 0.25 * this.speed;
        if (s.nodePercent >= 1) {
          s.nodePercent -= 1;
          s.nodeIndex++;
          if (s.nodeIndex >= this.nodes.length - 1) { s.nodeIndex = 0; s.x -= 448; }
        }
        var t = this.targetOf(s);
        s.x += (t.x - s.x) / 50 * k;
        s.y += (t.y - s.y) / 50 * k;
      }
    };
    Starfield.prototype.render = function (camX, camY) {
      var sz = getSize(), sx = sz.W / 320, sy = sz.H / 180;
      for (var i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        var img = getTex('sf' + s.tex, shadeHex(this.color, s.shade), false, false);
        if (!img) continue;
        var lx = -64 + mod(s.x - camX * this.scrollX, 448);
        var ly = -16 + mod(s.y - camY * this.scrollY, 212);
        var w = img.width * sx, h = img.height * sy;
        ctx.globalAlpha = s.alpha;
        ctx.drawImage(img, Math.round(lx * sx - w / 2), Math.round(ly * sy - h / 2), w, h);
      }
      ctx.globalAlpha = 1;
    };

    // Planets.cs：Position = (NextFloat(640), NextFloat(360))，居中绘制并 wrap
    function Planets(count, size, scroll, color, seed) {
      this.count = count; this.size = size; this.scroll = scroll; this.color = color;
      var texCount = size === 'big' ? 3 : 7;
      var rnd = makeRng(seed);
      this.planets = [];
      for (var i = 0; i < count; i++) {
        this.planets.push({
          tex: 'bgs/10/' + size + String(Math.floor(rnd() * texCount)).padStart(2, '0'),
          x: rnd() * 640, y: rnd() * 360
        });
      }
    }
    Planets.prototype.render = function (camX, camY) {
      var sz = getSize(), sx = sz.W / 320, sy = sz.H / 180;
      for (var i = 0; i < this.planets.length; i++) {
        var p = this.planets[i];
        var img = getTex(p.tex, this.color, false, false);
        if (!img) continue;
        var lx = -32 + mod(p.x - camX * this.scroll, 640);
        var ly = -32 + mod(p.y - camY * this.scroll, 360);
        var w = img.width * sx, h = img.height * sy;
        ctx.drawImage(img, Math.round(lx * sx - w / 2), Math.round(ly * sy - h / 2), w, h);
      }
    };

    // Parallax.cs：Position += Speed*dt，绘制于 Floor(Position - Camera*Scroll)，Loop 时平铺
    function Parallax(tex, scroll, speed, color, alpha, loop, flip, additive) {
      this.tex = tex; this.scroll = scroll; this.speed = speed; this.color = color;
      this.alpha = alpha; this.loop = loop; this.flip = !!flip; this.additive = !!additive;
      this.pos = { x: 0, y: 0 };
    }
    Parallax.prototype.update = function (dt) {
      this.pos.x += this.speed.x * dt;
      this.pos.y += this.speed.y * dt;
    };
    Parallax.prototype.render = function (camX, camY) {
      var img = getTex(this.tex, this.color, this.flip, false);
      if (!img) return;
      var sz = getSize(), sx = sz.W / 320, sy = sz.H / 180;
      var tw = img.width, th = img.height;
      var px = Math.round(this.pos.x - camX * this.scroll);
      var py = Math.round(this.pos.y - camY * this.scroll);
      ctx.globalCompositeOperation = this.additive ? 'lighter' : 'source-over';
      ctx.globalAlpha = this.alpha;
      if (this.loop) {
        var ox = mod(px, tw) - tw, oy = mod(py, th) - th;
        for (var y = oy; y < 180; y += th) {
          for (var x = ox; x < 320; x += tw) {
            ctx.drawImage(img, x * sx, y * sy, tw * sx, th * sy);
          }
        }
      } else {
        ctx.drawImage(img, px * sx, py * sy, tw * sx, th * sy);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    // —— bright 组的 11 层背景 + 1 层前景（顺序/参数与地图原样一致）——
    var layers = [
      new Parallax('sky', 0, { x: 0, y: 0 }, null, 1, false, false, false),
      new Planets(32, 'small', 0.1, '#3b66a8', 1101),
      new Parallax('mist', 0.15, { x: 2, y: 0 }, '#b03b94', 1, true, false, false),
      new Parallax('mist', 0.2, { x: 4, y: 0 }, '#4ab7be', 1, true, true, false),
      new Starfield(2.5, 0.3, 0.3, '#71d5ff', 2201),
      new Starfield(2.75, 0.5, 0.5, '#46fffd', 2202),
      new Planets(24, 'small', 0.4, '#ffffff', 1102),
      new Starfield(3.0, 0.3, 0.3, '#f8ffb0', 2203),
      new Starfield(3.0, 0.5, 0.5, '#cefdff', 2204),
      new Planets(4, 'big', 0.7, '#ffffff', 1103),
      new Parallax('mist', 0.6, { x: 16, y: 8 }, '#000000', 0.5, true, false, false)
    ];
    // 前景：purplesunset 叠加（blendmode=additive，alpha .25），盖在关卡之上
    var fgLayers = [
      new Parallax('sun', 0.5, { x: 4, y: 4 }, '#ffffff', 0.25, true, false, true)
    ];

    return {
      update: function (dt) {
        for (var i = 0; i < layers.length; i++) if (layers[i].update) layers[i].update(dt);
        for (var j = 0; j < fgLayers.length; j++) if (fgLayers[j].update) fgLayers[j].update(dt);
      },
      render: function (camX, camY) {
        for (var i = 0; i < layers.length; i++) layers[i].render(camX, camY);
      },
      renderFg: function (camX, camY) {
        for (var i = 0; i < fgLayers.length; i++) fgLayers[i].render(camX, camY);
      }
    };
  }

  window.CafeSky = { create: create };
})();
