import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'

// 路由配置：使用 Hash 模式，避免部署时需要服务器配置 history 回退
const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: '首页' }
  },
  {
    path: '/reactive',
    name: 'Reactive',
    component: () => import('../views/Reactive.vue'),
    meta: { title: '响应式' }
  },
  {
    path: '/computed-watch',
    name: 'ComputedWatch',
    component: () => import('../views/ComputedWatch.vue'),
    meta: { title: '计算属性与侦听器' }
  },
  {
    path: '/lifecycle',
    name: 'Lifecycle',
    component: () => import('../views/Lifecycle.vue'),
    meta: { title: '生命周期' }
  },
  {
    path: '/components',
    name: 'Components',
    component: () => import('../views/Components.vue'),
    meta: { title: '组件通信' }
  },
  {
    path: '/forms',
    name: 'Forms',
    component: () => import('../views/Forms.vue'),
    meta: { title: '表单与 v-model' }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('../views/About.vue'),
    meta: { title: '关于' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 全局前置守卫：动态修改页面标题
router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - Vue3 Demo` : 'Vue3 Demo'
  next()
})

export default router
