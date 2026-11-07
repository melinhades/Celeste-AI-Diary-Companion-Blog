    // ===== 雪花（圆点雪，与首页同款；overlay 雾层由 attach 一并绘制） =====
    (function () {
        const cv = document.getElementById('snowCanvas');
        if (!cv) return;
        // 临时真机对比开关：?nofx=1 时雪与雾整层不启动（CSS 已隐藏 canvas，这里再省掉渲染循环）
        if (document.documentElement.classList.contains('rt-nofx')) return;
        function go() {
            if (!(window.CelesteSnow && window.CelesteSnow.attach)) return;
            window.CelesteSnow.attach(cv, { particleStyle: 'dots', count: 70 });
        }
        if (window.CelesteSnow && window.CelesteSnow.attach) {
            go();
        } else {
            const s = document.createElement('script');
            s.src = 'js/snow-effect.js?v=20261106c';
            s.onload = go;
            s.onerror = function () {};   // 加载失败：无雪降级
            document.head.appendChild(s);
        }
    })();
