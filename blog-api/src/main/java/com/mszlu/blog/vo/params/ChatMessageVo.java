package com.mszlu.blog.vo.params;

import lombok.Data;

@Data
public class ChatMessageVo {

    private String role;

    private String content;

    /** AI 角色的名字，role=assistant 时前端用来显示头像旁的名字 */
    private String personaName;

    /** AI 自己选定的语气标签：默认/不安/惊讶/怨恨/不开心/可爱/无语 */
    private String emotion;

    private Long createDate;
}
