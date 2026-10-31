/**
 * js/lib/diaryApi.js —— 日记域的后端调用清单
 *
 * 存在理由：书架页曾把 `/diary/list?page=1&pageSize=50&type=day` 这类完整查询串
 * 手抄在各功能段里（同一接口两处、参数改动要处处跟），删除/发布/可见性又各自拼 URL。
 * 这里把「接口地址 + 参数形状 + 超时 + 文本长度上限」集中成一份清单，
 * 底层仍然走全站唯一的 api()（js/api.js），返回体保持 { success, data, msg } 原样，
 * 调用方的分支判断一字不改。
 *
 * 约定：
 *   - 每个方法返回 Promise，resolve 出后端原始响应；不在此层做业务兜底；
 *   - 历史/数组类参数在本层做「截断 + 序列化」，与既有调用点口径一致；
 *   - 后端不可用（未加载 api.js）时返回 { success:false, msg:'网络错误' }，
 *     与 api() 自身 catch 的形状一致，调用方无需额外分支。
 */
window.DiaryApi = (function () {

    var PAGE_SIZE = 50;                 // 书架/梦境列表一次取回的历史条数
    var HISTORY_KEEP = 10;              // 随请求上送的历史轮数
    var EMOTION_TEXT_MAX = 1500;        // 情绪分析正文上限
    var REFLECT_TEXT_MAX = 1200;        // 快照寄语正文上限

    /** 统一入口：api() 缺席（脚本加载顺序异常）也不抛错 */
    function call(path, method, body, timeoutMs) {
        if (typeof api !== 'function') {
            return Promise.resolve({ success: false, msg: '网络错误' });
        }
        return api(path, method, body, timeoutMs);
    }
    function recentHistory(list) {
        return JSON.stringify((Array.isArray(list) ? list : []).slice(-HISTORY_KEEP));
    }
    function clamp(text, max) {
        return String(text || '').slice(0, max);
    }

    return {
        // ===== 列表 =====
        /** 日记列表（type: 'day' 普通日记 / 'dream' 梦境日记） */
        list: function (type, page, pageSize) {
            return call('/diary/list?page=' + (page || 1) + '&pageSize=' + (pageSize || PAGE_SIZE)
                + '&type=' + encodeURIComponent(type || 'day'), 'GET');
        },
        listDays: function () { return this.list('day'); },
        listDreams: function () { return this.list('dream'); },

        // ===== 单篇增删 =====
        /** 删掉一篇日记 */
        remove: function (diaryId) {
            return call('/diary?diaryId=' + encodeURIComponent(diaryId), 'DELETE');
        },
        /** 封存一个梦（Madeline 解梦，回复在 data.message） */
        saveDream: function (title, content) {
            return call('/diary/dream', 'POST', { title: title, content: content }, 20000);
        },

        // ===== 发博客 =====
        /** 日记一键发成文章（后端默认私密，返回 data.existed 表示已发过） */
        publishFromDiary: function (diaryId) {
            return call('/articles/publish-from-diary', 'POST', { diaryId: diaryId });
        },
        /** 文章可见性切换（visibility: 1 公开 / 0 私密） */
        setArticleVisibility: function (articleId, visibility) {
            return call('/articles/visibility', 'POST', { articleId: articleId, visibility: visibility });
        },

        // ===== AI 文本分析 =====
        /** 情绪分析（正文上限 1500 字） */
        emotionAnalyze: function (content) {
            return call('/diary/emotion-analyze', 'POST', { content: clamp(content, EMOTION_TEXT_MAX) });
        },
        /** 快照寄语（正文上限 1200 字 + 情绪摘要） */
        snapReflect: function (content, emotionSummary) {
            return call('/diary/snap-reflect', 'POST', {
                content: clamp(content, REFLECT_TEXT_MAX),
                emotion: emotionSummary
            });
        },
        /** Badeline 对话（hearts 为心光谱载荷，由调用方按本地水晶心算好） */
        badelineChat: function (message, historyList, heartsPayload) {
            return call('/diary/badeline-chat', 'POST', {
                message: message,
                history: recentHistory(historyList),
                hearts: heartsPayload
            }, 15000);
        },
        /** 梦境夜话：message 传空串 = 请她主动开一次口 */
        dreamNightTalk: function (dreamId, message, historyList) {
            return call('/diary/dream-night-talk', 'POST', {
                dreamId: dreamId,
                message: message || '',
                history: recentHistory(historyList)
            }, 20000);
        },

        // ===== 收集物计数 =====
        /** 已收集的金羽毛数（dream 场景按它决定天上撒几根） */
        featherCount: function () {
            return call('/feather/count', 'GET');
        }
    };
})();
