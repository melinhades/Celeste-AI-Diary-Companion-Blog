package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Madeline 日记多轮反应 · 双模态情绪提取
 * <p>
 * 设计：
 * - 文本侧：aiClient.chat 跑情绪分类（JSON mode，快速模型即可，ai.model 复用现有）
 * - 打字轨迹侧：前端传 typingSignal JSON，本类解析后按规则给分
 * - 融合公式：final_score = 0.7 * text_score + 0.3 * trajectory_score
 */
@Component
@Slf4j
public class DiaryChatEmotionExtractor {

    public static class EmotionResult {
        public String emotionType;       // 兴奋/平静/沮丧/愤怒/迷茫
        public BigDecimal score;         // 融合后得分 0-1
        public BigDecimal textScore;
        public BigDecimal trajectoryScore;

        public EmotionResult(String emotionType, BigDecimal score, BigDecimal textScore, BigDecimal trajectoryScore) {
            this.emotionType = emotionType;
            this.score = score;
            this.textScore = textScore;
            this.trajectoryScore = trajectoryScore;
        }
    }

    @Autowired private AiClient aiClient;

    /** 入口点，companionStream 入口处调 */
    public EmotionResult extract(String diaryText, String typingSignalJson) {
        BigDecimal textScore = extractTextScore(diaryText);
        BigDecimal trajectoryScore = extractTrajectoryScore(typingSignalJson);

        // 融合
        double fused = 0.7 * textScore.doubleValue() + 0.3 * trajectoryScore.doubleValue();
        fused = Math.max(0, Math.min(1, fused));

        String emotionType = classifyFromText(diaryText, fused >= 0.6);

        return new EmotionResult(emotionType,
                BigDecimal.valueOf(fused).setScale(3, BigDecimal.ROUND_HALF_UP),
                textScore.setScale(3, BigDecimal.ROUND_HALF_UP),
                trajectoryScore.setScale(3, BigDecimal.ROUND_HALF_UP));
    }

    private BigDecimal extractTextScore(String text) {
        if (text == null || text.trim().isEmpty()) return BigDecimal.ZERO;
        // 用 AI 做情绪分类（JSON mode，快速）
        String prompt = "判断以下中文日记文本的情绪强度（0-1，越强烈越高），只输出严格 JSON：\n" +
                "{\n" +
                "  \"emotion\": \"兴奋|平静|沮丧|愤怒|迷茫\",\n" +
                "  \"score\": 0.0\n" +
                "}\n\n" +
                "日记文本（截取 ≤ 800 字）：" + (text.length() > 800 ? text.substring(0, 800) + "…" : text);

        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", "你是中文情绪分类器，只输出严格 JSON，不输出其他文字。"));
        msgs.add(new AiMessage("user", prompt));

        try {
            String raw = aiClient.chat(msgs, true);
            if (raw != null) {
                JSONObject obj = JSON.parseObject(raw.trim());
                Double s = obj.getDouble("score");
                if (s != null && s >= 0 && s <= 1) return BigDecimal.valueOf(s);
            }
        } catch (Exception e) {
            log.debug("文本情绪提取 AI 调用失败: {}", e.getMessage());
        }
        // 兜底：基于关键词粗略估算
        return BigDecimal.valueOf(estimateFromKeywords(text));
    }

    private BigDecimal extractTrajectoryScore(String typingSignalJson) {
        if (typingSignalJson == null || typingSignalJson.isBlank()) return BigDecimal.ZERO;
        try {
            JSONObject sig = JSON.parseObject(typingSignalJson);
            int delete = sig.getIntValue("delete");
            double pause = sig.getDoubleValue("pause");
            int undo = sig.getIntValue("undo");

            double score = 0;
            if (delete >= 3) score = Math.max(score, 0.7);
            if (delete >= 5) score = Math.max(score, 0.85);
            if (pause >= 5) score = Math.max(score, 0.6);
            if (undo >= 2) score = Math.max(score, 0.7);
            return BigDecimal.valueOf(score);
        } catch (Exception e) {
            log.debug("打字轨迹解析失败: {}", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    private String classifyFromText(String text, boolean intense) {
        String prompt = "判断以下中文日记文本的主要情绪类别，只输出一个词（兴奋/平静/沮丧/愤怒/迷茫）：\n" +
                (text.length() > 500 ? text.substring(0, 500) + "…" : text);
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", "你是中文情绪分类器，只输出一个词，不输出其他。"));
        msgs.add(new AiMessage("user", prompt));
        try {
            String raw = aiClient.chat(msgs);
            if (raw != null) {
                for (String label : new String[]{"兴奋", "平静", "沮丧", "愤怒", "迷茫"}) {
                    if (raw.trim().contains(label)) return label;
                }
            }
        } catch (Exception ignored) {}
        return intense ? "沮丧" : "平静";
    }

    private double estimateFromKeywords(String text) {
        String[] pos = {"开心", "快乐", "棒", "好", "成功", "喜欢", "爱", "感谢"};
        String[] neg = {"难过", "痛苦", "累", "烦", "绝望", "崩溃", "不开心", "讨厌", "恨", "焦虑", "怕"};
        int p = 0, n = 0;
        for (String w : pos) if (text.contains(w)) p++;
        for (String w : neg) if (text.contains(w)) n++;
        int total = p + n;
        if (total == 0) return 0.2;
        return Math.min(1.0, n * 0.25 + p * 0.1);
    }
}
