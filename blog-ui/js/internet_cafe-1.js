/* ============================================================
   0. Vue 仅接管交互状态（entered）：world/camera/interior 的 class
      与两个热区点击；逐帧动画、粒子、stage 缩放仍全为 vanilla
   ============================================================ */
(function () {
  const { createApp, ref, onMounted, onUnmounted } = Vue;
  createApp({
    setup() {
      const entered = ref(false);
      let zooming = false;
      let animOn = false, noiseIv = null, noiseTimer = null;
      let canvas = null, ctx = null, frames = [];
      let fIdx = 0;
      /* ---- 电视屏在 building_back.png（120x79）内的比例坐标 ---- */
      const TV = { x: .367, y: .506, w: .259, h: .216 };
      let tvOrigin = '49.6% 61.4%';

      function positionNoise() {
        var stage = document.getElementById('interiorStage');
        var interiorImg = document.getElementById('interiorImg');
        var noiseBox = document.getElementById('noiseBox');
        var iw = interiorImg.naturalWidth || 120;
        var ih = interiorImg.naturalHeight || 79;
        var cw = stage.clientWidth || window.innerWidth;
        var ch = stage.clientHeight || window.innerHeight;
        var s = Math.max(cw / iw, ch / ih);
        var dw = iw * s, dh = ih * s;
        var ox = (cw - dw) / 2, oy = (ch - dh) / 2;
        noiseBox.style.left = (ox + TV.x * dw) + 'px';
        noiseBox.style.top = (oy + TV.y * dh) + 'px';
        noiseBox.style.width = (TV.w * dw) + 'px';
        noiseBox.style.height = (TV.h * dh) + 'px';
        // 电视中心相对 stage 的比例（点电视放大时作 transform-origin）
        var cxr = (ox + (TV.x + TV.w / 2) * dw) / cw * 100;
        var cyr = (oy + (TV.y + TV.h / 2) * dh) / ch * 100;
        tvOrigin = cxr.toFixed(2) + '% ' + cyr.toFixed(2) + '%';
      }

      function resizeNoise() {
        canvas.width = Math.max(1, canvas.clientWidth);
        canvas.height = Math.max(1, canvas.clientHeight);
        ctx.imageSmoothingEnabled = false;
      }
      function onResize() { if (animOn) resizeNoise(); }

      function noiseTick() {
        if (!animOn) return;
        var img = frames[fIdx];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // cover：铺满电视屏
          var w = img.naturalWidth, h = img.naturalHeight;
          var cw = canvas.width, ch = canvas.height;
          var s = Math.max(cw / w, ch / h);
          var dw = w * s, dh = h * s;
          ctx.drawImage(img, (cw - dw) / 2 | 0, (ch - dh) / 2 | 0, dw | 0, dh | 0);
        }
        fIdx = (fIdx + 1) % 3;
      }

      /* ---- ① 点建筑物：表层透明化 + 环境压暗 30% + 镜头向近靠 ---- */
      function enter() {
        if (entered.value) return;
        entered.value = true;
        document.getElementById('dimLayer').classList.add('show');

        positionNoise();
        // 等表层透明化后启动 noise
        noiseTimer = setTimeout(function () {
          resizeNoise();
          animOn = true;
          noiseTick();
          if (!noiseIv) noiseIv = setInterval(noiseTick, 140);   // 约 7fps，只建一次
        }, 1100);
      }

      /* ---- ③ 点电视：镜头不断缩进至 noise 占满全屏 → 保持 30% 压暗直接跳转 ---- */
      function enterTv() {
        if (zooming) return;
        zooming = true;
        var noiseBox = document.getElementById('noiseBox');
        var stage = document.getElementById('interiorStage');
        positionNoise();
        var nr = noiseBox.getBoundingClientRect();
        stage.style.transformOrigin = tvOrigin;   // 精确对准电视屏中心
        var s = Math.max(window.innerWidth / nr.width, window.innerHeight / nr.height) * 1.06;
        stage.style.transform = 'scale(' + s.toFixed(3) + ')';
        // 四周保持 30% 压暗，不黑屏；noise 铺满后直接进入 berryos
        setTimeout(function () { location.href = 'berryos.html'; }, 880);
      }

      /* ---- Esc：从内部退回外观（全部过渡反向播放）；点电视放大后禁用 ---- */
      function onKey(e) {
        if (e.key !== 'Escape') return;
        if (zooming || !entered.value) return;
        document.getElementById('dimLayer').classList.remove('show');
        animOn = false;
        entered.value = false;
      }

      onMounted(function () {
        var interiorImg = document.getElementById('interiorImg');
        interiorImg.addEventListener('load', positionNoise);
        window.addEventListener('load', positionNoise);
        window.addEventListener('resize', positionNoise);
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKey);

        canvas = document.querySelector('#noiseBox canvas');
        ctx = canvas.getContext('2d');
        for (var i = 0; i < 3; i++) {
          var nimg = new Image();
          nimg.src = 'Atlases/Gameplay/objects/wavedashtutorial/noise0' + i + '.png';
          frames.push(nimg);
        }
      });

      onUnmounted(function () {
        window.removeEventListener('resize', positionNoise);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKey);
        if (noiseIv) clearInterval(noiseIv);
        if (noiseTimer) clearTimeout(noiseTimer);
      });

      return { entered, enter, enterTv };
    }
  }).mount('#world');
})();
