/**
 * PPT 内容生成器 (diary → berryos PPT pages)
 * 依赖: window.api, window.BerryDetect, window.BerryPPT
 */
(function () {
    'use strict';

    // v6：多份课件列表；v5 是单份，读取时迁移
    var CACHE_KEY = 'berryos-ppt-cache-v6';
    var LEGACY_CACHE_KEY = 'berryos-ppt-cache-v5';

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
                { slotId: 'p2_guy',    kind: 'img', cls: 'anim-bounce',       d: 10.5, x: 64.14, y: 40.74, w: 35.86, src: 'Atlases/WaveDashing/Guy Clip Art.png' }
            ]
        },
        {
            bg: '#D9EAD3', tr: 'blocky', dur: 10000, name: 'p3_intro',
            // 转场跟原作 WaveDashPage 的 Transition 一一对应（Transition 属于「进入页」）：
            //   进 p2 痛点 Rotate3D('cube') → 进 p3 介绍 Blocky → 进 p4 方法 FadeIn('fade')
            //   → 进 p5 麻烦 Spiral('spin') → 进 p6 结尾 Rotate3D('cube')
            slots: [
                { slotId: 'p3_title', cls: 't-head-en white', chars: true, stream: true, d: .5,  x: 5.36, y: 11.47, w: 90, max: 28 },
                // 媒体统一规则：固定 16:9 框、x33.5/w33 居中、y26.5 落在标题安全线以下
                { slotId: 'p3_placeholder', kind: 'ph', cls: 'anim-rise', d: 2.5, x: 33.5, y: 26.5, w: 33, ratio: 16/9, t: '本月配图位' },
                // 说明文字与媒体同宽同中心，且在媒体底（59.5%）下留 2.5% 安全距
                { slotId: 'p3_desc',  cls: 't-body anim-rise', d: 3.5, x: 33.5, y: 62.0, w: 33, center: true, max: 60 },
                { slotId: 'p3_shi',   cls: 't-big anim-whoosh', chars: true, center: true, d: 5.0, x: 15, y: 74.0, w: 70, t: '这很简单！' }
            ]
        },
        {
            bg: '#F4CCCC', tr: 'fade', dur: 10000, name: 'p4_method',
            slots: [
                { slotId: 'p4_title', cls: 't-head anim-left', d: .25, x: 5.63, y: 11.2, w: 55, max: 16 },
                { slotId: 'p4_placeholder', kind: 'ph', cls: 'anim-rise', d: .9, x: 33.5, y: 26.5, w: 33, ratio: 16/9, t: '本月配图位' },
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
                // 双图统一规则：同宽同高同 y、以 50% 为轴对称（中心 28% / 72%）
                { slotId: 'p5_ph_a',    kind: 'ph', cls: 'anim-rise', d: .9, x: 13.62, y: 29.0, w: 28.76, ratio: 16/9, t: '配图位' },
                { slotId: 'p5_warn_a',  cls: 't-warn anim-rise', d: 1.5, x: 13.62, y: 59.5, w: 28.76, center: true },
                { slotId: 'p5_ph_b',    kind: 'ph', cls: 'anim-rise', d: 1.3, x: 57.62, y: 29.0, w: 28.76, ratio: 16/9, t: '配图位' },
                { slotId: 'p5_warn_b',  cls: 't-warn anim-rise', d: 1.9, x: 57.62, y: 59.5, w: 28.76, center: true }
            ]
        },
        {
            bg: '#D9D2E9', tr: 'cube', dur: null, name: 'p6_end',
            slots: [
                { slotId: 'p6_title', cls: 't-end', chars: true, d: .25, x: 2.5, y: 10.4, w: 95, max: 28 },
                { slotId: 'p6_bird',  kind: 'img', cls: 'anim-zoom', d: 1.4, x: 30, y: 27, w: 40, src: 'Atlases/WaveDashing/Bird Clip Art.png' }
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
            '【语感参考示例 —— 以下仅为语感参考，禁止复用其中任何名词或具体词】',
            '  〔 〕里全是占位符，不是素材，绝不允许写进输出。',
            '  示例只示范语气、断句和长度；真实内容只能来自下方的患者日记。',
            '',
            '  ✅ 会写：〔主题〕真的好〔难〕。',
            '  ❌ 绝不会写：〔主题〕这一〔事物〕具备相当的〔难度〕。',
            '',
            '  ✅ 会写：有时候没能〔做到某个动作〕。',
            '  ❌ 绝不会写：在某些情况下〔某个操作〕未能成功执行。',
            '',
            '  ✅ 会写：而且〔某个环节〕还必须得〔掌握〕（这最坏了）',
            '  ❌ 绝不会写：此外〔某个环节〕要求玩家必须掌握此技能。',
            '',
            '  ✅ 会写：不可能〔做到〕的〔事〕？',
            '  ❌ 绝不会写：这似乎是一项不可能达成的挑战？',
            '',
            '  ✅ 会写：介绍…〔某某〕.ppt!!',
            '  ❌ 绝不会写：以下为该〔方法〕的详细教学方案。',
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
            '  （下面 ✅ 里的〔 〕同样是占位符，只示范语气和长度；真实内容必须来自日记原文）',
            '',
            '{',
            '',
            '─── P1 封面 ───',
            '  "p1_title":   "格式：{topic}与我，6-9字，例：〔主题〕与我",',
            '                ✅ 〔主题〕与我  ❌ 关于〔主题〕的〔正式标题〕',
            '  "p1_sub":     "副标题，像 Madeline 随手写的一句话，≤14字"',
            '                ✅ 学不会？来看看  ❌ 学习〔主题〕的〔实用方法〕',
            '',
            '─── P2 痛点页 ───（这是情绪最高点，必须有力量）',
            '  "p2_head":    "你在{topic}上卡壳了？ 像 Madeline 自问，≤12字"',
            '                ✅ 你在〔主题〕上卡壳了？  ❌ 关于〔主题〕的〔困难〕分析',
            '  "p2_fact":    "事实：{topic}真的好难！ 以感叹号结尾！"',
            '                ✅ 事实：〔主题〕真的好难！',
            '  "p2_hard1":   "第一个具体难点，从日记里扒细节，必须有场景感"',
            '                ✅ 每次〔某个动作〕都差最后一步  ❌ 〔操作〕不够熟练',
            '  "p2_hard2":   "第二个不同维度的具体难点"',
            '                ✅ 〔某个时机〕老是按错  ❌ 〔时机〕掌握不好',
            '  "p2_worst":   "最难的地方！绝望感拉满，但别太长"',
            '                ✅ 而且〔某件事〕都〔持续了多久〕  ❌ 〔这件事〕对我影响很大',
            '  "p2_impossible":"核心梗！不可能{XX}的{XX}？ 12字以内"',
            '                公式：不可能 + [否定动词] + 的 + [topic名词] + ？',
            '                ✅ 不可能〔否定动词〕的〔主题〕？  ❌ 这似乎不太可能做到？',
            '  "p2_tail":    "随口的补刀，≤10字，带括号"',
            '                ✅ （这最坏了）  ❌ 〔正式总结句〕',
            '',
            '─── P3 介绍页 ───（从绝望转折到希望，这很重要）',
            '  "p3_title":   "介绍…{你想出来的解法名}!!"',
            '                ✅ 介绍…〔解法名〕.ppt!!  ❌ 介绍…〔笼统名称〕!!',
            '                解法名要酷要具体，像游戏里的技能名',
            '  "p3_desc":    "解法的意义，像 Madeline 在推销自己的小发明"',
            '                ✅ 〔具体到坑的一句话〕  ❌ 〔方案覆盖内容〕',
            '',
            '─── P4 方法页 ───（三步，必须有递进感）',
            '  "p4_title":   "{XX}方法" 简短有力',
            '                ✅ 〔解法名〕  ❌ 〔步骤说明〕',
            '  "p4_step1":   "第一步：一个具体动作"',
            '                ✅ 靠近〔某个位置〕  ❌ 〔笼统准备〕',
            '  "p4_step2":   "第二步：承接 step1"',
            '                ✅ 〔某个动作〕的同时〔另一个动作〕',
            '  "p4_step3":   "第三步：带成了的感觉"',
            '                ✅ 就这么〔成功〕了！  ❌ 〔完成整个操作流程〕',
            '',
            '─── P5 天堂中的麻烦（红字警告，左右两格各两行）───',
            '  "p5_warn_a":  "如果…句式，一个具体的坏情况 + <br> + 对应的自救方法"',
            '                ✅ 如果〔某个动作〕不够到位…<br>试试〔某个功能〕',
            '                ❌ 如果〔泛泛情况〕…',
            '  "p5_warn_b":  "另一种坏情况 + <br> + 对应的自救方法，和 a 不一样"',
            '                ✅ 如果老是〔提前做某个动作〕…<br>盯着〔某个位置〕再做一次',
            '',
            '─── P6 结尾 ───（温暖收尾）',
            '  "p6_title":   "{XXXX}，快乐的{XXXX}"',
            '                ✅ 〔主题〕，快乐的〔抽象词〕  ❌ 〔主题〕，〔具体结果〕的你',
            '                第二个空填一个抽象的词，给人希望',
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
            p1_title: topic + '与我',
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
                    return { kind: 'img', key: slot.slotId, cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, src: slot.src };
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
                        // AI 配图统一：模板给出固定 16:9 框 + cover，尺寸不再随图源固有比例漂移
                        return { kind: 'img', key: slot.slotId, cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, src: imgUrl, ratio: slot.ratio, fit: 'cover' };
                    }
                    // 没图 → 保持占位框（key 供图片异步返回后热替换；fit/ratio 供 patchImage 复原固定框）
                    return { kind: 'ph', key: slot.slotId, cls: slot.cls, d: slot.d, x: slot.x, y: slot.y, w: slot.w, ratio: slot.ratio, fit: 'cover', t: slot.t };
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

    // ---- 缓存：v6 列表（多份课件，各自 id）----
    // 旧 v5 是单份 {topic, slides, ts}；首次读 v6 时把旧那份迁进来，旧 key 保留不删。
    var MAX_ITEMS = 6;
    var removedIds = {};   // 本页内已删除/被挤出的 id：后台迟到的 AI 结果不允许把它复活

    function genId() {
        return 'ppt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }
    function itemLabel(topic) { return (topic || '这件事') + '与我.ppt'; }

    function readAll() {
        try {
            var o = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (o && Array.isArray(o.items)) {
                return o.items.filter(function (it) {
                    return it && it.id && Array.isArray(it.slides) && it.slides.length;
                });
            }
        } catch (e) {}
        // 旧单份缓存平滑迁移：至少保证已有那份不凭空消失
        try {
            var old = JSON.parse(localStorage.getItem(LEGACY_CACHE_KEY) || 'null');
            if (old && Array.isArray(old.slides) && old.slides.length) {
                var oldTopic = old.topic || '这件事';
                var item = { id: genId(), topic: oldTopic, label: itemLabel(oldTopic), slides: old.slides, ts: old.ts || Date.now() };
                writeAll([item]);
                return [item];
            }
        } catch (e) {}
        return [];
    }
    function writeAll(items) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: items })); } catch (e) {}
    }
    function saveItem(topic, slides, id) {
        if (!slides || !slides.length) return null;
        if (id && removedIds[id]) return null;
        var items = readAll();
        var item = null;
        for (var i = 0; i < items.length; i++) {
            if (id && items[i].id === id) { item = items[i]; break; }
        }
        if (item) {
            item.topic = topic || item.topic;
            item.label = itemLabel(item.topic);
            item.slides = slides;
            item.ts = Date.now();
        } else {
            item = { id: id || genId(), topic: topic || '这件事', label: itemLabel(topic), slides: slides, ts: Date.now() };
            items.push(item);
        }
        // 超过 6 份：直接移除最早的一份（不进回收站，也不允许被后台请求复活）
        while (items.length > MAX_ITEMS) {
            var gone = items.shift();
            removedIds[gone.id] = true;
        }
        writeAll(items);
        return item;
    }
    function removeItem(id) {
        removedIds[id] = true;
        var items = readAll().filter(function (it) { return it.id !== id; });
        writeAll(items);
        return items;
    }
    function readCache(topic) {
        var items = readAll();
        for (var i = items.length - 1; i >= 0; i--) {
            if (items[i].topic === topic && Date.now() - items[i].ts < 24 * 3600 * 1000) return items[i].slides;
        }
        return null;
    }

    // 4 个配图位 → 这一页的标题/要点（画面描述由后端 /ppt/image 生成，前端只负责给文案）
    var IMAGE_SLOTS = [
        { slotId: 'p3_placeholder', urlKey: 'p3_img',   titleKey: 'p3_title', points: ['p3_desc'] },
        { slotId: 'p4_placeholder', urlKey: 'p4_img',   titleKey: 'p4_title', points: ['p4_step1', 'p4_step2', 'p4_step3'] },
        { slotId: 'p5_ph_a',        urlKey: 'p5_img_a', titleKey: 'p5_head',  titleFallback: '天堂中的麻烦？', points: ['p5_warn_a'] },
        { slotId: 'p5_ph_b',        urlKey: 'p5_img_b', titleKey: 'p5_head',  titleFallback: '天堂中的麻烦？', points: ['p5_warn_b'] }
    ];

    async function generate(topic, rawText, evidence, itemId) {
        // 本地兜底：先从日记里扒真实句子 → 立刻返回，保证播放器马上有内容
        var safe = buildSlides(buildFallbackFromDiary(topic, evidence, rawText), topic);
        // 指定 itemId（新生成一份）时不复用同主题旧缓存，避免两份内容串在一起
        if (!itemId) {
            var cached = readCache(topic);
            if (cached) return cached;
        }
        itemId = itemId || genId();
        // 本地兜底先落缓存：写完日记马上跳到桌面/刷新，格子里也已经有内容
        saveItem(topic, safe, itemId);
        if (typeof window.api !== 'function') return safe;

        // 后台异步：AI 文本先到先换，图片最后补位，任何一步失败都不影响播放
        (async function () {
            var obj = null;
            try {
                // 45s：后端要等主模型返回完整 JSON；原先 3s 必然超时
                var res = await window.api('/ppt/generate', 'POST', {
                    topic: topic, diary: rawText, evidence: evidence,
                    prompt: buildPrompt(topic, evidence, rawText)
                }, 45000);
                if (res && res.success && res.data) {
                    obj = parseAiJson(res.data.content || res.data.text || JSON.stringify(res.data));
                }
            } catch (e) { /* 端点不通/超时：obj 保持 null，走本地兜底 */ }

            if (!obj) obj = buildFallbackFromDiary(topic, evidence, rawText);

            var slides = buildSlides(obj, topic);
            saveItem(topic, slides, itemId);
            // 文本热更新：播放器开着就原地续播当前页，不打断
            if (window.BerryPPT && typeof window.BerryPPT.setSlides === 'function') {
                window.BerryPPT.setSlides(slides);
            }

            // 图片异步：每张回来就热替换对应图位，不阻塞翻页
            await generateImages(slides, obj, topic);
            saveItem(topic, slides, itemId);
        })();

        return safe;
    }

    /** 并发给 4 个配图位生图；单张失败保留占位，不影响其他 */
    async function generateImages(slides, obj, topic) {
        // 没有播放器时（例如在日记页后台生成）也要跑：图片写进 slides 与缓存，桌面打开时才有图
        var canPatch = !!(window.BerryPPT && typeof window.BerryPPT.patchImage === 'function');

        var jobs = IMAGE_SLOTS.map(function (slot) {
            var title = obj[slot.titleKey] || slot.titleFallback || topic;
            var points = slot.points.map(function (k) { return obj[k] || ''; }).filter(Boolean);
            return _fetchImage(title, points).then(function (url) {
                if (!url) return;
                obj[slot.urlKey] = url;
                patchSlideImage(slides, slot.slotId, url);
                if (canPatch) window.BerryPPT.patchImage(slot.slotId, url);
            }).catch(function () { /* 单张失败：保持占位 */ });
        });
        await Promise.all(jobs);
    }

    /** 把内存里的 slides 数据同步成 img，保证下一次打开/写缓存时图片还在 */
    function patchSlideImage(slides, key, url) {
        slides.forEach(function (sd) {
            sd.items.forEach(function (it) {
                if (it.key !== key) return;
                if (it.kind === 'img') {
                    it.src = url;
                } else {
                    it.kind = 'img';
                    it.src = url;
                    delete it.ratio;
                    delete it.t;
                }
            });
        });
    }

    /** 调后端 /ppt/image：标题+要点 → 画面描述 → Kolors → 下载落库；返回站内绝对地址或 null */
    function _fetchImage(title, points) {
        if (typeof window.api !== 'function') return Promise.resolve(null);
        return window.api('/ppt/image', 'POST', { title: title, points: points }, 90000)
            .then(function (res) {
                // 后端返回的是 /ppt/image/{id} 站内地址，可直接给 <img src>
                if (res && res.success && res.data && res.data.url) return res.data.url;
                return null;
            })
            .catch(function () { return null; });
    }

    // 轻量「发起生成」：只产出内容并写缓存，不要求播放器存在、也不打开播放器。
    // 日记页保存后走这条；结果由 berryos 桌面格子在下次进桌面时读缓存恢复。
    async function triggerAndGenerate() {
        if (!window.BerryDetect) return { triggered: false, slides: [] };
        var result = window.BerryDetect.shouldTrigger();
        if (!result.triggered) return { triggered: false, slides: [] };
        var topic = result.topic || '这件事';
        var text = result.rawText || '';
        var evidence = result.evidence || [];
        var itemId = genId();  // 每篇日记一份，各自 id
        var slides = await generate(topic, text, evidence, itemId);
        if (!slides || !slides.length) {
            removeItem(itemId);
            return { triggered: true, topic: topic, item: null, slides: [] };
        }
        var item = saveItem(topic, slides, itemId);
        return { triggered: true, topic: topic, item: item, slides: slides };
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
        triggerAndOpen: triggerAndOpen, triggerAndGenerate: triggerAndGenerate,
        readCache: readCache, readAll: readAll, removeItem: removeItem,
        clearCache: function () { localStorage.removeItem(CACHE_KEY); }
    };
})();
