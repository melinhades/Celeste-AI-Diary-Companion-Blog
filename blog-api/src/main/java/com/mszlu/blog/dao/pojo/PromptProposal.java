package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

/**
 * Prompt 补丁提案：AI 从失败用例里归纳出来的规则增量，只入库待审，不自动生效。
 */
@Data
public class PromptProposal {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 一句话概括本次补丁要解决什么 */
    private String title;

    private String scene;

    /** 关联用例 ID 的 JSON 数组 */
    private String caseIds;

    /** 失败模式归纳的 JSON 数组 */
    private String failPatterns;

    /** 建议追加的规则片段，只追加不改人设 */
    private String patch;

    /** 补丁哈希，唯一键去重 */
    private String patchHash;

    private String rationale;

    /** 风险与影响面 */
    private String risk;

    private String model;

    /** pending / accepted / rejected */
    private String status;

    private Long createDate;
}
