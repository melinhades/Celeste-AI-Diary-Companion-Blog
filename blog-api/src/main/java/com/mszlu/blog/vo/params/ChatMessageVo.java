package com.mszlu.blog.vo.params;

import lombok.Data;

@Data
public class ChatMessageVo {

    private String role;

    private String content;

    /** AI 角色的名字，role=assistant 时前端用来显示头像旁的名字 */
    private String personaName;

    private Long createDate;
}
