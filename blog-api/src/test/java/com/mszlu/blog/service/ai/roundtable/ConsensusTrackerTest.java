package com.mszlu.blog.service.ai.roundtable;

import com.mszlu.blog.service.ai.AiClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ConsensusTrackerTest {

    private AiClient aiClient;
    private ConsensusTracker tracker;
    private RoundtableSession session;

    @BeforeEach
    void setUp() {
        aiClient = mock(AiClient.class);
        tracker = new ConsensusTracker(aiClient);
        session = new RoundtableSession();
        session.setTopic("拖延症怎么办");
    }

    private void sp(String id, String name, String content) {
        session.addSpeech(id, name, "#fff", "ai", content);
    }

    @Test
    void validJson_populatesConsensusDisagreementsFocus() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(
                "{\"consensus\":[\"先接纳情绪再行动\"],\"disagreements\":[\"是否该靠外部压力\"],\"focusPoint\":\"接纳情绪\",\"consensusScore\":72}");
        sp("madeline", "玛德琳", "我觉得先接纳情绪");
        sp("theo", "西奥", "同意，先接纳");

        Map<String, Object> pulse = tracker.update(session);
        assertEquals(1, ((java.util.List<?>) pulse.get("consensus")).size());
        assertEquals("接纳情绪", pulse.get("focusPoint"));
        assertEquals(72, ((Number) pulse.get("consensusScore")).intValue());
    }

    @Test
    void aiNull_fallbackDetectsAgreementAndDisagreement() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(null);
        sp("madeline", "玛德琳", "先接纳情绪再行动");
        sp("theo", "西奥", "同意，接纳情绪是第一步");
        sp("badeline", "暗面琳", "但是靠外部压力也有用");

        Map<String, Object> pulse = tracker.update(session);
        assertNotNull(pulse.get("focusPoint"));
        assertFalse(((java.util.List<?>) pulse.get("consensus")).isEmpty());
    }

    @Test
    void brokenJson_fallback() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn("<<<not json");
        sp("madeline", "玛德琳", "行动起来");
        Map<String, Object> pulse = tracker.update(session);
        assertNotNull(pulse.get("consensus"));
        assertNotNull(pulse.get("disagreements"));
        assertNotNull(pulse.get("focusPoint"));
    }

    @Test
    void emptyTranscript_returnsEmptyPulse() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn("{}");
        Map<String, Object> pulse = tracker.update(session);
        assertNotNull(pulse.get("consensus"));
    }
}
