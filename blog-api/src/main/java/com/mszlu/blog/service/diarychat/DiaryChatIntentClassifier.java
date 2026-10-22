package com.mszlu.blog.service.diarychat;

import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Madeline 日记多轮反应 · 对话意图分类器
 * <p>
 * 设计：吐槽/疑问/喜悦/自我反思/求助 五维度，与 promptBuilder 体系一致。
 * companionStream 入口处调一次，分类结果影响人格检查里的追问规则（Q1-Q4）。
 */
@Component
@Slf4j
public class DiaryChatIntentClassifier {

    private static final String[] LABELS = {"吐槽", "疑问", "喜悦", "自我反思", "求助"};

    @Autowired private AiClient aiClient;

    /** 入口点，companionStream 入口处调 */
    public String classify(String diaryText, String recentContext) {
        if (diaryText == null || diaryText.trim().isEmpty()) return "吐槽";

        String prompt = "判断以下中文日记的意图类型，只输出严格 JSON：\n" +
                "{\n" +
                "  \"intent\": \"吐槽|疑问|喜悦|自我反思|求助\",\n" +
                "  \"reason\": \"判断理由（≤ 30 字）\"\n" +
                "}\n\n" +
                "【可选标签】吐槽（表达不满抱怨）/ 疑问（主动提出问题）/ 喜悦（正向情绪）/ 自我反思（分析自己）/ 求助（请求帮助）\n\n" +
                "【日记文本】" + (diaryText.length() > 800 ? diaryText.substring(0, 800) + "…" : diaryText) +
                (recentContext != null ? "\n【最近对话（参考用）】" + recentContext : "");

        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", "你是中文意图分类器，只输出严格 JSON。"));
        msgs.add(new AiMessage("user", prompt));

        try {
            String raw = aiClient.chat(msgs, true);
            if (raw != null) {
                JSONObject obj = JSON.parseObject(raw.trim());
                String intent = obj.getString("intent");
                if (intent != null && java.util.Arrays.asList(LABELS).contains(intent)) return intent;
            }
        } catch (Exception e) {
            log.debug("意图分类 AI 调用失败: {}", e.getMessage());
        }
        // 兜底：简单规则
        if (diaryText.contains("？") || diaryText.contains("?")) return "疑问";
        if (diaryText.contains("怎么") || diaryText.contains("应该") || diaryText.contains("帮我")) return "求助";
        if (diaryText.contains("开心") || diaryText.contains("棒") || diaryText.contains("好") || diaryText.contains("成功")) return "喜悦";
        if (diaryText.contains("发现") || diaryText.contains("反思") || diaryText.contains("意识到")) return "自我反思";
        return "吐槽";
    }
}
