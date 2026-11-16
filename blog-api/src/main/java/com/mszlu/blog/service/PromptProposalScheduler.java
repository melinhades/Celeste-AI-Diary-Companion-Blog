package com.mszlu.blog.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 可选的定时归因：默认不创建 Bean，避免未经确认就周期性消耗 AI Key。
 * <p>
 * 需要开启时在配置里加一行：ai.proposal.cron=0 0 3 ? * MON
 * 关闭时删掉该配置即可，不会影响手动接口 /agent/eval/propose。
 */
@Component
@Slf4j
@ConditionalOnProperty(name = "ai.proposal.cron")
public class PromptProposalScheduler {

    @Autowired
    private PromptProposalService promptProposalService;

    @Scheduled(cron = "${ai.proposal.cron}")
    public void run() {
        try {
            promptProposalService.generate(7);
        } catch (Exception e) {
            // 定时任务异常不能影响应用
            log.warn("定时生成 prompt 补丁失败: {}", e.getMessage());
        }
    }
}
