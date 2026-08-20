package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.Memory;
import com.mszlu.blog.vo.Result;

import java.util.List;

public interface MemoryService {

    /**
     * 取本轮对话相关的记忆：
     * 1. open 状态的 promise/event 全取（"翻旧账"素材）
     * 2. 按消息内容关键词 LIKE 匹配其他类型
     * 3. 兜底补几条 importance 最高的
     */
    List<Memory> getRelevant(String userId, String userContent);

    /** 对话后异步提取记忆并入库（@Async，不阻塞回复） */
    void extractAsync(String userId, String userContent, String aiReply);

    /** 把这些记忆的 last_mentioned_time 更新为现在 */
    void markMentioned(List<Memory> memories);

    Result listOpen();

    /** 用户手动了结某条记忆（"那件事解决了"） */
    Result resolve(String memoryId);
}
