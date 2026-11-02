# Checklist

## Phase 1

- [x] C1 后端草莓改动编译通过，正向 delta 被拒绝，负向消费有余额条件
- [x] C2 前端无正向 delta 调用，日记/草莓籽改为服务端权威奖励
- [x] C3 article.html 引入 purify，article.js 在 v-html 前清洗
- [x] C4 auth.js 使用 api('/logout')，无 localhost 硬编码
- [x] C5 Phase 1 全部 JS 通过 node --check，静态核对通过

## Phase 2

- [x] C6 CacheAspect 编译通过，业务异常不再被吞成 -999
- [x] C7 Redis 不可用模拟下，文章列表/热门/最新/归档返回数据
- [x] C8 blog.cache.enabled=false 降级开关生效
