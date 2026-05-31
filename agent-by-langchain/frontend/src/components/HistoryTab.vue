<template>
  <div class="history-tab">
    <!-- 新建会话按钮 -->
    <div class="new-session-bar">
      <button class="new-session-btn" @click="createNewSession" :disabled="creating">+ 新会话</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="sessions.length === 0" class="empty">暂无会话记录</div>
    <div v-else class="session-list">
      <div
        v-for="session in sessions"
        :key="session.id"
        :class="['session-card', { active: session.id === currentSessionId }]"
      >
        <div class="session-main" @click="loadSession(session)">
          <div class="session-header">
            <span v-if="editingId === session.id" class="session-title-edit">
              <input
                v-model="editTitle"
                @keydown.enter.prevent="saveTitle(session.id)"
                @keydown.escape="cancelEdit"
                @blur="saveTitle(session.id)"
                ref="editInput"
                class="title-input"
              />
            </span>
            <span v-else class="session-title">{{ session.title }}</span>
            <span class="session-meta">
              <span class="turn-count">{{ session.turn_count }} 轮</span>
              <span class="session-time">{{ formatTime(session.updated_at) }}</span>
            </span>
          </div>
          <div v-if="session.first_user_message" class="session-preview">
            {{ session.first_user_message }}
          </div>
        </div>
        <div class="session-actions">
          <button class="action-btn" @click.stop="startEdit(session)" title="重命名">✏️</button>
          <button class="action-btn danger" @click.stop="confirmDelete(session)" title="删除">🗑️</button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="deletingSession" class="confirm-overlay" @click.self="deletingSession = null">
      <div class="confirm-dialog">
        <p>确定删除会话「{{ deletingSession.title }}」？</p>
        <p class="confirm-hint">此操作不可撤销，该会话的所有消息将被永久删除。</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="deletingSession = null">取消</button>
          <button class="confirm-btn danger" @click="doDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { loadHistoryMessages, switchSession } from '../stores/execution.js'

const sessions = ref([])
const loading = ref(true)
const creating = ref(false)
const currentSessionId = ref(null)
const editingId = ref(null)
const editTitle = ref('')
const editInput = ref(null)
const deletingSession = ref(null)
let refreshTimer = null

function formatTime(ts) {
  if (!ts) return ''
  const date = new Date(ts)
  const now = new Date()
  const diff = now - date
  const oneDay = 86400000

  if (diff < oneDay && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 2 * oneDay) {
    return '昨天'
  }
  if (diff < 7 * oneDay) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return days[date.getDay()]
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

async function loadSessions() {
  try {
    const res = await fetch('/api/history')
    const data = await res.json()
    sessions.value = data.sessions || []
  } catch (e) {
    console.error('Failed to load sessions:', e)
  } finally {
    loading.value = false
  }
}

async function createNewSession() {
  creating.value = true
  try {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新会话' }),
    })
    const session = await res.json()
    currentSessionId.value = session.id
    switchSession(session.id)
    // 清空聊天面板
    loadHistoryMessages([])
    await loadSessions()
  } catch (e) {
    console.error('Failed to create session:', e)
  } finally {
    creating.value = false
  }
}

async function loadSession(session) {
  if (session.id === currentSessionId.value) return

  currentSessionId.value = session.id
  switchSession(session.id)

  // 获取该会话的完整历史
  try {
    const res = await fetch(`/api/history/${session.id}`)
    const data = await res.json()
    if (data.turns) {
      loadHistoryMessages(
        data.turns.map(t => ({
          role: t.role,
          content: t.full_content || t.content,
        }))
      )
    }
  } catch (e) {
    console.error('Failed to load session history:', e)
  }
}

function startEdit(session) {
  editingId.value = session.id
  editTitle.value = session.title
  nextTick(() => {
    if (editInput.value) {
      const inputs = Array.isArray(editInput.value) ? editInput.value : [editInput.value]
      inputs[0]?.focus()
    }
  })
}

async function saveTitle(sessionId) {
  if (!editTitle.value.trim() || editingId.value !== sessionId) {
    cancelEdit()
    return
  }

  try {
    await fetch(`/api/history/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle.value.trim() }),
    })
    await loadSessions()
  } catch (e) {
    console.error('Failed to update session:', e)
  }
  editingId.value = null
  editTitle.value = ''
}

function cancelEdit() {
  editingId.value = null
  editTitle.value = ''
}

function confirmDelete(session) {
  deletingSession.value = session
}

async function doDelete() {
  if (!deletingSession.value) return

  try {
    await fetch(`/api/history/${deletingSession.value.id}`, { method: 'DELETE' })
    // 如果删除的是当前会话，切换到第一个可用会话
    if (deletingSession.value.id === currentSessionId.value) {
      currentSessionId.value = null
      switchSession(null)
      loadHistoryMessages([])
    }
    await loadSessions()
  } catch (e) {
    console.error('Failed to delete session:', e)
  }
  deletingSession.value = null
}

onMounted(() => {
  loadSessions()
  refreshTimer = setInterval(loadSessions, 5000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.history-tab {
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.new-session-bar {
  display: flex;
  justify-content: flex-end;
}

.new-session-btn {
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: background 0.15s;
  width: 100%;
}

.new-session-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.new-session-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading, .empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl);
  font-size: 0.875rem;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.session-card {
  display: flex;
  align-items: stretch;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: all 0.15s;
}

.session-card:hover {
  border-color: var(--border-strong);
  background: var(--bg-secondary);
}

.session-card.active {
  border-color: var(--accent-primary);
  background: var(--bg-secondary);
}

.session-main {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  min-width: 0;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-sm);
}

.session-title {
  font-weight: 500;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.session-title-edit {
  flex: 1;
  min-width: 0;
}

.title-input {
  width: 100%;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-size: 0.8125rem;
  outline: none;
  font-family: inherit;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.turn-count {
  font-size: 0.6875rem;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.session-time {
  font-size: 0.6875rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.session-preview {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: var(--spacing-xs);
  opacity: 0;
  transition: opacity 0.15s;
}

.session-card:hover .session-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  transition: background 0.15s;
}

.action-btn:hover {
  background: var(--bg-tertiary);
}

.action-btn.danger:hover {
  background: var(--accent-red);
}

/* ── 确认对话框 ── */
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.confirm-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  max-width: 320px;
  width: 90%;
}

.confirm-dialog p {
  font-size: 0.9375rem;
  font-weight: 500;
  margin-bottom: var(--spacing-sm);
}

.confirm-hint {
  font-size: 0.8125rem !important;
  font-weight: 400 !important;
  color: var(--text-muted);
  margin-bottom: var(--spacing-md) !important;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.confirm-btn {
  padding: var(--spacing-xs) var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  transition: all 0.15s;
}

.confirm-btn.cancel {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.confirm-btn.danger {
  background: var(--accent-red);
  color: white;
}

.confirm-btn:hover {
  opacity: 0.85;
}
</style>
