package com.mszlu.blog.service;

import com.mszlu.blog.dao.pojo.Persona;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.PersonaParam;

public interface PersonaService {

    /** 取当前启用的人设；没有则用默认人设（不落库） */
    Persona getActive(String userId);

    /** 新建或覆盖当前用户的人设并启用 */
    Result saveOrUpdate(PersonaParam param);

    Result current();
}
