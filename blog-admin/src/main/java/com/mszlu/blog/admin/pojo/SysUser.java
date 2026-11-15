package com.mszlu.blog.admin.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

@Data
@TableName("ms_sys_user")
public class SysUser {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String account;

    private Boolean admin;

    private String avatar;

    private Long createDate;

    private Boolean deleted;

    private String email;

    private Long lastLogin;

    private String mobilePhoneNumber;

    private String nickname;

    @JsonIgnore
    private String password;

    @JsonIgnore
    private String salt;

    private String status;

    private Integer berry;

    private String signature;

    @JsonIgnore
    private String apiKey;

    @JsonIgnore
    private String apiProvider;
}
