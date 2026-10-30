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
 *   Celeste.CS07_Credits+<DustyRoutine>d__30（credits 的一次性演出；第三章三种 dust spinner
 *     也用同一个 DustGraphic，见下方「第三章轨道」段）
 *     dust 组起点 = oshiro.Position + (220, -24)，3 只、水平间隔 24、Entity.Depth = -50；
 *     创建参数：ignoreSolids = true、autoControlEyes = false、autoExpandDust = true；
 *     之后先等 3.8s，然后每帧：
 *       bunny[i].X = offset.X + i*24；bunny[i].Y = offset.Y + sin(timer*4 + i*0.8) * 4；
 *       offset.Y = Approach(offset.Y, start.Y + 16, DeltaTime*16)；offset.X -= 26*DeltaTime；
 *       timer += DeltaTime；
 *       直到 offset.X < level.Bounds.Left + 120 才停下
 *     （原作每只还挂 decals/3-resort/brokenbox_*；商店页按需求不画箱子，见缺口 5。）
 *
 *   —— 第三章轨道（第二轮 REA，§22.6）：DustGraphic 的三个 spinner 宿主 ——
 *   全库 newobj DustGraphic 共 4 处：credits 那 1 处 + 下面 3 个 spinner。
 *   Celeste.DustStaticSpinner（new DustGraphic(this, bool, true, true)，本体不位移）
 *     Update：Scene.OnInterval(0.05f, offset) 时 ParticlesBG.Emit(P_Move, 1, Position, One*4)
 *   Celeste.DustTrackSpinner（new DustGraphic(this, true, false, false)）
 *     .ctor：EyeTargetDirection = EyeDirection = SafeNormalize(End - Start)
 *     OnEstablish：沿轨道两侧各探 4px，找空侧得 outwards，眼睛 = AngleLerp(Angle(outwards),
 *                  Up ? Angle+π : Angle, 0.3)（以「朝轨外」为主）；并 Position -= perp
 *     Update：TrackSpinner.Update 驱动 Percent；移动中每 0.02s 发 1 粒 P_Move
 *     OnTrackEnd：眼睛转向新的行进方向（AngleLerp 权重 0.3）
 *   Celeste.DustRotateSpinner（new DustGraphic(this, true, false, false)）
 *     Update：RotateSpinner 驱动 rotationPercent；每 0.02s 发 1 粒 P_Move；
 *             眼睛朝切线 = AngleToVector(Angle + π/2 * (Clockwise ? -1 : 1))
 *   Celeste.TrackSpinner
 *     .cctor：MoveTimes = {0.9, 0.4, 0.3}、PauseTimes = {0.3, 0.2, 0.6}
 *             （FieldRva 实测 3f×3；按 EntityData int("speed", 1) 取下标）
 *     Update：Percent = Calc.Approach(Percent, Up ? 1 : 0, DeltaTime / MoveTimes[Speed])；
 *             到位 → Up 取反、PauseTimer = PauseTimes[Speed]、OnTrackEnd()
 *     UpdatePosition：Position = Vector2.Lerp(Start, End, Ease.SineInOut(Percent))
 *   Celeste.RotateSpinner
 *     Update：rotationPercent += (Clockwise ? -1 : 1) * DeltaTime / 1.8f（1.8s 一圈，%1 回卷）
 *     Angle = MathHelper.Lerp(-π/2, 3π/2, Percent)；Position = center + AngleToVector(Angle)*length
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
 *   7. P_Move 拖尾贴图未取证（文档 D8）：DustStaticSpinner.P_Move 是 static ParticleType，但全库
 *      找不到任何写入点（Field 令牌扫描 0 命中）；商店页用 1.5px 橙色小方点近似，
 *      颜色取 DustStyles[3].EdgeColors[0]，发射间隔与 4px 散布仍按 IL。
 *   8. 「数量 + 轨迹随机组合」是商店页场景层设计：原作第三章的 dust spinner 是手工
 *      摆在固定轨道上的，没有随机生成逻辑。
 *   9. OnTrackEnd / OnSpin 回调未接线（文档 D9）：原作由 spinner 触发机关音效与地图事件，
 *      商店页没有对应系统。
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
    var EYE_APPROACH = 12;                     // Update：EyeDirection = Approach(EyeTarget, 12*dt)
    var DIAG = Math.SQRT1_2;                   // SafeNormalize(1,1)
    var GROUP_SIZE = 3;                        // DustyRoutine：3 只
    var GROUP_DELAY = 3.8;                     // DustyRoutine：生成后先等 3.8s

    // —— 第三章 dust spinner 轨道（TrackSpinner / RotateSpinner 的 IL）——
    var MOVE_TIMES = [0.9, 0.4, 0.3];          // TrackSpinner.cctor（FieldRva 实测 3f×3）
    var PAUSE_TIMES = [0.3, 0.2, 0.6];         // TrackSpinner.cctor
    var ORBIT_PERIOD = 1.8;                    // RotateSpinner.Update：dt / 1.8f 一圈

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
            // IL：EyeDirection = Calc.Approach(EyeDirection, EyeTargetDirection, 12*dt)
            if (b.EyeTargetDirection) {
                b.EyeDirection.x = approach(b.EyeDirection.x, b.EyeTargetDirection.x, EYE_APPROACH * dt);
                b.EyeDirection.y = approach(b.EyeDirection.y, b.EyeTargetDirection.y, EYE_APPROACH * dt);
            }
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

    // ================================================================
    // ===== 第三章「灰尘团」轨道基元（§22.6）=====
    // 原作把 DustGraphic 挂到三种 spinner 上，位移曲线就是下面四套；
    // 商店页把它们拆成可组合的轨迹基元，每条轨迹都是周期闭环（无限重复）。
    //   track  = DustTrackSpinner：Lerp(Start, End, SineInOut(Percent))，两端停顿
    //   orbit  = DustRotateSpinner：center + AngleToVector(-π/2 + Percent*2π) * length
    //   row    = Credits.DustyRoutine：26px/s 直线 + sin(timer*4 + i*0.8)*4，间距 24
    //   static = DustStaticSpinner：不位移
    // 叠层：bob（credits 的正弦纵向摆动）可叠加到任意轨迹上，用于扩充组合。
    // ================================================================
    var TRAIL_INTERVAL = { track: 0.02, orbit: 0.02, static: 0.05 };  // IL：Scene.OnInterval
    var TRAIL_TTL = 0.36;
    var TRAIL_MAX = 140;
    var TRAIL_RGB = '242,90,16';                                      // DustStyles[3].EdgeColors[0]

    function mod(a, n) { return ((a % n) + n) % n; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function sineInOut(t) { return (1 - Math.cos(Math.PI * t)) * 0.5; }   // Monocle Ease.SineInOut
    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    // —— 探针工具：probe.inside(x,y) 用世界坐标（原生像素，脚底 y=0）判定贴图四角是否在房内 ——
    function spanAt(probe, y) {
        var lo = null, hi = null, x;
        for (x = probe.minX; x <= probe.maxX; x += 2) {
            if (!probe.inside(x, y)) continue;
            if (lo === null) lo = x;
            hi = x;
        }
        if (probe.inside(probe.maxX, y)) { if (lo === null) lo = probe.maxX; hi = probe.maxX; }
        return lo === null ? null : { a: lo, b: hi };
    }
    function circleInside(probe, cx, cy, r) {
        for (var i = 0; i < 24; i++) {
            var a = i / 24 * Math.PI * 2;
            if (!probe.inside(cx + Math.cos(a) * r, cy + Math.sin(a) * r)) return false;
        }
        return true;
    }
    function segmentInside(probe, x0, y0, x1, y1) {
        for (var i = 0; i <= 16; i++) {
            var t = i / 16;
            if (!probe.inside(lerp(x0, x1, t), lerp(y0, y1, t))) return false;
        }
        return true;
    }
    // 叠了 bob 的轨迹会上下多摆 ±BOB_AMP，规划时把探针纵向撑开同样的量
    function padded(probe, d) {
        return {
            minX: probe.minX, maxX: probe.maxX, floorY: probe.floorY, ceilY: probe.ceilY,
            inside: function (x, y) { return probe.inside(x, y - d) && probe.inside(x, y + d); }
        };
    }

    // —— 轨迹 1：DustTrackSpinner（两点轨道往返 + 端点停顿） ——
    function trackTraj(o) {
        var dx = o.end.x - o.start.x, dy = o.end.y - o.start.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var moveTime = MOVE_TIMES[o.speed], pauseTime = PAUSE_TIMES[o.speed];
        var t = {
            fam: 'track', clock: 0, percent: o.percent, up: o.up, pause: 0,
            x: o.start.x, y: o.start.y, alpha: 1,
            target: { x: ux, y: uy }                      // IL：EyeTargetDirection = SafeNormalize(End-Start)
        };
        t.step = function (dt) {
            t.clock += dt;
            if (t.pause > 0) {
                t.pause = Math.max(0, t.pause - dt);       // IL：PauseTimer -= DeltaTime
            } else {
                var want = t.up ? 1 : 0;
                t.percent = approach(t.percent, want, dt / moveTime);   // IL：Approach(Percent, Up?1:0, dt/MoveTimes)
                if (t.percent === want) {                  // IL：到位 → Up 取反 + PauseTimer + OnTrackEnd
                    t.up = !t.up;
                    t.pause = pauseTime;
                    t.target.x = t.up ? ux : -ux;
                    t.target.y = t.up ? uy : -uy;
                }
            }
            var e = sineInOut(t.percent);                  // IL：Ease.SineInOut(Percent)
            t.x = lerp(o.start.x, o.end.x, e);
            t.y = lerp(o.start.y, o.end.y, e);
        };
        return t;
    }

    // —— 轨迹 2：DustRotateSpinner（圆周轨道，1.8s 一圈） ——
    function orbitTraj(o) {
        var period = ORBIT_PERIOD * o.mult;
        var t = { fam: 'orbit', clock: 0, p: o.p, angle: 0, x: o.cx, y: o.cy, alpha: 1, target: { x: 0, y: 0 } };
        var dir = o.clockwise ? -1 : 1;
        t.step = function (dt) {
            t.clock += dt;
            t.p = mod(t.p + dir * dt / period, 1);         // IL：rotationPercent += ±dt/1.8
            var a = -Math.PI / 2 + t.p * Math.PI * 2;      // IL：Lerp(-π/2, 3π/2, Percent)
            t.angle = a;
            t.x = o.cx + Math.cos(a) * o.r;
            t.y = o.cy + Math.sin(a) * o.r;
            var ea = a + Math.PI / 2 * (o.clockwise ? -1 : 1);   // IL：眼睛朝切线
            t.target.x = Math.cos(ea);
            t.target.y = Math.sin(ea);
        };
        t.step(0);
        return t;
    }

    // —— 轨迹 3：Credits.DustyRoutine（一行 26px/s 直线 + 每只 sin 摆动） ——
    // 原作是一次性演出（跑出边界就结束）；常驻房间改成“列车绕环”：
    // 环长 L = 可见弧(房间宽) + 隐藏弧(一格 24px)，每只 u 独立取模、间隔 24。
    // 于是右墙走出一只的同时左墙恰好走进一只（回卷永远发生在 alpha=0），
    // 既没有“整行回卷”造成的空窗，也不会穿墙瞬移。
    function rowTraj(o) {
        var span = o.b - o.a;
        var L = span + SPACING;                            // IL 间距 24 同时充当隐藏弧
        var u0 = o.u0 == null ? 0 : o.u0;
        var i0 = (o.i || 0) * SPACING;                     // IL：第 i 只 X = offset.X + i*24
        var t = {
            fam: 'row', clock: 0, sink: SINK_DIST, x: o.a, y: o.lane, alpha: 0,
            span: span, cycleLen: L,
            target: { x: o.dir, y: 0 }
        };
        t.step = function (dt) {
            t.clock += dt;
            t.sink = approach(t.sink, 0, dt * SINK_RATE);  // IL：Approach(Y, start.Y+16, dt*16)
            var u = mod(u0 + i0 + o.dir * SPEED * t.clock, L);
            var x = o.dir > 0 ? o.a + u : o.b - u;
            t.x = x;
            t.y = o.lane + Math.sin(t.clock * BOB_FREQ + o.phase) * BOB_AMP - t.sink;
            // 两端 14px 淡入淡出：回卷发生在 alpha=0 时，避免“穿墙瞬移”
            t.alpha = Math.max(0, Math.min(1, (x - o.a) / 14, (o.b - x) / 14));
        };
        t.step(0);
        return t;
    }

    // —— 轨迹 4：DustStaticSpinner（不位移） ——
    function staticTraj(o) {
        var a = Math.random() * Math.PI * 2;
        var t = {
            fam: 'static', clock: 0, x: o.x, y: o.y, alpha: 1,
            target: { x: Math.cos(a), y: Math.sin(a) }
        };
        t.step = function (dt) {
            t.clock += dt;
            t.x = o.x;                                     // staticTraj：原地（每帧回写基准值，供 addBob 叠加）
            t.y = o.y;
        };
        return t;
    }

    // —— 叠层：credits 的正弦纵向摆动（可加到任意轨迹上） ——
    function addBob(traj, phase) {
        var inner = traj.step;
        traj.step = function (dt) {
            inner(dt);
            traj.y += Math.sin(traj.clock * BOB_FREQ + phase) * BOB_AMP;
        };
        return traj;
    }

    // ===== 随机组合方案：数量 + 轨迹家族 + 参数 =====
    function planRow(probe, k) {
        for (var i = 0; i < 40; i++) {
            var lane = lerp(probe.floorY - 26, probe.floorY - 10, Math.random());
            var lo = spanAt(probe, lane - 5), hi = spanAt(probe, lane + 5);
            if (!lo || !hi) continue;
            var a = Math.max(lo.a, hi.a), b = Math.min(lo.b, hi.b);
            if (b - a < 110) continue;
            return { kind: 'row', k: k, lane: lane, a: a, b: b,
                     dir: Math.random() < 0.5 ? 1 : -1,
                     u0: Math.random() * (b - a) };
        }
        return null;
    }
    function planOrbit(probe) {
        var pv = padded(probe, BOB_AMP);
        for (var i = 0; i < 80; i++) {
            var r = 8 + Math.random() * 18;
            var cx = lerp(probe.minX, probe.maxX, Math.random());
            var cy = lerp(probe.ceilY, probe.floorY, Math.random());
            if (!circleInside(pv, cx, cy, r)) continue;
            return { kind: 'orbit', cx: cx, cy: cy, r: r,
                     clockwise: Math.random() < 0.5,
                     mult: [1, 1, 1, 1.5, 2][Math.floor(Math.random() * 5)],
                     p: Math.random(), bob: Math.random() < 0.45 };
        }
        return null;
    }
    function planTrack(probe) {
        var pv = padded(probe, BOB_AMP);
        for (var i = 0; i < 80; i++) {
            var x0 = lerp(probe.minX, probe.maxX, Math.random());
            var y0 = lerp(probe.ceilY, probe.floorY, Math.random());
            var len = 40 + Math.random() * 110;
            var ang = Math.random() * Math.PI * 2;
            var x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
            if (!pv.inside(x0, y0) || !segmentInside(pv, x0, y0, x1, y1)) continue;
            var pct = Math.random();
            return { kind: 'track', start: { x: x0, y: y0 }, end: { x: x1, y: y1 },
                     speed: [0, 1, 1, 2][Math.floor(Math.random() * 4)],
                     percent: pct, up: pct < 0.5, bob: Math.random() < 0.35 };
        }
        return null;
    }
    function planStatic(probe) {
        var pv = padded(probe, BOB_AMP);
        for (var i = 0; i < 120; i++) {
            var x = lerp(probe.minX, probe.maxX, Math.random());
            var y = lerp(probe.floorY - 22, probe.floorY - 8, Math.random());
            if (!pv.inside(x, y)) continue;
            return { kind: 'static', x: x, y: y, bob: Math.random() < 0.5,
                     phase: Math.random() * Math.PI * 2 };
        }
        return { kind: 'static', x: (probe.minX + probe.maxX) / 2, y: probe.floorY - 12,
                 bob: false, phase: 0 };
    }
    function planSolo(probe) {
        var roll = Math.random();
        if (roll < 0.45) { var o = planOrbit(probe); if (o) return o; }
        if (roll < 0.85) { var k = planTrack(probe); if (k) return k; }
        return planStatic(probe) || planOrbit(probe) || planTrack(probe);
    }
    function buildPlan(probe) {
        var total = 3 + Math.floor(Math.random() * 6);          // 3..8 只
        var items = [], left = total;
        var wantRow = Math.random() < 0.75;
        while (wantRow && left >= 3) {
            var k = Math.min(left, 3 + Math.floor(Math.random() * 3));   // 3..5 只一行
            var row = planRow(probe, k);
            if (!row) break;
            items.push(row);
            left -= k;
            wantRow = left >= 3 && Math.random() < 0.3;
        }
        while (left > 0) { items.push(planSolo(probe)); left--; }
        return { total: total, items: items };
    }

    // ===== 组合体：一次刷新里的一群灰尘兔 =====
    function createEnsemble(probe) {
        var plan = buildPlan(probe);
        var bunnies = [];
        var trails = [];

        function push(traj) {
            var b = createBunny(traj.x, traj.y);
            b.fam = traj.fam;
            b.traj = traj;
            b.alpha = 1;
            b.puff = Math.random() * 0.02;
            bunnies.push(b);
        }

        for (var n = 0; n < plan.items.length; n++) {
            var it = plan.items[n];
            if (it.kind === 'row') {
                for (var i = 0; i < it.k; i++) {
                    push(rowTraj({ lane: it.lane, a: it.a, b: it.b, dir: it.dir, u0: it.u0,
                                   i: i, k: it.k, phase: i * BOB_PHASE }));   // IL：i*0.8
                }
            } else if (it.kind === 'orbit') {
                var tr = orbitTraj(it);
                push(it.bob ? addBob(tr, Math.random() * Math.PI * 2) : tr);
            } else if (it.kind === 'track') {
                var tk = trackTraj(it);
                push(it.bob ? addBob(tk, Math.random() * Math.PI * 2) : tk);
            } else {
                var st = staticTraj(it);
                push(it.bob ? addBob(st, it.phase) : st);
            }
        }

        function step(dt) {
            if (!(dt > 0)) return;
            for (var i = 0; i < bunnies.length; i++) {
                var b = bunnies[i];
                b.traj.step(dt);
                b.x = b.traj.x;
                b.y = b.traj.y;
                b.alpha = b.traj.alpha == null ? 1 : b.traj.alpha;
                b.EyeTargetDirection.x = b.traj.target.x;
                b.EyeTargetDirection.y = b.traj.target.y;
                b.update(dt);                              // DustGraphic 自身：自旋 / 眨眼 / 眼睛缓动
                // IL：P_Move 拖尾（track/orbit 0.02s、static 0.05s，散布 ±4）
                b.puff -= dt;
                if (b.puff <= 0 && trails.length < TRAIL_MAX) {
                    b.puff = TRAIL_INTERVAL[b.fam] || 0.05;
                    trails.push({ x: b.x + (Math.random() - 0.5) * 8, y: b.y + (Math.random() - 0.5) * 8, t: 0 });
                }
            }
            for (var j = trails.length - 1; j >= 0; j--) {
                var p = trails[j];
                p.t += dt;
                p.y -= 6 * dt;                             // 近似：尘埃微粒轻轻上飘
                if (p.t >= TRAIL_TTL) trails.splice(j, 1);
            }
        }

        function draw(ctx, toScreen, Z) {
            for (var j = 0; j < trails.length; j++) {
                var p = trails[j];
                var sp = toScreen(p);
                var a = (1 - p.t / TRAIL_TTL) * 0.45;
                var w = Math.max(1, 1.5 * Z);
                ctx.fillStyle = 'rgba(' + TRAIL_RGB + ',' + a.toFixed(3) + ')';
                ctx.fillRect(sp.x - w / 2, sp.y - w / 2, w, w);
            }
            for (var i = 0; i < bunnies.length; i++) {
                var b = bunnies[i];
                if (b.alpha <= 0.01) continue;
                var prev = ctx.globalAlpha;
                ctx.globalAlpha = prev * clamp01(b.alpha);
                b.draw(ctx, toScreen, Z);
                ctx.globalAlpha = prev;
            }
        }

        return { plan: plan, bunnies: bunnies, trails: trails, step: step, draw: draw };
    }

    global.CelesteDustBunny = {
        // 常量（测试与文档用）
        SPEED: SPEED, SPACING: SPACING, BOB_FREQ: BOB_FREQ, BOB_PHASE: BOB_PHASE, BOB_AMP: BOB_AMP,
        SINK_RATE: SINK_RATE, SINK_DIST: SINK_DIST, EYE_OFFSET: EYE_OFFSET, EYE_SEP: EYE_SEP,
        NODE_SPIN: NODE_SPIN, CENTER_SPIN: CENTER_SPIN, GROUP_SIZE: GROUP_SIZE, GROUP_DELAY: GROUP_DELAY,
        MOVE_TIMES: MOVE_TIMES, PAUSE_TIMES: PAUSE_TIMES, ORBIT_PERIOD: ORBIT_PERIOD, EYE_APPROACH: EYE_APPROACH,
        DIAG: DIAG, EYE_COLOR: EYE_COLOR,
        load: load,
        ready: function () { return A.ready; },
        assets: A,
        createBunny: createBunny,
        createGroup: createGroup,
        // 第三章轨道基元（每种均可单独驱动 / 断言）
        trackTraj: trackTraj,
        orbitTraj: orbitTraj,
        rowTraj: rowTraj,
        staticTraj: staticTraj,
        addBob: addBob,
        buildPlan: buildPlan,
        // 商店页入口：一次刷新生成一群（数量 + 轨迹随机组合）
        createEnsemble: createEnsemble
    };
})(window);
