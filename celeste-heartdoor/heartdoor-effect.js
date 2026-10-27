/*
 * Celeste HeartGemDoor — 反编译还原的心门特效（前端移植）
 *
 * 证据来源：本地 Celeste.dll（Steam, Everest/MonoMod 补丁版）IL 级反编译。
 * 目标类型：Celeste.HeartGemDoor（TypeDef 0x02000338）
 *   + 嵌套 HeartGemDoor/Particle（0x02000339，struct）
 *   + 嵌套 HeartGemDoor/WhiteLine（0x0200033a）
 *   + 嵌套 HeartGemDoor/<Routine>d__32（0x0200033b，开门协程状态机）
 *   + Monocle.Ease.<>c.CubeIn（0x06000cbe：t*t*t）
 *   + Monocle.Calc.Approach / ClampedMap / Range
 *
 * 单位约定：1 单位 = 1 游戏像素，y 轴向下。dt 固定 1/60。
 * 素材：blog-ui/Atlases/Gameplay/objects/heartdoor/{mist,edge,top,icon00..06}.png
 *
 * 缺口（不猜测，详见 README §9）：
 *  - P_Shimmer / P_Slice 的 ParticleType 参数在二进制中无任何写入点（疑似运行时注入），
 *    粒子外观为占位实现（发光小点），发射位置/时机/角度均按 IL。
 *  - RenderBloom 实际画进 bloom 渲染目标再后处理泛光，此处用 'lighter' 叠加近似。
 */
(function (global) {
  'use strict';

  // ---- IL 佐证常量 -------------------------------------------------------
  // Update():        offset += 12*dt; mist.X -= 4*dt; mist.Y -= 24*dt;   (IL @24/@57/@80)
  //                  particles[i].Position.Y += Speed*dt                  (IL @121-143)
  // Added():         particles[50]; Speed=Range(rand,4,12);
  //                  Color=White*Range(rand,0.2,0.6)                      (IL @12/@99/@135)
  // .ctor():         openDistance = 32（有 node 时被 |node.Y - Y| 覆盖）   (IL @107-164)
  // Render():        icon 格距 12，cols=(Size-8)/12，rows=ceil(Requires/cols)
  //                  frame = icon[(int)(CubeIn(ClampedMap(Counter,i,i+1)) * (icon.Count-1))]
  // DrawInterior():  底色 HexToColor("18668f")；雾透明度 White*0.6；
  //                  视差 drawPos = p.Position + camera*0.2（开门后为 Zero）
  // DrawMist():      半块平铺 halfW=tex.W/2, halfH=tex.H/2（50% 重叠）
  // DrawEdges():     边条随 offset 滚动，瓦片 8px，首条 GetSubtexture(0, 8-num, 7, num)
  // Routine():       填充速率 dt*Requires*0.8，回落速率 dt*Requires*4；
  //                  开门：0.5s → WhiteLine+Flash(White*0.5)+Shake(0.3)+offset=0
  //                  → 0.6s → p+=dt（1s）openPercent=CubeIn(p)，双门各滑 openDistance
  //                  → p>=0.4 且每 0.1s：i=4..Size step4 两边 Emit(P_Shimmer,1,..,∓π/2)
  // WhiteLine:       fade 1→0 @1/s；Render: h=Max(1,4*fade)，Rect(camX-10, Y-h/2, 340, h)
  // Bloom:           White*{0.25,0.5,0.75,0.5,0.25} 五条竖带（仅未开门且可见）
  var C = {
    OFFSET_SPEED: 12,
    MIST_X_SPEED: -4,
    MIST_Y_SPEED: -24,
    PARTICLE_COUNT: 50,
    PARTICLE_SPEED_MIN: 4,
    PARTICLE_SPEED_MAX: 12,
    PARTICLE_ALPHA_MIN: 0.2,
    PARTICLE_ALPHA_MAX: 0.6,
    OPEN_DISTANCE: 32,
    ICON_CELL: 12,
    ICON_INSET: 8,
    INTERIOR_COLOR: '#18668f',
    MIST_ALPHA: 0.6,
    PARALLAX: 0.2,
    OPENED_EDGE_ALPHA: 0.25,
    FILL_RATE_MULT: 0.8,   // Counter += dt * Requires * 0.8
    DECAY_MULT: 4,         // Counter -= dt * Requires * 4
    HEART_FADE_RATE: 2,    // heartAlpha = Approach(heartAlpha, 1, dt*2)
    OPEN_WAIT_1: 0.5,      // 开门前等待
    OPEN_WAIT_2: 0.6,      // 闪白后等待
    OPEN_SLIDE_TIME: 1.0,  // p += dt
    REVEAL_SLIDE_MULT: 1.2,// startHidden 现身 p += dt*1.2（本移植默认 startHidden=false）
    SHIMMER_AFTER: 0.4,    // p >= 0.4 才开始发 shimmer
    SHIMMER_INTERVAL: 0.1,
    WHITELINE_FADE_RATE: 1,
    WHITELINE_WIDTH: 340,
    DOOR_HALF_PI: Math.PI / 2
  };

  // ---- Monocle 数学原语（IL 级语义） --------------------------------------
  function mod(a, b) { return ((a % b) + b) % b; }                 // HeartGemDoor.Mod
  function approach(v, target, step) {                              // Calc.Approach(r4,r4,r4)
    return v <= target ? Math.min(v + step, target) : Math.max(v - step, target);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function clampedMap(v, min, max, from, to) {                      // Calc.ClampedMap
    return clamp01((v - min) / (max - min)) * (to - from) + from;
  }
  function cubeIn(t) { return t * t * t; }                          // Ease.CubeIn = <>c.CubeIn
  function lerp(a, b, t) { return a + (b - a) * t; }                // Calc.Lerp
  var EPS = 1e-9;   // float64 累加 30×(1/60)=0.4999…94 < 0.5；Monocle float32 递减恰触发

  function defaultRng() { return Math.random(); }

  function create(opts) {
    opts = opts || {};
    var size = opts.size != null ? opts.size : 32;
    var requires = opts.requires != null ? opts.requires : 6;
    var openDistance = opts.openDistance != null ? opts.openDistance : C.OPEN_DISTANCE;
    var levelHeight = opts.levelHeight != null ? opts.levelHeight : 180;
    var rng = opts.rng || defaultRng;
    var x = opts.x != null ? opts.x : 0;
    var y = opts.y != null ? opts.y : 0;   // 门缝（两 Solid 相接处）的世界 y

    // Added() — 粒子初始化（IL Added @21-177）
    var particles = [];
    for (var i = 0; i < C.PARTICLE_COUNT; i++) {
      particles.push({
        x: rng() * size,               // NextFloat(Size)
        y: rng() * levelHeight,        // NextFloat(level.Bounds.Height)
        speed: C.PARTICLE_SPEED_MIN + rng() * (C.PARTICLE_SPEED_MAX - C.PARTICLE_SPEED_MIN),
        alpha: C.PARTICLE_ALPHA_MIN + rng() * (C.PARTICLE_ALPHA_MAX - C.PARTICLE_ALPHA_MIN)
      });
    }

    var door = {
      x: x, y: y, size: size, requires: requires,
      openDistance: openDistance,
      counter: 0,
      opened: false,
      openPercent: 0,
      heartAlpha: 1,
      offset: 0,
      mist: { x: 0, y: 0 },
      particles: particles,
      // 两扇 Solid：上门覆盖 [levelTop-32, y]，下门覆盖 [y, levelBottom+32]
      topSolid: { y: -32, height: y + 32, visible: true },
      botSolid: { y: y, height: levelHeight - y + 32, visible: true },
      whiteLines: [],
      shimmer: [],        // 占位粒子（P_Shimmer 外观为缺口）
      slices: [],         // P_Slice 同上
      flash: 0,
      shakeT: 0,
      textures: opts.textures || null,   // {mist, edge, top, icons:[7]}
      _phase: 'idle',   // idle | wait1 | wait2 | slide | done
      _t: 0,
      _p: 0,
      _shimmerAcc: 0,
      _topFrom: 0, _topTo: 0, _botFrom: 0, _botTo: 0
    };

    door.openAmount = function () { return door.openPercent * door.openDistance; };

    // Update() — IL 0x06001766：仅未开门时滚动
    door.updateVisual = function (dt) {
      if (door.opened) return;
      door.offset += C.OFFSET_SPEED * dt;
      door.mist.x += C.MIST_X_SPEED * dt;
      door.mist.y += C.MIST_Y_SPEED * dt;
      for (var i = 0; i < particles.length; i++) particles[i].y += particles[i].speed * dt;
    };

    // Routine() 的填充段（state 4-6）：playerX 为玩家 x（无玩家传 null）
    // 填充/回落只存在于协程 while (Counter < Requires) 循环内——
    // counter 填满后循环退出，counter 冻结（不再回落），故门控在 idle 段。
    door.updateCounter = function (dt, playerX) {
      if (door.opened || door._phase !== 'idle') return;
      var near = playerX != null &&
        Math.abs(playerX - (door.x + door.size / 2)) < 80 &&
        playerX < door.x;
      if (near) {
        var target = Math.min(door.gems != null ? door.gems : 0, door.requires);
        door.counter = approach(door.counter, target, dt * door.requires * C.FILL_RATE_MULT);
      } else {
        door.counter = approach(door.counter, 0, dt * door.requires * C.DECAY_MULT);
      }
    };

    // 开门协程（state 7-9；startHidden 现身段不在本移植范围）
    // 顺序按 Monocle：每帧先衰减/推进已存在实体（当帧 Add 的 WhiteLine 下一帧才 Update），
    // 再推进协程状态机——因此开门当帧 flash=0.5 / WhiteLine.fade=1 保持到渲染。
    door.updateRoutine = function (dt, camW) {
      var d = door;
      d.flash = Math.max(0, d.flash - dt * 1.5);   // 闪白衰减（引擎内部时长，近似）
      d.shakeT = Math.max(0, d.shakeT - dt);
      // WhiteLine.Update：fade = Approach(fade, 0, dt)；归零帧 Emit P_Slice 后 RemoveSelf
      for (var w = d.whiteLines.length - 1; w >= 0; w--) {
        var wl = d.whiteLines[w];
        wl.fade = approach(wl.fade, 0, dt * C.WHITELINE_FADE_RATE);
        if (wl.fade <= 0) {
          var camLeft = (opts.camX || 0), camRight = camLeft + (camW || 320);
          for (var px = Math.ceil(camLeft); px < camRight; px++) {
            if (px < d.x || px >= d.x + wl.blockSize)
              d.slices.push({ x: px, y: wl.y, t: 0, seed: rng() });
          }
          d.whiteLines.splice(w, 1);
        }
      }
      // 占位粒子的通用寿命（外观=缺口，仅位置/时机按 IL）
      for (var s = d.shimmer.length - 1; s >= 0; s--) {
        d.shimmer[s].t += dt;
        if (d.shimmer[s].t > 1.2) d.shimmer.splice(s, 1);
      }
      for (var s2 = d.slices.length - 1; s2 >= 0; s2--) {
        d.slices[s2].t += dt;
        if (d.slices[s2].t > 0.8) d.slices.splice(s2, 1);
      }
      if (d._phase === 'idle') {
        if (!d.opened && d.counter >= d.requires) { d._phase = 'wait1'; d._t = 0; }
      } else if (d._phase === 'wait1') {
        d._t += dt;
        if (d._t >= C.OPEN_WAIT_1 - EPS) {
          // WhiteLine + Flash(White*0.5) + Shake(0.3) + Opened + offset=0
          d.whiteLines.push({ y: d.y, blockSize: d.size, fade: 1 });
          d.flash = 0.5;
          d.shakeT = 0.3;
          d.opened = true;
          d.offset = 0;
          d._phase = 'wait2'; d._t = 0;
        }
      } else if (d._phase === 'wait2') {
        d._t += dt;
        if (d._t >= C.OPEN_WAIT_2 - EPS) {
          // botFrom=TopSolid.Y; topFrom=TopSolid.Y-openDist; botTo=BotSolid.Y; topTo=BotSolid.Y+openDist
          d._botFrom = d.topSolid.y; d._topFrom = d.topSolid.y - d.openDistance;
          d._botTo = d.botSolid.y; d._topTo = d.botSolid.y + d.openDistance;
          d._p = 0; d._shimmerAcc = 0; d._phase = 'slide';
        }
      } else if (d._phase === 'slide') {
        d._p += dt;
        if (d._p >= 1 - EPS) {
          d.openPercent = 1;
          d.topSolid.y = d._topFrom; d.botSolid.y = d._topTo;
          d._phase = 'done';
        } else {
          d.shakeT = Math.max(d.shakeT, 0.3);
          d.openPercent = cubeIn(d._p);
          d.topSolid.y = lerp(d._botFrom, d._topFrom, d.openPercent);
          d.botSolid.y = lerp(d._botTo, d._topTo, d.openPercent);
          if (d._p >= C.SHIMMER_AFTER) {
            d._shimmerAcc += dt;
            while (d._shimmerAcc >= C.SHIMMER_INTERVAL) {
              d._shimmerAcc -= C.SHIMMER_INTERVAL;
              for (var i = 4; i < d.size; i += 4) {
                // Emit(P_Shimmer,1,(TopSolid.Left+i+1, TopSolid.Bottom-2),(2,2),-π/2)
                d.shimmer.push({ x: d.x + i + 1, y: d.topSolid.y + d.topSolid.height - 2, dir: -C.DOOR_HALF_PI, t: 0, seed: rng() });
                // Emit(P_Shimmer,1,(BotSolid.Left+i+1, BotSolid.Top+2),(2,2),+π/2)
                d.shimmer.push({ x: d.x + i + 1, y: d.botSolid.y + 2, dir: C.DOOR_HALF_PI, t: 0, seed: rng() });
              }
            }
          }
        }
      }
      // heartAlpha：startHidden 现身段专用，本移植恒 1（与 .ctor 初值一致）
    };

    door.update = function (dt, playerX, camW) {
      // Monocle：base.Update()（协程组件）先于 HeartGemDoor.Update 本体
      door.updateRoutine(dt, camW);
      door.updateCounter(dt, door.playerX != null ? door.playerX : null);
      door.updateVisual(dt);
    };

    // ---- 渲染 -------------------------------------------------------------
    function drawMist(ctx, rx, ry, rw, rh, offX, offY) {
      var tex = door.textures && door.textures.mist;
      if (!tex || !tex.complete || !tex.naturalWidth) return;
      var hw = tex.width / 2, hh = tex.height / 2;   // 320x320 → 160
      ctx.globalAlpha = C.MIST_ALPHA;
      for (var tx = 0; tx < rw; tx += hw) {
        for (var ty = 0; ty < rh; ty += hh) {
          var sx = Math.floor(mod(offX, hw));
          var sy = Math.floor(mod(offY, hh));
          var w = Math.min(hw, rw - tx), h = Math.min(hh, rh - ty);
          ctx.drawImage(tex, sx, sy, w, h, rx + tx, ry + ty, w, h);
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawInterior(ctx, rx, ry, rw, rh, camX, camY) {
      ctx.fillStyle = C.INTERIOR_COLOR;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.save();
      ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
      drawMist(ctx, rx, ry, rw, rh, door.mist.x, door.mist.y);
      drawMist(ctx, rx, ry, rw, rh, door.mist.y * 1.5, door.mist.x * 1.5);
      // 内部像素粒子：drawPos = p.Position + camera*0.2（开门后无视差），按门洞尺寸取模
      var par = door.opened ? 0 : C.PARALLAX;
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var px = mod(p.x + camX * par, rw);
        var py = mod(p.y + camY * par, rh);
        ctx.globalAlpha = p.alpha;
        ctx.fillRect(rx + Math.floor(px), ry + Math.floor(py), 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawEdges(ctx, rx, ry, rw, rh, alpha) {
      var T = door.textures; if (!T || !T.edge || !T.top) return;
      if (!T.edge.complete || !T.edge.naturalWidth) return;
      var num = Math.floor(door.offset % 8);
      ctx.globalAlpha = alpha;
      var left = rx + 4, right = rx + rw - 4;
      var i, h, yPos;
      if (num > 0) {
        // 顶部残条：GetSubtexture(0, 8-num, 7, num)，左翻X、右正常
        for (i = 0; i < 2; i++) {
          ctx.save();
          ctx.translate(i === 0 ? left : right, ry);
          if (i === 0) ctx.scale(-1, 1);
          ctx.drawImage(T.edge, 0, 8 - num, 7, num, -3.5, 0, 7, num);
          ctx.restore();
        }
      }
      for (yPos = num; yPos < rh; yPos += 8) {
        h = Math.min(8, rh - yPos);
        for (i = 0; i < 2; i++) {
          ctx.save();
          ctx.translate(i === 0 ? left : right, ry + yPos);
          if (i === 0) ctx.scale(-1, 1);
          ctx.drawImage(T.edge, 0, 0, 8, h, -4, 0, 8, h);
          ctx.restore();
        }
      }
      if (T.top.complete && T.top.naturalWidth) {
        for (var xPos = 0; xPos < rw; xPos += 8) {
          ctx.drawImage(T.top, rx + 4 + xPos - 4, ry + 4 - 4);            // DrawCentered
          ctx.save();                                                      // 底部翻Y
          ctx.translate(rx + 4 + xPos, ry + rh - 4);
          ctx.scale(1, -1);
          ctx.drawImage(T.top, -4, -4);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawBloom(ctx) {
      // RenderBloom：仅 !Opened && Visible；区域=两 Solid 合矩形
      if (door.opened || !door.topSolid.visible) return;
      var rx = door.x, ry = door.topSolid.y, rw = door.size;
      var rh = door.topSolid.height + door.botSolid.height;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.25; ctx.fillRect(rx - 4, ry, 2, rh);
      ctx.globalAlpha = 0.5;  ctx.fillRect(rx - 2, ry, 2, rh);
      ctx.globalAlpha = 0.75; ctx.fillRect(rx, ry, rw, rh);
      ctx.globalAlpha = 0.5;  ctx.fillRect(rx + rw, ry, 2, rh);
      ctx.globalAlpha = 0.25; ctx.fillRect(rx + rw + 2, ry, 2, rh);
      ctx.restore();
    }

    function drawHearts(ctx) {
      if (door.heartAlpha <= 0) return;
      var T = door.textures;
      if (!T || !T.icons || !T.icons.length) return;
      var icons = T.icons;
      var cols = Math.floor((door.size - C.ICON_INSET) / C.ICON_CELL);
      var rows = Math.ceil(door.requires / cols);
      ctx.globalAlpha = door.heartAlpha;
      for (var i = 0; i < rows; i++) {
        var count = ((i + 1) * cols > door.requires) ? door.requires - i * cols : cols;
        var bx = door.x + door.size * 0.5 + (-count / 2 + 0.5) * C.ICON_CELL;
        var by = door.y + (-rows / 2 + i + 0.5) * C.ICON_CELL;
        if (door.opened) by += (i < rows / 2 ? -1 : 1) * (door.openAmount() + 8);
        for (var j = 0; j < count; j++) {
          var idx = i * cols + j;
          var eased = cubeIn(clampedMap(door.counter, idx, idx + 1, 0, 1));
          var frame = icons[Math.floor(eased * (icons.length - 1))];
          if (frame && frame.complete && frame.naturalWidth)
            ctx.drawImage(frame, Math.round(bx + j * C.ICON_CELL - frame.width / 2),
                                 Math.round(by - frame.height / 2));
        }
      }
      ctx.globalAlpha = 1;
    }

    door.render = function (ctx, camX, camY) {
      camX = camX || 0; camY = camY || 0;
      var edgeAlpha = door.opened ? C.OPENED_EDGE_ALPHA : 1;
      if (!door.opened && door.topSolid.visible && door.botSolid.visible) {
        var rh = door.topSolid.height + door.botSolid.height;
        drawInterior(ctx, door.x, door.topSolid.y, door.size, rh, camX, camY);
        drawEdges(ctx, door.x, door.topSolid.y, door.size, rh, edgeAlpha);
      } else {
        if (door.topSolid.visible) {
          drawInterior(ctx, door.x, door.topSolid.y, door.size, door.topSolid.height, camX, camY);
          drawEdges(ctx, door.x, door.topSolid.y, door.size, door.topSolid.height, edgeAlpha);
        }
        if (door.botSolid.visible) {
          drawInterior(ctx, door.x, door.botSolid.y, door.size, door.botSolid.height, camX, camY);
          drawEdges(ctx, door.x, door.botSolid.y, door.size, door.botSolid.height, edgeAlpha);
        }
      }
      drawHearts(ctx);
      // WhiteLine.Render：h = Max(1, 4*fade)
      for (var w = 0; w < door.whiteLines.length; w++) {
        var wl = door.whiteLines[w];
        var hl = Math.max(1, 4 * wl.fade);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(camX - 10, wl.y - hl / 2, C.WHITELINE_WIDTH, hl);
      }
      drawBloom(ctx);
      // 占位 shimmer/slice（外观=缺口）：小亮点，加法混合
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var k;
      for (k = 0; k < door.shimmer.length; k++) {
        var s = door.shimmer[k];
        ctx.globalAlpha = Math.max(0, 1 - s.t / 1.2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.x - 1 + Math.cos(s.dir) * s.t * 8, s.y - 1 + Math.sin(s.dir) * s.t * 8, 2, 2);
      }
      for (k = 0; k < door.slices.length; k++) {
        var sl = door.slices[k];
        ctx.globalAlpha = Math.max(0, 1 - sl.t / 0.8);
        ctx.fillRect(sl.x, sl.y - 1 - sl.t * 6 * (sl.seed > 0.5 ? 1 : -1), 1, 2);
      }
      ctx.restore();
      if (door.flash > 0) {
        ctx.save();
        ctx.globalAlpha = door.flash;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(camX - 10, 0, C.WHITELINE_WIDTH, 10000);
        ctx.restore();
      }
    };

    return door;
  }

  global.CelesteHeartDoor = {
    create: create,
    C: C,
    mod: mod,
    approach: approach,
    clampedMap: clampedMap,
    cubeIn: cubeIn
  };
})(typeof window !== 'undefined' ? window : globalThis);
