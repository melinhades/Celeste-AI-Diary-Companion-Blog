    // 字体就绪后强制刷新，让 input 立即切到 Renogare（不需要点击）
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() {
            document.body.style.visibility = 'hidden';
            void document.body.offsetHeight;
            document.body.style.visibility = '';
        });
    }

    // ===== BGM（vanilla 保留）=====
    const meBgm = document.getElementById('meBgm');
    const meBgmTime = parseFloat(localStorage.getItem('bgmTimeMe') || '0');
    if (meBgmTime > 0) meBgm.currentTime = meBgmTime;
    meBgm.volume = 0.25;
    meBgm.play().catch(() => {});
    setInterval(() => { localStorage.setItem('bgmTimeMe', meBgm.currentTime); }, 2000);
    function tryPlayMeBgm() { meBgm.play().then(() => { document.removeEventListener('click', tryPlayMeBgm); document.removeEventListener('keydown', tryPlayMeBgm); }).catch(() => {}); }
    document.addEventListener('click', tryPlayMeBgm);
    document.addEventListener('keydown', tryPlayMeBgm);

    // ===== Vue 应用：接管存档卡数据展示与签名编辑 =====
    const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

    const CARD_STAMPS = ['farewell', 'flag', 'goldberry', 'goldheart', 'heart', 'cassettes'];
    const SIG_PLACEHOLDER = '点击编辑个性签名';

    // shine 帧动画（vanilla，按 ID 操作静态 img，不纳入响应式）
    function createShine(elId, prefix) {
        const el = document.getElementById(elId);
        const frames = [];
        for (let i = 0; i <= 5; i++) frames.push('namespace/' + prefix + '00' + i + '.png');
        frames.forEach(s => { const im = new Image(); im.src = s; });
        let timer = null;
        return function () {
            let i = 0;
            el.src = frames[0];
            el.style.opacity = '1';
            clearInterval(timer);
            timer = setInterval(() => {
                i++;
                if (i >= frames.length) {
                    clearInterval(timer);
                    timer = null;
                    el.style.opacity = '0';
                    return;
                }
                el.src = frames[i];
            }, 90);
        };
    }

    createApp({
        setup() {
            // ===== 状态 =====
            const nickname = ref('--');
            const avatarUrl = ref('celeste-gui/user-avatar.webp');
            const portraitSrc = ref('');
            const berryCount = ref(0);
            const diaryCount = ref(parseInt(localStorage.getItem('diarySaveCount') || '0'));
            const featherCount = ref(0);
            const serverSignature = ref('');
            const editing = ref(false);
            const sigDraft = ref('');
            const sigInput = ref(null);

            // ===== 情绪图谱 =====
            const EMO_COLORS = {
                '开心': '#ffd966', '平静': '#7ec0ee', '期待': '#ff9a3c', '满足': '#a8d8a8',
                '不安': '#b48cff', '悲伤': '#5a8dc4', '孤独': '#8ca0c4', '愤怒': '#ff5a5a',
                '惊讶': '#ffe36d', '疲惫': '#9a9a9a'
            };
            const emoLoaded = ref(false);
            const emoTotal = ref(0);
            const emoDist = ref({});
            const emoTimeline = ref([]);

            // ===== 印章：每写一篇解锁一枚，最多 6 枚 =====
            const stamps = computed(() => CARD_STAMPS.slice(0, Math.min(diaryCount.value, CARD_STAMPS.length)));

            // 情绪图谱：按出现次数降序，带百分比和颜色
            const emoBars = computed(() => {
                const entries = Object.entries(emoDist.value);
                if (!entries.length) return [];
                const max = Math.max(...entries.map(e => e[1]));
                return entries
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => ({
                        name, count,
                        pct: max > 0 ? Math.round(count / max * 100) : 0,
                        color: EMO_COLORS[name] || '#888'
                    }));
            });

            // 月度趋势点：把 timeline 展平为 [month, name, color] 数组
            const emoTimelineDots = computed(() => {
                const dots = [];
                for (const t of emoTimeline.value) {
                    const emotions = t.emotions || {};
                    for (const [name, count] of Object.entries(emotions)) {
                        for (let i = 0; i < count; i++) {
                            dots.push({
                                month: t.month,
                                name,
                                color: EMO_COLORS[name] || '#888'
                            });
                        }
                    }
                }
                return dots;
            });

            // 头像框：日记<10 普通，≥10 金色
            watch(diaryCount, (n) => {
                portraitSrc.value = n >= 10 ? 'namespace/portraitOverlayGold.png' : 'namespace/portraitOverlay.png';
            }, { immediate: true });

            function onPortraitError(e) { e.target.style.display = 'none'; }

            // ===== 签名编辑 =====
            function startEdit() {
                if (editing.value) return;
                sigDraft.value = serverSignature.value || '';
                editing.value = true;
                nextTick(() => {
                    if (sigInput.value) { sigInput.value.focus(); sigInput.value.select(); }
                });
            }
            function saveSig() {
                if (!editing.value) return;
                editing.value = false;
                const val = sigDraft.value.trim();
                const oldVal = serverSignature.value;
                // 乐观展示，保存失败再回退
                serverSignature.value = val;
                api('/users/signature', 'PUT', { signature: val }).then(r => {
                    if (r.success) {
                        serverSignature.value = (r.data && r.data.signature) || '';
                    } else {
                        serverSignature.value = oldVal;
                        showToast('签名保存失败，请重试', 'error');
                    }
                }).catch(() => {
                    serverSignature.value = oldVal;
                    showToast('签名保存失败，请重试', 'error');
                });
            }

            // ===== 草莓数事件实时同步 =====
            function onBerriesChange(e) { berryCount.value = e.detail.balance; }

            onMounted(() => {
                // 草莓：先本地缓存，再 sync 权威值
                berryCount.value = berryBalance();
                window.addEventListener('berries:change', onBerriesChange);
                syncBerryBalance();

                // 日记数：后端 /diary/count 权威值（跨设备一致）
                api('/diary/count', 'GET').then(res => {
                    if (res.success && res.data && typeof res.data.count === 'number') {
                        diaryCount.value = res.data.count;
                        localStorage.setItem('diarySaveCount', String(res.data.count));
                        // 日记 ≥10 启动周期性 shine 特效
                        if (res.data.count >= 10) {
                            const playCardShine = createShine('cardShine', 'cardShine');
                            const playTicketShine = createShine('ticketShine', 'ticketShine');
                            (function playShineLoop() {
                                playCardShine();
                                setTimeout(playTicketShine, 92);
                                setTimeout(playShineLoop, 2800);
                            })();
                        }
                    }
                });

                // 用户头像 / 昵称 / 个性签名
                api('/users/currentUser', 'GET').then(res => {
                    if (!res.success || !res.data) return;
                    if (res.data.avatar) {
                        const avatarUrl0 = res.data.avatar.startsWith('http')
                            ? res.data.avatar
                            : BASE_URL + res.data.avatar;
                        const img = new Image();
                        img.onload = function() { avatarUrl.value = avatarUrl0; };
                        img.onerror = function() { console.log('头像加载失败，使用默认头像'); };
                        img.src = avatarUrl0;
                    }
                    nickname.value = res.data.nickname || res.data.account || '未命名';
                    serverSignature.value = res.data.signature || '';
                });

                // 羽毛数
                api('/feather/count', 'GET').then(res => {
                    if (res.success && res.data != null) featherCount.value = res.data.count;
                });

                // 情绪图谱
                api('/diary/emotion-stats', 'GET').then(res => {
                    emoLoaded.value = true;
                    if (res.success && res.data) {
                        emoTotal.value = res.data.total || 0;
                        emoDist.value = res.data.distribution || {};
                        emoTimeline.value = res.data.timeline || [];
                    }
                }).catch(() => { emoLoaded.value = true; });
            });

            return {
                nickname, avatarUrl, portraitSrc, berryCount, diaryCount, featherCount,
                serverSignature, editing, sigDraft, sigInput, stamps,
                emoLoaded, emoTotal, emoBars, emoTimeline, emoTimelineDots,
                onPortraitError, startEdit, saveSig
            };
        }
    }).mount('#meApp');
