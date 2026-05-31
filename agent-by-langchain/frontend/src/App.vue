<template>
  <div class="app-container">
    <main class="chat-panel">
      <ChatPanel />
    </main>
    <aside class="sidebar">
      <Sidebar />
    </aside>
  </div>
</template>

<script setup>
import ChatPanel from './components/ChatPanel.vue'
import Sidebar from './components/Sidebar.vue'
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.chat-panel {
  flex: 1;
  min-width: 0;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
}

.sidebar {
  width: 360px;
  min-width: 320px;
  max-width: 420px;
  background: var(--bg-secondary);
  overflow-y: auto;
}
</style>
