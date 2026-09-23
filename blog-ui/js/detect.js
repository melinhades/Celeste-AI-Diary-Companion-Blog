/**
 * =====================================================================
 * 困境检测机制 (diary → berryos PPT 触发入口)
 * =====================================================================
 *
 * 设计目标：
 *   当用户在日记中 **过度频繁地、大比例地围绕同一困扰主题** 写作时，
 *   触发 BerryOS 的 PPT 制作请求（PPT 内容由后续模块填充，本文件只做检测）。
 *
 *   触发判定：
 *     topic_concentration > 0.60  AND  keyword_burst > 阈值
 *     即：超过 60% 的篇幅在讲同一件事，且关键词出现密度异常偏高。
 *
 * 用法：
 *     const result = BerryDetect.shouldTrigger();
 *     if (result.triggered) {
 *       // 交给后续 PPT 生成器
 *       PPTGenerator.request({ topic: result.topic, evidence: result.evidence });
 *     }
 * =====================================================================
 */

(function () {
    'use strict';

    // ---- 1. 从 localStorage 提取日记全部文本 ----
    function extractDiaryText() {
        var keys = Object.keys(localStorage).filter(function (k) {
            return k.startsWith('jbook-');
        });
        // 按页码+字段序排序
        keys.sort(function (a, b) {
            var pa = a.split('-'), pb = b.split('-');
            return (pa[1] - pb[1]) || (pa[2] - pb[2]);
        });
        var chunks = [];
        keys.forEach(function (k) {
            var v = localStorage.getItem(k);
            if (v && v.trim()) chunks.push(v.trim());
        });
        return chunks.join('\n');
    }

    // ---- 2. 中文分词（极简 hash 映射，依赖字典文件可扩展）----
    // 不做真正分词，改用 n-gram + 停用词过滤的启发式方案
    var STOP_WORDS = new Set([
        '的', '了', '是', '在', '和', '就', '不', '也', '都', '这', '那',
        '有', '没', '我', '你', '他', '她', '它', '们', '个', '去', '来',
        '做', '能', '想', '说', '看', '好', '还', '但', '而', '或', '与',
        '把', '让', '被', '给', '对', '从', '向', '到', '上', '下', '里',
        '什么', '怎么', '为什么', '如果', '因为', '所以', '但是', '然后',
        '其实', '真的', '可能', '应该', '可以', '一下', '一个', '一些',
        '一样', '今天', '昨天', '明天', '现在', '以前', '以后', '时候',
        '还是', '什么', '还在', '还是没', '真的是', '到底', '就是', '总是',
        '每次', '一直', '反复', '不停', '已经', '还没', '不会', '不行',
        '好难', '难啊', '好烦', '好累', '好怕'
    ]);

    // 切 2-gram 和 3-gram，过滤停用词和纯标点
    function tokenize(text) {
        // 先去掉标点/空白
        var clean = text.replace(/[，。！？、；：""''…（）《》\s]/g, '');
        if (clean.length < 4) return [];
        var tokens = [];
        // 2-gram
        for (var i = 0; i < clean.length - 1; i++) {
            var g2 = clean.slice(i, i + 2);
            if (!/[\u4e00-\u9fa5]{2}/.test(g2)) continue;  // 只要中文
            tokens.push(g2);
        }
        // 3-gram
        for (var j = 0; j < clean.length - 2; j++) {
            var g3 = clean.slice(j, j + 3);
            if (!/[\u4e00-\u9fa5]{3}/.test(g3)) continue;
            tokens.push(g3);
        }
        // 4-gram（优先，因为中文词多是 4 字短语）
        for (var k = 0; k < clean.length - 3; k++) {
            var g4 = clean.slice(k, k + 4);
            if (!/[\u4e00-\u9fa5]{4}/.test(g4)) continue;
            tokens.push(g4);
        }
        return tokens;
    }

    // ---- 3. 核心检测：计算 主题集中度 + 关键词爆发密度 ----
    function analyze(text) {
        var tokens = tokenize(text);
        if (!tokens.length) return { triggered: false, reason: 'empty' };

        // 词频统计
        var freq = {};
        tokens.forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
        var total = tokens.length;

        // 去掉"只有1次"的长尾
        var significant = Object.keys(freq).filter(function (k) {
            return freq[k] >= 2;
        });

        // 按频率排序（高频优先，同频时长词优先）
        significant.sort(function (a, b) {
            if (freq[b] !== freq[a]) return freq[b] - freq[a];
            return b.length - a.length;
        });

        // 合并重叠 n-gram：如果 A 是 B 的子串且 freq 接近，去掉 A，保留更长的 B
        // 原理：凌波/波微/微步 全是 "凌波微步" 的碎片
        var merged = [];
        significant.forEach(function (tok) {
            // 如果已有更长的 merged 项包含这个 tok，跳过
            var covered = merged.some(function (m) { return m.indexOf(tok) >= 0; });
            if (!covered) merged.push(tok);
        });

        // 主题集中度：Top 3 合并后关键词占全部 significant token 的比例
        var topN = Math.min(3, merged.length);
        var topCount = significant.slice(0, 10).reduce(function (s, k) { return s + freq[k]; }, 0);
        var sigTotal = significant.reduce(function (s, k) { return s + freq[k]; }, 0);
        var concentration = sigTotal > 0 ? topCount / sigTotal : 0;

        // Top 1 关键词取合并后最长的那个
        var topKeyword = merged[0] || significant[0] || '';
        var density = topKeyword ? freq[topKeyword] / text.length : 0;

        // 负面情绪标记（简单关键词命中，仅作为辅助）
        var NEG = [
            '累', '难', '烦', '怕', '慌', '痛', '哭', '怒', '闷', '抑',
            '讨厌', '不想', '不行', '总是', '每次', '一直', '反复', '不停',
            '为什么', '怎么办', '搞不定', '过不去', '做不到', '学不会'
        ];
        var negHits = NEG.filter(function (w) { return text.indexOf(w) >= 0; });
        var negRatio = negHits.length / NEG.length;

        return {
            tokens: total,
            concentration: concentration,   // 0~1，越高越集中
            density: density,               // Top1 关键词密度
            topKeyword: topKeyword,
            topFreq: freq[topKeyword] || 0,
            negHits: negHits,
            negRatio: negRatio,
            significantCount: merged.length,
            topKeywords: merged.slice(0, 6).map(function (k) { return { word: k, freq: freq[k] }; })
        };
    }

    // ---- 4. 触发判定 ----
    function shouldTrigger() {
        var text = extractDiaryText();
        var info = analyze(text);

        if (!info.tokens) {
            return { triggered: false, reason: '日记内容为空' };
        }

        // 触发规则（可调，已降低阈值让真实场景更容易命中）：
        //   主题集中度 > 0.45  → 主要篇幅围绕同一话题
        //   Top1 关键词密度 > 0.01  → 这个话题被反复强调
        //   负面情绪标记 > 0.10  → 这个话题是困扰（不是兴趣）
        var CONCENTRATION_THRESHOLD = 0.40;
        var DENSITY_THRESHOLD = 0.01;
        var NEG_RATIO_THRESHOLD = 0.10;

        var triggered =
            info.concentration > CONCENTRATION_THRESHOLD &&
            info.density > DENSITY_THRESHOLD &&
            info.negRatio > NEG_RATIO_THRESHOLD;

        return {
            triggered: triggered,
            topic: info.topKeyword,
            score: {
                concentration: Math.round(info.concentration * 100) / 100,
                density: Math.round(info.density * 1000) / 1000,
                negRatio: Math.round(info.negRatio * 100) / 100,
            },
            evidence: info.topKeywords,
            negHits: info.negHits,
            textLength: text.length,
            // 给后续 PPT 生成器的原始素材
            rawText: text
        };
    }

    // ---- 5. 暴露到全局 ----
    window.BerryDetect = {
        extractDiaryText: extractDiaryText,
        analyze: analyze,
        shouldTrigger: shouldTrigger,
        // 阈值暴露出来方便调
        thresholds: {
            concentration: 0.45,
            density: 0.01,
            negRatio: 0.10
        }
    };

})();
