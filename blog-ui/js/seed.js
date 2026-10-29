/* ===== 草莓籽收集系统（全局·跨页面分布） =====
   - 每 6 小时刷新 3-5 颗草莓籽，每颗绑定一个不同页面（排除 berryos/demo），
     只在它所属的页面出现；去哪些页面找，由 diary 页 Madeline 聊天给线索
   - 鼠标点击后跟随鼠标走，表示收集到了；收集状态持久化，切页面保留
   - 在任意页面集齐最后一颗 → 其他页面已收集的籽以视觉粒子方式临时归场，
     旋转汇聚 + 音效组合成一颗草莓
   - 自包含：不依赖 api.js/auth.js，无 api 时降级（无 berry 入账）

   动画机制对照 Celeste.dll（dnfile + dncil 反汇编）与 Content/Graphics/Sprites.xml：
     · 待机      Sprites.xml <Loop id="idle" path="seed" frames="0*19,1" delay="0.1"/>
                 StrawberrySeed::Awake → sprite.Position = (sine.Value*2, sine.ValueOverTwo*1)
                 <Awake>b__25_0 → 播到第 19 帧（白闪帧）时触发 lightTween + seed_pulse
     · 拾取      StrawberrySeed::orig_OnPlayer → Play("seed_touch","count"=index) + GainFollower
                 <OnGainLeader> → wiggler.Start()（0.5s / 4Hz / 振幅 0.2 的缩放抖动）
     · 跟随      Celeste.Leader::Update → PastPoints 每 0.02s 采一次（位移≥3 世界px），
                 第 i 个 follower 追 PastPoints[5*(i+1)]，
                 Position += (target - Position) * (1 - pow(0.01, dt))   —— 指数趋近，无回弹
     · 集齐      CSGEN_StrawberrySeeds::Cutscene（见下方 combine 的逐步注释）
   屏幕换算：籽素材 16px 显示 48px → 世界像素 ×3 = 屏幕像素 */
(function () {
  'use strict';

  var BASE = 'seed/';
  var SEED_FRAMES = [BASE + 'seed00.png', BASE + 'seed01.png'];  // seed 图集的 0 / 1 帧
  var SOUND_DIR = BASE + 'sound/';
  var TOUCH_SOUNDS = [
    'seed_touch_01.wav', 'seed_touch_02.wav', 'seed_touch_03.wav',
    'seed_touch_04.wav', 'seed_touch_05.wav'
  ];
  // 原作还有 event:/game/general/seed_pulse（每 2s 的呼吸脉冲音），项目里没有该素材，
  // 找不到时静默跳过 —— 脉冲的视觉部分由白闪帧 + 辉光加强还原
  var COMPLETE_MAIN = SOUND_DIR + 'seed_complete_main.wav';
  var COMPLETE_BERRY = SOUND_DIR + 'seed_complete_berry.wav';
  // 成形后的草莓：Sprites.xml <Loop id="idle" path="normal" delay=".1" frames="0-6,..."/>
  var BERRY_FRAME_PREFIX = 'celeste-collectables/strawberry/normal';
  var BERRY_FRAME_COUNT = 7;          // idle 循环只用 0-6
  var BERRY_FRAME_MS = 100;           // delay=".1"
  var REFRESH_INTERVAL = 6 * 60 * 60 * 1000;  // 6 小时
  var STORAGE_KEY = 'seedState_v2';   // v2：seed 增加 page 字段，v1 旧状态自然作废重刷

  // ===== 原作常量（逐项来自 IL / Sprites.xml，改手感就调这里） =====
  var PX = 3;                     // 世界像素 → 屏幕像素（16px 图集帧渲染成 48px，整数倍缩放才不发虚）
  var IDLE_TICKS = 20;            // frames="0*19,1" → 19 帧常态 + 1 帧白闪
  var IDLE_TICK_MS = 100;         // delay="0.1"
  var IDLE_FLASH_TICK = 19;       // frame == 19 → seed_pulse
  var SINE_HZ = 0.5;              // new SineWave(0.5f, 0f)
  var SINE_AMP_X = 2 * PX;        // sine.Value * 2f
  var SINE_AMP_Y = 1 * PX;        // sine.ValueOverTwo * 1f（sin(counter/2)，频率减半）
  var WIG_DUR = 0.5;              // Wiggler.Create(0.5f, 4f, …)
  var WIG_FREQ = 4.0;
  var WIG_AMP = 0.2;              // sprite.Scale = One * (1 + 0.2 * wiggler.Value)
  var FOLLOW_DELAY = 0.2;         // StrawberrySeed.Follower.FollowDelay = 0.2f
  var PAST_MAX = 350;             // Leader.MaxPastPoints
  var PAST_STEP = 3 * PX;         // 位移 ≥ 3 世界 px 才记一个 PastPoints（= 9 屏幕px）
  var FOLLOW_INDEX_STEP = 5;      // 第 i 个 follower 追 PastPoints[5*(i+1)] → 相邻两颗差 45px
  var FOLLOW_POW = 0.01;          // Position += (target-Position) * (1 - pow(0.01, dt))
  var FOLLOW_RATE_SCALE = 3;      // 换算补偿：原版 320px 宽的游戏画面 → 上千 px 的网页（τ≈0.072s）
  var SPIN_RADIUS = 25 * PX;      // StartSpinAnimation 里 Calc.AngleToVector(ang, 25f)
  var SPIN_SWEEP = 32.201324;     // Lerp(0f, 32.201324f, eased) 弧度 ≈ 5.125 圈
  var SPIN_START = Math.PI / 2;   // angleOffset 起点 π/2，每颗籽减 2π/n
  var SPIN_MS = 2800;             // 原作 4.0s，网页节奏压缩到 2.8s
  var COMBINE_MS = 600;           // StartCombineAnimation(..., 0.6f)
  var COMBINE_R0 = 25 * PX;       // 半径 Lerp(25f, 0f, eased)
  var BURST_COUNT = 6;            // 每颗籽最后喷 6 个 P_Burst
  var ALL_WAIT_MS = 350;          // 冻结后先等 0.35s
  var FROZEN_WAIT_MS = 100;       // 再等 0.1s 进入旋转
  var BERRY_POP_MS = 460;         // 草莓弹出的过冲时长
  var BERRY_HOLD_MS = 500;        // CollectedSeeds 后停留 0.5s
  var BERRY_OUT_MS = 650;         // 淡出
  var BERRY_H = 80;               // 草莓显示高度：16px 图集帧 ×5（整数倍，像素清晰）

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
        'width:48px;height:48px;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'filter:drop-shadow(0 2px 4px rgba(0,0,0,.55));' +
        /* 待机/跟随/汇聚全部由 rAF 写 transform，避免 CSS keyframe 全员同步的僵硬感 */
        'transform:translate(-50%,-50%);will-change:transform;opacity:0;}' +
      '.seed-item.follow,.seed-item.frozen{pointer-events:none;z-index:99998;' +
        'left:0!important;top:0!important;opacity:1;}' +
      // 跨页归场的籽淡入（原地跟随的籽本来就不透明，不受影响）
      '.seed-item.frozen{transition:opacity .35s ease-out;}' +
      '.seed-item.follow{transition:none;}' +
      // 集齐时的压暗罩（对应原作 FormationBackdrop.Display + Alpha 0.5）
      '#seedDim{position:fixed;inset:0;pointer-events:none;z-index:99997;opacity:0;' +
        'transition:opacity .45s ease-out;' +
        'background:radial-gradient(circle at 50% 46%,rgba(6,8,16,.28),rgba(3,4,10,.72) 78%);}' +
      '#seedDim.on{opacity:1;}' +
      // 成形草莓：wrapper 负责定位/缩放，内层 img 负责首帧序列
      '.seed-berry-wrap{position:fixed;left:0;top:0;pointer-events:none;z-index:99999;' +
        'opacity:0;will-change:transform,opacity;transform:translate3d(0,0,0) translate(-50%,-50%) scale(.2);}' +
      '.seed-berry{height:' + BERRY_H + 'px;width:auto;image-rendering:pixelated;image-rendering:crisp-edges;' +
        'filter:drop-shadow(0 0 14px rgba(255,220,140,.95)) drop-shadow(0 0 34px rgba(255,120,90,.55));}' +
      // 汇聚末段每颗籽喷出的像素尘（P_Burst）
      '.seed-burst{position:absolute;width:6px;height:6px;border-radius:1px;pointer-events:none;' +
        'image-rendering:pixelated;}';
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

  // ===== 缓动（Monocle.Ease 反汇编结果） =====
  function cubeIn(t) { return t * t * t; }
  // CubeOut = Invert(CubeIn) = 1 - CubeIn(1 - t)
  function cubeOut(t) { return 1 - Math.pow(1 - t, 3); }
  // CubeInOut = Follow(CubeIn, CubeOut)
  function cubeInOut(t) { return t < 0.5 ? cubeIn(t * 2) / 2 : 0.5 + cubeOut((t - 0.5) * 2) / 2; }
  // BigBackIn(t) = t² · (4t − 3)：先回拉（最低 -0.25）再冲到 1
  function bigBackIn(t) { return t * t * (4 * t - 3); }

  // ===== 渲染 =====
  var layerEl = null;
  var dimEl = null;
  var itemEls = {};     // id -> entry
  var mouse = null;     // 指针位置（未移动过时为 null）
  var combining = false;

  function ensureLayer() {
    if (layerEl && document.body.contains(layerEl)) return layerEl;
    layerEl = document.createElement('div');
    layerEl.id = 'seedLayer';
    document.body.appendChild(layerEl);
    return layerEl;
  }
  function ensureDim() {
    if (dimEl && document.body.contains(dimEl)) return dimEl;
    dimEl = document.createElement('div');
    dimEl.id = 'seedDim';
    document.body.appendChild(dimEl);
    return dimEl;
  }
  function setDim(on) {
    ensureDim().classList.toggle('on', !!on);
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
      el.src = SEED_FRAMES[0];
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
        el: el,
        seed: seed,
        follow: false,          // 已拾取 → 转为 Follower
        fi: -1,                 // Leader.Followers 里的下标（本页链内顺序）
        delay: 0,               // Follower.DelayTimer
        cur: null,              // 实体位置（屏幕 px，仅跟随/组合阶段用）
        born: performance.now(),
        phase: Math.random() * Math.PI * 2,  // 白闪相位随机（原作按 index 错开）
        sw: Math.random() * Math.PI * 2,     // SineWave.Randomize() 的相位
        frame: -1,
        popped: false,
        glowOn: false,
        wigStart: 0,
        flashAt: 0,
        gone: false
      };
    });
  }

  // 待机籽的锚点全部交给 CSS 的 left:xx vw / top:yy vh（天然响应式），
  // transform 只负责正弦微偏移 —— 两处都写绝对坐标会把位置叠成一倍，籽会飞到屏外

  // ===== 跨页面跟随恢复 =====
  // 已收集的籽存在 localStorage 里，切页面后在新页面重建为 Follower 挂回鼠标后面，
  // 否则 render() 只渲染未收集的本页籽，已收集的籽就会「消失」。
  // 链内顺序按 state.seeds 数组顺序（生成顺序），先入链的籽更靠近光标。
  var chain = [];
  function restoreFollowers(s) {
    var collected = s.seeds.filter(function (x) { return x.collected; });
    if (!collected.length || collected.length === s.seeds.length) return; // 集齐走 combine/补账路径
    var layer = ensureLayer();
    collected.forEach(function (seed) {
      if (itemEls[seed.id]) return;
      var el = document.createElement('img');
      el.src = SEED_FRAMES[0];
      el.className = 'seed-item follow';
      el.dataset.id = seed.id;
      el.style.left = '0px';
      el.style.top = '0px';
      el.style.opacity = '1';
      layer.appendChild(el);
      chain.push(seed.id);
      itemEls[seed.id] = {
        el: el,
        seed: seed,
        follow: true,
        fi: chain.length - 1,           // = Leader.Followers.IndexOf(this)
        delay: 0,                       // 恢复时不再等 FollowDelay，直接跟上
        cur: { x: window.innerWidth / 2, y: window.innerHeight / 2 },  // 从屏幕中心趋近光标
        born: performance.now() - IDLE_TICKS * IDLE_TICK_MS,  // 跳过出场弹入
        phase: Math.random() * Math.PI * 2,
        sw: Math.random() * Math.PI * 2,
        frame: -1,
        popped: true,
        glowOn: false,
        wigStart: 0,
        flashAt: 0,
        gone: false
      };
    });
  }

  // ===== Leader：光标位置历史（Celeste.Leader::Update 的 PastPoints） =====
  // 原作每 0.02s 采一次、位移不足 3 世界 px 不记；网页里改成「每走满一格就记一个点」，
  // 于是第 i 颗籽追 PastPoints[5*(i+1)] 时，链上的间距天然恒定，不会因为甩鼠标而拉爆。
  var path = [];          // path[0] = 最新
  function pushPath(x, y) {
    if (!path.length) { path.unshift({ x: x, y: y }); return; }
    // 按固定弧长 PAST_STEP 逐段补点：这样无论指针一帧走了 5px 还是 800px，
    // 路径上的采样间距始终均匀 —— 否则 PastPoints[5*(i+1)] 的链距会随速度忽远忽近。
    // 上限用 PAST_MAX：一次大幅跳转（鼠标瞬间横跨全屏）也必须把路径接到光标上，
    // 不能留一截空档 —— 否则 path 停在半路，整串籽会永远落在光标后面很远的地方。
    var guard = 0;
    while (guard++ < PAST_MAX) {
      var head = path[0];
      var dx = x - head.x, dy = y - head.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < PAST_STEP) return;
      var k = PAST_STEP / d;
      path.unshift({ x: head.x + dx * k, y: head.y + dy * k });
      while (path.length > PAST_MAX) path.pop();
    }
  }

  function onPointer(x, y) {
    if (!mouse) mouse = { x: x, y: y };
    mouse.x = x;
    mouse.y = y;
    pushPath(x, y);
  }
  document.addEventListener('mousemove', function (e) { onPointer(e.clientX, e.clientY); });
  document.addEventListener('touchmove', function (e) {
    if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // ===== 主循环：待机呼吸/白闪 + Follower 跟随 =====
  var lastFrameAt = 0;
  function tick(now) {
    var dt = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 1 / 60;
    lastFrameAt = now;
    var tSec = now / 1000;
    // 帧率无关的指数趋近系数：1 - pow(0.01, dt) 在 dt=1/60 时约 13%（τ≈0.072s）
    var approach = 1 - Math.pow(FOLLOW_POW, dt * FOLLOW_RATE_SCALE);

    Object.keys(itemEls).forEach(function (id) {
      var e = itemEls[id];
      if (!e || e.gone) return;

      // ---- Follower：DelayTimer 先走完 0.2s，再按 PastPoints 的指数趋近 ----
      if (e.follow) {
        if (e.delay > 0) e.delay -= dt;
        if (e.delay <= 0 && path.length) {
          var idx = FOLLOW_INDEX_STEP * (e.fi + 1);
          var tgt = path[idx < path.length ? idx : path.length - 1];
          if (tgt && e.cur) {
            e.cur.x += (tgt.x - e.cur.x) * approach;
            e.cur.y += (tgt.y - e.cur.y) * approach;
          }
        }
      }

      // ---- 待机动画：20 帧一循环，第 19 帧是白闪 ----
      var tickIdx = Math.floor(((now - e.born) / IDLE_TICK_MS + e.phase * 10)) % IDLE_TICKS;
      if (tickIdx < 0) tickIdx += IDLE_TICKS;
      if (tickIdx !== e.frame) {
        e.frame = tickIdx;
        var f = tickIdx === IDLE_FLASH_TICK ? 1 : 0;
        if (e.el.getAttribute('src') !== SEED_FRAMES[f]) e.el.src = SEED_FRAMES[f];
        if (f === 1) e.flashAt = now;   // ← seed_pulse：辉光加强 + 扩散
      }

      // ---- Wiggler：拾取瞬间 1 → 1.2 的 4Hz 阻尼振荡（0.5s 收干净） ----
      var wig = 0;
      if (e.wigStart) {
        var wt = (now - e.wigStart) / 1000;
        if (wt >= WIG_DUR) {
          e.wigStart = 0;
        } else {
          wig = Math.cos(Math.PI * 2 * WIG_FREQ * wt) * (1 - wt / WIG_DUR);
        }
      }

      // ---- 合成 transform ----
      var px = 0, py = 0;      // 待机：位置由 CSS left/top 决定，transform 只给相对偏移
      if (e.follow) {
        if (!e.cur) e.cur = { x: mouse ? mouse.x : window.innerWidth / 2, y: mouse ? mouse.y : window.innerHeight / 2 };
        px = e.cur.x; py = e.cur.y;
      } else {
        // 出场：480ms 内淡入 + 从 0.93 轻弹到 1（仅一次，之后不再写 style，避免每帧刷 DOM）
        if (!e.popped) {
          var popT = (now - e.born) / 480;
          if (popT >= 1) {
            e.popped = true;
            e.el.style.opacity = '1';
          } else {
            e.el.style.opacity = String(Math.min(1, popT * 2.2).toFixed(2));
            wig = -0.35 * (1 - popT) * (1 - popT);
          }
        }
      }
      // sprite.Position 的独立偏移：A = sine.Value*2、B = sine.ValueOverTwo*1
      // （ValueOverTwo = sin(Counter/2)，频率减半 → 缓慢游走的 8 字形；每颗籽相位独立由 Randomize 决定）
      var ox = Math.sin(Math.PI * 2 * SINE_HZ * tSec + e.sw) * SINE_AMP_X;
      var oy = Math.sin(Math.PI * SINE_HZ * tSec + e.sw * 0.5) * SINE_AMP_Y;
      var sc = 1 + WIG_AMP * wig;

      e.el.style.transform =
        'translate3d(' + (px + ox).toFixed(1) + 'px,' + (py + oy).toFixed(1) + 'px,0) ' +
        'translate(-50%,-50%) scale(' + sc.toFixed(3) + ')';

      // 白闪那一下把外发光顶亮，随后 220ms 衰减回去（只在需要时写 filter，避免每帧刷样式）
      var glow = 0;
      if (e.flashAt) {
        var gt = (now - e.flashAt) / 220;
        glow = gt >= 1 ? 0 : (1 - gt);
        if (gt >= 1) e.flashAt = 0;
      }
      if (glow > 0.01) {
        e.el.style.filter = 'drop-shadow(0 0 ' + (10 + 22 * glow).toFixed(0) + 'px rgba(255,246,170,' +
          (0.75 * glow).toFixed(2) + ')) brightness(' + (1 + 0.55 * glow).toFixed(2) + ')';
        e.glowOn = true;
      } else if (e.glowOn) {
        e.glowOn = false;
        e.el.style.filter = '';   // 回落到 CSS 里的基础阴影
      }
    });
    requestAnimationFrame(tick);
  }

  // ===== 收集（StrawberrySeed::orig_OnPlayer + OnGainLeader） =====
  // 本页的入链顺序 = Leader.Followers 里的顺序。原作 Fans 里还可能夹着别的页面的籽，
  // 但网页一次只渲染本页的籽，所以下标只能按「本页这几位」重排，否则链会凭空拉开空档。
  // chain 声明在 restoreFollowers 上方：恢复回来的籽先入链，本页新收集的排在其后
  function collect(seed) {
    if (seed.collected || combining) return;
    var state = loadState();
    var target = null;
    state.seeds.forEach(function (x) { if (x.id === seed.id) target = x; });
    if (!target || target.collected) return;

    target.collected = true;
    saveState(state);

    // 收集计数（含本次，1..n）→ 音效变体；原作把 index 作为 "count" 参数交给 FMOD
    var collectedCount = state.seeds.filter(function (x) { return x.collected; }).length;
    var soundIdx = (collectedCount - 1) % 5;
    playSound(SOUND_DIR + TOUCH_SOUNDS[soundIdx]);

    var entry = itemEls[seed.id];
    if (entry) {
      // 从当前布局位置平滑接管：先拿真实像素坐标，再切成 left:0/top:0 + 纯 transform
      var rect = entry.el.getBoundingClientRect();
      entry.el.classList.add('follow');
      entry.el.style.left = '0px';
      entry.el.style.top = '0px';
      entry.el.style.opacity = '1';
      entry.cur = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      entry.follow = true;
      var fi = chain.indexOf(seed.id);
      if (fi < 0) { chain.push(seed.id); fi = chain.length - 1; }
      entry.fi = fi;                        // = Leader.Followers.IndexOf(this)
      entry.delay = FOLLOW_DELAY;           // GainFollower → DelayTimer = FollowDelay
      entry.wigStart = performance.now();   // OnGainLeader → wiggler.Start()
    }
    if (!path.length) pushPath(entry ? entry.cur.x : (mouse ? mouse.x : window.innerWidth / 2),
                              entry ? entry.cur.y : (mouse ? mouse.y : window.innerHeight / 2));

    // 全部收集完 → 组合（原作在最后一颗 OnPlayer 里 Add(new CSGEN_StrawberrySeeds(...))）
    if (state.seeds.every(function (x) { return x.collected; })) {
      combine();
    }
  }

  // ===== 草莓帧预加载 =====
  var berryFrames = [];
  (function preloadBerry() {
    for (var i = 0; i < BERRY_FRAME_COUNT; i++) {
      var im = new Image();
      im.src = BERRY_FRAME_PREFIX + String(i).padStart(2, '0') + '.png';
      berryFrames.push(im);
    }
  })();

  /**
   * 集齐后的组合演出 —— CSGEN_StrawberrySeeds::Cutscene 逐步复刻：
   *  ① 播 seed_complete_main，所有籽 OnAllCollected（抬深度 + 冻结），等 0.35s
   *  ② 压暗背景（FormationBackdrop 0.5）+ 暂停环境音，等 0.1s
   *  ③ 每颗籽 StartSpinAnimation：绕 (籽群重心→中心) 的插值点，半径 25 世界px，
   *     扫过 32.2 rad（约 5.1 圈），位置在前半程用 CubeIn 渐进接管，等 SPIN_MS
   *  ④ 播 seed_complete_berry，StartCombineAnimation：绕中心反转 1 圈 + 半径 25→0，
   *     BigBackIn 缓动（先外扩再收进去），结束喷 6 颗像素尘，等 0.6s
   *  ⑤ 移除籽 → 草莓 CollectedSeeds 现身，停留 0.5s 后淡出
   */
  function combine() {
    combining = true;
    var parts = [];
    var state = loadState();

    // 已跟随的籽直接接管；跨页收集的籽在屏幕外圈"归场"（原作里它们本就在场）
    state.seeds.forEach(function (seed, i) {
      var e = itemEls[seed.id];
      if (e && e.follow) {
        e.gone = true;              // 交给组合动画，tick 不再管这一颗
        e.el.classList.add('frozen');
        parts.push({ el: e.el, x: e.cur.x, y: e.cur.y });
      } else {
        var el = document.createElement('img');
        el.src = SEED_FRAMES[0];
        el.className = 'seed-item frozen';
        el.style.left = '0px';
        el.style.top = '0px';
        ensureLayer().appendChild(el);
        var ringR = Math.min(window.innerWidth, window.innerHeight) * (0.3 + Math.random() * 0.12);
        var ang = (i / state.seeds.length) * Math.PI * 2 - Math.PI / 2;
        parts.push({
          el: el,
          x: window.innerWidth / 2 + Math.cos(ang) * ringR,
          y: window.innerHeight / 2 + Math.sin(ang) * ringR * 0.86
        });
        el.style.opacity = '0';
        void el.offsetWidth;        // 先让 opacity:0 生效，再置 1 才能触发 .frozen 的淡入
        el.style.opacity = '1';
      }
    });
    if (!parts.length) { combining = false; return; }

    playSound(COMPLETE_MAIN, 0.85);

    // 跳到 OnAllCollected 收尾状态：全部籽立刻停住并抬到最前
    parts.forEach(function (p) {
      p.el.style.zIndex = '99998';
      p.el.style.transform = 'translate3d(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
    });

    setTimeout(function () {
      setDim(true);
      // ② 淡入后进入旋转
      setTimeout(function () { startSpin(parts); }, FROZEN_WAIT_MS);
    }, ALL_WAIT_MS);
  }

  function startSpin(parts) {
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var n = parts.length;
    var step = Math.PI * 2 / n;

    // averagePos：籽群重心；centerPos：草莓位置（网页里就是屏幕中心）
    var ax = 0, ay = 0;
    parts.forEach(function (p) { ax += p.x; ay += p.y; });
    ax /= n; ay /= n;

    parts.forEach(function (p, k) {
      p.sx = p.x; p.sy = p.y;          // StartSpinAnimation 里的 start
      p.aOff = SPIN_START - k * step;  // angleOffset：π/2 起，每颗减 2π/n
      p.el.style.transition = 'none';  // 演出期间不再要透明度过渡
      p.el.style.opacity = '1';
    });

    var t0 = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - t0) / SPIN_MS);
      // tween1：0→dur/2 的 CubeIn 决定 spinLerp，之后钉在 1
      var spinLerp = cubeIn(Math.min(1, t * 2));
      var angEase = cubeInOut(t);              // tween2：CubeInOut，时长 dur
      parts.forEach(function (p) {
        var ang = SPIN_START + p.aOff - SPIN_SWEEP * angEase;
        var bx = ax + (cx - ax) * spinLerp;    // Lerp(averagePos, centerPos, spinLerp)
        var by = ay + (cy - ay) * spinLerp;
        var ox = bx + Math.cos(ang) * SPIN_RADIUS;
        var oy = by + Math.sin(ang) * SPIN_RADIUS;
        // Position = Lerp(start, 轨道点, spinLerp)
        var x = p.sx + (ox - p.sx) * spinLerp;
        var y = p.sy + (oy - p.sy) * spinLerp;
        p.x = x; p.y = y;     // 记下终点：StartCombineAnimation 的 startAngle 就拿这里
        p.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
        // 收缩前一直保持常亮帧（原作 sprite.Play("noFlash")）
        if (p.el.getAttribute('src') !== SEED_FRAMES[0]) p.el.src = SEED_FRAMES[0];
      });
      if (t < 1) requestAnimationFrame(frame);
      else startCombine(parts, cx, cy);
    }
    requestAnimationFrame(frame);
  }

  function startCombine(parts, cx, cy) {
    playSound(COMPLETE_BERRY, 0.95);
    var t0 = performance.now();
    parts.forEach(function (p) {
      // startAngle = Calc.Angle(centerPos, Position)，Position 就是旋转结束的位置
      p.a0 = Math.atan2(p.y - cy, p.x - cx);
    });
    function frame(now) {
      var t = Math.min(1, (now - t0) / COMBINE_MS);
      var ang = cubeIn(t);          // Percent 走 CubeIn
      var rad = bigBackIn(t);       // 半径走 BigBackIn：先涨到 31 再收进 0
      parts.forEach(function (p) {
        var a = p.a0 - Math.PI * 2 * ang;         // Lerp(a0, a0-2π, CubeIn(t))
        var r = COMBINE_R0 * (1 - rad);           // Lerp(25, 0, BigBackIn(t))
        var x = cx + Math.cos(a) * r;
        var y = cy + Math.sin(a) * r;
        p.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
      });
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // OnComplete：Visible=false → 在中心（半径已收成 0）喷 6 颗 P_Burst → RemoveSelf
        parts.forEach(function (p) { p.el.style.opacity = '0'; });
        burst(cx, cy, BURST_COUNT * parts.length);
        finish(parts, cx, cy);
      }
    }
    requestAnimationFrame(frame);
  }

  // 像素尘（对应 P_Burst：小方块 + 向外 4px 起步 + 快速衰减）
  function burst(x, y, count) {
    var layer = ensureLayer();
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var sx = x + Math.cos(a) * 4 * PX;
      var sy = y + Math.sin(a) * 4 * PX;
      var d = document.createElement('div');
      d.className = 'seed-burst';
      d.style.left = '0';
      d.style.top = '0';
      d.style.background = 'rgb(255,' + (232 + ((Math.random() * 23) | 0)) + ',' + (140 + ((Math.random() * 80) | 0)) + ')';
      d.style.boxShadow = '0 0 6px rgba(255,236,150,.9)';
      layer.appendChild(d);
      var dist = 26 + Math.random() * 34;
      var dur = 320 + Math.random() * 200;
      var t0 = performance.now();
      (function (d, a, sx, sy, dist, dur, t0) {
        function step(now) {
          var t = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - t, 2);
          var px = sx + Math.cos(a) * dist * e;
          var py = sy + Math.sin(a) * dist * e + 12 * t * t;
          d.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + (1 - t * 0.6).toFixed(2) + ')';
          d.style.opacity = String(1 - t);
          if (t < 1) requestAnimationFrame(step);
          else if (d.parentNode) d.parentNode.removeChild(d);
        }
        requestAnimationFrame(step);
      })(d, a, sx, sy, dist, dur, t0);
    }
  }

  // ⑤ 草莓现身（Strawberry::CollectedSeeds → Visible = true，sprite 继续跑 idle 循环）
  function finish(parts, cx, cy) {
    parts.forEach(function (p) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); });
    Object.keys(itemEls).forEach(function (id) { delete itemEls[id]; });
    chain.length = 0;

    var wrap = document.createElement('div');
    wrap.className = 'seed-berry-wrap';
    var img = document.createElement('img');
    img.className = 'seed-berry';
    img.src = berryFrames[0].src;
    wrap.appendChild(img);
    document.body.appendChild(wrap);

    var born = performance.now();
    var wobble = 0;
    var lastAt = 0;
    var frameSrc = -1;
    var outAt = 0;                          // 进入淡出的时刻（0 = 还没开始）

    // 单条时间线：弹出(POP) → 停留(HOLD) → 淡出(OUT)，跑完自然停掉 rAF
    function run(now) {
      var dt = lastAt ? Math.min(0.05, (now - lastAt) / 1000) : 1 / 60;
      lastAt = now;
      wobble += dt * 4;                       // Strawberry::Update → wobble += dt*4
      var bob = Math.sin(wobble) * 2 * PX;    // sprite.Y = bloom.Y = light.Y = sin(wobble)*2

      var tp = Math.min(1, (now - born) / BERRY_POP_MS);
      var s = 0.2 + cubeOut(tp) * 0.8 + Math.sin(tp * Math.PI) * 0.1;   // 带回弹的弹出
      var op = Math.min(1, tp * 2.6);

      if (!outAt && now - born >= BERRY_POP_MS + BERRY_HOLD_MS) {
        outAt = now;
        setDim(false);
      }
      if (outAt) {
        var tf = Math.min(1, (now - outAt) / BERRY_OUT_MS);
        s = 1 + 0.85 * cubeInOut(tf);         // 放大淡出（相机回位前的收尾）
        op = 1 - tf;
        if (tf >= 1) {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          saveState({ lastRefresh: Date.now(), seeds: [], credited: false });
          combining = false;
          return;                            // 结束循环，不再排下一帧
        }
      }

      wrap.style.opacity = String(op.toFixed(2));
      wrap.style.transform = 'translate3d(' + cx + 'px,' + (cy + bob).toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + s.toFixed(3) + ')';

      // idle 循环 7 帧 @100ms（Sprites.xml frames="0-6,..."）
      var fi = Math.floor((now - born) / BERRY_FRAME_MS) % BERRY_FRAME_COUNT;
      if (fi !== frameSrc) { frameSrc = fi; img.src = berryFrames[fi].src; }

      requestAnimationFrame(run);
    }
    requestAnimationFrame(run);

    // 入账 berry 余额（仅当 api.js 已加载）；置 credited 防止中断后重复补账
    if (typeof window.addBerries === 'function') {
      try { window.addBerries(1); } catch (e) {}
    }
    var cs2 = loadState();
    cs2.credited = true;
    saveState(cs2);
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
    restoreFollowers(s);   // 已收集的籽在新页面重建为 follower（跨页面跟随）
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
