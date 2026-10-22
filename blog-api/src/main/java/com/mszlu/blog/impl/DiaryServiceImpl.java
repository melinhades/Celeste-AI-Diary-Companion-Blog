package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.dao.mapper.DiaryCompanionMapper;
import com.mszlu.blog.dao.pojo.*;
import com.mszlu.blog.service.DiaryService;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.service.ai.BadelineStageRules;
import com.mszlu.blog.service.diarychat.*;
import com.mszlu.blog.dao.pojo.DiaryChatLog;
import com.mszlu.blog.dao.pojo.DiaryChatSession;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.CompanionParam;
import com.mszlu.blog.vo.params.DiaryParam;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executor;

/**
 * 日记服务实现
 */
@Service
@Slf4j
public class DiaryServiceImpl implements DiaryService {

    /** 日记内容入库上限，超长截断（防拖垮存储与 AI 调用） */
    private static final int MAX_CONTENT_LENGTH = 5000;
    /** 列表分页单页最大条数，防止前端传超大 pageSize 拖垮查询 */
    private static final int MAX_PAGE_SIZE = 50;
    /**
     * 流式反馈行首情绪标记容错正则：
     * 标准写法 [emotion:不安]，也兜住模型偶尔写错的 [不安] / [emotion：不安]。
     * 只认伴侣专用的 7 种白名单情绪，避免误剥正文里的方括号内容。
     */
    private static final java.util.regex.Pattern STREAM_EMOTION_PREFIX = java.util.regex.Pattern.compile(
            "^\\s*\\[\\s*(?:emotion\\s*[:：]\\s*)?(默认|不安|惊讶|怨恨|不开心|可爱|无语)\\s*\\]\\s*");
    /**
     * 正文里的句内情绪切换标记（AI 自行判断插入）：[m:不安] / [m：不安]，
     * 兼容模型误写成 [emotion:不安] 的情况。落库与记忆提取前必须剥掉，用户永远看不到。
     */
    private static final java.util.regex.Pattern INLINE_MOOD_MARKER = java.util.regex.Pattern.compile(
            "\\[\\s*(?:m|emotion)\\s*[:：]\\s*(默认|不安|惊讶|怨恨|不开心|可爱|无语)\\s*\\]");

    @Autowired
    private DiaryMapper diaryMapper;

    @Autowired
    private DiaryCompanionMapper diaryCompanionMapper;

    @Autowired
    private PersonaService personaService;

    @Autowired
    private MemoryService memoryService;

    @Autowired
    private AiClient aiClient;

    @Autowired
    @Qualifier("aiExecutor")
    private Executor aiExecutor;

    @Autowired
    private BadelineStageRules badelineStageRules;

    // ===== v1 扩展组件（Madeline 日记多轮实时反应） =====
    @Autowired private DiaryChatInterruptManager interruptManager;
    @Autowired private DiaryChatMemory chatMemory;
    @Autowired private DiaryChatLogService chatLogService;
    @Autowired private DiaryChatPersonaChecker personaChecker;
    @Autowired private DiaryChatEmotionExtractor emotionExtractor;
    @Autowired private DiaryChatIntentClassifier intentClassifier;

    @Override
    public Result save(DiaryParam param) {
        String userId = UserThreadLocal.get().getId();
        Date now = new Date();
        Diary diary = new Diary();
        diary.setUserId(userId);
        // 梦境日记与普通日记分开存储：仅当显式传 dream 时为梦境，其余（含历史数据）一律普通日记
        diary.setType("dream".equals(param.getType()) ? "dream" : "day");
        String title = param.getTitle();
        if (title != null && title.length() > 255) title = title.substring(0, 255);
        diary.setTitle(title);
        // 内容长度上限：超长截断，防止拖垮入库与下游 AI 调用
        String content = param.getContent();
        if (content != null && content.length() > MAX_CONTENT_LENGTH) {
            content = content.substring(0, MAX_CONTENT_LENGTH);
        }
        diary.setContent(content);
        diary.setCreateDate(now);
        diary.setUpdateDate(now);

        if (param.getId() != null && !param.getId().isEmpty()) {
            // 更新：必须带 userId 归属条件，防止改到别人的日记
            diary.setId(param.getId());
            com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<Diary> uw =
                    new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
            uw.eq(Diary::getId, param.getId());
            uw.eq(Diary::getUserId, userId);
            int rows = diaryMapper.update(diary, uw);
            if (rows == 0) {
                // 不区分"不存在"与"无权限"，统一按不存在返回，防信息探测
                return Result.fail(404, "日记不存在");
            }
        } else {
            // 新增
            diaryMapper.insert(diary);
        }

        // 情绪分析：仅普通日记异步跑（结果落库供次日对话/周月汇总）；梦境不进白天情绪统计
        if (!"dream".equals(diary.getType())) {
            analyzeEmotionAsync(userId, diary.getId(), content);
        }

        // 保存成功后异步提取记忆：日记是单边内容，走专门的日记提取规则（不再传空 aiReply 套对话模式）
        memoryService.extractDiaryAsync(userId, content);

        // 日记分片 + 向量化，进 RAG 知识库（异步，不阻塞保存）
        memoryService.chunkDiary(userId, diary.getId(), diary.getTitle(), content);

        return Result.success(diary.getId());
    }

    /** 保存后异步做结构化情绪分析并写回日记行；走 AI 专用线程池，失败打 warn 便于排障 */
    private void analyzeEmotionAsync(String userId, String diaryId, String content) {
        if (content == null || content.trim().isEmpty()) return;
        java.util.concurrent.CompletableFuture.runAsync(() -> {
            try {
                String snippet = content.substring(0, Math.min(1500, content.length()));
                String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                        new AiMessage("user", PromptBuilder.emotionAnalyze(snippet)))));
                java.util.Map<String, Object> data = parseEmotionReply(reply, snippet);
                Diary upd = new Diary();
                upd.setId(diaryId);
                upd.setEmotion(String.valueOf(data.get("topEmotion")));
                upd.setEmotionDetail(JSON.toJSONString(data));
                diaryMapper.updateById(upd);
            } catch (Exception e) {
                log.warn("日记情绪分析失败 userId={} diaryId={}", userId, diaryId, e);
            }
        }, aiExecutor);
    }

    /** 最近情绪画像：最近3天内最新一篇有情绪数据的日记 */
    @Override
    public String recentEmotionNote(String userId) {
        try {
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.add(java.util.Calendar.DAY_OF_MONTH, -3);
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
            wrapper.eq(Diary::getUserId, userId);
            wrapper.isNotNull(Diary::getEmotionDetail);
            wrapper.eq(Diary::getType, "day");
            wrapper.ge(Diary::getCreateDate, cal.getTime());
            wrapper.orderByDesc(Diary::getCreateDate);
            wrapper.last("limit 1");
            Diary d = diaryMapper.selectOne(wrapper);
            return PromptBuilder.emotionNote(d);
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    public Result list(int page, int pageSize, String type) {
        String userId = UserThreadLocal.get().getId();
        int p = page < 1 ? 1 : page;
        int size = pageSize < 1 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<Diary> pageObj =
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(p, size);
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        if ("day".equals(type) || "dream".equals(type)) {
            wrapper.eq(Diary::getType, type);   // 普通日记与梦境日记互不串列
        }
        wrapper.orderByDesc(Diary::getUpdateDate);
        com.baomidou.mybatisplus.extension.plugins.pagination.Page<Diary> result =
                diaryMapper.selectPage(pageObj, wrapper);

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("list", result.getRecords());
        data.put("total", result.getTotal());
        data.put("page", p);
        data.put("pageSize", size);
        data.put("hasMore", result.getCurrent() < result.getPages());
        return Result.success(data);
    }

    @Override
    public Result count() {
        String userId = UserThreadLocal.get().getId();
        // 只统计普通日记（梦境日记不计入票根日记数，与写日记 +1 的口径一致）
        long count = diaryMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary>()
                        .eq(Diary::getUserId, userId)
                        .eq(Diary::getType, "day"));
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("count", count);
        return Result.success(data);
    }

    @Override
    public Result getById(String diaryId) {
        String userId = UserThreadLocal.get().getId();
        // 查询带 userId 归属条件：查不到（不存在或不是自己的）一律返回 data=null，
        // 不区分两种情况，防止通过遍历 ID 探测他人日记是否存在
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getId, diaryId);
        wrapper.eq(Diary::getUserId, userId);
        Diary diary = diaryMapper.selectOne(wrapper);
        return Result.success(diary);
    }

    @Override
    public Result delete(String diaryId) {
        String userId = UserThreadLocal.get().getId();
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getId, diaryId);
        wrapper.eq(Diary::getUserId, userId);
        diaryMapper.delete(wrapper);
        return Result.success(null);
    }

    @Override
    public Result dailyPostcard() {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(403, "未登录");
        }
        String userId = user.getId();
        String userName = user.getNickname() != null ? user.getNickname() : user.getAccount();

        // 查找昨天的日记（自然日：昨天 00:00 ~ 今天 00:00，不再用 now-24h 滑动窗口）
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
        cal.set(java.util.Calendar.MINUTE, 0);
        cal.set(java.util.Calendar.SECOND, 0);
        cal.set(java.util.Calendar.MILLISECOND, 0);
        Date todayStart = cal.getTime();
        cal.add(java.util.Calendar.DAY_OF_MONTH, -1);
        Date yesterdayStart = cal.getTime();
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.ge(Diary::getCreateDate, yesterdayStart);
        wrapper.lt(Diary::getCreateDate, todayStart);
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 1");
        Diary yesterdayDiary = diaryMapper.selectOne(wrapper);

        String diaryContent = yesterdayDiary != null ? yesterdayDiary.getContent() : "";
        if (diaryContent != null && diaryContent.length() > 1200) {
            diaryContent = diaryContent.substring(0, 1200);
        }

        String emotionNote = yesterdayDiary != null
                ? PromptBuilder.emotionNote(yesterdayDiary)
                : recentEmotionNote(userId);
        String prompt = PromptBuilder.dailyPostcard(userName, diaryContent, emotionNote);
        String reply = aiClient.chat(
                new java.util.ArrayList<>(java.util.Arrays.asList(
                        new AiMessage("user", prompt))));

        if (reply == null) {
            reply = userName + "，新的一天开始了，记得对自己温柔一点。—— Madeline";
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("userName", userName);
        data.put("message", reply);
        data.put("hasDiary", yesterdayDiary != null);
        return Result.success(data);
    }

    @Override
    public Result heartCrystal() {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(403, "未登录");
        }
        String userId = user.getId();

        // 近 10 篇日记的情绪 → 主色投票
        // 红=不安/愤怒（炽热），蓝=平静/疲惫/悲伤/孤独（沉静），黄=开心/期待/满足/惊讶（明亮）
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 10");
        java.util.List<Diary> diaries = diaryMapper.selectList(wrapper);

        int red = 0, blue = 0, yellow = 0;
        StringBuilder trace = new StringBuilder();
        for (Diary d : diaries) {
            String e = d.getEmotion() == null ? "" : d.getEmotion();
            if (!e.isEmpty()) trace.append(e).append(" ");
            switch (e) {
                case "不安": case "愤怒": red++; break;
                case "平静": case "疲惫": case "悲伤": case "孤独": blue++; break;
                case "开心": case "期待": case "满足": case "惊讶": yellow++; break;
                default: break;
            }
        }
        String color;
        if (diaries.isEmpty()) {
            color = "blue"; // 没有数据时默认蓝——正典里第一颗水晶心就是蓝色
        } else if (red >= blue && red >= yellow) {
            color = "red";
        } else if (blue >= yellow) {
            color = "blue";
        } else {
            color = "yellow";
        }

        // AI 生成名称与描述（两行文本：第一行名称，第二行描述）
        String prompt = PromptBuilder.heartTitle(color, trace.toString());
        String reply = aiClient.chat(
                new java.util.ArrayList<>(java.util.Arrays.asList(
                        new AiMessage("user", prompt))));

        String FALLBACK_TITLE = "red".equals(color) ? "不肯熄的心"
                : "yellow".equals(color) ? "甜得过分的心" : "不知所谓的机器";
        String FALLBACK_DESC = "red".equals(color) ? "那些没说出口的火，烧着烧着就成了灯。"
                : "yellow".equals(color) ? "草莓攒出来的小太阳，专照阴天。" : "山底的冰凉水声，替你把心事泡得很轻。";

        String title = FALLBACK_TITLE, desc = FALLBACK_DESC;
        if (reply != null && !reply.trim().isEmpty()) {
            String[] lines = reply.trim().replaceAll("\"", "").split("\n");
            java.util.List<String> ok = new java.util.ArrayList<>();
            for (String l : lines) { if (!l.trim().isEmpty()) ok.add(l.trim()); }
            if (ok.size() >= 1 && ok.get(0).length() >= 2 && ok.get(0).length() <= 10) {
                title = ok.get(0);
                if (ok.size() >= 2 && ok.get(1).length() >= 2 && ok.get(1).length() <= 24) {
                    desc = ok.get(1);
                }
            }
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("color", color);
        data.put("title", title);
        data.put("desc", desc);
        return Result.success(data);
    }

    @Override
    public Result bubble() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();
        String userName = user.getNickname() != null ? user.getNickname() : user.getAccount();

        long oneHourAgo = System.currentTimeMillis() - 60 * 60 * 1000L;
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.ge(Diary::getCreateDate, new Date(oneHourAgo));
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 1");
        Diary recentDiary = diaryMapper.selectOne(wrapper);

        String context = recentDiary != null && recentDiary.getContent() != null ? recentDiary.getContent() : "";
        String emotionNote = recentDiary != null
                ? PromptBuilder.emotionNote(recentDiary)
                : recentEmotionNote(userId);
        // prompt 统一收敛在 PromptBuilder，调人设只改一个文件
        String snippet = context.isEmpty() ? "" : context.substring(0, Math.min(200, context.length()));
        String prompt = PromptBuilder.bubblePrompt(emotionNote, snippet);

        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", prompt))));
        if (reply == null || reply.isEmpty()) {
            String[] defaults = {"在写什么呢？", "今天天气怎么样？", "想你了，冒个泡~", "嘿，我在呢。", "慢慢来，不着急。"};
            reply = defaults[(int)(Math.random() * defaults.length)];
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply);
        data.put("emotion", "默认");
        return Result.success(data);
    }

    /**
     * 日记伴侣：根据草稿片段返回 Madeline 的反馈和情绪
     */
    public Result companion(String draftSnippet) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(403, "未登录，请先登录");
        }
        String userId = user.getId();
        Persona persona = personaService.getActive(userId);
        List<Memory> memories = memoryService.getRelevant(userId, draftSnippet);
        String emotionNote = recentEmotionNote(userId);

        var messages = new ArrayList<AiMessage>();
        messages.add(new AiMessage("system", PromptBuilder.diaryCompanion(persona, memories, draftSnippet, emotionNote)));

        String reply = aiClient.chat(messages, true);
        if (reply == null) {
            return Result.fail(500, "Madeline 这会儿不想说话（AI 调用失败），稍后再试");
        }

        String feedback = reply.trim();
        String emotion = "默认";
        try {
            JSONObject obj = JSON.parseObject(feedback);
            String r = obj.getString("reply");
            if (r != null && !r.isBlank()) feedback = r.trim();
            emotion = normalizeHerEmotion(obj.getString("emotion"));
        } catch (Exception e) {
            emotion = "默认";
        }
        // 防御：JSON 模式下模型理论上不写内联标记，若误写则剥离（前端也能识别，这里保证落库干净）
        feedback = INLINE_MOOD_MARKER.matcher(feedback).replaceAll("").trim();

        DiaryCompanion companion = new DiaryCompanion();
        companion.setUserId(userId);
        companion.setSuggestion(feedback);
        companion.setCreateDate(System.currentTimeMillis());
        diaryCompanionMapper.insert(companion);

        var result = new java.util.HashMap<String, Object>();
        result.put("feedback", feedback);
        result.put("emotion", emotion);
        result.put("userEmotion", scanEmotion(draftSnippet));
        return Result.success(result);
    }

    /**
     * 日记伴侣流式版（v1 扩展）：多轮会话记忆 + 实时中断 + 双模态情绪 + 人格检查 + 全链路日志。
     * 与 v0 同一套 SSE 事件帧协议（emotion/delta/done/silent/error），前端无需改解析逻辑。
     */
    @Override
    public void companionStream(CompanionParam param, javax.servlet.http.HttpServletResponse response) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            try { response.setStatus(400); response.setContentType("application/json;charset=UTF-8");
                  response.getWriter().write("{\"success\":false,\"code\":400,\"msg\":\"未登录\"}"); } catch (Exception ignored) {}
            return;
        }
        String userId = user.getId();
        String draftSnippet = param.getDraft() == null ? "" : param.getDraft().trim();
        String sessionId = param.getSessionId();
        if (sessionId == null || sessionId.isBlank()) sessionId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        // —— 中断入口：如果前端传了 interrupt=true，直接标记中断并返回（新请求不启动生成） ——
        if (Boolean.TRUE.equals(param.getInterrupt()) || "interrupt".equals(param.getTriggerType())) {
            interruptManager.markInterrupted(sessionId);
            log.info("日记伴侣会话中断标记 sessionId={}", sessionId);
            return;
        }

        if (draftSnippet.isEmpty()) {
            try { response.setStatus(400); response.setContentType("application/json;charset=UTF-8");
                  response.getWriter().write("{\"success\":false,\"code\":400,\"msg\":\"草稿为空\"}"); } catch (Exception ignored) {}
            return;
        }

        // === v1 扩展：会话记忆 ===
        long t0 = System.currentTimeMillis();
        DiaryChatMemory.SessionBuffer buf = chatMemory.getOrCreate(userId, sessionId);
        int turnId = buf.turnCount + 1;

        // === v2 扩展：深度情绪提取（Plutchik 三层 + embed 交叉验证 + 跨日记趋势 + 自适应融合） ===
        DiaryChatEmotionExtractor.EmotionResult emotion = emotionExtractor.extract(draftSnippet, param.getTypingSignal(), userId);

        // === v1 扩展：意图分类 ===
        String intent = intentClassifier.classify(draftSnippet, buf.summary);

        // —— 草稿太短（< 4 字）或情绪极平静：保持 v0 行为，发 silent 事件直接返回 ——
        if (draftSnippet.length() < 4 || emotion.getScore().doubleValue() < 0.15) {
            response.setContentType("text/event-stream;charset=UTF-8");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("X-Accel-Buffering", "no");
            try {
                sseEvent(response, "silent", "");
                sseEvent(response, "done", "{\"silent\":true,\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId + "}");
            } catch (Exception ignored) {}
            return;
        }

        // —— v0 原有逻辑：人设 + RAG + 情绪画像 ——
        Persona persona = personaService.getActive(userId);
        List<Memory> memories = memoryService.getRelevant(userId, draftSnippet);
        String emotionNote = recentEmotionNote(userId);

        // === v1 扩展：组装 system prompt（记忆 + 情绪 + 意图 + 羽毛/圆桌联动） ===
        StringBuilder systemPrompt = new StringBuilder();
        systemPrompt.append(PromptBuilder.diaryCompanion(persona, memories, draftSnippet, emotionNote, true));

        // 情绪意图注入 prompt
        systemPrompt.append("\n\n【本轮上下文（供你参考，直接响应）】\n")
                .append("- 用户情绪：").append(emotion.getEmotionType())
                .append("，强度 ").append(String.format("%.2f", emotion.getScore().doubleValue())).append("\n")
                .append("- 用户意图：").append(intent).append("\n")
                .append("- 反应策略参考：")
                .append(intentStrategy(intent)).append("\n");

        // 羽毛联动
        boolean featherTriggered = Boolean.TRUE.equals(param.getFeatherTriggered());
        if (featherTriggered) {
            systemPrompt.append("- 提示：用户本次保存触发了羽毛，你可以自然地提一句（不要生硬）。\n");
        }

        // === v1 扩展：用记忆层的 buildMessages 组装完整消息列表 ===
        List<AiMessage> messages = chatMemory.buildMessages(
                buf,
                new AiMessage("system", systemPrompt.toString()),
                new AiMessage("user", draftSnippet)
        );

        // —— SSE 协议层（保留 v0 完整逻辑） ——
        response.setContentType("text/event-stream;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");

        StringBuilder full = new StringBuilder();
        StringBuilder headBuf = new StringBuilder();
        boolean[] emotionEmitted = {false};
        boolean[] silent = {false};
        String[] emotionOut = {"默认"};
        boolean[] aborted = {false};
        String aiText = null;
        Integer[] firstDeltaMs = {null};

        try {
            aiText = aiClient.streamChat(messages, delta -> {
                // === v1 扩展：中断检查（每帧回调都查，避免中断延迟） ===
                if (interruptManager.isInterrupted(sessionId)) {
                    throw new RuntimeException("interrupted by client");
                }

                full.append(delta);
                if (firstDeltaMs[0] == null) firstDeltaMs[0] = (int)(System.currentTimeMillis() - t0);

                if (silent[0]) return;
                try {
                    if (!emotionEmitted[0]) {
                        headBuf.append(delta);
                        String buf0 = headBuf.toString();
                        if (buf0.startsWith("[")) {
                            int close = buf0.indexOf(']');
                            if (close != -1) {
                                if (buf0.startsWith("[沉默]")) {
                                    silent[0] = true;
                                    sseEvent(response, "silent", "");
                                    emotionEmitted[0] = true;
                                    headBuf.setLength(0);
                                    return;
                                }
                                java.util.regex.Matcher em = STREAM_EMOTION_PREFIX.matcher(buf0);
                                if (em.find()) {
                                    emotionOut[0] = normalizeHerEmotion(em.group(1));
                                    sseEvent(response, "emotion", emotionOut[0]);
                                    String rest = buf0.substring(em.end());
                                    if (!rest.isEmpty()) sseEvent(response, "delta", rest);
                                } else {
                                    sseEvent(response, "emotion", emotionOut[0]);
                                    sseEvent(response, "delta", buf0);
                                }
                                emotionEmitted[0] = true;
                                headBuf.setLength(0);
                            }
                        } else {
                            sseEvent(response, "emotion", emotionOut[0]);
                            sseEvent(response, "delta", buf0);
                            emotionEmitted[0] = true;
                            headBuf.setLength(0);
                        }
                    } else {
                        sseEvent(response, "delta", delta);
                    }
                } catch (java.io.IOException io) {
                    aborted[0] = true;
                    throw new RuntimeException(io);
                }
            });
        } catch (Exception e) {
            if ("interrupted by client".equals(e.getMessage())) {
                log.info("日记伴侣会话流中断 sessionId={}", sessionId);
            } else {
                log.warn("日记伴侣流式反馈中断 userId={}", userId, e);
            }
        }

        // 清理中断标记
        interruptManager.consumeAndClear(sessionId);

        if (aborted[0]) return;

        if (silent[0]) {
            try {
                sseEvent(response, "done", "{\"silent\":true,\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId + "}");
            } catch (java.io.IOException ignored) {}
            return;
        }

        if (!emotionEmitted[0] && headBuf.length() > 0) {
            try {
                sseEvent(response, "emotion", emotionOut[0]);
                sseEvent(response, "delta", headBuf.toString());
            } catch (java.io.IOException ignored) {}
            emotionEmitted[0] = true;
        }

        if (aiText == null || full.length() == 0) {
            response.reset();
            response.setStatus(503);
            response.setContentType("application/json;charset=UTF-8");
            try { response.getWriter().write("{\"success\":false,\"code\":503,\"msg\":\"AI 暂时开小差，请稍后再试\"}"); } catch (Exception ignored) {}
            return;
        }

        // —— v0：剥离情绪标记 & 句内情绪切换 ——
        String text = full.toString().trim();
        java.util.regex.Matcher em = STREAM_EMOTION_PREFIX.matcher(text);
        if (em.find()) { emotionOut[0] = normalizeHerEmotion(em.group(1)); text = text.substring(em.end()).trim(); }
        text = INLINE_MOOD_MARKER.matcher(text).replaceAll("").trim();
        if (text.isEmpty()) return;

        // === v1 扩展：人格一致性检查 ===
        DiaryChatPersonaChecker.CheckResult check = personaChecker.ensurePersona(
                text, systemPrompt.toString(), draftSnippet, intent);
        String finalText = check.finalResponse;
        if (!check.pass) {
            log.warn("人格检查未过，兜底温柔回应 sessionId={}, 原因={}", sessionId, check.failReason);
            finalText = "嗯，我在听～";
        }

        // —— v0：落库旧版 DiaryCompanion + 记忆维护 ——
        DiaryCompanion companion = new DiaryCompanion();
        companion.setUserId(userId);
        companion.setSuggestion(finalText);
        companion.setCreateDate(System.currentTimeMillis());
        diaryCompanionMapper.insert(companion);
        memoryService.markMentioned(memories);
        memoryService.extractAsync(userId, draftSnippet, finalText);

        // === v1 扩展：会话记忆 appendTurn ===
        chatMemory.appendTurn(buf, draftSnippet, finalText);

        // === v1 扩展：全链路日志 ===
        DiaryChatLog logEntity = new DiaryChatLog();
        logEntity.setUserId(userId);
        logEntity.setSessionId(sessionId);
        logEntity.setTurnId(turnId);
        logEntity.setTriggerType(param.getTriggerType() == null ? "save" : param.getTriggerType());
        logEntity.setTriggerDetail(String.format("字数=%d,情绪得分=%.2f,意图=%s", draftSnippet.length(), emotion.getScore(), intent));
        logEntity.setUserDraft(draftSnippet.length() > 2000 ? draftSnippet.substring(0, 2000) + "…" : draftSnippet);
        logEntity.setTypingSignal(param.getTypingSignal());
        logEntity.setSystemPrompt(systemPrompt.length() > 4000 ? systemPrompt.toString().substring(0, 4000) + "…" : systemPrompt.toString());
        logEntity.setModelRaw(full.length() > 2000 ? full.toString().substring(0, 2000) + "…" : full.toString());
        logEntity.setFilteredResponse(finalText);
        logEntity.setFilterReason(check.failReason);
        logEntity.setEmotionScore(emotion.getScore());
        logEntity.setEmotionType(emotion.getEmotionType());
        logEntity.setEmotionScoreDetail(emotion.getEmotionScoreDetail());  // v2 新增：完整 JSON 落库
        logEntity.setIntentType(intent);
        logEntity.setFeatherTriggered(featherTriggered);
        logEntity.setFirstDeltaMs(firstDeltaMs[0]);
        logEntity.setTotalMs((int)(System.currentTimeMillis() - t0));
        chatLogService.write(logEntity);

        // —— 收尾事件（sessionId/turnId 回传给前端，后续请求带回来） ——
        try {
            sseEvent(response, "done",
                    "{\"emotion\":\"" + emotionOut[0] + "\",\"len\":" + finalText.length() +
                    ",\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId +
                    ",\"firstDeltaMs\":" + (firstDeltaMs[0] == null ? "null" : firstDeltaMs[0]) +
                    ",\"totalMs\":" + (System.currentTimeMillis() - t0) + "}");
        } catch (java.io.IOException ignored) {}
    }

    /** 根据意图类型返回 Madeline 的反应策略提示（注入 system prompt） */
    private String intentStrategy(String intent) {
        switch (intent == null ? "" : intent) {
            case "吐槽":   return "先共情，不要给解决方案；可以提一句类似经历，但不要说教。";
            case "疑问":   return "先复述问题，再追问具体点，最后给一个思考角度（不要直接给答案）。";
            case "喜悦":   return "先庆祝，再关联用户历史（你上次说…），可以加一句鼓励继续。";
            case "自我反思": return "先肯定反思行为，再引导深入（这种反应在什么情况下更容易出现？）。";
            case "求助":   return "拆解问题，给具体可执行的建议（第一步…第二步…），可以加备选方案。";
            default:       return "自然回应，符合 Madeline 人设。";
        }
    }

    /** 写一个 SSE 事件帧：event: <name>\n[data: ...]\n\n。多行 data 自动按 \n 拆分，兼容 \r\n。 */
    private void sseEvent(javax.servlet.http.HttpServletResponse response, String event, String data)
            throws java.io.IOException {
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
    /** 否定词：紧跟在情绪词前面时意思反转（「不是悲伤」= 不悲伤），计数时要跳过 */
    private static final java.util.regex.Pattern NEGATION_BEFORE = java.util.regex.Pattern.compile(
            "(?:不是|并不|才不|没有|不|没|无|别|非|莫)[^。！？，,.!?；;、\\s]{0,2}$");

    private String scanEmotion(String draft) {
        String[][] table = {
                {"不安", "担心", "焦虑", "害怕", "紧张", "不安", "忐忑", "恐慌", "迷茫", "彷徨", "不知所措"},
                {"惊讶", "惊讶", "意外", "震惊", "吃惊", "惊喜", "诧异", "没想到", "居然", "竟然"},
                {"怨恨", "怨恨", "愤怒", "生气", "恨", "嫌弃", "不公", "凭什么", "可恶", "恼火"},
                {"不开心", "不开心", "悲伤", "难过", "痛苦", "忧郁", "沮丧", "绝望", "孤独", "寂寞", "崩溃", "哭"},
                {"可爱", "可爱", "甜", "暖心", "感动", "幸福", "开心", "快乐", "感恩", "满足"},
                {"无语", "无语", "尴尬", "冷场", "呵呵", "算了", "服了", "离谱"}
        };
        String best = "默认";
        int bestCount = 0;
        for (String[] row : table) {
            int count = 0;
            for (int i = 1; i < row.length; i++) {
                String kw = row[i];
                int from = 0, idx;
                while ((idx = draft.indexOf(kw, from)) >= 0) {
                    from = idx + kw.length();
                    if (!isNegatedEmotion(draft, idx, kw)) count++;
                }
            }
            if (count > bestCount) { bestCount = count; best = row[0]; }
        }
        return best;
    }

    /**
     * 这个词是不是被前面的否定词否掉了：「我不是悲伤，我很开心」里的「悲伤」不算数（否则命中数相同、
     * 负面那行又排在前面，会把整体判成「不开心」）。
     * 另外「不开心」整体本身就是一个情绪词，不能被拆成「否定 + 开心」：遇到它要让「开心」那条跳过本词。
     */
    private boolean isNegatedEmotion(String draft, int idx, String kw) {
        boolean insideUnhappy = idx >= 1 && draft.startsWith("不开心", idx - 1);
        if (insideUnhappy) return !"不开心".equals(kw);
        int s = Math.max(0, idx - 3);
        return s < idx && NEGATION_BEFORE.matcher(draft.substring(s, idx)).find();
    }
    /** 情绪白名单校验：AI 给的标签不合法就回落默认 */
    private String normalizeHerEmotion(String emotion) {
        String[] valid = {"默认", "不安", "惊讶", "怨恨", "不开心", "可爱", "无语"};
        if (emotion != null) {
            for (String v : valid) {
                if (v.equals(emotion.trim())) return v;
            }
        }
        return "默认";
    }

    @Override
    public Result summary(DiaryParam param) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String content = param.getContent() == null ? "" : param.getContent();
        if (content.isEmpty()) return Result.fail(400, "内容为空");
        String snippet = content.substring(0, Math.min(600, content.length()));
        String prompt = "你是 Madeline，Celeste 的爬山女孩。你温暖、真诚、细腻。\n"
                + "用户刚写完一篇日记并保存了：\n———\n" + snippet + "\n———\n\n"
                + "请以 Madeline 的身份，用 1-2 句话为这篇日记做一个温柔的总结：先轻轻点出日记里最打动你的一件事，再给一句暖心的收尾。\n"
                + "不要说教，不要罗列，像朋友合上日记本后随口说的那句话。\n"
                + "直接输出文字，不要 JSON，不要引号。";
        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", prompt))));
        if (reply == null || reply.isEmpty()) {
            reply = "写完啦。今天这一页，我会替你记着的。";
        }
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply.trim());
        data.put("emotion", scanEmotion(snippet));
        return Result.success(data);
    }

    @Override
    public Result snapReflect(DiaryParam param) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String content = param.getContent() == null ? "" : param.getContent();
        if (content.isEmpty()) return Result.fail(400, "内容为空");
        String snippet = content.substring(0, Math.min(1200, content.length()));
        String emotionCtx = (param.getEmotion() == null || param.getEmotion().isEmpty())
                ? "" : "【这段时间已统计好的情绪数据】\n" + param.getEmotion() + "\n\n";
        String prompt = "你是 Madeline，Celeste 的爬山女孩。你温暖、真诚、细腻。\n"
                + emotionCtx
                + "这是用户这段时间写下的日记合集：\n———\n" + snippet + "\n———\n\n"
                + "请以 Madeline 的身份，回望这段日子，写一段简短温柔的感言（2-3 句）：先说说这些日记里最让你留意的东西，再给一句暖心的话。\n"
                + "不要说教，不要罗列，像写在明信片背面的几行字。\n"
                + "直接输出文字，不要 JSON，不要引号。";
        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", prompt))));
        if (reply == null || reply.isEmpty()) {
            reply = "这段日子回头看，每一页都写得认真。山记得你的每一步。";
        }
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply.trim());
        return Result.success(data);
    }

    private static final java.util.Set<String> EMOTION_WHITELIST = new java.util.HashSet<>(java.util.Arrays.asList(
            "开心", "平静", "期待", "满足", "不安", "悲伤", "孤独", "愤怒", "惊讶", "疲惫"));

    @Override
    public Result emotionAnalyze(DiaryParam param) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String content = param.getContent() == null ? "" : param.getContent();
        if (content.isEmpty()) return Result.fail(400, "内容为空");
        String snippet = content.substring(0, Math.min(1500, content.length()));
        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", PromptBuilder.emotionAnalyze(snippet)))));
        return Result.success(parseEmotionReply(reply, snippet));
    }

    /** 解析 AI 情绪分析结果；解析失败时降级为关键词统计 */
    private java.util.Map<String, Object> parseEmotionReply(String reply, String snippet) {
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        try {
            String json = reply == null ? "" : reply.trim();
            int start = json.indexOf('{');
            int end = json.lastIndexOf('}');
            if (start < 0 || end <= start) throw new IllegalArgumentException("no json");
            json = json.substring(start, end + 1);
            com.alibaba.fastjson.JSONObject obj = JSON.parseObject(json);
            com.alibaba.fastjson.JSONArray arr = obj.getJSONArray("emotions");
            java.util.List<java.util.Map<String, Object>> emotions = new java.util.ArrayList<>();
            String top = null;
            if (arr != null) {
                for (int i = 0; i < arr.size() && i < 4; i++) {
                    com.alibaba.fastjson.JSONObject e = arr.getJSONObject(i);
                    String name = e.getString("name");
                    Integer percent = e.getInteger("percent");
                    if (name == null || !EMOTION_WHITELIST.contains(name.trim())) continue;
                    java.util.Map<String, Object> item = new java.util.HashMap<>();
                    item.put("name", name.trim());
                    item.put("percent", percent == null ? 0 : Math.max(0, Math.min(100, percent)));
                    emotions.add(item);
                    if (top == null) top = name.trim();
                }
            }
            if (emotions.isEmpty()) throw new IllegalArgumentException("no valid emotion");
            data.put("emotions", emotions);
            data.put("topEmotion", top);
            Integer intensity = obj.getInteger("intensity");
            data.put("intensity", intensity == null ? 3 : Math.max(1, Math.min(5, intensity)));
            String valence = obj.getString("valence");
            data.put("valence", "positive".equals(valence) || "negative".equals(valence) ? valence : "neutral");
            String energy = obj.getString("energy");
            data.put("energy", "high".equals(energy) || "low".equals(energy) ? energy : "medium");
            java.util.List<String> events = new java.util.ArrayList<>();
            com.alibaba.fastjson.JSONArray evArr = obj.getJSONArray("events");
            if (evArr != null) {
                for (int i = 0; i < evArr.size() && i < 3; i++) {
                    String ev = evArr.getString(i);
                    if (ev != null && !ev.trim().isEmpty() && ev.trim().length() <= 50) events.add(ev.trim());
                }
            }
            data.put("events", events);
            String concern = obj.getString("concern");
            data.put("concern", concern == null ? "" : concern.trim());
            String key = obj.getString("keySentence");
            data.put("keySentence", key == null ? "" : key.trim());
        } catch (Exception e) {
            String fallback = scanEmotion(snippet);
            java.util.Map<String, Object> item = new java.util.HashMap<>();
            item.put("name", fallback);
            item.put("percent", 100);
            data.put("emotions", java.util.Collections.singletonList(item));
            data.put("topEmotion", fallback);
            data.put("intensity", 3);
            data.put("valence", "neutral");
            data.put("energy", "medium");
            data.put("events", new java.util.ArrayList<String>());
            data.put("concern", "");
            data.put("keySentence", "");
        }
        return data;
    }

    @Override
    public Result oshiroChat(String message, String historyJson) {
        try {
            List<String> history;
            if (historyJson == null || historyJson.isBlank()) {
                history = new ArrayList<>();
            } else {
                history = JSON.parseArray(historyJson, String.class);
            }
            String prompt = PromptBuilder.oshiroChat(history);
            String reply = aiClient.chat(new ArrayList<>(java.util.Arrays.asList(
                    new AiMessage("user", prompt))));
            if (reply == null || reply.isBlank()) {
                reply = "（Oshiro 正在擦茶壶，耳朵有点红，没听清。你可以再说一遍吗？）";
            }
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("message", reply.trim());
            data.put("emotion", "默认");
            return Result.success(data);
        } catch (Exception e) {
            java.util.Map<String, Object> fallback = new java.util.HashMap<>();
            fallback.put("message", "（Oshiro 正在擦茶壶，耳朵有点红，没听清。你可以再说一遍吗？）");
            fallback.put("emotion", "不安");
            return Result.success(fallback);
        }
    }

    @Override
    public Result badelineChat(String message, String historyJson, String heartsJson) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(403, "未登录");
        }
        String userId = user.getId();
        if (message == null || message.trim().isEmpty()) {
            return Result.fail(400, "消息不能为空");
        }
        String userName = user.getNickname() != null && !user.getNickname().isBlank()
                ? user.getNickname() : user.getAccount();

        // ===== 方案C：关系状态（由日记自然推导，不硬推阶段） =====
        List<Diary> recent = diaryMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary>()
                        .eq(Diary::getUserId, userId)
                        .eq(Diary::getType, "day")
                        .orderByDesc(Diary::getCreateDate)
                        .last("limit 10"));
        Diary first = diaryMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary>()
                        .eq(Diary::getUserId, userId)
                        .eq(Diary::getType, "day")
                        .orderByAsc(Diary::getCreateDate)
                        .last("limit 1"));
        int dayCount = 1;
        if (first != null && first.getCreateDate() != null) {
            dayCount = 1 + (int) ((System.currentTimeMillis() - first.getCreateDate().getTime()) / 86400000L);
        }
        long now = System.currentTimeMillis();
        int gapDays = (recent.isEmpty() || recent.get(0).getCreateDate() == null) ? -1
                : (int) ((now - recent.get(0).getCreateDate().getTime()) / 86400000L);
        int prevGap = -1;
        if (recent.size() >= 2 && recent.get(0).getCreateDate() != null && recent.get(1).getCreateDate() != null) {
            prevGap = (int) ((recent.get(0).getCreateDate().getTime() - recent.get(1).getCreateDate().getTime()) / 86400000L);
        }

        // ===== 对话历史（先解析，供「上次互动」用） =====
        List<AiMessage> history = new ArrayList<>();
        String lastAssistant = null;
        if (historyJson != null && !historyJson.isBlank()) {
            try {
                List<JSONObject> arr = JSON.parseArray(historyJson, JSONObject.class);
                if (arr != null) {
                    for (JSONObject o : arr) {
                        if (o == null) continue;
                        String c = o.getString("content");
                        if (c == null || c.trim().isEmpty()) continue;
                        String r = "assistant".equals(o.getString("role")) ? "assistant" : "user";
                        history.add(new AiMessage(r, c));
                        if ("assistant".equals(r)) lastAssistant = c;
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (history.size() > 10) {
            history = new ArrayList<>(history.subList(history.size() - 10, history.size()));
        }
        if (lastAssistant != null) {
            lastAssistant = lastAssistant.trim();
            if (lastAssistant.length() > 60) lastAssistant = lastAssistant.substring(0, 60) + "…";
        }

        String[] state = badelineState(recent, dayCount, gapDays, prevGap);
        String background = PromptBuilder.badelineBackground(userName, dayCount, state[0], gapDays,
                state[1], state[2], state[3], badelineHeartsLine(heartsJson), lastAssistant);

        // ===== 组装消息：system(人设+背景) + RAG + 最近历史 + 本条 =====
        List<AiMessage> messages = new ArrayList<>();
        messages.add(new AiMessage("system", PromptBuilder.badelineSystem(background)));
        try {
            List<com.mszlu.blog.vo.ContextChunk> context = memoryService.searchContext(userId, message.trim(), 4);
            if (context != null && !context.isEmpty()) {
                messages.add(new AiMessage("system", PromptBuilder.contextBlock(context)));
            }
        } catch (Exception ignored) {
        }
        messages.addAll(history);
        messages.add(new AiMessage("user", message.trim()));

        String reply = aiClient.chat(messages);
        if (reply == null || reply.isBlank()) {
            reply = "……信号不好。别以为这样就能跳过这段对话。";
        }
        reply = reply.trim();
        // 情绪标记：提示词要求首行 [emotion:xxx]，剥离后下发给前端驱动立绘；缺失则前端按台词自行推断
        String emotion = "";
        java.util.regex.Matcher em = java.util.regex.Pattern
                .compile("^\\[emotion\\s*:\\s*([a-zA-Z]{1,12})\\]\\s*").matcher(reply);
        if (em.find()) {
            emotion = em.group(1).toLowerCase();
            reply = reply.substring(em.end()).trim();
        }
        if (reply.isBlank()) {
            reply = "……";
        }
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply);
        data.put("emotion", emotion);
        data.put("stage", state[2]);
        return Result.success(data);
    }

    /**
     * 保存梦境日记（type=dream，与普通日记完全分开），并让 Madeline 用"读完梦的感受"口吻回应。
     * 梦境不跑白天那套情绪统计（analyzeEmotionAsync 仅服务普通日记），但照常提取记忆/分片入 RAG。
     */
    @Override
    public Result saveDream(DiaryParam param) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String content = param.getContent() == null ? "" : param.getContent().trim();
        if (content.isEmpty()) return Result.fail(400, "梦的内容为空");
        String userName = user.getNickname() != null && !user.getNickname().isBlank()
                ? user.getNickname() : user.getAccount();

        param.setType("dream");
        Result saved = save(param);   // 复用统一落库（含记忆提取/分片入 RAG）
        String dreamId = saved.getData() == null ? null : String.valueOf(saved.getData());
        if (!saved.isSuccess()) return saved;

        String snippet = content.length() > 1500 ? content.substring(0, 1500) : content;
        Persona persona = personaService.getActive(user.getId());
        List<Memory> memories = memoryService.getRelevant(user.getId(), snippet);
        String reply = aiClient.chat(new ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", PromptBuilder.dreamReading(persona, memories, userName, snippet)))));
        if (reply == null || reply.isBlank()) {
            reply = "……我记得这个梦的感觉。等天亮了，我们再慢慢说。";
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("id", dreamId);
        data.put("message", reply.trim());
        return Result.success(data);
    }

    /**
     * Badeline 夜话：读指定的一篇梦境日记，按梦的上下文多轮对话。
     * message 为空且无历史 → 她先开口评论这个梦；情绪标记复用 [emotion:xxx] 约定驱动立绘。
     */
    @Override
    public Result dreamNightTalk(String dreamId, String message, String historyJson) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();
        String userName = user.getNickname() != null && !user.getNickname().isBlank()
                ? user.getNickname() : user.getAccount();

        Diary dream = null;
        if (dreamId != null && !dreamId.isBlank()) {
            dream = diaryMapper.selectById(dreamId);
            // 只能读自己的梦
            if (dream != null && !userId.equals(dream.getUserId())) dream = null;
        }
        if (dream == null) {
            dream = diaryMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary>()
                            .eq(Diary::getUserId, userId)
                            .eq(Diary::getType, "dream")
                            .orderByDesc(Diary::getCreateDate)
                            .last("limit 1"));
        }
        if (dream == null || dream.getContent() == null || dream.getContent().isBlank()) {
            return Result.fail(404, "还没有写下的梦。先把梦记下来，她才读得到。");
        }
        String dreamText = dream.getContent();
        if (dreamText.length() > 1800) dreamText = dreamText.substring(0, 1800);

        List<AiMessage> history = new ArrayList<>();
        if (historyJson != null && !historyJson.isBlank()) {
            try {
                List<JSONObject> arr = JSON.parseArray(historyJson, JSONObject.class);
                if (arr != null) {
                    for (JSONObject o : arr) {
                        if (o == null) continue;
                        String c = o.getString("content");
                        if (c == null || c.trim().isEmpty()) continue;
                        history.add(new AiMessage("assistant".equals(o.getString("role")) ? "assistant" : "user", c));
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (history.size() > 10) history = new ArrayList<>(history.subList(history.size() - 10, history.size()));

        List<AiMessage> messages = new ArrayList<>();
        messages.add(new AiMessage("system",
                PromptBuilder.badelineSystem(PromptBuilder.badelineDreamBackground(userName, dreamText))));
        messages.addAll(history);
        String say = message == null ? "" : message.trim();
        if (say.isEmpty()) {
            if (!history.isEmpty()) return Result.fail(400, "消息不能为空");
            // 开场：由 Badeline 先评论这个梦（提示词背景块里已交代开场规则）
            messages.add(new AiMessage("user", "（她刚把梦写完，抬头看见了你。）"));
        } else {
            messages.add(new AiMessage("user", say));
        }

        String reply = aiClient.chat(messages);
        if (reply == null || reply.isBlank()) {
            reply = "……梦里那么能跑，醒了倒没话了？";
        }
        reply = reply.trim();
        String emotion = "";
        java.util.regex.Matcher em = java.util.regex.Pattern
                .compile("^\\[emotion\\s*:\\s*([a-zA-Z]{1,12})\\]\\s*").matcher(reply);
        if (em.find()) {
            emotion = em.group(1).toLowerCase();
            reply = reply.substring(em.end()).trim();
        }
        if (reply.isBlank()) reply = "……";

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply);
        data.put("emotion", emotion);
        data.put("dreamId", dream.getId());
        return Result.success(data);
    }

    /**
     * 由近期日记软推导 Badeline 的关系状态：[情绪轨迹, 近期模式, 阶段, 阶段说明]
     * 对应文档六阶段（追逐/对峙/谷底/并肩/山顶/告别），但让它从内容自然浮现，不硬排日程。
     * 情绪词集合与阈值集中在 BadelineStageRules，调参不改本类。
     */
    private String[] badelineState(List<Diary> recentDesc, int dayCount, int gapDays, int prevGap) {
        String[] out = {"", "", "", ""};
        List<String> emos = new ArrayList<>();
        for (Diary d : recentDesc) {
            if (d.getEmotion() != null && !d.getEmotion().isEmpty()) emos.add(d.getEmotion());
        }
        java.util.Collections.reverse(emos); // 旧→新
        out[0] = emos.isEmpty() ? "（未标注）" : String.join("、", emos);

        String[] rule = badelineStageRules.evaluate(emos, dayCount, gapDays, prevGap);
        out[1] = rule[0];
        out[2] = rule[1];
        out[3] = rule[2];
        return out;
    }

    /** 四心光谱：前端心之水晶数组 → 「红x 蓝x 黄x；名字…」，解析失败返回 null */
    private String badelineHeartsLine(String heartsJson) {
        try {
            if (heartsJson == null || heartsJson.isBlank()) return null;
            List<JSONObject> arr = JSON.parseArray(heartsJson, JSONObject.class);
            if (arr == null || arr.isEmpty()) return null;
            int red = 0, blue = 0, yellow = 0;
            List<String> allNames = new ArrayList<>();
            for (JSONObject o : arr) {
                if (o == null) continue;
                String c = o.getString("color");
                if ("red".equals(c)) red++;
                else if ("yellow".equals(c)) yellow++;
                else blue++;
                String t = o.getString("title");
                if (t != null && !t.isBlank()) allNames.add("「" + t.trim() + "」");
            }
            // 心可无限炼制：比例全量统计，名字只取最近 4 颗，避免背景块无限增长
            List<String> names = allNames.size() > 4
                    ? allNames.subList(allNames.size() - 4, allNames.size()) : allNames;
            StringBuilder sb = new StringBuilder();
            sb.append("红").append(red).append(" 蓝").append(blue).append(" 黄").append(yellow);
            if (!names.isEmpty()) {
                sb.append("；它们的名字").append(String.join("、", names)).append("——这些名字是你的自我意象的一部分");
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public Result featherKeyword() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.orderByDesc(Diary::getUpdateDate);
        wrapper.last("limit 1");
        List<Diary> list = diaryMapper.selectList(wrapper);

        if (list.isEmpty()) {
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("keyword", null);
            return Result.success(data);
        }
        String content = list.get(0).getContent();
        if (content != null && content.length() > 1500) content = content.substring(0, 1500);
        String prompt = "从下面这段日记里提取一个最核心的关键词（2-4个汉字），只返回关键词本身，不要其他内容：\n\n" + content;
        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", prompt))));
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("keyword", reply != null ? reply.trim().replaceAll("[\\s\\n]+", "") : null);
        return Result.success(data);
    }

    /** 情绪统计：各情绪出现次数 + 按月趋势（仅普通日记，排除梦境） */
    @Override
    public Result emotionStats() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();

        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.isNotNull(Diary::getEmotion);
        wrapper.select(Diary::getEmotion, Diary::getCreateDate);
        wrapper.orderByDesc(Diary::getCreateDate);
        List<Diary> diaries = diaryMapper.selectList(wrapper);

        // 各情绪总分布
        java.util.Map<String, Integer> distribution = new java.util.LinkedHashMap<>();
        // 按月趋势：{ "2026-03": { "开心": 3, "平静": 2, ... }, ... }
        java.util.Map<String, java.util.Map<String, Integer>> monthly = new java.util.TreeMap<>();

        java.text.SimpleDateFormat monthFmt = new java.text.SimpleDateFormat("yyyy-MM");
        for (Diary d : diaries) {
            String emo = d.getEmotion();
            if (emo == null || emo.trim().isEmpty()) continue;
            emo = emo.trim();
            distribution.merge(emo, 1, Integer::sum);
            String month = monthFmt.format(d.getCreateDate());
            monthly.computeIfAbsent(month, k -> new java.util.HashMap<>()).merge(emo, 1, Integer::sum);
        }

        // 按时间正序排月（TreeMap 默认升序）
        java.util.List<java.util.Map<String, Object>> timeline = new java.util.ArrayList<>();
        for (java.util.Map.Entry<String, java.util.Map<String, Integer>> e : monthly.entrySet()) {
            java.util.Map<String, Object> item = new java.util.HashMap<>();
            item.put("month", e.getKey());
            item.put("emotions", e.getValue());
            timeline.add(item);
        }

        int total = diaries.size();
        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("total", total);
        result.put("distribution", distribution);
        result.put("timeline", timeline);
        return Result.success(result);
    }
}