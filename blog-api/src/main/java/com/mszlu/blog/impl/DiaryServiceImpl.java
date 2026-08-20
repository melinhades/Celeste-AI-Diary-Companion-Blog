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
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.DiaryParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 日记服务实现
 */
@Service
public class DiaryServiceImpl implements DiaryService {

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

    @Override
    public Result save(DiaryParam param) {
        String userId = UserThreadLocal.get().getId();
        Date now = new Date();
        Diary diary = new Diary();
        diary.setUserId(userId);
        diary.setTitle(param.getTitle());
        diary.setContent(param.getContent());
        diary.setCreateDate(now);
        diary.setUpdateDate(now);

        if (param.getId() != null && !param.getId().isEmpty()) {
            // 更新
            diary.setId(param.getId());
            diaryMapper.updateById(diary);
        } else {
            // 新增
            diaryMapper.insert(diary);
        }

        // 保存成功后，异步提取记忆（复用 chat 的方式）
        // 这里我们取日记内容的前200字作为用户内容，AI 回复为空（因为日记没有 AI 回复）
        // 或者我们可以不提取记忆？但需求说：保存日记后异步提取记忆（照搬现有 extractAsync 模式）
        // 我们可以调用 memoryService.extractAsync，但需要用户内容和 AI 回复。
        // 由于日记没有 AI 回复，我们可以只传用户内容和一个空的回复，或者不传 AI 回复。
        // 查看 MemoryServiceImpl.extractAsync 的实现，它需要三个参数：userId, userContent, aiReply。
        // 我们可以把 aiReply 设为空字符串，或者只传用户内容。
        // 但是，记忆提取是从对话中提取，日记不是对话。我们可以考虑不提取记忆，或者只提取日记内容中的事件等。
        // 为了简单，我们先不提取记忆，或者调用时 aiReply 为空。
        // 这里我们调用 extractAsync，用户内容为日记内容，AI 回复为空字符串。
        memoryService.extractAsync(userId, param.getContent(), "");

        return Result.success(diary.getId());
    }

    @Override
    public Result list(int page, int pageSize) {
        String userId = UserThreadLocal.get().getId();
        // TODO: 实现分页列表，这里先返回所有
        // 为简单起见，我们先不实现分页，返回所有日记
        // 实际项目中应使用分页插件或自行实现
        List<Diary> diaries = diaryMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary>()
                        .eq(Diary::getUserId, userId)
                        .orderByDesc(Diary::getUpdateDate)
        );
        return Result.success(diaries);
    }

    @Override
    public Result getById(String diaryId) {
        Diary diary = diaryMapper.selectById(diaryId);
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

        // 查找昨天的日记
        long now = System.currentTimeMillis();
        long yesterdayStart = now - 24 * 60 * 60 * 1000L;
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.ge(Diary::getCreateDate, new Date(yesterdayStart));
        wrapper.le(Diary::getCreateDate, new Date(now));
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 1");
        Diary yesterdayDiary = diaryMapper.selectOne(wrapper);

        String diaryContent = yesterdayDiary != null ? yesterdayDiary.getContent() : "";

        Persona persona = personaService.getActive(userId);
        String prompt = PromptBuilder.dailyPostcard(userName, diaryContent);
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
    public Result bubble() {
        SysUser user = UserThreadLocal.get();
        if (user == null) return Result.fail(403, "未登录");
        String userId = user.getId();
        String userName = user.getNickname() != null ? user.getNickname() : user.getAccount();

        long oneHourAgo = System.currentTimeMillis() - 60 * 60 * 1000L;
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Diary> wrapper =
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
        wrapper.eq(Diary::getUserId, userId);
        wrapper.ge(Diary::getCreateDate, new Date(oneHourAgo));
        wrapper.orderByDesc(Diary::getCreateDate);
        wrapper.last("limit 1");
        Diary recentDiary = diaryMapper.selectOne(wrapper);

        String context = recentDiary != null ? recentDiary.getContent() : "";
        String prompt;
        if (!context.isEmpty()) {
            prompt = "你是Madeline，Celeste的爬山女孩。你温暖、真诚、细腻。\n"
                   + "用户最近写了日记：\n———\n" + context.substring(0, Math.min(200, context.length())) + "\n———\n\n"
                   + "请以Madeline的身份，主动给用户发一条简短的消息（1句话），像朋友关心朋友那样。\n"
                   + "可以提起日记里的事、可以鼓励、可以问候，不要说教。\n"
                   + "直接输出文字，不要JSON，不要引号。";
        } else {
            prompt = "你是Madeline，Celeste的爬山女孩。你温暖、真诚、细腻。\n"
                   + "用户有一阵子没写日记了。请主动发一条简短消息（1句话）关心一下。\n"
                   + "可以融入攀登、山峰、风雪的意象，不要说教。\n"
                   + "直接输出文字，不要JSON，不要引号。";
        }

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

        var messages = new ArrayList<AiMessage>();
        messages.add(new AiMessage("system", PromptBuilder.diaryCompanion(persona, memories, draftSnippet)));

        String reply = aiClient.chat(messages);
        if (reply == null) {
            return Result.fail(500, "Madeline 这会儿不想说话（AI 调用失败），稍后再试");
        }

        String feedback = reply.trim();
        String emotion = scanHerEmotion(feedback);
        String[] validEmotions = {"默认", "不安", "惊讶", "怨恨", "不开心", "可爱", "无语"};

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
    private String scanHerEmotion(String reply) {
        String[][] table = {
                {"可爱", "哈哈", "嘿嘿", "（笑", "太好", "真棒", "开心", "♥"},
                {"惊讶", "诶", "哇，", "啊？", "真的吗", "居然"},
                {"不安", "我有点担心", "担心你", "小心"},
                {"怨恨", "可恶", "气死", "讨厌"},
                {"无语", "服了", "离谱"},
                {"不开心", "唉", "想哭"}
        };
        for (String[] row : table) {
            for (int i = 1; i < row.length; i++) {
                if (reply.contains(row[i])) return row[0];
            }
        }
        return "默认";
    }
}