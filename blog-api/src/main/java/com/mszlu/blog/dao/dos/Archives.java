package com.mszlu.blog.dao.dos;

import lombok.Data;

@Data
public class Archives {
    /** 文章明细 id（前端按月分组渲染并跳转详情） */
    private Long id;
    private String title;
    private Integer year;
    private Integer month;
    private Long createDate;
 }
