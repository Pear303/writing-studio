import React, { useState } from 'react';
import { Bot, Settings, Trash2, Wifi, WifiOff, Send, Square, Loader2 } from 'lucide-react';
import type { AgentState, AgentMessage } from '../../types';
import { AgentToolCallView } from './ToolCallView';

interface AgentPanelProps {
  state: AgentState;
  onSendMessage: (message: string) => void;
  onStopGeneration: () => void;
  onClearMessages: () => void;
  onCheckConnection: () => void;
  onUpdateApiUrl: (url: string) => void;
  apiUrl: string;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  state,
  onSendMessage,
  onStopGeneration,
  onClearMessages,
  onCheckConnection,
  onUpdateApiUrl,
  apiUrl,
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsUrl, setSettingsUrl] = useState(apiUrl);

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

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-vscode-border)' }}>
        <div className="flex items-center gap-2">
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
        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--color-vscode-border)', backgroundColor: 'var(--color-vscode-sidebar)' }}>
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
                borderRadius: '3px',
                backgroundColor: 'var(--color-vscode-bg)',
                color: 'var(--color-vscode-text)',
                outline: 'none',
              }}
              placeholder="http://localhost:8000"
            />
            <button
              onClick={handleSaveSettings}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                border: '1px solid var(--color-vscode-active)',
                borderRadius: '3px',
                backgroundColor: 'var(--color-vscode-active)',
                color: 'white',
                cursor: 'pointer',
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
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: 'var(--color-vscode-text)',
                cursor: 'pointer',
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
          <div className="mb-2">
            {state.activityLog.map((item, i) => (
              <div key={i} className="flex items-center gap-1 py-0.5" style={{ fontSize: '11px', opacity: 0.7 }}>
                <span>{item.icon}</span>
                <span style={{ color: item.level === 'error' ? '#dc2626' : item.level === 'running' ? '#d97706' : 'var(--color-vscode-text)' }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
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
    </div>
  );
};

const MessageBubble: React.FC<{ message: AgentMessage }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className="mb-3">
      <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: isUser ? 'var(--color-vscode-text)' : 'var(--color-vscode-active)' }}>
        {isUser ? '你' : 'Agent'}
      </div>
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
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2">
          {message.toolCalls.map((tc, i) => (
            <AgentToolCallView key={i} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
};
