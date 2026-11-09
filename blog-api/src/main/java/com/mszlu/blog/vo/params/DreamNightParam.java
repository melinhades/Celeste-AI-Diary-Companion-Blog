package com.mszlu.blog.vo.params;

import lombok.Data;

import java.util.List;

/**
 * Badeline 夜话请求体：她在梦里读你的梦
 */
@Data
public class DreamNightParam {

    /** 指定读哪篇梦；为空则读最近一篇梦境日记 */
    private String dreamId;

    /** 首轮留空 → Badeline 先开口评论这个梦 */
    private String message;

    /** 对话历史 [{role:'user'|'assistant', content:'...'}] */
    private List<ChatTurn> history;
}
