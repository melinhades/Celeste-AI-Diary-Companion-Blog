    // 羽毛随笔弹框：开合/字数/保存状态交 Vue；FeatherGame 全局流程保持不变
    (function() {
        const { createApp, ref, nextTick } = Vue;

        function currentMood() {
            return localStorage.getItem('lastEmotion') || '默认';
        }
        function isBadMood(emo) {
            return ['悲伤', '孤独', '不开心', '不安', '愤怒', '怨恨'].indexOf(emo) !== -1;
        }

        createApp({
            setup() {
                const boxOpen = ref(false);
                const slideIn = ref(false);
                const featherText = ref('');
                const toast = ref('');
                const toastError = ref(false);
                const saving = ref(false);

                function openBox() {
                    boxOpen.value = true;
                    slideIn.value = false;
                    featherText.value = '';
                    toast.value = '';
                    // 与原实现一致：先显示无 slide-in 态，强制重排后再加 class 重放滑入
                    nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => {
                        slideIn.value = true;
                        const inp = document.getElementById('featherInput');
                        if (inp) inp.focus();
                    })));
                }
                function closeBox() {
                    slideIn.value = false;
                    boxOpen.value = false;
                }
                // diary.js 在坏心情金羽毛落地后会调 window.showFeatherNote
                window.showFeatherNote = openBox;

                function onFeatherBtn() {
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
                            setTimeout(function() {
                                closeBox();
                                toast.value = '';
                            }, 1200);
                            // 情绪好时：随笔写完 → 开游戏（Madeline 在游戏内陪伴）
                            if (!isBadMood(currentMood())) {
                                setTimeout(function() {
                                    if (window.FeatherGame) window.FeatherGame.open();
                                }, 800);
                            }
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
                    boxOpen, slideIn, featherText, toast, toastError, saving,
                    onFeatherBtn, closeBox, onFeatherKey, saveFeather
                };
            }
        }).mount('#featherApp');
    })();
