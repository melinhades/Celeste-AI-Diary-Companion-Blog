    // ===== 雪花（与首页同款，精简） =====
    (function () {
        const cv = document.getElementById('snowCanvas');
        const c = cv.getContext('2d');
        function resize() { cv.width = innerWidth; cv.height = innerHeight; }
        resize(); addEventListener('resize', resize);
        const fs = [];
        for (let i = 0; i < 70; i++) fs.push({
            x: Math.random() * innerWidth, y: Math.random() * innerHeight,
            r: Math.random() * 3 + 1, sp: Math.random() * 1.5 + 0.5,
            w: Math.random() * 0.5 - 0.25, o: Math.random() * 0.6 + 0.2,
            sw: Math.random() * Math.PI * 2, sws: Math.random() * 0.02 + 0.01
        });
        (function loop() {
            c.clearRect(0, 0, cv.width, cv.height);
            for (const f of fs) {
                f.y += f.sp; f.sw += f.sws;
                f.x += Math.sin(f.sw) * 0.5 + f.w;
                if (f.y > cv.height + 10) { f.y = -10; f.x = Math.random() * cv.width; }
                if (f.x > cv.width + 10) f.x = -10;
                if (f.x < -10) f.x = cv.width + 10;
                c.beginPath(); c.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                c.fillStyle = 'rgba(255,255,255,' + f.o + ')'; c.fill();
            }
            requestAnimationFrame(loop);
        })();
    })();
