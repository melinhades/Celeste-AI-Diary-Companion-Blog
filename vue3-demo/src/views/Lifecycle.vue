<script setup>
// 生命周期钩子：演示常用的生命周期
import { ref, onMounted, onUnmounted, onBeforeUnmount, onUpdated } from 'vue'

const logs = ref([])
const addLog = (msg) => logs.value.push(`${new Date().toLocaleTimeString()}  ${msg}`)

let timer = null

// 挂载完成：可以访问 DOM、发起请求、启动定时器
onMounted(() => {
  addLog('✅ onMounted：组件已挂载到 DOM')
  timer = setInterval(() => {
    // 每 2 秒记录一次，模拟心跳
  }, 2000)
})

// 更新完成：每次响应式数据变化导致 DOM 更新后触发
onUpdated(() => {
  // addLog('onUpdated：DOM 已更新')
})

// 卸载前：清理副作用
onBeforeUnmount(() => {
  addLog('⏹ onBeforeUnmount：组件即将卸载，清理定时器')
  if (timer) clearInterval(timer)
})

// 卸载完成
onUnmounted(() => {
  // 组件已从 DOM 移除
})

// 手动模拟一次数据更新来触发 onUpdated
const triggerUpdate = () => {
  addLog('🔄 手动触发响应式更新，onUpdated 会被调用')
}
</script>

<template>
  <div>
    <h1 class="page-title">生命周期钩子</h1>
    <p class="page-desc">
      Vue3 组件的主要生命周期：<code class="inline">onMounted</code> → <code class="inline">onUpdated</code> → <code class="inline">onUnmounted</code>。
      常用于：请求数据、操作 DOM、设置/清理定时器。
    </p>

    <div class="card">
      <h3>生命周期时间线</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0;">
        <span class="tag">setup()</span>
        <span class="tag">onBeforeMount</span>
        <span class="tag" style="background:#dcfce7;color:#16a34a;">onMounted</span>
        <span class="tag">onBeforeUpdate</span>
        <span class="tag">onUpdated</span>
        <span class="tag" style="background:#fee2e2;color:#dc2626;">onBeforeUnmount</span>
        <span class="tag">onUnmounted</span>
      </div>

      <button class="btn btn-primary" @click="triggerUpdate">触发一次更新</button>

      <div style="margin-top: 16px; background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; font-size: 13px; min-height: 120px;">
        <p v-for="(log, i) in logs" :key="i">{{ log }}</p>
        <p v-if="logs.length === 0" style="color:#6c7086;">等待生命周期事件...</p>
      </div>

      <pre class="code">onMounted(() => {
  // 获取数据、操作 DOM、启动定时器
})
onUnmounted(() => {
  // 清理定时器、取消订阅等副作用
})</pre>
    </div>
  </div>
</template>
