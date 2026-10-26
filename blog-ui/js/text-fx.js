/**
 * =====================================================================
 * TextFx —— Celeste 全站通用字体动画模块
 * =====================================================================
 * 标记语法（AI 文本可直接输出，也可用 autoMark 自动标注）：
 *   {~波浪~}  缓慢正弦浮动（循环）        fx-wave
 *   {*抖动*}  细碎微小震颤（循环）        fx-shake
 *   {!弹跳!}  一次性弹性弹跳              fx-bounce
 *
 * 普通文字不受影响；标记内文字带细黑像素描边，颜色取：
 *   data-char 角色固有色 > palette 关键词色 > 容器 --c
 *
 * 用法：
 *   TextFx.set(el, rawText)            // 打字机：每追加一个字后调用（innerHTML 全量渲染）
 *   TextFx.render(rawText)             // 只拿 HTML 字符串
 *   TextFx.autoMark(text)              // 给无标记的 AI 台词自动补三种标记
 *   TextFx.autoWrapWave(text, words)   // 把关键词包成波浪（日记情绪词用）
 *   TextFx.attachTextarea(ta, words)   // textarea/input 镜像层高亮（关键词波浪）
 *
 * 关键技术：逐字 span 的 --t 写墙钟秒数，CSS delay 挂真实时钟，
 * 打字机每几十毫秒重建 innerHTML 时，循环动画相位依然连续（否则永远停在第一帧）。
 * =====================================================================
 */
(function () {
    'use strict';

    var MARK = { '~': 'fx-wave', '*': 'fx-shake', '!': 'fx-bounce' };

    /* 角色名 → 固有色分组 */
    var CHAR_NAMES = {
        madeline: 'madeline', Madeline: 'madeline', '玛德琳': 'madeline',
        badeline: 'badeline', Badeline: 'badeline', '暗面琳': 'badeline',
        oshiro: 'oshiro', Oshiro: 'oshiro', '大崎': 'oshiro',
        theo: 'theo', Theo: 'theo', '西奥': 'theo',
        granny: 'granny', Granny: 'granny', '奶奶': 'granny',
        '塞莱斯特山': 'mountain', celeste: 'mountain', Celeste: 'mountain'
    };

    /* 自动标注用词表（autoMark：无标记 AI 台词也能出三种动画） */
    var WAVE_WORDS = [
        'Madeline', 'Badeline', 'Oshiro', 'Theo', 'Granny', '塞莱斯特山',
        '勇气', '坚持', '加油', '梦想', '热爱', '拼搏', '挑战', '爬起来',
        '不放弃', '冲一把', '勇敢', '朋友', '开心', '快乐', '巧克力',
        '冒险', '旅行', '乐观', '自由', '有趣', '山顶', '攀登', '成长',
        '原谅', '和解', '善意', '拜托'
    ];
    var SHAKE_WORDS = [
        '死胡同', '开玩笑的吧', '自我怀疑', '害怕', '恐惧', '焦虑', '不安',
        '恐慌', '放弃', '崩溃', '绝望', '讨厌', '犹豫', '退缩', '失败',
        '做不到', '过不去', '搞不定', '学不会', '怎么办', '离谱', '无语'
    ];

    /* 关键词 → CSS 颜色（autoWrapWave 用，如日记情绪词） */
    var palette = {};
    function setPalette(map) {
        palette = {};
        if (map) for (var k in map) palette[k] = map[k];
    }
    function addPalette(map) {
        if (map) for (var k in map) palette[k] = map[k];
    }

    function esc(s) {
        if (window.escHtml) return window.escHtml(s);
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* 逐字 span：--i 序号，--t 墙钟相位（秒） */
    function charsHtml(text, t) {
        var out = '';
        for (var i = 0; i < text.length; i++) {
            out += '<span class="fx-ch" style="--i:' + i + ';--t:' + t + 's">' + esc(text[i]) + '</span>';
        }
        return out;
    }

    /* 打字机流入时剥离未闭合的悬挂标记：{~Madeline 暂时只显示 Madeline */
    function stripDangling(s) {
        return s.replace(/\{[~*!]/g, '').replace(/[~*!]\}/g, '');
    }

    function colorOf(inner) {
        for (var name in CHAR_NAMES) {
            if (inner.indexOf(name) !== -1) return { key: CHAR_NAMES[name] };
        }
        /* 精确匹配 palette，再退 includes（长词优先由调用方保证） */
        if (palette[inner]) return { color: palette[inner] };
        for (var w in palette) {
            if (w.length >= 2 && inner.indexOf(w) !== -1) return { color: palette[w] };
        }
        return null;
    }

    /**
     * 解析标记 → HTML
     * @param raw 原始文本（可含 {~*!} 标记）
     */
    function render(raw) {
        var text = esc(raw == null ? '' : String(raw));
        var t = (performance.now() / 1000).toFixed(3);
        var re = /\{([~*!])([\s\S]*?)\1\}/g;
        var out = '', last = 0, m;
        while ((m = re.exec(text))) {
            out += stripDangling(text.slice(last, m.index));
            var marker = m[1], inner = m[2];
            var c = colorOf(inner);
            var attr = c ? (c.key ? ' data-char="' + c.key + '"'
                                 : ' style="--fxc:' + c.color + '"') : '';
            out += '<span class="fx ' + MARK[marker] + '"' + attr + '>' + charsHtml(inner, t) + '</span>';
            last = re.lastIndex;
        }
        out += stripDangling(text.slice(last));
        return out;
    }

    /** 全量写入元素（打字机每帧调用） */
    function set(el, raw) {
        if (el) el.innerHTML = render(raw);
    }

    /* 已被标记包裹的区间，autoMark 时跳过 */
    function markedSpans(text) {
        var spans = [], re = /\{[~*!][\s\S]*?[~*!]\}/g, m;
        while ((m = re.exec(text))) spans.push([m.index, re.lastIndex]);
        return spans;
    }
    function inSpans(spans, i, len) {
        for (var s = 0; s < spans.length; s++) {
            if (i >= spans[s][0] && i + len <= spans[s][1]) return true;
        }
        return false;
    }

    function wrapWordAt(text, idx, word, marker) {
        return text.slice(0, idx) + '{' + marker + word + marker + '}' + text.slice(idx + word.length);
    }

    /**
     * 自动标注：给无标记 AI 台词补三种动画
     *  ~ 角色名 / 积极词；* 消极不安词；! 感叹短句（XXX！→ {!XXX!}！）
     * 已含标记的文本只补缺项、不重复包裹。
     */
    function autoMark(rawText) {
        var text = String(rawText || '');
        var spans = markedSpans(text);

        var wordLists = [['~', WAVE_WORDS], ['*', SHAKE_WORDS]];
        /* 长词优先，避免短词截断长词 */
        var sorted = [];
        wordLists.forEach(function (pair) {
            pair[1].forEach(function (w) { sorted.push([pair[0], w]); });
        });
        sorted.sort(function (a, b) { return b[1].length - a[1].length; });

        /* 每轮重新扫描，包裹后偏移量变化 */
        var changed = true, guard = 0;
        while (changed && guard++ < 40) {
            changed = false;
            spans = markedSpans(text);
            for (var k = 0; k < sorted.length; k++) {
                var marker = sorted[k][0], word = sorted[k][1];
                var idx = text.indexOf(word);
                /* 找第一个未被标记覆盖的命中 */
                while (idx !== -1 && inSpans(spans, idx, word.length)) idx = text.indexOf(word, idx + 1);
                if (idx !== -1) {
                    text = wrapWordAt(text, idx, word, marker);
                    changed = true;
                    break;
                }
            }
        }

        /* 弹跳：感叹号前 1~6 个非标点字符 */
        spans = markedSpans(text);
        for (var i = 0; i < text.length; i++) {
            var ch2 = text[i];
            if (ch2 !== '！' && ch2 !== '!') continue;
            var start = i, n = 0;
            while (start > 0 && n < 6) {
                var pc = text[start - 1];
                if ('。！？!?…，,、；;：:\n '.indexOf(pc) !== -1) break;
                start--; n++;
            }
            if (n < 2) continue;
            var phrase = text.slice(start, i);
            if (inSpans(spans, start, phrase.length + 1)) continue;
            text = text.slice(0, start) + '{!' + phrase + '!}' + text.slice(i);
            i += phrase.length + 3;
            spans = markedSpans(text);
        }
        return text;
    }

    /**
     * 自动波浪：把 words（数组或 {词:颜色}）包成 {~词~}，已标记内容跳过
     */
    function autoWrapWave(rawText, words) {
        var list = [];
        if (Array.isArray(words)) words.forEach(function (w) { list.push(w); });
        else if (words) for (var w in words) list.push(w);
        list.sort(function (a, b) { return b.length - a.length; });

        var text = String(rawText || '');
        var changed = true, guard = 0;
        while (changed && guard++ < 60) {
            changed = false;
            var spans = markedSpans(text);
            for (var k = 0; k < list.length; k++) {
                var word = list[k];
                var idx = text.indexOf(word);
                while (idx !== -1 && inSpans(spans, idx, word.length)) idx = text.indexOf(word, idx + 1);
                if (idx !== -1) {
                    text = wrapWordAt(text, idx, word, '~');
                    changed = true;
                    break;
                }
            }
        }
        return text;
    }

    /* 镜像层专用渲染：一次线性扫描 → 合并区间 → 一次生成 HTML。
       旧路径 autoWrapWave 每包住一个词就重扫一遍全文，长日记退化成平方级，
       且每次都复制整串，是打字发涩的主因之一。 */
    var MIRROR_MAX_HITS = 120;   // 兜底：命中过多时不再逐个包 span
    function renderMirrorHtml(raw, list) {
        var text = String(raw == null ? '' : raw);
        var n = list ? list.length : 0;
        if (!n) return esc(text);
        var hits = [], k, w, idx;
        for (k = 0; k < n; k++) {
            w = list[k];
            if (!w) continue;
            idx = text.indexOf(w);
            while (idx !== -1 && hits.length < MIRROR_MAX_HITS) {
                hits.push([idx, idx + w.length]);
                idx = text.indexOf(w, idx + w.length);
            }
        }
        if (!hits.length) return esc(text);
        /* 起点升序、长词优先；重叠段并入前一段，避免嵌套 span */
        hits.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
        var t = (performance.now() / 1000).toFixed(3);
        var out = '', pos = 0, end = 0, i, s, e, inner, c, attr;
        for (i = 0; i < hits.length; i++) {
            s = hits[i][0]; e = hits[i][1];
            if (s < end) { if (e > end) end = e; continue; }
            out += esc(text.slice(pos, s));
            inner = text.slice(s, e);
            c = colorOf(inner);
            attr = c ? (c.key ? ' data-char="' + c.key + '"'
                               : ' style="--fxc:' + c.color + '"') : '';
            out += '<span class="fx ' + MARK['~'] + '"' + attr + '>' + charsHtml(inner, t) + '</span>';
            pos = e; end = e;
        }
        return out + esc(text.slice(pos));
    }

    /* ================= textarea / input 镜像层高亮 =================
       原生输入框文字无法加动画，用一个同位置镜像 div 渲染高亮文本，
       输入框本身文字透明、保留光标。仅用于关键词波浪（不改变输入行为）。 */
    function attachTextarea(input, words) {
        if (!input || input.__tfxAttached) return;
        input.__tfxAttached = true;

        var parent = input.parentElement;
        var parentPos = getComputedStyle(parent).position;
        if (parentPos === 'static') parent.style.position = 'relative';

        var mirror = document.createElement('div');
        mirror.className = 'tfx-mirror';
        mirror.setAttribute('aria-hidden', 'true');
        parent.appendChild(mirror);

        var wordList = words ? (Array.isArray(words) ? words : Object.keys(words)) : [];
        var cs = getComputedStyle(input);
        var origColor = cs.color;
        var origCaret = cs.caretColor;

        /* 镜像与输入框完全对齐。
           注意必须用 offset*（布局量，不受祖先 CSS transform 影响），
           不能用 getBoundingClientRect：翻页时书页带 scale(.96) 动画，
           动画中途取值会把缩放后的尺寸/偏移写死进镜像层，动画结束后错位（重影、光标偏一个字）。*/
        function syncBox() {
            if (mirror.offsetParent === input.offsetParent) {
                mirror.style.left = input.offsetLeft + 'px';
                mirror.style.top = input.offsetTop + 'px';
                mirror.style.width = input.offsetWidth + 'px';
                mirror.style.height = input.offsetHeight + 'px';
            } else {
                var box0 = input.getBoundingClientRect(), pb0 = parent.getBoundingClientRect();
                mirror.style.left = (box0.left - pb0.left) + 'px';
                mirror.style.top = (box0.top - pb0.top) + 'px';
                mirror.style.width = box0.width + 'px';
                mirror.style.height = box0.height + 'px';
            }
            var c = getComputedStyle(input);
            mirror.style.font = c.font;
            mirror.style.letterSpacing = c.letterSpacing;
            mirror.style.padding = c.padding;
            mirror.style.border = c.border;
            mirror.style.borderRadius = c.borderRadius;
            mirror.style.boxSizing = c.boxSizing;
            mirror.style.lineHeight = c.lineHeight;
            mirror.style.textIndent = c.textIndent;
        }

        /* 状态：几何量只在可能变化时读；渲染按帧合并。
           旧实现每次输入都 syncBox()（读 offset*，恰在布局刚变脏的时刻强制重排），
           再整篇重建 innerHTML —— 打字卡顿的来源。 */
        var needSync = true;      // 几何量待同步（首次 / resize / 字体就绪 / 尺寸变化）
        var rafId = 0;
        var composing = false;    // 拼音组合输入中
        var lastRendered = null;

        function paint() {
            rafId = 0;
            var val = input.value;
            if (!needSync && val === lastRendered) return;   // 内容没变就不动 DOM
            if (needSync) { syncBox(); needSync = false; }
            lastRendered = val;
            mirror.style.color = origColor;
            mirror.innerHTML = renderMirrorHtml(val, wordList)
                + '<span style="white-space:pre"> </span>';   // 尾空格撑住末行高度
            mirror.scrollTop = input.scrollTop;
            mirror.scrollLeft = input.scrollLeft;
        }

        function schedule() {
            if (!rafId) rafId = requestAnimationFrame(paint);   // 一帧最多渲一次
        }

        /* 组合输入期间只同步纯文本：输入框文字是透明的，镜像必须一直有内容，
           但候选阶段每个拼音键都重建关键词 span 太贵，等 compositionend 再补高亮。 */
        function paintPlain() {
            mirror.textContent = input.value + ' ';
            mirror.scrollTop = input.scrollTop;
            lastRendered = null;
        }

        function applyTransparent() {
            input.style.color = 'transparent';
            input.style.background = 'transparent';
            input.style.zIndex = 1;          /* 输入框浮在镜像层之上，文字透明只留光标 */
            /* 保留原色光标与选区 */
            if (!input.__tfxCaret) {
                input.__tfxCaret = true;
                input.style.caretColor = (origCaret && origCaret !== 'auto') ? origCaret : origColor;
                input.style.webkitTextFillColor = 'transparent';
            }
        }

        input.addEventListener('input', function (e) {
            if (composing || (e && e.isComposing)) { paintPlain(); return; }
            schedule();
        }, false);
        input.addEventListener('compositionstart', function () {
            composing = true;
            paintPlain();
        }, false);
        input.addEventListener('compositionend', function () {
            composing = false;
            schedule();
        }, false);
        input.addEventListener('scroll', function () {
            mirror.scrollTop = input.scrollTop;
            mirror.scrollLeft = input.scrollLeft;
        }, false);
        window.addEventListener('resize', function () { needSync = true; schedule(); }, false);

        /* 页面切换/显隐后重新对齐（只有尺寸可能变了才重读几何量） */
        if (window.ResizeObserver) {
            new ResizeObserver(function () { needSync = true; schedule(); }).observe(input);
        }
        /* 网络字体加载完成后字宽/行高才定型，需要再对齐一次 */
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { needSync = true; schedule(); });
        }

        applyTransparent();
        paint();

        /* 暴露刷新（外部赋值 value 后、或翻页后可手动调用）：保持同步语义 */
        input.__tfxRefresh = function () {
            if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
            needSync = true;
            lastRendered = null;
            paint();
        };
    }

    function attachAll(root, selector, words) {
        (root || document).querySelectorAll(selector || 'textarea,input[type=text]').forEach(function (el) {
            if (el.closest('.gridzone')) return;   // 格子区短输入不挂
            attachTextarea(el, words);
        });
    }

    window.TextFx = {
        render: render,
        set: set,
        autoMark: autoMark,
        autoWrapWave: autoWrapWave,
        attachTextarea: attachTextarea,
        attachAll: attachAll,
        setPalette: setPalette,
        addPalette: addPalette
    };
})();
