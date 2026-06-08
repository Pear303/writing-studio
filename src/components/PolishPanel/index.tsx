import React, { useState, useRef, useCallback } from 'react';
import { Sparkles, StopCircle, Check, RotateCcw } from 'lucide-react';
import type { Book, Chapter } from '../../types';

interface PolishPanelProps {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  editorContent: string;
  onPolish: (params: {
    chapterContent: string;
    customInstruction: string;
  }, onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
  onReplaceEditorContent?: (content: string) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

export const PolishPanel: React.FC<PolishPanelProps> = ({
  currentBook,
  currentChapter,
  editorContent,
  onPolish,
  onReplaceEditorContent,
  showToast,
}) => {
  const [customInstruction, setCustomInstruction] = useState('');
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishedText, setPolishedText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleStartPolish = useCallback(async () => {
    if (!editorContent.trim()) {
      showToast?.('当前章节内容为空，无法润色', 'warning');
      return;
    }

    setIsPolishing(true);
    setPolishedText('');
    abortRef.current = new AbortController();

    try {
      await onPolish(
        {
          chapterContent: editorContent,
          customInstruction,
        },
        (chunk) => {
          setPolishedText(prev => prev + chunk);
        },
        abortRef.current.signal,
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('润色失败:', err);
        showToast?.('润色失败: ' + (err.message || '未知错误'), 'error');
      }
    } finally {
      setIsPolishing(false);
      abortRef.current = null;
    }
  }, [editorContent, customInstruction, onPolish, showToast]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleApply = useCallback(() => {
    if (polishedText && onReplaceEditorContent) {
      onReplaceEditorContent(polishedText);
      setPolishedText('');
      showToast?.('润色结果已应用到编辑器', 'success');
    }
  }, [polishedText, onReplaceEditorContent, showToast]);

  const handleDiscard = useCallback(() => {
    setPolishedText('');
  }, []);

  if (!currentBook) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先选择一本书籍
        </p>
      </div>
    );
  }

  if (!currentChapter) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先选择一个章节
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 标题 */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--color-vscode-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
      }}>
        <Sparkles size={16} style={{ color: 'var(--color-vscode-active)' }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>润色</span>
        <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, marginLeft: 'auto' }}>
          {currentChapter.title}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* 润色指令 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--color-vscode-text)',
            opacity: 0.7,
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <Sparkles size={12} />
            润色指令（可选）
          </div>
          <textarea
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '3px',
              backgroundColor: 'var(--color-vscode-bg)',
              color: 'var(--color-vscode-text)',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              minHeight: '60px',
              resize: 'vertical',
              lineHeight: '1.5',
            }}
            placeholder="例如：增强场景描写、优化对话节奏、提升文学性..."
            value={customInstruction}
            onChange={e => setCustomInstruction(e.target.value)}
          />
        </div>

        {/* 操作按钮 */}
        <div style={{ marginBottom: '12px' }}>
          {isPolishing ? (
            <button
              onClick={handleCancel}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                border: '1px solid rgba(220,38,38,0.3)',
                backgroundColor: 'rgba(220,38,38,0.15)',
                color: '#dc2626',
                fontWeight: 500,
              }}
            >
              <StopCircle size={14} />
              停止润色
            </button>
          ) : (
            <button
              onClick={handleStartPolish}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                border: 'none',
                backgroundColor: 'var(--color-vscode-active)',
                color: 'white',
                fontWeight: 500,
              }}
            >
              <Sparkles size={14} />
              开始润色
            </button>
          )}
        </div>

        {/* 润色结果预览 */}
        {(polishedText || isPolishing) && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-vscode-text)',
              opacity: 0.7,
              marginBottom: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              润色结果
              {isPolishing && (
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid var(--color-vscode-active)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'polish-spin 0.8s linear infinite',
                }} />
              )}
            </div>
            <div style={{
              padding: '8px 10px',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--color-vscode-text)',
              backgroundColor: 'var(--color-vscode-bg)',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '4px',
              maxHeight: '300px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {polishedText || '正在润色...'}
            </div>

            {/* 应用/放弃按钮 */}
            {!isPolishing && polishedText && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handleApply}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    border: 'none',
                    backgroundColor: 'var(--color-vscode-active)',
                    color: 'white',
                    fontWeight: 500,
                  }}
                >
                  <Check size={12} />
                  应用到编辑器
                </button>
                <button
                  onClick={handleDiscard}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    border: '1px solid var(--color-vscode-border)',
                    backgroundColor: 'var(--color-vscode-input)',
                    color: 'var(--color-vscode-text)',
                    fontWeight: 500,
                  }}
                >
                  <RotateCcw size={12} />
                  放弃
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes polish-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
