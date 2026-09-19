package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class Notification {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String userId;

    private String fromUserId;

    private String articleId;

    private String type;

    private Integer isRead;

    private Long createDate;
}
