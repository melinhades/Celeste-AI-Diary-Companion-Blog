package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.ai.madeline.MadelineAgentEngine;
import com.mszlu.blog.vo.params.AgentParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("agent")
public class AgentController {

    @Autowired
    private MadelineAgentEngine madelineAgentEngine;

    /**
     * Madeline agent 模式：工具循环（一期：polishText 润色）。
     * SSE（text/event-stream）事件帧：step（步骤播报）/ emotion / delta（正文）/ result（对照卡片）/ done / error。
     * 鉴权与 diary/companion 一致（UserThreadLocal，由拦截器放行）。
     */
    @PostMapping(value = "madeline/stream")
    public void madelineStream(@RequestBody AgentParam param,
                               jakarta.servlet.http.HttpServletResponse response) {
        madelineAgentEngine.run(param.getMessage(), response);
    }
}
