    // TextFx：日记本输入框里命中的情绪关键词 → 波浪动画 + 情绪色（仅第一种效果）
    (function () {
        function boot() {
            if (!window.TextFx || !window.__DIARY_EMOTION_WORDS) return;
            var words = window.__DIARY_EMOTION_WORDS, colors = window.__DIARY_EMOTION_COLORS || {};
            var palette = {}, wordArr = [];
            Object.keys(words).forEach(function (emo) {
                words[emo].forEach(function (w) {
                    if (w.length < 2) return;            // 单字（恨/甜/哭）太容易误伤，跳过
                    palette[w] = colors[emo] || '#FF6B6B';
                    wordArr.push(w);
                });
            });
            TextFx.setPalette(palette);
            document.querySelectorAll('#journalBook textarea, #titleInput').forEach(function (el) {
                TextFx.attachTextarea(el, wordArr);
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else boot();
    })();
    
