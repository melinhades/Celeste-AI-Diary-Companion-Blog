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
    var MIN_VISIBLE_MS = 1700;   // 至少可见两轮（0.8s × 2 = 1.6s），数据早到也不能一闪而过

    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    var shownAt = 0;   // 加载层可见起点（非 standby 页在初始化时记，index 在 show() 时记）

    /* ---------- 空闲预热图集：提前 decode，show() 时不再冷抓 PNG ---------- */
    function prewarmSprite() {
        var img = overlay.querySelector('.loading-madeline-sprite');
        if (!img || !img.decode) return;
        var go = function () { img.decode().catch(function () {}); };
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 500 });
        else setTimeout(go, 500);
    }

    /* ---------- 雪花（画在加载层自己的画布上，首次显示时才启动） ----------
       particleStyle:'dots' → 圆点雪（网页原版效果）；背景 overlay 雾层由 attach 一并绘制。
       加载层被移除后 attach 的渲染循环自动停机。 */
    var snowStarted = false;
    var snowHandle = null;
    function startSnow() {
        if (snowStarted) return;
        snowStarted = true;
        var c = document.getElementById('ldSnowCanvas');
        if (!c) return;
        function go() {
            if (snowHandle || !c.isConnected) return;
            if (!(window.CelesteSnow && window.CelesteSnow.attach)) return;
            snowHandle = window.CelesteSnow.attach(c, { particleStyle: 'dots' });
        }
        if (window.CelesteSnow && window.CelesteSnow.attach) {
            go();
        } else {
            var s = document.createElement('script');
            s.src = 'js/snow-effect.js?v=20261106c';
            s.onload = go;
            s.onerror = function () {};   // 加载失败：无雪降级，加载层功能不受影响
            document.head.appendChild(s);
        }
    }
    function stopSnow() {
        if (snowHandle) { snowHandle.stop(); snowHandle = null; }
    }

    /* ---------- 显示：index 点鸟飞走后才唤醒 ---------- */
    function show() {
        if (dismissed) return;
        shownAt = performance.now();
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
        // 可见时长门控：未跑满两轮就等剩下的时间，避免用户只看到一轮冷启动
        var wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
        setTimeout(function () {
            // 等两帧：宿主调用 ready() 时多半只是"资源就绪"，首帧绘制还没提交给合成器
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    el.classList.add('done');
                    setTimeout(function () {
                        stopSnow();
                        if (el.parentNode) el.parentNode.removeChild(el);
                    }, FADE_MS);
                });
            });
        }, wait);
    }

    /* ---------- bfcache 返回 index：把加载层退回待命态，下次点击还能用 ---------- */
    function reset() {
        dismissed = false;
        overlay.classList.remove('done');
        overlay.style.opacity = '';
        overlay.setAttribute('data-standby', '');
    }

    prewarmSprite();
    if (overlay.hasAttribute('data-standby')) {
        /* index 页：等 show()，别启动兜底计时 */
    } else {
        shownAt = performance.now();
        startSnow();
        setTimeout(ready, FALLBACK_MS);
    }

    window.PageLoading = { ready: ready, show: show, reset: reset, FADE_MS: FADE_MS };
})();
