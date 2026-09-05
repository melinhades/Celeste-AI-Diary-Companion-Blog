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

    const GRAVITY = 55;      // 下落加速度（原 32 太慢，羽毛追不上下降的框）
    const LIFT = -135;       // 上升加速度
    const TERMINAL_VY = 110; // 下落终端速度（原 60 太慢，导致很难落在框上）

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
    // ===== Madeline 全程陪伴：在游戏内随呼吸节奏说话，作为情绪调节 =====
    const BREATH_LINES = {
        '吸气……': ['跟着羽毛，把气慢慢吸满……', '吸气的时候，想象羽毛轻轻往上飘', '把气吸进肚子里，肩膀别端着'],
        '轻轻停一下': ['停一下，就一两秒，不用急', '屏住的时候，别绷着身子', '这一刻，什么都不用做'],
        '呼气……': ['慢慢呼出来，让肩膀沉下去', '呼气的时候，把紧张一起吐出去', '跟着羽毛往下，慢一点，再慢一点']
    };
    const OPEN_LINES = ['来，跟着这根羽毛，我陪你一起呼吸。', '别怕，我在这儿，咱们慢慢来。', '把注意力放在羽毛上，其他的先放一放。'];
    const CLOSE_LINES = ['羽毛落下了……你看，你做到了。', '呼吸平稳了吧，我一直都在。', '风停了。想写点什么，或者就这样待一会儿，都行。'];
    // 检测到情绪后，Madeline 先说的“羽毛建议”，说完再淡入游戏，过渡更自然
    const SUGGEST_LINES = {
        '悲伤': '心里沉沉的……要不要跟我一起，跟着这根羽毛慢慢呼吸一会儿？',
        '孤独': '一个人扛着，有点累吧。来，我陪你跟着羽毛喘口气。',
        '不开心': '情绪有点低是不是？先别急，我们跟着羽毛呼吸一下下。',
        '不安': '心里发慌的时候，呼吸最管用了。跟我一起，看着这根羽毛。',
        '愤怒': '火气别憋着，跟我一起，跟着羽毛把它一点点呼出去。',
        '怨恨': '这些念头太重了。先放一放，跟我跟着羽毛呼吸一会儿。'
    };
    const MADELINE_STEM = 'peaceful';
    const MADELINE_FRAMES = 4;
    let madelinePanel = null, madelineImg = null, madelineTextEl = null;
    let madelinePortraitTimer = null, madelineFi = 0;
    let madelineSayToken = 0;
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    let breathPhaseCount = 0;

    const goal = { y: 0, ty: 0, w: 400, h: 260, glow: 0 };
    let captionEl = null, audioCtx = null;
    let floaters = [];

    // ===== 羽毛呼吸：自动定速 + 着陆 =====
    let featherSpeed = 1; // 1=正常, 0.8=略慢（情绪低落时自动放慢，但不至于追不上框）
    let breathCycles = 0;
    let landingPhase = false;
    let landingT = 0;
    let closing = false; // 收尾淡出阶段：保留画面与台词，避免被立即清空

    function addFloater(text, x, y, color, size) {
        floaters.push({ text, x, y, color: color || '#fff', size: size || 15, life: 2.4, maxLife: 2.4 });
    }

    function showCaption(text) {
        if (!captionEl) return;
        captionEl.textContent = text;
        captionEl.classList.add('show');
    }

    // Madeline 头像帧循环：游戏全程都在动
    function startMadelinePortrait() {
        clearInterval(madelinePortraitTimer);
        madelineFi = 0;
        if (madelineImg) madelineImg.src = 'Atlases/Portraits/madeline/' + MADELINE_STEM + '00.png';
        madelinePortraitTimer = setInterval(() => {
            if (!opened && !landingPhase && !closing) { clearInterval(madelinePortraitTimer); madelinePortraitTimer = null; return; }
            madelineFi = (madelineFi + 1) % MADELINE_FRAMES;
            if (madelineImg) madelineImg.src = 'Atlases/Portraits/madeline/' + MADELINE_STEM + String(madelineFi).padStart(2, '0') + '.png';
        }, 150);
    }
    function stopMadelinePortrait() {
        clearInterval(madelinePortraitTimer);
        madelinePortraitTimer = null;
    }

    // Madeline 说话：逐字打字 + 说话音，新的一句会打断上一句
    async function madelineSay(text) {
        const token = ++madelineSayToken;
        if (!madelineTextEl || !madelinePanel) return;
        madelinePanel.classList.add('show');
        madelineTextEl.textContent = '';
        let speakCount = 0;
        for (const ch of text) {
            if (token !== madelineSayToken) return;
            if (!opened && !landingPhase && !closing) return;
            madelineTextEl.textContent += ch;
            if (!/[\s…，,、；;：:（）()*]/.test(ch)) {
                speakCount++;
                if (speakCount % 3 === 1 && window.playSpeakSound) window.playSpeakSound('可爱');
            }
            await sleep(48);
        }
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
            '<div class="feather-madeline">' +
            '  <div class="feather-madeline-portrait"><img id="featherMadelineImg" src="celeste-portraits/madeline/peaceful00.png" alt=""></div>' +
            '  <div class="feather-madeline-box">' +
            '    <div class="feather-madeline-name">Madeline</div>' +
            '    <div class="feather-madeline-text" id="featherMadelineText"></div>' +
            '  </div>' +
            '</div>' +
            '<div class="feather-caption"></div>' +
            '<div class="feather-hint">按住 ↑ 让羽毛上升 · 松开它会慢慢落下 · Esc 随时离开</div>';
        const style = document.createElement('style');
        style.textContent =
            '#feather-overlay{position:fixed;inset:0;opacity:0;pointer-events:none;background:radial-gradient(ellipse at 50% 32%, rgba(64,36,66,.5), rgba(8,7,16,.97) 78%);z-index:1200;transition:opacity .7s ease;}' +
            '#feather-overlay.show{opacity:1;pointer-events:auto;}' +
            '#featherCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;}' +
            '.feather-header{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;z-index:2;}' +
            '.feather-title{font-family:var(--pixel-font,monospace);font-size:15px;color:#ffe36d;letter-spacing:2px;text-shadow:0 0 12px rgba(255,227,109,.5);}' +
            '#featherCloseBtn{border:none;background:transparent;color:#8899bb;font-size:20px;cursor:pointer;}' +
            '#featherCloseBtn:hover{color:#fff;}' +
            '.feather-madeline{position:absolute;bottom:44px;left:50%;transform:translateX(-50%) translateY(24px);width:min(94vw,700px);min-height:100px;z-index:3;display:flex;align-items:center;gap:18px;padding:20px 30px;background:url("celeste-portraits/textbox/madeline.png") center / 100% 100% no-repeat;opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s ease;}' +
            '.feather-madeline.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}' +
            '.feather-madeline-portrait{width:84px;height:84px;flex:none;border-radius:6px;overflow:hidden;}' +
            '.feather-madeline-portrait img{width:100%;height:100%;object-fit:cover;display:block;}' +
            '.feather-madeline-box{flex:1;min-width:0;background:transparent;border:none;padding:0;}' +
            '.feather-madeline-name{font-family:var(--pixel-font,monospace);font-size:13px;color:#FFEB3B;margin-bottom:5px;}' +
            '.feather-madeline-text{font-family:"Renogare","CelesteZH","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.7;color:#fff;word-break:break-word;min-height:24px;}' +
            '.feather-caption{position:absolute;bottom:70px;left:50%;transform:translateX(-50%);max-width:560px;text-align:center;font-family:var(--chat-font,sans-serif);font-size:15px;line-height:1.8;color:rgba(255,240,214,.92);letter-spacing:1px;text-shadow:0 0 14px rgba(0,0,0,.8);opacity:0;transition:opacity .8s ease;z-index:2;}' +
            '.feather-caption.show{opacity:1;}' +
            '.feather-hint{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);font-family:var(--chat-font,monospace);font-size:12px;color:rgba(255,255,255,.35);letter-spacing:1px;z-index:2;}';
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        canvas = document.getElementById('featherCanvas');
        ctx = canvas.getContext('2d');
        captionEl = document.querySelector('.feather-caption');
        madelinePanel = document.querySelector('.feather-madeline');
        madelineImg = document.getElementById('featherMadelineImg');
        madelineTextEl = document.getElementById('featherMadelineText');
        document.getElementById('featherCloseBtn').addEventListener('click', closeGame);
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
            // 每换一个呼吸阶段，Madeline 说一句对应引导（降低频率：每3个阶段才说1次）
            breathPhaseCount++;
            const lines = BREATH_LINES[BREATH[breathIdx].name];
            if (lines && breathPhaseCount % 3 === 1) madelineSay(pick(lines));
        }

        upHeld = !!(keys['ArrowUp'] || keys['w']);

        const grav = GRAVITY * featherSpeed;
        const lift = LIFT * featherSpeed;
        if (upHeld) {
            feather.vy += lift * dt;
        } else {
            feather.vy += grav * dt;
        }
        feather.vy = Math.max(-105, Math.min(TERMINAL_VY, feather.vy));
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
        madelineSay(pick(CLOSE_LINES));
    }

    function finishLanding() {
        if (!landingPhase) return;
        // 收尾：停物理循环，但保留画面与 Madeline 的收尾台词，稍作停留后整体淡出，过渡自然
        landingPhase = false;
        opened = false;
        closing = true;
        if (animId) cancelAnimationFrame(animId);
        animId = null;
        setTimeout(() => {
            if (overlay) overlay.classList.remove('show');
            window.dispatchEvent(new CustomEvent('feather-landed'));
            // 淡出动画结束后再真正清空状态
            setTimeout(() => {
                closing = false;
                stopMadelinePortrait();
                madelineSayToken++;
                if (madelinePanel) madelinePanel.classList.remove('show');
            }, 750);
        }, 1600);
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

    async function openGame(mood) {
        if (!overlay) buildOverlay();
        await ensureAssets();
        resizeCanvas();
        feather.x = GW / 2;
        feather.y = GH / 2;
        feather.vy = 0;
        floaters = [];
        breathIdx = 0; breathT = 0;
        breathPhaseCount = 0;
        guideIdx = -1;
        lastInGlow = false;
        landingPhase = false;
        initParticles();
        goal.y = goal.ty = GH / 2;
        goal.glow = 0;
        overlay.classList.add('show');
        opened = true;

        // 自动判断羽毛节奏：情绪低落时慢慢飘，其余按正常节奏，打开即开始
        const lowMoods = ['悲伤', '孤独', '不开心', '不安', '愤怒'];
        featherSpeed = (mood && lowMoods.indexOf(mood) !== -1) ? 0.8 : 1;

        // Madeline 全程陪伴：头像动起来 + 开口引导呼吸
        startMadelinePortrait();
        madelineSay(pick(OPEN_LINES));
        startBreathGame();
    }

    // 工具：检测到情绪后调用——先让 Madeline 把“羽毛建议”说完，收起对话框，再淡入金羽毛游戏
    async function suggestThenOpen(emotion) {
        const line = SUGGEST_LINES[emotion] || '我们一起跟着这根羽毛呼吸一下，好吗？';
        if (typeof window.addMadelineMessage === 'function') {
            // 等 Madeline 把这句建议逐字说完（await 队列 Promise）
            try { await window.addMadelineMessage(line, emotion || '默认', true); } catch (e) {}
        }
        // 说完后停顿一下让玩家读完，再收起日记页对话框，避免“话没说完就开始”
        await sleep(1000);
        if (typeof window.hideGameDialog === 'function') { try { window.hideGameDialog(); } catch (e) {} }
        openGame(emotion);
    }

    function closeGame() {
        if (overlay) overlay.classList.remove('show');
        opened = false;
        landingPhase = false;
        closing = false;
        if (animId) cancelAnimationFrame(animId);
        animId = null;
        if (nextGuideTimer) { clearTimeout(nextGuideTimer); nextGuideTimer = null; }
        stopMadelinePortrait();
        madelineSayToken++;
        if (madelinePanel) madelinePanel.classList.remove('show');
        window.dispatchEvent(new CustomEvent('feather-finished'));
    }

    window.FeatherGame = { open: openGame, close: closeGame, suggestThenOpen: suggestThenOpen };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindBtn);
    } else {
        bindBtn();
    }
    function bindBtn() {
        // 按钮点击由 diary.html 内联脚本控制（情绪分支），此处不再绑定
    }
})();