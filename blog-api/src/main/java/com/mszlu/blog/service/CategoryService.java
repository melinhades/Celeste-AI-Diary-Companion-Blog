package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.Category;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.CategoryVo;

public interface CategoryService {
    CategoryVo findCategoryById(String categoryId);
    Result findAll();
    Result findAllDetail();
    Result categoryDetailById(String id);

}
