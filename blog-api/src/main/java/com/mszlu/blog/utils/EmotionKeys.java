package com.mszlu.blog.utils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 情绪键统一口径（与前端 blog-ui/js/lib/emotion-map.js 同一份词表）。
 *
 * <p>19 键并集 = 玛德琳 7 键 ∪ Badeline 15 键（normal / angry / sad 重叠）。中文七词
 * （默认 / 不安 / 惊讶 / 怨恨 / 不开心 / 可爱 / 无语）继续作为玛德琳键的别名。
 * 这里只做「识别 + 归一」，不改变任何调用方原有的输出值：调用方拿到的仍是原来的
 * 中文标签，落库的 emotion_type 与 emotionOut 的历史语义保持不变。</p>
 */
public final class EmotionKeys {

    /** 19 键并集 */
    public static final List<String> ALL = List.of(
            "normal", "panic", "surprised", "angry", "sad", "peaceful", "deadpan",
            "angryAlt", "yell", "worried", "worriedAlt", "upset", "concerned",
            "sigh", "serious", "scoff", "freakA", "freakB", "freakC");

    private static final List<String> MADELINE = List.of(
            "normal", "panic", "surprised", "angry", "sad", "peaceful", "deadpan");

    private static final List<String> BADELINE = List.of(
            "normal", "sad", "angry", "angryAlt", "yell", "worried", "worriedAlt",
            "upset", "concerned", "sigh", "serious", "scoff", "freakA", "freakB", "freakC");

    private static final Map<String, String> ZH_COMMON = Map.of(
            "伤心", "sad", "难过", "sad");

    private static final Map<String, String> ZH_MADELINE = Map.of(
            "默认", "normal", "不安", "panic", "惊讶", "surprised", "怨恨", "angry",
            "不开心", "sad", "可爱", "peaceful", "无语", "deadpan");

    private static final Map<String, String> ZH_BADELINE = Map.ofEntries(
            Map.entry("平静", "normal"), Map.entry("低落", "sad"), Map.entry("恼火", "angry"),
            Map.entry("强压怒火", "angryAlt"), Map.entry("喊叫", "yell"), Map.entry("不安", "worried"),
            Map.entry("强装镇定", "worriedAlt"), Map.entry("委屈", "upset"), Map.entry("关切", "concerned"),
            Map.entry("叹息", "sigh"), Map.entry("认真", "serious"), Map.entry("嘲弄", "scoff"),
            Map.entry("崩溃边缘", "freakA"), Map.entry("风暴", "freakB"), Map.entry("失控", "freakC"));

    private static final Map<String, String> LABEL_MADELINE = Map.of(
            "normal", "默认", "panic", "不安", "surprised", "惊讶", "angry", "怨恨",
            "sad", "不开心", "peaceful", "可爱", "deadpan", "无语");

    private static final Map<String, String> LABEL_BADELINE = Map.ofEntries(
            Map.entry("normal", "平静"), Map.entry("sad", "低落"), Map.entry("angry", "恼火"),
            Map.entry("angryAlt", "强压怒火"), Map.entry("yell", "喊叫"), Map.entry("worried", "不安"),
            Map.entry("worriedAlt", "强装镇定"), Map.entry("upset", "委屈"), Map.entry("concerned", "关切"),
            Map.entry("sigh", "叹息"), Map.entry("serious", "认真"), Map.entry("scoff", "嘲弄"),
            Map.entry("freakA", "崩溃边缘"), Map.entry("freakB", "风暴"), Map.entry("freakC", "失控"));

    /** 跨角色降级：并集键落不到本角色时，取最接近的一个（与前端 FALLBACK 表一致） */
    private static final Map<String, String> FALLBACK_MADELINE = Map.ofEntries(
            Map.entry("angryAlt", "angry"), Map.entry("yell", "angry"),
            Map.entry("worriedAlt", "panic"), Map.entry("concerned", "panic"),
            Map.entry("upset", "sad"), Map.entry("sigh", "deadpan"),
            Map.entry("scoff", "deadpan"), Map.entry("serious", "normal"),
            Map.entry("freakA", "surprised"), Map.entry("freakB", "surprised"),
            Map.entry("freakC", "angry"));

    private static final Map<String, String> FALLBACK_BADELINE = Map.of(
            "panic", "worried", "surprised", "worried",
            "peaceful", "normal", "deadpan", "serious");

    private static final Map<String, String> CANONICAL = new HashMap<>();

    static {
        for (String key : ALL) CANONICAL.put(key.toLowerCase(), key);
    }

    private EmotionKeys() {
    }

    /** 19 键并集 / 中文别名 → 英文键；认不出返回 null */
    public static String canonical(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        String key = CANONICAL.get(s.toLowerCase());
        if (key != null) return key;
        key = ZH_COMMON.get(s);
        if (key != null) return key;
        key = ZH_MADELINE.get(s);
        return key != null ? key : ZH_BADELINE.get(s);
    }

    /** 情绪白名单校验：19 键并集 + 中文别名（七词 / 十五词） */
    public static boolean isValid(String raw) {
        return canonical(raw) != null;
    }

    /** 玛德琳视角：并集键 / 中文别名 → 她真正拥有的七键；认不出返回 null */
    public static String keyForMadeline(String raw) {
        return keyFor(raw, MADELINE, ZH_MADELINE, FALLBACK_MADELINE);
    }

    /** Badeline 视角：并集键 / 中文别名 → 她真正拥有的十五键；认不出返回 null */
    public static String keyForBadeline(String raw) {
        return keyFor(raw, BADELINE, ZH_BADELINE, FALLBACK_BADELINE);
    }

    /** 玛德琳中文标签；认不出返回 null（调用方自行回落「默认」） */
    public static String madelineLabel(String raw) {
        String key = keyForMadeline(raw);
        return key == null ? null : LABEL_MADELINE.get(key);
    }

    /** Badeline 中文标签；认不出返回 null */
    public static String badelineLabel(String raw) {
        String key = keyForBadeline(raw);
        return key == null ? null : LABEL_BADELINE.get(key);
    }

    private static String keyFor(String raw, List<String> own,
                                 Map<String, String> zhOwn, Map<String, String> fallback) {
        if (raw == null) return null;
        String s = raw.trim();
        // 角色自己的中文别名优先：「不安」对玛德琳是 panic、对她是 worried
        String key = zhOwn.get(s);
        if (key == null) key = canonical(s);
        if (key == null) return null;
        if (own.contains(key)) return key;
        String fb = fallback.get(key);
        return fb != null ? fb : "normal";
    }
}
