/* ===== js/roundtable-transition.js — index → 圆桌会议的紫色背景过渡 =====
   范围只有一条链路：引用 css/index-bird.css 的 index 页（星空/雪景 + common.css 紫渐变）
   点击导航栏 🪑 进入 roundtable.html。其他入口不走这里。

   为什么需要：两端底色本来就是同一套 common.css 紫渐变
   linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)，
   突兀感来自导航瞬间新文档还没交出首帧时的白屏/硬切，而不是色差。

   两端做法：
     出发（index）：拦截普通左键点击，铺一层同色紫渐变，320ms 淡入到不透明后再跳；
                    浏览器卸载旧文档前始终停在纯紫上，不会露出白底。
     到达（roundtable）：HTML 里 #rtArriveCurtain 从第一帧起就盖住（内联样式，不依赖
                    外部 CSS），本脚本等首帧提交后 380ms 淡出，盖住解析/脚本执行的间隙。
   两端共用同一个 GRADIENT 常量，并写入 sessionStorage 标记，只有从 index 进来才铺到达层。 */
(function () {
    'use strict';

    var FLAG = 'rt_from_index_v1';
    var GRADIENT = 'linear-gradient(135deg,#0f0c29 0%,#302b63 50%,#24243e 100%)';
    var LEAVE_MS = 320;        // 出发页淡向紫色
    var ARRIVE_MS = 380;       // 圆桌从紫色里浮出
    var ARRIVE_MIN_MS = 120;   // 到达层最短停留（脚本执行完后再留一点，避免一闪而过）

    function prefersReduced() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function setFlag() {
        // 带时间戳：若用户在出发动画期间中止导航，滞留的标记会在 8s 后自然失效
        try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (e) { /* 隐私模式：无标记则到达层自动移除 */ }
    }
    function paintFade(el, to, ms) {
        el.style.transition = 'opacity ' + ms + 'ms ease';
        el.style.opacity = String(to);
    }

    /* ---------- 落点：roundtable ---------- */
    var curtain = document.getElementById('rtArriveCurtain');
    if (curtain) {
        // 直接访问 / 刷新时，内联脚本已经把层移除，这里自然什么都不做
        if (!curtain.hasAttribute('data-arriving')) {
            if (curtain.parentNode) curtain.parentNode.removeChild(curtain);
            return;
        }
        var startedAt = performance.now();
        var gone = false;
        function removeCurtain() {
            if (gone) return;
            gone = true;
            if (curtain.parentNode) curtain.parentNode.removeChild(curtain);
        }
        // 双 rAF：等圆桌的首帧真正提交给合成器后再退场，避免先露出半张页面
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    if (prefersReduced()) { removeCurtain(); return; }
                    curtain.style.pointerEvents = 'none';
                    paintFade(curtain, 0, ARRIVE_MS);
                    setTimeout(removeCurtain, ARRIVE_MS + 50);
                }, Math.max(0, ARRIVE_MIN_MS - (performance.now() - startedAt)));
            });
        });
        return;
    }

    /* ---------- 出发：index 的圆桌入口 ---------- */
    // .chair-here 是圆桌页自己的当前页标记，排除掉，避免在本页重复触发
    var entry = document.querySelector('a.nav-chair[href="roundtable.html"]:not(.chair-here)');
    if (!entry) return;

    var leaving = false;
    entry.addEventListener('click', function (e) {
        if (leaving) { e.preventDefault(); return; }
        // 修饰键 / 中键 / 右键交给浏览器原生行为（新标签页、下载等）
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        leaving = true;
        setFlag();

        var target = entry.href;
        if (prefersReduced()) { location.href = target; return; }

        var veil = document.createElement('div');
        veil.id = 'rtLeaveCurtain';
        veil.setAttribute('aria-hidden', 'true');
        veil.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;'
            + 'background:' + GRADIENT + ';background-attachment:fixed;opacity:0;';
        document.body.appendChild(veil);
        veil.getBoundingClientRect();   // 先让 opacity:0 落进样式树，否则首帧可能跳过补间
        requestAnimationFrame(function () { paintFade(veil, 1, LEAVE_MS); });
        setTimeout(function () { location.href = target; }, LEAVE_MS + 30);
    });
})();
