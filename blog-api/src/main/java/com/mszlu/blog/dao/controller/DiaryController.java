package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.DiaryService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.DiaryParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("diary")
public class DiaryController {

    @Autowired
    private DiaryService diaryService;

    @PostMapping
    public Result save(@RequestBody DiaryParam param) {
        return diaryService.save(param);
    }

    /** 日记伴侣：根据草稿片段获得 Madeline 的反馈 */
    @PostMapping("companion")
    public Result companion(@RequestBody CompanionParam param) {
        return diaryService.companion(param.getDraft());
    }

    /** 获取日记列表（分页） */
    @GetMapping("list")
    public Result list(@RequestParam(defaultValue = "1") int page,
                       @RequestParam(defaultValue = "10") int pageSize) {
        return diaryService.list(page, pageSize);
    }

    /** 获取日记详情 */
    @GetMapping("detail")
    public Result getById(@RequestParam String diaryId) {
        return diaryService.getById(diaryId);
    }

    /** 删除日记 */
    @DeleteMapping
    public Result delete(@RequestParam String diaryId) {
        return diaryService.delete(diaryId);
    }

    /** 每日明信片开场 */
    @GetMapping("daily-postcard")
    public Result dailyPostcard() {
        return diaryService.dailyPostcard();
    }

    /** Madeline 主动冒泡 */
    @GetMapping("bubble")
    public Result bubble() {
        return diaryService.bubble();
    }

    /** 保存成功后的日记总结 */
    @PostMapping("summary")
    public Result summary(@RequestBody DiaryParam param) {
        return diaryService.summary(param);
    }

    /** 快照明信片：Madeline 对这段时间日记的感言 */
    @PostMapping("snap-reflect")
    public Result snapReflect(@RequestBody DiaryParam param) {
        return diaryService.snapReflect(param);
    }

    /** 情绪分析：AI 对日记内容的详细情绪分析 */
    @PostMapping("emotion-analyze")
    public Result emotionAnalyze(@RequestBody DiaryParam param) {
        return diaryService.emotionAnalyze(param);
    }

    /** Oshiro 旅馆聊天 */
    @PostMapping("oshiro-chat")
    public Result oshiroChat(@RequestBody OshiroChatParam param) {
        return diaryService.oshiroChat(param.getMessage(), param.getHistory());
    }

    /** 羽毛关键词提取 */
    @GetMapping("feather-keyword")
    public Result featherKeyword() {
        return diaryService.featherKeyword();
    }

    /** 请求体体：用于 companion 接口 */
    static class CompanionParam {
        private String draft;

        public String getDraft() {
            return draft;
        }

        public void setDraft(String draft) {
            this.draft = draft;
        }
    }

    /** Oshiro 聊天请求体 */
    static class OshiroChatParam {
        private String message;
        private String history; // JSON 数组字符串

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public String getHistory() { return history; }
        public void setHistory(String history) { this.history = history; }
    }
}