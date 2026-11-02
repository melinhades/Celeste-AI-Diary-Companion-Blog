package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.RoundtableSessionMapper;
import com.mszlu.blog.dao.pojo.RoundtableSessionEntity;
import com.mszlu.blog.vo.Result;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 圆桌会议历史（服务端落库版，替代前端 localStorage 单机历史）：
 * 只查/删本人记录，数据隔离在查询条件里完成。
 */
@Service
public class RoundtableHistoryService {

    @Autowired
    private RoundtableSessionMapper sessionMapper;

    /** 本人历史会议列表（按结束时间倒序，limit 缺省 20、上限 50） */
    public Result listMine(String userId, Integer limit) {
        int size = (limit == null || limit <= 0) ? 20 : Math.min(limit, 50);
        LambdaQueryWrapper<RoundtableSessionEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RoundtableSessionEntity::getUserId, userId);
        wrapper.orderByDesc(RoundtableSessionEntity::getFinishDate);
        wrapper.last("limit " + size);
        List<Map<String, Object>> list = new ArrayList<>();
        for (RoundtableSessionEntity e : sessionMapper.selectList(wrapper)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", e.getId());
            m.put("topic", e.getTopic());
            m.put("status", e.getStatus());
            m.put("rounds", e.getRounds());
            m.put("speechCount", e.getSpeechCount());
            m.put("ts", e.getFinishDate());
            try {
                m.put("score", JSON.parseObject(e.getScore()));
                m.put("transcript", JSON.parseArray(e.getTranscript()));
            } catch (Exception ignore) {
                m.put("score", null);
                m.put("transcript", new ArrayList<>());
            }
            list.add(m);
        }
        return Result.success(list);
    }

    /** 删除本人一条历史会议 */
    public Result deleteMine(String userId, String id) {
        RoundtableSessionEntity e = sessionMapper.selectById(id);
        if (e == null) return Result.success(null);
        if (!e.getUserId().equals(userId)) {
            return Result.fail(403, "只能删除自己的会议记录");
        }
        sessionMapper.deleteById(id);
        return Result.success(null);
    }
}
