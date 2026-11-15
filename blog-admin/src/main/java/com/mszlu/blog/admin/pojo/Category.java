package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("ms_category")
public class Category {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String avatar;

    private String categoryName;

    private String description;
}
