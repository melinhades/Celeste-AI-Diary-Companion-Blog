package com.mszlu.blog.admin.service;

import com.mszlu.blog.admin.vo.Admin;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.ArrayList;

public class SecurityUserService implements UserDetailsService {
    @Autowired
    private AdminService adminService;
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException{
        //登录的时候，会把username 传递到这里
        //通过username查询admin表，如果 admin存在，将密码告诉Spring Security
        //如果不存在 返回null 认证失败了
        Admin admin=this.adminService.findAdminByUsername(username);
        if(admin==null){
            return null;
            //登陆失败
        }
        UserDetails userDetails = new User(username,admin.getPassword(),new ArrayList<>());
        //
        return userDetails;
    }
}
