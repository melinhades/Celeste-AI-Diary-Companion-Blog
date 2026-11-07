#!/usr/bin/env node
/**
 * MadelineCore 台词分段不变式测试（纯 Node，无第三方依赖）
 *
 * 被测对象：blog-ui/js/madeline-core.js
 *   - segmentSpeech(text)       整段切分（非流式回退 / 写作页共用）
 *   - speechShouldBreak(seg)    流式逐字判断（diary.js 打字机共用）
 *
 * 运行：
 *   node blog-ui/tests/madeline-segmentation-invariants.js            # 默认随机 5000 组
 *   node blog-ui/tests/madeline-segmentation-invariants.js 2000       # 指定随机组数
 *   node blog-ui/tests/madeline-segmentation-invariants.js --verbose  # 每组失败都打印
 *
 * 退出码：0 = 全部不变式通过；1 = 至少一组失败。
 *
 * 四条不变式（逐条独立断言；失败会打印可复现输入）：
 *   I1  所有段按顺序拼接后逐字等于原文（不丢字、不重复）
 *   I2  每段长度不超过硬上限（按 Unicode 码点计；UTF-16 单元因代理对保护可能到 73）
 *   I3  不劈开 emoji / UTF-16 代理对（每段都是合法 UTF-16 串）
 *   I4  用 speechShouldBreak 逐字流的切分结果，与 segmentSpeech 整段切分完全一致
 *
 * 关于 I1 的输入口径：生产链路上游已经裁掉整段首尾空白
 * （后端 gateSentence 只对整段第一/最后一块 strip；doAddMadelineMessage 也先 trim），
 * 所以随机输入统一 trim 首尾；被测的是「段与段之间」的字符是否原样保留。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE_PATH = path.resolve(__dirname, '..', 'js', 'madeline-core.js');

// ---------- 载入被前端当作 window 使用的内核 ----------
const sandbox = { console, Date, Math, performance: { now: () => Date.now() } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(CORE_PATH, 'utf8'), sandbox, { filename: CORE_PATH });

const M = sandbox.MadelineCore;
if (!M || typeof M.segmentSpeech !== 'function' || typeof M.speechShouldBreak !== 'function') {
    console.error('无法从 madeline-core.js 读取 segmentSpeech / speechShouldBreak');
    process.exit(2);
}
const HARD_MAX = M.SEG_HARD_MAX || 72;

// ---------- 小工具 ----------
const codePointLength = (s) => Array.from(s).length;

/** 合法 UTF-16：不出现落单的高/低代理 */
function surrogateSafe(s) {
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF) {
            if (i + 1 >= s.length) return false;
            const d = s.charCodeAt(i + 1);
            if (d < 0xDC00 || d > 0xDFFF) return false;
            i++;
        } else if (c >= 0xDC00 && c <= 0xDFFF) {
            return false;
        }
    }
    return true;
}

/** 可读转义：保留中文可读，控制字符转义；便于直接复制去复现 */
function repr(s) {
    return JSON.stringify(s);
}

/**
 * 忠实还原 diary.js 的流式切分（新口径）：
 * - 按 UTF-16 单元逐字喂 speechShouldBreak；
 * - 切点判定始终用「上一刀之后（含段间空白）」的逻辑起点，保证切点与整段切分一致；
 * - pending-break：切点确定后，先把后续空白并进前一段段尾，遇到第一个非空白字才开新段；
 *   但硬上限优先——并入后前一段超过 72 码点就不并，这段空白留在下一段段首；
 * - 整段第一块跳过前导空白，最后一块去掉尾随空白。
 */
function streamSplit(text) {
    const src = String(text == null ? '' : text);
    let start = 0;
    while (start < src.length && /\s/.test(src.charAt(start))) start++;
    let end = src.length;
    while (end > start && /\s/.test(src.charAt(end - 1))) end--;
    if (start >= end) return [src];

    const out = [];
    let displayStart = start;
    let logicalStart = start;
    let pendingBreak = false;
    let breakCut = start;
    let i = start;
    while (i < end) {
        const ch = src.charAt(i);
        const next = i + 1;
        if (pendingBreak) {
            if (/\s/.test(ch)) {
                // 硬上限优先：并入后前一段不超过 72 才并，否则这段空白留作下一段段首
                if (codePointLength(src.slice(displayStart, next)) <= HARD_MAX) {
                    i = next;
                    continue;
                }
            }
            out.push(src.slice(displayStart, i));        // 上一段收口（不含当前字）
            displayStart = i;
            logicalStart = breakCut;
            pendingBreak = false;
        }
        if (M.speechShouldBreak(src.slice(logicalStart, next))) {
            pendingBreak = true;
            breakCut = next;
        }
        i = next;
    }
    const tail = src.slice(displayStart, pendingBreak ? breakCut : end);
    if (tail) out.push(tail);
    return out.length ? out : [src];
}

// ---------- 四条不变式：返回 null 表示通过，否则返回失败说明 ----------
const INVARIANTS = [
    {
        id: 'I1',
        name: '拼接后逐字等于原文',
        check(text, segs) {
            const joined = segs.join('');
            if (joined === text) return null;
            return '拼接文本与原文不一致（原文 ' + text.length + ' 字符，拼接 ' + joined.length + ' 字符）';
        }
    },
    {
        id: 'I2',
        name: '每段不超过硬上限 ' + HARD_MAX + '（码点）',
        check(text, segs) {
            for (let i = 0; i < segs.length; i++) {
                const n = codePointLength(segs[i]);
                if (n > HARD_MAX) return '第 ' + (i + 1) + ' 段长度 ' + n + ' > ' + HARD_MAX;
            }
            return null;
        }
    },
    {
        id: 'I3',
        name: '不劈开 emoji / 代理对',
        check(text, segs) {
            for (let i = 0; i < segs.length; i++) {
                if (!surrogateSafe(segs[i])) {
                    return '第 ' + (i + 1) + ' 段含落单代理（段尾/段首被劈开）';
                }
            }
            return null;
        }
    },
    {
        id: 'I4',
        name: '流式逐字切分 == 整段切分',
        check(text, segs) {
            const stream = streamSplit(text);
            if (stream.length !== segs.length) {
                return '段数不一致：整段 ' + segs.length + '，流式 ' + stream.length;
            }
            for (let i = 0; i < segs.length; i++) {
                if (stream[i] !== segs[i]) {
                    return '第 ' + (i + 1) + ' 段不一致：整段=' + repr(segs[i]) + ' 流式=' + repr(stream[i]);
                }
            }
            return null;
        }
    }
];

// ---------- 失败样本最小化（ddmin 简化版；只在打印前跑，有长度上限） ----------
function minimize(input, fails, budget) {
    let cur = input;
    let n = 2;
    let steps = 0;
    while (cur.length > 1 && steps < budget) {
        const chunk = Math.ceil(cur.length / n);
        let reduced = false;
        for (let i = 0; i < cur.length; i += chunk) {
            const cand = cur.slice(0, i) + cur.slice(i + chunk);
            steps++;
            if (cand.length > 0 && fails(cand)) {
                cur = cand;
                n = Math.max(2, n - 1);
                reduced = true;
                break;
            }
        }
        if (!reduced) {
            if (n >= cur.length) break;
            n = Math.min(cur.length, n * 2);
        }
        if (steps >= budget) break;
    }
    // ddmin 可能停在局部极小；再做一遍逐字删除，得到更干净的复现
    let i = 0;
    while (i < cur.length && steps < budget) {
        const cand = cur.slice(0, i) + cur.slice(i + 1);
        steps++;
        if (cand.length > 0 && cand === cand.trim() && fails(cand)) {
            cur = cand;
        } else {
            i++;
        }
    }
    return cur;
}

// ---------- 随机生成器 ----------
let seed = 20261107;
function rnd() { // 固定种子，保证复现
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
}
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
function repeat(n, fn) { let s = ''; for (let i = 0; i < n; i++) s += fn(i); return s; }

const CN = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成里可主道也年着自然能下过天去知还她说好自己心东西被走听笑哭累山爬路怕慢快停想';
const CN_PUNCT = '。！？，、；：';
const EN_WORDS = ['really', 'yes', 'okay', 'I', 'you', 'think', 'so', 'but', 'maybe', 'just',
    'tired', 'today', 'again', 'sorry', 'here', 'mountain', 'climb', 'breath', 'slow', 'down',
    'up', 'wait', 'not', 'now', 'why', 'how', 'what', 'if', 'when', 'still', 'one', 'step',
    'at', 'a', 'time', 'it', 'is', 'fine', 'nothing', 'everything', 'morning', 'night', 'and'];
const EN_PUNCT = '.!?,;:';
const EMOJI = ['😀', '😭', '🌙', '❤️', '🚀', '✨', '🐱', '🍓', '⛰️', '🥲', '🫠', '🧗', '🌊', '☀️', '💙', '🎵', '🧩', '👀', '🙃', '😤'];
const URLS = [
    'https://example.com/a/b?x=1&y=2',
    'https://celeste.local/diary?id=abc',
    'http://localhost:8080/api/v1/memory/123'
];
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const BRACKETS = ['(', ')', '（', '）', '[', ']', '【', '】', '{', '}', '《', '》'];

function genChinese() {
    const len = randInt(8, 160);
    let s = '';
    for (let i = 0; i < len; i++) {
        if (rnd() < 0.18) s += pick(CN_PUNCT);
        else if (rnd() < 0.03) s += '……';
        else s += pick(CN);
    }
    return s;
}

function genEnglish() {
    const sentences = randInt(1, 6);
    const out = [];
    for (let i = 0; i < sentences; i++) {
        const words = randInt(3, 18);
        const arr = [];
        for (let j = 0; j < words; j++) arr.push(pick(EN_WORDS));
        out.push(arr.join(' ') + pick(['.', '.', '.', '!', '?', '?!', '…']));
    }
    return out.join(' ');
}

function genMixed() {
    let s = '';
    const n = randInt(3, 10);
    for (let i = 0; i < n; i++) {
        if (rnd() < 0.5) s += genChinese().slice(0, randInt(3, 20));
        else s += repeat(randInt(1, 6), () => pick(EN_WORDS) + ' ');
        if (rnd() < 0.3) s += pick(CN_PUNCT) + (rnd() < 0.5 ? ' ' : '');
        else if (rnd() < 0.3) s += ' ';
    }
    return s;
}

function genEmojiDense() {
    const n = randInt(6, 90);
    let s = '';
    for (let i = 0; i < n; i++) {
        if (rnd() < 0.72) s += pick(EMOJI);
        else if (rnd() < 0.5) s += pick(EN_WORDS);
        else s += pick(CN);
        if (rnd() < 0.25) s += ' ';
    }
    return s;
}

function genNoPunctLong() {
    const len = randInt(90, 380);
    const style = rnd();
    let s = '';
    for (let i = 0; i < len; i++) {
        if (style < 0.4) s += pick(CN);
        else if (style < 0.7) s += pick('abcdefghijklmnopqrstuvwxyz');
        else s += pick(CN + 'abcdefghijklmnopqrstuvwxyz');
    }
    return s;
}

function genUrl() {
    const n = randInt(1, 3);
    let s = '';
    for (let i = 0; i < n; i++) {
        s += pick(['看看这个：', '你看 ', 'remember this? ']) + pick(URLS);
        s += pick([' 你觉得呢？', '，好像有点意思。', ' and then what? ', '\n']);
    }
    return s;
}

function genFullwidthPunct() {
    const n = randInt(20, 120);
    return repeat(n, () => pick(['！', '？', '。', '，', '；', '：', '、', '……']));
}

function genUnclosedBrackets() {
    let s = '';
    const n = randInt(4, 20);
    for (let i = 0; i < n; i++) {
        s += pick(BRACKETS);
        s += pick(['内容', 'word', ' 。', ' ']);
        if (rnd() < 0.4) s += pick(CN + 'abcdefghijklmnopqrstuvwxyz');
    }
    return s;
}

function genEllipsis() {
    const n = randInt(8, 40);
    let s = '';
    for (let i = 0; i < n; i++) {
        s += pick(['……', '...', '…', '。……', ' ']);
        if (rnd() < 0.5) s += pick(CN + 'abc ');
    }
    return s;
}

function genBase64() {
    return repeat(randInt(90, 400), () => pick(BASE64));
}

function genNewlineMix() {
    const n = randInt(3, 12);
    let s = '';
    for (let i = 0; i < n; i++) {
        s += (rnd() < 0.5 ? genChinese().slice(0, randInt(4, 30)) : genEnglish().slice(0, randInt(6, 60)));
        if (rnd() < 0.5) s += '\n';
        else if (rnd() < 0.5) s += '\r\n';
        else s += ' ';
    }
    return s;
}

const GENERATORS = [
    ['纯中文', genChinese],
    ['纯英文', genEnglish],
    ['中英混排', genMixed],
    ['emoji 密集', genEmojiDense],
    ['零标点超长', genNoPunctLong],
    ['含 URL', genUrl],
    ['全角标点连打', genFullwidthPunct],
    ['未闭合括号', genUnclosedBrackets],
    ['省略号', genEllipsis],
    ['超长无空格英文(base64)', genBase64],
    ['换行混排', genNewlineMix]
];

// ---------- 固定样本（真实/文档里的长回复） ----------
// 仓库内没有落库的真实对话记录（diary_chat_log 只在运行时数据库里）；
// 这里用 docs/diary-prompts.md 的示例句拼成整段回复，另取 lore 的英文叙事故落做长英文样本。
const FIXED_SAMPLES = [
    { name: 'really-yes', source: '本次 gateSentence 用例', text: 'Really? Yes.' },
    { name: 'en-mixed-punct', source: '英文 ! / ? 混排', text: 'Are you sure? Yes! I think so... Really? Okay.' },
    { name: 'en-long-prose', source: 'lore/characters/Madeline.md 叙事故落', text: "Madeline is the protagonist of Celeste, and is the character whom the player controls in nearly all instances. She is a Canadian trans woman who struggles with mental illnesses, depicted multiple times throughout her ascension of Celeste Mountain." },
    { name: 'cn-long-weekly', source: 'docs/diary-prompts.md:896-899 示例句拼合', text: '你这周很累。是真的累。撑到现在，手会抖的。你这周起起落落，变得很快。一会儿好一点，一会儿又不行。就是这样的。你写下的那些话，我都看见了。有些想法会反复出现。不是只有你。' },
    { name: 'cn-long-soft', source: 'docs/diary-prompts.md:897-902 示例句拼合', text: '难得的几天，你松了口气。可以多松一会儿。你这周一直在撑，撑得很辛苦。这不是你的问题。你这周每次躺下都觉得明天就好了，但每天醒来还是一样。' },
    { name: 'cn-ellipsis', source: 'docs/diary-prompts.md:622 + 口语扩写', text: '我……不，等等。这不对。嗯。让我想想。也许我该先深呼吸，再试着把这件事说清楚。' },
    { name: 'mixed-url', source: '中英混排 + URL', text: '今天爬到山顶的时候我想，maybe it’s okay to be tired. 你看 https://example.com/celeste 这里的记录，像不像我们上次说的那样？' }
];

// ---------- 主流程 ----------
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const countArg = args.find((a) => /^\d+$/.test(a));
const CASE_COUNT = countArg ? parseInt(countArg, 10) : 5000;

const perInvariantFail = {};
INVARIANTS.forEach((inv) => { perInvariantFail[inv.id] = { count: 0, shown: 0, samples: [] }; });

let passCount = 0;
let failCount = 0;
const startedAt = Date.now();

function evaluate(text) {
    const segs = M.segmentSpeech(text);
    const failed = [];
    for (const inv of INVARIANTS) {
        const msg = inv.check(text, segs);
        if (msg) failed.push({ inv, msg });
    }
    return { segs, failed };
}

function recordFailure(text, fails) {
    for (const f of fails) {
        const slot = perInvariantFail[f.inv.id];
        slot.count++;
        if (slot.shown < 3 || verbose) {
            // 最小化：保留同一不变式仍然失败的最短输入；要求首尾无空白，
            // 避免把「整段首尾空白被 trim」这种已知口径外的原因当成最小复现
            const pred = (candidate) => candidate === candidate.trim()
                && f.inv.check(candidate, M.segmentSpeech(candidate)) !== null;
            const minimal = minimize(text, pred, Math.min(30000, Math.max(5000, text.length * 50)));
            slot.samples.push({ text, minimal, msg: f.msg, inv: f.inv, segs: M.segmentSpeech(text) });
            slot.shown++;
        }
    }
}

for (let i = 0; i < CASE_COUNT; i++) {
    const [genName, gen] = GENERATORS[i % GENERATORS.length];
    let text = String(gen() == null ? '' : gen());
    // 生产链路上游已裁整段首尾空白；这里对齐同一口径，专测段间保留
    text = text.trim();
    if (!text) text = 'x';

    const { failed } = evaluate(text);
    if (failed.length === 0) {
        passCount++;
    } else {
        failCount++;
        recordFailure(text, failed);
        if (verbose) {
            console.log('\n[FAIL ' + genName + '] ' + repr(text));
            failed.forEach((f) => console.log('  ' + f.inv.id + ' ' + f.inv.name + ' → ' + f.msg));
        }
    }
}

// 固定样本同样计入总数（打印时再列明细）
const fixedResults = [];
for (const sample of FIXED_SAMPLES) {
    const { segs, failed } = evaluate(sample.text);
    fixedResults.push({ sample, segs, failed });
    if (failed.length === 0) {
        passCount++;
    } else {
        failCount++;
        recordFailure(sample.text, failed);
    }
}

const elapsed = Date.now() - startedAt;

// ---------- 报告 ----------
console.log('=== MadelineCore 分段不变式测试 ===');
console.log('内核: ' + CORE_PATH);
console.log('随机组数: ' + CASE_COUNT + '（固定种子，可复现）');
console.log('固定样本: ' + FIXED_SAMPLES.length);
console.log('总组数: ' + (CASE_COUNT + FIXED_SAMPLES.length));
console.log('通过: ' + passCount + '   失败: ' + failCount);
console.log('耗时: ' + elapsed + ' ms');
console.log('\n不变式统计:');
for (const inv of INVARIANTS) {
    const s = perInvariantFail[inv.id];
    console.log('  ' + inv.id + ' ' + inv.name + ': 失败 ' + s.count + ' 组');
}

const hasRandomFailure = Object.values(perInvariantFail).some((s) => s.count > 0);

// 固定样本单列
console.log('\n固定样本结果:');
let fixedFail = 0;
for (const { sample, segs, failed } of fixedResults) {
    if (failed.length === 0) {
        console.log('  PASS  ' + sample.name + '  (' + sample.source + ')  段数=' + segs.length);
    } else {
        fixedFail++;
        console.log('  FAIL  ' + sample.name + '  (' + sample.source + ')');
        console.log('        原文: ' + repr(sample.text));
        console.log('        分段: ' + JSON.stringify(segs));
        failed.forEach((f) => console.log('        ' + f.inv.id + ' ' + f.inv.name + ' → ' + f.msg));
    }
}

// 失败明细（每个不变式最多 3 条，--verbose 时全部）
if (hasRandomFailure) {
    console.log('\n失败明细（可直接复制复现）:');
    for (const inv of INVARIANTS) {
        const slot = perInvariantFail[inv.id];
        if (slot.count === 0) continue;
        console.log('\n  [' + inv.id + '] ' + inv.name + '  共 ' + slot.count + ' 组失败');
        slot.samples.forEach((smp, idx) => {
            console.log('   #' + (idx + 1) + ' 原因: ' + smp.msg);
            console.log('       原始输入: ' + repr(smp.text));
            console.log('       最小复现: ' + repr(smp.minimal) + '   (长度 ' + smp.text.length + ' → ' + smp.minimal.length + ')');
        });
        if (slot.count > slot.shown) console.log('   …其余 ' + (slot.count - slot.shown) + ' 组省略（--verbose 可全打印）');
    }
}

const anyFailure = hasRandomFailure || fixedFail > 0;
console.log('\n结果: ' + (anyFailure ? 'FAIL' : 'PASS'));
process.exit(anyFailure ? 1 : 0);
