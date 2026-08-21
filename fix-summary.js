const fs = require('fs');
const p = 'C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

if (s.includes('pmSummarize')) { console.log('已接过总结，跳过'); process.exit(0); }

const cs = s.indexOf('    function pmCelebrate() {');
const ce = s.indexOf('\n\n    function pmNextMode');
if (cs === -1 || ce === -1) { console.log('[FAIL] 找不到 pmCelebrate 边界: cs=' + cs + ' ce=' + ce); process.exit(1); }

const newCelebrate = `    function pmCelebrate() {
        const gy = pmGroundY();
        const acts = document.querySelector('.diary-actions');
        const rect = acts ? acts.getBoundingClientRect() : null;
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        let tx;
        if (rect) {
            const cands = [
                rect.left - pm.offsetWidth - 18,
                rect.right + 18,
                rect.left + rect.width / 2 - pm.offsetWidth / 2
            ];
            tx = cands.find(v => v >= 4 && v <= maxX && !blockedAt(v, gy));
        }
        if (tx === undefined) {
            for (let v = 4; v <= maxX; v += 24) {
                if (!blockedAt(v, gy)) { tx = v; break; }
            }
        }
        if (tx === undefined) return;
        pmState.mode = 'celebrate';
        pmState.targetX = tx;
        pmState.targetY = gy;
        pmState.modeUntil = performance.now() + 12000;
        pmSetSrc(PM_SRC.move);
    }

    async function pmSummarize() {
        const content = contentInput.value.trim();
        if (!content) return;
        try {
            const data = await request('/diary/summary', { title: titleInput.value.trim(), content: content });
            if (data && data.message) addMadelineMessage(data.message, data.emotion || '默认');
        } catch (e) { }
    }
`;
s = s.slice(0, cs) + newCelebrate + s.slice(ce);

if ((s.match(/pmCelebrate\(\);/g) || []).length !== 1) { console.log('[FAIL] 调用点数量异常'); process.exit(1); }
s = s.replace('                pmCelebrate();', '                pmCelebrate();\n                pmSummarize();');

const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
console.log('大括号: { = ' + open + ', } = ' + close + (open === close ? ' 平衡' : ' 不平衡!'));
if (open !== close) { console.log('未写入'); process.exit(1); }
fs.writeFileSync(p, s, 'utf8');
console.log('写入成功');