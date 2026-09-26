<script setup>
// UserCard 子组件：演示 props 传递与插槽
const props = defineProps({
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: '成员'
  },
  avatar: {
    type: String,
    default: '👤'
  }
})
</script>

<template>
  <div class="user-card">
    <div class="avatar">{{ avatar }}</div>
    <div class="info">
      <h4>{{ name }}</h4>
      <p class="role">{{ role }}</p>
    </div>
    <!-- 具名插槽：允许父组件自定义操作区 -->
    <div class="actions">
      <slot name="actions">
        <button class="btn btn-ghost" style="padding: 4px 12px; font-size: 12px;">关注</button>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.user-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: #f9fafb;
  border-radius: 10px;
}
.avatar {
  font-size: 36px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 50%;
}
.info h4 {
  margin: 0;
}
.role {
  color: var(--text-light);
  font-size: 13px;
  margin: 0;
}
.actions {
  margin-left: auto;
}
</style>
