package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * 提醒：主对话里 Madeline 通过 JSON 工具字段帮用户设的待办提醒。
 * 到期由定时任务派发成一条 assistant 聊天消息。
 */
@Data
public class Reminder {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** 提醒内容（"明天早上9点交作业" → content="交作业"） */
    private String content;

    /** 应提醒的时间戳 */
    private Long remindAt;

    /** 0=待提醒 1=已派发 2=已取消 */
    private Integer status;

    private Long createDate;
}
