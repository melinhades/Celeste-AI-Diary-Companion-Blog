package com.mszlu.blog.service.ai.roundtable;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 组装六个席位的 meta 信息：五位 AI 固定 + 一个人类席位（议题主人）。
 * 人类席位仅一个（USER），其余均为 AI 发言人。
 */
public class RosterBuilder {

    public static List<Map<String, Object>> build(RoundtableSession session) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (RoundtablePersonas p : RoundtablePersonas.seats()) {
            Map<String, Object> m = new LinkedHashMap<>(p.toMeta());
            if (p == RoundtablePersonas.USER) {
                String nick = session.getUserNickname();
                if (nick != null && !nick.trim().isEmpty()) {
                    m.put("name", nick);
                }
            }
            list.add(m);
        }
        return list;
    }
}
