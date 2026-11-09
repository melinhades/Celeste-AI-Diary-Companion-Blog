package com.mszlu.blog.vo.params;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

/**
 * 打字轨迹信号：字段与前端 js/diary.js 上送的结构一致。
 * 未上送的字段保持默认值 0，与原有 JSON 取值口径一致。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class TypingSignal {

    private int delete;

    private double pause;

    private int undo;

    private int modifyFreq;

    private double avgIntervalMs;

    private double deleteRetypeRatio;

    private double autocorrelation;

    private int eventCount;

    private List<Event> events;

    /** 按键级原始事件：{ts, action} */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Event {

        private long ts;

        private String action;
    }
}
