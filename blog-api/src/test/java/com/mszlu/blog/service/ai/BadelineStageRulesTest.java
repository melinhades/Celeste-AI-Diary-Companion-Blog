package com.mszlu.blog.service.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Badeline 关系阶段推导规则全分支回归。
 *
 * 该类在静态分析清零中被重构过（魔数抽常量、循环替代手工判断），
 * 此测试锁定六阶段判定语义与优先级顺序，防止后续调阈值时改坏分支。
 *
 * 判定优先级（高 → 低）：
 * 无日记 → 连续全悲伤(告别·沉郁) → 连续全负面(谷底) → 负转正(并肩·爬出)
 * → 断更≥4天(对峙·退避) → 刚从断更回来(并肩) → ≥30天(山顶) → 默认(追逐·共处)
 */
class BadelineStageRulesTest {

    private final BadelineStageRules rules = new BadelineStageRules();

    /** 断言三元组：[近期模式, 阶段, 阶段说明] */
    private void assertStage(String expectedPattern, String expectedStage,
                             List<String> emotions, int dayCount, int gapDays, int prevGap) {
        String[] r = rules.evaluate(emotions, dayCount, gapDays, prevGap);
        assertEquals(expectedPattern, r[0], "pattern");
        assertEquals(expectedStage, r[1], "stage");
        assertNotNull(r[2], "hint 不应为空");
        assertFalse(r[2].isBlank(), "hint 不应为空白");
    }

    // ================= 无日记 =================

    @Test
    void noDiary_returnsInitialStage() {
        String[] r = rules.evaluate(List.of(), 1, -1, -1);
        assertEquals("还没有日记", r[0]);
        assertEquals("初遇·试探", r[1]);
        assertEquals("她只在观察，什么都还不确定", r[2]);
    }

    @Test
    void noDiary_ignoresOtherArgs() {
        // gapDays=-1 时其余参数不生效
        assertStage("还没有日记", "初遇·试探", List.of("悲伤", "悲伤", "悲伤"), 99, -1, 99);
    }

    // ================= 告别·沉郁（连续 3 篇全悲伤/孤独） =================

    @Test
    void threeAllSorrow_returnsFarewellGloom() {
        assertStage("连续的低谷", "告别·沉郁",
                List.of("悲伤", "孤独", "悲伤"), 10, 0, 1);
    }

    @Test
    void allSorrow_beatsAllNegative() {
        // 悲伤/孤独同时属于负面词与深谷词：全悲伤时深谷分支优先于谷底分支
        assertStage("连续的低谷", "告别·沉郁",
                List.of("孤独", "孤独", "孤独"), 10, 0, 1);
    }

    @Test
    void twoSorrowOnly_notEnough() {
        // 不足 3 篇：不触发深谷判定，落到后续分支
        assertStage("平稳起伏", "追逐·共处",
                List.of("悲伤", "孤独"), 10, 0, 1);
    }

    // ================= 谷底（连续 3 篇全负面但不全是悲伤孤独） =================

    @Test
    void threeAllNegative_mixed_returnsValley() {
        assertStage("连续下滑", "谷底",
                List.of("不安", "疲惫", "愤怒"), 10, 0, 1);
    }

    @Test
    void negativeWithOnePositive_notValley() {
        // 混了一篇正面 → 不是全负面
        String[] r = rules.evaluate(List.of("不安", "开心", "愤怒"), 10, 0, 1);
        assertNotEquals("谷底", r[1]);
        assertNotEquals("告别·沉郁", r[1]);
    }

    // ================= 正在爬出来（负 → 正） =================

    @Test
    void negativeToPositive_returnsClimbing() {
        assertStage("正在爬出来", "并肩",
                List.of("悲伤", "不安", "开心"), 10, 0, 1);
    }

    @Test
    void climbing_allowsAnyMiddle() {
        // 中间篇情绪不限，只要首篇负面、末篇正面
        assertStage("正在爬出来", "并肩",
                List.of("疲惫", "愤怒", "期待"), 10, 0, 1);
    }

    @Test
    void climbing_requiresThreeEntries() {
        // 只有 2 篇负转正不触发（窗口固定 3 篇）
        String[] r = rules.evaluate(List.of("不安", "开心"), 10, 0, 1);
        assertNotEquals("正在爬出来", r[0]);
    }

    @Test
    void positiveToNegative_notClimbing() {
        // 方向反过来（正 → 负）不算爬出来；但注意全负面分支也不满足（首篇正面）
        String[] r = rules.evaluate(List.of("开心", "不安", "悲伤"), 10, 0, 1);
        assertNotEquals("正在爬出来", r[0]);
        assertNotEquals("谷底", r[1]);
    }

    @Test
    void climbing_beatsGap() {
        // 判定顺序：负转正先于断更 —— 即使断更 5 天，只要近 3 篇在爬升仍判并肩
        assertStage("正在爬出来", "并肩",
                List.of("悲伤", "不安", "满足"), 10, 5, 6);
    }

    // ================= 断更（≥4 天） =================

    @Test
    void gap4Days_returnsStandoff() {
        assertStage("断更中", "对峙·退避",
                List.of("开心"), 10, 4, 1);
    }

    @Test
    void gap3Days_notStandoff() {
        String[] r = rules.evaluate(List.of("开心"), 10, 3, 1);
        assertNotEquals("对峙·退避", r[1]);
    }

    @Test
    void gapBeatsPrevGap() {
        // 当前断更与上次间隔都超阈值：当前断更优先
        assertStage("断更中", "对峙·退避",
                List.of("开心"), 10, 7, 6);
    }

    // ================= 刚从断更回来（prevGap ≥4 天） =================

    @Test
    void prevGap4Days_returnsBackTogether() {
        assertStage("刚从断更中回来", "并肩",
                List.of("开心"), 10, 0, 4);
    }

    @Test
    void prevGap3Days_notBackTogether() {
        String[] r = rules.evaluate(List.of("开心"), 10, 0, 3);
        assertNotEquals("刚从断更中回来", r[0]);
    }

    // ================= 山顶（≥30 天长期坚持） =================

    @Test
    void day30_returnsSummit() {
        assertStage("长期坚持", "山顶",
                List.of("开心", "期待"), 30, 0, 1);
    }

    @Test
    void day29_notSummit() {
        String[] r = rules.evaluate(List.of("开心", "期待"), 29, 0, 1);
        assertNotEquals("山顶", r[1]);
    }

    @Test
    void summit_losesToAllNegative() {
        // 优先级：全负面判定先于长期坚持 —— 坚持 30 天但近 3 篇全负面仍是谷底
        assertStage("连续下滑", "谷底",
                List.of("不安", "疲惫", "愤怒"), 30, 0, 1);
    }

    // ================= 默认：追逐·共处 =================

    @Test
    void steadyFluctuation_returnsChase() {
        assertStage("平稳起伏", "追逐·共处",
                List.of("开心", "期待"), 10, 0, 1);
    }

    @Test
    void emptyEmotions_withDiary_returnsChase() {
        // gapDays>=0 表示有日记，但情绪列表为空（数据异常兜底）→ 默认分支
        assertStage("平稳起伏", "追逐·共处", List.of(), 5, 0, -1);
    }

    // ================= 滑动窗口：只看最近 3 篇 =================

    @Test
    void window_onlyLast3Matter() {
        // 前两篇开心不影响，最近 3 篇全悲伤孤独 → 告别·沉郁
        assertStage("连续的低谷", "告别·沉郁",
                List.of("开心", "开心", "悲伤", "孤独", "悲伤"), 10, 0, 1);
    }

    @Test
    void window_exactly3_usesAll() {
        assertStage("正在爬出来", "并肩",
                List.of("不安", "悲伤", "开心"), 10, 0, 1);
    }

    @Test
    void unknownEmotion_treatedAsNeitherPositiveNorNegative() {
        // 词表之外的情绪（如「平静」）：不满足任何负面/正面判定 → 默认分支
        assertStage("平稳起伏", "追逐·共处",
                List.of("平静", "平静", "平静"), 10, 0, 1);
    }
}
