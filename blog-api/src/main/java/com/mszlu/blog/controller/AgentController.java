package com.mszlu.blog.controller;

import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.EvalCaseService;
import com.mszlu.blog.service.PromptProposalService;
import com.mszlu.blog.service.PromptVersionService;
import com.mszlu.blog.service.SelfEvalService;
import com.mszlu.blog.service.ai.madeline.MadelineAgentEngine;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.AgentParam;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("agent")
public class AgentController {

    @Autowired
    private MadelineAgentEngine madelineAgentEngine;

    @Autowired
    private SelfEvalService selfEvalService;

    @Autowired
    private EvalCaseService evalCaseService;

    @Autowired
    private PromptProposalService promptProposalService;

    @Autowired
    private PromptVersionService promptVersionService;

    /**
     * Madeline agent 模式：工具循环（一期：polishText 润色）。
     * SSE（text/event-stream）事件帧：step（步骤播报）/ emotion / delta（正文）/ result（对照卡片）/ done / error。
     * 鉴权与 diary/companion 一致（UserThreadLocal，由拦截器放行）。
     */
    @PostMapping(value = "madeline/stream")
    public void madelineStream(@RequestBody AgentParam param,
                               jakarta.servlet.http.HttpServletResponse response) {
        madelineAgentEngine.run(param.getMessage(), response);
    }

    /**
     * 管理员：失败模式聚合（👎 反馈 + 人格检查硬红线），给 prompt 迭代找方向。
     * /agent/** 已走登录拦截器，这里再做管理员校验，避免普通用户看到全站对话样本。
     */
    @GetMapping("insights")
    public Result insights(@RequestParam(value = "days", defaultValue = "7") int days) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(selfEvalService.failurePatterns(days));
    }

    /** 管理员：把窗口内的差评与人格失败固化成评测用例（幂等，重复触发不会重复入池） */
    @PostMapping("eval/promote")
    public Result promoteEvalCases(@RequestParam(value = "days", defaultValue = "7") int days) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(evalCaseService.promote(days));
    }

    /** 管理员：查看基准集，默认给待人工标注的用例 */
    @GetMapping("eval/cases")
    public Result listEvalCases(@RequestParam(value = "status", defaultValue = "pending") String status,
                                @RequestParam(value = "limit", defaultValue = "50") int limit) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(evalCaseService.list(status, limit));
    }

    /** 管理员：基于基准集生成一条 prompt 补丁提案（会调用 AI，只入库待审） */
    @PostMapping("eval/propose")
    public Result generateProposal(@RequestParam(value = "days", defaultValue = "7") int days) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(promptProposalService.generate(days));
    }

    /** 管理员：查看补丁提案，默认待审 */
    @GetMapping("eval/proposals")
    public Result listProposals(@RequestParam(value = "status", defaultValue = "pending") String status,
                                @RequestParam(value = "limit", defaultValue = "20") int limit) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(promptProposalService.list(status, limit));
    }

    /** 管理员：采纳提案并按比例灰度（1-100），同一场景只保留一个 active 版本 */
    @PostMapping("eval/adopt")
    public Result adoptProposal(@RequestParam("proposalId") String proposalId,
                                @RequestParam(value = "percent", defaultValue = "10") int percent) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(promptVersionService.adopt(proposalId, percent));
    }

    /** 管理员：手动回滚某个版本，补丁下一轮立即失效 */
    @PostMapping("eval/rollback")
    public Result rollbackVersion(@RequestParam("versionId") String versionId) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(promptVersionService.rollback(versionId));
    }

    /** 管理员：查看版本状态（active / retired / rolled_back） */
    @GetMapping("eval/versions")
    public Result listVersions(@RequestParam(value = "status", defaultValue = "active") String status) {
        Result denied = adminDenied();
        if (denied != null) return denied;
        return Result.success(promptVersionService.list(status));
    }

    /** 管理员校验：通过返回 null，不通过返回可直接下发的 Result */
    private Result adminDenied() {
        SysUser me = UserThreadLocal.get();
        if (me == null) return Result.fail(401, "未登录");
        if (me.getAdmin() == null || me.getAdmin() != 1) return Result.fail(403, "需要管理员权限");
        return null;
    }
}
