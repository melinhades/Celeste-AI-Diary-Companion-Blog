package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

import java.util.Date;

@Data
public class Feather {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String userId;

    private String content;

    private Date createDate;
}
