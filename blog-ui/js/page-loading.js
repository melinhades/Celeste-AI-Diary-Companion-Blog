/* ===== js/page-loading.js — 全站统一加载层（夜空 + 雪 + 跑动的 Madeline） =====
   页面在 <body> 顶部放 #pageLoadingOverlay（DOM 结构与视觉见 css/internet_cafe.css，
   与 article.html 的 #articleLoadingOverlay 逐条同口径：月光晕 / 两层点阵星星 /
   雪花画布 / 底部雪带 / 十帧跑动的 Madeline / "LOADING..."）。
   本脚本只负责动画层的两件事：
     1. 在 #ldSnowCanvas 上画雪花（与 article.js 的登录页口径一致：80 片、1~4px、风摆）；
     2. 暴露 PageLoading.ready()：宿主在场景/数据就绪后调用，等两帧（确保宿主的首帧
        已经画到屏幕上）再加 .done 淡出，650ms 后从 DOM 移除。
   为什么独立成文件而不是各页内联：加载层的视觉与退场时序要全站一致，
   散在各页的 IIFE 里迟早会漂移。
   兜底：宿主若因脚本异常没调用 ready()，15s 后自动退场，不留永久黑屏。 */
(function () {
    'use strict';

    var OVERLAY_ID = 'pageLoadingOverlay';
    var FADE_MS = 650;
    var FALLBACK_MS = 15000;

    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    /* ---------- 雪花（画在加载层自己的画布上） ---------- */
    (function () {
        var c = document.getElementById('ldSnowCanvas');
        if (!c) return;
        var ctx = c.getContext('2d');
        var flakes = [];

        function resize() {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            c.width = Math.round(window.innerWidth * dpr);
            c.height = Math.round(window.innerHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        window.addEventListener('resize', resize);

        for (var i = 0; i < 80; i++) {
            flakes.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                r: Math.random() * 3 + 1,
                speed: Math.random() * 1.5 + 0.5,
                wind: Math.random() * 0.5 - 0.25,
                opacity: Math.random() * 0.6 + 0.2,
                swing: Math.random() * Math.PI * 2,
                swingSpeed: Math.random() * 0.02 + 0.01
            });
        }

        (function loop() {
            if (!c.isConnected) return;      // 加载层被移除后自然停机
            var W = window.innerWidth, H = window.innerHeight;
            ctx.clearRect(0, 0, W, H);
            for (var k = 0; k < flakes.length; k++) {
                var f = flakes[k];
                f.y += f.speed;
                f.swing += f.swingSpeed;
                f.x += Math.sin(f.swing) * 0.5 + f.wind;
                if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
                if (f.x > W + 10) f.x = -10;
                if (f.x < -10) f.x = W + 10;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,' + f.opacity + ')';
                ctx.fill();
            }
            requestAnimationFrame(loop);
        })();
    })();

    /* ---------- 退场：ready() → 两帧 → 淡出 → 移除 ---------- */
    var dismissed = false;
    function ready() {
        if (dismissed) return;
        dismissed = true;
        var el = document.getElementById(OVERLAY_ID);
        if (!el) return;
        // 等两帧：宿主调用 ready() 时多半只是"资源就绪"，首帧绘制还没提交给合成器
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                el.classList.add('done');
                setTimeout(function () {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, FADE_MS);
            });
        });
    }

    setTimeout(ready, FALLBACK_MS);

    window.PageLoading = { ready: ready, FADE_MS: FADE_MS };
})();
