package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;

public interface FeatherService {

    Result save(String content);

    Result count();

    Result recent(int limit);
}
