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

    /**
     * 首次公开时间；历史文章没记时为 null
     */
    private String publishTime;

    /**
     * 可见性：1=公开 0=私密（只有作者本人能拿到私密文章，前端据此提示未公开）
     */
    private Integer visibility;

    private String author;

    /**
     * 是否匿名发布：1=匿名 0=非匿名
     */
    private Integer anonymous;

    private ArticleBodyVo body;

    private List<TagVo> tags;

    private CategoryVo category;

    private List<String> images;

}