/**
 * js/lib/sfx.js —— 短音效与共享 AudioContext
 *
 * 存在理由：书架页里同样的「缓存 Audio → currentTime=0 → 设音量 → play().catch」
 * 写了四遍（明信片 pcPlay、翻页 PAGE_AUDIO、对话框 BL_SFX、心门 pool），
 * 共享 AudioContext 的 `window.__mirrorAC || new AudioContext()` 也散在四处。
 * 本层只收这些机械动作，不改变任何音量、路径、播放时机与降级策略。
 *
 * 约定：
 *   - play()：同名复用同一个 Audio 实例（重入即从头播），适合一次性点击音；
 *   - fire()：每次都新建实例，适合同一音效可能叠着响的场景（心门逐颗填充）；
 *   - ac()：全站共享一个 AudioContext，仍挂在 window.__mirrorAC 上，
 *     与 celeste-mirror.js / 镜之房间 BGM 等既有使用者保持同一实例；
 *   - 所有方法内部吞掉异常，音频不可用（隐私模式 / 无用户手势）时静默无声。
 */
window.Sfx = (function () {

    var SND_DIR = 'celeste-sounds/';   // 官方音效根目录
    var POOL = {};                     // src -> Audio

    function withExt(name) {
        return /\.(wav|mp3|ogg|m4a|mp4)$/i.test(name) ? name : name + '.wav';
    }
    function srcOf(name, dir) {
        return (dir === undefined ? SND_DIR : dir) + withExt(name);
    }

    /** 复用实例播放：opts = { dir, volume } */
    function play(name, opts) {
        opts = opts || {};
        try {
            var src = srcOf(name, opts.dir);
            if (!POOL[src]) POOL[src] = new Audio(src);
            var a = POOL[src];
            a.currentTime = 0;
            if (opts.volume !== undefined) a.volume = opts.volume;
            a.play().catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    /** 新建实例播放（可叠响）：opts = { dir, volume } */
    function fire(name, opts) {
        opts = opts || {};
        try {
            var a = new Audio(srcOf(name, opts.dir));
            if (opts.volume !== undefined) a.volume = opts.volume;
            a.play().catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    /** 预热：把一批音效的 Audio 实例先建好（浏览器开始下载），如心门 7 个 WAV */
    function preload(names, opts) {
        opts = opts || {};
        (names || []).forEach(function (name) {
            try {
                var src = srcOf(name, opts.dir);
                if (POOL[src]) return;
                var a = new Audio(src);
                a.preload = 'auto';
                if (opts.volume !== undefined) a.volume = opts.volume;
                POOL[src] = a;
            } catch (e) { /* 无声降级 */ }
        });
    }

    /** 共享 AudioContext（首次调用创建；不支持 WebAudio 返回 null） */
    function ac() {
        if (window.__mirrorAC) return window.__mirrorAC;
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        try { window.__mirrorAC = new C(); } catch (e) { return null; }
        return window.__mirrorAC;
    }

    return {
        SND_DIR: SND_DIR,
        play: play,
        fire: fire,
        preload: preload,
        ac: ac,
        srcOf: srcOf
    };
})();
