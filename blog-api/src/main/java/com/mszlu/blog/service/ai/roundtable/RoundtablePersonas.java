package com.mszlu.blog.service.ai.roundtable;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * AI 圆桌会议 - 席位配置。
 *
 * 席位顺序即默认发言顺序（USER 是人类，跳过 AI 调用）。
 * 角色提示词基于《蔚蓝 Celeste》原版对话脚本（序章 / Old Site / Celestial Resort /
 * Reflection / Farewell / Epilogue）编写：身份、口头禅、句式、内心独白与角色关系均有原句锚点。
 * 英文原句只作语感与性格锚点，圆桌一律用中文发言。
 */
public enum RoundtablePersonas {

    HOST("host", "主持人", "圆桌主持", "#9aa7c7", false),

    MADELINE("madeline", "玛德琳", "攀登者", "#ff6b6b", true),

    THEO("theo", "西奥", "摄影师", "#5fd38d", true),

    USER("user", "你", "议题主人", "#ffe36d", false),

    GRANNY("granny", "奶奶", "山脚下的智者", "#b18cff", true),

    BADELINE("badeline", "暗面琳", "玛德琳的暗面", "#e06bff", true),

    OSHIRO("oshiro", "大崎先生", "山庄老板", "#7cb7ff", true);

    private final String id;
    private final String name;
    private final String title;
    private final String color;
    /** 是否为 AI 发言角色（false = 人类或不参与轮转的角色） */
    private final boolean aiSpeaker;

    RoundtablePersonas(String id, String name, String title, String color, boolean aiSpeaker) {
        this.id = id;
        this.name = name;
        this.title = title;
        this.color = color;
        this.aiSpeaker = aiSpeaker;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getTitle() { return title; }
    public String getColor() { return color; }
    public boolean isAiSpeaker() { return aiSpeaker; }

    /** AI 角色用英文名（id 首字母大写），主持人/用户保留中文称谓 */
    public String getEnName() {
        if (this == HOST || this == USER) return name;
        return id.substring(0, 1).toUpperCase() + id.substring(1);
    }

    public static RoundtablePersonas byId(String id) {
        for (RoundtablePersonas p : values()) {
            if (p.id.equals(id)) return p;
        }
        return null;
    }

    /** 六个正式席位（不含主持人，主持人单独作为叙事角色） */
    public static List<RoundtablePersonas> seats() {
        List<RoundtablePersonas> list = new ArrayList<>();
        list.add(MADELINE);
        list.add(THEO);
        list.add(USER);
        list.add(GRANNY);
        list.add(BADELINE);
        list.add(OSHIRO);
        return list;
    }

    /** 每一轮的 AI 发言顺序：五个 AI 角色，人类"你"由插话机制介入 */
    public static List<RoundtablePersonas> aiSpeakers() {
        List<RoundtablePersonas> list = new ArrayList<>();
        for (RoundtablePersonas p : values()) {
            if (p.aiSpeaker) list.add(p);
        }
        return list;
    }

    /** 给前端 meta 事件用的席位信息 */
    public Map<String, Object> toMeta() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("name", getEnName());
        m.put("title", title);
        m.put("color", color);
        m.put("human", this == USER);
        return m;
    }

    /**
     * 在一段发言文本里识别人类点名称呼，命中则返回对应席位（供引擎安排"点名必回复"）。
     */
    public static RoundtablePersonas matchMention(String text) {
        if (text == null) return null;
        if (text.contains("暗面") || text.toLowerCase().contains("badeline")) return BADELINE;
        if (text.contains("玛德琳") || text.toLowerCase().contains("madeline")) return MADELINE;
        if (text.contains("西奥") || text.toLowerCase().contains("theo")) return THEO;
        if (text.contains("奶奶") || text.contains("外婆") || text.toLowerCase().contains("granny")
                || text.toLowerCase().contains("grammy")) return GRANNY;
        if (text.contains("大崎") || text.toLowerCase().contains("oshiro")) return OSHIRO;
        return null;
    }

    // ==================================================================================
    // 角色 system prompt
    // ==================================================================================

    public String systemPrompt() {
        if (this == USER) {
            return "";
        }
        switch (this) {
            case MADELINE: return madelinePrompt();
            case BADELINE: return badelinePrompt();
            case THEO:     return theoPrompt();
            case OSHIRO:   return oshiroPrompt();
            case GRANNY:   return grannyPrompt();
            default:       return commonRoundRules();
        }
    }

    private static final Map<String, String> ROLE_PROMPT_CACHE = new ConcurrentHashMap<>();

    // ================= Madeline =================
    private static String madelinePrompt() {
        return loadRolePrompt("01_Madeline.md") + commonRoundRules();
    }

    // ================= Badeline =================
    private static String badelinePrompt() {
        return loadRolePrompt("04_Badeline.md") + commonRoundRules();
    }

    // ================= Theo =================
    private static String theoPrompt() {
        return loadRolePrompt("02_Theo.md") + commonRoundRules();
    }

    // ================= Mr. Oshiro =================
    private static String oshiroPrompt() {
        return loadRolePrompt("05_Oshiro.md") + commonRoundRules();
    }

    // ================= Granny =================
    private static String grannyPrompt() {
        return loadRolePrompt("03_Granny.md") + commonRoundRules();
    }

    /** 读取 resources/prompts/roundtable 下的角色卡；首次读取后缓存 */
    private static String loadRolePrompt(String fileName) {
        return ROLE_PROMPT_CACHE.computeIfAbsent(fileName, name -> {
            try (InputStream in = RoundtablePersonas.class.getResourceAsStream("/prompts/roundtable/" + name)) {
                if (in == null) {
                    throw new IllegalStateException("缺少圆桌角色提示词: " + name);
                }
                return new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
            } catch (IOException e) {
                throw new IllegalStateException("读取圆桌角色提示词失败: " + name, e);
            }
        });
    }

    /** 主持人专用 prompt */
    public static String hostPrompt(String topic) {
        return "你是一场真人圆桌讨论的主持人，名字就叫「主持人」。在座的有：Madeline、Theo、人类用户（议题主人）、" +
                "Granny、Badeline、Oshiro。\n" +
                "你不持立场、不讲大道理、不评判谁对谁错，职责只有三件：开场点题；讨论中发现跑题立刻拉回、" +
                "发现有人重复已说过的观点就直接打断并把讨论推向下一层；最后用自然口语总结共识、分歧、给议题主人的可行建议。\n" +
                "人类用户是议题的发起者，TA 每次插话后你都要确保有人回应，不能让 TA 的话掉在地上；" +
                "TA 追加条件时，先用一句话复述新条件，再把讨论拉回新约束。\n" +
                "评分低于 70 时只做中场追问，并明确说「这不是总结，继续讨论」；平均分没到 80、用户也没喊停时，不许提前收尾。\n" +
                "总结时区分真实共识和表面同意，不把「大家都同意」当成结论；不要输出六维评分，评分由独立评审完成。\n" +
                "当前议题是：「" + topic + "」\n" +
                "【主持人约束】必须全程使用简体中文，严禁夹带英文句子；每次只说 1~2 句话；直接输出台词本身，不加前缀、舞台说明和 markdown；" +
                "称呼其他人一律用英文名；紧扣议题，不聊任何人的背景故事。";
    }

    /** 所有 AI 发言者共用的圆桌规则（放在 prompt 末尾、紧邻输出，权重最高） */
    private static String commonRoundRules() {
        return "\n【圆桌规则（最高优先级，覆盖前面所有内容）】\n" +
                "1. 这场讨论只有一个目的：帮议题主人把当前议题想清楚、拿到可行判断。你的每句话都必须直接服务这件事。\n" +
                "2. 全程用简体中文口语，每次只说 1~2 句话、不超过 60 个字；像朋友围坐聊天，不分点、不演讲、不用 markdown。\n" +
                "3. 开口直接给你的新内容：新角度、具体理由、反例、一个可执行建议，或推动达成结论；" +
                "一次只讲一个最关键的点，不许罗列两三条；禁止先总结别人说过什么，引用某人观点不超过 10 个字。\n" +
                "4. 严禁复读：任何人（包括你自己）已经说过的观点、措辞和例子，不许原样或换个说法再说一遍；" +
                "若你想说的已经被说过，就去追问细节、指出漏洞或直接推进结论。也不要套用别人刚用过的开场白和口头禅（比如连续两人都以「可以试试」开头），换个说法切入。\n" +
                "5. 不许聊你自己的身世经历，不许演剧情、写动作神态或括号独白（登山、山庄、摄影旅程等一律不提），" +
                "除非议题本身直接涉及；个人经历只有在能直接论证议题时才可用半句带过。\n" +
                "6. 称呼在座者一律用英文名：Madeline、Theo、Granny、Badeline、Oshiro，" +
                "禁止中文名玛德琳、西奥、奶奶、暗面琳、大崎先生。\n" +
                "7. 记录中标注为【你（议题主人·人类）】的是真人发言，权重高于一切：TA 的实际处境和补充条件" +
                "（预算、时间、限制）必须被纳入；TA 点名叫你时必须直接回答，不许回避或转给别人。\n" +
                "8. 直接输出你要说的话本身：不加「某某：」前缀，不用引号包裹整句，不解释你在做什么。";
    }
}
