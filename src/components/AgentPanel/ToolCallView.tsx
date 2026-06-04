import React, { useState } from 'react';
import type { AgentToolCall } from '../../types';
import { ChevronRight, ChevronDown, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface ToolCallViewProps {
  toolCall: AgentToolCall;
}

export const AgentToolCallView: React.FC<ToolCallViewProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-warning, #d97706)' }} />;
      case 'completed':
        return <CheckCircle size={12} style={{ color: 'var(--color-success, #16a34a)' }} />;
      case 'error':
        return <XCircle size={12} style={{ color: 'var(--color-danger, #dc2626)' }} />;
    }
  };

  const statusLabel = () => {
    switch (toolCall.status) {
      case 'running': return '执行中';
      case 'completed': return '完成';
      case 'error': return '失败';
    }
  };

  return (
    <div
      className="rounded mb-1"
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
        <Wrench size={11} style={{ opacity: 0.6 }} />
        <span style={{ fontWeight: 500 }}>{toolCall.tool}</span>
        {statusIcon()}
        <span style={{ opacity: 0.5, fontSize: '10px' }}>{statusLabel()}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2" style={{ borderTop: '1px solid var(--color-vscode-border)' }}>
          {toolCall.input && (
            <div className="mt-1">
              <div style={{ opacity: 0.5, fontSize: '10px', marginBottom: '2px' }}>输入</div>
              <pre
                style={{
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  maxHeight: '120px',
                  overflow: 'auto',
                  color: 'var(--color-vscode-text)',
                }}
              >
                {toolCall.input}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div className="mt-1">
              <div style={{ opacity: 0.5, fontSize: '10px', marginBottom: '2px' }}>输出</div>
              <pre
                style={{
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  maxHeight: '120px',
                  overflow: 'auto',
                  color: 'var(--color-vscode-text)',
                }}
              >
                {toolCall.output}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div className="mt-1">
              <div style={{ color: 'var(--color-danger, #dc2626)', fontSize: '10px', marginBottom: '2px' }}>错误</div>
              <pre
                style={{
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  color: '#dc2626',
                }}
              >
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
