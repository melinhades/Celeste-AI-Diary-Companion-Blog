/* ===== 圆桌会议主持鸟（Celeste bird，roundtable.html 专用） =====
   素材：Atlases/Gameplay/characters/bird/，32x24 透明底，3x 像素放大（96x72）。
   文件名大小写混杂（线上 Linux 区分大小写），帧表按真实文件名写死，勿凭规律生成：
     crow:     crow00..crow48                     （49 帧，鸣叫）
     flyup:    flyup00 + FlyUp01..FlyUp15         （16 帧，起飞/离场爬升）
     fly:      fly00..fly03                       （4 帧，平飞赶路）
     hover:    hover00,hover01 + Hover02..Hover05 （6 帧，平静盘旋）
     stressed: HoverStressed00..HoverStressed05   （6 帧，紧张盘旋：讨论升温）
     dash:     dash00                             （单帧，冲刺赶路）
     hold:     Hold00..Hold05                     （6 帧，悬停抓握）
     throw:    Throw00..Throw06                   （7 帧，投掷：庆祝共识）
     hurt:     hurt00 + Hurt01..Hurt21            （22 帧，受击坠落：谈崩/低分）
     recover:  Recover00..Recover07               （8 帧，受击后拉升恢复）

   动作系统 = js/bird-motion.js（celeste-bird.html 反编译复刻层抽出的共享引擎）：
     · 赶路不再是直线趋近 —— SimpleCurve 二次贝塞尔 + 弧长计时（moveOnCurve 口径），
       飞行中沿切线旋转（angleLerp 0.5）、压扁成 scale(1.25, 0.7)、落点回正；
     · 位移 >32（1x 单位）投放 #639bff 拖尾点，寿命 1.2s，画在全屏 trail canvas 上；
     · hover/stressed/fly 的第 0 帧过视口裁剪后报振翅音（BirdNPC.FlapSfxCheck 口径），
       事件音走 celeste-sounds/Birds/ 变体池（squawk/startle/relocate/throw/wingflap…）；
     · 聆听/代言时 spriteOffset 朝说话席位倾斜（FlingBird Wait 态 clampedMap 盯人偏移）；
     · 彩蛋：按住鸟 = Grab（hold 动画跟随鼠标），甩动松手 = Fling —— 完整复刻原版甩出
       时间线（0.4 倍速跟随 → 定格 → Freeze 0.05 → FLING_SPEED 弹射 → 曲线归巢回席位）。
   决策脑不变（对齐 madeline-core.js 的数据驱动状态机风格）：
     · MODES 模式表：动画/移动方式/优先级/时长/摆幅/行为链 集中一处
     · think() 空闲脑：加权随机挑下一个行为，避开刚做过的；发言驻留期贴着不走
     · 反应式触发：事件驱动 + 逐模式冷却 + 优先级仲裁 + 最小驻留（enterMode 第三参=false）
     · 会场气氛 heat：随各人发言情绪升温/随时间冷却；热了换紧张盘旋、摆幅加快，
       激烈情绪还有概率把鸟直接吸引过去看热闹
   暴露 window.RoundtableBird（API 契约与旧版逐字一致，roundtable-2.js 的 15 个调用点零改动）：
     enter(panel)      会议开始：crow 开场 → flyup 起飞 → 交给 think() 自主游荡
     focusSeat(id)     有人准备发言：飞到席位上方倾听（远 dash / 近 listen）
     speechEnd()       发言结束：驻留一会儿后回空闲脑
     onEmotion(id,emo) 发言情绪流入：累计会场气氛；激烈情绪可能触发看热闹冲刺
     onHostSpeak(flag) 主持人（=鸟自己）开口：台顶中央循环 crow 代言
     onUserInterject() 用户插话广播：dash 冲刺到用户席位倾听
     onScore(avg)      评审落地：<60 hurt→recover；≥90 throw→crow 庆祝；否则 crow 一声
     leave()           散会：等当前一次性演出播完，flyup 向上飞走
     perch(panel)      回放：定格 hover00 悬在右上角
     hide()            立即隐藏并重置全部状态
     _state()          测试自检：当前模式/动画/气氛热度（新增 grab/fling/trail 只读字段）
     _mute(on)         音效开关（持久化走 Store，roundtable 静音键未登记，容忍） */
(function () {
    var BASE = 'Atlases/Gameplay/characters/bird/';
    var W = 96, H = 72;                  // 3x 显示尺寸
    var K = 3;                           // 显示/引擎单位换算；物理常量按 1x 游戏像素（同 celeste-bird.html 口径）

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function seq(prefix, a, b) { var r = []; for (var i = a; i <= b; i++) r.push(prefix + pad2(i)); return r; }

    var FRAMES = {
        crow: seq('crow', 0, 48),
        flyup: ['flyup00'].concat(seq('FlyUp', 1, 15)),
        fly: seq('fly', 0, 3),
        hover: ['hover00', 'hover01'].concat(seq('Hover', 2, 5)),
        stressed: seq('HoverStressed', 0, 5),
        dash: ['dash00'],
        hold: seq('Hold', 0, 5),
        throw: seq('Throw', 0, 6),
        hurt: ['hurt00'].concat(seq('Hurt', 1, 21)),
        recover: seq('Recover', 0, 7)
    };
    var FRAME_MS = {
        crow: 70, flyup: 80, fly: 110, hover: 130, stressed: 105,
        dash: 1000, hold: 130, throw: 95, hurt: 75, recover: 85
    };
    var FRAME_COUNT = {};
    Object.keys(FRAMES).forEach(function (g) { FRAME_COUNT[g] = FRAMES[g].length; });
    var FRAME_SEC = {};                  // 整段时长（秒）：协程 once 演出用
    Object.keys(FRAME_MS).forEach(function (g) {
        FRAME_SEC[g] = FRAME_MS[g] * (FRAMES[g] ? FRAMES[g].length : 1) / 1000;
    });

    /* ===== 行为模式表 =====
       kind: travel=曲线飞向锚点（到点接 arrive）| loop=锚点摆动循环（dur 到点回 think）
             once=单次播完（接 next / 回 think）| climb=爬升离场 | still=定格
       sway: [水平摆幅, 垂直摆幅, 摆动角速度]（显示像素）；drop/rise: once 期间垂直位移 px；
       lift: 贝塞尔控制点抬升基准（引擎单位）；speed: 巡航速度（引擎单位 px/s） */
    var MODES = {
        wander:   { kind: 'travel', anim: 'fly',      priority: 10, speed: 190, lift: 46,  arrive: 'hover' },
        hover:    { kind: 'loop',   anim: 'hover',    priority: 10, dur: [5000, 9000], sway: [18, 7, 2.2] },
        listen:   { kind: 'loop',   anim: 'hover',    priority: 60, dur: 0,            sway: [10, 5, 2.6] },
        stressed: { kind: 'loop',   anim: 'stressed', priority: 30, dur: [2600, 5200], sway: [13, 9, 3.6] },
        crow:     { kind: 'once',   anim: 'crow',     priority: 40, sway: [10, 5, 2.2] },
        hold:     { kind: 'loop',   anim: 'hold',     priority: 15, dur: [2200, 3600], sway: [8, 4, 1.8] },
        dash:     { kind: 'travel', anim: 'dash',     priority: 70, speed: 430, lift: 74,  arrive: 'listen' },
        hurt:     { kind: 'once',   anim: 'hurt',     priority: 90, drop: 34, next: 'recover' },
        recover:  { kind: 'once',   anim: 'recover',  priority: 85, rise: 34 },
        throw:    { kind: 'once',   anim: 'throw',    priority: 50, sway: [8, 4, 2.0] },
        leave:    { kind: 'climb',  anim: 'flyup',    priority: 100 },
        perch:    { kind: 'still',  anim: 'hover',    priority: 100 }
    };
    var MIN_DWELL = 700;           // 最小驻留：刚进模式不被同级瞬间顶掉
    var HARD_GAP = 40;             // 优先级差足够大可硬打断（对齐 madeline-core）
    var REACTIVE_COOLDOWN = 2400;  // 同一反应式模式冷却
    var LEAVE_SPEED = 260;         // 离场爬升 px/s（引擎单位）
    var HEAT_DECAY = 0.07;         // 会场气氛每秒降温
    var LISTEN_LINGER = 1200;      // 发言结束后的倾听驻留 ms
    // 圆桌页鸟音效总增益（不改素材，只乘在宿主距离衰减上）：
    // 原来近处满 1.0 偏吵，统一乘 0.55；最远处保底 0.10，保证还能听见
    var BIRD_GAIN = 0.55;
    var BIRD_MIN_GAIN = 0.10;

    // ===== 甩鸟彩蛋参数（FlingBird IL 原值，1x 口径） =====
    var FLING_SPEED = { x: 380, y: -100 };   // static FlingSpeed
    var GRAB_FOLLOW = 900;                   // 抱持跟随鼠标的最大速度（引擎 px/s）
    var FLING_THROW_MIN = 420;               // 松手时手势速度低于此（引擎 px/s）不算甩
    var FLING_HOME_MIN = 120, FLING_HOME_MAX = 720;   // 弹射落点距离夹取（原版会飞出屏幕，演示页收拢）

    // 发言情绪 → 气氛热度增量（激烈升温 / 缓和降温），情绪 key 与语音引擎 1:1
    var HEAT_OF = {
        angry: .30, angryAlt: .30, yell: .38, wtf: .26,
        freakA: .34, freakB: .38, freakC: .42, lostcontrol: .42,
        mock: .18, scoff: .14, worried: .14, sideworried: .14, nervous: .12,
        panic: .32, worriedAlt: .14,
        sad: .10, sadder: .10, upset: .10, peaceful: -.04,
        excited: -.10, nailedit: -.12, laugh: -.14, sidehappy: -.12,
        distracted: -.10, determined: -.06
    };

    var prefersReduced = false;
    try { prefersReduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { void e; }

    var warmed = false;
    // 帧加载门控：加载中不切 img.src（避免 ERR_ABORTED 与闪空白），加载完追显
    var birdLoaded = {};
    var birdWaiters = {};
    var birdBlob = {};      // name → blob:ObjectURL，切帧零网络，避免无缓存头下条件请求被中止(ERR_ABORTED)
    function preloadFrame(name, cb) {
        var src = BASE + name + '.png';
        if (birdLoaded[src] === 1) { if (cb) cb(); return; }
        if (birdLoaded[src] === -1) return;
        if (birdLoaded[src] === 0) { if (cb) (birdWaiters[src] = birdWaiters[src] || []).push(cb); return; }
        birdLoaded[src] = 0;
        birdWaiters[src] = cb ? [cb] : [];
        fetch(src).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        }).then(function (blob) {
            birdBlob[src] = URL.createObjectURL(blob);
            birdLoaded[src] = 1;
            var ws = birdWaiters[src] || [];
            birdWaiters[src] = null;
            ws.forEach(function (f) { f(); });
        }).catch(function () { birdLoaded[src] = -1; birdWaiters[src] = null; });
    }
    function warm() {
        if (warmed) return;
        warmed = true;
        Object.keys(FRAMES).forEach(function (g) {
            FRAMES[g].forEach(function (n) { preloadFrame(n); });
        });
    }

    // ===== DOM 与运行状态 =====
    var img = null, panel = null, trailCv = null, trailCtx = null, muteBtn = null;
    var mode = 'hidden';           // hidden | MODES key | grabbed | fling（opening 期间由 opening 变量接管）
    var opening = null;            // 'crow' | 'flyup' 开场脚本序列
    var phaseT = 0, onceFrom = 0;  // 开场计时与起始高度
    var heat = 0;                  // 会场气氛 0..1
    var listening = false, listenUntil = 0, listenSeat = null;
    var hostSpeak = false;
    var pendingLeave = false, chainMode = null;
    var lastRequest = {};          // 反应式触发逐模式冷却表
    var raf = null, lastTs = 0;
    var theta = 0, modeUntil = 0, enteredAt = 0;
    var anchor = { x: 0, y: 0 };   // 显示像素（视口坐标，鸟左上角）
    var tweetHandle = null;        // bird_tweet_loop 持有句柄（SoundSource 语义）

    // ===== 运动引擎接入（bird-motion.js） =====
    var ENGINE = window.BirdMotion;
    var eng = ENGINE ? ENGINE.create({
        frameMs: FRAME_MS,
        frames: FRAME_COUNT,
        gazeRange: [16, 64],
        clock: function () { return engineClock; },
        onSetAnim: function () { applyFrame(); },
        onFrame: function () { applyFrame(); },
        onFlapCheck: function (pos1x) {                 // FlapSfxCheck 的视口裁剪版：±32 引擎单位
            var m = 32 * K;
            var cx = pos1x.x * K, cy = pos1x.y * K;
            return !(cx < -m || cy < -m || cx > innerWidth + m || cy > innerHeight + m);
        }
    }) : null;
    var actor = eng ? eng.actor : null;
    if (eng) {
        // ★ 近似 3D 衰减（同 celeste-bird.html 口径：离注视点 520px 线性到 0.12），
        //   圆桌页没有玩家角色，注视点取视口中心
        eng.sfx.setGainSource(function () {
            if (!actor) return BIRD_GAIN;
            var bx = actor.pos.x * K, by = actor.pos.y * K;
            var atten = Math.min(1, Math.max(0.12, 1 - Math.hypot(bx - innerWidth / 2, by - innerHeight / 2) / 900));
            return Math.max(BIRD_MIN_GAIN, BIRD_GAIN * atten);
        });
    }
    var engineClock = 0;           // 引擎秒钟（freeze 期间不推进）
    var freezeTimer = 0;           // Celeste.Freeze 口径：>0 期间 actor 不更新
    var timeRate = 1;              // Engine.TimeRate 口径：甩出演出 0.8 → 1
    var swayOff = { x: 0, y: 0 };  // loop/once 摆动位移（显示像素，叠加在 actor.pos 之外）
    var onceOffY = 0;              // hurt 坠落 / recover 拉升的垂直偏移（显示像素）
    var grabbed = false, flinging = false;
    var grabSamples = [];          // 抱持期间的手势采样 [{t,x,y}]，松手时算甩出速度
    var pointerPrev = null;

    function applyFrame() {
        if (!actor || !FRAMES[actor.anim]) return;
        var name = FRAMES[actor.anim][actor.frame];
        if (!name) return;
        var src = BASE + name + '.png';
        if (birdLoaded[src] === 1) {
            var url = birdBlob[src];
            if (img && img.getAttribute('src') !== url) img.src = url;   // blob 本地帧，零网络切换
        } else if (birdLoaded[src] !== -1) {
            preloadFrame(name, function () {                             // 加载完若仍在这一帧就追显（含 perch 定格）
                if (img && img.isConnected && FRAMES[actor.anim] &&
                    FRAMES[actor.anim][actor.frame] === name &&
                    img.getAttribute('src') !== birdBlob[src]) {
                    img.src = birdBlob[src];
                }
            });
        }
    }

    function setAnim(name) {
        if (!actor) return;
        actor.setAnim(name);
    }

    /* ===== 拼装 transform：translate → rotate → scale(flip×压扁) =====
       引擎 rot=0 恒表示「素材原朝向（朝左）」的基准角；向右飞时先镜像再取反角，
       两种朝向的屏幕倾角都等于切线方向（数学见 celeste-bird.html FlingBird draw 推导）。 */
    function render() {
        if (!img || !actor) return;
        var rp = actor.renderPos();                       // 含盯人 spriteOffset（引擎单位）
        var px = rp.x * K + swayOff.x;
        var py = rp.y * K + swayOff.y + onceOffY;
        var rotDeg = 0;
        if (!prefersReduced) {
            var rot = actor.rot;
            if (actor.facing < 0) rot = -rot;              // 镜像坐标系里的角
            if (rot > Math.PI / 2) rot -= Math.PI;          // 收进 [-90°,90°]，陡冲不陀螺
            if (rot < -Math.PI / 2) rot += Math.PI;
            rotDeg = rot * 180 / Math.PI;
        }
        var sx = Math.abs(actor.scale.x) * (actor.facing < 0 ? -1 : 1);
        img.style.transform = 'translate(' + Math.round(px - W / 2) + 'px,' + Math.round(py - H / 2) + 'px)' +
            (rotDeg ? 'rotate(' + rotDeg.toFixed(2) + 'deg)' : '') +
            (sx < 0 ? ' scaleX(-1)' : '') +
            (sx !== 1 && sx !== -1 ? ' scale(' + sx.toFixed(3) + ',' + actor.scale.y.toFixed(3) + ')' : '');
        drawTrail();
    }

    // ===== 拖尾层：全屏 fixed canvas，z 在鸟之下、内容之上 =====
    function drawTrail() {
        if (!trailCtx || !ENGINE) return;
        if (prefersReduced) { if (ENGINE.Trail.points.length) ENGINE.Trail.clear(); return; }
        var now = engineClock;
        ENGINE.Trail.expire(now);
        var pts = ENGINE.Trail.points;
        trailCtx.clearRect(0, 0, trailCv.width, trailCv.height);
        if (!pts.length) return;
        var dpr = trailCv.__dpr || 1;
        for (var i = 0; i < pts.length; i++) {
            var a = Math.max(0, 1 - (now - pts[i].born) / 1.2);
            trailCtx.globalAlpha = 0.45 * a;
            trailCtx.fillStyle = '#639bff';
            trailCtx.beginPath();
            trailCtx.arc(pts[i].x * K * dpr, pts[i].y * K * dpr, Math.max(0.5, 3 * a * dpr), 0, Math.PI * 2);
            trailCtx.fill();
        }
        trailCtx.globalAlpha = 1;
    }
    function sizeTrailCanvas() {
        if (!trailCv) return;
        var dpr = Math.min(1.5, window.devicePixelRatio || 1);   // 性能守卫：DPR 封顶 1.5
        var w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
        if (trailCv.width !== w || trailCv.height !== h) {
            trailCv.width = w; trailCv.height = h;
            trailCv.style.width = innerWidth + 'px'; trailCv.style.height = innerHeight + 'px';
            trailCv.__dpr = dpr;
        }
    }

    // ===== 锚点（视口坐标系：整个页面盘旋，bird-sprite 用 position:fixed；中心口径） =====
    function seatCenter(id) {
        var seat = panel && panel.querySelector('#seat-' + id);
        if (!seat) return null;
        var sr = seat.getBoundingClientRect();
        return { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 };
    }
    function seatAnchorOf(id) {          // 席位上方悬停点 = 鸟的中心
        var sc = seatCenter(id);
        if (!sc) return null;
        var sr = panel.querySelector('#seat-' + id).getBoundingClientRect();
        return { x: sc.x, y: sr.top - H / 2 - 8 };
    }
    // 随机游荡锚点：全页面随机（避开最顶部导航条）
    function pickAnchor() {
        anchor.x = 40 + Math.random() * (innerWidth - W - 80) + W / 2;
        anchor.y = 80 + Math.random() * (innerHeight - H - 140) + H / 2;
    }
    // 主持人锚点：页面中央偏上（主持人没有席位卡）
    function anchorHost() {
        anchor.x = Math.max(20, (innerWidth - W) / 2 + W / 2);
        anchor.y = 100 + H / 2;
    }
    function clampAnchor(a) {
        a.x = clampNum(a.x, 40 + W / 2, Math.max(40 + W / 2, innerWidth - 40 - W / 2));
        a.y = clampNum(a.y, 80 + H / 2, Math.max(80 + H / 2, innerHeight - 60 - H / 2));
        return a;
    }
    function clampNum(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    // ===== 加权随机（对齐 madeline-core.weightedPick）=====
    function weightedPick(items, avoidKey) {
        if (avoidKey !== undefined && items.length > 1) {
            var f = items.filter(function (it) { return it[0] !== avoidKey; });
            if (f.length) items = f;
        }
        var total = 0, i;
        for (i = 0; i < items.length; i++) total += items[i][1];
        var r = Math.random() * total;
        for (i = 0; i < items.length; i++) { r -= items[i][1]; if (r <= 0) return items[i][0]; }
        return items[items.length - 1][0];
    }

    // ===== 演出辅助 =====
    function clearMotion() {
        if (!actor) return;
        actor.stopFlight(); actor.killPhysics(); actor.killCoroutines();
        actor.faceLocked = false;
        swayOff = { x: 0, y: 0 }; onceOffY = 0;
    }
    function stopTweet() {
        if (tweetHandle) { tweetHandle.stop(true); tweetHandle = null; }
    }
    function startTweet() {
        if (tweetHandle || !eng) return;
        tweetHandle = eng.sfx.loop('bird_tweet_loop');
    }

    /* 单次演出协程：播 anim 整段（dur 秒），可选 drop/rise 垂直位移，完了执行 done；
       restart 用于代言循环（hostSpeak 期间 crow 反复重播）。hurt/recover/crow/throw 共用。 */
    function onceAnim(name, opts, done, restart) {
        if (!actor) return;
        var dur = FRAME_SEC[name], t = 0;
        setAnim(name);
        if (restart) restart();          // 重入同一动画时 setAnim 短路，手动回到首帧
        actor.coroutine(function* () {
            while (t < dur) {
                yield null;
                t += engineDelta;
                if (opts && opts.drop) onceOffY = opts.drop * K * Math.min(1, t / dur);
                else if (opts && opts.rise) onceOffY = -opts.rise * K * Math.min(1, t / dur);
            }
            onceOffY = 0;
            if (done) done();
        });
    }

    /* ===== 进入模式 =====
       fromThink=true  : 行为树自主决策，直接执行
       fromThink=false : 反应式触发，需过 冷却 + 优先级仲裁 + 最小驻留 三道闸 */
    function enterMode(key, now, fromThink) {
        var def = MODES[key];
        if (!def) return false;
        if (!fromThink) {
            var cur = MODES[mode] || { priority: 0 };
            if (now - (lastRequest[key] || -1e9) < REACTIVE_COOLDOWN) return false;
            if (def.priority < cur.priority) return false;
            if (now - enteredAt < MIN_DWELL && def.priority - cur.priority < HARD_GAP) return false;
            lastRequest[key] = now;
        }
        if (grabbed || flinging) return false;    // 玩家手里的鸟不听行为树指挥
        mode = key;
        enteredAt = now;
        modeUntil = def.dur ? now + def.dur[0] + Math.random() * (def.dur[1] - def.dur[0]) : Infinity;
        theta = Math.random() * Math.PI * 2;
        clearMotion();
        if (!actor) { setAnim(def.anim); return true; }

        if (def.kind === 'travel') {
            setAnim(def.anim);                      // fly 循环帧 / dash 单帧定格赶路
            if (key === 'wander') pickAnchor();
            var a1 = clampAnchor({ x: anchor.x, y: anchor.y });
            var d1 = Math.hypot(a1.x - actor.pos.x * K, a1.y - (actor.pos.y * K + onceOffY));
            var to1 = { x: a1.x / K, y: a1.y / K };
            if (prefersReduced || d1 < 24) {
                actor.pos = to1;
                onTravelArrive(def);
            } else {
            actor.flyCurve(to1, def.lift || 46, def.speed, function () { onTravelArrive(def); });
            }
            if (key === 'dash') eng && eng.sfx.play('bird_relocate');
        } else if (def.kind === 'climb') {
            setAnim(def.anim);
            actor.killPhysics();
            actor.startPhysics({ x: 0, y: -LEAVE_SPEED / K }, { x: 0, y: -LEAVE_SPEED / K }, 0);
        } else if (def.kind === 'loop') {
            setAnim(def.anim);
            if (key === 'listen') startTweet(); else stopTweet();
        } else if (def.kind === 'once') {
            if (def.sway) { anchor = { x: actor.pos.x * K + swayOff.x, y: actor.pos.y * K + swayOff.y }; }
            var done = function () {
                if (pendingLeave) doLeave();
                else if (chainMode) { var cm = chainMode; chainMode = null; enterMode(cm, performance.now(), true); }
                else if (def.next) enterMode(def.next, performance.now(), true);
                else if (key === 'crow' && hostSpeak) {            // 代言循环：开口期间反复 crow
                    onceAnim('crow', null, done, function () {
                        actor.anim = ''; setAnim('crow');          // 绕过同名短路，回到首帧
                    });
                } else think(performance.now());
            };
            if (key === 'crow') eng && eng.sfx.play('bird_squawk');
            if (key === 'throw') eng && eng.sfx.play('bird_squawk');
            if (key === 'hurt') eng && eng.sfx.play('bird_startle');
            onceAnim(def.anim, { drop: def.drop, rise: def.rise }, done);
        } else if (def.kind === 'still') {
            setAnim(def.anim);
            actor.frame = 0; applyFrame();
        }
        return true;
    }
    function onTravelArrive(def) {
        if (def.arrive) enterMode(def.arrive, performance.now(), true);
        else think(performance.now());
    }

    // ===== 空闲脑：加权随机挑下一个行为 =====
    function think(now) {
        if (pendingLeave) { doLeave(); return; }
        if (listening || now < listenUntil) {          // 发言中/驻留中：贴着席位不走
            if (mode !== 'listen' && mode !== 'dash') enterMode('listen', now, true);
            return;
        }
        stopTweet();
        if (hostSpeak) {                               // 主持人开口 = 鸟在代言
            anchorHost();
            enterMode(Math.random() < 0.55 ? 'crow' : 'hover', now, true);
            return;
        }
        var pool = [
            ['wander', 0.34],
            ['hover', 0.30],
            ['crow', heat < 0.4 ? 0.10 : 0],           // 气氛平和才偶尔鸣叫
            ['hold', 0.10],
            ['stressed', heat > 0.55 ? 0.34 : 0]       // 讨论升温才紧张盘旋
        ].filter(function (it) { return it[1] > 0; });
        enterMode(weightedPick(pool, mode), now, true);
    }

    function doLeave() {
        pendingLeave = false;
        listening = false; hostSpeak = false;
        stopTweet();
        eng && eng.sfx.play('bird_squawk');
        enterMode('leave', performance.now(), true);
    }

    // ==================== 抱鸟 → 甩出 → 归巢（FlingBird 时间线复刻） ====================
    function canGrab() {
        return !!(actor && !grabbed && !flinging && !opening &&
            mode !== 'hidden' && mode !== 'leave' && mode !== 'perch');
    }
    function onPointerDown(ev) {
        if (!canGrab()) return;
        ev.preventDefault();
        grabbed = true;
        clearMotion(); stopTweet();
        setAnim('hold');
        img.classList.add('bird-grabbed');
        try { if (img.setPointerCapture) img.setPointerCapture(ev.pointerId); } catch (e) { void e; }
        if (img.addEventListener && !img.__grabBound) {     // 捕获后 move/up 目标仍是 img，补挂监听
            img.addEventListener('pointermove', onPointerMove);
            img.addEventListener('pointerup', onPointerUp);
            img.addEventListener('pointercancel', onPointerUp);
            img.__grabBound = true;
        }
        grabSamples = [{ t: performance.now(), x: ev.clientX, y: ev.clientY }];
        pointerPrev = { x: ev.clientX, y: ev.clientY };
        grabPrevMode = mode;
        mode = 'grabbed';
    }
    var grabPrevMode = null;
    function onPointerMove(ev) {
        if (!grabbed || !actor) return;
        var now = performance.now();
        grabSamples.push({ t: now, x: ev.clientX, y: ev.clientY });
        while (grabSamples.length > 2 && now - grabSamples[0].t > 110) grabSamples.shift();
        pointerPrev = { x: ev.clientX, y: ev.clientY };
        void now;
    }
    function onPointerUp() {
        if (!grabbed) return;
        grabbed = false;
        if (img) img.classList.remove('bird-grabbed');
        // 手势速度（显示 px/ms → 引擎 px/s），取最近 ~90ms 的割线
        var now = performance.now();
        var old = grabSamples[0], i;
        for (i = 1; i < grabSamples.length; i++) {
            if (now - grabSamples[i].t <= 90) { old = grabSamples[i]; break; }
            old = grabSamples[i];
        }
        var dt = Math.max(16, now - old.t) / 1000;
        var vx = (pointerPrev.x - old.x) / dt / K, vy = (pointerPrev.y - old.y) / dt / K;
        var mag = Math.hypot(vx, vy);
        var totalMove = 0;
        for (i = 1; i < grabSamples.length; i++) {
            totalMove += Math.hypot(grabSamples[i].x - grabSamples[i - 1].x, grabSamples[i].y - grabSamples[i - 1].y);
        }
        grabSamples = [];
        if (mag >= FLING_THROW_MIN) { doFling(vx, vy, mag); return; }
        if (totalMove < 8) {                    // 几乎没动 = 点击：保留旧版「点鸟鸣叫」行为
            mode = grabPrevMode || mode;
            enterMode('crow', performance.now(), true);
            return;
        }
        mode = grabPrevMode || 'hover';
        think(performance.now());
    }

    /* DoFlingRoutine 逐句复刻（celeste-bird.html L2477-2497），相机/震屏换成整站降级：
       0.4 倍速跟随 → 定格 → throw 动画 → -140/140 反拉 → Freeze 0.05 → FLING 弹射 → 曲线归巢 */
    function doFling(vx, vy, mag) {
        flinging = true;
        mode = 'fling';
        eng && eng.sfx.play('bird_throw');
        var unitX = vx / mag, unitY = vy / mag;
        actor.startPhysics(vmulE(unitX * mag * 0.4, unitY * mag * 0.4 + 120), { x: 0, y: 0 }, 1000);
        actor.faceLocked = false;
        actor.coroutine(function* () {
            var t = 0;
            while ((Math.abs(actor.vel.x) > 0.5 || Math.abs(actor.vel.y) > 0.5) && t < 0.6) {
                yield null; t += engineDelta;      // 等减速到近零（原版用 !=0 精确判定，浮点页用阈值）
            }
            actor.killPhysics();
            setAnim('throw'); actor.rot = 0;
            actor.facing = unitX < 0 ? 1 : -1;     // 甩向哪边脸朝哪边
            actor.startPhysics({ x: -140, y: 140 }, { x: 0, y: 0 }, 1400);
            timeRate = 0.8;
            yield 0.1;
            freezeTimer = Math.max(freezeTimer, 0.05);   // Celeste.Freeze(0.05)：整个 actor 停三帧
            actor.killPhysics();
            actor.startPhysics(
                { x: FLING_SPEED.x * unitX, y: FLING_SPEED.y + 160 * unitY },
                { x: 0, y: 0 }, 6000);
            yield 0.1;
            timeRate = 1;
            yield 0.3;
            var endV = { x: actor.vel.x, y: actor.vel.y };   // ★ killPhysics 会把速度清零，先留快照
            actor.killPhysics();
            homing(endV);
        });
    }
    function vmulE(x, y) { return { x: x, y: y }; }
    /* 归巢：原版跑节点链；圆桌页 = 沿甩出方向夹一个视口内落点，贝塞尔曲线飞回去（relocate 手感） */
    function homing(endV) {
        eng && eng.sfx.play('bird_relocate');
        var v = endV || { x: 0, y: 0 };
        var speed = Math.hypot(v.x, v.y);
        var dist = clampNum(speed * 1.6, FLING_HOME_MIN, FLING_HOME_MAX);
        var dir = v.x < 0 ? -1 : 1;
        var homeDisp = clampNum(actor.pos.x * K + dir * dist * K,
                                40 + W / 2, Math.max(40 + W / 2, innerWidth - 40 - W / 2));
        setAnim('fly');
        actor.faceLocked = false;
        actor.flyCurve({ x: homeDisp / K, y: clampNum(actor.pos.y * K, (80 + H / 2) / K, (innerHeight - 60 - H / 2) / K) },
            56, 320, function () {
                flinging = false;
                if (listening) enterMode('listen', performance.now(), true);
                else think(performance.now());
            });
    }

    // ===== 主循环 =====
    var engineDelta = 1 / 60;      // 本帧引擎步长（秒，已乘 timeRate）
    function tick(ts) {
        if (!actor) return;        // 引擎缺席（bird-motion.js 加载失败）：停循环，鸟退化为静帧
        if (!lastTs) lastTs = ts;
        var rawDt = Math.min(50, ts - lastTs);   // 掉帧保护
        lastTs = ts;
        engineDelta = rawDt / 1000 * timeRate;
        if (freezeTimer > 0) {
            freezeTimer = Math.max(0, freezeTimer - rawDt / 1000);   // Freeze 用 raw 时间扣
        } else {
            engineClock += engineDelta;
            if (actor) actor.update(engineDelta);
            eng && eng.sfx.update();
        }
        heat = Math.max(0, heat - HEAT_DECAY * rawDt / 1000);

        if (opening) {
            // 开场脚本：crow 鸣叫（原地）→ flyup 起飞弧线 → 交给行为树
            phaseT += rawDt;
            var on = FRAMES[opening].length;
            var fi = Math.min(Math.floor(phaseT / FRAME_MS[opening]), on - 1);
            if (fi !== actor.frame) { actor.frame = fi; applyFrame(); }
            if (opening === 'flyup') {
                var k = Math.min(1, phaseT / (on * FRAME_MS.flyup));
                actor.pos = { x: actor.pos.x, y: onceFrom - (36 / K) * k };
            }
            if (phaseT >= on * FRAME_MS[opening]) {
                if (opening === 'crow') {
                    opening = 'flyup'; phaseT = 0; onceFrom = actor.pos.y;
                    setAnim('flyup');
                } else {
                    opening = null;
                    enterMode('wander', ts, true);
                }
            }
            render();
            raf = requestAnimationFrame(tick);
            return;
        }

        var def = MODES[mode];
        if (def) {
            if (def.kind === 'climb') {
                if (actor.pos.y * K < -H - 40) { hide(); return; }
            } else if (def.kind === 'loop') {
                // 倾听时气氛过热：同一席位上换紧张盘旋（不挪窝，只换动画与摆幅）
                if (mode === 'listen') {
                    var want = heat > 0.65 ? 'stressed' : 'hover';
                    if (actor.anim !== want) setAnim(want);
                }
                if (!actor.flight && def.sway) {
                    theta += rawDt / 1000 * def.sway[2];
                    swayOff = { x: Math.cos(theta) * def.sway[0], y: Math.sin(theta * 1.6) * def.sway[1] };
                }
                var expired = (mode === 'listen')
                    ? (!listening && ts >= listenUntil)     // 驻留期满回空闲脑
                    : (ts >= modeUntil);
                if (expired) think(ts);
            } else if (def.kind === 'once' && def.sway && actor.runners.length) {
                theta += rawDt / 1000 * def.sway[2];
                swayOff = { x: Math.cos(theta) * def.sway[0], y: Math.sin(theta * 1.6) * def.sway[1] };
            }
            // travel 的位移在 actor.update 的 flight 分支里；climb / still 无需额外逐帧项
        }

        // 盯人目标：聆听/代言朝说话席位中心，其余清零
        if (mode === 'listen' || mode === 'dash') {
            var gc = listenSeat && seatCenter(listenSeat);
            if (gc) actor.setGaze({ x: gc.x / K, y: gc.y / K });
        } else if (hostSpeak && mode === 'crow') {
            actor.setGaze({ x: anchor.x / K, y: anchor.y / K });
        } else if (actor.gazeActive) {
            actor.clearGaze();
        }
        if (tweetHandle && !(mode === 'listen' || mode === 'dash')) stopTweet();
        render();
        raf = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        lastTs = 0;
    }

    function ensureImg() {
        if (img && img.isConnected) return;
        if (!trailCv || !trailCv.isConnected) {
            trailCv = document.createElement('canvas');
            trailCv.className = 'bird-trail';
            trailCv.style.position = 'fixed';   // CSS 缺席时的内联兜底
            trailCv.style.left = '0'; trailCv.style.top = '0';
            trailCv.style.pointerEvents = 'none';
            trailCtx = trailCv.getContext('2d');
            document.body.appendChild(trailCv);
            window.addEventListener('resize', sizeTrailCanvas);
        }
        sizeTrailCanvas();
        img = document.createElement('img');
        img.className = 'bird-sprite';
        img.alt = '';
        img.draggable = false;
        // 彩蛋：按住 = Grab（hold 跟随），甩动松手 = Fling（原版时间线）；静止点击仍走鸣叫
        img.addEventListener('pointerdown', onPointerDown);
        img.addEventListener('pointermove', onPointerMove);
        img.addEventListener('pointerup', onPointerUp);
        img.addEventListener('pointercancel', onPointerUp);
        document.body.appendChild(img);   // fixed 定位挂 body，不受面板裁剪
    }

    function placeCenter(dx, dy) {        // 显示像素中心 → 引擎坐标
        if (!actor) return;
        actor.pos = { x: dx / K, y: dy / K };
        actor.rot = 0; actor.scale = { x: 1, y: 1 };
        actor.spriteOffset = { x: 0, y: 0 }; actor.spriteOffsetTarget = { x: 0, y: 0 };
        swayOff = { x: 0, y: 0 }; onceOffY = 0;
    }

    function resetState() {
        heat = 0; hostSpeak = false;
        listening = false; listenUntil = 0; listenSeat = null;
        pendingLeave = false; chainMode = null;
        lastRequest = {};
        opening = null;
        grabbed = false; flinging = false; grabPrevMode = null; grabSamples = [];
        freezeTimer = 0; timeRate = 1;
        stopTweet();
        if (actor) {
            actor.stopFlight(); actor.killPhysics(); actor.killCoroutines();
            actor.clearGaze(); actor.faceLocked = false;
            actor.facing = 1;
        }
        if (ENGINE) ENGINE.Trail.clear();
    }

    // ==================== 生命周期 API ====================

    function enter(panelEl) {
        if (!panelEl) return;
        hide();
        panel = panelEl;
        warm();
        ensureImg();
        if (!actor) {                  // 引擎缺席的退化路径：静帧 hover 挂在开场位置
            img.style.display = 'block';
            img.style.transform = 'translate(' + Math.round(Math.max(20, (innerWidth - W) / 2)) +
                'px,90px)';
            mode = 'hidden';
            showMuteBtn();
            return;
        }
        img.style.display = 'block';
        // 开场：栖在页面中央偏上
        placeCenter(Math.max(20, (innerWidth - W) / 2 + W / 2), 90 + H / 2);
        mode = 'wander';           // 兜底模式，opening 结束后正式进 think
        opening = 'crow'; phaseT = 0;
        actor.anim = 'crow'; actor.frame = 0; actor.animAcc = 0;
        applyFrame();
        showMuteBtn();
        stopLoop();
        raf = requestAnimationFrame(tick);
    }

    /** 有人准备发言：飞到席位上方倾听。距离远 → dash 冲刺；近 → 直接 listen */
    function focusSeat(speakerId) {
        if (!panel || !img || opening) return;
        if (mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        var a = seatAnchorOf(speakerId);
        if (!a) return;
        listenSeat = speakerId;
        var dx = a.x - actor.pos.x * K, dy = a.y - actor.pos.y * K;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (mode === 'listen' && dist < 140) return;   // 已经贴在附近
        anchor = a;
        listening = true; listenUntil = Infinity;
        hostSpeak = false;
        // 席位变更是权威指令：强制切换，不走反应式冷却
        enterMode(dist > 200 ? 'dash' : 'listen', performance.now(), true);
    }

    /** 发言结束：驻留 LISTEN_LINGER 后回空闲脑 */
    function speechEnd() {
        if (!listening && listenUntil !== Infinity) return;
        listening = false;
        listenUntil = performance.now() + LISTEN_LINGER;
    }

    /** 发言情绪流入：累计气氛；激烈情绪低概率把鸟吸引过去看热闹（反应式，有冷却） */
    function onEmotion(speakerId, emo) {
        if (!emo || !img) return;
        if (mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        var d = HEAT_OF[emo];
        if (!d) return;
        heat = Math.max(0, Math.min(1, heat + d));
        if (d >= 0.26 && heat > 0.5 &&
            (mode === 'wander' || mode === 'hover' || mode === 'stressed' || mode === 'hold')) {
            var a = seatAnchorOf(speakerId);
            if (a && Math.random() < 0.4) {
                anchor = a; listenSeat = speakerId;
                listening = true; listenUntil = Infinity;
                enterMode('dash', performance.now(), false);   // 走冷却+仲裁，防连续打断
            }
        }
    }

    /** 主持人（=鸟自己）开口：台顶中央 crow 代言；闭嘴回空闲脑 */
    function onHostSpeak(flag) {
        hostSpeak = !!flag;
        if (!img || mode === 'hidden' || mode === 'leave' || mode === 'perch' || opening) return;
        var now = performance.now();
        if (hostSpeak) {
            listening = false; listenUntil = 0;
            anchorHost();
            enterMode('crow', now, true);
            // crow 播完 → once 完成 → hostSpeak 时自续 crow 循环（enterMode 的 done 链）
        } else {
            think(now);
        }
    }

    /** 用户插话广播：冲刺到用户席位倾听（权威指令，强制） */
    function onUserInterject() {
        if (!panel || !img) return;
        if (mode === 'hidden' || mode === 'leave' || mode === 'perch' || opening) return;
        var a = seatAnchorOf('user');
        if (!a) return;
        anchor = a; listenSeat = 'user';
        listening = true; listenUntil = Infinity;
        hostSpeak = false;
        enterMode('dash', performance.now(), true);
    }

    /** 评审落地：<60 受击坠落→恢复；≥90 投掷→鸣叫庆祝；否则鸣叫一声 */
    function onScore(avg) {
        if (!img || mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        listening = false; listenUntil = 0; hostSpeak = false; listenSeat = null;
        lastRequest = {};   // 终场动作不受冷却限制
        stopTweet();
        var now = performance.now();
        if ((avg || 0) < 60) {
            enterMode('hurt', now, true);
        } else if (avg >= 90) {
            chainMode = 'crow';
            enterMode('throw', now, true);
        } else {
            enterMode('crow', now, true);
        }
    }

    /** 散会：一次性演出（受击/庆祝/鸣叫）播完再飞走 */
    function leave() {
        if (!img || mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        var def = MODES[mode];
        if (opening || (def && def.kind === 'once')) { pendingLeave = true; return; }
        doLeave();
    }

    function perch(panelEl) {
        if (!panelEl) return;
        hide();
        panel = panelEl;
        warm();
        ensureImg();
        img.style.display = 'block';
        if (!actor) {              // 退化：静帧 hover00 定格右上角
            img.style.transform = 'translate(' + Math.round(Math.max(60, innerWidth - W - 100)) + 'px,60px)';
            mode = 'perch';
            showMuteBtn();
            return;
        }
        mode = 'perch';
        actor.anim = 'hover'; actor.frame = 0;
        setAnim('hover'); actor.frame = 0;
        applyFrame();
        actor.facing = 1;
        placeCenter(Math.max(60, innerWidth - W - 100) + W / 2, 60 + H / 2);
        render();
        showMuteBtn();
    }

    function hide() {
        stopLoop();
        resetState();
        grabbed = false;
        if (img) img.style.display = 'none';
        if (trailCtx) trailCtx.clearRect(0, 0, trailCv.width, trailCv.height);
        if (ENGINE) ENGINE.Trail.clear();
        mode = 'hidden';
    }

    // ===== 音效开关（持久化走地基 Store.KEYS.RT_BIRD_SFX_MUTED，Store 缺席时退化裸读写） =====
    function applyMute(muted) {
        if (ENGINE) ENGINE.Sfx.setEnabled(!muted);
    }
    function muteGet() {
        try {
            if (window.Store && Store.KEYS && Store.KEYS.RT_BIRD_SFX_MUTED)
                return Store.getFlag(Store.KEYS.RT_BIRD_SFX_MUTED);
            return localStorage.getItem('rtBirdSfxMuted') === '1';
        } catch (e) { return false; }
    }
    function muteSet(on) {
        try {
            if (window.Store && Store.KEYS && Store.KEYS.RT_BIRD_SFX_MUTED)
                Store.setFlag(Store.KEYS.RT_BIRD_SFX_MUTED, on);
            else if (on) localStorage.setItem('rtBirdSfxMuted', '1');
            else localStorage.removeItem('rtBirdSfxMuted');
        } catch (e) { void e; }
    }
    function updateMuteBtn(on) {
        if (!muteBtn) return;
        muteBtn.textContent = on ? '🐦♪' : '🐦∅';
        muteBtn.title = '鸟声音效：' + (on ? '开' : '关');
    }
    function ensureMuteBtn() {
        if (muteBtn || typeof document === 'undefined') return;
        muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = 'bird-sfx-toggle';
        updateMuteBtn(!muteGet());
        muteBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var nowOn = ENGINE ? ENGINE.Sfx.isEnabled() : true;
            applyMute(nowOn);                       // 当前开着 → 点击后关
            updateMuteBtn(!nowOn);
            muteSet(nowOn);
        });
        document.body.appendChild(muteBtn);
    }

    window.RoundtableBird = {
        enter: enter,
        focusSeat: focusSeat,
        speechEnd: speechEnd,
        onEmotion: onEmotion,
        onHostSpeak: onHostSpeak,
        onUserInterject: onUserInterject,
        onScore: onScore,
        leave: leave,
        perch: perch,
        hide: hide,
        _mute: function (on) {
            ensureMuteBtn();
            applyMute(!!on);
            updateMuteBtn(!on);
            muteSet(!!on);
        },
        _state: function () {
            return {
                mode: mode,
                anim: actor ? actor.anim : 'hover',
                heat: Math.round(heat * 100) / 100,
                opening: opening,
                grab: grabbed,
                fling: flinging,
                trail: ENGINE ? ENGINE.Trail.points.length : 0
            };
        }
    };

    // 页面加载即接线：静音偏好恢复 + 挂起按钮（enter/perch 时才显形，但按钮常驻角落）
    function showMuteBtn() { if (muteBtn) muteBtn.style.display = 'flex'; }
    document.addEventListener('DOMContentLoaded', function () {
        applyMute(muteGet());
        ensureMuteBtn();
    });
    if (document.readyState !== 'loading') { applyMute(muteGet()); ensureMuteBtn(); }
})();
