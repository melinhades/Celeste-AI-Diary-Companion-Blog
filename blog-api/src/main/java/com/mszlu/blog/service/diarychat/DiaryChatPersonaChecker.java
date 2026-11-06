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
 * Madeline 日记多轮反应 · 人格一致性检查器
 * <p>
 * 设计：每次 Madeline 生成回复后，用同一个 aiClient.chat 跑分类 prompt（JSON mode），
 * 判断是否符合 Madeline 人设 + 红线规则（R1-R6 / S1-S3），不合格则重新生成（最多 3 次）。
 * 失败兜底：返回默认温柔回应「嗯，我在听～」，不中断对话。
 */
@Component
@Slf4j
public class DiaryChatPersonaChecker {

    /** 红线规则 ID 集合（规格文件 §2.1） */
    public static final String[] REDLINE_RULES = {"R1", "R2", "R3", "R4", "R5", "R6"};

    @Autowired private AiClient aiClient;

    /** 危机/极私密文本：命中后本轮不进入模型生成，直接走安全回应（S1） */
    private static final java.util.regex.Pattern CRISIS_DRAFT = java.util.regex.Pattern.compile(
            "自杀|自残|轻生|割腕|跳楼|不想活|活不下去|结束生命|安眠药|吞药");

    /** 用户侧攻击性/拒绝交流迹象：命中后需要走完整人格检查 */
    private static final java.util.regex.Pattern RISKY_DRAFT = java.util.regex.Pattern.compile(
            "别烦我|不想聊|滚开|闭嘴|我恨你");

    /** 模型输出里的硬红线表征：命中后需要走完整人格检查 */
    private static final java.util.regex.Pattern REDLINE_OUTPUT = java.util.regex.Pattern.compile(
            "作为(一个)?(AI|人工智能|语言模型)|我是(一个)?(AI|人工智能|语言模型)|"
                    + "无法(为你|为您)?提供(医疗|诊断|法律|财务)|建议(你|您)(停药|自行|加量|减量)|"
                    + "你(应该|必须)去看(医生|心理)|确诊|一定会好起来|一切都会好(起来|的)|"
                    + "自杀|自残|轻生|割腕|不想活|活不下去|结束生命");

    /** 轻量前置判定：只做本地正则，不调模型。true = 直接安全回复（S1） */
    public static boolean isCrisisDraft(String draft) {
        if (draft == null || draft.isBlank()) return false;
        String s = draft.length() > 500 ? draft.substring(0, 500) : draft;
        return CRISIS_DRAFT.matcher(s).find();
    }

    /** 轻量本地红线扫描：用于判断模型输出是否必须跑完整检查 */
    public static boolean localRedlineHit(String text) {
        if (text == null || text.isBlank()) return false;
        String s = text.length() > 500 ? text.substring(0, 500) : text;
        return REDLINE_OUTPUT.matcher(s).find();
    }

    /** 用户文本带攻击性/拒绝交流迹象，需要完整人格检查 */
    public static boolean isRiskyDraft(String draft) {
        if (draft == null || draft.isBlank()) return false;
        String s = draft.length() > 500 ? draft.substring(0, 500) : draft;
        return RISKY_DRAFT.matcher(s).find();
    }

    /**
     * 句级流式复核：只调一次模型，不重生成。
     * 通过时 finalResponse 即原句；未通过时 suggestion 供调用方替换（可能为空）。
     */
    public CheckResult checkOnce(String text, String systemPrompt, String userContext, String intentType) {
        return runCheck(text, systemPrompt, userContext, intentType);
    }

    public static class CheckResult {
        public boolean pass;
        public String failReason;
        public String suggestion;       // AI 建议的替代回复（Madeline 应该怎么说）
        public String finalResponse;    // 最终采用的回复（可能是重新生成的）

        public CheckResult(boolean pass, String failReason, String suggestion, String finalResponse) {
            this.pass = pass;
            this.failReason = failReason;
            this.suggestion = suggestion;
            this.finalResponse = finalResponse;
        }
    }

    /**
     * 检查并确保最终回复符合人设。
     *
     * @param rawResponse 模型原始回复
     * @param systemPrompt 给模型的 system prompt（传给检查器作为背景参考）
     * @param userContext 用户日记文本（帮助判断是否触发沉默规则 S1-S3）
     * @param intentType 意图分类（吐槽/疑问/喜悦/反思/求助，帮助判断追问规则 Q1-Q4）
     * @return CheckResult —— 已完成重新生成（若需要），finalResponse 即最终输出
     */
    public CheckResult ensurePersona(String rawResponse, String systemPrompt, String userContext, String intentType) {
        final int MAX_ATTEMPTS = 3;
        String current = rawResponse == null ? "" : rawResponse.trim();
        int attempts = 0;

        while (attempts < MAX_ATTEMPTS) {
            attempts++;
            CheckResult check = runCheck(current, systemPrompt, userContext, intentType);
            if (check.pass) {
                return new CheckResult(true, null, null, current);
            }

            // 不通过：如果 AI 给了 suggestion，直接用 suggestion 替换；否则用简化 prompt 重新生成
            if (check.suggestion != null && !check.suggestion.isBlank()) {
                log.info("人格检查第 {} 次未过（原因：{}），采用建议回复", attempts, check.failReason);
                current = check.suggestion.trim();
                continue;
            }

            // 无 suggestion：重新生成一次，prompt 里强调红线约束
            log.info("人格检查第 {} 次未过（原因：{}），重新生成", attempts, check.failReason);
            current = regenerateWithConstraint(systemPrompt, current, check.failReason);
            if (current == null || current.isBlank()) break;
        }

        // 三次都没过关：兜底温柔回应
        log.warn("人格检查连续 {} 次未过，兜底温柔回应", MAX_ATTEMPTS);
        return new CheckResult(false, "连续" + MAX_ATTEMPTS + "次人格检查未过", "兜底",
                "嗯，我在听～");
    }

    private CheckResult runCheck(String response, String systemPrompt, String userContext, String intentType) {
        String checkerPrompt = "你是 Madeline 人设检查器。判断以下回复是否符合规则，输出严格 JSON。\n\n" +
                "【Madeline 人设与红线规则】\n" +
                "- 温柔、坚定、不否定用户感受\n" +
                "- R1 绝对不说：医疗/心理健康诊断建议\n" +
                "- R2 绝对不说：否定用户感受（你不该难过、这有什么好生气的）\n" +
                "- R3 绝对不说：暴力/色情/歧视内容\n" +
                "- R4 绝对不说：空泛鸡汤（加油、一切都会好起来、保持积极）\n" +
                "- R5 绝对不说：政治/宗教敏感话题\n" +
                "- R6 绝对不说：法律/财务具体建议\n" +
                "- S1 该沉默：用户写了非常私密/自杀相关内容 → 只说「嗯，我在听～」\n" +
                "- S2 该沉默：用户明确说不想聊/别烦我 → 只说「嗯，我在听～」\n" +
                "- S3 该沉默：用户发泄攻击性情绪且未求助 → 只说「嗯，我在听～」\n" +
                "- Q1 该追问：用户写了模糊情绪（我很烦）→ 追问具体点\n" +
                "- Q2 该追问：用户主动提问 → 回答后追问\n" +
                "- Q3 该追问：用户文本出现矛盾点 → 追问矛盾\n" +
                "- Q4 该追问：用户提到历史事件 → 关联后追问\n\n" +
                "【用户日记文本】：" + truncate(userContext, 500) + "\n" +
                "【用户意图】：" + intentType + "\n" +
                "【Madeline 当前回复】：" + truncate(response, 500) + "\n\n" +
                "输出格式（严格 JSON）：\n" +
                "{\n" +
                "  \"pass\": true/false,\n" +
                "  \"fail_reason\": \"如果 false，标注违反了哪条规则（如 R1、S2），通过则为空字符串\",\n" +
                "  \"suggestion\": \"如果 false，给出 Madeline 应该怎么说（一句话，≤50 字），通过则为空字符串\"\n" +
                "}";

        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", "你是 Madeline 人设检查器，只输出严格 JSON，不输出任何其他文字。"));
        msgs.add(new AiMessage("user", checkerPrompt));

        String raw = aiClient.chat(msgs, true);
        if (raw == null) {
            // AI 调用失败，保守假设通过，避免中断对话
            log.warn("人格检查 AI 调用失败，保守放行");
            return new CheckResult(true, null, null, response);
        }
        try {
            JSONObject obj = JSON.parseObject(raw.trim());
            boolean pass = obj.getBooleanValue("pass");
            String failReason = obj.getString("fail_reason");
            String suggestion = obj.getString("suggestion");
            return new CheckResult(pass, failReason, suggestion, response);
        } catch (Exception e) {
            log.warn("人格检查 JSON 解析失败: {}", e.getMessage());
            return new CheckResult(true, null, null, response);
        }
    }

    private String regenerateWithConstraint(String originalSystemPrompt, String badResponse, String reason) {
        String regeneratePrompt = originalSystemPrompt + "\n\n" +
                "【补充约束】你上一次的回复违反了红线规则（" + reason + "），请重新生成一条符合 Madeline 人设的回复。\n" +
                "【你的上一条回复（参考用）】" + truncate(badResponse, 300);
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(new AiMessage("system", regeneratePrompt));
        msgs.add(new AiMessage("user", "请重新生成你的回复，符合 Madeline 人设，不要违反红线规则。"));
        return aiClient.chat(msgs);
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "…" : s;
    }
}
