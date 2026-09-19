package com.mszlu.blog.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mszlu.blog.admin.mapper.PermissionMapper;
import com.mszlu.blog.admin.model.params.PageParam;
import com.mszlu.blog.admin.pojo.Permission;
import com.mszlu.blog.admin.vo.PageResult;
import com.mszlu.blog.admin.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PermissionService {
    @Autowired
    private PermissionMapper permissionMapper;

    public Result listPermission(PageParam pageParam){
        Page<Permission> page =new Page<>(pageParam.getCurrentPage(),pageParam.getPageSize());
        LambdaQueryWrapper<Permission> queryWrapper = new LambdaQueryWrapper<>();
        if(StringUtils.isNotBlank(pageParam.getQueryString())){
            // 按名称模糊搜索，避免只能精确匹配才能查到
            queryWrapper.like(Permission::getName,pageParam.getQueryString());
        }
        Page<Permission> permissionPage = permissionMapper.selectPage(page,queryWrapper);
        PageResult<Permission> pageResult = new PageResult<>();
        pageResult.setList(permissionPage.getRecords());
        pageResult.setTotal(permissionPage.getTotal());


        return Result.success(pageResult);
    }
    public Result add(Permission permission){
        // ms_permission.description 列为 NOT NULL，空值时补默认空串，避免插入报错
        if (StringUtils.isBlank(permission.getDescription())){
            permission.setDescription("");
        }
        int rows = this.permissionMapper.insert(permission);
        if (rows <= 0){
            return Result.fail(500,"新增权限失败");
        }
        return Result.success(null);
    }
    public Result update(Permission permission){
        int rows = this.permissionMapper.updateById(permission);
        if (rows <= 0){
            return Result.fail(500,"更新权限失败，记录不存在或数据无变化");
        }
        return Result.success(null);
    }
    public Result delete(Long id){
        int rows = this.permissionMapper.deleteById(id);
        if (rows <= 0){
            return Result.fail(500,"删除权限失败，记录不存在");
        }
        return Result.success(null);
    }
}
