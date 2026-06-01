<template>
  <div class="chat-panel">
    <!-- Todo 进度条 — 固定在消息区上方，不随消息滚动 -->
    <div v-if="todos.length > 0" class="todo-bar">
      <div class="todo-header">
        <span class="todo-title">任务进度</span>
        <span v-if="todoCollapsed" class="todo-summary">
          {{ todoCompleted }} / {{ todoTotal }} —
          <span class="done">{{ todoCompleted }} 项完成</span>
          <span class="doing">{{ todoInProgress }} 项进行中</span>
          <span class="pending">{{ todoPending }} 项待办</span>
        </span>
        <button class="todo-collapse-btn" @click="todoCollapsed = !todoCollapsed">
          {{ todoCollapsed ? '展开' : '收起' }}
        </button>
      </div>
      <div v-if="!todoCollapsed" class="todo-body">
        <div class="todo-progress">
          {{ todoCompleted }} / {{ todoTotal }} —
          <span class="stat done">{{ todoCompleted }} 项完成</span>
          <span class="stat doing">{{ todoInProgress }} 项进行中</span>
          <span class="stat pending">{{ todoPending }} 项待办</span>
        </div>
        <div class="todo-items">
          <div v-for="item in todos" :key="item.id" :class="['todo-item', item.status]">
            <span class="todo-item-icon">{{ statusIcon(item.status) }}</span>
            <span class="todo-item-text">{{ item.content }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="messages" ref="messagesRef">
      <!-- 消息列表 -->
      <div v-if="messages.length === 0 && todos.length === 0" class="empty-state">
        <p>开始与 Agent 对话</p>
      </div>

      <template v-for="(msg, idx) in messages" :key="idx">
        <div v-if="msg.role === 'assistant' && msg.summary" class="agent-summary">
          <span class="summary-text">{{ msg.summary }}</span>
        </div>
        <div :class="['message', msg.role]">
          <div class="message-content" v-html="renderMarkdown(msg.content)"></div>
          <div v-if="msg.tokens" class="message-tokens">
            <span>{{ msg.tokens.input }} in / {{ msg.tokens.output }} out</span>
          </div>
        </div>
      </template>

      <!-- 流式回复 -->
      <div v-if="isStreaming" class="streaming-wrapper">
        <div v-if="activityLog.length > 0" class="activity-log">
          <div v-for="(item, i) in activityLog" :key="i" :class="['activity-item', item.level]">
            <span class="activity-icon">{{ item.icon }}</span>
            <span class="activity-text">{{ item.text }}</span>
          </div>
        </div>
        <div v-if="currentStreamContent" class="message assistant streaming">
          <div class="message-content" v-html="renderMarkdown(currentStreamContent)"></div>
          <span class="cursor">|</span>
        </div>
      </div>

      <div v-if="error" class="message error">
        <div class="message-content">{{ error }}</div>
      </div>
    </div>

    <div class="input-area">
      <textarea
        v-model="inputMessage"
        @keydown.enter.exact.prevent="sendMessage"
        placeholder="输入消息... (Enter 发送)"
        :disabled="isStreaming"
        rows="1"
      ></textarea>
      <button @click="sendMessage" :disabled="isStreaming || !inputMessage.trim()">
        {{ isStreaming ? '处理中...' : '发送' }}
      </button>
    </div>

    <!-- 写作风格参考标签 -->
    <div class="vibe-bar">
      <div class="vibe-bar-header">
        <span class="vibe-bar-title">写作风格参考</span>
        <button class="vibe-add-btn" @click="showNewPrompt = true">+ 新增</button>
      </div>
      <div v-if="showNewPrompt" class="vibe-new-prompt">
        <input v-model="newPromptName" placeholder="名称" />
        <textarea v-model="newPromptContent" placeholder="描述该写作方向的要点..." rows="2"></textarea>
        <div class="vp-actions">
          <button @click="saveNewPrompt">保存</button>
          <button @click="cancelNewPrompt">取消</button>
        </div>
      </div>
      <div class="vibe-tags">
        <button
          v-for="p in vibePrompts"
          :key="p.name"
          :class="{ active: vibeActiveNames.includes(p.name) }"
          @click="toggleVibePrompt(p.name)"
        >
          {{ p.name }}
        </button>
      </div>
    </div>

    <div v-if="tokenStats.total > 0" class="token-bar">
      <span>Session: {{ formatNum(tokenStats.input) }} in / {{ formatNum(tokenStats.output) }} out / {{ formatNum(tokenStats.total) }} total</span>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue'
import { marked } from 'marked'
import { todos, updateTodos, loadedHistoryMessages, loadHistoryMessages, currentSessionId, switchSession } from '../stores/execution.js'

const messages = ref([])
const inputMessage = ref('')
const isStreaming = ref(false)
const currentStreamContent = ref('')
const error = ref('')
const messagesRef = ref(null)
const tokenStats = ref({ input: 0, output: 0, total: 0 })
const todoCollapsed = ref(false)
const currentStatus = ref('')
const activityLog = ref([])
let todoRefreshTimer = null

// ── Vibe 写作风格参考 ──
const DEFAULT_VIBE_PROMPTS = [
  { name: '注重人物心理描写', content: '注重人物内心活动的刻画，通过心理活动推动情节发展，让读者能深入理解角色的情感变化和决策动机。' },
  { name: '对话风格简洁明快', content: '对话要简洁自然，符合人物性格和身份，避免冗长的对白。用对话推进情节，每段对话都有明确的戏剧目的。' },
  { name: '场景描写丰富细腻', content: '注重场景的感官描写（视觉、听觉、嗅觉、触觉），营造沉浸式的阅读体验。场景描写要为情节和情绪服务。' },
  { name: '情节节奏紧凑', content: '控制叙事节奏，避免拖沓。适当运用悬念、转折和章节断点，保持读者的阅读张力。' },
  { name: '注重世界观展现', content: '通过情节和对话自然地展现世界观设定，避免大段的说明性文字。让读者在故事中逐步发现世界的规则和秘密。' },
]
const vibePrompts = ref(DEFAULT_VIBE_PROMPTS)
const vibeActiveNames = ref([])
const showNewPrompt = ref(false)
const newPromptName = ref('')
const newPromptContent = ref('')

const todoTotal = computed(() => todos.value.length)
const todoCompleted = computed(() => todos.value.filter(t => t.status === 'completed').length)
const todoInProgress = computed(() => todos.value.filter(t => t.status === 'in_progress').length)
const todoPending = computed(() => todos.value.filter(t => t.status === 'pending').length)
const todoCurrent = computed(() => {
  const cur = todos.value.find(t => t.status === 'in_progress')
  return cur ? cur.content : ''
})

// 监听历史加载：用户从 HistoryTab 点击载入会话
watch(loadedHistoryMessages, (history) => {
  if (history && history.length > 0) {
    messages.value = history.map(h => ({
      role: h.role,
      content: h.full_content || h.content,
      summary: '',
    }))
    loadHistoryMessages([]) // 消费后清空
    nextTick(() => scrollToBottom())
  }
})

function statusIcon(status) {
  if (status === 'completed') return '✅'
  if (status === 'in_progress') return '🔄'
  return '⬜'
}

function renderMarkdown(text) {
  return marked.parse(text || '', { breaks: true })
}

function formatNum(n) {
  return n.toLocaleString()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

async function fetchTodo() {
  try {
    const res = await fetch('/api/todo')
    const data = await res.json()
    updateTodos(data.todos || [])
  } catch (e) {
    // 忽略
  }
}

async function fetchTokenStats() {
  try {
    const res = await fetch('/api/tokens')
    const data = await res.json()
    tokenStats.value = data.session_total
  } catch (e) {
    // 忽略
  }
}

function generateSummary(events) {
  if (!events || events.length === 0) return ''
  const parts = []
  let lastTool = ''
  let hasReply = false

  for (const evt of events) {
    const prefix = evt.subagent ? `[${evt.subagent}] ` : ''
    switch (evt.type) {
      case 'thinking_start':
        if (parts.length === 0 || parts[parts.length - 1] !== prefix + '思考') {
          parts.push(prefix + '思考')
        }
        break
      case 'tool_start':
        if (evt.tool !== lastTool) {
          parts.push(prefix + '调用 ' + evt.tool)
          lastTool = evt.tool
        }
        break
      case 'tool_error':
        parts.push(evt.tool + ' 出错')
        lastTool = ''
        break
      case 'reply_token':
        if (!hasReply) {
          parts.push('生成回复')
          hasReply = true
        }
        break
    }
  }

  if (parts.length === 0) return ''
  return parts.join(' → ')
}

// ── Vibe 写作风格参考 ──
async function loadVibeSettings() {
  try {
    const res = await fetch('/api/vibe-settings')
    const data = await res.json()
    vibePrompts.value = data.custom_prompts || []
    vibeActiveNames.value = data.active_prompt_names || []
  } catch (e) {
    console.error('加载 vibe 提示词失败:', e)
  }
}

async function saveVibeSettingsWith(overrides) {
  try {
    const res = await fetch('/api/vibe-settings')
    const current = await res.json()
    const merged = {
      excluded_steps: current.excluded_steps || [],
      custom_instructions: current.custom_instructions || '',
      custom_prompts: current.custom_prompts || [],
      active_prompt_names: current.active_prompt_names || [],
      ...overrides,
    }
    await fetch('/api/vibe-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    })
  } catch (e) {
    console.error('保存 vibe 设置失败:', e)
  }
}

function toggleVibePrompt(name) {
  const idx = vibeActiveNames.value.indexOf(name)
  if (idx === -1) {
    vibeActiveNames.value.push(name)
  } else {
    vibeActiveNames.value.splice(idx, 1)
  }
  saveVibeSettingsWith({ active_prompt_names: vibeActiveNames.value })
}

async function saveNewPrompt() {
  const name = newPromptName.value.trim()
  const content = newPromptContent.value.trim()
  if (!name || !content) return
  vibePrompts.value.push({ name, content })
  vibeActiveNames.value.push(name)
  newPromptName.value = ''
  newPromptContent.value = ''
  showNewPrompt.value = false
  await saveVibeSettingsWith({
    custom_prompts: vibePrompts.value,
    active_prompt_names: vibeActiveNames.value,
  })
}

function cancelNewPrompt() {
  showNewPrompt.value = false
  newPromptName.value = ''
  newPromptContent.value = ''
}

async function sendMessage() {
  const msg = inputMessage.value.trim()
  if (!msg || isStreaming.value) return

  inputMessage.value = ''
  error.value = ''
  currentStreamContent.value = ''
  currentStatus.value = ''
  activityLog.value = []
  isStreaming.value = true

  messages.value.push({ role: 'user', content: msg })
  await scrollToBottom()

  // 发送前立即刷新一次 todo，确保拿到最新状态
  await fetchTodo()

  const sseEvents = []
  let currentGen = 0       // 流式 generation 序号，LLM 每次新调用递增
  let assistantContent = '' // 当前 generation 的累积流式文本
  let hasReceivedDone = false

  // ── 活动日志辅助 ──
  function addActivity(icon, text, level = 'info') {
    activityLog.value.push({ icon, text, level })
    // 只保留最近 50 条，防止 DOM 膨胀
    if (activityLog.value.length > 50) {
      activityLog.value = activityLog.value.slice(-50)
    }
    nextTick(() => scrollToBottom())
  }

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, session_id: currentSessionId.value }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let scrollCounter = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue

        let data
        try {
          data = JSON.parse(line.slice(6))
        } catch (e) {
          continue
        }

        sseEvents.push(data)
        const prefix = data.subagent ? `[${data.subagent}] ` : ''

        if (data.type === 'thinking_start') {
          addActivity('🧠', prefix + '思考中...')
        } else if (data.type === 'thinking_end') {
          addActivity('✅', prefix + '思考完成')
        } else if (data.type === 'tool_start') {
          addActivity('🔧', prefix + '调用 ' + data.tool, 'tool')
        } else if (data.type === 'tool_end') {
          addActivity('✔️', prefix + '执行完成', 'success')
        } else if (data.type === 'tool_error') {
          addActivity('❌', prefix + data.tool + ' 出错', 'error')
        } else if (data.type === 'reply_token') {
          // generation 变化 → 新一轮 LLM 调用，重置流式内容
          if (data.gen !== undefined && data.gen !== currentGen) {
            currentGen = data.gen
            assistantContent = ''
          }
          assistantContent += data.content
          currentStreamContent.value = assistantContent
          scrollCounter++
          if (scrollCounter % 20 === 0) {
            await scrollToBottom()
          }
        } else if (data.type === 'done') {
          hasReceivedDone = true
          let summary = ''
          try { summary = generateSummary(sseEvents) } catch (_) {}
          messages.value.push({
            role: 'assistant',
            content: data.reply,
            summary: summary,
          })
          currentStreamContent.value = ''
          currentStatus.value = ''
          activityLog.value = []
          await fetchTodo()
          await fetchTokenStats()
          await scrollToBottom()
        } else if (data.type === 'error') {
          addActivity('❌', '错误: ' + data.message, 'error')
          error.value = data.message
          currentStatus.value = ''
        }
      }
    }

    // ── 兜底同步：SSE 流结束但未收到 done（连接超时/中断） ──
    if (!hasReceivedDone) {
      addActivity('⏳', '同步回复中...')
      try {
        const stateRes = await fetch('/api/chat/state')
        const stateData = await stateRes.json()
        if (stateData.reply) {
          let summary = ''
          try { summary = generateSummary(sseEvents) } catch (_) {}
          messages.value.push({
            role: 'assistant',
            content: stateData.reply,
            summary: summary,
          })
          currentStreamContent.value = ''
          currentStatus.value = ''
          activityLog.value = []
          await fetchTodo()
          await fetchTokenStats()
          await scrollToBottom()
        }
      } catch (e) {
        // 最后兜底：从 session API 获取最新回复
        try {
          const sid = currentSessionId.value
          if (sid) {
            const histRes = await fetch(`/api/history/${sid}`)
            const histData = await histRes.json()
            const turns = histData.turns || []
            const lastAssistant = [...turns].reverse().find(t => t.role === 'assistant')
            if (lastAssistant) {
              messages.value.push({
                role: 'assistant',
                content: lastAssistant.full_content || lastAssistant.content,
                summary: '',
              })
              currentStreamContent.value = ''
              currentStatus.value = ''
              activityLog.value = []
              await scrollToBottom()
            }
          }
        } catch (_) {
          // 无法获取，放弃
        }
      }
    }
  } catch (e) {
    error.value = '连接失败: ' + e.message
    currentStatus.value = ''
  } finally {
    isStreaming.value = false
  }
}

onMounted(() => {
  fetchTodo()
  fetchTokenStats()
  loadVibeSettings()
  todoRefreshTimer = setInterval(fetchTodo, 1500)
})

onUnmounted(() => {
  if (todoRefreshTimer) {
    clearInterval(todoRefreshTimer)
  }
})
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 1rem;
  font-weight: 400;
}

/* ── Todo 进度条 ── */
.todo-bar {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: var(--spacing-sm) var(--spacing-lg);
  flex-shrink: 0;
}

.todo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.todo-title {
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.todo-collapse-btn {
  background: none;
  border: none;
  color: var(--accent-primary);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}

.todo-collapse-btn:hover {
  background: var(--accent-light);
}

.todo-summary {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-left: auto;
  margin-right: var(--spacing-sm);
}

.todo-summary .done {
  color: var(--accent-green);
}

.todo-summary .doing {
  color: var(--accent-primary);
}

.todo-summary .pending {
  color: var(--text-muted);
}

.todo-body {
  margin-top: var(--spacing-sm);
}

.todo-progress {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

.todo-progress .stat.done {
  color: var(--accent-green);
}

.todo-progress .stat.doing {
  color: var(--accent-primary);
}

.todo-progress .stat.pending {
  color: var(--text-muted);
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  padding: 2px 0;
}

.todo-item.completed .todo-item-text {
  color: var(--text-muted);
  text-decoration: line-through;
}

.todo-item.in_progress .todo-item-text {
  color: var(--text-primary);
  font-weight: 500;
}

.todo-item-icon {
  flex-shrink: 0;
  width: 1.1em;
  text-align: center;
}

/* ── Agent 内联摘要 ── */
.agent-summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(59, 130, 246, 0.06);
  border-radius: var(--radius-md);
  padding: 3px 10px;
  margin-bottom: 2px;
  font-size: 0.75rem;
  color: var(--text-muted);
  align-self: flex-start;
}

.summary-text {
  line-height: 1.5;
}

/* ── 流式状态指示 ── */
.streaming-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-log {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  max-height: 200px;
  overflow-y: auto;
  font-size: 0.8125rem;
  align-self: flex-start;
  max-width: 70%;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.5;
  padding: 1px 0;
}

.activity-icon {
  flex-shrink: 0;
  width: 1.2em;
  text-align: center;
}

.activity-text {
  color: var(--text-secondary);
  word-break: break-word;
}

.activity-item.tool .activity-text {
  color: var(--accent-primary);
  font-weight: 500;
}

.activity-item.success .activity-text {
  color: var(--accent-green);
}

.activity-item.error .activity-text {
  color: var(--accent-red);
}

.streaming-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(59, 130, 246, 0.06);
  border-radius: var(--radius-md);
  padding: 3px 10px;
  font-size: 0.75rem;
  color: var(--text-muted);
  align-self: flex-start;
}

.status-text {
  line-height: 1.5;
}

/* ── 消息气泡 ── */
.message {
  max-width: 70%;
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-lg);
  animation: fadeIn 0.2s ease;
}

.message.user {
  align-self: flex-end;
  background: var(--accent-primary);
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
}

.message.error {
  align-self: center;
  background: var(--accent-red);
  color: white;
  font-size: 0.875rem;
}

.message-content {
  word-wrap: break-word;
  line-height: 1.7;
  font-size: 0.9375rem;
}

.message-content :deep(p) {
  margin-bottom: var(--spacing-sm);
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(code) {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
}

.message-content :deep(pre) {
  background: var(--bg-tertiary);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: var(--spacing-sm) 0;
  border: 1px solid var(--border-color);
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

.message-tokens {
  margin-top: var(--spacing-xs);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.streaming .cursor {
  animation: blink 1s infinite;
  color: var(--accent-primary);
}

.input-area {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-xl);
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.input-area textarea {
  flex: 1;
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.9375rem;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.input-area textarea:focus {
  border-color: var(--accent-primary);
}

.input-area button {
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9375rem;
  transition: background 0.15s;
}

.input-area button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.input-area button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.token-bar {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ── Vibe 写作风格参考标签 ── */
.vibe-bar {
  border-top: 2px solid #e5e7eb;
  padding: 8px 16px;
  background: #f9fafb;
  flex-shrink: 0;
}

.vibe-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.vibe-bar-title {
  font-size: 13px;
  color: #374151;
  font-weight: 600;
}

.vibe-add-btn {
  background: none;
  border: 1px solid #d1d5db;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 10px;
  border-radius: 4px;
}

.vibe-add-btn:hover {
  background: #e5e7eb;
}

.vibe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.vibe-tags button {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 14px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.vibe-tags button:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.vibe-tags button.active {
  background: #3b82f6;
  color: #ffffff;
  border-color: #3b82f6;
}

.vibe-new-prompt {
  margin-bottom: 8px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vibe-new-prompt input,
.vibe-new-prompt textarea {
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
  font-family: inherit;
}

.vibe-new-prompt input:focus,
.vibe-new-prompt textarea:focus {
  border-color: #3b82f6;
}

.vp-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.vp-actions button:first-child {
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
}

.vp-actions button:first-child:hover {
  background: #2563eb;
}

.vp-actions button:last-child {
  background: none;
  border: 1px solid #d1d5db;
  color: #6b7280;
  border-radius: 4px;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
}

.vp-actions button:last-child:hover {
  background: #f3f4f6;
}

/* ── 新增提示词表单 ── */
.vibe-new-prompt {
  margin-top: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.vp-input {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 0.8125rem;
  outline: none;
  font-family: inherit;
}

.vp-input:focus {
  border-color: var(--accent-primary);
}

.vp-textarea {
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  font-size: 0.8125rem;
  resize: vertical;
  outline: none;
  font-family: inherit;
}

.vp-textarea:focus {
  border-color: var(--accent-primary);
}

.vp-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.vp-save {
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: 3px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}

.vp-save:hover {
  background: var(--accent-hover);
}

.vp-cancel {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 3px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.vp-cancel:hover {
  border-color: var(--text-muted);
  color: var(--text-primary);
}
</style>
