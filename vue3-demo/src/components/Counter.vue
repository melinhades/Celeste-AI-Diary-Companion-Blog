<script setup>
// Counter 子组件：通过 props 接收初始值，通过 emit 向父组件通知变化
const props = defineProps({
  initial: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['change'])

import { ref } from 'vue'
const count = ref(props.initial)

const inc = () => {
  count.value++
  emit('change', count.value)
}
const dec = () => {
  count.value--
  emit('change', count.value)
}
</script>

<template>
  <div style="display: flex; align-items: center; gap: 12px;">
    <button class="btn btn-ghost" @click="dec">-</button>
    <span style="font-size: 20px; font-weight: 600; min-width: 40px; text-align: center;">{{ count }}</span>
    <button class="btn btn-primary" @click="inc">+</button>
  </div>
</template>
