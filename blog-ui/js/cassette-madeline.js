// cassette.exe · Madeline 移动层
// 复用 diary / write 的 56px 像素素材与共享内核 madeline-core.js；
// 只保留“选目标 → 走 → 停顿/张望 → 偶尔蹦跳”，禁区碰撞与 diary 的 blockedAt 同口径。
// 不接管键盘、不读写页面其它控件。
(function () {
    'use strict';

    const pm = document.getElementById('cxPixelMadeline');
    const MC = window.MadelineCore;
    if (!pm || !MC) return;

    const SRC = {
        move: 'celeste-gui/madeline-move.gif',
        fun: 'celeste-gui/madeline-fun.gif'
    };

    const st = {
        x: 0, y: 0, w: 56, h: 56, dir: 1,
        mode: 'idle', action: 'idle', modeUntil: 0, enteredAt: 0,
        targetX: null, targetY: null, hopT: -1, nextRelocate: 0
    };

    const BODY_MARGIN = 8;
    const ZONE_MARGIN = 14;
    const SPEED = 92;       // px/s
    const HOP_HEIGHT = 20;

    const zones = [];
    let layoutAt = 0;
    let rafId = 0;
    let running = false;
    let last = 0;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function groundY() {
        return Math.max(60, window.innerHeight - st.h - BODY_MARGIN);
    }

    function refreshLayout() {
        zones.length = 0;
        for (const sel of ['.cx-top', '.cx-deck', '.cx-sources']) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (r.width || r.height) zones.push({ r, m: ZONE_MARGIN });
        }
        st.w = pm.offsetWidth || st.w;
        st.h = pm.offsetHeight || st.h;
        layoutAt = performance.now();
    }

    // 与 diary.js 的 blockedAt 相同：角色包围盒对禁区外扩 m 像素做 AABB
    function blockedAt(x, y) {
        if (performance.now() - layoutAt > 400) refreshLayout();
        for (const z of zones) {
            const r = z.r, m = z.m;
            if (x < r.right + m && x + st.w > r.left - m &&
                y < r.bottom + m && y + st.h > r.top - m) return true;
        }
        return false;
    }

    function setSrc(name) {
        if (!name) return;
        if (pm.src.indexOf(name) === -1) pm.src = name;
    }

    function pickTarget() {
        const gy = groundY();
        const maxX = Math.max(BODY_MARGIN, window.innerWidth - st.w - BODY_MARGIN);
        const span = Math.max(0, maxX - BODY_MARGIN);
        const cands = [];
        for (let i = 0; i < 14; i++) {
            cands.push(BODY_MARGIN + Math.random() * span);
        }
        for (const fx of [0.04, 0.96, 0.5, 0.1, 0.9, 0.25, 0.75]) {
            cands.push(Math.min(maxX, Math.max(BODY_MARGIN, window.innerWidth * fx)));
        }
        for (const x of cands) {
            if (!blockedAt(x, gy)) return { x, y: gy };
        }
        // 窄屏面板贴底时整条地面都可能被压住；此时不硬塞，交给调用方决定
        return null;
    }

    function startWalk(now) {
        const t = pickTarget();
        if (!t) {
            st.mode = 'idle';
            st.targetX = null;
            st.modeUntil = now + 900;
            setSrc(SRC.move);
            return;
        }
        st.mode = 'walk';
        st.targetX = t.x;
        st.targetY = t.y;
        st.modeUntil = now + 9000;
        setSrc(SRC.move);
    }

    const core = MC.createCore({
        state: st,
        src: SRC,
        setSrc,
        startWalk,
        groundY,
        walkHop: 0.22
    });

    function nextMode(now) {
        core.enterMode(MC.weightedPick(
            [['walk', 6], ['look', 2], ['idle', 3]],
            st.action
        ), now);
    }

    function think(now) {
        if (!st.modeUntil || now < st.modeUntil) return;
        if (st.mode === 'lookaround') startWalk(now);
        else nextMode(now);
    }

    function step(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        think(now);

        const def = core.modeDef(st.mode) || {};
        // 布局（音源列表）是动态渲染的：若当前位置后来被面板压住，走出来
        if (!def.movable && now >= st.nextRelocate && blockedAt(st.x, st.y)) {
            st.nextRelocate = now + 1200;
            startWalk(now);
        }
        if (def.movable && st.targetX !== null) {
            const dx = st.targetX - st.x;
            const dy = st.targetY - st.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5) {
                if (dx > 0.5) st.dir = 1;
                else if (dx < -0.5) st.dir = -1;
                let nx = st.x + (dx / dist) * SPEED * dt;
                let ny = st.y + (dy / dist) * SPEED * dt;
                if (!blockedAt(st.x, st.y) && blockedAt(nx, ny)) {
                    if (!blockedAt(nx, st.y)) ny = st.y;
                    else if (!blockedAt(st.x, ny)) nx = st.x;
                    else { startWalk(now); nx = st.x; ny = st.y; }
                }
                st.x = nx;
                st.y = ny;
            } else if (st.mode === 'walk') {
                st.mode = 'idle';
                st.modeUntil = now + 300 + Math.random() * 900;
                st.targetX = null;
                setSrc(SRC.move);
            }
        }

        const maxX = Math.max(BODY_MARGIN, window.innerWidth - st.w - BODY_MARGIN);
        st.x = Math.max(BODY_MARGIN, Math.min(st.x, maxX));
        st.y = Math.max(60, Math.min(st.y, groundY()));

        let hopOffset = 0;
        if (st.hopT >= 0) {
            st.hopT += dt;
            if (st.hopT >= 0.5) st.hopT = -1;
            else hopOffset = Math.sin((st.hopT / 0.5) * Math.PI) * HOP_HEIGHT;
        }

        pm.style.transform = 'translate(' + Math.round(st.x) + 'px,' +
            Math.round(st.y - hopOffset) + 'px)' + (st.dir < 0 ? ' scaleX(-1)' : '');
        rafId = window.requestAnimationFrame(step);
    }

    function placeStatic() {
        const maxX = Math.max(BODY_MARGIN, window.innerWidth - st.w - BODY_MARGIN);
        st.x = Math.max(BODY_MARGIN, Math.min(st.x, maxX));
        st.y = groundY();
        pm.style.transform = 'translate(' + Math.round(st.x) + 'px,' + Math.round(st.y) + 'px)';
    }

    function start() {
        if (running) return;
        running = true;
        refreshLayout();
        const t = pickTarget();
        if (t) {
            st.x = t.x;
            st.y = t.y;
        } else {
            // 窄屏整条地面都被面板占据时，退到左下角，仍随页面可见
            if (!st.x) st.x = BODY_MARGIN;
            st.y = groundY();
        }
        pm.style.transform = 'translate(' + Math.round(st.x) + 'px,' + Math.round(st.y) + 'px)';
        pm.classList.add('is-ready');
        last = performance.now();
        nextMode(last);
        rafId = window.requestAnimationFrame(step);
    }

    function stop() {
        running = false;
        if (rafId) window.cancelAnimationFrame(rafId);
        rafId = 0;
        pm.classList.add('is-ready');
        placeStatic();
    }

    function onLayoutChange() { layoutAt = 0; }
    window.addEventListener('resize', onLayoutChange, { passive: true });
    window.addEventListener('scroll', onLayoutChange, { passive: true });

    function syncMotion() {
        if (reduceQuery.matches) stop();
        else start();
    }
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', syncMotion);

    if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(onLayoutChange);
        for (const sel of ['.cx-wrap', '.cx-deck', '.cx-sources']) {
            const el = document.querySelector(sel);
            if (el) ro.observe(el);
        }
    }

    // 等音源列表与字体布局稳定后再落位，避免初始位置被动态面板覆盖
    function boot() { setTimeout(syncMotion, 180); }
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });
})();
