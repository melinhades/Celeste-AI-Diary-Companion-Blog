package com.mszlu.blog.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.EvalCaseMapper;
import com.mszlu.blog.dao.mapper.PromptProposalMapper;
import com.mszlu.blog.dao.pojo.EvalCase;
import com.mszlu.blog.dao.pojo.PromptProposal;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自我迭代第三步：从基准集归纳失败模式，产出 prompt 补丁提案。
 * <p>
 * 边界：只写 ms_prompt_proposal，不改源码、不自动上线；提案必须人工确认后才可能进入 PromptBuilder。
 */
@Service
@Slf4j
public class PromptProposalService {

    /** 单次送给模型的用例上限，防止 prompt 过长 */
    private static final int MAX_CASES = 30;
    /** 列表查询上限 */
    private static final int MAX_LIST = 100;
    /** 补丁长度上限（字符） */
    private static final int MAX_PATCH_CHARS = 800;
    /** 用例摘要里每条输入/输出的截断长度 */
    private static final int MAX_FIELD = 160;

    @Autowired
    private EvalCaseMapper evalCaseMapper;

    @Autowired
    private PromptProposalMapper promptProposalMapper;

    @Autowired
    private AiClient aiClient;

    /**
     * 生成一条待审补丁。
     *
     * @param days 只取最近多少天的用例，收敛到 [1, 90]
     */
    public Map<String, Object> generate(int days) {
        int window = days <= 0 ? 7 : Math.min(days, 90);
        long since = System.currentTimeMillis() - window * 24L * 60 * 60 * 1000;

        List<EvalCase> cases;
        try {
            cases = evalCaseMapper.selectList(new LambdaQueryWrapper<EvalCase>()
                    .in(EvalCase::getStatus, Arrays.asList("ready", "pending"))
                    .ge(EvalCase::getCreateDate, since)
                    .orderByDesc(EvalCase::getCreateDate)
                    .last("limit " + MAX_CASES));
        } catch (Exception e) {
            log.warn("补丁提案读取基准集失败: {}", e.getMessage());
            return notGenerated(window, "基准集查询失败：" + e.getMessage());
        }

        List<EvalCase> usable = new ArrayList<>();
        for (EvalCase c : cases) {
            if (c.getCaseInput() != null && !c.getCaseInput().isBlank()) {
                usable.add(c);
            }
        }
        if (usable.isEmpty()) {
            return notGenerated(window, "窗口内没有可用用例，先跑 /agent/eval/promote");
        }

        String digest = buildDigest(usable);
        JSONObject parsed;
        try {
            List<AiMessage> msgs = new ArrayList<>();
            msgs.add(new AiMessage("system", "你只输出严格 JSON，不输出任何其他文字。"));
            msgs.add(new AiMessage("user", PromptBuilder.promptProposal(digest)));
            String raw = aiClient.chat(msgs, true);
            parsed = parseJson(raw);
        } catch (Exception e) {
            log.warn("补丁提案 AI 调用失败: {}", e.getMessage());
            return notGenerated(window, "AI 调用失败，未生成提案");
        }
        if (parsed == null) {
            return notGenerated(window, "AI 返回无法解析为 JSON");
        }

        String patch = trim(parsed.getString("patch"));
        if (patch == null || patch.isBlank()) {
            return notGenerated(window, "AI 没有给出有效补丁");
        }
        if (patch.length() > MAX_PATCH_CHARS) {
            patch = patch.substring(0, MAX_PATCH_CHARS);
        }

        PromptProposal p = new PromptProposal();
        p.setTitle(clip(parsed.getString("title"), 240));
        p.setScene("chat");
        p.setCaseIds(caseIdsJson(usable));
        p.setFailPatterns(patternJson(parsed.getJSONArray("patterns")));
        p.setPatch(patch);
        p.setPatchHash(sha256(patch));
        p.setRationale(clip(parsed.getString("rationale"), 1000));
        p.setRisk(clip(parsed.getString("risk"), 1000));
        p.setModel(aiClient.getModel());
        p.setStatus("pending");
        p.setCreateDate(System.currentTimeMillis());

        try {
            promptProposalMapper.insert(p);
        } catch (Exception e) {
            // patch_hash 唯一键冲突：同一补丁已经提过
            log.info("补丁提案未入库（可能重复）: {}", e.getMessage());
            return notGenerated(window, "相同补丁已存在，未重复生成");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generated", true);
        out.put("windowDays", window);
        out.put("caseCount", usable.size());
        out.put("proposal", p);
        return out;
    }

    /** 提案列表：默认待审 */
    public List<PromptProposal> list(String status, int limit) {
        int size = limit <= 0 ? 20 : Math.min(limit, MAX_LIST);
        LambdaQueryWrapper<PromptProposal> qw = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            qw.eq(PromptProposal::getStatus, status.trim());
        }
        qw.orderByDesc(PromptProposal::getCreateDate)
                .last("limit " + size);
        return promptProposalMapper.selectList(qw);
    }

    private String buildDigest(List<EvalCase> cases) {
        StringBuilder sb = new StringBuilder();
        for (EvalCase c : cases) {
            sb.append("- 输入：").append(clip(c.getCaseInput(), MAX_FIELD));
            if (c.getBadOutput() != null && !c.getBadOutput().isBlank()) {
                sb.append("｜坏输出：").append(clip(c.getBadOutput(), MAX_FIELD));
            }
            if (c.getExpected() != null && !c.getExpected().isBlank()) {
                sb.append("｜期望/违反规则：").append(clip(c.getExpected(), MAX_FIELD));
            }
            sb.append('\n');
        }
        return sb.toString();
    }

    private JSONObject parseJson(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.startsWith("```")) {
            s = s.replaceFirst("^```(json)?", "").replaceFirst("```$", "").trim();
        }
        int l = s.indexOf('{'), r = s.lastIndexOf('}');
        if (l < 0 || r <= l) return null;
        try {
            return JSON.parseObject(s.substring(l, r + 1));
        } catch (Exception e) {
            return null;
        }
    }

    private String caseIdsJson(List<EvalCase> cases) {
        JSONArray arr = new JSONArray();
        for (EvalCase c : cases) arr.add(c.getId());
        return arr.toJSONString();
    }

    private String patternJson(JSONArray patterns) {
        if (patterns == null || patterns.isEmpty()) return null;
        JSONArray arr = new JSONArray();
        for (int i = 0; i < patterns.size() && i < 10; i++) {
            String s = trim(patterns.getString(i));
            if (s != null && !s.isBlank()) arr.add(clip(s, 200));
        }
        return arr.isEmpty() ? null : arr.toJSONString();
    }

    private Map<String, Object> notGenerated(int window, String reason) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generated", false);
        out.put("windowDays", window);
        out.put("reason", reason);
        return out;
    }

    private String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.substring(0, 64);
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }

    private String trim(String s) {
        return s == null ? null : s.trim();
    }

    private String clip(String s, int max) {
        if (s == null) return null;
        String oneLine = s.replace("\r", " ").replace("\n", " ").trim();
        return oneLine.length() <= max ? oneLine : oneLine.substring(0, max) + "…";
    }
}
