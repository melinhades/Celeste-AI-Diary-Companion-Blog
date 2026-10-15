    // ===== 音频手势解锁（修复音效不生效） =====
    ['pointerdown', 'keydown'].forEach(function(ev) {
        window.addEventListener(ev, function() { window.__audioGestured = true; }, { once: true });
    });

    // ===== BGM 1212 循环 =====
    var bgmList = ['bgm/checking-in.mp3', 'bgm/farewell.mp3'];
    var bgmIndex = parseInt(localStorage.getItem('shopBgmIndex') || '0');
    if (bgmIndex >= bgmList.length) bgmIndex = 0;
    var bgmPlayer = document.getElementById('bgmPlayer');
    bgmPlayer.src = bgmList[bgmIndex];
    bgmPlayer.volume = 0.3;
    var savedTime = parseFloat(localStorage.getItem('shopBgmTime') || '0');
    if (savedTime > 0) bgmPlayer.currentTime = savedTime;
    bgmPlayer.play().catch(function(){});
    bgmPlayer.addEventListener('ended', function() {
        bgmIndex = (bgmIndex + 1) % bgmList.length;
        localStorage.setItem('shopBgmIndex', String(bgmIndex));
        localStorage.setItem('shopBgmTime', '0');
        bgmPlayer.src = bgmList[bgmIndex];
        bgmPlayer.play().catch(function(){});
    });
    setInterval(function() { localStorage.setItem('shopBgmTime', String(bgmPlayer.currentTime)); }, 2000);
    function tryPlayBGM() { bgmPlayer.play().then(function(){ document.removeEventListener('click', tryPlayBGM); document.removeEventListener('keydown', tryPlayBGM); }).catch(function(){}); }
    document.addEventListener('click', tryPlayBGM);
    document.addEventListener('keydown', tryPlayBGM);

    // ===== 开场备忘录：由右侧省略号按钮触发 =====
    var memoEl = document.getElementById('shopMemo');
    var memoTimer = null;
    function hideOpeningMemo() {
        memoEl.classList.remove('show');
        if (memoTimer) { clearTimeout(memoTimer); memoTimer = null; }
    }
    function playOpeningMemo() {
        hideOpeningMemo();
        requestAnimationFrame(function(){ requestAnimationFrame(function(){ memoEl.classList.add('show'); }); });
        memoTimer = setTimeout(hideOpeningMemo, 5000);
    }
    memoEl.addEventListener('click', hideOpeningMemo);

    if (localStorage.getItem('berryFix20260822') !== '1') {
        localStorage.setItem('berryFix20260822', '1');
        localStorage.setItem('berryBalance', '3');
        try {
            var keep = JSON.parse(localStorage.getItem('berryOwned') || '[]').filter(function (id) {
                return ['goldberry', 'heartgem', 'moonberry'].indexOf(id) >= 0;
            });
            localStorage.setItem('berryOwned', JSON.stringify(keep));
        } catch (e) {}
        localStorage.removeItem('berryBgm');
    }

    // ===== Oshiro 立绘帧动画 =====
    var OSHIRO_FRAMES = { normal:13, nervous:8, worried:8, drama:6, lostcontrol:6, serious:8, sidehappy:8, sidesuspicious:8, sideworried:9 };
    var OSHIRO_EMOTION = { '默认':'normal', '不安':'nervous', '不开心':'worried', '怨恨':'drama', '惊讶':'lostcontrol', '无语':'serious', '可爱':'sidehappy' };
    var oshiroPortrait = document.getElementById('oshiroPortrait');
    var dialogPortraitImg = document.getElementById('gameDialogPortraitImg');
    var currentEmotion = 'normal';
    var frameIdx = 0;
    var frameTimer = null;

    function startPortraitAnim(emotion) {
        currentEmotion = emotion || 'normal';
        frameIdx = 0;
        if (frameTimer) clearInterval(frameTimer);
        var count = OSHIRO_FRAMES[currentEmotion] || 13;
        frameTimer = setInterval(function() {
            frameIdx = (frameIdx + 1) % count;
            var src = 'Atlases/Portraits/oshiro/' + currentEmotion + String(frameIdx).padStart(2, '0') + '.png';
            if (oshiroPortrait) oshiroPortrait.src = src;
            dialogPortraitImg.src = src;
        }, 120);
    }
    startPortraitAnim('normal');

    // ===== Oshiro 音效（情绪化语速/音量） =====
    var OS_VARIANTS = ['mid_a', 'mid_b', 'mid_c', 'end'];
    var OS_FILE_MAP = { 'mid_a': 'mid_A', 'mid_b': 'mid_B', 'mid_c': 'mid_C', 'end': 'end' };
    var OS_MAX_NUM = { 'mid_a': 10, 'mid_b': 10, 'mid_c': 8, 'end': 10 };
    var OS_RATE = { '不安':[0.82,0.95], '不开心':[0.8,0.92], '惊讶':[1.02,1.2], '怨恨':[0.95,1.15], '可爱':[0.95,1.12], '无语':[0.85,0.96], '默认':[0.9,1.08] };
    var OS_VOL = { '不安':0.62, '不开心':0.55, '惊讶':0.9, '怨恨':0.85, '可爱':0.85, '无语':0.6, '默认':0.78 };
    var osSpeakSeq = 0;
    var osDialogEmotion = '默认';
    var oshiroBlipAudio = new Audio();
    function playOshiroSound() {
        if (!window.__audioGestured) return;
        var dirVariant;
        if (osSpeakSeq % 5 === 0) {
            dirVariant = 'end';
        } else {
            dirVariant = OS_VARIANTS[osSpeakSeq % 3];
        }
        var fileVariant = OS_FILE_MAP[dirVariant];
        var maxNum = OS_MAX_NUM[dirVariant];
        var num = String(Math.floor(Math.random() * maxNum) + 1).padStart(2, '0');
        var src = 'celeste-sounds/oshiro/worried/' + dirVariant + '/worried_' + fileVariant + '_' + num + '.wav';
        try {
            var rr = OS_RATE[osDialogEmotion] || OS_RATE['默认'];
            oshiroBlipAudio.src = src;
            oshiroBlipAudio.volume = (OS_VOL[osDialogEmotion] || 0.78) + (Math.random() - 0.5) * 0.08;
            oshiroBlipAudio.playbackRate = rr[0] + Math.random() * (rr[1] - rr[0]);
            oshiroBlipAudio.currentTime = 0;
            oshiroBlipAudio.play().catch(function(){});
        } catch (e) {}
    }

    // ===== Oshiro 对话框（打字机 + 音效） =====
    var gameDialog = document.getElementById('gameDialog');
    var dialogText = document.getElementById('gameDialogText');
    var dialogTimer = null;
    var dialogTypeTimer = null;

    function showOshiroDialog(text, emotion) {
        var emo = OSHIRO_EMOTION[emotion] || emotion || 'normal';
        osDialogEmotion = emotion || '默认';
        if (OSHIRO_FRAMES[emo]) startPortraitAnim(emo);
        dialogText.textContent = '';
        gameDialog.classList.add('show');
        if (window.TextFx) gameDialog.classList.add('tfx-typing');
        if (dialogTimer) clearTimeout(dialogTimer);
        if (dialogTypeTimer) clearInterval(dialogTypeTimer);

        var ftext = window.TextFx ? TextFx.autoMark(text) : text;  // 无标记台词自动补三种动画
        var charIdx = 0;
        dialogTypeTimer = setInterval(function() {
            if (charIdx >= ftext.length) {
                clearInterval(dialogTypeTimer);
                dialogTypeTimer = null;
                if (window.TextFx) { TextFx.set(dialogText, ftext); gameDialog.classList.remove('tfx-typing'); }
                dialogTimer = setTimeout(function() { gameDialog.classList.remove('show'); }, 6000);
                return;
            }
            var ch = ftext[charIdx];
            charIdx++;
            if (window.TextFx) TextFx.set(dialogText, ftext.slice(0, charIdx));
            else dialogText.textContent += ch;
            /* 标记符 { } ~ * 不参与发声计数 */
            var isMarker = ch === '{' || ch === '}' || ch === '~' || ch === '*';
            if (!isMarker && !/[\s。！？!?…，,、；;：:（）()*]/.test(ch)) {
                osSpeakSeq++;
                if (osSpeakSeq % 3 === 1) playOshiroSound();
            }
        }, 50);

        // 害怕情绪（不安/不开心）→ 像素小人坐下
        if (emotion === '不安' || emotion === '不开心') {
            osSitScared();
        }
    }
    // 点击对话框立即关闭（与 Madeline 的对话交互一致）
    gameDialog.addEventListener('click', function() {
        if (dialogTimer) { clearTimeout(dialogTimer); dialogTimer = null; }
        if (dialogTypeTimer) { clearInterval(dialogTypeTimer); dialogTypeTimer = null; }
        gameDialog.classList.remove('tfx-typing');
        gameDialog.classList.remove('show');
    });
    // ===== 像素 Oshiro 行为：默认四处游逛，害怕才坐 =====
    var pixelOshiro = document.getElementById('pixelOshiro');
    var OS_SRC = {
        appear: 'celeste-gui/oshiro-appear.gif',
        idle: 'celeste-gui/oshiro-idle.gif',
        idle_ground: 'celeste-gui/oshiro-idle_ground.gif',
        move: 'celeste-gui/oshiro-move.gif',
        sweeping: 'celeste-gui/oshiro-sweeping.gif',
        putBroomAway: 'celeste-gui/oshiro-putBroomAway.gif',
        fall: 'celeste-gui/oshiro-fall.gif',
        recover: 'celeste-gui/oshiro-recover.gif',
        side: 'celeste-gui/oshiro-side.gif'
    };
    var osMode = '';
    var osWanderTimer = null;

    function osSetSrc(name) {
        if (pixelOshiro.src.indexOf(name) === -1) pixelOshiro.src = name;
    }
    // ===== 房间约束：内部轮廓（图源 resort-room.png 2560×1600 的归一化坐标，顺时针） =====
    var ROOM_POLY_N = [
        [0.104,0.803], [0.104,0.700], [0.149,0.700], [0.149,0.500],
        [0.235,0.500], [0.235,0.166], [0.352,0.166], [0.375,0.125],
        [0.410,0.125], [0.410,0.097], [0.566,0.097], [0.605,0.125],
        [0.633,0.125], [0.633,0.166], [0.742,0.166], [0.742,0.494],
        [0.852,0.494], [0.852,0.631], [1.000,0.631], [1.000,0.803]
    ];
    var ROOM_FLOOR_NY = 0.803;
    // cover 自然缩放（与 body 背景的 center/cover 一致）
    var roomGeo = { scale:1, ox:0, oy:0 };
    function recalcRoomGeo() {
        var vw = window.innerWidth, vh = window.innerHeight;
        var s = Math.max(vw / 320, vh / 200);
        roomGeo.scale = s / 8;   // 相对 2560x1600 图源
        roomGeo.ox = (vw - s * 320) / 2;
        roomGeo.oy = (vh - s * 200) / 2;
    }
    function nToXY(nx, ny) {
        return { x: nx * 2560 * roomGeo.scale + roomGeo.ox,
                 y: ny * 1600 * roomGeo.scale + roomGeo.oy };
    }
    function roomScreenPoly() {
        recalcRoomGeo();
        return ROOM_POLY_N.map(function (p) { return nToXY(p[0], p[1]); });
    }
    function pointInPoly(x, y, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
        }
        return inside;
    }
    // sprite 整个盒子（四角）都要在房间内
    function boxInRoom(x, y, w, h, poly) {
        return pointInPoly(x, y, poly) && pointInPoly(x + w, y, poly) &&
               pointInPoly(x, y + h, poly) && pointInPoly(x + w, y + h, poly);
    }
    // 初始位置：房间中央地板
    function osPlaceInside() {
        var poly = roomScreenPoly();
        var w = pixelOshiro.offsetWidth || 512, h = pixelOshiro.offsetHeight || 512;
        var gy = osGroundY();
        var x = Math.max(0, window.innerWidth / 2 - w / 2);
        if (!boxInRoom(x, gy, w, h, poly)) { var p = nToXY(0.50, 0.55); x = p.x - w / 2; gy = p.y - h / 2; }
        pixelOshiro.style.left = x + 'px';
        pixelOshiro.style.top = gy + 'px';
    }
    window.addEventListener('resize', function () { recalcRoomGeo(); });

    // ===== 悬停提示按钮：跟随房间 cover 定位 =====
    // anchor = 原省略号中心（320×200 原生空间）；每层 size=画布边长(原生px)，
    // ox/oy = 该图锚点在画布中的比例（idle 黑点中心、resort 挂环中心）
    var IDLE_ANCHOR = { ox:63.5/128, oy:91.5/128 };
    var DOT_ZOOM = 0.6;   // 图标整体缩放（0.6 = 在原尺寸上缩小 40%）
    var DOTS_CFG = {
        dotMid: { anchor:{ x:172, y:128.5 }, layers:[
            { cls:'dot-idle',  size:36*DOT_ZOOM, ox:IDLE_ANCHOR.ox, oy:IDLE_ANCHOR.oy },
            { cls:'dot-hover', size:96*DOT_ZOOM, ox:0.5, oy:256/320 }
        ]},
        dotRight: { anchor:{ x:243.5, y:136.5 }, layers:[
            { cls:'dot-idle',  size:36*DOT_ZOOM, ox:IDLE_ANCHOR.ox, oy:IDLE_ANCHOR.oy },
            { cls:'dot-hover', size:36*DOT_ZOOM, ox:IDLE_ANCHOR.ox, oy:IDLE_ANCHOR.oy }
        ]}
    };
    function layoutDots() {
        recalcRoomGeo();
        var s = 8 * roomGeo.scale;   // 320x200 原生像素 → 屏幕像素
        Object.keys(DOTS_CFG).forEach(function(id) {
            var cfg = DOTS_CFG[id], el = document.getElementById(id);
            var a = nToXY(cfg.anchor.x / 320, cfg.anchor.y / 200);
            var boxes = cfg.layers.map(function(L) {
                var w = L.size * s;
                return { L:L, w:w, l:a.x - w * L.ox, t:a.y - w * L.oy };
            });
            var minL = Math.min.apply(null, boxes.map(function(b){return b.l;}));
            var minT = Math.min.apply(null, boxes.map(function(b){return b.t;}));
            var maxR = Math.max.apply(null, boxes.map(function(b){return b.l + b.w;}));
            var maxB = Math.max.apply(null, boxes.map(function(b){return b.t + b.w;}));
            boxes.forEach(function(bx) {
                var im = el.querySelector('.' + bx.L.cls);
                im.style.left = (bx.l - minL) + 'px';   // 相对按钮盒子
                im.style.top = (bx.t - minT) + 'px';
                im.style.width = bx.w + 'px';
                im.style.height = bx.w + 'px';
            });
            el.style.left = minL + 'px';
            el.style.top = minT + 'px';
            el.style.width = (maxR - minL) + 'px';
            el.style.height = (maxB - minT) + 'px';
        });
    }
    layoutDots();
    window.addEventListener('resize', layoutDots);
    document.getElementById('dotMid').addEventListener('click', summonOshiro);
    document.getElementById('dotRight').addEventListener('click', playOpeningMemo);

    // ===== 两侧烟囱烟雾：规律间隔冒出 → 上升摆动变大 → 淡出消散 =====
    var SMOKE_U = 'celeste-gui/smoke-puff.png';   // 11×12 浓白烟团
    var SMOKE_W = 'celeste-gui/smoke-wisp.png';   // 18×9 横向散烟
    // 发射源（320×200 原生空间）：火盆栏杆框内（L框 x58..80，R框 x239..262）
    var SMOKE_VENTS = [ { nx:62/320, ny:79/200 }, { nx:250/320, ny:79/200 } ];
    var SMOKE_INTERVAL = 950;   // 每侧发射间隔 ms
    var smokeLayer = document.getElementById('chimneySmoke');
    var smokeParts = [];        // 活动粒子
    var smokePool = [];         // 空闲 img 节点
    var smokeNext = [0, SMOKE_INTERVAL / 2];   // 两侧下次发射倒计时（错相半拍）

    function smokeSpawn(vi) {
        var kind = Math.random() < 0.4 ? 1 : 0;
        var el = smokePool.pop();
        if (!el) el = document.createElement('img');
        el.src = kind ? SMOKE_W : SMOKE_U;
        var v = SMOKE_VENTS[vi];
        smokeParts.push({
            el: el, w: kind ? 18 : 11, h: kind ? 9 : 12,
            nx: v.nx + (Math.random() - 0.5) * 5 / 320,
            ny: v.ny + Math.random() * 2 / 200,
            age: 0, ttl: 2.4 + Math.random() * 0.5,
            rise: (24 + Math.random() * 14) / 200,         // 上升高度（归一化）
            sway: (2 + Math.random() * 1.5) / 320,         // 横向摆动幅度
            swayPh: Math.random() * Math.PI * 2,
            drift: -(vi === 0 ? 4 + Math.random() * 4
                             : 6 + Math.random() * 5) / 320 // 烟整体向左飘散
        });
        smokeLayer.appendChild(el);
    }

    var smokeLast = performance.now();
    function smokeTick(now) {
        var dt = Math.min(0.05, (now - smokeLast) / 1000);
        smokeLast = now;
        recalcRoomGeo();
        var s = 8 * roomGeo.scale;   // 原生像素 → 屏幕像素
        for (var i = 0; i < 2; i++) {
            smokeNext[i] -= dt * 1000;
            if (smokeNext[i] <= 0) { smokeSpawn(i); smokeNext[i] = SMOKE_INTERVAL; }
        }
        for (var j = smokeParts.length - 1; j >= 0; j--) {
            var p = smokeParts[j];
            p.age += dt;
            var t = p.age / p.ttl;
            if (t >= 1) {   // 寿终回收
                smokeLayer.removeChild(p.el);
                smokePool.push(p.el);
                smokeParts.splice(j, 1);
                continue;
            }
            var up = 1 - Math.pow(1 - t, 3);   // easeOutCubic：初快后慢
            var cnx = p.nx + p.drift * t + Math.sin(t * Math.PI * 2 + p.swayPh) * p.sway;
            var cny = p.ny - p.rise * up;
            var xy = nToXY(cnx, cny);
            var sc = 0.7 + t * 1.15;            // 0.7 → 1.85 逐渐变大
            // 前 12% 淡入，55% 后开始淡出
            var al = t < 0.12 ? t / 0.12 * 0.75
                 : t > 0.55 ? 0.75 * (1 - (t - 0.55) / 0.45) : 0.75;
            var w = p.w * s, h = p.h * s;
            p.el.style.width = w + 'px';
            p.el.style.height = h + 'px';
            p.el.style.left = (xy.x - w / 2) + 'px';
            p.el.style.top = (xy.y - h / 2) + 'px';
            p.el.style.opacity = al.toFixed(3);
            p.el.style.transform = 'scale(' + sc.toFixed(3) + ')';
        }
        requestAnimationFrame(smokeTick);
    }
    requestAnimationFrame(smokeTick);

    // ===== 房间内二维游走：随机选点（必须在轮廓内）+ 避开弹框 =====
    function osCurXY() {
        return {
            x: parseFloat(pixelOshiro.style.left || '40'),
            y: parseFloat(pixelOshiro.style.top || '60')
        };
    }
    // 地面线：房间地板表面（屏幕坐标），返回 sprite 顶边 y
    function osGroundY() {
        recalcRoomGeo();
        var floorScreen = ROOM_FLOOR_NY * 1600 * roomGeo.scale + roomGeo.oy;
        return Math.max(0, floorScreen - (pixelOshiro.offsetHeight || 512) + 6);
    }
    function osBlockedAt(tx, ty) {
        var zones = [];
        var dlg = document.getElementById('gameDialog');
        if (dlg && dlg.classList.contains('show')) zones.push(dlg.getBoundingClientRect());
        var chat = document.getElementById('oshiroChatDialog');
        if (chat && chat.classList.contains('show')) zones.push(chat.getBoundingClientRect());
        var w = pixelOshiro.offsetWidth || 512, h = pixelOshiro.offsetHeight || 512;
        for (var i = 0; i < zones.length; i++) {
            var r = zones[i], m = 16;
            if (!r || (r.width === 0 && r.height === 0)) continue;
            if (tx < r.right + m && tx + w > r.left - m && ty < r.bottom + m && ty + h > r.top - m) return true;
        }
        return false;
    }
    function osPickTarget() {
        var poly = roomScreenPoly();
        var w = pixelOshiro.offsetWidth || 512, h = pixelOshiro.offsetHeight || 512;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        poly.forEach(function (p) {
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        });
        for (var t = 0; t < 80; t++) {
            var cx = minX + Math.random() * (maxX - minX);
            var cy = minY + Math.random() * (maxY - minY);
            if (!boxInRoom(cx, cy, w, h, poly)) continue;
            if (!osBlockedAt(cx, cy)) return { x: cx, y: cy };
        }
        // 兜底：房间中部已知安全点
        var p = nToXY(0.50, 0.55);
        return { x: p.x - w / 2, y: p.y - h / 2 };
    }
    function osWander() {
        if (osMode === 'sit' || osMode === 'greet' || osMode === 'trip') {
            osWanderTimer = setTimeout(osWander, 3000);
            return;
        }
        var cur = osCurXY();
        var tgt = osPickTarget();
        var dist = Math.sqrt((tgt.x - cur.x) * (tgt.x - cur.x) + (tgt.y - cur.y) * (tgt.y - cur.y));
        var dur = Math.max(1500, Math.min(8000, dist * (12 + Math.random() * 5)));

        osSetSrc(OS_SRC.move);
        pixelOshiro.style.transform = tgt.x < cur.x ? 'scaleX(-1)' : '';
        pixelOshiro.style.transition = 'left ' + dur + 'ms linear, top ' + dur + 'ms linear';
        pixelOshiro.style.left = tgt.x + 'px';
        pixelOshiro.style.top = tgt.y + 'px';

        osWanderTimer = setTimeout(function() {
            pixelOshiro.style.transform = '';
            if (osMode === 'sit') return;
            var roll = Math.random();
            if (roll < 0.06) {
                osGotoGroundThen(osTrip);
            } else if (roll < 0.22) {
                osGotoGroundThen(osSweep);
            } else if (roll < 0.32) {
                osGotoGroundThen(osRest);
            } else if (roll < 0.42) {
                osGotoGroundThen(osGreet);
            } else if (roll < 0.50) {
                osGotoGroundThen(osSideLook);
            } else {
                osWander();
            }
        }, dur + 200);
    }
    // 静止动作（绊倒/扫地/歇息）必须贴地：在半空就先走到地面再做
    function osGotoGroundThen(fn) {
        var cur = osCurXY();
        var gy = osGroundY();
        if (Math.abs(cur.y - gy) < 30) { fn(); return; }
        var dur = Math.max(600, Math.abs(gy - cur.y) * 8);
        osSetSrc(OS_SRC.move);
        pixelOshiro.style.transition = 'top ' + dur + 'ms linear';
        pixelOshiro.style.top = gy + 'px';
        osWanderTimer = setTimeout(fn, dur + 120);
    }

    function osSweep() {
        osSetSrc(OS_SRC.sweeping);
        setTimeout(function() {
            osSetSrc(OS_SRC.putBroomAway);
            setTimeout(osWander, 1500);
        }, 3200);
    }

    function osRest() {
        osSetSrc(OS_SRC.idle);
        setTimeout(osWander, 2500 + Math.random() * 2000);
    }

    // 新行为：招呼客人（side 素材，侧身挥手）
    function osGreet() {
        osSetSrc(OS_SRC.side);
        var greetLines = ['欢迎光临！今天想喝点什么？', '您来啦，快请进～', '今天天气不错呢，适合住一晚。'];
        if (Math.random() < 0.4) {
            showOshiroDialog(greetLines[Math.floor(Math.random() * greetLines.length)], '可爱');
        }
        setTimeout(function() {
            osSetSrc(OS_SRC.idle);
            setTimeout(osWander, 1200 + Math.random() * 1000);
        }, 2800);
    }

    // 新行为：侧身张望（side 素材，四处看看）
    function osSideLook() {
        osSetSrc(OS_SRC.side);
        setTimeout(function() {
            osSetSrc(OS_SRC.idle);
            setTimeout(function() {
                osSetSrc(OS_SRC.side);
                setTimeout(osWander, 1800 + Math.random() * 1200);
            }, 1500);
        }, 1500);
    }

    function osSitScared() {
        osMode = 'sit';
        pixelOshiro.style.transition = 'top 400ms ease';
        pixelOshiro.style.top = osGroundY() + 'px';
        osSetSrc(OS_SRC.idle_ground);
        setTimeout(function() {
            if (osMode === 'sit') {
                osMode = '';
                osSetSrc(OS_SRC.recover);
                setTimeout(osWander, 1500);
            }
        }, 9000);
    }

    // ===== 绊倒：fall.gif 上岗（走路途中小概率触发） =====
    function osTrip() {
        osMode = 'trip';
        osSetSrc(OS_SRC.fall);
        setTimeout(function() {
            osSetSrc(OS_SRC.idle_ground);
            var lines = ['呀…！失礼了失礼了……', '地、地板怎么突然……', '唔……被您看到丢脸的一面了。'];
            showOshiroDialog(lines[Math.floor(Math.random() * lines.length)], '惊讶');
            setTimeout(function() {
                osSetSrc(OS_SRC.recover);
                setTimeout(function() { osMode = ''; osWander(); }, 1600);
            }, 4200);
        }, 1300);
    }

    // ===== 成交庆祝：侧身得意姿态 =====
    function osCelebrate() {
        osMode = 'greet';
        osSetSrc(OS_SRC.side);
        setTimeout(function() { if (osMode === 'greet') osMode = ''; }, 3000);
    }

    // 召唤 Oshiro：由中间省略号按钮触发（原开场自动出现逻辑已改为点击触发）
    var osSummoned = false;
    function summonOshiro() {
        if (osSummoned) return;
        osSummoned = true;
        pixelOshiro.style.display = 'block';
        recalcRoomGeo();
        osPlaceInside();
        osSetSrc(OS_SRC.appear);
        setTimeout(function() { osWander(); }, 2200);
        setTimeout(function() {
            var welcome = '欢迎来到 Celeste 山庄！我是 Oshiro，这里的每一间房都留着故事呢～想聊点什么吗？';
            appendOchMsg('assistant', welcome);
            showOshiroDialog(welcome, '可爱');
        }, 2500);
    }

    // ===== 点击 / 双击（参照 pixelMadeline） =====
    var osClickTimer = null;
    pixelOshiro.addEventListener('click', function() {
        if (osClickTimer) return;
        osClickTimer = setTimeout(function() {
            osClickTimer = null;
            osMode = 'greet';
            osSetSrc(OS_SRC.side);
            var greetings = ['嗯？有什么需要帮忙的吗？', '啊，你好你好！随便看看～', '旅馆随时为你敞开大门！', '需要一间能看到雪景的房吗？'];
            showOshiroDialog(greetings[Math.floor(Math.random() * greetings.length)], '可爱');
            setTimeout(function() {
                if (osMode === 'greet') osMode = '';
            }, 2500);
        }, 260);
    });
    pixelOshiro.addEventListener('dblclick', function() {
        if (osClickTimer) { clearTimeout(osClickTimer); osClickTimer = null; }
        toggleOshiroChat();
    });

    // ===== 聊天历史框（消息列表交 Vue v-for，滚动/输入仍为 vanilla） =====
    var oshiroChatDialog = document.getElementById('oshiroChatDialog');
    var oshiroChatMessages = document.getElementById('oshiroChatMessages');
    const ochMessages = Vue.ref([]);
    Vue.createApp({
        setup() { return { ochMessages }; }
    }).mount('#oshiroChatMessages');
    document.getElementById('ochCloseBtn').addEventListener('click', function() {
        oshiroChatDialog.classList.remove('show');
    });
    function toggleOshiroChat() {
        oshiroChatDialog.classList.toggle('show');
        if (oshiroChatDialog.classList.contains('show')) {
            oshiroChatMessages.scrollTop = oshiroChatMessages.scrollHeight;
            document.getElementById('ochInput').focus();
        }
    }
    function appendOchMsg(role, text) {
        ochMessages.value.push({ role: role, text: text });
        Vue.nextTick(function () { oshiroChatMessages.scrollTop = oshiroChatMessages.scrollHeight; });
    }
    document.getElementById('ochSendBtn').addEventListener('click', function() {
        sendChat();
    });
    document.getElementById('ochInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') sendChat();
    });
    document.getElementById('ochInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') document.getElementById('ochSendBtn').click();
    });

    // ===== 商品逻辑 =====
    var SHOP_ITEMS = [
        { id: 'goldberry', name: '金草莓荣誉', icon: 'celeste-collectables/goldberry/idle00.png', price: 5, desc: '书架右上角点亮金草莓徽章。' },
        { id: 'crystalheart', name: '心之水晶', icon: 'celeste-icons/heartgem_outline.png', price: 10, desc: '山民们管这叫「炼金」——把最近的日记情绪投进坩埚，炼出一颗独一无二的水晶心。可以反复炼制，每一颗都会成为 Badeline 人格的一部分。' },
        { id: 'heartgem', name: '心之宝石', icon: 'celeste-icons/heartgem0.png', price: 15, desc: '山顶的终极成就。写满 100 篇，它会升满四色。' },
        { id: 'moonberry', name: '月亮莓', icon: 'celeste-collectables/moonberry/normal00.png', price: 30, desc: '山里藏得最深的传说收藏。拿到它，说明你写到了山顶。' }
    ];
    var SAY_BUY = ['太好了！这件收藏品终于找到主人了！', '眼光真好，旅馆的品味有保障～', '恭喜！我这就帮您包好，请收好。'];
    var SAY_POOR = ['草莓还差一些呢，再写几篇日记吧～', '别急，好东西值得多努力几步。'];

    // ===== 心之水晶：颜色 / 光晕 / AI 命名兜底 =====
    var CRYSTAL_PRICE = 10;
    var CRYSTAL_ICON = { blue: 'celeste-icons/heartgem0.png', red: 'celeste-icons/heartgem1.png', yellow: 'celeste-icons/heartgem2.png' };
    var CRYSTAL_GLOW = { blue: 'rgba(110,180,255,.8)', red: 'rgba(255,110,120,.8)', yellow: 'rgba(255,214,110,.85)' };
    var CRYSTAL_FALLBACK = {
        blue:   { color: 'blue',   title: '不知所谓的机器', desc: '山底的冰凉水声，替你把心事泡得很轻。' },
        red:    { color: 'red',    title: '不肯熄的心',     desc: '那些没说出口的火，烧着烧着就成了灯。' },
        yellow: { color: 'yellow', title: '甜得过分的心',   desc: '草莓攒出来的小太阳，专照阴天。' }
    };
    function getCrystal() { try { return JSON.parse(localStorage.getItem('crystalHeart') || '{}'); } catch (e) { return {}; } }
    // 已收集的心数组（heartDoorHearts 优先，兜底单心 crystalHeart）
    function getHearts() {
        try {
            var arr = JSON.parse(localStorage.getItem('heartDoorHearts') || 'null');
            if (Array.isArray(arr) && arr.length) return arr;
        } catch (e) {}
        var c = getCrystal();
        return (c && c.color) ? [c] : [];
    }
    function fxSound(name, volume) {
        if (!window.__audioGestured) return;
        try {
            var a = new Audio('celeste-sounds/' + name);
            a.volume = volume == null ? 0.8 : volume;
            a.play().catch(function () {});
        } catch (e) {}
    }

    function balance() { return berryBalance(); }
    function owned() {
        try { return JSON.parse(localStorage.getItem('berryOwned') || '[]'); } catch (e) { return []; }
    }
    function say(txt) { var el = document.getElementById('mSay'); if (el) el.textContent = '「' + txt + '」—— Oshiro'; }

    function render() {
        if (!document.getElementById('items')) return;
        var bal = balance(), own = owned(), ch = getCrystal();
        var hearts = getHearts();
        document.getElementById('balNum').textContent = bal;
        document.getElementById('items').innerHTML = SHOP_ITEMS.map(function(it) {
            var has = own.indexOf(it.id) >= 0;
            var iconTag = '<img src="' + it.icon + '" alt="" loading="lazy" decoding="async">';
            var descTxt = it.desc;
            var canBuy = !has && bal >= it.price;
            var itName = it.name;
            if (it.id === 'crystalheart') {
                canBuy = bal >= it.price; // 心可反复炼制（炼金）
                if (hearts.length) {
                    var color = ch.color || 'blue';
                    itName = it.name + ' ×' + hearts.length; // 商店显示炼心数量
                    iconTag = '<img src="' + (CRYSTAL_ICON[color] || CRYSTAL_ICON.blue) + '" alt="" loading="lazy" decoding="async" class="heart-loop" style="--hg-glow:' + (CRYSTAL_GLOW[color] || CRYSTAL_GLOW.blue) + '">';
                    descTxt = '「' + (ch.title || '心之水晶') + '」' + (ch.desc || '') + '<br>已炼 <b>' + hearts.length + '</b> 颗' + (hearts.length >= 4 ? '，心门已开' : '，集满 4 颗开启心门');
                }
            }
            var btn = has ? '✓ 已拥有' : ((it.id === 'crystalheart' && hearts.length) ? '再炼一颗？ · ' + it.price + ' 🍓' : it.price + ' 🍓');
            return '<div class="item' + (has && it.id !== 'crystalheart' ? ' owned' : '') + '">' +
                iconTag +
                '<div class="info"><div class="name">' + itName + '</div><div class="desc">' + descTxt + '</div></div>' +
                '<button class="buy" data-id="' + it.id + '"' + (canBuy ? '' : ' disabled') + '>' +
                btn + '</button></div>';
        }).join('');
        document.querySelectorAll('.buy').forEach(function(b) { b.addEventListener('click', function() { buy(b.dataset.id, b); }); });
    }
    function buy(id, btn) {
        var it = SHOP_ITEMS.find(function(x) { return x.id === id; });
        if (!it) return;
        if (id === 'crystalheart') { buyCrystal(btn); return; }
        var own = owned();
        if (own.indexOf(id) >= 0) return;
        if (balance() < it.price) {
            var poor = SAY_POOR[Math.floor(Math.random() * SAY_POOR.length)];
            say(poor);
            showOshiroDialog(poor, '不开心');
            return;
        }
        own.push(id);
        localStorage.setItem('berryOwned', JSON.stringify(own));
        spendBerries(it.price);
        var line = SAY_BUY[Math.floor(Math.random() * SAY_BUY.length)];
        say(line);
        osCelebrate();
        showOshiroDialog(line, '可爱');
        render();
    }
    render();
    // 草莓籽组合成草莓等场景下余额变化时，商店余额实时同步
    window.addEventListener('berries:change', render);
    // 进商店先拉后端权威余额（他端消费/获得后保持一致）
    if (typeof window.syncBerryBalance === 'function') syncBerryBalance();

    // ===== 心之水晶兑换：可反复炼制，每颗追加进 heartDoorHearts（Badeline 人格光谱） =====
    function buyCrystal(btn) {
        if (balance() < CRYSTAL_PRICE) {
            var poor = SAY_POOR[Math.floor(Math.random() * SAY_POOR.length)];
            say(poor);
            showOshiroDialog(poor, '不开心');
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '炼心中…'; }
        function finish(cr) {
            spendBerries(CRYSTAL_PRICE);
            var hearts = getHearts();
            hearts.push(cr);
            try { localStorage.setItem('heartDoorHearts', JSON.stringify(hearts)); } catch (e) {}
            localStorage.setItem('crystalHeart', JSON.stringify(cr)); // 兼容旧展示：同步最新一颗
            heartGetSequence(cr, hearts.length);
        }
        api('/diary/heart-crystal', 'GET', null, 12000).then(function(res) {
            if (res && res.success && res.data && res.data.color && CRYSTAL_ICON[res.data.color]) {
                finish({ color: res.data.color, title: res.data.title || CRYSTAL_FALLBACK[res.data.color].title, desc: res.data.desc || CRYSTAL_FALLBACK[res.data.color].desc });
            } else {
                finish(CRYSTAL_FALLBACK.blue); // 无情绪数据 → 正典蓝心
            }
        }).catch(function() {
            finish(CRYSTAL_FALLBACK.blue);
        });
    }

    // 获取仪式：暗场 → 放射光 → 心坠落定（破心音效+震屏+白闪）→ 命名牌 → 点击收下
    // 按心色选专属音效集（intro/loop/outro 三段式；黄心用 gold 目录）
    function heartSfxBase(color) {
        if (color === 'red') return 'crystalredheart/crystalheart_red_get_';
        if (color === 'yellow') return 'crystalgoldheart/crystalheart_gold_get_';
        return 'crystalblueheart/crystalheart_blue_get_';
    }

    // ===== 破心：像素心碎成 shard.png 碎片四散（噪声爆裂 + 水晶 ping） =====
    function hgCrackSound() {
        try {
            var ctx = window.__shopAC || (window.__shopAC = new (window.AudioContext || window.webkitAudioContext)());
            var dur = 0.4;
            var buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
            var d = buf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
            var src = ctx.createBufferSource();
            src.buffer = buf;
            var hp = ctx.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 2200;
            var g = ctx.createGain(); g.gain.value = 0.4;
            src.connect(hp); hp.connect(g); g.connect(ctx.destination);
            src.start();
            [3200, 2400].forEach(function(f, i) {
                var o = ctx.createOscillator(), og = ctx.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(f, ctx.currentTime);
                o.frequency.exponentialRampToValueAtTime(f * 0.55, ctx.currentTime + 0.25);
                og.gain.setValueAtTime(i ? 0.08 : 0.12, ctx.currentTime);
                og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                o.connect(og); og.connect(ctx.destination);
                o.start(); o.stop(ctx.currentTime + 0.32);
            });
        } catch (e) {}
    }

    // 从 (cx,cy) 爆出 14 片碎片，物理与心门破心同参数
    function hgBurst(cx, cy) {
        var layer = document.getElementById('hgShards');
        if (layer) layer.innerHTML = '';
        var pieces = [];
        for (var k = 0; k < 14; k++) {
            var size = 7 + Math.random() * 9;
            var p = document.createElement('img');
            p.src = 'heartdoor/shard.png';
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            var x0 = cx - size / 2, y0 = cy - size / 2;
            p.style.left = x0 + 'px';
            p.style.top = y0 + 'px';
            layer.appendChild(p);
            var ang = Math.random() * Math.PI * 2;
            var spd = 130 + Math.random() * 210;
            pieces.push({
                el: p, x: x0, y: y0, x0: x0, y0: y0,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 120,
                rot: Math.random() * 360,
                vr: (Math.random() * 2 - 1) * 720,
                life: 0, ttl: 0.65 + Math.random() * 0.25
            });
        }
        var last = performance.now();
        function tick(now) {
            var dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            var alive = false;
            pieces.forEach(function(p) {
                p.life += dt;
                if (p.life >= p.ttl) { p.el.style.opacity = '0'; return; }
                alive = true;
                p.vy += 950 * dt;
                p.vx *= Math.pow(0.92, dt * 60);
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.rot += p.vr * dt;
                var fade = p.life > p.ttl * 0.55
                    ? 1 - (p.life - p.ttl * 0.55) / (p.ttl * 0.45) : 1;
                p.el.style.opacity = String(fade);
                p.el.style.transform = 'translate(' + (p.x - p.x0) + 'px,' + (p.y - p.y0) + 'px) rotate(' + p.rot + 'deg)';
            });
            if (alive) requestAnimationFrame(tick);
            else setTimeout(function() { layer.innerHTML = ''; }, 200);
        }
        requestAnimationFrame(tick);
    }

    function heartGetSequence(cr, count) {
        var el = document.getElementById('heartGet');
        var im = document.getElementById('hgHeartImg');
        var fake = document.getElementById('hgFakeHeart');
        var glow = CRYSTAL_GLOW[cr.color] || CRYSTAL_GLOW.blue;
        im.src = CRYSTAL_ICON[cr.color] || CRYSTAL_ICON.blue;
        el.style.setProperty('--hg-glow', glow);
        document.getElementById('hgTitle').textContent = '· ' + (cr.title || '心之水晶') + ' ·' + (count > 1 ? '（第 ' + count + ' 颗）' : '');
        document.getElementById('hgDesc').textContent = cr.desc || '';
        // 重置破心状态
        fake.classList.remove('breaking', 'gone');
        var sh = document.getElementById('hgShards'); if (sh) sh.innerHTML = '';
        el.classList.remove('shake');
        el.classList.add('show');
        // 假心对齐真心落定位置（布局完成后读几何）
        requestAnimationFrame(function() {
            var r = im.getBoundingClientRect(), er = el.getBoundingClientRect();
            fake.style.left = (r.left - er.left + r.width / 2) + 'px';
            fake.style.top = (r.top - er.top + r.height / 2) + 'px';
            requestAnimationFrame(function() { el.classList.add('vis'); });
        });
        // 专属心音三段式：Intro 入场 → Loop 停留循环 → Outro 收下
        var sfx = heartSfxBase(cr.color);
        var introA = null, loopA = null;
        try {
            introA = new Audio('celeste-sounds/' + sfx + 'intro.wav');
            introA.volume = 0.85;
        } catch (e) {}
        // 假心跳动 ~0.8s → 鼓胀 0.2s → t=1s 爆裂（碎片+音效+震屏）
        setTimeout(function() { fake.classList.add('breaking'); }, 800);
        setTimeout(function() {
            var fr = fake.getBoundingClientRect(), e2 = el.getBoundingClientRect();
            var bx = fr.left - e2.left + fr.width / 2;
            var by = fr.top - e2.top + fr.height / 2;
            fake.classList.add('gone');
            hgBurst(bx, by);
            hgCrackSound();
        }, 1000);
        // 碎片散尽：t=1.95s 真心开始坠落，intro 同步响起
        setTimeout(function() {
            if (window.__audioGestured && introA) introA.play().catch(function() {});
        }, 1950);
        // t=2.8s 真心落定：wow + 震屏，loop 起，允许点击收下
        var canTake = false;
        setTimeout(function() {
            canTake = true;
            fxSound('wow_so_secret.wav', 0.9);
            el.classList.add('shake');
            setTimeout(function() { el.classList.remove('shake'); }, 400);
            try {
                loopA = new Audio('celeste-sounds/' + sfx + 'loop.wav');
                loopA.loop = true;
                loopA.volume = 0.3;
                if (window.__audioGestured) loopA.play().catch(function() {});
            } catch (e) {}
        }, 2800);
        el.onclick = function() {
            if (!el.classList.contains('vis') || !canTake) return;  // 破心/坠落阶段点击不响应
            try { if (introA) introA.pause(); if (loopA) loopA.pause(); } catch (e) {}
            fxSound(sfx + 'outro.wav', 0.85); // Outro：收下
            el.classList.remove('vis');
            setTimeout(function() {
                el.classList.remove('show');
                render();
                // 炼金彩蛋台词：首颗与再炼不同
                showOshiroDialog(count > 1
                    ? '又来炼金啦？这颗心的颜色……是你当时的样子哦，请收好。'
                    : '这颗心……是从你自己的日记里长出来的。请收好。', '可爱');
            }, 480);
        };
    }

    // 拥有后：预载三色心，商店页持续循环动画由 CSS heart-loop 承担
    (function preloadCrystals() {
        Object.keys(CRYSTAL_ICON).forEach(function(k) { var im = new Image(); im.src = CRYSTAL_ICON[k]; });
    })();

    // Outro：离开商店页时播放收尾音效
    document.querySelector('.topbar a').addEventListener('click', function(e) {
        if (!window.__audioGestured) return;
        e.preventDefault();
        fxSound('ui_main_postcard_csides_out.wav', 0.6);
        var href = e.currentTarget.href;
        setTimeout(function() { location.href = href; }, 240);
    });

    function mkFrames(prefix, n) { var a = []; for (var i = 0; i < n; i++) a.push(prefix + String(i).padStart(2, '0') + '.png'); return a; }
    function heartTier() {
        var c = parseInt(localStorage.getItem('diarySaveCount') || '0');
        return c >= 100 ? 3 : c >= 60 ? 2 : c >= 30 ? 1 : 0;
    }
    var ICON_FRAMES = {
        goldberry: mkFrames('celeste-collectables/goldberry/idle', 12),
        moonberry: mkFrames('celeste-collectables/moonberry/normal', 52),
        strawberry: mkFrames('celeste-collectables/strawberry/normal', 62)
    };
    Object.keys(ICON_FRAMES).forEach(function(k) { ICON_FRAMES[k].forEach(function(s) { var im = new Image(); im.src = s; }); });
    var shopFi = 0;
    setInterval(function() {
        document.querySelectorAll('.item').forEach(function(el, idx) {
            var it = SHOP_ITEMS[idx];
            var f = it && ICON_FRAMES[it.id];
            if (!f) return;
            el.querySelector('img').src = f[shopFi % f.length];
        });
        var hg = SHOP_ITEMS.findIndex(function(x) { return x.id === 'heartgem'; });
        if (hg >= 0) {
            var hel = document.querySelectorAll('.item')[hg];
            var tier = heartTier();
            if (hel) hel.querySelector('img').src = tier >= 3
                ? 'celeste-collectables/heartgem/3/FakeHeart' + String(shopFi % 33).padStart(4, '0') + '.png'
                : 'celeste-collectables/heartgem/' + tier + '/spin' + String(shopFi % 11).padStart(2, '0') + '.png';
        }
        var bal = document.querySelector('.balance img');
        if (bal) bal.src = ICON_FRAMES.strawberry[shopFi % ICON_FRAMES.strawberry.length];
        shopFi++;
    }, 90);
    if (!owned().length) say('欢迎光临 Celeste 山庄！我是 Oshiro，这里的每一件收藏品都值得细细品味～');

    // ===== Oshiro AI 聊天 =====
    var chatHistory = [];
    function sendChat() {
        var input = document.getElementById('ochInput');
        var btn = document.getElementById('ochSendBtn');
        if (!input) return;
        var msg = input.value.trim();
        if (!msg) return;
        chatHistory.push({role:'user', content:msg});
        appendOchMsg('user', msg);
        input.value = '';
        if (btn) btn.disabled = true;
        api('/diary/oshiro-chat', 'POST', {
            message: msg,
            history: JSON.stringify(chatHistory.slice(-6))
        }).then(function(res) {
            if (btn) btn.disabled = false;
            if (!res || !res.success) {
                var fallback = '啊……我好像没听清。能再说一遍吗？';
                chatHistory.push({role:'assistant', content:fallback});
                appendOchMsg('assistant', fallback);
                showOshiroDialog(fallback, '不安');
                return;
            }
            var reply = (typeof res.data === 'object' && res.data !== null) ? (res.data.message || '') : (res.data || '');
            var emotion = (typeof res.data === 'object' && res.data !== null) ? (res.data.emotion || '默认') : '默认';
            chatHistory.push({role:'assistant', content:reply});
            appendOchMsg('assistant', reply);
            showOshiroDialog(reply, emotion);
        }).catch(function() {
            if (btn) btn.disabled = false;
            var fallback = '诶？信号好像不太好……稍等一下？';
            appendOchMsg('assistant', fallback);
            showOshiroDialog(fallback, '不安');
        });
    }

    // ===== 煤球精灵：图层叠加 + 四处游逛 =====
    (function() {
        var DUST_DIR = 'celeste-gui/dustCreature/';
        var DUST_SCALE = 4; // 统一放大倍率（像素图整数倍才清晰）
        var sprite = document.getElementById('dustSprite');
        var inner = sprite.querySelector('.dust-inner');

        function addLayer(src) {
            var im = new Image();
            im.src = DUST_DIR + src;
            im.addEventListener('load', function() {
                im.style.width = im.naturalWidth * DUST_SCALE + 'px';
                im.style.height = im.naturalHeight * DUST_SCALE + 'px';
            });
            inner.appendChild(im);
            return im;
        }

        // 身体（3帧抖动）+ 质感层（3帧）+ 眼睛（3帧）
        var baseImgs = ['base00.png', 'base01.png', 'base02.png'].map(addLayer);
        var overlayImgs = ['overlay00.png', 'overlay01.png', 'overlay02.png'].map(addLayer);
        var eyeImgs = ['eyes00.png', 'eyes01.png', 'eyes02.png'].map(addLayer);
        var deadImg = addLayer('deadEyes.png');
        deadImg.style.display = 'none';

        // 容器尺寸跟 base 第 0 帧走
        baseImgs[0].addEventListener('load', function() {
            sprite.style.width = baseImgs[0].naturalWidth * DUST_SCALE + 'px';
            sprite.style.height = baseImgs[0].naturalHeight * DUST_SCALE + 'px';
        });

        function showFrame(list, idx) {
            list.forEach(function(im, i) { im.style.display = i === idx ? 'block' : 'none'; });
        }

        // 身体呼吸抖动
        var dustFi = 0;
        setInterval(function() {
            dustFi = (dustFi + 1) % 3;
            showFrame(baseImgs, dustFi);
            showFrame(overlayImgs, dustFi);
        }, 450);

        // 偶尔眨眼/瞟一眼
        setInterval(function() {
            if (dustBusy || Math.random() >= 0.35) return;
            var f = 1 + Math.floor(Math.random() * 2);
            showFrame(eyeImgs, f);
            setTimeout(function() { if (!dustBusy) showFrame(eyeImgs, 0); }, 280);
        }, 2200);

        // ===== 游逛 =====
        var dustBusy = false;
        function dustXY() {
            return { x: parseFloat(sprite.style.left || '140'), y: parseFloat(sprite.style.top || '320') };
        }
        function dustGroundY() {
            return Math.max(60, window.innerHeight - (sprite.offsetHeight || 64) - 10);
        }
        function dustPick() {
            var w = sprite.offsetWidth || 64;
            var maxX = Math.max(20, window.innerWidth - w - 12);
            var minY = 80, maxY = dustGroundY();
            if (Math.random() < 0.7) {
                // 大多数时候贴地小跑
                return { x: 12 + Math.random() * (maxX - 12), y: maxY - Math.random() * 30 };
            }
            return { x: 12 + Math.random() * (maxX - 12), y: minY + Math.random() * (maxY - minY) };
        }
        function dustWander() {
            if (dustBusy) { setTimeout(dustWander, 1200); return; }
            var cur = dustXY(), tgt = dustPick();
            var dist = Math.sqrt(Math.pow(tgt.x - cur.x, 2) + Math.pow(tgt.y - cur.y, 2));
            var dur = Math.max(900, Math.min(6000, dist * (9 + Math.random() * 6)));
            sprite.classList.add('moving');
            sprite.style.transform = tgt.x < cur.x ? 'scaleX(-1)' : '';
            sprite.style.transition = 'left ' + dur + 'ms linear, top ' + dur + 'ms linear';
            sprite.style.left = tgt.x + 'px';
            sprite.style.top = tgt.y + 'px';
            setTimeout(function() {
                sprite.classList.remove('moving');
                sprite.style.transform = '';
                var rest = Math.random() < 0.25 ? 1500 + Math.random() * 2000 : 300 + Math.random() * 900;
                setTimeout(dustWander, rest);
            }, dur + 80);
        }
        setTimeout(dustWander, 1500);

        // ===== 点击：压扁 + 晕倒眼 + 受惊蹦走 =====
        sprite.addEventListener('click', function() {
            if (dustBusy) return;
            dustBusy = true;
            sprite.classList.add('squish');
            showFrame(eyeImgs, -1);
            deadImg.style.display = 'block';
            setTimeout(function() {
                sprite.classList.remove('squish');
                deadImg.style.display = 'none';
                showFrame(eyeImgs, 0);
                var cur = dustXY();
                var w = sprite.offsetWidth || 64;
                var dir = Math.random() < 0.5 ? -1 : 1;
                var runX = Math.max(12, Math.min(window.innerWidth - w - 12, cur.x + dir * (120 + Math.random() * 160)));
                sprite.classList.add('moving');
                sprite.style.transform = runX < cur.x ? 'scaleX(-1)' : '';
                sprite.style.transition = 'left 500ms ease-out';
                sprite.style.left = runX + 'px';
                setTimeout(function() {
                    sprite.classList.remove('moving');
                    sprite.style.transform = '';
                    dustBusy = false;
                }, 520);
            }, 700);
        });
    })();
