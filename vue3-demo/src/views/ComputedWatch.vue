<script setup>
// 计算属性与侦听器：演示 computed 与 watch 的区别
import { ref, computed, watch } from 'vue'

const firstName = ref('张')
const lastName = ref('三')

// computed：基于已有响应式数据计算出新值，有缓存
const fullName = computed(() => `${firstName.value}${lastName.value}`)

// 可写 computed（get/set）
const fullNameWritable = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (val) => {
    const [f, l] = val.split(' ')
    firstName.value = f
    lastName.value = l
  }
})

// watch：侦听数据变化执行副作用
const keyword = ref('')
const logList = ref([])
watch(keyword, (newVal, oldVal) => {
  logList.value.unshift(`搜索词从 "${oldVal}" 变为 "${newVal}"`)
})

// watch 侦听多个源，使用 getter 侦听对象属性
const searchCount = ref(0)
const triggerSearch = () => {
  searchCount.value++
}
watch([keyword, searchCount], ([kw, cnt]) => {
  logList.value.unshift(`[搜索] 关键词="${kw}" 第 ${cnt} 次`)
})
</script>

<template>
  <div>
    <h1 class="page-title">计算属性 & 侦听器</h1>
    <p class="page-desc">
      <code class="inline">computed</code> 用于衍生数据（有缓存），<code class="inline">watch</code> 用于数据变化时执行副作用。
    </p>

    <!-- computed 示例 -->
    <div class="card">
      <h3>1. computed 计算属性</h3>
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <input class="input" v-model="firstName" placeholder="姓" style="max-width: 120px;" />
        <input class="input" v-model="lastName" placeholder="名" style="max-width: 120px;" />
      </div>
      <p>全名（计算得到）：<span class="tag">{{ fullName }}</span></p>
      <pre class="code">const fullName = computed(() => firstName.value + lastName.value)
// 模板中直接使用 {{ fullName }}，会自动缓存，依赖不变不重算</pre>
    </div>

    <!-- 可写 computed -->
    <div class="card">
      <h3>2. 可写 computed（get/set）</h3>
      <input class="input" v-model="fullNameWritable" placeholder="输入：姓 名" style="max-width: 240px;" />
      <p style="margin-top: 8px;">当前姓：{{ firstName }} ｜ 当前名：{{ lastName }}</p>
      <pre class="code">const fullNameWritable = computed({
  get: () => firstName.value + ' ' + lastName.value,
  set: (val) => { [firstName, lastName] = val.split(' ') }
})</pre>
    </div>

    <!-- watch 示例 -->
    <div class="card">
      <h3>3. watch 侦听器</h3>
      <input class="input" v-model="keyword" placeholder="输入搜索词试试看" />
      <div style="margin: 10px 0;">
        <button class="btn btn-primary" @click="triggerSearch">触发搜索</button>
      </div>
      <div style="max-height: 180px; overflow-y: auto; background: #f9fafb; border-radius: 6px; padding: 8px;">
        <p v-for="(log, i) in logList" :key="i" style="font-size: 13px; color: #6b7280;">
          {{ log }}
        </p>
        <p v-if="logList.length === 0" style="font-size: 13px; color: #9ca3af;">暂无日志，输入搜索词或点击按钮试试</p>
      </div>
      <pre class="code">watch(keyword, (newVal, oldVal) => {
  console.log('变化了', oldVal, '->', newVal)
})</pre>
    </div>
  </div>
</template>
