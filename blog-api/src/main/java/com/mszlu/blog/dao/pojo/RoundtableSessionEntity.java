package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * 圆桌会议持久化：一场会议结束后整体落库（进行中不落，纯内存跑）。
 * 历史回看、跨设备同步、以及"上次讨论到哪了"的记忆回流都从这张表来。
 */
@Data
public class RoundtableSessionEntity {

    @TableId(type = IdType.INPUT)
    /** 与内存中 session id（UUID）一致 */
    private String id;

    private String userId;

    private String topic;

    /** FINISHED / ABORTED / ERROR */
    private String status;

    private Integer rounds;

    private Integer speechCount;

    /** 评审结果 JSON（scores/avg/grade/comment/todos） */
    private String score;

    /** 逐字稿 JSON 数组（speakerId/name/color/role/content/ts） */
    private String transcript;

    private Long createDate;

    private Long finishDate;
}
