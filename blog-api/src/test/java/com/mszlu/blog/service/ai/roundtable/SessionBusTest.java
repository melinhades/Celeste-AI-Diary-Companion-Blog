package com.mszlu.blog.service.ai.roundtable;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.mockito.ArgumentCaptor;

/**
 * SessionBus 单测：扇出广播 + 断连摘除 + 观察者计数 + 快照并发安全。
 */
class SessionBusTest {

    private RoundtableSession session;
    private SessionBus bus;

    @BeforeEach
    void setUp() {
        session = new RoundtableSession();
        session.setId("sess-1");
        session.setTopic("test-topic");
        bus = session.getBus();
    }

    @Test
    void broadcast_deliversToAllLiveSubscribers_andRemovesDead() throws Exception {
        // 3 个订阅者：2 个正常，1 个 send 抛 IOException（模拟断连）
        SseEmitter live1 = mock(SseEmitter.class);
        SseEmitter live2 = mock(SseEmitter.class);
        SseEmitter dead = mock(SseEmitter.class);
        doThrow(new IOException("broken pipe")).when(dead).send(any(SseEmitter.SseEventBuilder.class));

        bus.subscribe(live1, false); // owner
        bus.subscribe(live2, true);  // observer
        bus.subscribe(dead, true);   // observer

        int failed = bus.broadcast("turn_start", java.util.Collections.singletonMap("k", "v"));

        // 活的两个都收到
        verify(live1, times(1)).send(any(SseEmitter.SseEventBuilder.class));
        verify(live2, times(1)).send(any(SseEmitter.SseEventBuilder.class));
        // 死掉的那个失败并被摘除
        assertEquals(1, failed);
        assertEquals(2, bus.subscriberCount());
        // 死掉的是 observer，observerCount 应 -1（剩 live2 一个 observer）
        assertEquals(1, bus.observerCount());
    }

    @Test
    void observerCount_tracksObserversOnly_notOwner() {
        SseEmitter owner = mock(SseEmitter.class);
        SseEmitter obs1 = mock(SseEmitter.class);
        SseEmitter obs2 = mock(SseEmitter.class);

        bus.subscribe(owner, false);
        assertEquals(0, bus.observerCount());

        bus.subscribe(obs1, true);
        bus.subscribe(obs2, true);
        assertEquals(2, bus.observerCount());

        // 捕获 obs1 的 onCompletion 回调并触发（模拟断连）
        ArgumentCaptor<Runnable> cap = ArgumentCaptor.forClass(Runnable.class);
        verify(obs1).onCompletion(cap.capture());
        cap.getValue().run();
        assertEquals(1, bus.observerCount());
    }

    @Test
    void snapshot_returnsTranscriptCopy_atJoinMoment() {
        session.addSpeech("madeline", "Madeline", "#ff6b6b", "ai", "hello");
        session.addSpeech("theo", "Theo", "#5fd38d", "ai", "hi");

        SessionBus.BusSnapshot snap = bus.snapshot();

        assertEquals(2, snap.getTranscript().size());
        assertEquals("sess-1", snap.getSessionId());
        assertEquals("test-topic", snap.getTopic());

        // 快照是副本：后续往 transcript 加内容不影响已取出的快照
        session.addSpeech("granny", "Granny", "#b18cff", "ai", "yo");
        assertEquals(2, snap.getTranscript().size());
    }

    @Test
    void snapshotAndBroadcast_concurrent_noConcurrentModification() throws Exception {
        // 预填一些 transcript
        for (int i = 0; i < 50; i++) {
            session.addSpeech("madeline", "Madeline", "#ff6b6b", "ai", "msg" + i);
        }
        SseEmitter e1 = mock(SseEmitter.class);
        SseEmitter e2 = mock(SseEmitter.class);
        bus.subscribe(e1, false);
        bus.subscribe(e2, true);

        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        AtomicInteger errors = new AtomicInteger(0);

        for (int t = 0; t < threads; t++) {
            final boolean doSnap = (t % 2 == 0);
            new Thread(() -> {
                try {
                    start.await();
                    for (int i = 0; i < 200; i++) {
                        if (doSnap) {
                            bus.snapshot();
                        } else {
                            bus.broadcast("tick", java.util.Collections.singletonMap("i", i));
                        }
                    }
                } catch (Throwable ex) {
                    errors.incrementAndGet();
                } finally {
                    done.countDown();
                }
            }).start();
        }
        start.countDown();
        done.await();

        assertEquals(0, errors.get(), "并发快照与广播不应抛出 ConcurrentModificationException");
    }
}
