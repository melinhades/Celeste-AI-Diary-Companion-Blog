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

    const feather = { x: 0, y: 0, vy: 0, rot: 0, frame: 0, frameT: 0, dir: 1 };
    const particles = [];
    const keys = {};
    let upHeld = false;

    const GRAVITY = 32;
    const LIFT = -110;
    const TERMINAL_VY = 60;

    const BREATH = [
        { name: '吸气……', dur: 4 },
        { name: '轻轻停一下', dur: 2 },
        { name: '呼气……', dur: 9 }
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

    const goal = { y: 0, ty: 0, w: 400, h: 260, glow: 0 };
    let captionEl = null, audioCtx = null;
    let floaters = [];

    // ===== 羽毛改进：关键词 + 速度选择 + 着陆 =====
    let featherKeyword = null;
    let featherSpeed = 1; // 1=正常, 0.6=慢, 1.5=快
    let breathCycles = 0;
    let landingPhase = false;
    let landingT = 0;
    let speedChosen = false;

    function addFloater(text, x, y, color, size) {
        floaters.push({ text, x, y, color: color || '#fff', size: size || 15, life: 2.4, maxLife: 2.4 });
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
            '<div class="feather-speed-choice" style="display:none;">' +
            '  <div class="fsc-text">这根羽毛想怎么飘？</div>' +
            '  <div class="fsc-options">' +
            '    <button class="fsc-btn" data-speed="0.6">慢慢飘</button>' +
            '    <button class="fsc-btn" data-speed="1">像平时一样</button>' +
            '    <button class="fsc-btn" data-speed="1.5">快一点</button>' +
            '  </div>' +
            '</div>' +
            '<div class="feather-caption"></div>' +
            '<div class="feather-hint">按住 ↑ 让羽毛上升 · 松开它会慢慢落下 · Esc 随时离开</div>';
        const style = document.createElement('style');
        style.textContent =
            '#feather-overlay{position:fixed;inset:0;display:none;background:radial-gradient(ellipse at 50% 32%, rgba(64,36,66,.5), rgba(8,7,16,.97) 78%);z-index:1200;}' +
            '#feather-overlay.show{display:block;}' +
            '#featherCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;}' +
            '.feather-header{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;z-index:2;}' +
            '.feather-title{font-family:var(--pixel-font,monospace);font-size:15px;color:#ffe36d;letter-spacing:2px;text-shadow:0 0 12px rgba(255,227,109,.5);}' +
            '#featherCloseBtn{border:none;background:transparent;color:#8899bb;font-size:20px;cursor:pointer;}' +
            '#featherCloseBtn:hover{color:#fff;}' +
            '.feather-speed-choice{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:5;}' +
            '.fsc-text{font-family:var(--chat-font,sans-serif);font-size:18px;color:rgba(255,240,214,.9);margin-bottom:24px;letter-spacing:2px;}' +
            '.fsc-options{display:flex;gap:16px;justify-content:center;}' +
            '.fsc-btn{padding:12px 24px;border:1px solid rgba(255,230,109,.5);border-radius:8px;background:rgba(255,230,109,.08);color:#ffe36d;font-size:15px;cursor:pointer;transition:all .3s;}' +
            '.fsc-btn:hover{background:rgba(255,230,109,.2);transform:scale(1.05);}' +
            '.feather-caption{position:absolute;bottom:70px;left:50%;transform:translateX(-50%);max-width:560px;text-align:center;font-family:var(--chat-font,sans-serif);font-size:15px;line-height:1.8;color:rgba(255,240,214,.92);letter-spacing:1px;text-shadow:0 0 14px rgba(0,0,0,.8);opacity:0;transition:opacity .8s ease;z-index:2;}' +
            '.feather-caption.show{opacity:1;}' +
            '.feather-hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-family:var(--chat-font,monospace);font-size:12px;color:rgba(255,255,255,.35);letter-spacing:1px;z-index:2;}';
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        canvas = document.getElementById('featherCanvas');
        ctx = canvas.getContext('2d');
        captionEl = document.querySelector('.feather-caption');
        document.getElementById('featherCloseBtn').addEventListener('click', closeGame);

        overlay.querySelectorAll('.fsc-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                featherSpeed = parseFloat(this.dataset.speed);
                speedChosen = true;
                overlay.querySelector('.feather-speed-choice').style.display = 'none';
                showCaption('好，跟着这根羽毛的节奏。');
                startBreathGame();
            });
        });

        window.addEventListener('keydown', e => {
            keys[e.key] = true;
            if (opened && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
            if (opened && e.key === 'Escape') closeGame();
        });
        window.addEventListener('keyup', e => { keys[e.key] = false; });
    }

    function initParticles() {
        particles.length = 0;
        const count = Math.min(120, Math.round((GW * GH) / 14000));
        for (let i = 0; i < Math.max(50, count); i++) {
            particles.push({
                x: Math.random() * GW,
                y: Math.random() * GH,
                r: 1 + Math.random() * 3,
                speed: 20 + Math.random() * 30,
                len: 2 + Math.random() * 3,
                alpha: 0.3 + Math.random() * 0.4,
                stretch: 0
            });
        }
    }

    function nextGuide() {
        guideIdx = (guideIdx + 1) % GUIDES.length;
        showCaption(GUIDES[guideIdx]);
    }

    function startBreathGame() {
        breathCycles = 0;
        landingPhase = false;
        lastTs = performance.now();
        animId = requestAnimationFrame(loop);
    }

    function update(dt) {
        if (landingPhase) {
            landingT += dt;
            feather.vy += 20 * dt;
            feather.y += feather.vy * dt;
            feather.rot *= 0.95;
            if (feather.y >= GH * 0.75) {
                feather.y = GH * 0.75;
                finishLanding();
            }
            for (const p of particles) {
                p.stretch = Math.max(0, p.stretch - dt * 3);
                p.y += p.speed * 0.3 * dt;
                if (p.y > GH + 5) { p.y = -5; p.x = Math.random() * GW; }
            }
            return;
        }

        elapsed += dt;

        const phase = BREATH[breathIdx];
        breathT += dt;
        if (breathT >= phase.dur) {
            breathT = 0;
            breathIdx = (breathIdx + 1) % BREATH.length;
            if (breathIdx === 0) {
                breathCycles++;
                if (breathCycles >= 2) {
                    startLanding();
                    return;
                }
            }
        }

        upHeld = !!(keys['ArrowUp'] || keys['w']);

        const grav = GRAVITY * featherSpeed;
        const lift = LIFT * featherSpeed;
        if (upHeld) {
            feather.vy += lift * dt;
        } else {
            feather.vy += grav * dt;
        }
        feather.vy = Math.max(-80, Math.min(TERMINAL_VY, feather.vy));
        feather.y += feather.vy * dt;
        feather.x = GW / 2;

        const pad = 20;
        if (feather.y < pad) { feather.y = pad; feather.vy = 0; }
        if (feather.y > GH - pad) { feather.y = GH - pad; feather.vy = 0; }

        const cur = BREATH[breathIdx];
        if (cur.name === '吸气……') {
            goal.ty = GH * 0.3;
        } else if (cur.name === '呼气……') {
            goal.ty = GH * 0.7;
        }
        const gdy = goal.ty - goal.y;
        const speed = gdy > 0 ? dt * 0.25 : dt * 0.4;
        goal.y += gdy * Math.min(1, speed);
        goal.glow = Math.max(0, goal.glow - dt * 0.4);

        const inGlow = Math.abs(feather.y - goal.y) < goal.h / 2;
        if (inGlow && !lastInGlow) {
            playSoftChime();
            goal.glow = 1;
            addFloater('~', feather.x, feather.y - 40, 'rgba(255,227,109,.9)', 20);
            nextGuide();
        }
        lastInGlow = inGlow;

        feather.rot = Math.max(-0.3, Math.min(0.3, feather.vy * 0.004)) + Math.sin(elapsed * 2.2) * 0.04;

        const flapSpeed = Math.max(2, Math.min(8, Math.abs(feather.vy) * 0.06));
        feather.frameT += dt * flapSpeed;
        if (feather.frameT >= 1) {
            feather.frameT = 0;
            feather.frame += feather.dir;
            if (feather.frame >= 3) { feather.frame = 3; feather.dir = -1; }
            if (feather.frame <= 0) { feather.frame = 0; feather.dir = 1; }
        }

        for (const p of particles) {
            if (upHeld) {
                p.stretch = Math.min(1, p.stretch + dt * 2.5);
            } else {
                p.stretch = Math.max(0, p.stretch - dt * 2);
            }
            const dir = p.stretch > 0.5 ? -1 : 1;
            const spd = p.speed * (1 + p.stretch * 3);
            p.y += dir * spd * dt;
            p.len = 2 + p.stretch * (10 + p.speed * 0.3);

            if (dir === 1 && p.y > GH + p.len) {
                p.y = -p.len;
                p.x = Math.random() * GW;
            } else if (dir === -1 && p.y < -p.len) {
                p.y = GH + p.len;
                p.x = Math.random() * GW;
            }
        }

        for (let i = floaters.length - 1; i >= 0; i--) {
            const f = floaters[i];
            f.life -= dt;
            f.y -= 18 * dt;
            if (f.life <= 0) floaters.splice(i, 1);
        }
    }

    function startLanding() {
        landingPhase = true;
        landingT = 0;
        feather.vy = 0;
        showCaption('羽毛要落下了……落在纸上，你可以开始写了。');
    }

    function finishLanding() {
        if (!landingPhase) return;
        landingPhase = false;
        if (animId) cancelAnimationFrame(animId);
        animId = null;
        opened = false;
        overlay.classList.remove('show');
        window.dispatchEvent(new CustomEvent('feather-landed', {
            detail: { keyword: featherKeyword }
        }));
    }

    function drawGoal() {
        const cur = BREATH[breathIdx];
        const x = GW / 2 - goal.w / 2;
        const y = goal.y - goal.h / 2;
        if (images.box) {
            ctx.save();
            ctx.globalAlpha = 0.85 + goal.glow * 0.15;
            ctx.drawImage(images.box, x, y, goal.w, goal.h);
            ctx.restore();
        } else {
            ctx.fillStyle = 'rgba(255,227,109,' + (0.06 + goal.glow * 0.1) + ')';
            ctx.fillRect(x, y, goal.w, goal.h);
        }

        if (images.border) {
            const b = images.border;
            const s = (goal.w * 0.62) / b.width;
            const bw = b.width * s, bh = b.height * s;
            ctx.save();
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
        ctx.fillText(cur.name, GW / 2, goal.y + goal.h / 2 + 34);
        ctx.restore();
    }

    function render() {
        ctx.clearRect(0, 0, GW, GH);
        ctx.fillStyle = '#0a0d18';
        ctx.fillRect(0, 0, GW, GH);

        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        for (const p of particles) {
            if (p.stretch < 0.3) {
                ctx.moveTo(p.x + p.r, p.y);
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            }
        }
        ctx.globalAlpha = 0.45;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        for (const p of particles) {
            if (p.stretch >= 0.3) {
                const dir = p.stretch > 0.5 ? -1 : 1;
                const lineLen = p.len + p.stretch * p.speed * 0.4;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x, p.y + lineLen * dir);
            }
        }
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        if (!landingPhase) drawGoal();

        const fimg = images.feather[feather.frame];
        if (fimg) {
            const scale = 1.6;
            const fw = fimg.width * scale, fh = fimg.height * scale;
            ctx.save();
            ctx.translate(feather.x, feather.y);
            ctx.rotate(feather.rot);
            ctx.drawImage(fimg, -fw / 2, -fh / 2, fw, fh);

            // 羽毛上挂关键词
            if (featherKeyword) {
                ctx.globalAlpha = 0.85;
                ctx.font = '14px "Renogare","CelesteZH",sans-serif';
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(255,230,180,.9)';
                ctx.fillText(featherKeyword, 0, -fh / 2 - 10);
            }
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
        if (!opened && !landingPhase) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
        lastTs = ts;
        update(dt);
        render();
        if (opened || landingPhase) animId = requestAnimationFrame(loop);
    }

    function resizeCanvas() {
        GW = window.innerWidth;
        GH = window.innerHeight;
        if (canvas) { canvas.width = GW; canvas.height = GH; }
        feather.x = GW / 2;
        feather.y = Math.min(Math.max(feather.y, 20), GH - 20);
    }
    window.addEventListener('resize', () => { if (opened) resizeCanvas(); });

    let nextGuideTimer = null;

    async function openGame() {
        if (!overlay) buildOverlay();
        await ensureAssets();
        resizeCanvas();
        feather.x = GW / 2;
        feather.y = GH / 2;
        feather.vy = 0;
        floaters = [];
        breathIdx = 0; breathT = 0;
        guideIdx = -1;
        lastInGlow = false;
        speedChosen = false;
        landingPhase = false;
        initParticles();
        goal.y = goal.ty = GH / 2;
        goal.glow = 0;
        overlay.classList.add('show');
        opened = true;

        // 获取关键词
        try {
            const res = await api('/diary/feather-keyword', 'GET');
            if (res.success && res.data && res.data.keyword) {
                featherKeyword = res.data.keyword;
            }
        } catch (e) { featherKeyword = null; }

        // 显示速度选择
        overlay.querySelector('.feather-speed-choice').style.display = 'block';
    }

    function closeGame() {
        if (overlay) overlay.classList.remove('show');
        opened = false;
        landingPhase = false;
        if (animId) cancelAnimationFrame(animId);
        animId = null;
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