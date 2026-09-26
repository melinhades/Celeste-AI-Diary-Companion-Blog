<script setup>
// 响应式基础：演示 ref 和 reactive 的用法
import { ref, reactive } from 'vue'

// 1. ref：用于基本类型（也可用于对象，内部会自动转为 reactive）
const count = ref(0)
const increment = () => count.value++
const decrement = () => count.value--

// 2. reactive：用于对象类型
const user = reactive({
  name: '张三',
  age: 18,
  hobbies: ['阅读', '编程']
})
const addHobby = () => {
  const newHobby = prompt('请输入新爱好', '运动')
  if (newHobby) user.hobbies.push(newHobby)
}
const grow = () => user.age++

// 3. 数组响应式
const fruits = reactive(['苹果', '香蕉', '橘子'])
const removeFruit = (index) => fruits.splice(index, 1)
const addFruit = () => {
  const f = prompt('添加水果', '葡萄')
  if (f) fruits.push(f)
}
</script>

<template>
  <div>
    <h1 class="page-title">响应式基础</h1>
    <p class="page-desc">
      Vue3 中使用 <code class="inline">ref</code> 和 <code class="inline">reactive</code> 创建响应式数据。
      修改它们会自动触发视图更新。
    </p>

    <!-- ref 示例 -->
    <div class="card">
      <h3>1. ref 基本类型</h3>
      <p>当前计数：<span class="tag">{{ count }}</span></p>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="btn btn-primary" @click="increment">+1</button>
        <button class="btn btn-ghost" @click="decrement">-1</button>
        <button class="btn btn-ghost" @click="count = 0">重置</button>
      </div>
      <pre class="code">import { ref } from 'vue'
const count = ref(0)
const increment = () => count.value++  // 在 JS 中需要 .value</pre>
    </div>

    <!-- reactive 对象示例 -->
    <div class="card">
      <h3>2. reactive 对象</h3>
      <p>姓名：{{ user.name }} ｜ 年龄：{{ user.age }}</p>
      <p>爱好：{{ user.hobbies.join('、') }}</p>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="btn btn-primary" @click="grow">长大一岁</button>
        <button class="btn btn-ghost" @click="addHobby">添加爱好</button>
      </div>
      <pre class="code">import { reactive } from 'vue'
const user = reactive({ name: '张三', age: 18 })
user.age++  // 对象直接修改属性即可，无需 .value</pre>
    </div>

    <!-- 数组示例 -->
    <div class="card">
      <h3>3. 响应式数组</h3>
      <ul class="list">
        <li v-for="(f, i) in fruits" :key="i">
          {{ f }}
          <button class="btn btn-ghost" style="padding: 2px 10px;" @click="removeFruit(i)">删除</button>
        </li>
      </ul>
      <button class="btn btn-primary" style="margin-top: 12px;" @click="addFruit">+ 添加水果</button>
    </div>
  </div>
</template>
