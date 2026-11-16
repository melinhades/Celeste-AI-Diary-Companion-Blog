package com.mszlu.blog.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.DiaryChatLogMapper;
import com.mszlu.blog.dao.mapper.PromptProposalMapper;
import com.mszlu.blog.dao.mapper.PromptVersionMapper;
import com.mszlu.blog.dao.pojo.DiaryChatLog;
import com.mszlu.blog.dao.pojo.PromptProposal;
import com.mszlu.blog.dao.pojo.PromptVersion;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 自我迭代第四步：采纳提案 → 按 userId 哈希灰度 → 指标恶化自动回滚。
 * <p>
 * 补丁不写进源码，只在运行时追加到 system prompt；回滚 = 版本状态改掉，
 * 下一轮就不会再命中，不需要发版。
 */
@Service
@Slf4j
public class PromptVersionService {

    /** 自动回滚的最小样本量，样本太少不下结论 */
    private static final int MIN_SAMPLE = 30;
    /** 差评率超过基线的倍数 */
    private static final double AUTO_ROLLBACK_RATIO = 1.5;
    /** 同时要求绝对涨幅，避免基线极低时误杀 */
    private static final double AUTO_ROLLBACK_MARGIN = 0.05;
    /** 评估窗口（天） */
    private static final int EVAL_WINDOW_DAYS = 7;

    @Autowired
    private PromptProposalMapper proposalMapper;

    @Autowired
    private PromptVersionMapper versionMapper;

    @Autowired
    private DiaryChatLogMapper diaryChatLogMapper;

    /**
     * 采纳提案：旧版本自动退休，新版本按比例灰度。
     *
     * @param percent 灰度比例 1-100，非法值按 100 处理
     */
    public Map<String, Object> adopt(String proposalId, int percent) {
        if (proposalId == null || proposalId.isBlank()) {
            return notAdopted("缺少提案 ID");
        }
        PromptProposal proposal;
        try {
            proposal = proposalMapper.selectById(proposalId);
        } catch (Exception e) {
            return notAdopted("提案查询失败：" + e.getMessage());
        }
        if (proposal == null) return notAdopted("提案不存在");
        if (!"pending".equals(proposal.getStatus())) {
            return notAdopted("提案状态是 " + proposal.getStatus() + "，只能采纳待审提案");
        }
        if (proposal.getPatch() == null || proposal.getPatch().isBlank()) {
            return notAdopted("提案没有补丁内容");
        }

        int rollout = percent <= 0 ? 100 : Math.min(percent, 100);
        BigDecimal baseline = baselineNegativeRate();

        try {
            // 同一场景只保留一个 active 版本，旧的退休
            List<PromptVersion> actives = versionMapper.selectList(new LambdaQueryWrapper<PromptVersion>()
                    .eq(PromptVersion::getScene, proposal.getScene())
                    .eq(PromptVersion::getStatus, "active"));
            for (PromptVersion old : actives) {
                old.setStatus("retired");
                versionMapper.updateById(old);
            }

            PromptVersion v = new PromptVersion();
            v.setScene(proposal.getScene());
            v.setPatch(proposal.getPatch());
            v.setPatchHash(proposal.getPatchHash());
            v.setSourceProposalId(proposal.getId());
            v.setRolloutPercent(rollout);
            v.setBaselineNegativeRate(baseline);
            v.setStatus("active");
            v.setCreateDate(System.currentTimeMillis());
            versionMapper.insert(v);

            proposal.setStatus("accepted");
            proposalMapper.updateById(proposal);

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("adopted", true);
            out.put("version", v);
            return out;
        } catch (Exception e) {
            log.warn("采纳补丁失败 proposalId={}: {}", proposalId, e.getMessage());
            return notAdopted("采纳失败：" + e.getMessage());
        }
    }

    /** 手动回滚：补丁立即失效 */
    public Map<String, Object> rollback(String versionId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (versionId == null || versionId.isBlank()) {
            out.put("rolledBack", false);
            out.put("reason", "缺少版本 ID");
            return out;
        }
        try {
            PromptVersion v = versionMapper.selectById(versionId);
            if (v == null) {
                out.put("rolledBack", false);
                out.put("reason", "版本不存在");
                return out;
            }
            v.setStatus("rolled_back");
            versionMapper.updateById(v);
            out.put("rolledBack", true);
            out.put("versionId", versionId);
            return out;
        } catch (Exception e) {
            out.put("rolledBack", false);
            out.put("reason", "回滚失败：" + e.getMessage());
            return out;
        }
    }

    public List<PromptVersion> list(String status) {
        LambdaQueryWrapper<PromptVersion> qw = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            qw.eq(PromptVersion::getStatus, status.trim());
        }
        qw.orderByDesc(PromptVersion::getCreateDate).last("limit 50");
        return versionMapper.selectList(qw);
    }

    /**
     * 当前用户本轮应命中的补丁版本：未命中灰度或没有 active 版本时返回 null。
     * 查询异常一律返回 null，保证对话主流程不受影响。
     */
    public PromptVersion activeVersionFor(String userId, String scene) {
        try {
            List<PromptVersion> rows = versionMapper.selectList(new LambdaQueryWrapper<PromptVersion>()
                    .eq(PromptVersion::getScene, scene)
                    .eq(PromptVersion::getStatus, "active")
                    .orderByDesc(PromptVersion::getCreateDate)
                    .last("limit 1"));
            if (rows.isEmpty()) return null;
            PromptVersion v = rows.get(0);
            return inRollout(userId, v) ? v : null;
        } catch (Exception e) {
            log.warn("读取 active prompt 版本失败（按无补丁处理）: {}", e.getMessage());
            return null;
        }
    }

    /** 每小时评估一次：灰度组的差评率相对基线恶化就自动回滚 */
    @Scheduled(cron = "0 10 * * * ?")
    public void autoRollback() {
        List<PromptVersion> actives;
        try {
            actives = versionMapper.selectList(new LambdaQueryWrapper<PromptVersion>()
                    .eq(PromptVersion::getStatus, "active"));
        } catch (Exception e) {
            log.warn("自动回滚查询 active 版本失败: {}", e.getMessage());
            return;
        }
        for (PromptVersion v : actives) {
            try {
                checkOne(v);
            } catch (Exception e) {
                log.warn("自动回滚评估失败 versionId={}: {}", v.getId(), e.getMessage());
            }
        }
    }

    private void checkOne(PromptVersion v) {
        if (v.getBaselineNegativeRate() == null) return;
        long now = System.currentTimeMillis();
        long since = Math.max(v.getCreateDate() == null ? 0 : v.getCreateDate(),
                now - EVAL_WINDOW_DAYS * 24L * 60 * 60 * 1000);
        LocalDateTime sinceTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(since), ZoneId.systemDefault());

        Long total = diaryChatLogMapper.selectCount(new LambdaQueryWrapper<DiaryChatLog>()
                .eq(DiaryChatLog::getPromptVersion, v.getId())
                .isNotNull(DiaryChatLog::getUserFeedback)
                .ge(DiaryChatLog::getCreatedAt, sinceTime));
        if (total == null || total < MIN_SAMPLE) return;

        Long negative = diaryChatLogMapper.selectCount(new LambdaQueryWrapper<DiaryChatLog>()
                .eq(DiaryChatLog::getPromptVersion, v.getId())
                .eq(DiaryChatLog::getUserFeedback, "👎")
                .ge(DiaryChatLog::getCreatedAt, sinceTime));
        double rate = (negative == null ? 0 : negative) * 1.0 / total;
        double baseline = v.getBaselineNegativeRate().doubleValue();

        if (rate > baseline * AUTO_ROLLBACK_RATIO && rate - baseline >= AUTO_ROLLBACK_MARGIN) {
            v.setStatus("rolled_back");
            versionMapper.updateById(v);
            log.warn("prompt 补丁自动回滚 versionId={}, 差评率={}, 基线={}", v.getId(), rate, baseline);
        }
    }

    /** 采纳时近 7 天的全局 👎 率；样本不足返回 null（不启用自动回滚判断） */
    private BigDecimal baselineNegativeRate() {
        try {
            LocalDateTime since = LocalDateTime.now().minusDays(EVAL_WINDOW_DAYS);
            Long total = diaryChatLogMapper.selectCount(new LambdaQueryWrapper<DiaryChatLog>()
                    .isNotNull(DiaryChatLog::getUserFeedback)
                    .ge(DiaryChatLog::getCreatedAt, since));
            if (total == null || total < MIN_SAMPLE) return null;
            Long negative = diaryChatLogMapper.selectCount(new LambdaQueryWrapper<DiaryChatLog>()
                    .eq(DiaryChatLog::getUserFeedback, "👎")
                    .ge(DiaryChatLog::getCreatedAt, since));
            return BigDecimal.valueOf((negative == null ? 0 : negative) * 1.0 / total)
                    .setScale(4, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.warn("差评率基线计算失败（不启用自动回滚）: {}", e.getMessage());
            return null;
        }
    }

    private boolean inRollout(String userId, PromptVersion v) {
        int percent = v.getRolloutPercent() == null ? 100 : v.getRolloutPercent();
        if (percent >= 100) return true;
        if (userId == null) return false;
        // userId + 版本 ID 一起哈希：换版本重新分桶，避免总是同一批人当小白鼠
        int bucket = Math.floorMod((userId + ":" + v.getId()).hashCode(), 100);
        return bucket < percent;
    }

    private Map<String, Object> notAdopted(String reason) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("adopted", false);
        out.put("reason", reason);
        return out;
    }
}
