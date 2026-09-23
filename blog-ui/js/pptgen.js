/**
 * PPT 内容生成器 (diary → berryos PPT pages)
 * 依赖: window.api, window.BerryDetect, window.BerryPPT
 */
(function () {
    'use strict';

    var CACHE_KEY = 'berryos-ppt-cache';

    // ---- topic → 英文 slug（文件名用，如 凌波微步 → wavedash.ppt）----
    var TOPIC_SLUG_MAP = {
        '凌波微步': 'wavedash',
        '关系':     'social',
        '人际':     'social',
        '朋友':     'social',
        '恋爱':     'love',
        '高数':     'calculus',
        '数学':     'math',
        '物理':     'physics',
        '英语':     'english',
        '编程':     'coding',
        '代码':     'coding',
        '工作':     'work',
        '考试':     'exam',
        '考研':     'gradschool',
        '减肥':     'fitness',
        '失眠':     'sleep',
        '焦虑':     'anxiety'
    };
    function toSlug(topic) {
        // 先查映射表
        for (var key in TOPIC_SLUG_MAP) {
            if (topic.indexOf(key) >= 0) return TOPIC_SLUG_MAP[key];
        }
        // 否则用 topic 去掉标点 + 取前 6 字符当 fallback
        var slug = String(topic).replace(/[\s，。！？!?、,.]/g, '').slice(0, 6).toLowerCase();
        if (!slug) slug = 'mystery';
        return slug;
    }

    // ---- 6 页 PPT 格子模板（固定坐标，下次生成直接填 slot 内容）----
    // 每个 slot: { slotId, cls, kind?, x, y, w, d, chars?, stream?, src?, ratio?, center? }
    // slotId 对应 data JSON 的字段名
    var GRID_TEMPLATE = [
        {
            bg: '#9FC5E8', tr: '', dur: 6000, name: 'p1_cover',
            slots: [
                { slotId: 'p1_title', cls: 't-cover anim-zoom', chars: true, d: .15, x: 7.28, y: 12.87, w: 85.4, max: 32 },
                { slotId: 'p1_sub',   cls: 't-sub anim-rise',              d: 1.5, x: 7.28, y: 57.67, w: 85.4, max: 60 }
            ]
        },
        {
            bg: '#FFF2CC', tr: 'cube', dur: 12000, name: 'p2_pain',
            slots: [
                { slotId: 'p2_head',   cls: 't-head anim-left', chars: true, stream: true, d: .25, x: 5.78, y: 11.13, w: 70 },
                { slotId: 'p2_fact',   cls: 't-body', chars: true, stream: true, d: 1.0, x: 9.15, y: 28.07, w: 25, max: 40 },
                { slotId: 'p2_hard1',  cls: 't-body', chars: true, stream: true, d: 2.8, x: 9.15, y: 35.5,  w: 25, max: 40 },
                { slotId: 'p2_hard2',  cls: 't-body', chars: true, stream: true, d: 4.6, x: 9.15, y: 43.0,  w: 25, max: 40 },
                { slotId: 'p2_worst',  cls: 't-body', chars: true, stream: true, d: 6.4, x: 9.15, y: 50.5,  w: 25, max: 40 },
                { slotId: 'p2_tail',   cls: 't-body', chars: true, stream: true, d: 8.2, x: 9.15, y: 58.0,  w: 25 },
                { slotId: 'p2_impossible', cls: 't-big anim-rot',          d: 9.8, x: 53.06, y: 36.93, w: 46, max: 16 },
                { slotId: 'p2_guy',    kind: 'img', cls: 'anim-bounce',       d: 10.5, x: 63.90, y: 38.47, w: 35.21, src: 'Atlases/WaveDashing/Guy Clip Art.png' }
            ]
        },
        {
            bg: '#D9EAD3', tr: 'dissolve', dur: 10000, name: 'p3_intro',
            slots: [
                { slotId: 'p3_title', cls: 't-head-en white', chars: true, stream: true, d: .5,  x: 5.36, y: 11.47, w: 90, max: 28 },
                { slotId: 'p3_placeholder', kind: 'ph', cls: 'anim-rise', d: 2.5, x: 29.63, y: 21.27, w: 40.76, ratio: 10.87/6.11, t: '本月配图位' },
                { slotId: 'p3_desc',  cls: 't-body anim-rise', d: 3.5, x: 34.43, y: 62.47, w: 33, max: 60 },
                { slotId: 'p3_shi',   cls: 't-big anim-whoosh', chars: true, center: true, d: 5.0, x: 15, y: 73.13, w: 70, t: '这很简单！' }
            ]
        },
        {
            bg: '#F4CCCC', tr: 'fade', dur: 10000, name: 'p4_method',
            slots: [
                { slotId: 'p4_title', cls: 't-head anim-left', d: .25, x: 5.63, y: 11.2, w: 55, max: 16 },
                { slotId: 'p4_placeholder', kind: 'ph', cls: 'anim-rise', d: .9, x: 29.29, y: 20.6, w: 41.4, ratio: 11.04/6.21, t: '本月配图位' },
                { slotId: 'p4_step1', cls: 't-body', chars: true, stream: true, d: 1.8, x: 7.58, y: 63.27, w: 27, prefix: '- ', max: 28 },
                { slotId: 'p4_step2', cls: 't-body', chars: true, stream: true, d: 3.5, x: 7.58, y: 70.5,  w: 27, prefix: '- ', max: 28 },
                { slotId: 'p4_step3', cls: 't-body', chars: true, stream: true, d: 5.2, x: 7.58, y: 77.8,  w: 27, prefix: '- ', max: 28 },
                { slotId: 'p4_tail',  cls: 't-body', chars: true, stream: true, d: 6.9, x: 7.58, y: 85.1,  w: 27, t: '- 学会了！（走你）' }
            ]
        },
        {
            bg: '#FFF2CC', tr: 'spin', dur: 8500, name: 'p5_trouble',
            slots: [
                { slotId: 'p5_head',    cls: 't-head anim-pop', d: .25, x: 5.59, y: 11.13, w: 55, t: '天堂中的麻烦？' },
                { slotId: 'p5_ph_a',    kind: 'ph', cls: 'anim-rise', d: .9, x: 17.93, y: 27.53, w: 17.48, ratio: 4.66/4.31, t: '配图位' },
                { slotId: 'p5_warn_a',  cls: 't-warn anim-rise', d: 1.5, x: 17.93, y: 63.6, w: 18.5 },
                { slotId: 'p5_ph_b',    kind: 'ph', cls: 'anim-rise', d: 1.3, x: 58.65, y: 27.53, w: 28.76, ratio: 7.67/4.31, t: '配图位' },
                { slotId: 'p5_warn_b',  cls: 't-warn anim-rise', d: 1.9, x: 60.5, y: 63.6, w: 24 }
            ]
        },
        {
            bg: '#DBD8ED', tr: 'cube', dur: null, name: 'p6_end',
            slots: [
                { slotId: 'p6_title', cls: 't-end', chars: true, d: .25, x: 2.5, y: 10.4, w: 95, max: 28 },
                { slotId: 'p6_bird',  kind: 'img', cls: 'anim-zoom', d: 1.4, x: 30, y: 25, w: 40, src: 'Atlases/WaveDashing/Bird Clip Art.png' }
            ]
        }
    ];

    // ---- 给 AI 的 system prompt（反上世纪味 + 游戏感 + 原作逐字锚定）----
    function buildPrompt(topic, evidence, text) {
        var anchors = (evidence || []).slice(0, 5).map(function (e) {
            return '"' + e.word + '"(出现' + e.freq + '次)';
        }).join('、');

        return [
            '═══════════════════════════════════════════════════════════',
            '角色：你就是 Celeste 游戏里的 Madeline。',
            '═══════════════════════════════════════════════════════════',
            '',
            '【Madeline 人设—— 按这个声音说话，一个字都不能偏】',
            '  20 多岁的倔强攀岩女孩，刚从城里逃出来想证明自己。',
            '  说话像在跟自己抱怨，又像在跟一个同病相怜的朋友说话。',
            '  - 短句，断句像喘气："我又失败了。""真的搞不定啊。"',
            '  - 自嘲式吐槽：带"又"、"还是"、"为什么"这些词',
            '  - 偶尔中二一下（"不可能！"），但很快就怂了（"…好吧"）',
            '  - 讲具体的事，不说大道理——原作里从不说"希望这能帮到你"',
            '  - 不礼貌不官方不说教不鸡汤，像个真实玩家在写心得',
            '',
            '【原作逐字风格锚定 —— 请照抄这些句式和语气】',
            '  ✅ 原作会写：凌波微步真的好难。',
            '  ❌ 原作绝不会写：凌波微步这一操作具备相当的难度。',
            '',
            '  ✅ 原作会写：有时候没能刷新冲刺。',
            '  ❌ 原作绝不会写：在某些情况下冲刺刷新操作未能成功执行。',
            '',
            '  ✅ 原作会写：而且打第九章还必须得学（这最坏了）',
            '  ❌ 原作绝不会写：此外第九章关卡要求玩家必须掌握此技能。',
            '',
            '  ✅ 原作会写：不可能完成的任务？',
            '  ❌ 原作绝不会写：这似乎是一项不可能达成的挑战？',
            '',
            '  ✅ 原作会写：介绍…凌波微步.ppt!!',
            '  ❌ 原作绝不会写：以下为该技巧的详细教学方案。',
            '',
            '═══════════════════════════════════════════════════════════',
            '【上世纪 AI 官样文章黑名单 —— 出现任何一条直接 0 分】',
            '  ❌ 禁止：由此可见 / 综上所述 / 总而言之 / 不难看出',
            '  ❌ 禁止：希望这篇/本教程能为您提供帮助',
            '  ❌ 禁止：在某些情况下 / 对于部分玩家 / 取决于个人情况',
            '  ❌ 禁止：具备一定难度 / 操作较为复杂 / 需要反复练习',
            '  ❌ 禁止：建议您尝试 / 您可以考虑 / 推荐使用',
            '  ❌ 禁止：本文将 / 本方案旨在 / 本教程包含',
            '  ❌ 禁止：合理地 / 有效地 / 适当地 / 系统性地',
            '  ❌ 禁止：长句、复合句、从句；所有句子必须 ≤12 字',
            '  ❌ 禁止：使用"您"——Madeline 说"你"或者直接省略主语',
            '  ❌ 禁止：任何数字编号以外的符号（不用 ★●■ 这些装饰）',
            '',
            '═══════════════════════════════════════════════════════════',
            '【你要生成的 6 页 PPT —— 严格按 key 填，只输出纯 JSON】',
            '',
            '{',
            '',
            '─── P1 封面 ───',
            '  "p1_title":   "格式：{topic} 与你，6-8字，例：凌波微步 与你",',
            '                ✅ 凌波微步 与你  ❌ 关于凌波微步的学习指南',
            '  "p1_sub":     "副标题，像 Madeline 随手写的一句话，≤14字"',
            '                ✅ 学不会？来看看  ❌ 学习凌波微步的实用方法',
            '',
            '─── P2 痛点页 ───（这是情绪最高点，必须有力量）',
            '  "p2_fact":    "事实：{topic}真的好难！ 以感叹号结尾！"',
            '                ✅ 事实：凌波微步真的好难！',
            '  "p2_hard1":   "第一个具体难点，从日记里扒细节，必须有场景感"',
            '                ✅ 每次冲刺都差最后一步  ❌ 操作不够熟练',
            '  "p2_hard2":   "第二个不同维度的具体难点"',
            '                ✅ 跳的时机老是按错  ❌ 时机掌握不好',
            '  "p2_worst":   "最难的地方！绝望感拉满，但别太长"',
            '                ✅ 而且卡这关都三天了  ❌ 这件事对我影响很大',
            '  "p2_impossible":"核心梗！不可能{XX}的{XX}？ 12字以内"',
            '                公式：不可能 + [否定动词] + 的 + [topic名词] + ？',
            '                ✅ 不可能学会的凌波微步？  ❌ 这似乎不太可能做到？',
            '',
            '─── P3 介绍页 ───（从绝望转折到希望，这很重要）',
            '  "p3_title":   "介绍…{你想出来的解法名}!!"',
            '                ✅ 介绍…凌波微步.ppt!!  ❌ 介绍…解决方法!!',
            '                解法名要酷要具体，像游戏里的技能名',
            '  "p3_desc":    "解法的意义，像 Madeline 在推销自己的小发明"',
            '                ✅ 把所有坑都帮你踩过了！  ❌ 本方案涵盖所有必要内容',
            '',
            '─── P4 方法页 ───（三步，必须有递进感）',
            '  "p4_title":   "{XX}方法" 简短有力',
            '                ✅ 凌波微步.ppt  ❌ 操作步骤',
            '  "p4_step1":   "第一步：一个具体动作"',
            '                ✅ 靠近墙的边缘  ❌ 确保你准备好',
            '  "p4_step2":   "第二步：承接 step1"',
            '                ✅ 冲刺的同时按跳跃',
            '  "p4_step3":   "第三步：带成了的感觉"',
            '                ✅ 就这么跳过去了！  ❌ 完成整个操作流程',
            '',
            '─── P5 天堂中的麻烦（红字警告）───',
            '  "p5_sub_a":   "如果…句式，一个具体的坏情况"',
            '                ✅ 如果跳的不够远…  ❌ 如果遇到困难…',
            '  "p5_prevent_a":"对应的自救方法，要像游戏教程里的提示"',
            '                ✅ 试试疯狂模式帮你刷新',
            '  "p5_sub_b":   "另一种坏情况，和 a 不一样"',
            '  "p5_prevent_b":"对应的自救方法"',
            '',
            '─── P6 结尾 ───（温暖收尾）',
            '  "p6_title":   "{XXXX}，快乐的{XXXX}"',
            '                ✅ 凌波微步，快乐的你  ❌ 凌波微步，掌握技巧的你',
            '                第二个空填你、我们、生活——抽象一点，给人希望',
            '',
            '─── 4 张配图的图片生成 prompt（和 Celeste 游戏截图风格贴近，英文）───',
            '  每张图的 prompt 要让 AI 图像生成器画出和 Celeste 官方截图类似的像素风：',
            '  关键词：celeste game style, flat 2D pixel art, blue-orange Madeline character,',
            '          teal-purple-snowy scenery, clean composition, no text, game screenshot',
            '  具体每张图：',
            '  "p3_img_prompt": "Madeline the climber girl (red hair, blue jacket) standing near a snowy geodesic dome building, Internet Cafe sign visible, Celeste game pixel art style, flat 2D, teal purple snow scenery, clean background, no text, game screenshot quality"',
            '  "p4_img_prompt": "Madeline (red hair, blue jacket) performing a wave dash wall jump mid-air, pixel art action shot, Celeste game style, blue and teal mountain background, flat 2D, dynamic pose, no text, game screenshot"',
            '  "p5_img_a_prompt": "Madeline in trouble, slipping or failing a jump, frustrated expression, pixel art, Celeste game style, dark cave or mountain setting, flat 2D, no text, game screenshot"',
            '  "p5_img_b_prompt": "Madeline looking determined after failure, kneeling or standing up again, pixel art, Celeste game style, snowy mountain background, flat 2D, emotional, no text, game screenshot"',
            '',
            '  注意：topic 如果不是"凌波微步"，把 prompt 里的 wave dash 换成具体动作。',
            '',
            '}',
            '',
            '═══════════════════════════════════════════════════════════',
            '【硬性约束 —— 违反任何一条输出作废】',
            '  1. 只输出纯 JSON 对象，不要任何 markdown、不要任何解释',
            '  2. 所有值都是字符串，0 嵌套 0 数组',
            '  3. 每条 ≤ 对应注释里的字数上限',
            '  4. p2_hard1 / p2_hard2 / p2_worst 必须从日记原文里直接提取具体细节',
            '  5. 禁止黑名单里的任何词/句式/语气',
            '  6. 每句 ≤ 12 字',
            '  7. 必须像 Madeline 在说话——带情绪、不官方、有态度',
            '',
            '═══════════════════════════════════════════════════════════',
            '【患者档案】',
            '  核心困扰（topic）：' + topic,
            '  高频关键词：' + anchors,
            '',
            '【患者日记原文 —— 这里面全是素材，请逐句读】',
            text.slice(0, 3000),
            '═══════════════════════════════════════════════════════════'
        ].join('\n');
    }

    // ---- 解析 AI 返回的 JSON ----
    function parseAiJson(text) {
        var cleaned = String(text || '').trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
        try { return JSON.parse(cleaned); }
        catch (e) {
            var m = cleaned.match(/\{[\s\S]*\}/);
            if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
            return null;
        }
    }

    // ---- 从日记原文里扒真实句子（fallback 专用，避免硬凑废话）----
    var NEG_HINTS = ['难', '烦', '学不会', '不会', '不行', '哭', '烦', '慌', '痛', '卡',
                     '每次', '老是', '还是', '一直', '为什么', '到底', '根本', '就是',
                     '又', '再', '还是没', '没学会', '没做好', '搞不定'];
    function extractHardSentences(text, topic, count) {
        // 按标点切句
        var sentences = String(text).split(/[。！？!?…\n\s]+/).filter(function (s) {
            var t = s.trim();
            return t.length >= 4 && t.length <= 24;
        });
        // 带情绪的优先
        var withNeg = sentences.filter(function (s) {
            return NEG_HINTS.some(function (h) { return s.indexOf(h) >= 0; });
        });
        // 去掉纯重复 topic 的（凌波微步凌波微步）
        var dedup = withNeg.filter(function (s) {
            var topicCount = (s.match(new RegExp(topic, 'g')) || []).length;
            return topicCount <= 1;
        });
        // 打乱取 top N
        dedup.sort(function () { return Math.random() - 0.5; });
        return dedup.slice(0, count);
    }

    function buildFallbackFromDiary(topic, evidence, rawText) {
        var slug = toSlug(topic);
        var fname = slug + '.ppt';

        // 从日记里扒 3 句真实痛点
        var hard = extractHardSentences(rawText, topic, 3);
        var hard1 = hard[0] || '每次都差一点点';
        var hard2 = hard[1] || '老是搞不对时机';
        var worst = hard[2] || '而且还绕不过去';

        // 从高频关键词 evidence 里挑一个做解法名（排除负面词）
        var NEG_NAMES = ['学不会', '不会', '难', '不行', '烦', '哭', '卡', '慌', '痛', '没学会', '没做好'];
        var solvKw = (evidence || []).filter(function (e) {
            return e.word !== topic && !NEG_NAMES.some(function (n) { return e.word.indexOf(n) >= 0; });
        });
        var solv = solvKw[0] ? solvKw[0].word : '拆解练习法';

        // p5 的 warn 段落要拼起来（slot 是 t-warn anim-rise，带 <br>）
        var warn_a = '如果又搞砸了…<br>歇一会儿再试试';
        var warn_b = '如果心态快崩了…<br>深呼吸，别着急';

        // 和 GRID_TEMPLATE 的 slotId 一一对应
        return {
            // p1 封面
            p1_title: fname + ' 与你',
            p1_sub:   '学不会？来看看',

            // p2 痛点
            p2_head:    '你在' + fname + '上卡壳了？',
            p2_fact:    '事实：' + topic + '真的好难！',
            p2_hard1:   hard1,
            p2_hard2:   hard2,
            p2_worst:   worst,
            p2_tail:    '（这最坏了）',
            p2_impossible: '不可能学会的' + topic + '？',

            // p3 介绍
            p3_title:   '介绍…' + fname + '!!',
            p3_desc:    '把所有坑都帮你踩过了！',

            // p4 方法
            p4_title:   topic + '三步法',
            p4_step1:   '先把' + topic + '拆成小动作',
            p4_step2:   '每次只练一个细节',
            p4_step3:   '慢慢来，别急',

            // p5 麻烦
            p5_warn_a:  warn_a,
            p5_warn_b:  warn_b,

            // p6 结尾
            p6_title:   fname + '，快乐的你'
        };
    }

    // ---- 把 data 按 GRID_TEMPLATE 填成 6 页 SLIDES（格子模板化）----
    function buildSlides(data, topic) {
        data = data || {};
        var slug = toSlug(topic);
        var fname = slug + '.ppt';

        return GRID_TEMPLATE.map(function (slideTpl, i) {
            var items = slideTpl.slots.map(function (slot) {
                // 图片槽：模板自带 src（Guy、Bird）
                if (slot.kind === 'img') {
                    return { kind: 'img', cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, src: slot.src };
                }
                // 配图位：如果 data 里有对应的图片 URL → 换成 img；没有就保持占位 ph
                if (slot.kind === 'ph') {
                    // slotId: p3_placeholder → data.p3_img；p4_placeholder → data.p4_img
                    //         p5_ph_a → data.p5_img_a；p5_ph_b → data.p5_img_b
                    var slotToImg = {
                        'p3_placeholder': 'p3_img',
                        'p4_placeholder': 'p4_img',
                        'p5_ph_a':        'p5_img_a',
                        'p5_ph_b':        'p5_img_b'
                    };
                    var imgKey = slotToImg[slot.slotId];
                    var imgUrl = imgKey ? data[imgKey] : null;
                    if (imgUrl) {
                        return { kind: 'img', cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, src: imgUrl };
                    }
                    // 没图 → 保持占位框
                    return { kind: 'ph', cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, ratio: slot.ratio, t: slot.t };
                }
                // 纯静态硬编码 t（p3_shi "这很简单！" / p4_tail "学会了！" / p5_head "天堂中的麻烦？"）
                if (slot.t && !data[slot.slotId]) {
                    var staticItem = { cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, t: slot.t };
                    if (slot.chars) staticItem.chars = true;
                    if (slot.stream) staticItem.stream = true;
                    if (slot.center) staticItem.center = true;
                    return staticItem;
                }
                // 正常数据槽位：取 data[slotId]，加 prefix，截断
                var raw = data[slot.slotId];
                if (raw == null) raw = '';
                if (slot.prefix) raw = slot.prefix + raw;
                if (slot.max) raw = String(raw).slice(0, slot.max);

                var item = { cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, t: raw };
                if (slot.chars) item.chars = true;
                if (slot.stream) item.stream = true;
                if (slot.center) item.center = true;
                return item;
            });

            return { bg: slideTpl.bg, tr: slideTpl.tr, dur: slideTpl.dur, items: items };
        });
    }

    function readCache(topic) {
        try {
            var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (c && c.topic === topic && Date.now() - c.ts < 24 * 3600 * 1000) return c.slides;
        } catch (e) {}
        return null;
    }
    function writeCache(topic, slides) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ topic: topic, slides: slides, ts: Date.now() })); } catch (e) {}
    }

    async function generate(topic, rawText, evidence) {
        // fallback：先从日记里扒真实句子 → 立刻返回，不卡
        var safe = buildSlides(buildFallbackFromDiary(topic, evidence, rawText), topic);
        var cached = readCache(topic);
        if (cached) return cached;

        // 后台异步：先拿 AI 文本 → 再给 4 个配图位生图 → 逐步热更新
        if (typeof window.api === 'function') {
            (async function () {
                var obj = null;
                try {
                    var res = await window.api('/ppt/generate', 'POST', {
                        topic: topic, diary: rawText, evidence: evidence,
                        prompt: buildPrompt(topic, evidence, rawText)
                    }, 3000);
                    if (res && res.success && res.data) {
                        obj = parseAiJson(res.data.content || res.data.text || JSON.stringify(res.data));
                    }
                } catch (e) { /* 端点不通就跳过，obj 保持 null */ }

                // 如果 AI 文本生成失败 → 用 fallback 的字，还是尝试生图
                if (!obj) obj = buildFallbackFromDiary(topic, evidence, rawText);

                // 如果 AI 端点直接返回了图片 URL（p3_img/p4_img/...）→ 直接用
                // 如果只有 prompt → 调前端生图
                var needImg = [];
                var slotMap = [
                    { promptKey: 'p3_img_prompt',     urlKey: 'p3_img' },
                    { promptKey: 'p4_img_prompt',     urlKey: 'p4_img' },
                    { promptKey: 'p5_img_a_prompt',   urlKey: 'p5_img_a' },
                    { promptKey: 'p5_img_b_prompt',   urlKey: 'p5_img_b' }
                ];
                for (var k = 0; k < slotMap.length; k++) {
                    if (!obj[slotMap[k].urlKey] && obj[slotMap[k].promptKey]) {
                        needImg.push(slotMap[k]);
                    }
                }
                if (needImg.length) {
                    await generateImages(obj, needImg);
                }

                var slides = buildSlides(obj, topic);
                writeCache(topic, slides);
                // 热更新
                if (window.BerryPPT && typeof window.BerryPPT.setSlides === 'function') {
                    window.BerryPPT.setSlides(slides);
                }
            })();
        }
        // 立即返回 fallback
        return safe;
    }

    /**
     * 前端生图：并发调用 text_to_image 接口
     * 改 obj[imgKey] 为真实图片 URL（后端如果已返回 URL 就跳过）
     */
    async function generateImages(obj, needSlots) {
        // 把中文 topic 换成 Celeste prompt 里的英文描述
        var slug = obj.p3_title ? '' : ''; // slug 已在外面
        var promptPrefix = 'celeste game style flat 2D pixel art, ';
        // 并发生 4 张（快很多）
        var promises = needSlots.map(function (slot) {
            var prompt = (obj[slot.promptKey] || promptPrefix + 'Madelene in Celeste game').trim();
            return _fetchImage(prompt).then(function (url) {
                if (url) obj[slot.urlKey] = url;
            }).catch(function () { /* 单张失败不阻塞其他 */ });
        });
        await Promise.all(promises);
    }

    /**
     * 实际生图请求：先试用户后端的 /ppt/image，没有就用 Trae text_to_image 代理
     * 返回图片 URL 或 null
     */
    function _fetchImage(prompt) {
        // 优先：用户自己的后端（如果部署了）
        if (typeof window.api === 'function') {
            return window.api('/ppt/image', 'POST', { prompt: prompt, size: 'landscape_4_3' }, 5000)
                .then(function (res) {
                    if (res && res.success && res.data && res.data.url) return res.data.url;
                    if (res && res.data && (res.data.url || res.data.image)) return res.data.url || res.data.image;
                    return null;
                });
        }
        return Promise.resolve(null);
    }

    async function triggerAndOpen() {
        if (!window.BerryDetect || !window.BerryPPT) return false;
        var result = window.BerryDetect.shouldTrigger();
        if (!result.triggered) return false;
        var topic = result.topic || '这件事';
        var text = result.rawText || '';
        var evidence = result.evidence || [];
        if (typeof window.showToast === 'function') window.showToast('检测到你的困扰，正在为你生成 PPT…', 'info');
        var slides = await generate(topic, text, evidence);
        if (window.BerryPPT && typeof window.BerryPPT.setSlides === 'function') {
            window.BerryPPT.setSlides(slides);
        } else if (window.BerryPPT) {
            window.BerryPPT.SLIDES = slides;
            if (typeof window.BerryPPT.rebuild === 'function') window.BerryPPT.rebuild();
        }
        if (typeof window.BerryPPT.open === 'function') window.BerryPPT.open();
        return true;
    }

    window.BerryPPTGen = {
        generate: generate, buildSlides: buildSlides,
        triggerAndOpen: triggerAndOpen, readCache: readCache,
        clearCache: function () { localStorage.removeItem(CACHE_KEY); }
    };
})();
