/* ===== 圆桌会议主持鸟（Celeste bird，roundtable.html 专用） =====
   素材：Atlases/Gameplay/characters/bird/，32x24 透明底，3x 像素放大（96x72）。
   文件名大小写混杂（线上 Linux 区分大小写），帧表按真实文件名写死，勿凭规律生成：
     crow:  crow00..crow48                     （49 帧，开场鸣叫）
     flyup: flyup00 + FlyUp01..FlyUp15         （16 帧，起飞/向上飞走）
     fly:   fly00..fly03                       （4 帧，平飞赶路）
     hover: hover00,hover01 + Hover02..Hover05 （6 帧，原地盘旋）
   生命周期：
     enter(panel)  会议开始：栖在会议卡片上沿 crow 鸣叫开场 → flyup 起飞
                   → fly 飞向随机锚点 → hover 在席位卡上方盘旋；
                   盘旋 5~9s 后挑一个新锚点 fly 过去继续 hover（随机游荡）
     focusSeat(id) 有人发言：飞到该席位卡正上方 hover，像主持鸟凑近倾听
     leave()       散会：flyup 向上飞走并隐藏
     perch(panel)  回放：定格 hover00 悬在右上角，不动画
     hide()        立即隐藏（返回 / 连接中断）
   暴露 window.RoundtableBird = { enter, focusSeat, leave, perch, hide } */
(function () {
    var BASE = 'Atlases/Gameplay/characters/bird/';
    var W = 96, H = 72;                  // 3x 显示尺寸

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    var FRAMES = { crow: [], flyup: [], fly: [], hover: [] };
    for (var i = 0; i < 49; i++) FRAMES.crow.push('crow' + pad2(i));
    FRAMES.flyup.push('flyup00');
    for (var i = 1; i < 16; i++) FRAMES.flyup.push('FlyUp' + pad2(i));
    for (var i = 0; i < 4; i++) FRAMES.fly.push('fly' + pad2(i));
    FRAMES.hover.push('hover00', 'hover01');
    for (var i = 2; i < 6; i++) FRAMES.hover.push('Hover' + pad2(i));

    var FRAME_MS = { crow: 70, flyup: 80, fly: 110, hover: 130 };
    var FLY_SPEED = 170;                 // 赶路 px/s
    var LEAVE_SPEED = 260;               // 离场爬升 px/s
    var CROW_DUR = 49 * 70;              // crow 播一遍的时长
    var FLYUP_DUR = 16 * 80;

    var warmed = false;
    function warm() {
        if (warmed) return;
        warmed = true;
        Object.keys(FRAMES).forEach(function (g) {
            FRAMES[g].forEach(function (n) {
                var im = new Image();
                im.src = BASE + n + '.png';
            });
        });
    }

    // ===== 运行状态 =====
    var img = null, panel = null;
    var mode = 'hidden';     // hidden | crow | flyup | fly | hover | leave | perch
    var anim = 'hover', idx = 0, animAcc = 0;
    var x = 0, y = 0;                    // 鸟左上角（相对 panel 的 px）
    var anchor = { x: 0, y: 0 };
    var theta = 0, hoverUntil = 0;
    var phaseT = 0, riseFrom = 0;
    var face = 1;                        // 1 朝左（素材默认）/ -1 朝右
    var raf = null, lastTs = 0;

    function applyFrame() { img.src = BASE + FRAMES[anim][idx] + '.png'; }

    function setAnim(name) {
        if (anim === name) return;
        anim = name; idx = 0; animAcc = 0;
        applyFrame();
    }

    function place(px, py) {
        if (px < x - 0.5) face = 1;          // 向左飞：素材原始朝向
        else if (px > x + 0.5) face = -1;    // 向右飞：水平翻转
        x = px; y = py;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)' +
            (face < 0 ? ' scaleX(-1)' : '');
    }

    // 盘旋锚点：会议卡片上沿之上的一条横带（避开左上返回链接与右上按钮）
    function pickAnchor() {
        var pw = panel.clientWidth;
        var minX = Math.min(200, pw * 0.25);
        var maxX = Math.max(minX + 60, pw - W - 120);
        anchor.x = minX + Math.random() * (maxX - minX);
        anchor.y = -56 + Math.random() * 34;   // 卡片上沿上方 22~56px
    }

    function advanceLoop(dt) {
        animAcc += dt;
        var ms = FRAME_MS[anim], n = FRAMES[anim].length;
        while (animAcc >= ms) {
            animAcc -= ms;
            idx = (idx + 1) % n;
        }
        applyFrame();
    }

    function tick(ts) {
        if (!lastTs) lastTs = ts;
        var dt = Math.min(50, ts - lastTs);   // 掉帧保护
        lastTs = ts;

        if (mode === 'crow' || mode === 'flyup') {
            // 单次动画：按时间定帧，不回绕
            phaseT += dt;
            var n = FRAMES[mode].length;
            var fi = Math.min(Math.floor(phaseT / FRAME_MS[mode]), n - 1);
            if (fi !== idx) { idx = fi; applyFrame(); }
            if (mode === 'flyup') {   // 起飞同时向上抬 36px
                var k = Math.min(1, phaseT / FLYUP_DUR);
                place(x, riseFrom - 36 * k);
            }
            if (phaseT >= (mode === 'crow' ? CROW_DUR : FLYUP_DUR)) {
                if (mode === 'crow') {
                    mode = 'flyup'; phaseT = 0; riseFrom = y;
                    setAnim('flyup');
                } else {
                    pickAnchor();
                    mode = 'fly'; setAnim('fly');
                }
            }
        } else if (mode === 'fly') {
            advanceLoop(dt);
            var dx = anchor.x - x, dy = anchor.y - y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var step = FLY_SPEED * dt / 1000;
            if (dist <= step + 2) {
                mode = 'hover'; setAnim('hover');
                theta = Math.random() * Math.PI * 2;
                hoverUntil = ts + 5000 + Math.random() * 4000;
            } else {
                place(x + dx / dist * step, y + dy / dist * step);
            }
        } else if (mode === 'hover') {
            advanceLoop(dt);
            theta += dt / 1000 * 2.2;
            place(anchor.x + Math.cos(theta) * 18,
                  anchor.y + Math.sin(theta * 1.6) * 7);
            if (ts >= hoverUntil) {
                pickAnchor();
                mode = 'fly'; setAnim('fly');
            }
        } else if (mode === 'leave') {
            advanceLoop(dt);
            place(x, y - LEAVE_SPEED * dt / 1000);
            if (y < -H - 40) { hide(); return; }
        }
        raf = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        lastTs = 0;
    }

    function ensureImg() {
        if (img && img.isConnected && img.parentNode === panel) return;
        img = document.createElement('img');
        img.className = 'bird-sprite';
        img.alt = '';
        panel.appendChild(img);
    }

    function enter(panelEl) {
        if (!panelEl) return;
        hide();
        panel = panelEl;
        warm();
        ensureImg();
        img.style.display = 'block';
        // 开场：栖在卡片上沿中央
        var startX = Math.max(20, (panel.clientWidth - W) / 2);
        x = startX; y = -26; face = 1;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
        mode = 'crow'; phaseT = 0;
        anim = 'crow'; idx = 0; animAcc = 0;
        applyFrame();
        stopLoop();
        raf = requestAnimationFrame(tick);
    }

    function leave() {
        if (!img || mode === 'hidden' || mode === 'leave') return;
        mode = 'leave';
        setAnim('flyup');
        if (!raf) raf = requestAnimationFrame(tick);
    }

    /**
     * 有人发言时调用：主持鸟飞到该席位卡正上方 hover，凑近倾听。
     * 找不到席位元素时退化为随机游荡。
     */
    function focusSeat(speakerId) {
        if (!panel || !img || mode === 'hidden' || mode === 'crow' || mode === 'flyup' || mode === 'leave') return;
        var seat = panel.querySelector('#seat-' + speakerId);
        if (!seat) return;
        var panelRect = panel.getBoundingClientRect();
        var seatRect = seat.getBoundingClientRect();
        // 席位水平居中上方，浮在卡片顶部之上一点
        anchor.x = (seatRect.left - panelRect.left) + (seatRect.width - W) / 2;
        anchor.y = (seatRect.top - panelRect.top) - H - 8;
        if (mode !== 'fly') { mode = 'fly'; setAnim('fly'); }
    }

    function perch(panelEl) {
        if (!panelEl) return;
        hide();
        panel = panelEl;
        warm();
        ensureImg();
        img.style.display = 'block';
        mode = 'perch';
        anim = 'hover'; idx = 0;
        applyFrame();
        face = 1;
        x = Math.max(60, panel.clientWidth - W - 140); y = -40;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }

    function hide() {
        stopLoop();
        mode = 'hidden';
        if (img) img.style.display = 'none';
    }

    window.RoundtableBird = { enter: enter, focusSeat: focusSeat, leave: leave, perch: perch, hide: hide };
})();
