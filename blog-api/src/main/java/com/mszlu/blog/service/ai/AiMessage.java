package com.mszlu.blog.service.ai;

public class AiMessage {

    /** system / user / assistant */
    private String role;

    private String content;

    public AiMessage(String role, String content) {
        this.role = role;
        this.content = content;
    }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
