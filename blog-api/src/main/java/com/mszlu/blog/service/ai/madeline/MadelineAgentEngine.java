package com.mszlu.blog.service.ai.madeline;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.utils.UserThreadLocal;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Madeline agent 引擎：工具循环（上限 6 步防烧 token）。
 * 循环：LLM 决策 JSON（tool / reply）→ 执行工具回注上下文 → 终态 reply 真流式生成正文。
 * SSE 事件帧：step（步骤播报）/ emotion（情绪）/ delta（正文增量）/ result（polish 卡片数据）/ done / error。
 * 一期工具：polishText（评估润色，不写库）。
 */
@Component
@Slf4j
public class MadelineAgentEngine {

    /** 决策循环硬上限：防工具来回踢皮球烧 token */
    private static final int MAX_STEPS = 6;

    private static final List<String> MOOD_WHITELIST =
            Arrays.asList("默认", "可爱", "不安", "不开心", "惊讶", "怨恨", "无语");

    @Autowired
    private AiClient aiClient;

    @Autowired
    private PolishTextTool polishTextTool;

    public void run(String userMessage, HttpServletResponse response) {
        SysUser user = UserThreadLocal.get();
        if (user == null || userMessage == null || userMessage.trim().isEmpty()) {
            writeJsonError(response, 400, "消息为空");
            return;
        }
        String userId = user.getId();
        String trimmed = userMessage.trim();

        response.setContentType("text/event-stream;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");

        List<AiMessage> messages = new ArrayList<>();
        messages.add(new AiMessage("system", PromptBuilder.madelineAgent()));
        messages.add(new AiMessage("user", trimmed));

        JSONObject polishResult = null;  // polishText 卡片数据（推 result 事件用）
        String polishOriginal = null;    // 送润色的原文（卡片对照用）
        String plan = null;              // 终态回复要点
        String mood = "默认";
        boolean[] anyFrame = {false};    // 是否推过任何帧：一帧没推才能 reset 503

        // ================= 决策循环 =================
        try {
            for (int step = 1; step <= MAX_STEPS; step++) {
                String decisionRaw = aiClient.chat(messages, true);
                JSONObject decision = parseDecision(decisionRaw);
                if (decision == null) {
                    // 决策输出没法解析：不卡死，直接转 reply 开口回答
                    log.warn("agent 决策解析失败 userId={}, raw={}", userId,
                            decisionRaw == null ? "null" : decisionRaw.substring(0, Math.min(200, decisionRaw.length())));
                    plan = "直接回答对方刚才说的话";
                    break;
                }
                String action = decision.getString("action");
                if ("tool".equals(action) && "polishText".equals(decision.getString("tool"))
                        && polishResult == null) {
                    JSONObject args = decision.getJSONObject("args");
                    String text = args == null ? null : args.getString("text");
                    String style = args == null ? null : args.getString("style");
                    // 步骤播报：她动手前的一句话，前端显示进度
                    String say = decision.getString("say");
                    if (say != null && !say.trim().isEmpty()) {
                        try {
                            sseEvent(response, "step", "{\"say\":" + JSON.toJSONString(say.trim())
                                    + ",\"mood\":" + JSON.toJSONString(normalizeMood(decision.getString("mood"))) + "}");
                            anyFrame[0] = true;
                        } catch (Exception e) {
                            return; // 客户端已断开
                        }
                    }
                    polishOriginal = text;
                    JSONObject toolOut = polishTextTool.run(text, style);
                    if (toolOut == null) {
                        // 工具失败不卡死：回注失败事实，让她用 reply 口头兜住
                        messages.add(new AiMessage("assistant", decisionRaw));
                        messages.add(new AiMessage("user",
                                "【工具结果】polishText 这次没跑成。用 reply 跟对方说改不动的原因，或请她换一段试试，别装作改好了。"));
                    } else {
                        polishResult = toolOut;
                        messages.add(new AiMessage("assistant", decisionRaw));
                        messages.add(new AiMessage("user",
                                "【工具结果】润色完成。问题清单：" + toolOut.getJSONArray("issues")
                                        + "\n改动说明：" + toolOut.getString("changeNote")
                                        + "\n接下来用 reply 把你的看法说给对方听，1-3 句，别复述卡片内容。"));
                    }
                    continue;
                }
                // reply 分支（未知工具名也落这里兜底，直接开口）
                plan = decision.getString("plan");
                mood = normalizeMood(decision.getString("mood"));
                break;
            }
        } catch (Exception e) {
            log.warn("agent 决策循环异常 userId={}", userId, e);
        }

        // 6 步跑完还没 reply：兜底要点，保证她一定开口
        if (plan == null) {
            plan = "告诉对方你想了想，但这事一下说不清，先聊聊再说";
        }

        // ================= 终态：真流式生成她的回复 =================
        String toolDigest = polishResult != null
                ? "润色卡片已展示在页面上。改动说明：" + polishResult.getString("changeNote")
                : null;
        List<AiMessage> replyMsgs = new ArrayList<>();
        replyMsgs.add(new AiMessage("system", PromptBuilder.madelineAgentReply(plan, toolDigest)));
        replyMsgs.add(new AiMessage("user", trimmed));

        StringBuilder full = new StringBuilder();
        boolean[] aborted = {false};
        boolean[] emotionSent = {false}; // emotion 推迟到首个 delta 一起发：流式直接失败时仍可 reset 503
        String finalMood = mood;
        String aiText;
        try {
            aiText = aiClient.streamChat(replyMsgs, delta -> {
                full.append(delta);
                try {
                    if (!emotionSent[0]) {
                        sseEvent(response, "emotion", finalMood);
                        emotionSent[0] = true;
                        anyFrame[0] = true;
                    }
                    sseEvent(response, "delta", delta);
                } catch (Exception io) {
                    aborted[0] = true;
                    throw new RuntimeException(io);
                }
            });
        } catch (Exception e) {
            log.warn("agent 终态流式异常 userId={}", userId, e);
            aiText = null;
        }
        if (aborted[0]) return; // 客户端主动断开：静默结束

        if (aiText == null || full.length() == 0) {
            // 一帧正文都没推出去
            if (!anyFrame[0]) {
                // 连 step 都没推过（决策循环全挂）：响应未提交，reset 后明确 503，前端走整段回退
                response.reset();
                writeJsonError(response, 503, "AI 暂时开小差，请稍后再试");
            } else {
                // 推过 step/emotion：无法 reset，发 error 事件让前端走回退
                try {
                    sseEvent(response, "error", "AI 暂时开小差，请稍后再试");
                } catch (Exception ignored) {
                }
            }
            return;
        }

        // 正文成功：推 polish 对照卡片数据（若有），再收尾
        if (polishResult != null) {
            JSONObject card = new JSONObject();
            card.put("tool", "polishText");
            card.put("original", polishOriginal);
            card.put("polished", polishResult.getString("polished"));
            card.put("issues", polishResult.getJSONArray("issues"));
            card.put("changeNote", polishResult.getString("changeNote"));
            try {
                sseEvent(response, "result", card.toJSONString());
            } catch (Exception ignored) {
                return;
            }
        }
        try {
            sseEvent(response, "done", "{\"mood\":\"" + mood + "\"}");
        } catch (Exception ignored) {
        }
    }

    /** 决策 JSON 容错解析：容忍 markdown 代码块包裹、前后多余文字 */
    private JSONObject parseDecision(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```(json)?", "").replaceFirst("```$", "").trim();
        }
        int l = s.indexOf('{'), r = s.lastIndexOf('}');
        if (l == -1 || r <= l) return null;
        try {
            return JSON.parseObject(s.substring(l, r + 1));
        } catch (Exception e) {
            return null;
        }
    }

    /** 情绪白名单归一：非法值一律「默认」 */
    private String normalizeMood(String mood) {
        return mood != null && MOOD_WHITELIST.contains(mood) ? mood : "默认";
    }

    /** 写一个 SSE 事件帧：event: <name>\n[data: ...]\n\n。多行 data 按 \n 拆分，与 diary 链路同协议。 */
    private void sseEvent(HttpServletResponse response, String event, String data) throws java.io.IOException {
        java.io.PrintWriter w = response.getWriter();
        w.write("event: ");
        w.write(event);
        w.write('\n');
        if (data != null) {
            String normalized = data.replace("\r\n", "\n").replace('\r', '\n');
            for (String line : normalized.split("\n", -1)) {
                w.write("data: ");
                w.write(line);
                w.write('\n');
            }
        }
        w.write('\n');
        w.flush();
    }

    /** 响应未提交前写 JSON 错误（前端据 resp.ok 走回退） */
    private void writeJsonError(HttpServletResponse response, int code, String msg) {
        try {
            response.setStatus(code);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":false,\"code\":" + code + ",\"msg\":\"" + msg + "\"}");
        } catch (Exception ignored) {
        }
    }
}
