// ===== 左下角 neon 按钮帧动画（15帧, 12FPS，复用网咖招牌素材） =====
// 素材周围有大量透明边距，需先计算所有帧内容 bbox 的并集，再裁剪填满 canvas
(function () {
  var canvas = document.getElementById('neonBtnCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var FRAME_COUNT = 15;
  var basePath = 'Atlases/Gameplay/objects/wavedashtutorial/';
  var frames = [];
  var loaded = 0;
  var contentBBox = null;   // 所有帧内容并集 bbox

  for (var i = 0; i < FRAME_COUNT; i++) {
    var img = new Image();
    img.onload = function () { loaded++; if (loaded === FRAME_COUNT) { computeBBox(); startAnim(); } };
    img.src = basePath + 'neon_' + String(i).padStart(2, '0') + '.png';
    frames.push(img);
  }

  // 计算单张图的非透明内容 bbox
  function frameBBox(img) {
    var off = document.createElement('canvas');
    off.width = img.naturalWidth; off.height = img.naturalHeight;
    var octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);
    var data = octx.getImageData(0, 0, off.width, off.height).data;
    var minX = off.width, minY = off.height, maxX = 0, maxY = 0, found = false;
    for (var y = 0; y < off.height; y++) {
      for (var x = 0; x < off.width; x++) {
        if (data[(y * off.width + x) * 4 + 3] > 0) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    return found ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
  }

  // 计算所有帧 bbox 并集
  function computeBBox() {
    var u = null;
    frames.forEach(function (img) {
      var b = frameBBox(img);
      if (!b) return;
      if (!u) { u = { x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h }; }
      else {
        u.x = Math.min(u.x, b.x);
        u.y = Math.min(u.y, b.y);
        u.r = Math.max(u.r, b.x + b.w);
        u.b = Math.max(u.b, b.y + b.h);
      }
    });
    if (u) contentBBox = { x: u.x, y: u.y, w: u.r - u.x, h: u.b - u.y };
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
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
    if (img && img.complete && img.naturalWidth > 0 && contentBBox) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var cw = canvas.width, ch = canvas.height;
      // 用内容 bbox 裁剪，contain 填满 canvas
      var scale = Math.min(cw / contentBBox.w, ch / contentBBox.h);
      var dw = contentBBox.w * scale, dh = contentBBox.h * scale;
      var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      ctx.drawImage(img, contentBBox.x, contentBBox.y, contentBBox.w, contentBBox.h,
                    dx | 0, dy | 0, dw | 0, dh | 0);
    }
    frameIdx = (frameIdx + 1) % FRAME_COUNT;
  }
  function startAnim() { rafId = requestAnimationFrame(draw); }
})();
