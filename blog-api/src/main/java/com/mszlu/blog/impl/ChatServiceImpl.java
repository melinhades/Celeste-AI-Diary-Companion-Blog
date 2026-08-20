package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ChatMessageMapper;
import com.mszlu.blog.dao.pojo.ChatMessage;
import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.dao.pojo.Persona;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.ChatService;
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
        for (ChatMessage history : recentHistory(userId)) {
            messages.add(new AiMessage(history.getRole(), history.getContent()));
        }
        messages.add(new AiMessage("user", content));

        // 3. 调 AI
        String reply = aiClient.chat(messages);
        if (reply == null) {
            return Result.fail(500, "它这会儿不想说话（AI 调用失败），稍后再试");
        }

        // 4. 落库
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
