package com.mszlu.blog.utils;

import com.mszlu.blog.dao.pojo.SysUser;

public class UserThreadLocal {

    private UserThreadLocal(){

    }
    //线程变量隔离
    private static final ThreadLocal TreadLocal<SysUser> LOCAL = new ThreadLocal<>();

    public static void put(SysUser user){
        LOCAL.set(sysUser);
    }
    public static SysUser get(){
        return LOCAl.get();
    }
    public static void remove(){
        LOCAL.remove();
    }
}
