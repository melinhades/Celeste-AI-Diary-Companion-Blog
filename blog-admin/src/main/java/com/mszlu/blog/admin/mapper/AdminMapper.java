package com.mszlu.blog.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mszlu.blog.admin.pojo.Permission;
import com.mszlu.blog.admin.vo.Admin;
import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface AdminMapper extends BaseMapper<Admin>{
    @Select("SELECT * FROM ms_permission where id in(select permission_id from ms_admin_permission where admin_id=#{admin_id})")
    List<Permission> findPermissionByAdminId(Long adminId);

}
