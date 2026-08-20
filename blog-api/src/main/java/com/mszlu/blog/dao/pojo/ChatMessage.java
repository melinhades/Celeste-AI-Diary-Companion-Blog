package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class ChatMessage {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** user / assistant */
    private String role;

    private String content;

    private Long createDate;
}
