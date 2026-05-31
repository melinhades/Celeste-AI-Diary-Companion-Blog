package com.mszlu.blog.admin.controller;

import com.mszlu.blog.admin.model.params.PageParam;
import com.mszlu.blog.admin.service.PermissionService;
import com.mszlu.blog.admin.vo.PageResult;
import com.mszlu.blog.admin.vo.Result;
import com.mszlu.blog.admin.pojo.Permission;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/admin")
public class AdminController {
    @Autowired
    private PermissionService permissionService;

    @PostMapping("/permission/list")
    public Result listPermissions(@RequestBody PageParam pageParam) {
        /*
        要的数据 管理台 表的所有的字段 Permission
        分页查询

         */
        return permissionService.listPermission(pageParam);
    }
    @PostMapping("permission/permissionList")
    public Result permissionList (@RequestBody PageParam pageParam){
        return permissionService.listPermission(pageParam);
    }

    @PostMapping("permission/add")
    public Result add (@RequestBody Permission permission) {
        return permissionService.add(permission);
    }
    @PostMapping("permission/update")
    public Result update (@RequestBody Permission permission){
        return permissionService.update(permission);
    }

    @GetMapping("permission/delete/{id}")
    public Result delete (@PathVariable("id") Long id){
        return permissionService.delete(id);
    }

}
