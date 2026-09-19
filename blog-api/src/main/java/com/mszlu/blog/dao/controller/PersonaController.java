package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.PersonaService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.PersonaParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("persona")
public class PersonaController {

    @Autowired
    private PersonaService personaService;

    @GetMapping("current")
    public Result current() {
        return personaService.current();
    }

    /** 新建/覆盖人设，body: {"name": "老猫", "characterCard": "..."} */
    @PostMapping
    public Result save(@RequestBody PersonaParam param) {
        return personaService.saveOrUpdate(param);
    }
}
