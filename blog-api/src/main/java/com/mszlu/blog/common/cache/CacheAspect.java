package com.mszlu.blog.common.cache;

import com.alibaba.fastjson.JSON;
import com.mszlu.blog.vo.Result;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.codec.digest.DigestUtils;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 文章读缓存切面：Redis 只作为加速层，任何缓存异常/超时都 fail-open 回源数据库。
 * 鉴权、限流、分布式锁等安全相关 Redis 依赖不使用本切面，保持 fail-closed。
 */
@Aspect
@Component
@Slf4j
public class CacheAspect {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    /** Micrometer 可选依赖：未引入时只打日志，不影响运行 */
    @Autowired
    private ObjectProvider<MeterRegistry> meterRegistryProvider;

    @Value("${blog.cache.enabled:true}")
    private boolean cacheEnabled;

    @Value("${blog.cache.redis-timeout-ms:300}")
    private long redisTimeoutMs;

    @Value("${blog.cache.failure-threshold:3}")
    private int failureThreshold;

    @Value("${blog.cache.open-duration-ms:30000}")
    private long openDurationMs;

    /** 连续失败计数与熔断打开截止时间（单实例内存态） */
    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private volatile long circuitOpenUntil = 0L;

    /** key 级防击穿锁：同一 key 只让一个请求查库并回填，其余请求直接查库 */
    private final ConcurrentHashMap<String, ReentrantLock> keyLocks = new ConcurrentHashMap<>();

    /**
     * 缓存 IO 独立守护线程池：与请求线程隔离，Future.get 实现短超时。
     * 有界队列 + AbortPolicy：队列满时直接视为缓存不可用，不阻塞请求。
     */
    private final ExecutorService cacheExecutor = new ThreadPoolExecutor(
            2, 2, 0L, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(64),
            r -> {
                Thread t = new Thread(r, "blog-cache-io");
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.AbortPolicy());

    @Pointcut("@annotation(com.mszlu.blog.common.cache.Cache)")
    public void pt() {
    }

    @Around("pt()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        Cache annotation = findCacheAnnotation(pjp);
        // 开关关闭 / 取不到注解：完全绕过缓存，直接执行业务
        if (annotation == null || !cacheEnabled) {
            return pjp.proceed();
        }
        if (isCircuitOpen()) {
            recordMetric(annotation.name(), "circuit_open");
            return pjp.proceed();
        }

        String key = buildKey(pjp, annotation);
        if (key == null) {
            return pjp.proceed();
        }

        Class<?> returnType = ((MethodSignature) pjp.getSignature()).getMethod().getReturnType();
        Object cached = readCache(annotation.name(), key, returnType);
        if (cached != null) {
            recordMetric(annotation.name(), "hit");
            return cached;
        }

        ReentrantLock lock = keyLocks.computeIfAbsent(key, k -> new ReentrantLock());
        boolean locked = false;
        try {
            locked = lock.tryLock(50, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        Object result;
        try {
            // 注意：业务调用不放在缓存 catch 内，DB/业务异常继续抛给全局异常处理器
            result = pjp.proceed();
        } finally {
            if (locked) {
                lock.unlock();
                keyLocks.remove(key, lock);
            }
        }

        // 只缓存非 null 且 Result.success == true 的结果；拿不到锁的请求不回填
        if (locked && isCacheable(result)) {
            writeBackAsync(annotation.name(), key, annotation.expire(), result);
        }
        recordMetric(annotation.name(), "miss");
        return result;
    }

    /** 用 MethodSignature + 最具体方法 + AnnotationUtils 解析，避免 JDK 代理下取不到接口方法注解 */
    private Cache findCacheAnnotation(ProceedingJoinPoint pjp) {
        MethodSignature signature = (MethodSignature) pjp.getSignature();
        Method method = signature.getMethod();
        Class<?> targetClass = pjp.getTarget() == null ? method.getDeclaringClass() : pjp.getTarget().getClass();
        Method specificMethod = AopUtils.getMostSpecificMethod(method, targetClass);
        return AnnotationUtils.findAnnotation(specificMethod, Cache.class);
    }

    private String buildKey(ProceedingJoinPoint pjp, Cache annotation) {
        try {
            StringBuilder params = new StringBuilder();
            for (Object arg : pjp.getArgs()) {
                if (arg != null) {
                    params.append(JSON.toJSONString(arg));
                }
            }
            String paramsKey = params.length() == 0 ? "" : DigestUtils.md5Hex(params.toString());
            String className = pjp.getTarget() == null ? "" : pjp.getTarget().getClass().getSimpleName();
            return annotation.name() + "::" + className + "::" + pjp.getSignature().getName() + "::" + paramsKey;
        } catch (Exception e) {
            log.warn("缓存 key 构建失败，跳过缓存", e);
            return null;
        }
    }

    /**
     * 读缓存：异常/超时只标记失败并返回 null（调用方随后查库），绝不向上抛。
     * 成功读到 null 也说明 Redis 健康，重置连续失败计数。
     */
    private Object readCache(String cacheName, String key, Class<?> returnType) {
        String value;
        try {
            value = redisGet(key);
            consecutiveFailures.set(0);
        } catch (Exception e) {
            markCacheFailure("读取", cacheName, e);
            return null;
        }

        if (value == null || "null".equals(value)) {
            if ("null".equals(value)) {
                deleteCacheQuietly(key);
            }
            return null;
        }
        try {
            Object parsed = JSON.parseObject(value, returnType);
            if (parsed == null) {
                deleteCacheQuietly(key);
            }
            return parsed;
        } catch (Exception e) {
            log.warn("缓存值反序列化失败，按未命中处理 cache={} key={}", cacheName, key, e);
            recordMetric(cacheName, "error");
            deleteCacheQuietly(key);
            return null;
        }
    }

    /** 独立线程池执行 Redis get，Future.get 实现短超时；超时取消任务并按未命中处理 */
    private String redisGet(String key) throws Exception {
        Future<String> future = cacheExecutor.submit(() -> redisTemplate.opsForValue().get(key));
        try {
            return future.get(redisTimeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw e;
        }
    }

    /** 异步回填：失败只记日志/指标，不影响本次响应；熔断打开时不再回填 */
    private void writeBackAsync(String cacheName, String key, long expireMs, Object result) {
        if (isCircuitOpen()) {
            return;
        }
        try {
            cacheExecutor.execute(() -> {
                try {
                    redisTemplate.opsForValue().set(key, JSON.toJSONString(result), Duration.ofMillis(expireMs));
                    consecutiveFailures.set(0);
                } catch (Exception e) {
                    markCacheFailure("回填", cacheName, e);
                }
            });
        } catch (RejectedExecutionException e) {
            log.warn("缓存回填任务被拒绝，跳过回填 cache={}", cacheName);
            recordMetric(cacheName, "error");
        }
    }

    private boolean isCacheable(Object result) {
        if (result == null) {
            return false;
        }
        if (result instanceof Result) {
            return ((Result) result).isSuccess();
        }
        return true;
    }

    private boolean isCircuitOpen() {
        long until = circuitOpenUntil;
        if (until == 0L) {
            return false;
        }
        if (System.currentTimeMillis() < until) {
            return true;
        }
        // 熔断到期：半开恢复，允许下一次试探
        circuitOpenUntil = 0L;
        consecutiveFailures.set(0);
        log.info("文章读缓存熔断关闭，恢复缓存读写");
        return false;
    }

    private void markCacheFailure(String op, String cacheName, Exception e) {
        int failures = consecutiveFailures.incrementAndGet();
        log.warn("文章读缓存{}失败，fail-open 回源数据库 cache={} failures={}/{}",
                op, cacheName, failures, failureThreshold, e);
        recordMetric(cacheName, "error");
        if (failures >= failureThreshold) {
            circuitOpenUntil = System.currentTimeMillis() + openDurationMs;
            log.warn("文章读缓存熔断打开 {}ms：期间跳过全部缓存读写，直接查数据库", openDurationMs);
        }
    }

    /** 坏 key 尽力异步删除；失败只记日志 */
    private void deleteCacheQuietly(String key) {
        try {
            cacheExecutor.execute(() -> {
                try {
                    redisTemplate.delete(key);
                } catch (Exception e) {
                    log.warn("缓存坏值删除失败 key={}", key, e);
                }
            });
        } catch (RejectedExecutionException ignored) {
            // 线程池饱和时不删除，不影响业务
        }
    }

    /** Micrometer 存在时记录 blog.cache.requests；不存在时静默 */
    private void recordMetric(String cacheName, String outcome) {
        MeterRegistry registry = meterRegistryProvider.getIfAvailable();
        if (registry == null) {
            return;
        }
        try {
            registry.counter("blog.cache.requests", "cache", cacheName, "outcome", outcome).increment();
        } catch (Exception ignored) {
            // 指标失败不影响业务
        }
    }

    @PreDestroy
    public void shutdown() {
        cacheExecutor.shutdownNow();
    }
}
