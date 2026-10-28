    // 已登录直接跳转（在 Vue 挂载前执行，避免无谓渲染）。
    // 必须先让服务端校验 token：只看 localStorage 里有没有 token，会让过期/残留 token
    // 把 login.html 立刻弹回 index，而 auth.js 又因缺 nickname 显示「登录」按钮，
    // 用户表现为点登录一直停在 index、进不去登录页。
    (function () {
        const token = localStorage.getItem('token');
        if (!token) return;
        // 校验期间隐藏整页：已登录用户等请求返回后直接跳走，看不到登录表单闪烁；
        // 校验失败/网络错误时立刻恢复显示
        document.documentElement.style.visibility = 'hidden';
        api('/users/currentUser', 'GET', null, 3000).then(res => {
            const u = res && res.success ? (res.data || {}) : null;
            if (!u) {
                document.documentElement.style.visibility = '';
                // 仅服务端明确拒绝才清凭据；后端没起（网络错误）时保留，避免误登出
                if (!(res && res.msg === '网络错误')) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('nickname');
                }
                return;
            }
            // 补回昵称：历史残留数据可能只有 token 没有 nickname，否则首页头部仍显示未登录
            const name = u.nickname || u.account;
            if (name) localStorage.setItem('nickname', name);
            location.href = 'index.html';
        });
    })();

    // 记住我：回填账号（初始值传入 Vue setup）
    // 明信片同款出场（Vue 不接管 .login-box 根的 class 属性，vanilla 操作仍生效）
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const box = document.querySelector('.login-box');
        if (box) box.classList.add('slide-in');
    }));

    // ===== 音效（vanilla 保留）=====
    function playSfx(name) {
        try {
            const a = new Audio('celeste-sounds/' + name);
            a.volume = 0.8; a.currentTime = 0; a.play().catch(() => {});
        } catch (e) {}
    }
    (function () {
        const src = 'celeste-sounds/ui_main_assistmode_whistle_page1.wav';
        const tryPlay = () => { const a = new Audio(src); a.volume = 0.8; return a.play(); };
        tryPlay().catch(() => {
            const h = () => { tryPlay().catch(() => {}); document.removeEventListener('click', h); document.removeEventListener('keydown', h); };
            document.addEventListener('click', h);
            document.addEventListener('keydown', h);
        });
    })();

    // ===== Vue 应用：接管表单状态与提交逻辑 =====
    const { createApp, ref, computed, nextTick } = Vue;

    createApp({
        setup() {
            // ===== 状态 =====
            const account = ref(localStorage.getItem('savedAccount') || '');
            const password = ref('');
            const showPw = ref(false);
            const capsOn = ref(false);
            const errMsg = ref('');
            const errShow = ref(false);
            const errKey = ref(0);
            const loading = ref(false);
            const avatarSrc = ref('celeste-portraits/madeline/normal00.png');
            const rememberMe = ref(!!localStorage.getItem('savedAccount'));
            const accountError = ref(false);
            const pwError = ref(false);

            // ===== DOM 模板引用 =====
            const madelineAvatar = ref(null);
            const accountInput = ref(null);
            const pwInput = ref(null);

            // ===== 错误提示（:key 变更触发元素重建，重启 shake 动画）=====
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

            // ===== 密码可见切换 =====
            function togglePw() {
                showPw.value = !showPw.value;
                if (pwInput.value) pwInput.value.focus();
            }

            // ===== Caps Lock 检测 =====
            function onPwKeyup(e) {
                capsOn.value = !!(e.getModifierState && e.getModifierState('CapsLock'));
            }
            function onPwBlur() {
                capsOn.value = false;
            }

            // ===== 实时校验：输入时清掉错误态 =====
            function onAccountInput() {
                accountError.value = false;
            }

            // ===== 表单提交 =====
            async function submit() {
                const acc = account.value.trim();
                const pw = password.value;
                errShow.value = false;

                if (!acc) {
                    accountError.value = true;
                    if (accountInput.value) accountInput.value.focus();
                    showErr('Please enter your account');
                    return;
                }
                if (!pw) {
                    pwError.value = true;
                    if (pwInput.value) pwInput.value.focus();
                    showErr('Please enter your password');
                    return;
                }

                accountError.value = false;
                pwError.value = false;
                loading.value = true;
                avatarSrc.value = 'celeste-portraits/madeline/determined00.png';

                try {
                    const res = await api('/login', 'POST', { account: acc, password: pw });
                    loading.value = false;
                    if (res.success) {
                        const d = res.data;
                        const token = typeof d === 'string' ? d : d.token;
                        const nickname = typeof d === 'string' ? acc : (d.nickname || d.account || acc);
                        // 换账号时先清掉上个账号残留的本地状态，再写入凭据
                        bindAccount(typeof d === 'string' ? acc : (d.account || acc), nickname);
                        localStorage.setItem('token', token);
                        localStorage.setItem('nickname', nickname);
                        if (rememberMe.value) {
                            localStorage.setItem('savedAccount', acc);
                        } else {
                            localStorage.removeItem('savedAccount');
                        }
                        try { sessionStorage.setItem('justLoggedIn', '1'); } catch (e) {}
                        const box = document.querySelector('.login-box');
                        if (box) box.style.display = 'none';
                        const ov = document.getElementById('loginLoadingOverlay');
                        if (ov) ov.classList.add('show');
                        setTimeout(() => { location.href = 'index.html'; }, 1200);
                    } else {
                        showErr(res.msg || 'Wrong account or password');
                    }
                } catch (e) {
                    loading.value = false;
                    showErr('Network error, please try again');
                }
            }

            return {
                account, password, showPw, capsOn, errMsg, errShow, errKey, loading, avatarSrc, rememberMe,
                accountError, pwError,
                madelineAvatar, accountInput, pwInput,
                showErr, togglePw, onPwKeyup, onPwBlur, onAccountInput, submit
            };
        }
    }).mount('.login-box');
