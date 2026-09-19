package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.vo.Result;

import java.util.List;

public interface LikeService {

    Result toggle(String articleId, SysUser user);

    Result info(String articleId, SysUser user);

    Result batchCounts(List<String> articleIds);

    Result likers(String articleId);
}
