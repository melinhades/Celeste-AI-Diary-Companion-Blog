package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.BerryParam;
import com.mszlu.blog.vo.params.SignatureParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("users")
public class UserController {
    @Autowired
    private SysUserService sysUserService;

    @GetMapping("currentUser")
    public Result currentUser(@RequestHeader("Authorization") String token) {
        return sysUserService.findUserByToken(token);
    }

    /** 查询草莓余额（以数据库为准） */
    @GetMapping("berry")
    public Result berry(@RequestHeader("Authorization") String token) {
        return sysUserService.berryBalance(token);
    }

    /** 草莓余额增减：delta 正=获得（写日记/草莓籽），负=消费（商店） */
    @PostMapping("berry")
    public Result adjustBerry(@RequestHeader("Authorization") String token,
                              @RequestBody BerryParam param) {
        return sysUserService.adjustBerry(token, param == null ? null : param.getDelta());
    }

    /** 更新个性签名（空串/null 清空） */
    @PutMapping("signature")
    public Result updateSignature(@RequestHeader("Authorization") String token,
                                  @RequestBody SignatureParam param) {
        return sysUserService.updateSignature(token, param == null ? null : param.getSignature());
    }
}
