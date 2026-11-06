    // ===== 雪花（圆点雪，与首页同款；overlay 雾层由 attach 一并绘制） =====
    (function () {
        const cv = document.getElementById('snowCanvas');
        if (!cv) return;
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
