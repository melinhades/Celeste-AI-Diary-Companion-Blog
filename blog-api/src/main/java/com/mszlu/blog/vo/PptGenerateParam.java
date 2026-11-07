package com.mszlu.blog.vo;

import java.util.List;
import java.util.Map;

/** /ppt/generate 入参：主题 + 日记原文 + 高频词，prompt 由前端 pptgen.js 拼好透传 */
public class PptGenerateParam {

    private String topic;
    private String diary;
    private List<Map<String, Object>> evidence;
    private String prompt;

    public String getTopic() { return topic; }
    public void setTopic(String topic) { this.topic = topic; }
    public String getDiary() { return diary; }
    public void setDiary(String diary) { this.diary = diary; }
    public List<Map<String, Object>> getEvidence() { return evidence; }
    public void setEvidence(List<Map<String, Object>> evidence) { this.evidence = evidence; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
}
