/* ============================================================
   1. 镜子房间同款星点：停留 + 闪烁（铺满屏幕，不下坠）
      素材：Atlases/Gameplay/bgs/02/stars/ 的 a/b/c × 4 帧
   ============================================================ */
(function bgStars() {
  var layer = document.getElementById('starLayer');
  if (!layer) return;

  var DIR = 'Atlases/Gameplay/bgs/02/stars/';
  var TYPES = ['a', 'b', 'c'];
  var FRAMES = 4;
  // 预加载 12 张 PNG + 缓存 background url 字符串
  var cache = {};
  TYPES.forEach(function (t) {
    cache[t] = [];
    for (var i = 0; i < FRAMES; i++) {
      var src = DIR + t + String(i).padStart(2, '0') + '.png';
      cache[t].push('url("' + src + '") center / 100% 100% no-repeat');
      var im = new Image(); im.src = src;
    }
  });

  var STAR_COUNT = 70;            // 铺满屏幕
  var SIZE_MIN = 20, SIZE_MAX = 56;

  function makeStar() {
    var t = TYPES[Math.floor(Math.random() * TYPES.length)];
    var el = document.createElement('i');
    var size = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
    el.style.width = el.style.height = size + 'px';
    el.style.left = (Math.random() * 100).toFixed(2) + '%';
    el.style.top = (Math.random() * 100).toFixed(2) + '%';
    el.style.background = cache[t][Math.floor(Math.random() * FRAMES)];
    // 闪烁节奏：2.5–6.5s，负 delay 让各点处于随机相位（入场即遍布全屏）
    var dur = 2.5 + Math.random() * 4;
    el.style.setProperty('--dur', dur.toFixed(2) + 's');
    el.style.setProperty('--del', (-Math.random() * dur).toFixed(2) + 's');
    // 逐帧切图（和镜子房间同款：160–320ms 循环切 4 帧）
    var frameIdx = Math.floor(Math.random() * FRAMES);
    var interval = setInterval(function () {
      if (!el.parentNode) { clearInterval(interval); return; }
      frameIdx = (frameIdx + 1) % FRAMES;
      el.style.background = cache[t][frameIdx];
    }, 160 + Math.random() * 160);
    layer.appendChild(el);
  }

  for (var i = 0; i < STAR_COUNT; i++) makeStar();
})();

/* ============================================================
   1b. 视频背景：fetch→blob URL 绕过 Python SimpleHTTP 不支持 Range
      初始静止显示首帧，点击电话后才播放（无 loop，停在最终帧）
   ============================================================ */
(function videoBg() {
  var v = document.getElementById('skyVideo');
  if (!v) return;
  var SRC = 'Atlases/Gameplay/scenery/payphone_bg.mp4';

  // fetch 整段视频成 blob 再交给 video（Python SimpleHTTP 不发 206，直连会 ABORTED）
  fetch(SRC).then(function (r) { return r.blob(); }).then(function (blob) {
    v.src = URL.createObjectURL(blob);  // 设 src 自动 load，静止显示首帧
  }).catch(function () {
    v.src = SRC;  // 回退：直连（正式服务器支持 Range 时能用）
  });
})();

/* ============================================================
   2. payphone 点击：背景视频播放一次并停在最终帧；
      按钮图层沉到视频下面（动画在背景发生）
      —— 仅 played 一个交互状态，交 Vue；视频控制仍为原生 API
   ============================================================ */
Vue.createApp({
  setup() {
    const started = Vue.ref(false);
    function start() {
      if (started.value) return;
      started.value = true;          // 图层下沉到视频之下
      const v = document.getElementById('skyVideo');
      v.muted = false;               // 用户点击手势内解除静音，听 Madeline 唱歌
      const p = v.play();            // 无 loop：播完自动停在最终帧
      if (p && p.catch) p.catch(function () {});
    }
    return { started, start };
  }
}).mount('#payphoneHotspot');
