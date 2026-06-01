<template>
  <div class="vibe-tab">
    <div v-if="loading" class="loading">加载中...</div>
    <template v-else>
      <div class="section">
        <div class="section-header">
          <span class="section-title">步骤选择</span>
          <span class="section-hint">取消勾选即跳过该步骤</span>
        </div>
        <div class="step-list">
          <label v-for="step in presetSteps" :key="step.id" class="step-item">
            <input
              type="checkbox"
              :checked="!excludedSteps.includes(step.id)"
              @change="toggleStep(step.id)"
            />
            <span class="step-label">{{ step.label }}</span>
          </label>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">额外要求</span>
          <span class="section-hint">对写作流水线的附加说明</span>
        </div>
        <textarea
          v-model="customInstructions"
          class="editor"
          placeholder="例如：注重心理描写、对话风格简洁、每章控制在3000字以内..."
          rows="3"
        ></textarea>
      </div>

      <div class="section">
        <div class="section-header">
          <span class="section-title">自定义参考提示词</span>
          <span class="section-hint">创建可复用的提示词模板</span>
        </div>
        <div v-if="customPrompts.length === 0" class="empty-hint">
          暂无自定义提示词，点击下方按钮添加
        </div>
        <div v-for="(prompt, idx) in customPrompts" :key="idx" class="prompt-card">
          <input
            v-model="prompt.name"
            class="prompt-name-input"
            placeholder="提示词名称（如：注重女性视角）"
          />
          <textarea
            v-model="prompt.content"
            class="editor prompt-editor"
            placeholder="在此输入提示词内容..."
            rows="2"
          ></textarea>
          <button class="btn-remove" @click="removePrompt(idx)">删除</button>
        </div>
        <button class="btn-add" @click="addPrompt">+ 添加提示词</button>
      </div>

      <div class="section actions">
        <button class="btn-save" @click="saveSettings" :disabled="saving">
          {{ saving ? '保存中...' : '保存设置' }}
        </button>
        <span v-if="saveStatus" :class="['status', saveStatus.type]">{{ saveStatus.text }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const loading = ref(true)
const saving = ref(false)
const saveStatus = ref(null)

const presetSteps = ref([])
const excludedSteps = ref([])
const customInstructions = ref('')
const customPrompts = ref([])

function toggleStep(id) {
  const idx = excludedSteps.value.indexOf(id)
  if (idx === -1) {
    excludedSteps.value.push(id)
  } else {
    excludedSteps.value.splice(idx, 1)
  }
}

function addPrompt() {
  customPrompts.value.push({ name: '', content: '' })
}

function removePrompt(idx) {
  customPrompts.value.splice(idx, 1)
}

async function loadSettings() {
  try {
    const res = await fetch('/api/vibe-settings')
    const data = await res.json()
    presetSteps.value = data.preset_steps || []
    excludedSteps.value = data.excluded_steps || []
    customInstructions.value = data.custom_instructions || ''
    customPrompts.value = data.custom_prompts || []
  } catch (e) {
    console.error('加载 vibe 设置失败:', e)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  saveStatus.value = null
  try {
    const res = await fetch('/api/vibe-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excluded_steps: excludedSteps.value,
        custom_instructions: customInstructions.value,
        custom_prompts: customPrompts.value.filter(p => p.name.trim() || p.content.trim()),
      }),
    })
    const data = await res.json()
    saveStatus.value = { type: 'success', text: data.message || '已保存' }
    setTimeout(() => { saveStatus.value = null }, 3000)
  } catch (e) {
    saveStatus.value = { type: 'error', text: '保存失败: ' + e.message }
  } finally {
    saving.value = false
  }
}

onMounted(loadSettings)
</script>

<style scoped>
.vibe-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.loading {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl);
  font-size: 0.875rem;
}

.section {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.section-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.section-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.step-item input[type="checkbox"] {
  accent-color: var(--accent-primary);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.step-label {
  user-select: none;
}

.editor {
  width: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.8125rem;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.editor:focus {
  border-color: var(--accent-primary);
}

.empty-hint {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-bottom: var(--spacing-sm);
}

.prompt-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-name-input {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 0.8125rem;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.prompt-name-input:focus {
  border-color: var(--accent-primary);
}

.prompt-editor {
  min-height: 48px;
}

.btn-remove {
  align-self: flex-end;
  background: none;
  border: 1px solid var(--accent-red);
  color: var(--accent-red);
  border-radius: var(--radius-sm);
  padding: 2px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-remove:hover {
  background: var(--accent-red);
  color: white;
}

.btn-add {
  background: none;
  border: 1px dashed var(--border-strong);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  font-size: 0.8125rem;
  cursor: pointer;
  width: 100%;
  transition: all 0.15s;
}

.btn-add:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg) var(--spacing-md);
  border-bottom: none;
}

.btn-save {
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  font-weight: 500;
  font-size: 0.875rem;
  transition: background 0.15s;
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  font-size: 0.75rem;
}

.status.success {
  color: var(--accent-green);
}

.status.error {
  color: var(--accent-red);
}
</style>
