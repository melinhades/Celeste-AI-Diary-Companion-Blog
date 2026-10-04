package com.mszlu.blog.service.ai.roundtable;

import lombok.Getter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 单场圆桌会议的事件扇出总线。
 *
 * owner 与任意数量观察者都作为 SseEmitter 订阅；广播时遍历全部订阅者，
 * 发送失败（连接已死）的订阅者被自动摘除，观察者计数同步更新。
 * 用 CopyOnWriteArrayList 保证快照与广播并发安全。
 */
public class SessionBus {

    private static class Subscriber {
        final SseEmitter emitter;
        final boolean observer;
        Subscriber(SseEmitter emitter, boolean observer) { this.emitter = emitter; this.observer = observer; }
    }

    private final RoundtableSession session;
    private final CopyOnWriteArrayList<Subscriber> subscribers = new CopyOnWriteArrayList<>();
    private final AtomicInteger observerCount = new AtomicInteger(0);

    public SessionBus(RoundtableSession session) {
        this.session = session;
    }

    public void subscribe(SseEmitter emitter, boolean isObserver) {
        Subscriber s = new Subscriber(emitter, isObserver);
        subscribers.add(s);
        if (isObserver) observerCount.incrementAndGet();
        Runnable cleanup = () -> remove(s);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(t -> cleanup.run());
    }

    private void remove(Subscriber s) {
        if (subscribers.remove(s) && s.observer) {
            observerCount.decrementAndGet();
        }
    }

    public int broadcast(String eventName, Object payload) {
        int failed = 0;
        for (Subscriber s : subscribers) {
            try {
                s.emitter.send(SseEmitter.event().name(eventName).data(payload));
            } catch (IOException | IllegalStateException ex) {
                remove(s);
                failed++;
            }
        }
        return failed;
    }

    public int observerCount() {
        return observerCount.get();
    }

    public int subscriberCount() {
        return subscribers.size();
    }

    /**
     * 观察者加入时的回放快照：transcript 副本 + 最近一次 pulse。
     */
    public BusSnapshot snapshot() {
        return new BusSnapshot(
                new ArrayList<>(session.getTranscript()),
                session.getLastPulse(),
                session.getId(),
                session.getTopic()
        );
    }

    /** 不可变回放快照 */
    @Getter
    public static class BusSnapshot {
        private final List<Map<String, Object>> transcript;
        private final Map<String, Object> lastPulse;
        private final String sessionId;
        private final String topic;

        public BusSnapshot(List<Map<String, Object>> transcript, Map<String, Object> lastPulse,
                           String sessionId, String topic) {
            this.transcript = Collections.unmodifiableList(transcript);
            this.lastPulse = lastPulse;
            this.sessionId = sessionId;
            this.topic = topic;
        }
    }
}
