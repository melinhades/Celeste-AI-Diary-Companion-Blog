/**
 * 铭记页多人同屏（只读表现层，不参与物理）。
 *
 * 依赖：
 *  - window.ChatScene（场景就绪、实时消息、toast）
 *  - window.__scene.p（本地角色 m，用作共享纹理模板 + 位置来源）
 *  - celeste-character.js / celeste-hair.js 的 Character / Hair
 *  - window.ChatEmoji（messages.js 暴露的表情帧表，可选）
 *
 * 总开关：URL 带 ?mp=0 或 localStorage['memorial:mp']='off' 时完全不启动。
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  if (params.get('mp') === '0' || localStorage.getItem('memorial:mp') === 'off') return;

  const token = localStorage.getItem('token');
  if (!token) return; // 未登录：场景正常，只是不同屏

  const MAX_PLAYERS = 30;
  const INTERP_MS = 120;
  const EMOTE_TTL = 1.6;
  const EMOTE_FRAME_MS = 110;
  const EMOTE_COOLDOWN = 500;
  const RAW_BASE = (typeof BASE_URL !== 'undefined' ? BASE_URL : location.origin).replace(/\/+$/, '');
  const WS_BASE = RAW_BASE.replace(/^http/, 'ws');

  let local = null;            // 本地角色 m
  let selfId = null;
  let selfName = '';
  let isPlayer = false;
  let welcomed = false;
  let fullToastShown = false;
  let ws = null;
  let wsOpen = false;
  let retry = 0;
  let stopped = false;
  let lastSeq = 0;
  let forceNext = false;
  let lastSent = { x: NaN, y: NaN, f: 0, a: -1, at: 0 };
  let sendTick = 0;
  let lastStep = 0;
  let disconnectedAt = 0;
  let selfEmote = null;
  let lastSelfEmoteAt = 0;
  let fontsReady = false;
  let pendingRoster = null;
  let pendingPositions = null;

  /** id -> player */
  const players = new Map();
  const emoteCache = new Map();

  const FALLBACK_FRAMES = {
    madeline: { idle: 9, peaceful: 6, happy: 8, sad: 8, angry: 7, surprised: 7, laugh: 8, blush: 8, cry: 8, sleepy: 8, determined: 8, worried: 8, smug: 8, thinking: 8, love: 8, wave: 8, wink: 8, confused: 8, scared: 8, proud: 8 },
    ghost: { idle: 6, angry: 6, happy: 6, sad: 6, laugh: 6, surprised: 6 },
    granny: { idle: 6, laugh: 6, angry: 6, happy: 6, sad: 6, surprised: 6 },
    theo: { idle: 6, laugh: 6, angry: 6, happy: 6, sad: 6, surprised: 6 },
    oshiro: { idle: 6, laugh: 6, angry: 6, happy: 6, sad: 6, surprised: 6 }
  };

  function emojiMeta() {
    const m = window.ChatEmoji;
    return {
      dirs: (m && m.dirs) || { mad: 'madeline', bade: 'ghost', granny: 'granny', theo: 'theo', oshiro: 'oshiro' },
      frames: (m && m.frames) || FALLBACK_FRAMES
    };
  }

  function hashId(id) {
    const s = String(id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function hueOf(id) {
    return hashId(id) % 360;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function nowMs() {
    return performance.now();
  }

  function onScreen(toScreen, x, y) {
    const s = toScreen({ x: x, y: y });
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    return s.x > -200 && s.x < w + 200 && s.y > -240 && s.y < h + 200;
  }

  function fadeOf(p) {
    if (!p.leavingAt) return 1;
    const k = 1 - (nowMs() - p.leavingAt) / 500;
    return Math.max(0, Math.min(1, k));
  }

  function makeGhost(id) {
    // 共享本地角色的纹理与染发 canvas；每个 ghost 只持有自己的精灵/头发状态
    const hair = new CelesteHair.Hair(local.hair.allTex, 4);
    const ghost = new CelesteCharacter.Character(local.textures, hair, { fidgets: false });
    ghost.x = 0;
    ghost.y = 0;
    ghost.facing = 1;
    ghost.onGround = true;
    hair.reset(0, 0, 1);
    return ghost;
  }

  function createPlayer(id, name) {
    const p = {
      id: String(id),
      name: name || String(id),
      ghost: null,
      prev: { x: 0, y: 0 },
      next: { x: 0, y: 0 },
      t: 0,
      dur: INTERP_MS / 1000,
      facing: 1,
      anim: 0,
      lastSeen: nowMs(),
      leavingAt: 0,
      emote: null,
      lastEmoteAt: 0
    };
    try {
      p.ghost = makeGhost(p.id);
    } catch (e) {
      // 纹理异常时不要让整个场景挂掉
      console.warn('[memorial-mp] ghost create failed', e);
    }
    return p;
  }

  function applyRoster(list) {
    if (!Array.isArray(list)) return;
    if (!selfId) { pendingRoster = list; return; }
    const seen = new Set();
    for (const item of list) {
      const id = String(item.id);
      seen.add(id);
      if (id === selfId) {
        selfName = item.n || selfName;
        continue;
      }
      let p = players.get(id);
      if (!p) {
        p = createPlayer(id, item.n);
        players.set(id, p);
      } else {
        p.name = item.n || p.name;
        p.leavingAt = 0;
      }
    }
    for (const [id, p] of players) {
      if (!seen.has(id) && !p.leavingAt) p.leavingAt = nowMs();
    }
  }

  function applyPositions(list, seq) {
    if (!Array.isArray(list)) return;
    if (!selfId) { pendingPositions = { list: list, seq: seq }; return; }
    if (seq && seq < lastSeq) return; // 丢弃乱序旧帧
    if (seq) lastSeq = seq;

    const now = nowMs();
    for (const row of list) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const id = String(row[0]);
      if (id === selfId) continue;
      let p = players.get(id);
      if (!p) {
        p = createPlayer(id, id);
        players.set(id, p);
      }
      if (!p.ghost) continue;
      const nx = Number(row[1]);
      const ny = Number(row[2]);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;
      const moved = Math.hypot(nx - p.ghost.x, ny - p.ghost.y);
      if (moved > 64) {
        // 瞬移/重生：不做插值，避免横穿房间
        p.ghost.x = nx;
        p.ghost.y = ny;
        p.prev = { x: nx, y: ny };
        p.next = { x: nx, y: ny };
        p.t = p.dur;
      } else {
        p.prev = { x: p.ghost.x, y: p.ghost.y };
        p.next = { x: nx, y: ny };
        p.t = 0;
      }
      p.facing = Number(row[3]) >= 0 ? 1 : -1;
      p.anim = Math.max(0, Math.min(3, Number(row[4]) || 0));
      p.lastSeen = now;
      p.leavingAt = 0;
    }
  }

  function step(now) {
    if (local && now - lastStep < 4) return; // drawBodies / drawOverlays 同一帧只推进一次
    lastStep = now;
    const dt = Math.min(0.05, Math.max(0.001, (now - (step._last || now)) / 1000));
    step._last = now;

    for (const p of players.values()) {
      if (!p.ghost) continue;
      if (p.t < p.dur) {
        p.t += dt;
        const k = Math.min(1, p.t / p.dur);
        p.ghost.x = lerp(p.prev.x, p.next.x, k);
        p.ghost.y = lerp(p.prev.y, p.next.y, k);
      }
      p.ghost.facing = p.facing;
      const animName = ['idle', 'runFast', 'jumpSlow', 'fallSlow'][p.anim] || 'idle';
      if (p.ghost.sprite.current !== animName) p.ghost.sprite.play(animName);
      p.ghost.sprite.update(dt);
      p.ghost.hair.update(p.ghost.x, p.ghost.y, p.ghost.facing, 0, 0, dt, 1);
      if (p.emote) {
        p.emote.t += dt;
        if (p.emote.t > EMOTE_TTL) p.emote = null;
      }
    }
    if (selfEmote) {
      selfEmote.t += dt;
      if (selfEmote.t > EMOTE_TTL) selfEmote = null;
    }
    // 500ms 淡出结束后移除
    for (const [id, p] of players) {
      if (p.leavingAt && now - p.leavingAt > 620) players.delete(id);
    }
  }

  function drawBodies(ctx, toScreen, Z, localPlayer) {
    if (!local) return;
    step(nowMs());

    const list = [];
    if (localPlayer) {
      list.push({
        y: localPlayer.y,
        o: hashId(selfId || 'self'),
        draw: () => localPlayer.draw(ctx, toScreen, Z)
      });
    }
    for (const p of players.values()) {
      if (!p.ghost) continue;
      const fade = fadeOf(p);
      if (fade <= 0) continue;
      if (!onScreen(toScreen, p.ghost.x, p.ghost.y)) continue;
      list.push({
        y: p.ghost.y,
        o: hashId(p.id),
        draw: () => {
          ctx.save();
          ctx.globalAlpha = 0.6 * fade; // 拍板：60% 不透明
          p.ghost.draw(ctx, toScreen, Z);
          ctx.restore();
        }
      });
    }
    list.sort((a, b) => (a.y - b.y) || (a.o - b.o));
    for (const item of list) item.draw();
  }

  function drawOverlays(ctx, toScreen, Z, localPlayer) {
    if (!local) return;
    const list = [];
    if (localPlayer && selfName) {
      list.push({
        y: localPlayer.y,
        o: hashId(selfId || 'self'),
        draw: () => drawPlate(ctx, toScreen, Z, localPlayer.x, localPlayer.y,
          selfName, true, selfId || 'self', selfEmote, 1)
      });
    }
    for (const p of players.values()) {
      if (!p.ghost) continue;
      const fade = fadeOf(p);
      if (fade <= 0) continue;
      if (!onScreen(toScreen, p.ghost.x, p.ghost.y)) continue;
      list.push({
        y: p.ghost.y,
        o: hashId(p.id),
        draw: () => drawPlate(ctx, toScreen, Z, p.ghost.x, p.ghost.y,
          p.name, false, p.id, p.emote, fade)
      });
    }
    list.sort((a, b) => (a.y - b.y) || (a.o - b.o));
    for (const item of list) item.draw();
  }

  function drawPlate(ctx, toScreen, Z, wx, wy, name, isSelf, id, emote, alpha) {
    if (!name) return;
    const size = Math.max(18, Math.min(26, Math.round(7 * Z)));
    const head = toScreen({ x: wx, y: wy - 34 });
    const w = window.innerWidth || 1280;
    if (head.x < -120 || head.x > w + 120) return;

    const label = truncateName(name, 14);
    const stagger = (hashId(id) % 5 - 2) * 1.5;
    const baseY = head.y + stagger;

    // 表情气泡画在名字上方
    if (emote) drawEmoteBubble(ctx, head.x, baseY - size - 6, Z, emote, alpha);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '600 ' + size + 'px Renogare, CelesteZH, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(3, Math.round(size * 0.18));
    ctx.strokeStyle = 'rgba(2,6,14,0.92)';
    ctx.strokeText(label, head.x, baseY);
    ctx.fillStyle = isSelf ? '#ffe36d' : 'hsl(' + hueOf(id) + ' 70% 80%)';
    ctx.fillText(label, head.x, baseY);
    ctx.restore();
  }

  function truncateName(name, max) {
    const chars = Array.from(String(name));
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, max - 1).join('') + '…';
  }

  function drawEmoteBubble(ctx, cx, bottomY, Z, emote, alpha) {
    const meta = emojiMeta();
    const frames = emote.frames;
    if (!frames || !frames.length) return;
    const idx = Math.floor((emote.t * 1000) / EMOTE_FRAME_MS) % frames.length;
    const src = 'Atlases/Portraits/' + emote.dir + '/' + emote.emoji + pad2(frames[idx]) + '.png';
    const img = getImage(src);
    if (!img) return;

    const S = 18 * Z;
    const pop = Math.min(1, emote.t / 0.1);
    const scale = 0.7 + 0.3 * pop;
    const cy = bottomY - (S * scale) / 2;
    const a = alpha * (emote.t > EMOTE_TTL - 0.2 ? Math.max(0, (EMOTE_TTL - emote.t) / 0.2) : 1);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // 气泡
    ctx.fillStyle = 'rgba(6,14,30,0.84)';
    ctx.strokeStyle = 'rgba(235,250,255,0.92)';
    ctx.lineWidth = Math.max(1.5, Z * 0.5);
    roundRect(ctx, -S / 2, -S / 2, S, S, Math.max(3, S * 0.12));
    ctx.fill();
    ctx.stroke();

    // 小尾巴
    ctx.beginPath();
    ctx.moveTo(-S * 0.12, S / 2);
    ctx.lineTo(S * 0.12, S / 2);
    ctx.lineTo(0, S / 2 + Z * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -S / 2 + 2, -S / 2 + 2, S - 4, S - 4);
    ctx.imageSmoothingEnabled = smoothing;
    ctx.restore();
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function getImage(src) {
    let img = emoteCache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      emoteCache.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function onChat(msg) {
    if (!msg || typeof msg !== 'object') return;
    const uid = String(msg.userId || '');
    if (!uid) return;
    const match = String(msg.content || '').match(/\[(mad|bade|granny|theo|oshiro):([A-Za-z]+)\]/);
    if (!match) return;
    const meta = emojiMeta();
    const dir = meta.dirs[match[1]];
    const emoji = match[2];
    const def = meta.frames[dir] && meta.frames[dir][emoji];
    if (!def) return;
    const frames = Array.isArray(def)
      ? def.slice()
      : Array.from({ length: Number(def) || 0 }, (_, i) => i);
    if (!frames.length) return;

    // 预加载这一组帧，首帧稍后自然出现
    for (const f of frames) {
      const src = 'Atlases/Portraits/' + dir + '/' + emoji + pad2(f) + '.png';
      if (!emoteCache.has(src)) {
        const img = new Image();
        img.src = src;
        emoteCache.set(src, img);
      }
    }

    const now = nowMs();
    if (uid === selfId) {
      if (now - lastSelfEmoteAt < EMOTE_COOLDOWN) return;
      lastSelfEmoteAt = now;
      selfEmote = { dir: dir, emoji: emoji, frames: frames, t: 0 };
      return;
    }
    const p = players.get(uid);
    if (!p) return;
    if (now - p.lastEmoteAt < EMOTE_COOLDOWN) return;
    p.lastEmoteAt = now;
    p.emote = { dir: dir, emoji: emoji, frames: frames, t: 0 };
  }

  // ===== 传输层 =====

  function wsUrl() {
    return WS_BASE + '/realtime-chat/ws?token=' + encodeURIComponent(token) + '&scene=memorial';
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch (e) {
      // ignore
    }
  }

  function connect() {
    if (stopped) return;
    let socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws = socket;
    socket.onopen = function () {
      wsOpen = true;
      retry = 0;
      disconnectedAt = 0;
      lastSeq = 0;
      forceNext = true;
    };
    socket.onmessage = function (ev) {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (!msg || !msg.type) return;
      if (msg.type === 'welcome') {
        const wasPlayer = isPlayer;
        selfId = String(msg.selfId || '');
        selfName = msg.name || selfName;
        isPlayer = msg.role === 'player';
        lastSeq = 0;
        if (!isPlayer && msg.reason === 'full' && !fullToastShown) {
          fullToastShown = true;
          if (window.ChatScene) window.ChatScene.toast('同屏人数已满，正在以观众身份加入', 3.2);
        } else if (isPlayer && welcomed && !wasPlayer) {
          if (window.ChatScene) window.ChatScene.toast('已加入同屏', 2.2);
        }
        welcomed = true;
        forceNext = true;
        if (pendingRoster) {
          const r = pendingRoster;
          pendingRoster = null;
          applyRoster(r);
        }
        if (pendingPositions) {
          const p = pendingPositions;
          pendingPositions = null;
          applyPositions(p.list, p.seq);
        }
      } else if (msg.type === 'roster') {
        applyRoster(msg.p);
      } else if (msg.type === 'pos') {
        applyPositions(msg.p, msg.seq);
      } else if (msg.type === 'ping') {
        send({ type: 'pong', t: Date.now() });
      }
    };
    socket.onclose = function () {
      wsOpen = false;
      disconnectedAt = nowMs();
      // 掉线后其他人先淡出，重连/新 roster 会重新建立
      for (const p of players.values()) {
        if (!p.leavingAt) p.leavingAt = nowMs();
      }
      scheduleReconnect();
    };
    socket.onerror = function () {
      try { socket.close(); } catch (e) {}
    };
  }

  function scheduleReconnect() {
    if (stopped) return;
    retry += 1;
    if (retry > 8) return; // 连续失败先停，刷新/重登后可恢复
    const delay = Math.min(8000, 500 * Math.pow(2, retry - 1)) + Math.random() * 200;
    setTimeout(connect, delay);
  }

  function animOf(m) {
    if (!m) return 0;
    if (!m.onGround) return m.vy < 0 ? 2 : 3;
    return Math.abs(m.vx || 0) > 1 ? 1 : 0;
  }

  function sendPosition() {
    sendTick += 1;
    if (!wsOpen || !local) return;
    // 观众每隔 5 秒问一次，别人离开后可以自动补位
    if (!isPlayer) {
      if (sendTick % 50 === 0) send({ type: 'hello' });
      return;
    }
    if (document.hidden) return;

    const anim = animOf(local);
    const f = local.facing >= 0 ? 1 : -1;
    const now = nowMs();
    const moved = forceNext
      || Math.hypot(local.x - lastSent.x, local.y - lastSent.y) > 0.25
      || f !== lastSent.f
      || anim !== lastSent.a;
    if (!moved && now - lastSent.at < 1000) return;

    send({
      type: 'pos',
      x: round2(local.x),
      y: round2(local.y),
      f: f,
      a: anim
    });
    forceNext = false;
    lastSent = { x: local.x, y: local.y, f: f, a: anim, at: now };
  }

  function attach(localPlayer, chatScene) {
    if (local) return;
    local = localPlayer;

    // 字体只加载一次；加载期间先用 fallback 画，不会阻塞场景
    try {
      Promise.all([
        document.fonts && document.fonts.load ? document.fonts.load('600 22px Renogare') : Promise.resolve(),
        document.fonts && document.fonts.load ? document.fonts.load('600 22px CelesteZH') : Promise.resolve()
      ]).then(function () { fontsReady = true; }).catch(function () { fontsReady = true; });
    } catch (e) {
      fontsReady = true;
    }

    if (chatScene && typeof chatScene.onChat === 'function') chatScene.onChat(onChat);

    window.__memorialMP = {
      drawBodies: drawBodies,
      drawOverlays: drawOverlays,
      get players() { return players; },
      get isPlayer() { return isPlayer; },
      get selfId() { return selfId; },
      get fontsReady() { return fontsReady; }
    };

    connect();
    setInterval(sendPosition, 100);

    window.addEventListener('pagehide', function () {
      send({ type: 'leave' });
      try {
        fetch(RAW_BASE + '/realtime-chat/leave', {
          method: 'POST',
          keepalive: true,
          headers: { 'Authorization': token }
        }).catch(function () {});
      } catch (e) {}
    });

    window.addEventListener('pageshow', function (ev) {
      if (ev.persisted) {
        forceNext = true;
        send({ type: 'hello' });
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        forceNext = true;
        if (!isPlayer) send({ type: 'hello' });
      }
    });
  }

  function boot() {
    const tryAttach = function () {
      const scene = window.__scene;
      const chat = window.ChatScene;
      if (scene && scene.p && chat) {
        attach(scene.p, chat);
        return true;
      }
      return false;
    };
    if (tryAttach()) return;
    window.addEventListener('memorial:scene-ready', tryAttach, { once: true });
    const timer = setInterval(function () {
      if (tryAttach()) clearInterval(timer);
    }, 100);
    // 页面卸载时停掉轮询
    window.addEventListener('pagehide', function () { clearInterval(timer); }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
