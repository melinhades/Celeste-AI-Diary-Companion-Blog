package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 自主发言调度器：基于当前 transcript 选下一位发言 AI 与动作类型。
 * 人类点名时直接采用被点角色（不调模型）；模型异常/非法时按"距上次发言最久且非上一发言人"兜底。
 */
@Component
@Slf4j
public class TurnScheduler {

    private static final String[] AI_IDS = {"madeline", "theo", "granny", "badeline", "oshiro"};
    private static final String[] ACTIONS = {"同意", "补充", "反驳", "追问", "回应"};

    private final AiClient aiClient;

    @Autowired
    public TurnScheduler(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    @Getter
    public static class ScheduleResult {
        private final String speakerId;
        private final String action;
        private final String publicNote;
        public ScheduleResult(String speakerId, String action, String publicNote) {
            this.speakerId = speakerId;
            this.action = action;
            this.publicNote = publicNote;
        }
    }

    public ScheduleResult schedule(RoundtableSession session, String forcedSpeakerId) {
        if (forcedSpeakerId != null && isValidId(forcedSpeakerId)) {
            return new ScheduleResult(forcedSpeakerId, "回应", "正在回应人类的提问");
        }
        String last = lastSpeaker(session);
        try {
            String raw = aiClient.chat(buildMessages(session, last), true);
            if (raw != null) {
                JSONObject obj = JSON.parseObject(raw);
                if (obj != null) {
                    String sid = obj.getString("speakerId");
                    if (isValidId(sid) && !sid.equals(last)) {
                        String action = obj.getString("action");
                        if (action == null || action.isEmpty()) action = "补充";
                        String note = obj.getString("publicNote");
                        if (note == null || note.isEmpty()) note = "准备发言…";
                        return new ScheduleResult(sid, action, note);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("调度模型解析失败，走兜底: {}", e.getMessage());
        }
        return fallback(session, last);
    }

    private boolean isValidId(String id) {
        if (id == null) return false;
        for (String a : AI_IDS) if (a.equals(id)) return true;
        return false;
    }

    private String lastSpeaker(RoundtableSession session) {
        List<Map<String, Object>> t = session.getTranscript();
        for (int i = t.size() - 1; i >= 0; i--) {
            String rid = (String) t.get(i).get("speakerId");
            if (isValidId(rid)) return rid;
        }
        return null;
    }

    /** 兜底：选发言次数最少、且非上一位发言人的 AI */
    private ScheduleResult fallback(RoundtableSession session, String last) {
        Map<String, Integer> counts = new HashMap<>();
        for (String id : AI_IDS) counts.put(id, 0);
        for (Map<String, Object> m : session.getTranscript()) {
            String rid = (String) m.get("speakerId");
            if (counts.containsKey(rid)) counts.put(rid, counts.get(rid) + 1);
        }
        String best = null;
        int bestCount = Integer.MAX_VALUE;
        for (String id : AI_IDS) {
            if (id.equals(last)) continue;
            int c = counts.get(id);
            if (c < bestCount) { bestCount = c; best = id; }
        }
        if (best == null) best = AI_IDS[0];
        return new ScheduleResult(best, "补充", "准备发言…");
    }

    private List<AiMessage> buildMessages(RoundtableSession session, String last) {
        List<AiMessage> msgs = new ArrayList<>();
        StringBuilder sys = new StringBuilder();
        sys.append("你是圆桌讨论的调度器。当前议题：").append(session.getTopic()).append("\n");
        sys.append("五位 AI：Madeline, Theo, Granny, Badeline, Oshiro（称呼一律用英文名）。\n");
        sys.append("动作枚举：同意/补充/反驳/追问/回应。\n");
        if (last != null) sys.append("上一位发言人是 ").append(last).append("，不要连续选同一人。\n");
        sys.append("只输出 JSON：{\"speakerId\":\"...\",\"action\":\"...\",\"publicNote\":\"一句话公开说明\"}。");
        msgs.add(new AiMessage("system", sys.toString()));

        StringBuilder user = new StringBuilder("讨论记录：\n");
        List<Map<String, Object>> t = session.getTranscript();
        int from = Math.max(0, t.size() - 12);
        for (int i = from; i < t.size(); i++) {
            Map<String, Object> m = t.get(i);
            user.append("【").append(m.get("name")).append("】").append(m.get("content")).append("\n");
        }
        user.append("请选出下一位发言者。");
        msgs.add(new AiMessage("user", user.toString()));
        return msgs;
    }
}
