import { ref } from 'vue'

export const todos = ref([])
export const totalTokens = ref({ input: 0, output: 0, total: 0 })
export const loadedHistoryMessages = ref([])
export const currentSessionId = ref(null)

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
