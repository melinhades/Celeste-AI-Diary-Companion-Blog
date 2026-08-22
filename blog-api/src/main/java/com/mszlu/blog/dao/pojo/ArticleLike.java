package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public class ArticleLike {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String articleId;

    private String userId;

    private Long createDate;
}
