package com.mszlu.blog.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mszlu.blog.admin.mapper.AiTraceMapper;
import com.mszlu.blog.admin.mapper.AiTraceStepMapper;
import com.mszlu.blog.admin.model.params.AiTracePageParam;
import com.mszlu.blog.admin.pojo.AiTrace;
import com.mszlu.blog.admin.pojo.AiTraceStep;
import com.mszlu.blog.admin.vo.PageResult;
import com.mszlu.blog.admin.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI 调用观测：只读 ms_ai_trace / ms_ai_trace_step。
 * 数据由 blog-api 写入；管理后台仅超管可见，blog-api 不提供任何对外查询接口。
 */
@Service
public class AiTraceAdminService {

    private final AiTraceMapper aiTraceMapper;
    private final AiTraceStepMapper aiTraceStepMapper;

    public AiTraceAdminService(AiTraceMapper aiTraceMapper, AiTraceStepMapper aiTraceStepMapper) {
        this.aiTraceMapper = aiTraceMapper;
        this.aiTraceStepMapper = aiTraceStepMapper;
    }

    public Result page(AiTracePageParam param) {
        LambdaQueryWrapper<AiTrace> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.isNotBlank(param.getScene())) {
            wrapper.eq(AiTrace::getScene, param.getScene());
        }
        if (StringUtils.isNotBlank(param.getStatus())) {
            wrapper.eq(AiTrace::getStatus, param.getStatus());
        }
        if (StringUtils.isNotBlank(param.getUserId())) {
            wrapper.eq(AiTrace::getUserId, param.getUserId().trim());
        }
        if (StringUtils.isNotBlank(param.getQueryString())) {
            String query = param.getQueryString().trim();
            wrapper.and(w -> w.like(AiTrace::getTitle, query).or().like(AiTrace::getScene, query));
        }
        int days = param.getDays() == null || param.getDays() <= 0 ? 7 : param.getDays();
        long from = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000;
        wrapper.ge(AiTrace::getCreateDate, from);
        wrapper.orderByDesc(AiTrace::getCreateDate);

        Page<AiTrace> page = aiTraceMapper.selectPage(
                new Page<>(param.getCurrentPage(), param.getPageSize()), wrapper);
        PageResult<AiTrace> result = new PageResult<>();
        result.setList(page.getRecords());
        result.setTotal(page.getTotal());
        return Result.success(result);
    }

    public Result detail(String id) {
        AiTrace trace = aiTraceMapper.selectById(id);
        if (trace == null) {
            return Result.fail(404, "追踪记录不存在");
        }
        List<AiTraceStep> steps = aiTraceStepMapper.selectList(
                new LambdaQueryWrapper<AiTraceStep>()
                        .eq(AiTraceStep::getTraceId, id)
                        .orderByAsc(AiTraceStep::getSeq));
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("trace", trace);
        data.put("steps", steps);
        return Result.success(data);
    }

    public Result scenes() {
        QueryWrapper<AiTrace> wrapper = new QueryWrapper<>();
        wrapper.select("DISTINCT scene").orderByAsc("scene");
        List<String> scenes = aiTraceMapper.selectObjs(wrapper).stream()
                .filter(java.util.Objects::nonNull)
                .map(String::valueOf)
                .sorted()
                .collect(Collectors.toList());
        return Result.success(scenes);
    }
}
