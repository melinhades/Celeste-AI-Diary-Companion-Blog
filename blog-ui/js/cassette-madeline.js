// cassette.exe · 第六章 lvl_b-00 房间 + 水 + 可操作 Madeline（接线层）
//
// 取证来源（本地 Celeste 安装）：
//   房间 lvl_b-00（6-Reflection.bin，632×184，cameraOffsetY=2；场景权威坐标见下）。
//   地形：solids 字符网格 79×23（8px 瓦片）—— 'g'=tilesets/reflection，'h'=tilesets/grass；
//         bg 瓦片 'a'=tilesets/bgReflection。已按 ForegroundTiles.xml/BackgroundTiles.xml
//         的 mask 规则分别烘焙成 celeste-areas/reflection_b00_bg.png / _fg.png，
//         中间夹 bgdecals（原作 bg 贴花层位于 bg 瓦片与前景 solids 之间）。
//   贴花：bgdecals 68 项（32 种贴图，贴图中心定位、scaleX=-1 水平翻转）；fgdecals 为 0。
//   实体：player ×2、checkpoint、granny_06_intro、lightbeam、bird、water、
//         bigWaterfall FG / BG。player/checkpoint 在原作无视觉，仅作为数据点核对。
//   NPC：granny_06_intro @ (432,144)，sprite=characters/oldlady idle 0-11，delay 0.15，
//        justify(0.5,1) → 脚底中心落在 (432,144)。
//   Water 实体 x=448,y=152,w=80,h=24；玩家 Position 为脚底中心，
//        SwimCheck = 上方 8px 有水，SwimUnderwaterCheck = 上方 9px；
//        SwimJumpCheck = 上方 14px 无水。swim 三组动画 0-5 / 6-11 / 12-17，delay 0.08。
//   音效只跨水体边界触发：water_in/water_out，冲刺变体 water_dash_in/out，
//        浅水移动循环 water_move_shallow（Speed.X != 0 且近水面/浅水）。
//
// 本文件只做接线：不改 celeste-character.js 的常量与物理；swim 常数按 IL 在接线层实现。
// 水的音效走 js/lib/sfx.js，缺文件静默。
(function () {
    'use strict';

    var roomCvs = document.getElementById('cxRoom');
    var waterCvs = document.getElementById('cxWater');
    var charCvs = document.getElementById('cxMadeline');
    if (!roomCvs || !waterCvs || !charCvs) return;

    // ===== 虚拟场景（单位 = 原作 1px；本地 x = 原作 x - 320）=====
    var VIEW_W = 320;          // 原作视口宽
    var ROOM_X = 320;          // 原作房间 x 偏移：本地坐标 = 原作坐标 - 320
    var ROOM_W = 632;
    var ROOM_H = 184;
    var GROUND = 176;          // 屏幕映射锚点（原作池底/最低地面 y）
    var WATER = { x: 128, y: 152, w: 80, h: 24 };   // 房间 x448-320 → 128；hasBottom=false
    var WATER_MID_Y = WATER.y + WATER.h / 2;        // 164
    var BUF_W = 320, BUF_H = 180;                   // 原作内部分辨率，所有场景层在此离屏绘制
    var SPAWN = 92;            // 老奶奶 (432) 左侧，紧贴但不与 NPC 重叠

    var BODY_HALF = 4;
    var BODY_H = 11;
    var SWIM_MAX_SURFACE = 80;
    var SWIM_MAX_UNDER = 60;

    // 原作 lvl_b-00 solids 字符网格（23 行 × 79 列，行尾 '0' 已由二进制裁剪）
    var SOLIDS = [
        '00000000000ggggggggggggggggggggggggggg00000000ggggggggggggggggggggggggggggggggg',
        '000000000000gggggggggggggggggggggggggg00000000ggggggggggggggggggggggggggggggggg',
        '00000000000000gggggggggg00000000ggggg000000000ggggg000gggggggg000gggg00gggggggg',
        '00000000000000ggggg000gg00000000g000g0000000000gggg000g000gg00000gggg0000gggg',
        '00000000000000gg00g000gg00000000g000000000000000ggg00000000g000000gg000000ggg',
        '00000000000000g00000000g000000000000000000000000gg00000000000000000g00000000g',
        '000000000000000000000000000000000000000000000000gg',
        '000000000000000000000000000000000000000000000000g',
        '000000000000000000000000000000000000000000000000g',
        '',
        '000000000000000000hhhhhh',
        '000000000000000000hhhhhhg',
        '0000000000000000000hhhhhg',
        '0000000000000000000hhhhgg',
        '000000000000000000000ggg',
        '',
        '',
        '',
        'hhhh000000000000000000000000000000000000hhhhhhhhhhhhhhhh0000000000000000000hhhh',
        'hhhh000000000000000000000000000000000ggghhhhhhhhhhhhhhhh0000000000hh0000000hhhh',
        'hhhhhhh00000000hhhhhh00000000000000ggggghhhhhhhhhhhhhhhhh000000000hhhhhhggghhhh',
        'gghhhhhgggggggghhhhhhggggggggggggggggggggggggggghhhhhhhhh0000ggggghhhhhhggggggg',
        'gggggggggggggggggggggggggggggggggggggggggggggggggggghhhggggggggggghhhhggggggggg',
    ];

    // 原作实体（房间坐标 → 本地坐标只减 ROOM_X）
    var NPC = { x: 432 - ROOM_X, y: 144 };          // granny_06_intro，脚底中心
    // lightbeam id=830：data (336,-136) w56 h304 origin(28,0) rotation=0
    // 原作锚点 = Position + offset（origin 只给编辑器用）；绘制用纹理 origin(0,0.5)、
    // 方向 Rotation+90°（向下展开 304px），横向以锚点为中心 56px。
    var BEAM = { ax: 336 - ROOM_X, ay: -136, w: 56, h: 304 };
    var FALL = { x: 544 - ROOM_X, y: 200, w: 40, h: 216 };   // bigWaterfall FG，底边 y=200
    var FALL_BG = { x: 184 - ROOM_X, y: 208, w: 40, h: 232 }; // bigWaterfall BG，底边 y=208（本镜头外）
    // 取景中心：原作 cutscene 里镜头对准老奶奶（player 也在她旁边），
    // 本地 112 = 原作 432；比居中水池更能还原这一幕，也让 NPC 不被左侧面板挡住。
    var VIEW_CX = NPC.x;

    // 原作 solid 查询（col/row 为房间 8px 瓦片坐标）
    function solidAt(col, row) {
        if (row < 0 || row >= SOLIDS.length) return false;
        var c = SOLIDS[row].charAt(col);
        return !!c && c !== '0';
    }
    // 地面高度：从 row18 起向下找第一块实心瓦片；本地 x → 房间 col
    function groundAt(x) {
        var col = Math.floor((x + ROOM_X) / 8);
        if (col < 0) col = 0;
        if (col > 78) col = 78;
        for (var row = 18; row < 23; row++) {
            if (solidAt(col, row)) return row * 8;
        }
        return GROUND;
    }
    // 池壁/台阶：前方地面比脚底高出 4px 以上视为墙（把地形真正变成碰撞）
    function terrainWall(x, feetY, dir) {
        var probe = x + dir * (BODY_HALF + 0.5);
        var g = groundAt(probe);
        if (g < feetY - 4) return x + dir * BODY_HALF;
        return null;
    }

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

    // ===== 画布 =====
    // room/water 两块上屏画布已退役：场景统一在 drawCharacter 里合成并过 ColorGrade 后
    // 从角色层上屏。这两块不再分配全屏位图（dpr=2 时各 ~20MB），也不再每帧清屏。
    var charCtx = null;
    var dpr = 1;
    function fitCanvas(cvs) {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        cvs.width = Math.max(1, Math.round(window.innerWidth * dpr));
        cvs.height = Math.max(1, Math.round(window.innerHeight * dpr));
        var ctx = cvs.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }
    function fitAll() {
        charCtx = fitCanvas(charCvs);
        bakeRoomStatic();          // 相机只随窗口尺寸变化：resize 后重烘焙静态层
    }
    fitAll();
    window.addEventListener('resize', fitAll, { passive: true });

    // ===== 320×180 离屏缓冲：房间/水都在整数像素网格上画，再最近邻放大 =====
    var offRoom = document.createElement('canvas');
    var offWater = document.createElement('canvas');
    var offChar = document.createElement('canvas');   // 角色层也进 320×180，和场景同一像素网格
    var offScene = document.createElement('canvas');  // 三层合成后做 ColorGrade 整屏后处理
    var offRoomA = document.createElement('canvas');  // 房间静态层 A：bg 瀑布 + bg 瓦片 + 贴花
    var offRoomB = document.createElement('canvas');  // 房间静态层 B：前景 solids
    offRoom.width = BUF_W; offRoom.height = BUF_H;
    offWater.width = BUF_W; offWater.height = BUF_H;
    offChar.width = BUF_W; offChar.height = BUF_H;
    offScene.width = BUF_W; offScene.height = BUF_H;
    offRoomA.width = BUF_W; offRoomA.height = BUF_H;
    offRoomB.width = BUF_W; offRoomB.height = BUF_H;
    var roomG = offRoom.getContext('2d');
    var waterG = offWater.getContext('2d');
    var charG = offChar.getContext('2d');
    // willReadFrequently：ColorGrade 每帧 getImageData/putImageData，软件位图免 GPU 往返
    var sceneG = offScene.getContext('2d', { willReadFrequently: true });
    var roomAG = offRoomA.getContext('2d');
    var roomBG = offRoomB.getContext('2d');
    roomG.imageSmoothingEnabled = false;
    waterG.imageSmoothingEnabled = false;
    charG.imageSmoothingEnabled = false;
    sceneG.imageSmoothingEnabled = false;
    roomAG.imageSmoothingEnabled = false;
    roomBG.imageSmoothingEnabled = false;

    // 缓冲区 (0,0) 对应世界 (camLeft, GROUND-BUF_H)；右/底分别贴视口右/下边缘
    function blitOffscreen(ctx, off) {
        var u = unit(), W = window.innerWidth, H = window.innerHeight;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, BUF_W, BUF_H,
            W / 2 - (BUF_W / 2) * u, H - BUF_H * u, BUF_W * u, BUF_H * u);
    }

    // ===== 视口映射：水始终水平居中；地面贴视口底部 =====
    function unit() {
        // 与 .cx-bg 的 --cx-tile: max(100vw, 177.7778vh) 同口径
        return Math.max(window.innerWidth, window.innerHeight * 16 / 9) / VIEW_W;
    }
    function viewWidth() { return window.innerWidth / unit(); }
    function camLeft() { return VIEW_CX - viewWidth() / 2; }
    function screenX(wx) { return window.innerWidth / 2 + (wx - VIEW_CX) * unit(); }
    function screenY(wy) { return window.innerHeight - (GROUND - wy) * unit(); }
    function toScreen(p) { return { x: screenX(p.x), y: screenY(p.y) }; }

    // ===== 水：逻辑判定（原作用 CollideCheck<Water>，是 8×11 碰撞盒，不是单点）=====
    // Player.Collider = Hitbox(8, 11)：x±4，脚底 y 向上 11px
    function boxInWater(wx, wy) {
        return wx + BODY_HALF > WATER.x && wx - BODY_HALF < WATER.x + WATER.w &&
            wy > WATER.y && wy - BODY_H < WATER.y + WATER.h;
    }
    // SwimCheck：Position-8 与 Position 两处碰撞盒都碰到水
    function swimCheck() { return boxInWater(CH.x, CH.y - 8) && boxInWater(CH.x, CH.y); }
    function underwaterCheck() { return boxInWater(CH.x, CH.y - 9); }
    function swimJumpCheck() { return !boxInWater(CH.x, CH.y - 14); }
    function swimRiseCheck() { return !boxInWater(CH.x, CH.y - 18); }
    // _IsOverWater：Collider.Bounds.Height += 2（底边 y+2）是否碰到水
    function overWater() {
        return CH.x + BODY_HALF > WATER.x && CH.x - BODY_HALF < WATER.x + WATER.w &&
            CH.y + 2 > WATER.y && CH.y - BODY_H < WATER.y + WATER.h;
    }

    // Water._IsShallowAtRectangle：水面下 8px 的水平线段是否穿过水
    function shallowAtRect(wx) {
        var y = WATER.y + 8;
        return y >= WATER.y && y <= WATER.y + WATER.h &&
            (wx + BODY_HALF > WATER.x && wx - BODY_HALF < WATER.x + WATER.w);
    }
    // deep = center.Y < water.Center.Y ? (_IsShallowAtRectangle ? 0 : 1) : 1
    function deepAt() {
        var cy = CH.y - BODY_H / 2;
        if (cy < WATER_MID_Y) return shallowAtRect(CH.x) ? 0 : 1;
        return 1;
    }

    // ===== 水：视觉（Celeste.Water.Render；320×180 离屏、整数像素）=====
    // 原作依据（Celeste.dll → Celeste.Water）：
    //   FillColor = LightSkyBlue*0.3，SurfaceColor = LightSkyBlue*0.8，
    //   RayTopColor = LightSkyBlue*0.6；GFX.DrawVertices 默认 BlendState.AlphaBlend。
    //   Surface: Resolution=4、RaysPerPixel=0.2、BaseHeight=6、Outwards=(0,-1)、
    //   Position=(water.x+w/2, water.y+8)。本房 hasBottom=false → 只有 TopSurface。
    //   水面波 = sin(timer + position*0.1)（振幅 1px、波长 2π/0.1≈62.8px）；
    //   涟漪的 ClampedMap 只缩放涟漪贡献，不缩放 sin。水线是 SurfaceColor 的 1px 亮边。
    var W_BASE = WATER.y + 8;
    var W_RAYS = Math.floor(WATER.w * 0.2);          // 16
    var C_FILL = 'rgba(40,61,75,0.298)';             // (135,206,250)*0.3，alpha 76/255
    var C_SURF = 'rgba(108,164,200,0.8)';            // (135,206,250)*0.8
    var RAY_R = 81, RAY_G = 123, RAY_B = 150;        // (135,206,250)*0.6

    var waterT = 0;
    var ripples = [];
    var rays = [];
    var waterInit = false;

    function randRange(a, b) { return a + Math.random() * (b - a); }
    function cmap4(v, a, b, oa) {       // Calc.ClampedMap(v,a,b,outMin)，outMax=1
        var t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return oa + (1 - oa) * t;
    }
    function cmap5(v, a, b, oa, ob) {
        var t = Math.max(0, Math.min(1, (v - a) / (b - a)));
        return oa + (ob - oa) * t;
    }
    function resetRay(r) {              // Water.Surface.Ray.Reset
        r.p = Math.random() * WATER.w;
        r.percent = 0;
        r.dur = randRange(2, 8);
        r.width = randRange(2, 16);
        r.len = randRange(8, 128);
    }
    function initWater() {
        waterInit = true;
        for (var i = 0; i < W_RAYS; i++) {
            var r = {};
            resetRay(r);
            r.percent = Math.random();  // 构造时 Reset(NextFloat())：各光线相位错开
            rays.push(r);
        }
    }

    // Water.Surface.GetSurfaceHeight
    function surfaceHeight(pos) {
        if (pos < 0 || pos > WATER.w) return 0;
        var h = 0;
        for (var i = 0; i < ripples.length; i++) {
            var rp = ripples[i];
            var d = Math.abs(rp.p - pos);
            var c = d < 12 ? cmap5(d, 0, 16, 1, -0.75) : cmap5(d, 16, 32, -0.75, 0);
            var e = 1 - rp.percent;
            h += c * rp.height * (e * e * e);        // Ease.CubeIn
        }
        h = Math.max(-4, Math.min(4, h));
        var v = pos / WATER.w;
        h *= cmap4(v, 0, 0.1, 0.5);
        h *= cmap5(v, 0.9, 1, 1, 0.5);
        h += Math.sin(waterT + pos * 0.1);
        return h + 6;                                // BaseHeight
    }

    function updateWater(dt) {
        if (!waterInit) initWater();
        waterT += dt;
        for (var i = ripples.length - 1; i >= 0; i--) {
            var rp = ripples[i];
            if (rp.percent > 1) { ripples.splice(i, 1); continue; }
            rp.p += rp.speed * dt;
            if (rp.p < 0 || rp.p > WATER.w) {
                rp.speed = -rp.speed;
                rp.p = Math.max(0, Math.min(WATER.w, rp.p));
            }
            rp.percent += dt / rp.dur;
        }
        for (var j = 0; j < rays.length; j++) {
            var r = rays[j];
            if (r.percent > 1) resetRay(r);
            r.percent += dt / r.dur;
        }
    }

    // Water.Surface.DoRipple：左右两条 ±80px/s；Height=2*mult*ClampedMap(w,0,200,0.5)；
    // Duration=3*ClampedMap(w,0,200,0.25)
    function doRipple(wx) {
        var pos = wx - WATER.x;
        var mult = cmap4(WATER.w, 0, 200, 0.5);
        var dur = 3 * cmap4(WATER.w, 0, 200, 0.25);
        ripples.push({ p: pos, speed: -80, height: 2 * mult, percent: 0, dur: dur });
        ripples.push({ p: pos, speed: 80, height: 2 * mult, percent: 0, dur: dur });
    }

    function drawWater(dt) {
        var g = waterG;
        g.clearRect(0, 0, BUF_W, BUF_H);
        g.imageSmoothingEnabled = false;

        var x0 = Math.round(WATER.x - camLeft());        // 缓冲区内的水左缘
        var yb = Math.round(W_BASE - (GROUND - BUF_H));  // Surface 基线下缘（y+8）
        var cols = WATER.w / 4;                          // Resolution = 4
        var hts = [];
        for (var c = 0; c <= cols; c++) hts.push(surfaceHeight(c * 4));

        // 0) 水后折射（Celeste.Water.RenderDisplacement + Surface 的水面材质）
        //    原作：水体网格被写进 displacement buffer（RenderDisplacement 用实色 (0.5,0.5,0.25)），
        //    Water.Render 在 GameplayRenderer.End() 之后才画 Surface quad，由水面材质采样屏幕，
        //    于是「水后面的画面」被扰动。canvas 2D 没有着色器：按扫描行把水后场景（offRoom）
        //    整像素横向偏移后铺回水体；偏移随深度增大、相位随时间/深度漂移，全部取整。
        //    （着色器内部的偏移曲线拿不到，本条幅度是推断；位移区域 = 水体矩形有 IL 依据。）
        var bodyH = WATER.h - 8;
        for (var dyy = 0; dyy < bodyH; dyy++) {
            var sy = yb + dyy;
            if (sy < 0 || sy >= BUF_H) continue;
            var amp = 1 + Math.min(1, dyy / bodyH);          // 1..2px
            var dx = Math.round(Math.sin(waterT * 2.2 + dyy * 0.5) * amp);
            if (!dx) continue;
            var sx = Math.round(x0 - dx);
            if (sx < 0) sx = 0;
            if (sx + WATER.w > BUF_W) sx = BUF_W - WATER.w;
            g.drawImage(offRoom, sx, sy, WATER.w, 1, x0, sy, WATER.w, 1);
        }

        // 1) 水体矩形：Draw.Rect(x+fill.X, y+fill.Y, w, h-8)，FillColor
        g.fillStyle = C_FILL;
        g.fillRect(x0, yb, WATER.w, WATER.h - 8);

        // 2) Surface fill mesh：每 4px 一个顶点，顶点间线性插值，逐像素列填充
        var tops = [];
        for (var px = 0; px < WATER.w; px++) {
            var ci = Math.min(cols - 1, Math.floor(px / 4));
            var tt = (px - ci * 4) / 4;
            var hh = hts[ci] + (hts[ci + 1] - hts[ci]) * tt;
            var top = Math.round(yb - hh);
            tops.push(top);
            if (top < yb) g.fillRect(x0 + px, top, 1, yb - top);
        }

        // 3) 水内光线：Ray quad（顶点色 RayTopColor → Transparent）。
        //    原作顶点插值 = RGB 与 A 同乘 (1-s)（premultiplied 线性衰减）；canvas 渐变按
        //    premultiplied 插值，rgba(色, 0.6*fade) → rgba(0,0,0,0) 与其逐行栅格化等价，
        //    每条光线 1 次 path + 渐变 fill，替代逐行拼 rgba 字符串 + fillRect。
        //    顶部 = Position ± Width/2，底部左移 0.3*Length、下移 min(BodyHeight, 0.7*Length)
        for (var j = 0; j < rays.length; j++) {
            var r = rays[j];
            var fade = 1;
            if (r.percent < 0.1) fade = r.percent / 0.1;
            else if (r.percent > 0.9) fade = (1 - r.percent) / 0.1;
            if (fade <= 0) continue;
            var num9 = Math.max(0, r.p - r.width / 2);
            var num10 = Math.min(WATER.w, r.p + r.width / 2);
            var num11 = Math.min(WATER.h, 0.7 * r.len);
            var num12 = 0.3 * r.len;
            var topL = Math.round(yb - surfaceHeight(num9));
            var botY = Math.round(yb + num11);
            if (botY - topL < 1) continue;
            var grd = g.createLinearGradient(0, topL, 0, botY);
            grd.addColorStop(0, 'rgba(' + Math.round(RAY_R * fade) + ',' +
                Math.round(RAY_G * fade) + ',' + Math.round(RAY_B * fade) + ',' +
                (0.6 * fade).toFixed(3) + ')');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grd;
            g.beginPath();
            g.moveTo(Math.round(x0 + num9), topL);
            g.lineTo(Math.round(x0 + num10), topL);
            g.lineTo(Math.round(x0 + num10 - num12), botY);
            g.lineTo(Math.round(x0 + num9 - num12), botY);
            g.closePath();
            g.fill();
        }

        // 4) 水线亮边：SurfaceColor 的 1px 条；相邻列高度差用竖向连接补齐（网格是连续的）
        g.fillStyle = C_SURF;
        var prevTop = tops[0];
        for (var px2 = 0; px2 < WATER.w; px2++) {
            var tpx = tops[px2];
            var yTop = Math.min(prevTop, tpx) - 1;
            g.fillRect(x0 + px2, yTop, 1, Math.abs(tpx - prevTop) + 1);
            prevTop = tpx;
        }

        // 场景统一在 drawCharacter 里合成后上屏（整屏 ColorGrade）。
    }

    // ===== 房间：地形 + 贴花 + 光柱 + 老奶奶 + 瀑布 + 前景雾 =====
    var bgImg = null, fgImg = null, beamImg = null, beamTint = null, fogImg = null, vignetteImg = null, grannyImgs = [];
    var birdImgs = [];
    var decalImgs = {};
    var roomT = 0, grannyT = 0, birdT = 0, birdFly = 0;
    // LightBeam：timer 初值 Calc.NextFloat(1000)，alpha 从 0 以 4/s 逼近目标
    var beamT = Math.random() * 1000, beamAlpha = 0;
    var BIRD = { x: 152 - ROOM_X, y: 80 };   // bird @(152,80)，FlyAway；在本镜头取景外

    // 原作 lvl_b-00 的 68 个 bgdecals（房间坐标：[x, y, scaleX, 贴图]）
    // Decal 以贴图中心定位（取证：ground - y == 贴图高/2），scaleX=-1 为水平翻转。
    var DECALS = [
        [408,112,1,'crystal_a.png'],[608,136,1,'mushroom_d.png'],[152,64,1,'long_grass.png'],
        [420,128,1,'mushroom_e.png'],[332,128,1,'long_grass.png'],[252,160,1,'rubble_d.png'],
        [556,152,1,'short_grass_d.png'],[540,144,1,'short_grass_a.png'],[440,136,1,'short_grass_a.png'],
        [392,136,1,'short_grass_d.png'],[320,144,1,'short_grass_a.png'],[304,144,1,'short_grass_b.png'],
        [288,152,1,'short_grass_d.png'],[376,128,1,'mushroom_e.png'],[356,112,1,'Elevator.png'],
        [348,72,1,'elavator_cable.png'],[348,56,1,'elavator_cable.png'],[348,40,1,'elavator_cable.png'],
        [348,24,1,'elavator_cable.png'],[348,8,1,'elavator_cable.png'],[348,-8,1,'elavator_cable.png'],
        [372,136,1,'mushroom_b.png'],[316,144,1,'mushroom_c.png'],[308,144,1,'mushroom_a.png'],
        [292,152,1,'mushroom_d.png'],[444,136,1,'mushroom_b.png'],[380,136,1,'mushroom_a.png'],
        [268,152,-1,'mushroom_e.png'],[532,144,1,'mushroom_c.png'],[548,152,1,'mushroom_b.png'],
        [560,152,1,'mushroom_a.png'],[332,136,1,'mushroom_c.png'],[448,152,1,'short_grass_b.png'],
        [276,160,1,'rubble_a.png'],[40,144,1,'bulb_plant_c.png'],[164,124,-1,'ceiling_slime.png'],
        [204,28,1,'moss_a.png'],[164,76,1,'collumn_base_bot_a.png'],[164,60,1,'collumn_mid_a.png'],
        [164,44,1,'collumn_mid_d.png'],[164,28,1,'collumn_base_top_a.png'],[180,120,1,'collumn_base_top_a.png'],
        [180,136,1,'collumn_mid_d.png'],[180,152,1,'collumn_mid_a.png'],[180,168,1,'collumn_base_bot_a.png'],
        [192,156,-1,'bulb_plant_c.png'],[124,136,1,'crystal_shard_c.png'],[208,156,1,'fruits_a.png'],
        [52,152,1,'mushroom_a.png'],[20,136,1,'mushroom_d.png'],[136,44,1,'ceiling_slime.png'],
        [252,28,1,'grass_fall_a.png'],[276,40,1,'crystal_shard_b.png'],[252,52,1,'crystal_shard_d.png'],
        [412,28,1,'grass_fall_a.png'],[564,152,1,'rubble_a.png'],[612,136,1,'rubble_e.png'],
        [12,136,1,'rubble_h.png'],[100,156,1,'bulb_plant_b.png'],[72,156,1,'big_vine_b.png'],
        [452,36,1,'moss_a.png'],[500,28,-1,'moss_a.png'],[580,36,-1,'grass_fall_a.png'],
        [184,72,1,'mushroom_a.png'],[512,48,1,'crystal_shard_b.png'],[440,56,1,'crystal_shard_e.png'],
        [572,132,1,'big_crystal_a.png'],[604,60,1,'crystal_shard_d.png']
    ];

    function loadRoom() {
        var jobs = [
            loadImg('celeste-areas/reflection_b00_bg.png'),
            loadImg('celeste-areas/reflection_b00_fg.png'),
            loadImg('Atlases/Gameplay/util/lightbeam.png'),
            loadImg('Atlases/Misc/darkswamp.png')
        ];
        var frames = [];
        for (var i = 0; i <= 11; i++) {
            frames.push(loadImg('Atlases/Gameplay/characters/oldlady/idle' + ('0' + i).slice(-2) + '.png'));
        }
        jobs.push(Promise.all(frames));

        var decalNames = [];
        var decalJobs = [];
        for (var d = 0; d < DECALS.length; d++) {
            var fn = DECALS[d][3];
            if (decalNames.indexOf(fn) === -1) {
                decalNames.push(fn);
                decalJobs.push(loadImg('Atlases/Gameplay/decals/6-reflection/' + fn));
            }
        }
        jobs.push(Promise.all(decalJobs));

        var birdJobs = [];
        for (var b = 0; b <= 11; b++) {
            birdJobs.push(loadImg('Atlases/Gameplay/characters/bird/crow' + ('0' + b).slice(-2) + '.png'));
        }
        jobs.push(Promise.all(birdJobs));
        jobs.push(loadImg('Atlases/Misc/vignette.png'));
        jobs.push(loadImg('Atlases/ColorGrading/reflection.png'));

        Promise.all(jobs).then(function (res) {
            bgImg = res[0];
            fgImg = res[1];
            beamImg = res[2];
            // LightBeam.color = new Color(0.8,1,1)：纹理是 80×1 的白色 alpha 渐变，
            // 这里先按 color 乘好 RGB，绘制时每道光条只改 globalAlpha（AlphaBlend）
            if (beamImg) {
                beamTint = document.createElement('canvas');
                beamTint.width = beamImg.width; beamTint.height = 1;
                var btg = beamTint.getContext('2d');
                btg.fillStyle = 'rgb(204,255,255)';
                btg.fillRect(0, 0, beamTint.width, 1);
                btg.globalCompositeOperation = 'destination-in';
                btg.drawImage(beamImg, 0, 0);
            }
            fogImg = res[3];
            grannyImgs = (res[4] || []).filter(function (v) { return !!v; });
            var loaded = res[5] || [];
            for (var k = 0; k < decalNames.length; k++) {
                if (loaded[k]) decalImgs[decalNames[k]] = loaded[k];
            }
            birdImgs = (res[6] || []).filter(function (v) { return !!v; });
            vignetteImg = res[7] || null;
            lutImg = res[8] || null;
            buildLut();
            bakeRoomStatic();
        });
    }

    // ===== 房间静态层烘焙 =====
    // bg 瀑布/bg 瓦片/68 个贴花/前景 solids 只随加载与 resize（相机）变化：
    // 烘焙成两张 320×180 静态层，drawRoom 每帧只剩 2 次 blit + lightbeam + 动态实体。
    // lightbeam 的深度（-9998）夹在贴花与前景 solids 之间，正好用 A/B 两层夹住。
    // BG 瀑布的 roomT 动画条会被冻结，但它在任何合法取景下都整块在画布外，无影响。
    function bakeRoomStatic() {
        if (!bgImg || !fgImg) return;
        var cam = camLeft();
        var oy = GROUND - BUF_H;
        function bx(wx) { return Math.round(wx - cam); }
        function by(wy) { return Math.round(wy - oy); }

        var aG = roomAG;
        aG.clearRect(0, 0, BUF_W, BUF_H);
        aG.imageSmoothingEnabled = false;
        // BG bigWaterfall（原作 layer=BG；本镜头取景外）
        drawWaterfall(aG, bx(FALL_BG.x), by(FALL_BG.y), FALL_BG.w, FALL_BG.h);
        // bg 瓦片（bgReflection）
        aG.drawImage(bgImg, bx(-ROOM_X), by(0), ROOM_W, ROOM_H);
        // 68 个 bgdecals（原作在地形之前；贴图中心定位）
        for (var di = 0; di < DECALS.length; di++) {
            var dd = DECALS[di];
            var dimg = decalImgs[dd[3]];
            if (!dimg) continue;
            var dcx = bx(dd[0] - ROOM_X);
            if (dcx + dimg.width < 0 || dcx - dimg.width > BUF_W) continue;
            var hw = Math.round(dimg.width / 2), hh = Math.round(dimg.height / 2);
            aG.save();
            aG.translate(dcx, by(dd[1]));
            if (dd[2] < 0) aG.scale(-1, 1);
            aG.drawImage(dimg, -hw, -hh, dimg.width, dimg.height);
            aG.restore();
        }

        var bG = roomBG;
        bG.clearRect(0, 0, BUF_W, BUF_H);
        bG.imageSmoothingEnabled = false;
        // 前景 solids（reflection 岩壁 + grass）
        bG.drawImage(fgImg, bx(-ROOM_X), by(0), ROOM_W, ROOM_H);
    }

    // 原作 BigWaterfall：FG 线条 '89dbf0'*0.5、水体 '29a7ea'*0.3（本层仍是近似，第三块再收）
    function drawWaterfall(g, x0, bottomY, w, h) {
        var top = bottomY - h;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(41,167,234,0.24)';
        g.fillRect(x0, top, w, h);

        // 竖向水流条纹：整数像素宽，亮暗交替
        for (var k = 0; k < 9; k++) {
            var lx = Math.round(x0 + (k + 0.5) / 9 * w);
            g.fillStyle = k % 3 === 0 ? 'rgba(137,219,240,0.24)' : 'rgba(137,219,240,0.12)';
            g.fillRect(lx, top, (k % 4 === 0) ? 2 : 1, h);
        }
        // 缓慢下移的亮条
        var span = 26;
        var off = (roomT * 70) % span;
        g.fillStyle = 'rgba(200,240,252,0.10)';
        for (var y = top + Math.round(off); y < bottomY; y += span) {
            g.fillRect(x0 + 6, y, w - 12, 2);
        }
        g.restore();
    }

    // ===== LightBeam.Render（按 IL 逐行还原）=====
    //  Render()：
    //    DrawTexture(0, LightWidth, LightLength-4 + sin(timer*2)*4, 0.4)          ← 主光柱
    //    for i=0..LightWidth step 4:
    //      num  = timer + i*0.6
    //      num2 = 4 + sin(num*0.5 + 1.2)*4                                       ← 光条宽度 (0..8)
    //      num3 = sin((num + i*32)*0.1 + sin(num*0.05 + i*0.1)*0.25)
    //             * (LightWidth/2 - num2/2)                                      ← 横向摆动
    //      len  = LightLength + sin(num*0.25)*8
    //      a    = 0.6 + sin(num+0.8)*0.3
    //      DrawTexture(num3, num2, len, a)
    //  DrawTexture(x,w,len,a)：锚点 + AngleToVector(Rotation)*x，纹理 origin(0,0.5)，
    //    scale=(len/texW, w)，rotation=Rotation+90°，color* a * this.alpha，AlphaBlend。
    //  像素风：列/行全部取整，纹理用 80×1 的 beamTint 逐行最近邻拉伸。
    function drawBeam(g, bx, by) {
        if (!beamTint || beamAlpha <= 0) return;
        var top = Math.round(by(BEAM.ay));
        var cx = bx(BEAM.ax);
        g.save();
        g.imageSmoothingEnabled = false;
        function stripe(off, wid, len, a) {
            var w = Math.round(wid);
            if (w < 1) return;
            var al = Math.min(1, a * beamAlpha);
            if (al <= 0.004) return;
            g.globalAlpha = al;
            g.drawImage(beamTint, 0, 0, beamTint.width, 1,
                Math.round(cx + off - w / 2), top, w, Math.round(len));
        }
        stripe(0, BEAM.w, BEAM.h - 4 + Math.sin(beamT * 2) * 4, 0.4);
        for (var i = 0; i < BEAM.w; i += 4) {
            var num = beamT + i * 0.6;
            var num2 = 4 + Math.sin(num * 0.5 + 1.2) * 4;
            var num3 = Math.sin((num + i * 32) * 0.1 + Math.sin(num * 0.05 + i * 0.1) * 0.25) *
                (BEAM.w / 2 - num2 / 2);
            var len = BEAM.h + Math.sin(num * 0.25) * 8;
            var a2 = 0.6 + Math.sin(num + 0.8) * 0.3;
            stripe(num3, num2, len, a2);
        }
        g.restore();
    }

    // LightBeam.Update 的 alpha 目标：玩家在光柱宽度内时按到锚点的距离衰减，
    // 出宽度（或沿轴距离 > w/2）直接 1；Transitioning 时 0。本房光束竖直、锚点在房顶上方，
    // 玩家始终满足「出宽度」→ 目标恒为 1，alpha 以 4/s 涨到 1。
    function updateBeamAlpha(dt) {
        beamT += dt;
        var target = 1;
        if (ready && ch) {
            var pcx = CH.x, pcy = CH.y - BODY_H / 2;
            var lx = Math.max(BEAM.ax, Math.min(BEAM.ax + 10000, pcx));
            var along = Math.sqrt((lx - BEAM.ax) * (lx - BEAM.ax) +
                (pcy - BEAM.ay) * (pcy - BEAM.ay));
            target = Math.min(Math.max(along - 8, 0) / BEAM.h, 1);
            var perp = Math.sqrt((lx - pcx) * (lx - pcx) + (BEAM.ay - pcy) * (BEAM.ay - pcy));
            if (perp > BEAM.w / 2) target = 1;
        }
        beamAlpha = approach(beamAlpha, target, dt * 4);
    }

    function drawRoom(dt) {
        roomT += dt;
        updateBeamAlpha(dt);
        grannyT += dt;
        birdT += dt;

        var g = roomG;
        g.clearRect(0, 0, BUF_W, BUF_H);
        g.imageSmoothingEnabled = false;
        var cam = camLeft();
        function bx(wx) { return Math.round(wx - cam); }
        function by(wy) { return Math.round(wy - (GROUND - BUF_H)); }

        // 1-4) 静态部分（bg 瀑布/bg 瓦片/贴花/前景 solids）只在加载与 resize 时烘焙
        //      （bakeRoomStatic），每帧只剩两次 320×180 blit + 动态元素；
        //      lightbeam 深度 -9998，正好夹在 A（贴花）/ B（前景 solids）两层之间
        g.drawImage(offRoomA, 0, 0);
        drawBeam(g, bx, by);
        g.drawImage(offRoomB, 0, 0);

        // 5) bird @(152,80)：idle 12 帧；靠近时向上飞走（原作 mode=FlyAway）
        if (birdImgs.length) {
            var near = CH && Math.abs(CH.x - BIRD.x) < 40 && Math.abs(CH.y - BIRD.y) < 48;
            if (near) birdFly = Math.min(1, birdFly + dt * 0.7);
            var bi = Math.floor(birdT / 0.12) % birdImgs.length;
            var bwid = birdImgs[bi].width, bhei = birdImgs[bi].height;
            var bob = Math.sin(birdT * 3) * 1.5;
            var bxp = Math.round(bx(BIRD.x) + birdFly * 60);
            var byp = Math.round(by(BIRD.y + bob) - birdFly * 120);
            g.drawImage(birdImgs[bi], bxp - Math.round(bwid / 2), byp - Math.round(bhei / 2), bwid, bhei);
        }

        // 6) granny_06_intro：oldlady idle 0-11，delay 0.15s，32×32，脚底中心
        if (grannyImgs.length) {
            var gi = Math.floor(grannyT / 0.15) % grannyImgs.length;
            var gx = bx(NPC.x) - 16, gy = by(NPC.y) - 32;
            // 老奶奶面向 Madeline（原作 NPC 对话时朝向玩家）
            if (CH.x < NPC.x) {
                g.save();
                g.translate(gx + 16, 0);
                g.scale(-1, 1);
                g.drawImage(grannyImgs[gi], -16, gy, 32, 32);
                g.restore();
            } else {
                g.drawImage(grannyImgs[gi], gx, gy, 32, 32);
            }
        }

        // 7) bigWaterfall FG（x544, y-16..200, w40）
        drawWaterfall(g, bx(FALL.x), by(FALL.y), FALL.w, FALL.h);

        // 场景统一在 drawCharacter 里合成后上屏（整屏 ColorGrade）。
    }

    // ===== 音效：只做映射，缺文件静默 =====
    function sfxPlay(name, volume) {
        if (!window.Sfx) return;
        window.Sfx.play(name, { volume: volume });
    }
    function sfxLoop(name, volume) {
        if (!window.Sfx) return;
        window.Sfx.loop(name, { volume: volume });
    }
    function sfxStop(name) {
        if (!window.Sfx) return;
        window.Sfx.stopLoop(name);
    }

    // ===== 输入（避开页面既有 Space / M / ↑↓）=====
    var KEYS = { left: 0, right: 0, up: 0, down: 0, jump: 0, jumpEdge: 0, dash: 0, dashEdge: 0, grab: 0 };
    var KEYMAP = {
        arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
        w: 'up', s: 'down', c: 'jump', x: 'dash', z: 'grab'
    };
    function typing() {
        var a = document.activeElement;
        if (!a) return false;
        var tag = (a.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable === true;
    }
    function resetKeys() { for (var k in KEYS) KEYS[k] = 0; }

    document.addEventListener('keydown', function (e) {
        if (typing()) return;
        var slot = KEYMAP[(e.key || '').toLowerCase()];
        if (!slot) return;
        e.preventDefault();
        if (e.repeat) return;
        if (!KEYS[slot]) {
            KEYS[slot] = 1;
            if (slot === 'jump') KEYS.jumpEdge = 1;
            if (slot === 'dash') KEYS.dashEdge = 1;
        }
    }, true);
    document.addEventListener('keyup', function (e) {
        var slot = KEYMAP[(e.key || '').toLowerCase()];
        if (slot) KEYS[slot] = 0;
    }, true);
    window.addEventListener('blur', resetKeys);

    function buildInput() {
        var inp = {
            left: !!KEYS.left, right: !!KEYS.right, up: !!KEYS.up, down: !!KEYS.down,
            jumpHeld: !!KEYS.jump, jumpPressed: !!KEYS.jumpEdge,
            dashHeld: !!KEYS.dash, dashPressed: !!KEYS.dashEdge,
            grabHeld: !!KEYS.grab, grabPressed: !!KEYS.grab
        };
        KEYS.jumpEdge = 0;
        KEYS.dashEdge = 0;
        return inp;
    }

    // ===== 人物 =====
    var CC = window.CelesteCharacter;
    var CH = { x: SPAWN, y: groundAt(SPAWN), vx: 0, vy: 0 };   // 未加载时水逻辑也能安全取值
    var ch = null;
    var ready = false;
    var mode = 'land';          // land | swim
    var prevState = 0;
    var sway = { inWater: false, lastSfx: 0 };
    var loop = { on: false, offAt: 0 };

    function approach(v, target, step) {
        return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
    }
    function loadImg(src) {
        return new Promise(function (res) {
            var img = new Image();
            img.onload = function () { res(img); };
            img.onerror = function () { res(null); };
            img.src = src;
        });
    }
    function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }

    function initCharacter() {
        if (!CC || !CC.create) return;
        var A = CC.ANIMS;
        // Sprites.xml：swimIdle 0-5 / swimUp 6-11 / swimDown 12-17，delay 0.08
        A.swimIdle = { path: 'swim', delay: 0.08, frames: range(0, 5) };
        A.swimUp = { path: 'swim', delay: 0.08, frames: range(6, 11) };
        A.swimDown = { path: 'swim', delay: 0.08, frames: range(12, 17) };
        // 共享引擎的 HAIR 表没有 swim；运行时补一条，避免游泳时头发整段隐藏。
        if (CC.HAIR && !CC.HAIR.swim) {
            CC.HAIR.swim = range(0, 17).map(function () { return { x: 0, y: -2, bang: 0 }; });
        }

        CC.create({ base: 'Atlases/Gameplay/characters/player', x: SPAWN, y: groundAt(SPAWN), facing: 1 })
            .then(function (c) {
                ch = c;
                CH = c;
                // 大写的 Swim12.png–Swim17.png：create() 按小写探测会 404，这里补载
                return Promise.all(range(12, 17).map(function (i) {
                    return loadImg('Atlases/Gameplay/characters/player/Swim' + i + '.png');
                })).then(function (imgs) {
                    var arr = c.sprite.textures.swim;
                    if (arr) imgs.forEach(function (img, k) { if (img) arr[12 + k] = img; });

                    c.setGround(function (x) { return groundAt(x); });
                    c.setWallAt(function (x, feetY, dir) {
                        var L = camLeft(), R = L + viewWidth();
                        if (dir > 0) {
                            if (x + BODY_HALF >= R) return R;
                            var wr = terrainWall(x, feetY, 1);
                            if (wr !== null) return wr;
                        } else {
                            if (x - BODY_HALF <= L) return L;
                            var wl = terrainWall(x, feetY, -1);
                            if (wl !== null) return wl;
                        }
                        return null;
                    });
                    c.setWallCollideFn(function (edgeX, feetY, dir) {
                        var L = camLeft(), R = L + viewWidth();
                        if (dir > 0 && edgeX >= R) return R;
                        if (dir < 0 && edgeX <= L) return L;
                        return null;
                    });

                    // 只在实例上覆盖动画分派；引擎文件与常量不动。
                    // 原作 UpdateSprite（Player.cs）：Swim 帧由 Input.MoveY 决定——
                    // MoveY>0 → swimDown，<0 → swimUp，==0 → swimIdle；与 Speed.Y 无关。
                    var baseAnim = c.updateSpriteAnim.bind(c);
                    c.updateSpriteAnim = function () {
                        if (mode === 'swim') {
                            var my = this._swimAimY || 0;
                            this.sprite.play(my > 0 ? 'swimDown' : (my < 0 ? 'swimUp' : 'swimIdle'));
                            return;
                        }
                        baseAnim();
                    };

                    ready = true;
                    charCvs.classList.add('is-ready');
                });
            })
            .catch(function () { /* 人物素材缺失时只保留水层 */ });
    }

    function updateWaterSfx(dt) {
        // 进水/出水：中心点跨越水体矩形；进水收缩、出水扩张，避免浅水边缘抖动
        var cx = CH.x, cy = CH.y - BODY_H / 2;
        var inside = sway.inWater;
        if (!inside) {
            if (cx > WATER.x + 1 && cx < WATER.x + WATER.w - 1 &&
                cy > WATER.y + 1 && cy < WATER.y + WATER.h - 1) inside = true;
        } else {
            if (!(cx > WATER.x - 1 && cx < WATER.x + WATER.w + 1 &&
                  cy > WATER.y - 1 && cy < WATER.y + WATER.h + 1)) inside = false;
        }

        if (inside !== sway.inWater) {
            var now = performance.now();
            sway.inWater = inside;
            // 0.32s 冷却：只拦重复音，不拦状态
            if (now - sway.lastSfx > 320) {
                sway.lastSfx = now;
                var deep = deepAt();
                if (inside) {
                    var dashing = CH.state === 2;
                    sfxPlay(dashing ? 'water_dash_in' : 'water_in', deep ? 1 : 0.6);
                    doRipple(CH.x);              // Water.Surface.DoRipple(absoluteCenter)
                } else {
                    var dashOut = CH.state === 2;
                    sfxPlay(dashOut ? 'water_dash_out' : 'water_out', deep ? 1 : 0.6);
                }
            }
        }

        // 冲刺入水：CallDashEvents 在 SwimCheck 成立时补 water_dash_gen
        if (CH.state === 2 && prevState !== 2 && swimCheck()) {
            sfxPlay('water_dash_gen', 0.9);
        }
        prevState = CH.state;

        // 浅水移动循环：Speed.X != 0 且（游泳近水面 或 步行触水）
        var shallow = Math.abs(CH.vx) > 2 && (
            (mode === 'swim' && !underwaterCheck()) ||
            (mode === 'land' && boxInWater(CH.x, CH.y))
        );
        var now2 = performance.now();
        if (shallow) {
            loop.offAt = 0;
            if (!loop.on) {
                loop.on = true;
                sfxLoop('water_move_shallow', 0.4);
            }
        } else if (loop.on) {
            if (!loop.offAt) loop.offAt = now2;
            if (now2 - loop.offAt > 140) {
                loop.on = false;
                loop.offAt = 0;
                sfxStop('water_move_shallow');
            }
        }
    }

    function updateCharacter(dt, input) {
        if (!ch) return;
        CH = ch;

        // 进入 Swim（原作 Player.Update：State==0 && SwimCheck() → State=3，无 vy 条件、无冷却）
        if (mode === 'land' && ch.state === 0 && swimCheck()) {
            mode = 'swim';
            ch._swimAimY = 0;
            if (ch.vy > 0) ch.vy *= 0.5;        // SwimBegin
            ch.refillStamina();                  // SwimBegin: Stamina = 110
        }

        var swam = false;
        if (mode === 'swim') {
            if (!swimCheck()) {
                mode = 'land';
                ch.setState(0);
            } else if (input.dashPressed && ch.canDash(input)) {
                // 原作 SwimUpdate 返回 2 → 交给 Normal 的 CanDash 起冲刺
                mode = 'land';
                ch.setState(0);
            } else if (input.jumpPressed && swimJumpCheck()) {
                mode = 'land';
                ch.setState(0);
                ch._moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
                ch.jump(false);                  // SwimJumpCheck → Jump(true, true)
            } else {
                var aimX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
                var aimY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
                if (aimX && aimY) { aimX *= Math.SQRT1_2; aimY *= Math.SQRT1_2; }
                var under = underwaterCheck();
                var maxX = under ? SWIM_MAX_UNDER : SWIM_MAX_SURFACE;

                // Speed.X：超速且同向时 400，否则 600（SwimUpdate IL）
                if (Math.abs(ch.vx) > SWIM_MAX_SURFACE &&
                    Math.sign(ch.vx) === Math.sign(aimX) && aimX !== 0) {
                    ch.vx = approach(ch.vx, maxX * aimX, 400 * dt);
                } else {
                    ch.vx = approach(ch.vx, maxX * aimX, 600 * dt);
                }

                ch._swimAimY = aimY;
                // Speed.Y（SwimUpdate IL）：
                //   1) 无纵向输入且 18px 上方无水 → 自动上浮到 -60
                //   2) MoveY>=0 或在水下 → 朝 80*MoveY 收敛（超速且同向 400，否则 600）
                //   3) MoveY<0 且不在水下 → Speed.Y 不变
                if (aimY === 0 && swimRiseCheck()) {
                    ch.vy = approach(ch.vy, -60, 600 * dt);
                } else if (aimY >= 0 || under) {
                    if (Math.abs(ch.vy) > 80 && Math.sign(ch.vy) === Math.sign(aimY) && aimY !== 0) {
                        ch.vy = approach(ch.vy, 80 * aimY, 400 * dt);
                    } else {
                        ch.vy = approach(ch.vy, 80 * aimY, 600 * dt);
                    }
                }

                ch.x += ch.vx * dt;
                ch.y += ch.vy * dt;

                var L = camLeft(), R = L + viewWidth();
                ch.x = Math.max(L + BODY_HALF, Math.min(R - BODY_HALF, ch.x));
                // 池壁：游泳时同样受地形约束，避免穿过石壁
                var wl2 = terrainWall(ch.x, ch.y, -1);
                var wr2 = terrainWall(ch.x, ch.y, 1);
                if (wl2 !== null && ch.x < wl2) { ch.x = wl2; if (ch.vx < 0) ch.vx = 0; }
                if (wr2 !== null && ch.x > wr2) { ch.x = wr2; if (ch.vx > 0) ch.vx = 0; }
                var gy = groundAt(ch.x);
                if (ch.y >= gy) {
                    ch.y = gy;
                    if (ch.vy > 0) ch.vy = 0;
                }
                // 原作 Player.Update 水面吸附：State==3 且 Speed.Y∈[-60,0) 且在水面上方时，
                // 逐像素下压直到 SwimCheck 成立（防止浮出水面导致 Swim/Normal 反复切换）
                if (ch.vy < 0 && ch.vy >= -60 && overWater()) {
                    var guard = 0;
                    while (!swimCheck() && guard++ < 32) {
                        ch.vy = 0;
                        if (ch.y + 1 > groundAt(ch.x)) break;
                        ch.y += 1;
                    }
                }
                if (ch.vx > 1) ch.facing = 1;
                else if (ch.vx < -1) ch.facing = -1;
                ch.onGround = false;
                ch.updateSharedVisuals(dt);
                swam = true;
            }
        }

        if (!swam) ch.update(dt, input);
        updateWaterSfx(dt);
    }

    // 角色层：与房间/水同一张 320×180 网格。toBuffer 把世界坐标映射到整数像素，
    // Character.draw 内部还会对 Position 取整（原作 Sprite.RenderPosition），物理仍走浮点。
    function toBuffer(p) {
        return { x: Math.round(p.x - camLeft()), y: Math.round(p.y - (GROUND - BUF_H)) };
    }
    // ===== Style.Foregrounds（地图 Style 数据，见 6-Reflection.bin）=====
    //   parallax vignette  : alpha 0.6，scroll 0/0，320×180，AlphaBlend（屏幕空间静态）
    //   parallax darkswamp : blendmode additive，alpha 0.55，speed 8/4，scroll 0.5，
    //                        500×280，loopx/loopy，color ffffff
    //   godrays            : exclude 'start,b-*,boss-*' → 本房 b-00 被排除，不生效
    //   snowFg             : only 'start' + flag 'duskbg' → 不生效
    //   petals             : flag 'badeline_connection' → 本页无剧情 flag，不生效
    //   reflectionfg       : exclude 'start'，但缺实现（保留结论，不硬编）
    // Foregrounds 画在实体之后（玩家之上）。
    function drawForegroundStyles(g) {
        if (vignetteImg) {
            g.save();
            g.globalAlpha = 0.6;
            g.drawImage(vignetteImg, 0, 0, BUF_W, BUF_H);
            g.restore();
        }
        if (fogImg) {
            var fw = 500, fh = 280;
            var ox = -((roomT * 8) % fw);
            var oy = -((roomT * 4) % fh);
            g.save();
            g.globalCompositeOperation = 'lighter';
            // additive 在 XNA 里是 SourceAlpha + One：顶点色 RGB 与 A 都乘 0.55，
            // 实际贡献 = 纹理 * 0.55 * 0.55 = 0.3025，canvas 'lighter' 只乘一次。
            g.globalAlpha = 0.55 * 0.55;
            for (var fy = oy - fh; fy < BUF_H; fy += fh) {
                for (var fx = ox - fw; fx < BUF_W; fx += fw) {
                    g.drawImage(fogImg, Math.round(fx), Math.round(fy), fw, fh);
                }
            }
            g.restore();
        }
    }

    // ===== ColorGrade：第六章 AreaData.ColorGrade = "reflection" =====
    // 依据：Celeste.dll → AreaData 里第 6 章 stfld AreaData.ColorGrade = "reflection"；
    //      Level.Render 稳态调用 ColorGrade.Set(name)（ColorGradeSingle 技法）。
    // LUT：Content/Graphics/ColorGrading/reflection.png = 256×16 的 16³ 查找表，
    //      x = b*16 + r，y = g（用 none.png 逐格验过是恒等表）。
    // 着色器对 LUT 采样是线性的。直接对每张像素 6 次闭包 tap 太慢，改成预烘焙：
    // 把 16³ 源表用三线性上采样到 32³（32768 条目，Uint32 打包 ~128KB），
    // 运行时每像素 8 次 Uint32 读 + 纯算术混合，无闭包/无 lutData 坐标计算。
    var LUT_RES = 32;
    var LUT_R3 = LUT_RES * LUT_RES;           // 1024
    var lutImg = null, lutData = null;
    var lutPacked = null;                     // Uint32Array[32768]

    function buildLut() {
        if (!lutImg) return;
        var c = document.createElement('canvas');
        c.width = 256; c.height = 16;
        var g = c.getContext('2d');
        g.drawImage(lutImg, 0, 0);
        try {
            lutData = g.getImageData(0, 0, 256, 16).data;
        } catch (e) {
            lutData = null;
            return;
        }
        var S = LUT_RES, S16 = 16 / S;
        lutPacked = new Uint32Array(S * S * S);
        for (var bi = 0; bi < S; bi++) {
            var bfx = bi * S16;
            var b0 = bfx | 0, bt = bfx - b0;
            if (b0 >= 15) { b0 = 15; bt = 0; }
            var b1 = b0 + 1; if (b1 > 15) b1 = 15;
            for (var gi = 0; gi < S; gi++) {
                var gfx = gi * S16;
                var y0 = gfx | 0, gt = gfx - y0;
                if (y0 >= 15) { y0 = 15; gt = 0; }
                var y1 = y0 + 1; if (y1 > 15) y1 = 15;
                for (var ri = 0; ri < S; ri++) {
                    var rfx = ri * S16;
                    var rx0 = rfx | 0, rt = rfx - rx0;
                    if (rx0 >= 15) { rx0 = 15; rt = 0; }
                    var rx1 = rx0 + 1; if (rx1 > 15) rx1 = 15;
                    function ls(bb, yy, rr, k) { return lutData[((yy * 256 + bb * 16 + rr) * 4) + k]; }
                    function m2(aa, bb, t) { return aa + (bb - aa) * t; }
                    var out = 0;
                    for (var kk = 0; kk < 3; kk++) {
                        var c000 = ls(b0, y0, rx0, kk), c100 = ls(b0, y0, rx1, kk);
                        var c010 = ls(b0, y1, rx0, kk), c110 = ls(b0, y1, rx1, kk);
                        var c001 = ls(b1, y0, rx0, kk), c101 = ls(b1, y0, rx1, kk);
                        var c011 = ls(b1, y1, rx0, kk), c111 = ls(b1, y1, rx1, kk);
                        var c00 = m2(c000, c100, rt), c10 = m2(c010, c110, rt);
                        var c01 = m2(c001, c101, rt), c11 = m2(c011, c111, rt);
                        var c0 = m2(c00, c10, gt), c1 = m2(c01, c11, gt);
                        var v = m2(c0, c1, bt);
                        out |= (v | 0) << (kk * 8);
                    }
                    lutPacked[(bi * LUT_R3) + (gi * S) + ri] = out;
                }
            }
        }
    }

    function applyColorGrade(g) {
        if (!lutPacked) return;
        var img = g.getImageData(0, 0, BUF_W, BUF_H);
        var d = img.data;
        var S = LUT_RES, S1 = S - 1;
        for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            var ri = (d[i] * S1) >> 7;
            var gi = (d[i + 1] * S1) >> 7;
            var bi = (d[i + 2] * S1) >> 7;
            var rf = (d[i] * S1 & 127) / 128;
            var gf = (d[i + 1] * S1 & 127) / 128;
            var bf = (d[i + 2] * S1 & 127) / 128;
            var ri1 = ri + 1; if (ri1 > S1) ri1 = S1;
            var gi1 = gi + 1; if (gi1 > S1) gi1 = S1;
            var bi1 = bi + 1; if (bi1 > S1) bi1 = S1;
            var b0 = bi * LUT_R3, b1 = bi1 * LUT_R3;
            function pk(b, gg, r) { return lutPacked[b + gg * S + r]; }
            var p000 = pk(b0, gi, ri),   p100 = pk(b0, gi, ri1);
            var p010 = pk(b0, gi1, ri),  p110 = pk(b0, gi1, ri1);
            var p001 = pk(b1, gi, ri),   p101 = pk(b1, gi, ri1);
            var p011 = pk(b1, gi1, ri),  p111 = pk(b1, gi1, ri1);
            function ex(p) { return [p & 255, p >> 8 & 255, p >> 16]; }
            var e000 = ex(p000), e100 = ex(p100), e010 = ex(p010), e110 = ex(p110);
            var e001 = ex(p001), e101 = ex(p101), e011 = ex(p011), e111 = ex(p111);
            function m2(a, b, t) { return a + (b - a) * t; }
            for (var k = 0; k < 3; k++) {
                var r00 = m2(e000[k], e100[k], rf), r10 = m2(e010[k], e110[k], rf);
                var r01 = m2(e001[k], e101[k], rf), r11 = m2(e011[k], e111[k], rf);
                var v0 = m2(r00, r10, gf), v1 = m2(r01, r11, gf);
                d[i + k] = m2(v0, v1, bf) | 0;
            }
        }
        g.putImageData(img, 0, 0);
    }

    function drawCharacter() {
        if (!charCtx) return;
        charCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        if (!ready || !ch) return;
        charG.clearRect(0, 0, BUF_W, BUF_H);
        charG.imageSmoothingEnabled = false;
        ch.draw(charG, toBuffer, 1);
        drawForegroundStyles(charG);

        // 整屏后处理：房间 → 水 → 角色/Foregrounds 合成后过 ColorGrade，再上屏
        sceneG.clearRect(0, 0, BUF_W, BUF_H);
        sceneG.imageSmoothingEnabled = false;
        sceneG.drawImage(offRoom, 0, 0);
        sceneG.drawImage(offWater, 0, 0);
        sceneG.drawImage(offChar, 0, 0);
        applyColorGrade(sceneG);
        blitOffscreen(charCtx, offScene);
    }

    // ===== 主循环 =====
    var last = 0;
    var raf = 0;
    function tick(now) {
        var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;

        drawRoom(reduceMotion && reduceMotion.matches ? 0 : dt);
        drawWater(reduceMotion && reduceMotion.matches ? 0 : dt);

        if (ready && ch) {
            var input = buildInput();
            updateCharacter(dt, input);
            drawCharacter();
        }

        raf = window.requestAnimationFrame(tick);
    }

    function boot() {
        last = 0;
        raf = window.requestAnimationFrame(tick);
        loadRoom();
        initCharacter();
    }

    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot, { once: true });
})();
