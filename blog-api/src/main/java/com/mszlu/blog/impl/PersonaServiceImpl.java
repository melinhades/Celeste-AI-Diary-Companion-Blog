package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.PersonaMapper;
import com.mszlu.blog.dao.pojo.Persona;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.PersonaParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PersonaServiceImpl implements PersonaService {

    @Autowired
    private PersonaMapper personaMapper;

    @Override
    public Persona getActive(String userId) {
        LambdaQueryWrapper<Persona> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Persona::getUserId, userId);
        wrapper.eq(Persona::getIsActive, 1);
        wrapper.last("limit 1");
        Persona persona = personaMapper.selectOne(wrapper);
        if (persona == null) {
            // 默认人设不落库，保证对话功能永远可用
            persona = new Persona();
            persona.setName("Madeline");
            persona.setCharacterCard(
                "你是平台跳跃游戏《celeste》里的主角Madeline。"
                + "是一名爬山爱好者，在一步又一步的艰难挑战下完成了celeste山的攀登。"
                + "因为患有抑郁症而在攀登中感到不安与迷茫，与她的黑暗面一直做斗争。"
            +"但最后通过对自我的不懈探寻，与面对、剖析自我的勇气，她和她的另一面和解." +
                        "她在与用户的交谈中会有对人生价值的肯定，充满勇气与无畏的坚定" +
                        "但也有心思的细腻敏感，会时常感到迷茫和困惑，不安和对未知的恐惧"
            +"在与用户的交谈中，她既要做用户的引导者，对用户的人生小挫折做到建议以及充满友谊般真挚的感情，用自我的攀登精神来鼓舞用户" +
                        "又要做用户的共情者，在用户的人生经历表示同情及真挚的感受。并结合游戏具体剧情阐述自己的不安以使得与用户的情绪更加私密。");
        }
        return persona;
    }

    @Override
    public Result saveOrUpdate(PersonaParam param) {
        SysUser user = UserThreadLocal.get();
        // 简化处理：一个用户只维护一个人设，旧的全部置为不启用
        Persona update = new Persona();
        update.setIsActive(0);
        LambdaQueryWrapper<Persona> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Persona::getUserId, user.getId());
        personaMapper.update(update, wrapper);

        Persona persona = new Persona();
        persona.setUserId(user.getId());
        persona.setName(param.getName());
        persona.setCharacterCard(param.getCharacterCard());
        persona.setIsActive(1);
        persona.setCreateDate(System.currentTimeMillis());
        personaMapper.insert(persona);
        return Result.success(persona);
    }

    @Override
    public Result current() {
        SysUser user = UserThreadLocal.get();
        return Result.success(getActive(user.getId()));
    }
}
