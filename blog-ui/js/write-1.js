    // 微软拼音插入历史文本后，强制重绘让 Renogare 立即生效
    (function() {
        var ab = document.getElementById('articleBody');
        if (ab) {
            ab.addEventListener('compositionend', function() {
                this.style.fontFamily = '';
                void this.offsetHeight;
                this.style.fontFamily = "'Renogare','CelesteZH','Microsoft YaHei',sans-serif";
            });
        }
    })();
    
