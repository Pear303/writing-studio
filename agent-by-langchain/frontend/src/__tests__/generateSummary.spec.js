import { describe, it, expect } from 'vitest'

/**
 * generateSummary 的测试副本 — ChatPanel.vue 中内联的同名函数
 */
function generateSummary(events) {
  if (!events || events.length === 0) return ''
  const parts = []
  let lastTool = ''
  let hasReply = false

  for (const evt of events) {
    switch (evt.type) {
      case 'thinking_start':
        if (parts.length === 0 || parts[parts.length - 1] !== '思考') {
          parts.push('思考')
        }
        break
      case 'tool_start':
        if (evt.tool !== lastTool) {
          parts.push('调用 ' + evt.tool)
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

describe('generateSummary', () => {
  it('正常思考→工具→回复流程', () => {
    const events = [
      { type: 'thinking_start' },
      { type: 'tool_start', tool: 'read_file' },
      { type: 'tool_end', tool: 'read_file' },
      { type: 'thinking_end' },
      { type: 'reply_token', content: 'Hello' },
    ]
    expect(generateSummary(events)).toBe('思考 → 调用 read_file → 生成回复')
  })

  it('多个工具连续调用', () => {
    const events = [
      { type: 'thinking_start' },
      { type: 'tool_start', tool: 'web_fetch' },
      { type: 'tool_end', tool: 'web_fetch' },
      { type: 'tool_start', tool: 'write_file' },
      { type: 'tool_end', tool: 'write_file' },
      { type: 'reply_token', content: 'Done' },
    ]
    expect(generateSummary(events)).toBe('思考 → 调用 web_fetch → 调用 write_file → 生成回复')
  })

  it('连续相同工具只显示一次（去重）', () => {
    const events = [
      { type: 'tool_start', tool: 'read_file' },
      { type: 'tool_start', tool: 'read_file' },
      { type: 'tool_start', tool: 'read_file' },
    ]
    expect(generateSummary(events)).toBe('调用 read_file')
  })

  it('工具出错场景', () => {
    const events = [
      { type: 'tool_start', tool: 'web_fetch' },
      { type: 'tool_error', tool: 'web_fetch', error: 'timeout' },
    ]
    expect(generateSummary(events)).toBe('调用 web_fetch → web_fetch 出错')
  })

  it('空事件数组返回空字符串', () => {
    expect(generateSummary([])).toBe('')
  })

  it('null/undefined 返回空字符串', () => {
    expect(generateSummary(null)).toBe('')
    expect(generateSummary(undefined)).toBe('')
  })

  it('仅思考无工具调用', () => {
    const events = [
      { type: 'thinking_start' },
      { type: 'thinking_end' },
      { type: 'reply_token', content: 'Just thinking' },
    ]
    expect(generateSummary(events)).toBe('思考 → 生成回复')
  })
})
