package com.mszlu.blog.dao.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mszlu.blog.dao.pojo.Tag;

import java.util.List;

public interface TagMapper extends BaseMapper<Tag> {

    List<Tag> findTagsByTagIds(List<String> tagIds);

    List<String> findHotsTagIds(@org.apache.ibatis.annotations.Param("limit") int limit);

    List<Tag> findTagsByArticleId(String articleId);

    List<Tag> findTagsByCategoryId(String categoryId);
}