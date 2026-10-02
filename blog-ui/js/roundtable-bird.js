/* ===== 圆桌会议主持鸟行为树（Celeste bird，roundtable.html 专用） =====
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

   行为树（对齐 madeline-core.js 的数据驱动状态机风格）：
     · MODES 模式表：动画/移动方式/优先级/时长/摆幅/行为链 集中一处
     · think() 空闲脑：加权随机挑下一个行为，避开刚做过的；发言驻留期贴着不走
     · 反应式触发：事件驱动 + 逐模式冷却 + 优先级仲裁 + 最小驻留（enterMode 第三参=false）
     · 会场气氛 heat：随各人发言情绪升温/随时间冷却；热了换紧张盘旋、摆幅加快，
       激烈情绪还有概率把鸟直接吸引过去看热闹
   暴露 window.RoundtableBird：
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
     _state()          测试自检：当前模式/动画/气氛热度 */
(function () {
    var BASE = 'Atlases/Gameplay/characters/bird/';
    var W = 96, H = 72;                  // 3x 显示尺寸

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

    /* ===== 行为模式表 =====
       kind: travel=飞向锚点（到点接 arrive）| loop=锚点摆动循环（dur 到点回 think）
             once=单次播完（接 next / 回 think）| climb=爬升离场 | still=定格
       sway: [水平摆幅, 垂直摆幅, 摆动角速度]；drop/rise: once 期间垂直位移 px */
    var MODES = {
        wander:   { kind: 'travel', anim: 'fly',      priority: 10, speed: 180, arrive: 'hover' },
        hover:    { kind: 'loop',   anim: 'hover',    priority: 10, dur: [5000, 9000], sway: [18, 7, 2.2] },
        listen:   { kind: 'loop',   anim: 'hover',    priority: 60, dur: 0,            sway: [10, 5, 2.6] },
        stressed: { kind: 'loop',   anim: 'stressed', priority: 30, dur: [2600, 5200], sway: [13, 9, 3.6] },
        crow:     { kind: 'once',   anim: 'crow',     priority: 40, sway: [10, 5, 2.2] },
        hold:     { kind: 'loop',   anim: 'hold',     priority: 15, dur: [2200, 3600], sway: [8, 4, 1.8] },
        dash:     { kind: 'travel', anim: 'dash',     priority: 70, speed: 430, arrive: 'listen' },
        hurt:     { kind: 'once',   anim: 'hurt',     priority: 90, drop: 34, next: 'recover' },
        recover:  { kind: 'once',   anim: 'recover',  priority: 85, rise: 34 },
        throw:    { kind: 'once',   anim: 'throw',    priority: 50, sway: [8, 4, 2.0] },
        leave:    { kind: 'climb',  anim: 'flyup',    priority: 100 },
        perch:    { kind: 'still',  anim: 'hover',    priority: 100 }
    };
    var MIN_DWELL = 700;           // 最小驻留：刚进模式不被同级瞬间顶掉
    var HARD_GAP = 40;             // 优先级差足够大可硬打断（对齐 madeline-core）
    var REACTIVE_COOLDOWN = 2400;  // 同一反应式模式冷却
    var LEAVE_SPEED = 260;         // 离场爬升 px/s
    var HEAT_DECAY = 0.07;         // 会场气氛每秒降温
    var LISTEN_LINGER = 1200;      // 发言结束后的倾听驻留 ms

    // 发言情绪 → 气氛热度增量（激烈升温 / 缓和降温），情绪 key 与语音引擎 1:1
    var HEAT_OF = {
        angry: .30, angryAlt: .30, yell: .38, wtf: .26,
        freakA: .34, freakB: .38, freakC: .42, lostcontrol: .42,
        mock: .18, scoff: .14, worried: .14, sideworried: .14, nervous: .12,
        sad: .10, sadder: .10, upset: .10,
        excited: -.10, nailedit: -.12, laugh: -.14, sidehappy: -.12,
        distracted: -.10, determined: -.06
    };

    var warmed = false;
    function warm() {
        if (warmed) return;
        warmed = true;
        Object.keys(FRAMES).forEach(function (g) {
            FRAMES[g].forEach(function (n) {
                var im = new Image();
                im.src = BASE + n + '.png';
            });
        });
    }

    // ===== 运行状态 =====
    var img = null, panel = null;
    var mode = 'hidden';           // hidden | MODES key（opening 期间由 opening 变量接管）
    var anim = 'hover', idx = 0, animAcc = 0;
    var x = 0, y = 0, face = 1;
    var anchor = { x: 0, y: 0 };
    var theta = 0, modeUntil = 0, enteredAt = 0;
    var phaseT = 0, onceFrom = 0;        // once 动画计时与起始高度（hurt 坠落/recover 拉升）
    var opening = null;                  // 'crow' | 'flyup' 开场脚本序列
    var heat = 0;                        // 会场气氛 0..1
    var listening = false, listenUntil = 0;
    var hostSpeak = false;
    var pendingLeave = false, chainMode = null;
    var lastRequest = {};                // 反应式触发逐模式冷却表
    var raf = null, lastTs = 0;

    function applyFrame() { img.src = BASE + FRAMES[anim][idx] + '.png'; }

    function setAnim(name) {
        if (anim === name) return;
        anim = name; idx = 0; animAcc = 0;
        applyFrame();
    }

    function place(px, py) {
        if (px < x - 0.5) face = 1;          // 向左飞：素材原始朝向
        else if (px > x + 0.5) face = -1;    // 向右飞：水平翻转
        x = px; y = py;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)' +
            (face < 0 ? ' scaleX(-1)' : '');
    }

    function advanceLoop(dt) {
        animAcc += dt;
        var ms = FRAME_MS[anim], n = FRAMES[anim].length;
        while (animAcc >= ms) {
            animAcc -= ms;
            idx = (idx + 1) % n;
        }
        applyFrame();
    }

    // ===== 锚点 =====
    function seatAnchorOf(id) {
        var seat = panel && panel.querySelector('#seat-' + id);
        if (!seat) return null;
        var pr = panel.getBoundingClientRect(), sr = seat.getBoundingClientRect();
        return { x: (sr.left - pr.left) + (sr.width - W) / 2, y: (sr.top - pr.top) - H - 8 };
    }
    // 随机游荡锚点：会议卡片上沿之上的一条横带（避开左上返回链接与右上按钮）
    function pickAnchor() {
        var pw = panel.clientWidth;
        var minX = Math.min(200, pw * 0.25);
        var maxX = Math.max(minX + 60, pw - W - 120);
        anchor.x = minX + Math.random() * (maxX - minX);
        anchor.y = -56 + Math.random() * 34;   // 卡片上沿上方 22~56px
    }
    // 主持人锚点：台顶正中央（主持人没有席位卡）
    function anchorHost() {
        anchor.x = Math.max(20, (panel.clientWidth - W) / 2);
        anchor.y = -60;
    }

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
        mode = key;
        enteredAt = now;
        modeUntil = def.dur ? now + def.dur[0] + Math.random() * (def.dur[1] - def.dur[0]) : Infinity;
        if (def.kind === 'travel' && key === 'wander') pickAnchor();
        if (def.kind === 'once') {
            phaseT = 0; onceFrom = y;
            if (def.sway) { anchor.x = x; anchor.y = y; }   // 原地演出，防锚点跳变瞬移
        }
        theta = Math.random() * Math.PI * 2;
        setAnim(def.anim);
        return true;
    }

    // ===== 空闲脑：加权随机挑下一个行为 =====
    function think(now) {
        if (pendingLeave) { doLeave(); return; }
        if (listening || now < listenUntil) {          // 发言中/驻留中：贴着席位不走
            if (mode !== 'listen' && mode !== 'dash') enterMode('listen', now, true);
            return;
        }
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
        mode = 'leave';
        enteredAt = performance.now();
        setAnim('flyup');
        if (!raf) raf = requestAnimationFrame(tick);
    }

    // ===== 主循环 =====
    function tick(ts) {
        if (!lastTs) lastTs = ts;
        var dt = Math.min(50, ts - lastTs);   // 掉帧保护
        lastTs = ts;
        heat = Math.max(0, heat - HEAT_DECAY * dt / 1000);

        if (opening) {
            // 开场脚本：crow 鸣叫 → flyup 起飞（抬 36px）→ 交给行为树
            phaseT += dt;
            var on = FRAMES[opening].length;
            var fi = Math.min(Math.floor(phaseT / FRAME_MS[opening]), on - 1);
            if (fi !== idx) { idx = fi; applyFrame(); }
            if (opening === 'flyup') {
                var k = Math.min(1, phaseT / (on * FRAME_MS.flyup));
                place(x, onceFrom - 36 * k);
            }
            if (phaseT >= on * FRAME_MS[opening]) {
                if (opening === 'crow') {
                    opening = 'flyup'; phaseT = 0; onceFrom = y;
                    setAnim('flyup');
                } else {
                    opening = null;
                    enterMode('wander', ts, true);
                }
            }
            raf = requestAnimationFrame(tick);
            return;
        }

        var def = MODES[mode];
        if (def) {
            if (def.kind === 'travel') {
                advanceLoop(dt);
                var dx = anchor.x - x, dy = anchor.y - y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                var step = def.speed * dt / 1000;
                if (dist <= step + 3) {
                    place(anchor.x, anchor.y);
                    enterMode(def.arrive || 'hover', ts, true);
                } else {
                    place(x + dx / dist * step, y + dy / dist * step);
                }
            } else if (def.kind === 'loop') {
                advanceLoop(dt);
                // 倾听时气氛过热：同一席位上换紧张盘旋（不挪窝，只换动画与摆幅）
                if (mode === 'listen') {
                    var want = heat > 0.65 ? 'stressed' : 'hover';
                    if (anim !== want) setAnim(want);
                }
                theta += dt / 1000 * def.sway[2];
                place(anchor.x + Math.cos(theta) * def.sway[0],
                      anchor.y + Math.sin(theta * 1.6) * def.sway[1]);
                var expired = (mode === 'listen')
                    ? (!listening && ts >= listenUntil)     // 驻留期满回空闲脑
                    : (ts >= modeUntil);
                if (expired) think(ts);
            } else if (def.kind === 'once') {
                phaseT += dt;
                var n = FRAMES[anim].length;
                var dur = n * FRAME_MS[anim];
                var oi = Math.min(Math.floor(phaseT / FRAME_MS[anim]), n - 1);
                if (oi !== idx) { idx = oi; applyFrame(); }
                var ok = Math.min(1, phaseT / dur);
                if (def.drop) place(x, onceFrom + def.drop * ok);        // 受击下坠
                else if (def.rise) place(x, onceFrom - def.rise * ok);   // 拉升恢复
                else if (def.sway) {
                    theta += dt / 1000 * def.sway[2];
                    place(anchor.x + Math.cos(theta) * def.sway[0],
                          anchor.y + Math.sin(theta * 1.6) * def.sway[1]);
                }
                if (ok >= 1) {
                    if (pendingLeave) doLeave();
                    else if (chainMode) { var cm = chainMode; chainMode = null; enterMode(cm, ts, true); }
                    else if (def.next) enterMode(def.next, ts, true);
                    else think(ts);
                }
            } else if (def.kind === 'climb') {
                advanceLoop(dt);
                place(x, y - LEAVE_SPEED * dt / 1000);
                if (y < -H - 40) { hide(); return; }
            }
            // still（perch）：定格不动
        }
        raf = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        lastTs = 0;
    }

    function ensureImg() {
        if (img && img.isConnected && img.parentNode === panel) return;
        img = document.createElement('img');
        img.className = 'bird-sprite';
        img.alt = '';
        panel.appendChild(img);
    }

    function resetState() {
        heat = 0; hostSpeak = false;
        listening = false; listenUntil = 0;
        pendingLeave = false; chainMode = null;
        lastRequest = {};
        opening = null;
    }

    // ==================== 生命周期 API ====================

    function enter(panelEl) {
        if (!panelEl) return;
        hide();
        panel = panelEl;
        warm();
        ensureImg();
        img.style.display = 'block';
        // 开场：栖在卡片上沿中央
        x = Math.max(20, (panel.clientWidth - W) / 2);
        y = -26; face = 1;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
        mode = 'wander';           // 兜底模式，opening 结束后正式进 think
        opening = 'crow'; phaseT = 0;
        anim = 'crow'; idx = 0; animAcc = 0;
        applyFrame();
        stopLoop();
        raf = requestAnimationFrame(tick);
    }

    /** 有人准备发言：飞到席位上方倾听。距离远 → dash 冲刺；近 → 直接 listen */
    function focusSeat(speakerId) {
        if (!panel || !img || opening) return;
        if (mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        var a = seatAnchorOf(speakerId);
        if (!a) return;
        var dx = a.x - x, dy = a.y - y;
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
                anchor = a;
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
            // crow 播完 → once 完成 → think() → hostSpeak 池继续 crow/hover 交替
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
        anchor = a;
        listening = true; listenUntil = Infinity;
        hostSpeak = false;
        enterMode('dash', performance.now(), true);
    }

    /** 评审落地：<60 受击坠落→恢复；≥90 投掷→鸣叫庆祝；否则鸣叫一声 */
    function onScore(avg) {
        if (!img || mode === 'hidden' || mode === 'leave' || mode === 'perch') return;
        listening = false; listenUntil = 0; hostSpeak = false;
        lastRequest = {};   // 终场动作不受冷却限制
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
        mode = 'perch';
        anim = 'hover'; idx = 0;
        applyFrame();
        face = 1;
        x = Math.max(60, panel.clientWidth - W - 140); y = -40;
        img.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }

    function hide() {
        stopLoop();
        resetState();
        mode = 'hidden';
        if (img) img.style.display = 'none';
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
        _state: function () {
            return { mode: mode, anim: anim, heat: Math.round(heat * 100) / 100, opening: opening };
        }
    };
})();
