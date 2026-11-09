/* =====================================================================
   Celeste 第二章 (Old Site) · 镜子房间复刻
   ---------------------------------------------------------------------
   取证来源（全部为 Celeste.dll 的 IL 反编译，见 target/rea/*.txt）：
     Celeste.DreamMirror                      镜子本体：渲染 / 倒影 / shine / 破碎
     Celeste.DreamMirror+<BreakRoutine>d__26   倒影走向中心 → 闪光 → 碎裂 → Badeline 出场
     Celeste.CS02_Mirror+<Cutscene>d__7        过场时序（zoom / 相机上移 / 激活梦块）
     Celeste.DreamBlock(+<Activate>d__34)      梦块未激活态与激活协程
     Celeste.BadelineDummy / PlayerSprite      出场动画帧（idle / runFast / jumpFast）
     Celeste.Autotiler::orig_TileHandler       瓦片 3x3 自动拼接
   数据来源：Content/Maps/2-OldSite.bin → lvl_d3（见 js/celeste-mirror-map.js）
   素材来源：Content/Graphics/Atlases（Sprites.xml 给出帧表与 origin）
   ===================================================================== */
(function () {
'use strict';

var MAP = window.MIRROR_MAP;
var TILE = 8;
var ROOM_W = MAP.room.w, ROOM_H = MAP.room.h;
var COLS = ROOM_W / TILE, ROWS = ROOM_H / TILE;
var VIEW_W = 320, VIEW_H = 180;            // Celeste 原生视口（16:9）

var cv = null, ctx = null;                 // 由 MirrorScene.init 注入（独立页自动取 #cv）
var ctx_ready = false;
var W = 0, H = 0, Z = 1;
// 嵌入模式配置：drawBadeline=false 屏蔽自带 BadelineDummy（交 DOM 版）；
// onBreak=碎裂帧回调；onEnd=EndCutscene/OnEnd 帧回调（音乐起播点）；onDone=收尾归位后回调
var SCENE = { drawBadeline: true, onBreak: null, onEnd: null, onDone: null, onCam: null, autoStart: true, sting1Src: null, booted: false };
var _assetsReady = false, _sceneReady = false;

/* =====================================================================
   1. 素材
   ===================================================================== */
var BASE = 'Atlases/Gameplay/';
var IMG = {};
var PENDING = [];

function want(key, src) {
  PENDING.push({ key: key, src: src });
}
function loadAll(done) {
  var left = PENDING.length;
  if (!left) { done(); return; }
  PENDING.forEach(function (p) {
    var im = new Image();
    im.onload = function () { IMG[p.key] = im; if (--left === 0) done(); };
    im.onerror = function () { IMG[p.key] = null; if (--left === 0) done(); };
    im.src = p.src;
  });
  PENDING = [];
}

// 瓦片集（48x120 = 6x15 个 8x8 块，与 XML 里 tiles="x,y" 对应）
want('stone', BASE + 'tilesets/stone.png');
want('bgBrick', BASE + 'tilesets/bgBrick.png');
want('bgBrickRuined', BASE + 'tilesets/bgBrickRuined.png');
// 镜子
want('glassbg', BASE + 'objects/mirror/glassbg.png');       // 54x29
want('glassfg', BASE + 'objects/mirror/glassfg.png');       // 54x73（高光滚动用）
want('frame', BASE + 'objects/mirror/frame.png');           // 64x39
for (var gi = 0; gi < 10; gi++) want('glassbreak' + ('0' + gi).slice(-2), BASE + 'objects/mirror/glassbreak0' + gi + '.png');
// 梦块粒子（21x7 → 3 个 7x7 子图，ctor 里排成 [14,7,0,7] 四个索引）
want('dreamParticles', BASE + 'objects/dreamblock/particles.png');
// 粒子
want('shatter', BASE + 'particles/shatter.png');
want('circle', BASE + 'particles/circle.png');
// Badeline（characters/badeline/，Sprites.xml: <Justify x=".5" y="1"/>，帧 32x32）
var BD_ANIM = { idle: 9, runFast: 12, jumpFast: 2 };
Object.keys(BD_ANIM).forEach(function (a) {
  for (var i = 0; i < BD_ANIM[a]; i++) {
    want('bd:' + a + ':' + i, BASE + 'characters/badeline/' + a + ('0' + i).slice(-2) + '.png');
  }
});
// 剧情版 Badeline：fallSlow = jumpSlow02-03（漂浮）；curl = duck（被吸进去时的蜷缩压缩）
want('sb:fall0', BASE + 'characters/badeline/jumpSlow02.png');
want('sb:fall1', BASE + 'characters/badeline/jumpSlow03.png');
want('sb:curl', BASE + 'characters/badeline/duck.png');
// 星星背景 bgs/02/stars（a/b/c 各 0-3）—— Celeste.StarsBG.ctor:
// textures = [ GetAtlasSubtextures("bgs/02/stars/a"), .../b, .../c ]，每组 4 帧
var STAR_GROUPS = {
  a: ['star:a0', 'star:a1', 'star:a2', 'star:a3'],
  b: ['star:b0', 'star:b1', 'star:b2', 'star:b3'],
  c: ['star:c0', 'star:c1', 'star:c2', 'star:c3']
};
['a', 'b', 'c'].forEach(function (g) {
  for (var i = 0; i < 4; i++) want('star:' + g + i, BASE + 'bgs/02/stars/' + g + '0' + i + '.png');
});
// 悬浮碎块：Celeste.FloatingDebris 用的是 scenery/debris 图集里的 8x8 小格
want('debrisSheet', BASE + 'scenery/debris.png');          // 64x8 → 8 个 8x8 子图
// 前景碎石：Celeste.ForegroundDebris 用 scenery/fgdebris/rock_a* 或 rock_b*，逐层叠画
['a0', 'a1', 'a2', 'b0', 'b1'].forEach(function (n) {
  want('fgrk:' + n, BASE + 'scenery/fgdebris/rock_' + n.charAt(0) + '0' + n.charAt(1) + '.png');
});
// Badeline 消失/出现粒子 P_Vanish（本色是白色星屑，按发色染紫）
want('starfield0', BASE + 'particles/starfield/00.png');
// 贴花
MAP.decalsBg.concat(MAP.decalsFg).forEach(function (d) { want('decal:' + d[0], d[0]); });
// 前景视差（Style/Foregrounds）
want('mist', 'Atlases/Misc/mist.png');
want('vignette', 'Atlases/Misc/vignette.png');

/* =====================================================================
   2. 坐标 / 相机（Celeste Camera.Position 为视口中心；Zoom 缩放视野）
   ===================================================================== */
// 开场机位：本页无玩家，相机不跟随；取 y=216 让「上方暗淡梦块(128..192) + 镜子(225..264)」同时入框。
// 原作相机跟玩家时大致在 240 附近；过场的 ZoomTo 目标仍是原作硬值 (160,240)。
var cam = { x: 160, y: 216, zoom: 1, shakeT: 0, sx: 0, sy: 0 };
var zoomTween = null;

function resize() {
  if (!cv) return;
  var r = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * r); cv.height = Math.round(H * r);
  ctx.setTransform(r, 0, 0, r, 0, 0);
  ctx.imageSmoothingEnabled = false;
  Z = H / VIEW_H;                                  // 1 世界像素 = Z 屏幕像素（zoom=1 时）
}
window.addEventListener('resize', resize);

function S(v) { return v * Z * cam.zoom; }          // 世界长度 → 屏幕长度
function toScreen(wx, wy) {
  var z = Z * cam.zoom;
  return { x: W / 2 + (wx - cam.x) * z + cam.sx, y: H / 2 + (wy - cam.y) * z + cam.sy };
}
function viewW() { return VIEW_W / cam.zoom; }
function viewH() { return VIEW_H / cam.zoom; }
function cull(wx, wy, ww, wh) {
  var l = cam.x - viewW() / 2, t = cam.y - viewH() / 2;
  return !(wx + ww < l || wx > l + viewW() || wy + wh < t || wy > t + viewH());
}

/* =====================================================================
   3. 协程（yield null = 下一帧；yield n = 等 n 秒；yield* = 串行嵌套）
   ===================================================================== */
var coros = [];
function startCoro(g) { var c = { g: g, wait: 0, done: false }; coros.push(c); return c; }
function pumpCoros(dt) {
  for (var i = coros.length - 1; i >= 0; i--) {
    var c = coros[i];
    if (c.done) { coros.splice(i, 1); continue; }
    if (c.wait > 0) {
      c.wait -= dt;
      if (c.wait > 0) continue;
    }
    var r = c.g.next();
    if (r.done) { c.done = true; continue; }
    c.wait = (typeof r.value === 'number' && r.value > 0) ? r.value : 0;
  }
}

/* =====================================================================
   4. Autotiler —— 复刻 Celeste.Autotiler::orig_TileHandler
   ---------------------------------------------------------------------
   瓦片字符即 tileset id；3x3 mask（行优先 9 位）匹配顺序：
     『x』通配 / 『0』需空 / 『1』需实心 / 『3』需同 id
   命中取 Masked；否则 3x3 全实心时 CheckCross 决定 Center 还是 Padded。
   房间外按 EdgesExtend=true 处理（GenerateMap: Behaviour.EdgesExtend = true）。
   ===================================================================== */
var AT_EDGES = [
  ['x0x-111-x1x', 0], ['x1x-111-x0x', 1], ['x1x-011-x1x', 2], ['x1x-110-x1x', 3],
  ['x0x-111-x0x', 4], ['x1x-010-x1x', 5], ['x0x-010-x1x', 6], ['x1x-010-x0x', 7],
  ['x0x-011-x0x', 8], ['x0x-110-x0x', 9], ['x0x-010-x0x', 10], ['x0x-011-x1x', 11],
  ['x0x-110-x1x', 12], ['x1x-011-x0x', 13], ['x1x-110-x0x', 14]
];
var AT_CORNERS = {
  '111-111-110': [4, 0], '110-111-111': [4, 1], '111-111-011': [4, 2], '011-111-111': [4, 3],
  '110-111-110': [4, 4], '010-111-111': [4, 5], '011-111-011': [4, 6], '111-111-010': [4, 7],
  '010-111-110': [4, 8], '010-111-011': [4, 9], '011-111-010': [4, 10], '110-111-010': [4, 11],
  '010-111-010': [4, 12], '110-111-011': [4, 13], '011-111-110': [4, 14]
};
// ForegroundTiles.xml: <Tileset id="6" copy="z" path="stone"> → padding 5,0-5,11 / center 5,12
var AT_FG_PAD = [];
for (var fp = 0; fp < 12; fp++) AT_FG_PAD.push([5, fp]);
var AT_FG_CENTER = [[5, 12]];
// BackgroundTiles.xml: id 2/3 copy="z" → padding/center 同为 4,5-4,14 + 5,0-5,14
var AT_BG_ALL = [];
for (var bp = 5; bp < 15; bp++) AT_BG_ALL.push([4, bp]);
for (var bgp = 0; bgp < 15; bgp++) AT_BG_ALL.push([5, bgp]);

function pick(list, tx, ty) {                     // Calc.Choose 的确定性替代
  var h = Math.imul(tx | 0, 374761393) + Math.imul(ty | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return list[((h ^ (h >>> 16)) >>> 0) % list.length];
}
function tileChar(grid, tx, ty) {                 // GetTile + EdgesExtend=true → Clamp
  var x = tx < 0 ? 0 : (tx >= COLS ? COLS - 1 : tx);
  var y = ty < 0 ? 0 : (ty >= ROWS ? ROWS - 1 : ty);
  return grid[y].charAt(x);
}
function tileSolid(grid, tx, ty) { return tileChar(grid, tx, ty) !== '0'; }   // IsEmpty: '0' / 48

function autoTile(set, grid, tx, ty) {
  var nb = [], chars = [], all = true;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var c = tileChar(grid, tx + dx, ty + dy);
      var s = c !== '0';
      chars.push(c); nb.push(s);
      if ((dx || dy) && !s) all = false;
    }
  }
  if (all) {
    // CheckCross：两格外是否还有实心（大块内部 → Center，孤岛 → Padded）
    var far = tileSolid(grid, tx - 2, ty) || tileSolid(grid, tx + 2, ty) ||
              tileSolid(grid, tx, ty - 2) || tileSolid(grid, tx, ty + 2);
    if (set === 'fg') return pick(far ? AT_FG_CENTER : AT_FG_PAD, tx, ty);
    return pick(AT_BG_ALL, tx, ty);
  }
  var mask = '';
  for (var i = 0; i < 9; i++) mask += nb[i] ? '1' : '0';
  for (var e = 0; e < AT_EDGES.length; e++) {
    if (maskMatch(AT_EDGES[e][0], mask, chars, tileChar(grid, tx, ty))) {
      return [(Math.abs(tx * 7 + ty * 13) % 4), AT_EDGES[e][1]];
    }
  }
  var corner = AT_CORNERS[mask];
  if (corner) return corner;
  if (set === 'fg') return pick(AT_FG_CENTER, tx, ty);
  return pick(AT_BG_ALL, tx, ty);
}
function maskMatch(pat, mask, chars, self) {
  var k = 0;
  for (var i = 0; i < pat.length; i++) {
    var p = pat.charAt(i);
    if (p === '-') continue;
    if (p === 'x') { k++; continue; }
    if (p === '1' && mask.charAt(k) !== '1') return false;
    if (p === '0' && mask.charAt(k) !== '0') return false;
    if (p === '3' && chars[k] !== self) return false;
    k++;
  }
  return true;
}

var SOLID_TILES = [], BG_TILES = [];
function buildTiles() {
  SOLID_TILES = []; BG_TILES = [];
  for (var ty = 0; ty < ROWS; ty++) {
    for (var tx = 0; tx < COLS; tx++) {
      var cs = MAP.solids[ty].charAt(tx);
      if (cs !== '0') {
        var t = autoTile('fg', MAP.solids, tx, ty);
        SOLID_TILES.push({ tx: tx, ty: ty, sx: t[0] * TILE, sy: t[1] * TILE, k: 'stone' });
      }
      var cb = MAP.bg[ty].charAt(tx);
      if (cb !== '0') {
        var b = autoTile('bg', MAP.bg, tx, ty);
        BG_TILES.push({
          tx: tx, ty: ty, sx: b[0] * TILE, sy: b[1] * TILE,
          k: cb === '3' ? 'bgBrickRuined' : 'bgBrick'
        });
      }
    }
  }
}

/* =====================================================================
   5. 梦块 DreamBlock —— 未激活 / 激活双态（IL: DreamBlock.Update / Render）
   ---------------------------------------------------------------------
   一个 playerHasDreamDash 字段同时控制四件事：
     ① 底色与线条色（disabledBack #1f2e2d / disabledLine #6a8480）
     ② 粒子是否按层改彩（未激活恒 LightGray * (0.5 + Layer/2*0.5)）
     ③ animTimer / wobbleEase 是否推进（未激活完全冻结）
     ④ LightOcclude(1f) 的存在（本房间无光照系统，不参与绘制）
   ===================================================================== */
var DREAM_ACTIVE_BACK = '#000000';
var DREAM_DISABLED_BACK = '#1f2e2d';
var DREAM_ACTIVE_LINE = '#FFFFFF';
var DREAM_DISABLED_LINE = '#6a8480';
var DREAM_LAYER_COLORS = [
  ['#FFEF11', '#FF00D0', '#08a310'],
  ['#5fcde4', '#7fb25e', '#E0564C'],
  ['#5b6ee1', '#CC3B3B', '#7daa64']
];
var DREAM_TEX_SX = [14, 7, 0, 7];

var DREAM = {
  x: 120, y: 128, w: 80, h: 64,
  playerHasDreamDash: false,
  animTimer: 0,
  wobbleFrom: Math.random() * Math.PI * 2,
  wobbleTo: Math.random() * Math.PI * 2,
  wobbleEase: 0,
  whiteFill: 0, whiteHeight: 1,
  shakeX: 0, shakeY: 0,
  shaker: null,
  particles: []
};

function rnd(a, b) { return a + Math.random() * (b - a); }
function pickOne(a) { return a[(Math.random() * a.length) | 0]; }

// IL Setup()：粒子数 = (int)(W/8*H/8*0.7)，Layer ← Choose(0,1,1,2,2,2)
function dreamSetup() {
  var n = Math.floor(DREAM.w / 8 * DREAM.h / 8 * 0.7);
  DREAM.particles = [];
  for (var i = 0; i < n; i++) {
    var layer = pickOne([0, 1, 1, 2, 2, 2]);
    var color;
    if (DREAM.playerHasDreamDash) color = pickOne(DREAM_LAYER_COLORS[layer]);
    else {
      var v = Math.round(211 * (0.5 + layer / 2 * 0.5));      // LightGray = 211，逐层变亮
      color = 'rgb(' + v + ',' + v + ',' + v + ')';
    }
    DREAM.particles.push({
      x: rnd(0, DREAM.w), y: rnd(0, DREAM.h),
      layer: layer, timeOffset: Math.random(), color: color
    });
  }
}

// IL Update()：只有激活态才 animTimer += 6dt / wobbleEase += 2dt
function dreamUpdate(dt) {
  if (DREAM.playerHasDreamDash) {
    DREAM.animTimer += 6 * dt;
    DREAM.wobbleEase += 2 * dt;
    if (DREAM.wobbleEase > 1) {
      DREAM.wobbleEase = 0;
      DREAM.wobbleFrom = DREAM.wobbleTo;
      DREAM.wobbleTo = rnd(0, Math.PI * 2);
    }
  }
  if (DREAM.shaker) {
    DREAM.shaker.t += dt;
    if (DREAM.shaker.t >= DREAM.shaker.interval) {
      DREAM.shaker.t = 0;
      DREAM.shakeX = rnd(-1, 1);
      DREAM.shakeY = rnd(-1, 1);
    }
  }
}

// IL LineAmplitude(t, i) = (sin(t + i/16 + sin(t*2 + i/32)*2π) + 1) * 1.5
function dreamLineAmp(t, i) {
  return (Math.sin(t + i / 16 + Math.sin(t * 2 + i / 32) * Math.PI * 2) + 1) * 1.5;
}
function dreamLerp(a, b, t) { return a + (b - a) * t; }
function toWhite(hex, t) {
  var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  return 'rgb(' + Math.round(dreamLerp(r, 255, t)) + ',' + Math.round(dreamLerp(g, 255, t)) + ',' +
         Math.round(dreamLerp(b, 255, t)) + ')';
}
function dreamPutInside(x, y) {                    // Monocle.Calc.PutInside 回卷
  var w = DREAM.w, h = DREAM.h;
  x = ((x % w) + w) % w;
  y = ((y % h) + h) % h;
  return { x: x, y: y };
}

// IL WobbleLine(a, b, offset, backColor, lineColor)
function dreamWobbleLine(ax, ay, bx, by, offsetArg, backColor, lineColor) {
  if (DREAM.whiteFill > 0) {
    backColor = toWhite(backColor, DREAM.whiteFill);
    lineColor = toWhite(lineColor, DREAM.whiteFill);
  }
  var lx = bx - ax, ly = by - ay;
  var len = Math.sqrt(lx * lx + ly * ly);
  if (len < 4) return;
  var dirX = lx / len, dirY = ly / len;
  var perpX = dirY, perpY = -dirX;
  var off = 0, step = 16, i = 2;
  var p0 = toScreen(ax, ay);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(1, Z * cam.zoom);
  while (i < len - 2) {
    var amp = dreamLerp(dreamLineAmp(DREAM.wobbleFrom + offsetArg, i),
                        dreamLineAmp(DREAM.wobbleTo + offsetArg, i), DREAM.wobbleEase);
    if (i + step >= len) amp = 0;
    var add = Math.min(step, len - 2 - i);
    var px = ax + dirX * i + perpX * off, py = ay + dirY * i + perpY * off;
    var nx = ax + dirX * (i + add) + perpX * amp, ny = ay + dirY * (i + add) + perpY * amp;
    strokeWorld(px - perpX, py - perpY, nx - perpX, ny - perpY, backColor);      // 阴影 1
    strokeWorld(px - perpX * 2, py - perpY * 2, nx - perpX * 2, ny - perpY * 2, backColor); // 阴影 2
    strokeWorld(px, py, nx, ny, lineColor);
    off = amp;
    i += step;
  }
  void p0;
}
function strokeWorld(ax, ay, bx, by, color) {
  var a = toScreen(ax, ay), b = toScreen(bx, by);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, S(1));            // Monocle.Draw.Line：1 游戏像素粗
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

// IL Render()：底色 → 粒子 → whiteFill → 四条 WobbleLine → 四角 2x2
function drawDream() {
  var b = DREAM;
  if (!cull(b.x, b.y, b.w, b.h)) return;
  var active = b.playerHasDreamDash;
  var backColor = active ? DREAM_ACTIVE_BACK : DREAM_DISABLED_BACK;
  var lineColor = active ? DREAM_ACTIVE_LINE : DREAM_DISABLED_LINE;
  var sx = b.shakeX, sy = b.shakeY;
  var o = toScreen(b.x + sx, b.y + sy);

  ctx.fillStyle = backColor;
  ctx.fillRect(Math.round(o.x), Math.round(o.y), Math.round(S(b.w)), Math.round(S(b.h)));

  // 粒子：Position + Camera.Position * (0.3 + 0.25*Layer) → PutInside → 越界 2px 剔除
  var sheet = IMG.dreamParticles;
  if (sheet) {
    var camL = cam.x - viewW() / 2, camT = cam.y - viewH() / 2;
    var ps = S(7);
    for (var k = 0; k < b.particles.length; k++) {
      var e = b.particles[k];
      var par = 0.3 + 0.25 * e.layer;
      var pos = dreamPutInside(e.x + camL * par, e.y + camT * par);
      if (pos.x < 2 || pos.y < 2 || pos.x >= b.w - 2 || pos.y >= b.h - 2) continue;
      var idx;
      if (e.layer === 2) idx = 2;
      else if (e.layer === 1) idx = 1 + (((e.timeOffset * 2 + b.animTimer) % 2) | 0);
      else idx = 3 - (((e.timeOffset * 4 + b.animTimer) % 4) | 0);
      var tex = tintedDream(e.color);
      if (!tex) continue;
      var pp = toScreen(b.x + pos.x + sx, b.y + pos.y + sy);
      ctx.drawImage(tex, DREAM_TEX_SX[idx], 0, 7, 7,
        Math.round(pp.x - ps / 2), Math.round(pp.y - ps / 2), Math.round(ps), Math.round(ps));
    }
  }

  // whiteFill：Draw.Rect(X, Y, Width, Height*whiteHeight, White*whiteFill)
  if (b.whiteFill > 0) {
    ctx.globalAlpha = Math.min(1, b.whiteFill);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(Math.round(o.x), Math.round(o.y),
      Math.round(S(b.w)), Math.round(S(b.h * b.whiteHeight)));
    ctx.globalAlpha = 1;
  }

  dreamWobbleLine(b.x + sx, b.y + sy, b.x + b.w + sx, b.y + sy, 0.0, backColor, lineColor);
  dreamWobbleLine(b.x + b.w + sx, b.y + sy, b.x + b.w + sx, b.y + b.h + sy, 0.7, backColor, lineColor);
  dreamWobbleLine(b.x + b.w + sx, b.y + b.h + sy, b.x + sx, b.y + b.h + sy, 1.5, backColor, lineColor);
  dreamWobbleLine(b.x + sx, b.y + b.h + sy, b.x + sx, b.y + sy, 2.5, backColor, lineColor);

  ctx.fillStyle = lineColor;
  var cw = Math.max(1, Math.round(S(2)));
  var corners = [[b.x + sx, b.y + sy], [b.x + b.w - 2 + sx, b.y + sy],
                 [b.x + sx, b.y + b.h - 2 + sy], [b.x + b.w - 2 + sx, b.y + b.h - 2 + sy]];
  for (var c = 0; c < 4; c++) {
    var cp = toScreen(corners[c][0], corners[c][1]);
    ctx.fillRect(Math.round(cp.x), Math.round(cp.y), cw, cw);
  }
  ctx.lineWidth = 1;
}

// 把白色粒子贴图染成指定颜色（XNA Color.Multiply 语义）
var DREAM_TINT = {};
function tintedDream(color) {
  if (DREAM_TINT[color]) return DREAM_TINT[color];
  var sheet = IMG.dreamParticles;
  if (!sheet) return null;
  var c = document.createElement('canvas');
  c.width = sheet.width; c.height = sheet.height;
  var g = c.getContext('2d');
  g.drawImage(sheet, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(sheet, 0, 0);
  DREAM_TINT[color] = c;
  return c;
}

/* =====================================================================
   6. 镜子 DreamMirror
   ---------------------------------------------------------------------
   IL 取证（Celeste.DreamMirror）：
     .ctor        Depth=9500；shineAlpha=0.5；reflectionAlpha=0.7；
                  breakingGlass = SpriteBank.Create("glass").Play("idle")
     Added        frame Entity(Depth 9000) + Image("objects/mirror/frame").JustifyOrigin(0.5,1)
                  未碎时才建 reflection / reflectionSprite(PlayerSprite(2)) / reflectionHair(#9B3FB5)
     BeforeRender shineOffset = glassfg.Height - (int)(Camera.Y*0.8 % glassfg.Height)
                  target：glassbg → reflection.Render() → glassfg(0,off) → glassfg(0,off-73)
     Render       smashed ? breakingGlass.Render()
                          : Draw(target, Position-Origin, White*0.7) + frame.Render()
   Sprites.xml：<glass path="objects/mirror/" start="idle"><Justify x=".5" y="1"/>
                  idle=glassbg(0) / break=glassbreak00-08(0.08) goto broken=glassbreak09
   ===================================================================== */
var GLASS_W = 54, GLASS_H = 29;       // glassbg / glassbreak 尺寸（Origin = 27,29 底部中心）
var GLASS_FG_H = 73;                  // glassfg 高光条高度（滚动周期）
var FRAME_W = 64, FRAME_H = 39;       // frame.png

var MIRROR = {
  x: 160, y: 264,                     // lvl_d3 dreammirror 的 EntityData.Position
  originX: 27, originY: 29,
  shineAlpha: 0.5, reflectionAlpha: 0.7,
  updateShine: true, autoUpdateReflection: true,
  shineOffset: 0,
  smashed: false, smashEnded: false,
  breakT: 0,                          // break 帧计时（delay 0.08）
  target: null, tg: null,
  // 倒影：目标贴图内坐标系（0..54 x 0..29），脚底落在玻璃底边
  refl: { x: 35, y: GLASS_H, anim: 'idle', frame: 0, t: 0, flip: -1, hair: null, show: true }
};

function mirrorInit() {
  var c = document.createElement('canvas');
  c.width = GLASS_W; c.height = GLASS_H;
  MIRROR.target = c;
  MIRROR.tg = c.getContext('2d');
  MIRROR.tg.imageSmoothingEnabled = false;
  MIRROR.shineOffset = 73 - Math.floor(Math.abs(cam.y * 0.8) % 73);
}

// IL BeforeRender：只有 updateShine 时才跟随相机重新取高光位置（破碎前 0.05s 会冻结在 33）
function mirrorUpdate(dt) {
  if (MIRROR.updateShine) {
    var m = (cam.y * 0.8) % GLASS_FG_H;
    if (m < 0) m += GLASS_FG_H;
    MIRROR.shineOffset = GLASS_FG_H - Math.floor(m);
  }
  if (MIRROR.smashed) MIRROR.breakT += dt;
  var r = MIRROR.refl;
  r.t += dt;
  var d = BD_DELAY[r.anim] || 0.1;
  r.frame = Math.floor(r.t / d) % (BD_ANIM[r.anim] || 1);
  if (r.hair && r.show) r.hair.update(r.x, r.y, -1, 0, 0, dt, 1);
}

// IL BeforeRender 的渲染目标：54x29 离屏画布（PointClamp → 最近邻放大）
function mirrorDrawTarget() {
  var g = MIRROR.tg;
  if (!g) return null;
  g.clearRect(0, 0, GLASS_W, GLASS_H);
  if (IMG.glassbg) g.drawImage(IMG.glassbg, 0, 0);

  var r = MIRROR.refl;
  if (r.show) {
    // 先头发后身体（与原作组件顺序一致：发尾压后、身体盖住发根），倒影沿镜面轴翻转
    if (r.hair) {
      r.hair.draw(g, function (n) { return { x: 2 * r.x - n.x, y: n.y }; }, 1, 0, 1);
    }
    var img = IMG['bd:' + r.anim + ':' + r.frame];
    if (img) {
      g.save();
      g.translate(r.x, r.y);
      g.scale(r.flip < 0 ? -1 : 1, 1);       // 镜中左右翻转
      g.drawImage(img, -16, -32);            // Origin (16,32) 底部中心
      g.restore();
    }
  }

  if (IMG.glassfg) {
    g.globalAlpha = MIRROR.shineAlpha;
    g.drawImage(IMG.glassfg, 0, MIRROR.shineOffset);
    g.drawImage(IMG.glassfg, 0, MIRROR.shineOffset - GLASS_FG_H);
    g.globalAlpha = 1;
  }
  return MIRROR.target;
}

// IL Render：Position - Origin 落点 + frame 底边贴 Position.Y
function mirrorDraw() {
  var x = MIRROR.x, y = MIRROR.y;
  if (!cull(x - 40, y - 52, 80, 84)) return;
  var z = Z * cam.zoom;

  if (MIRROR.smashed) {
    // IL：smashed 后不再画 target，只画 breakingGlass（frame 由 Depth 9000 的独立 Entity 继续画）
    var f = Math.min(9, Math.floor(MIRROR.breakT / 0.08));
    var bi = IMG['glassbreak' + ('0' + f).slice(-2)];
    if (bi) {
      var bp = toScreen(x - MIRROR.originX, y - MIRROR.originY);
      ctx.drawImage(bi, Math.round(bp.x), Math.round(bp.y),
        Math.round(GLASS_W * z), Math.round(GLASS_H * z));
    }
  } else {
    var t = mirrorDrawTarget();
    if (t) {
      var tp = toScreen(x - MIRROR.originX, y - MIRROR.originY);
      ctx.globalAlpha = MIRROR.reflectionAlpha;
      ctx.drawImage(t, Math.round(tp.x), Math.round(tp.y),
        Math.round(GLASS_W * z), Math.round(GLASS_H * z));
      ctx.globalAlpha = 1;
    }
  }

  if (IMG.frame) {
    var fp = toScreen(x - FRAME_W / 2, y - FRAME_H);
    ctx.drawImage(IMG.frame, Math.round(fp.x), Math.round(fp.y),
      Math.round(FRAME_W * z), Math.round(FRAME_H * z));
  }
}

/* =====================================================================
   7. Badeline（Celeste.BadelineDummy）
   ---------------------------------------------------------------------
   .ctor        new PlayerSprite(2) → characters/badeline/（Sprites.xml <Justify .5,1>）
                Hair = PlayerHair(Sprite){Color=#9B3FB5, Border=Black, Facing=-1}
                Sprite.Scale.X = -1；Floatness=2（本过场里被置 0，所以不上下浮动）
   Update       Hair.Facing = Sign(Sprite.Scale.X)
   Render       RenderPosition = Calc.Floor(RenderPosition)
   帧表        idle 0-8 delay .1 / runFast 0-11 delay .05 / jumpFast 0-1 delay .1
   ===================================================================== */
var BD = {
  alive: false, x: 0, y: 0, vx: 0, vy: 0,
  anim: 'idle', frame: 0, t: 0, scaleX: -1,
  hair: null
};
var BD_DELAY = { idle: 0.1, runFast: 0.05, jumpFast: 0.1 };

var HAIR_TEX = null;
function loadHair(done) {
  if (!window.CelesteHair) { done(); return; }
  window.CelesteHair.load('Atlases/Gameplay/characters/player', window.CelesteHair.BADELINE)
    .then(function (t) { HAIR_TEX = t; done(); })
    .catch(function () { done(); });
}
function makeHair() {
  if (!HAIR_TEX) return null;
  return new window.CelesteHair.Hair(HAIR_TEX);
}

function bdPlay(anim) {
  if (BD.anim === anim) return;
  BD.anim = anim; BD.frame = 0; BD.t = 0;
}
function bdSpawn(x, y, hairNodes) {
  BD.alive = true;
  BD.x = x; BD.y = y; BD.vx = 0; BD.vy = 0; BD.scaleX = -1;
  bdPlay('idle'); BD.t = 0;
  BD.hair = makeHair();
  if (BD.hair) {
    if (hairNodes && hairNodes.length) {
      // IL：badeline.Hair.Nodes[i] = reflectionHair.Nodes[i]（镜内局部 → 世界）
      BD.hair.nodes = hairNodes.map(function (n) {
        return { x: MIRROR.x - MIRROR.originX + n.x, y: MIRROR.y - MIRROR.originY + n.y };
      });
    } else {
      BD.hair.reset(x, y, -1);
    }
  }
}
function bdUpdate(dt) {
  if (!BD.alive) return;
  BD.t += dt;
  var d = BD_DELAY[BD.anim] || 0.1;
  BD.frame = Math.floor(BD.t / d) % (BD_ANIM[BD.anim] || 1);
  if (BD.hair) BD.hair.update(Math.floor(BD.x), Math.floor(BD.y), BD.scaleX < 0 ? -1 : 1, 0, 0, dt, 1);
}
function bdDraw() {
  if (!SCENE.drawBadeline) return;
  if (!BD.alive) return;
  var x = Math.floor(BD.x), y = Math.floor(BD.y);
  if (!cull(x - 20, y - 40, 40, 48)) return;
  if (BD.hair) BD.hair.draw(ctx, function (n) { return toScreen(n.x, n.y); }, Z * cam.zoom, 0, 1);
  var img = IMG['bd:' + BD.anim + ':' + BD.frame];
  if (!img) return;
  var p = toScreen(x, y), sz = S(32);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.scale(BD.scaleX < 0 ? -1 : 1, 1);
  ctx.drawImage(img, -Math.round(sz / 2), -Math.round(sz),
    Math.round(sz), Math.round(sz));
  ctx.restore();
}

/* =====================================================================
   8. 粒子 + 扩散环
   ---------------------------------------------------------------------
   P_Shatter（BreakRoutine 里每 8px 采一次，Chance(0.5) 决定是否发 2 枚）
   P_Vanish （BadelineDummy.Appear / Vanish：Emit(P_Vanish, 12, Center, One*6)）
   WingsBurst（DreamBlock Activate：底边每 4px 一枚，向上飘）
   ===================================================================== */
var parts = [];
var rings = [];

function partAdd(p) { if (parts.length < 500) parts.push(p); }

function updateParts(dt) {
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.pv) p.age += dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    if (p.pv) {
      // P_Vanish：SpeedMultiplier 0.3 → 每帧速度 ×0.3^dt（约 1.204/s 指数衰减）
      var k0 = Math.pow(0.3, dt);
      p.vx *= k0; p.vy *= k0;
    } else if (p.drag) {
      var k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k;
    }
    if (p.rotSpeed) p.rot += p.rotSpeed * dt;
  }
  for (var j = rings.length - 1; j >= 0; j--) {
    rings[j].t += dt;
    if (rings[j].t >= rings[j].dur) rings.splice(j, 1);
  }
}

function drawParts() {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.pv) {
      // P_Vanish：1px 白点贴图，每 0.1s 在 #6F2399 / #EC76F7 之间切换，末段 25% 淡出
      var ps = toScreen(p.x, p.y);
      var c02 = (Math.floor(p.age / 0.1) % 2) === 0 ? '#6F2399' : '#EC76F7';
      var rem = p.life / p.max;
      var a02 = rem < 0.25 ? rem / 0.25 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, a02));
      ctx.fillStyle = c02;
      var sz02 = Math.max(1, Math.round(Z * cam.zoom));
      ctx.fillRect(Math.round(ps.x), Math.round(ps.y), sz02, sz02);
      continue;
    }
    var img = IMG[p.tex];
    if (!img) continue;
    var s = toScreen(p.x, p.y);
    var z = Z * cam.zoom * (p.scale || 1);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    if (p.rot) ctx.rotate(p.rot);
    ctx.drawImage(img, -img.width * z / 2, -img.height * z / 2, img.width * z, img.height * z);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  for (var k = 0; k < rings.length; k++) {
    var r = rings[k], e = r.t / r.dur;
    var c = toScreen(r.x, r.y);
    ctx.globalAlpha = (1 - e) * 0.7;
    ctx.strokeStyle = r.color || '#c8a2ff';
    ctx.lineWidth = Math.max(1, S(2) * (1 - e));
    ctx.beginPath();
    ctx.arc(c.x, c.y, S(r.r0 + (r.r1 - r.r0) * e), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// IL：for (x=-W/2; x<W/2; x+=8) for (y=-H; y<0; y+=8) if (Chance(.5)) Emit(P_Shatter, 2, ..., (8,8), angle)
function emitShatter() {
  var W = GLASS_W, H = GLASS_H;
  for (var x = -W / 2; x < W / 2; x += 8) {
    for (var y = -H; y < 0; y += 8) {
      if (Math.random() >= 0.5) continue;
      var ang = Math.atan2(y - (-H), x - (-W / 2));   // Calc.Angle(new Vector2(-W/2,-H), new Vector2(x,y))
      for (var k = 0; k < 2; k++) {
        var sp = rnd(24, 90);
        partAdd({
          tex: 'shatter', x: MIRROR.x + x + 4, y: MIRROR.y + y + 4,
          vx: Math.cos(ang) * sp + rnd(-14, 14), vy: Math.sin(ang) * sp + rnd(-26, 8),
          g: 340, drag: 0.6, life: rnd(0.45, 0.85), max: 0.85,
          rot: rnd(0, 6.28), rotSpeed: rnd(-10, 10), scale: rnd(0.7, 1.4)
        });
      }
    }
  }
}

// BadelineDummy.Appear：AddBurst(Center, .5, 24, 96, .4) + Emit(P_Vanish, 12, Center, One*6)
function emitVanish(x, y) {
  rings.push({ x: x, y: y, t: 0, dur: 0.4, r0: 10, r1: 46, color: '#c8a2ff' });
  for (var i = 0; i < 12; i++) {
    var a = Math.random() * Math.PI * 2, sp = rnd(30, 140);
    partAdd({
      tex: 'vanish', x: x + rnd(-6, 6), y: y + rnd(-6, 6),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      g: 0, drag: 3.2, life: rnd(0.3, 0.65), max: 0.65,
      rot: rnd(0, 6.28), rotSpeed: rnd(-8, 8), scale: rnd(0.8, 1.5)
    });
  }
}

/* =====================================================================
   8.5 梦境剧情（测试版）：Badeline 穿进梦块 → 消失
   ---------------------------------------------------------------------
   mirror 房间不出现 Madeline，也不播出场/台词；出场与「亲爱的，祝你好梦」
   交给宿主 dream 场景（shelf.js）在切回雪夜时播放。
   出场参数取自 docs/badeline-appear-rea.md（CS10_BadelineHelps.BadelineAppears）：
     Scale=1 直接生成，无闪光；Displacement.AddBurst(.5, 8→32, .5)
     FloatTo(player.Center + (18,-10))，FloatSpeed 120 / FloatAccel 240
     悬浮正弦 0.25Hz、Floatness 2→4→2；P_Vanish 12 颗（见 emitPVanish）
   状态机（localStorage，60 分钟过期）：sleep → dived → appeared → diaryShown
   dived 由 mirror 写入；appeared 由 dream 场景播完出场后写入
   ===================================================================== */
var STORY_KEY = 'badelineMirrorStoryV1';
var STORY_TTL = 60 * 60 * 1000;
var STORY = { stage: 'sleep', gen: 0, hostGet: null, hostHide: null, hostDone: null };
var PENDING_STORY_ENTER = false;

function storyRead() {
  try {
    var raw = localStorage.getItem(STORY_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || !s.stage) { localStorage.removeItem(STORY_KEY); return null; }
    if (!s.expiresAt || Date.now() > s.expiresAt) { localStorage.removeItem(STORY_KEY); return null; }
    return s;
  } catch (e) { return null; }
}
function storyWrite(stage) {
  var now = Date.now();
  STORY.stage = stage;
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify({
      stage: stage, updatedAt: now, expiresAt: now + STORY_TTL
    }));
  } catch (e) {}
}
function storyReset() {
  try { localStorage.removeItem(STORY_KEY); } catch (e) {}
  STORY.stage = 'sleep';
  STORY.gen++;
  sbClear();
  storySyncBar();
}

// 剧情版 Badeline（和过场里的 BD 分开，互不干扰）
var SB = {
  alive: false, x: 0, y: 0, anim: 'fallSlow', frame: 0, t: 0,
  scaleX: -1, alpha: 1, size: 1, sx: 1, sy: 1, sineT: 0, floatness: 2, hair: null
};
var SB_FALL = ['sb:fall0', 'sb:fall1'];
var SB_CURL = ['sb:curl'];

function sbFrames() { return SB.anim === 'curl' ? SB_CURL : SB_FALL; }
function sbPlay(a) { if (SB.anim === a) return; SB.anim = a; SB.t = 0; SB.frame = 0; }
function sbClear() {
  SB.alive = false; SB.hair = null;
  SB.alpha = 1; SB.size = 1; SB.sx = 1; SB.sy = 1;
}
// 生成时头发必须已经在头上（穿走第一帧就可见）：reset 后先空跑几秒模拟让它收敛
function settleHair(h, x, y, facing) {
  if (!h) return;
  h.reset(x, y, facing);
  for (var i = 0; i < 90; i++) h.update(Math.round(x), Math.round(y), facing, 0, 0, 0.05, 1);
}
function sbSpawn(x, y, scaleX) {
  SB.alive = true; SB.x = x; SB.y = y; SB.scaleX = scaleX || -1;
  SB.alpha = 1; SB.size = 1; SB.sx = 1; SB.sy = 1; SB.floatness = 2;
  SB.sineT = Math.random() * 4;
  sbPlay('fallSlow');
  SB.hair = makeHair();
  settleHair(SB.hair, x, y, SB.scaleX);
}

function sbUpdate(dt) {
  if (!SB.alive) return;
  SB.t += dt;
  var d = SB.anim === 'dreamDash' ? 0.03 : 0.1;
  var n = sbFrames().length;
  SB.frame = Math.floor(SB.t / d) % n;
  SB.sineT += dt * 0.25;                  // 0.25Hz
  if (SB.hair) {
    SB.hair.update(Math.floor(SB.x), Math.floor(SB.y), SB.scaleX < 0 ? -1 : 1, 0, 0, dt, 1);
  }
}
function sbDraw() {
  if (!SB.alive) return;
  var x = Math.floor(SB.x);
  var y = Math.floor(SB.y);
  if (SB.anim === 'fallSlow') y += Math.round(Math.sin(SB.sineT * Math.PI * 2) * SB.floatness);
  if (!cull(x - 24, y - 52, 48, 56)) return;
  ctx.globalAlpha = Math.max(0, Math.min(1, SB.alpha));
  if (SB.hair) SB.hair.draw(ctx, function (n) { return toScreen(n.x, n.y); }, Z * cam.zoom, 0, SB.size * SB.sx);
  var keys = sbFrames(), img = IMG[keys[SB.frame]];
  if (img) {
    var p = toScreen(x, y);
    var w = S(32) * SB.size * SB.sx, h = S(32) * SB.size * SB.sy;
    ctx.save();
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.scale(SB.scaleX < 0 ? -1 : 1, 1);
    ctx.drawImage(img, -Math.round(w / 2), -Math.round(h), Math.round(w), Math.round(h));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// 穿走：① 贴近块面 → ② 被吸进去（加速 + 收缩）→ ③ 块面吞没（淡出）。
// 安静的穿走：不加粒子、不加气泡/文字、不加音效。
function* storyDive(from) {
  var gen = STORY.gen;
  var start = from || { x: MIRROR.x, y: MIRROR.y };
  sbSpawn(start.x, start.y, -1);
  yield 0.05;
  if (gen !== STORY.gen) return;

  // ① 飞向梦块底边（FloatTo：速度上限 120，加速度 240）
  var ex = DREAM.x + DREAM.w * 0.55, ey = DREAM.y + DREAM.h + 5;
  var speed = 0, guard = 0;
  while (guard++ < 260) {
    var dx = ex - SB.x, dy = ey - SB.y, d = Math.hypot(dx, dy);
    if (d < 0.8) break;
    speed = approach(speed, 120, 240 * DT);
    var step = Math.min(d, speed * DT);
    SB.x += dx / d * step; SB.y += dy / d * step;
    SB.floatness = approach(SB.floatness, 4, 8 * DT);
    yield null;
    if (gen !== STORY.gen) return;
  }
  SB.x = ex; SB.y = ey;
  sbPlay('fallSlow');
  yield 0.16;
  if (gen !== STORY.gen) return;

  // ② 被吸进去：换成蜷缩帧，0.18s 内加速上提，纵向压缩、横向略张
  sbPlay('curl');
  var t = 0, y0 = SB.y, y1 = DREAM.y + DREAM.h + 1;
  while (t < 0.18) {
    t += DT;
    var e2 = Math.min(1, t / 0.18), k2 = e2 * e2;
    SB.y = y0 + (y1 - y0) * k2;
    SB.sy = 1 - 0.28 * k2;
    SB.sx = 1 + 0.12 * k2;
    yield null;
    if (gen !== STORY.gen) return;
  }
  SB.y = y1;

  // ③ 块面吞没：继续没入梦块，整体收缩 + 淡出
  t = 0;
  var y2 = DREAM.y + DREAM.h * 0.5;
  while (t < 0.34) {
    t += DT;
    var e3 = Math.min(1, t / 0.34);
    SB.y = y1 + (y2 - y1) * e3;
    SB.size = 1 - 0.55 * e3;
    SB.sy = 0.72 - 0.16 * e3;
    SB.sx = 1.12 - 0.24 * e3;
    SB.alpha = 1 - e3;
    yield null;
    if (gen !== STORY.gen) return;
  }

  sbClear();
  storyWrite('dived');
  storySyncBar();
  if (STORY.hostDone) setTimeout(STORY.hostDone, 0);   // 演完才允许宿主切场景（回 dream）
}

// 手动恢复入口：状态非 sleep 时在房间右下角出现
var storyBarBtn = null;
function storySyncBar() {
  if (!cv) return;
  var parent = cv.parentElement;
  if (!parent) return;
  if (STORY.stage === 'sleep') {
    if (storyBarBtn) { storyBarBtn.remove(); storyBarBtn = null; }
    return;
  }
  if (storyBarBtn) return;
  storyBarBtn = document.createElement('button');
  storyBarBtn.type = 'button';
  storyBarBtn.textContent = '恢复 Madeline';
  storyBarBtn.style.cssText = 'position:absolute;right:12px;bottom:12px;z-index:6;' +
    'padding:5px 11px;border-radius:999px;border:1px solid rgba(190,150,255,.55);' +
    'background:rgba(28,12,50,.82);color:#e8dcff;font:12px/1.2 "CelesteZH","Segoe UI",sans-serif;' +
    'letter-spacing:.08em;cursor:pointer;';
  storyBarBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    storyReset();
  });
  parent.appendChild(storyBarBtn);
}

// 重进 mirror 房间：只同步状态；出场/台词由 dream 场景（宿主）负责
function storyEnter() {
  if (!SCENE.booted) { PENDING_STORY_ENTER = true; return; }
  var s = storyRead();
  STORY.stage = s ? s.stage : 'sleep';
  STORY.gen++;
  sbClear();
  storySyncBar();
}

function storyCanDive() {
  if (STORY.stage !== 'sleep' || SB.alive) return false;
  if (CUT.done) return true;
  return !!(STORY.hostGet && STORY.hostGet());
}
function storySetHost(getFn, hideFn, doneFn) {
  STORY.hostGet = getFn || null;
  STORY.hostHide = hideFn || null;
  STORY.hostDone = doneFn || null;
}

// 梦块点击热区（DOM overlay，跟随相机）。热区严格贴块体，四周只留 2 世界像素容差；
// pointer-events 常开：即使当前不可穿（状态非 sleep / 过场未结束），点击也会被吃掉，
// 不会穿透到 #mirrorRoom 背景触发 goBack（旧版热区不生效时的表现）。
var dreamHit = null, dreamHitSig = '';
var DREAM_HIT_PAD = 2;                    // 世界像素
function storyEnsureHit() {
  if (dreamHit || !cv) return;
  var parent = cv.parentElement;
  if (!parent) return;
  dreamHit = document.createElement('div');
  dreamHit.id = 'msDreamHit';
  // 比自由游荡的 .badeline-wrap.free(z-index:10) 高：Badeline 本人/名字标签不再盖住梦块热区
  dreamHit.style.cssText = 'position:absolute;z-index:11;pointer-events:auto;';
  parent.appendChild(dreamHit);
  function diveFrom() {
    if (PLAY.active) return;                  // 可操控段：穿块由物理驱动，旧 DOM 穿走不再触发
    if (!storyCanDive()) return;
    var h = STORY.hostGet ? STORY.hostGet() : null;
    var from = null;
    if (h) from = worldFromScreen(h.x, h.y);
    if (STORY.hostHide) STORY.hostHide();   // 即使此刻不在场，也压掉正在进行的召唤
    startCoro(storyDive(from));
  }
  // 捕获阶段兜底：聊天面板(#blChat / #badelineDialog, z-index:1600) 若在小窗口盖到梦块，
  // 普通冒泡会被它吃掉（实测中心点命中 .bl-name、外侧命中 .blClose）。这里按点是否落在
  // 梦块矩形内先行截获，保证「点块 = 穿走」，而不是关闭聊天/退出房间。
  parent.addEventListener('pointerdown', function (e) {
    if (!dreamHit) return;
    var r = dreamHit.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.stopPropagation();
    e.preventDefault();
    diveFrom();
  }, true);
  dreamHit.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    e.preventDefault();
    diveFrom();
  });
}
function storySyncHit() {
  if (!dreamHit) return;
  // 可操控期间梦块是实体（交给 celeste-character 物理），旧「点块脚本穿走」热区必须让位
  if (PLAY.active) {
    if (dreamHitSig !== 'play') {
      dreamHitSig = 'play';
      dreamHit.style.pointerEvents = 'none';
      dreamHit.style.opacity = '0';
    }
    return;
  }
  if (dreamHitSig === 'play') {
    dreamHitSig = '';
    dreamHit.style.pointerEvents = 'auto';
    dreamHit.style.opacity = '';
  }
  var p = toScreen(DREAM.x - DREAM_HIT_PAD, DREAM.y - DREAM_HIT_PAD);
  var w = Math.round(S(DREAM.w + DREAM_HIT_PAD * 2)), h = Math.round(S(DREAM.h + DREAM_HIT_PAD * 2));
  var armed = storyCanDive();
  var sig = Math.round(p.x) + ',' + Math.round(p.y) + ',' + w + ',' + h + ',' + (armed ? 1 : 0);
  if (sig === dreamHitSig) return;
  dreamHitSig = sig;
  dreamHit.style.left = Math.round(p.x) + 'px';
  dreamHit.style.top = Math.round(p.y) + 'px';
  dreamHit.style.width = w + 'px';
  dreamHit.style.height = h + 'px';
  dreamHit.style.cursor = armed ? 'pointer' : 'default';
}

// 屏幕 CSS px → 世界坐标（宿主 DOM Badeline 交给 canvas 时用）
function worldFromScreen(sx, sy) {
  var z = Z * cam.zoom;
  return {
    x: cam.x + (sx - W / 2 - cam.sx) / z,
    y: cam.y + (sy - H / 2 - cam.sy) / z
  };
}


/* =====================================================================
   8.5 可操控 Badeline（碎镜后站在默认落点；键盘 + 鼠标）
   ---------------------------------------------------------------------
   复用 celeste-character.js（只读，不改引擎）。碰撞按 MIRROR_MAP.solids 的 8px tile
   重建（身体盒 8×11），唯一 DreamBlock = DREAM；`dreamDashEnabled = true`。
   穿块 → 离开梦块自动播 dreamDashOut → 末帧直接消失（不淡出/不缩放）→ 剧情推进到
   dived，宿主据此 goBack 回 dream 场景。
   ===================================================================== */
var PLAY_BASE = 'Atlases/Gameplay/characters/player_badeline';   // player 超集图集
var PLAY_COLOR = '#9B3FB5';                                       // BadelineOldsite.HairColor（同镜面倒影 L477）
var PLAY_SPAWN = { x: MIRROR.x, y: MIRROR.y };                    // 脚底 = 镜座台面 (160,264)
var PLAY_CAM_REST = 216;                                          // 常驻取景 = 进房机位（与改动前一致）
var PLAY_CAM_DIVE = 190;                                          // 只在穿块那一下上抬：人体 32px 高、脚正好在块顶 128，
                                                                  // 216 的视口顶是 126 → 要整只人露出来至少要 190
var PLAY_CAM_UP_TIME = 0.08;                                      // 上抬时长（进块瞬间开始，只占穿块的十分之一）
var PLAY_CAM_DOWN_TIME = 0.14;                                    // 落回时长（dreamDashOut 末帧开始）
var PLAY_VOID = 1e9;
var PLAY = {
  active: false, removed: true, frozen: false, freezeNext: false,
  dived: false, ch: null, loading: null, gen: 0,
  camLift: 0, camLiftTo: 0, feetPrev: PLAY_SPAWN.y
};
var PLAY_PENDING = false;
var playKeys = { left: 0, right: 0, up: 0, down: 0, jump: 0, jumpEdge: 0, dash: 0, dashEdge: 0, grab: 0 };
var PLAY_KEYMAP = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  c: 'jump', ' ': 'jump', x: 'dash', z: 'grab', shift: 'grab'
};

function playTyping() {
  var a = document.activeElement;
  if (!a) return false;
  var t = (a.tagName || '').toUpperCase();
  return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || a.isContentEditable === true;
}
function playResetInput() {
  for (var k in playKeys) playKeys[k] = 0;
}
document.addEventListener('keydown', function (e) {
  if (!PLAY.active || PLAY.frozen || playTyping()) return;
  var slot = PLAY_KEYMAP[(e.key || '').toLowerCase()];
  if (!slot) return;
  e.preventDefault();
  if (e.repeat) return;
  if (!playKeys[slot]) {
    playKeys[slot] = 1;
    if (slot === 'jump') playKeys.jumpEdge = 1;
    if (slot === 'dash') playKeys.dashEdge = 1;
  }
}, true);
document.addEventListener('keyup', function (e) {
  var slot = PLAY_KEYMAP[(e.key || '').toLowerCase()];
  if (slot) playKeys[slot] = 0;
}, true);
window.addEventListener('blur', playResetInput);

/* ---------- 碰撞：8px tile + 唯一梦块 ---------- */
function playTile(tx, ty) { return tileSolid(MAP.solids, tx, ty); }

function playDreamAt(x, feetY) {                   // 按 0.5 内缩，与 internet_cafe 同口径
  var x0 = x - 3.5, x1 = x + 3.5, y0 = feetY - 10.5, y1 = feetY - 0.5;
  if (x1 > DREAM.x && x0 < DREAM.x + DREAM.w && y1 > DREAM.y && y0 < DREAM.y + DREAM.h) return DREAM;
  return null;
}
function playBandY(feetY) {
  var r0 = Math.floor((feetY - 10.5) / TILE), r1 = Math.floor((feetY - 0.5) / TILE);
  if (r0 < 0) r0 = 0;
  if (r1 >= ROWS) r1 = ROWS - 1;
  return [r0, r1];
}
function playBodySolid(x, feetY) {
  var c0 = Math.floor((x - 4) / TILE), c1 = Math.floor((x + 3.999) / TILE);
  var rr = playBandY(feetY);
  for (var tx = c0; tx <= c1; tx++)
    for (var ty = rr[0]; ty <= rr[1]; ty++)
      if (playTile(tx, ty)) return true;
  return !!playDreamAt(x, feetY);
}
function playGroundY(x) {
  var ref = PLAY.ch ? Math.min(PLAY.ch.y, PLAY.feetPrev) : PLAY_SPAWN.y;
  var best = PLAY_VOID;
  var c0 = Math.floor((x - 4) / TILE), c1 = Math.floor((x + 3.999) / TILE);
  var r0 = Math.floor(ref / TILE);
  if (r0 < 0) r0 = 0;
  for (var tx = c0; tx <= c1; tx++) {
    for (var ty = r0; ty < ROWS; ty++) {
      if (!playTile(tx, ty)) continue;
      var top = ty * TILE;
      if (top < ref - 1) continue;
      if (top < best) best = top;
    }
  }
  if (x + 4 > DREAM.x && x - 4 < DREAM.x + DREAM.w) {
    if (DREAM.y >= ref - 1 && DREAM.y < best) best = DREAM.y;
  }
  return best;
}
function playWallCollideAt(edgeX, feetY, dir) {
  var rr = playBandY(feetY), y0 = feetY - 10.5, y1 = feetY - 0.5;
  var tx;
  if (dir > 0) {
    if (edgeX >= ROOM_W) return ROOM_W;
    tx = Math.floor(edgeX / TILE);
    for (var ty = rr[0]; ty <= rr[1]; ty++) if (playTile(tx, ty)) return tx * TILE;
  } else {
    if (edgeX <= 0) return 0;
    tx = Math.floor(edgeX / TILE);
    for (var ty2 = rr[0]; ty2 <= rr[1]; ty2++) if (playTile(tx, ty2)) return (tx + 1) * TILE;
  }
  if (y1 > DREAM.y && y0 < DREAM.y + DREAM.h && edgeX > DREAM.x && edgeX < DREAM.x + DREAM.w)
    return dir > 0 ? DREAM.x : DREAM.x + DREAM.w;
  return null;
}
// 宽容贴墙检测：探针落在身体边缘（WALL_PROBE = 4），零外延 —— 与铭记页 wallAtFn 同语义，
// 「贴到墙才算」，不再从边缘额外外扫。边界包含性按 tile 处理：dir<0 时取边缘内侧 0.001
// 所在的列，保证身体边缘正好压在墙面（tile 边界）上时仍判定为贴墙。
var PLAY_WALL_PROBE = 4;
function playWallAt(x, feetY, dir) {
  var rr = playBandY(feetY), y0 = feetY - 10.5, y1 = feetY - 0.5;
  var edge = x + dir * PLAY_WALL_PROBE;
  if (dir > 0) { if (edge >= ROOM_W) return ROOM_W; }
  else if (edge <= 0) return 0;
  var probe = dir > 0 ? edge : edge - 0.001;
  var tx = Math.floor(probe / TILE);
  for (var ty = rr[0]; ty <= rr[1]; ty++)
    if (playTile(tx, ty)) return dir > 0 ? tx * TILE : (tx + 1) * TILE;
  // 梦块侧面（含边界：贴在块面上时也要算贴墙）
  if (y1 > DREAM.y && y0 < DREAM.y + DREAM.h && edge >= DREAM.x && edge <= DREAM.x + DREAM.w)
    return dir > 0 ? DREAM.x : DREAM.x + DREAM.w;
  return null;                                      // 契约：null = 附近没有墙（见 setWallAt 注释）
}
function playCeilingY(x, feetY) {
  var head = feetY - 11;
  var c0 = Math.floor((x - 4) / TILE), c1 = Math.floor((x + 3.999) / TILE);
  var r0 = Math.floor(head / TILE), r1 = Math.floor((feetY - 0.001) / TILE);
  if (r0 < 0) r0 = 0;
  var best = null;
  // 扫整个身体占据的行；取「最靠下」的底边（向上移动时最先撞到的那个），与铭记页 ceilingY 一致
  for (var tx = c0; tx <= c1; tx++) {
    for (var ry = r0; ry <= r1 && ry < ROWS; ry++) {
      if (ry * TILE >= feetY) continue;             // 顶面在脚底或以下 → 那是地板，不是天花板
      if (!playTile(tx, ry)) continue;
      var bottom = (ry + 1) * TILE;
      if (bottom <= head + 0.01) continue;          // 底边还在头顶上方 → 没重叠
      if (best === null || bottom > best) best = bottom;
    }
  }
  // 梦块底面：必须用「身体盒上移 1px 后与之重叠」语义（同 internet_cafe 注释），
  // 否则上冲刺撞块底时不会触发 dreamDashCheck
  var headUp = head - 1, feetUp = feetY - 1;
  if (x + 4 > DREAM.x && x - 4 < DREAM.x + DREAM.w &&
      DREAM.y + DREAM.h > headUp && DREAM.y < feetUp) {
    var db = DREAM.y + DREAM.h;
    if (best === null || db > best) best = db;
  }
  return best;
}

/* ---------- 角色装载 / 起停 / 绘制 ---------- */
function playEnsureLoaded() {
  if (PLAY.ch) return Promise.resolve(PLAY.ch);
  if (PLAY.loading) return PLAY.loading;
  if (!window.CelesteCharacter || !window.CelesteHair) return Promise.resolve(null);
  PLAY.loading = window.CelesteCharacter.create({
    base: PLAY_BASE, color: PLAY_COLOR,
    x: PLAY_SPAWN.x, y: PLAY_SPAWN.y, facing: -1
  }).then(function (ch) {
    ch.setGround(playGroundY);
    ch.setWallAt(playWallAt);
    ch.setWallCollideFn(playWallCollideAt);
    ch.setCeiling(playCeilingY);
    ch.setBodySolid(playBodySolid);
    ch.setDreamBlockFn(playDreamAt);
    ch.dreamDashEnabled = true;
    // 落地尘：判定与铭记页一致（落地竖向速度 >= 80），观感见 playDustSpawn
    ch.onLand = function (vy) { if (vy >= 80) playDustSpawn(ch.x, ch.y, 8); };
    ch.onDreamDashEnter = function () { PLAY.dived = true; PLAY.camLiftTo = 1; };
    ch.onDreamDashExit = function () { PLAY.freezeNext = true; };   // 下一帧原地定格
    ch.onDreamDashDeath = function () { playDiveDone(); };         // 撞墙脱困失败：直接收尾，避免卡死
    var orig = ch.sprite.onLastFrame;
    ch.sprite.onLastFrame = function (id) {
      if (orig) orig.call(this, id);
      if (id === 'dreamDashOut' && PLAY.dived && !PLAY.removed) playDiveDone();
    };
    PLAY.ch = ch;
    return ch;
  }).catch(function (e) {
    PLAY.loading = null;
    if (window.console) console.error('[mirror] playable badeline load failed', e);
    return null;
  });
  return PLAY.loading;
}
function playPlace(ch) {
  ch.x = PLAY_SPAWN.x; ch.y = PLAY_SPAWN.y;
  ch.vx = 0; ch.vy = 0; ch.facing = -1;
  ch.scaleX = 1; ch.scaleY = 1; ch.spriteY = 0;
  ch.dashTime = 0; ch.dashAttackTimer = 0;
  ch.dashes = ch.maxDashes;
  ch.stamina = 110;
  ch.onGround = false;
  if (window.CelesteCharacter.ST && ch.setState) ch.setState(window.CelesteCharacter.ST.Normal);
  if (ch.hair) ch.hair.reset(ch.x, ch.y, ch.facing);
  ch.sprite.play('idle');
  PLAY.feetPrev = ch.y;
  PLAY.frozen = false; PLAY.freezeNext = false;
  PLAY.dived = false; PLAY.removed = false;
  PLAY_DUST.length = 0;
  playResetInput();
}
function playDiveDone() {
  if (!PLAY.active || PLAY.removed) return;
  PLAY.removed = true; PLAY.frozen = true; PLAY.active = false;
  PLAY.camLiftTo = 0;                     // dreamDashOut 末帧：镜头落回常驻机位
  playResetInput();
  // 与 storyDive 尾部一致：写回 dived + 通知宿主回 dream 场景
  sbClear();
  storyWrite('dived');
  storySyncBar();
  if (STORY.hostDone) setTimeout(STORY.hostDone, 0);
}
function playStart() {
  if (!_sceneReady) { PLAY_PENDING = true; return false; }
  if (PLAY.active) return true;
  PLAY.active = true; PLAY.removed = false;
  PLAY.gen++;
  playResetInput();
  PLAY.camLift = 0; PLAY.camLiftTo = 0; cam.y = PLAY_CAM_REST;   // 常驻取景，不因可操控而上抬
  PLAY.feetPrev = PLAY_SPAWN.y;
  if (PLAY.ch) { playPlace(PLAY.ch); return true; }
  playEnsureLoaded().then(function (ch) {
    if (!ch || !PLAY.active) return;
    playPlace(ch);
  });
  return true;
}
function playStop() {
  PLAY.active = false; PLAY.removed = true; PLAY.gen++;
  PLAY.frozen = false; PLAY.freezeNext = false; PLAY.dived = false;
  PLAY.camLift = 0; PLAY.camLiftTo = 0; cam.y = PLAY_CAM_REST;   // 收手即回常驻取景
  PLAY_DUST.length = 0;
  playResetInput();
  if (PLAY.ch) {
    PLAY.ch.x = PLAY_SPAWN.x; PLAY.ch.y = PLAY_SPAWN.y;
    PLAY.ch.vx = 0; PLAY.ch.vy = 0;
  }
}
// 任何路径离开 dream（自动退出 / 手动睡醒 / 其它收起）都收手：避免人物/按键残留在书架正页
document.addEventListener('dream:exiting', function () { if (PLAY.active) playStop(); });
// 穿块专用镜头：camLift 0→1 抬到 PLAY_CAM_DIVE，1→0 落回 PLAY_CAM_REST。
// 独立于 PLAY.active（末帧落回时人物已经收了），只在有落差时写 cam.y。
function playCamUpdate(dt) {
  if (PLAY.camLift === PLAY.camLiftTo) return;
  var dur = PLAY.camLiftTo > PLAY.camLift ? PLAY_CAM_UP_TIME : PLAY_CAM_DOWN_TIME;
  var step = dur > 0 ? dt / dur : 1;
  PLAY.camLift = PLAY.camLiftTo > PLAY.camLift
    ? Math.min(PLAY.camLiftTo, PLAY.camLift + step)
    : Math.max(PLAY.camLiftTo, PLAY.camLift - step);
  var e = PLAY.camLift * PLAY.camLift * (3 - 2 * PLAY.camLift);   // smoothstep
  cam.y = PLAY_CAM_REST + (PLAY_CAM_DIVE - PLAY_CAM_REST) * e;
  if (PLAY.camLift === PLAY.camLiftTo) cam.y = PLAY.camLift === 1 ? PLAY_CAM_DIVE : PLAY_CAM_REST;
  if (SCENE.onCam) { try { SCENE.onCam(); } catch (e2) { /* ignore */ } }
}
function playUpdate(dt) {
  if (!PLAY.active) return;
  var ch = PLAY.ch;
  if (!ch || PLAY.removed) return;
  if (PLAY.frozen) {
    // 定格在梦块出口，只推进 dreamDashOut 的 4 帧；末帧回调里直接消失
    ch.sprite.update(dt);
    if (ch.hair) ch.hair.update(Math.round(ch.x), Math.round(ch.y), ch.facing, 0, 0, dt, 1);
    return;
  }
  var input = {
    left: !!playKeys.left, right: !!playKeys.right,
    up: !!playKeys.up, down: !!playKeys.down,
    jumpHeld: !!playKeys.jump, jumpPressed: !!playKeys.jumpEdge,
    dashPressed: !!playKeys.dashEdge, grabHeld: !!playKeys.grab,
    aimX: (playKeys.right ? 1 : 0) - (playKeys.left ? 1 : 0),
    aimY: (playKeys.down ? 1 : 0) - (playKeys.up ? 1 : 0)
  };
  playKeys.jumpEdge = 0; playKeys.dashEdge = 0;
  ch.update(dt, input);
  PLAY.feetPrev = ch.y;
  if (PLAY.freezeNext) { PLAY.freezeNext = false; PLAY.frozen = true; }
}
/* ---------- 落地尘（观感对齐铭记页 spawnDust / drawDust） ---------- */
var PLAY_DUST = [], PLAY_DUST_MAX = 120;
function playDustSpawn(x, y, n) {
  for (var i = 0; i < n; i++) {
    if (PLAY_DUST.length >= PLAY_DUST_MAX) break;
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    var sp = 18 + Math.random() * 34;
    PLAY_DUST.push({
      x: x, y: y - 1,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
      life: 0.3 + Math.random() * 0.35
    });
  }
}
function updatePlayDust(dt) {
  for (var i = PLAY_DUST.length - 1; i >= 0; i--) {
    var d = PLAY_DUST[i];
    d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 240 * dt; d.life -= dt;
    if (d.life <= 0) PLAY_DUST.splice(i, 1);
  }
}
function drawPlayDust() {
  if (!PLAY_DUST.length) return;
  ctx.fillStyle = '#c6ecff';
  for (var i = 0; i < PLAY_DUST.length; i++) {
    var d = PLAY_DUST[i], p = toScreen(d.x, d.y);
    ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 0.4));
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
  }
  ctx.globalAlpha = 1;
}
function playDraw() {
  if (!PLAY.active || PLAY.removed || !PLAY.ch) return;
  PLAY.ch.draw(ctx, function (p) { return toScreen(p.x, p.y); }, Z * cam.zoom);
}


/* =====================================================================
   9. 场景：星星背景 / 房间图层 / 贴花 / 悬浮碎块 / 前景雾 / 暗角
   ---------------------------------------------------------------------
   房间全部内容（bg 瓦片 + bg 贴花 + 实体层 + fg 瓦片）来自 2-OldSite.bin lvl_d3；
   背景与前景取自该房间 Style：Backgrounds = stars；
   Foregrounds = parallax mist(#8156e1, α.8, scroll .5/.5, speed 16/8, flip)
               + parallax mist(#e15698, α.8, scroll .25/.25, speed 4/4, flip)
               + parallax vignette(α.6)
   ===================================================================== */
var ROOM_BG = null, ROOM_FG = null;
var STARS = [], FLD = [], FGD = [];
// Celeste.StarsBG.falling / Session.Dreaming：入梦后星场下坠拖尾
var STAR_FALLING = 0, SESSION_DREAMING = false;
var TINT_CACHE = {};

function tintTex(img, color) {
  if (!img) return null;
  var c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  var g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(img, 0, 0);
  return c;
}
function tinted(key, img, color) {
  var k = key + '|' + color;
  if (!TINT_CACHE[k]) TINT_CACHE[k] = tintTex(img, color);
  return TINT_CACHE[k];
}

// 贴花：位置即锤点（左上），scaleX/scaleY 为 -1 时以锤点翻转
function drawDecalRaw(g, d) {
  var img = IMG['decal:' + d[0]];
  if (!img) return;
  g.save();
  g.translate(d[1], d[2]);
  g.scale(d[3] < 0 ? -1 : 1, d[4] < 0 ? -1 : 1);
  g.drawImage(img, 0, 0);
  g.restore();
}

// 把 bg 层与 fg 瓦片层各烤成一张 320x456 的画布（等价 Celeste 的 TileGrid）
function prerenderRoom() {
  buildTiles();

  ROOM_BG = document.createElement('canvas');
  ROOM_BG.width = ROOM_W; ROOM_BG.height = ROOM_H;
  var b = ROOM_BG.getContext('2d');
  b.imageSmoothingEnabled = false;
  for (var i = 0; i < BG_TILES.length; i++) {
    var t = BG_TILES[i], img = IMG[t.k];
    if (!img) continue;
    b.drawImage(img, t.sx, t.sy, TILE, TILE, t.tx * TILE, t.ty * TILE, TILE, TILE);
  }
  MAP.decalsBg.forEach(function (d) { drawDecalRaw(b, d); });

  ROOM_FG = document.createElement('canvas');
  ROOM_FG.width = ROOM_W; ROOM_FG.height = ROOM_H;
  var f = ROOM_FG.getContext('2d');
  f.imageSmoothingEnabled = false;
  for (var j = 0; j < SOLID_TILES.length; j++) {
    var s = SOLID_TILES[j], si = IMG[s.k];
    if (!si) continue;
    f.drawImage(si, s.sx, s.sy, TILE, TILE, s.tx * TILE, s.ty * TILE, TILE, TILE);
  }
}

function drawRoomLayer(layer) {
  if (!layer) return;
  var z = Z * cam.zoom;
  var p = toScreen(0, 0);
  ctx.drawImage(layer, p.x, p.y, ROOM_W * z, ROOM_H * z);
}

// —— 背景粒子：<stars/> = Celeste.StarsBG extends Backdrop（REA 取证）——
// .ctor : stars = new Star[100]，每颗：
//   Position = (Random*320, Random*180)  ← 虚拟屏幕空间，非世界坐标
//   Timer    = Random*2π ; Rate = 2+Random*2 ; TextureSet = Random.Next(3)
// Update   : star.Timer += DeltaTime * star.Rate
// Render   : Draw.Rect(0,0,320,180,Black) 铺底，再对每颗星：
//   idx = floor(((sin(Timer)+1)/2 * texCount)) % texCount —— 在 4 帧间来回脉动
//   常规分支从不引用 Camera，故星场固定在屏幕上（不随相机平移/缩放）
function buildStars() {
  STARS = [];
  var sets = ['a', 'b', 'c'];
  for (var i = 0; i < 100; i++) {            // IL: ldc.i4.s 100; newarr Star
    STARS.push({
      set: sets[(Math.random() * sets.length) | 0],   // Star.TextureSet
      x: Math.random() * VIEW_W,                       // Star.Position.X (0..320)
      y: Math.random() * VIEW_H,                       // Star.Position.Y (0..180)
      timer: Math.random() * 6.283185,                 // Star.Timer
      rate: 2 + Math.random() * 2                      // Star.Rate = 2 + Random*2
    });
  }
}
function drawStars(t) {
  // Timer 是 rate 对时间的积分，等价于 timer + t*rate（快进截图亦同帧）
  var pw = W / VIEW_W, ph = H / VIEW_H;
  var count = SESSION_DREAMING ? STARS.length / 2 : STARS.length;   // dreaming: count /= 2
  for (var i = 0; i < count; i++) {
    var s = STARS[i], frames = STAR_GROUPS[s.set];
    if (!frames) continue;
    var idx = Math.floor(((Math.sin(s.timer + t * s.rate) + 1) / 2) * frames.length) % frames.length;
    var img = IMG[frames[idx]];
    if (!img) continue;
    var d = img.width * Z;                               // 15px 帧按 Z 保像素尺寸
    if (!SESSION_DREAMING) {
      ctx.drawImage(img, s.x * pw - d / 2, s.y * ph - d / 2, d, d);
      continue;
    }
    // Session.Dreaming 分支（IL）：pos.Y -= Camera.Y；pos.Y += falling*Rate；环绕 180；
    // 再对 colors[8]=Teal×0.7×(1-i/8) 各画一格（pos - UnitY*j），星体下落、拖尾在上方渐隐
    var py = s.y - cam.y;
    py += STAR_FALLING * s.rate;
    py %= VIEW_H;
    if (py < 0) py += VIEW_H;
    var teal = tinted(frames[idx], img, 'rgb(0,128,128)');
    if (!teal) continue;
    for (var j = 0; j < 8; j++) {                        // colors.Length = 8
      ctx.globalAlpha = 0.7 * (1 - j / 8);
      ctx.drawImage(teal, s.x * pw - d / 2, (py - j) * ph - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }
}
// StarsBG.Update：可见时逐星推进 Timer（此处用闭式 timer+t*rate 等价）；仅 Dreaming 时 falling 累加
function updateStars(dt) {
  if (SESSION_DREAMING) STAR_FALLING += dt * 12;         // IL: falling += DeltaTime * 12f
}

// FloatingDebris：scenery/debris 图集 8x8 子图，±2px 浮沉 + 最多 40°/s 自转
function setupDebris() {
  FLD = []; FGD = [];
  MAP.entities.forEach(function (e) {
    if (e.e === 'floatingDebris') {
      FLD.push({
        x: e.x, y: e.y, cx: (Math.random() * 8 | 0) * 8,
        rot: rnd(0, 6.28), rotSpeed: rnd(-0.7, 0.7), ph: rnd(0, 6.28)
      });
    } else if (e.e === 'foregroundDebris') {
      FGD.push({
        x: e.x, y: e.y, kind: Math.random() < 0.5 ? 'a' : 'b',
        ph: rnd(0, 6.28), par: 0.05 + Math.random() * 0.08
      });
    }
  });
}
function drawDebris(t) {
  var z = Z * cam.zoom, sheet = IMG.debrisSheet;
  if (sheet) {
    for (var i = 0; i < FLD.length; i++) {
      var d = FLD[i];
      if (!cull(d.x - 8, d.y - 8, 16, 16)) continue;
      var p = toScreen(d.x, d.y + Math.sin(t * 0.4 + d.ph) * 2);
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(d.rot);
      ctx.drawImage(sheet, d.cx, 0, 8, 8, -4 * z, -4 * z, 8 * z, 8 * z);
      ctx.restore();
    }
  }
  // ForegroundDebris：rock_a*/rock_b* 逐层叠画（CenterOrigin），并随相机反向偏移
  for (var j = 0; j < FGD.length; j++) {
    var f = FGD[j];
    var frames = f.kind === 'a' ? ['fgrk:a0', 'fgrk:a1', 'fgrk:a2'] : ['fgrk:b0', 'fgrk:b1'];
    var px = f.x - (cam.x + VIEW_W / 2 - f.x) * f.par;
    var py = f.y - (cam.y + VIEW_H / 2 - f.y) * f.par;
    for (var k = 0; k < frames.length; k++) {
      var img = IMG[frames[k]];
      if (!img) continue;
      var sp = toScreen(px, py);
      var bob = Math.sin(t * 0.4 + f.ph + k * 0.7) * 2 * z;
      ctx.drawImage(img, sp.x - img.width * z / 2, sp.y - img.height * z / 2 + bob,
        img.width * z, img.height * z);
    }
  }
}

function drawFgDecals() {
  var z = Z * cam.zoom;
  for (var i = 0; i < MAP.decalsFg.length; i++) {
    var d = MAP.decalsFg[i], img = IMG['decal:' + d[0]];
    if (!img) continue;
    if (!cull(d[1] - 20, d[2] - 20, img.width + 40, img.height + 40)) continue;
    var p = toScreen(d[1], d[2]);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale((d[3] < 0 ? -1 : 1) * z, (d[4] < 0 ? -1 : 1) * z);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

// Monocle.Parallax：位置 = -相机*Scroll - 时间*Speed，LoopX/LoopY 平铺
function drawParallax(key, color, alpha, scrollX, scrollY, speedX, speedY, flipX, flipY, t) {
  var img = IMG[key];
  if (!img) return;
  var tex = color ? tinted(key, img, color) : img;
  var z = Z * cam.zoom;
  var w = Math.max(1, Math.round(img.width * z));
  var h = Math.max(1, Math.round(img.height * z));
  var ox = (-cam.x * scrollX - t * speedX) * z + cam.sx;
  var oy = (-cam.y * scrollY - t * speedY) * z + cam.sy;
  ox = ((ox % w) + w) % w - w;
  oy = ((oy % h) + h) % h - h;
  ctx.globalAlpha = alpha;
  for (var y = oy; y < H; y += h) {
    for (var x = ox; x < W; x += w) {
      if (flipX || flipY) {
        ctx.save();
        ctx.translate(x + (flipX ? w : 0), y + (flipY ? h : 0));
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(tex, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(tex, x, y, w, h);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  if (!IMG.vignette) return;
  ctx.globalAlpha = 0.6;
  ctx.drawImage(IMG.vignette, 0, 0, W, H);
  ctx.globalAlpha = 1;
}

/* =====================================================================
   10. 相机 / 缓动工具
   ---------------------------------------------------------------------
   Monocle.Camera：Position 是视口中心；Level.ZoomTo(offset, zoom, dur) 的 offset
   是相对当前相机的偏移，而 Level.ZoomBack(dur) = 保持中心、zoom 回 1。
   过场里 yield 的这些协程都是 Camera / Level 的 Easer。
   ===================================================================== */
var DT = 1 / 60, tGlobal = 0;

function cubeIn(t) { return t * t * t; }
function cubeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
// IL: Level.ZoomTo / Level.ZoomBack 都是 Ease.SineInOut（Level.cs:1771 / 1815）
function sineInOut(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
function approach(v, target, amt) {
  return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target);
}

function shake(amount) {                       // Level.Shake(amount)
  cam.shakeAmt = Math.max(cam.shakeAmt || 0, amount);
  cam.shakeT = 0.3;
}
function updateCamShake(dt) {
  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    var k = (cam.shakeAmt || 0) * 8 * Math.max(0, cam.shakeT / 0.3);
    cam.sx = rnd(-1, 1) * k;
    cam.sy = rnd(-1, 1) * k;
    if (cam.shakeT <= 0) { cam.sx = 0; cam.sy = 0; cam.shakeAmt = 0; }
  }
}

function* panTo(tx, ty, dur) {
  var fx = cam.x, fy = cam.y, e = 0;
  while (e < 1) {
    e += DT / dur;
    var k = cubeInOut(Math.min(1, e));
    cam.x = fx + (tx - fx) * k;
    cam.y = fy + (ty - fy) * k;
    yield null;
  }
  cam.x = tx; cam.y = ty;
}
function* zoomTo(tx, ty, tz, dur) {
  var fx = cam.x, fy = cam.y, fz = cam.zoom, e = 0;
  while (e < 1) {
    e += DT / dur;
    var k = sineInOut(Math.min(1, e));
    cam.x = fx + (tx - fx) * k;
    cam.y = fy + (ty - fy) * k;
    cam.zoom = fz + (tz - fz) * k;
    yield null;
  }
  cam.x = tx; cam.y = ty; cam.zoom = tz;
}
function* zoomBack(dur) {                      // CS02_Mirror.<ZoomBack>: wait 1.2 → ZoomBack(3)
  yield 1.2;
  var fz = cam.zoom, e = 0;
  while (e < 1) {
    e += DT / dur;
    cam.zoom = fz + (1 - fz) * sineInOut(Math.min(1, e));
    yield null;
  }
  cam.zoom = 1;
}

/* =====================================================================
   11. 过场：CS02_Mirror.<Cutscene> → DreamMirror.<BreakRoutine> → DreamBlock.<Activate>
   ---------------------------------------------------------------------
   Cutscene 逐行（IL 顺序）：wait 1.0 → 面向翻转 wait 0.4 → DummyRunTo → wait 0.5
     → ZoomTo(mirror.Position - cam - UnitY*24, 2, 1) → wait 0.5 → BreakRoutine(dir)
     → 相机 from→from+(0,-80) CubeInOut（dt*1.2）→ Add(ZoomBack())
     → foreach DreamBlock yield Activate() → wait 0.5 → EndCutscene
   本页没有玩家，所以去掉 DummyRunTo，改由镜中倒影自己走向中心（与 BreakRoutine 一致）。
   ===================================================================== */
var CUT = { started: false, done: false, dir: -1 };

function* breakRoutine(dir) {
  MIRROR.autoUpdateReflection = false;
  MIRROR.refl.anim = 'runFast'; MIRROR.refl.t = 0;
  while (Math.abs(MIRROR.refl.x - GLASS_W / 2) > 3) {
    MIRROR.refl.x += dir * 32 * DT;
    MIRROR.refl.x = dir > 0 ? Math.min(MIRROR.refl.x, GLASS_W / 2)
                            : Math.max(MIRROR.refl.x, GLASS_W / 2);
    yield null;
  }
  MIRROR.refl.anim = 'idle'; MIRROR.refl.t = 0;
  yield 0.65;
  playSfx('mirror');                            // event:/game/02_old_site/sequence_mirror
  yield 0.15;
  playSfx('sting');                             // event:/music/lvl2/dreamblock_sting_pt2
  MIRROR.updateShine = false;
  while (!(MIRROR.shineOffset === 33 && MIRROR.shineAlpha >= 1)) {
    MIRROR.shineOffset = approach(MIRROR.shineOffset, 33, DT * 120);
    MIRROR.shineAlpha = approach(MIRROR.shineAlpha, 1, DT * 4);
    yield null;
  }
  MIRROR.smashed = true; MIRROR.breakT = 0;
  SESSION_DREAMING = true;                        // 碎镜入梦：StarsBG 转入下坠拖尾分支
  if (SCENE.onBreak) { try { SCENE.onBreak(); } catch (e) {} }   // 嵌入模式：通知宿主「镜已碎」这一帧
  glassCrack();
  yield 0.6;
  shake(0.3);
  emitShatter();                                // P_Shatter 碎玻璃
  MIRROR.smashEnded = true;

  // new BadelineDummy(reflection.Position + Position - breakingGlass.Origin)
  var bx = MIRROR.refl.x + MIRROR.x - MIRROR.originX;
  var by = MIRROR.refl.y + MIRROR.y - MIRROR.originY;
  var nodes = MIRROR.refl.hair ? MIRROR.refl.hair.nodes : null;
  bdSpawn(bx, by, nodes);
  MIRROR.refl.show = false;
  emitVanish(bx, by - 16);                      // BadelineDummy.Appear 的冲击环 + P_Vanish
  yield 1.2;

  var speed = -dir * 32;
  BD.scaleX = -dir;
  bdPlay('runFast');
  while (Math.abs(BD.x - MIRROR.x) < 60) {       // 第一段：冲到距镜面 60px
    speed += -dir * 128 * DT;
    BD.x += speed * DT;
    yield null;
  }
  bdPlay('jumpFast');
  while (Math.abs(BD.x - MIRROR.x) < 128) {      // 第二段：边冲边升，128px 时消失
    speed += -dir * 128 * DT;
    BD.x += speed * DT;
    BD.y -= Math.abs(speed) * DT * 0.8;
    yield null;
  }
  BD.alive = false;                             // RemoveSelf
  yield 1.5;
}

function emitWings(x, y) {
  partAdd({
    tex: 'vanish', x: x, y: y,
    vx: rnd(-14, 14), vy: rnd(-140, -70),
    g: 60, drag: 1.2, life: rnd(0.35, 0.7), max: 0.7,
    rot: rnd(0, 6.28), rotSpeed: rnd(-6, 6), scale: rnd(0.8, 1.4)
  });
}

// DreamBlock.<Activate>：白场 CubeIn → whiteHeight 从 1 降到 0（底边扫落粒子）→ whiteFill 退白
function* activateBlock() {
  var b = DREAM;
  yield 1.0;
  b.shaker = { on: true, t: 0, interval: 0.02 };
  var p = 0;
  while (p < 1) {
    b.whiteFill = cubeIn(p);
    yield null;
    p += DT;
  }
  b.shaker = null; b.shakeX = 0; b.shakeY = 0;
  yield 0.5;

  // ActivateNoRoutine()
  b.playerHasDreamDash = true;
  dreamSetup();                                 // Setup()：换成彩色粒子
  b.whiteHeight = 1; b.whiteFill = 1;
  p = 1;
  var interval = 0;
  while (p > 0) {
    b.whiteHeight = p;
    interval += DT;
    if (interval >= 0.1) {
      interval -= 0.1;
      for (var i = 0; i < b.w; i += 4) emitWings(b.x + i, b.y + b.h * b.whiteHeight + 1);
      shake(0.3);
    }
    yield null;
    p -= DT * 0.5;
  }
  while (b.whiteFill > 0) {
    b.whiteFill -= DT * 3;
    yield null;
  }
  b.whiteFill = 0; b.whiteHeight = 1;
}

function* cutscene() {
  CUT.started = true;
  hideHint();
  // IL: sfx.Play("event:/music/lvl2/dreamblock_sting_pt1") —— 过场开始第一帧，位置 = 镜子中心
  // 缺口：本地无该事件音源，留 sting1Src 钩子，不拿别的曲子顶替
  playSfx('sting1');
  yield 1.0;
  yield 0.4;
  yield 0.5;                                     // 无玩家：相当于 DummyRunTo 的时长
  yield 0.5;                                     // IL: DummyRunTo 之后还有 0.5f
  // ZoomTo(mirror.Position - cam.Position - UnitY*24, 2, 1) → 中心 = (160,240)
  yield* zoomTo(160, 240, 2, 1);
  yield 0.5;
  yield* breakRoutine(CUT.dir);

  // 相机上移 80px（zoom 2，正好从镜子抬到上方梦块）
  var fromY = cam.y, toY = cam.y - 80, ease = 0;
  while (ease < 1) {
    cam.y = fromY + (toY - fromY) * cubeInOut(ease);
    ease += DT * 1.2;
    yield null;
  }
  cam.y = toY;

  startCoro(zoomBack(3));                        // IL：Add(ZoomBack()) 与激活并发
  yield* activateBlock();
  yield 0.5;
  // IL: ++Cutscene 到此 EndCutscene → CS02_Mirror.OnEnd：
  //     Music.Event = "event:/music/lvl2/mirror"; Audio.Apply(false) → 直接 start（音乐在这一帧起播）
  if (SCENE.onEnd) { try { SCENE.onEnd(); } catch (e) {} }
  // 原作 OnEnd 之后由 Player 跟随把相机拉回玩家附近；本页没有玩家，用 1.2s 归位到进房机位
  // (160,216)，让 DOM 命中区/后续交互与过场前构图完全一致。这是本移植的收尾补偿，不属于过场本身。
  yield* panTo(160, 216, 1.2);
  CUT.done = true;
  if (SCENE.onDone) { try { SCENE.onDone(); } catch (e) {} }
}

/* =====================================================================
   12. 音效
   ===================================================================== */
var SFX = {}, sfxOn = true;
function mkSfx(key, src, vol) {
  try {
    var a = new Audio(src);
    a.volume = vol;
    SFX[key] = a;
  } catch (e) { /* 无音频环境 */ }
}
mkSfx('mirror', 'ambience/mirror_sequence.wav', 0.7);
mkSfx('sting', 'celeste-sounds/dreamblock/dreamblock_exit_01.wav', 0.5);

function playSfx(key) {
  if (!sfxOn) return;
  var a = SFX[key];
  if (!a) return;
  try { a.currentTime = 0; a.play(); } catch (e) { /* 自动播放拦截 */ }
}

var AC = null;
function glassCrack() {                          // 碎玻璃噪声（无现成素材，现场合成）
  if (!sfxOn) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    var n = Math.floor(AC.sampleRate * 0.5);
    var buf = AC.createBuffer(1, n, AC.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
    }
    var src = AC.createBufferSource();
    src.buffer = buf;
    var bp = AC.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 1.4;
    var g = AC.createGain(); g.gain.value = 0.32;
    src.connect(bp); bp.connect(g); g.connect(AC.destination);
    src.start();
  } catch (e) { /* ignore */ }
}

/* =====================================================================
   13. 交互 / 主循环
   ===================================================================== */
var DBG = false;

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0d16';
  ctx.fillRect(0, 0, W, H);

  drawStars(tGlobal);
  drawRoomLayer(ROOM_BG);                      // bg 瓦片 + bg 贴花
  drawRoomLayer(ROOM_FG);                      // 实体之后的 fg 瓦片可选；这里实体会遮住镜框
  drawDebris(tGlobal);
  mirrorDraw();
  drawDream();
  bdDraw();
  sbDraw();
  drawPlayDust();
  playDraw();
  drawParts();
  drawFgDecals();

  drawParallax('mist', '#8156e1', 0.8, 0.5, 0.5, 16, 8, true, true, tGlobal);
  drawParallax('mist', '#e15698', 0.8, 0.25, 0.25, 4, 4, true, true, tGlobal);
  drawVignette();
  storySyncHit();

  if (DBG) drawDebug();
}

function drawDebug() {
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(137,180,250,.8)';
  var p = toScreen(DREAM.x, DREAM.y);
  ctx.strokeRect(p.x, p.y, S(DREAM.w), S(DREAM.h));
  ctx.strokeStyle = 'rgba(255,120,180,.8)';
  var m = toScreen(MIRROR.x - 24, MIRROR.y - 71);
  ctx.strokeRect(m.x, m.y, S(48), S(71));
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  var c = toScreen(cam.x - viewW() / 2, cam.y - viewH() / 2);
  ctx.strokeRect(c.x, c.y, S(viewW()), S(viewH()));
}

function update(dt) {
  pumpCoros(dt);
  updateStars(dt);
  dreamUpdate(dt);
  mirrorUpdate(dt);
  bdUpdate(dt);
  sbUpdate(dt);
  updateParts(dt);
  updateCamShake(dt);
  playCamUpdate(dt);
  playUpdate(dt);
  updatePlayDust(dt);
}

var lastT = 0, AUTO_FREEZE = false;      // AUTO_FREEZE：?auto= 快进后定格，供无头截图逐帧核对
function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastT) lastT = ts;
  var dt = Math.min(0.05, Math.max(0, (ts - lastT) / 1000));
  lastT = ts;
  if (AUTO_FREEZE) { render(); return; }
  DT = dt;
  tGlobal += dt;
  update(dt);
  render();
}

function hintEl() { return document.getElementById('hint'); }
// 直接改 opacity：CSS transition 在 --virtual-time-budget 下不推进，截图会残留
function hideHint() { var h = hintEl(); if (h) { h.style.transition = 'none'; h.style.opacity = '0'; } }
function showHint() { var h = hintEl(); if (h) { h.style.transition = ''; h.style.opacity = '1'; } }

function resetScene() {
  playStop();
  coros.length = 0;
  parts.length = 0;
  rings.length = 0;
  MIRROR.smashed = false; MIRROR.smashEnded = false; MIRROR.breakT = 0;
  SESSION_DREAMING = false; STAR_FALLING = 0;
  MIRROR.shineAlpha = 0.5; MIRROR.updateShine = true; MIRROR.autoUpdateReflection = true;
  MIRROR.refl.x = 35; MIRROR.refl.y = GLASS_H; MIRROR.refl.anim = 'idle';
  MIRROR.refl.frame = 0; MIRROR.refl.t = 0; MIRROR.refl.show = true;
  if (MIRROR.refl.hair) MIRROR.refl.hair.reset(MIRROR.refl.x, MIRROR.refl.y, -1);
  DREAM.playerHasDreamDash = false;
  DREAM.whiteFill = 0; DREAM.whiteHeight = 1;
  DREAM.shaker = null; DREAM.shakeX = 0; DREAM.shakeY = 0;
  DREAM.animTimer = 0; DREAM.wobbleFrom = 0; DREAM.wobbleTo = 0; DREAM.wobbleEase = 0;
  dreamSetup();
  BD.alive = false; BD.hair = null;
  cam.x = 160; cam.y = 216; cam.zoom = 1; cam.sx = 0; cam.sy = 0;
  cam.shakeT = 0; cam.shakeAmt = 0;
  CUT.started = false; CUT.done = false;
  STORY.gen++;
  sbClear();
  storySyncBar();
  showHint();
}

// 持久化呈现态：镜子「已破」或梦块「已激活」时跳过过场，直接把渲染推到终态。
// 只改呈现/MIRROR/DREAM 字段，不碰 localStorage —— 事实本身由宿主在真实碎裂帧写入。
function applyStateNow(smashed, dreamDash) {
  if (smashed) {
    MIRROR.smashed = true; MIRROR.smashEnded = true;
    MIRROR.breakT = 0.72;                       // 9 帧碎玻璃的最后一帧（delay 0.08）
    SESSION_DREAMING = true;                    // StarsBG 进入下坠拖尾分支
    MIRROR.updateShine = false;
    MIRROR.shineOffset = 33; MIRROR.shineAlpha = 1;
    MIRROR.autoUpdateReflection = false;
    MIRROR.refl.show = false;                   // 镜面碎完：倒影不再出现在洞里
    CUT.started = true; CUT.done = true;        // 本次停留不再触发完整过场
    hideHint();
  }
  if (dreamDash) {                              // DreamBlock.ActivateNoRoutine 的结果
    DREAM.playerHasDreamDash = true;
    dreamSetup();
  }
}
var PENDING_STATE = null;                        // boot 前的请求队列（init 是异步的）

function boot() {
  resize();
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { resize(); }).observe(cv); } catch (e) {}
  }
  IMG.vanish = tintTex(IMG.starfield0, '#C9A0FF');
  mirrorInit();
  buildStars();
  setupDebris();
  prerenderRoom();
  dreamSetup();
  // 素材/房间就绪前宿主可能已经请求了持久化状态（刷新后首次进房会命中这条路径）
  if (PENDING_STATE) {
    var st = PENDING_STATE;
    PENDING_STATE = null;
    applyStateNow(st[0], st[1]);
  }
  storyEnsureHit();
  SCENE.booted = true;
  if (PENDING_STORY_ENTER) { PENDING_STORY_ENTER = false; storyEnter(); }
  // 刷新后首次进房：宿主在 init 完成前就要求「已碎镜直接出人」，这里补上
  if (PLAY_PENDING) { PLAY_PENDING = false; playStart(); }
  // 测试入口：?story=dived 预置状态（独立页验证用，不影响正常进入）
  if (SCENE.autoStart) {
    var qs = /[?&]story=(dived)/.exec(location.search);
    if (qs) { storyWrite(qs[1]); storyEnter(); }
  }
  loadHair(function () {
    MIRROR.refl.hair = makeHair();
    if (MIRROR.refl.hair) MIRROR.refl.hair.reset(MIRROR.refl.x, MIRROR.refl.y, -1);
    if (BD.alive && !BD.hair) {           // 快进期间生成的 Badeline：补上头发
      BD.hair = makeHair();
      if (BD.hair) BD.hair.reset(BD.x, BD.y, -1);
    }
    if (SB.alive && !SB.hair) {           // 出场先于头发就绪：补上
      SB.hair = makeHair();
      settleHair(SB.hair, SB.x, SB.y, SB.scaleX);
    }
    autoHook();                            // 头发就绪后再做无头快进
  });

  // 独立页（autoStart）自带点击/快捷键/调试控件；嵌入 shelf 时这些交由宿主处理，
  // 避免劫持全局 Space/R 键与重复触发过场。
  if (SCENE.autoStart) {
    cv.addEventListener('pointerdown', function () {
      if (CUT.started) return;
      startCoro(cutscene());
    });

    var dbg = document.getElementById('debug');
    if (dbg) dbg.addEventListener('change', function () { DBG = dbg.checked; });

    var rp = document.getElementById('replay');
    if (rp) rp.addEventListener('click', resetScene);

    var sx = document.getElementById('sfx');
    if (sx) sx.addEventListener('change', function () { sfxOn = sx.checked; });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'KeyR') resetScene();
      if (e.code === 'Space' && !CUT.started) startCoro(cutscene());
    });
  }

  // 调试钩：?auto=秒 开场并快进到指定时刻（无头截图 / 逐帧核对用）
  function autoHook() {
    var q = /[?&]auto=([\d.]+)/.exec(location.search);
    if (!q) return;
    // 先空跑 2s：让镜中倒影的头发从 Start() 的甩入位置稳定下来（等价于用户停留后再点击）
    for (var w = 0; w < 120; w++) { DT = 1 / 60; tGlobal += DT; update(DT); }
    tGlobal = 0;
    startCoro(cutscene());
    var ff = parseFloat(q[1]) || 0;
    for (var i = 0; i < Math.round(ff * 60); i++) {
      DT = 1 / 60; tGlobal += DT; update(DT);
    }
    AUTO_FREEZE = true;               // 定格：截图必须与本处探针数值严格同帧
    // ?auto= 同时把运行时状态写到 body[data-probe]，便于 --dump-dom 核对时序
    document.body.setAttribute('data-probe', JSON.stringify({
      t: +tGlobal.toFixed(2),
      cam: [+cam.x.toFixed(1), +cam.y.toFixed(1), +cam.zoom.toFixed(2)],
      cut: [CUT.started, CUT.done],
      smashed: MIRROR.smashed,
      breakT: +MIRROR.breakT.toFixed(2),
      glassFrame: MIRROR.smashed ? Math.min(9, Math.floor(MIRROR.breakT / 0.08)) : -1,
      shine: [+MIRROR.shineOffset.toFixed(1), +MIRROR.shineAlpha.toFixed(2)],
      refl: [+MIRROR.refl.x.toFixed(1), +MIRROR.refl.y.toFixed(1), MIRROR.refl.anim, MIRROR.refl.show],
      bd: [BD.alive, Math.round(BD.x), Math.round(BD.y), BD.anim, BD.frame],
      hair: [!!MIRROR.refl.hair, !!BD.hair],
      geo: [+W.toFixed(1), +H.toFixed(1), +Z.toFixed(3), +cam.zoom.toFixed(2), +S(32).toFixed(1)],
      dream: [DREAM.playerHasDreamDash, +DREAM.whiteFill.toFixed(2), +DREAM.whiteHeight.toFixed(2)],
      starDream: [SESSION_DREAMING, +STAR_FALLING.toFixed(1)]
    }));
  }

  requestAnimationFrame(loop);
}

// 组件化入口：canvasEl 为挂载的 <canvas>，opts 覆盖 SCENE 行为。
// shelf 嵌入用 { drawBadeline:true, autoStart:false, onDone:fn } —— Badeline 由本模块按
// 世界坐标绘制（绝对锚定在镜心，跑出画面后 RemoveSelf），过场结束再交给宿主 summon() 的 DOM 层。
function initScene(canvasEl, opts) {
  if (!canvasEl || cv) return;
  opts = opts || {};
  cv = canvasEl;
  ctx = cv.getContext('2d');
  SCENE.drawBadeline = opts.drawBadeline !== undefined ? !!opts.drawBadeline : true;
  SCENE.onBreak = opts.onBreak || null;
  SCENE.onEnd = opts.onEnd || null;
  SCENE.onDone = opts.onDone || null;
  SCENE.onCam = opts.onCam || null;
  SCENE.autoStart = opts.autoStart !== undefined ? !!opts.autoStart : true;
  // 音源钩子：pt1 sting 本地仓库缺失（见 docs/celeste-shelf-mirror-rea.md），
  // 宿主可通过 opts.sting1Src 注入同名事件的音频；不注入则保持静默，不拿别的曲子顶替。
  SCENE.sting1Src = opts.sting1Src || null;
  if (SCENE.sting1Src) mkSfx('sting1', SCENE.sting1Src, 0.5);
  var go = function () { if (!_sceneReady) { _sceneReady = true; boot(); playEnsureLoaded(); } };
  if (_assetsReady) go();
  else loadAll(function () { _assetsReady = true; go(); });
}

window.MirrorScene = {
  init: initScene,
  // 宿主（shelf 镜子点击）主动触发完整过场：推近→碎镜→上移→入梦
  breakNow: function () { if (_sceneReady && !CUT.started) startCoro(cutscene()); },
  // 同步快进 n 秒（60Hz）：宿主无头验证用，不受 rAF 节流影响
  ff: function (n) {
    for (var i = 0; i < Math.round((+n || 0) * 60); i++) { DT = 1 / 60; tGlobal += DT; update(DT); }
  },
  reset: function () { if (_sceneReady) resetScene(); },
  // 持久化呈现态：smashed=镜子按已破渲染，dreamDash=梦块按已激活渲染。
  // 未就绪（init 仍在校验/加载素材）时排队，boot 完成后补上，刷新后首次进房不会闪回未破镜。
  applyState: function (smashed, dreamDash) {
    if (!_sceneReady) { PENDING_STATE = [!!smashed, !!dreamDash]; return; }
    applyStateNow(!!smashed, !!dreamDash);
  },
  resize: function () { resize(); },
  isReady: function () { return _sceneReady; },
  // —— 可操控 Badeline（碎镜后）——
  // 宿主在过场结束 / 已破镜重进时调用：站在默认落点 (160,264)，直接可操控
  playStart: playStart,
  playStop: playStop,
  isPlaying: function () { return PLAY.active; },
  playDbg: function () {
    return {
      active: PLAY.active, removed: PLAY.removed, frozen: PLAY.frozen, dived: PLAY.dived,
      loaded: !!PLAY.ch, x: PLAY.ch ? +PLAY.ch.x.toFixed(1) : null, y: PLAY.ch ? +PLAY.ch.y.toFixed(1) : null,
      onGround: PLAY.ch ? !!PLAY.ch.onGround : null, state: PLAY.ch ? PLAY.ch.state : null,
      stamina: PLAY.ch ? +PLAY.ch.stamina.toFixed(1) : null, dust: PLAY_DUST.length,
      lift: +PLAY.camLift.toFixed(2), liftTo: PLAY.camLiftTo,
      cam: [+cam.x.toFixed(1), +cam.y.toFixed(1)]
    };
  },
  // —— 梦境剧情（测试版）——
  // 重进房间时由宿主调用：按 localStorage 状态播出场 / 补位
  storyEnter: storyEnter,
  // 当前剧情状态（sleep / dived / appeared / diaryShown）
  storyStage: function () { var s = storyRead(); return s ? s.stage : 'sleep'; },
  // 宿主（dream 场景）在出场播完后写入 appeared；TTL 与其他写入点一致
  storyMark: function (stage) { storyWrite(stage); storySyncBar(); },
  // 手动恢复：清空状态、撤下剧情 Badeline（右下角按钮同此入口）
  storyReset: storyReset,
  // 宿主把 DOM Badeline 的当前位置（CSS px，脚底）交给 canvas，并声明隐藏方式
  setHostBadeline: storySetHost,
  // 诊断快照：宿主页无头验证/排错用（过场协程是否在推进、碎镜是否发生）
  dbg: function () {
    return {
      cut: CUT.started, done: CUT.done, smashed: MIRROR.smashed, coros: coros.length, t: +tGlobal.toFixed(2),
      story: [STORY.stage, SB.alive, +SB.x.toFixed(0), +SB.y.toFixed(0), +SB.alpha.toFixed(2)],
      sb: [SB.anim, sbFrames()[SB.frame], !!IMG[sbFrames()[SB.frame]], !!SB.hair, +SB.size.toFixed(2)]
    };
  },
  // 游戏像素 → canvas CSS 像素缩放因子（Z = H/180）：宿主用它把 DOM 人物尺寸对齐过场里 32px 角色
  scale: function () { return Z; },
  // 镜子在 canvas 内的当前屏幕包围盒（CSS px，相对画布左上=房间左上）。
  // shelf 用它把 #shelfMirror 命中区盖到画出的镜子上，其余区域点击透传给房间做 goBack。
  mirrorRect: function () {
    if (!cv || !W || !H) return null;
    var a = toScreen(MIRROR.x - FRAME_W / 2, MIRROR.y - FRAME_H);
    var b = toScreen(MIRROR.x + FRAME_W / 2, MIRROR.y);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }
};

// 独立页自动挂载：存在 #cv 即以其为 canvas 启动（行为与旧版一致）。
(function () {
  var auto = document.getElementById('cv');
  if (!auto) return;
  initScene(auto, { drawBadeline: true, autoStart: true });
  window.addEventListener('error', function (e) {
    document.body.setAttribute('data-err', (e.message || 'err') + ' @' + (e.lineno || 0));
  });
})();

})();
