package com.mszlu.blog.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.dao.mapper.DiaryChatLogMapper;
import com.mszlu.blog.dao.mapper.DiaryCompanionMapper;
import com.mszlu.blog.dao.mapper.EmotionStateMapper;
import com.mszlu.blog.dao.mapper.HeartCrystalMapper;
import com.mszlu.blog.dao.pojo.*;
import com.mszlu.blog.service.DiaryService;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.service.ProactiveService;
import com.mszlu.blog.service.SysUserService;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
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
    /** 流式句子的强制切分阈值：没有句末标点时，最多攒这么多字就先检查下发 */
    private static final int MAX_SENTENCE_CHARS = 40;

    @Autowired
    private DiaryMapper diaryMapper;

    @Autowired
    private HeartCrystalMapper heartCrystalMapper;

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

    @Autowired
    private SysUserService sysUserService;

    // ===== v1 扩展组件（Madeline 日记多轮实时反应） =====
    @Autowired private DiaryChatInterruptManager interruptManager;
    @Autowired private DiaryChatMemory chatMemory;
    @Autowired private DiaryChatLogService chatLogService;
    @Autowired private DiaryChatPersonaChecker personaChecker;
    @Autowired private DiaryChatEmotionExtractor emotionExtractor;
    @Autowired private DiaryChatIntentClassifier intentClassifier;
    @Autowired private ProactiveService proactiveService;
    @Autowired private EmotionStateMapper emotionStateMapper;
    @Autowired private DiaryChatLogMapper chatLogMapper;

    // ===== 前处理缓存（深度审计第二步） =====
    // 预跑重启时 draft 变化很小（多写 20 字），情绪/意图/RAG 结果大概率相同。
    // 用 draft 前 60 字做 key，TTL 5 分钟，避免重复跑 AI。
    private static final java.util.concurrent.ConcurrentHashMap<String, CacheEntry<?>> PRE_PROCESS_CACHE = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;
    private static final int CACHE_PREFIX_LEN = 60;

    private static class CacheEntry<T> {
        final T value;
        final long expireAt;
        CacheEntry(T value) { this.value = value; this.expireAt = System.currentTimeMillis() + CACHE_TTL_MS; }
        boolean isExpired() { return System.currentTimeMillis() > expireAt; }
    }

    @SuppressWarnings("unchecked")
    private <T> T getCached(String key) {
        CacheEntry<?> e = PRE_PROCESS_CACHE.get(key);
        if (e == null) return null;
        if (e.isExpired()) { PRE_PROCESS_CACHE.remove(key); return null; }
        return (T) e.value;
    }
    private <T> void putCached(String key, T value) {
        PRE_PROCESS_CACHE.put(key, new CacheEntry<>(value));
    }
    private String cacheKey(String prefix, String userId, String draft) {
        String head = draft.length() > CACHE_PREFIX_LEN ? draft.substring(0, CACHE_PREFIX_LEN) : draft;
        return prefix + ":" + userId + ":" + head.hashCode();
    }

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
            try {
                sysUserService.grantDiaryBerry(userId);
            } catch (Exception e) {
                log.warn("日记保存成功但草莓奖励失败 userId={} diaryId={}", userId, diary.getId(), e);
            }
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
                java.util.List<AiMessage> msgs = new java.util.ArrayList<>();
                msgs.add(new AiMessage("user", PromptBuilder.emotionAnalyze(snippet)));
                String reply = aiClient.chat(msgs, true, aiClient.getModel(), userId);
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

        // 日期口径：服务器 JVM 默认时区下的自然日（与日记 create_date 落库所用时区一致）
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        String day = today.toString();

        // 服务端按天幂等：当天已有记录就直接复用，不再调 LLM
        HeartCrystal saved = findHeartCrystal(userId, day);
        if (saved != null) {
            return heartResult(saved);
        }

        // 颜色：当天全部普通日记按最后修改时间倒序，取第一篇有情绪标注的；全都没有才落蓝色
        List<Diary> todayDiaries = findTodayDiaries(userId, today, zone);
        String emotion = "";
        for (Diary d : todayDiaries) {
            if (d.getEmotion() != null && !d.getEmotion().trim().isEmpty()) {
                emotion = d.getEmotion().trim();
                break;
            }
        }
        String color = colorOfEmotion(emotion);

        // 首次请求：AI 生成名称与描述（两行文本：第一行名称，第二行描述）
        String prompt = PromptBuilder.heartTitle(color, emotion);
        String reply = null;
        try {
            reply = aiClient.chat(
                    new java.util.ArrayList<>(java.util.Arrays.asList(
                            new AiMessage("user", prompt))));
        } catch (Exception e) {
            log.warn("心之水晶 AI 命名失败 userId={} date={}", userId, day, e);
        }

        String title = fallbackTitle(color);
        String desc = fallbackDesc(color);
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

        HeartCrystal row = new HeartCrystal();
        row.setUserId(userId);
        row.setCrystalDate(day);
        row.setColor(color);
        row.setTitle(title);
        row.setDescription(desc);
        row.setCreateDate(System.currentTimeMillis());
        try {
            heartCrystalMapper.insert(row);
        } catch (DataIntegrityViolationException e) {
            // 并发首访：另一个请求先落库，唯一键挡住本次插入 → 以已落库的那颗为准
            HeartCrystal concurrent = findHeartCrystal(userId, day);
            if (concurrent != null) return heartResult(concurrent);
            log.warn("心之水晶落库失败 userId={} date={}", userId, day, e);
        }
        return heartResult(row);
    }

    /** 按用户 + 自然日查当天那颗心 */
    private HeartCrystal findHeartCrystal(String userId, String day) {
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<HeartCrystal> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(HeartCrystal::getUserId, userId);
        wrapper.eq(HeartCrystal::getCrystalDate, day);
        wrapper.last("limit 1");
        return heartCrystalMapper.selectOne(wrapper);
    }

    /**
     * 当天全部普通日记，按「最后修改时间」倒序：
     * COALESCE(update_date, create_date) DESC。
     * 当前保存逻辑在新增和编辑时都会同时刷新这两个字段；历史行若 update_date 为空则回落到 create_date。
     * 调用方从前往后取第一篇有情绪标注的日记。
     */
    private List<Diary> findTodayDiaries(String userId, LocalDate day, ZoneId zone) {
        Date start = Date.from(day.atStartOfDay(zone).toInstant());
        Date end = Date.from(day.plusDays(1).atStartOfDay(zone).toInstant());
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.ge(Diary::getCreateDate, start);
        wrapper.lt(Diary::getCreateDate, end);
        wrapper.last("ORDER BY COALESCE(update_date, create_date) DESC");
        return diaryMapper.selectList(wrapper);
    }

    /**
     * 情绪 → 心色；映射沿用旧规则。
     * 真实水晶心目前只有蓝/红/黄三档（灰色贴图是假心 FakeHeart，不是可选颜色），
     * 因此空值/未知情绪统一蓝色兜底，不新增灰色。
     */
    private String colorOfEmotion(String emotion) {
        if (emotion == null) return "blue";
        switch (emotion) {
            case "不安": case "愤怒": return "red";
            case "平静": case "疲惫": case "悲伤": case "孤独": return "blue";
            case "开心": case "期待": case "满足": case "惊讶": return "yellow";
            default: return "blue";
        }
    }

    private String fallbackTitle(String color) {
        return "red".equals(color) ? "不肯熄的心"
                : "yellow".equals(color) ? "甜得过分的心" : "不知所谓的机器";
    }

    private String fallbackDesc(String color) {
        return "red".equals(color) ? "那些没说出口的火，烧着烧着就成了灯。"
                : "yellow".equals(color) ? "草莓攒出来的小太阳，专照阴天。" : "山底的冰凉水声，替你把心事泡得很轻。";
    }

    /** 统一出口：落库记录 → 接口字段 */
    private Result heartResult(HeartCrystal heart) {
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("color", heart.getColor());
        data.put("title", heart.getTitle());
        data.put("desc", heart.getDescription());
        return Result.success(data);
    }

    @Override
    public Result bubble() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();
        String userName = user.getNickname() != null ? user.getNickname() : user.getAccount();

        long oneDayAgo = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.eq(Diary::getType, "day");
        wrapper.ge(Diary::getCreateDate, new Date(oneDayAgo));
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 1");
        Diary recentDiary = diaryMapper.selectOne(wrapper);

        String context = recentDiary != null && recentDiary.getContent() != null ? recentDiary.getContent() : "";
        String emotionNote = recentDiary != null
                ? PromptBuilder.emotionNote(recentDiary)
                : recentEmotionNote(userId);
        // prompt 统一收敛在 PromptBuilder，调人设只改一个文件
        String snippet = context.isEmpty() ? "" : context.substring(0, Math.min(300, context.length()));
        String prompt = PromptBuilder.bubblePrompt(emotionNote, snippet);

        String reply = aiClient.chat(new java.util.ArrayList<>(java.util.Arrays.asList(
                new AiMessage("user", prompt))));
        if (reply == null || reply.trim().isEmpty()) {
            return Result.success(null);
        }

        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("message", reply.trim());
        data.put("emotion", "默认");

        // P3.1 新增：通过 SSE 推送给订阅用户
        try {
            proactiveService.pushToUser(userId, reply.trim(), "默认");
        } catch (Exception e) {
            log.warn("主动消息推送失败 userId={}", userId, e);
        }
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
        messages.add(new AiMessage("system", PromptBuilder.diaryCompanion(persona, memories, draftSnippet, emotionNote, false, null)));

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
    public void companionStream(CompanionParam param, jakarta.servlet.http.HttpServletResponse response) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            try { response.setStatus(400); response.setContentType("application/json;charset=UTF-8");
                  response.getWriter().write("{\"success\":false,\"code\":400,\"msg\":\"未登录\"}"); } catch (Exception ignored) {}
            return;
        }
        String userId = user.getId();
        String draftSnippet = param.getDraft() == null ? "" : param.getDraft().trim();
        String rawSid = param.getSessionId();
        String sessionId = (rawSid == null || rawSid.isBlank())
                ? UUID.randomUUID().toString().replace("-", "").substring(0, 16)
                : rawSid;

        // —— 中断入口两种语义：
        // 1) 纯打断（interrupt=true 但没带 draft）→ 标记后直接 return，不启动新生成
        // 2) 打断+重开（interrupt=true 同时带了新 draft）→ 标记旧请求中断后继续走新请求
        //    「边写边预跑」机制靠这条：用户中途继续写 → 前端发 interrupt + 新 draft → 后端让旧线程退出、新线程 acquire
        boolean interruptRequested = Boolean.TRUE.equals(param.getInterrupt()) || "interrupt".equals(param.getTriggerType());
        if (interruptRequested) {
            interruptManager.markInterrupted(sessionId);
            if (draftSnippet.isEmpty()) {
                log.info("日记伴侣会话中断标记（纯打断） sessionId={}", sessionId);
                return;
            }
            log.info("日记伴侣会话中断标记（打断+重开） sessionId={}", sessionId);
        }

        if (draftSnippet.isEmpty()) {
            try { response.setStatus(400); response.setContentType("application/json;charset=UTF-8");
                  response.getWriter().write("{\"success\":false,\"code\":400,\"msg\":\"草稿为空\"}"); } catch (Exception ignored) {}
            return;
        }

        // 决策锁：同一会话只允许一轮回复在跑。
        // 如果 interrupt 已标记（说明有旧请求在跑但被打断），短暂等待旧线程释放锁后再 acquire。
        // 旧线程在 delta 回调或 pre-AI 中断检查点会抛异常 → finally releaseReply。
        boolean acquired = interruptManager.tryAcquireReply(sessionId);
        if (!acquired && interruptRequested) {
            try { Thread.sleep(150); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            acquired = interruptManager.tryAcquireReply(sessionId);
        }
        if (!acquired) {
            try {
                response.setContentType("text/event-stream;charset=UTF-8");
                response.setHeader("Cache-Control", "no-cache");
                response.setHeader("X-Accel-Buffering", "no");
                sseEvent(response, "busy", "");
                sseEvent(response, "done", "{\"busy\":true,\"sessionId\":\"" + sessionId + "\"}");
            } catch (Exception ignored) {}
            return;
        }
        try {
            doCompanionReply(param, response, userId, draftSnippet, sessionId);
        } finally {
            interruptManager.releaseReply(sessionId);
        }
    }

    /**
     * companionStream 的主体：拿到「决策锁」后执行。
     * 整轮只使用入口处冻结的 draftSnippet，不再回头看用户后续改动；
     * 任何返回路径（静默/中断/503/空文本）都由外层 finally 释放锁。
     */
    private void doCompanionReply(CompanionParam param, jakarta.servlet.http.HttpServletResponse response,
                                  String userId, String draftSnippet, String sessionId) {

        // 判断异常链是否是「客户端中断」——CompletableFuture 会把 supplyAsync 里的异常包成 CompletionException
        java.util.function.Function<Throwable, Boolean> isInterrupt = ex -> {
            Throwable cur = ex;
            while (cur != null) {
                String msg = cur.getMessage();
                if (msg != null && msg.contains("interrupted")) return true;
                cur = cur.getCause();
            }
            return false;
        };

        // === v1 扩展：会话记忆 ===
        long t0 = System.currentTimeMillis();
        DiaryChatMemory.SessionBuffer buf = chatMemory.getOrCreate(userId, sessionId);
        int turnId = buf.turnCount + 1;

        // P3.4 续接功能：从上一轮中断点恢复
        String resumeContext = null;
        if (Boolean.TRUE.equals(param.getResume()) && sessionId != null) {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<DiaryChatLog> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
            wrapper.eq(DiaryChatLog::getUserId, userId);
            wrapper.eq(DiaryChatLog::getSessionId, sessionId);
            wrapper.isNotNull(DiaryChatLog::getFilteredResponse);
            wrapper.orderByDesc(DiaryChatLog::getTurnId);
            wrapper.last("limit 1");
            DiaryChatLog lastLog = chatLogMapper.selectOne(wrapper);
            if (lastLog != null && lastLog.getFilteredResponse() != null) {
                String lastContent = lastLog.getFilteredResponse();
                // 取最后 100 字作为断点上下文
                int start = Math.max(0, lastContent.length() - 100);
                resumeContext = lastContent.substring(start);
                log.info("续接上一轮对话，sessionId={}, turnId={}, 断点: {}", sessionId, lastLog.getTurnId(), resumeContext);
            }
        }

        // —— 草稿太短（< 4 字）：不跑任何 AI，直接 silent ——
        if (draftSnippet.length() < 4) {
            response.setContentType("text/event-stream;charset=UTF-8");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("X-Accel-Buffering", "no");
            try {
                sseEvent(response, "silent", "");
                sseEvent(response, "done", "{\"silent\":true,\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId + "}");
            } catch (Exception ignored) {}
            return;
        }

        // === 深度审计第一步：前处理并行化 + 第二步：缓存 ===
        // 情绪/意图/RAG 三者独立，并行跑；预跑重启时 draft 变化小，优先命中缓存跳过 AI。
        // 本轮真正要读的只有「还没回应过的新内容」；已回应部分留在会话记忆里，不重复读
        final String reactSnippet = (param.getDelta() != null && !param.getDelta().isBlank())
                ? param.getDelta().trim() : draftSnippet;
        final String finalSummary = buf.summary;
        final String finalTypingSignal = param.getTypingSignal();
        final String emoKey = cacheKey("emo", userId, reactSnippet);
        final String intentKey = cacheKey("int", userId, reactSnippet);
        final String ragKey = cacheKey("rag", userId, reactSnippet);

        DiaryChatEmotionExtractor.EmotionResult cachedEmo = getCached(emoKey);
        CompletableFuture<DiaryChatEmotionExtractor.EmotionResult> emotionFuture = cachedEmo != null
                ? CompletableFuture.completedFuture(cachedEmo)
                : CompletableFuture.supplyAsync(() -> {
                    if (interruptManager.isInterrupted(sessionId)) throw new RuntimeException("interrupted");
                    DiaryChatEmotionExtractor.EmotionResult r = emotionExtractor.extract(reactSnippet, finalTypingSignal, userId);
                    putCached(emoKey, r);
                    return r;
                }, aiExecutor).exceptionally(ex -> {
                    if (isInterrupt.apply(ex)) throw new RuntimeException("interrupted");
                    log.warn("情绪提取失败，降级为默认情绪", ex);
                    DiaryChatEmotionExtractor.EmotionResult fb = new DiaryChatEmotionExtractor.EmotionResult(
                            "默认", BigDecimal.valueOf(0.5), BigDecimal.ZERO, BigDecimal.ZERO, null, "low");
                    fb.setFaceEmotion("默认");
                    return fb;
                });

        String cachedIntent = getCached(intentKey);
        CompletableFuture<String> intentFuture = cachedIntent != null
                ? CompletableFuture.completedFuture(cachedIntent)
                : CompletableFuture.supplyAsync(() -> {
                    if (interruptManager.isInterrupted(sessionId)) throw new RuntimeException("interrupted");
                    String r = intentClassifier.classify(userId, reactSnippet, finalSummary);
                    putCached(intentKey, r);
                    return r;
                }, aiExecutor).exceptionally(ex -> {
                    if (isInterrupt.apply(ex)) throw new RuntimeException("interrupted");
                    log.warn("意图分类失败，降级为未知", ex);
                    return "未知";
                });

        List<Memory> cachedRag = getCached(ragKey);
        CompletableFuture<List<Memory>> memoryFuture = cachedRag != null
                ? CompletableFuture.completedFuture(cachedRag)
                : CompletableFuture.supplyAsync(() -> {
                    if (interruptManager.isInterrupted(sessionId)) throw new RuntimeException("interrupted");
                    List<Memory> r = memoryService.getRelevant(userId, reactSnippet);
                    putCached(ragKey, r);
                    return r;
                }, aiExecutor).exceptionally(ex -> {
                    if (isInterrupt.apply(ex)) throw new RuntimeException("interrupted");
                    log.warn("RAG 检索失败，降级为空", ex);
                    return new ArrayList<>();
                });

        // 等三个前处理全部完成
        CompletableFuture.allOf(emotionFuture, intentFuture, memoryFuture).join();
        DiaryChatEmotionExtractor.EmotionResult emotion = emotionFuture.join();
        String intent = intentFuture.join();
        List<Memory> memories = memoryFuture.join();

        // 被打断：三个 future 里任意一个检测到中断后抛异常，join 会把异常传上来
        // （exceptionally 只兜底业务异常，不兜 RuntimeException("interrupted")）
        // —— 开口决策：文字内容（LLM 判断）为主，停顿/打字轨迹只做加权 ——
        // readiness ≥ 0.6：LLM 判定这段有具体可接的东西 → 必开口，不管用户是否还在打字；
        // 否则按 readiness + 停顿权重 + 轨迹权重 掷概率，决定这一轮说不说。
        double readiness = emotion.getSpeakReadiness();
        double pauseWeight = 0.0;
        try {
            if (param.getTypingSignal() != null && !param.getTypingSignal().isBlank()) {
                double pauseSec = JSON.parseObject(param.getTypingSignal()).getDoubleValue("pause");
                pauseWeight = Math.min(0.35, Math.max(0, pauseSec) / 12.0 * 0.35);
            }
        } catch (Exception ignore) { /* 轨迹缺失不影响开口判断 */ }
        double trajWeight = Math.min(0.35, emotion.getTrajectoryScore().doubleValue() * 0.35);
        boolean mustSpeak = readiness >= 0.6;
        double speakProb = Math.min(1.0, readiness + pauseWeight + trajWeight);
        if (!mustSpeak && java.util.concurrent.ThreadLocalRandom.current().nextDouble() >= speakProb) {
            response.setContentType("text/event-stream;charset=UTF-8");
            response.setHeader("Cache-Control", "no-cache");
            response.setHeader("X-Accel-Buffering", "no");
            try {
                sseEvent(response, "silent", "");
                sseEvent(response, "done", "{\"silent\":true,\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId + "}");
            } catch (Exception ignored) {}
            return;
        }

        // —— v0 原有逻辑：人设 + 情绪画像 ——
        Persona persona = personaService.getActive(userId);
        String emotionNote = recentEmotionNote(userId);

        // 轻量前置判定（本地正则，不调模型）：
        // crisisRisk = 危机/极私密文本，本轮不进入模型生成，直接安全回应（S1）
        // strictCheck = 需要走完整人格检查的风险文本（危机 / 攻击性 / 拒绝交流）
        boolean crisisRisk = DiaryChatPersonaChecker.isCrisisDraft(reactSnippet);
        boolean strictCheck = crisisRisk || DiaryChatPersonaChecker.isRiskyDraft(reactSnippet);

        // === v1 扩展：组装 system prompt（记忆 + 情绪 + 意图 + 羽毛/圆桌联动） ===
        StringBuilder systemPrompt = new StringBuilder();
        systemPrompt.append(PromptBuilder.diaryCompanion(persona, memories, reactSnippet, emotionNote, true, resumeContext));

        // 情绪意图注入 prompt
        systemPrompt.append("\n\n【本轮上下文（供你参考，直接响应）】\n")
                .append("- 用户情绪：").append(emotion.getEmotionType())
                .append("，强度 ").append(String.format("%.2f", emotion.getScore().doubleValue())).append("\n")
                .append("- 你此刻的表情倾向：").append(emotion.getFaceEmotion())
                .append("（读完这篇日记后的自然反应，用 [m:表情] 标记落在句首；觉得不对可以改成别的）\n")
                .append("- 用户意图：").append(intent).append("\n")
                .append("- 反应策略参考：")
                .append(intentStrategy(intent)).append("\n");
        // 文字侧 LLM 已判定「有具体可接的东西」：这一轮必须开口，禁止沉默
        if (mustSpeak) {
            systemPrompt.append("\n【本轮硬性要求】这段内容里有具体可接的人/事/物或情绪，你必须开口回应，禁止输出 [沉默]。\n");
        }
        if (crisisRisk) {
            systemPrompt.append("\n【本轮硬性要求】用户文本涉及自伤/极端私密内容，本轮只回复「嗯，我在听～」，不解释、不建议、不追问。\n");
        }

        // 羽毛：不再硬注入提示词（显得死板），改由知识库 source=lore 在需要时自然检索命中；此处只保留标记用于日志
        boolean featherTriggered = Boolean.TRUE.equals(param.getFeatherTriggered());

        // === v1 扩展：用记忆层的 buildMessages 组装完整消息列表 ===
        List<AiMessage> messages = chatMemory.buildMessages(
                buf,
                new AiMessage("system", systemPrompt.toString()),
                new AiMessage("user", reactSnippet)
        );

        // —— SSE 协议层（保留 v0 完整逻辑） ——
        response.setContentType("text/event-stream;charset=UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");

        StringBuilder full = new StringBuilder();          // 模型原始全文（仅日志用）
        StringBuilder rawBuf = new StringBuilder();        // 尚未处理的流片段
        StringBuilder emitted = new StringBuilder();       // 已放行文本（= 落库 = 下一轮上下文 = done.len）
        boolean[] headDone = {false};                      // 头部情绪/沉默标记是否已解析完
        boolean[] silent = {false};
        boolean[] emotionEmitted = {false};
        boolean[] aborted = {false};
        String[] emotionOut = {"默认"};
        String[] filterReason = {null};
        int[] firstDeltaMs = {0};

        if (crisisRisk) {
            // 危机文本不进入模型生成：直接给定安全回应（S1），避免模型自由发挥
            try {
                emitStreamDelta(response, "嗯，我在听～", emotionEmitted, emotionOut, firstDeltaMs, t0);
            } catch (java.io.IOException io) {
                log.info("日记伴侣 SSE 输出中断 sessionId={}", sessionId);
                return;
            }
            emitted.append("嗯，我在听～");
        } else {
            try {
                aiClient.streamChat(messages, delta -> {
                    // 中断检查：每帧都查，避免客户端已放弃仍在生成
                    if (interruptManager.isInterrupted(sessionId)) {
                        throw new RuntimeException("interrupted by client");
                    }
                    full.append(delta);
                    rawBuf.append(delta);

                    try {
                        // 1) 头部标记：未确定前不输出，避免 [emotion:x] / [沉默] 被当成正文
                        if (!headDone[0]) {
                            String s = rawBuf.toString();
                            if (s.isEmpty()) return;
                            if (s.startsWith("[沉默]")) {
                                headDone[0] = true;
                                silent[0] = true;
                                rawBuf.setLength(0);
                            } else if (s.startsWith("[")) {
                                int close = s.indexOf(']');
                                if (close < 0) {
                                    // 前缀可能还没吐完；留 16 字窗口，超时按普通文本处理，避免卡住
                                    if (s.length() <= 16) return;
                                } else {
                                    java.util.regex.Matcher em = STREAM_EMOTION_PREFIX.matcher(s);
                                    if (em.lookingAt()) {
                                        emotionOut[0] = normalizeHerEmotion(em.group(1));
                                        rawBuf.setLength(0);
                                        rawBuf.append(s.substring(em.end()));
                                    }
                                }
                                headDone[0] = true;
                            } else {
                                headDone[0] = true;
                            }
                        }
                        if (silent[0]) return;

                        // 2) 句级闸门：凑够一句先检查，通过立即下发（首字延迟≈第一句生成耗时）
                        while (rawBuf.length() > 0) {
                            int cut = nextSentenceCut(rawBuf);
                            if (cut <= 0) break;
                            String sentence = rawBuf.substring(0, cut);
                            rawBuf.delete(0, cut);
                            String out = gateSentence(sentence, systemPrompt.toString(), reactSnippet,
                                    intent, sessionId, strictCheck, filterReason);
                            if (out.isEmpty()) continue;
                            emitStreamDelta(response, out, emotionEmitted, emotionOut, firstDeltaMs, t0);
                            emitted.append(out);
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

            boolean interrupted = interruptManager.isInterrupted(sessionId);
            interruptManager.consumeAndClear(sessionId);
            if (interrupted || aborted[0]) return;

            // 流在情绪标记中途结束：宁可丢弃残片，也不要把 "[emotion:不" 当正文发给用户
            if (!headDone[0] && rawBuf.length() > 0
                    && rawBuf.charAt(0) == '[' && rawBuf.indexOf("]") < 0) {
                rawBuf.setLength(0);
            }

            // 3) 收尾：最后一段没有句末标点也要过同一道闸门
            if (!silent[0] && rawBuf.length() > 0) {
                String tail = rawBuf.toString();
                rawBuf.setLength(0);
                String out = gateSentence(tail, systemPrompt.toString(), reactSnippet,
                        intent, sessionId, strictCheck, filterReason);
                if (!out.isEmpty()) {
                    try {
                        emitStreamDelta(response, out, emotionEmitted, emotionOut, firstDeltaMs, t0);
                    } catch (java.io.IOException io) {
                        log.info("日记伴侣 SSE 输出中断 sessionId={}", sessionId);
                        return;
                    }
                    emitted.append(out);
                }
            }

            if (silent[0] || emitted.length() == 0) {
                if (!silent[0]) {
                    response.reset();
                    response.setStatus(503);
                    response.setContentType("application/json;charset=UTF-8");
                    try { response.getWriter().write("{\"success\":false,\"code\":503,\"msg\":\"AI 暂时开小差，请稍后再试\"}"); } catch (Exception ignored) {}
                    return;
                }
                try {
                    if (!emotionEmitted[0]) sseEvent(response, "emotion", emotionOut[0]);
                    sseEvent(response, "silent", "");
                    sseEvent(response, "done", "{\"silent\":true,\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId + "}");
                } catch (java.io.IOException ignored) {}
                return;
            }
        }

        // 已发出的文本就是最终文本：用户所见 == 落库 == 下一轮上下文 == done.len
        String finalText = emitted.toString();
        if (finalText.isBlank()) finalText = "嗯，我在听～";
        int firstDeltaMsVal = firstDeltaMs[0];

        // —— v0：落库旧版 DiaryCompanion + 记忆维护 ——
        DiaryCompanion companion = new DiaryCompanion();
        companion.setUserId(userId);
        companion.setSuggestion(finalText);
        companion.setCreateDate(System.currentTimeMillis());
        diaryCompanionMapper.insert(companion);
        memoryService.markMentioned(memories);
        memoryService.extractAsync(userId, reactSnippet, finalText);

        // === v1 扩展：会话记忆 appendTurn（只记本轮新内容，旧段落不再重复进入上下文） ===
        chatMemory.appendTurn(buf, reactSnippet, finalText);

        // === v1 扩展：全链路日志 ===
        DiaryChatLog logEntity = new DiaryChatLog();
        logEntity.setUserId(userId);
        logEntity.setSessionId(sessionId);
        logEntity.setTurnId(turnId);
        logEntity.setTriggerType(param.getTriggerType() == null ? "save" : param.getTriggerType());
        logEntity.setTriggerDetail(String.format("字数=%d,情绪得分=%.2f,意图=%s,开口意愿=%.2f,停顿权重=%.2f,轨迹权重=%.2f,必说=%s",
                draftSnippet.length(), emotion.getScore(), intent, readiness, pauseWeight, trajWeight, mustSpeak));
        logEntity.setUserDraft(draftSnippet.length() > 2000 ? draftSnippet.substring(0, 2000) + "…" : draftSnippet);
        logEntity.setTypingSignal(param.getTypingSignal());
        logEntity.setSystemPrompt(systemPrompt.length() > 4000 ? systemPrompt.toString().substring(0, 4000) + "…" : systemPrompt.toString());
        logEntity.setModelRaw(full.length() > 2000 ? full.toString().substring(0, 2000) + "…" : full.toString());
        logEntity.setFilteredResponse(finalText);
        logEntity.setFilterReason(filterReason[0]);
        logEntity.setEmotionScore(emotion.getScore());
        logEntity.setEmotionType(emotion.getEmotionType());
        logEntity.setEmotionScoreDetail(emotion.getEmotionScoreDetail());  // v2 新增：完整 JSON 落库
        logEntity.setIntentType(intent);
        logEntity.setFeatherTriggered(featherTriggered);
        logEntity.setFirstDeltaMs(firstDeltaMsVal);
        logEntity.setTotalMs((int)(System.currentTimeMillis() - t0));
        chatLogService.write(logEntity);

        // —— 收尾事件（sessionId/turnId 回传给前端，后续请求带回来） ——
        try {
            sseEvent(response, "done",
                    "{\"emotion\":\"" + emotionOut[0] + "\",\"len\":" + finalText.length() +
                    ",\"sessionId\":\"" + sessionId + "\",\"turnId\":" + turnId +
                    ",\"firstDeltaMs\":" + firstDeltaMsVal +
                    ",\"totalMs\":" + (System.currentTimeMillis() - t0) + "}");
        } catch (java.io.IOException ignored) {}
    }

    /**
     * 计算下一句的切分点：句末标点/换行为界；没有标点时攒到阈值强制切。
     * 返回 0 表示还不够一句，继续等下一帧。
     */
    private int nextSentenceCut(StringBuilder buf) {
        for (int i = 0; i < buf.length(); i++) {
            char c = buf.charAt(i);
            if (c == '。' || c == '！' || c == '？' || c == '!' || c == '?' || c == '…' || c == '\n') {
                return i + 1;
            }
        }
        if (buf.length() < MAX_SENTENCE_CHARS) return 0;
        int cut = MAX_SENTENCE_CHARS;
        // 不要切在未闭合的 [m:表情] 标记中间
        int open = buf.lastIndexOf("[");
        if (open > 0 && open < cut && buf.indexOf("]", open) < 0) cut = open;
        return cut;
    }

    /**
     * 句级闸门：正常句子走本地正则即时放行；命中风险特征（或用户本轮本身是高危文本）才调一次模型复核。
     * 复核不通过时用 suggestion 替换（没有 suggestion 则用安全兜底句），保证发出去的句子都是最终文本。
     */
    private String gateSentence(String sentence, String systemPrompt, String reactSnippet,
                                String intent, String sessionId, boolean strictCheck, String[] filterReason) {
        String s = INLINE_MOOD_MARKER.matcher(sentence).replaceAll("").trim();
        if (s.isEmpty()) return "";
        if (!strictCheck && !DiaryChatPersonaChecker.localRedlineHit(s)) return s;

        DiaryChatPersonaChecker.CheckResult check =
                personaChecker.checkOnce(s, systemPrompt, reactSnippet, intent);
        if (check.pass) return check.finalResponse;

        filterReason[0] = check.failReason;
        String suggestion = check.suggestion == null ? ""
                : INLINE_MOOD_MARKER.matcher(check.suggestion).replaceAll("").trim();
        log.warn("流式句子未过人格检查 sessionId={}, 原因={}", sessionId, check.failReason);
        return suggestion.isEmpty() ? "嗯，我在听～" : suggestion;
    }

    /** 逐句下发：首句前先发 emotion，并记录首字延迟 */
    private void emitStreamDelta(jakarta.servlet.http.HttpServletResponse response, String text,
                                 boolean[] emotionEmitted, String[] emotionOut, int[] firstDeltaMs, long t0)
            throws java.io.IOException {
        if (!emotionEmitted[0]) {
            sseEvent(response, "emotion", emotionOut[0]);
            emotionEmitted[0] = true;
        }
        sseEvent(response, "delta", text);
        if (firstDeltaMs[0] == 0) firstDeltaMs[0] = (int) (System.currentTimeMillis() - t0);
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
    private void sseEvent(jakarta.servlet.http.HttpServletResponse response, String event, String data)
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
        String prompt;
        if ("week".equals(param.getSnapType())) {
            // 周度快照：只喂情绪占比、原话片段、趋势，不喂日记全文，避免写成总结
            prompt = PromptBuilder.weeklySnapReflect(
                    param.getEmotion(), param.getKeySentences(), param.getTrend());
        } else {
            String snippet = content.substring(0, Math.min(1200, content.length()));
            String emotionCtx = (param.getEmotion() == null || param.getEmotion().isEmpty())
                    ? "" : "【这段时间已统计好的情绪数据】\n" + param.getEmotion() + "\n\n";
            prompt = "你是 Madeline，Celeste 的爬山女孩。你温暖、真诚、细腻。\n"
                    + emotionCtx
                    + "这是用户这段时间写下的日记合集：\n———\n" + snippet + "\n———\n\n"
                    + "请以 Madeline 的身份，回望这段日子，写一段简短温柔的感言（2-3 句）：先说说这些日记里最让你留意的东西，再给一句暖心的话。\n"
                    + "不要说教，不要罗列，像写在明信片背面的几行字。\n"
                    + "直接输出文字，不要 JSON，不要引号。";
        }
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

    // ===== P3.3 情绪持久化 =====
    
    @Override
    public Result updateEmotion(String emotion, Integer intensity, String triggerDiaryId) {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EmotionState> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(EmotionState::getUserId, user.getId());
        EmotionState existing = emotionStateMapper.selectOne(wrapper);
        
        if (existing == null) {
            EmotionState state = new EmotionState();
            state.setUserId(user.getId());
            state.setEmotion(emotion != null ? emotion : "默认");
            state.setIntensity(intensity != null ? intensity : 5);
            state.setTriggerDiaryId(triggerDiaryId);
            state.setUpdateTime(System.currentTimeMillis());
            emotionStateMapper.insert(state);
        } else {
            EmotionState update = new EmotionState();
            update.setEmotion(emotion != null ? emotion : existing.getEmotion());
            update.setIntensity(intensity != null ? intensity : existing.getIntensity());
            update.setTriggerDiaryId(triggerDiaryId);
            update.setUpdateTime(System.currentTimeMillis());
            com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<EmotionState> updateWrapper =
                    new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<>();
            updateWrapper.eq(EmotionState::getUserId, user.getId());
            emotionStateMapper.update(update, updateWrapper);
        }
        
        log.info("用户 {} 情绪状态已更新: {}", user.getId(), emotion);
        return Result.success(null);
    }
    
    @Override
    public Result getCurrentEmotion() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EmotionState> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(EmotionState::getUserId, user.getId());
        EmotionState state = emotionStateMapper.selectOne(wrapper);
        
        if (state == null) {
            java.util.Map<String, Object> data = new java.util.HashMap<>();
            data.put("emotion", "默认");
            data.put("intensity", 5);
            return Result.success(data);
        }
        
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("emotion", state.getEmotion());
        data.put("intensity", state.getIntensity());
        data.put("triggerDiaryId", state.getTriggerDiaryId());
        data.put("updateTime", state.getUpdateTime());
        return Result.success(data);
    }
}
