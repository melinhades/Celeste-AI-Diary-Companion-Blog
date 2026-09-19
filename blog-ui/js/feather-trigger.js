// ================================================================
// feather-trigger.js —— 金羽毛触发器（工具类）
// 统一管理金羽毛功能的激活入口，原先散落在 diary.js 保存流程里的
// 「情绪低落 → 建议 → 淡入游戏 / 情绪尚可 → 羽毛随笔」内联逻辑收拢于此，
// 并新增 AI 对话触发通道（AI 在 JSON 回复里带 feather:true 即可发起）。
//
// 核心承诺：绝不打断进行中的说话——建议台词通过说话队列（addMadelineMessage）
// 排在当前对话之后逐字说完，才收起对话框淡入游戏；自带防重入 / 冷却 /
// 打开状态跟踪，重复触发与高频触发都是安全的。
//
// 依赖（均由页面按需暴露，缺失时对应能力自动跳过）：
//   window.FeatherGame         羽毛游戏本体（open / suggestThenOpen）
//   window.showFeatherNote     羽毛随笔弹框（diary.js 提供）
//   window._featherBadMood     旧全局镜像，兼容 diary.js 的 feather-landed 处理器
// ================================================================
(function (global) {
    'use strict';

    // 情绪低落清单：命中 → 完整呼吸游戏；非默认的其他情绪 → 羽毛随笔
    var BAD_MOODS = ['悲伤', '孤独', '不开心', '不安', '愤怒', '怨恨'];
    // AI 主动触发的冷却：一次呼吸游戏足够久，防止 AI 频繁发起打断阅读
    var AI_COOLDOWN_MS = 90 * 1000;
    // 羽毛随笔的延迟：留给保存反馈说完的空隙（与原实现一致）
    var NOTE_DELAY_MS = 2500;

    class FeatherTrigger {
        constructor(options) {
            this.opts = Object.assign({ aiCooldownMs: AI_COOLDOWN_MS }, options || {});
            this.pending = false;     // 一次只允许一个待执行的触发
            this.gameOpen = false;    // 游戏打开状态跟踪
            this.lastAiAt = 0;        // 上次 AI 触发时刻
            var self = this;
            // 游戏生命周期事件（feather-game.js 派发）→ 复位打开状态
            global.addEventListener('feather-finished', function () { self.gameOpen = false; });
            global.addEventListener('feather-opened', function () { self.gameOpen = true; });
        }

        /** 情绪是否属于「低落需呼吸游戏」 */
        isBadMood(emotion) {
            return BAD_MOODS.indexOf(emotion) !== -1;
        }

        /**
         * 主入口：按情绪决定触发形态，是保存流程 / AI 对话 / 其他模块的统一激活方法。
         *
         * @param {string} emotion   触发时的情绪标签（七值白名单之一）
         * @param {object} [options]
         *   source  {'save'|'ai'|'manual'} 触发来源，决定是否套用 AI 冷却
         *   force   {boolean} true 时跳过冷却与打开状态检查（用户显式点击等场景）
         *   suggest {boolean} false 时跳过建议台词直接开游戏（默认 true，带台词过渡）
         * @returns {Promise<boolean>} 是否接受了本次触发（被拒绝返回 false，不抛异常）
         */
        async request(emotion, options) {
            var o = options || {};
            var game = global.FeatherGame;
            if (!game) return false;
            // 防重入 / 已在游戏中：拒绝（force 也无法在游戏打开时重复打开）
            if (this.pending || this.gameOpen) return false;
            // AI 来源套用冷却；保存/手动来源是用户动作链路，不设冷却
            var now = Date.now();
            if (o.source === 'ai' && !o.force && now - this.lastAiAt < this.opts.aiCooldownMs) return false;
            if (o.force) this.lastAiAt = 0;

            emotion = emotion || '默认';
            if (emotion === '默认') return false;   // 中性情绪不打扰

            this.pending = true;
            if (o.source === 'ai') this.lastAiAt = now;
            try {
                if (this.isBadMood(emotion)) {
                    // 镜像到旧全局，兼容 diary.js 的 feather-landed 收尾逻辑
                    global._featherBadMood = true;
                    if (o.suggest !== false && typeof game.suggestThenOpen === 'function') {
                        // suggestThenOpen 内部 await 说话队列：建议台词排在当前对话之后，
                        // 说完、停顿、收对话框，再淡入游戏——不切断任何进行中的说话
                        await game.suggestThenOpen(emotion);
                    } else {
                        await game.open(emotion);
                    }
                } else {
                    // 情绪尚可：只弹羽毛随笔（延迟留给反馈说完的空隙）
                    global._featherBadMood = false;
                    var note = global.showFeatherNote;
                    if (typeof note === 'function') {
                        setTimeout(function () { note(); }, NOTE_DELAY_MS);
                    }
                }
                return true;
            } catch (e) {
                console.warn('FeatherTrigger 触发失败:', e);
                return false;
            } finally {
                this.pending = false;
            }
        }

        /** 便捷方法：AI 对话触发（等价 request(emotion, {source:'ai'})） */
        requestFromAI(emotion) {
            return this.request(emotion, { source: 'ai' });
        }

        /** 便捷方法：保存日记流程触发（等价 request(emotion, {source:'save'})） */
        requestFromSave(emotion) {
            return this.request(emotion, { source: 'save' });
        }
    }

    global.FeatherTrigger = FeatherTrigger;
    // 全局单例：diary.html 引入本文件后即可直接使用
    global.featherTrigger = new FeatherTrigger();
})(window);
