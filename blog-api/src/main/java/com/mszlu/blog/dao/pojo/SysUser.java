package com.mszlu.blog.dao.pojo;

import lombok.Data;

@Data
public class SysUser {

    private String id;

    private String account;

    private Integer admin;

    private String avatar;

    private Long createDate;

    private Integer deleted;

    private String email;

    private Long lastLogin;

    private String mobilePhoneNumber;

    private String nickname;

    private String password;

    private String salt;

    private String status;

    /** 草莓余额（写日记/收集草莓籽获得，商店消费） */
    private Integer berry;

    /** 个性签名（me 页票根编辑） */
    private String signature;
}