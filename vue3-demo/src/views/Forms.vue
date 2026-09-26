<script setup>
// 表单与 v-model：演示双向绑定、修饰符
import { ref, reactive } from 'vue'

// 文本与修饰符
const text = ref('')
const lazyText = ref('')
const numberInput = ref(0)
const trimmed = ref('')

// 多选与单选
const favorite = ref('vue')
const gender = ref('male')
const hobbies = ref(['coding'])
const agree = ref(false)

// 下拉选择
const city = ref('beijing')

// 复杂表单对象
const form = reactive({
  username: '',
  email: '',
  password: '',
  intro: '',
  level: 'normal'
})
const submitted = ref(null)
const submit = () => {
  submitted.value = { ...form }
}
</script>

<template>
  <div>
    <h1 class="page-title">表单与 v-model</h1>
    <p class="page-desc">
      <code class="inline">v-model</code> 是表单双向绑定的语法糖，支持 <code class="inline">.lazy</code>、<code class="inline">.number</code>、<code class="inline">.trim</code> 修饰符。
    </p>

    <div class="grid-2">
      <!-- 文本修饰符 -->
      <div class="card">
        <h3>1. 文本修饰符</h3>
        <label class="label">实时绑定（默认）</label>
        <input class="input" v-model="text" />
        <p class="preview">值：{{ text }}</p>

        <label class="label">.lazy（失焦才更新）</label>
        <input class="input" v-model.lazy="lazyText" />
        <p class="preview">值：{{ lazyText }}</p>

        <label class="label">.number（转为数字）</label>
        <input class="input" type="number" v-model.number="numberInput" />
        <p class="preview">值：{{ numberInput }} ({{ typeof numberInput }})</p>

        <label class="label">.trim（去除首尾空格）</label>
        <input class="input" v-model.trim="trimmed" />
        <p class="preview">值："{{ trimmed }}"</p>
      </div>

      <!-- 单选/多选/下拉 -->
      <div class="card">
        <h3>2. 单选 / 多选 / 下拉</h3>
        <label class="label">单选按钮</label>
        <div>
          <label><input type="radio" value="male" v-model="gender" /> 男</label>
          <label style="margin-left: 12px;"><input type="radio" value="female" v-model="gender" /> 女</label>
        </div>
        <p class="preview">性别：{{ gender }}</p>

        <label class="label">复选框（数组）</label>
        <div>
          <label v-for="h in ['coding', 'music', 'sports']" :key="h" style="margin-right: 12px;">
            <input type="checkbox" :value="h" v-model="hobbies" /> {{ h }}
          </label>
        </div>
        <p class="preview">爱好：{{ hobbies.join(', ') }}</p>

        <label class="label">下拉选择</label>
        <select class="select" v-model="city">
          <option value="beijing">北京</option>
          <option value="shanghai">上海</option>
          <option value="guangzhou">广州</option>
        </select>
        <p class="preview">城市：{{ city }}</p>

        <label class="label">单个复选框（布尔）</label>
        <label><input type="checkbox" v-model="agree" /> 同意用户协议</label>
        <p class="preview">已同意：{{ agree ? '是' : '否' }}</p>
      </div>
    </div>

    <!-- 复杂表单 -->
    <div class="card">
      <h3>3. 综合表单提交</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        <div>
          <label class="label">用户名</label>
          <input class="input" v-model="form.username" />
        </div>
        <div>
          <label class="label">邮箱</label>
          <input class="input" v-model="form.email" />
        </div>
        <div>
          <label class="label">密码</label>
          <input class="input" type="password" v-model="form.password" />
        </div>
        <div>
          <label class="label">等级</label>
          <select class="select" v-model="form.level">
            <option value="normal">普通</option>
            <option value="vip">VIP</option>
            <option value="svip">SVIP</option>
          </select>
        </div>
      </div>
      <div style="margin-top: 12px;">
        <label class="label">简介</label>
        <textarea class="textarea" v-model="form.intro" rows="3"></textarea>
      </div>
      <button class="btn btn-primary" style="margin-top: 12px;" @click="submit">提交</button>
      <div v-if="submitted" style="margin-top: 12px;">
        <p class="tag">提交结果：</p>
        <pre class="code">{{ submitted }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.label {
  display: block;
  font-size: 13px;
  color: var(--text-light);
  margin: 10px 0 4px;
}
.preview {
  font-size: 13px;
  color: var(--primary);
  margin-top: 4px;
}
</style>
