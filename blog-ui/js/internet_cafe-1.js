/* ============================================================================
   Internet Cafe · 第九章 Farewell 的真实场景（房间 lvl_f-00）
   ----------------------------------------------------------------------------
   数据来源：Content/Maps/LostLevels.bin
     · 瓦片：solids（m=lostlevels · n=scifi）、bg（e=bgLostLevels）
     · 装饰：bgdecals / fgdecals（10-farewell 的植物、碎石、珊瑚、裂纹、故障块）
     · 实体：wavedashmachine（咖啡厅本体）、spikes、floatingDebris、dreamBlock
     · 背景：/Map/Style 的 bright 组（见 internet_cafe-2.js）
   机制来源：REA 反编译 Celeste.dll 的 WaveDashTutorialMachine
     · playerInside = X-37 < player.X < X+46 且 player.Y > Y-58（或与 frontWall 相交）
     · insideEase = Approach(±1, dt*4) → 前墙/霓虹 Color=White*(1-insideEase)
     · cameraEase = Approach(±1, dt*2) → Level.ZoomSnap((160,90), 1+0.75*QuadInOut)
     · frontWall.Collidable = !playerInside；noise 每 0.05s 随机翻转
   ============================================================================ */
(async function () {
  'use strict';

  var MAP = window.CAFE_MAP;
  var ROOM = MAP.room;
  var TILE = 8;
  var COLS = ROOM.w / TILE;
  var ROWS = ROOM.h / TILE;
  var BASE = 'Atlases/Gameplay/';

  // 地图导出时右侧/底部的空白被裁剪掉了，这里补回 '0'，保证按 tx/ty 取值不会越界
  function padGrid(rows, cols, rowCount) {
    var out = [];
    for (var i = 0; i < rowCount; i++) {
      var r = rows[i] || '';
      out.push(r.length >= cols ? r : r + new Array(cols - r.length + 1).join('0'));
    }
    return out;
  }
  MAP.solids = padGrid(MAP.solids, COLS, ROWS);
  MAP.bg = padGrid(MAP.bg, COLS, ROWS);

  var MACHINE = { x: MAP.machine[0], y: MAP.machine[1] };        // (168,128) 建筑底边中心
  var TV = { x: MACHINE.x - 16, y: MACHINE.y - 39, w: 32, h: 18 }; // 屏幕：世界 (152,89)-(184,107)
  var FRONT_WALL = { x0: MACHINE.x - 41, y0: MACHINE.y - 59, w: 88, h: 38 }; // 原作 frontWall
  var SPAWN = { x: MAP.players[0][0], y: MAP.players[0][1] };     // 原作出生点 (280,136)：咖啡厅右侧的地面

  // ===== 左侧的车（REA: Celeste.IntroCar，0-Intro 序章实体；非序章章节带路面 + 两道栏杆）=====
  // 位置是自选的（第九章房间本来没有车），但碰撞 / 悬挂 / 音效 / 渲染层级严格按 IL 复刻：
  //   · 碰撞 ColliderList：Hitbox(25,4,-15,-17) + Hitbox(19,4,8,-11)（JumpThru，只挡上方）
  //   · 悬挂 Update：踩上瞬间 MoveV(2) 下沉；Y>startY 且 (!hasRider || Y>startY+1) 时 MoveV(-10*dt) 回弹
  //   · 音效：踩上播 car_down（GetLandSoundIndex 覆盖默认落地音）、离开播 car_up
  //   · depth：pavement -10001 · 白栏杆 -10 · 车身 1 · 轮 3 · 深灰栏杆 5（轮子不随车下沉）
  var CAR = { x: 72, y: 128, startY: 128, didHaveRider: false };

  // ===== 果冻（REA: Celeste.BounceBlock，第二章 Old Site 的弹跳块；实体名 bounceBlock）=====
  // 全部数值来自 Celeste.dll 的 BounceBlock.Update/Break IL 内联字面量（const 字段被编译进调用处）：
  //   WindUpDist 10 · IceWindUpDist 16 · BounceDist 24 · LiftSpeedXMult 0.75
  //   RespawnTime 1.6 · BounceEndTime 0.05 · WindUpDelay 0.2
  // 状态机（Update）：0 静置 → 1 蓄力内缩 → 2 反向弹出 → 3 0.05s 后碎裂 → 4 碎裂等待重生
  // 触发条件（WindUpPlayerCheck）：玩家站在顶面（Speed.Y >= 0），或贴住侧面且处于 Climb 态、面朝块体
  // 玩家被弹飞的位移由 ShakeOffPlayer 写入（Speed = bounceLift）；bounceLift 的 X 也乘 0.75
  // 素材：BuildSprite 把 'objects/bumpblocknew/fire00'（64×64 = 8×8 格）按 8×8 切片铺满块体，
  //       中心叠 'bumpBlockCenterFire'（Sprites.xml：objects/BumpBlockNew/fire_center，7 帧 0.08s）
  //       碎裂 / 重生的碎石：'objects/bumpblocknew/fire_rubble'（4 帧，BreakDebris / RespawnDebris）
  // 尺寸：原作由地图 EntityData.Width/Height 决定；本场景自选 16×16（两格），
  //       放在最右侧那段空旷场景里（x 808..824，y 96..112），正好落在两枚悬空刺（x 784 / x 832）之间的空域
  var JELLY = {
    x: 808, y: 96, w: 16, h: 16, startX: 808, startY: 96,
    state: 0, iceMode: false, iceModeNext: false,
    moveSpeed: 0, windUpProgress: 0, windUpStartTimer: 0,
    respawnTimer: 0, bounceEndTimer: 0, reformDelay: 0,
    bounceDir: { x: 0, y: -1 }, bounceLift: { x: 0, y: 0 },
    debrisDirection: { x: 0, y: -1 },
    reappearFlash: 0, reformed: true
  };
  var JELLY_WIND_UP_DIST = 10, JELLY_BOUNCE_DIST = 24, JELLY_LIFT_X_MULT = 0.75;
  var JELLY_RESPAWN_TIME = 1.6, JELLY_BOUNCE_END_TIME = 0.05;
  var jellyBreak = [], jellyRespawn = [];

  // ===== 梦境方块（REA: Celeste.DreamBlock，第二章 Old Site 的特殊机制；实体名 dreamBlock）=====
  // 全部数值取自 Celeste.dll 的 DreamBlock .ctor / Added / Setup / Update / Render / WobbleLine IL：
  //   · .cctor 颜色：activeBackColor=Black · disabledBackColor=#1F2E2D
  //                  activeLineColor=White · disabledLineColor=#6A8480
  //   · Setup：粒子数 = (int)(Width/8 * Height/8 * 0.7)；Layer = Choose(0,1,1,2,2,2)
  //            playerHasDreamDash 时按层随机取色（每层三选一）：
  //              L0 FFEF11 / FF00D0 / 08A310 · L1 5FCDE4 / 7FB25E / E0564C · L2 5B6EE1 / CC3B3B / 7DAA64
  //   · Update：animTimer += 6*dt；wobbleEase += 2*dt，>1 时 wobbleFrom=wobbleTo、wobbleTo=随机(2π)
  //   · Render：黑底 → 粒子 → whiteFill → 四条 WobbleLine（offset 0 / 0.7 / 1.5 / 2.5）→ 四角 2×2 角块
  //   · 粒子帧：L0 = (TimeOffset*4+animTimer)%4 → particles[3-i]；L1 = (…*2+animTimer)%2 → particles[1+i]；
  //            L2 恒 particles[2]；且只有落在块内 (X+2 .. Right-2) 的粒子才画
  //   · OnPlayerExit：Dust.Burst(Center, Angle(Speed), 16, null)
  // 本场景视为「已获得梦境冲刺」（= 原作 Session.Inventory.DreamDash），故 playerHasDreamDash = true。
  // 坐标直接沿用地图导出的 dreamBlocks 实体（四块浮在 x 408..560 / y 16..112 的空域）。
  var DREAM_BLOCKS = [];
  var DREAM_LAYER_COLORS = [
    ['#FFEF11', '#FF00D0', '#08A310'],
    ['#5FCDE4', '#7FB25E', '#E0564C'],
    ['#5B6EE1', '#CC3B3B', '#7DAA64']
  ];
  var DREAM_ACTIVE_BACK = '#000000', DREAM_DISABLED_BACK = '#1F2E2D';
  var DREAM_ACTIVE_LINE = '#FFFFFF', DREAM_DISABLED_LINE = '#6A8480';
  var DREAM_TAU = Math.PI * 2;
  // 原作 ctor 的 particleTextures：idx 0..3 → particles.png 内横坐标（GetSubtexture 的 x）
  var DREAM_TEX_SX = [14, 7, 0, 7];
  // Displacement.AddBurst 的轻量近似（引擎无 shader，见研究文档 G21）：
  //   · DreamDashUpdate 块内 OnInterval(.04) AddBurst(Center, 0.3, 0, 40, 1)
  //   · DreamBlock.FootstepRipple 落地 AddBurst(Position, 0.5, 0, 40, 1)
  var dreamRipples = [], dreamRippleTimer = 0;

  // 原作 Setup 的粒子生成：数量、层、TimeOffset、颜色
  function dreamParticles(w, h) {
    var count = Math.floor(w / 8 * h / 8 * 0.7);
    var list = [];
    for (var i = 0; i < count; i++) {
      // 原作 Calc.Random.Choose(0, 1, 1, 2, 2, 2) → 1/6、2/6、3/6
      var r = Math.random();
      var layer = r < 1 / 6 ? 0 : (r < 0.5 ? 1 : 2);
      var pal = DREAM_LAYER_COLORS[layer];
      list.push({
        x: Math.random() * w, y: Math.random() * h,
        layer: layer,
        timeOffset: Math.random(),
        color: pal[(Math.random() * pal.length) | 0]
      });
    }
    return list;
  }
  (MAP.dreamBlocks || []).forEach(function (d) {
    DREAM_BLOCKS.push({
      x: d[0], y: d[1], w: d[2], h: d[3],
      particles: dreamParticles(d[2], d[3]),
      animTimer: 0,
      wobbleFrom: Math.random() * DREAM_TAU,
      wobbleTo: Math.random() * DREAM_TAU,
      wobbleEase: 0,
      whiteHeight: 1, whiteFill: 0,
      playerHasDreamDash: true
    });
  });

  var cv = document.getElementById('scene');
  var ctx = cv.getContext('2d');
  var hudEl = document.getElementById('hud');
  var promptEl = document.getElementById('tvPrompt');
  var fadeEl = document.getElementById('fade');
  var muteBtn = document.getElementById('mute');

  var W = 0, H = 0, dpr = 1;

  // ===== 图片 / 染色缓存 =====
  var IMG = {}, TEX = {};
  function loadImage(src) {
    return new Promise(function (res) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      i.src = src;
    });
  }
  function put(key, path) {
    return loadImage(path).then(function (i) { IMG[key] = i; });
  }
  // XNA SpriteBatch 的 Color 相乘：multiply 上色 + destination-in 还原 alpha
  function tinted(key, color, flipX, flipY) {
    var ck = key + '|' + (color || '-') + (flipX ? '|x' : '') + (flipY ? '|y' : '');
    if (TEX[ck] !== undefined) return TEX[ck];
    var img = IMG[key];
    if (!img) return (TEX[ck] = null);
    if (!color && !flipX && !flipY) { TEX[ck] = img; return img; }
    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var g = c.getContext('2d');
    function place() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (flipX) { g.translate(c.width, 0); g.scale(-1, 1); }
      if (flipY) { g.translate(0, c.height); g.scale(1, -1); }
      g.drawImage(img, 0, 0);
    }
    place();
    if (color) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in';
      place();
    }
    TEX[ck] = c;
    return c;
  }
  var getTex = function (key, color, flipX, flipY) { return tinted(key, color, flipX, flipY); };

  // ===== 素材清单 =====
  function preload() {
    var jobs = [];
    // 背景 stylegrounds（bgs/10/skybrighter 在 Game 图集，mist / purplesunset 在 Misc 图集）
    jobs.push(put('sky', BASE + 'bgs/10/skybrighter.png'));
    jobs.push(put('mist', 'Atlases/Misc/mist.png'));
    jobs.push(put('sun', 'Atlases/Misc/purplesunset.png'));
    for (var i = 0; i < 3; i++) jobs.push(put('bgs/10/big0' + i, BASE + 'bgs/10/big0' + i + '.png'));
    for (var j = 0; j < 7; j++) jobs.push(put('bgs/10/small0' + j, BASE + 'bgs/10/small0' + j + '.png'));
    for (var k = 0; k < 4; k++) jobs.push(put('sf' + k, BASE + 'particles/starfield/0' + k + '.png'));
    // 瓦片图集：m=lostlevels · n=scifi · e=bgLostLevels
    jobs.push(put('m', BASE + 'tilesets/lostlevels.png'));
    jobs.push(put('n', BASE + 'tilesets/scifi.png'));
    jobs.push(put('e', BASE + 'tilesets/bgLostLevels.png'));
    // 咖啡厅建筑（120×79，底边中心对齐实体位置）
    jobs.push(put('back', BASE + 'objects/wavedashtutorial/building_back.png'));
    jobs.push(put('frontLeft', BASE + 'objects/wavedashtutorial/building_front_left.png'));
    jobs.push(put('frontRight', BASE + 'objects/wavedashtutorial/building_front_right.png'));
    IMG.neon = [];
    for (var n = 0; n < 15; n++) {
      (function (idx) {
        jobs.push(loadImage(BASE + 'objects/wavedashtutorial/neon_' + String(idx).padStart(2, '0') + '.png')
          .then(function (im) { IMG.neon[idx] = im; }));
      })(n);
    }
    IMG.noise = [];
    for (var q = 0; q < 3; q++) {
      (function (idx) {
        jobs.push(loadImage(BASE + 'objects/wavedashtutorial/noise0' + idx + '.png')
          .then(function (im) { IMG.noise[idx] = im; }));
      })(q);
    }
    // 杂物 / 尖刺
    jobs.push(put('debris', BASE + 'scenery/debris.png'));
    jobs.push(put('spikeUp', BASE + 'danger/spikes/default_up00.png'));
    jobs.push(put('spikeLeft', BASE + 'danger/spikes/default_left00.png'));
    // 序章 IntroCar 四件套（scenery/car/*）
    jobs.push(put('carBody', BASE + 'scenery/car/body.png'));
    jobs.push(put('carWheels', BASE + 'scenery/car/wheels.png'));
    jobs.push(put('carBarrier', BASE + 'scenery/car/barrier.png'));
    jobs.push(put('carPavement', BASE + 'scenery/car/pavement.png'));
    // 果冻 BounceBlock：块体纹理 fire00（64×64 = 8×8 格，BuildSprite 按 8px 切片）
    // 中心动画来自 Sprites.xml 的 bumpBlockCenterFire → objects/BumpBlockNew/fire_center（7 帧 0.08s）
    // 碎裂 / 重生碎石同样取该目录的 fire_rubble（4 帧，BreakDebris / RespawnDebris 随机）
    jobs.push(put('jellyBody', BASE + 'objects/BumpBlockNew/fire00.png'));
    IMG.jellyCenter = [];
    for (var bj = 0; bj < 7; bj++) {
      (function (idx) {
        jobs.push(loadImage(BASE + 'objects/BumpBlockNew/fire_center0' + idx + '.png')
          .then(function (im) { IMG.jellyCenter[idx] = im; }));
      })(bj);
    }
    IMG.jellyRubble = [];
    for (var br = 0; br < 4; br++) {
      (function (idx) {
        jobs.push(loadImage(BASE + 'objects/BumpBlockNew/fire_rubble0' + idx + '.png')
          .then(function (im) { IMG.jellyRubble[idx] = im; }));
      })(br);
    }
    // 梦境方块粒子：objects/dreamblock/particles.png（21×7，三片 7×7 子图，索引 0/1/2）
    // 原作 .ctor 取子图 (14,0)、(7,0)、(0,0)、(7,0)，即 particleTextures = [x14, x7, x0, x7]
    jobs.push(put('dreamParticles', BASE + 'objects/dreamblock/particles.png'));
    // 装饰（bg 在前、fg 在玩家之前之后）
    MAP.bgDecals.forEach(function (d) {
      if (!IMG['decal:' + d[0]]) jobs.push(put('decal:' + d[0], BASE + 'decals/' + d[0]));
    });
    MAP.fgDecals.forEach(function (d) {
      if (!IMG['decal:' + d[0]]) jobs.push(put('decal:' + d[0], BASE + 'decals/' + d[0]));
    });
    return Promise.all(jobs);
  }

  // ===== 截图 / 缩放 =====
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    BASEZ = Math.max(3, H / ROOM.h);          // 1 游戏单位 = BASEZ 屏幕像素（房间高度铺满）
    if (m) { computeZoom(); snapCam(); render(); }
  }
  window.addEventListener('resize', resize);

  // ===== 瓦片自动拼接（复刻 Celeste.Autotiler::orig_TileHandler）=====
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
  // 三套图集的 padding / center 覆盖（ForegroundTiles.xml m / n，BackgroundTiles.xml e）
  var AT_PADDED_M = [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]];
  var AT_CENTER_M = [];
  for (var ci = 0; ci < 14; ci++) AT_CENTER_M.push([5, 6]);
  [[5, 7], [5, 8], [5, 9], [5, 10], [5, 11], [5, 13], [5, 14],
   [5, 7], [5, 8], [5, 9], [5, 10], [5, 11], [5, 13], [5, 14], [5, 12]]
    .forEach(function (t) { AT_CENTER_M.push(t); });
  var AT_PADDED_N = [];
  for (var ni = 0; ni < 12; ni++) AT_PADDED_N.push([5, ni]);
  var AT_CENTER_N = [[5, 12]];
  var AT_BG = [];
  for (var bi = 5; bi < 15; bi++) AT_BG.push([4, bi]);
  for (var bj = 0; bj < 15; bj++) AT_BG.push([5, bj]);

  // 坐标哈希取帧：静态构图不会随刷新跳变
  function pickTile(list, tx, ty) {
    var h = Math.imul(tx | 0, 374761393) + Math.imul(ty | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return list[((h ^ (h >>> 16)) >>> 0) % list.length];
  }
  function gridChar(grid, tx, ty) {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return '0';
    return grid[ty][tx];
  }
  function autoTile(set, tx, ty) {
    var grid = set === 'e' ? MAP.bg : MAP.solids;
    var ignores = set === 'm' ? 'n' : null;          // m 的 tileset 忽略 n
    function nb(x, y) {
      var c = gridChar(grid, x, y);
      if (c === '0') return false;
      if (ignores && c === ignores) return false;
      return true;
    }
    var all = true;
    for (var dy = -1; dy <= 1 && all; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!nb(tx + dx, ty + dy)) { all = false; break; }
      }
    }
    if (all) {
      var far = nb(tx - 2, ty) || nb(tx + 2, ty) || nb(tx, ty - 2) || nb(tx, ty + 2);
      if (set === 'm') return pickTile(far ? AT_CENTER_M : AT_PADDED_M, tx * TILE, ty * TILE);
      if (set === 'n') return pickTile(far ? AT_CENTER_N : AT_PADDED_N, tx * TILE, ty * TILE);
      return pickTile(AT_BG, tx * TILE, ty * TILE);
    }
    var m9 = '';
    for (var row = -1; row <= 1; row++) {
      for (var col = -1; col <= 1; col++) m9 += (col === 0 && row === 0) ? '1' : (nb(tx + col, ty + row) ? '1' : '0');
      if (row < 1) m9 += '-';
    }
    for (var e = 0; e < AT_EDGES.length; e++) {
      var pat = AT_EDGES[e][0], ok = true;
      for (var c2 = 0; c2 < 11 && ok; c2++) {
        var p = pat[c2];
        if (p !== '-' && p !== 'x' && p !== m9[c2]) ok = false;
      }
      if (ok) {
        var variant = Math.abs(tx * 7 + ty * 13) % 4;
        return [variant, AT_EDGES[e][1]];
      }
    }
    var corner = AT_CORNERS[m9];
    if (corner) return corner;
    if (set === 'm') return pickTile(AT_CENTER_M, tx * TILE, ty * TILE);
    if (set === 'n') return pickTile(AT_CENTER_N, tx * TILE, ty * TILE);
    return pickTile(AT_BG, tx * TILE, ty * TILE);
  }
  // 按图集分成两组：m=lostlevels / n=scifi / e=bgLostLevels
  var spriteM = [], spriteN = [], bgSprites = [];
  function buildTiles() {
    spriteM = [];
    spriteN = [];
    bgSprites = [];
    for (var ty = 0; ty < ROWS; ty++) {
      for (var tx = 0; tx < COLS; tx++) {
        var cs = MAP.solids[ty][tx];
        if (cs !== '0') {
          var ts = autoTile(cs, tx, ty);
          var item = { tx: tx, ty: ty, sx: ts[0] * TILE, sy: ts[1] * TILE };
          (cs === 'n' ? spriteN : spriteM).push(item);
        }
        var cb = MAP.bg[ty][tx];
        if (cb !== '0') {
          var tb = autoTile('e', tx, ty);
          bgSprites.push({ tx: tx, ty: ty, sx: tb[0] * TILE, sy: tb[1] * TILE });
        }
      }
    }
  }

  // ===== 物理：房间瓦片网格 + 前墙 =====
  var m = null;
  var feetPrev = SPAWN.y;
  var frontWallOn = true;
  var VOID = 1e9;

  function tileChar(tx, ty) {
    if (tx < 0 || tx >= COLS || ty >= ROWS) return 'w';   // 房间外沿视为实心
    if (ty < 0) return '0';
    return MAP.solids[ty][tx];
  }
  function solidTile(tx, ty) { return tileChar(tx, ty) !== '0'; }

  function wallOverlapsY(y0, y1) {
    var r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
    if (r0 < 0) r0 = 0;
    if (r1 >= ROWS) r1 = ROWS - 1;
    return [r0, r1];
  }
  // 前墙（原作 frontWall）只在玩家还在门外时参与碰撞
  function frontWallBlocks(x0, x1, y0, y1) {
    if (!frontWallOn) return false;
    return x1 > FRONT_WALL.x0 && x0 < FRONT_WALL.x0 + FRONT_WALL.w &&
           y1 > FRONT_WALL.y0 && y0 < FRONT_WALL.y0 + FRONT_WALL.h;
  }

  // 果冻当前是否可碰撞：state 4 = 已碎裂等待重生；重生动画期间 reformed=false 也不可碰
  function jellySolid() { return JELLY.state !== 4 && JELLY.reformed; }
  // 玩家横向（8px 宽碰撞盒）是否压在果冻的 X 区间上
  function jellyOverX(x) { return x + 4 > JELLY.x && x - 4 < JELLY.x + JELLY.w; }

  // ===== 梦境方块（DreamBlock : Solid，四面都是实体，只有梦境冲刺能穿过）=====
  // 玩家 8×11 身体盒（脚底 feetY）与某块相交时返回该块（原作 CollideFirst<DreamBlock>）。
  // 与其它辅助函数一致地 ±0.5 内缩，避免「恰好贴面」被算成重叠。
  function dreamBlockAt(x, feetY) {
    var x0 = x - 4 + 0.5, x1 = x + 4 - 0.5, y0 = feetY - 11 + 0.5, y1 = feetY - 0.5;
    for (var i = 0; i < DREAM_BLOCKS.length; i++) {
      var b = DREAM_BLOCKS[i];
      if (x1 > b.x && x0 < b.x + b.w && y1 > b.y && y0 < b.y + b.h) return b;
    }
    return null;
  }

  // 落地涟漪判定：脚底恰好落在某 DreamBlock 顶面（原作 FootstepRipple 的落地调用点）
  function dreamBlockTopAt(x, feetY) {
    for (var i = 0; i < DREAM_BLOCKS.length; i++) {
      var b = DREAM_BLOCKS[i];
      if (Math.abs(b.y - feetY) < 0.6 && x + 4 > b.x && x - 4 < b.x + b.w) return b;
    }
    return null;
  }

  function groundY(x) {
    var ref = Math.min(m.y, feetPrev);
    var best = VOID;
    var c0 = Math.floor((x - 4) / TILE), c1 = Math.floor((x + 3.999) / TILE);
    var r0 = Math.floor(ref / TILE);
    if (r0 < 0) r0 = 0;
    for (var tx = c0; tx <= c1; tx++) {
      for (var ty = r0; ty < ROWS; ty++) {
        if (!solidTile(tx, ty)) continue;
        var top = ty * TILE;
        if (top < ref - 1) continue;
        if (top < best) best = top;
      }
    }
    if (frontWallOn && x + 4 > FRONT_WALL.x0 && x - 4 < FRONT_WALL.x0 + FRONT_WALL.w) {
      var top2 = FRONT_WALL.y0;
      if (top2 >= ref - 1 && top2 < best) best = top2;
    }
    // 车顶 = JumpThru 两段（原作 ColliderList）：x∈[-15,10] 顶 car.y-17，x∈[8,27] 顶 car.y-11
    if (x + 4 > CAR.x - 15 && x - 4 < CAR.x + 10) {
      var ct1 = CAR.y - 17;
      if (ct1 >= ref - 1 && ct1 < best) best = ct1;
    }
    if (x + 4 > CAR.x + 8 && x - 4 < CAR.x + 27) {
      var ct2 = CAR.y - 11;
      if (ct2 >= ref - 1 && ct2 < best) best = ct2;
    }
    // 果冻顶面：整块矩形都可站（原作 BounceBlock 是实体 Collider，不是 JumpThru）
    if (jellySolid() && jellyOverX(x)) {
      var jt = JELLY.y;
      if (jt >= ref - 1 && jt < best) best = jt;
    }
    // 梦境方块顶面（Solid，整块可站；梦境冲刺时由 DreamDashUpdate 直接穿过）
    for (var di = 0; di < DREAM_BLOCKS.length; di++) {
      var dbt = DREAM_BLOCKS[di];
      if (x + 4 > dbt.x && x - 4 < dbt.x + dbt.w) {
        if (dbt.y >= ref - 1 && dbt.y < best) best = dbt.y;
      }
    }
    return best;
  }

  function wallCollideAt(edgeX, feetY, dir) {
    var y0 = feetY - 11 + 0.5, y1 = feetY - 0.5;
    var rr = wallOverlapsY(y0, y1);
    if (dir > 0) {
      if (edgeX >= ROOM.w) return ROOM.w;
      var tx = Math.floor(edgeX / TILE);
      for (var ty = rr[0]; ty <= rr[1]; ty++) {
        if (solidTile(tx, ty)) return tx * TILE;
      }
      if (frontWallBlocks(edgeX, edgeX + 1, y0, y1)) return FRONT_WALL.x0;
    } else {
      if (edgeX <= 0) return 0;
      var tx2 = Math.floor(edgeX / TILE);
      for (var ty2 = rr[0]; ty2 <= rr[1]; ty2++) {
        if (solidTile(tx2, ty2)) return (tx2 + 1) * TILE;
      }
      if (frontWallBlocks(edgeX - 1, edgeX, y0, y1)) return FRONT_WALL.x0 + FRONT_WALL.w;
    }
    // 果冻侧面：朝块内推进的边一旦进入矩形就贴住对应面
    if (jellySolid() && y1 > JELLY.y && y0 < JELLY.y + JELLY.h &&
        edgeX > JELLY.x && edgeX < JELLY.x + JELLY.w) {
      return dir > 0 ? JELLY.x : JELLY.x + JELLY.w;
    }
    // 梦境方块侧面（Solid）
    for (var dw = 0; dw < DREAM_BLOCKS.length; dw++) {
      var dbw = DREAM_BLOCKS[dw];
      if (y1 > dbw.y && y0 < dbw.y + dbw.h &&
          edgeX > dbw.x && edgeX < dbw.x + dbw.w) {
        return dir > 0 ? dbw.x : dbw.x + dbw.w;
      }
    }
    return null;
  }

  function wallAt(x, feetY, dir) {
    var y0 = feetY - 11 + 0.5, y1 = feetY - 0.5;
    var rr = wallOverlapsY(y0, y1);
    var edge = dir > 0 ? x + 4 : x - 4;
    for (var d = 0; d <= 6; d += 1) {
      var probe = edge + dir * d;
      if (probe < 0 || probe > ROOM.w) return dir > 0 ? ROOM.w : 0;
      var tx = Math.floor(probe / TILE);
      for (var ty = rr[0]; ty <= rr[1]; ty++) {
        if (solidTile(tx, ty)) return dir > 0 ? tx * TILE : (tx + 1) * TILE;
      }
      // 果冻侧面（同一个 6px 探测范围内）
      if (jellySolid() && probe > JELLY.x && probe < JELLY.x + JELLY.w &&
          y1 > JELLY.y && y0 < JELLY.y + JELLY.h) {
        return dir > 0 ? JELLY.x : JELLY.x + JELLY.w;
      }
      // 梦境方块侧面（同一个 6px 探测范围内）
      for (var dw2 = 0; dw2 < DREAM_BLOCKS.length; dw2++) {
        var db2 = DREAM_BLOCKS[dw2];
        if (probe > db2.x && probe < db2.x + db2.w &&
            y1 > db2.y && y0 < db2.y + db2.h) {
          return dir > 0 ? db2.x : db2.x + db2.w;
        }
      }
    }
    return null;
  }

  function ceilingY(x, feetY) {
    var head = feetY - 11;
    var r = Math.floor(head / TILE);
    if (r < 0) return null;
    var best = null;
    var c0 = Math.floor((x - 4) / TILE), c1 = Math.floor((x + 3.999) / TILE);
    for (var tx = c0; tx <= c1; tx++) {
      if (r < ROWS && solidTile(tx, r)) {
        var bottom = (r + 1) * TILE;
        if (bottom > head + 0.01 && (best === null || bottom < best)) best = bottom;
      }
    }
    if (frontWallOn && x + 4 > FRONT_WALL.x0 && x - 4 < FRONT_WALL.x0 + FRONT_WALL.w) {
      var fb = FRONT_WALL.y0 + FRONT_WALL.h;
      if (fb > head + 0.01 && (best === null || fb < best)) best = fb;
    }
    // 果冻底面（块体向上弹时会把站在上面的人带起来，撞头也算）
    // ★ 必须用「身体盒上移 1px 后与之重叠」的语义（原作 CollideCheck<Solid>(Position - UnitY)），
    //   否则站在块顶时块底会被当成头顶天花板 → 一按跳就被压回去（不能跳的根因）
    var headUp = head - 1, feetUp = feetY - 1;
    if (jellySolid() && x + 4 > JELLY.x && x - 4 < JELLY.x + JELLY.w &&
        JELLY.y + JELLY.h > headUp && JELLY.y < feetUp) {
      var jb = JELLY.y + JELLY.h;
      if (best === null || jb < best) best = jb;
    }
    // 梦境方块底面（Solid，同样只在头上移 1px 后与块重叠时才算撞顶）
    for (var dc = 0; dc < DREAM_BLOCKS.length; dc++) {
      var dbc = DREAM_BLOCKS[dc];
      if (x + 4 > dbc.x && x - 4 < dbc.x + dbc.w &&
          dbc.y + dbc.h > headUp && dbc.y < feetUp) {
        var dcb = dbc.y + dbc.h;
        if (best === null || dcb < best) best = dcb;
      }
    }
    return best;
  }

  function bodySolid(x, feetY) {
    var x0 = x - 4, x1 = x + 4, y0 = feetY - 11, y1 = feetY;
    var tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x1 - 0.001) / TILE);
    var ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y1 - 0.001) / TILE);
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (solidTile(tx, ty)) return true;
      }
    }
    // 果冻也是实体（8×16 矩形），嵌入即算实体
    if (jellySolid() && x1 > JELLY.x && x0 < JELLY.x + JELLY.w &&
        y1 > JELLY.y && y0 < JELLY.y + JELLY.h) return true;
    // 梦境方块也是 Solid（原作 DreamBlock : Solid）：DreamDashedIntoSolid 与推墙/悬挂都靠这条
    for (var ds = 0; ds < DREAM_BLOCKS.length; ds++) {
      var dbs = DREAM_BLOCKS[ds];
      if (x1 > dbs.x && x0 < dbs.x + dbs.w && y1 > dbs.y && y0 < dbs.y + dbs.h) return true;
    }
    return frontWallBlocks(x0, x1, y0, y1);
  }
  // DreamDashCheck 专用：「非 Solid 非 DreamBlock」的可碰撞实体
  // （原作 CollideCheck<Solid, DreamBlock> 是排除语义——瓦片/果冻/前墙/梦境块全被跳过，
  //   本场景只剩尖刺与车的 JumpThru 碰撞盒参与；dreamblock 周围没有这些实体，实际恒 false）
  function dreamForeign(x, feetY) {
    var x0 = x - 4, x1 = x + 4, y0 = feetY - 11, y1 = feetY;
    for (var i = 0; i < MAP.spikes.length; i++) {
      var s = MAP.spikes[i];
      var w = s.w || 8, h = s.h || 8;
      if (x1 > s.x && x0 < s.x + w && y1 > s.y && y0 < s.y + h) return true;
    }
    // 车的两段 JumpThru 碰撞盒：Hitbox(25,4,-15,-17) + Hitbox(19,4,8,-11)
    if (x1 > CAR.x - 15 && x0 < CAR.x + 10 && y1 > CAR.y - 17 && y0 < CAR.y - 13) return true;
    if (x1 > CAR.x + 8 && x0 < CAR.x + 27 && y1 > CAR.y - 11 && y0 < CAR.y - 7) return true;
    return false;
  }

  // ===== 相机 =====
  var cam = { x: SPAWN.x, y: ROOM.h / 2 };
  var BASEZ = 4, Z = 4;
  var cameraEase = 0, insideEase = 0;
  var leaveZoom = 1;

  function computeZoom() {
    Z = BASEZ * (1 + 0.75 * cameraEase) * leaveZoom;
  }
  function viewW() { return W / Z; }
  function viewH() { return H / Z; }
  function clampCam() {
    var vw = viewW(), vh = viewH();
    cam.x = vw >= ROOM.w ? ROOM.w / 2 : Math.min(Math.max(cam.x, vw / 2), ROOM.w - vw / 2);
    cam.y = vh >= ROOM.h ? ROOM.h / 2 : Math.min(Math.max(cam.y, vh / 2), ROOM.h - vh / 2);
  }
  function snapCam() {
    cam.x = m.x; cam.y = ROOM.h / 2;
    clampCam();
  }
  function updateCam(dt) {
    var tx = m.x + (160 - m.x) * cameraEase;
    var ty = (ROOM.h / 2) + (90 - ROOM.h / 2) * cameraEase;
    var k = Math.min(1, dt * 6);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    clampCam();
  }
  function toScreen(p) {
    return {
      x: (p.x - cam.x + viewW() / 2) * Z,
      y: (p.y - cam.y + viewH() / 2) * Z
    };
  }

  // ===== 输入 =====
  var keys = Object.create(null);
  var jumpEdge = false, dashEdge = false;
  function audioUnlock() { unlock = true; }
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    var first = !keys[k];
    keys[k] = true;
    if (first && (e.code === 'Space' || k === ' ')) { keys[' '] = true; jumpEdge = true; e.preventDefault(); }
    if (first && k === 'c') jumpEdge = true;
    if (first && (k === 'x' || k === 'k')) dashEdge = true;
    if (first && k === 'r') respawn();
    if (first && k === 'm') toggleMute();
    if (first && (k === 'enter' || k === 'e') && playerInside && !leaving) enterBerryOS();
    audioUnlock();
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    keys[k] = false;
    if (e.code === 'Space') keys[' '] = false;
  });
  window.addEventListener('blur', function () {
    for (var k in keys) keys[k] = false;
    jumpEdge = dashEdge = false;
  });

  // ===== 音效（咖啡厅里的电脑开关机 / 鼠标点击）=====
  var WAVE = 'Atlases/WaveDashing/sound/';
  function snd(src, vol) {
    var a = new Audio(src);
    a.preload = 'auto';
    a.volume = vol;
    return a;
  }
  var sfxEnter = snd(WAVE + 'cafe_computer_on.wav', 0.5);
  var sfxLeave = snd(WAVE + 'cafe_computer_off.wav', 0.45);
  var sfxDown = snd(WAVE + 'cafe_mouseclick_down.wav', 0.5);
  var sfxUp = snd(WAVE + 'cafe_mouseclick_up.wav', 0.45);
  // 序章车悬挂音效：event:/game/00_prologue/car_up · car_down（FMOD 各 5 个变体随机播）
  var CAR_SND = 'Atlases/scenery/car/sound/';
  var sfxCarUp = [], sfxCarDown = [];
  for (var ci = 1; ci <= 5; ci++) {
    sfxCarUp.push(snd(CAR_SND + 'game_00_car_up_0' + ci + '.ogg', 0.55));
    sfxCarDown.push(snd(CAR_SND + 'game_00_car_down_0' + ci + '.ogg', 0.55));
  }
  var muted = false, unlock = false;
  function playSfx(a) {
    if (muted || !unlock) return;
    try { a.currentTime = 0; a.play().catch(function () {}); } catch (err) {}
  }
  function toggleMute() {
    muted = !muted;
    muteBtn.innerHTML = muted ? '&#128263;' : '&#9835;';
  }
  muteBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    unlock = true;
    toggleMute();
  });
  window.addEventListener('pointerdown', function () { unlock = true; });

  // ===== DreamBlock 音效（REA 取证：Celeste.Player.DreamDashBegin / DreamDashEnd）=====
  // DreamDashBegin：Play("event:/char/madeline/dreamblock_enter")
  //                 Loop(dreamSfxLoop, "event:/char/madeline/dreamblock_travel")
  // DreamDashEnd：  Stop(dreamSfxLoop); Play("event:/char/madeline/dreamblock_exit")
  // FMOD 的 Play 在 event 内随机取变体 → 本地各 4 个（01~04）；travel 为无缝循环段。
  var DB_SND = 'celeste-sounds/dreamblock/';
  var DB_ENTER = [], DB_EXIT = [];
  for (var dbi = 1; dbi <= 4; dbi++) {
    DB_ENTER.push(snd(DB_SND + 'dreamblock_enter_0' + dbi + '.wav', 0.6));
    DB_EXIT.push(snd(DB_SND + 'dreamblock_exit_0' + dbi + '.wav', 0.6));
  }
  var sfxDreamTravel = snd(DB_SND + 'dreamblock_travel_loop.wav', 0.5);
  sfxDreamTravel.loop = true;
  function dreamTravelStart() {
    if (muted || !unlock) return;
    try { sfxDreamTravel.currentTime = 0; sfxDreamTravel.play().catch(function () {}); } catch (err) {}
  }
  function dreamTravelStop() {
    try { sfxDreamTravel.pause(); sfxDreamTravel.currentTime = 0; } catch (err) {}
  }

  // ===== IntroCar.Update（悬挂，IL 逐条复刻）=====
  // x 处的车顶高度（不在车顶返回 null）；两段重叠区取更高的那段
  function carTopAt(x) {
    var t = null;
    if (x + 4 > CAR.x - 15 && x - 4 < CAR.x + 10) t = CAR.y - 17;
    if (x + 4 > CAR.x + 8 && x - 4 < CAR.x + 27) {
      var t2 = CAR.y - 11;
      if (t === null || t2 < t) t = t2;
    }
    return t;
  }
  function updateCar(dt) {
    var top = carTopAt(m.x);
    var hasRider = m.onGround && top !== null && Math.abs(m.y - top) < 0.6; // 原作 HasRider()
    if (CAR.y > CAR.startY && (!hasRider || CAR.y > CAR.startY + 1)) CAR.y -= 10 * dt; // MoveV(-10*dt)
    if (CAR.y <= CAR.startY && !CAR.didHaveRider && hasRider) CAR.y += 2;              // MoveV(2)
    if (CAR.didHaveRider && !hasRider) playSfx(sfxCarUp[(Math.random() * 5) | 0]);     // car_up
    CAR.didHaveRider = hasRider;
  }

  // ===== BounceBlock.Update（REA 逐条复刻）=====
  function vecLen(x, y) { return Math.sqrt(x * x + y * y); }
  // 原作 Calc.SafeNormalize(v, defaultValue)：长度为 0 时返回默认方向
  function safeNormalize(vx, vy, fx, fy) {
    var d = vecLen(vx, vy);
    if (d < 1e-5) return { x: fx, y: fy };
    return { x: vx / d, y: vy / d };
  }
  function jellyCenter() { return { x: JELLY.x + JELLY.w / 2, y: JELLY.y + JELLY.h / 2 }; }
  // 玩家碰撞盒中心（8×11，脚底 m.y）
  function playerCenter() { return { x: m.x, y: m.y - 5.5 }; }
  // 原作 Calc.Approach(Vector2)：沿直线逼近目标
  function approachVec(fromX, fromY, toX, toY, maxMove) {
    var dx = toX - fromX, dy = toY - fromY;
    var d = vecLen(dx, dy);
    if (d <= maxMove || d < 1e-5) return { x: toX, y: toY };
    return { x: fromX + dx / d * maxMove, y: fromY + dy / d * maxMove };
  }

  // 原作 WindUpPlayerCheck：顶面站人（Speed.Y >= 0）→ 触发；侧面攀爬且面朝块体 → 触发
  function windUpPlayerCheck() {
    if (!m) return null;
    // 顶面：玩家脚底贴在块顶（Position - UnitY 的那条 1px 带）
    if (m.vy >= 0 && m.y > JELLY.y - 1.5 && m.y < JELLY.y + 1.5 && jellyOverX(m.x)) return m;
    // 侧面：必须 Climb 态，且面朝块体（右侧贴面 facing=-1，左侧贴面 facing=+1）
    if (m.state === CelesteCharacter.ST.Climb && m.y > JELLY.y && m.y - 11 < JELLY.y + JELLY.h) {
      if (m.facing === -1 && Math.abs((m.x - 4) - (JELLY.x + JELLY.w)) < 1.5) return m;
      if (m.facing === 1 && Math.abs((m.x + 4) - JELLY.x) < 1.5) return m;
    }
    return null;
  }

  // 原作 ShakeOffPlayer：把骑乘者踢出攀爬/站立态并直接给速度（Player.StateMachine.State = 0）
  function shakeOffPlayer(lift) {
    if (!m) return;
    m.setState(CelesteCharacter.ST.Normal);
    m.vx = lift.x;
    m.vy = lift.y;
    m.jumpGraceTimer = 0.1;    // 原作 StartJumpGraceTime()；引擎 JUMP_GRACE_TIME = 0.1
    m.onGround = false;
  }

  // 移动块体并把玩家一起处理：顶面骑乘者跟着走，非骑乘却重叠的按位移方向挤出
  function moveJelly(dx, dy) {
    if (!dx && !dy) return;
    var oldTop = JELLY.y;
    var riding = m && m.onGround &&
      Math.abs(m.y - oldTop) < 1.5 && jellyOverX(m.x);
    JELLY.x += dx;
    JELLY.y += dy;
    if (!m) return;
    if (riding) {
      m.x += dx;
      m.y = JELLY.y;           // 脚底始终踩在新顶面
      m.onGround = true;
      return;
    }
    // 非骑乘但被块体压到：沿位移方向推出去
    if (m.x + 4 > JELLY.x && m.x - 4 < JELLY.x + JELLY.w &&
        m.y > JELLY.y && m.y - 11 < JELLY.y + JELLY.h) {
      if (dy < 0) { m.y = JELLY.y; m.vy = Math.min(m.vy, 0); }
      else if (dy > 0) { m.y = JELLY.y + JELLY.h + 11; }
      if (dx > 0) { m.x = JELLY.x + JELLY.w + 4; m.vx = Math.max(m.vx, 0); }
      else if (dx < 0) { m.x = JELLY.x - 4; m.vx = Math.min(m.vx, 0); }
    }
  }

  // 原作 Break：碎裂 + 按 8px 网格生成 BreakDebris
  function breakJelly() {
    JELLY.state = 4;
    JELLY.reformed = false;
    JELLY.respawnTimer = JELLY_RESPAWN_TIME;
    JELLY.reformDelay = 0;
    var cols = Math.round(JELLY.w / 8), rows = Math.round(JELLY.h / 8);
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var ang = Math.atan2(JELLY.debrisDirection.y, JELLY.debrisDirection.x) +
                  (Math.random() * 2 - 1) * 0.1;      // Angle(dir) + Range(-.1, .1)
        var sp = 120 + Math.random() * 80;             // Range(120, 200)
        jellyBreak.push({
          x: JELLY.x + i * 8 + 4, y: JELLY.y + j * 8 + 4,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          frame: (Math.random() * 4) | 0,
          dur: 2 + Math.random(),                      // Range(2, 3)
          percent: 0
        });
      }
    }
    // 原作 hot 模式播 bounceblock_break + Rumble（音效/震屏未接入，见 gaps）
  }

  // 原作重生：从块内各格中心向外 12px 聚拢（RespawnDebris，duration 0.35）
  function spawnRespawnDebris() {
    var c = { x: JELLY.startX + JELLY.w / 2, y: JELLY.startY + JELLY.h / 2 };
    var cols = Math.round(JELLY.w / 8), rows = Math.round(JELLY.h / 8);
    for (var i = 0; i < cols; i++) {
      for (var j = 0; j < rows; j++) {
        var fx = JELLY.startX + i * 8 + 4, fy = JELLY.startY + j * 8 + 4;
        var nx = fx - c.x, ny = fy - c.y, d = vecLen(nx, ny);
        var tx = fx, ty = fy;
        if (d > 1e-5) { tx += nx / d * 12; ty += ny / d * 12; }
        jellyRespawn.push({
          fx: fx, fy: fy, tx: tx, ty: ty,
          frame: (Math.random() * 4) | 0,
          dur: 0.35, percent: 0
        });
      }
    }
  }

  // 碎屑推进（BreakDebris：水平减速 180、竖直 +200 重力；RespawnDebris：CubeIn 插值）
  function updateJellyDebris(dt) {
    for (var i = jellyBreak.length - 1; i >= 0; i--) {
      var b = jellyBreak[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx = approach(b.vx, 0, 180 * dt);
      b.vy += 200 * dt;
      b.percent += dt / b.dur;
      if (b.percent >= 1) jellyBreak.splice(i, 1);
    }
    for (var k = jellyRespawn.length - 1; k >= 0; k--) {
      var r = jellyRespawn[k];
      r.percent += dt / r.dur;
      if (r.percent > 1) jellyRespawn.splice(k, 1);
    }
  }

  function updateJelly(dt) {
    if (!m) return;
    // Render 用的重生白框衰减
    if (JELLY.reappearFlash > 0) JELLY.reappearFlash = Math.max(0, JELLY.reappearFlash - dt);
    updateJellyDebris(dt);
    if (JELLY.state === 4 && JELLY.reformDelay <= 0 && JELLY.respawnTimer <= 0) {
      // —— 重生：先尝试归位到出生点，被玩家/实心卡住就这一帧先不重生 ——
      var oldX = JELLY.x, oldY = JELLY.y;
      JELLY.x = JELLY.startX; JELLY.y = JELLY.startY;
      // 原作 Position = StartPosition 后 CollideCheck<Solid>() || CollideCheck<Player>() 则回退
      var solidHit = false;
      var btx0 = Math.floor(JELLY.x / TILE), btx1 = Math.floor((JELLY.x + JELLY.w - 0.001) / TILE);
      var bty0 = Math.floor(JELLY.y / TILE), bty1 = Math.floor((JELLY.y + JELLY.h - 0.001) / TILE);
      for (var bty = bty0; bty <= bty1 && !solidHit; bty++) {
        for (var btx = btx0; btx <= btx1; btx++) {
          if (solidTile(btx, bty)) { solidHit = true; break; }
        }
      }
      var blocked = solidHit ||
        (m.x + 4 > JELLY.x && m.x - 4 < JELLY.x + JELLY.w &&
         m.y > JELLY.y && m.y - 11 < JELLY.y + JELLY.h);
      if (blocked) { JELLY.x = oldX; JELLY.y = oldY; return; }
      spawnRespawnDebris();
      JELLY.reformDelay = 0.35;                       // 原作 Alarm(.35f)
      return;
    }

    // —— state 0：静置，检查触发 ——
    if (JELLY.state === 0) {
      JELLY.moveSpeed = approach(JELLY.moveSpeed, 100, 400 * dt);
      var t0 = approachVec(JELLY.x, JELLY.y, JELLY.startX, JELLY.startY, JELLY.moveSpeed * dt);
      moveJelly(t0.x - JELLY.x, t0.y - JELLY.y);
      JELLY.windUpProgress = approach(JELLY.windUpProgress, 0, dt);
      if (windUpPlayerCheck()) {
        JELLY.moveSpeed = 80;
        JELLY.windUpStartTimer = 0;
        var pc = playerCenter(), jc = jellyCenter();
        // 冰模式固定朝上；热模式朝「玩家中心 - 块中心」
        JELLY.bounceDir = JELLY.iceMode ? { x: 0, y: -1 }
          : safeNormalize(pc.x - jc.x, pc.y - jc.y, 0, -1);
        JELLY.state = 1;
        // 原作 Rumble + bounceblock_touch 音效（gap）
      }
      return;
    }

    // —— state 1：蓄力内缩（10px；冰 16px），windUpProgress 0→1 ——
    if (JELLY.state === 1) {
      var wp = windUpPlayerCheck();
      if (wp) {
        var pc1 = playerCenter(), jc1 = jellyCenter();
        JELLY.bounceDir = JELLY.iceMode ? { x: 0, y: -1 }
          : safeNormalize(pc1.x - jc1.x, pc1.y - jc1.y, 0, -1);
      }
      if (JELLY.windUpStartTimer > 0) { JELLY.windUpStartTimer -= dt; return; }
      JELLY.moveSpeed = approach(JELLY.moveSpeed, JELLY.iceMode ? 35 : 40, 600 * dt);
      var mult = JELLY.iceMode ? 0.333 : 1;
      var inset = JELLY.iceMode ? 16 : JELLY_WIND_UP_DIST;
      var tx = JELLY.startX - JELLY.bounceDir.x * inset;
      var ty = JELLY.startY - JELLY.bounceDir.y * inset;
      moveJellyToward(tx, ty, JELLY.moveSpeed * mult * dt);
      var dx1 = tx - JELLY.x, dy1 = ty - JELLY.y;
      var d1 = vecLen(dx1, dy1);
      // 原作：windUpProgress = ClampedMap(distance, 16, 2, 0, 1)
      JELLY.windUpProgress = Math.max(0, Math.min(1, (d1 - 16) / (2 - 16)));
      if ((!JELLY.iceMode && JELLY.windUpProgress >= 0.5) ||
          (JELLY.iceMode && d1 * d1 <= 12)) {
        // 原作 StartShaking(0.1f)：屏幕抖动（gap）
      }
      if (d1 * d1 > 2) return;
      if (JELLY.iceMode) { breakJelly(); return; }
      JELLY.state = 2;
      JELLY.moveSpeed = 0;
      return;
    }

    // —— state 2：反向弹出（BounceDist 24），结束时把玩家踢飞 ——
    if (JELLY.state === 2) {
      JELLY.moveSpeed = approach(JELLY.moveSpeed, 140, 800 * dt);
      var bx = JELLY.startX + JELLY.bounceDir.x * JELLY_BOUNCE_DIST;
      var by = JELLY.startY + JELLY.bounceDir.y * JELLY_BOUNCE_DIST;
      moveJellyToward(bx, by, JELLY.moveSpeed * dt);
      // 原作 bounceLift = SafeNormalize(target - pos) * Min(moveSpeed*3, 200)，X 再乘 0.75
      var liftSpeed = Math.min(JELLY.moveSpeed * 3, 200);
      var lift = safeNormalize(bx - JELLY.x, by - JELLY.y, JELLY.bounceDir.x, JELLY.bounceDir.y);
      JELLY.bounceLift = { x: lift.x * JELLY_LIFT_X_MULT * liftSpeed, y: lift.y * liftSpeed };
      JELLY.windUpProgress = 1;
      var dEnd = vecLen(bx - JELLY.x, by - JELLY.y);
      var stillThere = windUpPlayerCheck();
      if (dEnd < 0.5 || (!JELLY.iceMode && !stillThere)) {
        JELLY.debrisDirection = safeNormalize(bx - JELLY.startX, by - JELLY.startY, 0, -1);
        JELLY.state = 3;
        JELLY.moveSpeed = 0;
        JELLY.bounceEndTimer = JELLY_BOUNCE_END_TIME;
        shakeOffPlayer(JELLY.bounceLift);
      }
      return;
    }

    // —— state 3：弹出后 0.05s 才碎裂（让玩家先吃到速度） ——
    if (JELLY.state === 3) {
      JELLY.bounceEndTimer -= dt;
      if (JELLY.bounceEndTimer <= 0) breakJelly();
      return;
    }

    // —— state 4：碎裂等待（respawnTimer 1.6 → 归位 → 0.35s 聚拢动画） ——
    if (JELLY.state === 4) {
      if (JELLY.reformDelay > 0) {
        JELLY.reformDelay -= dt;
        if (JELLY.reformDelay <= 0) {
          JELLY.reformed = true;
          JELLY.reappearFlash = 0.6;
          JELLY.state = 0;
          JELLY.moveSpeed = 0;
          // 原作 bounceblock_reappear 音效（gap）
        }
        return;
      }
      JELLY.respawnTimer -= dt;
      return;
    }
  }

  // 朝目标平移，横向位移乘 LiftSpeedXMult（0.75）
  function moveJellyToward(toX, toY, maxStep) {
    var dx = toX - JELLY.x, dy = toY - JELLY.y;
    var d = vecLen(dx, dy);
    if (d < 1e-5) return;
    var sx = d <= maxStep ? dx : dx / d * maxStep;
    var sy = d <= maxStep ? dy : dy / d * maxStep;
    moveJelly(sx * JELLY_LIFT_X_MULT, sy);
  }

  // ===== 咖啡厅状态（原作 WaveDashTutorialMachine.Update）=====
  var playerInside = false;
  var noiseFlipX = 1, noiseFlipY = 1, noiseFlipT = 0;
  var leaving = false, leaveT = 0;

  function approach(v, target, maxMove) {
    return v < target ? Math.min(v + maxMove, target) : Math.max(v - maxMove, target);
  }
  function updateCafe(dt) {
    var inX = m.x > MACHINE.x - 37 && m.x < MACHINE.x + 46;
    // 原作：player.Y > Y-58 直接算「在店内」；更高处则要求真的碰到前墙
    var yOk = m.y > MACHINE.y - 58;
    var hitWall = frontWallOn &&
      m.y > FRONT_WALL.y0 && m.y - 11 < FRONT_WALL.y0 + FRONT_WALL.h &&
      m.x + 4 > FRONT_WALL.x0 && m.x - 4 < FRONT_WALL.x0 + FRONT_WALL.w;
    var inside = !leaving && inX && (yOk || hitWall);
    if (inside !== playerInside) {
      playerInside = inside;
      if (inside) { playSfx(sfxEnter); hudEl.textContent = '店内 · 点击屏幕进入 berryOS'; }
      else { playSfx(sfxLeave); hudEl.textContent = '门外 · 走近咖啡厅'; }
      hudEl.classList.toggle('inside', inside);
    }
    frontWallOn = !playerInside;
    insideEase = approach(insideEase, playerInside ? 1 : 0, dt * 4);
    cameraEase = approach(cameraEase, playerInside ? 1 : 0, dt * 2);
    if (time > noiseFlipT) {
      noiseFlipT = time + 0.05;
      var f = (Math.random() * 4) | 0;
      noiseFlipX = (f === 1 || f === 3) ? -1 : 1;
      noiseFlipY = (f === 2 || f === 3) ? -1 : 1;
    }
  }

  // ===== 死亡 / 重生 =====
  var dust = [], time = 0, flash = 0, deathTimer = 0;
  // angle 省略 = 向上全向爆散；传入弧度 = 沿该方向的锥形（原作 Dust.Burst(pos, angle, n)）
  function spawnDust(x, y, n, angle) {
    var hasAngle = typeof angle === 'number';
    for (var i = 0; i < n; i++) {
      var a = hasAngle ? angle + (Math.random() - 0.5) * 0.8
                       : -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      var sp = 18 + Math.random() * 34;
      dust.push({
        x: x, y: y - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
        life: 0.3 + Math.random() * 0.35, ttl: 0.65
      });
    }
  }
  // Displacement.AddBurst 近似：
  //   AddBurst(pos, strength, dir, radius, duration) 在原作里是把 pos 附近像素沿速度方向推开，
  //   再由 AddBurst(...).WorldClipCollider = dreamBlock.Collider / WorldClipPadding = 2 裁到块体内。
  // 引擎无 shader，用「沿速度拉伸的白色环 + 块体裁剪」近似，方向与裁剪半径严格对齐 IL：
  //   · DreamDashUpdate 块内 OnInterval(.04) AddBurst(Center, 0.3, 0, 40, 1)
  //   · DreamBlock.FootstepRipple 落地 AddBurst(Position, 0.5, 0, 40, 1)
  function spawnRipple(x, y, radius, strength, angle, clipBlock) {
    dreamRipples.push({
      x: x, y: y, r1: radius, life: 0.25, max: 0.25,
      strength: strength, angle: angle || 0, clip: clipBlock || null
    });
  }
  // quiet=true：开局定位用，不放白闪/冻结（否则一进场先白一下再卡 0.35s）
  function respawn(quiet) {
    m.x = SPAWN.x; m.y = SPAWN.y; m.vx = 0; m.vy = 0;
    feetPrev = SPAWN.y;
    m.onGround = true; m.ducking = false; m.fastJump = false;
    m.scaleX = m.scaleY = 1; m.maxFall = 160; m.highestAirY = 0;
    m.varJumpTimer = 0; m.jumpGraceTimer = 0; m.jumpBufferTimer = 0;
    m.setState(CelesteCharacter.ST.Normal);
    m.dashes = m.maxDashes; m.stamina = 110; m.freezeTimer = 0;
    m.dashTime = 0; m.dashTrail.length = 0;
    m.wallSlideDir = 0; m.wallSlideTimer = 1.2; m.dashAttackTimer = 0;
    m.bodySolidFn = bodySolid;
    dreamTravelStop();   // 重生时停掉可能残留的 dreamblock_travel 循环
    if (m.sprite) m.sprite.play('idle');
    m.hair.reset(SPAWN.x, SPAWN.y, 1);
    snapCam();
    dust.length = 0;
    if (quiet) {
      deathTimer = 0;
      flash = 0;
    } else {
      deathTimer = 0.35;
      flash = Math.max(flash, 0.35);
    }
  }
  function die() {
    if (deathTimer > 0 || leaving) return;
    respawn();
  }
  function touchingSpikes() {
    var x0 = m.x - 4, x1 = m.x + 4, y0 = m.y - 11, y1 = m.y;
    for (var i = 0; i < MAP.spikes.length; i++) {
      var s = MAP.spikes[i];
      var w = s.w || 8, h = s.h || 8;
      if (x1 > s.x + 1 && x0 < s.x + w - 1 && y1 > s.y + 1 && y0 < s.y + h - 1) return true;
    }
    return false;
  }

  // ===== 进入 berryOS =====
  function enterBerryOS() {
    if (leaving || !playerInside) return;
    leaving = true; leaveT = 0;
    promptEl.classList.remove('show');
    playSfx(sfxDown);
    fadeEl.classList.add('show');
    setTimeout(function () { location.href = 'berryos.html'; }, 950);
  }

  // ===== 鼠标交互（电视屏 = 可交互按钮）=====
  function eventWorld(e) {
    var r = cv.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    return {
      x: cam.x - viewW() / 2 + px / Z,
      y: cam.y - viewH() / 2 + py / Z
    };
  }
  function tvHit(p) {
    if (insideEase < 0.55 || leaving) return false;
    return p.x >= TV.x - 3 && p.x <= TV.x + TV.w + 3 &&
           p.y >= TV.y - 3 && p.y <= TV.y + TV.h + 3;
  }
  cv.addEventListener('pointermove', function (e) {
    cv.style.cursor = tvHit(eventWorld(e)) ? 'pointer' : 'default';
  });
  cv.addEventListener('pointerdown', function (e) {
    unlock = true;
    if (tvHit(eventWorld(e))) enterBerryOS();
  });
  // 提示胶囊本身也当按钮：它浮在电视上方，直接点它一样进 berryOS
  promptEl.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    unlock = true;
    enterBerryOS();
  });

  // ===== 车相关渲染（原作 depth：pavement -10001 · 白栏杆 -10 · 车身 1 · 轮 3 · 深灰栏杆 5）=====
  // pavement：IntroPavement(Bounds.Left, car.Y, X-Bounds.Left-48)，8px 一列
  function drawPavement() {
    var img = IMG.carPavement;
    if (!img) return;
    var cols = Math.floor((CAR.x - 48) / TILE);
    var s = TILE * Z;
    for (var i = 0; i < cols; i++) {
      // 原作 Awake：前 columns-2 列随机 0/1 子图，倒数第二列固定 2，末列固定 3（用坐标哈希固定「随机」）
      var sub = i < cols - 2 ? pickTile([0, 1], i, 0) : (i === cols - 2 ? 2 : 3);
      var p = toScreen({ x: i * TILE, y: CAR.startY });
      if (p.x + s < 0 || p.x > W) continue;
      ctx.drawImage(img, sub * TILE, 0, TILE, TILE, Math.round(p.x), Math.round(p.y), Math.round(s), Math.round(s));
    }
  }
  // 栏杆：IntroCarBarrier，Origin=(0,Height) → 左下角对齐位置；栏杆不随悬挂动
  function drawBarrier(bx, color) {
    var img = color ? tinted('carBarrier', color) : IMG.carBarrier;
    if (!img) return;
    if (!cullRect(bx, CAR.startY - img.height, img.width, img.height)) return;
    var p = toScreen({ x: bx, y: CAR.startY });
    var w = Math.round(img.width * Z), h = Math.round(img.height * Z);
    ctx.drawImage(img, Math.round(p.x), Math.round(p.y - h), w, h);
  }
  // 车身 + 轮子 + 深灰栏杆（画在玩家之后）。车身 Origin=(32,18)，随悬挂下沉；
  // 轮子是独立 Entity 不动（原作 MoveV 只动车体 → 悬架压缩效果）
  function drawCar() {
    var body = IMG.carBody, wheels = IMG.carWheels;
    var w, h, p;
    if (body) {
      if (cullRect(CAR.x - 32, CAR.y - 18, body.width, body.height)) {
        p = toScreen({ x: CAR.x - 32, y: CAR.y - 18 });
        ctx.drawImage(body, Math.round(p.x), Math.round(p.y),
          Math.round(body.width * Z), Math.round(body.height * Z));
      }
    }
    if (wheels) {
      if (cullRect(CAR.x - 32, CAR.startY - 18, wheels.width, wheels.height)) {
        p = toScreen({ x: CAR.x - 32, y: CAR.startY - 18 });
        ctx.drawImage(wheels, Math.round(p.x), Math.round(p.y),
          Math.round(wheels.width * Z), Math.round(wheels.height * Z));
      }
    }
    drawBarrier(CAR.x + 41, '#A9A9A9');      // XNA Color.DarkGray
  }

  // ===== 果冻渲染（原作 BuildSprite + Render）=====
  // 块体：fire00 是 64×64 的 8×8 格图集；BuildSprite 对每格取 列/行（首列/末列固定，中间随机）
  function drawJelly() {
    if (JELLY.state === 4 || !JELLY.reformed) return;   // state 4 / 聚拢期间整块不可见
    if (!cullRect(JELLY.x, JELLY.y, JELLY.w, JELLY.h)) return;
    var body = IMG.jellyBody;
    var s = TILE * Z;
    if (body) {
      var cols = Math.round(JELLY.w / 8), rows = Math.round(JELLY.h / 8);
      var texCols = Math.floor(body.width / 8), texRows = Math.floor(body.height / 8);
      for (var i = 0; i < cols; i++) {
        // 首格用图集第 0 列，末格用最后列，中间格取随机列（这里用坐标哈希固定）
        var col = i === 0 ? 0 : (i * 8 >= JELLY.w - 8 ? texCols - 1
          : 1 + ((i * 7 + 3) % Math.max(1, texCols - 2)));
        for (var j = 0; j < rows; j++) {
          var row = j === 0 ? 0 : (j * 8 >= JELLY.h - 8 ? texRows - 1
            : 1 + ((j * 5 + 1) % Math.max(1, texRows - 2)));
          var p = toScreen({ x: JELLY.x + i * 8, y: JELLY.y + j * 8 });
          ctx.drawImage(body, col * 8, row * 8, 8, 8,
            Math.round(p.x), Math.round(p.y), Math.round(s), Math.round(s));
        }
      }
    }
    // 中心动画：Sprites.xml bumpBlockCenterFire → fire_center，7 帧 0.08s
    var center = IMG.jellyCenter && IMG.jellyCenter[Math.floor(time / 0.08) % 7];
    if (center) {
      var pc = toScreen({ x: JELLY.x + JELLY.w / 2, y: JELLY.y + JELLY.h / 2 });
      var cw = center.width * Z, ch = center.height * Z;
      ctx.drawImage(center, Math.round(pc.x - cw / 2), Math.round(pc.y - ch / 2),
        Math.round(cw), Math.round(ch));
    }
    // 原作 Render：reappearFlash > 0 时画闪白框（size = CubeOut(flash)*2）
    if (JELLY.reappearFlash > 0) {
      var flash = 1 - Math.pow(1 - JELLY.reappearFlash, 3);   // Ease.CubeOut
      var size = flash * 2;
      var p0 = toScreen({ x: JELLY.x - size, y: JELLY.y - size });
      ctx.globalAlpha = Math.min(1, flash);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(p0.x), Math.round(p0.y),
        Math.round((JELLY.w + size * 2) * Z), Math.round((JELLY.h + size * 2) * Z));
      ctx.globalAlpha = 1;
    }
  }

  // 碎屑：BreakDebris 按 White*(1-percent) 淡出；RespawnDebris 由外向内 CubeIn 聚拢
  function drawJellyDebris() {
    var img = IMG.jellyRubble;
    if (!img) return;
    var s = 8 * Z;                                  // fire_rubble 是 8×8
    for (var i = 0; i < jellyBreak.length; i++) {
      var b = jellyBreak[i];
      var f = img[b.frame];
      if (!f || !cullRect(b.x - 4, b.y - 4, 8, 8)) continue;
      var p = toScreen({ x: b.x, y: b.y });
      ctx.globalAlpha = Math.max(0, 1 - b.percent);
      ctx.drawImage(f, Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s));
    }
    for (var k = 0; k < jellyRespawn.length; k++) {
      var r = jellyRespawn[k];
      var fr = img[r.frame];
      if (!fr) continue;
      var t = r.percent * r.percent * r.percent;             // Ease.CubeIn
      var wx = r.fx + (r.tx - r.fx) * t, wy = r.fy + (r.ty - r.fy) * t;
      if (!cullRect(wx - 4, wy - 4, 8, 8)) continue;
      var p2 = toScreen({ x: wx, y: wy });
      ctx.globalAlpha = Math.min(1, r.percent);
      ctx.drawImage(fr, Math.round(p2.x - s / 2), Math.round(p2.y - s / 2), Math.round(s), Math.round(s));
    }
    ctx.globalAlpha = 1;
  }

  // ===== 梦境方块：Update / Render（原作 DreamBlock.Update / Render / WobbleLine / LineAmplitude）=====
  function updateDreamBlocks(dt) {
    for (var i = 0; i < DREAM_BLOCKS.length; i++) {
      var b = DREAM_BLOCKS[i];
      b.animTimer += 6 * dt;
      b.wobbleEase += 2 * dt;
      if (b.wobbleEase > 1) {
        b.wobbleEase = 0;
        b.wobbleFrom = b.wobbleTo;
        b.wobbleTo = Math.random() * DREAM_TAU;
      }
    }
  }

  // 原作 PutInside：按块宽/高把粒子坐标回卷进块内
  function dreamPutInside(b, px, py) {
    var right = b.x + b.w, bottom = b.y + b.h;
    if (px > right) px -= b.w * Math.ceil((px - right) / b.w);
    if (px < b.x) px += b.w * Math.ceil((b.x - px) / b.w);
    if (py > bottom) py -= b.h * Math.ceil((py - bottom) / b.h);
    if (py < b.y) py += b.h * Math.ceil((b.y - py) / b.h);
    return { x: px, y: py };
  }

  // 原作 LineAmplitude(offset, i) = (float)(Math.Sin(offset + i/16 + Math.Sin(offset*2 + i/32)*2π) + 1) * 1.5
  // （dreamblock_il.txt L1218-1243；调用处把 wobbleFrom/To + offsetArg 整体作为 offset 传入）
  function dreamLineAmplitude(offset, i) {
    return (Math.sin(offset + i / 16 + Math.sin(offset * 2 + i / 32) * DREAM_TAU) + 1) * 1.5;
  }
  function dreamLerp(a, b, t) { return a + (b - a) * t; }
  // 原作 Color.Lerp(color, Color.White, whiteFill)（IL L1121-1134：颜色在前、White 在后）
  function dreamTowardWhite(hex, t) {
    if (t <= 0) return hex;
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    r = Math.round(dreamLerp(r, 255, t));
    g = Math.round(dreamLerp(g, 255, t));
    b = Math.round(dreamLerp(b, 255, t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 世界坐标划线：1 世界像素 = Z 屏幕像素
  function strokeWorldLine(ax, ay, bx, by, color) {
    var p0 = toScreen({ x: ax, y: ay }), p1 = toScreen({ x: bx, y: by });
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  // 原作 WobbleLine(a, b, offset, backColor, lineColor)
  function dreamWobbleLine(b, ax, ay, bx, by, offsetArg, backColor, lineColor) {
    // IL L1121-1134：whiteFill > 0 时先 Color.Lerp(color, White, whiteFill)，背景色与主色都变白
    if (b.whiteFill > 0) {
      backColor = dreamTowardWhite(backColor, b.whiteFill);
      lineColor = dreamTowardWhite(lineColor, b.whiteFill);
    }
    var lx = bx - ax, ly = by - ay;
    var len = Math.sqrt(lx * lx + ly * ly);
    if (len < 4) return;
    var dirX = lx / len, dirY = ly / len;
    var perpX = dirY, perpY = -dirX;
    var offset = 0, step = 16, i = 2;
    while (i < len - 2) {
      var amp = dreamLerp(dreamLineAmplitude(b.wobbleFrom + offsetArg, i),
                          dreamLineAmplitude(b.wobbleTo + offsetArg, i), b.wobbleEase);
      if (i + step >= len) amp = 0;
      var add = Math.min(step, len - 2 - i);
      var px = ax + dirX * i + perpX * offset;
      var py = ay + dirY * i + perpY * offset;
      var nx = ax + dirX * (i + add) + perpX * amp;
      var ny = ay + dirY * (i + add) + perpY * amp;
      strokeWorldLine(px - perpX, py - perpY, nx - perpX, ny - perpY, backColor);
      strokeWorldLine(px - perpX * 2, py - perpY * 2, nx - perpX * 2, ny - perpY * 2, backColor);
      strokeWorldLine(px, py, nx, ny, lineColor);
      offset = amp;
      i += step;
    }
  }

  // ===== 梦境方块渲染（原作 Render 的绘制顺序）=====
  function drawDreamBlocks() {
    var sheet = IMG.dreamParticles;
    var camLeft = cam.x - viewW() / 2, camTop = cam.y - viewH() / 2;
    var ps = 7 * Z;                                   // 粒子子图 7×7
    ctx.lineWidth = Math.max(1, Z);
    for (var i = 0; i < DREAM_BLOCKS.length; i++) {
      var b = DREAM_BLOCKS[i];
      if (!cullRect(b.x, b.y, b.w, b.h)) continue;
      var active = b.playerHasDreamDash;
      var backColor = active ? DREAM_ACTIVE_BACK : DREAM_DISABLED_BACK;
      var lineColor = active ? DREAM_ACTIVE_LINE : DREAM_DISABLED_LINE;
      // 原作 DreamBlock.Render：所有绘制坐标 = (X, Y) + shake；本类型里 shaker 从未被赋值，
      // 因此 shake 恒为 (0,0)。保留该偏移以保证结构逐条对齐 IL。
      var sx = b.shakeX || 0, sy = b.shakeY || 0;

      // ① 底色
      var p0 = toScreen({ x: b.x + sx, y: b.y + sy });
      ctx.fillStyle = backColor;
      ctx.fillRect(Math.round(p0.x), Math.round(p0.y), Math.round(b.w * Z), Math.round(b.h * Z));

      // ② 粒子：位置 = Position + Camera.Position*(0.3+0.25*Layer)，再 PutInside
      if (sheet) {
        for (var k = 0; k < b.particles.length; k++) {
          var e = b.particles[k];
          var par = 0.3 + 0.25 * e.layer;
          var pos = dreamPutInside(b, e.x + camLeft * par, e.y + camTop * par);
          // 原作只画落在块内 2px 边距以内的粒子
          if (pos.x < b.x + 2 || pos.y < b.y + 2 ||
              pos.x >= b.x + b.w - 2 || pos.y >= b.y + b.h - 2) continue;
          var idx;
          if (e.layer === 2) idx = 2;                                              // particleTextures[2]
          else if (e.layer === 1) idx = 1 + (((e.timeOffset * 2 + b.animTimer) % 2) | 0);
          else idx = 3 - (((e.timeOffset * 4 + b.animTimer) % 4) | 0);
          var tex = getTex('dreamParticles', e.color);
          if (!tex) continue;
          var pp = toScreen({ x: pos.x + sx, y: pos.y + sy });
          // 原作 ctor：particleTextures = [sub(14,0), sub(7,0), sub(0,0), sub(7,0)]，idx→横坐标非单调
          ctx.drawImage(tex, DREAM_TEX_SX[idx], 0, 7, 7,
            Math.round(pp.x - ps / 2), Math.round(pp.y - ps / 2),
            Math.round(ps), Math.round(ps));
        }
      }

      // ③ whiteFill（原作 Draw.Rect(X, Y, Width, Height*whiteHeight, White*whiteFill)）
      if (b.whiteFill > 0) {
        ctx.globalAlpha = b.whiteFill;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(Math.round(p0.x), Math.round(p0.y),
          Math.round(b.w * Z), Math.round(b.h * b.whiteHeight * Z));
        ctx.globalAlpha = 1;
      }

      // ④ 四条抖动边：offset 依次 0.0 / 0.7 / 1.5 / 2.5（端点均 +shake）
      dreamWobbleLine(b, b.x + sx, b.y + sy, b.x + b.w + sx, b.y + sy, 0.0, backColor, lineColor);
      dreamWobbleLine(b, b.x + b.w + sx, b.y + sy, b.x + b.w + sx, b.y + b.h + sy, 0.7, backColor, lineColor);
      dreamWobbleLine(b, b.x + b.w + sx, b.y + b.h + sy, b.x + sx, b.y + b.h + sy, 1.5, backColor, lineColor);
      dreamWobbleLine(b, b.x + sx, b.y + b.h + sy, b.x + sx, b.y + sy, 2.5, backColor, lineColor);

      // ⑤ 四角 2×2 角块
      ctx.fillStyle = lineColor;
      var cw = Math.max(1, Math.round(2 * Z));
      var corners = [[b.x + sx, b.y + sy], [b.x + b.w - 2 + sx, b.y + sy],
                     [b.x + sx, b.y + b.h - 2 + sy], [b.x + b.w - 2 + sx, b.y + b.h - 2 + sy]];
      for (var c = 0; c < corners.length; c++) {
        var cp = toScreen({ x: corners[c][0], y: corners[c][1] });
        ctx.fillRect(Math.round(cp.x), Math.round(cp.y), cw, cw);
      }
    }
    ctx.lineWidth = 1;
  }

  // ===== 渲染 =====
  function cullRect(wx, wy, ww, wh) {
    var left = cam.x - viewW() / 2, top = cam.y - viewH() / 2;
    return !(wx + ww < left || wx > left + viewW() || wy + wh < top || wy > top + viewH());
  }

  function drawTiles(sprites, key) {
    var img = IMG[key];
    if (!img) return;
    var s = TILE * Z;
    var left = cam.x - viewW() / 2, top = cam.y - viewH() / 2;
    for (var i = 0; i < sprites.length; i++) {
      var t = sprites[i];
      var wx = t.tx * TILE, wy = t.ty * TILE;
      if (wx + TILE < left || wx > left + viewW() || wy + TILE < top || wy > top + viewH()) continue;
      var px = Math.round((wx - left) * Z);
      var py = Math.round((wy - top) * Z);
      ctx.drawImage(img, t.sx, t.sy, TILE, TILE, px, py, s, s);
    }
  }

  function drawDecal(d) {
    var img = IMG['decal:' + d[0]];
    if (!img) return;
    var w = img.width, h = img.height;
    if (!cullRect(d[1], d[2], w, h)) return;
    var p = toScreen({ x: d[1], y: d[2] });
    var sw = w * Z, sh = h * Z;
    var fx = d[3] < 0, fy = d[4] < 0;
    if (!fx && !fy) {
      ctx.drawImage(img, Math.round(p.x), Math.round(p.y), Math.round(sw), Math.round(sh));
      return;
    }
    ctx.save();
    ctx.translate(Math.round(p.x) + (fx ? Math.round(sw) : 0), Math.round(p.y) + (fy ? Math.round(sh) : 0));
    ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
    ctx.drawImage(img, 0, 0, Math.round(sw), Math.round(sh));
    ctx.restore();
  }

  function drawMachineSprite(img) {
    if (!img) return;
    var p = toScreen({ x: MACHINE.x, y: MACHINE.y });
    var w = img.width * Z, h = img.height * Z;
    if (!cullRect(MACHINE.x - img.width / 2, MACHINE.y - img.height, img.width, img.height)) return;
    ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - h), Math.round(w), Math.round(h));
  }

  function drawDebris() {
    var img = IMG.debris;
    if (!img) return;
    var s = TILE * Z;
    ctx.globalAlpha = 0.8;
    for (var i = 0; i < MAP.debris.length; i++) {
      var d = MAP.debris[i];
      var bx = Math.sin(time * 0.35 + i) * 10;
      var by = Math.sin(time * 0.27 + i * 1.3) * 6;
      var p = toScreen({ x: d[0] + bx, y: d[1] + by });
      if (p.x < -s || p.x > W + s || p.y < -s || p.y > H + s) continue;
      ctx.drawImage(img, 0, 0, TILE, TILE, Math.round(p.x), Math.round(p.y), s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawSpikes() {
    for (var i = 0; i < MAP.spikes.length; i++) {
      var s = MAP.spikes[i];
      var img = s.dir === 'up' ? IMG.spikeUp : IMG.spikeLeft;
      if (!img) continue;
      var w = s.w || 8, h = s.h || 8;
      if (!cullRect(s.x - 1, s.y - 1, w + 2, h + 2)) continue;
      var count = s.dir === 'up' ? Math.max(1, Math.round(w / TILE)) : Math.max(1, Math.round(h / TILE));
      for (var c = 0; c < count; c++) {
        if (s.dir === 'up') {
          var p = toScreen({ x: s.x + c * TILE, y: s.y });
          ctx.drawImage(img, Math.round(p.x), Math.round(p.y + (8 - img.height) * Z),
            Math.round(img.width * Z), Math.round(img.height * Z));
        } else {
          var p2 = toScreen({ x: s.x, y: s.y + c * TILE });
          ctx.drawImage(img, Math.round(p2.x + (8 - img.width) * Z), Math.round(p2.y),
            Math.round(img.width * Z), Math.round(img.height * Z));
        }
      }
    }
  }

  function drawDust() {
    ctx.fillStyle = '#c6ecff';
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      var p = toScreen(d);
      ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 0.4));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // Displacement.AddBurst 的近似：沿速度拉伸的白色环，裁剪到梦境块体内（WorldClipPadding = 2）
  function drawDreamRipples() {
    if (!dreamRipples.length) return;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (var i = 0; i < dreamRipples.length; i++) {
      var rp = dreamRipples[i];
      var t = 1 - rp.life / rp.max;
      var p = toScreen(rp);
      var r = (2 + (rp.r1 - 2) * t) * Z;
      ctx.save();
      if (rp.clip) {
        var c0 = toScreen({ x: rp.clip.x + 2, y: rp.clip.y + 2 });
        ctx.beginPath();
        ctx.rect(c0.x, c0.y, (rp.clip.w - 4) * Z, (rp.clip.h - 4) * Z);
        ctx.clip();
      }
      ctx.translate(p.x, p.y);
      if (rp.angle) ctx.rotate(rp.angle);
      ctx.scale(1.7, 1);                       // 沿速度方向拉伸，形成"穿行气流"
      ctx.globalAlpha = rp.strength * (1 - t);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, DREAM_TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 电视屏噪声：3 帧 0.14s 循环 + 每 0.05s 随机翻转（原作 noise.Scale）
  function drawNoise() {
    var img = IMG.noise && IMG.noise[Math.floor(time / 0.14) % 3];
    if (!img) return;
    var p = toScreen({ x: MACHINE.x, y: MACHINE.y - 30 });
    if (!cullRect(TV.x, TV.y, TV.w, TV.h)) return;
    var w = img.width * Z, h = img.height * Z;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(Math.round(p.x), Math.round(p.y));
    ctx.scale(noiseFlipX, noiseFlipY);
    ctx.drawImage(img, -Math.round(w) / 2, -Math.round(h) / 2, Math.round(w), Math.round(h));
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 前墙 + 霓虹：Color.White*(1-insideEase)，insideEase>=1 时不可见
  function drawCafeFront() {
    var a = 1 - insideEase;
    if (a <= 0.004) return;
    ctx.globalAlpha = a;
    drawMachineSprite(IMG.frontLeft);
    drawMachineSprite(IMG.frontRight);
    var neon = IMG.neon && IMG.neon[Math.floor(time / 0.07) % 15];
    if (neon) drawMachineSprite(neon);
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);
    sky.render(cam.x, cam.y);                    // 11 层星空
    drawTiles(bgSprites, 'e');                   // bgLostLevels 背景瓦片
    for (var i = 0; i < MAP.bgDecals.length; i++) drawDecal(MAP.bgDecals[i]);
    drawPavement();                                // depth -10001：路面
    drawTiles(spriteM, 'm');                     // 地面 / 平台（m=lostlevels）
    drawTiles(spriteN, 'n');                     // scifi 段（n=scifi）
    drawDebris();
    drawSpikes();
    drawBarrier(CAR.x + 32, null);               // depth -10：白栏杆（玩家身后）
    drawJelly();                                 // 果冻块体（玩家之前）
    drawMachineSprite(IMG.back);                 // 咖啡厅内部（建筑背层）
    drawNoise();                                 // 电视雪花
    // Depth：DreamBlock = -11000（DreamBlock..ctor L004b-0051），玩家常态 0、梦冲 -12000（DreamDashBegin）。
    // Monocle 按 actualDepth 降序渲染（EntityList::CompareDepth = Sign(b.actualDepth - a.actualDepth)），
    // 所以常态玩家(0) 先画、块(-11000) 盖在其上；梦冲玩家(-12000) 最后画，压在块与所有块元素之上。
    var dreamDashing = m && m.state === CelesteCharacter.ST.DreamDash;
    if (m && !dreamDashing) m.draw(ctx, toScreen, Z);   // 常态：玩家在块之后
    drawDreamBlocks();
    if (m && dreamDashing) m.draw(ctx, toScreen, Z);    // 梦冲：玩家在最前，块内清晰可见
    drawDreamRipples();                          // Displacement 近似（盖在方块/玩家之上）
    drawCar();                                   // 车身 1 · 轮 3 · 深灰栏杆 5（玩家身前）
    drawJellyDebris();                           // 碎裂 / 重生碎石
    drawDust();
    for (var j = 0; j < MAP.fgDecals.length; j++) drawDecal(MAP.fgDecals[j]);
    drawCafeFront();                             // 前墙 / 霓虹（进店后淡出）
    sky.renderFg(cam.x, cam.y);                  // purplesunset additive .25
    if (flash > 0) {
      ctx.globalAlpha = Math.min(1, flash);
      ctx.fillStyle = '#eaf6ff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ===== 电视交互提示（每帧跟随屏幕位置）=====
  function updatePrompt() {
    if (leaving) { promptEl.classList.remove('show'); return; }
    var show = insideEase > 0.55;
    promptEl.classList.toggle('show', show);
    if (!show) return;
    var p = toScreen({ x: TV.x + TV.w / 2, y: TV.y });
    promptEl.style.left = Math.round(p.x) + 'px';
    promptEl.style.top = Math.round(p.y - 10) + 'px';
  }

  // ===== 主循环 =====
  var sky = null;
  function tick(dt) {
    time += dt;
    sky.update(dt);

    if (deathTimer > 0) {
      deathTimer -= dt;
      if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
      return;
    }

    var input = {
      left: !!(keys['a'] || keys['arrowleft']),
      right: !!(keys['d'] || keys['arrowright']),
      down: !!(keys['s'] || keys['arrowdown']),
      up: !!(keys['w'] || keys['arrowup']),
      jumpHeld: !!keys[' '] || !!keys['c'],
      jumpPressed: jumpEdge,
      grabHeld: !!(keys['shift'] || keys['z']),
      dashPressed: dashEdge,
      aimX: (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0),
      aimY: (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0)
    };
    jumpEdge = dashEdge = false;

    feetPrev = m.y;
    m.update(dt, input);
    // DreamDashUpdate 块内：OnInterval(0.04f) Displacement.AddBurst(Center, 0.3, 0, 40, 1)
    if (m.state === CelesteCharacter.ST.DreamDash && m.dreamBlock) {
      dreamRippleTimer -= dt;
      if (dreamRippleTimer <= 0) {
        dreamRippleTimer = 0.04;
        // 原作 pos = Center、WorldClipCollider = dreamBlock.Collider
        spawnRipple(m.x, m.y - 5.5, 40, 0.3, Math.atan2(m.vy, m.vx), m.dreamBlock);
      }
    } else {
      dreamRippleTimer = 0;
    }
    updateCar(dt);          // 车悬挂（在玩家更新后，用最新的 hasRider）
    updateJelly(dt);        // 果冻状态机 + 碎屑（BounceBlock.Update）
    updateDreamBlocks(dt);  // 梦境方块动画/抖动（DreamBlock.Update）

    updateCafe(dt);
    computeZoom();
    if (leaving) {
      leaveT += dt;
      leaveZoom = 1 + leaveT * 3.2;
      cameraEase = 1;
      computeZoom();
      cam.x += (MACHINE.x - cam.x) * Math.min(1, dt * 4);
      cam.y += ((MACHINE.y - 30) - cam.y) * Math.min(1, dt * 4);
    } else {
      updateCam(dt);
    }

    if (touchingSpikes() || m.y > ROOM.h + 12) die();

    for (var i = dust.length - 1; i >= 0; i--) {
      var d = dust[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 240 * dt; d.life -= dt;
      if (d.life <= 0) dust.splice(i, 1);
    }
    for (var r = dreamRipples.length - 1; r >= 0; r--) {
      dreamRipples[r].life -= dt;
      if (dreamRipples[r].life <= 0) dreamRipples.splice(r, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 1.5);
  }

  var last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min((ts - last) / 1000, 0.05) : 1 / 60;
    last = ts;
    tick(dt);
    render();
    updatePrompt();
  }

  // ===== 启动 =====
  resize();
  await preload();
  buildTiles();
  sky = window.CafeSky.create({
    ctx: ctx,
    getTex: getTex,
    getSize: function () { return { W: W, H: H }; }
  });

  m = await CelesteCharacter.create({
    base: 'Atlases/Gameplay/characters/player',
    color: CelesteHair.MADELINE,
    x: SPAWN.x, y: SPAWN.y
  });
  m.setGround(groundY);
  m.setWallAt(wallAt);
  m.setWallCollideFn(wallCollideAt);
  m.setCeiling(ceilingY);
  m.setBodySolid(bodySolid);
  // ===== 梦境冲刺接线 =====
  m.setDreamBlockFn(dreamBlockAt);
  // DreamDashCheck 里的 CollideCheck<Solid, DreamBlock>：排除语义，只算尖刺/车这类外部实体
  m.setDreamForeignFn(dreamForeign);
  m.dreamDashEnabled = true;           // 本章视为已获得梦境冲刺（= Session.Inventory.DreamDash）
  // 原作 DreamDashBegin：Play(dreamblock_enter) + Loop(dreamSfxLoop, dreamblock_travel)
  m.onDreamDashEnter = function () {
    playSfx(DB_ENTER[(Math.random() * 4) | 0]);
    dreamTravelStart();
  };
  // 原作 DreamBlock.OnPlayerExit：Dust.Burst(player.Position, Calc.Angle(player.Speed), 16, null)
  // ★ 原点用玩家位置、方向用玩家速度角；调用发生在 DreamDashEnd（速度仍为 DashDir*240）
  // DreamDashEnd 顺序：OnPlayerExit → Stop(dreamSfxLoop) → Play(dreamblock_exit)
  m.onDreamDashExit = function () {
    spawnDust(m.x, m.y, 16, Math.atan2(m.vy, m.vx));
    dreamTravelStop();
    playSfx(DB_EXIT[(Math.random() * 4) | 0]);
  };
  // 原作 Jump(true, true) 的出口跳：脚底 BottomCenter 播 4 粒 -π/2（Position 即脚底）
  // （原作另有 jump_dreamblock 音效，celeste-sounds 无该素材，保留 gap）
  m.onDreamJump = function () {
    spawnDust(m.x, m.y, 4, -Math.PI / 2);
  };
  // 原作 DreamDashedIntoSolid 失败 → Die(Vector2.Zero, false, true)
  m.onDreamDashDeath = function () { dreamTravelStop(); die(); };
  m.onLand = function (vy) {
    // 原作 IntroCar.GetLandSoundIndex：落到车顶播 car_down 并返回 -1（覆盖默认落地音）
    var top = carTopAt(m.x);
    if (top !== null && Math.abs(m.y - top) < 0.6) {
      playSfx(sfxCarDown[(Math.random() * 5) | 0]);
    }
    if (vy >= 80) spawnDust(m.x, m.y, 8);
    // 原作 DreamBlock.FootstepRipple(Position)：落地时脚下是 DreamBlock 顶面 → AddBurst(0.5, 0, 40, 1)
    if (dreamBlockTopAt(m.x, m.y)) spawnRipple(m.x, m.y, 40, 0.5);
  };

  respawn(true);
  requestAnimationFrame(frame);
})();
