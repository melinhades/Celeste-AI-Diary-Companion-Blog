    // 已登录直接跳转（Vue 挂载前执行）：同 login-2.js，必须服务端校验 token，
    // 否则残留 token 会让注册页立刻弹回首页、进不去
    (function () {
        const token = localStorage.getItem('token');
        if (!token) return;
        api('/users/currentUser', 'GET', null, 3000).then(res => {
            if (res && res.success) {
                location.href = 'index.html';
                return;
            }
            if (!(res && res.msg === '网络错误')) {
                localStorage.removeItem('token');
                localStorage.removeItem('nickname');
            }
        });
    })();

    // 明信片同款出场
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const box = document.querySelector('.register-box');
        if (box) box.classList.add('slide-in');
    }));

    // ===== 音效（vanilla 保留）=====
    function playSfx(name) {
        try { const a = new Audio('celeste-sounds/' + name); a.volume = 0.8; a.currentTime = 0; a.play().catch(() => {}); } catch (e) {}
    }
    (function () {
        const src = 'celeste-sounds/ui_main_assistmode_whistle_page2.wav';
        const tryPlay = () => { const a = new Audio(src); a.volume = 0.8; return a.play(); };
        tryPlay().catch(() => {
            const h = () => { tryPlay().catch(() => {}); document.removeEventListener('click', h); document.removeEventListener('keydown', h); };
            document.addEventListener('click', h);
            document.addEventListener('keydown', h);
        });
    })();

    // ===== Vue 应用：接管表单状态、强度计、匹配提示与提交 =====
    const { createApp, ref, computed } = Vue;

    const ACCOUNT_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

    createApp({
        setup() {
            // ===== 状态 =====
            const account = ref('');
            const nickname = ref('');
            const password = ref('');
            const password2 = ref('');
            const showPw1 = ref(false);
            const showPw2 = ref(false);
            const capsOn = ref(false);
            const errMsg = ref('');
            const errShow = ref(false);
            const errKey = ref(0);
            const loading = ref(false);
            const avatarSrc = ref('celeste-portraits/madeline/peaceful00.png');
            const nicknameError = ref(false);
            const pwError = ref(false);

            // ===== DOM 模板引用 =====
            const madelineAvatar = ref(null);
            const pwInput = ref(null);
            const pw2Input = ref(null);

            // ===== 账号实时校验 =====
            const accountClass = computed(() => {
                if (!account.value) return '';
                return ACCOUNT_REGEX.test(account.value) ? 'valid' : 'error';
            });

            // ===== 密码强度计算 =====
            function calcStrength(pw) {
                if (!pw) return 0;
                let score = 0;
                if (pw.length >= 6) score++;
                if (pw.length >= 10) score++;
                if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
                if (/\d/.test(pw)) score++;
                if (/[^A-Za-z0-9]/.test(pw)) score++;
                if (score <= 1) return 1;
                if (score <= 3) return 2;
                return 3;
            }
            const strength = computed(() => calcStrength(password.value));
            const strengthLabel = computed(() => {
                if (!password.value) return '';
                const labels = ['', 'Weak', 'Medium', 'Strong'];
                return labels[strength.value];
            });
            const pwValid = computed(() => password.value && password.value.length >= 6);

            // ===== 确认密码匹配 =====
            const matchHint = computed(() => {
                if (!password2.value) return { text: '', cls: '' };
                if (password2.value === password.value) return { text: '✓ Passwords match', cls: 'ok' };
                return { text: '✗ Passwords do not match', cls: 'no' };
            });
            const pw2Class = computed(() => {
                if (!password2.value) return '';
                return password2.value === password.value ? 'valid' : 'error';
            });

            // ===== 密码可见切换 =====
            function togglePw1() {
                showPw1.value = !showPw1.value;
                if (pwInput.value) pwInput.value.focus();
            }
            function togglePw2() {
                showPw2.value = !showPw2.value;
                if (pw2Input.value) pw2Input.value.focus();
            }

            // ===== Caps Lock 检测（两个密码框共用）=====
            function onPwKeyup(e) {
                capsOn.value = !!(e.getModifierState && e.getModifierState('CapsLock'));
            }
            function onPwBlur() {
                capsOn.value = false;
            }

            // ===== 错误提示（:key 变更重启 shake 动画）=====
            function showErr(msg) {
                errMsg.value = msg;
                errKey.value++;
                errShow.value = true;
                avatarSrc.value = 'celeste-portraits/madeline/sad00.png';
                if (madelineAvatar.value) {
                    madelineAvatar.value.style.transform = 'scale(1.05)';
                    setTimeout(() => { if (madelineAvatar.value) madelineAvatar.value.style.transform = ''; }, 300);
                }
            }

            // ===== 表单提交 =====
            async function submit() {
                const acc = account.value.trim();
                const nick = nickname.value.trim();
                const pw = password.value;
                const pw2 = password2.value;
                errShow.value = false;
                nicknameError.value = false;
                pwError.value = false;

                if (!acc) { showErr('Please enter your account'); return; }
                if (!ACCOUNT_REGEX.test(acc)) { showErr('Account must be 3-20 letters, numbers or underscore'); return; }
                if (!nick) { nicknameError.value = true; showErr('Please enter a nickname'); return; }
                if (!pw) { pwError.value = true; showErr('Please enter a password'); return; }
                if (pw.length < 6) { pwError.value = true; showErr('Password must be at least 6 characters'); return; }
                if (pw !== pw2) { showErr('Passwords do not match'); return; }

                loading.value = true;
                avatarSrc.value = 'celeste-portraits/madeline/determined00.png';

                try {
                    const res = await api('/register', 'POST', { account: acc, password: pw, nickname: nick });
                    loading.value = false;
                    if (res.success) {
                        playSfx('ui_main_assistmode_whistle_page3.wav');
                        const box = document.querySelector('.register-box');
                        if (box) box.style.display = 'none';
                        const ov = document.getElementById('regLoadingOverlay');
                        if (ov) ov.classList.add('show');
                        setTimeout(() => { location.href = 'login.html'; }, 1200);
                    } else {
                        showErr(res.msg || 'Registration failed, account may already exist');
                    }
                } catch (e) {
                    loading.value = false;
                    showErr('Network error, please try again');
                }
            }

            return {
                account, nickname, password, password2, showPw1, showPw2, capsOn,
                errMsg, errShow, errKey, loading, avatarSrc, nicknameError, pwError,
                madelineAvatar, pwInput, pw2Input,
                accountClass, strength, strengthLabel, pwValid, matchHint, pw2Class,
                togglePw1, togglePw2, onPwKeyup, onPwBlur, showErr, submit
            };
        }
    }).mount('.register-box');
