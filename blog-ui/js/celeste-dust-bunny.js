/* ================================================================
 * Celeste 灰尘兔（Dust Bunny）· REA 移植（原作实体 Celeste.DustGraphic）
 *
 * 取证：本地安装文件 C:\Program Files (x86)\Steam\steamapps\common\Celeste\Celeste.dll
 *   Celeste.DustGraphic .ctor
 *     Scale = 1；EyeFlip = 1；leftEyeVisible = rightEyeVisible = true；
 *     center = Calc.Random.Choose(GFX.Game.GetAtlasSubtextures("danger/dustcreature/center"))
 *     offset = rand*4（未使用）；timer = rand；EyeDirection = EyeTargetDirection = AngleToVector(rand*2π, 1)
 *     eyeTextureIndex = Random.Next(128)；eyesExist = true
 *     （autoControlEyes=false 时不掷 0.5/0.3 概率，eyesFollowPlayer 恒 false）
 *   Celeste.DustGraphic .Update
 *     timer += DeltaTime * 0.6；shakeTimer 逻辑（无调用者，见缺口）；
 *     眼睛缓动：EyeDirection = Calc.Approach(EyeDirection, EyeTargetDirection, 12*dt)；
 *     blink?.Update()；nodes 为空且未 Establish → AddDustNodesIfInCamera() 后 return；
 *     每帧 node.Rotation += DeltaTime * 0.5
 *   Celeste.DustGraphic .AddDustNodesIfInCamera
 *     4 个节点方向 = SafeNormalize(±1, ±1)；ignoreSolids=true 时 Enabled 全为 true；
 *     eyesMoveByRotation = (enabled 数 < 4)；eyesExist → blink = Coroutine(BlinkRoutine())
 *     eyes 贴图 = DustStyles.Get(scene).EyeTextures 的第 (eyeTextureIndex % count) 张；
 *     Estableshed = true
 *   Celeste.DustGraphic+Node（字段 Base/Overlay/Rotation/Angle/Enabled）
 *     Base = Choose("danger/dustcreature/base" 的 3 张)；Overlay = Choose(".../overlay" 的 3 张)；
 *     Rotation = rand*2π；Angle = 方向 * (1,1)（ignoreSolids 时不做贴墙拉伸）；Enabled = 传入值
 *   Celeste.DustGraphic+Eyeballs .Render
 *     眼位 = RenderPosition + (EyeDirection*5 ± perp*3) * Scale，perp = SafeNormalize(-dir.Y, dir.X)；
 *     颜色 = DustStyles.Get(scene).EyeColor；Depth = 兔深度 - 1（画在兔之上）
 *   Celeste.DustGraphic+<BlinkRoutine>d__45
 *     循环：等 2 + rand*1.5 → 左眼闭 → 等 0.02 + rand*0.05 → 右眼闭 → 等 0.25 → 双眼睁开
 *   Celeste.DustGraphic .Render
 *     InView 才画；每个 Enabled 节点：Base(pos + Angle*Scale, White, Scale, Rotation)；
 *     Overlay 同位置、Rotation 取反；最后 center(pos, White, Scale, timer)
 *   Celeste.DustStyles .cctor
 *     Area 3（默认回退）样式：EdgeColors #f25a10/#ff0000/#f21067，EyeColor = Red，
 *     EyeTextures = "danger/dustcreature/eyes"（eyes00-02）
 *   Celeste.CS07_Credits+<DustyRoutine>d__30（全库唯一 newobj DustGraphic 的位置）
 *     dust 组起点 = oshiro.Position + (220, -24)，3 只、水平间隔 24、Entity.Depth = -50；
 *     创建参数：ignoreSolids = true、autoControlEyes = false、autoExpandDust = true；
 *     之后先等 3.8s，然后每帧：
 *       bunny[i].X = offset.X + i*24；bunny[i].Y = offset.Y + sin(timer*4 + i*0.8) * 4；
 *       offset.Y = Approach(offset.Y, start.Y + 16, DeltaTime*16)；offset.X -= 26*DeltaTime；
 *       timer += DeltaTime；
 *       直到 offset.X < level.Bounds.Left + 120 才停下
 *     （原作每只还挂 decals/3-resort/brokenbox_*；商店页按需求不画箱子，见缺口 5。）
 *
 * 素材（全部来自 blog-ui/Atlases，已逐帧核对存在）：
 *   Gameplay/danger/dustcreature/：base00-02、overlay00-02、center00、eyes00-02、deadEyes
 *   实测尺寸：base/overlay/center = 16×16，eyes/deadEyes = 8×8；
 *   眼贴图为「黑圈 + 2×2 纯白瞳孔」，DustStyles[3].EyeColor = Red 乘算 → 黑圈 + 红瞳。
 *
 * 缺口（诚实标注）：
 *   1. Celeste.DustEdge / Celeste.DustEdges（dust 边缘渲染钩子与整屏 dust 噪声）未移植：
 *      商店页没有 level 级 dust 边缘系统，DustEdge 只是把兔子的 Render 传给 DustEdges 的钩子。
 *   2. DustGraphic.OnHitPlayer（shakeTimer=0.6、眼睛换 deadEyes）在原作全库没有任何调用者
 *      （creds 里兔子不参与受伤流程）→ 未接线，避免自创交互。
 *   3. randomSeed + System.Random 序列未复刻，贴图/眼球贴图选择用 Math.random；
 *      形状随机性一致，具体序列不可复现。
 *   4. bristle.png 在 DustGraphic IL 中未被引用 → 未使用。
 *   5. 箱子（brokenbox_a/b/c）按用户要求移除：DustyRoutine 里它是独立 decal，
 *      与 DustGraphic 本体无关；去掉不影响兔子自身的 IL 行为。
 *   6. autoExpandDust 的贴墙拉伸未做：AddNode 会用场景 Solid 在 ±16px 处探测并把
 *      Angle 分量放大到 5（依墙展开）；本模块不持有场景碰撞，且兔子在空房间跑动，
 *      创建时四周无实心，原作此处同样得到 (1,1)。
 * ================================================================ */
(function (global) {
    'use strict';

    var DUST_DIR = 'Atlases/Gameplay/danger/dustcreature/';
    var EYE_COLOR = '#ff0000';                 // DustStyles[3].EyeColor = Color.Red

    // —— 原文字面量（逐条对应上面的 IL 取证） ——
    var SPEED = 26;                            // DustyRoutine：offset.X -= 26 * DeltaTime
    var SPACING = 24;                          // 每只间隔 24px
    var BOB_FREQ = 4;                          // sin(timer*4 + i*0.8)
    var BOB_PHASE = 0.8;
    var BOB_AMP = 4;                           // * 4
    var SINK_RATE = 16;                        // Approach(offset.Y, start.Y+16, dt*16)
    var SINK_DIST = 16;                        // start.Y + 16
    var EYE_OFFSET = 5;                        // Eyeballs.Render：EyeDirection * 5
    var EYE_SEP = 3;                           //              ± perp * 3
    var NODE_SPIN = 0.5;                       // Update：node.Rotation += dt * 0.5
    var CENTER_SPIN = 0.6;                     // Update：timer += dt * 0.6
    var DIAG = Math.SQRT1_2;                   // SafeNormalize(1,1)
    var GROUP_SIZE = 3;                        // DustyRoutine：3 只
    var GROUP_DELAY = 3.8;                     // DustyRoutine：生成后先等 3.8s

    // —— 素材缓存 ——
    var A = {
        base: [null, null, null],
        overlay: [null, null, null],
        center: [null],
        eyes: [null, null, null],
        deadEyes: null,
        ready: false
    };

    function loadImg(src) {
        return new Promise(function (res) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { res(null); };       // 缺图不阻断，绘制时跳过
            im.src = src;
        });
    }

    // Color.Red 乘算贴图：原作 eyes 是「黑底 + 纯白像素」，White*Red → 红眼。
    // 用 canvas 'multiply' 复刻同样的乘算（黑保持不变、白变红）。
    // 注意：'multiply' 的合成方式仍是 source-over，透明像素会被直接涂成红色（整块红方块）——
    // 所以最后用 'destination-in' 再画一次原图，把原来的 alpha（透明边缘/中空）还原回来。
    function tintRed(img) {
        if (!img) return null;
        if (typeof document === 'undefined') return img;
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = EYE_COLOR;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(img, 0, 0);
        return c;
    }

    function pad2(i) { return String(i).padStart(2, '0'); }

    function load() {
        if (A.ready) return Promise.resolve(A);
        var jobs = [];
        for (var i = 0; i < 3; i++) (function (i) {
            jobs.push(loadImg(DUST_DIR + 'base' + pad2(i) + '.png').then(function (im) { A.base[i] = im; }));
            jobs.push(loadImg(DUST_DIR + 'overlay' + pad2(i) + '.png').then(function (im) { A.overlay[i] = im; }));
            jobs.push(loadImg(DUST_DIR + 'eyes' + pad2(i) + '.png').then(function (im) { A.eyes[i] = tintRed(im); }));
        })(i);
        jobs.push(loadImg(DUST_DIR + 'center00.png').then(function (im) { A.center[0] = im; }));
        jobs.push(loadImg(DUST_DIR + 'deadEyes.png').then(function (im) { A.deadEyes = tintRed(im); }));
        return Promise.all(jobs).then(function () { A.ready = true; return A; });
    }

    function approach(v, target, amount) {       // Calc.Approach
        return v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
    }

    // ===== DustGraphic：一只灰兔 =====
    function createBunny(x, y) {
        var b = {
            x: x, y: y,
            Scale: 1,                            // IL：.ctor 里 Scale = 1.0
            nodes: [],
            centerIndex: 0,                      // center 图集只有 center00 一张
            eyesExist: true,
            eyeTextureIndex: Math.floor(Math.random() * 128),   // Random.Next(128)
            leftEyeVisible: true,
            rightEyeVisible: true,
            timer: Math.random(),                // IL：timer = rand（Render 里 center 的旋转角）
            EyeDirection: null,
            EyeTargetDirection: null,
            blink: null
        };

        // IL：AddDustNodesIfInCamera —— 4 个方向 = SafeNormalize(±1, ±1)
        var dirs = [[-DIAG, -DIAG], [DIAG, -DIAG], [-DIAG, DIAG], [DIAG, DIAG]];
        for (var i = 0; i < 4; i++) {
            b.nodes.push({
                Base: Math.floor(Math.random() * 3),        // Choose(base00-02)
                Overlay: Math.floor(Math.random() * 3),     // Choose(overlay00-02)
                Rotation: Math.random() * Math.PI * 2,      // rand*2π
                // Angle = 方向 * local0；ignoreSolids=true → local0 恒为 (1,1)（无贴墙拉伸）
                Angle: { x: dirs[i][0], y: dirs[i][1] },
                Enabled: true                               // ignoreSolids=true → 4 个全开
            });
        }

        var ang = Math.random() * Math.PI * 2;              // AngleToVector(rand*2π, 1)
        b.EyeDirection = { x: Math.cos(ang), y: Math.sin(ang) };
        b.EyeTargetDirection = { x: b.EyeDirection.x, y: b.EyeDirection.y };

        // IL：eyesExist → blink = Coroutine(BlinkRoutine())，首帧从「等 2+rand*1.5」开始
        b.blink = { state: 0, t: 2 + Math.random() * 1.5 };

        b.update = function (dt) {
            b.timer += dt * CENTER_SPIN;                    // IL：timer += dt*0.6
            // IL：<BlinkRoutine>d__45 —— 等 → 左闭 → 等 → 右闭 → 0.25s → 双开
            var bl = b.blink;
            if (bl) {
                bl.t -= dt;
                if (bl.t <= 0) {
                    if (bl.state === 0) {
                        b.leftEyeVisible = false;
                        bl.state = 1; bl.t = 0.02 + Math.random() * 0.05;
                    } else if (bl.state === 1) {
                        b.rightEyeVisible = false;
                        bl.state = 2; bl.t = 0.25;
                    } else {
                        b.leftEyeVisible = true; b.rightEyeVisible = true;
                        bl.state = 0; bl.t = 2 + Math.random() * 1.5;
                    }
                }
            }
            for (var n = 0; n < b.nodes.length; n++) {
                b.nodes[n].Rotation += dt * NODE_SPIN;       // IL：node.Rotation += dt*0.5
            }
        };

        b.draw = function (ctx, toScreen, Z) {
            if (!A.ready) return;
            var rp = toScreen({ x: b.x, y: b.y });           // RenderPosition = Entity.Position + Position
            var sc = Z * b.Scale;

            function drawCentered(img, px, py, rot) {
                if (!img) return;
                var w = img.width * sc, h = img.height * sc;
                ctx.save();
                ctx.translate(px, py);
                if (rot) ctx.rotate(rot);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            }

            // IL：Render —— 先 4 个节点的 Base/Overlay，再 center
            for (var i = 0; i < b.nodes.length; i++) {
                var nd = b.nodes[i];
                if (!nd.Enabled) continue;
                var nx = rp.x + nd.Angle.x * b.Scale * Z;
                var ny = rp.y + nd.Angle.y * b.Scale * Z;
                drawCentered(A.base[nd.Base], nx, ny, nd.Rotation);
                drawCentered(A.overlay[nd.Overlay], nx, ny, -nd.Rotation);   // IL：overlay 旋转取反
            }
            drawCentered(A.center[b.centerIndex], rp.x, rp.y, b.timer);

            // IL：Eyeballs.Render —— dir 用当前 EyeDirection（AngleToVector 存的是角度向量）
            var dir = b.EyeDirection;
            var perp = { x: -dir.y, y: dir.x };
            var eyeImg = A.eyes[b.eyeTextureIndex % A.eyes.length];
            if (b.leftEyeVisible) {
                drawCentered(eyeImg,
                    rp.x + (dir.x * EYE_OFFSET + perp.x * EYE_SEP) * b.Scale * Z,
                    rp.y + (dir.y * EYE_OFFSET + perp.y * EYE_SEP) * b.Scale * Z, 0);
            }
            if (b.rightEyeVisible) {
                drawCentered(eyeImg,
                    rp.x + (dir.x * EYE_OFFSET - perp.x * EYE_SEP) * b.Scale * Z,
                    rp.y + (dir.y * EYE_OFFSET - perp.y * EYE_SEP) * b.Scale * Z, 0);
            }
        };

        return b;
    }

    // ===== CS07_Credits.DustyRoutine：一组 3 只，向左跑 =====
    function createGroup(startX, startY) {
        var g = {
            offset: { x: startX, y: startY },
            start: { x: startX, y: startY },
            timer: 0,
            bunnies: []
        };
        // IL：Entity(oshiro.Position + (220, -24) + (i*24, 0))，Depth = -50，
        //     实体挂在 DustGraphic(ignoreSolids=true, autoControlEyes=false, autoExpandDust=true)
        for (var i = 0; i < GROUP_SIZE; i++) {
            g.bunnies.push(createBunny(startX + i * SPACING, startY));
        }
        // IL：先 yield return 3.8，之后才进入运动循环
        g.wait = GROUP_DELAY;

        g.step = function (dt) {
            // IL：DustGraphic.Update 由引擎每帧驱动（与 coroutine 的 3.8s 等待无关）
            for (var j = 0; j < g.bunnies.length; j++) g.bunnies[j].update(dt);
            if (g.wait > 0) { g.wait -= dt; return; }
            for (var i = 0; i < g.bunnies.length; i++) {
                var b = g.bunnies[i];
                b.x = g.offset.x + i * SPACING;
                b.y = g.offset.y + Math.sin(g.timer * BOB_FREQ + i * BOB_PHASE) * BOB_AMP;
            }
            g.offset.y = approach(g.offset.y, g.start.y + SINK_DIST, dt * SINK_RATE);
            g.offset.x -= SPEED * dt;
            g.timer += dt;
        };

        g.draw = function (ctx, toScreen, Z) {
            // 3.8s 等待期内不画：商店页没有 credits 的过场铺垫，悬在半空会显得穿帮
            if (g.wait > 0) return;
            for (var i = 0; i < g.bunnies.length; i++) g.bunnies[i].draw(ctx, toScreen, Z);
        };

        return g;
    }

    global.CelesteDustBunny = {
        // 常量（测试与文档用）
        SPEED: SPEED, SPACING: SPACING, BOB_FREQ: BOB_FREQ, BOB_PHASE: BOB_PHASE, BOB_AMP: BOB_AMP,
        SINK_RATE: SINK_RATE, SINK_DIST: SINK_DIST, EYE_OFFSET: EYE_OFFSET, EYE_SEP: EYE_SEP,
        NODE_SPIN: NODE_SPIN, CENTER_SPIN: CENTER_SPIN, GROUP_SIZE: GROUP_SIZE, GROUP_DELAY: GROUP_DELAY,
        DIAG: DIAG, EYE_COLOR: EYE_COLOR,
        load: load,
        ready: function () { return A.ready; },
        assets: A,
        createBunny: createBunny,
        createGroup: createGroup
    };
})(window);
