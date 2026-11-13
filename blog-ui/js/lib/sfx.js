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
 *
 * 优化版解析：celeste-sounds-opt/ 是独立目录，里面放同名优化文件 + manifest.json
 * （键 = 原目录下的相对路径，值 = 优化文件相对路径）。存在才用，不存在就一律走原文件；
 * 整目录删掉即恢复原状，原 celeste-sounds/ 不受任何影响。
 */
window.Sfx = (function () {

    var SND_DIR = 'celeste-sounds/';               // 官方音效根目录（原始资源，只读）
    var OPT_DIR = 'celeste-sounds-opt/';           // 优化版根目录（可整体删除）
    var OPT_MAP = null;                            // manifest 未就绪/缺失时为 null → 全部原文件
    var POOL = {};                                 // 原路径 src -> Audio
    var LOOPS = {};                                // 循环音 src -> Audio（独立池，不与 play 抢实例）

    function withExt(name) {
        return /\.(wav|mp3|ogg|m4a|mp4)$/i.test(name) ? name : name + '.wav';
    }
    function srcOf(name, dir) {
        return (dir === undefined ? SND_DIR : dir) + withExt(name);
    }

    // 异步读 manifest；404 或解析失败都静默保持 null，运行时零额外请求
    if (typeof fetch === 'function') {
        fetch(OPT_DIR + 'manifest.json', { cache: 'force-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (m) {
                if (!m || typeof m !== 'object') return;
                var map = {};
                Object.keys(m).forEach(function (k) {
                    if (typeof m[k] === 'string' && m[k]) map[k] = OPT_DIR + m[k];
                });
                if (Object.keys(map).length) OPT_MAP = map;
            })
            .catch(function () { /* 没有优化版：保持 null */ });
    }

    /** 原路径 → 实际要播的 URL（优化版登记过才替换） */
    function resolve(src) {
        if (!OPT_MAP || src.indexOf(SND_DIR) !== 0) return src;
        return OPT_MAP[src.slice(SND_DIR.length)] || src;
    }

    // currentTime 只有在有 seekable 区间时才可写；冷启动（readyState=0）、
    // 未缓冲完、部分 iOS/Safari 上直接写会抛 InvalidStateError
    function canSeek(a) {
        try {
            return a.readyState > 0 && a.seekable && a.seekable.length > 0;
        } catch (e) { return false; }
    }

    function make(src) {
        var a = new Audio(resolve(src));
        return a;
    }

    /** 复用实例播放：opts = { dir, volume } */
    function play(name, opts) {
        opts = opts || {};
        try {
            var src = srcOf(name, opts.dir);
            var a = POOL[src];
            if (!a) {
                POOL[src] = a = make(src);
            } else if (canSeek(a)) {
                a.currentTime = 0;
            } else {
                // 不能 seek → 不硬写 currentTime，新建实例重放（旧实例留在池里继续缓冲）
                var prev = a;
                a = make(src);
                a.volume = prev.volume;          // 音量口径不变：沿用该音效上次的设定
                POOL[src] = a;
            }
            if (opts.volume !== undefined) a.volume = opts.volume;
            var p = a.play();
            if (p && p.catch) p.catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    /** 新建实例播放（可叠响）：opts = { dir, volume } */
    function fire(name, opts) {
        opts = opts || {};
        try {
            var a = make(srcOf(name, opts.dir));
            if (opts.volume !== undefined) a.volume = opts.volume;
            var p = a.play();
            if (p && p.catch) p.catch(function () {});
        } catch (e) { /* 无声降级 */ }
    }

    /** 预热：把一批音效的 Audio 实例先建好（浏览器开始下载），如心门 7 个 WAV */
    function preload(names, opts) {
        opts = opts || {};
        (names || []).forEach(function (name) {
            try {
                var src = srcOf(name, opts.dir);
                if (POOL[src]) return;
                var a = make(src);
                a.preload = 'auto';
                if (opts.volume !== undefined) a.volume = opts.volume;
                POOL[src] = a;
            } catch (e) { /* 无声降级 */ }
        });
    }

    /**
     * 循环播放：opts = { dir, volume }
     * 与 play 分开池化，避免同名的单次音效把循环实例 seek 到 0。
     * 文件缺失时 play() 的 Promise 被吞掉，保持静默。
     */
    function loop(name, opts) {
        opts = opts || {};
        try {
            var src = srcOf(name, opts.dir);
            var a = LOOPS[src];
            if (!a) {
                a = make(src);
                a.loop = true;
                a.volume = opts.volume === undefined ? 1 : opts.volume;
                LOOPS[src] = a;
            } else if (opts.volume !== undefined) {
                a.volume = opts.volume;
            }
            if (a.paused) {
                var p = a.play();
                if (p && p.catch) p.catch(function () {});
            }
        } catch (e) { /* 无声降级 */ }
    }

    /** 停止循环（保留实例，下次 loop 可续播） */
    function stopLoop(name, opts) {
        try {
            var a = LOOPS[srcOf(name, opts && opts.dir)];
            if (a) a.pause();
        } catch (e) { /* 无声降级 */ }
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
        loop: loop,
        stopLoop: stopLoop,
        ac: ac,
        srcOf: srcOf
    };
})();
