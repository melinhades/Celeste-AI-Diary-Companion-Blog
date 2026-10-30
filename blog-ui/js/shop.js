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

    // ===== 心之水晶：AI 命名兜底 =====
    var CRYSTAL_FALLBACK = {
        blue:   { color: 'blue',   title: '不知所谓的机器', desc: '山底的冰凉水声，替你把心事泡得很轻。' },
        red:    { color: 'red',    title: '不肯熄的心',     desc: '那些没说出口的火，烧着烧着就成了灯。' },
        yellow: { color: 'yellow', title: '甜得过分的心',   desc: '草莓攒出来的小太阳，专照阴天。' }
    };
    function fxSound(name, volume) {
        if (!window.__audioGestured) return;
        try {
            var a = new Audio('celeste-sounds/' + name);
            a.volume = volume == null ? 0.8 : volume;
            a.play().catch(function () {});
        } catch (e) {}
    }

    // 获取仪式音效：按心色选专属集（intro/loop/outro 三段式；黄心用 gold 目录）
    function heartSfxBase(color) {
        if (color === 'red') return 'crystalredheart/crystalheart_red_get_';
        if (color === 'yellow') return 'crystalgoldheart/crystalheart_gold_get_';
        return 'crystalblueheart/crystalheart_blue_get_';
    }

    // ================================================================
    // ===== 水晶之心：Madeline 漫游 + 冲刺收集 =====
    // IL 取证（REA / 本地 Celeste.dll + Content/Graphics/Sprites*.xml）：
    //   Celeste.HeartGem.Awake —— sprite.Play("spin")；Collider = Hitbox(16,16,-8,-8)；
    //                        ScaleWiggler = Wiggler(0.5s, 4Hz) → Scale = 1 + 0.25*Value；
    //                        moveWiggler = Wiggler(0.8s, 2Hz, StartZero)；
    //                        bloom(0.75,16) + light(Lerp(Aqua|Red|Gold, White, .5), 1, 32, 64)；
    //                        IsFake：ghost 心 Color = White*0.8，bloom/light.Alpha = 0
    //   HeartGem.Update   —— sprite.Position = UnitY*sin(timer*2)*2 + moveWiggleDir*(-8)*moveWiggle.Value；
    //                        未收集时每 0.1s 发 1 粒 shine 粒子
    //   HeartGem.OnPlayer —— collected / level.Frozen 短路；DashAttacking → Collect；
    //                        否则 bounce 音 + PointBounce + moveWiggler/ScaleWiggler.Start()
    //   HeartGem.OnLoop("spin") —— pulse 音 + ScaleWiggler.Start() + Displacement.AddBurst(0.35,8,48,0.25)
    //   HeartGem.CollectRoutine —— 白心闪现 → Freeze(0.2) → TimeRate=0.5 + 10×AbsorbOrb + Shake(0.3)
    //                        + Flash(White) + FormationBackdrop(Display=1, Alpha=1) + 心 Visible=false
    //                        → 2s 内 TimeRate→0（rate 0.25/s raw）→ TimeRate=1、level.Frozen=true
    //                        → Poem 1s CubeOut 淡入 → 按键 → Ease.CubeIn(1-t) 0.5s 淡出（rate 2）
    //                        → player.Depth=0 → EndCutscene（FormationBackdrop.Display=false）
    //   Level.Flash       —— flash → Approach(1, dt*10) 后 Approach(0, dt*3)（0.33s 内衰减）
    //   FormationBackdrop —— fade = Approach(Display?1:0, RawDeltaTime*3)；Render = Black*fade*Alpha*0.85
    //   Celeste.FakeHeart —— Collect：Freeze(0.05) + Shake(0.3) + SlashFx.Burst(Position, Angle(player.Speed))
    //                        + player.RefillDash()；**无**音效 / 无碎片 / 无白闪；respawnTimer = 3s
    //   <DoFakeRoutineWithBird> —— 诗文本淡出（CubeIn(1-p), p += RawDeltaTime/0.2）后
    //                        Poem.Heart.Play("break")（GUI heartgem3 frames 11-32 @0.07），
    //                        每帧 Shake += DeltaTime（驱动心抖动/放大），Animating=false → poem.RemoveSelf()
    //   Celeste.AbsorbOrb —— consumeDelay=0.7+rand*0.3、burstSpeed=80+rand*40、burstDir=rand*2π；
    //                        飞散(burst→0 @120/s) → SimpleCurve(控制点=中点+垂线*len*(0.05+rand*0.45))
    //                        → 汇聚 percent→1 (rate RawDeltaTime/duration, duration=0.3+rand*0.25)，
    //                        位置=curve.GetPoint(CubeIn(percent))，Color=White*(1-eased)
    //   Sprites.xml        —— 世界心 heartgem0-3 / heartGemGhost / heartGemWhite:
    //                        spin = frames "0*10,1-13" delay 0.1（24 帧 / 2.4s）
    //   SpritesGui.xml     —— GUI 心 heartgem0-3: spin = "0*10,1-10" @0.08（20 帧 / 1.6s）；
    //                        heartgem3 额外有 break = frames "11-32" @0.07
    //                        （图集实测：26/28/30/32 为 240x240 空帧、25/27/29/31 与 25 同图
    //                          → 本项目只播 11-25 并补 0.35s 淡出，避免空帧闪烁）
    // ================================================================
    (function () {
        var canvas = document.getElementById('gameStage');
        if (!canvas || !window.CelesteCharacter) return;
        var ctx = canvas.getContext('2d');
        function resize() {
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            ctx.imageSmoothingEnabled = false;
        }
        window.addEventListener('resize', resize); resize();

        // ===== 世界坐标：1 单位 = 房间原生像素（320×200 空间），脚底 y=0 = 地板（0.803×200） =====
        var ROOM_W = 320;
        var FLOOR_NATIVE_Y = ROOM_FLOOR_NY * 200;               // 160.6
        var WALL_L = 0.104 * ROOM_W, WALL_R = ROOM_W;           // ROOM_POLY_N 左右边界
        var CEIL_Y = -(FLOOR_NATIVE_Y - 0.097 * 200);           // 屋顶最低处 → 引擎 y 上限
        var BODY_H = 30;
        var BLOCKS = [
            { x1: -1e4, x2: WALL_L, y1: -1e4, y2: 0 },
            { x1: WALL_R, x2: 1e4,  y1: -1e4, y2: 0 }
        ];
        function groundAt() { return 0; }
        function overlapsY(b, y) { return y > b.y1 + 1 && y - BODY_H < b.y2; }
        function wallNearAt(x, y, dir) {
            var best = null;
            for (var i = 0; i < BLOCKS.length; i++) {
                var b = BLOCKS[i];
                if (!overlapsY(b, y)) continue;
                var fx = dir > 0 ? b.x1 : b.x2;
                var d = (fx - x) * dir;
                if (d >= -1 && d <= 6 && (best === null || Math.abs(fx - x) < Math.abs(best - x))) best = fx;
            }
            return best;
        }
        function wallCollidesAt(edgeX, y, dir) {
            var best = null;
            for (var i = 0; i < BLOCKS.length; i++) {
                var b = BLOCKS[i];
                if (!overlapsY(b, y)) continue;
                if (dir > 0) { if (edgeX > b.x1 && edgeX <= b.x2 && (best === null || b.x1 < best)) best = b.x1; }
                else         { if (edgeX < b.x2 && edgeX >= b.x1 && (best === null || b.x2 > best)) best = b.x2; }
            }
            return best;
        }
        // 世界 → 屏幕（与 body 背景 center/cover 对齐，复用 nToXY）
        function toScreen(p) { return nToXY(p.x / ROOM_W, (FLOOR_NATIVE_Y + p.y) / 200); }
        function zoomNow() { return 8 * roomGeo.scale; }        // 每原生像素 → 屏幕像素

        // ===== 输入（聊天框/输入框聚焦时让位） =====
        var keys = {};
        var jumpEdge = false, dashEdge = false;
        function typingFocus() {
            var el = document.activeElement;
            return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
        }
        window.addEventListener('keydown', function (e) {
            if (typingFocus()) return;
            var k = e.key.toLowerCase();
            if (!keys[k]) { if (k === 'c') jumpEdge = true; if (k === 'x') dashEdge = true; }
            keys[k] = true;
            if (k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
        });
        window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
        window.addEventListener('blur', function () { keys = {}; });

        // ===== 素材加载 =====
        var HG_DIR = 'Atlases/Gameplay/collectables/heartGem';
        var COLOR_SUBDIR = { blue: '0', red: '1', yellow: '2' };   // IL: AreaMode 0=Aqua 1=Red 2=Gold
        // Sprites.xml spin: frames="0*10,1-13" delay=0.1
        var SPIN_SEQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        var SPIN_DELAY = 0.1;
        function pad2(i) { return String(i).padStart(2, '0'); }
        function loadImg(src) {
            return new Promise(function (res) {
                var im = new Image();
                im.onload = function () { res(im); };
                im.onerror = function () { res(null); };
                im.src = src;
            });
        }
        var heartFrames = { real: { blue: [], red: [], yellow: [] }, ghost: [] };
        var orbImg = null;
        Object.keys(COLOR_SUBDIR).forEach(function (c) {
            var dir = HG_DIR + '/' + COLOR_SUBDIR[c] + '/';
            for (var i = 0; i < 14; i++) (function (i, c) {
                heartFrames.real[c].push(null);
                loadImg(dir + pad2(i) + '.png').then(function (im) { heartFrames.real[c][i] = im; });
            })(i, c);
        });
        for (var gi = 0; gi < 14; gi++) (function (i) {
            heartFrames.ghost.push(null);
            loadImg(HG_DIR + '/ghost' + pad2(i) + '.png').then(function (im) { heartFrames.ghost[i] = im; });
        })(gi);
        loadImg(HG_DIR + '/orb.png').then(function (im) { orbImg = im; });

        // IL: CollectRoutine —— SpriteBank.Create("heartGemWhite")（20x20，spin 同 heartgem 序列）
        heartFrames.white = [];
        for (var wi = 0; wi < 14; wi++) (function (i) {
            heartFrames.white.push(null);
            loadImg(HG_DIR + '/white' + pad2(i) + '.png').then(function (im) { heartFrames.white[i] = im; });
        })(wi);

        // IL: SpritesGui.xml heartgem0-3：spin = "0*10,1-10" @0.08；heartgem3 另有 break = "11-32" @0.07
        var GUI_SPIN_SEQ = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        var GUI_FRAME_DELAY = 0.08;
        var GUI_BREAK_FROM = 11, GUI_BREAK_TO = 25, GUI_BREAK_DELAY = 0.07;
        // 取证：SpritesGui.xml 写的是 break = "11-32"，但 Gui 图集里 26/28/30/32 是空帧、
        //       25/27/29/31 与 25 完全同图（同一 md5）→ 直接播 11-32 会「碎裂图 / 空白」交替闪烁。
        //       故只播 11-25（15 帧 1.05s），再花 0.35s 把最后一片压扁淡出，总时长 1.4s ≈ 原版 21×0.07
        var GUI_BREAK_SEQ = (function () {
            var a = [];
            for (var i = GUI_BREAK_FROM; i <= GUI_BREAK_TO; i++) a.push(i);
            return a;
        })();
        var GUI_BREAK_HOLD = GUI_BREAK_SEQ.length * GUI_BREAK_DELAY;   // 1.05
        var GUI_BREAK_FADE = 0.35;
        var GUI_BREAK_TOTAL = GUI_BREAK_HOLD + GUI_BREAK_FADE;         // 1.4
        // IL: Poem —— GuiSpriteBank "heartgem"+mode：0/1/2 = spin00-10（240x240）；3 = FakeHeart0000-0032
        var GUI_HG = 'Atlases/Gui/collectables/heartgem';
        var GUI_HEART_FRAMES = { blue: [], red: [], yellow: [], fake: [] };
        Object.keys(COLOR_SUBDIR).forEach(function (c) {
            for (var i = 0; i < 11; i++) (function (c, i) {
                GUI_HEART_FRAMES[c].push(null);
                loadImg(GUI_HG + '/' + COLOR_SUBDIR[c] + '/spin' + pad2(i) + '.png')
                    .then(function (im) { GUI_HEART_FRAMES[c][i] = im; });
            })(c, i);
        });
        for (var fi = 0; fi < 33; fi++) (function (i) {
            GUI_HEART_FRAMES.fake.push(null);
            loadImg(GUI_HG + '/3/FakeHeart' + String(i).padStart(4, '0') + '.png')
                .then(function (im) { GUI_HEART_FRAMES.fake[i] = im; });
        })(fi);

        // IL: Poem.BeforeRender 粒子贴图 Atlas["snow"]（8x8）
        var snowImg = null;
        loadImg('Atlases/Gameplay/particles/snow.png').then(function (im) { snowImg = im; });

        // ===== 灰尘兔（Celeste.DustGraphic）· 第三章轨道运动 =====
        // 取证（§22.6）：DustGraphic 全库 4 个宿主 —— credits 的 DustyRoutine + 第三章三种 spinner：
        //   DustStaticSpinner  不位移；
        //   DustTrackSpinner   沿 Start→End 往返（Percent 由 dt/MoveTimes 推进，SineInOut 缓动，端点停顿）；
        //   DustRotateSpinner  绕 center 匀速圆周（1.8s/圈，眼睛朝切线）。
        // 商店页按“排列组合”随机拼装：每次刷新抽取 3~8 只 + 每只一条闭环轨道
        // （row 直线行 / orbit 圆周 / track 往返 / static 原地），参数（半径、周期、方向、相位、速度档）全部重掷。
        var DUST = window.CelesteDustBunny;
        var dustScene = null;
        // 探针：把世界坐标（原生像素，脚底 y=0）映射回房间轮廓，保证轨道不出墙。
        // 四角各内缩 7px = 16×16 贴图的半尺寸，因此判定位本身已含贴图不越界。
        // 轮廓直接在归一化坐标（ROOM_POLY_N）上判：nToXY 是同一个仿射变换，两域等价，
        // 且不依赖 roomGeo 快照 → 窗口缩放后判定依然成立。
        function makeDustProbe() {
            var npoly = ROOM_POLY_N.map(function (p) { return { x: p[0], y: p[1] }; });
            var hw = 7 / ROOM_W, hh = 7 / 200;                 // 贴图半宽 / 半高
            function inside(x, y) {
                if (x < WALL_L || x > WALL_R || y > 2 || y < CEIL_Y) return false;
                var nx = x / ROOM_W, ny = (FLOOR_NATIVE_Y + y) / 200;
                return pointInPoly(nx - hw, ny - hh, npoly) &&
                       pointInPoly(nx + hw, ny - hh, npoly) &&
                       pointInPoly(nx - hw, ny + hh, npoly) &&
                       pointInPoly(nx + hw, ny + hh, npoly);
            }
            return { minX: WALL_L, maxX: WALL_R, floorY: 0, ceilY: CEIL_Y, inside: inside };
        }
        if (DUST) DUST.load();


        // IL: SlashFx —— effects/slash/00-03，Sprite.Add("play","",0.1,4帧)
        var slashFrames = [];
        for (var sfi = 0; sfi < 4; sfi++) (function (i) {
            slashFrames.push(null);
            loadImg('Atlases/Gameplay/effects/slash/' + pad2(i) + '.png')
                .then(function (im) { slashFrames[i] = im; });
        })(sfi);

        // 颜色乘法近似：source-in 保留原 alpha，把贴图整体染成目标色
        function tintCopy(img, cssColor) {
            if (!img) return null;
            if (img.__tint && img.__tint[cssColor]) return img.__tint[cssColor];
            var c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            var g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = cssColor;
            g.fillRect(0, 0, c.width, c.height);
            img.__tint = img.__tint || {};
            img.__tint[cssColor] = c;
            return c;
        }

        // ===== 水晶之心实体 =====
        var HEART_POS = { x: 160, y: -20 };                     // 房间中部，心中心在玩家脚底上方 20px
        var heart = {
            mode: 'none',          // 'real'（已写日记，三色）| 'fake'（未写日记，ghost 帧）| 'none'（已收集）
            color: 'blue', title: '', desc: '',
            timer: 0, frameT: 0, frameI: 0,
            shineT: 0,
            bounceSfxDelay: 0,                         // IL: bounceSfxDelay = 0.1
            scaleWig: newWiggler(0.5, 4, false),       // IL: ScaleWiggler = Wiggler(0.5s, 4Hz)
            moveWig: newWiggler(0.8, 2, true),         // IL: moveWiggler = Wiggler(0.8s, 2Hz) + StartZero
            moveDir: { x: 0, y: -1 }                   // IL: moveWiggleDir
        };
        function todayStr() { return new Date().toDateString(); }
        // 颜色与文案：由后端 /diary/heart-crystal（LLM 按近 10 篇日记投票 + 生成标题/描述）
        function initHeart() {
            var wrote = localStorage.getItem('diaryLastSaveDate') === todayStr();
            if (!wrote) { heart.mode = 'fake'; return; }
            heart.mode = 'real';
            var count = localStorage.getItem('diarySaveCount') || '0';
            try {
                var cache = JSON.parse(localStorage.getItem('heartCrystalDay') || 'null');
                if (cache && cache.date === todayStr() && cache.count === count && COLOR_SUBDIR[cache.color]) {
                    heart.color = cache.color; heart.title = cache.title; heart.desc = cache.desc;
                }
            } catch (e) {}
            api('/diary/heart-crystal', 'GET', null, 12000).then(function (res) {
                var d = res && res.success && res.data;
                if (d && COLOR_SUBDIR[d.color]) {
                    heart.color = d.color;
                    heart.title = d.title || CRYSTAL_FALLBACK[d.color].title;
                    heart.desc = d.desc || CRYSTAL_FALLBACK[d.color].desc;
                    try {
                        localStorage.setItem('heartCrystalDay', JSON.stringify({
                            date: todayStr(), count: count, color: heart.color, title: heart.title, desc: heart.desc
                        }));
                    } catch (e) {}
                } else if (!heart.title) {
                    heart.title = CRYSTAL_FALLBACK[heart.color].title;
                    heart.desc = CRYSTAL_FALLBACK[heart.color].desc;
                }
            }).catch(function () {
                if (!heart.title) {
                    heart.title = CRYSTAL_FALLBACK[heart.color].title;
                    heart.desc = CRYSTAL_FALLBACK[heart.color].desc;
                }
            });
        }

        // ================================================================
        // ===== Poem（IL: Celeste.Poem —— 80 粒子 + GUI 240px 巨大心 + 中心文字） =====
        // colors = ["8cc7fa","ff668a","fffc24","ffffff"]（mode 0/1/2 = 蓝/红/黄，3 = fake）
        // Update: Percent += DeltaTime/Duration*ParticleSpeed（Duration = 0.5+rand*0.5），>1 重掷
        // BeforeRender: e=SineIn(Percent)；Position = Heart.Position + Direction*(1-e)*1920；
        //               Scale = (1+e*2, 0.25*(0.25+(1-e)*0.75))；贴图 snow（8x8）；
        //               Rotation = Angle(-Direction)；Color*(1-e)；
        //               然后 Heart.Position += Range(-1,1)*16*Shake；Heart.Scale = 1 + Shake*0.1
        // 淡入 1s Ease.CubeOut / 淡出 Ease.CubeIn(1-t)，t += RawDeltaTime*2（0.5s）
        // ================================================================
        var POEM_COLORS = { blue: '#8cc7fa', red: '#ff668a', yellow: '#fffc24', fake: '#ffffff' };
        function sineIn(t) { return 1 - Math.cos(t * Math.PI / 2); }        // IL: Ease.SineIn
        function cubeIn(t) { return t * t * t; }                            // IL: Ease.CubeIn
        function cubeOut(t) { return 1 - cubeIn(1 - t); }                   // IL: Ease.CubeOut
        function hexA(hex, a) {
            var n = parseInt(hex.slice(1), 16);
            return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
        }

        // IL: Poem.DrawPoem —— 文本两侧 poemside 64px 装饰
        var poemsideImg = null;
        loadImg('Atlases/Gui/poemside.png').then(function (im) { poemsideImg = im; });
        function poemsideFor(col) { return poemsideImg ? tintCopy(poemsideImg, col) : null; }

        var poem = null;
        var fxc = document.getElementById('hgFx');
        var fxctx = fxc ? fxc.getContext('2d') : null;
        var poemSharp = null, poemGlow = null;   // IL: poem RT / smoke RT（离屏）
        function resizeFx() {
            if (!fxc) return;
            fxc.width = window.innerWidth; fxc.height = window.innerHeight;
            fxctx.imageSmoothingEnabled = true;   // IL: GUI 层线性采样（240px 心）
        }
        if (fxc) { window.addEventListener('resize', resizeFx); resizeFx(); }

        function newPoemParticle() {
            var a = Math.random() * Math.PI * 2;
            return {
                dir: { x: Math.cos(a), y: Math.sin(a) },
                p: Math.random(),                                   // IL: Particle.Reset(NextFloat)
                dur: 0.5 + Math.random() * 0.5                      // IL: Duration = 0.5 + NextFloat()*0.5
            };
        }
        function openPoem(color, title, desc, flow) {
            var fake = color === 'fake';
            poem = {
                color: color, fake: fake, flow: flow || 'real',
                spinFrames: fake ? null : GUI_HEART_FRAMES[color],
                frameI: 0, frameT: 0, delay: GUI_FRAME_DELAY,
                anim: 'spin', animDone: false,
                tint: (color === 'yellow' && !fake) ? 0.6 : 1,   // IL: (AreaMode==2 && !fake) ? 0.6
                title: title || '', desc: desc || '',
                textAlpha: 1, particleSpeed: 1, shake: 0,        // IL: TextAlpha / ParticleSpeed / Shake
                breakT: 0, breakFade: 1,                         // 假心 break：帧计时 / 末段淡出
                particles: [],
                timer: 0,
                alpha: 0, t: 0, phase: 'in'
            };
            for (var i = 0; i < 80; i++) poem.particles.push(newPoemParticle());
        }
        // IL: Poem.Heart —— "heartgem"+mode，spin 为 Loop（0*10,1-10 @0.08）；fake 另有 break（11-32 @0.07）
        function poemHeartImg() {
            if (!poem) return null;
            if (poem.fake) {
                var idx = poem.anim === 'break' ? poem.frameI : GUI_SPIN_SEQ[poem.frameI];
                return GUI_HEART_FRAMES.fake[idx] || null;
            }
            return poem.spinFrames ? poem.spinFrames[GUI_SPIN_SEQ[poem.frameI]] : null;
        }
        function advancePoemHeart(rdt) {
            if (poem.anim === 'break') {                        // IL: Heart.Play("break")，FrameTimer 累加
                poem.breakT += rdt;
                var step = Math.floor(poem.breakT / GUI_BREAK_DELAY);
                if (step > GUI_BREAK_SEQ.length - 1) step = GUI_BREAK_SEQ.length - 1;
                poem.frameI = GUI_BREAK_SEQ[step];
                poem.breakFade = poem.breakT <= GUI_BREAK_HOLD ? 1
                    : Math.max(0, 1 - (poem.breakT - GUI_BREAK_HOLD) / GUI_BREAK_FADE);
                if (poem.breakT >= GUI_BREAK_TOTAL) poem.animDone = true;   // IL: !Heart.Animating
                return;
            }
            poem.frameT += rdt;
            while (poem.frameT >= poem.delay) {
                poem.frameT -= poem.delay;
                poem.frameI = (poem.frameI + 1) % GUI_SPIN_SEQ.length;
            }
        }
        function closePoem() {
            poem = null;
            if (poemEl) { poemEl.classList.remove('show'); poemEl.style.opacity = '0'; }
            if (poemTip) poemTip.style.visibility = '';
        }
        function updatePoem(rdt) {
            if (!poem) { if (poemEl) poemEl.style.opacity = '0'; return; }
            poem.timer += rdt;                                   // IL: timer += Engine.DeltaTime（MagicGlow 用）
            advancePoemHeart(rdt);
            for (var i = 0; i < poem.particles.length; i++) {
                var p = poem.particles[i];
                p.p += rdt / p.dur * poem.particleSpeed;          // IL: Percent += dt/Duration*ParticleSpeed
                if (p.p > 1) { var np = newPoemParticle(); np.p = 0; poem.particles[i] = np; }
            }
            if (poem.flow === 'fake') {                           // 假心演出由 tickRitual 驱动
                if (poemEl) poemEl.style.opacity = poem.alpha.toFixed(3);
                return;
            }
            if (poem.phase === 'in') {
                poem.t += rdt;
                poem.alpha = poem.t >= 1 ? 1 : cubeOut(poem.t);   // IL: poem.Alpha = Ease.CubeOut(t)，1s
                if (poem.t >= 1) poem.phase = 'hold';
            } else if (poem.phase === 'out') {
                poem.t += rdt * 2;                              // IL: t += RawDeltaTime*2 → 0.5s
                poem.alpha = poem.t >= 1 ? 0 : cubeIn(1 - poem.t);  // IL: Ease.CubeIn(1-t)
                if (poem.t >= 1) { closePoem(); return; }
            }
            if (poemEl) poemEl.style.opacity = poem.alpha.toFixed(3);
        }

        // IL: Poem.DrawPoem(Offset, color) —— 整块文本居中于 (960,540)+Offset；
        // 两侧 poemside 中心 ±(w/2+64)（w = 文本宽度）；四份 Black 副本偏移恒为 ±2（非缩放）；颜色 * TextAlpha
        function drawPoemText(ctx, cx, cy, g, color, dx, dy) {
            var title = poem.title || '', desc = poem.desc || '';
            var ts = Math.max(12, Math.round(84 * g));
            var ds = Math.max(9, Math.round(34 * g));
            var family = "'CelesteZH','Renogare','Microsoft YaHei',sans-serif";
            ctx.save();
            ctx.translate(dx, dy);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            // 描述折行（IL: PixelFontSize.AutoNewline(text, 1024)）
            var descLines = [], maxW = 1024 * g, cur = '';
            if (desc) {
                ctx.font = ds + 'px ' + family;
                for (var i = 0; i < desc.length; i++) {
                    var next = cur + desc[i];
                    if (ctx.measureText(next).width > maxW && cur) { descLines.push(cur); cur = desc[i]; }
                    else cur = next;
                }
                if (cur) descLines.push(cur);
            }
            ctx.font = ts + 'px ' + family;
            var w = ctx.measureText(title).width;
            ctx.font = ds + 'px ' + family;
            for (var k = 0; k < descLines.length; k++) w = Math.max(w, ctx.measureText(descLines[k]).width);
            var tLH = ts * 1.15, dLH = ds * 1.5, gap = descLines.length ? ts * 0.18 : 0;
            var totalH = tLH + (descLines.length ? gap + dLH * descLines.length : 0);
            var top = cy - totalH / 2;
            ctx.font = ts + 'px ' + family;
            ctx.fillText(title, cx, top + tLH / 2);
            if (descLines.length) {
                ctx.font = ds + 'px ' + family;
                for (var k2 = 0; k2 < descLines.length; k2++) {
                    ctx.fillText(descLines[k2], cx, top + tLH + gap + dLH * (k2 + 0.5));
                }
            }
            var side = poemsideFor(color);
            if (side) {
                var ss = 64 * g;
                ctx.drawImage(side, cx - (w / 2 + 64 * g) - ss / 2, cy - ss / 2, ss, ss);
                ctx.drawImage(side, cx + (w / 2 + 64 * g) - ss / 2, cy - ss / 2, ss, ss);
            }
            ctx.restore();
        }

        // 缺口：原作 smoke 层由 Effects 里的 MagicGlow 着色器（编译产物、无源）生成放射光晕，
        // 此处用「同色 radial 柔光 + 对 poem RT 强高斯模糊」近似（等效 shader 的 alpha 0.5 / noiseDistort）
        function drawPoemGlow(ctx, cx, cy, g, col) {
            var R = 520 * g;
            var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
            bg.addColorStop(0, hexA(col, 0.5));
            bg.addColorStop(0.45, hexA(col, 0.18));
            bg.addColorStop(1, hexA(col, 0));
            ctx.fillStyle = bg;
            ctx.fillRect(ctx.canvas.width * -0.1, ctx.canvas.height * -0.1, ctx.canvas.width * 1.2, ctx.canvas.height * 1.2);
        }

        function poemLayer(el, w, h) {
            if (!el) el = document.createElement('canvas');
            if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
            return el;
        }

        function drawPoem() {
            if (!fxctx || !poem) return;
            var W = fxc.width, H = fxc.height;
            fxctx.clearRect(0, 0, W, H);
            var g = Math.min(W / 1920, H / 1080);
            var cx = W / 2, cy = H / 2;
            var col = POEM_COLORS[poem.color] || POEM_COLORS.blue;

            // —— poem RT：透明底，粒子 → 心 → 文字/装饰（IL: BeforeRender）——
            poemSharp = poemLayer(poemSharp, W, H);
            var p = poemSharp.getContext('2d');
            p.clearRect(0, 0, W, H);
            p.imageSmoothingEnabled = true;
            var snow = tintCopy(snowImg, col);
            if (snow) {
                for (var i = 0; i < poem.particles.length; i++) {
                    var pt = poem.particles[i];
                    var e = sineIn(pt.p);
                    var px = cx + pt.dir.x * (1 - e) * 1920 * g;     // IL: Heart.Position + Direction*(1-e)*1920
                    var py = cy + pt.dir.y * (1 - e) * 1920 * g;
                    var sx = 1 + e * 2;                               // IL: Scale.X = 1 + e*2
                    var sy = 0.25 * (0.25 + (1 - e) * 0.75);          // IL: Scale.Y（非等比压扁）
                    p.save();
                    p.translate(px, py);
                    p.rotate(Math.atan2(-pt.dir.y, -pt.dir.x));       // IL: Rotation = Angle(-Direction)
                    p.globalAlpha = Math.max(0, 1 - e);               // IL: Color = Poem.Color * (1-e)
                    p.scale(sx, sy);
                    p.drawImage(snow, -4, -4, 8, 8);
                    p.restore();
                }
                p.globalAlpha = 1;
            }
            var img = poemHeartImg();
            if (img) {
                // IL: Heart.Position += Range(-1,1)*16*Shake；Heart.Scale = One*(1 + Shake*0.1)
                var jx = (Math.random() * 2 - 1) * 16 * poem.shake;
                var jy = (Math.random() * 2 - 1) * 16 * poem.shake;
                // 图集在 25 帧后没有更强的分离帧（26/28/30/32 是空帧）→ 末段淡出时把整张
                // 再放大 55%，让三片碎裂「向外炸开」而不是原地消失
                var burst = poem.anim === 'break' ? 1 + (1 - poem.breakFade) * 0.55 : 1;
                var hs = img.width * g * (1 + poem.shake * 0.1) * burst;   // GUI 240px
                p.globalAlpha = poem.tint * poem.breakFade;           // IL: Heart.Color = White * tint
                p.drawImage(img, cx - hs / 2 + jx, cy - hs / 2 + jy, hs, hs);
                p.globalAlpha = 1;
            }
            if (poem.textAlpha > 0) {
                var off = 2 * g;                                      // IL: 四份 Black 副本偏移恒为 ±2
                p.globalAlpha = poem.textAlpha;
                drawPoemText(p, cx, cy, g, '#000000', -off, 0);
                drawPoemText(p, cx, cy, g, '#000000', off, 0);
                drawPoemText(p, cx, cy, g, '#000000', 0, -off);
                drawPoemText(p, cx, cy, g, '#000000', 0, off);
                drawPoemText(p, cx, cy, g, col, 0, 0);
                p.globalAlpha = 1;
            }

            // —— smoke RT：半分辨率（IL: 960x540），MagicGlow + GaussianBlur ——
            var hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2));
            poemGlow = poemLayer(poemGlow, hw, hh);
            var q = poemGlow.getContext('2d');
            q.clearRect(0, 0, hw, hh);
            q.imageSmoothingEnabled = true;
            drawPoemGlow(q, hw / 2, hh / 2, g * 0.5, col);
            q.filter = 'blur(' + Math.max(2, 6 * g) + 'px)';
            q.drawImage(poemSharp, 0, 0, hw, hh);
            q.filter = 'none';

            // —— IL: Render —— smoke（White*0.3）→ poem（整体透明度由 #heartGet 的 opacity 承担）——
            fxctx.globalAlpha = 0.3;
            fxctx.drawImage(poemGlow, 0, 0, W, H);
            fxctx.globalAlpha = 1;
            fxctx.drawImage(poemSharp, 0, 0);
        }

        // ===== 仪式状态 =====
        var ritual = null;         // { kind:'real'|'fake', phase, t, orbs, introA, loopA }
        var freezeT = 0;           // IL: Celeste.Freeze(t) —— 场景全停（raw 计时）
        var timeRate = 1;          // IL: Engine.TimeRate
        var frozen = false;        // IL: level.Frozen —— 引擎停走，orb（FrozenUpdate）继续
        var shakeT = 0, flashA = 0, glitchT = 0;
        // IL: FormationBackdrop —— fade = Approach(Display ? 1 : 0, RawDeltaTime*3)；Render 铺满 camera 的 85% 黑幕。
        // 原作是 level 级组件（只压暗房间）；本项目房间 + 商店 UI 同屏 → 用独立黑幕层（z-index 1900，低于 #heartGet）
        var backdropFade = 0, backdropTarget = 0, veilA = -1;
        var veil = document.createElement('div');
        veil.id = 'hgVeil';
        veil.style.cssText = 'position:fixed;inset:0;z-index:1900;background:#000;opacity:0;pointer-events:none;';
        document.body.appendChild(veil);
        function syncVeil() {
            if (Math.abs(backdropFade - veilA) < 0.002) return;
            veilA = backdropFade;
            veil.style.opacity = (0.85 * backdropFade).toFixed(3);
        }
        var shines = [], slashes = [], orbs = [];

        function approach(v, target, step) {
            return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
        }
        function yoyo(t) { return t < 0.5 ? t * 2 : (1 - t) * 2; }

        // IL: Monocle.Wiggler —— Value = cos(sineCounter) * Counter，Counter 从 1 线性递减到 0；
        //     StartZero 时 sineCounter 从 π/2 起（Value 由 0 起步），否则从 0 起（Value 由 1 起步）
        function newWiggler(dur, freq, startZero) {
            return {
                inc: 1 / dur, add: Math.PI * 2 * freq, startZero: !!startZero,
                counter: 1, sine: 0, value: 0, active: false
            };
        }
        function wigStart(w) {
            w.counter = 1;
            w.sine = w.startZero ? Math.PI / 2 : 0;
            w.value = w.startZero ? 0 : 1;
            w.active = true;
        }
        function wigUpdate(w, dt) {
            if (!w.active) return;
            w.sine += w.add * dt;
            w.counter -= w.inc * dt;
            if (w.counter <= 0) { w.counter = 0; w.active = false; }
            w.value = Math.cos(w.sine) * w.counter;
        }

        // ===== AbsorbOrb（IL 三阶段移植；原作的"目标死亡飞散"分支本项目不可达，省略） =====
        function newOrb(ox, oy) {
            return {
                x: ox == null ? HEART_POS.x : ox, y: oy == null ? HEART_POS.y : oy,
                alpha: 1,
                consumeDelay: 0.7 + Math.random() * 0.3,
                burstSpeed: 80 + Math.random() * 40,
                burstDir: Math.random() * Math.PI * 2,
                percent: 0, duration: 0, curve: null,
                rot: 0, sx: 1, sy: 1, dead: false
            };
        }
        function bezPoint(c, t) {
            var u = 1 - t;
            return {
                x: u * u * c.sx0 + 2 * u * t * c.cx + t * t * c.ex,
                y: u * u * c.sy0 + 2 * u * t * c.cy + t * t * c.ey
            };
        }
        function bezLen10(c) {   // IL: curve.GetLengthParametric(10)
            var len = 0, prev = bezPoint(c, 0);
            for (var i = 1; i <= 10; i++) {
                var p = bezPoint(c, i / 10);
                len += Math.sqrt((p.x - prev.x) * (p.x - prev.x) + (p.y - prev.y) * (p.y - prev.y));
                prev = p;
            }
            return len;
        }
        function orbScale(v) {   // IL: (Min(2, 0.5+v*0.02), Max(0.05, 0.5-v*0.004))
            return { x: Math.min(2, 0.5 + v * 0.02), y: Math.max(0.05, 0.5 - v * 0.004) };
        }
        function updateOrb(o, rdt) {
            var tx = madeline.x, ty = madeline.y - 15;          // IL: AbsorbInto.Center
            if (o.consumeDelay > 0) {
                o.x += Math.cos(o.burstDir) * o.burstSpeed * rdt;
                o.y += Math.sin(o.burstDir) * o.burstSpeed * rdt;
                o.burstSpeed = approach(o.burstSpeed, 0, rdt * 120);
                o.rot = o.burstDir;
                var s = orbScale(o.burstSpeed); o.sx = s.x; o.sy = s.y;
                o.consumeDelay -= rdt;
                if (o.consumeDelay <= 0) {
                    // IL: SimpleCurve(start, end, mid + perp*|Δ|*(0.05+rand*0.45))，duration=0.3+rand*0.25
                    var dx = tx - o.x, dy = ty - o.y;
                    var len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
                    var off = len * (0.05 + Math.random() * 0.45) * (Math.random() < 0.5 ? -1 : 1);
                    o.curve = {
                        sx0: o.x, sy0: o.y, ex: tx, ey: ty,
                        cx: (o.x + tx) / 2 - dy / len * off,
                        cy: (o.y + ty) / 2 + dx / len * off
                    };
                    o.duration = 0.3 + Math.random() * 0.25;
                }
            } else {
                o.curve.ex = tx; o.curve.ey = ty;               // IL: curve.End 持续追踪目标
                o.percent = approach(o.percent, 1, rdt / o.duration);
                var e = cubeIn(o.percent);
                var q = bezPoint(o.curve, e);
                o.x = q.x; o.y = q.y;
                var v = yoyo(e) * bezLen10(o.curve);
                var s2 = orbScale(v); o.sx = s2.x; o.sy = s2.y;
                var q2 = bezPoint(o.curve, cubeIn(Math.min(1, o.percent + 0.01)));
                o.rot = Math.atan2(q2.y - o.y, q2.x - o.x);
                o.alpha = 1 - e;                                // IL: Color = White * (1 - eased)
                if (o.percent >= 1) o.dead = true;
            }
        }

        // ===== SlashFx（IL: Celeste.SlashFx.Burst —— 单条 sprite，4 帧 × 0.1s，OnFinish = RemoveSelf） =====
        // IL: Position = position；Direction = AngleToVector(direction)；Sprite.Play("play",1,0)；
        //     Rotation = (|direction-π| > 0.01) ? direction : 0；每帧 Position += Direction*8*dt
        function slashBurst(wx, wy, angle) {
            slashes.push({
                x: wx, y: wy, dx: Math.cos(angle), dy: Math.sin(angle),
                rot: Math.abs(angle - Math.PI) > 0.01 ? angle : 0,
                frame: 0, t: 0, ttl: 0.4
            });
        }

        // ===== 假心 bounce 音（REA: event:/new_content/game/10_farewell/fakeheart_bounce
        //   + event:/game/general/crystalheart_bounce —— FMOD 内部循环 16 个 sample，
        //   本地素材 fakeHeart/game_10_fakeheart_bounce_01.wav ~ bounce_16.wav） =====
        var FAKE_BOUNCE_COUNT = 16;
        function bouncePing() {
            if (!window.__audioGestured) return;
            // 随机选一个 bounce 文件（FMOD event 内部随机选 sample）
            var idx = (Math.random() * FAKE_BOUNCE_COUNT | 0) + 1;
            var name = 'fakeHeart/game_10_fakeheart_bounce_' + String(idx).padStart(2, '0') + '.wav';
            fxSound(name, 0.55);
        }

        // IL: HeartGem.Collider = Hitbox(16, 16, -8, -8)（中心对齐）；玩家沿用项目 BODY_H
        function heartHit(m) {
            return m.x + 4 > HEART_POS.x - 8 && m.x - 4 < HEART_POS.x + 8 &&
                   m.y > HEART_POS.y - 8 && m.y - BODY_H < HEART_POS.y + 8;
        }
        // IL: Player.PointBounce(from) —— v = SafeNormalize(Center - from)；Y∈(-0.2, 0.4] → -0.2；
        //     Speed = v*220；Speed.X *= 1.5；|X| < 100 → (X == 0 ? -Facing*100 : Sign(X)*100)；
        //     RefillDash() + RefillStamina()（本项目无体力系统）
        function pointBounce(m) {
            var dx = m.x - HEART_POS.x, dy = (m.y - BODY_H / 2) - HEART_POS.y;
            var len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            var nx = dx / len, ny = dy / len;
            if (ny > -0.2 && ny <= 0.4) ny = -0.2;
            m.vx = nx * 220 * 1.5;
            m.vy = ny * 220;
            if (Math.abs(m.vx) < 100) m.vx = (m.vx === 0 ? -m.facing : (m.vx > 0 ? 1 : -1)) * 100;
            refillDashOf(m);
        }
        // IL: HeartGem.Awake —— bloom(0.75, 16) + light(Lerp(色, White, .5), 1, 32, 64)；fake 时 light.Alpha = 0
        // 缺口：原作走 Bloom 相机通道（着色器无源）→ 此处用同色 radial 柔光近似
        var HEART_GLOW = { blue: '#7fffff', red: '#ff7f7f', yellow: '#ffeb7f' };
        function drawHeartGlow(c, sx, sy, Z2, col) {
            var R = 34 * Z2;
            var bg = c.createRadialGradient(sx, sy, 0, sx, sy, R);
            bg.addColorStop(0, hexA(col, 0.42));
            bg.addColorStop(0.4, hexA(col, 0.12));
            bg.addColorStop(1, hexA(col, 0));
            c.fillStyle = bg;
            c.beginPath(); c.arc(sx, sy, R, 0, Math.PI * 2); c.fill();
        }

        // ===== 诗文本 overlay（IL: Poem —— 心/粒子/文字/装饰全部由 #hgFx 画布绘制，透明底露出场景） =====
        var poemEl = document.getElementById('heartGet');
        var poemTip = poemEl ? poemEl.querySelector('.hg-poem-tip') : null;
        function showPoem(clickable) {
            poemEl.style.opacity = '0';
            poemEl.classList.add('show');
            if (poemTip) poemTip.style.visibility = clickable === false ? 'hidden' : '';
            resizeFx();
        }
        poemEl.addEventListener('click', function () {
            if (!ritual || ritual.kind !== 'real' || ritual.phase !== 'poem') return;
            if (!poem || poem.phase !== 'hold') return;           // 淡入完成前不可跳过
            endRealRitual();
        });

        // ===== 真心收集仪式（IL: HeartGem.CollectRoutine 时间轴） =====
        function startRealRitual() {
            ritual = { kind: 'real', phase: 'freeze', t: 0, introA: null, loopA: null };
            freezeT = 0.2;                                        // IL: Celeste.Freeze(0.2)
        }
        function realAfterFreeze() {
            ritual.phase = 'slow'; ritual.t = 0;
            timeRate = 0.5;                                       // IL: Engine.TimeRate = 0.5
            for (var i = 0; i < 10; i++) orbs.push(newOrb());   // IL: 10 × AbsorbOrb(Position)
            shakeT = 0.3;                                         // IL: level.Shake(0.3)
            flashA = 1;                                           // IL: level.Flash(White, drawPlayer:false)
            backdropTarget = 1;                                   // IL: FormationBackdrop.Display=true; Alpha=1
            heart.mode = 'none';                                  // IL: Visible = false（连白心一起隐去）
            if (window.__audioGestured) {
                try {
                    ritual.introA = new Audio('celeste-sounds/' + heartSfxBase(heart.color) + 'intro.wav');
                    ritual.introA.volume = 0.85;
                    ritual.introA.play().catch(function () {});
                } catch (e) {}
            }
        }
        function realPoemPhase() {
            ritual.phase = 'poem';
            timeRate = 1; frozen = true;                          // IL: TimeRate=1; level.Frozen = true
            if (window.__audioGestured && window.GaplessAudio) {
                try {
                    // 心之仪式的 loop 在音频渲染线程内回绕，节点之间不再有 element 起播的卡顿
                    ritual.loopA = window.GaplessAudio.loop('celeste-sounds/' + heartSfxBase(heart.color) + 'loop.wav', { volume: 0.3 });
                    var lp = ritual.loopA.start(); if (lp && lp.catch) lp.catch(function () {});
                } catch (e) {}
            }
            showPoem(true);
            openPoem(heart.color, heart.title, heart.desc, 'real');   // IL: new Poem(text, mode, tint)
        }
        function endRealRitual() {
            try { if (ritual.introA) ritual.introA.pause(); if (ritual.loopA) ritual.loopA.stop(0.08); } catch (e) {}
            fxSound(heartSfxBase(heart.color) + 'outro.wav', 0.85);   // IL: sfx.Param("end", 1)
            backdropTarget = 0;                                       // IL: FormationBackdrop.Display = false
            if (ritual) ritual.phase = 'poemout';
            if (poem) { poem.phase = 'out'; poem.t = 0; }             // IL: CubeIn(1-t)，t += RawDeltaTime*2
        }

        // ===== 假心（第九章 emptyheart）：IL Celeste.FakeHeart.Collect + <DoFakeRoutineWithBird> =====
        // REA 取证：
        //   FakeHeart.Collect —— Freeze(0.05) + Shake(0.3) + SlashFx.Burst(Position, Angle)
        //                        + player.RefillDash()；Visible=false；respawnTimer=3s
        //   DoFakeRoutineWithBird —— 诗文本淡出 → Poem.Heart.Play("break") → 破心动画
        //                        → 10×AbsorbOrb + Shake(0.3) + Glitch(0.8 @4/s)
        //   SkipFakeHeartCutscene —— sfx.Play("intermission_heartgroove") → Param("end", 0)
        //                        （FMOD event 内部 intro→loop，结束时 Param("end", 1) 触发 outro）
        //   本地素材：fakeHeart/game_10_fakeheart_get_intro_*.wav（9 个版本随机选）
        //          + fakeHeart/game_10_fakeheart_get_loop.wav（GaplessAudio 循环）
        //          + fakeHeart/game_10_fakeheart_get_outro.wav（结束）
        var FAKE_HEART_GET_INTROS = [
            'fakeHeart/game_10_fakeheart_get_intro_1st.wav',
            'fakeHeart/game_10_fakeheart_get_intro_birb.wav',
            'fakeHeart/game_10_fakeheart_get_intro_covert.wav',
            'fakeHeart/game_10_fakeheart_get_intro_laugher.wav',
            'fakeHeart/game_10_fakeheart_get_intro_mountain.wav',
            'fakeHeart/game_10_fakeheart_get_intro_tasbot.wav',
            'fakeHeart/game_10_fakeheart_get_intro_team_01.wav',
            'fakeHeart/game_10_fakeheart_get_intro_team_02.wav',
            'fakeHeart/game_10_fakeheart_get_intro_team_03.wav',
            'fakeHeart/game_10_fakeheart_get_intro_team_04.wav'
        ];
        function startFakeRitual() {
            var ang = Math.atan2(madeline.vy, madeline.vx);        // IL: Calc.Angle(player.Speed)
            freezeT = 0.05;                                       // IL: Celeste.Freeze(0.05)
            shakeT = 0.3;                                         // IL: level.Shake(0.3)
            slashBurst(HEART_POS.x, HEART_POS.y, ang);            // IL: SlashFx.Burst(Position, angle)
            refillDashOf(madeline);                               // IL: player.RefillDash()
            heart.mode = 'none';
            frozen = true;                                        // IL: level.Frozen = true（Poem 走 FrozenUpdate）
            // 三段式音效：intro（随机选一个） → loop → outro
            var fakeIntroName = FAKE_HEART_GET_INTROS[Math.random() * FAKE_HEART_GET_INTROS.length | 0];
            var fakeIntroA = null;
            if (window.__audioGestured) {
                try {
                    fakeIntroA = new Audio('celeste-sounds/' + fakeIntroName);
                    fakeIntroA.volume = 0.85;
                    fakeIntroA.play().catch(function () {});
                } catch (e) {}
            }
            ritual = { kind: 'fake', phase: 'fadein', t: 0, introA: fakeIntroA, loopA: null };
            backdropTarget = 1;                                   // IL: FormationBackdrop.Display = true
            showPoem(false);
            openPoem('fake', '', '', 'fake');
        }

        function tickRitual(rdt) {
            if (ritual.kind === 'real') {
                if (ritual.phase === 'freeze') {
                    if (freezeT <= 0) realAfterFreeze();
                } else if (ritual.phase === 'slow') {
                    ritual.t += rdt;
                    timeRate = approach(timeRate, 0, rdt * 0.25); // IL: 2s 内 TimeRate→0
                    if (ritual.t >= 2) realPoemPhase();
                } else if (ritual.phase === 'poemout') {
                    if (!poem) { frozen = false; ritual = null; }  // 淡出结束 → 解除 Frozen
                }
            } else if (ritual.kind === 'fake') {
                // IL 时序：心淡入 → 停留 → 文本 0.2s CubeIn(1-p) 淡出（同时 FormationBackdrop.Display=false）
                //         → Heart.Play("break")（11-25 @0.07 + 0.35s 淡出）→ !Animating → poem.RemoveSelf()
                //         → 10×AbsorbOrb → Shake(0.3) → Glitch.Value=0.8（4/s 衰减）→ 0.25s
                if (ritual.phase === 'fadein') {
                    ritual.t += rdt;
                    if (poem) poem.alpha = ritual.t >= 0.5 ? 1 : cubeOut(ritual.t / 0.5);
                    if (ritual.t >= 0.5) { ritual.phase = 'hold'; ritual.t = 0; }
                } else if (ritual.phase === 'hold') {
                    ritual.t += rdt;
                    if (ritual.t >= 0.6) { ritual.phase = 'textout'; ritual.t = 0; }
                } else if (ritual.phase === 'textout') {
                    ritual.t += rdt;
                    backdropTarget = 0;                            // IL: FormationBackdrop.Display = false
                    if (poem) {
                        poem.textAlpha = 1 - cubeIn(ritual.t / 0.2); // IL: TextAlpha = CubeIn(1-p)，p += rdt/0.2
                        poem.particleSpeed = poem.textAlpha;
                    }
                    if (ritual.t >= 0.2 && poem) {
                        poem.anim = 'break';                       // IL: Poem.Heart.Play("break", 0, 0)
                        poem.frameI = GUI_BREAK_FROM;
                        poem.frameT = 0;
                        poem.breakT = 0; poem.breakFade = 1;
                        poem.delay = GUI_BREAK_DELAY;
                        poem.textAlpha = 0;
                        poem.particleSpeed = 0;                    // IL: ParticleSpeed = TextAlpha（淡出后为 0）
                        // 启动 loop（IL: sfx.Param("end", 0) 触发 FMOD event 从 intro 切 loop）
                        if (window.__audioGestured && window.GaplessAudio) {
                            try {
                                ritual.loopA = window.GaplessAudio.loop(
                                    'celeste-sounds/fakeHeart/game_10_fakeheart_get_loop.wav',
                                    { volume: 0.5 });
                                var lp = ritual.loopA.start(); if (lp && lp.catch) lp.catch(function () {});
                            } catch (e) {}
                        }
                        ritual.phase = 'break';
                        ritual.t = 0;
                    }
                } else if (ritual.phase === 'break') {
                    if (poem) poem.shake += rdt;                   // IL: Shake += DeltaTime → 心抖动 + 放大
                    if (!poem || poem.animDone) {                   // IL: !Heart.Animating → poem.RemoveSelf()
                        // IL: AbsorbOrb 从屏幕中心（camera + (320,180)*0.5）飞向玩家一侧
                        // 世界坐标换算：nToXY(0.5,0.5) 反解 ⇒ (160, -60.6)
                        for (var fi2 = 0; fi2 < 10; fi2++) orbs.push(newOrb(HEART_POS.x, -60));
                        glitchT = 0.8;                              // IL: Glitch.Value = 0.8（4/s 衰减）
                        shakeT = 0.3;                               // IL: level.Shake(0.3)
                        ritual.phase = 'out'; ritual.t = 0;
                    }
                } else if (ritual.phase === 'out') {
                    ritual.t += rdt;
                    if (poem) poem.alpha = Math.max(0, 1 - ritual.t / 0.25);
                    if (ritual.t >= 0.3) {
                        // 停 intro/loop（IL: sfx.Param("end", 1) 触发 FMOD event 从 loop 切 outro）
                        try { if (ritual.introA) ritual.introA.pause(); if (ritual.loopA) ritual.loopA.stop(0.08); } catch (e) {}
                        fxSound('fakeHeart/game_10_fakeheart_get_outro.wav', 0.85);
                        if (poem) closePoem();
                        ritual = null;
                        frozen = false;
                        showOshiroDialog('那颗心……是空的。也许，先去日记里写点什么？', '不安');
                    }
                }
            }
        }

        // 兼容：新版引擎有 dashAttacking getter / refillDash()，旧版只有 dashAttackTimer、dashes/maxDashes 字段
        function isDashAttacking(m) {
            return typeof m.dashAttacking === 'boolean' ? m.dashAttacking : m.dashAttackTimer > 0;
        }
        function refillDashOf(m) {
            if (typeof m.refillDash === 'function') m.refillDash();
            else if (m.dashes < m.maxDashes) m.dashes = m.maxDashes;
        }

        // ===== 主循环 =====
        var madeline = null, last = 0;
        CelesteCharacter.create({
            base: 'Atlases/Gameplay/characters/player',
            color: CelesteHair.MADELINE, x: 100, y: 0
        }).then(function (m) {
            madeline = m;
            m.setGround(groundAt);
            m.setWallAt(wallNearAt);
            m.setWallCollideFn(wallCollidesAt);
            initHeart();
            requestAnimationFrame(frame);
        });

        function frame(ts) {
            var rdt = last ? Math.min((ts - last) / 1000, 0.05) : 1 / 60;
            last = ts;
            if (freezeT > 0) freezeT -= rdt;
            if (ritual) tickRitual(rdt);
            updatePoem(rdt);

            // —— 引擎推进（Freeze/Frozen/TimeRate 作用于引擎 dt；orb 属 FrozenUpdate 走 raw dt） ——
            var edt = (freezeT > 0 || frozen) ? 0 : rdt * timeRate;
            if (edt > 0) {
                var input = {
                    left: keys['a'] || keys['arrowleft'],
                    right: keys['d'] || keys['arrowright'],
                    down: keys['s'] || keys['arrowdown'],
                    up: keys['w'] || keys['arrowup'],
                    jumpHeld: !!keys['c'],
                    jumpPressed: jumpEdge,
                    grabHeld: !!keys['z'],
                    grabPressed: !!keys['z'],
                    dashPressed: dashEdge,
                    aimX: (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0),
                    aimY: (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0)
                };
                madeline.update(edt, input);
                if (madeline.y < CEIL_Y) { madeline.y = CEIL_Y; if (madeline.vy < 0) madeline.vy = 0; }
            }
            jumpEdge = false; dashEdge = false;

            // —— 心的 bob / spin / shine / wiggle（未收集时） ——
            if (heart.mode !== 'none') {
                var hdt = (freezeT > 0 || frozen) ? 0 : rdt * timeRate;   // IL: 受 Freeze/TimeRate 支配
                heart.timer += hdt;
                heart.frameT += hdt;
                heart.bounceSfxDelay -= hdt;
                wigUpdate(heart.scaleWig, hdt);                        // IL: ScaleWiggler.Value
                wigUpdate(heart.moveWig, hdt);                         // IL: moveWiggler.Value
                while (heart.frameT >= SPIN_DELAY) {
                    heart.frameT -= SPIN_DELAY;
                    heart.frameI = (heart.frameI + 1) % SPIN_SEQ.length;
                    if (heart.frameI === 0) {                          // IL: OnLoop("spin") → pulse + ScaleWiggler.Start()
                        fxSound('crystalheart_pulse.wav', 0.3);
                        wigStart(heart.scaleWig);
                    }
                }
                heart.shineT -= hdt;
                if (heart.shineT <= 0) {                        // IL: 每 0.1s Emit(shine, 1, Center, One*8)
                    heart.shineT = 0.1;
                    shines.push({
                        x: HEART_POS.x + (Math.random() * 2 - 1) * 8,
                        y: HEART_POS.y + (Math.random() * 2 - 1) * 8,
                        t: 0, ttl: 0.7
                    });
                }
                // —— 命中（IL: HeartGem.OnPlayer —— collected / level.Frozen 短路；
                //          DashAttacking → Collect；否则 bounce 音 + PointBounce + 两个 Wiggler.Start） ——
                if (!ritual && !frozen && madeline && heartHit(madeline)) {
                    if (isDashAttacking(madeline)) {
                        if (heart.mode === 'real') startRealRitual();
                        else startFakeRitual();
                    } else if (heart.bounceSfxDelay <= 0) {
                        heart.bounceSfxDelay = 0.1;
                        // IL: moveWiggleDir = (Center - player.Center).UnitY（决定心被顶开的方向）
                        heart.moveDir.y = (HEART_POS.y < madeline.y - BODY_H / 2) ? -1 : 1;
                        pointBounce(madeline);
                        wigStart(heart.scaleWig);
                        wigStart(heart.moveWig);
                        bouncePing();                        // 缺口：无 gem_gem_bounce 音源，合成近似
                    }
                }
            }

            // —— 灰尘兔（引擎 dt：Freeze / TimeRate 同样作用于它们，IL: DustGraphic 走 Engine.DeltaTime）——
            if (DUST && DUST.ready()) {
                if (!dustScene) dustScene = DUST.createEnsemble(makeDustProbe());
                dustScene.step(edt);
            }

            // —— 粒子/特效推进 ——
            for (var i = shines.length - 1; i >= 0; i--) {
                var sh = shines[i];
                sh.t += rdt; sh.y -= 12 * rdt;
                if (sh.t >= sh.ttl) shines.splice(i, 1);
            }
            for (var si = slashes.length - 1; si >= 0; si--) {
                var sl = slashes[si];
                sl.t += rdt;
                sl.x += sl.dx * 8 * rdt; sl.y += sl.dy * 8 * rdt;   // IL: Position += Direction*8*dt
                sl.frame = Math.min(3, Math.floor(sl.t / 0.1));    // IL: Sprite "play" 0.1s/帧
                if (sl.t >= sl.ttl) slashes.splice(si, 1);
            }
            if (shakeT > 0) shakeT -= rdt;
            // IL: Level.Flash —— flash → Approach(1, dt*10) 后 Approach(0, dt*3)
            if (flashA > 0) flashA = Math.max(0, flashA - (edt > 0 ? edt : rdt) * 3);
            // IL: FormationBackdrop —— fade = Approach(Display ? 1 : 0, RawDeltaTime*3)
            backdropFade = approach(backdropFade, backdropTarget, rdt * 3);
            syncVeil();
            // IL: Celeste.Glitch.Value -= DeltaTime*4（碰到 0 为止）
            if (glitchT > 0) glitchT = Math.max(0, glitchT - (edt > 0 ? edt : rdt) * 4);
            for (var oi = orbs.length - 1; oi >= 0; oi--) {
                updateOrb(orbs[oi], rdt);
                if (orbs[oi].dead) orbs.splice(oi, 1);
            }

            // ===== 绘制 =====
            var Z = zoomNow();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            if (shakeT > 0) {
                var amp = 3 * Z * (shakeT / 0.3);
                ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
            }
            // shine 粒子（缺口：ParticleType 参数未取证 → 白色小光点上飘淡出近似）
            shines.forEach(function (sh) {
                var p = toScreen(sh);
                ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - sh.t / sh.ttl)).toFixed(3) + ')';
                var s2 = 2 * Z;
                ctx.fillRect(p.x - s2 / 2, p.y - s2 / 2, s2, s2);
            });
            // 心（IL: sprite.Position = UnitY*sin(timer*2)*2 + moveWiggleDir*(-8)*moveWiggle.Value；
            //     Scale = 1 + 0.25*ScaleWiggler.Value；fake → ghost 帧 * White*0.8 且无 bloom/light）
            if (heart.mode !== 'none') {
                var frames = heart.mode === 'real' ? heartFrames.real[heart.color] : heartFrames.ghost;
                var img = frames && frames[SPIN_SEQ[heart.frameI]];
                if (img) {
                    var bob = Math.sin(heart.timer * 2) * 2;    // IL: UnitY * (sin(timer*2)*2)
                    var mvy = -8 * heart.moveWig.value * heart.moveDir.y;
                    var hp = toScreen({ x: HEART_POS.x, y: HEART_POS.y + bob + mvy });
                    var sc = 1 + 0.25 * heart.scaleWig.value;
                    var w = img.width * Z * sc, h = img.height * Z * sc;
                    if (heart.mode === 'real') {
                        drawHeartGlow(ctx, hp.x, hp.y, Z, HEART_GLOW[heart.color] || HEART_GLOW.blue);
                    } else {
                        ctx.globalAlpha = 0.8;                  // IL: Color = White * 0.8（ghost）
                    }
                    ctx.drawImage(img, hp.x - w / 2, hp.y - h / 2, w, h);
                    ctx.globalAlpha = 1;
                }
            }
            // 白心（IL: CollectRoutine —— heartGemWhite 只在 Freeze(0.2) 期间闪现；
            //     随后 Entity.Visible=false 并心一同隐去，故不在 slow 阶段全程存在）
            if (ritual && ritual.kind === 'real' && ritual.phase === 'freeze') {
                var wImg = heartFrames.white[SPIN_SEQ[heart.frameI]];
                if (wImg) {
                    var wsc = 1 + 0.25 * heart.scaleWig.value;
                    var wp = toScreen({ x: HEART_POS.x, y: HEART_POS.y });
                    var ww = wImg.width * Z * wsc, wh = wImg.height * Z * wsc;
                    ctx.drawImage(wImg, wp.x - ww / 2, wp.y - wh / 2, ww, wh);
                }
            }
            // AbsorbOrb（orb.png CenterOrigin + 旋转 + 非等比缩放 + 淡出）
            if (orbs.length && orbImg) {
                orbs.forEach(function (o) {
                    var p = toScreen(o);
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(o.rot);
                    ctx.globalAlpha = Math.max(0, o.alpha);
                    var ow = orbImg.width * Z * o.sx, oh = orbImg.height * Z * o.sy;
                    ctx.drawImage(orbImg, -ow / 2, -oh / 2, ow, oh);
                    ctx.restore();
                });
                ctx.globalAlpha = 1;
            }
            // SlashFx 精灵（FakeHeart —— 24x8，4 帧）
            slashes.forEach(function (sl) {
                var sImg = slashFrames[sl.frame];
                if (!sImg) return;
                var p = toScreen(sl);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(sl.rot);
                var sw = sImg.width * Z, shh = sImg.height * Z;
                ctx.drawImage(sImg, -sw / 2, -shh / 2, sw, shh);
                ctx.restore();
            });
            // 灰尘兔（IL: Entity.Depth = -50 < 玩家 Depth 0 → 在 Madeline 之前画 = 下层）
            if (dustScene) dustScene.draw(ctx, toScreen, Z);
            // Madeline
            madeline.draw(ctx, toScreen, Z);
            ctx.restore();
            // IL: FormationBackdrop 黑幕 → 由 .veil 层承担（盖住房间 + 商店 UI，低于 #heartGet）
            // IL: Celeste.Glitch —— 横向切片错位（Value 0.8 → 0）
            if (glitchT > 0.02) {
                var gz = Math.min(1, glitchT);
                for (var gs = 0; gs < 7; gs++) {
                    var gy = Math.random() * canvas.height;
                    var gh = 6 + Math.random() * 34;
                    var gox = (Math.random() * 2 - 1) * 24 * gz;
                    if (Math.abs(gox) < 1) continue;
                    ctx.drawImage(canvas, 0, gy, canvas.width, gh, gox, gy, canvas.width, gh);
                }
            }
            // 白闪
            if (flashA > 0) {
                ctx.fillStyle = 'rgba(223,233,255,' + Math.min(1, flashA).toFixed(3) + ')';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            // Poem（GUI 240px 巨大心 + 80 粒子；文字由 DOM overlay 同步透明度）
            drawPoem();
            requestAnimationFrame(frame);
        }
    })();

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
