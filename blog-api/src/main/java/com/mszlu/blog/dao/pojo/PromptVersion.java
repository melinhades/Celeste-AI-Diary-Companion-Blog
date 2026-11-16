package com.mszlu.blog.dao.pojo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

import java.math.BigDecimal;

/**
 * Prompt 补丁版本：一条提案被采纳后生成一条版本，按 userId 哈希灰度，
 * 差评率相对基线恶化时自动 rolled_back（补丁随即失效，无需改代码）。
 */
@Data
public class PromptVersion {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    private String scene;

    /** 实际追加到 system prompt 的规则文本 */
    private String patch;

    private String patchHash;

    private String sourceProposalId;

    /** 灰度比例 1-100 */
    private Integer rolloutPercent;

    /** 采纳时近 7 天 👎 率基线，用于自动回滚判断 */
    private BigDecimal baselineNegativeRate;

    /** active / retired / rolled_back */
    private String status;

    private Long createDate;
}
