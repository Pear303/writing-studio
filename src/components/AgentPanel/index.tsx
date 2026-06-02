import React, { useState, useEffect } from 'react';
import { Bot, Settings, Trash2, Wifi, WifiOff, Send, Square, Loader2, ChevronRight, ChevronDown, Plus, MessageSquare, PanelLeftClose, PanelLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState, AgentMessage, AgentActivityItem, AgentSession } from '../../types';
import { AgentToolCallView } from './ToolCallView';

interface AgentPanelProps {
  state: AgentState;
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
  onClearMessages: () => void;
  onCheckConnection: () => void;
  onUpdateApiUrl: (url: string) => void;
  onLoadSessions: () => void;
  onCreateSession: (title?: string) => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  apiUrl: string;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  state,
  onSendMessage,
  onStopGeneration,
  onClearMessages,
  onCheckConnection,
  onUpdateApiUrl,
  onLoadSessions,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  apiUrl,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsUrl, setSettingsUrl] = useState(apiUrl);
  const [showSessionList, setShowSessionList] = useState(false);

  const handleSend = () => {
    const msg = inputMessage.trim();
    if (!msg || state.running) return;
    onSendMessage(msg);
    setInputMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    onUpdateApiUrl(settingsUrl);
    setShowSettings(false);
  };

  useEffect(() => {
    if (state.connected && state.sessions.length === 0) {
      onLoadSessions();
    }
  }, [state.connected]);

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      {showSessionList && (
        <div
          className="flex flex-col border-r"
          style={{
            width: '200px',
            minWidth: '200px',
            borderColor: 'var(--color-vscode-border)',
            backgroundColor: 'var(--color-vscode-sidebar)',
          }}
        >
          <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: 'var(--color-vscode-border)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>会话历史</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onCreateSession()}
                className="p-1 rounded hover:bg-vscode-active/10"
                style={{ color: 'var(--color-vscode-text)' }}
                title="新建会话"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => setShowSessionList(false)}
                className="p-1 rounded hover:bg-vscode-active/10"
                style={{ color: 'var(--color-vscode-text)' }}
                title="关闭侧栏"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {state.sessions.length === 0 && (
              <div className="px-2 py-4 text-center" style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                暂无会话
              </div>
            )}
            {state.sessions.map(session => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === state.sessionId}
                onSwitch={() => onSwitchSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-vscode-border)' }}>
          <div className="flex items-center gap-2">
            {!showSessionList && (
              <button
                onClick={() => { setShowSessionList(true); onLoadSessions(); }}
                className="p-1 rounded hover:bg-vscode-active/10"
                style={{ color: 'var(--color-vscode-text)' }}
                title="会话历史"
              >
                <PanelLeft size={14} />
              </button>
            )}
            <Bot size={16} style={{ color: 'var(--color-vscode-active)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>Agent</span>
            {state.connected ? (
              <Wifi size={12} style={{ color: '#16a34a' }} />
            ) : (
              <WifiOff size={12} style={{ color: '#dc2626' }} />
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onClearMessages}
              className="p-1 rounded hover:bg-vscode-active/10"
              style={{ color: 'var(--color-vscode-text)' }}
              title="清空对话"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => { setSettingsUrl(apiUrl); setShowSettings(!showSettings); }}
              className="p-1 rounded hover:bg-vscode-active/10"
              style={{ color: 'var(--color-vscode-text)' }}
              title="设置"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="px-3 py-2 border-b animate-dropdown-in" style={{ borderColor: 'var(--color-vscode-border)', backgroundColor: 'var(--color-vscode-sidebar)' }}>
            <label style={{ fontSize: '11px', color: 'var(--color-vscode-text)', display: 'block', marginBottom: '4px' }}>Agent 后端地址</label>
            <div className="flex gap-1">
              <input
                type="text"
                value={settingsUrl}
                onChange={e => setSettingsUrl(e.target.value)}
                style={{
                  flex: 1,
                  padding: '3px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-vscode-bg)',
                  color: 'var(--color-vscode-text)',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-vscode-active)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--color-vscode-border)'; }}
                placeholder="http://localhost:8000"
              />
              <button
                onClick={handleSaveSettings}
                style={{
                  padding: '3px 10px',
                  fontSize: '11px',
                  border: '1px solid var(--color-vscode-active)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--color-vscode-active)',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
              >
                保存
              </button>
              <button
                onClick={onCheckConnection}
                style={{
                  padding: '3px 10px',
                  fontSize: '11px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: 'var(--color-vscode-text)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                测试
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ minHeight: 0 }}>
          {state.messages.length === 0 && state.activityLog.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              <Bot size={40} className="mb-3" />
              <p style={{ fontSize: '13px' }}>与 Agent 对话，开始智能写作</p>
              <p style={{ fontSize: '11px', marginTop: '4px' }}>输入你的需求，Agent 将自主规划和执行</p>
            </div>
          )}

          {state.messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {state.running && state.currentStreamContent && (
            <div className="mb-2" style={{ fontSize: '13px', color: 'var(--color-vscode-text)' }}>
              <span style={{ color: 'var(--color-vscode-active)', fontSize: '11px', fontWeight: 600 }}>Agent</span>
              <div className="agent-markdown-body mt-1" style={{ lineHeight: '1.5' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.currentStreamContent}</ReactMarkdown>
                <span className="animate-pulse">▎</span>
              </div>
            </div>
          )}

          {state.running && !state.currentStreamContent && state.activityLog.length > 0 && (
            <div className="mb-2 flex items-center gap-2" style={{ color: 'var(--color-vscode-text)', fontSize: '12px', opacity: 0.7 }}>
              <Loader2 size={12} className="animate-spin" />
              <span>Agent 正在工作...</span>
            </div>
          )}

          {state.activityLog.length > 0 && (
            <ActivityLogView items={state.activityLog} running={state.running} />
          )}

          {state.error && (
            <div className="mb-2 p-2 rounded" style={{ backgroundColor: '#dc262620', color: '#dc2626', fontSize: '12px' }}>
              {state.error}
            </div>
          )}

          {state.messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {state.running && state.currentStreamContent && (
            <div className="mb-2" style={{ fontSize: '13px', color: 'var(--color-vscode-text)' }}>
              <span style={{ color: 'var(--color-vscode-active)', fontSize: '11px', fontWeight: 600 }}>Agent</span>
              <div className="mt-1" style={{ lineHeight: '1.5' }}>
                {state.currentStreamContent}
                <span className="animate-pulse">▎</span>
              </div>
            </div>
          )}

          {state.running && !state.currentStreamContent && state.activityLog.length > 0 && (
            <div className="mb-2 flex items-center gap-2" style={{ color: 'var(--color-vscode-text)', fontSize: '12px', opacity: 0.7 }}>
              <Loader2 size={12} className="animate-spin" />
              <span>Agent 正在工作...</span>
            </div>
          )}

          {state.activityLog.length > 0 && (
            <ActivityLogView items={state.activityLog} running={state.running} />
          )}

          {state.error && (
            <div className="mb-2 p-2 rounded" style={{ backgroundColor: '#dc262620', color: '#dc2626', fontSize: '12px' }}>
              {state.error}
            </div>
          )}
        </div>

        {state.tokenUsage.total > 0 && (
          <div className="px-3 py-1 border-t flex items-center gap-3" style={{ borderColor: 'var(--color-vscode-border)', fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
            <span>Tokens: {state.tokenUsage.input} in / {state.tokenUsage.output} out</span>
          </div>
        )}

        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-vscode-border)' }}>
          <div className="flex gap-1">
            <textarea
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={state.connected ? '输入消息... (Enter 发送)' : 'Agent 未连接，请检查设置'}
              disabled={state.running || !state.connected}
              rows={1}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '4px',
                backgroundColor: 'var(--color-vscode-bg)',
                color: 'var(--color-vscode-text)',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.4',
                minHeight: '34px',
                maxHeight: '120px',
              }}
            />
            {state.running ? (
              <button
                onClick={onStopGeneration}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dc2626',
                  borderRadius: '4px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                }}
                title="停止生成"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputMessage.trim() || !state.connected}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-vscode-active)',
                  borderRadius: '4px',
                  backgroundColor: inputMessage.trim() && state.connected ? 'var(--color-vscode-active)' : 'transparent',
                  color: inputMessage.trim() && state.connected ? 'white' : 'var(--color-vscode-text)',
                  cursor: inputMessage.trim() && state.connected ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  opacity: inputMessage.trim() && state.connected ? 1 : 0.5,
                }}
                title="发送"
              >
                <Send size={12} />
              </button>
            )}
          </div>
        </div>

        {state.tokenUsage.total > 0 && (
          <div className="px-3 py-1 border-t flex items-center gap-3" style={{ borderColor: 'var(--color-vscode-border)', fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
            <span>Tokens: {state.tokenUsage.input} in / {state.tokenUsage.output} out</span>
          </div>
        )}

        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-vscode-border)' }}>
          <div className="flex gap-1">
            <textarea
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={state.connected ? '输入消息... (Enter 发送)' : 'Agent 未连接，请检查设置'}
              disabled={state.running || !state.connected}
              rows={1}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '13px',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '6px',
                backgroundColor: 'var(--color-vscode-bg)',
                color: 'var(--color-vscode-text)',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.4',
                minHeight: '34px',
                maxHeight: '120px',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--color-vscode-active)';
                e.target.style.boxShadow = '0 0 0 1px var(--color-vscode-active)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-vscode-border)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {state.running ? (
              <button
                onClick={onStopGeneration}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  transition: 'opacity 0.15s ease',
                }}
                title="停止生成"
              >
                <Square size={12} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputMessage.trim() || !state.connected}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-vscode-active)',
                  borderRadius: '6px',
                  backgroundColor: inputMessage.trim() && state.connected ? 'var(--color-vscode-active)' : 'transparent',
                  color: inputMessage.trim() && state.connected ? 'white' : 'var(--color-vscode-text)',
                  cursor: inputMessage.trim() && state.connected ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  opacity: inputMessage.trim() && state.connected ? 1 : 0.5,
                  transition: 'background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease',
                }}
                title="发送"
              >
                <Send size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SessionItem: React.FC<{
  session: AgentSession;
  isActive: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}> = ({ session, isActive, onSwitch, onDelete }) => {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 cursor-pointer group"
      style={{
        backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : hovering ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
      onClick={onSwitch}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <MessageSquare size={12} style={{ flexShrink: 0, opacity: 0.5, color: 'var(--color-vscode-text)' }} />
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{
            fontSize: '11px',
            color: 'var(--color-vscode-text)',
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {session.firstUserMessage || session.title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.4 }}>
          {session.turnCount} 轮 · {session.updatedAt.slice(0, 10)}
        </div>
      </div>
      {hovering && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-0.5 rounded hover:bg-red-500/20"
          style={{ color: '#dc2626', flexShrink: 0 }}
          title="删除会话"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const [toolCallsExpanded, setToolCallsExpanded] = useState(false);

  const toolCalls = message.toolCalls || [];
  const completedCount = toolCalls.filter(tc => tc.status === 'completed').length;
  const runningCount = toolCalls.filter(tc => tc.status === 'running').length;
  const errorCount = toolCalls.filter(tc => tc.status === 'error').length;

  return (
    <div className="mb-3">
      <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: isUser ? 'var(--color-vscode-text)' : 'var(--color-vscode-active)' }}>
        {isUser ? '你' : 'Agent'}
      </div>
      {!message.isStreaming && (
        isUser ? (
          <div
            style={{
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--color-vscode-text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {message.content}
          </div>
        ) : (
          <div className="agent-markdown-body" style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-vscode-text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )
      )}
      {toolCalls.length > 0 && (
        <div className="mt-2">
          <div
            className="rounded"
            style={{
              border: '1px solid var(--color-vscode-border)',
              backgroundColor: 'var(--color-vscode-sidebar)',
              fontSize: '11px',
            }}
          >
            <button
              onClick={() => setToolCallsExpanded(!toolCallsExpanded)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
              style={{ color: 'var(--color-vscode-text)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              {toolCallsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span style={{ opacity: 0.7 }}>
                工具调用 ({toolCalls.length} 次
                {completedCount > 0 && ` · ✅${completedCount}`}
                {runningCount > 0 && ` · ⏳${runningCount}`}
                {errorCount > 0 && ` · ❌${errorCount}`})
              </span>
            </button>

            {toolCallsExpanded && (
              <div className="px-2 pb-2" style={{ borderTop: '1px solid var(--color-vscode-border)' }}>
                {toolCalls.map((tc, i) => (
                  <AgentToolCallView key={i} toolCall={tc} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ActivityLogView: React.FC<{ items: AgentActivityItem[]; running: boolean }> = ({ items, running }) => {
  const [expanded, setExpanded] = useState(false);

  const counts = {
    thinking: items.filter(i => i.type === 'thinking_start' || i.type === 'thinking_end').length,
    tool: items.filter(i => i.type === 'tool_start' || i.type === 'tool_end').length,
    error: items.filter(i => i.level === 'error').length,
  };

  const parts: string[] = [];
  if (counts.thinking > 0) parts.push(`🧠 ${counts.thinking}`);
  if (counts.tool > 0) parts.push(`🔧 ${counts.tool}`);
  if (counts.error > 0) parts.push(`❌ ${counts.error}`);

  return (
    <div
      className="mb-2 rounded"
      style={{
        border: '1px solid var(--color-vscode-border)',
        backgroundColor: 'var(--color-vscode-sidebar)',
        fontSize: '11px',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
        style={{ color: 'var(--color-vscode-text)', cursor: 'pointer', background: 'none', border: 'none' }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {running && <Loader2 size={11} className="animate-spin" style={{ color: '#d97706' }} />}
        <span style={{ opacity: 0.7 }}>
          活动日志 {parts.length > 0 && `(${parts.join(' ')})`}
        </span>
      </button>

      {expanded && (
        <div
          className="px-2 pb-2"
          style={{ borderTop: '1px solid var(--color-vscode-border)', maxHeight: '200px', overflowY: 'auto' }}
        >
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-1 py-0.5" style={{ opacity: 0.7 }}>
              <span>{item.icon}</span>
              <span style={{
                color: item.level === 'error' ? '#dc2626' : item.level === 'running' ? '#d97706' : 'var(--color-vscode-text)',
              }}>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
