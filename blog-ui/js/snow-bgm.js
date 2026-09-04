// ===== 雪花粒子系统 + BGM（index / login / register 公共） =====
// 顶层 var / function 会挂到 window，供 index.html 的雪花增强版（分类图片切换）重新赋值扩展

var snowCanvas = document.getElementById('snowCanvas');
var snowCtx = snowCanvas ? snowCanvas.getContext('2d') : null;
var snowflakes = [];
var snowAnimFrame = null;

function resizeSnowCanvas() {
    if (!snowCanvas) return;
    snowCanvas.width = window.innerWidth;
    snowCanvas.height = window.innerHeight;
}

function createSnowflake() {
    return {
        x: Math.random() * snowCanvas.width,
        y: -10,
        r: Math.random() * 3 + 1,
        speed: Math.random() * 1.5 + 0.5,
        wind: Math.random() * 0.5 - 0.25,
        opacity: Math.random() * 0.6 + 0.2,
        swing: Math.random() * Math.PI * 2,
        swingSpeed: Math.random() * 0.02 + 0.01
    };
}

function initSnowflakes() {
    snowflakes = [];
    for (let i = 0; i < 80; i++) {
        const f = createSnowflake();
        f.y = Math.random() * snowCanvas.height;
        snowflakes.push(f);
    }
}

function drawSnowflakes() {
    snowCtx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
    for (const f of snowflakes) {
        f.y += f.speed;
        f.swing += f.swingSpeed;
        f.x += Math.sin(f.swing) * 0.5 + f.wind;
        if (f.y > snowCanvas.height + 10) { f.y = -10; f.x = Math.random() * snowCanvas.width; }
        if (f.x > snowCanvas.width + 10) f.x = -10;
        if (f.x < -10) f.x = snowCanvas.width + 10;
        snowCtx.beginPath();
        snowCtx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        snowCtx.fillStyle = `rgba(255,255,255,${f.opacity})`;
        snowCtx.fill();
    }
    snowAnimFrame = requestAnimationFrame(drawSnowflakes);
}

function startSnow() {
    if (!snowCanvas || snowAnimFrame) return;
    resizeSnowCanvas();
    initSnowflakes();
    drawSnowflakes();
}

if (snowCanvas) {
    window.addEventListener('resize', resizeSnowCanvas);
    startSnow();
}

// ===== BGM（postcard.mp3：进度跨页接续 + 自动播放兜底） =====
var bgmPlayer = document.getElementById('bgmPlayer');
if (bgmPlayer) {
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
