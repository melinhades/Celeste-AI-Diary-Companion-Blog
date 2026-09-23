// Render 免费版实例 15 分钟无访问会休眠，导致下一个访客遭遇 503/连接被掐。
// 此 Worker 每 5 分钟被 Cloudflare Cron 触发一次，访问后端健康检查接口保持实例常驻。
const TARGET = "https://api.instapix.icu/actuator/health";

export default {
  // 定时触发（见 wrangler.jsonc 的 crons）
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping());
  },
  // 手动访问 keepalive.instapix.icu 也会触发一次 ping，便于验证
  async fetch() {
    const result = await ping();
    return new Response(result, { headers: { "Content-Type": "text/plain" } });
  },
};

async function ping() {
  try {
    const res = await fetch(TARGET, { cf: { cacheTtl: 0, cacheEverything: false } });
    return `keepalive -> health ${res.status}`;
  } catch (e) {
    return `keepalive error: ${e.message}`;
  }
}
