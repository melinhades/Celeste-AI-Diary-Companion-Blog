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
  // 成形后的草莓：日记里的草莓（celeste-collectables 62 帧闪光动画 + 静图兜底）
  var BERRY_PNG = 'celeste-collectables/strawberry.png';
  var BERRY_FRAME_PREFIX = 'celeste-collectables/strawberry/normal';
  var BERRY_FRAME_COUNT = 62;
  var BERRY_FRAME_MS = 1000 / 24;   // 24fps 播放成形闪光
  var REFRESH_INTERVAL = 6 * 60 * 60 * 1000;  // 6 小时
  var STORAGE_KEY = 'seedState_v1';

  // ===== 状态持久化 =====
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && typeof s === 'object' && Array.isArray(s.seeds)) return s;
    } catch (e) {}
    return { lastRefresh: 0, seeds: [], credited: false };
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
        'transform:translate(-50%,-50%);will-change:transform;animation:seedBob 2.6s ease-in-out infinite;}' +
      '.seed-item.follow,.seed-item.merge{pointer-events:none;animation:none;transition:none;z-index:99998;left:0!important;top:0!important;}' +
      /* 成形草莓：wrapper 负责定位/弹入缩放（transform 合成层），内层 img 负责上下漂浮 */
      '.seed-berry-wrap{position:fixed;left:0;top:0;pointer-events:none;z-index:99999;' +
        'opacity:0;will-change:transform,opacity;transform:translate3d(0,0,0) translate(-50%,-50%) scale(.2);}' +
      '.seed-berry{width:120px;height:120px;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'filter:drop-shadow(0 0 14px rgba(255,220,140,.95)) drop-shadow(0 0 34px rgba(255,120,90,.55));' +
        'animation:seedBerryBob 2.2s ease-in-out infinite;}' +
      '@keyframes seedBob{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-4px)}}' +
      '@keyframes seedBerryBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}';
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
      // 从当前布局位置平滑接管：先拿到真实像素坐标，再切成 left:0/top:0 + 纯 transform 驱动
      var rect = entry.el.getBoundingClientRect();
      entry.el.classList.add('follow');
      entry.el.style.left = '0px';
      entry.el.style.top = '0px';
      entry.follow = true;
      entry.followDelay = collectedCount - 1;  // 第几个跟随，决定尾迹偏移
      entry.cur = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    // 全部收集完 → 组合
    if (state.seeds.every(function (x) { return x.collected; })) {
      combine();
    }
  }

  // ===== 跟随：trail 历史延迟（按距离阈值记录，保证尾巴扯开不重叠） =====
  // 第 1 颗紧跟鼠标，第 i 颗取 trail[i] 位置（按收集顺序）
  // trail 只在鼠标移动 ≥ GAP 距离时才记录新点 → 相邻籽必然有间距，不重叠
  // 鼠标静止时 trail 保留上次形状 → 尾巴不聚拢
  var trail = [];
  var TRAIL_MAX = 60;
  var TRAIL_GAP = 60;       // 相邻 trail 点最小距离（>籽尺寸 52，保证扯开）

  function pushTrail(x, y) {
    var last = trail[0];
    if (last) {
      var dx = x - last.x, dy = y - last.y;
      if (dx * dx + dy * dy < TRAIL_GAP * TRAIL_GAP) return;  // 距离不够，不记录
    }
    trail.unshift({ x: x, y: y });
    if (trail.length > TRAIL_MAX) trail.pop();
  }

  // 帧率无关的 lerp 系数：k 为 60fps 下单帧比例，dt 为实际帧间隔（秒）
  function lerpDt(cur, target, k, dt) {
    var f = 1 - Math.pow(1 - k, dt * 60);
    return cur + (target - cur) * f;
  }

  var lastFrameAt = 0;
  function followLoop(now) {
    var dt = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 1 / 60;
    lastFrameAt = now;
    var head = trail.length ? trail[0] : mouse;
    Object.keys(itemEls).forEach(function (id) {
      var entry = itemEls[id];
      if (!entry || !entry.follow) return;
      var idx = entry.followDelay || 0;
      var cur = entry.cur || { x: mouse.x, y: mouse.y };
      if (idx === 0) {
        // 第 1 颗：瞬时吸附鼠标，永远跟手最流畅
        cur.x = mouse.x;
        cur.y = mouse.y;
      } else {
        // 第 i 颗：lerp 朝 trail[i]（扯开距离），0.82 让跟随既紧又有弹性
        var i = Math.min(idx, trail.length - 1);
        var pos = (i >= 0 && trail[i]) ? trail[i] : head;
        cur.x = lerpDt(cur.x, pos.x, 0.82, dt);
        cur.y = lerpDt(cur.y, pos.y, 0.82, dt);
      }
      entry.cur = cur;
      // 只改 transform（合成层），绝不碰 left/top，避免每帧重排
      entry.el.style.transform =
        'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    });
    requestAnimationFrame(followLoop);
  }

  document.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    pushTrail(mouse.x, mouse.y);
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      pushTrail(mouse.x, mouse.y);
    }
  }, { passive: true });

  // ===== 草莓帧预加载（62 帧闪光成形动画） =====
  var berryFrames = [];
  (function preloadBerry() {
    for (var i = 0; i < BERRY_FRAME_COUNT; i++) {
      var im = new Image();
      im.src = BERRY_FRAME_PREFIX + String(i).padStart(2, '0') + '.png';
      berryFrames.push(im);
    }
  })();

  function easeInCubic(t) { return t * t * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  // 弹入：略微 overshoot，像草莓"啵"地一下成形
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /**
   * 组合成草莓（全程 rAF + transform，无重排）：
   * 1) 每颗籽沿各自螺旋轨道「循环旋转 + 不断靠近」中心，同时自身自转、逐渐缩小
   * 2) 汇聚瞬间真正的日记草莓（62 帧闪光动画）在中心弹出成形 —— 不再复用籽的图片
   * 3) 草莓停留漂浮后放大淡出
   */
  function combine() {
    combining = true;
    playSound(COMPLETE_MAIN, 0.85);

    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;

    // 从当前跟随位置接管，为每颗籽生成独立螺旋参数
    var parts = [];
    Object.keys(itemEls).forEach(function (id) {
      var entry = itemEls[id];
      if (!entry || !entry.follow) return;
      entry.follow = false;
      entry.el.classList.add('merge');
      var pos = entry.cur || { x: cx, y: cy };
      var dx = pos.x - cx, dy = pos.y - cy;
      parts.push({
        el: entry.el,
        x: pos.x, y: pos.y,
        base: Math.atan2(dy, dx),
        r0: Math.max(120, Math.sqrt(dx * dx + dy * dy)),
        dir: Math.random() < 0.5 ? -1 : 1,
        turns: 1.6 + Math.random() * 1.1,       // 螺旋 1.6~2.7 圈
        spin: 600 + Math.random() * 360         // 自转角速度（度/秒）
      });
    });

    var MERGE_MS = 1500;      // 螺旋汇聚时长
    var BERRY_IN = 0.70;      // 草莓在汇聚 70% 处开始成形
    var t0 = performance.now();
    var berryShown = false;
    var berryWrap = null, berryImg = null;

    function showBerry() {
      playSound(COMPLETE_BERRY, 0.95);

      berryWrap = document.createElement('div');
      berryWrap.className = 'seed-berry-wrap';
      berryWrap.style.transform =
        'translate3d(' + cx + 'px,' + cy + 'px,0) translate(-50%,-50%) scale(.15)';
      berryImg = document.createElement('img');
      berryImg.className = 'seed-berry';
      berryImg.src = BERRY_PNG;   // 静图兜底，帧序列随后跟上
      berryWrap.appendChild(berryImg);
      document.body.appendChild(berryWrap);

      // 62 帧闪光序列：rAF 时间轴驱动，播完停在最后一帧继续漂浮
      var f0 = performance.now(), lastFrameIdx = -1;
      function playFrames(now) {
        if (!berryWrap || !berryWrap.parentNode) return;
        var fi = Math.floor((now - f0) / BERRY_FRAME_MS);
        if (fi < BERRY_FRAME_COUNT) {
          if (fi !== lastFrameIdx) {
            berryImg.src = berryFrames[Math.min(fi, BERRY_FRAME_COUNT - 1)].src;
            lastFrameIdx = fi;
          }
          requestAnimationFrame(playFrames);
        } else {
          berryImg.src = berryFrames[BERRY_FRAME_COUNT - 1].src;
        }
      }
      requestAnimationFrame(playFrames);

      // 弹入缩放 + 淡入（wrapper 上的 transform/opacity，纯合成层）
      requestAnimationFrame(function () {
        var p0 = performance.now(), POP = 480;
        function pop(now) {
          var t = Math.min(1, (now - p0) / POP);
          var s = 0.15 + easeOutBack(t) * 0.85;
          berryWrap.style.transform =
            'translate3d(' + cx + 'px,' + cy + 'px,0) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';
          berryWrap.style.opacity = String(Math.min(1, t * 2.2));
          if (t < 1) requestAnimationFrame(pop);
        }
        requestAnimationFrame(pop);
      });

      // 入账 berry 余额（仅当 api.js 已加载）；置 credited 防止中断后重复补账
      if (typeof window.addBerries === 'function') {
        try { window.addBerries(1); } catch (e) {}
      }
      try {
        var cs2 = loadState();
        cs2.credited = true;
        saveState(cs2);
      } catch (e) {}
    }

    function finish() {
      // 清除籽 DOM
      parts.forEach(function (p) {
        if (p.el && p.el.parentNode) p.el.remove();
      });
      Object.keys(itemEls).forEach(function (id) { delete itemEls[id]; });

      // 草莓停留后放大淡出
      if (berryWrap) {
        var h0 = performance.now(), HOLD = 2100, OUT = 650;
        function fade(now) {
          var held = now - h0;
          if (held < HOLD) { requestAnimationFrame(fade); return; }
          var t = Math.min(1, (held - HOLD) / OUT);
          var e = easeInOutCubic(t);
          berryWrap.style.opacity = String(1 - t);
          berryWrap.style.transform =
            'translate3d(' + cx + 'px,' + cy + 'px,0) translate(-50%,-50%) scale(' + (1 + 0.9 * e).toFixed(3) + ')';
          if (t < 1) {
            requestAnimationFrame(fade);
          } else if (berryWrap.parentNode) {
            berryWrap.remove();
          }
        }
        requestAnimationFrame(fade);
      }

      // 重置 state：等下一个 6 小时周期
      saveState({ lastRefresh: Date.now(), seeds: [] });
      combining = false;
    }

    function step(now) {
      var t = Math.min(1, (now - t0) / MERGE_MS);
      var approach = easeInCubic(t);          // 半径收敛：先慢后快，持续靠近不回退
      var orbit = easeInOutCubic(t);          // 轨道角：单调递增，循环旋转
      parts.forEach(function (p) {
        var ang = p.base + p.dir * p.turns * Math.PI * 2 * orbit;
        var rad = p.r0 * (1 - approach);
        var x = cx + Math.cos(ang) * rad;
        var y = cy + Math.sin(ang) * rad * 0.92;   // 略扁，视觉更像聚拢
        var spin = p.dir * p.spin * (now - t0) / 1000;
        var sc = 1;                              // 旋转过程大小不变，只做旋转+汇聚
        var op = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1;  // 末段融进草莓
        p.el.style.opacity = String(op);
        p.el.style.transform =
          'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%) ' +
          'rotate(' + spin.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
      });

      if (!berryShown && t >= BERRY_IN) {
        berryShown = true;
        showBerry();
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        finish();
      }
    }
    requestAnimationFrame(step);
  }

  // ===== 启动 =====
  // 新籽提示（自包含：不依赖 api.js 的 showToast）
  function seedToast(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText =
      'position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:99997;' +
      'background:rgba(20,26,46,.9);color:#ffe9a8;border:1px solid rgba(255,200,120,.5);' +
      'border-radius:18px;padding:7px 18px;font-size:13px;letter-spacing:1px;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.4);pointer-events:none;' +
      'opacity:0;transition:opacity .35s,transform .35s;';
    document.body.appendChild(t);
    requestAnimationFrame(function () {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(2px)';
    });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.remove(); }, 400);
    }, 2600);
  }

  function init() {
    injectStyle();
    var s = loadState();

    // 中断恢复：上次籽已全部收集（螺旋汇聚途中刷新/关页）且未入账 → 补一颗
    if (s.seeds.length > 0 && s.seeds.every(function (x) { return x.collected; }) && !s.credited) {
      if (typeof window.addBerries === 'function') {
        try { window.addBerries(1); } catch (e) {}
      }
      seedToast('上次的草莓已补发 +1');
      saveState({ lastRefresh: Date.now(), seeds: [], credited: false });
      s = loadState();
    }

    if (shouldRefresh(s)) {
      s = { lastRefresh: Date.now(), seeds: genSeeds(), credited: false };
      saveState(s);
      seedToast('新的草莓籽出现了，找找看');
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
