const fs = require('fs');
const jsP = 'C:/Users/28464/IdeaProjects/blog/blog-ui/js/diary.js';
const cssP = 'C:/Users/28464/IdeaProjects/blog/blog-ui/css/diary.css';

let js = fs.readFileSync(jsP, 'utf8').replace(/\r\n/g, '\n');
let css = fs.readFileSync(cssP, 'utf8');

if (js.includes('tunePanel')) { console.log('面板已存在，跳过'); process.exit(0); }

const startMark = `    // ===== 调框模式：Ctrl+Shift+T 开关 =====`;
const endMark = `\n    function bookGoto(idx) {`;
const si = js.indexOf(startMark);
const ei = js.indexOf(endMark, si);
if (si === -1 || ei === -1) { console.log('[FAIL] 找不到旧调框代码边界: si=' + si + ' ei=' + ei); process.exit(1); }

const newBlock = `    // ===== 调框模式（可视化面板：左下角按钮开关） =====
    const tuneStore = JSON.parse(localStorage.getItem('jbookTune') || '{}');
    document.querySelectorAll('#journalBook [data-tk]').forEach(n => {
        const t = tuneStore[n.dataset.tk];
        if (!t) return;
        if (t.l !== undefined) n.style.left = t.l + '%';
        if (t.t !== undefined) n.style.top = t.t + '%';
        if (t.w !== undefined) n.style.width = t.w + '%';
        if (t.h !== undefined) n.style.height = t.h + '%';
    });
    let tuneSel = null;

    const tuneBtn = document.createElement('button');
    tuneBtn.id = 'tuneToggle';
    tuneBtn.textContent = '🔧 调框';
    document.body.appendChild(tuneBtn);

    const tunePanel = document.createElement('div');
    tunePanel.id = 'tunePanel';
    tunePanel.innerHTML =
        '<div class="tp-title">点选一个文本框，再用下面按钮微调</div>' +
        '<div class="tp-row"><button data-act="left">◀ 左</button><button data-act="up">▲ 上</button><button data-act="down">▼ 下</button><button data-act="right">▶ 右</button></div>' +
        '<div class="tp-row"><button data-act="wMinus">宽 −</button><button data-act="wPlus">宽 ＋</button><button data-act="hMinus">高 −</button><button data-act="hPlus">高 ＋</button></div>' +
        '<div class="tp-row"><button data-act="resetOne">重置此框</button><button data-act="resetAll">全部重置</button><button data-act="done">完成</button></div>' +
        '<div class="tp-tip">按住按钮可连续移动 · 自动保存</div>';
    document.body.appendChild(tunePanel);

    function tuneSave(n) {
        tuneStore[n.dataset.tk] = {
            l: +parseFloat(n.style.left).toFixed(2),
            t: +parseFloat(n.style.top).toFixed(2),
            w: +parseFloat(n.style.width).toFixed(2),
            h: +parseFloat(n.style.height).toFixed(2)
        };
        localStorage.setItem('jbookTune', JSON.stringify(tuneStore));
    }
    function tuneApply(act) {
        if (!tuneSel) return;
        const step = 0.1, s = tuneSel.style;
        if (act === 'left') s.left = (parseFloat(s.left) - step) + '%';
        else if (act === 'right') s.left = (parseFloat(s.left) + step) + '%';
        else if (act === 'up') s.top = (parseFloat(s.top) - step) + '%';
        else if (act === 'down') s.top = (parseFloat(s.top) + step) + '%';
        else if (act === 'wMinus') s.width = (parseFloat(s.width) - step) + '%';
        else if (act === 'wPlus') s.width = (parseFloat(s.width) + step) + '%';
        else if (act === 'hMinus') s.height = (parseFloat(s.height) - step) + '%';
        else if (act === 'hPlus') s.height = (parseFloat(s.height) + step) + '%';
        else if (act === 'resetOne') { delete tuneStore[tuneSel.dataset.tk]; localStorage.setItem('jbookTune', JSON.stringify(tuneStore)); location.reload(); return; }
        else if (act === 'resetAll') { localStorage.removeItem('jbookTune'); location.reload(); return; }
        else if (act === 'done') { tuneBtn.click(); return; }
        else return;
        tuneSave(tuneSel);
    }
    tuneBtn.addEventListener('click', () => {
        document.body.classList.toggle('tune-mode');
        const on = document.body.classList.contains('tune-mode');
        tunePanel.style.display = on ? 'block' : 'none';
        tuneBtn.textContent = on ? '❌ 退出调框' : '🔧 调框';
        if (!on && tuneSel) { tuneSel.classList.remove('tune-sel'); tuneSel = null; }
    });
    tunePanel.querySelectorAll('button').forEach(b => {
        let timer = null;
        b.addEventListener('mousedown', ev => {
            ev.preventDefault();
            tuneApply(b.dataset.act);
            timer = setInterval(() => tuneApply(b.dataset.act), 180);
        });
        b.addEventListener('mouseup', () => clearInterval(timer));
        b.addEventListener('mouseleave', () => clearInterval(timer));
    });
    bookEl.addEventListener('mousedown', ev => {
        if (!document.body.classList.contains('tune-mode')) return;
        const n = ev.target.closest('[data-tk]');
        if (!n) return;
        ev.preventDefault(); ev.stopPropagation();
        if (tuneSel) tuneSel.classList.remove('tune-sel');
        tuneSel = n;
        n.classList.add('tune-sel');
        if (n.blur) n.blur();
    }, true);
`;

js = js.slice(0, si) + newBlock + js.slice(ei);

const open = (js.match(/\{/g) || []).length;
const close = (js.match(/\}/g) || []).length;
console.log('大括号检查: { = ' + open + ', } = ' + close + (open === close ? ' 平衡' : ' 不平衡!'));
if (open !== close) { console.log('未写入'); process.exit(1); }
fs.writeFileSync(jsP, js, 'utf8');

if (!css.includes('#tuneToggle')) {
    css += `\n/* ===== 调框面板 ===== */
#tuneToggle { position:fixed; left:16px; bottom:16px; z-index:960; padding:8px 14px; background:rgba(22,34,60,.9); color:var(--c-yellow); border:2px solid var(--c-yellow); border-radius:6px; cursor:pointer; font-size:13px; box-shadow:0 0 8px rgba(255,230,109,.35); }
#tunePanel { display:none; position:fixed; left:16px; bottom:66px; z-index:960; width:250px; background:rgba(15,23,42,.95); border:2px solid var(--c-yellow); border-radius:8px; padding:10px; }
#tunePanel .tp-title { color:#ffe36d; font-size:12px; margin-bottom:8px; line-height:1.5; }
#tunePanel .tp-row { display:flex; gap:6px; margin-bottom:6px; }
#tunePanel button { flex:1; padding:7px 0; background:rgba(22,34,60,.9); color:#fff; border:1px solid var(--c-yellow); border-radius:4px; cursor:pointer; font-size:12px; }
#tunePanel button:hover { background:rgba(255,227,109,.25); }
#tunePanel .tp-tip { color:rgba(255,255,255,.5); font-size:11px; text-align:center; }
`;
    fs.writeFileSync(cssP, css, 'utf8');
}
console.log('写入成功：调框面板已就位');