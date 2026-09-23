/* ===== 草莓籽收集系统（全局） =====
   - 每 6 小时刷新 3-5 颗草莓籽到页面随机位置
   - 鼠标点击后跟随鼠标走，表示收集到了
   - 收集完全部刷新的草莓籽后，旋转 + 音效组合成一颗草莓
   - 状态持久化 localStorage，跨页面一致
   - 自包含：不依赖 api.js/auth.js，无 api 时降级（无 berry 入账） */
(function () {
  'use strict';

  var BASE = 'seed/';
  var IMG_URL = BASE + 'seed00.png';
  var SOUND_DIR = BASE + 'sound/';
  var TOUCH_SOUNDS = [
    'seed_touch_01.wav', 'seed_touch_02.wav', 'seed_touch_03.wav',
    'seed_touch_04.wav', 'seed_touch_05.wav'
  ];
  var COMPLETE_MAIN = SOUND_DIR + 'seed_complete_main.wav';
  var COMPLETE_BERRY = SOUND_DIR + 'seed_complete_berry.wav';
  var REFRESH_INTERVAL = 6 * 60 * 60 * 1000;  // 6 小时
  var STORAGE_KEY = 'seedState_v1';

  // ===== 状态持久化 =====
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && typeof s === 'object' && Array.isArray(s.seeds)) return s;
    } catch (e) {}
    return { lastRefresh: 0, seeds: [] };
  }
  function saveState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  // 是否该刷新：无记录/超过 6 小时/全部收集完且超过 6 小时
  function shouldRefresh(s) {
    if (!s.lastRefresh) return true;
    if (!s.seeds.length) return Date.now() - s.lastRefresh >= REFRESH_INTERVAL;
    if (s.seeds.some(function (x) { return !x.collected; })) return false;
    return Date.now() - s.lastRefresh >= REFRESH_INTERVAL;
  }

  // 生成 3-5 个随机位置（百分比，跨分辨率自适应）
  function genSeeds() {
    var n = 3 + Math.floor(Math.random() * 3);  // 3,4,5
    var arr = [];
    for (var i = 0; i < n; i++) {
      arr.push({
        id: 'sd_' + Date.now().toString(36) + '_' + i,
        x: 4 + Math.random() * 90,    // 4%-94%
        y: 12 + Math.random() * 80,  // 12%-92%（避开顶部 header）
        collected: false
      });
    }
    return arr;
  }

  // ===== CSS 注入（一次） =====
  function injectStyle() {
    if (document.getElementById('seedStyle')) return;
    var css =
      '#seedLayer{position:fixed;inset:0;pointer-events:none;z-index:99998;}' +
      '.seed-item{position:absolute;pointer-events:auto;cursor:pointer;' +
        'width:52px;height:52px;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));' +
        'transform:translate(-50%,-50%);will-change:transform,left,top;animation:seedBob 2.6s ease-in-out infinite;}' +
      '.seed-item.follow{pointer-events:none;animation:none;transition:none;z-index:99998;}' +
      '.seed-final{position:fixed;pointer-events:none;z-index:99999;' +
        'width:104px;height:104px;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'transform:translate(-50%,-50%);opacity:0;' +
        'filter:drop-shadow(0 0 16px rgba(255,220,140,.9)) drop-shadow(0 0 36px rgba(255,160,90,.6));}' +
      '@keyframes seedBob{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-4px)}}' +
      '@keyframes seedFlyIn{0%{opacity:0;transform:translate(-50%,-50%) rotate(0) scale(.3)}60%{opacity:1;transform:translate(-50%,-50%) rotate(360deg) scale(1.6)}100%{opacity:1;transform:translate(-50%,-50%) rotate(720deg) scale(1.4)}}';
    var st = document.createElement('style');
    st.id = 'seedStyle';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ===== 音频播放（与 badeline-voice.js 同款解锁机制） =====
  function playSound(src, vol) {
    if (!window.__audioGestured) return;
    try {
      var a = new Audio(src);
      a.volume = vol == null ? 0.7 : vol;
      a.play().catch(function () {});
    } catch (e) {}
  }

  // 首次交互解锁音频
  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { window.__audioGestured = true; }, { once: true });
  });

  // ===== 渲染 =====
  var layerEl = null;
  var itemEls = {};     // id -> {el, seed, follow, followDelay, cur}
  var mouse = { x: -100, y: -100 };
  var combining = false;

  function ensureLayer() {
    if (layerEl && document.body.contains(layerEl)) return layerEl;
    layerEl = document.createElement('div');
    layerEl.id = 'seedLayer';
    document.body.appendChild(layerEl);
    return layerEl;
  }

  function render() {
    var s = loadState();
    if (!s.seeds.length) return;
    var pending = s.seeds.filter(function (x) { return !x.collected; });
    if (!pending.length) return;
    var layer = ensureLayer();
    pending.forEach(function (seed) {
      if (itemEls[seed.id]) return;
      var el = document.createElement('img');
      el.src = IMG_URL;
      el.className = 'seed-item';
      el.dataset.id = seed.id;
      el.style.left = seed.x + 'vw';
      el.style.top = seed.y + 'vh';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        collect(seed);
      });
      layer.appendChild(el);
      itemEls[seed.id] = { el: el, seed: seed, follow: false, followDelay: 0, cur: null };
    });
  }

  // ===== 收集 =====
  function collect(seed) {
    if (seed.collected || combining) return;
    var state = loadState();
    var target = null;
    state.seeds.forEach(function (x) { if (x.id === seed.id) target = x; });
    if (!target || target.collected) return;

    target.collected = true;
    saveState(state);

    // 收集计数（含本次，1..n）
    var collectedCount = state.seeds.filter(function (x) { return x.collected; }).length;
    var soundIdx = (collectedCount - 1) % 5;  // 1→01, 2→02, … 5→05, 6→01
    playSound(SOUND_DIR + TOUCH_SOUNDS[soundIdx]);

    // 该籽跟随鼠标
    var entry = itemEls[seed.id];
    if (entry) {
      entry.el.classList.add('follow');
      entry.follow = true;
      entry.followDelay = collectedCount - 1;  // 第几个跟随，决定尾迹偏移
      entry.cur = { x: mouse.x, y: mouse.y };
    }

    // 全部收集完 → 组合
    if (state.seeds.every(function (x) { return x.collected; })) {
      combine();
    }
  }

  // ===== 跟随鼠标轨迹（鞭子般尾迹：第 i 颗取轨迹历史第 i*STEP 帧位置） =====
  var trail = [];          // 鼠标轨迹历史，最新位置在 index 0
  var TRAIL_MAX = 80;      // 最多 80 帧（约 1.3s）
  var TRAIL_STEP = 6;      // 每颗籽延迟 6 帧（约 100ms）

  function followLoop() {
    // 记录当前鼠标位置到轨迹头部
    trail.unshift({ x: mouse.x, y: mouse.y });
    if (trail.length > TRAIL_MAX) trail.pop();

    Object.keys(itemEls).forEach(function (id) {
      var entry = itemEls[id];
      if (!entry || !entry.follow) return;
      var idx = entry.followDelay || 0;
      var i = Math.min(idx * TRAIL_STEP, trail.length - 1);
      var pos = trail[i] || { x: mouse.x, y: mouse.y };
      // 轻微 lerp 让动作柔和，避免帧跳跃感
      var cur = entry.cur || { x: pos.x, y: pos.y };
      cur.x += (pos.x - cur.x) * 0.55;
      cur.y += (pos.y - cur.y) * 0.55;
      entry.cur = cur;
      entry.el.style.left = cur.x + 'px';
      entry.el.style.top = cur.y + 'px';
    });
    requestAnimationFrame(followLoop);
  }

  document.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });

  // ===== 组合成草莓 =====
  function combine() {
    combining = true;
    playSound(COMPLETE_MAIN, 0.85);

    // 600ms 后让所有跟随的籽飞向屏幕中央 + 旋转
    setTimeout(function () {
      var cx = window.innerWidth / 2;
      var cy = window.innerHeight / 2;
      Object.keys(itemEls).forEach(function (id) {
        var entry = itemEls[id];
        if (!entry || !entry.follow) return;
        entry.follow = false;
        var el = entry.el;
        el.style.transition =
          'left .55s cubic-bezier(.55,-.25,.45,1.25),' +
          'top .55s cubic-bezier(.55,-.25,.45,1.25),' +
          'transform .55s ease,opacity .55s ease';
        el.style.left = cx + 'px';
        el.style.top = cy + 'px';
        el.style.transform = 'translate(-50%,-50%) rotate(720deg) scale(.2)';
        el.style.opacity = '0';
      });

      // 中央显示"草莓"（用 seed00.png 放大 + 旋转 + 发光）
      setTimeout(function () {
        playSound(COMPLETE_BERRY, 0.95);
        var berry = document.createElement('img');
        berry.src = IMG_URL;
        berry.className = 'seed-final';
        berry.style.left = cx + 'px';
        berry.style.top = cy + 'px';
        berry.style.animation = 'seedFlyIn .85s ease-out forwards';
        document.body.appendChild(berry);

        // 入账 berry 余额（仅当 api.js 已加载）
        if (typeof window.addBerries === 'function') {
          try { window.addBerries(1); } catch (e) {}
        }

        // 1.4s 后草莓淡出
        setTimeout(function () {
          berry.style.transition = 'opacity .6s ease,transform .6s ease';
          berry.style.opacity = '0';
          berry.style.transform = 'translate(-50%,-50%) scale(2.4) rotate(180deg)';
          setTimeout(function () { if (berry.parentNode) berry.remove(); }, 700);
        }, 1400);

        // 清除跟随的籽 DOM
        Object.keys(itemEls).forEach(function (id) {
          var entry = itemEls[id];
          if (entry && entry.el && entry.el.parentNode) {
            setTimeout(function () { if (entry.el.parentNode) entry.el.remove(); }, 800);
          }
          delete itemEls[id];
        });

        // 重置 state：等下一个 6 小时周期
        var fresh = { lastRefresh: Date.now(), seeds: [] };
        saveState(fresh);
        combining = false;
      }, 580);
    }, 580);
  }

  // ===== 启动 =====
  function init() {
    injectStyle();
    var s = loadState();
    if (shouldRefresh(s)) {
      s = { lastRefresh: Date.now(), seeds: genSeeds() };
      saveState(s);
    }
    render();
    requestAnimationFrame(followLoop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
