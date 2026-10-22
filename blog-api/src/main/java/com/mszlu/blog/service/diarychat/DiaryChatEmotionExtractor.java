package com.mszlu.blog.service.diarychat;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.dao.pojo.Diary;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * Madeline 日记多轮反应 · 深度情绪提取 v2
 * <p>
 * v1（扁平 5 分类 + 硬阈值轨迹 + 固定权重 0.7/0.3）— 已废弃
 * v2 六个核心升级：
 * ─────────────────────────────────────────────────────
 * （一）情绪表示层：Plutchik 情绪轮三层 [8 基本 × 强度 1-5 × 极性 +/-] + 情绪锚点定位 + 情绪矛盾检测
 * （二）纯文本侧：扩展词典（否定/程度/转折）+ AiClient.embed 交叉验证 + 跨日记趋势
 * （三）打字轨迹侧：按键级原始特征（间隔均值/方差/自相关/z-score 异常检测）替换硬阈值
 * （四）融合层：自适应权重（信号质量自适应，不固定 0.7/0.3）
 * （五）可解释性：每次输出 detail JSON（写入 diary_chat_log.emotion_score_detail）
 * （六）EMOTION_WORDS ↔ Plutchik 桥接：前端 6 类 → 后端 Plutchik 8 类
 * ─────────────────────────────────────────────────────
 * 技术栈约束：Spring Boot 2.5.0 + 无 Spring AI + 无新依赖
 * 复用：AiClient.chat / chat(jsonMode) / embed、DiaryMapper.selectList
 */
@Component
@Slf4j
public class DiaryChatEmotionExtractor {

    // ────────────────────────────────────────────────────
    // ① Plutchik 情绪轮 8 个基本情绪的中文标签 + 原型句（用于 embedding cosine 交叉验证）
    // ────────────────────────────────────────────────────
    private static final String[] PLUTCHIK_EMOTIONS = {
            "joy",          // 快乐
            "sadness",      // 悲伤
            "trust",        // 信任
            "disgust",      // 厌恶
            "fear",         // 恐惧
            "anger",        // 愤怒
            "surprise",     // 惊讶
            "anticipation"  // 期待
    };
    private static final Map<String, String> PLUTCHIK_ZH = new LinkedHashMap<>();
    private static final String[] PLUTCHIK_PROTOTYPES = {
            "我感到非常高兴和满足，一切都很美好",        // joy
            "我感到悲伤和失落，心情很低落",               // sadness
            "我相信他，感到被信任和被爱",               // trust
            "我对这件事感到反感和厌恶",                   // disgust
            "我感到害怕和焦虑，担心会发生坏事",           // fear
            "我感到愤怒和生气，无法原谅",                 // anger
            "我感到很惊讶，完全没有预料到",               // surprise
            "我对未来充满期待，准备好迎接新的开始"         // anticipation
    };

    // ────────────────────────────────────────────────────
    // ② 前端 EMOTION_WORDS（6 类）→ Plutchik 桥接表
    // ────────────────────────────────────────────────────
    private static final Map<String, String[]> FRONTEND_TO_PLUTCHIK = new LinkedHashMap<>();

    // ────────────────────────────────────────────────────
    // ③ 否定前缀 / 程度副词 / 转折词 —— 纯文本侧规则
    // ────────────────────────────────────────────────────
    private static final String[] NEGATION_PREFIXES  = {"不", "没", "别", "未", "非", "无", "没有", "不是"};
    private static final String[][] DEGREE_WORDS     = {
            {"非常", "特别", "十分", "极其", "万分", "无比"},            // ×1.5
            {"很", "真的", "确实", "实在", "太"},                      // ×1.2
            {"有点", "稍微", "略微", "些许", "些微"},                  // ×0.7
            {"不大", "不太"}                                          // ×0.5
    };
    private static final double[] DEGREE_FACTORS = {1.5, 1.2, 0.7, 0.5};
    private static final String[] CONTRAST_WORDS = {"但是", "可是", "不过", "然而", "虽然", "尽管", "只是"};

    // ────────────────────────────────────────────────────
    // ④ 情绪关键词统一词表（fallback/locateAnchor/detectConflict 共用，避免三处漂移）
    // ────────────────────────────────────────────────────
    private static final Map<String, String[]> PLUTCHIK_KEYWORDS = new LinkedHashMap<>();
    private static final String[] POS_KEYWORDS = {"开心","快乐","棒","好","成功","喜欢","爱","感谢","满足","幸福","温暖","希望"};
    private static final String[] NEG_KEYWORDS = {"难过","痛苦","累","烦","绝望","崩溃","焦虑","害怕","愤怒","讨厌","孤独","失落","哭","泪"};

    // ────────────────────────────────────────────────────
    // ⑤ 轨迹特征 z-score 基线（Welford 在线算法更新 mean/M2/count）
    // ────────────────────────────────────────────────────
    private final Map<String, double[]> trajectoryBaseline = new java.util.concurrent.ConcurrentHashMap<>(); // key=userId, value=[mean, M2, count]

    static {
        PLUTCHIK_ZH.put("joy",          "快乐");
        PLUTCHIK_ZH.put("sadness",      "悲伤");
        PLUTCHIK_ZH.put("trust",        "信任");
        PLUTCHIK_ZH.put("disgust",      "厌恶");
        PLUTCHIK_ZH.put("fear",         "恐惧");
        PLUTCHIK_ZH.put("anger",        "愤怒");
        PLUTCHIK_ZH.put("surprise",     "惊讶");
        PLUTCHIK_ZH.put("anticipation", "期待");

        FRONTEND_TO_PLUTCHIK.put("不安",   new String[]{"fear", "anticipation"});     // 焦虑 → 恐惧+负期待
        FRONTEND_TO_PLUTCHIK.put("惊讶",   new String[]{"surprise"});                 // 惊讶 → 惊讶
        FRONTEND_TO_PLUTCHIK.put("怨恨",   new String[]{"anger", "disgust"});          // 怨恨 → 愤怒+厌恶
        FRONTEND_TO_PLUTCHIK.put("不开心", new String[]{"sadness"});                  // 不开心 → 悲伤
        FRONTEND_TO_PLUTCHIK.put("可爱",   new String[]{"joy", "trust"});              // 开心 → 快乐+信任
        FRONTEND_TO_PLUTCHIK.put("无语",   new String[]{"disgust"});                  // 无语 → 低厌恶

        // 情绪关键词统一词表（供 fallback/locateAnchor/detectConflict 共用）
        PLUTCHIK_KEYWORDS.put("sadness",      new String[]{"难过","悲伤","痛苦","失落","沮丧","崩溃","哭","泪","绝望","孤独"});
        PLUTCHIK_KEYWORDS.put("anger",        new String[]{"愤怒","生气","恨","讨厌","烦","恼火","可恶","凭什么","不公"});
        PLUTCHIK_KEYWORDS.put("fear",         new String[]{"害怕","恐惧","焦虑","担心","紧张","不安","怕","心慌","忐忑"});
        PLUTCHIK_KEYWORDS.put("disgust",      new String[]{"厌恶","反感","恶心","无语","受不了"});
        PLUTCHIK_KEYWORDS.put("joy",          POS_KEYWORDS);
        PLUTCHIK_KEYWORDS.put("trust",        new String[]{"相信","信任","被爱","被信任"});
        PLUTCHIK_KEYWORDS.put("surprise",     new String[]{"惊讶","意外","震惊","没想到","居然","竟然"});
        PLUTCHIK_KEYWORDS.put("anticipation", new String[]{"期待","希望","打算","准备","盼望"});
    }

    @Autowired private AiClient aiClient;
    @Autowired private DiaryMapper diaryMapper;

    // 消融实验开关（全部默认为 false = 启用）
    @Value("${emotion.ablation.disable-text:false}")       private boolean disableText;
    @Value("${emotion.ablation.disable-embed:false}")      private boolean disableEmbed;
    @Value("${emotion.ablation.disable-trajectory:false}") private boolean disableTrajectory;
    @Value("${emotion.ablation.disable-trend:false}")      private boolean disableTrend;
    @Value("${emotion.ablation.disable-fusion:false}")     private boolean disableFusion;

    // ────────────────────────────────────────────────────
    // ⑥ Plutchik 原型句 embedding 缓存（懒初始化，避免每次 8 次 API 调用）
    // ────────────────────────────────────────────────────
    private volatile float[][] prototypeVectors;
    private synchronized void ensurePrototypeVectors() {
        if (prototypeVectors != null) return;
        float[][] vecs = new float[PLUTCHIK_PROTOTYPES.length][];
        int validCount = 0;
        for (int i = 0; i < PLUTCHIK_PROTOTYPES.length; i++) {
            float[] v = aiClient.embed(PLUTCHIK_PROTOTYPES[i]);
            if (v != null && v.length > 0) { vecs[i] = v; validCount++; }
        }
        // 全部失败时：保持 null，调用方降级
        if (validCount > 0) prototypeVectors = vecs;
    }

    // ────────────────────────────────────────────────────
    // ⑤ 内部数据类
    // ────────────────────────────────────────────────────
    public static class EmotionResult {
        public String emotionType;
        public BigDecimal score;
        public BigDecimal textScore;
        public BigDecimal trajectoryScore;
        public String emotionScoreDetail;   // v2 新增：完整 JSON
        public String confidence;           // v2 新增：high/medium/low

        public EmotionResult(String emotionType, BigDecimal score, BigDecimal textScore,
                             BigDecimal trajectoryScore, String emotionScoreDetail, String confidence) {
            this.emotionType = emotionType;
            this.score = score;
            this.textScore = textScore;
            this.trajectoryScore = trajectoryScore;
            this.emotionScoreDetail = emotionScoreDetail;
            this.confidence = confidence;
        }
    }

    // ────────────────────────────────────────────────────
    // 入口点：companionStream 入口处调
    // ────────────────────────────────────────────────────
    public EmotionResult extract(String diaryText, String typingSignalJson, String userId) {
        JSONObject detail = new JSONObject();
        JSONObject ablationFlags = new JSONObject();
        ablationFlags.put("disable_text",      disableText);
        ablationFlags.put("disable_embed",      disableEmbed);
        ablationFlags.put("disable_trajectory", disableTrajectory);
        ablationFlags.put("disable_trend",      disableTrend);
        ablationFlags.put("disable_fusion",     disableFusion);
        detail.put("ablation_flags", ablationFlags);

        // ========== （二）纯文本侧 + Embedding 交叉验证（P1：两个 AI 调用并行，减少 SSE 首帧延迟） ==========
        final String finalText = diaryText;
        java.util.concurrent.CompletableFuture<JSONObject> textFuture =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    if (disableText) {
                        JSONObject fb = fallbackKeywordAnalysis(finalText);
                        fb.put("ablation_note", "text-module-disabled-used-keyword-fallback");
                        return fb;
                    }
                    return analyzeTextSide(finalText);
                });
        java.util.concurrent.CompletableFuture<JSONObject> embedFuture =
                java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                    if (disableEmbed) {
                        JSONObject sk = new JSONObject();
                        sk.put("confidence", "skipped");
                        sk.put("ablation_note", "embed-module-disabled");
                        return sk;
                    }
                    return crossValidateByEmbed(finalText, null); // 先不算 difference，拿到 plutchikPrimary 后补
                });

        JSONObject textAnalysis = textFuture.join();
        BigDecimal textScore = textAnalysis.getBigDecimal("score");
        String plutchikPrimary = textAnalysis.getString("plutchikPrimary");
        String plutchikSecondary = textAnalysis.getString("plutchikSecondary");
        int intensity = textAnalysis.getIntValue("intensity");
        int valence = textAnalysis.getIntValue("valence");

        // 情绪锚点定位：G3 优先用 LLM 返回的 anchor_start/end，无效则回退规则匹配
        JSONObject anchor;
        int llmAnchorStart = textAnalysis.getIntValue("anchorStart");
        int llmAnchorEnd = textAnalysis.getIntValue("anchorEnd");
        if (diaryText != null && llmAnchorStart >= 0 && llmAnchorEnd > llmAnchorStart && llmAnchorEnd <= diaryText.length()) {
            anchor = new JSONObject();
            anchor.put("text", diaryText.substring(llmAnchorStart, llmAnchorEnd));
            anchor.put("start", llmAnchorStart);
            anchor.put("end", llmAnchorEnd);
            anchor.put("source", "llm");
        } else {
            anchor = locateAnchor(diaryText, plutchikPrimary);
            anchor.put("source", "keyword");
        }
        textAnalysis.put("anchor", anchor);

        // 情绪矛盾检测
        JSONObject conflict = detectConflict(diaryText);
        textAnalysis.put("conflict", conflict);

        // 等 embed 结果回来，补算 difference_to_ai
        JSONObject embedValidation = embedFuture.join();
        if (!disableEmbed && plutchikPrimary != null) {
            Object cosObj = embedValidation.get("_cosines");
            if (cosObj instanceof double[]) {
                double[] cosines = (double[]) cosObj;
                int aiIdx = indexOf(PLUTCHIK_EMOTIONS, plutchikPrimary);
                if (aiIdx >= 0 && cosines.length > aiIdx) {
                    int topIdx = argmax(cosines);
                    double difference = Math.abs(cosines[topIdx] - cosines[aiIdx]);
                    embedValidation.put("difference_to_ai", difference);
                    if (difference > 0.2) embedValidation.put("confidence", "low");
                }
            }
            embedValidation.remove("_cosines"); // 补算完移除临时数组，不落库
        }
        textAnalysis.put("embedValidation", embedValidation);

        // ========== （三）打字轨迹侧（可关） ==========
        JSONObject trajAnalysis;
        if (disableTrajectory) {
            trajAnalysis = new JSONObject();
            trajAnalysis.put("score", 0.0);
            trajAnalysis.put("ablation_note", "trajectory-module-disabled");
        } else {
            trajAnalysis = analyzeTrajectory(typingSignalJson, userId);
        }
        BigDecimal trajectoryScore = trajAnalysis.getBigDecimal("score");

        // ========== 跨日记趋势（可关） ==========
        JSONObject longTerm;
        if (disableTrend) {
            longTerm = new JSONObject();
            longTerm.put("ablation_note", "trend-module-disabled");
            longTerm.put("ma7", 0.5); longTerm.put("slope", 0.0); longTerm.put("long_term_distress", false);
        } else {
            longTerm = analyzeCrossDiaryTrend(userId);
        }
        detail.put("long_term", longTerm);

        // ========== （四）融合（可关 → 退回固定权重 0.7/0.3） ==========
        JSONObject fusion;
        if (disableFusion) {
            fusion = new JSONObject();
            double fused = 0.7 * textScore.doubleValue() + 0.3 * trajectoryScore.doubleValue();
            fusion.put("finalScore", clamp(fused));
            fusion.put("confidence", "medium");
            JSONObject weights = new JSONObject();
            weights.put("text_weight", 0.7); weights.put("trajectory_weight", 0.3);
            fusion.put("weights", weights);
            fusion.put("ablation_note", "fusion-disabled-fixed-0.7-0.3");
        } else {
            fusion = adaptiveFusion(textAnalysis, trajAnalysis, longTerm);
        }
        // R2/R4：BigDecimal null 保护
        BigDecimal finalScore = fusion.getBigDecimal("finalScore");
        if (finalScore == null) finalScore = BigDecimal.ZERO;
        String confidence = fusion.getString("confidence");
        if (confidence == null) confidence = "low";

        // R4：textScore/trajectoryScore null 保护
        if (textScore == null) textScore = BigDecimal.ZERO;
        if (trajectoryScore == null) trajectoryScore = BigDecimal.ZERO;

        // ========== 组装 detail JSON ==========
        JSONObject plutchik = new JSONObject();
        plutchik.put("primary", plutchikPrimary);
        plutchik.put("primary_zh", PLUTCHIK_ZH.get(plutchikPrimary));
        plutchik.put("secondary", plutchikSecondary);
        plutchik.put("secondary_zh", PLUTCHIK_ZH.get(plutchikSecondary));
        plutchik.put("intensity", intensity);
        plutchik.put("valence", valence);
        detail.put("plutchik", plutchik);
        detail.put("anchor", anchor);
        detail.put("conflict", conflict);
        detail.put("text_score", textScore);
        detail.put("text_confidence", embedValidation.get("confidence"));
        detail.put("embed_validation", embedValidation);
        detail.put("trajectory", trajAnalysis);
        detail.put("fusion_weights", fusion.getJSONObject("weights"));
        detail.put("final_score", finalScore);
        detail.put("final_confidence", confidence);

        // Plutchik → 前端兼容的 emotionType 输出
        String emotionType = plutchikToFrontendEmotion(plutchikPrimary, valence);

        // R3：detail JSON 长度截断（MySQL TEXT 最大 65535 字节，留安全余量到 60000 字符）
        String detailJson = detail.toJSONString();
        if (detailJson.length() > 60000) {
            detailJson = detailJson.substring(0, 60000) + "...[truncated]";
        }

        return new EmotionResult(emotionType,
                finalScore.setScale(3, RoundingMode.HALF_UP),
                textScore.setScale(3, RoundingMode.HALF_UP),
                trajectoryScore.setScale(3, RoundingMode.HALF_UP),
                detailJson,
                confidence);
    }

    /** 向后兼容：extract 不带 userId 时（无跨日记趋势） */
    public EmotionResult extract(String diaryText, String typingSignalJson) {
        return extract(diaryText, typingSignalJson, null);
    }

    // ────────────────────────────────────────────────────
    // （二）纯文本侧 AI 分析 —— Plutchik 三层 + 程度/否定/转折
    // ────────────────────────────────────────────────────
    private JSONObject analyzeTextSide(String text) {
        JSONObject result = new JSONObject();
        if (text == null || text.trim().isEmpty()) {
            result.put("score", 0.0);
            result.put("plutchikPrimary", "joy");
            result.put("plutchikSecondary", "trust");
            result.put("intensity", 1);
            result.put("valence", 1);
            return result;
        }

        String prompt = "你是严格的 Plutchik 情绪分析器。分析以下中文日记文本的情绪。\n" +
                "只输出严格 JSON，不输出其他文字。格式：\n" +
                "{\n" +
                "  \"plutchik_primary\": \"joy|sadness|trust|disgust|fear|anger|surprise|anticipation\",\n" +
                "  \"plutchik_secondary\": \"同上 8 类之一或 null\",\n" +
                "  \"intensity\": 1-5,\n" +
                "  \"valence\": 1 或 -1,\n" +
                "  \"raw_score\": 0.0-1.0,\n" +
                "  \"anchor_start\": 触发该情绪的关键词在原文中的起始字符索引（-1 表示无法定位）,\n" +
                "  \"anchor_end\": 结束字符索引\n" +
                "}\n\n" +
                "规则：\n" +
                "- joy/trust/anticipation(正面) 的 valence=1\n" +
                "- sadness/disgust/fear/anger 的 valence=-1\n" +
                "- surprise 视上下文：中性或 ± 皆可\n" +
                "- intensity 5 = 极强，1 = 微弱\n" +
                "- anchor 必须是原文中实际出现的字符索引（0-based）\n\n" +
                "文本（截取 ≤ 800 字）：" + (text.length() > 800 ? text.substring(0, 800) + "…" : text);

        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", "你是中文 Plutchik 情绪分析器，只输出严格 JSON。"));
        msgs.add(new AiMessage("user", prompt));

        try {
            String raw = aiClient.chat(msgs, true);
            if (raw != null) {
                JSONObject obj = JSON.parseObject(raw.trim());
                result.put("plutchikPrimary", obj.getString("plutchik_primary"));
                result.put("plutchikSecondary", obj.getString("plutchik_secondary"));
                result.put("intensity",    obj.getIntValue("intensity"));
                result.put("valence",      obj.getIntValue("valence"));
                // G3：LLM 辅助锚点定位
                result.put("anchorStart", obj.getIntValue("anchor_start"));
                result.put("anchorEnd",   obj.getIntValue("anchor_end"));
                double aiScore = obj.getDoubleValue("raw_score");

                // —— 规则加权：程度副词 × 否定前缀(可能翻转极性) × 转折 ——
                double ruleFactor = computeRuleFactor(text);
                boolean polarityFlip = ruleFactor < 0;
                double absFactor = Math.abs(ruleFactor);
                double finalScore = clamp(aiScore * absFactor);
                int valence = obj.getIntValue("valence");
                if (polarityFlip) valence = -valence; // 否定+情绪词邻接 → 翻转极性
                result.put("valence", valence);
                result.put("score", finalScore);
                result.put("ruleFactor", ruleFactor);
                return result;
            }
        } catch (Exception e) {
            log.debug("Plutchik 情绪分析 AI 调用失败", e);
        }

        // 兜底：基于关键词词典估算
        return fallbackKeywordAnalysis(text);
    }

    /** 程度副词 × 否定前缀 × 转折词 的复合系数；否定+情绪词邻接时翻转极性（返回 negative 标记） */
    private double computeRuleFactor(String text) {
        if (text == null) return 1.0;
        double factor = 1.0;

        // 程度副词：从强到弱匹配，取最后命中
        for (int i = 0; i < DEGREE_WORDS.length; i++) {
            for (String dw : DEGREE_WORDS[i]) {
                if (text.contains(dw)) { factor = DEGREE_FACTORS[i]; break; }
            }
        }

        // 否定前缀：检查是否与情绪词邻接（距离 ≤ 3 字）
        boolean negated = isNegatedEmotion(text);
        if (negated) factor *= -0.8; // 负号表示极性翻转，0.8 表示强度保留

        // 转折词：出现则标记存在（轻微降权，因为转折后的情绪才是重点）
        for (String c : CONTRAST_WORDS) if (text.contains(c)) { factor *= 0.9; break; }

        return factor;
    }

    /** 检测否定词与情绪词是否邻接（距离 ≤ 3 字），若是则应翻转极性 */
    private boolean isNegatedEmotion(String text) {
        // 对每个否定词，检查它后面 3 字内是否有情绪词
        for (String neg : NEGATION_PREFIXES) {
            int idx = text.indexOf(neg);
            while (idx >= 0) {
                int windowStart = idx + neg.length();
                int windowEnd = Math.min(text.length(), windowStart + 3);
                String window = text.substring(windowStart, windowEnd);
                for (String w : POS_KEYWORDS) if (window.contains(w)) return true;
                for (String w : NEG_KEYWORDS) if (window.contains(w)) return true;
                idx = text.indexOf(neg, idx + 1);
            }
        }
        return false;
    }

    /** 关键词兜底分析（AI 不可用时） */
    private JSONObject fallbackKeywordAnalysis(String text) {
        if (text == null) text = "";
        int n = 0, p = 0;
        for (String w : NEG_KEYWORDS) if (text.contains(w)) n++;
        for (String w : POS_KEYWORDS) if (text.contains(w)) p++;

        JSONObject r = new JSONObject();
        double score;
        String primary, secondary;
        int valence;
        if (n >= p && n > 0) {
            score = Math.min(1.0, n * 0.2);
            primary = "sadness"; secondary = n > p * 2 ? "fear" : "disgust"; valence = -1;
        } else if (p > 0) {
            score = Math.min(1.0, p * 0.2);
            primary = "joy"; secondary = "trust"; valence = 1;
        } else {
            score = 0.25;
            primary = "trust"; secondary = "joy"; valence = 1;
        }
        r.put("score", score);
        r.put("plutchikPrimary", primary);
        r.put("plutchikSecondary", secondary);
        r.put("intensity", Math.max(1, Math.min(5, (int)(score * 5))));
        r.put("valence", valence);
        r.put("ruleFactor", 1.0);
        r.put("fallback", true);
        return r;
    }

    // ────────────────────────────────────────────────────
    // 情绪锚点定位：找触发当前主情绪的具体词/句的 startIndex-endIndex
    // ────────────────────────────────────────────────────
    private JSONObject locateAnchor(String text, String plutchikPrimary) {
        JSONObject anchor = new JSONObject();
        anchor.put("text", "");
        anchor.put("start", -1);
        anchor.put("end", -1);

        if (text == null || plutchikPrimary == null) return anchor;

        // 用统一静态词表（不再每次 new HashMap）
        String[] kws = PLUTCHIK_KEYWORDS.get(plutchikPrimary);
        if (kws == null) return anchor;

        for (String kw : kws) {
            int idx = text.indexOf(kw);
            if (idx >= 0) {
                // 优先按标点扩展锚点边界，避免切到词中间
                int start = Math.max(0, idx - 10);
                int end = Math.min(text.length(), idx + kw.length() + 10);
                // 尝试把 start/end 对齐到最近的标点
                start = alignToPunctuation(text, start, idx, true);
                end = alignToPunctuation(text, end, idx + kw.length(), false);
                anchor.put("text", text.substring(start, end));
                anchor.put("start", start);
                anchor.put("end", end);
                break;
            }
        }
        return anchor;
    }

    /** 把锚点边界对齐到最近的标点/换行，避免切到词中间 */
    private int alignToPunctuation(String text, int pos, int refPos, boolean isStart) {
        String punct = "。！？，、；：,.!?; \n";
        if (isStart) {
            // 从 pos 往 refPos 方向找标点
            for (int i = pos; i < refPos; i++) if (punct.indexOf(text.charAt(i)) >= 0) return i + 1;
            return pos;
        } else {
            for (int i = pos; i > refPos; i--) if (punct.indexOf(text.charAt(i - 1)) >= 0) return i;
            return pos;
        }
    }

    // ────────────────────────────────────────────────────
    // 情绪矛盾检测：表面情绪 vs 隐含情绪
    // ────────────────────────────────────────────────────
    private JSONObject detectConflict(String text) {
        JSONObject conflict = new JSONObject();
        conflict.put("surface", "neutral");
        conflict.put("hidden", "neutral");
        conflict.put("score", 0.0);

        if (text == null || text.length() < 10) return conflict;

        // 规则检测：否定 + 正向词 = 隐含负向；反之亦然
        boolean hasNegation = false;
        for (String neg : NEGATION_PREFIXES) {
            if (text.contains(neg)) { hasNegation = true; break; }
        }

        boolean hasPositive = false, hasNegative = false;
        for (String w : POS_KEYWORDS) if (text.contains(w)) { hasPositive = true; break; }
        for (String w : NEG_KEYWORDS) if (text.contains(w)) { hasNegative = true; break; }

        // 转折词检测
        boolean hasContrast = false;
        for (String c : CONTRAST_WORDS) if (text.contains(c)) { hasContrast = true; break; }

        if (hasNegation && hasPositive) {
            conflict.put("surface", "positive");
            conflict.put("hidden", "negative");
            conflict.put("score", 0.7);
        } else if (hasContrast && hasPositive && hasNegative) {
            conflict.put("surface", "positive");
            conflict.put("hidden", "negative");
            conflict.put("score", 0.65);
        } else if (hasContrast && hasNegative && !hasPositive) {
            conflict.put("surface", "negative");
            conflict.put("hidden", "neutral");
            conflict.put("score", 0.4);
        } else if (hasPositive && hasNegative) {
            conflict.put("surface", "mixed");
            conflict.put("hidden", "mixed");
            conflict.put("score", 0.5);
        }

        return conflict;
    }

    // ────────────────────────────────────────────────────
    // Embedding 交叉验证：文本 embedding vs 8 个情绪原型句 embedding
    // ────────────────────────────────────────────────────
    private JSONObject crossValidateByEmbed(String text, String aiPrimary) {
        JSONObject result = new JSONObject();
        result.put("top_match", "");
        result.put("top_score", 0.0);
        result.put("difference_to_ai", 0.0);
        result.put("confidence", "medium");

        if (text == null || text.trim().isEmpty()) {
            result.put("confidence", "low");
            return result;
        }

        try {
            // 懒加载原型句 embedding（一次成本，后续全复用）
            ensurePrototypeVectors();
            if (prototypeVectors == null) { result.put("confidence", "low"); return result; }

            float[] textVec = aiClient.embed(text);
            if (textVec == null || textVec.length == 0) {
                result.put("confidence", "low");
                return result;
            }

            double[] cosines = new double[PLUTCHIK_PROTOTYPES.length];
            for (int i = 0; i < PLUTCHIK_PROTOTYPES.length; i++) {
                float[] protoVec = prototypeVectors[i];
                if (protoVec != null && protoVec.length == textVec.length) {
                    cosines[i] = cosineSim(textVec, protoVec);
                }
            }

            // top-2 混合
            int topIdx = argmax(cosines);
            int secondIdx = argmax2(cosines);
            result.put("top_match", PLUTCHIK_EMOTIONS[topIdx]);
            result.put("top_match_zh", PLUTCHIK_ZH.get(PLUTCHIK_EMOTIONS[topIdx]));
            result.put("top_score", cosines[topIdx]);
            result.put("second_match", PLUTCHIK_EMOTIONS[secondIdx]);
            result.put("second_match_zh", PLUTCHIK_ZH.get(PLUTCHIK_EMOTIONS[secondIdx]));
            result.put("second_score", cosines[secondIdx]);
            // P1：存 cosines 数组，供 extract 拿到 plutchikPrimary 后补算 difference（避免再调一次 embed）
            result.put("_cosines", cosines);

            // 与 AI 分类结果对比（aiPrimary 可能为 null，此时 extract 里会补算）
            double difference = 0.0;
            if (aiPrimary != null) {
                int aiIdx = indexOf(PLUTCHIK_EMOTIONS, aiPrimary);
                if (aiIdx >= 0) {
                    difference = Math.abs(cosines[topIdx] - cosines[aiIdx]);
                    result.put("difference_to_ai", difference);
                }
            }

            // 置信度判定
            if (difference > 0.2) {
                result.put("confidence", "low");
            } else if (cosines[topIdx] > 0.5) {
                result.put("confidence", "high");
            } else {
                result.put("confidence", "medium");
            }

        } catch (Exception e) {
            log.debug("Embedding 交叉验证失败", e);
            result.put("confidence", "low");
        }
        return result;
    }

    // ────────────────────────────────────────────────────
    // （三）打字轨迹侧：按键级原始特征 + z-score 异常检测
    // ────────────────────────────────────────────────────
    private JSONObject analyzeTrajectory(String typingSignalJson, String userId) {
        JSONObject result = new JSONObject();
        result.put("score", 0.0);

        if (typingSignalJson == null || typingSignalJson.isBlank()) return result;

        try {
            JSONObject sig = JSON.parseObject(typingSignalJson);
            result.put("delete",  sig.getIntValue("delete"));
            result.put("undo",    sig.getIntValue("undo"));
            result.put("pause",   sig.getDoubleValue("pause"));
            result.put("modifyFreq", sig.getIntValue("modifyFreq"));

            // v2 前端传来的按键级轨迹特征
            double avgIntervalMs = sig.getDoubleValue("avgIntervalMs");
            double deleteRetypeRatio = sig.getDoubleValue("deleteRetypeRatio");
            double autocorrelation = sig.getDoubleValue("autocorrelation");

            if (avgIntervalMs > 0)  result.put("avg_interval_ms", avgIntervalMs);
            if (deleteRetypeRatio > 0) result.put("delete_retype_ratio", deleteRetypeRatio);
            if (autocorrelation > 0) result.put("autocorrelation", autocorrelation);

            // v2 原始按键事件流分析：滑动窗口情绪转折 + 犹豫循环 + 打字 burst
            JSONArray events = sig.getJSONArray("events");
            JSONObject eventFeats = analyzeEventsStream(events);
            double tp  = eventFeats.getDoubleValue("turning_point");
            double hl  = eventFeats.getDoubleValue("hesitation_loop");
            double bst = eventFeats.getDoubleValue("burst");
            result.put("turning_point",    tp);
            result.put("hesitation_loop",  hl);
            result.put("burst",            bst);

            // z-score 异常检测（替代硬阈值）
            double zScore = computeZScore(avgIntervalMs, userId);
            result.put("z_score", zScore);

            // 综合得分：z-score + deleteRetypeRatio + undo + pause + 事件流三特征
            double score = 0.0;
            if (zScore > 1.5)          score = Math.max(score, 0.3 + Math.min(0.4, zScore * 0.2));
            if (deleteRetypeRatio > 0.4) score = Math.max(score, 0.4 + deleteRetypeRatio * 0.4);
            if (sig.getIntValue("undo") >= 2) score = Math.max(score, 0.55);
            if (sig.getDoubleValue("pause") >= 5) score = Math.max(score, 0.35 + (sig.getDoubleValue("pause") - 5) * 0.03);
            // 事件流特征：情绪转折 / 犹豫循环 / burst
            if (tp  > 0.3) score = Math.max(score, 0.4 + tp  * 0.4);
            if (hl  > 0.3) score = Math.max(score, 0.5 + hl  * 0.3);
            if (bst > 0.3) score = Math.max(score, 0.45 + bst * 0.3);

            result.put("score", clamp(score));

        } catch (Exception e) {
            log.debug("打字轨迹解析失败", e);
        }
        return result;
    }

    /** z-score：Welford 在线算法维护 mean/M2/count，避免固定 std 500 不匹配用户实际节奏 */
    private double computeZScore(double currentMs, String userId) {
        if (currentMs <= 0 || userId == null) return 0.0;
        double[] stat = trajectoryBaseline.computeIfAbsent(userId, k -> new double[]{0.0, 0.0, 0.0}); // [mean, M2, count]
        synchronized (stat) {
            stat[2] += 1;
            double delta = currentMs - stat[0];
            stat[0] += delta / stat[2];
            double delta2 = currentMs - stat[0];
            stat[1] += delta * delta2;
            // count < 2 时方差无意义，z 设为 0（前两次不做异常判断）
            if (stat[2] < 2) return 0.0;
            double variance = stat[1] / (stat[2] - 1); // 样本方差
            double std = Math.sqrt(variance);
            if (std < 1e-6) return 0.0; // 所有间隔相同，无异常
            return (currentMs - stat[0]) / std;
        }
    }

    /**
     * 解析原始按键事件流，检测三个聚合特征做不到的模式：
     * 1. turning_point：前后两半 delete 比例变化（情绪恶化 = 后半段删除比例升高）
     * 2. hesitation_loop：insert→delete→insert 连续模式频率（纠结/自我怀疑）
     * 3. burst：5s 内 ≥15 次 insert 且之后 >3s 停顿（情绪爆发后枯竭）
     */
    private JSONObject analyzeEventsStream(JSONArray events) {
        JSONObject feat = new JSONObject();
        feat.put("turning_point", 0.0);
        feat.put("hesitation_loop", 0.0);
        feat.put("burst", 0.0);

        if (events == null || events.size() < 5) return feat;

        int n = events.size();
        long[] ts = new long[n];
        String[] actions = new String[n];
        for (int i = 0; i < n; i++) {
            JSONObject ev = events.getJSONObject(i);
            ts[i] = ev.getLongValue("ts");
            actions[i] = ev.getString("action");
        }

        // 1. 滑动窗口情绪转折：前后两半 delete 比例差
        int mid = n / 2;
        int firstDel = 0, secondDel = 0;
        for (int i = 0; i < mid; i++) if ("delete".equals(actions[i])) firstDel++;
        for (int i = mid; i < n; i++) if ("delete".equals(actions[i])) secondDel++;
        double firstRatio = mid > 0 ? (double) firstDel / mid : 0;
        double secondRatio = (n - mid) > 0 ? (double) secondDel / (n - mid) : 0;
        feat.put("turning_point", clamp((secondRatio - firstRatio) * 2));

        // 2. 犹豫循环：insert→delete→insert 三连模式计数
        int loops = 0;
        for (int i = 2; i < n; i++) {
            if ("insert".equals(actions[i - 2]) && "delete".equals(actions[i - 1]) && "insert".equals(actions[i])) {
                loops++;
            }
        }
        feat.put("hesitation_loop", Math.min(1.0, loops * 0.3));

        // 3. 打字 burst：5s 窗口内 ≥15 次 insert，且随后有 >3s 停顿
        int bursts = 0;
        for (int i = 0; i < n; i++) {
            if (!"insert".equals(actions[i])) continue;
            int cnt = 0;
            for (int j = i; j < n && ts[j] - ts[i] <= 5000; j++) {
                if ("insert".equals(actions[j])) cnt++;
            }
            if (cnt >= 15) {
                for (int j = i + cnt; j < Math.min(i + cnt + 5, n); j++) {
                    if (ts[j] - ts[j - 1] > 3000) { bursts++; break; }
                }
            }
        }
        feat.put("burst", Math.min(1.0, bursts * 0.5));

        return feat;
    }

    // ────────────────────────────────────────────────────
    // 跨日记趋势：MySQL 拉近 10 篇 → 移动平均 + 变异系数 + 趋势斜率
    // 加 5 分钟本地缓存（P4），避免 SSE 高频触发时反复查 DB
    private final java.util.concurrent.ConcurrentHashMap<String, Object[]> trendCache =
            new java.util.concurrent.ConcurrentHashMap<>(); // key=userId, value=[timestamp, result]
    private static final long TREND_CACHE_TTL_MS = 5 * 60 * 1000;

    private JSONObject analyzeCrossDiaryTrend(String userId) {
        JSONObject result = new JSONObject();
        result.put("ma7", 0.5);
        result.put("variance", 0.0);
        result.put("slope", 0.0);
        result.put("long_term_distress", false);
        result.put("entry_count", 0);

        if (userId == null) return result;

        // P4：5 分钟缓存命中直接返回
        Object[] cached = trendCache.get(userId);
        if (cached != null && (System.currentTimeMillis() - (long) cached[0]) < TREND_CACHE_TTL_MS) {
            return (JSONObject) cached[1];
        }

        try {
            // 拉近 10 篇（按创建时间倒序）
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_MONTH, -30); // 30 天内
            Date fromDate = cal.getTime();

            QueryWrapper<Diary> qw = new QueryWrapper<>();
            qw.eq("user_id", userId)
              .ge("create_date", fromDate)
              .orderByDesc("create_date")
              .last("LIMIT 10");
            List<Diary> diaries = diaryMapper.selectList(qw);

            if (diaries == null || diaries.isEmpty()) return result;

            result.put("entry_count", diaries.size());

            // B5：优先用 emotionDetail JSON 的 Plutchik primary 判断极性，没有再回退到 emotion 字符串
            double[] scores = new double[diaries.size()];
            String[] frontNegTypes = {"不安", "怨恨", "不开心", "无语"};
            for (int i = 0; i < diaries.size(); i++) {
                Diary d = diaries.get(i);
                double s = 0.5;
                String detail = d.getEmotionDetail();
                if (detail != null && detail.startsWith("{")) {
                    try {
                        JSONObject ed = JSON.parseObject(detail);
                        int valence = ed.getIntValue("valence");
                        if (valence != 0) s = valence < 0 ? 0.8 : 0.25;
                    } catch (Exception ignore) { /* fall through to emotion string */ }
                }
                if (s == 0.5) {
                    String emo = d.getEmotion();
                    if (emo != null) {
                        boolean isNeg = false;
                        for (String nt : frontNegTypes) if (emo.contains(nt)) { isNeg = true; break; }
                        s = isNeg ? 0.75 : 0.35;
                    }
                }
                scores[i] = s;
            }

            // 移动平均（最近 7 个，不足则全部）
            int maWindow = Math.min(7, scores.length);
            double ma = 0;
            for (int i = 0; i < maWindow; i++) ma += scores[i];
            ma /= maWindow;
            result.put("ma7", round2(ma));

            // 变异系数
            double mean = 0;
            for (double s : scores) mean += s;
            mean /= scores.length;
            double variance = 0;
            for (double s : scores) variance += (s - mean) * (s - mean);
            variance /= scores.length;
            result.put("variance", round2(variance));

            // 趋势斜率（最旧 → 最新）：Q5 重命名 olderHalf/newerHalf 避免误导
            double slope = 0;
            if (scores.length >= 3) {
                double olderHalf = 0, newerHalf = 0;
                int half = scores.length / 2;
                for (int i = scores.length - 1; i >= half; i--) olderHalf += scores[i];
                for (int i = half - 1; i >= 0; i--) newerHalf += scores[i];
                olderHalf /= (scores.length - half);
                newerHalf /= half;
                slope = newerHalf - olderHalf; // 分数变大（更负向）→ slope > 0（情绪正在恶化）
            }
            result.put("slope", round2(slope));

            // long_term_distress：连续 3 篇偏负，或 ma7 偏高，或 slope > 0.1（正在恶化）
            int negStreak = 0;
            for (double s : scores) {
                if (s > 0.55) negStreak++; else break;
            }
            boolean longTermDistress = (ma > 0.65) || (negStreak >= 3) || (slope > 0.1);
            result.put("long_term_distress", longTermDistress);

        } catch (Exception e) {
            log.debug("跨日记趋势分析失败", e);
        }

        // P4：写缓存
        trendCache.put(userId, new Object[]{System.currentTimeMillis(), result});
        return result;
    }

    // ────────────────────────────────────────────────────
    // （四）自适应融合：信号质量自适应权重，不固定 0.7/0.3
    // ────────────────────────────────────────────────────
    private JSONObject adaptiveFusion(JSONObject textAnalysis, JSONObject trajAnalysis, JSONObject longTerm) {
        JSONObject result = new JSONObject();

        double textScore = textAnalysis.getBigDecimal("score") != null
                ? textAnalysis.getBigDecimal("score").doubleValue() : 0.0;
        double trajScore = trajAnalysis.getBigDecimal("score") != null
                ? trajAnalysis.getBigDecimal("score").doubleValue() : 0.0;

        // 文本侧信号质量：受规则系数 + embed 交叉验证置信度影响
        double textSignalQuality = 0.5;
        double ruleFactor = Math.abs(textAnalysis.getDoubleValue("ruleFactor")); // 极性翻转后取绝对值
        if (ruleFactor > 0) textSignalQuality = Math.min(1.0, 0.5 + ruleFactor * 0.3);

        JSONObject embed = textAnalysis.getJSONObject("embedValidation");
        if (embed != null) {
            String conf = embed.getString("confidence");
            if ("high".equals(conf)) textSignalQuality = Math.min(1.0, textSignalQuality + 0.2);
            if ("low".equals(conf))  textSignalQuality = Math.max(0.1, textSignalQuality - 0.3);
        }

        // 轨迹侧信号质量：受 z-score 显著性 + autocorrelation + 事件流强信号影响
        double trajSignalQuality = 0.5;
        double zScore = trajAnalysis.getDoubleValue("z_score");
        if (Math.abs(zScore) > 1.0) trajSignalQuality = Math.min(1.0, trajSignalQuality + 0.3);
        if (Math.abs(zScore) < 0.3) trajSignalQuality = Math.max(0.1, trajSignalQuality - 0.2);
        // B7：高自相关（节奏一致）→ 信号更可信
        double autocorr = trajAnalysis.getDoubleValue("autocorrelation");
        if (autocorr > 0.3) trajSignalQuality = Math.min(1.0, trajSignalQuality + 0.15);
        // 事件流强信号（犹豫循环/情绪转折/burst）→ 轨迹信号可信度显著提升
        double hl  = trajAnalysis.getDoubleValue("hesitation_loop");
        double tp  = trajAnalysis.getDoubleValue("turning_point");
        double bst = trajAnalysis.getDoubleValue("burst");
        if (hl  > 0.3) trajSignalQuality = Math.min(1.0, trajSignalQuality + 0.2);
        if (tp  > 0.3) trajSignalQuality = Math.min(1.0, trajSignalQuality + 0.15);
        if (bst > 0.3) trajSignalQuality = Math.min(1.0, trajSignalQuality + 0.15);

        // 归一化权重
        double sum = textSignalQuality + trajSignalQuality;
        if (sum < 0.1) sum = 0.1;
        double textWeight = textSignalQuality / sum;
        double trajWeight = trajSignalQuality / sum;

        double finalScore = textWeight * textScore + trajWeight * trajScore;

        // G2：long_term_distress → 加权提升当轮情绪得分（用户长期偏负，当前更值得关注）
        if (longTerm != null && longTerm.getBooleanValue("long_term_distress")) {
            finalScore = Math.min(1.0, finalScore + 0.1);
            result.put("long_term_boost", 0.1);
        }
        // G1：情绪微分 slope > 0.1（正在恶化）→ 额外加权
        if (longTerm != null) {
            double slope = longTerm.getDoubleValue("slope");
            if (slope > 0.1) {
                finalScore = Math.min(1.0, finalScore + 0.05);
                result.put("slope_boost", 0.05);
            }
        }
        finalScore = clamp(finalScore);

        JSONObject weights = new JSONObject();
        weights.put("text_weight", round3(textWeight));
        weights.put("trajectory_weight", round3(trajWeight));
        weights.put("text_signal_quality", round3(textSignalQuality));
        weights.put("trajectory_signal_quality", round3(trajSignalQuality));

        result.put("weights", weights);
        result.put("finalScore", round3(finalScore));

        // Q4：用局部变量 embed 判定置信度，不再重复 getJSONObject
        String confidence;
        if (textSignalQuality > 0.7 && embed != null && "high".equals(embed.getString("confidence"))) {
            confidence = "high";
        } else if (textSignalQuality > 0.4 || trajSignalQuality > 0.7) {
            confidence = "medium";
        } else {
            confidence = "low";
        }
        result.put("confidence", confidence);

        return result;
    }

    // ────────────────────────────────────────────────────
    // Plutchik primary → 前端兼容 emotionType
    // ────────────────────────────────────────────────────
    private String plutchikToFrontendEmotion(String plutchikPrimary, int valence) {
        if (plutchikPrimary == null) return "平静";
        // 正向 Plutchik → 快乐类
        if ("joy".equals(plutchikPrimary))           return "兴奋";
        if ("trust".equals(plutchikPrimary))         return "平静";
        if ("anticipation".equals(plutchikPrimary))  return valence > 0 ? "兴奋" : "迷茫";
        // 负向 Plutchik → 悲伤/愤怒/迷茫
        if ("sadness".equals(plutchikPrimary))       return "沮丧";
        if ("anger".equals(plutchikPrimary))         return "愤怒";
        if ("fear".equals(plutchikPrimary))          return "迷茫";
        if ("disgust".equals(plutchikPrimary))       return "愤怒";
        if ("surprise".equals(plutchikPrimary))      return valence > 0 ? "兴奋" : "迷茫";
        return "平静";
    }

    // ────────────────────────────────────────────────────
    // 工具方法
    // ────────────────────────────────────────────────────
    private static double cosineSim(float[] a, float[] b) {
        if (a == null || b == null || a.length != b.length) return 0;
        double dot = 0, normA = 0, normB = 0;
        for (int i = 0; i < a.length; i++) {
            dot  += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA == 0 || normB == 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    private static int argmax(double[] arr) {
        int idx = 0; double max = arr[0];
        for (int i = 1; i < arr.length; i++) if (arr[i] > max) { max = arr[i]; idx = i; }
        return idx;
    }

    private static int argmax2(double[] arr) {
        int first = argmax(arr);
        int idx = -1;
        double secMax = Double.NEGATIVE_INFINITY;
        for (int i = 0; i < arr.length; i++) {
            if (i != first && arr[i] > secMax) { secMax = arr[i]; idx = i; }
        }
        return idx < 0 ? first : idx;
    }

    private static int indexOf(String[] arr, String target) {
        if (target == null) return -1;
        for (int i = 0; i < arr.length; i++) if (target.equals(arr[i])) return i;
        return -1;
    }

    private static double clamp(double v) { return Math.max(0, Math.min(1, v)); }
    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static double round3(double v) { return Math.round(v * 1000.0) / 1000.0; }
}
