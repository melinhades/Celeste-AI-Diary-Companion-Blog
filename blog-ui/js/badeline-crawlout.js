/* Badeline 爬出对话框 —— shelf / 圆桌会议 / 在线聊天室共用
 *
 * 素材（blog-ui/Atlases/Gameplay/characters/badeline/，32×32 / 12×16，Justify .5,1）：
 *   dangling00-09  悬挂抓沿（手在框沿上，身体还在框内）
 *   frontedge00-08 正面翻上边沿（"爬出"主体）
 *   idle00-08      站定
 * 原作没有独立的"爬出文本框"帧组，这里用三组帧 + 程序化位移补间串成：
 *   露头（hang）→ 爬出（pull）→ 站定（stand）→ 缩回立绘槽（handoff）
 *
 * 用法（只传容器与时机，不改各页样式）：
 *   window.BadelineCrawlOut.play({
 *     box:      产生的对话框 / 文本框 / 聊天气泡（必填）
 *     portrait: 结束后要交回的正常立绘容器（可选；不给就原地淡出）
 *     scaleRef: 外部尺寸参照（可选；给定时本体高额外参考它的 16%，用于小气泡页面
 *               维持统一大小；不给就只按 box 自身撑满）
 *     fit:      本体高 / 框高的比例（默认 1.0 = 撑满框高；越小越小只）
 *     minBody:  本体高下限 px（默认 40，框特别小时兜底）
 *     anchor:   露头的水平锚点（默认 portrait || box）
 *     onDone / onCancel
 *   }) → { cancel() }
 *
 * 约束落实：
 *   - 只用 atlases 现有素材，缺帧由位移补间补齐，不省略效果
 *   - 放大用整数倍 + image-rendering:pixelated，保持像素锐度
 *   - 覆盖层 pointer-events:none，不抢焦点、不阻断滚动/点击
 *   - 低配 / 触屏 / 窄屏：缩短时长、隔帧采样（不压尺寸）
 *   - prefers-reduced-motion：200ms 快速露头 + 直接交回立绘
 *   - 容器被移除 / 收起时自动取消并恢复立绘
 */
(function () {
    'use strict';

    var BASE = 'Atlases/Gameplay/characters/badeline/';
    // 源帧里角色本体高约 12px（画布更大但透明留白多），缩放以本体为准
    var BODY_PX = 12;
    var FIT_BOX = 1.0;       // 本体高 = 框高 × FIT_BOX（撑满对话框）
    var MIN_BODY = 40;       // 本体高下限（px）：框再小也保证看得清
    var REF_FRAC = 0.18;     // 传了外部 scaleRef 时，本体高再取它的 18% 作为参照（小气泡页维持统一大小）
    var GROUPS = {
        hang:  { name: 'dangling',  n: 10, w: 32, h: 32, align: 15.5, step: 90 },
        pull:  { name: 'frontedge', n: 9,  w: 12, h: 16, align: 5.5,  step: 42 },
        stand: { name: 'idle',      n: 9,  w: 32, h: 32, align: 14,   step: 110 }
    };

    var cache = Object.create(null);   // name+idx → blob URL（或原始 URL 兜底）
    var preloadPromise = null;
    var active = null;                 // 同一时刻只允许一个实例

    function frameUrl(name, i) {
        return BASE + name + (i < 10 ? '0' + i : '' + i) + '.png';
    }

    function preload() {
        if (preloadPromise) return preloadPromise;
        if (!window.fetch) {   // 老环境直接走原始 URL
            Object.keys(GROUPS).forEach(function (k) {
                var g = GROUPS[k];
                for (var i = 0; i < g.n; i++) cache[g.name + i] = frameUrl(g.name, i);
            });
            preloadPromise = Promise.resolve();
            return preloadPromise;
        }
        var jobs = [];
        Object.keys(GROUPS).forEach(function (k) {
            var g = GROUPS[k];
            for (var i = 0; i < g.n; i++) {
                (function (name, idx) {
                    var u = frameUrl(name, idx);
                    jobs.push(fetch(u).then(function (r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.blob();
                    }).then(function (b) {
                        cache[name + idx] = URL.createObjectURL(b);   // 预解码，切帧不闪
                    }).catch(function () {
                        cache[name + idx] = u;                        // file:// 等场景直连
                    }));
                })(g.name, i);
            }
        });
        preloadPromise = Promise.all(jobs);
        return preloadPromise;
    }

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
    function easeInOutQuad(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    function prefReduced() {
        try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (e) { return false; }
    }
    function isLowEnd() {
        var cores = navigator.hardwareConcurrency || 4;
        var mem = navigator.deviceMemory || 4;
        var coarse = false;
        try { coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches; } catch (e) {}
        return cores <= 2 || mem <= 2 || (coarse && cores <= 4) || window.innerWidth < 640;
    }

    function play(opts) {
        if (!opts || !opts.box || !window.requestAnimationFrame) return null;
        if (active) active.cancel(true);   // 换一个落点就接管，不叠加

        var box = opts.box;
        var portrait = opts.portrait || null;
        var scaleRef = opts.scaleRef || box;
        var anchorEl = opts.anchor || portrait || box;

        var reduced = prefReduced();
        var low = !reduced && isLowEnd();
        var k = reduced ? 0.30 : (low ? 0.66 : 1);   // 时长系数
        var stride = (reduced || low) ? 2 : 1;       // 隔帧采样，减少帧数

        var T = {
            rise: 470 * k,
            pull: 330 * k,
            stand: 300 * k,
            hand: 300 * k
        };

        var root = document.createElement('div');
        root.setAttribute('aria-hidden', 'true');
        root.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;' +
            'pointer-events:none;overflow:visible;z-index:9999;contain:layout paint';

        var sprite = new Image();
        sprite.alt = '';
        sprite.draggable = false;
        sprite.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;opacity:0;' +
            'image-rendering:pixelated;-ms-interpolation-mode:nearest-neighbor;' +
            'pointer-events:none;user-select:none;-webkit-user-drag:none;' +
            'transform-origin:50% 100%;will-change:transform,opacity' +
            (low ? '' : ';filter:drop-shadow(0 3px 5px rgba(0,0,0,.45))');
        root.appendChild(sprite);
        // 挂到 body 才会被渲染；旧版漏了这步，整套动画实际上从没上过屏
        (document.body || document.documentElement).appendChild(root);

        // 立绘先藏起来，结束时再交叉淡入（记录原值，取消也还原）
        var pOpacity = null, pTransition = null;
        if (portrait) {
            pOpacity = portrait.style.opacity;
            pTransition = portrait.style.transition;
            portrait.style.transition = 'none';   // 起身瞬间藏立绘，收尾时再淡入
            portrait.style.opacity = '0';
        }

        var st = {
            cancelled: false, done: false, raf: 0, t0: 0,
            lastFrame: '', readyFx: 0, opCheck: 0,
            geo: null, geoDirty: true, baseKey: '', baseW: 0, baseH: 0,
            lastOp: null, lastClip: null
        };
        var handle = { cancel: function () { shutdown(true, false); } };

        // 几何只在开场 / 窗口 resize / 祖先滚动时重测；动画期间不再每帧读布局
        var onGeo = function () { if (!st.cancelled) st.geoDirty = true; };
        window.addEventListener('resize', onGeo);
        window.addEventListener('scroll', onGeo, true);

        function restorePortrait() {
            if (!portrait) return;
            portrait.style.opacity = pOpacity == null ? '' : pOpacity;
            portrait.style.transition = pTransition == null ? '' : pTransition;
        }

        function shutdown(quiet, finished) {
            if (st.cancelled) return;
            st.cancelled = true;
            if (st.raf) cancelAnimationFrame(st.raf);
            window.removeEventListener('resize', onGeo);
            window.removeEventListener('scroll', onGeo, true);
            restorePortrait();
            if (root.parentNode) root.parentNode.removeChild(root);
            if (active === handle) active = null;
            if (finished) {
                if (opts.onDone) opts.onDone();
            } else if (!quiet && opts.onCancel) {
                opts.onCancel();
            }
        }

        function setFrame(key, elapsed) {
            var g = GROUPS[key];
            var raw = Math.floor(elapsed / (g.step * stride)) * stride;   // 隔帧采样、帧率减半
            var idx = key === 'pull' ? Math.min(g.n - 1, raw) : (raw % g.n);
            var tag = key + idx;
            if (tag === st.lastFrame) return;
            st.lastFrame = tag;
            sprite.src = cache[g.name + idx] || frameUrl(g.name, idx);
        }

        function setBase(g, bodyH) {
            var key = g.name + '@' + bodyH;
            if (key === st.baseKey) return;
            st.baseKey = key;
            st.baseW = g.w * bodyH / BODY_PX;
            st.baseH = g.h * bodyH / BODY_PX;
            // 只在换帧组时写一次尺寸；tick 其余时间不碰布局属性
            sprite.style.width = st.baseW.toFixed(2) + 'px';
            sprite.style.height = st.baseH.toFixed(2) + 'px';
        }

        function setOpacity(v) {
            var s = v == null ? '1' : String(v);
            if (s === st.lastOp) return;
            st.lastOp = s;
            sprite.style.opacity = s;
        }
        // clip-path 只在数值真的变了才写（取整到像素，减少无意义重绘）
        function setClip(px) {
            var s = px > 0.5 ? 'inset(0px 0px ' + Math.round(px) + 'px 0px)' : 'none';
            if (s === st.lastClip) return;
            st.lastClip = s;
            sprite.style.clipPath = s;
            sprite.style.webkitClipPath = s;
        }

        function place(g, ax, rimY, bodyH, belowBody, scaleY, opacity) {
            setBase(g, bodyH);
            var top = rimY + belowBody * bodyH - st.baseH;
            var left = ax - g.align * bodyH / BODY_PX;
            var clip = Math.max(0, belowBody * bodyH);
            sprite.style.transform = 'translate3d(' + left.toFixed(2) + 'px,' + top.toFixed(2) + 'px,0)' +
                (scaleY && scaleY !== 1 ? ' scaleY(' + scaleY.toFixed(3) + ')' : '');
            setOpacity(opacity);
            setClip(clip);
        }

        function measure() {
            var br = box.getBoundingClientRect();
            var ar = (anchorEl || box).getBoundingClientRect();
            var sr = (scaleRef && scaleRef !== box) ? scaleRef.getBoundingClientRect() : null;
            return {
                br: br,
                ax: ar.left + ar.width / 2,
                rimY: br.top,
                boxH: br.height,
                refH: sr ? sr.height : 0,    // 外部参照高（可选）
                pr: portrait ? portrait.getBoundingClientRect() : null
            };
        }

        function start() {
            st.geo = measure();
            st.geoDirty = false;
            var g = st.geo;
            // 以「撑满对话框」定尺寸：本体高 ≈ 框高；框特别小时用 minBody 兜底。
            // 旧版按框高 52% 算再夹 3–7 倍，窄框里冒出来只有几十像素，几乎看不见。
            var fit = (opts.fit > 0) ? opts.fit : FIT_BOX;
            var minBody = (opts.minBody > 0) ? opts.minBody : MIN_BODY;
            var target = Math.max(minBody, g.boxH * fit);
            if (g.refH > 0) target = Math.max(target, g.refH * REF_FRAC);
            // 唯一上限：头顶不能越出屏幕顶部（留 8px），不设固定倍数上限
            target = Math.min(target, Math.max(minBody, g.rimY - 8));
            // 整数倍放大：像素边缘保持锐利，不平滑
            st.scale = Math.max(1, Math.round(target / BODY_PX));
            st.t0 = nowMs();
            st.raf = requestAnimationFrame(tick);
        }

        function tick() {
            if (st.cancelled) return;
            if (st.geoDirty) { st.geo = measure(); st.geoDirty = false; }
            var m = st.geo;
            if (!box.isConnected || !m || m.br.width < 1 || m.br.height < 1) {
                if (++st.readyFx > 4) { shutdown(true, false); return; }
            } else {
                st.readyFx = 0;
            }

            var bodyH = BODY_PX * st.scale;
            var t = nowMs() - st.t0;
            var g, below, scaleY = 1, opacity = 1;

            // 对话框被点掉 / 收起（透明）→ 立即收尾，别对着空框演完
            if (t > 420 && ++st.opCheck % 8 === 0) {
                var op = 1;
                try { op = parseFloat(getComputedStyle(box).opacity); } catch (e) {}
                if (!(op > 0.08)) { shutdown(true, false); return; }
            }

            if (t < T.rise) {
                var p1 = easeOutCubic(t / T.rise);
                below = 0.75 + (0.35 - 0.75) * p1;   // 只露头/手 → 上半身
                g = GROUPS.hang;
                setFrame('hang', t);
            } else if (t < T.rise + T.pull) {
                var p2 = easeInOutQuad((t - T.rise) / T.pull);
                below = 0.35 * (1 - p2);             // 撑起来 → 脚踩到框沿
                g = GROUPS.pull;
                setFrame('pull', t - T.rise);
            } else if (t < T.rise + T.pull + T.stand) {
                var p3 = (t - T.rise - T.pull) / T.stand;
                var hop = Math.sin(Math.min(1, p3 * 1.25) * Math.PI);
                below = -0.10 * hop;                 // 站定小跳，脚落回框沿
                scaleY = 1 + 0.05 * hop;
                g = GROUPS.stand;
                setFrame('stand', t - T.rise - T.pull);
            } else {
                var p4 = clamp((t - T.rise - T.pull - T.stand) / T.hand, 0, 1);
                var e = easeInOutQuad(p4);
                if (portrait) {
                    // 保持本体尺寸跳到立绘槽上方，再交叉淡入；不做整画布缩放到槽的硬跳
                    var pr = m.pr || portrait.getBoundingClientRect();
                    var cx0 = m.ax, cy0 = m.rimY - bodyH / 2;                 // 站定时本体中心
                    var cx1 = pr.left + pr.width / 2, cy1 = pr.top + pr.height / 2;
                    var b1 = Math.min(bodyH, Math.max(20, pr.height * 0.9));  // 落位本体高度 ≈ 立绘高
                    var bb = bodyH + (b1 - bodyH) * e;
                    var bx = cx0 + (cx1 - cx0) * e;
                    var by = cy0 + (cy1 - cy0) * e;
                    var ch = GROUPS.stand.h * bb / BODY_PX;
                    var left = bx - GROUPS.stand.align * bb / BODY_PX;
                    var top = by + bb / 2 - ch;
                    var f = bb / bodyH;
                    // 用 transform 完成“缩到立绘高 + 位移”，tick 里不改 width/height
                    var tx = left - (1 - f) * st.baseW / 2;
                    var ty = (by + bb / 2) - st.baseH;
                    sprite.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0)' +
                        ' scale(' + f.toFixed(3) + ') scaleY(' + (1 - 0.04 * e).toFixed(3) + ')';
                    setClip(0);
                    setOpacity(p4 < 0.5 ? 1 : Math.max(0, 1 - (p4 - 0.5) / 0.5));
                    if (p4 > 0.35) {
                        portrait.style.transition = 'opacity .18s linear';
                        portrait.style.opacity = '1';   // 交叉淡入正常立绘
                    }
                } else {
                    // 没有立绘槽 → 原地淡出
                    place(GROUPS.stand, m.ax, m.rimY, bodyH, 0, 1, Math.max(0, 1 - e));
                    setClip(0);
                    setOpacity(Math.max(0, 1 - e));
                }
                if (p4 >= 1) { shutdown(false, true); return; }
            }

            if (g && t < T.rise + T.pull + T.stand) place(g, m.ax, m.rimY, bodyH, below, scaleY, opacity);
            st.raf = requestAnimationFrame(tick);
        }

        active = handle;
        preload();   // 首次触发前预热；没赶上时下一帧自然切到 blob

        // 等容器真正有尺寸（气泡/文本框刚插入时可能还是 0）
        var tries = 0;
        (function waitBox() {
            if (st.cancelled) return;
            var r = box.getBoundingClientRect();
            if (r.width > 1 && r.height > 1) { start(); return; }
            if (++tries > 16) { shutdown(true, false); return; }
            st.raf = requestAnimationFrame(waitBox);
        })();

        return handle;
    }

    window.BadelineCrawlOut = {
        play: play,
        stopAll: function () { if (active) active.cancel(true); },
        preload: preload
    };
})();
