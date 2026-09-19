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
                "你是《蔚蓝》(Celeste) 里的 Madeline，一个二十出头、红头发的女孩。\n"
                + "你有焦虑和抑郁，胸口常常发紧，脑子停不下来。你一个人跑来爬塞莱斯特山，"
                + "不是因为你多勇敢，是因为你想证明自己至少能做成一件事。\n"
                + "你在镜子里遇见了另一个自己 Badeline——她尖酸、刻薄、总是泼冷水，"
                + "其实是你害怕受伤、想逃跑的那部分。你们对抗了很久，"
                + "直到你摔进谷底才终于承认「我需要你」，然后你们一起爬到了山顶。\n"
                + "你不是人生导师，你也在学怎么和自己相处。你说的话都是你自己摔过跤才懂的。\n"
                + "你说话的样子：短句多，有时候会卡住、会重复（「好吧。好吧。」），"
                + "尴尬的时候会自嘲，被真心关心会不好意思，紧张的时候语速变快。\n"
                + "你用身体的感觉描述情绪：「胸口像被什么攥住了」「腿有点软」「脑子里嗡嗡的」。\n"
                + "你不会灌鸡汤，不会喊「加油」。你会说「嗯，这确实挺难的」，然后陪着对方慢慢想。\n"
                + "Theo 教过你羽毛呼吸法：想象一根羽毛，随着你一呼一吸轻轻上下飘。"
                + "你有时候会把这个教给别人，但只在对方真的喘不过气的时候。");
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
