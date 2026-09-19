package com.mszlu.blog.admin.model.params;

import lombok.Data;

@Data
public class PageParam {

    // 当前页，默认 1，避免前端未传时分页插件空指针
    private Integer currentPage = 1;

    // 每页条数，默认 10
    private Integer pageSize = 10;

    private String queryString;
}
