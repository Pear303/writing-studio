import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatPanel from '../components/ChatPanel.vue'

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 50))
}

function makeFetchMock(todoData) {
  return vi.fn((url) => {
    if (url === '/api/todo') {
      return Promise.resolve({
        json: () => Promise.resolve(todoData),
      })
    }
    if (url === '/api/tokens') {
      return Promise.resolve({
        json: () => Promise.resolve({
          session_total: { input: 0, output: 0, total: 0 },
        }),
      })
    }
    return Promise.reject(new Error('Unknown URL'))
  })
}

describe('ChatPanel - Todo Bar', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('存在任务时显示 Todo 进度条', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      todos: [
        { id: 1, content: '任务一', status: 'completed' },
        { id: 2, content: '任务二', status: 'in_progress' },
        { id: 3, content: '任务三', status: 'pending' },
      ],
      total: 3, completed: 1, in_progress: 1, pending: 1,
    }))

    const wrapper = mount(ChatPanel)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.todo-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('任务进度')
  })

  it('显示任务统计信息', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      todos: [
        { id: 1, content: '任务一', status: 'completed' },
        { id: 2, content: '任务二', status: 'in_progress' },
      ],
      total: 2, completed: 1, in_progress: 1, pending: 0,
    }))

    const wrapper = mount(ChatPanel)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('1 项完成')
    expect(wrapper.text()).toContain('1 项进行中')
    expect(wrapper.text()).toContain('任务二')
  })

  it('折叠/展开切换功能', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      todos: [
        { id: 1, content: '任务一', status: 'completed' },
        { id: 2, content: '任务二', status: 'in_progress' },
      ],
      total: 2, completed: 1, in_progress: 1, pending: 0,
    }))

    const wrapper = mount(ChatPanel)
    await flushPromises()
    await wrapper.vm.$nextTick()

    const collapseBtn = wrapper.find('.todo-collapse-btn')
    expect(collapseBtn.text()).toBe('收起')

    await collapseBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.todo-body').exists()).toBe(false)

    await collapseBtn.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.todo-body').exists()).toBe(true)
  })

  it('无任务时隐藏进度条', async () => {
    vi.stubGlobal('fetch', makeFetchMock({
      todos: [], total: 0, completed: 0, in_progress: 0, pending: 0,
    }))

    const wrapper = mount(ChatPanel)
    await flushPromises()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.todo-bar').exists()).toBe(false)
  })
})
