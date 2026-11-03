import { ref } from 'vue'

export const todos = ref([])
export const totalTokens = ref({ input: 0, output: 0, total: 0 })
export const loadedHistoryMessages = ref([])
export const currentSessionId = ref(null)

// 附加鉴权头：从 localStorage['agentApiToken'] 读取 token，
// 未配置则不附加（服务端在 token 未配置时允许空 token 直连，向后兼容）
export function authHeaders(extra = {}) {
  const token = localStorage.getItem('agentApiToken')
  if (!token) return extra
  return { ...extra, Authorization: `Bearer ${token}` }
}

export function updateTodos(items) {
  todos.value = items
}

export function updateTokens(tokens) {
  totalTokens.value = tokens
}

export function loadHistoryMessages(messages) {
  loadedHistoryMessages.value = messages
}

export function switchSession(id) {
  currentSessionId.value = id
}
