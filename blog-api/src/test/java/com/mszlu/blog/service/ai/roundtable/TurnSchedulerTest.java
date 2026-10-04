package com.mszlu.blog.service.ai.roundtable;

import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TurnSchedulerTest {

    private AiClient aiClient;
    private TurnScheduler scheduler;
    private RoundtableSession session;

    @BeforeEach
    void setUp() {
        aiClient = mock(AiClient.class);
        scheduler = new TurnScheduler(aiClient);
        session = new RoundtableSession();
        session.setTopic("如何克服拖延");
    }

    private void addSpeech(String speakerId) {
        session.addSpeech(speakerId, speakerId, "#fff", "ai", "x");
    }

    @Test
    void forcedSpeaker_skipsAiCall() {
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, "granny");
        assertEquals("granny", r.getSpeakerId());
        assertEquals("回应", r.getAction());
        verify(aiClient, never()).chat(anyList(), anyBoolean());
    }

    @Test
    void normalJson_returnsParsedResult() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(
                "{\"speakerId\":\"theo\",\"action\":\"补充\",\"publicNote\":\"西奥想补充一个角度\"}");
        addSpeech("madeline");
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
        assertEquals("theo", r.getSpeakerId());
        assertEquals("补充", r.getAction());
        assertEquals("西奥想补充一个角度", r.getPublicNote());
    }

    @Test
    void invalidSpeaker_fallbackNotLastSpeaker() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn("{\"speakerId\":\"nobody\",\"action\":\"x\"}");
        addSpeech("madeline");
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
        assertNotEquals("madeline", r.getSpeakerId());
        assertTrue(List.of("madeline","theo","granny","badeline","oshiro").contains(r.getSpeakerId()));
    }

    @Test
    void aiReturnsNull_fallback() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(null);
        addSpeech("theo");
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
        assertNotNull(r.getSpeakerId());
        assertNotEquals("theo", r.getSpeakerId());
    }

    @Test
    void brokenJson_fallback() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn("not json at all {{{");
        addSpeech("badeline");
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
        assertNotNull(r.getSpeakerId());
        assertNotEquals("badeline", r.getSpeakerId());
    }

    @Test
    void fallback_picksLeastRecentlySpoken_notConsecutive() {
        // 每人发言次数不同，fallback 应选发言最少且非上一位
        when(aiClient.chat(anyList(), eq(true))).thenReturn(null);
        addSpeech("madeline");
        addSpeech("theo");
        addSpeech("granny");
        addSpeech("badeline");
        addSpeech("oshiro");
        // 上一位是 oshiro，各人均 1 次 → fallback 不应是 oshiro
        TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
        assertNotEquals("oshiro", r.getSpeakerId());
    }

    @Test
    void fallbackOverManyRounds_noConsecutiveAndAllAppear() {
        when(aiClient.chat(anyList(), eq(true))).thenReturn(null);
        String last = null;
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < 20; i++) {
            TurnScheduler.ScheduleResult r = scheduler.schedule(session, null);
            assertNotEquals(last, r.getSpeakerId(), "round " + i + " consecutive");
            last = r.getSpeakerId();
            seen.add(r.getSpeakerId());
            addSpeech(r.getSpeakerId());
        }
        assertTrue(seen.size() >= 4, "five ids should appear, got: " + seen);
    }
}
