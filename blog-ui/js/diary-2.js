    // 羽毛随笔弹框：开合/字数/保存状态交 Vue；FeatherGame 全局流程保持不变
    (function() {
        const { createApp, ref, nextTick } = Vue;
        // 退场时长与每日明信片的 overlay 淡出一致（.6s）
        const BOX_EXIT_MS = 600;

        function currentMood() {
            return localStorage.getItem('lastEmotion') || '默认';
        }
        function isBadMood(emo) {
            return ['悲伤', '孤独', '不开心', '不安', '愤怒', '怨恨'].indexOf(emo) !== -1;
        }

        createApp({
            setup() {
                const boxOpen = ref(false);
                const slideIn = ref(false);     // 明信片同款滑入到位态
                const boxClosing = ref(false);  // 退场淡出态
                const featherText = ref('');
                const toast = ref('');
                const toastError = ref(false);
                const saving = ref(false);

                function openBox() {
                    if (boxOpen.value) return;
                    boxClosing.value = false;
                    slideIn.value = false;
                    featherText.value = '';
                    toast.value = '';
                    boxOpen.value = true;
                    // 预取羽毛游戏素材：随笔退场后能立刻承接游戏背景，不卡在加载
                    if (window.FeatherGame && window.FeatherGame.preload) {
                        try { window.FeatherGame.preload(); } catch (e) {}
                    }
                    // 与每日明信片一致：先渲染初始位移态，再挂 .slide-in 从左滑入
                    nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => {
                        if (!boxOpen.value) return;
                        slideIn.value = true;
                        const inp = document.getElementById('featherInput');
                        if (inp) inp.focus();
                    })));
                }
                // 退场动画结束后才收起 DOM；返回 Promise 供「随笔 → 游戏」接力
                function closeBox() {
                    if (!boxOpen.value) return Promise.resolve();
                    return new Promise(function(resolve) {
                        const box = document.getElementById('featherNoteBox');
                        let settled = false;
                        function finish() {
                            if (settled) return;
                            settled = true;
                            if (box) box.removeEventListener('transitionend', onEnd);
                            boxOpen.value = false;
                            slideIn.value = false;
                            boxClosing.value = false;
                            resolve();
                        }
                        // 只认纸页自身的过渡，忽略内部输入框等子元素的 transitionend
                        function onEnd(e) { if (e.target === box) finish(); }
                        // 与明信片退场一致：保持滑入到位态，只整体淡出，不反向滑出
                        boxClosing.value = true;
                        if (box) box.addEventListener('transitionend', onEnd);
                        setTimeout(finish, BOX_EXIT_MS + 80);  // transitionend 兜底
                    });
                }
                // diary.js 在坏心情金羽毛落地后会调 window.showFeatherNote
                window.showFeatherNote = openBox;

                function onFeatherBtn() {
                    // Badeline 驻场期间，右上角按钮同样是「羽毛触发入口」：
                    // 第一次点击演斩断，之后本驻场周期内静默拒绝（随笔入口也不放行）
                    if (window.FeatherBreakGate && window.FeatherBreakGate.intercept()) return;
                    const emo = currentMood();
                    if (isBadMood(emo)) {
                        // 情绪不好：Madeline 先说一句羽毛建议，再淡入金羽毛游戏（过渡自然）
                        window._featherBadMood = true;
                        if (window.FeatherGame) {
                            if (window.FeatherGame.suggestThenOpen) window.FeatherGame.suggestThenOpen(emo);
                            else window.FeatherGame.open(emo);
                        }
                    } else {
                        // 情绪好：先随笔，右下角羽毛按钮点击才游戏
                        if (boxOpen.value) closeBox();
                        else openBox();
                    }
                }

                function onFeatherKey(e) {
                    if (e.key === 'Enter') saveFeather();
                }

                function saveFeather() {
                    const val = featherText.value.trim();
                    if (!val) return;
                    saving.value = true;
                    api('/feather', 'POST', { content: val }).then(function(res) {
                        saving.value = false;
                        if (res && res.success) {
                            toastError.value = false;
                            toast.value = '羽毛已飘走～';
                            featherText.value = '';
                            const goodMood = !isBadMood(currentMood());
                            setTimeout(function() {
                                // 接力：随笔退场、DOM 收起之后，羽毛游戏背景才入场——
                                // 先退后进，中间不闪白、不叠两套背景
                                closeBox().then(function() {
                                    if (!goodMood || !window.FeatherGame) return;
                                    requestAnimationFrame(function() { window.FeatherGame.open(); });
                                });
                            }, 1200);
                        } else {
                            toastError.value = true;
                            toast.value = (res && res.msg) ? res.msg : '没存上，再试一次吧';
                        }
                    }).catch(function() {
                        saving.value = false;
                        toastError.value = true;
                        toast.value = '网络不太顺，再试一次吧';
                    });
                }

                return {
                    boxOpen, slideIn, boxClosing, featherText, toast, toastError, saving,
                    onFeatherBtn, closeBox, onFeatherKey, saveFeather
                };
            }
        }).mount('#featherApp');
    })();
