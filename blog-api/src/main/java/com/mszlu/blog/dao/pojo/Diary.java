package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

import java.util.Date;

/**
 * 日记表
 */
@Data
public class Diary {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 用户ID */
    private String userId;

    /** 日记标题 */
    private String title;

    /** 日记内容 */
    private String content;

    /** 创建时间 */
    private Date createDate;

    /** 更新时间 */
    private Date updateDate;
}