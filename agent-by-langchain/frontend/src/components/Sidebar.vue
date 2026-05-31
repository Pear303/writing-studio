<template>
  <div class="sidebar">
    <nav class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>
    <div class="tab-content">
      <HistoryTab v-if="activeTab === 'history'" />
      <SkillsTab v-if="activeTab === 'skills'" />
      <MemoryTab v-if="activeTab === 'memory'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import HistoryTab from './HistoryTab.vue'
import SkillsTab from './SkillsTab.vue'
import MemoryTab from './MemoryTab.vue'

const tabs = [
  { id: 'history', label: 'Sessions' },
  { id: 'skills', label: 'Skills' },
  { id: 'memory', label: 'Memory' },
]

const activeTab = ref('history')
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.tab-btn {
  flex: 1;
  padding: var(--spacing-md);
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.tab-btn.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}
</style>
