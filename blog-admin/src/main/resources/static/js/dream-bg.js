// ===== Celeste 第六章 Dream：极光绸带 + 星星（登录页 / 后台主页共用） =====
(function () {
    var rc = document.getElementById('dreamRibbons');
    var sc = document.getElementById('dreamStars');
    if (!rc || !sc) return;
    var rctx = rc.getContext('2d');
    var sctx = sc.getContext('2d');
    var W = 0, H = 0;

    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        rc.width = W; rc.height = H;
        sc.width = W; sc.height = H;
    }
    window.addEventListener('resize', resize);
    resize();

    var STARS = [];
    for (var i = 0; i < 90; i++) {
        STARS.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.5, p: Math.random() * Math.PI * 2, s: Math.random() * 1.2 + 0.4 });
    }

    var RIBBONS = [
        { y: 0.30, amp: 46, waves: 1.2, speed: 0.35,  phase: 0.0, thick: 96, c1: '255,107,214', c2: '106,216,255' },
        { y: 0.52, amp: 60, waves: 1.7, speed: -0.26, phase: 2.1, thick: 74, c1: '168,107,255', c2: '255,215,107' },
        { y: 0.72, amp: 36, waves: 2.2, speed: 0.42,  phase: 4.3, thick: 60, c1: '106,216,255', c2: '168,107,255' }
    ];

    function edgeY(rb, k, t, off) {
        return H * rb.y
            + Math.sin(t * 0.22 + rb.phase) * 26
            + Math.sin(k * Math.PI * 2 * rb.waves + t * rb.speed + rb.phase) * rb.amp
            + off;
    }

    function drawRibbon(rb, t) {
        var grad = rctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, 'rgba(' + rb.c1 + ',0)');
        grad.addColorStop(0.28, 'rgba(' + rb.c1 + ',.32)');
        grad.addColorStop(0.72, 'rgba(' + rb.c2 + ',.32)');
        grad.addColorStop(1, 'rgba(' + rb.c2 + ',0)');
        rctx.fillStyle = grad;
        rctx.beginPath();
        var x, k;
        for (x = -60; x <= W + 60; x += 20) {
            k = x / W;
            if (x === -60) rctx.moveTo(x, edgeY(rb, k, t, 0));
            else rctx.lineTo(x, edgeY(rb, k, t, 0));
        }
        for (x = W + 60; x >= -60; x -= 20) {
            k = x / W;
            var taper = Math.sin(k * Math.PI);
            rctx.lineTo(x, edgeY(rb, k, t + 1.3, rb.thick * (0.55 + 0.45 * taper)));
        }
        rctx.closePath();
        rctx.fill();
    }

    var start = performance.now();
    function frame(now) {
        var t = (now - start) / 1000;
        rctx.clearRect(0, 0, W, H);
        for (var i = 0; i < RIBBONS.length; i++) drawRibbon(RIBBONS[i], t);
        sctx.clearRect(0, 0, W, H);
        for (var j = 0; j < STARS.length; j++) {
            var s = STARS[j];
            sctx.globalAlpha = 0.35 + 0.55 * Math.abs(Math.sin(t * s.s + s.p));
            sctx.fillStyle = '#ffffff';
            sctx.beginPath();
            sctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
            sctx.fill();
        }
        sctx.globalAlpha = 1;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
