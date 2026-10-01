package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ChatParam;

public interface ChatService {

    /** 主对话：记忆检索 → 拼 prompt → 调 AI → 落库 → 异步提取记忆 */
    Result chat(ChatParam param);

    /**
     * 拉取聊天记录（游标分页）。
     * beforeId 为空：取最新 limit 条（聊天页初始化）；
     * beforeId 不为空：取该消息之前的 limit 条（向上滚动加载更多）。
     */
    Result history(Integer limit, String beforeId);
}
