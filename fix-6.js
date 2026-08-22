const fs = require('fs');
const p = 'C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

if (s.includes('pmComfort')) { console.log('低落安慰已加过，跳过'); process.exit(0); }
function must(c, m) { if (!c) { console.log('[FAIL] ' + m); process.exit(1); } }

const a1 = `                companionState.currentEmotion = userEmotion;
                companionState.previousEmotion = userEmotion;`;
must((s.split(a1).length - 1) === 1, 'AI分析钩子锚点');
s = s.replace(a1, a1 + `
                if (userEmotion === '不开心') pmComfort();`);

const a2 = '    const dreamLines = [';
must(s.includes(a2), 'dreamLines 锚点');
const block = `    let lastComfortAt = 0;
    function pmComfort() {
        if (performance.now() - lastComfortAt < 10 * 60 * 1000) return;
        lastComfortAt = performance.now();
        const bk = document.getElementById('journalBook');
        const rect = bk ? bk.getBoundingClientRect() : null;
        const gy = pmGroundY();
        const maxX = window.innerWidth - pm.offsetWidth - 8;
        let px = Math.max(8, window.innerWidth * 0.12);
        if (rect) {
            const rightX = rect.right + 18;
            const leftX = rect.left - pm.offsetWidth - 18;
            if (rightX + pm.offsetWidth <= maxX && !blockedAt(rightX, gy)) px = rightX;
            else if (leftX >= 4 && !blockedAt(leftX, gy)) px = leftX;
        }
        pmState.mode = 'peek';
        pmState.targetX = px;
        pmState.targetY = gy;
        pmSetSrc(PM_SRC.move);
    }

`;
s = s.replace(a2, block + a2);

const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
console.log('大括号: { = ' + open + ', } = ' + close + (open === close ? ' 平衡' : ' 不平衡!'));
must(open === close, '大括号不平衡，放弃写入');
fs.writeFileSync(p, s, 'utf8');
console.log('写入成功：低落主动安慰已就位');