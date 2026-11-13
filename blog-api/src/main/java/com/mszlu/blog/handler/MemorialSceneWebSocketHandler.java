package com.mszlu.blog.handler;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 铭记页多人同屏的 WebSocket 通道（纯内存，不落库）。
 *
 * <p>聊天、在线数仍走 {@code RealtimeChatController} 的 SSE；这里只负责“场景位置”：
 * 客户端 10Hz 上报位置，服务端用单调度线程 10Hz 聚合广播，每个连接一个有界队列，
 * 慢客户端丢旧帧而不是阻塞 tick 线程。</p>
 *
 * <p>只有握手时带 {@code scene=memorial} 的连接会进入同屏名单；只开聊天页的用户不会出现。</p>
 */
@Component
@Slf4j
public class MemorialSceneWebSocketHandler extends TextWebSocketHandler {

    /** 同屏精细 ghost 上限，超出进观众模式（仍可聊天/发表情） */
    public static final int MAX_PLAYERS = 30;
    /** 与前端 BOUND 保持一致 */
    private static final double X_MIN = -304, X_MAX = 304, Y_MIN = -288, Y_MAX = 48;
    /** 每个连接最多积压 8 帧，超出丢最旧（10Hz 下约 0.8s） */
    private static final int QUEUE_CAPACITY = 8;
    /** 单个连接每秒最多 25 条上行，超出丢弃 */
    private static final int MAX_MSG_PER_SECOND = 25;
    /** 8 秒一次应用层 ping；25 秒没任何消息视为掉线（满足“心跳失败 25 秒内移除”） */
    private static final long PING_INTERVAL_MS = 8_000;
    private static final long STALE_MS = 25_000;

    private final Map<String, SceneClient> sessions = new ConcurrentHashMap<>();
    /** userId -> 该账号“玩家”角色的 ws sessionId（同账号多标签页只有第一个是玩家） */
    private final Map<String, String> playerSessionByUser = new ConcurrentHashMap<>();
    /** userId -> 最后一次位置；只保存玩家，观众不写入 */
    private final Map<String, PlayerState> positions = new ConcurrentHashMap<>();
    /** 广播序号，客户端可用来丢弃乱序帧 */
    private final AtomicLong seq = new AtomicLong();
    /** tick 计数，用来按固定节奏发 ping（避免依赖 System.currentTimeMillis 取模） */
    private long tickCount;

    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "memorial-scene-tick");
        t.setDaemon(true);
        return t;
    });

    /**
     * 发送线程池：tick 只入队，真正的 socket 写入在这里做。
     * 固定 4 个线程，慢客户端最多占用一个线程，不会阻塞 10Hz tick。
     */
    private final java.util.concurrent.ExecutorService senderPool = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "memorial-scene-sender");
        t.setDaemon(true);
        return t;
    });

    @PostConstruct
    public void start() {
        ticker.scheduleAtFixedRate(this::tickSafely, 100, 100, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void stop() {
        ticker.shutdownNow();
        senderPool.shutdownNow();
        for (SceneClient c : sessions.values()) {
            closeQuietly(c);
        }
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        Map<String, Object> attrs = session.getAttributes();
        String userId = String.valueOf(attrs.get("userId"));
        String name = String.valueOf(attrs.getOrDefault("name", userId));
        boolean scene = Boolean.TRUE.equals(attrs.get("scene"));
        if (!scene) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("scene required"));
            return;
        }

        SceneClient client = new SceneClient(session, userId, name);
        // 一个账号只允许一个 ghost：已有玩家会话 → 这个标签页当观众。
        // putIfAbsent 保证同一账号多标签页同时连接时也只有一个能抢到玩家位。
        boolean alreadyPlayer = playerSessionByUser.containsKey(userId);
        boolean full = positions.size() >= MAX_PLAYERS;
        boolean acquired = false;
        if (!alreadyPlayer && !full) {
            alreadyPlayer = playerSessionByUser.putIfAbsent(userId, session.getId()) != null;
            acquired = !alreadyPlayer;
        }
        client.spectator = alreadyPlayer || full;
        client.reason = alreadyPlayer ? "duplicate" : (full ? "full" : null);

        sessions.put(session.getId(), client);
        if (acquired) {
            // 先放在出生点，客户端第一条 pos 会立刻纠正
            positions.put(userId, new PlayerState(0, 0, 1, 0));
        }
        // 先发 welcome，再发 roster：客户端必须先知道 selfId，才不会把自己也建成 ghost
        sendWelcome(client);
        broadcastRoster();
        log.info("memorial-scene connected user={} role={} online={}", userId,
                client.spectator ? "spectator" : "player", positions.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        SceneClient client = sessions.get(session.getId());
        if (client == null) return;
        client.lastSeen = System.currentTimeMillis();

        // 超频保护：按 1 秒窗口计数，超出直接丢弃
        long now = client.lastSeen;
        if (now - client.rateWindowStart >= 1000) {
            client.rateWindowStart = now;
            client.rateCount = 0;
        }
        if (++client.rateCount > MAX_MSG_PER_SECOND) return;

        String payload = message.getPayload();
        if (payload == null || payload.isEmpty() || payload.length() > 2048) return;
        JSONObject obj;
        try {
            obj = JSON.parseObject(payload);
        } catch (Exception e) {
            return;
        }
        if (obj == null) return;

        String type = obj.getString("type");
        if ("pong".equals(type)) {
            return;   // lastSeen 已更新
        }
        if ("hello".equals(type)) {
            // bfcache 回来 / 断线重连后尝试从观众恢复成玩家
            maybePromote(client);
            sendWelcome(client);
            return;
        }
        if ("leave".equals(type)) {
            leave(client);
            return;
        }
        if (!"pos".equals(type)) return;

        // 观众不上报位置；如果之前被 leave 降级，先尝试恢复
        if (client.spectator) {
            if (!maybePromote(client)) return;
        }

        double x = obj.getDoubleValue("x");
        double y = obj.getDoubleValue("y");
        if (!Double.isFinite(x) || !Double.isFinite(y)) return;
        x = Math.max(X_MIN, Math.min(X_MAX, x));
        y = Math.max(Y_MIN, Math.min(Y_MAX, y));
        int f = obj.getIntValue("f") >= 0 ? 1 : -1;
        int a = Math.max(0, Math.min(3, obj.getIntValue("a")));
        positions.put(client.userId, new PlayerState(x, y, f, a));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        SceneClient client = sessions.remove(session.getId());
        if (client == null) return;
        if (!client.spectator) {
            playerSessionByUser.remove(client.userId, session.getId());
            positions.remove(client.userId);
            broadcastRoster();
        }
        log.info("memorial-scene closed user={} role={}", client.userId,
                client.spectator ? "spectator" : "player");
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        closeQuietly(sessions.get(session.getId()));
    }

    /** HTTP /realtime-chat/leave 的快速通道：pagehide 时调用，先让别人立刻看不到自己 */
    public void leaveByUserId(String userId) {
        if (userId == null) return;
        String sid = playerSessionByUser.remove(userId);
        if (sid == null) return;
        SceneClient client = sessions.get(sid);
        if (client != null) client.spectator = true;
        positions.remove(userId);
        broadcastRoster();
    }

    private void leave(SceneClient client) {
        if (!client.spectator) {
            playerSessionByUser.remove(client.userId, client.session.getId());
            positions.remove(client.userId);
            client.spectator = true;
            broadcastRoster();
        }
    }

    private boolean maybePromote(SceneClient client) {
        if (!client.spectator) return true;
        if (playerSessionByUser.containsKey(client.userId)) return false;
        if (positions.size() >= MAX_PLAYERS) return false;
        if (playerSessionByUser.putIfAbsent(client.userId, client.session.getId()) != null) return false;
        client.spectator = false;
        client.reason = null;
        positions.put(client.userId, new PlayerState(0, 0, 1, 0));
        broadcastRoster();
        return true;
    }

    private void sendWelcome(SceneClient client) {
        JSONObject o = new JSONObject();
        o.put("type", "welcome");
        o.put("selfId", client.userId);
        o.put("name", client.name);
        o.put("role", client.spectator ? "spectator" : "player");
        if (client.reason != null) o.put("reason", client.reason);
        o.put("max", MAX_PLAYERS);
        o.put("online", positions.size());
        enqueue(client, o.toJSONString());
    }

    private void broadcastRoster() {
        JSONArray arr = new JSONArray();
        List<SceneClient> players = new ArrayList<>();
        for (SceneClient c : sessions.values()) {
            if (!c.spectator) players.add(c);
        }
        // 稳定顺序，方便客户端做 diff；同一 userId 只出现一次（多标签页/并发连接兜底）
        players.sort(Comparator.comparing(c -> c.userId));
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (SceneClient c : players) {
            if (!seen.add(c.userId)) continue;
            JSONObject o = new JSONObject();
            o.put("id", c.userId);
            o.put("n", c.name);
            arr.add(o);
        }
        JSONObject payload = new JSONObject();
        payload.put("type", "roster");
        payload.put("p", arr);
        payload.put("max", MAX_PLAYERS);
        String json = payload.toJSONString();
        for (SceneClient c : sessions.values()) enqueue(c, json);
    }

    private void tickSafely() {
        try {
            tick();
        } catch (Exception e) {
            log.warn("memorial-scene tick failed", e);
        }
    }

    private void tick() {
        long now = System.currentTimeMillis();
        long currentSeq = seq.incrementAndGet();
        tickCount++;

        // 每 20 秒一次应用层 ping；65 秒没有任何消息的连接直接关掉
        boolean ping = tickCount % (PING_INTERVAL_MS / 100) == 0;
        for (SceneClient c : sessions.values()) {
            if (now - c.lastSeen > STALE_MS) {
                closeQuietly(c);
                continue;
            }
            if (ping) {
                JSONObject p = new JSONObject();
                p.put("type", "ping");
                p.put("t", now);
                enqueue(c, p.toJSONString());
            }
        }

        if (positions.isEmpty()) return;

        // 全量快照：30 人时约 0.7KB/帧，10Hz 完全在预算内；实现简单且天然容错
        JSONArray all = new JSONArray(positions.size());
        for (Map.Entry<String, PlayerState> e : positions.entrySet()) {
            PlayerState p = e.getValue();
            JSONArray row = new JSONArray(5);
            row.add(e.getKey());
            row.add(Math.round(p.x * 100.0) / 100.0);
            row.add(Math.round(p.y * 100.0) / 100.0);
            row.add(p.facing);
            row.add(p.anim);
            all.add(row);
        }
        for (SceneClient c : sessions.values()) {
            JSONArray visible = all;
            // 不把自己的位置发回去，省一点且避免前端自我覆盖
            if (!c.spectator) {
                visible = new JSONArray(all.size());
                for (int i = 0; i < all.size(); i++) {
                    JSONArray row = all.getJSONArray(i);
                    if (!c.userId.equals(row.getString(0))) visible.add(row);
                }
            }
            JSONObject payload = new JSONObject();
            payload.put("type", "pos");
            payload.put("seq", currentSeq);
            payload.put("p", visible);
            enqueue(c, payload.toJSONString());
        }
    }

    private void enqueue(SceneClient client, String msg) {
        if (client == null || !client.session.isOpen()) return;
        if (!client.queue.offer(msg)) {
            client.queue.poll();
            client.queue.offer(msg);
        }
        drain(client);
    }

    /**
     * 每连接串行发送：同一时刻只有一个 drain 任务在跑，tick 线程只做入队，不会阻塞。
     */
    private void drain(SceneClient client) {
        if (!client.sending.compareAndSet(false, true)) return;
        senderPool.execute(() -> {
            try {
                while (true) {
                    String msg = client.queue.poll();
                    if (msg == null || !client.session.isOpen()) break;
                    client.session.sendMessage(new TextMessage(msg));
                }
            } catch (Exception e) {
                closeQuietly(client);
            } finally {
                client.sending.set(false);
                if (!client.queue.isEmpty() && client.session.isOpen()) {
                    drain(client);
                }
            }
        });
    }

    private void closeQuietly(SceneClient client) {
        if (client == null) return;
        boolean removed = sessions.remove(client.session.getId(), client);
        boolean wasPlayer = removed && !client.spectator;
        if (!client.spectator) {
            playerSessionByUser.remove(client.userId, client.session.getId());
            positions.remove(client.userId);
        }
        try {
            if (client.session.isOpen()) client.session.close(CloseStatus.SERVER_ERROR);
        } catch (Exception ignored) {
            // 关闭过程抛异常（底层连接已断开），此处无需处理：会话引用已从 sessions 移除
        }
        // 心跳超时/写失败时不会走 afterConnectionClosed（会话已被这里移除），
        // 必须主动广播一次 roster，否则其他人会一直看到这个 ghost
        if (wasPlayer) broadcastRoster();
    }

    private static final class SceneClient {
        final WebSocketSession session;
        final String userId;
        final String name;
        final ArrayBlockingQueue<String> queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
        final AtomicBoolean sending = new AtomicBoolean(false);
        boolean spectator;
        String reason;
        long lastSeen = System.currentTimeMillis();
        long rateWindowStart = System.currentTimeMillis();
        int rateCount;

        SceneClient(WebSocketSession session, String userId, String name) {
            this.session = session;
            this.userId = userId;
            this.name = name;
        }
    }

    private static final class PlayerState {
        final double x;
        final double y;
        final int facing;
        final int anim;

        PlayerState(double x, double y, int facing, int anim) {
            this.x = x;
            this.y = y;
            this.facing = facing;
            this.anim = anim;
        }
    }
}
