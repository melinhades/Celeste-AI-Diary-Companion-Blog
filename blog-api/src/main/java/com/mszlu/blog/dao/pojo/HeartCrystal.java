package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 心之水晶（按用户 + 自然日一颗，服务端幂等）
 */
@Data
@TableName("ms_heart_crystal")
public class HeartCrystal {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 用户ID */
    private String userId;

    /** 自然日（服务器时区），格式 yyyy-MM-dd */
    private String crystalDate;

    /** 心色：red / blue / yellow */
    private String color;

    /** 心名字 */
    private String title;

    /** 一句话描述 */
    private String description;

    /** 生成时间戳（毫秒） */
    private Long createDate;
}
