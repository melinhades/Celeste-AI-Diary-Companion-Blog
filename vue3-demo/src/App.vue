<script setup>
// App.vue：应用根组件，包含导航栏和路由出口
import { RouterLink, RouterView } from 'vue-router'
import { ref } from 'vue'

const menus = [
  { to: '/', label: '首页' },
  { to: '/reactive', label: '响应式' },
  { to: '/computed-watch', label: '计算/侦听' },
  { to: '/lifecycle', label: '生命周期' },
  { to: '/components', label: '组件通信' },
  { to: '/forms', label: '表单' },
  { to: '/about', label: '关于' }
]

// 移动端菜单开关
const menuOpen = ref(false)
const toggleMenu = () => (menuOpen.value = !menuOpen.value)
</script>

<template>
  <div class="app">
    <header class="navbar">
      <div class="nav-brand">
        <span class="logo">⚡</span>
        <span class="brand-text">Vue3 基础 Demo</span>
      </div>

      <!-- 移动端汉堡按钮 -->
      <button class="menu-btn" @click="toggleMenu" aria-label="切换菜单">
        <span></span><span></span><span></span>
      </button>

      <nav class="nav-links" :class="{ open: menuOpen }">
        <RouterLink
          v-for="m in menus"
          :key="m.to"
          :to="m.to"
          class="nav-link"
          @click="menuOpen = false"
        >
          {{ m.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <footer class="footer">
      <p>基于 Vue3 + Vue Router + Vite 构建 · 用于学习 Vue3 基础知识</p>
    </footer>
  </div>
</template>
