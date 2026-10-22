package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Madeline 日记多轮反应 · 全链路日志（每轮必写，不可省略）
 * 对应规格：.trae/specs/madeline-diary-chat/diary-chat-v1.md 第四部分
 */
@Data
@TableName("diary_chat_log")
public class DiaryChatLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String userId;
    private String sessionId;
    private Integer turnId;

    // 触发侧
    private String triggerType;       // save / modify / pause / interrupt
    private String triggerDetail;     // 字数、停顿秒数、修改偏移等
    private String userDraft;         // 当轮日记文本（截取 ≤ 2000 字）
    private String typingSignal;      // 打字轨迹 JSON

    // RAG 检索侧
    private String retrievedChunks;   // JSON：检索到的历史日记片段
    private String retrievedScores;   // JSON：各段相似度

    // AI 生成侧
    private String systemPrompt;      // 发给模型的完整 prompt（截取 ≤ 4000 字）
    private String modelRaw;          // 模型原始输出
    private String filteredResponse;  // 人格检查后最终输出
    private String filterReason;      // 过滤/重生成理由（如 R1 医疗建议 → 重新生成 2 次）

    // 分析侧
    private BigDecimal emotionScore;  // 0-1 双模态融合得分
    private String emotionType;       // 兴奋/平静/沮丧/愤怒/迷茫
    private String intentType;        // 吐槽/疑问/喜悦/反思/求助
    private Boolean featherTriggered;
    private Boolean roundtableSync;

    // 用户反馈
    private String userFeedback;      // 👍 / 👎 / null

    // 性能与状态
    private Integer firstDeltaMs;
    private Integer totalMs;
    private LocalDateTime createdAt;
}
