/* ============================================================
   1. neon 15 帧逐帧动画（contain 完整显示，不裁切）
   ============================================================ */
(function () {
  var canvas = document.querySelector('#neonSign canvas');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var FRAME_COUNT = 15;
  var basePath = 'Atlases/Gameplay/objects/wavedashtutorial/';
  var frames = [];
  var loaded = 0;

  for (var i = 0; i < FRAME_COUNT; i++) {
    var img = new Image();
    img.onload = function () { loaded++; if (loaded === FRAME_COUNT) startAnim(); };
    img.src = basePath + 'neon_' + String(i).padStart(2, '0') + '.png';
    frames.push(img);
  }

  function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.imageSmoothingEnabled = false;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  var frameIdx = 0, lastTime = 0, rafId;
  var FPS = 12;
  var interval = 1000 / FPS;

  function draw(t) {
    rafId = requestAnimationFrame(draw);
    if (t - lastTime < interval) return;
    lastTime = t;

    var img = frames[frameIdx];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // contain：完整显示整帧（素材透明底，留白无影响）
      var w = img.naturalWidth, h = img.naturalHeight;
      var cw = canvas.width, ch = canvas.height;
      var scale = Math.min(cw / w, ch / h);
      var dw = w * scale, dh = h * scale;
      var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      ctx.drawImage(img, dx | 0, dy | 0, dw | 0, dh | 0);
    }
    frameIdx = (frameIdx + 1) % FRAME_COUNT;
  }
  function startAnim() { rafId = requestAnimationFrame(draw); }
})();

/* ============================================================
   2. 漂浮粒子：全屏 + 天空加密度（小星点缓慢漂浮 + 闪烁）
   ============================================================ */
(function () {
  var canvas = document.getElementById('sparkleCanvas');
  var ctx = canvas.getContext('2d');
  var W, H;
  function resize() { W = canvas.width = canvas.clientWidth; H = canvas.height = canvas.clientHeight; }
  resize();
  window.addEventListener('resize', resize);

  // 粒子全屏覆盖：5 成全屏均匀、约 3 成集中在天空（页面上半部）、2 成落穹顶建筑核心
  // 百分比坐标
  var FULL = { x: 0, y: 0, w: 1, h: 1 };
  var SKY = { x: 0, y: 0, w: 1, h: 0.55 };
  var CORE = { x: 0.33, y: 0.26, w: 0.36, h: 0.40 };
  function pickZone() {
    var r = Math.random();
    return (r < 0.5) ? FULL : (r < 0.78 ? SKY : CORE);
  }

  var COLORS = ['#ffffff', '#7affe0', '#ff7ad9', '#b98cff', '#8fd4ff', '#fff3a3'];
  var parts = [];

  // ① 闪烁星点：数量翻倍，大量 1px 小星点营造密度
  var STAR_COUNT = 140;
  for (var i = 0; i < STAR_COUNT; i++) {
    var z = pickZone();
    var big = Math.random() < .12;                 // 少数大星芒
    parts.push({
      type: 'star',
      bx: z.x + Math.random() * z.w,
      by: z.y + Math.random() * z.h,
      ampX: (Math.random() * 1.2 + .4) / 100,      // 漂浮幅度（百分比）
      ampY: (Math.random() * 1.0 + .3) / 100,
      spd: Math.random() * .0006 + .0003,          // 漂浮速度
      phase: Math.random() * Math.PI * 2,
      size: big ? 3 : (Math.random() < .45 ? 1 : 2),
      color: COLORS[Math.random() * COLORS.length | 0],
      tw: Math.random() * .004 + .0008,            // 闪烁速度（拉开差异避免齐闪）
      twPhase: Math.random() * Math.PI * 2,
      baseA: .22 + Math.random() * .28
    });
  }

  // ② 漂浮尘埃：缓慢单向漂移 + 左右轻摆，出界回绕，让画面一直有流动感
  var MOTE_COUNT = 28;
  for (var m = 0; m < MOTE_COUNT; m++) {
    parts.push({
      type: 'mote',
      bx: Math.random(),
      by: Math.random(),
      vx: (Math.random() * .000011 + .000005) * (Math.random() < .5 ? -1 : 1), // 百分比/ms
      vy: -(Math.random() * .000008 + .000004),    // 整体缓慢上升（飘尘）
      amp: (Math.random() * .8 + .3) / 100,        // 左右轻摆幅度
      sway: Math.random() * .001 + .0005,
      phase: Math.random() * Math.PI * 2,
      size: Math.random() < .3 ? 3 : 2,
      color: COLORS[Math.random() * COLORS.length | 0],
      tw: Math.random() * .002 + .0008,
      twPhase: Math.random() * Math.PI * 2
    });
  }

  var last = 0;
  function frame(t) {
    var dt = Math.min(t - last, 50) || 16;         // 限幅防止切后台回跳
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var x, y, s;
      if (p.type === 'mote') {
        p.bx += p.vx * dt; p.by += p.vy * dt;
        if (p.bx < -.02) p.bx = 1.02; else if (p.bx > 1.02) p.bx = -.02;
        if (p.by < -.02) p.by = 1.02; else if (p.by > 1.02) p.by = -.02;
        x = (p.bx + Math.sin(t * p.sway + p.phase) * p.amp) * W;
        y = p.by * H;
        ctx.globalAlpha = .22 + .22 * (0.5 + 0.5 * Math.sin(t * p.tw + p.twPhase));
        ctx.fillStyle = p.color;
        ctx.fillRect(x | 0, y | 0, p.size, p.size);
      } else {
        x = (p.bx + Math.sin(t * p.spd + p.phase) * p.ampX) * W;
        y = (p.by + Math.cos(t * p.spd * .8 + p.phase) * p.ampY) * H;
        var a = p.baseA + (.92 - p.baseA) * (0.5 + 0.5 * Math.sin(t * p.tw + p.twPhase));
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        s = p.size;
        // 小十字星芒（像素风：中心方块 + 横竖各延 1px）；1px 只画单点
        ctx.fillRect(x | 0, y | 0, s, s);
        if (s > 1) {
          ctx.fillRect((x - 1) | 0, y | 0, 1, s);
          ctx.fillRect((x + s) | 0, y | 0, 1, s);
          ctx.fillRect(x | 0, (y - 1) | 0, s, 1);
          ctx.fillRect(x | 0, (y + s) | 0, s, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* 交互流已迁移至上方 Vue app（entered 状态驱动 class/点击，stage 缩放在方法内） */
