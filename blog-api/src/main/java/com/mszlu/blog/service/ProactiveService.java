package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;

public interface ProactiveService {

    /** 每天定时执行：对活跃用户逐个做"要不要主动说话"的决策 */
    void dailyReachOut();

    /** 前端轮询：取当前用户最新一条未读的主动消息并标记已读 */
    Result latestUnread();
}
