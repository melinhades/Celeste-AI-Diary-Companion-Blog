package com.mszlu.blog.admin.service;

import com.mszlu.blog.admin.vo.Admin;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
public class SecurityUserService implements UserDetailsService {
    @Autowired
    private AdminService adminService;
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException{
        //登录的时候，会把username 传递到这里
        //通过username查询admin表，如果 admin存在，将密码告诉Spring Security
        //如果不存在 抛出 UsernameNotFoundException，Spring Security 会转换为 BadCredentials 返回登录失败
        Admin admin=this.adminService.findAdminByUsername(username);
        if(admin==null){
            throw new UsernameNotFoundException("用户不存在：" + username);
        }
        UserDetails userDetails = new User(username,admin.getPassword(),new ArrayList<>());
        //
        return userDetails;
    }
}
