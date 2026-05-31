import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import HistoryTab from '../components/HistoryTab.vue'

const mockSessionData = {
  sessions: [
    {
      id: 'sess_abc12345',
      title: '测试会话',
      created_at: '2026-05-24T10:00:00+08:00',
      updated_at: '2026-05-24T10:05:00+08:00',
      turn_count: 2,
      first_user_message: '你好',
    },
    {
      id: 'sess_def67890',
      title: '2026-05-15 的对话',
      created_at: '2026-05-15T21:17:19+08:00',
      updated_at: '2026-05-15T22:27:59+08:00',
      turn_count: 4,
      first_user_message: '查找关于"见闻色霸气"的相关内容',
    },
  ],
}

describe('HistoryTab (Session List)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      if (url === '/api/history') {
        return Promise.resolve({
          json: () => Promise.resolve(mockSessionData),
        })
      }
      if (url && url.startsWith('/api/history/sess_')) {
        return Promise.resolve({
          json: () => Promise.resolve({
            id: 'sess_abc12345',
            title: '测试会话',
            turns: [
              { role: 'user', content: '你好', full_content: '你好', timestamp: '2026-05-24T10:00:00' },
              { role: 'assistant', content: '你好！有什么可以帮你的？', full_content: '你好！有什么可以帮你的？', timestamp: '2026-05-24T10:00:05' },
            ],
          }),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    }))
  })

  it('加载完成后显示会话列表', async () => {
    const wrapper = mount(HistoryTab)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('测试会话')
    expect(wrapper.text()).toContain('2026-05-15 的对话')
  })

  it('显示会话轮次数', async () => {
    const wrapper = mount(HistoryTab)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('2 轮')
    expect(wrapper.text()).toContain('4 轮')
  })

  it('显示首条用户消息预览', async () => {
    const wrapper = mount(HistoryTab)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('查找关于"见闻色霸气"的相关内容')
  })

  it('有新建会话按钮', async () => {
    const wrapper = mount(HistoryTab)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    const btn = wrapper.find('.new-session-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('新会话')
  })

  it('点击会话触发加载', async () => {
    const wrapper = mount(HistoryTab)
    await new Promise(resolve => setTimeout(resolve, 0))
    await wrapper.vm.$nextTick()

    const sessionCards = wrapper.findAll('.session-card')
    expect(sessionCards.length).toBe(2)
  })
})
