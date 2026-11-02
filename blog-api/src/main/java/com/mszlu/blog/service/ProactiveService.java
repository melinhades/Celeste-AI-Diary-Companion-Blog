package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

public interface ProactiveService {

    /** 每天定时执行：对活跃用户逐个做"要不要主动说话"的决策 */
    void dailyReachOut();

    /** 前端轮询：取当前用户最新一条未读的主动消息并标记已读 */
    Result latestUnread();

    /** SSE 订阅：返回 SseEmitter，后续 bubble 生成消息时会推送 */
    SseEmitter subscribe(String userId);

    /** 推送主动消息到已订阅的用户（bubble 调用） */
    void pushToUser(String userId, String message, String emotion);
}
