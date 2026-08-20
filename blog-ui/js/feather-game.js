// ================================================================
// ===== Celeste 金羽毛 · 呼吸舒缓 =====
// 不是游戏，是一次有人陪着的呼吸。跟随羽毛：吸气、屏息、呼气。
// ================================================================
(function () {
    let GW = window.innerWidth, GH = window.innerHeight;
    const ASSETS = {
        feather: ['celeste-feather/feather0.png', 'celeste-feather/feather1.png',
            'celeste-feather/feather2.png', 'celeste-feather/feather3.png'],
        particle: 'celeste-feather/particle.png',
        border: 'celeste-feather/border.png',
        box: 'celeste-feather/box.png'
    };

    let overlay = null, canvas = null, ctx = null;
    const images = {};
    let assetsLoaded = false;
    let opened = false, animId = null, lastTs = 0, elapsed = 0;

    let windAngle = 0, targetWindAngle = 0;
    let windStrength = 26, targetWindStrength = 26;
    let gustCountdown = 6;

    const feather = { x: GW / 2, y: GH / 2, vx: 0, vy: 0, rot: 0,
        frame: 0, frameT: 0, dir: 1 };
    const particles = [];
    const flows = [];
    const floaters = [];
    const keys = {};
    let pointerDown = false, lastPX = 0, lastPY = 0;

    const BREATH = [
        { name: '吸气……', dur: 4, lift: -46 },
        { name: '轻轻停一下', dur: 2, lift: 0 },
        { name: '呼气……', dur: 6, lift: 34 }
    ];
    let breathIdx = 0, breathT = 0;
    let lastInGlow = false;

    const GUIDES = [
        '跟着羽毛，把气吸满……',
        '呼出来的时候，让肩膀也沉下去一点',
        '不用想山顶的事，就这一次呼吸',
        '羽毛起起伏伏，你也是，都很正常',
        '紧张也没关系，我在旁边呢',
        '我在缆车上恐慌发作的时候，就是靠这个缓过来的',
        '不用数呼吸，感觉到了就是到了',
        '心里那阵风再大，也会停的'
    ];
    let guideIdx = -1;

    const goal = { x: GW / 2, y: GH / 2, w: 500, h: 300, tx: GW / 2, ty: GH / 2,
        nextMove: 8, glow: 0 };
    let captionEl = null, audioCtx = null;

    function addFloater(text, x, y, color, size) {
        floaters.push({ text: text, x: x, y: y, color: color || '#fff',
            size: size || 15, life: 2.4, maxLife: 2.4 });
    }

    function showCaption(text) {
        if (!captionEl) return;
        captionEl.textContent = text;
        captionEl.classList.add('show');
    }

    function playSoftChime() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const t0 = audioCtx.currentTime;
            [523.25, 659.25].forEach((f, i) => {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sine';
                o.frequency.value = f;
                g.gain.setValueAtTime(0, t0 + i * 0.18);
                g.gain.linearRampToValueAtTime(0.06, t0 + i * 0.18 + 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.18 + 1.4);
                o.connect(g); g.connect(audioCtx.destination);
                o.start(t0 + i * 0.18); o.stop(t0 + i * 0.18 + 1.5);
            });
        } catch (e) {}
    }

    function spawnFlow(x, y, dx, dy) {
        flows.push({
            x: x + (Math.random() - 0.5) * 40,
            y: y + (Math.random() - 0.5) * 40,
            vx: dx + (Math.random() - 0.5) * 50,
            vy: dy + (Math.random() - 0.5) * 50,
            s: 2.5 + Math.random() * 3.5,
            life: 1.1 + Math.random() * 0.7,
            maxLife: 1.8
        });
    }
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
        images.particle = await loadImage(ASSETS.particle);
        images.border = await loadImage(ASSETS.border);
        images.box = await loadImage(ASSETS.box);
        assetsLoaded = true;
    }

    function buildOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'feather-overlay';
        overlay.innerHTML =
            '<canvas id="featherCanvas"></canvas>' +
            '<div class="feather-header">' +
            '  <span class="feather-title">GOLDEN FEATHER · 跟着羽毛呼吸</span>' +
            '  <button id="featherCloseBtn">✕</button>' +
            '</div>' +
            '<div class="feather-caption"></div>' +
            '<div class="feather-hint">羽毛会随着呼吸起伏 · 方向键或拖动可以轻轻送风 · 跟着光晕走就好 · Esc 随时离开</div>';
        const style = document.createElement('style');
        style.textContent =
            '#feather-overlay{position:fixed;inset:0;display:none;background:radial-gradient(ellipse at 50% 32%, rgba(64,36,66,.5), rgba(8,7,16,.97) 78%);z-index:1200;}' +
            '#feather-overlay.show{display:block;}' +
            '#featherCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;}' +
            '.feather-header{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;z-index:2;}' +
            '.feather-title{font-family:var(--pixel-font,monospace);font-size:15px;color:#ffe36d;letter-spacing:2px;text-shadow:0 0 12px rgba(255,227,109,.5);}' +
            '#featherCloseBtn{border:none;background:transparent;color:#8899bb;font-size:20px;cursor:pointer;}' +
            '#featherCloseBtn:hover{color:#fff;}' +
            '.feather-caption{position:absolute;bottom:70px;left:50%;transform:translateX(-50%);max-width:560px;text-align:center;font-family:var(--chat-font,sans-serif);font-size:15px;line-height:1.8;color:rgba(255,240,214,.92);letter-spacing:1px;text-shadow:0 0 14px rgba(0,0,0,.8);opacity:0;transition:opacity .8s ease;z-index:2;}' +
            '.feather-caption.show{opacity:1;}' +
            '.feather-hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-family:var(--chat-font,monospace);font-size:12px;color:rgba(255,255,255,.35);letter-spacing:1px;z-index:2;}';
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        canvas = document.getElementById('featherCanvas');
        ctx = canvas.getContext('2d');
        captionEl = document.querySelector('.feather-caption');
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
            for (let i = 0; i < 2; i++) spawnFlow(px, py, dx * 2.5, dy * 2.5);
            const fdx = feather.x - px, fdy = feather.y - py;
            if (Math.sqrt(fdx * fdx + fdy * fdy) < 150) {
                feather.vx += dx * 1.4;
                feather.vy += dy * 1.4;
            }
        });
        canvas.addEventListener('pointerup', () => { pointerDown = false; });
    }

    function initParticles() {
        particles.length = 0;
        const count = Math.round((GW * GH) / 12000);
        for (let i = 0; i < Math.min(160, Math.max(50, count)); i++) {
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
        const swirl = Math.sin(x * 0.012 + elapsed * 0.7) * Math.cos(y * 0.014 - elapsed * 0.5);
        const ang = windAngle + swirl * 0.4;
        const str = windStrength * (0.85 + 0.15 * Math.sin(elapsed * 1.2 + y * 0.02));
        return { x: Math.cos(ang) * str, y: Math.sin(ang) * str * 0.6 };
    }

    function nextGuide() {
        guideIdx = (guideIdx + 1) % GUIDES.length;
        showCaption(GUIDES[guideIdx]);
    }

    function update(dt) {
        elapsed += dt;

        const phase = BREATH[breathIdx];
        breathT += dt;
        if (breathT >= phase.dur) {
            breathT = 0;
            breathIdx = (breathIdx + 1) % BREATH.length;
        }
        const cur = BREATH[breathIdx];

        gustCountdown -= dt;
        if (gustCountdown <= 0) {
            targetWindAngle = (Math.random() - 0.5) * Math.PI * 2;
            targetWindStrength = 18 + Math.random() * 22;
            gustCountdown = 7 + Math.random() * 6;
        }
        windAngle += shortAngle(targetWindAngle - windAngle) * Math.min(1, dt * 0.8);
        windStrength += (targetWindStrength - windStrength) * Math.min(1, dt * 0.8);

        const w = windAt(feather.x, feather.y);
        let ax = (w.x - feather.vx) * 1.1;
        let ay = (w.y - feather.vy) * 1.1 + cur.lift;
        let kx = 0, ky = 0;

        if (keys['ArrowLeft'] || keys['a']) { ax -= 90; kx = -90; }
        if (keys['ArrowRight'] || keys['d']) { ax += 90; kx = 90; }
        if (keys['ArrowUp'] || keys['w']) { ay -= 70; ky = -70; }
        if (keys['ArrowDown'] || keys['s']) { ay += 70; ky = 70; }
        if (kx !== 0 || ky !== 0) {
            const len = Math.sqrt(kx * kx + ky * ky) || 1;
            for (let i = 0; i < 3; i++) {
                spawnFlow(feather.x - kx / len * 36, feather.y - ky / len * 36, kx * 1.6, ky * 1.6);
            }
        }

        feather.vx += ax * dt;
        feather.vy += ay * dt;
        feather.vx *= Math.pow(0.72, dt);
        feather.vy *= Math.pow(0.72, dt);
        feather.x += feather.vx * dt;
        feather.y += feather.vy * dt;
        const spd = Math.sqrt(feather.vx * feather.vx + feather.vy * feather.vy);
        if (spd > 40 && Math.random() < dt * 30) {
            spawnFlow(feather.x - feather.vx / spd * 26, feather.y - feather.vy / spd * 26,
                feather.vx * 0.5, feather.vy * 0.5);
        }
        const pad = 18;
        if (feather.x < pad) { feather.x = pad; feather.vx = Math.abs(feather.vx) * 0.4; }
        if (feather.x > GW - pad) { feather.x = GW - pad; feather.vx = -Math.abs(feather.vx) * 0.4; }
        if (feather.y < pad) { feather.y = pad; feather.vy = Math.abs(feather.vy) * 0.4; }
        if (feather.y > GH - pad) { feather.y = GH - pad; feather.vy = -Math.abs(feather.vy) * 0.4; }

        goal.nextMove -= dt;
        if (goal.nextMove <= 0) {
            goal.tx = GW / 2 + (Math.random() - 0.5) * GW * 0.5;
            goal.ty = GH / 2 + (Math.random() - 0.5) * GH * 0.4;
            goal.nextMove = 10 + Math.random() * 8;
        }
        const gdx = goal.tx - goal.x, gdy = goal.ty - goal.y;
        goal.x += gdx * Math.min(1, dt * 0.4);
        goal.y += gdy * Math.min(1, dt * 0.4);
        goal.glow = Math.max(0, goal.glow - dt * 0.4);

        const inGlow = Math.abs(feather.x - goal.x) < goal.w / 2 &&
            Math.abs(feather.y - goal.y) < goal.h / 2;
        if (inGlow && !lastInGlow) {
            playSoftChime();
            goal.glow = 1;
            addFloater('~', feather.x, feather.y - 40, 'rgba(255,227,109,.9)', 20);
            nextGuide();
        }
        lastInGlow = inGlow;

        const targetRot = Math.max(-0.5, Math.min(0.5, feather.vx * 0.004)) + Math.sin(elapsed * 2.2) * 0.05;
        feather.rot += (targetRot - feather.rot) * Math.min(1, dt * 5);
        const airspeed = Math.sqrt(feather.vx * feather.vx + feather.vy * feather.vy);
        const flapSpeed = Math.max(2, Math.min(8, airspeed * 0.04));
        feather.frameT += dt * flapSpeed;
        if (feather.frameT >= 1) {
            feather.frameT = 0;
            feather.frame += feather.dir;
            if (feather.frame >= 3) { feather.frame = 3; feather.dir = -1; }
            if (feather.frame <= 0) { feather.frame = 0; feather.dir = 1; }
        }

        for (const p of particles) {
            const pw = windAt(p.x, p.y);
            let pvx = pw.x * 1.2, pvy = pw.y * 1.2;
            const ddx = p.x - feather.x, ddy = p.y - feather.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < 25600) {
                const f = 1 - Math.sqrt(d2) / 160;
                pvx += feather.vx * 0.9 * f;
                pvy += feather.vy * 0.9 * f;
            }
            p.x += pvx * dt;
            p.y += pvy * dt;
            p.tw += dt * 2;
            if (p.x < -8) p.x = GW + 6;
            if (p.x > GW + 8) p.x = -6;
            if (p.y < -8) p.y = GH + 6;
            if (p.y > GH + 8) p.y = -6;
        }
        for (let i = flows.length - 1; i >= 0; i--) {
            const fl = flows[i];
            fl.life -= dt;
            fl.x += fl.vx * dt;
            fl.y += fl.vy * dt;
            fl.vx *= Math.pow(0.35, dt);
            fl.vy *= Math.pow(0.35, dt);
            if (fl.life <= 0) flows.splice(i, 1);
        }
        for (let i = floaters.length - 1; i >= 0; i--) {
            const f = floaters[i];
            f.life -= dt;
            f.y -= 18 * dt;
            if (f.life <= 0) floaters.splice(i, 1);
        }
    }

    function breathProgress() {
        const cur = BREATH[breathIdx];
        return breathT / cur.dur;
    }

    function drawGoal() {
        const cur = BREATH[breathIdx];
        const x = goal.x - goal.w / 2, y = goal.y - goal.h / 2;
        ctx.save();
        if (images.box) {
            ctx.shadowColor = 'rgba(255,227,109,' + (0.35 + goal.glow * 0.5) + ')';
            ctx.shadowBlur = 18 + goal.glow * 30;
            ctx.globalAlpha = 0.85 + goal.glow * 0.15;
            ctx.drawImage(images.box, x, y, goal.w, goal.h);
        } else {
            ctx.fillStyle = 'rgba(255,227,109,' + (0.06 + goal.glow * 0.1) + ')';
            ctx.fillRect(x, y, goal.w, goal.h);
        }
        ctx.restore();

        if (images.border) {
            const b = images.border;
            const s = (goal.w * 0.62) / b.width;
            const bw = b.width * s, bh = b.height * s;
            ctx.save();
            ctx.shadowColor = 'rgba(255,227,109,.7)';
            ctx.shadowBlur = 10 + goal.glow * 20;
            ctx.globalAlpha = 0.55 + goal.glow * 0.45;
            ctx.drawImage(b, x, y - bh * 0.25, bw, bh);
            ctx.save();
            ctx.translate(x + goal.w, y + goal.h + bh * 0.25);
            ctx.rotate(Math.PI);
            ctx.drawImage(b, 0, 0, bw, bh);
            ctx.restore();
            ctx.restore();
        }

        ctx.save();
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,240,214,' + (0.55 + 0.35 * Math.sin(elapsed * 1.6)) + ')';
        ctx.fillText(cur.name, goal.x, goal.y + goal.h / 2 + 34);
        ctx.restore();
    }
    function render() {
        ctx.clearRect(0, 0, GW, GH);
        ctx.fillStyle = '#0a0d18';
        ctx.fillRect(0, 0, GW, GH);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
            const alpha = 0.22 * (0.7 + 0.3 * Math.sin(p.tw));
            ctx.globalAlpha = alpha;
            if (images.particle) {
                ctx.drawImage(images.particle, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
            }
        }
        for (const fl of flows) {
            const t = Math.max(0, fl.life / fl.maxLife);
            if (images.particle) {
                ctx.globalAlpha = t * 0.25;
                ctx.drawImage(images.particle, fl.x - fl.s * 2, fl.y - fl.s * 2, fl.s * 4, fl.s * 4);
                ctx.globalAlpha = t * 0.85;
                ctx.drawImage(images.particle, fl.x - fl.s, fl.y - fl.s, fl.s * 2, fl.s * 2);
            }
        }
        ctx.restore();

        drawGoal();

        const fimg = images.feather[feather.frame];
        if (fimg) {
            const scale = 2.4;
            const fw = fimg.width * scale, fh = fimg.height * scale;
            ctx.save();
            ctx.translate(feather.x, feather.y);
            ctx.rotate(feather.rot);
            ctx.drawImage(fimg, -fw / 2, -fh / 2, fw, fh);
            ctx.restore();
        }

        for (const f of floaters) {
            const t = f.life / f.maxLife;
            ctx.globalAlpha = Math.min(1, t * 1.6);
            ctx.font = f.size + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
    }

    function loop(ts) {
        if (!opened) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
        lastTs = ts;
        update(dt);
        render();
        animId = requestAnimationFrame(loop);
    }

    function resizeCanvas() {
        GW = window.innerWidth;
        GH = window.innerHeight;
        if (canvas) { canvas.width = GW; canvas.height = GH; }
        feather.x = Math.min(Math.max(feather.x, 18), GW - 18);
        feather.y = Math.min(Math.max(feather.y, 18), GH - 18);
    }
    window.addEventListener('resize', () => { if (opened) resizeCanvas(); });

    let nextGuideTimer = null;

    async function openGame() {
        if (!overlay) buildOverlay();
        await ensureAssets();
        resizeCanvas();
        feather.x = GW / 2; feather.y = GH / 2;
        feather.vx = 0; feather.vy = 0;
        windAngle = targetWindAngle = 0;
        windStrength = targetWindStrength = 26;
        gustCountdown = 6;
        floaters.length = 0;
        flows.length = 0;
        breathIdx = 0; breathT = 0;
        guideIdx = -1;
        lastInGlow = false;
        initParticles();
        goal.x = goal.tx = GW / 2;
        goal.y = goal.ty = GH / 2;
        goal.glow = 0;
        goal.tx = GW / 2 + (Math.random() - 0.5) * GW * 0.5;
        goal.ty = GH / 2 + (Math.random() - 0.5) * GH * 0.4;
        goal.nextMove = 6 + Math.random() * 6;
        overlay.classList.add('show');
        opened = true;
        lastTs = performance.now();
        animId = requestAnimationFrame(loop);
        showCaption('我在缆车上恐慌发作的时候，Theo 教了我这个。想象你托着一根羽毛，跟着它呼吸就好。');
        nextGuideTimer = setTimeout(nextGuide, 8000);
    }

    function closeGame() {
        if (overlay) overlay.classList.remove('show');
        opened = false;
        if (animId) cancelAnimationFrame(animId);
        if (nextGuideTimer) { clearTimeout(nextGuideTimer); nextGuideTimer = null; }
        window.dispatchEvent(new CustomEvent('feather-finished'));
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