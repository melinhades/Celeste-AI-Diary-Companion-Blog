/* ===== js/page-loading.js — 全站统一加载层（夜空 + 雪 + 跑动的 Madeline） =====
   页面在 <body> 顶部放 #pageLoadingOverlay（视觉见 css/internet_cafe.css 或 css/index-bird.css）。
   本脚本负责动画层的三件事：
     1. 在 #ldSnowCanvas 上画雪花（与 article.js 的登录页口径一致：80 片、1~4px、风摆）；
     2. 暴露 PageLoading.ready()：宿主在场景/数据就绪后调用，等两帧（确保首帧已经画到
        屏幕上）再加 .done 淡出，650ms 后从 DOM 移除；
     3. 暴露 PageLoading.show() / reset()：给 index 页的「点鸟飞走后铺加载层」用。
        这类覆盖层在 body 顶部带 data-standby，加载完成前先不显示、也不启动 15s 兜底
        （否则用户还没点，15s 后兜底就把层从 DOM 里删了）。
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

    /* ---------- 雪花（画在加载层自己的画布上，首次显示时才启动） ---------- */
    var snowStarted = false;
    function startSnow() {
        if (snowStarted) return;
        snowStarted = true;
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
    }

    /* ---------- 显示：index 点鸟飞走后才唤醒 ---------- */
    function show() {
        if (dismissed) return;
        overlay.removeAttribute('data-standby');
        overlay.setAttribute('aria-hidden', 'false');
        startSnow();
        // 从透明淡入（.done 可能在 bfcache 恢复时还挂着）
        overlay.classList.remove('done');
        overlay.style.opacity = '0';
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { overlay.style.opacity = ''; });
        });
    }

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

    /* ---------- bfcache 返回 index：把加载层退回待命态，下次点击还能用 ---------- */
    function reset() {
        dismissed = false;
        overlay.classList.remove('done');
        overlay.style.opacity = '';
        overlay.setAttribute('data-standby', '');
    }

    if (overlay.hasAttribute('data-standby')) {
        /* index 页：等 show()，别启动兜底计时 */
    } else {
        startSnow();
        setTimeout(ready, FALLBACK_MS);
    }

    window.PageLoading = { ready: ready, show: show, reset: reset, FADE_MS: FADE_MS };
})();
