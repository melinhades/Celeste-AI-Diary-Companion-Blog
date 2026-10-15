// ================= AI 生成文章：跑步指针 + 采纳/拒绝 + Fall 回退 =================
(function () {
    const style = document.createElement('style');
    style.textContent =
        '#genRunner{position:fixed;z-index:2100;width:52px;height:52px;image-rendering:pixelated;pointer-events:none;display:none;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));transform:translate(-50%,-96%);}' +
        '#genWaitOverlay{position:fixed;right:28px;bottom:28px;z-index:2099;display:none;flex-direction:column;align-items:center;gap:6px;pointer-events:none;}' +
                '#genWaitOverlay.show{display:flex;}' +
        '.gen-wait-anim{width:84px;height:84px;background-size:contain;background-repeat:no-repeat;background-position:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));}' +
        '.gen-wait-text{color:#ffe36d;font-size:14px;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8);}' +
        '#genFallLayer{position:fixed;inset:0;z-index:2050;display:none;pointer-events:none;}' +
        '#genFallLayer.show{display:block;}' +
        '#genFallSprite{position:absolute;width:64px;height:64px;image-rendering:pixelated;animation:genFallMove 1.6s ease-in forwards;}' +
        '@keyframes genFallMove{0%{transform:translateY(0) rotate(0deg);opacity:1;}100%{transform:translateY(68vh) rotate(-60deg);opacity:.15;}}' +
        '#genDecision{position:fixed;inset:0;background:rgba(5,5,20,.9);z-index:2100;display:none;align-items:center;justify-content:center;}' +
        '#genDecision.show{display:flex;}' +
        '.gd-box{background:rgba(22,34,60,.96);border:2px solid #ffe36d;border-radius:10px;padding:28px 36px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.6);}' +
        '.gd-box h3{color:#ffe36d;font-size:16px;margin-bottom:8px;}' +
        '.gd-box p{color:#aab8d0;font-size:13px;margin-bottom:20px;}' +
        '.gd-actions{display:flex;gap:14px;justify-content:center;}' +
        '.gd-actions button{padding:10px 26px;border-radius:6px;cursor:pointer;font-size:13px;border:2px solid #ffe36d;background:rgba(22,34,60,.9);color:#ffe36d;transition:background .2s;}' +
        '.gd-actions button:hover{background:rgba(255,227,109,.2);}' +
        '.gd-actions .gd-reject{border-color:#888;color:#aaa;}';
    document.head.appendChild(style);

    const runner = new Image();
    runner.id = 'genRunner';
    document.body.appendChild(runner);

    const fallLayer = document.createElement('div');
    fallLayer.id = 'genFallLayer';
    fallLayer.innerHTML = '<img id="genFallSprite" alt="" loading="lazy" decoding="async">';
    document.body.appendChild(fallLayer);

    const decision = document.createElement('div');
    decision.id = 'genDecision';
    decision.innerHTML =
        '<div class="gd-box">' +
        '<h3>Madeline 跑完了！</h3>' +
        '<p>草稿已写进正文，看一眼再决定～</p>' +
        '<div class="gd-actions">' +
        '<button id="gdAccept">✅ 采纳草稿</button>' +
        '<button id="gdReject" class="gd-reject">❌ 拒绝并回退</button>' +
        '</div></div>';
    document.body.appendChild(decision);

    const waitOverlay = document.createElement('div');
    waitOverlay.id = 'genWaitOverlay';
    waitOverlay.innerHTML = '<div class="gen-wait-anim"></div><div class="gen-wait-text">Loading<span class="loading-dots"></span></div>';
    document.body.appendChild(waitOverlay);

    const RUN_FRAMES = [];
    for (let i = 0; i < 9; i++) RUN_FRAMES.push('celeste-player/marker/runBackpack' + String(i).padStart(5, '0') + '.png');
    const FALL_FRAMES = ['celeste-player/marker/Fall0000.png', 'celeste-player/marker/Fall0001.png'];
    RUN_FRAMES.concat(FALL_FRAMES).forEach(s => { const im = new Image(); im.src = s; });

    const WAIT_FRAMES = [];
    for (let i = 0; i < 10; i++) WAIT_FRAMES.push('celeste-gui/loading/' + String(i).padStart(2, '0') + '.png');
    WAIT_FRAMES.forEach(s => { const im = new Image(); im.src = s; });
    let waitTimer = null;
    function waitShow() {
        waitOverlay.classList.add('show');
        const el = waitOverlay.querySelector('.gen-wait-anim');
        let i = 0;
        el.style.backgroundImage = 'url("' + WAIT_FRAMES[0] + '")';
        if (waitTimer) clearInterval(waitTimer);
        waitTimer = setInterval(() => { i = (i + 1) % WAIT_FRAMES.length; el.style.backgroundImage = 'url("' + WAIT_FRAMES[i] + '")'; }, 90);
    }
    function waitHide() {
        if (waitTimer) { clearInterval(waitTimer); waitTimer = null; }
        waitOverlay.classList.remove('show');
    }

    // mirror 镜像法：算 textarea 光标处的像素坐标
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;word-wrap:break-word;';
    document.body.appendChild(mirror);
    function caretXY(el) {
        const cs = window.getComputedStyle(el);
        ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing'].forEach(p => { mirror.style[p] = cs[p]; });
        mirror.style.width = el.clientWidth + 'px';
        mirror.textContent = el.value;
        const marker = document.createElement('span');
        marker.textContent = '\u200b';
        mirror.appendChild(marker);
        const r = el.getBoundingClientRect();
        return {
            x: r.left + marker.offsetLeft - el.scrollLeft,
            y: r.top + marker.offsetTop - el.scrollTop
        };
    }

    let runTimer = null, fallTimer = null, fallHideTimer = null;
    function startRun() {
        runner.style.display = 'block';
        let i = 0;
        runner.src = RUN_FRAMES[0];
        if (runTimer) clearInterval(runTimer);
        runTimer = setInterval(() => { i = (i + 1) % RUN_FRAMES.length; runner.src = RUN_FRAMES[i]; }, 90);
    }
    function stopRun() {
        if (runTimer) { clearInterval(runTimer); runTimer = null; }
        runner.style.display = 'none';
    }
    function moveRunner(el) {
        const p = caretXY(el);
        runner.style.left = p.x + 'px';
        runner.style.top = (p.y + 4) + 'px';
    }
    function playFall(x, y) {
        const sprite = document.getElementById('genFallSprite');
        sprite.style.left = Math.max(10, Math.min(window.innerWidth - 80, x - 32)) + 'px';
        sprite.style.top = Math.max(10, Math.min(window.innerHeight - 80, y - 32)) + 'px';
        sprite.style.animation = 'none';
        void sprite.offsetWidth;
        sprite.style.animation = '';
        fallLayer.classList.add('show');
        let i = 0;
        sprite.src = FALL_FRAMES[0];
        if (fallTimer) clearInterval(fallTimer);
        fallTimer = setInterval(() => { i = (i + 1) % FALL_FRAMES.length; sprite.src = FALL_FRAMES[i]; }, 200);
        // 重复触发时先清掉上一次的隐藏定时器，避免旧定时器把本次动画提前砍掉
        if (fallHideTimer) { clearTimeout(fallHideTimer); fallHideTimer = null; }
        fallHideTimer = setTimeout(() => {
            fallLayer.classList.remove('show');
            if (fallTimer) { clearInterval(fallTimer); fallTimer = null; }
            fallHideTimer = null;
        }, 1700);
    }

    let genBefore = '';
    async function doGenerate() {
        const titleEl = document.getElementById('articleTitle');
        const title = titleEl.value.trim();
        const summary = (document.getElementById('summaryInput').value || '').trim();
        if (!title && !summary) { if (typeof showToast === 'function') showToast('先写个标题或摘要，告诉我你想写什么', 'error'); return; }

        const btn = document.getElementById('toolbarGenBtn');
        if (btn) btn.disabled = true;
        const bodyEl = document.getElementById('articleBody');
        genBefore = bodyEl.value;

        // 文章信息块：标题与可选摘要分别拼接；无标题时让模型自拟
        const articleInfo = [
            title ? '标题：' + title : '标题：未指定，请根据内容自拟一个具体、克制、不标题党的标题',
            summary ? '写作要点（供取材参考，可取舍，不必逐条覆盖）：' + summary : ''
        ].filter(Boolean).join('\n');

        // 富提示词：中性资深博主（无 Madeline/Celeste 人设），场景开场 + 长短句节奏 + 范文只校语气
        const prompt = [
            '你是一位资深中文博客作者，文风朴实、克制、具体。请根据下面的文章信息写一篇原创中文 Markdown 博客。',
            '你不是任何角色，不要角色扮演、不要自称、不要寒暄。',
            '',
            '【文章信息】',
            articleInfo,
            '',
            '【写作要求】',
            '1. 正文 800-1200 个汉字，分 3-5 个自然段；',
            '2. 第一段用一个具体场景切入：一个动作、一个画面或一个真实瞬间，让读者立刻「看见」。禁止「在当今社会」「随着……的发展」「众所周知」这类宏大空泛的开头；',
            '3. 句子长短交错：长句铺陈细节，短句收住重点；避免连续几句长度接近、结构雷同；',
            '4. 观点要有具体的人、事、细节承接，少下抽象判断；段落靠内容自然推进，不堆连接词；',
            '5. 结尾干净收束，不喊口号、不强行升华、不写「让我们一起……」；',
            '6. 技术、干货类题目按题目本身取材写清楚即可，不要硬加文学描写。',
            '',
            '【严格禁止】',
            '- AI 腔套话：「在这个快节奏的时代」「综上所述」「总而言之」「值得注意的是」「不仅……而且」式排比，以及「赋能」「抓手」「闭环」之类八股词；',
            '- emoji、表情符号、网络烂梗；',
            '- 与题目无关的爬山、登山、山峰、攀岩或电子游戏类比喻和意象——题目没写山，就不要出现山；',
            '- 编造数据、人名、引言和事实；',
            '- 任何解释、开场白、「以下是文章」之类的前缀或后缀，不要用代码块包裹全文。',
            '',
            '【语气参考】（只校准「具体开场、长短句节奏、克制收尾」；严禁照搬其中的场景、句子、人物和意象，你的文章必须围绕上面的题目取材）',
            '雨是晚上九点多下起来的。',
            '',
            '我钻进楼下便利店时，裤脚已经湿了半截。收银台前排着两个人，谁都没说话，只有关东煮的锅在咕嘟响。店员扫码、装袋、说欢迎光临，动作快得像设定好的程序。前面那个男人买了一瓶啤酒和一包烟，掏出手机才发现没电，愣了两秒，又把东西一样样放了回去。',
            '',
            '雨没有停的意思。我买完单出来，他正蹲在屋檐下点烟，火苗被风吹灭了两次。大多数人的窘迫都发生在没人认识自己的地方，第二天照常起床、挤地铁、对同事说早。',
            '',
            '【输出格式】直接输出 Markdown：第一行必须是「# 文章标题」（给了标题就原样使用），第二行起是正文。除文章本身外什么都不要写。'
        ].join('\n');

        let ok = false, text = '';
        waitShow();
        try {
            const res = await api('/chat/generate-article', 'POST', { content: prompt });
            if (res.success && res.data && res.data.content) { ok = true; text = res.data.content; }
        } catch (e) { }
        if (btn) btn.disabled = false;
        waitHide();

        const refused = ok && /抱歉|无法|我不能|对不起|sorry|cannot|can't/i.test(text.slice(0, 60));
        if (!ok || refused) {
            playFall(window.innerWidth / 2, window.innerHeight * 0.25);
            if (typeof showToast === 'function') showToast(refused ? 'Madeline 拒绝了这次生成…' : '生成被拒绝，等下再试试', 'error');
            return;
        }

        const lines = text.split('\n');
        if (!title && lines[0] && lines[0].startsWith('#')) {
            titleEl.value = lines[0].replace(/^#+\s*/, '');
            titleEl.dispatchEvent(new Event('input'));
            text = lines.slice(1).join('\n').replace(/^\s*\n/, '');
        }

        if (bodyEl.value && !bodyEl.value.endsWith('\n')) bodyEl.value += '\n\n';
        startRun();
        moveRunner(bodyEl);
        const chars = [...text];
        let ci = 0;
        while (ci < chars.length) {
            bodyEl.value += chars.slice(ci, ci + 3).join('');
            ci += 3;
            bodyEl.scrollTop = bodyEl.scrollHeight;
            moveRunner(bodyEl);
            if (typeof updateCount === 'function') updateCount();
            await new Promise(r => setTimeout(r, 42));
        }
        stopRun();
        decision.classList.add('show');
    }

    document.getElementById('gdAccept').addEventListener('click', () => {
        decision.classList.remove('show');
        if (typeof showToast === 'function') showToast('草稿已采纳！', 'success');
    });
    document.getElementById('gdReject').addEventListener('click', () => {
        decision.classList.remove('show');
        const bodyEl = document.getElementById('articleBody');
        const p = caretXY(bodyEl);
        bodyEl.value = genBefore;
        if (typeof updateCount === 'function') updateCount();
        playFall(p.x, p.y);
    });

    const genBtn = document.getElementById('toolbarGenBtn');
    if (genBtn) genBtn.addEventListener('click', doGenerate);
})();
