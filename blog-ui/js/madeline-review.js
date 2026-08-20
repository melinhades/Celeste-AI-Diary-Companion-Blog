// ================================================================
// ===== Madeline 写作助手（write.html 专用）=====
// 浮动 Madeline + 一键审稿，复用 /chat 端点
// ================================================================
(function () {
    const AVATAR = 'celeste-portraits/madeline/normal00.png';
    let panel, messages, input;
    let open = false;

    function build() {
        const btn = document.createElement('div');
        btn.id = 'mr-float';
        btn.innerHTML = '<img src="' + AVATAR + '" alt="Madeline">';
        btn.title = '找 Madeline 审稿';

        panel = document.createElement('div');
        panel.id = 'mr-panel';
        panel.innerHTML =
            '<div class="mr-header">' +
            '  <img src="' + AVATAR + '" alt="">' +
            '  <span>Madeline · 写作助手</span>' +
            '  <button id="mrClose">✕</button>' +
            '</div>' +
            '<div class="mr-messages" id="mrMessages"></div>' +
            '<div class="mr-actions">' +
            '  <button id="mrReviewBtn">✨ 一键审稿</button>' +
            '</div>' +
            '<div class="mr-input-row">' +
            '  <input id="mrInput" type="text" placeholder="也可以直接问我...">' +
            '  <button id="mrSend">发送</button>' +
            '</div>';

        const style = document.createElement('style');
        style.textContent =
            '#mr-float{position:fixed;right:24px;bottom:24px;width:56px;height:56px;border-radius:50%;border:2px solid #ffe36d;background:#16223c;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1100;box-shadow:0 0 12px rgba(255,227,109,.4);transition:transform .2s;}' +
            '#mr-float:hover{transform:scale(1.1);}' +
            '#mr-float img{width:48px;height:48px;border-radius:50%;object-fit:cover;}' +
            '#mr-panel{position:fixed;right:24px;bottom:90px;width:340px;height:420px;background:#16223c;border:2px solid #ffe36d;border-radius:10px;z-index:1100;display:none;flex-direction:column;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.5);}' +
            '#mr-panel.show{display:flex;}' +
            '.mr-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:2px solid #ffe36d;background:#1c2a4a;color:#ffe36d;font-size:13px;font-family:"Courier New",monospace;}' +
            '.mr-header img{width:28px;height:28px;border-radius:50%;border:1px solid #ffe36d;}' +
            '.mr-header span{flex:1;}' +
            '#mrClose{border:none;background:transparent;color:#8899bb;font-size:16px;cursor:pointer;}' +
            '#mrClose:hover{color:#fff;}' +
            '.mr-messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}' +
            '.mr-msg{padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.6;word-break:break-word;max-width:92%;white-space:pre-wrap;}' +
            '.mr-msg.m{background:#fff;color:#222;border:1px solid #ffe36d;align-self:flex-start;border-bottom-left-radius:3px;}' +
            '.mr-msg.u{background:#2e7d6b;color:#fff;align-self:flex-end;border-bottom-right-radius:3px;}' +
            '.mr-actions{padding:8px 12px 0;}' +
            '#mrReviewBtn{width:100%;padding:8px;background:transparent;border:1px dashed #ffe36d;color:#ffe36d;border-radius:6px;cursor:pointer;font-size:12px;font-family:"Courier New",monospace;}' +
            '#mrReviewBtn:hover{background:rgba(255,227,109,.12);}' +
            '#mrReviewBtn:disabled{opacity:.5;cursor:not-allowed;}' +
            '.mr-input-row{display:flex;gap:8px;padding:10px 12px;}' +
            '.mr-input-row input{flex:1;padding:8px 10px;border:1px solid #ffe36d;border-radius:6px;background:#0f1830;color:#e8e8f0;outline:none;font-size:13px;}' +
            '#mrSend{padding:8px 14px;border:none;border-radius:6px;background:#ffe36d;color:#111;cursor:pointer;font-size:12px;font-weight:bold;}' +
            '#mrSend:disabled{background:#555;color:#999;}';

        document.body.appendChild(style);
        document.body.appendChild(btn);
        document.body.appendChild(panel);

        messages = document.getElementById('mrMessages');
        input = document.getElementById('mrInput');

        btn.addEventListener('click', () => {
            open = !open;
            panel.classList.toggle('show', open);
            if (open && messages.children.length === 0) {
                addM('Hey! 把文章交给我吧～点「一键审稿」，我会帮你检查错误、润色文字。');
            }
        });
        document.getElementById('mrClose').addEventListener('click', () => {
            open = false;
            panel.classList.remove('show');
        });
        document.getElementById('mrReviewBtn').addEventListener('click', reviewDraft);
        document.getElementById('mrSend').addEventListener('click', sendFree);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') sendFree(); });
    }

    function addM(text) {
        const d = document.createElement('div');
        d.className = 'mr-msg m';
        d.textContent = text;
        messages.appendChild(d);
        messages.scrollTop = messages.scrollHeight;
        return d;
    }

    function addU(text) {
        const d = document.createElement('div');
        d.className = 'mr-msg u';
        d.textContent = text;
        messages.appendChild(d);
        messages.scrollTop = messages.scrollHeight;
    }

    function reviewDraft() {
        const titleEl = document.getElementById('articleTitle');
        const bodyEl = document.getElementById('articleBody');
        const title = titleEl ? titleEl.value.trim() : '';
        const body = bodyEl ? bodyEl.value.trim() : '';
        if (!title && !body) {
            if (typeof showToast === 'function') showToast('先写点内容再让我审稿', 'error');
            return;
        }
        open = true;
        panel.classList.add('show');
        const short = body.length > 1500 ? body.slice(0, 1500) + '...(已截断)' : body;
        const prompt = '请以写作助手的身份审稿下面这篇文章：1) 指出错别字、标点和语法问题；2) 评价可读性与结构；3) 给出 2-3 条具体润色建议。回复请简洁、友好，用中文分条列出。\n\n标题：' + title + '\n\n正文：\n' + short;
        addU('【一键审稿】《' + (title || '无标题') + '》');
        sendChat(prompt);
    }

    function sendFree() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        addU(text);
        sendChat(text);
    }

    async function sendChat(text) {
        const reviewBtn = document.getElementById('mrReviewBtn');
        const sendBtn = document.getElementById('mrSend');
        reviewBtn.disabled = true;
        sendBtn.disabled = true;
        const pending = addM('正在认真阅读...');
        try {
            const res = await api('/chat', 'POST', { content: text });
            pending.remove();
            if (res.success && res.data && res.data.content) {
                addM(res.data.content);
            } else {
                addM('呜...没收到回复，可能是网络问题，再试一次？');
            }
        } catch (e) {
            pending.remove();
            addM('网络好像不太好...等下再试试？');
        }
        reviewBtn.disabled = false;
        sendBtn.disabled = false;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
