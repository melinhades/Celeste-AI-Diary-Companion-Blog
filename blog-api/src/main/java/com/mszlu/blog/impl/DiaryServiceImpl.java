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
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.DiaryParam;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
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
    private String scanEmotion(String draft) {
        String[][] table = {
                {"不安", "担心", "焦虑", "害怕", "紧张", "不安", "忐忑", "恐慌", "迷茫", "彷徨", "不知所措"},
                {"惊讶", "惊讶", "意外", "震惊", "吃惊", "惊喜", "诧异", "没想到", "居然", "竟然"},
                {"怨恨", "怨恨", "愤怒", "生气", "恨", "嫌弃", "不公", "凭什么", "可恶", "恼火"},
                {"不开心", "悲伤", "难过", "痛苦", "忧郁", "沮丧", "绝望", "孤独", "寂寞", "崩溃", "哭"},
                {"可爱", "可爱", "甜", "暖心", "感动", "幸福", "开心", "快乐", "感恩", "满足"},
                {"无语", "无语", "尴尬", "冷场", "呵呵", "算了", "服了", "离谱"}
        };
        String best = "默认";
        int bestCount = 0;
        for (String[] row : table) {
            int count = 0;
            for (int i = 1; i < row.length; i++) {
                if (draft.contains(row[i])) count++;
            }
            if (count > bestCount) { bestCount = count; best = row[0]; }
        }
        return best;
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
}