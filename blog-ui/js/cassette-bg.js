// cassette.exe · 第六章 cassette 场景背景视差驱动
// 只负责把页面纵向滚动量写进 --cx-scroll；多层偏移与 fx0 漂移都由 cassette.css 计算。
(function () {
    'use strict';
    const root = document.documentElement;
    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let queued = false;

    function apply() {
        queued = false;
        const y = reduceQuery.matches ? 0 : (window.scrollY || window.pageYOffset || 0);
        root.style.setProperty('--cx-scroll', y.toFixed(1) + 'px');
    }

    function schedule() {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(apply);
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', schedule);
    apply();
})();
