package com.mszlu.blog.vo.params;

import lombok.Data;

/**
 * 日记伴侣请求体：根据草稿片段获得 Madeline 的反馈（v1 扩展：多轮会话记忆 + 实时中断 + 打字轨迹）
 */
@Data
public class CompanionParam {

    /** 正在写的日记草稿片段（必填） */
    private String draft;

    /** 会话 ID（可选，不传则后端自动生成；同一用户多会话隔离） */
    private String sessionId;

    /** 触发类型：save（保存）/ modify（修改 debounce 2s）/ pause（停顿 >3s）/ interrupt（中断当前生成） */
    private String triggerType;

    /** 打字轨迹信号 JSON 字符串：如 {"delete":5,"pause":3.2,"undo":2,"modifyFreq":6} */
    private String typingSignal;

    /** 中断信号：为 true 时后端停止当前会话的流式生成（与 triggerType="interrupt" 配合） */
    private Boolean interrupt;

    /** 羽毛触发标记：如果前端已确认本次保存触发羽毛，则传 true，后端在 prompt 中注入 */
    private Boolean featherTriggered;
}
