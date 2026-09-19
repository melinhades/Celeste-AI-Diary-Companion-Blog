package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class Persona {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    /** 角色名，如"老猫" */
    private String name;

    /** 角色卡：性格/口癖/禁忌，原样拼进 system prompt */
    private String characterCard;

    private Integer isActive;

    private Long createDate;
}
