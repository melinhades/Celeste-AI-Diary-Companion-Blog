package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;

public interface NotificationService {

    /** 我的通知列表（最近 30 条，附发送者昵称与文章标题） */
    Result listMine(String userId);

    /** 我的未读通知数 */
    Result unreadCount(String userId);

    /** 我的通知全部标记已读 */
    Result markAllRead(String userId);
}
