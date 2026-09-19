package com.mszlu.blog.vo.params;


import lombok.Data;

import java.util.List;

@Data
public class ArticleVo {

    private String id;

    private String title;

    private String summary;

    private int commentCounts;

    private int viewCounts;

    private int weight;
    /**
     * 创建时间
     */
    private String createDate;

    private String author;

    private ArticleBodyVo body;

    private List<TagVo> tags;

    private CategoryVo category;

    private List<String> images;

}