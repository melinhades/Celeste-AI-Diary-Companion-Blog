package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class ProactiveLog {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    private Integer shouldReachOut;

    /** shouldReachOut=0 时为空 */
    private String message;

    /** casual / concerned / miss */
    private String mood;

    private String decisionReason;

    /** 前端是否已拉取展示 */
    private Integer isRead;

    private Long createDate;
}
