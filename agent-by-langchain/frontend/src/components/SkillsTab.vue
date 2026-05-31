<template>
  <div class="skills-tab">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="skills.length === 0" class="empty">暂无技能</div>
    <div v-else>
      <div class="search-bar">
        <input v-model="search" placeholder="搜索技能..." />
      </div>
      <div class="skill-cards">
        <div v-for="skill in filteredSkills" :key="skill.name" class="skill-card">
          <div class="skill-header">
            <span class="skill-name">{{ skill.name }}</span>
            <span v-if="skill.always" class="badge">Always</span>
          </div>
          <p class="skill-desc">{{ skill.description }}</p>
          <div v-if="skill.tags" class="skill-tags">
            <span v-for="tag in skill.tags.split(',')" :key="tag" class="tag">{{ tag.trim() }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const skills = ref([])
const loading = ref(true)
const search = ref('')

const filteredSkills = computed(() => {
  if (!search.value) return skills.value
  const q = search.value.toLowerCase()
  return skills.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.toLowerCase().includes(q)
  )
})

async function loadSkills() {
  try {
    const res = await fetch('/api/skills')
    const data = await res.json()
    skills.value = data.skills
  } catch (e) {
    console.error('Failed to load skills:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadSkills)
</script>

<style scoped>
.skills-tab {
  padding: var(--spacing-md);
}

.loading, .empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--spacing-xl);
  font-size: 0.875rem;
}

.search-bar {
  margin-bottom: var(--spacing-md);
}

.search-bar input {
  width: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-bar input:focus {
  border-color: var(--accent-primary);
}

.skill-cards {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.skill-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  transition: all 0.15s;
}

.skill-card:hover {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
}

.skill-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-xs);
}

.skill-name {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.875rem;
}

.badge {
  background: var(--accent-primary);
  color: white;
  font-size: 0.6875rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.skill-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
  line-height: 1.5;
}

.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.tag {
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.6875rem;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}
</style>
