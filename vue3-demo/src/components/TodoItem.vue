<script setup>
// TodoItem 子组件：演示 props + emit（v-model 在自定义组件中的应用）
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  text: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'remove'])

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <li class="todo-item" :class="{ done: modelValue }">
    <label class="checkbox">
      <input type="checkbox" :checked="modelValue" @change="toggle" />
    </label>
    <span class="todo-text">{{ text }}</span>
    <button class="btn btn-ghost" style="padding: 2px 10px; font-size: 12px;" @click="emit('remove')">
      删除
    </button>
  </li>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.todo-item.done .todo-text {
  text-decoration: line-through;
  color: var(--text-light);
}
.todo-text {
  flex: 1;
}
.checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
</style>
