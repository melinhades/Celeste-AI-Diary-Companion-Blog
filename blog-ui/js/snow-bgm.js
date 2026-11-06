// ===== 雪花粒子系统 + BGM（index / login / register / diary / article / archives / write 公共） =====
// 雪：圆点粒子（网页原版效果）+ Celeste overlay 雾层（js/snow-effect.js 的 attach 负责背景层）。
// 接口不变：startSnow() / stopSnow() 仍为全局函数，diary.js 等处的调用无需改动。

var snowCanvas = document.getElementById('snowCanvas');
var snowHandle = null;   // CelesteSnow.attach 返回的 { stop, snow }

/** snow-effect.js 未随页面加载时动态补载（正常页面都应显式引在 snow-bgm.js 之前） */
function ensureSnowLib(cb) {
    if (window.CelesteSnow && window.CelesteSnow.attach) return cb();
    var s = document.createElement('script');
    s.src = 'js/snow-effect.js?v=20261106c';
    s.onload = cb;
    s.onerror = cb;   // 加载失败：保持无雪，页面功能不受影响
    document.head.appendChild(s);
}

function startSnow() {
    if (!snowCanvas || snowHandle) return;
    ensureSnowLib(function () {
        if (snowHandle || !snowCanvas.isConnected) return;
        if (!(window.CelesteSnow && window.CelesteSnow.attach)) return;
        // 背景雪只要圆点，不要 overlay 雾层（雾层仅保留在圆桌与加载层）
        snowHandle = window.CelesteSnow.attach(snowCanvas, {
            particleStyle: 'dots',
            overlayAlpha: 0
        });
    });
}

function stopSnow() {
    if (snowHandle) { snowHandle.stop(); snowHandle = null; }
    if (snowCanvas) {
        var c = snowCanvas.getContext('2d');
        if (c) c.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
    }
}

if (snowCanvas) startSnow();

// ===== BGM（postcard.mp3：进度跨页接续 + 自动播放兜底） =====
// 页面若自行管理 BGM（如 diary 使用 bgmTimeDiary），可在 <html> 上标记 data-no-auto-bgm 关闭本段
var bgmPlayer = document.getElementById('bgmPlayer');
if (bgmPlayer && !document.documentElement.hasAttribute('data-no-auto-bgm')) {
    const savedTime = parseFloat(localStorage.getItem('bgmTime') || '0');
    if (savedTime > 0) bgmPlayer.currentTime = savedTime;
    bgmPlayer.volume = 0.25;
    bgmPlayer.play().catch(() => {});
    setInterval(() => { localStorage.setItem('bgmTime', bgmPlayer.currentTime); }, 2000);
    function tryPlayBGM() {
        bgmPlayer.play().then(() => {
            document.removeEventListener('click', tryPlayBGM);
            document.removeEventListener('keydown', tryPlayBGM);
        }).catch(() => {});
    }
    document.addEventListener('click', tryPlayBGM);
    document.addEventListener('keydown', tryPlayBGM);
}
