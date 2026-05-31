package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.TagVo;

import java.util.List;

public interface TagService {
    List<TagVo> findTagsByArticleId(String articleId);

    Result hots(int limit);
    /**
     * 查询所有的文章标签
     */
    Result findAll();

    Result findAllDetail();

    Result findAllDetailByCategoryId(String categoryId);

    Result findDetailById(String id);

}
