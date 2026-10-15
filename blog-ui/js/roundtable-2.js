initHeader();

(function () {
    // ===== 固定席位（与后端 RoundtablePersonas.seats() 对应；名字统一英文显示，颜色以后端 meta 为准覆盖） =====
    const EN_NAME = {madeline:'Madeline', theo:'Theo', granny:'Granny', badeline:'Badeline', oshiro:'Oshiro'};
    const FALLBACK_SEATS = [
        {id:'madeline', name:'Madeline', title:'攀登者', color:'#ff6b6b'},
        {id:'theo',     name:'Theo',     title:'摄影师', color:'#5fd38d'},
        {id:'user',     name:'你',       title:'议题主人', color:'#ffe36d', human:true},
        {id:'granny',   name:'Granny',   title:'山脚下的智者', color:'#b18cff'},
        {id:'badeline', name:'Badeline', title:'玛德琳的暗面', color:'#e06bff'},
        {id:'oshiro',   name:'Oshiro',   title:'山庄老板', color:'#7cb7ff'}
    ];
    const SCORE_DIMS = [
        ['conclusion',  '结论达成度'],
        ['evidence',    '论证充分度'],
        ['diversity',   '视角多样性'],
        ['focus',       '聚焦度'],
        ['interaction', '互动性'],
        ['practical',   '实用性']
    ];
    const HIST_KEY = 'roundtable_history_v1';

    const token = localStorage.getItem('token');
    const loginTip = document.getElementById('loginTip');
    const setupView = document.getElementById('setupView');
    const stageView = document.getElementById('stageView');
    const rtWrap = document.querySelector('.rt-wrap');
    // mock 模式（?mock=1）无需登录即可验证前端演出管线
    const isMock = new URLSearchParams(location.search).has('mock');
    if (!token && !isMock) return;   // 登录提示与 setup 视图显隐由 Vue 负责

    // ===== 视图切换：setup ⇄ stage（stage 进入固定视口演播厅模式） =====
    function enterStageMode() {
        window.__rtUI.view.value = 'stage';
        document.body.classList.add('rt-stage-on');
        document.documentElement.classList.add('rt-stage-lock');
        rtWrap.classList.add('stage-mode');
        // 窄屏标签默认回「现场」
        window.__rtUI.tab.value = 'main';
        resetPulsePanel();
    }
    function leaveStageMode() {
        window.__rtUI.view.value = 'setup';
        document.body.classList.remove('rt-stage-on');
        document.documentElement.classList.remove('rt-stage-lock');
        rtWrap.classList.remove('stage-mode');
        if (window.RoundtableScenes) RoundtableScenes.stop();
    }

    // 窄屏（≤768）标签切换：席位 / 现场 / 共识（按钮高亮由 Vue 绑定）
    document.getElementById('studioTabs').addEventListener('click', e => {
        const btn = e.target.closest('button[data-tab]');
        if (!btn) return;
        window.__rtUI.tab.value = btn.dataset.tab;
    });

    // ===== 共识雷达面板 =====
    function resetPulsePanel() {
        $('pulseFocus').textContent = '等待讨论展开…';
        renderPulseList('consensusList', [], '讨论开始后，共识会在这里实时浮现。');
        renderPulseList('disagreeList', [], '暂时还没有明显分歧。');
    }
    function renderPulseList(id, items, emptyText) {
        const ul = $(id);
        ul.innerHTML = '';
        const arr = Array.isArray(items) ? items.filter(x => x && String(x).trim()) : [];
        if (!arr.length) {
            const li = document.createElement('li');
            li.className = 'empty';
            li.textContent = emptyText;
            ul.appendChild(li);
            return;
        }
        arr.forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            ul.appendChild(li);
        });
    }
    function renderPulse(d) {
        if (!d) return;
        if (d.focusPoint) $('pulseFocus').textContent = d.focusPoint;
        renderPulseList('consensusList', d.consensus, '暂时还没有成型的共识。');
        renderPulseList('disagreeList', d.disagreements, '目前没有明显分歧。');
    }

    let speakers = FALLBACK_SEATS;
    let es = null;
    let reconnectAttempts = 0;  // SSE 断线重连次数（后端按同议题幂等复用，不会重开会议）
    let reconnectTimer = null;
    let manualClose = false;    // done/返回/主动停止置 true，此后不再自动重连
    let connectArg = null;      // 当前连接参数，供重连复用：{type:'stream',topic} / {type:'observe',id}
    let meeting = null;          // 当前会议数据（done 后落历史）
    let activeBubble = null;     // 当前正在接收 delta 的气泡元素
    let sceneTriggered = false;  // Task 12：每场仅触发一次 oshiro_move（主持开场结束时）
    let seatAnims = {};          // 席位头像动画器：speakerId → Animator
    let replayMode = false;      // 观察者回放阶段：静音、头像定格
    let observerMode = false;    // 当前 stage 是否为观察者（只读、无写控件、不落本机历史）
    let seatFocus = {};          // 各席位最近一次关注点（idle 后保留）
    let liveTimer = null;        // 大厅列表 10s 自动刷新
    // ===== mock 模式（?mock=1）：本地罐头剧本，无 AI 后端也能验证音效/头像/行为树全管线 =====
    const MOCK = isMock;
    let mockAbort = null;        // 中止模拟（结束会议按钮）
    let mockQueue = [];          // mock 里的用户插话队列（下一句开场前广播）

    const $ = id => document.getElementById(id);
    // 返回链接换文案时只显示 exit.png 图标（无文字）
    function setBackText(text) {
        const el = $('backLink');
        el.innerHTML = '<img src="Atlases/Gui/menu/exit.png" alt="返回">';
        el.title = text;
    }

    // ===== 创建会议视图 =====
    function renderSeatPreview() {
        $('seatPreview').textContent = speakers.map(s => s.name).join(' · ');
    }
    renderSeatPreview();

    // 召开按钮 / Ctrl+Enter 由 Vue 模板绑定，这里把入口挂到 window 供其调用
    window.__rtStart = startMeeting;

    function startMeeting() {
        const topic = $('topicInput').value.trim();
        if (!topic) { showToast('先写一个议题吧', 'info'); return; }
        replayMode = false;
        observerMode = false;
        openStage({topic, speakers});
        if (MOCK) { runMockMeeting(topic); return; }
        connectStream(topic);
    }

    // ===== 全站讨论大厅：10s 自动刷新，点卡片以观察者身份旁听 =====
    function fmtStartedAt(ts) {
        const diff = Math.max(0, Date.now() - Number(ts || Date.now()));
        const min = Math.floor(diff / 60000);
        if (min < 1) return '刚刚开始';
        if (min < 60) return min + ' 分钟前开始';
        return Math.floor(min / 60) + ' 小时前开始';
    }
    function renderLiveCards(list) {
        const panel = $('livePanel'), box = $('liveList');
        box.innerHTML = '';
        if (!Array.isArray(list) || !list.length) { panel.style.display = 'none'; return; }
        panel.style.display = '';
        list.forEach(item => {
            const card = document.createElement('button');
            card.className = 'live-card';
            card.innerHTML =
                '<span class="live-dot"></span>' +
                '<span class="live-main">' +
                    '<span class="live-topic">' + escHtml(item.topic || '（无题）') + '</span>' +
                    '<span class="live-meta">' + escHtml(item.userNickname || '匿名山友') + ' · '
                        + fmtStartedAt(item.startedAt) + ' · ' + (item.speechCount || 0) + ' 条发言 · '
                        + (item.observerCount || 0) + ' 人在旁听</span>' +
                '</span>' +
                '<span class="live-go">进去旁听 ›</span>';
            card.addEventListener('click', () => startObserving(item));
            box.appendChild(card);
        });
    }
    let liveLoading = false;
    async function loadLive() {
        if (liveLoading) return;
        liveLoading = true;
        try {
            if (MOCK) { renderLiveCards(mockLiveData()); return; }
            const res = await api('/roundtable/live', 'GET', null, 8000);
            if (res && res.success) renderLiveCards(res.data);
        } catch (e) { /* 大厅静默失败，不影响自建会议 */ }
        finally { liveLoading = false; }
    }
    function startLivePolling() {
        loadLive();
        if (liveTimer) clearInterval(liveTimer);
        liveTimer = setInterval(loadLive, 10000);
    }
    startLivePolling();

    // 以观察者身份进入一场他人会议
    function startObserving(item) {
        if (!item || !item.id) { showToast('会议已经散场了', 'info'); loadLive(); return; }
        replayMode = true;       // 先收回放（静音/定格），收到首条实时事件自动转 live
        observerMode = true;
        openStage({topic: item.topic, speakers});
        if (MOCK) { runMockObserver(item); return; }
        connectObserve(item.id);
    }

    // ===== 推荐话题：拉取 / 渲染 / 点击直接开会 =====
    // 个人素材（日记/我的文章/点赞）→ PPT 同款思考小人 Clip Art + 手写标签；
    // 通用话题 → 学霸鸟 Clip Art + 标签名
    const SUGG_FROM = {
        diary:  { kind:'person', label:'日记中的纠结？' },
        mine:   { kind:'person', label:'我的文章？' },
        liked:  { kind:'person', label:'点赞的文章？' },
        default:{ kind:'bird',   label:'通用话题' }
    };
    let suggLoading = false;
    async function loadSuggestions() {
        if (suggLoading) return;
        suggLoading = true;
        $('suggList').innerHTML = '<div class="sugg-loading"><div class="sugg-running"></div>正在为你挑选话题…</div>';
        let res;
        try {
            res = await api('/roundtable/suggestions', 'GET', null, 30000);
        } finally { suggLoading = false; }
        if (!res || !res.success || !Array.isArray(res.data) || !res.data.length) {
            $('suggList').innerHTML = '<div class="sugg-loading">话题暂时没挑出来，点「换一批」再试试。</div>';
            return;
        }
        $('suggList').innerHTML = '';
        res.data.forEach(item => {
            const from = SUGG_FROM[item.source] || SUGG_FROM.default;
            const icon = from.kind === 'person'
                ? 'Atlases/WaveDashing/Guy Clip Art.png'
                : 'Atlases/WaveDashing/Bird Clip Art.png';
            const card = document.createElement('button');
            card.className = 'sugg-card';
            card.innerHTML = '<span class="sugg-from ' + from.kind + '">'
                + '<img src="' + icon + '" alt="" loading="lazy">'
                + '<span class="from-txt">' + from.label + '</span></span>'
                + '<span class="sugg-fx">' + renderFxText(autoWrapWave(item.topic)) + '</span>';
            card.addEventListener('click', () => {
                $('topicInput').value = item.topic;
                $('topicInput').dispatchEvent(new Event('input'));   // 同步 v-model
                startMeeting();
            });
            $('suggList').appendChild(card);
        });
    }
    $('suggRefresh').addEventListener('click', loadSuggestions);
    loadSuggestions();

    /** mock 模式：罐头剧本按后端 8 字/24ms 节奏推 delta，走完 beginSpeech/appendDelta/endSpeech 真实管线 */
    // turn_prepare.publicNote 罐头文案（仅调度态展示，不进 transcript）
    const MOCK_NOTES = {
        madeline:'有话想说，正在组织语言…', theo:'挑起眉毛，想起一句吐槽…',
        granny:'轻笑一声，准备泼点冷水…', badeline:'抱臂冷笑，按捺不住…',
        oshiro:'紧张地飘过来，想打个圆场…'
    };
    function mockPulse(aiCount) {
        const stages = [
            {focusPoint:'开场表态：大家对议题的第一反应', consensus:['事情很难，但值得试试看'], disagreements:['要不要直接拼，还是先求稳']},
            {focusPoint:'分歧点：稳妥路线 vs 冒险路线', consensus:['真摔了，也有能力再爬起来'], disagreements:['Theo 觉得太想当然','Badeline 认为这是死胡同']},
            {focusPoint:'折中方案正在成形', consensus:['先迈出一小步验证'], disagreements:['Oshiro 仍担心起冲突']},
            {focusPoint:'共识收拢：先试一步，边走边看', consensus:['先试一小步，不行就退回重新规划','所有人接受了折中方案'], disagreements:[]}
        ];
        const st = stages[Math.min(Math.floor(aiCount / 2), stages.length - 1)];
        return Object.assign({consensusScore: 60 + aiCount * 4, ts: Date.now()}, st);
    }
    // mock 大厅：一张演示用进行中会议卡
    function mockLiveData() {
        return [{id:'mock-live-1', topic:'站在分岔路口：保研稳一点，还是冲一把梦校？',
                 userNickname:'登山的西奥', startedAt: Date.now() - 7 * 60000,
                 speechCount: 13, observerCount: 2}];
    }
    function runMockMeeting(topic, observe) {
        meeting.id = (observe ? 'mock-observe-' : 'mock-') + Date.now();
        mockQueue = [];
        if (window.RoundtableVoice) RoundtableVoice.setLive(true);
        $('stageMeta').textContent = (observe ? '👁 观察中（本地模拟）' : '本地模拟演示（未连接 AI）')
            + ' · Madeline / Theo / You / Granny / Badeline / Oshiro';
        addSystemLine(observe ? '观察中：本地模拟一场他人会议，先回放此前发言，随后实时接收'
                             : 'mock 模式：本地演示剧本（罐头台词），用于无 AI 环境验证演出管线');
        // 罐头台词：与真实会议同一套规则——就议题谈事、1~3 句、英文名称呼、不演剧情、不复读
        const SCRIPT = [
            {id:'host', role:'host', text:'各位都到齐了。今天的议题是「' + topic + '」。就事论事，聊出能落地的结论为止。{~Madeline~}，你先说说。'},
            {id:'madeline', text:'我先表态：这事最怕一直想、不行动。{!先迈最小的一步!}，今晚就能动手的那种，不行再退回来。'},
            {id:'theo', text:'补个角度：别先想着一步到位，{*先让它变得容易开始*}——门槛降到五分钟内能做，感觉就不一样。'},
            {id:'granny', text:'呵呵，说来说去，关键不是选哪个，是你{~肯不肯为它付代价~}。这点想清楚，其余都是枝节。'},
            {id:'badeline', text:'泼个冷水：计划再好，环境没变也是白搭。{*除非你先把最大的障碍挪走*}，否则又是三天热度。'},
            {id:'oshiro', text:'我理解舍不得旧习惯的心情，但拖着不动的代价更大。我建议先设一个{~两周试验期~}，用结果说话。'},
            {id:'madeline', text:'那就定下来：今晚先做第一步，一周后复盘。{~Badeline~} 说的障碍，动手前先列清楚。'},
            {id:'theo', text:'最小一步加一周复盘，{!这个方案我跟了!}。议题主人，你看第一步先从哪件事开始？'},
            {id:'host', role:'host', text:'好，共识收拢：降低门槛、先试一步、一周复盘。先动起来比空想更重要，散会！'}
        ];

        // 观察者：先瞬间回放 host 开场 + 第一条发言（静音/定格），随后转入实时节奏
        function pushLineSync(line) {
            beginSpeech({speakerId: line.id, role: line.role || 'ai', replay: true, ts: Date.now()});
            appendDelta({speakerId: line.id, replay: true, text: line.text});
            endSpeech({replay: true, ts: Date.now()});
        }
        let li = 0, aiCount = 0;
        if (observe) {
            pushLineSync(SCRIPT[0]); pushLineSync(SCRIPT[1]);
            li = 2; aiCount = 1;
            replayMode = false;   // 回放结束，转入实时
            addSystemLine('—— 回放结束，以下为实时发言 ——');
        }
        let dead = false;
        mockAbort = () => { if (!dead) { dead = true; mockFinish(); } };
        (function next() {
            if (dead) return;
            if (li >= SCRIPT.length) { mockFinish(); return; }
            // 插话队列：两句间隙广播（对齐后端 drainInterjections 的时机）
            if (mockQueue.length) {
                const t = mockQueue.shift();
                beginSpeech({speakerId:'user', role:'user', name:'你', color:'#ffe36d', ts:Date.now()});
                appendDelta({speakerId:'user', text:t});
                endSpeech({ts:Date.now()});
            }
            const line = SCRIPT[li++];
            if (line.role !== 'host') {
                setSeatState(line.id, 'prepare', MOCK_NOTES[line.id]);
                if (window.RoundtableBird) RoundtableBird.focusSeat(line.id);
            }
            setTimeout(() => {
                if (dead) return;
                beginSpeech({speakerId: line.id, role: line.role || 'ai', ts: Date.now()});
                let i = 0;
                // 3 字/70ms 推入；呈现节拍由前端分句播放器统一控制（逐字 + 句间短停顿）
                const iv = setInterval(() => {
                    if (dead) { clearInterval(iv); return; }
                    if (i >= line.text.length) {
                        clearInterval(iv);
                        endSpeech({
                            ts: Date.now(),
                            onDone: () => {
                                if (line.role !== 'host' && ++aiCount % 2 === 0) {
                                    // 对齐后端：每 2 条发言一次共识 pulse
                                    setTimeout(() => { if (!dead) renderPulse(mockPulse(aiCount)); }, 200);
                                }
                                setTimeout(next, 1100 + Math.random() * 600);   // 条间留白：真实会议这段是 AI 思考耗时
                            }
                        });
                        return;
                    }
                    appendDelta({speakerId: line.id, text: line.text.slice(i, i += 3)});
                }, 70);
            }, 900 + Math.random() * 500);    // 准备发言：短暂沉一下再开口
        })();
        function mockFinish() {
            const score = {grade:'A', avg:84,
                scores:{conclusion:85, evidence:80, diversity:88, focus:82, interaction:86, practical:83},
                comment:'先立后破再收拢，议题落到了「先试一小步」的具体行动上。',
                todos:['迈出一小步验证可行性', '不行就退回山脚重新规划']};
            renderGradeCard(score);
            if (window.RoundtableVoice) RoundtableVoice.meetingEnd(meeting.transcript);
            if (window.RoundtableBird) RoundtableBird.onScore(score.avg);
            meeting.finishedAt = Date.now();
            meeting.score = score; meeting.status = 'consensus'; meeting.rounds = 1;
            finishUI();
            if (!observerMode) saveHistory(meeting);   // 观察者只读，不写本机历史
            if (window.RoundtableBird) RoundtableBird.leave();
        }
    }
    function runMockObserver(item) { runMockMeeting(item.topic, true); }

    // ===== 会议舞台 =====
    function openStage({topic, speakers:sp}) {
        enterStageMode();
        $('studio').classList.remove('spotlight');
        const sMain = $('resultArea').closest('.studio-main');
        if (sMain) sMain.classList.remove('ended');
        $('resultArea').innerHTML = '';
        $('transcript').innerHTML = '';
        const hBtn = $('historyBtn');
        if (hBtn) hBtn.disabled = true;
        $('stageTopic').textContent = '议题：' + topic;
        $('stageMeta').textContent = '';
        // 观察者只读：徽章显示，结束会议/插话两个写控件隐藏
        const ob2 = $('observerBadge'); if (ob2) ob2.classList.toggle('show', observerMode);
        $('stopBtn').style.display = observerMode ? 'none' : '';
        $('participateBtn').style.display = 'none';   // 是否可转参与由 meta 的 isOwner 决定
        $('interjectRow').style.display = observerMode ? 'none' : '';
        $('interjectInput').disabled = false;
        setBackText(observerMode ? '返回大厅' : '放弃本场，返回');

        // 席位卡
        speakers = sp;
        seatAnims = {};
        seatFocus = {};
        const seats = $('seats');
        seats.innerHTML = '';
        sp.forEach(s => {
            const el = document.createElement('div');
            el.className = 'seat';
            el.id = 'seat-' + s.id;
            el.style.setProperty('--c', s.color);
            el.style.setProperty('--glow', s.color + '55');
            const charName = window.RoundtablePortraits && RoundtablePortraits.charOf(s.id);
            const avatarHtml = charName
                ? '<div class="avatar" style="background:' + s.color + '22"><img class="avatar-img" alt=""></div>'
                : '<div class="avatar" style="background:' + s.color + '">' + escHtml(s.name.slice(0,1)) + '</div>';
            el.innerHTML =
                avatarHtml +
                '<div class="s-name">' + escHtml(s.name) + '</div>' +
                '<div class="s-title">' + escHtml(s.title || '') + '</div>' +
                '<div class="s-state">' + (s.human ? '随时可插话' : '待机') + '</div>' +
                '<div class="s-focus">' + (s.human ? '随时可插话' : '待机') + '</div>';
            seats.appendChild(el);
            if (charName) seatAnims[s.id] = RoundtablePortraits.attach(el.querySelector('img.avatar-img'), s.id);
        });

        meeting = {
            id: null, topic, rounds: 0,
            startedAt: Date.now(), finishedAt: null,
            transcript: [], score: null
        };
        activeBubble = null;
        sceneTriggered = false;

        // Task 12：舞台演出层入场（mad_idle 循环）
        if (window.RoundtableScenes) RoundtableScenes.start();
        // 舞台刚显示，重算右栏与动画容器的对齐（隐藏时量不到尺寸；等布局稳定再量两次）
        if (window.rtSyncSide) {
            window.rtSyncSide();
            setTimeout(window.rtSyncSide, 300);
        }

        // 主持鸟开场：crow 鸣叫 → 起飞 → 在席位卡上方盘旋
        if (window.RoundtableBird) RoundtableBird.enter(stageView.querySelector('.rt-panel'));
    }

    function setSeatState(id, state, note) {
        const el = $('seat-' + id);
        if (!el) return;
        el.classList.remove('prepare', 'speaking');
        const stateEl = el.querySelector('.s-state');
        const focusEl = el.querySelector('.s-focus');
        const sp = speakers.find(s => s.id === id);
        if (state === 'prepare') {
            el.classList.add('prepare'); stateEl.textContent = '准备发言…';
            if (note) seatFocus[id] = note;      // 关注点持久保留，idle 后仍展示
        }
        else if (state === 'speaking') { el.classList.add('speaking'); stateEl.textContent = '发言中…'; }
        else {
            el.classList.add('done');
            stateEl.textContent = sp && sp.human ? '随时可插话' : '待机';
        }
        if (focusEl) focusEl.textContent = seatFocus[id] || (sp && sp.human ? '随时可插话' : '待机');
        // 聚光灯：场内存在「发言中」席位时压暗其余席位
        $('studio').classList.toggle('spotlight', !!$('seats').querySelector('.seat.speaking'));
    }

    function stickBottom() {
        const box = $('transcript');
        box.scrollTop = box.scrollHeight;
    }

    function addSystemLine(text, cls) {
        const d = document.createElement('div');
        d.className = cls || 'sys-line';
        d.textContent = text;
        // 单对话模式：系统消息也只保留最新一条
        $('transcript').innerHTML = '';
        $('transcript').appendChild(d);
        stickBottom();
        return d;
    }

    // 取最新一句供情绪推断（标点切分，与语音引擎内部一致）
    function lastSentence(text) {
        const parts = String(text || '').split(/[。！？!?…\n；;]+/);
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].trim()) return parts[i].slice(-40);
        }
        return String(text || '').slice(-40);
    }

    // 说话中：按最新一句切换气泡+席位的头像情绪
    function updatePortraitEmotion(speakerId, fullText) {
        if (!window.RoundtableVoice || !window.RoundtablePortraits) return;
        const emo = RoundtableVoice.infer(speakerId, lastSentence(fullText));
        if (!emo || !activeBubble || activeBubble._emotion === emo) return;
        activeBubble._emotion = emo;
        if (activeBubble._portrait) activeBubble._portrait.play(emo);
        if (seatAnims[speakerId]) seatAnims[speakerId].play(emo);
        // 主持鸟行为树：情绪流入会场气氛（激烈情绪可能把鸟吸引过去）
        if (window.RoundtableBird && !replayMode) RoundtableBird.onEmotion(speakerId, emo);
    }

    // 立即收尾一条仍在打字的发言：剩余缓冲一次性上屏 → 入 transcript → 复位席位/音效/头像。
    // 若直接丢弃，旧席位会卡死在「发言中」、历史记录丢句，表现为说话顺序显示错乱。
    function flushSpeech(b) {
        if (b._timer) { clearTimeout(b._timer); b._timer = null; }
        if (b._seg != null) { b._shownMarked += b._segMarked; b._seg = null; }
        if (b._shownRaw.length < b._clean.length) {
            const rest = b._clean.slice(b._shownRaw.length);
            b._shownRaw = b._clean;
            b._shownMarked += (b._meta.role === 'user') ? rest : markRound(rest);
        }
        b._ending = true;
        finishSpeech(b);
    }

    function beginSpeech(ev) {
        replayMode = ev && Object.prototype.hasOwnProperty.call(ev, 'replay') ? !!ev.replay : false;
        // 上一条还没播完就被新发言顶替：走 flushSpeech 正常收尾，保证顺序状态与历史完整
        if (activeBubble && !activeBubble._dead) {
            flushSpeech(activeBubble);
        }
        const sp = speakers.find(s => s.id === ev.speakerId)
            || {name: EN_NAME[ev.speakerId] || ev.name, color:ev.color || '#9aa7c7', human: ev.role === 'user'};
        const dispName = EN_NAME[ev.speakerId] || sp.name;   // 五名角色一律英文显示
        const isHost = ev.role === 'host';
        // 气泡 meta：姓名 · 头衔 · 时间；主持人保持无 meta；议题主人头衔固定中文
        const titleText = isHost ? '' : (ev.role === 'user' ? '议题主人' : (sp.title || ''));
        const charName = window.RoundtablePortraits && RoundtablePortraits.charOf(ev.speakerId);
        let d;
        if (!isHost && ev.role !== 'user' && charName) {
            // Task 12 / AC-18：AI 发言 = 角色专属 textbox 对话框（左侧动画头像帧 + 右上英文名 + 打字机文本）
            d = document.createElement('div');
            d.className = 'sp tb tb-' + ev.speakerId + ' typing';
            d.innerHTML =
                '<div class="tb-portrait"><img class="b-avatar-img" alt=""></div>' +
                '<div class="tb-body">' +
                    '<div class="tb-name">' + escHtml(dispName) + '</div>' +
                    '<div class="b-bubble tb-text" style="--c:' + sp.color + '"></div>' +
                '</div>';
        } else {
            d = document.createElement('div');
            d.className = 'sp ' + (isHost ? 'host' : ev.role === 'user' ? 'user' : '') + ' typing';
            const time = new Date(ev.ts || Date.now());
            const hhmm = String(time.getHours()).padStart(2,'0') + ':' + String(time.getMinutes()).padStart(2,'0');
            // 主持人形象透明化替换为 Celeste 小鸟；其他角色用头像帧动画或首字母
            const avatarHtml = isHost
                ? '<div class="b-avatar b-avatar-bird"><img src="Atlases/Gameplay/characters/bird/hover00.png" alt=""></div>'
                : charName
                    ? '<div class="b-avatar" style="background:' + sp.color + '22"><img class="b-avatar-img" alt=""></div>'
                    : '<div class="b-avatar" style="background:' + sp.color + '">' + escHtml(dispName.slice(0,1)) + '</div>';
            d.innerHTML =
                avatarHtml +
                '<div class="b-main">' +
                    (isHost ? '' : '<div class="b-meta" style="color:' + sp.color + 'cc">'
                        + escHtml(dispName) + (titleText ? ' · ' + escHtml(titleText) : '')
                        + ' · ' + hhmm + '</div>') +
                    '<div class="b-bubble" style="--c:' + sp.color + '"></div>' +
                '</div>';
        }
        // 单对话模式：主界面只保留当前一条，旧发言已存入 meeting.transcript
        $('transcript').innerHTML = '';
        $('transcript').appendChild(d);
        activeBubble = d.querySelector('.b-bubble');
        // 分句播放器状态
        activeBubble._rawFull = '';      // 含模型标签的原始累积
        activeBubble._clean = '';        // 清洗后全文
        activeBubble._shownRaw = '';     // 已显示原文
        activeBubble._shownMarked = '';  // 已显示部分的标注文本
        activeBubble._seg = null;        // 当前正在打的句段
        activeBubble._segMarked = '';
        activeBubble._segK = 0;
        activeBubble._segPause = 0;
        activeBubble._timer = null;
        activeBubble._ending = false;
        activeBubble._replay = replayMode;
        activeBubble._dead = false;
        activeBubble._onDone = null;
        activeBubble._emotion = null;
        activeBubble._portrait = null;
        activeBubble._meta = {speakerId:ev.speakerId, name:dispName, color:sp.color, role:ev.role, ts:ev.ts};
        if (charName) {
            // 头像帧动画：实时会议循环播放，回放只定格 normal00
            const anim = RoundtablePortraits.attach(d.querySelector('img.b-avatar-img'), ev.speakerId);
            activeBubble._portrait = anim;
            if (!replayMode) {
                anim.play('normal');
                if (seatAnims[ev.speakerId]) seatAnims[ev.speakerId].play('normal');
            }
        }
        if (ev.speakerId !== 'host') setSeatState(ev.speakerId, 'speaking');
        // 主持鸟行为树：主持人开口=鸟代言鸣叫；用户插话=冲刺到用户席位
        if (window.RoundtableBird && !replayMode) {
            if (isHost) RoundtableBird.onHostSpeak(true);
            else if (ev.speakerId === 'user') RoundtableBird.onUserInterject();
        }
        // 说话音效：把上一句全文交给引擎（奶奶 oneha 剧情触发判定用）；回放时引擎自动静音
        const prev = meeting && meeting.transcript.length ? meeting.transcript[meeting.transcript.length - 1].content : '';
        if (window.RoundtableVoice && !replayMode) RoundtableVoice.start(ev.speakerId, prev);
        stickBottom();
    }

    // ===== 字体动画：{~波浪~} {*抖动*} {!弹跳!}（解析/渲染统一走公共模块 js/text-fx.js） =====
    // 圆桌推荐话题的关键词 → 角色专属色（供 TextFx.autoWrapWave 上色）
    TextFx.setPalette({
        /* Madeline 亮红 */ '勇气':'#F94A4A','坚持':'#F94A4A','加油':'#F94A4A','梦想':'#F94A4A',
        '热爱':'#F94A4A','拼搏':'#F94A4A','挑战':'#F94A4A','爬起来':'#F94A4A',
        '不放弃':'#F94A4A','冲一把':'#F94A4A','倔强':'#F94A4A','不服输':'#F94A4A','勇敢':'#F94A4A',
        /* Badeline 淡紫 */ '害怕':'#D678DB','恐惧':'#D678DB','焦虑':'#D678DB','放弃':'#D678DB',
        '死胡同':'#D678DB','质疑':'#D678DB','担心':'#D678DB','不安':'#D678DB',
        '犹豫':'#D678DB','退缩':'#D678DB','失败':'#D678DB','崩溃':'#D678DB',
        '想逃':'#D678DB','自我怀疑':'#D678DB',
        /* Oshiro 暗绿 */ '紧张':'#7BD838','原谅':'#7BD838','和解':'#7BD838','善意':'#7BD838',
        '拜托':'#7BD838','礼貌':'#7BD838','愧疚':'#7BD838','抱歉':'#7BD838','打扫':'#7BD838',
        /* Theo 橙黄 */ '朋友':'#FF9523','开心':'#FF9523','快乐':'#FF9523','巧克力':'#FF9523',
        '冒险':'#FF9523','旅行':'#FF9523','拍照':'#FF9523','乐观':'#FF9523','自由':'#FF9523','有趣':'#FF9523',
        /* 塞莱斯特山 浅青 */ '山顶':'#96EFFF','山脚':'#96EFFF','攀登':'#96EFFF','爬山':'#96EFFF',
        '成长':'#96EFFF','分岔':'#96EFFF','路口':'#96EFFF','远方':'#96EFFF','阶梯':'#96EFFF','坠落':'#96EFFF'
    });
    var ROUND_FX_KEYWORDS = [
        '勇气','坚持','加油','梦想','热爱','拼搏','挑战','爬起来','不放弃','冲一把','倔强','不服输','勇敢',
        '害怕','恐惧','焦虑','放弃','死胡同','质疑','担心','不安','犹豫','退缩','失败','崩溃','想逃','自我怀疑',
        '紧张','原谅','和解','善意','拜托','礼貌','愧疚','抱歉','打扫',
        '朋友','开心','快乐','巧克力','冒险','旅行','拍照','乐观','自由','有趣',
        '山顶','山脚','攀登','爬山','成长','分岔','路口','远方','阶梯','坠落'
    ];
    function renderFxText(raw) { return TextFx.render(raw); }
    function autoWrapWave(text) {
        return TextFx.autoWrapWave(text, ROUND_FX_KEYWORDS);
    }
    // 统一标注：圆桌关键词波浪（带角色色）→ 自动补抖动/感叹弹跳
    function markRound(raw) {
        return TextFx.autoMark(TextFx.autoWrapWave(raw, ROUND_FX_KEYWORDS));
    }

    /* ===== 清洗模型泄漏的说话人标签：句首的 Theo：/Theo: /**Theo**: /【Madeline】「 / 主持人：… =====
       只剥句首（句中出现的名字属于台词内容），最多连剥 3 层防止 "Theo: Badeline: …" 双标签 */
    var SPEAKER_PREFIX_RE =
        /^\s*(?:[【\[]\s*)?(?:\*\*)?(?:Madeline|Maddy|Theo|Granny|Grandma|Badeline|Oshiro|Mr\.?\s*Oshiro|Host|主持人|主持鸟|小鸟)(?:\*\*)?\s*(?:[（(][^()（）]{0,12}[）)])?\s*(?:[】\]]\s*)?[:：;；、，,]\s*(?:[（(][^()（）]{0,12}[）)])?\s*["“”'「『]?\s*/i;
    // 【名字】/[名字] 形式：方括号包裹本身即强标签信号，无需冒号（如 【Madeline】「不行、【Granny】（笑）别急）
    var SPEAKER_BRACKET_RE =
        /^\s*[【\[]\s*(?:\*\*)?(?:Madeline|Maddy|Theo|Granny|Grandma|Badeline|Oshiro|Mr\.?\s*Oshiro|Host|主持人|主持鸟|小鸟)(?:\*\*)?\s*(?:[（(][^()（）]{0,12}[）)])?\s*[】\]]\s*(?:[（(][^()（）]{0,12}[）)])?\s*[:：;；、，,]?\s*["“”'「『]?\s*/i;
    function stripSpeakerPrefix(raw) {
        var s = String(raw || '');
        for (var i = 0; i < 3; i++) {
            var n = s.replace(SPEAKER_BRACKET_RE, '').replace(SPEAKER_PREFIX_RE, '');
            if (n === s) break;
            s = n;
        }
        return s;
    }

    /* ===== 自然说话节拍：长台词按句截断、逐句放出，句间停顿，逐字慢放 =====
       delta 到达多快都不影响呈现——文本先入缓冲，播放器按自己的节拍消费。 */
    function SPEAK_CHAR_MS() { return 30 + Math.random() * 22; }      // 每字 30-52ms：文字先加载到缓冲，匀速自然说出（原瞬间出字太快、52-90ms 又偏慢）
    function speakGap(ch) {
        if (ch === '？' || ch === '?' || ch === '！' || ch === '!') return 260 + Math.random() * 200;
        if (ch === '…') return 220 + Math.random() * 160;
        if (ch === '\n') return 160 + Math.random() * 140;
        return 200 + Math.random() * 160;                              // 句号：短暂换气即可
    }
    // 无标点长句软切：22-34 字窗口内优先在逗号切，找不到硬切 26 字
    function softCut(s) {
        var win = Math.min(s.length, 22 + Math.floor(Math.random() * 12));
        for (var i = win - 1; i >= 12; i--) {
            if ('，,、；;'.indexOf(s[i]) !== -1) return { len: i + 1, pause: 120 + Math.random() * 100 };
        }
        return { len: Math.min(s.length, 26), pause: 100 + Math.random() * 80 };
    }
    // 取一个句段 {len, pause}；null = 句子还没到齐、且长度不够软切，继续等 delta
    function nextSeg(b, waiting) {
        for (var i = 0; i < waiting.length; i++) {
            var ch = waiting[i];
            if ('。．！？!?…'.indexOf(ch) !== -1 || ch === '\n') {
                var j = i + 1;
                if (j < waiting.length && '”』」）'.indexOf(waiting[j]) !== -1) j++;
                return { len: j, pause: speakGap(ch) };
            }
        }
        if (b._ending || waiting.length >= 24) return softCut(waiting);
        return null;
    }

    function pump(b) {
        if (b !== activeBubble || b._dead) return;
        if (b._seg != null) { typeOne(b); return; }
        var waiting = b._clean.slice(b._shownRaw.length);
        if (!waiting) {
            if (b._ending) finishSpeech(b);
            return;                                            // 缓冲空了，等下一波 delta
        }
        var seg = nextSeg(b, waiting);
        if (!seg) return;
        b._seg = waiting.slice(0, seg.len);
        b._segMarked = (b._meta.role === 'user') ? b._seg : markRound(b._seg);
        b._segK = 0; b._segPause = seg.pause;
        typeOne(b);
    }
    function typeOne(b) {
        var ch = b._seg[b._segK];
        b._segK++;
        b._shownRaw += ch;
        activeBubble.innerHTML = renderFxText(b._shownMarked + b._segMarked.slice(0, b._segK));
        if (window.RoundtableVoice && !b._replay) RoundtableVoice.pushText(ch);
        if (b._segK % 3 === 0) updatePortraitEmotion(b._meta.speakerId, b._shownRaw);
        stickBottom();
        if (b._segK >= b._seg.length) {
            b._shownMarked += b._segMarked;                   // 一句固化，再开下一句
            b._seg = null;
            updatePortraitEmotion(b._meta.speakerId, b._shownRaw);
            b._timer = setTimeout(function () { pump(b); }, b._segPause || 0);
        } else {
            b._timer = setTimeout(function () { pump(b); }, SPEAK_CHAR_MS());
        }
    }

    function appendDelta(ev) {
        replayMode = ev && Object.prototype.hasOwnProperty.call(ev, 'replay') ? !!ev.replay : false;
        if (!activeBubble) {
            // 容错：丢了 turn_start 也能补一个气泡
            beginSpeech({speakerId:ev.speakerId, role:ev.speakerId === 'host' ? 'host' : ev.speakerId === 'user' ? 'user' : 'ai'});
        }
        var b = activeBubble;
        b._rawFull += ev.text;
        b._clean = stripSpeakerPrefix(b._rawFull);
        if (b._replay || b._meta.role === 'user') {
            // 回放瞬时全显；用户自己的话本就完整上屏，不装打字机
            b._shownRaw = b._clean;
            b._shownMarked = (b._meta.role === 'user') ? b._clean : markRound(b._clean);
            b.innerHTML = renderFxText(b._shownMarked);
            updatePortraitEmotion(ev.speakerId, b._clean);
            stickBottom();
            return;
        }
        if (!b._timer && b._seg == null) pump(b);             // 播放器空闲时新 delta 唤起
    }

    function endSpeech(ev) {
        replayMode = ev && Object.prototype.hasOwnProperty.call(ev, 'replay') ? !!ev.replay : false;
        if (!activeBubble) { if (window.RoundtableVoice) RoundtableVoice.end(); return; }
        var b = activeBubble;
        if (ev && ev.onDone) b._onDone = ev.onDone;
        if (b._replay || b._meta.role === 'user') { finishSpeech(b); return; }
        b._ending = true;                                     // 播放器把剩余缓冲放完后自然 finishSpeech
        if (!b._timer) pump(b);
    }

    function finishSpeech(b) {
        if (b._timer) { clearTimeout(b._timer); b._timer = null; }
        if (b !== activeBubble) return;
        if (window.RoundtableVoice && !b._replay) RoundtableVoice.end();
        if (b._seg != null) { b._shownMarked += b._segMarked; b._seg = null; }
        b.innerHTML = renderFxText(b._shownMarked);           // 最终完整一帧
        b.closest('.sp').classList.remove('typing');          // 打字结束：弹跳动画解禁，整句播一次
        const m = b._meta;
        // 气泡保留最后情绪的定格头像；席位卡恢复 normal00
        if (b._portrait) b._portrait.freeze(b._emotion || 'normal');
        if (seatAnims[m.speakerId]) seatAnims[m.speakerId].mount('normal');
        meeting.transcript.push({
            speakerId: m.speakerId, name: m.name, color: m.color, role: m.role,
            content: b._clean, ts: m.ts || Date.now()         // 存档用清洗后的干净文本
        });
        // 有发言后启用历史记录按钮
        const hBtn = $('historyBtn');
        if (hBtn) hBtn.disabled = false;
        if (m.speakerId !== 'host') setSeatState(m.speakerId, 'idle');
        // Task 12：主持开场结束 → oshiro_move 一次（纯装饰，不绑台词），随后自动切 oshiro_idle
        if (m.speakerId === 'host' && !sceneTriggered) {
            sceneTriggered = true;
            if (window.RoundtableScenes) RoundtableScenes.hostOpeningDone();
        }
        // 主持鸟行为树：主持人闭嘴 / 发言人结束（驻留一会儿后回空闲脑）
        if (window.RoundtableBird && !b._replay) {
            if (m.role === 'host') RoundtableBird.onHostSpeak(false);
            else RoundtableBird.speechEnd(m.speakerId);
        }
        activeBubble = null;
        if (b._onDone) { const fn = b._onDone; b._onDone = null; fn(); }
    }

    // ===== 历史记录弹窗：渲染 meeting.transcript 全部发言 =====
    function historyItemHtml(item) {
        const isHost = item.role === 'host';
        const isUser = item.role === 'user';
        const charName = window.RoundtablePortraits && RoundtablePortraits.charOf(item.speakerId);
        const dispName = EN_NAME[item.speakerId] || item.name;
        const time = new Date(item.ts || Date.now());
        const hhmm = String(time.getHours()).padStart(2,'0') + ':' + String(time.getMinutes()).padStart(2,'0');
        if (!isHost && !isUser && charName) {
            // 角色专属 textbox
            return '<div class="sp tb tb-' + item.speakerId + '">' +
                '<div class="tb-portrait"><img class="b-avatar-img" alt=""></div>' +
                '<div class="tb-body">' +
                    '<div class="tb-name">' + escHtml(dispName) + '</div>' +
                    '<div class="b-bubble tb-text" style="--c:' + item.color + '">' + renderFxText(markRound(stripSpeakerPrefix(item.content))) + '</div>' +
                '</div>' +
            '</div>';
        }
        // 主持人 / 用户 / 无角色头像
        const avatarHtml = isHost
            ? '<div class="b-avatar b-avatar-bird"><img src="Atlases/Gameplay/characters/bird/hover00.png" alt=""></div>'
            : charName
                ? '<div class="b-avatar" style="background:' + item.color + '22"><img class="b-avatar-img" alt=""></div>'
                : '<div class="b-avatar" style="background:' + item.color + '">' + escHtml(dispName.slice(0,1)) + '</div>';
        const titleText = isHost ? '' : (isUser ? '议题主人' : '');
        return '<div class="sp ' + (isHost ? 'host' : isUser ? 'user' : '') + '">' +
            avatarHtml +
            '<div class="b-main">' +
                (isHost ? '' : '<div class="b-meta" style="color:' + item.color + 'cc">'
                    + escHtml(dispName) + (titleText ? ' · ' + escHtml(titleText) : '')
                    + ' · ' + hhmm + '</div>') +
                '<div class="b-bubble" style="--c:' + item.color + '">' + renderFxText(isUser ? item.content : markRound(stripSpeakerPrefix(item.content))) + '</div>' +
            '</div>' +
        '</div>';
    }
    function showHistory() {
        const body = $('historyBody');
        if (!meeting || !meeting.transcript || meeting.transcript.length === 0) {
            body.innerHTML = '<div class="history-empty">还没有发言记录</div>';
        } else {
            body.innerHTML = meeting.transcript.map(historyItemHtml).join('');
            // 角色头像帧定格 normal00
            body.querySelectorAll('img.b-avatar-img').forEach(img => {
                const sp = img.closest('.sp');
                const m = sp && sp.className.match(/tb-(\w+)/);
                if (m && window.RoundtablePortraits) {
                    const anim = RoundtablePortraits.attach(img, m[1]);
                    anim.freeze('normal');
                }
            });
        }
        $('historyMask').classList.add('show');
        body.scrollTop = body.scrollHeight;
    }
    function hideHistory() {
        $('historyMask').classList.remove('show');
    }

    // ===== SSE =====
    // meta 晚于 openStage 到达时，同步席位卡上的名字/头衔（后端给中文名 → 英文映射）
    function updateSeatMeta() {
        speakers.forEach(s => {
            const el = $('seat-' + s.id);
            if (!el) return;
            el.querySelector('.s-name').textContent = s.name;
            if (s.title) el.querySelector('.s-title').textContent = s.title;
        });
    }
    function handleMeta(d) {
        meeting.id = d.sessionId;
        if (d.reconnect) {
            // 断线重连被后端幂等接住：仍是同一场会议，现场 DOM 保留，不回放历史
            reconnectAttempts = 0;
        }
        if (Array.isArray(d.speakers) && d.speakers.length) {
            d.speakers.forEach(s => { if (EN_NAME[s.id]) s.name = EN_NAME[s.id]; });
            speakers = d.speakers;
            updateSeatMeta();
        }
        $('stageMeta').textContent = observerMode
            ? '👁 观察中 · 只读旁听 · Madeline / Theo / You / Granny / Badeline / Oshiro'
            : '自动讨论中 · Madeline / Theo / You / Granny / Badeline / Oshiro';
        // 观察者若其实是本场主人（例如从大厅点进自己的会），允许一键转为参与
        const pBtn = $('participateBtn');
        if (pBtn) pBtn.style.display = (observerMode && d.isOwner) ? '' : 'none';
    }

    // 观察 → 参与：断开庭阅流，用同一议题走 stream 端点（后端幂等复用同一场，不会重开）
    $('participateBtn').addEventListener('click', () => {
        if (!observerMode) return;
        observerMode = false;
        replayMode = false;
        $('participateBtn').style.display = 'none';
        const ob = $('observerBadge'); if (ob) ob.classList.remove('show');
        $('stopBtn').style.display = '';
        $('stopBtn').disabled = false;
        $('interjectRow').style.display = '';
        $('interjectInput').disabled = false;
        setBackText('放弃本场，返回');
        connectStream(meeting.topic || '');
    });
    // stream（会议主人）与 observe（观察者）共享的事件绑定；回放事件带 replay:true
    function bindBus(es) {
        es.addEventListener('meta', e => handleMeta(JSON.parse(e.data)));
        es.addEventListener('turn_prepare', e => {
            const d = JSON.parse(e.data);
            if (d.replay) return;   // 快照只回放发言，不回放调度态
            // 清掉其他席位残留的「准备发言」态（上一位被调度后生成失败跳过时会残留）
            document.querySelectorAll('#seats .seat.prepare').forEach(el => {
                if (el.id !== 'seat-' + d.speakerId) setSeatState(el.id.slice(5), 'idle');
            });
            setSeatState(d.speakerId, 'prepare', d.publicNote || d.note || '');
            // 主持鸟飞到发言者席位上方凑近倾听
            if (window.RoundtableBird) RoundtableBird.focusSeat(d.speakerId);
        });
        es.addEventListener('turn_start', e => beginSpeech(JSON.parse(e.data)));
        es.addEventListener('delta', e => appendDelta(JSON.parse(e.data)));
        es.addEventListener('turn_end', e => endSpeech(JSON.parse(e.data)));
        es.addEventListener('notice', e => addSystemLine(JSON.parse(e.data).text));
        es.addEventListener('pulse', e => renderPulse(JSON.parse(e.data)));
        es.addEventListener('score', e => {
            const score = JSON.parse(e.data);
            renderGradeCard(score);
            // 主持鸟终场演出：低分受击坠落 / 高分投掷庆祝 / 一般鸣叫
            if (window.RoundtableBird && !replayMode) RoundtableBird.onScore(score.avg);
            // 散会彩蛋：西奥最后一次发言透着累 → yolo_solo + yolo 头像演一遍
            if (window.RoundtableVoice) {
                const yoloFired = RoundtableVoice.meetingEnd(meeting.transcript);
                if (yoloFired && seatAnims.theo) seatAnims.theo.playOnce('yolo');
            }
        });
        es.addEventListener('done', e => {
            const d = JSON.parse(e.data);
            manualClose = true;
            if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            meeting.finishedAt = Date.now();
            meeting.score = d.score;
            meeting.status = d.status;
            meeting.rounds = d.rounds || 0;
            finishUI();
            if (!observerMode) saveHistory(meeting);   // 观察者只读，不写本机历史
            es.close();
            // 散会：主持鸟向上飞走
            if (window.RoundtableBird) RoundtableBird.leave();
        });
        es.addEventListener('error', () => {
            // 浏览器在 error 前可能已按原 URL 自动重连过一次：后端 stream 已做同议题幂等，
            // 重连只会挂回同一场会议（只补 meta，不回放、不重跑引擎），所以这里放心手动重连跟随。
            es.close();
            if (manualClose || (meeting && meeting.finishedAt)) return;
            if (reconnectAttempts >= 4) {
                giveUpConnection();
                return;
            }
            if (window.RoundtableVoice) RoundtableVoice.stopAll();
            if (reconnectAttempts === 0) {
                addSystemLine('网络抖动，正在回到同一场讨论…');
            }
            var delay = 800 + reconnectAttempts * 900;
            reconnectAttempts++;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                openBus(connectArg, true);
            }, delay);
        });
    }

    function giveUpConnection() {
        if (window.RoundtableVoice) RoundtableVoice.stopAll();
        if (window.RoundtableBird) RoundtableBird.hide();
        addSystemLine(observerMode ? '旁听连接中断，会议可能已经散场。'
                                   : '连接多次中断，已停止跟随这场讨论（后端会议仍会短时间保留，可稍后从进行中列表重新进入）。');
        $('stopBtn').style.display = 'none';
        $('interjectInput').disabled = true;
    }

    /** 建立（或静默重连）SSE；isReconnect 时不重置舞台、不刷召集提示 */
    function openBus(arg, isReconnect) {
        if (es) { try { es.close(); } catch (e) {} }
        if (!isReconnect) {
            manualClose = false;
            reconnectAttempts = 0;
            connectArg = arg;
        }
        var url;
        if (arg.type === 'observe') {
            url = BASE_URL + '/roundtable/observe/' + encodeURIComponent(arg.id)
                + '?token=' + encodeURIComponent(token);
        } else {
            url = BASE_URL + '/roundtable/stream?token=' + encodeURIComponent(token)
                + '&topic=' + encodeURIComponent(arg.topic);
        }
        es = new EventSource(url);
        bindBus(es);
    }

    function connectStream(topic) {
        $('stopBtn').disabled = false;
        if (window.RoundtableVoice) RoundtableVoice.setLive(true);
        addSystemLine('正在召集众人…');
        openBus({type:'stream', topic:topic}, false);
    }

    // 观察者：先收 transcript 快照（事件带 replay:true，静音/定格），随后接实时事件
    function connectObserve(id) {
        if (window.RoundtableVoice) RoundtableVoice.setLive(true);
        addSystemLine('正在进入旁听席，回放此前发言…');
        openBus({type:'observe', id:id}, false);
    }

    function finishUI() {
        $('stopBtn').style.display = 'none';
        $('interjectInput').disabled = true;
        $('interjectBtn').disabled = true;
        setBackText('返回创建会议');
    }

    // ===== 插话 / 收尾 =====
    function doInterject() {
        const inp = $('interjectInput');
        const text = inp.value.trim();
        if (!text || !meeting || !meeting.id) return;
        FeltPiano.send();
        if (MOCK) {   // mock：本地排队，下一句开场前广播（顺带演示主持鸟冲刺）
            inp.value = '';
            mockQueue.push(text);
            showToast('已加入发言队列', 'info');
            return;
        }
        $('interjectBtn').disabled = true;
        api('/roundtable/' + meeting.id + '/interject', 'POST', {content:text}).then(res => {
            if (res.success) { inp.value = ''; showToast('已加入发言队列', 'info'); }
            else showToast(res.msg || '插话失败', 'info');
        }).finally(() => { $('interjectBtn').disabled = false; inp.focus(); });
    }
    $('interjectBtn').addEventListener('click', doInterject);
    $('interjectInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doInterject(); } });
    // 毛毡钢琴打字音效：议题框普通打字；插话框 Enter 发送播 send 音（与 messages 一致）
    FeltPiano.bind($('topicInput'));
    FeltPiano.bind($('interjectInput'), { enterSend: true });

    // Task 12：舞台 canvas 演出层（素材 manifest 异步加载，start() 时自动等待）
    if (window.RoundtableScenes) RoundtableScenes.attach($('sceneCanvas'));

    $('stopBtn').addEventListener('click', () => {
        if (!meeting || !meeting.id) return;
        $('stopBtn').disabled = true;
        if (MOCK) { if (mockAbort) mockAbort(); return; }
        api('/roundtable/' + meeting.id + '/stop', 'POST').then(res => {
            if (res.success) showToast('将在当前发言结束后结束会议', 'info');
            else { $('stopBtn').disabled = false; showToast(res.msg || '操作失败', 'info'); }
        });
    });

    // 历史记录弹窗
    $('historyBtn').addEventListener('click', showHistory);
    $('historyClose').addEventListener('click', hideHistory);

    // 动画 / 对话框布局：用户滑杆调好后固化的配置（2026-10-05 确认）
    (function () {
        const wrap = document.getElementById('sceneWrap');
        const transcript = $('transcript');
        // 页面高度已解锁（可滚动）：wrap 直接吃满卡片宽度，高度由 aspect-ratio 8:5 推出
        function fitWrap() {
            wrap.style.width = '100%';
            syncSideToWrap();
        }
        function syncSideToWrap() {
            const side = document.querySelector('.studio-side');
            if (!side || !wrap || !wrap.isConnected) return;
            requestAnimationFrame(() => {
                const main = document.querySelector('.studio-main');
                const wR = wrap.getBoundingClientRect();
                const mR = main.getBoundingClientRect();
                side.style.height = wR.height + 'px';
                side.style.marginTop = Math.max(0, wR.top - mR.top) + 'px';
            });
        }
        wrap.style.transform = 'translateY(3%)';
        transcript.style.zoom = 0.99;
        transcript.style.transform = 'translateY(calc(-50% + -115%))';
        fitWrap();
        window.addEventListener('resize', fitWrap);
        // 暴露给 openStage：舞台从 display:none 显示后必须重算（隐藏时量出的尺寸是 0）
        window.rtSyncSide = fitWrap;
    })();
    $('historyMask').addEventListener('click', e => { if (e.target.id === 'historyMask') hideHistory(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideHistory(); });

    $('backLink').addEventListener('click', () => {
        manualClose = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (es) es.close();
        if (window.RoundtableVoice) RoundtableVoice.stopAll();
        if (window.RoundtableBird) RoundtableBird.hide();
        observerMode = false;
        replayMode = false;
        mockAbort = null;
        leaveStageMode();
        renderHistory();
        loadLive();
    });

    // ===== 讨论结果：聚餐场景图（评分仅作内部选图依据，界面不可见） =====
    // final1 僵硬空派 → final5 冰淇淋狂欢，按全场综合均分自动对应
    const RESULT_TIERS = [
        {min:0,  img:1, title:'无人下筷的派',
         flavor:'众人围坐却各怀心事，派原封不动地凉在桌上——这场讨论没能收口，这个议题还得再爬一次山。',
         rc:'rgba(150,165,195,.45)', glow:'rgba(150,165,195,.10)', sheen:'rgba(255,255,255,0)'},
        {min:60, img:2, title:'第一颗草莓',
         flavor:'气氛缓和了些，派上多了一颗草莓。答案还没成形，但至少有人先伸出了手。',
         rc:'rgba(124,192,255,.45)', glow:'rgba(124,192,255,.12)', sheen:'rgba(255,255,255,.10)'},
        {min:70, img:3, title:'草莓派出炉',
         flavor:'满满一炉草莓派端上桌，大家各取一块——观点落了地，这场讨论有了实实在在的收获。',
         rc:'rgba(123,227,155,.45)', glow:'rgba(123,227,155,.14)', sheen:'rgba(255,255,255,.16)'},
        {min:80, img:4, title:'全员点赞',
         flavor:'格子派香气四溢，有人竖起了拇指。每个人都被说服了一点，也说服了别人一点。',
         rc:'rgba(255,205,90,.5)', glow:'rgba(255,205,90,.18)', sheen:'rgba(255,255,255,.22)'},
        {min:90, img:5, title:'派对时间！',
         flavor:'冰淇淋、奶油和草莓堆成了山，全场起立比出手势——这是一场值得举杯的圆满讨论！',
         rc:'rgba(255,157,77,.6)', glow:'rgba(255,157,77,.26)', sheen:'rgba(255,255,255,.32)'}
    ];
    function tierOfAvg(avg) {
        let pick = RESULT_TIERS[0];
        for (const t of RESULT_TIERS) { if ((avg || 0) >= t.min) pick = t; }
        return pick;
    }

    function renderGradeCard(score) {
        meeting.score = score;
        // 结束模式：结局卡片替换动画窗口（隐藏场景与逐字稿，不叠加）
        const main = $('resultArea').closest('.studio-main');
        if (main) main.classList.add('ended');
        const tier = tierOfAvg(score.avg);
        const todos = Array.isArray(score.todos) && score.todos.length
            ? '<div style="margin-top:12px;font-size:13px;color:rgba(200,210,255,.7);">📌 行动待办</div><ul class="todo-list">' +
              score.todos.map(t => '<li>' + escHtml(t) + '</li>').join('') + '</ul>'
            : '';
        $('resultArea').innerHTML =
            '<div class="result-card" style="--rc:' + tier.rc + ';--rcglow:' + tier.glow + ';--sheen:' + tier.sheen + ';">' +
                '<div class="result-scene">' +
                    '<img src="Atlases/Portraits/final' + tier.img + '.png" alt="讨论结果：' + tier.title + '">' +
                '</div>' +
                '<div class="result-caption">' +
                    '<div class="r-title">' + tier.title + '</div>' +
                    '<div class="r-flavor">' + tier.flavor + '</div>' +
                '</div>' +
                (score.comment ? '<div class="grade-comment">' + escHtml(score.comment) + '</div>' : '') +
                todos +
                '<div class="grade-actions">' +
                    '<button class="btn-primary" id="exportJsonBtn" style="padding:9px 18px;">导出 JSON</button>' +
                    '<button class="btn-ghost" id="exportTxtBtn">导出逐字稿 TXT</button>' +
                    '<button class="btn-ghost" id="againBtn">再来一场</button>' +
                '</div>' +
            '</div>';
        $('exportJsonBtn').addEventListener('click', () => downloadJson(meeting));
        $('exportTxtBtn').addEventListener('click', () => downloadTxt(meeting));
        $('againBtn').addEventListener('click', () => {
            leaveStageMode();
            $('topicInput').focus();
        });
        stickBottom();
    }

    // ===== 导出 =====
    function downloadBlob(filename, text, mime) {
        const blob = new Blob([text], {type: mime});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    function downloadJson(m) {
        downloadBlob('roundtable-' + m.id + '.json', JSON.stringify(m, null, 2), 'application/json');
    }
    function downloadTxt(m) {
        const lines = [];
        lines.push('议题：' + m.topic);
        lines.push('时间：' + new Date(m.startedAt).toLocaleString());
        lines.push('================================');
        m.transcript.forEach(t => {
            const tag = t.role === 'host' ? '主持人' : t.name;
            lines.push('[' + tag + '] ' + t.content);
            lines.push('');
        });
        if (m.score) {
            lines.push('================================');
            lines.push('评级：' + m.score.grade + '（' + m.score.avg + '）');
            SCORE_DIMS.forEach(([k, label]) => lines.push(label + '：' + (m.score.scores[k] ?? '-')));
            lines.push('综评：' + (m.score.comment || ''));
            (m.score.todos || []).forEach((t, i) => lines.push((i+1) + '. ' + t));
        }
        downloadBlob('roundtable-' + m.id + '.txt', lines.join('\n'), 'text/plain;charset=utf-8');
    }

    // ===== 历史（服务端落库优先，localStorage 兜底） =====
    let serverHistCache = null;   // 服务端历史缓存：散会/删除后置空重拉
    function localHistory() {
        try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
        catch (e) { return []; }
    }
    async function loadHistory() {
        try {
            const res = await api('/roundtable/history', 'GET', null, 8000);
            if (res && res.success && Array.isArray(res.data)) {
                serverHistCache = res.data.map(x => ({
                    id: x.id, topic: x.topic, rounds: x.rounds || 0,
                    ts: x.ts || Date.now(),
                    grade: x.score ? x.score.grade : undefined,
                    avg: x.score ? x.score.avg : undefined,
                    transcript: x.transcript || [], score: x.score || null,
                    server: true
                }));
                return serverHistCache;
            }
        } catch (e) { /* 未登录 / 网络失败：回落本机 */ }
        if (serverHistCache === null) {
            serverHistCache = localHistory().map(x => Object.assign({}, x, { server: false }));
        }
        return serverHistCache;
    }
    function saveHistory(m) {
        if (!m || !m.score) return;
        serverHistCache = null;   // 服务端已由引擎落库，本地只留备份并在下次重拉
        const list = localHistory();
        list.unshift({
            id: m.id, topic: m.topic, rounds: m.rounds,
            ts: m.finishedAt || Date.now(),
            grade: m.score.grade, avg: m.score.avg,
            transcript: m.transcript, score: m.score
        });
        localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 20)));
    }
    async function renderHistory() {
        const list = await loadHistory();
        const box = $('histList');
        if (!box) return;
        if (!list.length) { box.innerHTML = '<div class="hist-empty">还没有会议记录。</div>'; return; }
        box.innerHTML = '';
        list.forEach((item, idx) => {
            const d = document.createElement('div');
            d.className = 'hist-item';
            const dStr = new Date(item.ts);
            const timeStr = (dStr.getMonth()+1) + '/' + dStr.getDate() + ' ' +
                String(dStr.getHours()).padStart(2,'0') + ':' + String(dStr.getMinutes()).padStart(2,'0');
            const hTier = tierOfAvg(item.avg || (item.score && item.score.avg));
            d.innerHTML =
                '<img class="h-thumb" src="Atlases/Portraits/final' + hTier.img + '.png" alt="">' +
                '<span class="h-topic" title="' + escHtml(item.topic) + '">' + escHtml(item.topic) + '</span>' +
                '<span class="h-time">' + timeStr + ' · ' + item.rounds + '轮</span>' +
                '<button data-act="replay" data-idx="' + idx + '">回看</button>' +
                '<button data-act="del" data-idx="' + idx + '">删除</button>';
            box.appendChild(d);
        });
        box.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.dataset.idx, 10);
                const list2 = await loadHistory();
                if (btn.dataset.act === 'del') {
                    const victim = list2[idx];
                    if (victim && victim.server) {
                        await api('/roundtable/history/' + victim.id, 'DELETE');
                    } else {
                        const local = localHistory();
                        local.splice(idx, 1);
                        localStorage.setItem(HIST_KEY, JSON.stringify(local));
                    }
                    serverHistCache = null;
                    renderHistory();
                } else {
                    replayMeeting(list2[idx]);
                }
            });
        });
    }
    renderHistory();

    /** 回看：用历史数据重建舞台 + 结果场景图，不建立 SSE */
    function replayMeeting(item) {
        replayMode = true;
        observerMode = false;
        if (es) es.close();
        // 回放不发出任何说话音效（setLive(false) 后 start/pushText/meetingEnd 全部空转）
        if (window.RoundtableVoice) RoundtableVoice.setLive(false);
        enterStageMode();
        $('studio').classList.remove('spotlight');
        $('stageTopic').textContent = '议题：' + item.topic;
        $('stageMeta').textContent = new Date(item.ts).toLocaleString() + ' · ' + item.rounds + ' 轮 · 回放';
        const ob = $('observerBadge'); if (ob) ob.classList.remove('show');
        $('stopBtn').style.display = 'none';
        $('interjectRow').style.display = 'none';
        setBackText('返回创建会议');
        const sMain = $('resultArea').closest('.studio-main');
        if (sMain) sMain.classList.remove('ended');
        $('resultArea').innerHTML = '';
        $('transcript').innerHTML = '';

        const seats = $('seats');
        seats.innerHTML = '';
        seatAnims = {};
        FALLBACK_SEATS.forEach(s => {
            const el = document.createElement('div');
            el.className = 'seat done';
            el.id = 'seat-' + s.id;
            el.style.setProperty('--c', s.color);
            const charName = window.RoundtablePortraits && RoundtablePortraits.charOf(s.id);
            const avatarHtml = charName
                ? '<div class="avatar" style="background:' + s.color + '22"><img class="avatar-img" alt=""></div>'
                : '<div class="avatar" style="background:' + s.color + '">' + escHtml(s.name.slice(0,1)) + '</div>';
            el.innerHTML =
                avatarHtml +
                '<div class="s-name">' + escHtml(s.name) + '</div>' +
                '<div class="s-title">' + escHtml(s.title) + '</div>' +
                '<div class="s-state">' + (s.human ? '已参与' : '已发言') + '</div>';
            seats.appendChild(el);
            if (charName) seatAnims[s.id] = RoundtablePortraits.attach(el.querySelector('img.avatar-img'), s.id);
        });

        meeting = {
            id: item.id, topic: item.topic, rounds: item.rounds,
            startedAt: item.ts, finishedAt: item.ts,
            transcript: [], score: item.score
        };
        speakers = FALLBACK_SEATS;
        item.transcript.forEach(t => {
            beginSpeech({speakerId:t.speakerId, role:t.role, name:t.name, color:t.color, ts:t.ts, replay:true});
            appendDelta({speakerId:t.speakerId, replay:true, text:t.content});
            endSpeech({replay:true, ts:t.ts});
        });
        if (item.score) renderGradeCard(item.score);
        $('transcript').scrollTop = 0;
        // 回放：主持鸟静卧在卡片上沿，不动画
        if (window.RoundtableBird) RoundtableBird.perch(stageView.querySelector('.rt-panel'));
    }
})();
