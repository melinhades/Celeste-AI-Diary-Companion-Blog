package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.DiaryParam;

/**
 * 日记服务接口
 */
public interface DiaryService {

    /** 保存或更新日记 */
    Result save(DiaryParam param);

    /** 获取日记列表（分页）；type 为 null=全部，day=普通日记，dream=梦境日记 */
    Result list(int page, int pageSize, String type);

    /** 保存一篇梦境日记（type=dream），并返回 Madeline 读完梦后的感受回应 */
    Result saveDream(DiaryParam param);

    /** Badeline 夜话：她读你写下的梦，用影子视角回应；message 为空时由她先开口评论这个梦 */
    Result dreamNightTalk(String dreamId, String message, String historyJson);

    /** 日记伴侣：根据草稿片段获得 Madeline 的反馈 */
    Result companion(String draftSnippet);

    /** 获取日记详情 */
    Result getById(String diaryId);

    /** 删除日记 */
    Result delete(String diaryId);

    /** 每日明信片：获取今天的开场留言 */
    Result dailyPostcard();

    /** Madeline 主动冒泡 */
    Result bubble();

    /** 保存成功：Madeline 对这篇日记做一句总结 */
    Result summary(DiaryParam param);

    /** 快照明信片：Madeline 对这段时间日记的感言 */
    Result snapReflect(DiaryParam param);

    /** 情绪分析：AI 对日记内容的详细情绪分析 */
    Result emotionAnalyze(DiaryParam param);

    /** 最近情绪画像：给次日对话、主动关怀等场景用的文字描述，没有则返回空串 */
    String recentEmotionNote(String userId);

    /** Oshiro 旅馆聊天 */
    Result oshiroChat(String message, String historyJson);

    /** Badeline 影子聊天：自适应人格（方案C 关系状态 + 四旋钮），hearts 为前端心之水晶 JSON 数组字符串；返回 message / emotion(立绘情绪标记，可为空) / stage */
    Result badelineChat(String message, String historyJson, String heartsJson);

    Result featherKeyword();

    /** 心之水晶：按近期日记情绪定色，AI 生成名称与描述 */
    Result heartCrystal();
}