import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ChevronDown, ChevronRight, Trash2, Bug, Copy, Search, Filter, Link } from 'lucide-react';
import { debugLogger, type DebugEvent, type DebugEventCategory, type DebugEventSource } from '../../services/DebugLogger';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 分类标签映射 — 颜色通过 CSS 变量跟随主题
const CATEGORY_CSS_VARS: Record<DebugEventCategory, { text: string; bg: string }> = {
  'llm-call': { text: 'var(--color-debug-llm-call)', bg: 'var(--color-debug-llm-call-bg)' },
  'template-render': { text: 'var(--color-debug-template-render)', bg: 'var(--color-debug-template-render-bg)' },
  'prompt-compose': { text: 'var(--color-debug-prompt-compose)', bg: 'var(--color-debug-prompt-compose-bg)' },
  'taskbook-compose': { text: 'var(--color-debug-taskbook-compose)', bg: 'var(--color-debug-taskbook-compose-bg)' },
  'fact-extract': { text: 'var(--color-debug-fact-extract)', bg: 'var(--color-debug-fact-extract-bg)' },
  'review-gate': { text: 'var(--color-debug-review-gate)', bg: 'var(--color-debug-review-gate-bg)' },
  'pipeline-event': { text: 'var(--color-debug-pipeline-event)', bg: 'var(--color-debug-pipeline-event-bg)' },
  'deconstruction': { text: 'var(--color-debug-fact-extract)', bg: 'var(--color-debug-fact-extract-bg)' },
};

const CATEGORY_LABELS: Record<DebugEventCategory, string> = {
  'llm-call': 'LLM调用',
  'template-render': '模板渲染',
  'prompt-compose': '提示词组装',
  'taskbook-compose': '任务书',
  'fact-extract': '事实提取',
  'review-gate': '审查闸门',
  'pipeline-event': 'Pipeline事件',
  'deconstruction': '拆书分析',
};

const SOURCE_LABELS: Record<DebugEventSource, string> = {
  'manual-pipeline': '手动流水线',
  'vibe-writing': 'Vibe Writing',
  'standalone-polish': '独立润色',
  'service': '服务层',
};

const ALL_CATEGORIES: DebugEventCategory[] = ['llm-call', 'template-render', 'prompt-compose', 'taskbook-compose', 'fact-extract', 'review-gate', 'pipeline-event'];
const ALL_SOURCES: DebugEventSource[] = ['manual-pipeline', 'vibe-writing', 'standalone-polish', 'service'];

// ── 子组件：事件详情 ──

const EventDetailSection: React.FC<{
  label: string;
  content: string;
  maxContentHeight?: string;
  contentColor?: string;
  contentBgColor?: string;
}> = ({ label, content, maxContentHeight = '200px', contentColor, contentBgColor }) => (
  <div style={{ marginBottom: '8px' }}>
    <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>
      {label}
    </div>
    <pre style={{
      fontSize: '10px',
      color: contentColor || 'var(--color-vscode-text)',
      opacity: 0.8,
      backgroundColor: contentBgColor || 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
      padding: '6px',
      borderRadius: '3px',
      margin: 0,
      maxHeight: maxContentHeight,
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      lineHeight: '1.4',
    }}>
      {content}
    </pre>
  </div>
);

// ── 子组件：单条事件 ──

const EventItem: React.FC<{
  evt: DebugEvent;
  isExpanded: boolean;
  relatedEvents: DebugEvent[];
  onToggleExpand: (id: string) => void;
  onCopyEvent: (evt: DebugEvent) => void;
}> = ({ evt, isExpanded, relatedEvents, onToggleExpand, onCopyEvent }) => {
  const catColor = CATEGORY_CSS_VARS[evt.category];
  const catLabel = CATEGORY_LABELS[evt.category];
  const srcLabel = SOURCE_LABELS[evt.source];

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  };

  return (
    <div
      style={{
        borderBottom: '1px solid var(--color-vscode-border)',
        backgroundColor: isExpanded ? 'var(--color-vscode-active-light)' : 'transparent',
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
        onClick={() => onToggleExpand(evt.id)}
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
          backgroundColor: 'var(--color-vscode-active-light)',
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

        {evt.correlationId && (
          <span style={{ color: 'var(--color-vscode-active)', fontSize: '9px', flexShrink: 0, opacity: 0.6 }} title={`关联ID: ${evt.correlationId}`}>
            <Link size={10} />
          </span>
        )}

        {evt.error && (
          <span style={{ color: 'var(--color-debug-error)', fontSize: '10px', flexShrink: 0 }}>ERROR</span>
        )}

        {evt.usage && (
          <span style={{ color: 'var(--color-vscode-text)', opacity: 0.4, fontSize: '10px', flexShrink: 0 }}>
            {evt.usage.totalTokens}tok
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCopyEvent(evt); }}
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
          {/* 关联事件 */}
          {evt.correlationId && relatedEvents.length > 1 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-vscode-active)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Link size={10} />
                关联流程 ({relatedEvents.length} 步)
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {relatedEvents.map(re => (
                  <span
                    key={re.id}
                    style={{
                      padding: '1px 5px',
                      borderRadius: '2px',
                      fontSize: '9px',
                      backgroundColor: re.id === evt.id ? 'var(--color-vscode-active-light)' : 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                      color: re.id === evt.id ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                      opacity: re.id === evt.id ? 1 : 0.6,
                      cursor: 'pointer',
                      border: re.id === evt.id ? '1px solid var(--color-vscode-active)' : '1px solid transparent',
                    }}
                    onClick={() => onToggleExpand(re.id)}
                  >
                    {CATEGORY_LABELS[re.category]}
                  </span>
                ))}
              </div>
            </div>
          )}

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
            <EventDetailSection label="变量" content={JSON.stringify(evt.variables, null, 2)} maxContentHeight="120px" />
          )}

          {/* 系统提示词 */}
          {evt.systemPrompt && (
            <EventDetailSection label={`系统提示词 (${evt.systemPrompt.length} 字)`} content={evt.systemPrompt} />
          )}

          {/* 用户消息 */}
          {evt.userMessage && (
            <EventDetailSection label={`用户消息 (${evt.userMessage.length} 字)`} content={evt.userMessage} />
          )}

          {/* 完整消息列表 */}
          {evt.fullMessages && evt.fullMessages.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '2px' }}>
                消息列表 ({evt.fullMessages.length} 条)
              </div>
              <div style={{
                backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                padding: '6px',
                borderRadius: '3px',
                maxHeight: '300px',
                overflow: 'auto',
              }}>
                {evt.fullMessages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: i < evt.fullMessages!.length - 1 ? '6px' : '0' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0px 4px',
                      borderRadius: '2px',
                      fontSize: '9px',
                      fontWeight: 600,
                      marginRight: '4px',
                      backgroundColor: msg.role === 'system' ? 'var(--color-debug-llm-call-bg)' : msg.role === 'human' || msg.role === 'user' ? 'var(--color-debug-fact-extract-bg)' : 'var(--color-debug-template-render-bg)',
                      color: msg.role === 'system' ? 'var(--color-debug-llm-call)' : msg.role === 'human' || msg.role === 'user' ? 'var(--color-debug-fact-extract)' : 'var(--color-debug-template-render)',
                    }}>
                      {msg.role}
                    </span>
                    <pre style={{
                      fontSize: '10px',
                      color: 'var(--color-vscode-text)',
                      opacity: 0.8,
                      margin: 0,
                      maxHeight: '150px',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: '1.4',
                    }}>
                      {msg.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LLM 响应 */}
          {evt.response && (
            <EventDetailSection
              label={`LLM 响应${evt.responseLength ? ` (${evt.responseLength} 字)` : ''}`}
              content={evt.response}
              contentColor="var(--color-debug-response)"
            />
          )}

          {/* 错误 */}
          {evt.error && (
            <EventDetailSection
              label="错误"
              content={evt.error}
              contentColor="var(--color-debug-error)"
              contentBgColor="var(--color-debug-error-bg)"
            />
          )}

          {/* Token 用量 */}
          {evt.usage && (
            <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              Token: prompt={evt.usage.promptTokens}, completion={evt.usage.completionTokens}, total={evt.usage.totalTokens}
            </div>
          )}

          {/* 元数据 */}
          {evt.metadata && Object.keys(evt.metadata).length > 0 && (
            <EventDetailSection label="元数据" content={JSON.stringify(evt.metadata, null, 2)} maxContentHeight="80px" />
          )}
        </div>
      )}
    </div>
  );
};

// ── 主组件 ──

export const DebugPanel: React.FC<DebugPanelProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategories, setFilterCategories] = useState<Set<DebugEventCategory>>(new Set(ALL_CATEGORIES));
  const [filterSource, setFilterSource] = useState<DebugEventSource | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

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

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // 预计算 correlationId 分组
  const correlationGroups = useMemo(() => {
    const groups = new Map<string, DebugEvent[]>();
    for (const evt of events) {
      if (evt.correlationId) {
        let group = groups.get(evt.correlationId);
        if (!group) {
          group = [];
          groups.set(evt.correlationId, group);
        }
        group.push(evt);
      }
    }
    return groups;
  }, [events]);

  // 过滤事件（使用防抖后的搜索文本）
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (!filterCategories.has(evt.category)) return false;
      if (filterSource !== 'all' && evt.source !== filterSource) return false;
      if (debouncedSearch) {
        const lower = debouncedSearch.toLowerCase();
        return (
          evt.direction.toLowerCase().includes(lower) ||
          evt.templateId?.toLowerCase().includes(lower) ||
          evt.error?.toLowerCase().includes(lower) ||
          evt.correlationId?.toLowerCase().includes(lower) ||
          evt.systemPrompt?.toLowerCase().includes(lower) ||
          evt.userMessage?.toLowerCase().includes(lower) ||
          CATEGORY_LABELS[evt.category].includes(lower) ||
          SOURCE_LABELS[evt.source].includes(lower)
        );
      }
      return true;
    });
  }, [events, filterCategories, filterSource, debouncedSearch]);

  if (!isOpen) return null;

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
          backgroundColor: 'var(--color-vscode-active-light)',
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
            background: showFilters ? 'var(--color-vscode-active-light)' : 'none',
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

      {/* 来源 Tab */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-vscode-border)',
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => setFilterSource('all')}
          style={{
            padding: '5px 10px',
            fontSize: '10px',
            cursor: 'pointer',
            border: 'none',
            borderBottom: filterSource === 'all' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: filterSource === 'all' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            opacity: filterSource === 'all' ? 1 : 0.5,
            fontWeight: filterSource === 'all' ? 600 : 400,
          }}
        >
          全部
        </button>
        {ALL_SOURCES.map(src => (
          <button
            key={src}
            type="button"
            onClick={() => setFilterSource(src)}
            style={{
              padding: '5px 10px',
              fontSize: '10px',
              cursor: 'pointer',
              border: 'none',
              borderBottom: filterSource === src ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: filterSource === src ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
              opacity: filterSource === src ? 1 : 0.5,
              fontWeight: filterSource === src ? 600 : 400,
            }}
          >
            {SOURCE_LABELS[src]}
          </button>
        ))}
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
            const color = CATEGORY_CSS_VARS[cat];
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
            placeholder="搜索方向、模板ID、关联ID..."
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
          filteredEvents.map(evt => (
            <EventItem
              key={evt.id}
              evt={evt}
              isExpanded={expandedId === evt.id}
              relatedEvents={evt.correlationId ? (correlationGroups.get(evt.correlationId) || []) : []}
              onToggleExpand={handleToggleExpand}
              onCopyEvent={handleCopyEvent}
            />
          ))
        )}
      </div>
    </div>
  );
};
