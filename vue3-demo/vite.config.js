import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：使用 Vue 插件，启动端口 5173
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    open: false
  }
})
