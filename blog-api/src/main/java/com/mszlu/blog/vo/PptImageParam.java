package com.mszlu.blog.vo;

import java.util.List;

/** /ppt/image 入参：这一页的标题 + 要点；prompt 可选，用于直接指定画面描述（调试/复用） */
public class PptImageParam {

    private String title;
    private List<String> points;
    private String prompt;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public List<String> getPoints() { return points; }
    public void setPoints(List<String> points) { this.points = points; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
}
