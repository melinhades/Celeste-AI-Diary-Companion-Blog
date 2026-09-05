package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ChatMessageMapper;
import com.mszlu.blog.dao.pojo.ChatMessage;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.Persona;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.ChatService;
import com.mszlu.blog.service.DiaryService;
import com.mszlu.blog.service.MemoryService;
import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.service.ai.PromptBuilder;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ChatMessageVo;
import com.mszlu.blog.vo.params.ChatParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
public class ChatServiceImpl implements ChatService {

    /** 短期记忆：带入最近几轮对话 */
    private static final int HISTORY_ROUNDS = 10;

    @Autowired
    private ChatMessageMapper chatMessageMapper;
    @Autowired
    private PersonaService personaService;
    @Autowired
    private MemoryService memoryService;
    @Autowired
    private DiaryService diaryService;
    @Autowired
    private AiClient aiClient;

    @Override
    public Result chat(ChatParam param) {
        SysUser user = UserThreadLocal.get();
        String userId = user.getId();
        String content = param.getContent();

        // 1. 人设 + 记忆检索
        Persona persona = personaService.getActive(userId);
        List<Memory> memories = memoryService.getRelevant(userId, content);

        // 2. 组装消息：system(人设+记忆) + 最近10轮 + 当前消息
        List<AiMessage> messages = new ArrayList<>();
        messages.add(new AiMessage("system", PromptBuilder.chatSystem(persona, memories)));

        // 2.5 RAG 知识库检索：她的日记分片 + 记忆，相关才拼入
        List<com.mszlu.blog.vo.ContextChunk> context = memoryService.searchContext(userId, content, 5);
        if (!context.isEmpty()) {
            messages.add(new AiMessage("system", PromptBuilder.contextBlock(context)));
        }

        // 2.6 最近情绪画像：让她的关心接得上用户昨天/前天的状态
        String emotionNote = diaryService.recentEmotionNote(userId);
        if (emotionNote != null && !emotionNote.isEmpty()) {
            messages.add(new AiMessage("system", PromptBuilder.emotionBlock(emotionNote)));
        }

        for (ChatMessage history : recentHistory(userId)) {
            messages.add(new AiMessage(history.getRole(), history.getContent()));
        }
        messages.add(new AiMessage("user", content));

        // 3. 调 AI（JSON 模式：回复 + 情绪一起给）
        String raw = aiClient.chat(messages, true);
        if (raw == null) {
            return Result.fail(500, "它这会儿不想说话（AI 调用失败），稍后再试");
        }
        String reply = raw.trim();
        String emotion = "默认";
        try {
            com.alibaba.fastjson.JSONObject obj = com.alibaba.fastjson.JSON.parseObject(reply);
            String r = obj.getString("reply");
            if (r != null && !r.isBlank()) reply = r.trim();
            String em = obj.getString("emotion");
            String[] valid = {"默认", "不安", "惊讶", "怨恨", "不开心", "可爱", "无语"};
            if (em != null) {
                for (String v : valid) {
                    if (v.equals(em.trim())) { emotion = v; break; }
                }
            }
        } catch (Exception e) {
            // JSON 解析失败：当作纯文本回复，情绪回落默认
        }

        // 兜底：如果 reply 为空或仍是 JSON 垃圾，重试一次（非 JSON 模式）
        if (reply.isEmpty() || reply.startsWith("{")) {
            String fallback = aiClient.chat(messages, false);
            if (fallback != null && !fallback.isBlank()) {
                reply = fallback.trim();
                emotion = "默认";
            } else {
                reply = "嗯……我在听，你继续说？";
            }
        }

        // 4. 落库（只存纯回复，不存 JSON）
        long now = System.currentTimeMillis();
        saveMessage(userId, "user", content, now);
        saveMessage(userId, "assistant", reply, now + 1);

        // 5. 记忆维护：标记本次用到的记忆 + 异步提取新记忆
        memoryService.markMentioned(memories);
        memoryService.extractAsync(userId, content, reply);

        // 6. 返回
        ChatMessageVo vo = new ChatMessageVo();
        vo.setRole("assistant");
        vo.setContent(reply);
        vo.setEmotion(emotion);
        vo.setPersonaName(persona.getName());
        vo.setCreateDate(now);
        return Result.success(vo);
    }

    @Override
    public Result history(Integer limit) {
        SysUser user = UserThreadLocal.get();
        int size = (limit == null || limit <= 0) ? 50 : limit;
        LambdaQueryWrapper<ChatMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ChatMessage::getUserId, user.getId());
        wrapper.orderByDesc(ChatMessage::getCreateDate);
        wrapper.last("limit " + size);
        List<ChatMessage> messages = chatMessageMapper.selectList(wrapper);
        Collections.reverse(messages);

        String personaName = personaService.getActive(user.getId()).getName();
        List<ChatMessageVo> vos = new ArrayList<>();
        for (ChatMessage m : messages) {
            ChatMessageVo vo = new ChatMessageVo();
            vo.setRole(m.getRole());
            vo.setContent(m.getContent());
            vo.setPersonaName(personaName);
            vo.setCreateDate(m.getCreateDate());
            vos.add(vo);
        }
        return Result.success(vos);
    }

    /** 最近 N 轮，按时间正序返回 */
    private List<ChatMessage> recentHistory(String userId) {
        LambdaQueryWrapper<ChatMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ChatMessage::getUserId, userId);
        wrapper.orderByDesc(ChatMessage::getCreateDate);
        wrapper.last("limit " + HISTORY_ROUNDS * 2);
        List<ChatMessage> list = chatMessageMapper.selectList(wrapper);
        Collections.reverse(list);
        return list;
    }

    private void saveMessage(String userId, String role, String content, long createDate) {
        ChatMessage message = new ChatMessage();
        message.setUserId(userId);
        message.setRole(role);
        message.setContent(content);
        message.setCreateDate(createDate);
        chatMessageMapper.insert(message);
    }
}
