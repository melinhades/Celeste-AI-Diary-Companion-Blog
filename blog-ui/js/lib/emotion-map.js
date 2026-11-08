/**
 * js/lib/emotion-map.js —— 情绪键并集 / 中文别名 / 按角色降级（Madeline 7 键 + Badeline 15 键 = 19 键）
 *
 * 阶段一：只定义，不接线。diary.html / shelf.html 引入本文件，但页面代码暂不调用，
 * 因此行为与引入前完全一致。后续阶段才由 diary.js / badeline-panel.js 逐步接入。
 *
 * 兜底开关：window.__EMOTION_UNIFY_OFF = true 时，normalize / keyFor / labelFor
 * 一律原样返回入参，等价于没接入本模块——回退只需要开这个开关，不用改代码。
 *
 * 输出口径：
 *   normalize(raw, character)  AI/存储里的英文键或中文词 → 19 键并集里的英文键（识别不了返回 null）
 *   keyFor(character, key)     并集键 → 该角色真正拥有的键（缺的按 FALLBACK 降级）
 *   labelFor(character, key)   并集键 → 该角色 UI 上的中文标签（同名键 sad 两边标签不同）
 */
window.EmotionMap = (function () {

    // 1) 19 键并集：Madeline 7 + Badeline 15，同名键只算一次
    var KEYS = [
        'normal', 'panic', 'surprised', 'angry', 'sad', 'peaceful', 'deadpan',
        'angryAlt', 'yell', 'worried', 'worriedAlt', 'upset', 'concerned',
        'sigh', 'serious', 'scoff', 'freakA', 'freakB', 'freakC'
    ];
    var MADELINE_KEYS = ['normal', 'panic', 'surprised', 'angry', 'sad', 'peaceful', 'deadpan'];
    var BADELINE_KEYS = [
        'normal', 'sad', 'angry', 'angryAlt', 'yell', 'worried', 'worriedAlt',
        'upset', 'concerned', 'sigh', 'serious', 'scoff', 'freakA', 'freakB', 'freakC'
    ];

    // 2) 中文标签：同一个键在两个角色下可以有不同的中文说法（sad = 不开心 / 低落）
    var LABELS = {
        madeline: {
            normal: '默认', panic: '不安', surprised: '惊讶', angry: '怨恨',
            sad: '不开心', peaceful: '可爱', deadpan: '无语'
        },
        badeline: {
            normal: '平静', sad: '低落', angry: '恼火', angryAlt: '强压怒火', yell: '喊叫',
            worried: '不安', worriedAlt: '强装镇定', upset: '委屈', concerned: '关切',
            sigh: '叹息', serious: '认真', scoff: '嘲弄',
            freakA: '崩溃边缘', freakB: '风暴', freakC: '失控'
        }
    };

    // 3) 中文别名 → 并集键。'不安' 两边指向不同键，所以先按角色解析
    var ZH_MADELINE = {
        '默认': 'normal', '不安': 'panic', '惊讶': 'surprised', '怨恨': 'angry',
        '不开心': 'sad', '可爱': 'peaceful', '无语': 'deadpan'
    };
    var ZH_BADELINE = {
        '平静': 'normal', '低落': 'sad', '恼火': 'angry', '强压怒火': 'angryAlt',
        '喊叫': 'yell', '不安': 'worried', '强装镇定': 'worriedAlt', '委屈': 'upset',
        '关切': 'concerned', '叹息': 'sigh', '认真': 'serious', '嘲弄': 'scoff',
        '崩溃边缘': 'freakA', '风暴': 'freakB', '失控': 'freakC'
    };
    var ZH_COMMON = { '伤心': 'sad', '难过': 'sad' };

    // 4) 降级：并集键落到目标角色不存在的键时，用最接近的动作/立绘
    var FALLBACK = {
        madeline: {
            angryAlt: 'angry', yell: 'angry',
            worriedAlt: 'panic', concerned: 'panic',
            upset: 'sad', sigh: 'deadpan', scoff: 'deadpan',
            serious: 'normal', freakA: 'surprised', freakB: 'surprised', freakC: 'angry'
        },
        badeline: {
            panic: 'worried', surprised: 'yell',
            peaceful: 'normal', deadpan: 'scoff'
        }
    };

    function off() { return !!window.__EMOTION_UNIFY_OFF; }
    function has(list, key) { return list.indexOf(key) >= 0; }

    // 英文键大小写兼容（angryAlt / angryalt 都认）
    function findKey(s) {
        if (has(KEYS, s)) return s;
        var lc = s.toLowerCase();
        for (var i = 0; i < KEYS.length; i++) {
            if (KEYS[i].toLowerCase() === lc) return KEYS[i];
        }
        return null;
    }

    function normalize(raw, character) {
        if (off()) return raw;
        var s = String(raw == null ? '' : raw).trim();
        if (!s) return null;
        var k = findKey(s);
        if (k) return k;
        if (character === 'badeline') return ZH_BADELINE[s] || ZH_COMMON[s] || null;
        if (character === 'madeline') return ZH_MADELINE[s] || ZH_COMMON[s] || null;
        return ZH_MADELINE[s] || ZH_BADELINE[s] || ZH_COMMON[s] || null;
    }

    function keyFor(character, key) {
        if (off()) return key;
        var k = normalize(key, character);
        if (!k) return key;
        if (character === 'madeline') {
            return has(MADELINE_KEYS, k) ? k : (FALLBACK.madeline[k] || 'normal');
        }
        if (character === 'badeline') {
            return has(BADELINE_KEYS, k) ? k : (FALLBACK.badeline[k] || 'normal');
        }
        return k;
    }

    function labelFor(character, key) {
        if (off()) return (LABELS[character] && LABELS[character][key]) || key;
        var k = keyFor(character, key);
        var labels = LABELS[character] || LABELS.madeline;
        return labels[k] || k;
    }

    return {
        KEYS: KEYS,
        MADELINE_KEYS: MADELINE_KEYS,
        BADELINE_KEYS: BADELINE_KEYS,
        LABELS: LABELS,
        normalize: normalize,
        keyFor: keyFor,
        labelFor: labelFor,
        isKey: function (raw) { return !!findKey(String(raw == null ? '' : raw).trim()); }
    };
})();
