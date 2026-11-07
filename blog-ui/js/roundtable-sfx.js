/* ===== 圆桌会议「AI 特殊音效」视觉表现层 =====
   触发来源：后端解析模型输出里的 [sfx:yolo] / [sfx:granny_haha] 后，通过 SSE 的 sfx 事件单独下发。
   原作取证（Celeste REA）：
     Theo YOLO  —— NPC01_Theo.Yolo()：yolo 精灵 4 帧（0.1s/帧）→ 向上定向震屏 0.3s →
                    6 颗绿色像素粒子（particles/rect，0.3~0.6s，速度 10~20px/s，±22.5°）→ yoloEnd。
     Granny 笑  —— GrannyLaughSfx + Hahaha：laugh 精灵 4 帧循环（0.1s/帧）；"HA" 贴图
                    （11×7，16 帧 × 0.15s）每 0.6s 冒一串、最多 3 串，向右飘 60px、向上约 26px。
                    无震屏、无闪光、无粒子、无 shader/全屏后处理。
   本文件只做「最省事近似版」：头像动画 + 音效 + YOLO 震屏/6 颗粒子 + Granny 三串 HA。
   暴露 window.RoundtableSfx：
     trigger(kind, speakerId)  播放音效并出特效，返回是否真的触发（被节流则 false）
     onTurnStart(speakerId)    新一轮发言开始，重置「每轮最多一次」
     isSuppressing(speakerId)  特效期间压住逐字情绪换头像，避免 yolo/laugh 被立刻顶掉
*/
(function () {
    // 节流常量（与后端 RoundtableEngine.SFX_COOLDOWN_MS / SFX_MAX_PER_TURN 对齐）
    var COOLDOWN_MS = 30000;   // 同一角色两次特殊音效的最小间隔
    var MAX_PER_TURN = 1;      // 同一轮发言最多触发一次
    var SUPPRESS_MS = 900;     // yolo 头像保持时长（granny 笑用 1800，见 trigger）

    var turnUsed = 0;                 // 本轮已触发次数
    var lastAt = {};                  // speakerId → 上次触发时间
    var suppressUntil = {};           // speakerId → 头像抑制截止时间

    var HA_SEQ = [0, 1, 0, 1, 0, 1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];  // Sprites.xml "ha" 16 帧
    var HA_FRAME_MS = 150;
    var HA_LIFE_MS = 2400;            // 16 × 0.15s
    var HA_BASE = 'Atlases/Gameplay/characters/oldlady/ha';
    var YOLO_COLORS = ['#8EED80', '#37946E'];   // ParticleType.BlockColor / Color2

    function now() { return Date.now(); }

    function reducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    // 当前发言气泡的头像；找不到时退回座位头像
    function anchorImg(speakerId) {
        var bubble = document.querySelector('#transcript .sp .tb-portrait img, #transcript .sp .b-avatar img');
        if (bubble) return bubble;
        return document.querySelector('#seat-' + speakerId + ' .avatar img.avatar-img');
    }

    // 覆盖层：.scene-wrap 内绝对定位，全屏时随场景一起缩放
    function layer() {
        var l = document.getElementById('sfxLayer');
        if (l) return l;
        var wrap = document.getElementById('sceneWrap') || document.querySelector('.scene-wrap');
        if (!wrap) return null;
        l = document.createElement('div');
        l.className = 'sfx-layer';
        l.id = 'sfxLayer';
        l.setAttribute('aria-hidden', 'true');
        wrap.appendChild(l);
        return l;
    }

    // 元素相对场景的坐标（全屏时 .scene-wrap 被 scale，需换算回未缩放的 CSS 像素）
    function rectInLayer(l, img) {
        var r = img.getBoundingClientRect();
        var lr = l.getBoundingClientRect();
        var scale = (l.clientWidth && lr.width) ? lr.width / l.clientWidth : 1;
        return {
            x: (r.left - lr.left) / scale,
            y: (r.top - lr.top) / scale,
            w: r.width / scale,
            h: r.height / scale
        };
    }

    function portraitPlay(speakerId, emotion, once) {
        if (!window.RoundtablePortraits) return;
        var imgs = [
            document.querySelector('#transcript .sp .tb-portrait img, #transcript .sp .b-avatar img'),
            document.querySelector('#seat-' + speakerId + ' .avatar img.avatar-img')
        ];
        for (var i = 0; i < imgs.length; i++) {
            if (!imgs[i]) continue;
            var anim = RoundtablePortraits.attach(imgs[i], speakerId);
            if (anim) { once ? anim.playOnce(emotion) : anim.play(emotion); }
        }
    }

    // 原作：Level.DirectionalShake(-Vector2.UnitY)，方向向上，0.3s，幅度 3px，40ms 一抖
    function shake(durationMs, ampPx) {
        if (reducedMotion()) return;
        var el = document.getElementById('transcript');
        if (!el) return;
        var t0 = now();
        var sign = 1;
        var timer = setInterval(function () {
            if (now() - t0 >= durationMs) {
                clearInterval(timer);
                el.style.translate = '';
                return;
            }
            sign = -sign;
            el.style.translate = '0 ' + (sign * ampPx) + 'px';
        }, 40);
    }

    // 6 颗绿色像素粒子：向上 ±22.5°，速度放大到 40~80px/s（原作 10~20 在 320×180 画面里）
    function yoloParticles(speakerId) {
        var l = layer();
        var img = anchorImg(speakerId);
        if (!l || !img) return;
        var a = rectInLayer(l, img);
        var ox = a.x + a.w * 0.55;
        var oy = a.y + a.h * 0.16;
        for (var i = 0; i < 6; i++) {
            var p = document.createElement('i');
            p.className = 'sfx-p';
            var ang = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 4);
            var spd = 40 + Math.random() * 40;
            var life = 300 + Math.random() * 300;
            p.style.left = (ox + (Math.random() - 0.5) * 8) + 'px';
            p.style.top = (oy + (Math.random() - 0.5) * 8) + 'px';
            p.style.background = YOLO_COLORS[0];
            l.appendChild(p);
            (function (el, ang, spd, life) {
                var t0 = performance.now();
                var blinked = false;
                function tick(t) {
                    var e = t - t0;
                    if (e >= life) { el.remove(); return; }
                    var k = e / 1000;
                    el.style.transform = 'translate(' + (Math.cos(ang) * spd * k).toFixed(1) + 'px,'
                        + (Math.sin(ang) * spd * k).toFixed(1) + 'px)';
                    var q = e / life;
                    el.style.opacity = q > 0.75 ? String((1 - q) / 0.25) : '1';
                    if (!blinked && q > 0.5) { blinked = true; el.style.background = YOLO_COLORS[1]; }
                    requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
            })(p, ang, spd, life);
        }
    }

    // 一串 HA：16 帧 × 150ms，向右 120px、向上约 52px（原作 60/26，像素画放大约 2×）
    function haBurst(l, ox, oy) {
        var el = document.createElement('img');
        el.className = 'sfx-ha';
        el.alt = '';
        el.src = HA_BASE + '00.png';
        el.style.left = ox + 'px';
        el.style.top = oy + 'px';
        l.appendChild(el);
        var fi = 0;
        var timer = setInterval(function () {
            fi++;
            if (fi >= HA_SEQ.length) { clearInterval(timer); return; }
            el.src = HA_BASE + pad2(HA_SEQ[fi]) + '.png';
        }, HA_FRAME_MS);
        var t0 = performance.now();
        (function tick(t) {
            var e = t - t0;
            if (e >= HA_LIFE_MS) { clearInterval(timer); el.remove(); return; }
            var q = Math.min(1, e / HA_LIFE_MS);
            var x = q * 120;
            var y = (-10 - Math.sin(q * 13) * 4 - q * 16) * 2;   // 原作 y 轨迹放大 2×
            el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
            requestAnimationFrame(tick);
        })(t0);
    }

    function grannyHaha(speakerId) {
        var l = layer();
        var img = anchorImg(speakerId);
        if (!l || !img) return;
        var a = rectInLayer(l, img);
        var ox = a.x + a.w * 0.85 + 8;    // 原作 Position + (8, -4)
        var oy = a.y + a.h * 0.30 - 4;
        // Hahaha：每 0.6s 冒一串，最多 3 串
        for (var i = 0; i < 3; i++) {
            (function (delay) {
                setTimeout(function () {
                    if (!l.isConnected) return;
                    haBurst(l, ox, oy);
                }, delay);
            })(i * 600);
        }
    }

    function trigger(kind, speakerId) {
        if (!kind || !speakerId) return false;
        if (turnUsed >= MAX_PER_TURN) return false;                  // 每轮最多一次
        var t = now();
        if (lastAt[speakerId] && t - lastAt[speakerId] < COOLDOWN_MS) return false;  // 同角色冷却
        turnUsed++;
        lastAt[speakerId] = t;

        if (window.RoundtableVoice && RoundtableVoice.playSpecial) RoundtableVoice.playSpecial(kind);

        if (kind === 'yolo') {
            portraitPlay(speakerId, 'yolo', true);
            suppressUntil[speakerId] = t + SUPPRESS_MS;
            shake(300, 4);
            yoloParticles(speakerId);
            return true;
        }
        if (kind === 'granny_haha') {
            portraitPlay(speakerId, 'laugh', false);
            suppressUntil[speakerId] = t + 1800;
            grannyHaha(speakerId);
            return true;
        }
        return false;
    }

    function onTurnStart() {
        turnUsed = 0;
    }

    function isSuppressing(speakerId) {
        return !!(suppressUntil[speakerId] && now() < suppressUntil[speakerId]);
    }

    window.RoundtableSfx = {
        trigger: trigger,
        onTurnStart: onTurnStart,
        isSuppressing: isSuppressing,
        // 调参用
        _COOLDOWN_MS: COOLDOWN_MS,
        _MAX_PER_TURN: MAX_PER_TURN
    };
})();
