/* ===== 草莓籽收集系统（全局·跨页面分布） =====
   - 每 6 小时刷新 3-5 颗草莓籽，每颗绑定一个不同页面（排除 berryos/demo），
     只在它所属的页面出现；去哪些页面找，由 diary 页 Madeline 聊天给线索
   - 鼠标点击后跟随鼠标走，表示收集到了；收集状态持久化，切页面保留
   - 在任意页面集齐最后一颗 → 其他页面已收集的籽以视觉粒子方式临时归场，
     旋转汇聚 + 音效组合成一颗草莓
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
  var STORAGE_KEY = 'seedState_v2';   // v2：seed 增加 page 字段，v1 旧状态自然作废重刷

  // ===== 页面注册表：草莓籽可散落的页面（刻意排除 berryos 与各类 demo） =====
  // name 用于 diary 线索播报；id 与文件名对应
  var PAGES = [
    { id: 'index',        file: 'index.html',        name: '我的大山' },
    { id: 'diary',        file: 'diary.html',        name: '日记本' },
    { id: 'messages',     file: 'messages.html',     name: '山间聊天' },
    { id: 'article',      file: 'article.html',      name: '文章' },
    { id: 'write',        file: 'write.html',        name: '写文章' },
    { id: 'archives',     file: 'archives.html',     name: '归档' },
    { id: 'me',           file: 'me.html',           name: '我的空间' },
    { id: 'shop',         file: 'shop.html',         name: '商店' },
    { id: 'roundtable',   file: 'roundtable.html',   name: '圆桌会议' },
    { id: 'shelf',        file: 'shelf.html',        name: '回忆书架' },
    { id: 'payphone',     file: 'payphone.html',     name: '电话亭' },
    { id: 'internet_cafe',file: 'internet_cafe.html',name: '网吧' }
  ];
  function currentPageId() {
    var file = location.pathname.split('/').pop() || 'index.html';
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].file === file) return PAGES[i].id;
    return '';  // 未注册页面（berryos/demo 等）：不渲染任何籽
  }
  function pageName(id) {
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i].id === id) return PAGES[i].name;
    return '别处';
  }
  var PAGE_ID = currentPageId();

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

  // 生成 3-5 颗籽：每颗绑定一个互不重复的页面，位置为该页内的随机点（百分比）
  function genSeeds() {
    var n = 3 + Math.floor(Math.random() * 3);  // 3,4,5
    n = Math.min(n, PAGES.length);
    // Fisher-Yates 洗牌页面池，取前 n 个 → 籽天然分散到 3-5 个不同页面
    var pool = PAGES.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    var arr = [];
    for (var k = 0; k < n; k++) {
      arr.push({
        id: 'sd_' + Date.now().toString(36) + '_' + k,
        page: pool[k].id,
        x: 5 + Math.random() * 88,    // 5%-93%
        y: 14 + Math.random() * 76,   // 14%-90%（避开顶部 header）
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
        /* 待机漂浮/弹入全部由 rAF 写 transform，避免 CSS keyframe 全员同步的僵硬感 */
        'transform:translate(-50%,-50%);will-change:transform;opacity:0;}' +
      '.seed-item.follow,.seed-item.merge{pointer-events:none;transition:none;z-index:99998;left:0!important;top:0!important;opacity:1;}' +
      /* 成形草莓：wrapper 负责定位/弹入缩放（transform 合成层），内层 img 负责上下漂浮 */
      '.seed-berry-wrap{position:fixed;left:0;top:0;pointer-events:none;z-index:99999;' +
        'opacity:0;will-change:transform,opacity;transform:translate3d(0,0,0) translate(-50%,-50%) scale(.2);}' +
      '.seed-berry{width:120px;height:120px;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'filter:drop-shadow(0 0 14px rgba(255,220,140,.95)) drop-shadow(0 0 34px rgba(255,120,90,.55));' +
        'animation:seedBerryBob 2.2s ease-in-out infinite;}' +
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
    // 只渲染「绑定当前页面」且未收集的籽：同一时刻一个页面最多出现本页那几颗
    var pending = s.seeds.filter(function (x) { return !x.collected && x.page === PAGE_ID; });
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
      itemEls[seed.id] = {
        el: el, seed: seed, follow: false, followDelay: 0, cur: null,
        base: seedBasePx(seed),        // 待机漂浮的像素锚点
        phase: Math.random() * Math.PI * 2,  // 每颗籽独立相位，晃动不同步
        born: performance.now()       // 弹入起点
      };
    });
  }

  // vw/vh → 当前分辨率下的像素锚点（窗口 resize 时重算）
  function seedBasePx(seed) {
    return { x: seed.x / 100 * window.innerWidth, y: seed.y / 100 * window.innerHeight };
  }
  window.addEventListener('resize', function () {
    Object.keys(itemEls).forEach(function (id) {
      var e = itemEls[id];
      if (e && e.seed) e.base = seedBasePx(e.seed);
    });
  });

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

  // ===== 跟随：弹簧-阻尼物理（鼠标停 → 籽带速度滑行并刹车，停稳后轻微晃动） =====
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

  // 帧率无关的阻尼系数：rate 为每秒速度衰减率，dt 为实际帧间隔（秒）
  function dampDt(rate, dt) { return Math.exp(-rate * dt); }

  var lastFrameAt = 0;
  function followLoop(now) {
    var dt = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 1 / 60;
    lastFrameAt = now;
    var head = trail.length ? trail[0] : mouse;
    var tSec = now / 1000;
    Object.keys(itemEls).forEach(function (id) {
      var entry = itemEls[id];
      if (!entry || entry.merging) return;
      if (!entry.follow) {
        // 待机漂浮：双频正弦叠加 → 轨迹不重复不机械；上下 5px + 左右 ~4px + ±4° 自转，
        // 每颗籽随机相位各自漂；初次出现带一次 overshoot 弹入
        if (!entry.base) return;
        var popT = Math.min(1, (now - entry.born) / 450);
        var pop = popT >= 1 ? 1 : easeOutBack(popT);
        entry.el.style.opacity = String(Math.min(1, popT * 2.2));
        var ph0 = entry.phase;
        var ix = entry.base.x + Math.sin(tSec * 1.35 + ph0) * 3 + Math.sin(tSec * 0.62 + ph0 * 2.1) * 1.4;
        var iy = entry.base.y + Math.sin(tSec * 1.72 + ph0 * 1.3) * 5;
        var irot = Math.sin(tSec * 1.08 + ph0 * 0.7) * 4;
        entry.el.style.transform =
          'translate3d(' + ix.toFixed(1) + 'px,' + iy.toFixed(1) + 'px,0) ' +
          'translate(-50%,-50%) rotate(' + irot.toFixed(2) + 'deg) scale(' + pop.toFixed(3) + ')';
        return;
      }
      var idx = entry.followDelay || 0;
      if (!entry.cur) entry.cur = { x: mouse.x, y: mouse.y };
      if (!entry.vel) entry.vel = { x: 0, y: 0 };
      var cur = entry.cur, vel = entry.vel;

      var tx, ty, spring, damp;
      if (idx === 0) {
        // 头籽：弹簧硬、阻尼大 → 跟手但鼠标停下时有短促的刹车滑距
        tx = mouse.x; ty = mouse.y;
        spring = 380; damp = 22;
      } else {
        // 尾籽：弹簧软、阻尼小 → 弹性尾巴，刹车滑距更长更飘
        var i = Math.min(idx, trail.length - 1);
        var pos = (i >= 0 && trail[i]) ? trail[i] : head;
        tx = pos.x; ty = pos.y;
        spring = 130; damp = 12;
      }

      // 弹簧加速 + 阻尼耗散：目标静止时速度被阻尼耗尽 → 在有限距离内自然刹停
      vel.x += (tx - cur.x) * spring * dt;
      vel.y += (ty - cur.y) * spring * dt;
      var dk = dampDt(damp, dt);
      vel.x *= dk; vel.y *= dk;
      cur.x += vel.x * dt;
      cur.y += vel.y * dt;

      // 靠近目标（60px 内）就开始待机晃动：上下 ±4px（沿用 seedBob 待机节奏）
      // + 左右 ±3px 摇摆（待机只有上下，跟随态增添左右），越贴近目标晃得越充分，每颗籽相位随机
      var distT = Math.sqrt((tx - cur.x) * (tx - cur.x) + (ty - cur.y) * (ty - cur.y));
      var prox = Math.max(0, 1 - distT / 60);
      var wx = 0, wy = 0;
      if (prox > 0.01) {
        if (entry.phase == null) entry.phase = Math.random() * Math.PI * 2;
        wx = Math.sin(tSec * 1.85 + entry.phase) * 3 * prox;
        wy = Math.sin(tSec * 2.42 + entry.phase * 1.7) * 4 * prox;
      }

      // 只改 transform（合成层），绝不碰 left/top，避免每帧重排
      entry.el.style.transform =
        'translate3d(' + (cur.x + wx).toFixed(1) + 'px,' + (cur.y + wy).toFixed(1) + 'px,0) translate(-50%,-50%)';
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

    // 为「全套籽」生成独立螺旋参数：
    //  - 本页已收集、正在跟随的籽：从其当前位置接管
    //  - 其他页面收集的籽（本页无 DOM）：在屏幕外围一圈临时"归场"，淡入后参与汇聚
    var state = loadState();
    var layer = ensureLayer();
    var parts = [];
    state.seeds.forEach(function (seed, i) {
      var entry = itemEls[seed.id];
      var el, pos, spawned = false;
      if (entry && entry.follow) {
        entry.follow = false;
        entry.merging = true;
        el = entry.el;
        el.classList.add('merge');
        pos = entry.cur || { x: cx, y: cy };
      } else {
        // 跨页归场：屏幕外围随机角度生成一颗视觉籽
        el = document.createElement('img');
        el.src = IMG_URL;
        el.className = 'seed-item merge';
        layer.appendChild(el);
        var ringR = Math.min(window.innerWidth, window.innerHeight) * (0.30 + Math.random() * 0.16);
        var ang = (i / state.seeds.length) * Math.PI * 2 + Math.random() * 0.9;
        pos = { x: cx + Math.cos(ang) * ringR, y: cy + Math.sin(ang) * ringR * 0.9 };
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.opacity = '0';
        spawned = true;
      }
      var dx = pos.x - cx, dy = pos.y - cy;
      var base = Math.atan2(dy, dx);
      var r0 = Math.max(60, Math.sqrt(dx * dx + dy * dy) * 0.5);   // 起始旋转半径：距中心的一半，圆明显收小
      parts.push({
        el: el,
        spawned: spawned,
        base: base,
        r0: r0,
        // 接管偏移：籽当前位置与螺旋起点的差值，动画前 18% 内衰减到 0，避免半径减半后瞬移
        ox: pos.x - (cx + Math.cos(base) * r0),
        oy: pos.y - (cy + Math.sin(base) * r0 * 0.92),
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
      var offK = 1 - easeOutCubic(Math.min(1, t / 0.18));  // 接管偏移衰减：前 18% 滑入螺旋轨道
      parts.forEach(function (p) {
        var ang = p.base + p.dir * p.turns * Math.PI * 2 * orbit;
        var rad = p.r0 * (1 - approach);
        var x = cx + Math.cos(ang) * rad + p.ox * offK;
        var y = cy + Math.sin(ang) * rad * 0.92 + p.oy * offK;   // 略扁，视觉更像聚拢
        var spin = p.dir * p.spin * (now - t0) / 1000;
        var sc = 1;                              // 旋转过程大小不变，只做旋转+汇聚
        // 跨页归场的籽前 13% 淡入；全体在末段融进草莓
        var fadeIn = p.spawned ? Math.min(1, t / 0.13) : 1;
        var fadeOut = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.14) : 1;
        var op = fadeIn * fadeOut;
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

  // ===== 新籽位置提示：diary 页由 Madeline 在聊天中自然说出「散落在哪些页面」 =====
  function buildSeedHint(seeds) {
    // 按籽的页面去重、保持生成顺序，线索只报页面名（每颗籽一个不同页面）
    var seen = {}, names = [];
    seeds.forEach(function (sd) {
      if (!seen[sd.page]) { seen[sd.page] = 1; names.push('「' + pageName(sd.page) + '」'); }
    });
    var where = names.join('、');
    var templates = [
      '诶？我感觉到 ' + seeds.length + ' 颗草莓籽散落到山的各处去了——' + where + '，每个地方藏着一颗。到处转转，把它们找齐？',
      '刚刚有好几道微光从窗边飘出去了！' + where + '……一共 ' + seeds.length + ' 颗草莓籽，去这些地方找找看？',
      '草莓籽不肯老老实实待在日记里啦。我数到 ' + seeds.length + ' 颗，分别飘去了' + where + '。帮我捡回来嘛。'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  // 在 diary 页说出提示（存在 window.addMadelineMessage 时）；说完清 hintPending
  function speakSeedHintIfNeeded(immediate) {
    if (typeof window.addMadelineMessage !== 'function') return false;
    var st = loadState();
    if (!st.hintPending) return false;
    var pending = st.seeds.filter(function (x) { return !x.collected; });
    if (!pending.length) { st.hintPending = false; saveState(st); return false; }
    st.hintPending = false;
    saveState(st);
    var say = function () { window.addMadelineMessage(buildSeedHint(pending), '惊讶'); };
    if (immediate) say(); else setTimeout(say, 2600);   // 页面刚加载时让开场白先说
    return true;
  }

  function init() {
    injectStyle();
    var s = loadState();

    // 中断恢复：上次籽已全部收集（螺旋汇聚途中刷新/关页）且未入账 → 补一颗
    if (s.seeds.length > 0 && s.seeds.every(function (x) { return x.collected; }) && !s.credited) {
      if (typeof window.addBerries === 'function') {
        try { window.addBerries(1); } catch (e) {}
      }
      saveState({ lastRefresh: Date.now(), seeds: [], credited: false });
      s = loadState();
    }

    if (shouldRefresh(s)) {
      s = { lastRefresh: Date.now(), seeds: genSeeds(), credited: false, hintPending: true };
      saveState(s);
      // 位置提示统一由 diary 聊天给出（本页是 diary 立即说，其他页留待进入 diary 补说）
      speakSeedHintIfNeeded(true);
    } else {
      // 刷新发生在别的页面 → 来到 diary 时补说位置提示
      speakSeedHintIfNeeded(false);
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
