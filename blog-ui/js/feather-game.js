// ================================================================
// ===== Celeste 金羽毛小游戏 =====
// 风向随时变换，羽毛随气流飘动，永远留在箱中
// ================================================================
(function () {
    const GW = 480, GH = 340;
    const ASSETS = {
        feather: ['celeste-feather/feather0.png', 'celeste-feather/feather1.png',
                  'celeste-feather/feather2.png', 'celeste-feather/feather3.png'],
        half: ['celeste-feather/feather_half0.png', 'celeste-feather/feather_half1.png'],
        particle: 'celeste-feather/particle.png',
        border: 'celeste-feather/border.png',
        box: 'celeste-feather/box.png'
    };

    let overlay = null, canvas = null, ctx = null;
    const images = {};
    let assetsLoaded = false;
    let opened = false, animId = null, lastTs = 0, elapsed = 0;

    let windAngle = 0, targetWindAngle = 0;
    let windStrength = 55, targetWindStrength = 55;
    let gustCountdown = 2.5;

    const feather = { x: GW / 2, y: GH / 2, vx: 0, vy: 0, rot: 0,
                      frame: 0, frameT: 0, dir: 1, stunned: 0 };
    const particles = [];
    const streaks = [];
    const bursts = [];
    const keys = {};
    let pointerDown = false, lastPX = 0, lastPY = 0;

    function loadImage(src) {
        return new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = src;
        });
    }

    async function ensureAssets() {
        if (assetsLoaded) return;
        images.feather = await Promise.all(ASSETS.feather.map(loadImage));
        images.half = await Promise.all(ASSETS.half.map(loadImage));
        images.particle = await loadImage(ASSETS.particle);
        images.border = await loadImage(ASSETS.border);
        images.box = await loadImage(ASSETS.box);
        assetsLoaded = true;
    }

    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'feather-overlay';
        overlay.innerHTML =
            '<div id="feather-panel">' +
            '  <div class="feather-header">' +
            '    <span class="feather-title">GOLDEN FEATHER · 随金羽漂游</span>' +
            '    <button id="featherCloseBtn">✕</button>' +
            '  </div>' +
            '  <canvas id="featherCanvas" width="' + GW + '" height="' + GH + '"></canvas>' +
            '  <div class="feather-hint">← → 轻吹气流 · 拖动羽毛附近也能送风 · 让金羽留在箱中</div>' +
            '</div>';
        const style = document.createElement('style');
        style.textContent =
            '#feather-overlay{position:fixed;inset:0;background:rgba(8,12,24,.85);backdrop-filter:blur(5px);display:none;align-items:center;justify-content:center;z-index:1200;}' +
            '#feather-overlay.show{display:flex;}' +
            '#feather-panel{background:#101a30;border:2px solid #ffe36d;border-radius:12px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,.65),0 0 20px rgba(255,227,109,.22);animation:featherPop .3s ease;max-width:94vw;}' +
            '@keyframes featherPop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}' +
            '.feather-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}' +
            '.feather-title{font-family:var(--pixel-font,monospace);font-size:13px;color:#ffe36d;letter-spacing:1px;}' +
            '#featherCloseBtn{border:none;background:transparent;color:#8899bb;font-size:18px;cursor:pointer;}' +
            '#featherCloseBtn:hover{color:#fff;}' +
            '#featherCanvas{display:block;border-radius:6px;max-width:100%;height:auto;touch-action:none;cursor:grab;}' +
            '.feather-hint{margin-top:10px;text-align:center;font-family:var(--chat-font,monospace);font-size:11px;color:#7788aa;}';
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        canvas = document.getElementById('featherCanvas');
        ctx = canvas.getContext('2d');
        document.getElementById('featherCloseBtn').addEventListener('click', closeGame);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeGame(); });

        window.addEventListener('keydown', e => {
            keys[e.key] = true;
            if (opened && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
            if (opened && e.key === 'Escape') closeGame();
        });
        window.addEventListener('keyup', e => { keys[e.key] = false; });

        canvas.addEventListener('pointerdown', e => {
            pointerDown = true;
            const r = canvas.getBoundingClientRect();
            lastPX = (e.clientX - r.left) * (GW / r.width);
            lastPY = (e.clientY - r.top) * (GH / r.height);
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', e => {
            if (!pointerDown) return;
            const r = canvas.getBoundingClientRect();
            const px = (e.clientX - r.left) * (GW / r.width);
            const py = (e.clientY - r.top) * (GH / r.height);
            const dx = px - lastPX, dy = py - lastPY;
            lastPX = px; lastPY = py;
            const fdx = feather.x - px, fdy = feather.y - py;
            if (Math.sqrt(fdx * fdx + fdy * fdy) < 150) {
                feather.vx += dx * 2.2;
                feather.vy += dy * 2.2;
            }
        });
        canvas.addEventListener('pointerup', () => { pointerDown = false; });
    }

    function initParticles() {
        particles.length = 0;
        for (let i = 0; i < 70; i++) {
            particles.push({
                x: Math.random() * GW,
                y: Math.random() * GH,
                s: 1.5 + Math.random() * 2.5,
                tw: Math.random() * Math.PI * 2
            });
        }
    }

    function shortAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    function windAt(x, y) {
        const swirl = Math.sin(x * 0.014 + elapsed * 1.1) * Math.cos(y * 0.017 - elapsed * 0.8);
        const ang = windAngle + swirl * 0.55;
        const str = windStrength * (0.8 + 0.3 * Math.sin(elapsed * 1.9 + y * 0.02));
        return { x: Math.cos(ang) * str, y: Math.sin(ang) * str * 0.75 };
    }

    function spawnStreaks(n) {
        for (let i = 0; i < n; i++) {
            streaks.push({
                x: Math.random() * GW,
                y: Math.random() * GH,
                len: 50 + Math.random() * 80,
                life: 0.9, maxLife: 0.9
            });
        }
    }

    function spawnBurst(x, y) {
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 90;
            bursts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 });
        }
    }

    function update(dt) {
        elapsed += dt;

        gustCountdown -= dt;
        if (gustCountdown <= 0) {
            const r = Math.random();
            if (r < 0.62) {
                targetWindAngle = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.7;
            } else if (r < 0.84) {
                targetWindAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
            } else {
                targetWindAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
            }
            targetWindStrength = 45 + Math.random() * 95;
            gustCountdown = 3.5 + Math.random() * 3.5;
            spawnStreaks(6);
        }
        windAngle += shortAngle(targetWindAngle - windAngle) * Math.min(1, dt * 1.8);
        windStrength += (targetWindStrength - windStrength) * Math.min(1, dt * 1.8);

        const w = windAt(feather.x, feather.y);
        let ax = (w.x - feather.vx) * 1.6;
        let ay = (w.y - feather.vy) * 1.6 + 26;

        if (keys['ArrowLeft'] || keys['a']) ax -= 150;
        if (keys['ArrowRight'] || keys['d']) ax += 150;
        if (keys['ArrowUp'] || keys['w']) ay -= 120;
        if (keys['ArrowDown'] || keys['s']) ay += 120;

        feather.vx += ax * dt;
        feather.vy += ay * dt;
        feather.x += feather.vx * dt;
        feather.y += feather.vy * dt;

        const pad = 18;
        if (feather.x < pad) {
            const hit = Math.abs(feather.vx);
            feather.x = pad;
            feather.vx = Math.abs(feather.vx) * 0.45;
            if (hit > 100) { feather.stunned = 0.5; spawnBurst(feather.x, feather.y); }
        }
        if (feather.x > GW - pad) {
            const hit = Math.abs(feather.vx);
            feather.x = GW - pad;
            feather.vx = -Math.abs(feather.vx) * 0.45;
            if (hit > 100) { feather.stunned = 0.5; spawnBurst(feather.x, feather.y); }
        }
        if (feather.y < pad) {
            feather.y = pad;
            feather.vy = Math.abs(feather.vy) * 0.45;
        }
        if (feather.y > GH - pad) {
            feather.y = GH - pad;
            feather.vy = -Math.abs(feather.vy) * 0.45;
        }

        feather.stunned = Math.max(0, feather.stunned - dt);

        const targetRot = Math.max(-0.6, Math.min(0.6, feather.vx * 0.004)) + Math.sin(elapsed * 3) * 0.06;
        feather.rot += (targetRot - feather.rot) * Math.min(1, dt * 6);

        const airspeed = Math.sqrt(feather.vx * feather.vx + feather.vy * feather.vy);
        const flapSpeed = Math.max(3, Math.min(12, airspeed * 0.045));
        feather.frameT += dt * flapSpeed;
        if (feather.frameT >= 1) {
            feather.frameT = 0;
            feather.frame += feather.dir;
            if (feather.frame >= 3) { feather.frame = 3; feather.dir = -1; }
            if (feather.frame <= 0) { feather.frame = 0; feather.dir = 1; }
        }

        for (const p of particles) {
            const pw = windAt(p.x, p.y);
            p.x += pw.x * 1.5 * dt;
            p.y += pw.y * 1.5 * dt;
            p.tw += dt * 3;
            if (p.x < -8) p.x = GW + 6;
            if (p.x > GW + 8) p.x = -6;
            if (p.y < -8) p.y = GH + 6;
            if (p.y > GH + 8) p.y = -6;
        }

        for (let i = streaks.length - 1; i >= 0; i--) {
            streaks[i].life -= dt;
            if (streaks[i].life <= 0) streaks.splice(i, 1);
        }
        for (let i = bursts.length - 1; i >= 0; i--) {
            const b = bursts[i];
            b.life -= dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.vx *= 0.96; b.vy *= 0.96;
            if (b.life <= 0) bursts.splice(i, 1);
        }
    }

    function render() {
        ctx.clearRect(0, 0, GW, GH);
        if (images.box) ctx.drawImage(images.box, 0, 0, GW, GH);
        else { ctx.fillStyle = '#182443'; ctx.fillRect(0, 0, GW, GH); }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
            const pw = windAt(p.x, p.y);
            const sp = Math.sqrt(pw.x * pw.x + pw.y * pw.y);
            const alpha = Math.min(0.5, sp / 260 + 0.08) * (0.7 + 0.3 * Math.sin(p.tw));
            ctx.globalAlpha = alpha;
            if (images.particle) {
                ctx.drawImage(images.particle, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.s * 0.6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        for (const s of streaks) {
            const t = s.life / s.maxLife;
            ctx.globalAlpha = t * 0.45;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(windAngle);
            if (images.particle) {
                ctx.drawImage(images.particle, 0, -2, s.len, 4);
            }
            ctx.restore();
            const adv = 90 * (1 / 60);
            s.x += Math.cos(windAngle) * adv * 60;
            s.y += Math.sin(windAngle) * adv * 60;
        }
        for (const b of bursts) {
            ctx.globalAlpha = (b.life / 0.7) * 0.7;
            if (images.particle) ctx.drawImage(images.particle, b.x - 3, b.y - 3, 6, 6);
        }
        ctx.restore();

        const fimg = feather.stunned > 0
            ? images.half[Math.floor(elapsed * 8) % 2]
            : images.feather[feather.frame];
        if (fimg) {
            const scale = 2.4;
            const fw = fimg.width * scale, fh = fimg.height * scale;
            ctx.save();
            ctx.translate(feather.x, feather.y);
            ctx.rotate(feather.rot);
            if (feather.stunned > 0) ctx.rotate(Math.sin(elapsed * 40) * 0.08);
            ctx.drawImage(fimg, -fw / 2, -fh / 2, fw, fh);
            ctx.restore();
        }

        if (images.border) ctx.drawImage(images.border, 0, 0, GW, GH);
        ctx.globalAlpha = 1;
    }

    function loop(ts) {
        if (!opened) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
        lastTs = ts;
        update(dt);
        render();
        animId = requestAnimationFrame(loop);
    }

    async function openGame() {
        if (!overlay) buildOverlay();
        await ensureAssets();
        feather.x = GW / 2; feather.y = GH / 2;
        feather.vx = 0; feather.vy = 0; feather.stunned = 0;
        windAngle = targetWindAngle = 0;
        windStrength = targetWindStrength = 55;
        gustCountdown = 2.5;
        streaks.length = 0; bursts.length = 0;
        initParticles();
        overlay.classList.add('show');
        opened = true;
        lastTs = performance.now();
        animId = requestAnimationFrame(loop);
    }

    function closeGame() {
        if (overlay) overlay.classList.remove('show');
        opened = false;
        if (animId) cancelAnimationFrame(animId);
    }

    window.FeatherGame = { open: openGame, close: closeGame };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindBtn);
    } else {
        bindBtn();
    }
    function bindBtn() {
        const btn = document.getElementById('featherGameBtn');
        if (btn) btn.addEventListener('click', openGame);
    }
})();
