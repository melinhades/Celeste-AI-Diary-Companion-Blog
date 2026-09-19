package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.ChatService;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ChatParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;

@RestController
@RequestMapping("chat")
public class ChatController {

    @Autowired
    private ChatService chatService;

    @Autowired
    private AiClient aiClient;

    @PostMapping
    public Result chat(@RequestBody ChatParam param) {
        return chatService.chat(param);
    }

    /** 文章生成：裸调 AI，不套 Madeline 人设、不开 JSON 模式、不写入聊天历史 */
    @PostMapping("generate-article")
    public Result generateArticle(@RequestBody ChatParam param) {
        String reply = aiClient.chat(
                Arrays.asList(new AiMessage("user", param.getContent())),
                false);
        if (reply == null) {
            return Result.fail(500, "AI 调用失败，请查看控制台日志");
        }
        java.util.Map<String, Object> data = new java.util.HashMap<>();
        data.put("content", reply);
        return Result.success(data);
    }

    @GetMapping("history")
    public Result history(@RequestParam(defaultValue = "50") Integer limit) {
        return chatService.history(limit);
    }

    @GetMapping("test-ai")
    public Result testAi() {
        String reply = aiClient.chat(
                Arrays.asList(new AiMessage("user", "你好，请用一句话回复我")),
                false);
        if (reply == null) {
            return Result.fail(500, "AI 调用失败，请查看控制台日志");
        }
        return Result.success(reply);
    }
}
