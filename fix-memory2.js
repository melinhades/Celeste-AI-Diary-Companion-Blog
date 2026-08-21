const fs = require('fs');
const p = 'C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(c, m) { if (!c) { console.log('[FAIL] ' + m); process.exit(1); } }

const a1 = `        try {
            const res = await api('/memory/list', 'GET');
            if (res.success && Array.isArray(res.data)) memCache = res.data;
        } catch (e) { }`;
must(s.includes(a1), 'shelfLoadMemories 锚点');
s = s.replace(a1, `        try {
            const res = await api('/memory/list', 'GET');
            memCache = (res.success && Array.isArray(res.data)) ? res.data : [];
        } catch (e) { memCache = []; }`);

const open = (s.match(/\{/g) || []).length, close = (s.match(/\}/g) || []).length;
console.log('大括号: { = ' + open + ', } = ' + close + (open === close ? ' 平衡' : ' 不平衡!'));
must(open === close, '大括号不平衡，放弃写入');
fs.writeFileSync(p, s, 'utf8');
console.log('写入成功：记忆拉取失败兜底已修复');