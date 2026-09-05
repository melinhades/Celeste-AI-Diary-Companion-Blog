package com.mszlu.blog.service;

import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.DiaryParam;

/**
 * 日记服务接口
 */
public interface DiaryService {

    /** 保存或更新日记 */
    Result save(DiaryParam param);

    /** 获取日记列表（分页） */
    Result list(int page, int pageSize);

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

    Result featherKeyword();
}