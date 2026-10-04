/* ===== 圆桌会议对话头像帧动画引擎（roundtable.html 专用） =====
   素材：Atlases/Portraits/{char}/{emotion}{NN}.png，全部 160x160 透明底
   约定（已按实际目录冻结，勿凭名字猜帧数）：
     madeline/  angry deadpan determined distracted normal panic peaceful
                sad sadder surprised together upset          （各 5-11 帧）
     ghost/     暗面琳 15 情绪（含 angryAlt / freakA-C / worriedAlt），sad 5 帧
     granny/    normal(15) laugh(4) mock(6)   —— creepA/B 有断号(00,04-08)，不使用
     theo/      normal(10) excited nailedit serious thinking worried wtf (7/4) + yolo(4)
     oshiro/    normal(13) nervous worried serious sidehappy sidesuspicious
                sideworried drama lostcontrol
   帧号均为两位补零 00 起连续；帧数 = 配置值，内部 idx 0~n-1 直接映射文件名。
   情绪 key 与语音引擎（roundtable-voice.js / badeline-voice.js）的推断结果 1:1。
   暴露 window.RoundtablePortraits：
     charOf(speakerId)  席位 id → 头像目录名（无素材返回 null）
     attach(imgEl, speakerId)  给一个 <img> 安装动画器，返回 Animator
   Animator:
     mount(emotion)     定格在某情绪 00 帧（默认 normal00）
     play(emotion)      循环播放某情绪（说话中；情绪变化即切组）
     playOnce(emotion)  单次播完后定格在末帧（yolo 彩蛋）
     freeze(emotion)    停止循环并定格 00 帧（emotion 省略则保持当前情绪）
     destroy()          清定时器 */
(function () {
    var BASE = 'Atlases/Portraits/';
    var FRAME_MS = 110;          // 说话帧节奏

    // 席位 id → 目录
    var CHAR_OF = {
        madeline: 'madeline',
        theo: 'theo',
        granny: 'granny',
        badeline: 'ghost',
        oshiro: 'oshiro'
    };

    // 各角色情绪 → 帧数（00 起连续）
    var FRAMES = {
        madeline: {
            angry: 7, deadpan: 9, determined: 11, distracted: 10, normal: 7,
            panic: 5, peaceful: 4, sad: 7, sadder: 7, surprised: 7,
            together: 7, upset: 7
        },
        ghost: {
            angry: 7, angryAlt: 7, concerned: 7, freakA: 11, freakB: 19,
            freakC: 18, normal: 7, sad: 5, scoff: 14, serious: 30,
            sigh: 14, upset: 7, worried: 7, worriedAlt: 7, yell: 7
        },
        granny: { normal: 15, laugh: 4, mock: 6 },
        theo: {
            normal: 10, excited: 7, nailedit: 4, serious: 7,
            thinking: 7, worried: 7, wtf: 7, yolo: 4
        },
        oshiro: {
            normal: 13, nervous: 8, worried: 8, serious: 8,
            sidehappy: 8, sidesuspicious: 8, sideworried: 9,
            drama: 6, lostcontrol: 6
        }
    };

    // 已预热过的情绪（每帧 new Image 一次，让浏览器后台缓存，切换不闪）
    var warmed = {};
    // 帧加载状态：1=已解码可直接切 src；0=加载中（切过去会 ERR_ABORTED/闪空白，先保持上一帧）；-1=缺失
    var loaded = {};
    var waiters = {};   // 加载中的帧 → 完成回调（用于定格场景的"加载完追显"）
    var blobUrl = {};   // src → blob:ObjectURL。静态服务器无缓存头时 img.src 每次切帧都要重新校验网络，
                        // 快速切帧会中止在途请求(ERR_ABORTED)；预热成 blob URL 后切帧零网络、永不中止
    function preload(src, cb) {
        if (loaded[src] === 1) { if (cb) cb(); return; }
        if (loaded[src] === -1) return;
        if (loaded[src] === 0) { if (cb) (waiters[src] = waiters[src] || []).push(cb); return; }
        loaded[src] = 0;
        waiters[src] = cb ? [cb] : [];
        fetch(src).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        }).then(function (blob) {
            blobUrl[src] = URL.createObjectURL(blob);
            loaded[src] = 1;
            var ws = waiters[src] || [];
            waiters[src] = null;
            for (var i = 0; i < ws.length; i++) ws[i]();
        }).catch(function () { loaded[src] = -1; waiters[src] = null; });
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function frameSrc(charName, emotion, idx) {
        return BASE + charName + '/' + emotion + pad2(idx) + '.png';
    }

    function frameCount(charName, emotion) {
        var c = FRAMES[charName];
        return (c && Object.prototype.hasOwnProperty.call(c, emotion)) ? c[emotion] : 0;
    }

    function warm(charName, emotion) {
        var key = charName + '/' + emotion;
        if (warmed[key]) return;
        warmed[key] = true;
        var n = frameCount(charName, emotion);
        for (var i = 0; i < n; i++) {
            preload(frameSrc(charName, emotion, i));
        }
    }

    function Animator(img, charName) {
        this.img = img;
        this.charName = charName;
        this.emotion = null;
        this.idx = 0;
        this.timer = null;
        this.once = false;
    }

    Animator.prototype._show = function () {
        var self = this;
        var src = frameSrc(this.charName, this.emotion, this.idx);
        if (loaded[src] === 1) {
            this.img.src = blobUrl[src];            // blob 本地 URL：零网络切换，绝不 ABORTED
        } else if (loaded[src] !== -1) {
            preload(src, function () {               // 后台拉取；加载完若仍停在这一帧就追显（定格头像也能出画）
                if (self.img.isConnected &&
                    frameSrc(self.charName, self.emotion, self.idx) === src) {
                    self.img.src = blobUrl[src];
                }
            });
        }
        // loaded === -1（帧真缺失）：保持上一帧，不显示破图
    };

    // 内部：切到某情绪（不负责启停）；返回是否真的换了组
    Animator.prototype._switch = function (emotion) {
        if (!frameCount(this.charName, emotion)) emotion = 'normal';
        if (emotion === this.emotion) return false;
        this.emotion = emotion;
        this.idx = 0;
        warm(this.charName, emotion);
        this._show();
        return true;
    };

    Animator.prototype._clear = function () {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    };

    Animator.prototype.mount = function (emotion) {
        this._clear();
        this.once = false;
        this._switch(emotion || 'normal');
        this.idx = 0;
        this._show();
    };

    Animator.prototype.play = function (emotion) {
        this.once = false;
        var switched = this._switch(emotion || 'normal');
        if (this.timer && !switched) return;     // 同情绪循环中，不动
        this._clear();
        var self = this;
        this.timer = setInterval(function () {
            var n = frameCount(self.charName, self.emotion);
            self.idx++;
            if (self.idx >= n) {
                // 说话循环：回到 01 而不是 00（00 多为起始帧，循环更自然）
                self.idx = n > 1 ? 1 : 0;
            }
            self._show();
        }, FRAME_MS);
    };

    Animator.prototype.playOnce = function (emotion) {
        this._clear();
        this.once = true;
        this._switch(emotion || 'normal');
        var self = this;
        this.timer = setInterval(function () {
            var n = frameCount(self.charName, self.emotion);
            if (self.idx >= n - 1) {
                self._clear();
                self.once = false;
                return;
            }
            self.idx++;
            self._show();
        }, FRAME_MS + 40);
    };

    Animator.prototype.freeze = function (emotion) {
        this._clear();
        this.once = false;
        if (emotion) this._switch(emotion);
        this.idx = 0;
        this._show();
    };

    Animator.prototype.destroy = function () { this._clear(); };

    var cache = new WeakMap();   // 同一 img 不重复 attach；席位重建后旧 img 可被回收

    window.RoundtablePortraits = {
        charOf: function (speakerId) { return CHAR_OF[speakerId] || null; },
        attach: function (imgEl, speakerId) {
            if (cache.has(imgEl)) return cache.get(imgEl);
            var charName = CHAR_OF[speakerId];
            if (!charName) return null;
            var a = new Animator(imgEl, charName);
            a.mount('normal');
            cache.set(imgEl, a);
            return a;
        },
        frameSrc: frameSrc
    };
})();
