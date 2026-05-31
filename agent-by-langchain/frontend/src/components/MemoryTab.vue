<template>
  <div class="memory-tab">
    <div class="memory-tabs">
      <button
        v-for="tab in memoryTabs"
        :key="tab.id"
        :class="['memory-tab-btn', { active: activeMemory === tab.id }]"
        @click="switchTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="editor-area">
      <textarea v-model="content" class="editor" spellcheck="false"></textarea>
      <div class="editor-actions">
        <button @click="saveContent" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </button>
        <span v-if="saveStatus" :class="['status', saveStatus.type]">{{ saveStatus.text }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const memoryTabs = [
  { id: 'long-term', label: '长期记忆' },
  { id: 'user', label: '用户偏好' },
]
const activeMemory = ref('long-term')
const content = ref('')
const loading = ref(true)
const saving = ref(false)
const saveStatus = ref(null)

const apiMap = {
  'long-term': { get: '/api/memory/long-term', put: '/api/memory/long-term' },
  'user': { get: '/api/memory/user', put: '/api/memory/user' },
}

async function switchTab(tabId) {
  activeMemory.value = tabId
  saveStatus.value = null
  await loadContent()
}

async function loadContent() {
  loading.value = true
  try {
    const api = apiMap[activeMemory.value]
    const res = await fetch(api.get)
    const data = await res.json()
    content.value = data.content || ''
  } catch (e) {
    console.error('Failed to load memory:', e)
  } finally {
    loading.value = false
  }
}

async function saveContent() {
  saving.value = true
  saveStatus.value = null
  try {
    const api = apiMap[activeMemory.value]
    const res = await fetch(api.put, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value }),
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

onMounted(loadContent)
</script>

<style scoped>
.memory-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.memory-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.memory-tab-btn {
  flex: 1;
  padding: var(--spacing-sm);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.memory-tab-btn.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.loading {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl);
  font-size: 0.875rem;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
}

.editor {
  flex: 1;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  resize: none;
  outline: none;
  transition: border-color 0.15s;
}

.editor:focus {
  border-color: var(--accent-primary);
}

.editor-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-top: var(--spacing-sm);
}

.editor-actions button {
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

.editor-actions button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.editor-actions button:disabled {
  opacity: 0.4;
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
