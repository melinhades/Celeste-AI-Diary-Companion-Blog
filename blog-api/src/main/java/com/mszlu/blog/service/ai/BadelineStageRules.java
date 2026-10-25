package com.mszlu.blog.service.ai;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * Badeline 关系阶段推导规则（集中配置，调阈值/情绪词只改这里，不动 Service）。
 *
 * 对应六阶段（追逐/对峙/谷底/并肩/山顶/告别），但让它从日记内容自然浮现，不硬排日程。
 * 输出：{近期模式 pattern, 阶段 stage, 阶段说明 hint}
 */
@Component
public class BadelineStageRules {

    /** 负面情绪词（连续下滑 / 低谷判定用） */
    private static final Set<String> NEGATIVE_EMOTIONS = Set.of(
            "不安", "悲伤", "孤独", "愤怒", "疲惫");

    /** 正面情绪词（正在爬出来判定用） */
    private static final Set<String> POSITIVE_EMOTIONS = Set.of(
            "开心", "期待", "满足");

    /** 深谷情绪：连续 3 篇全是这两种 → 告别·沉郁 */
    private static final Set<String> SORROW_EMOTIONS = Set.of(
            "悲伤", "孤独");

    /** 连续观察的近期日记篇数 */
    private static final int RECENT_WINDOW = 3;

    /** 断更阈值（天）：≥ 该天数视为断更 */
    private static final int GAP_DAYS_THRESHOLD = 4;

    /** 长期坚持阈值（天）：≥ 该天数进入山顶阶段 */
    private static final int LONG_TERM_DAYS_THRESHOLD = 30;

    /**
     * 由情绪轨迹与时间间隔推导阶段。
     * @param emotionsAsc 近期日记情绪，按时间旧→新
     * @param dayCount    从第一篇日记到今天的天数（最小 1）
     * @param gapDays     距最新一篇日记的断更天数，-1 表示无日记
     * @param prevGap     最新两篇日记之间的间隔天数，-1 表示不足两篇
     * @return [pattern 近期模式, stage 阶段, hint 阶段说明]
     */
    public String[] evaluate(List<String> emotionsAsc, int dayCount, int gapDays, int prevGap) {
        if (gapDays < 0) {
            return new String[]{"还没有日记", "初遇·试探", "她只在观察，什么都还不确定"};
        }

        List<String> last = emotionsAsc.size() > RECENT_WINDOW
                ? emotionsAsc.subList(emotionsAsc.size() - RECENT_WINDOW, emotionsAsc.size())
                : emotionsAsc;

        boolean allNeg = last.size() == RECENT_WINDOW;
        boolean allSorrow = last.size() == RECENT_WINDOW;
        for (String e : last) {
            if (!NEGATIVE_EMOTIONS.contains(e)) allNeg = false;
            if (!SORROW_EMOTIONS.contains(e)) allSorrow = false;
        }
        boolean climbing = last.size() == RECENT_WINDOW
                && NEGATIVE_EMOTIONS.contains(last.get(0))
                && POSITIVE_EMOTIONS.contains(last.get(RECENT_WINDOW - 1));

        if (allSorrow) {
            return new String[]{"连续的低谷", "告别·沉郁", "最难的日子里，她反而最好"};
        }
        if (allNeg) {
            return new String[]{"连续下滑", "谷底", "「行了。你赢了。」——安静、脆弱、挫败"};
        }
        if (climbing) {
            return new String[]{"正在爬出来", "并肩", "「不错。别得寸进尺。」——嘴硬地支持"};
        }
        if (gapDays >= GAP_DAYS_THRESHOLD) {
            return new String[]{"断更中", "对峙·退避", "她退开了——两种防御之一"};
        }
        if (prevGap >= GAP_DAYS_THRESHOLD) {
            return new String[]{"刚从断更中回来", "并肩", "回来了，谈开了——嘴硬，但站在同一边"};
        }
        if (dayCount >= LONG_TERM_DAYS_THRESHOLD) {
            return new String[]{"长期坚持", "山顶", "里程碑附近——真心地骄傲（用她自己的方式）"};
        }
        return new String[]{"平稳起伏", "追逐·共处", "尖锐、讽刺、试探——「你以为你是谁啊，天天写日记？」"};
    }
}
