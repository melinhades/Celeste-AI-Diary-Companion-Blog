/**
 * js/lib/store.js —— 本地状态访问层（唯一出口）
 *
 * 存在理由：全站有二十多个 localStorage 键散落在各页面里裸读写，
 * 每个调用点各自写一遍 `JSON.parse(getItem(k) || 'null')` + try/catch，
 * 键名靠魔法字符串、隐私模式抛错靠运气、账号隔离清单（api.js USER_SCOPED_KEYS）
 * 与真实用法各写各的、早晚漂移。这里只做一件事：把「读/写/删」收敛成带类型的几个函数，
 * 并维护一份键清单。底层仍然是同一个 localStorage，不改变任何存储格式与时机。
 *
 * 约定：
 *   - 对象/数组由 set 自动 JSON 序列化，读取走 getJson；
 *   - 数字 / 布尔标志按裸字符串存（与历史数据完全兼容，不迁移、不改写）；
 *   - 隐私模式 / quota 超限一律静默降级（与既有调用点的 try/catch 行为一致）。
 */
window.Store = (function () {

    // ===== 键清单：新增键先在这里登记，再写业务代码 =====
    var KEYS = {
        // 认证与账号（api.js / auth.js 拥有语义，本层只作读写通道）
        TOKEN: 'token',
        NICKNAME: 'nickname',
        ACCOUNT: '__account',
        // 日记与明信片
        DIARY_SAVE_COUNT: 'diarySaveCount',   // 累计保存篇数（int）
        DIARY_STREAK: 'diaryStreak',          // 连续天数（int）
        DIARY_LAST_SAVE_DATE: 'diaryLastSaveDate',
        DIARY_UNSAVED: 'diaryUnsaved',
        DIARY_SNAPSHOTS: 'diarySnapshots',    // 书架快照卡（json 数组）
        DIARY_CHAT_SESSION_ID: 'diaryChatSessionId',
        DIARY_FAREWELL: 'diaryFarewell',
        POSTCARD_DATE: 'postcardDate',        // 每日明信片「今天已弹过」
        DAILY_POSTCARD_CACHE: 'dailyPostcardCache',
        // 草莓钱包
        BERRY_BALANCE: 'berryBalance',
        BERRY_OWNED: 'berryOwned',            // 已拥有的收集物（json 数组）
        // 心门 / 水晶心
        HEART_DOOR_LIT: 'heartDoorLit',       // 已点亮颗数（int）
        HEART_DOOR_SPLIT: 'heartDoorSplit',   // 分裂动画已播过（flag）
        HEART_DOOR_HEARTS: 'heartDoorHearts', // 已炼成的水晶心（json 数组）
        HEART_CRYSTAL_DAY: 'heartCrystalDay', // 当日首颗（json 对象）
        CRYSTAL_HEART: 'crystalHeart',        // 最近一颗（json 对象）
        // 镜之房间
        MIRROR_BROKEN: 'mirrorBroken',        // 镜子真正碎裂过（flag，不可逆；canvas/DOM 两种模式都写）
        DREAM_DASH: 'dreamDash',              // 梦块（果冻）已激活（flag，不可逆）
        // dream 场景的鸟群
        DREAM_BIRD_TIP: 'dreamBirdTip',       // 金色鸟的首次操作引导已看过（flag，设备级）
        // Badeline
        BADELINE_CHAT_LOG: 'badelineChatLog', // 对话历史（json 数组，只留最近 20 条）
        // 情绪 / 访客 / 播放进度
        LAST_EMOTION: 'lastEmotion',
        MADELINE_EMOTION: 'madeline_emotion',
        PM_LAST_VISIT: 'pmLastVisit',         // 上次到访时间戳（int）
        RT_BIRD_SFX_MUTED: 'rtBirdSfxMuted',  // 圆桌主持鸟音效静音（flag）
        BGM_TIME_SHELF: 'bgmTimeShelf',       // 书架 BGM 续播位置（float，设备级不入账号清单）
        SHELF_ADJ: 'shelfAdj'                 // 旧版镜框调节残留，加载时清除
    };

    // ===== 底层三个原子操作：所有异常都在这层吞掉 =====
    function raw(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }
    function drop(key) {
        try { localStorage.removeItem(key); return true; } catch (e) { return false; }
    }

    /** 字符串读取，缺失/空串回 fallback */
    function get(key, fallback) {
        var v = raw(key);
        return v === null || v === '' ? (fallback === undefined ? '' : fallback) : v;
    }
    /** 整数读取；无法解析时返回 NaN（与 parseInt 语义一致，调用方自己 isNaN 兜底） */
    function getInt(key, fallback) {
        var v = raw(key);
        if (v === null || v === '') return fallback === undefined ? 0 : fallback;
        return parseInt(v, 10);
    }
    /** 浮点读取（BGM 续播位置等） */
    function getFloat(key, fallback) {
        var v = raw(key);
        if (v === null || v === '') return fallback === undefined ? 0 : fallback;
        return parseFloat(v);
    }
    /** 布尔标志：历史约定「存 '1' 即为真」 */
    function getFlag(key) {
        return raw(key) === '1';
    }
    /** JSON 读取，解析失败或无值返回 fallback */
    function getJson(key, fallback) {
        var v = raw(key);
        if (v === null || v === '') return fallback;
        try {
            var parsed = JSON.parse(v);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) { return fallback; }
    }

    /** 写入：字符串/数字/布尔按裸值存（与历史数据同格式），对象/数组走 JSON */
    function set(key, value) {
        if (value !== null && typeof value === 'object') return write(key, JSON.stringify(value));
        return write(key, String(value));
    }
    function setFlag(key, on) {
        return on ? write(key, '1') : drop(key);
    }

    var api = {
        KEYS: KEYS,
        get: get,
        getInt: getInt,
        getFloat: getFloat,
        getFlag: getFlag,
        getJson: getJson,
        set: set,
        setFlag: setFlag,
        remove: drop,
        // 语义糖：书架各处常用口径
        count: function (key) { var n = getInt(key, 0); return isNaN(n) ? 0 : n; }
    };
    return api;
})();
