package com.mszlu.blog.vo;

import lombok.Data;

@Data
public class LoginUserVo {

    private String id;

    private String account;

    private String nickname;

    private String avatar;

    /** 草莓余额 */
    private Integer berry;

    /** 个性签名 */
    private String signature;
}
