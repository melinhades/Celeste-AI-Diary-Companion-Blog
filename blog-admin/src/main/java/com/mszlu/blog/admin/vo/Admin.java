package com.mszlu.blog.admin.vo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class Admin {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    private String password;

}
