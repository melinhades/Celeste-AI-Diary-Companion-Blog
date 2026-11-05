/* ===== js/index-bird.js — index 头部那只鸟（auth.js 注入的 .chat-crow）=====
   CS10 飞升过场已废案（见 attic/cs10-launch-transition/），现在这条链路只做三件事：
     1. .chat-crow 留在 auth.js 注入的原位：.user-info 里用户名和写文章按钮之间
        （不再搬到 nav，MutationObserver 保留但仅观察不搬运）；
     2. 悬停喊叫：img 按 croak 帧表（crow00..13 @0.08s）轮播 + bird_squawk；
     3. 点击：换成 FlyUp01..15 展翅帧向上翱翔飞出（CSS crowFlyOut .95s），
        然后唤醒统一加载层（js/page-loading.js：夜空 + 雪花 + 跑动 Madeline），
        最后进 celeste-farewell-remembered-demo.html。
   reduced-motion 时不飞，直接铺加载层再跳页，功能不丢。 */
(function () {
    'use strict';

    var CROW_SRC = 'Atlases/Gameplay/characters/bird/crow';
    var FLY_SRC = 'Atlases/Gameplay/characters/bird/FlyUp';   // 展翅向上翱翔：FlyUp01..15
    var FLY_FRAMES = 15;
    var TARGET = 'celeste-farewell-remembered-demo.html';
    var SLOT_ID = 'navBirdSlot';

    var FLY_MS = 1200;         // 与 css crowFlyOut 1.2s 对齐
    var FLYUP_FRAME_MS = 80;   // 15 帧 × 80ms = 1.2s，接近 Celeste 原版 FlyUp delay 0.10s

    var bgm = document.getElementById('bgmPlayer');
    var Sfx = (window.BirdMotion && window.BirdMotion.Sfx) || { play: function () {} };
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var croakTimer = 0, flyTimer = 0, running = false;

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    /* ---------- 鸟留在 header-right（用户名和写文章之间），不再搬到 nav ---------- */
    // placeCrow 保留为空函数，MutationObserver 仍可观察 auth.js 的重渲染但不做 DOM 搬运
    function placeCrow() { /* no-op：鸟的落点就是 auth.js 注入的 .user-info 原位 */ }
    placeCrow();
    var headerRight = document.getElementById('headerRight');
    if (headerRight && window.MutationObserver) {
        new MutationObserver(placeCrow).observe(headerRight, { childList: true });
    }

    /* ---------- 悬停喊叫（croak：crow00..13 @0.08s，第 9 帧出声） ---------- */
    function croakLink(link) {
        if (running) return;
        var img = link.querySelector('img');
        if (!img || croakTimer) return;
        var i = 0;
        link.classList.add('on-call');
        croakTimer = setInterval(function () {
            i++;
            if (i > 13) {
                clearInterval(croakTimer); croakTimer = 0;
                img.src = CROW_SRC + '00.png';
                link.classList.remove('on-call');
                return;
            }
            img.src = CROW_SRC + pad2(i) + '.png';
            if (i === 9) Sfx.play('bird_squawk');
        }, 80);
    }
    function crowLinkOf(e) {
        var t = e.target;
        return t && t.closest ? t.closest('.chat-crow') : null;
    }

    function fadeBgm() {
        if (!bgm || bgm.paused) return;
        var v0 = bgm.volume, t0 = performance.now();
        (function step() {
            var k = Math.min(1, (performance.now() - t0) / 800);
            try { bgm.volume = Math.max(0, v0 * (1 - k)); } catch (e) { void e; }
            if (k < 1) requestAnimationFrame(step);
            else { try { bgm.pause(); } catch (e) { void e; } }
        })();
    }

    function showLoading() {
        if (window.PageLoading) window.PageLoading.show();
    }

    function leave() {
        location.href = TARGET;
    }

    function start(e, link) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (running) return;
        running = true;

        if (croakTimer) { clearInterval(croakTimer); croakTimer = 0; }
        fadeBgm();

        if (reduced) {
            showLoading();
            setTimeout(leave, 500);
            return;
        }

        var img = link.querySelector('img');
        link.classList.add('flying-out');
        Sfx.play('bird_wingflap');
        var f = 1;
        if (img) img.src = FLY_SRC + pad2(f) + '.png';
        flyTimer = setInterval(function () {
            if (f >= FLY_FRAMES) { clearInterval(flyTimer); flyTimer = 0; return; }
            f++;
            if (img) img.src = FLY_SRC + pad2(f) + '.png';
        }, FLYUP_FRAME_MS);

        // 鸟竖直飞 1.2s 期间，飞了 400ms（FlyUp 05/06 帧、还在视口内）后铺加载层盖住 header
        // 加载层底下鸟继续飞，飞完 1.2s → leave() 跳目标页
        setTimeout(showLoading, 400);
        setTimeout(leave, FLY_MS);
    }

    function reset() {
        running = false;
        if (croakTimer) { clearInterval(croakTimer); croakTimer = 0; }
        if (flyTimer) { clearInterval(flyTimer); flyTimer = 0; }
        var link = document.querySelector('.chat-crow');
        if (link) link.classList.remove('flying-out');
        var img = document.querySelector('.chat-crow img');
        if (img) img.src = CROW_SRC + '00.png';
        if (window.PageLoading && window.PageLoading.reset) window.PageLoading.reset();
    }

    document.addEventListener('pointerover', function (e) {
        var link = crowLinkOf(e);
        if (link && !(e.relatedTarget && link.contains(e.relatedTarget))) croakLink(link);
    });
    document.addEventListener('click', function (e) {
        var link = crowLinkOf(e);
        if (link) start(e, link);
    });

    // 从纪念页按后退回来（bfcache 命中时脚本不会重跑，得自己把状态擦干净）
    window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        reset();
        if (bgm) { try { bgm.volume = 1; bgm.play(); } catch (err) { void err; } }
    });
})();
