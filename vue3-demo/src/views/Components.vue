<script setup>
// 组件通信：演示 props 传递、emit 事件、插槽
import { ref } from 'vue'
import Counter from '../components/Counter.vue'
import UserCard from '../components/UserCard.vue'
import TodoItem from '../components/TodoItem.vue'

// 1. 父组件接收子组件 emit 的数据
const counterValue = ref(0)
const onCounterChange = (val) => {
  counterValue.value = val
}

// 2. 插槽演示
const users = [
  { name: '张三', role: '管理员', avatar: '👨‍💼' },
  { name: '李四', role: '开发者', avatar: '👩‍💻' },
  { name: '王五', role: '设计师', avatar: '🎨' }
]

// 3. Todo 列表（v-model + emit）
const newTodo = ref('')
const todos = ref([
  { id: 1, text: '学习 Vue3 响应式', done: true },
  { id: 2, text: '理解 computed 与 watch', done: false },
  { id: 3, text: '掌握组件通信', done: false }
])

const addTodo = () => {
  const text = newTodo.value.trim()
  if (!text) return
  todos.value.push({ id: Date.now(), text, done: false })
  newTodo.value = ''
}
const removeTodo = (id) => {
  todos.value = todos.value.filter(t => t.id !== id)
}
const doneCount = ref(0)
</script>

<template>
  <div>
    <h1 class="page-title">组件通信</h1>
    <p class="page-desc">
      父传子用 <code class="inline">props</code>，子传父用 <code class="inline">emit</code>，内容分发用 <code class="inline">插槽 slot</code>。
    </p>

    <!-- props + emit -->
    <div class="card">
      <h3>1. props 传递 + emit 事件</h3>
      <p style="margin-bottom: 12px;">父组件当前收到的值：<span class="tag">{{ counterValue }}</span></p>
      <Counter :initial="0" @change="onCounterChange" />
      <pre class="code">// 父组件
&lt;Counter :initial="0" @change="onCounterChange" /&gt;

// 子组件 Counter.vue
const props = defineProps({ initial: { type: Number, default: 0 } })
const emit = defineEmits(['change'])
emit('change', count.value)  // 通知父组件</pre>
    </div>

    <!-- 插槽 -->
    <div class="card">
      <h3>2. 插槽 slot</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <UserCard
          v-for="u in users"
          :key="u.name"
          :name="u.name"
          :role="u.role"
          :avatar="u.avatar"
        >
          <!-- 自定义具名插槽内容 -->
          <template #actions>
            <button class="btn btn-primary" style="padding: 4px 12px; font-size: 12px;">发消息</button>
          </template>
        </UserCard>
      </div>
    </div>

    <!-- v-model 自定义组件 -->
    <div class="card">
      <h3>3. 自定义组件 v-model（v-model 本质 = props:modelValue + emit:update:modelValue）</h3>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <input class="input" v-model="newTodo" placeholder="输入待办事项，回车添加" @keyup.enter="addTodo" />
        <button class="btn btn-primary" @click="addTodo">添加</button>
      </div>
      <ul style="list-style: none; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
        <TodoItem
          v-for="t in todos"
          :key="t.id"
          :text="t.text"
          v-model="t.done"
          @remove="removeTodo(t.id)"
        />
      </ul>
      <p style="margin-top: 10px; font-size: 13px; color: var(--text-light);">
        已完成：{{ todos.filter(t => t.done).length }} / {{ todos.length }}
      </p>
    </div>
  </div>
</template>
