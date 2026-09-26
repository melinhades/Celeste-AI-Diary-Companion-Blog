<script setup>
// 首页：项目简介与知识点导航
import { RouterLink } from 'vue-router'

const topics = [
  { to: '/reactive', icon: '🎯', title: '响应式基础', desc: 'ref / reactive 响应式数据声明与使用' },
  { to: '/computed-watch', icon: '🔄', title: '计算属性 & 侦听器', desc: 'computed 与 watch 的区别和用法' },
  { to: '/lifecycle', icon: '⏱️', title: '生命周期钩子', desc: 'onMounted / onUnmounted 等常用钩子' },
  { to: '/components', icon: '🧩', title: '组件通信', desc: 'props 传递、emit 事件、插槽' },
  { to: '/forms', icon: '📝', title: '表单与 v-model', desc: '双向绑定、修饰符、自定义组件 v-model' }
]
</script>

<template>
  <div>
    <h1 class="page-title">欢迎来到 Vue3 基础知识 Demo ⚡</h1>
    <p class="page-desc">
      这是一个独立的 Vue3 小网站，使用 <code class="inline">Vue3 + Vue Router + Vite</code> 构建，
      涵盖 Vue3 常用基础知识点，每个页面都有可交互的示例。
    </p>

    <div class="grid-2">
      <RouterLink v-for="t in topics" :key="t.to" :to="t.to" class="card topic-card">
        <div class="topic-icon">{{ t.icon }}</div>
        <h3>{{ t.title }}</h3>
        <p>{{ t.desc }}</p>
      </RouterLink>
    </div>

    <div class="card" style="margin-top: 24px;">
      <h3>项目结构</h3>
      <pre class="code">vue3-demo/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.js            # 应用入口
    ├── App.vue            # 根组件（导航 + 路由出口）
    ├── router/index.js    # 路由配置
    ├── styles/global.css  # 全局样式
    ├── components/        # 可复用组件
    │   ├── Counter.vue
    │   ├── UserCard.vue
    │   └── TodoItem.vue
    └── views/             # 页面视图
        ├── Home.vue
        ├── Reactive.vue
        ├── ComputedWatch.vue
        ├── Lifecycle.vue
        ├── Components.vue
        ├── Forms.vue
        └── About.vue</pre>
    </div>
  </div>
</template>

<style scoped>
.topic-card {
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s, box-shadow 0.2s;
  display: block;
}
.topic-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}
.topic-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.topic-card h3 {
  margin-bottom: 6px;
}
.topic-card p {
  color: var(--text-light);
  font-size: 14px;
}
</style>
