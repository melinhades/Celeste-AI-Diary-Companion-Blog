package com.mszlu.blog.service.ai.roundtable;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/**
 * RoundtableSession 运行时状态与并发原语测试。
 *
 * 锁定圆桌引擎的三个并发语义（浏览器 SSE 自动重连是真实发生的事故源）：
 * 1. 引擎单次启动闸门：无论多少连接触发，run 只允许进入一次；
 * 2. owner 连接代际：重连后旧连接的 onError 不得误杀新连接；
 * 3. 插话队列 / 停止标记 / 逐字稿计数的基本契约。
 */
class RoundtableSessionTest {

    // ================= 引擎单次启动闸门 =================

    @Test
    void tryStartEngine_firstWins_restFail() {
        RoundtableSession s = new RoundtableSession();
        assertTrue(s.tryStartEngine());
        assertFalse(s.tryStartEngine());
        assertFalse(s.tryStartEngine());
    }

    @Test
    void tryStartEngine_concurrent_exactlyOneWinner() throws Exception {
        RoundtableSession s = new RoundtableSession();
        int threads = 16;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger winners = new AtomicInteger(0);

        for (int i = 0; i < threads; i++) {
            new Thread(() -> {
                try {
                    start.await();
                    if (s.tryStartEngine()) winners.incrementAndGet();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();

        assertEquals(1, winners.get(), "并发抢引擎闸门，恰好一个线程获胜（杜绝重连重播整场讨论）");
    }

    // ================= owner 连接代际 =================

    @Test
    void attachOwner_incrementsGeneration_andMarksConnected() {
        RoundtableSession s = new RoundtableSession();
        assertTrue(s.isOwnerConnected(), "初始默认在线");

        int g1 = s.attachOwner();
        int g2 = s.attachOwner();
        assertTrue(g2 > g1, "每次（重）连接代际 +1");
        assertTrue(s.isOwnerConnected());
    }

    @Test
    void detachOwner_currentGeneration_disconnects() {
        RoundtableSession s = new RoundtableSession();
        int g = s.attachOwner();
        s.detachOwner(g);
        assertFalse(s.isOwnerConnected());
    }

    @Test
    void detachOwner_staleGeneration_doesNotKillNewConnection() {
        // 真实场景：浏览器断线自动重连（gen2 建立）后，旧连接（gen1）的 onError 才触发，
        // 旧连接的 cleanup 无权宣告 owner 断线
        RoundtableSession s = new RoundtableSession();
        int g1 = s.attachOwner();
        s.attachOwner(); // gen2：重连成功
        s.detachOwner(g1); // 旧连接的迟到 cleanup
        assertTrue(s.isOwnerConnected(), "旧连接 cleanup 不得误杀重连后的新连接");
    }

    @Test
    void detachOwner_afterDetach_reattachRecovers() {
        RoundtableSession s = new RoundtableSession();
        int g1 = s.attachOwner();
        s.detachOwner(g1);
        assertFalse(s.isOwnerConnected());
        s.attachOwner();
        assertTrue(s.isOwnerConnected());
    }

    // ================= 插话队列 =================

    @Test
    void interjections_fifoDrain() {
        RoundtableSession s = new RoundtableSession();
        s.getInterjections().offer("第一句");
        s.getInterjections().offer("第二句");

        assertEquals("第一句", s.getInterjections().poll());
        assertEquals("第二句", s.getInterjections().poll());
        assertNull(s.getInterjections().poll(), "drain 完后为空");
    }

    // ================= 停止标记 =================

    @Test
    void stopRequested_defaultFalse_setTrueReflects() {
        RoundtableSession s = new RoundtableSession();
        assertFalse(s.isStopRequested());
        s.getStopRequested().set(true);
        assertTrue(s.isStopRequested());
    }

    // ================= 逐字稿 =================

    @Test
    void addSpeech_appendsAllFields_andCounts() {
        RoundtableSession s = new RoundtableSession();
        assertEquals(0, s.getSpeechCount());
        assertEquals("RUNNING", s.getStatus());

        s.addSpeech("madeline", "Madeline", "#ff6b6b", "ai", "先定第一步");
        s.addSpeech("user", "你", "#ffe36d", "user", "我补充一下");

        assertEquals(2, s.getSpeechCount());
        assertEquals(2, s.getTranscript().size());

        Map<String, Object> m = s.getTranscript().get(1);
        assertEquals("user", m.get("speakerId"));
        assertEquals("你", m.get("name"));
        assertEquals("#ffe36d", m.get("color"));
        assertEquals("user", m.get("role"));
        assertEquals("我补充一下", m.get("content"));
        assertNotNull(m.get("ts"));
    }

    // ================= 滚动摘要默认值 =================

    @Test
    void rollingSummary_defaults() {
        RoundtableSession s = new RoundtableSession();
        assertEquals("", s.getRollingSummary());
        assertEquals(0, s.getSummarizedUpTo());
    }
}
