package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * 评测基准集：一条用例 = 一次可复现的失败。
 * <p>
 * feedback 来源（👎）默认 pending，需要人工补 expected；
 * persona_fail 来源自带违反的规则号，直接 ready。
 */
@Data
public class EvalCase {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** feedback / persona_fail */
    private String source;

    /** 来源记录 ID，与 source 组成唯一键，保证重复跑不会重复入池 */
    private String sourceId;

    /** roundtable / chat ... */
    private String scene;

    private String sessionId;

    private String userId;

    /** 被评测的输入：日记草稿或触发句 */
    private String caseInput;

    /** 当时的坏输出 */
    private String badOutput;

    /** 期望结果：失败规则号（R4）或人工补充的标准答案 */
    private String expected;

    /** pending / ready / dropped */
    private String status;

    private Long createDate;
}
