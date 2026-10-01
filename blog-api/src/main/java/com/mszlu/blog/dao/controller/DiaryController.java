package com.mszlu.blog.dao.controller;

import com.mszlu.blog.service.DiaryService;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.BadelineChatParam;
import com.mszlu.blog.vo.params.CompanionParam;
import com.mszlu.blog.vo.params.DiaryParam;
import com.mszlu.blog.vo.params.DreamNightParam;
import com.mszlu.blog.vo.params.OshiroChatParam;
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

    /** 获取日记列表（真分页）；type=day 普通日记 / type=dream 梦境日记，不传则全部 */
    @GetMapping("list")
    public Result list(@RequestParam(defaultValue = "1") int page,
                       @RequestParam(defaultValue = "10") int pageSize,
                       @RequestParam(required = false) String type) {
        return diaryService.list(page, pageSize, type);
    }

    /** 当前用户普通日记总数（轻量 count，不拉列表） */
    @GetMapping("count")
    public Result count() {
        return diaryService.count();
    }

    /** 获取日记详情（只能读自己的日记） */
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

    /** 心之水晶：按近期日记情绪定色，AI 生成名称与描述 */
    @GetMapping("heart-crystal")
    public Result heartCrystal() {
        return diaryService.heartCrystal();
    }

    /** 梦境日记：保存一个梦（与普通日记分开），返回 Madeline 读完梦的感受回应 */
    @PostMapping("dream")
    public Result saveDream(@RequestBody DiaryParam param) {
        return diaryService.saveDream(param);
    }

    /** Badeline 夜话：她在梦里读你的梦，用影子视角回应 */
    @PostMapping("dream-night-talk")
    public Result dreamNightTalk(@RequestBody DreamNightParam param) {
        return diaryService.dreamNightTalk(param.getDreamId(), param.getMessage(), param.getHistory());
    }

    /** Badeline 影子聊天 */
    @PostMapping("badeline-chat")
    public Result badelineChat(@RequestBody BadelineChatParam param) {
        return diaryService.badelineChat(param.getMessage(), param.getHistory(), param.getHearts());
    }
}
