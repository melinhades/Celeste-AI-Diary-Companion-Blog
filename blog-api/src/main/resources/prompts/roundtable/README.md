# 圆桌会议提示词系统 - 使用说明

## 文件清单
`
blog-api/src/main/resources/prompts/roundtable/
├── 00_共用规则.md          # 所有角色和主持人共用的会议规则
├── 01_Madeline.md          # 温和但坚定，关注情感成本和可持续性
├── 02_Theo.md              # 乐观实用，擅长拆解问题和找第一步
├── 03_Granny.md            # 阅历深厚，指出盲区和长期后果
├── 04_Badeline.md          # 犀利诚实，戳破自我欺骗和逃避
├── 05_Oshiro.md            # 焦虑完美主义者，放大风险但也说崩溃后怎么办
└── 06_主持人.md            # 中立协调者，掌控节奏和评分收尾
`

## 后端集成指南

### 1. 加载提示词
`java
// RoundtableEngine.java 或 PromptBuilder.java
public class RoundtablePrompts {
    private static final String RULES = loadPrompt("roundtable/00_共用规则.md");
    private static final String MADELINE = loadPrompt("roundtable/01_Madeline.md");
    private static final String THEO = loadPrompt("roundtable/02_Theo.md");
    private static final String GRANNY = loadPrompt("roundtable/03_Granny.md");
    private static final String BADELINE = loadPrompt("roundtable/04_Badeline.md");
    private static final String OSHIRO = loadPrompt("roundtable/05_Oshiro.md");
    private static final String MODERATOR = loadPrompt("roundtable/06_主持人.md");
    
    private static String loadPrompt(String path) {
        try {
            return new String(Files.readAllBytes(
                Paths.get("src/main/resources/prompts/" + path)), 
                StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load prompt: " + path, e);
        }
    }
    
    public static String forRole(String roleName) {
        switch (roleName.toLowerCase()) {
            case "madeline": return RULES + "\n\n" + MADELINE;
            case "theo": return RULES + "\n\n" + THEO;
            case "granny": return RULES + "\n\n" + GRANNY;
            case "badeline": return RULES + "\n\n" + BADELINE;
            case "oshiro": return RULES + "\n\n" + OSHIRO;
            case "moderator": return RULES + "\n\n" + MODERATOR;
            default: throw new IllegalArgumentException("Unknown role: " + roleName);
        }
    }
}
`

### 2. 构建角色消息
`java
// 每个角色发言时的系统提示
public AiMessage buildRoleSystemPrompt(String roleName, String topic, List<String> history) {
    String basePrompt = RoundtablePrompts.forRole(roleName);
    
    StringBuilder context = new StringBuilder();
    context.append(basePrompt).append("\n\n");
    context.append("## 当前议题\n").append(topic).append("\n\n");
    context.append("## 已有发言\n");
    for (String msg : history) {
        context.append(msg).append("\n");
    }
    context.append("\n现在轮到你发言（2-4 句话）：\n");
    
    return new AiMessage("system", context.toString());
}
`

### 3. 主持人评分逻辑
`java
// 主持人评估讨论质量
public ConsensusScore evaluateConsensus(List<Turn> turns) {
    String prompt = RoundtablePrompts.forRole("moderator") + "\n\n" +
        "## 评估任务\n" +
        "根据以下讨论记录，给出六维评分（0-100）：\n\n" +
        turnsToString(turns) + "\n\n" +
        "输出格式（JSON）：\n" +
        "{\n" +
        "  \"conclusion\": 85,\n" +
        "  \"reasoning\": 90,\n" +
        "  \"diversity\": 80,\n" +
        "  \"focus\": 88,\n" +
        "  \"interaction\": 92,\n" +
        "  \"practicality\": 78,\n" +
        "  \"weakest\": \"practicality\",\n" +
        "  \"reason\": \"建议不够具体\"\n" +
        "}";
    
    String response = aiClient.chat(List.of(new AiMessage("system", prompt)), false);
    return parseConsensusScore(response);
}
`

### 4. 调度策略
`java
// 根据上下文选择下一个发言者
public String selectNextSpeaker(String topic, List<Turn> history, String lastSpeaker) {
    // 策略 1：如果用户刚插话，让被提到的角色回应
    if (lastSpeaker.equals("用户")) {
        String mentioned = extractMentionedRole(history.get(history.size() - 1).content);
        if (mentioned != null) return mentioned;
    }
    
    // 策略 2：如果某个角色被质疑，让 TA 回应
    String challenged = extractChallengedRole(history.get(history.size() - 1).content);
    if (challenged != null) return challenged;
    
    // 策略 3：根据议题类型选择合适角色
    if (topic.contains("情感") || topic.contains("边界")) return "Madeline";
    if (topic.contains("行动") || topic.contains("第一步")) return "Theo";
    if (topic.contains("长期") || topic.contains("经验")) return "Granny";
    if (topic.contains("真相") || topic.contains("逃避")) return "Badeline";
    if (topic.contains("风险") || topic.contains("焦虑")) return "Oshiro";
    
    // 策略 4：轮流发言，避免某个角色沉默太久
    return selectLeastRecentSpeaker(history);
}
`

## 使用示例

### 开场
`
【主持人】
今天的议题是：我要不要辞职去做自己喜欢的事？

参会者：Madeline、Theo、Granny、Badeline、Oshiro，以及议题主人小明。

这个问题的核心是：在稳定和热爱之间如何选择，以及如何评估风险。

我们从 Madeline 开始。
`

### 典型对话流
`
【Madeline】
如果辞职了，三个月后你会怎么看这个决定？如果后悔了，能回去吗？

【Theo】
Madeline 说的情感成本我懂。但有时候不动的焦虑比做错的后悔更难受。不如先试一小步？比如兼职做做看？

【Badeline】
Theo 说的'试一小步'听起来很好。但你知道你不会做。你说'等稳定了再说'已经说了两年了。

【Granny】
我见过很多人像你这样。大部分人选了留下，十年后都后悔了。但也有人辞了职，后来又回去了。

【Oshiro】
但如果辞职了，收入断了，房租付不起，然后新工作也找不到怎么办？我不是吓你，但这个风险你想过吗？

【主持人】
刚才的讨论，**实用性还不够**。我们提了很多方向，但都不够具体。

Theo、Madeline，你们能不能说说，**具体第一步是什么**？

**这不是总结，我们继续讨论。**

【Theo】
好。具体第一步：这周末列个清单，写下'辞职后要做的事'和'需要多少钱撑三个月'。写完再决定。

【Madeline】
Theo 说的可行。但列清单之前，先问自己：你是真的想做那件事，还是只是想逃离现在的工作？

【主持人】
好，我们的讨论到这里。

## 共识
1. 不要在情绪最激烈的时候做决定
2. 需要评估具体的经济风险（至少三个月生活费）
3. 可以先小范围尝试（兼职/业余），再决定是否全职转行

## 分歧
- Madeline 和 Badeline 认为要先搞清楚动机（是追求还是逃避）
- Theo 认为可以边做边想，不必等到想清楚
- Oshiro 担心风险过大，Granny 认为不做的风险更大

## 给小明的可行建议
1. 这周末列清单：想做的事 + 需要的启动资金 + 三个月生活费
2. 先用业余时间试做一个月，看看是不是真的喜欢
3. 问自己：辞职是为了奔向什么，还是逃离什么？
4. 如果决定辞职，先存够半年生活费，再递辞呈
5. 留一条退路：和现在的公司谈谈能不能停薪留职或转兼职

## 六维评分
- 结论达成度：85 - 形成了明确的行动建议
- 论证充分度：88 - 各方观点都有理由支撑
- 视角多样性：92 - 五个角色的差异很明显
- 聚焦度：80 - 偶尔偏离但很快拉回
- 互动性：90 - 有真实的回应和反驳
- 实用性：82 - 建议具体且可执行

**平均分：86**

我们达成了足够的共识。
`

## 测试要点

### 1. 角色差异性测试
- Madeline 和 Theo 对同一问题的回应应该明显不同
- Badeline 应该能戳破其他角色的"温和回避"
- Oshiro 应该能指出 Theo 忽略的风险

### 2. 主持人控制测试
- 讨论跑题时，主持人应该拉回
- 评分 < 70 时，应该追问而不是收尾
- 评分 ≥ 80 时，应该立即总结

### 3. 用户互动测试
- 用户插话后，相关角色应该回应
- 用户点名 Badeline，她应该立即发言
- 用户追加条件，讨论应该重新聚焦

### 4. 收尾质量测试
- 共识部分应该是真正的共识，不是"虚假同意"
- 分歧部分应该客观陈述，不偏袒任何一方
- 建议应该具体可执行，不是"做你自己"这类空话

## 注意事项

1. **提示词长度**：每个角色提示词 + 共用规则约 2000-3000 tokens，需注意上下文窗口
2. **角色一致性**：确保每个角色的发言符合其人设，不要串戏
3. **评分客观性**：主持人的评分应基于讨论内容，不受角色偏好影响
4. **用户体验**：避免角色发言过长（严格控制 2-4 句），保持节奏感

## 后续优化方向

1. **动态调整**：根据讨论进展动态调整角色发言顺序
2. **情绪识别**：识别用户情绪，让合适的角色（如 Madeline）先安抚
3. **记忆整合**：会议结束后，提取关键观点存入用户的长期记忆
4. **多轮会议**：支持"续会"功能，在新信息出现后重新讨论

---

生成时间：2026-11-04
版本：v1.0
