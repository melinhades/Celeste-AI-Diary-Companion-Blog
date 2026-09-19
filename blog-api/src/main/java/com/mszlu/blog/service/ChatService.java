package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ChatParam;

public interface ChatService {

    /** 主对话：记忆检索 → 拼 prompt → 调 AI → 落库 → 异步提取记忆 */
    Result chat(ChatParam param);

    /** 拉取最近 N 条聊天记录（聊天页初始化用） */
    Result history(Integer limit);
}
