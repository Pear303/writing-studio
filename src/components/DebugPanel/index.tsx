import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, ChevronRight, Trash2, Bug, Copy, Search, Filter } from 'lucide-react';
import { debugLogger, type DebugEvent, type DebugEventCategory, type DebugEventSource } from '../../services/DebugLogger';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 分类标签颜色映射
const CATEGORY_COLORS: Record<DebugEventCategory, { bg: string; text: string }> = {
  'llm-call': { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa' },
  'template-render': { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc' },
  'prompt-compose': { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6' },
  'taskbook-compose': { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24' },
  'fact-extract': { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' },
  'review-gate': { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171' },
  'pipeline-event': { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8' },
};

const CATEGORY_LABELS: Record<DebugEventCategory, string> = {
  'llm-call': 'LLM调用',
  'template-render': '模板渲染',
  'prompt-compose': '提示词组装',
  'taskbook-compose': '任务书',
  'fact-extract': '事实提取',
  'review-gate': '审查闸门',
  'pipeline-event': 'Pipeline事件',
};

const SOURCE_LABELS: Record<DebugEventSource, string> = {
  'manual-pipeline': '手动流水线',
  'vibe-writing': 'Vibe Writing',
  'service': '服务层',
};

const ALL_CATEGORIES: DebugEventCategory[] = ['llm-call', 'template-render', 'prompt-compose', 'taskbook-compose', 'fact-extract', 'review-gate', 'pipeline-event'];

export const DebugPanel: React.FC<DebugPanelProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterCategories, setFilterCategories] = useState<Set<DebugEventCategory>>(new Set(ALL_CATEGORIES));
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // 订阅 DebugLogger 事件
  useEffect(() => {
    debugLogger.setEnabled(isOpen);
    if (isOpen) {
      setEvents(debugLogger.getEvents());
    }
    const unsubscribe = debugLogger.subscribe((newEvents) => {
      setEvents([...newEvents]);
    });
    return () => {
      unsubscribe();
      debugLogger.setEnabled(false);
    };
  }, [isOpen]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events]);

  const handleClear = useCallback(() => {
    debugLogger.clear();
    setExpandedId(null);
  }, []);

  const handleCopyEvent = useCallback((evt: DebugEvent) => {
    const text = JSON.stringify(evt, null, 2);
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const toggleCategory = useCallback((cat: DebugEventCategory) => {
    setFilterCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  // 过滤事件
  const filteredEvents = events.filter(evt => {
    if (!filterCategories.has(evt.category)) return false;
    if (searchText) {
      const lower = searchText.toLowerCase();
      return (
        evt.direction.toLowerCase().includes(lower) ||
        evt.templateId?.toLowerCase().includes(lower) ||
        evt.error?.toLowerCase().includes(lower) ||
        CATEGORY_LABELS[evt.category].includes(lower) ||
        SOURCE_LABELS[evt.source].includes(lower)
      );
    }
    return true;
  });

  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  const renderEventItem = (evt: DebugEvent) => {
    const isExpanded = expandedId === evt.id;
    const catColor = CATEGORY_COLORS[evt.category];
    const catLabel = CATEGORY_LABELS[evt.category];
    const srcLabel = SOURCE_LABELS[evt.source];

    return (
      <div
        key={evt.id}
        style={{
          borderBottom: '1px solid var(--color-vscode-border)',
          backgroundColor: isExpanded ? 'rgba(0, 122, 204, 0.04)' : 'transparent',
        }}
      >
        {/* 事件头部 */}
        <div
          style={{
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
          onClick={() => setExpandedId(isExpanded ? null : evt.id)}
        >
          {isExpanded ? (
            <ChevronDown size={12} style={{ color: 'var(--color-vscode-text)', opacity: 0.5, flexShrink: 0 }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--color-vscode-text)', opacity: 0.5, flexShrink: 0 }} />
          )}

          <span style={{ color: 'var(--color-vscode-text)', opacity: 0.4, fontSize: '10px', fontFamily: 'monospace', flexShrink: 0 }}>
            {formatTime(evt.timestamp)}
          </span>

          <span style={{
            padding: '1px 5px',
            borderRadius: '2px',
            fontSize: '10px',
            backgroundColor: catColor.bg,
            color: catColor.text,
            flexShrink: 0,
            fontWeight: 500,
          }}>
            {catLabel}
          </span>

          <span style={{
            padding: '1px 4px',
            borderRadius: '2px',
            fontSize: '9px',
            backgroundColor: 'var(--color-vscode-active-light, rgba(143, 188, 143, 0.1))',
            color: 'var(--color-vscode-active)',
            flexShrink: 0,
          }}>
            {srcLabel}
          </span>

          <span style={{
            color: 'var(--color-vscode-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            fontSize: '11px',
          }}>
            {evt.direction}
          </span>

          {evt.error && (
            <span style={{ color: '#f87171', fontSize: '10px', flexShrink: 0 }}>ERROR</span>
          )}

          {evt.usage && (
            <span style={{ color: 'var(--color-vscode-text)', opacity: 0.4, fontSize: '10px', flexShrink: 0 }}>
              {evt.usage.totalTokens}tok
            </span>
          )}

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleCopyEvent(evt); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: 'var(--color-vscode-text)',
              opacity: 0.3,
              flexShrink: 0,
            }}
            title="复制事件 JSON"
          >
            <Copy size={11} />
          </button>
        </div>

        {/* 展开详情 */}
        {isExpanded && (
          <div style={{
            padding: '6px 10px 10px 28px',
            borderTop: '1px solid var(--color-vscode-border)',
          }}>
            {/* 模板信息 */}
            {evt.templateId && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>模板</div>
                <div style={{ fontSize: '11px', color: 'var(--color-vscode-active)' }}>
                  {evt.templateId}
                  {evt.templateFile && <span style={{ opacity: 0.5 }}> ({evt.templateFile})</span>}
                </div>
              </div>
            )}

            {/* 变量 */}
            {evt.variables && Object.keys(evt.variables).length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>变量</div>
                <pre style={{
                  fontSize: '10px',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.8,
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '6px',
                  borderRadius: '3px',
                  margin: 0,
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {JSON.stringify(evt.variables, null, 2)}
                </pre>
              </div>
            )}

            {/* 系统提示词 */}
            {evt.systemPrompt && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>
                  系统提示词 ({evt.systemPrompt.length} 字)
                </div>
                <pre style={{
                  fontSize: '10px',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.8,
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '6px',
                  borderRadius: '3px',
                  margin: 0,
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {evt.systemPrompt}
                </pre>
              </div>
            )}

            {/* 用户消息 */}
            {evt.userMessage && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>
                  用户消息 ({evt.userMessage.length} 字)
                </div>
                <pre style={{
                  fontSize: '10px',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.8,
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '6px',
                  borderRadius: '3px',
                  margin: 0,
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {evt.userMessage}
                </pre>
              </div>
            )}

            {/* LLM 响应 */}
            {evt.response && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>
                  LLM 响应{evt.responseLength ? ` (${evt.responseLength} 字)` : ''}
                </div>
                <pre style={{
                  fontSize: '10px',
                  color: '#34d399',
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '6px',
                  borderRadius: '3px',
                  margin: 0,
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {evt.response}
                </pre>
              </div>
            )}

            {/* 错误 */}
            {evt.error && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: '#f87171', marginBottom: '2px' }}>错误</div>
                <pre style={{
                  fontSize: '10px',
                  color: '#f87171',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  padding: '6px',
                  borderRadius: '3px',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {evt.error}
                </pre>
              </div>
            )}

            {/* Token 用量 */}
            {evt.usage && (
              <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                Token: prompt={evt.usage.promptTokens}, completion={evt.usage.completionTokens}, total={evt.usage.totalTokens}
              </div>
            )}

            {/* 元数据 */}
            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>元数据</div>
                <pre style={{
                  fontSize: '10px',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.6,
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '4px',
                  borderRadius: '3px',
                  margin: 0,
                  maxHeight: '80px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.4',
                }}>
                  {JSON.stringify(evt.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: '480px',
      minWidth: '360px',
      borderLeft: '1px solid var(--color-vscode-border)',
      backgroundColor: 'var(--color-vscode-sidebar)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* 头部 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-vscode-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <Bug size={14} style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>
          Debug Panel
        </span>
        <span style={{
          fontSize: '10px',
          color: 'var(--color-vscode-text)',
          opacity: 0.4,
          backgroundColor: 'var(--color-vscode-active-light, rgba(143, 188, 143, 0.1))',
          padding: '1px 6px',
          borderRadius: '8px',
        }}>
          {filteredEvents.length}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: showFilters ? 'var(--color-vscode-active-light, rgba(143, 188, 143, 0.1))' : 'none',
            border: '1px solid var(--color-vscode-border)',
            borderRadius: '3px',
            padding: '2px 6px',
            cursor: 'pointer',
            color: 'var(--color-vscode-text)',
            opacity: 0.6,
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
          title="筛选分类"
        >
          <Filter size={10} />
          筛选
        </button>
        <button
          type="button"
          onClick={handleClear}
          style={{
            background: 'none',
            border: '1px solid var(--color-vscode-border)',
            borderRadius: '3px',
            padding: '2px 6px',
            cursor: 'pointer',
            color: 'var(--color-vscode-text)',
            opacity: 0.6,
            fontSize: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
          title="清空日志"
        >
          <Trash2 size={10} />
          清空
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--color-vscode-text)',
            opacity: 0.4,
          }}
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>

      {/* 筛选栏 */}
      {showFilters && (
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--color-vscode-border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          flexShrink: 0,
        }}>
          {ALL_CATEGORIES.map(cat => {
            const active = filterCategories.has(cat);
            const color = CATEGORY_COLORS[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                style={{
                  padding: '2px 6px',
                  borderRadius: '2px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: active ? color.bg : 'transparent',
                  color: active ? color.text : 'var(--color-vscode-text)',
                  opacity: active ? 1 : 0.3,
                  fontWeight: 500,
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>
      )}

      {/* 搜索栏 */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--color-vscode-border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
          border: '1px solid var(--color-vscode-border)',
          borderRadius: '3px',
          padding: '3px 8px',
        }}>
          <Search size={12} style={{ color: 'var(--color-vscode-text)', opacity: 0.4, flexShrink: 0 }} />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索方向、模板ID..."
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--color-vscode-text)',
              fontSize: '11px',
              width: '100%',
              padding: 0,
            }}
          />
        </div>
      </div>

      {/* 事件列表 */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filteredEvents.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--color-vscode-text)',
            opacity: 0.3,
            fontSize: '12px',
          }}>
            {events.length === 0 ? '暂无调试事件，请执行流水线操作' : '无匹配事件'}
          </div>
        ) : (
          filteredEvents.map(renderEventItem)
        )}
      </div>
    </div>
  );
};
