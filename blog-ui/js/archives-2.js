// ================= 像素 Madeline 行为树 + 点击彩蛋（vanilla 保留，独立于 Vue 挂载区） =================
(function () {
    const SRC = {
        move: 'celeste-gui/madeline-move.gif',
        fun: 'celeste-gui/madeline-fun.gif',
        sit: 'celeste-gui/madeline-sitdown.gif',
    };
    const style = document.createElement('style');
    style.textContent =
        '#arcMadeline{position:fixed;left:0;bottom:14px;z-index:300;width:56px !important;height:56px !important;image-rendering:pixelated;cursor:pointer;user-select:none;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));}' +
        '#arcMadeline[src*="madeline-sitdown.gif"] { width: 100px !important; height: auto !important; }' +
        '#arcBubble{position:fixed;z-index:301;background:rgba(22,34,60,.95);border:2px solid #ffe36d;border-radius:8px;color:#ffe36d;font-size:12px;padding:6px 12px;pointer-events:none;opacity:0;transition:opacity .3s;white-space:nowrap;--c:#F94A4A;}' +
        '#arcBubble.show{opacity:1;}';
    document.head.appendChild(style);

    const pm = new Image();
    pm.id = 'arcMadeline';
    pm.src = SRC.move;
    document.body.appendChild(pm);

    const bubble = document.createElement('div');
    bubble.id = 'arcBubble';
    document.body.appendChild(bubble);

    const eggAudio = new Audio('celeste-sounds/wow_so_secret.wav');

    const st = { x: window.innerWidth * 0.2, dir: 1, mode: 'walk', modeUntil: 0, hopT: 0 };
    let bubbleTimer = null;
    function showBubble(text) {
        if (window.TextFx) bubble.innerHTML = TextFx.render(TextFx.autoMark(text));  // 彩蛋气泡三种动画
        else bubble.textContent = text;
        bubble.style.left = Math.min(window.innerWidth - 190, Math.max(8, st.x - 40)) + 'px';
        bubble.style.bottom = '88px';
        bubble.classList.add('show');
        if (bubbleTimer) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2600);
    }

    const eggLines = ['Wow～被你发现了♪', '嘿嘿，这首歌只放给你听～', '这是秘密关卡的奖励哦！'];
    const HOLI_LINES = {
        '1-1': '新年快乐！今年的山一起爬～',
        '2-14': '情人节快乐，今天你是我的 Valentine！',
        '4-1': '愚人节～其实这首歌是 Badeline 唱的！',
        '5-1': '劳动节快乐，今天歇着吧！',
        '6-1': '儿童节快乐！今天谁都是小孩～',
        '10-1': '国庆快乐～长假来爬山！',
        '10-24': '1024！程序员节快乐～',
        '10-31': '万圣夜……别回头……',
        '11-11': '双十一，别剁手，多读书～',
        '12-25': '圣诞快乐～雪山就是圣诞树！',
        '1-25': '今天是 Celeste 的生日！登山周年快乐～'
    };
    pm.addEventListener('click', () => {
        if (st.mode === 'egg') return;
        st.mode = 'egg';
        st.modeUntil = performance.now() + 1800;
        st.hopT = 0;
        pm.src = SRC.fun;
        const now = new Date();
        const hLine = HOLI_LINES[(now.getMonth() + 1) + '-' + now.getDate()];
        showBubble(hLine || eggLines[Math.floor(Math.random() * eggLines.length)]);
        eggAudio.currentTime = 0;
        eggAudio.play().catch(() => {});
    });

    function pickNext(now) {
        const r = Math.random();
        if (r < 0.38) {
            st.mode = 'walk';
            st.modeUntil = now + 2000 + Math.random() * 3000;
            if (Math.random() < 0.3) st.dir *= -1;
            pm.src = SRC.move;
        } else if (r < 0.55) {
            st.mode = 'idle';
            st.modeUntil = now + 800 + Math.random() * 1400;
            pm.src = SRC.move;
        } else if (r < 0.75) {
            st.mode = 'sit';
            st.modeUntil = now + 2200 + Math.random() * 2200;
            pm.src = SRC.sit;
        } else {
            // 站立张望（用 fun 素材）
            st.mode = 'lookaround';
            st.modeUntil = now + 1800 + Math.random() * 1800;
            pm.src = SRC.fun;
        }
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(50, now - last) / 1000;
        last = now;
        if (st.mode === 'egg') {
            st.hopT += dt;
            const hop = Math.abs(Math.sin(st.hopT * 9)) * 14;
            pm.style.transform = 'translate(' + st.x + 'px,' + (-hop) + 'px)' + (st.dir < 0 ? ' scaleX(-1)' : '');
            if (now >= st.modeUntil) { st.mode = 'walk'; st.modeUntil = now + 2000; pm.src = SRC.move; }
        } else {
            if (now >= st.modeUntil) pickNext(now);
            if (st.mode === 'walk') {
                st.x += st.dir * 70 * dt;
                if (st.x <= 8) { st.x = 8; st.dir = 1; }
                if (st.x >= window.innerWidth - 72) { st.x = window.innerWidth - 72; st.dir = -1; }
                if (pm.src.indexOf('madeline-move') === -1) pm.src = SRC.move;
            }
            pm.style.transform = 'translate(' + st.x + 'px,0px)' + (st.dir < 0 && st.mode === 'walk' ? ' scaleX(-1)' : '');
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
})();
