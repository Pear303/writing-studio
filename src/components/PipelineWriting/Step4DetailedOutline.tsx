import React, { useState, useRef, useCallback } from 'react';
import { Copy, Upload, Loader2, RefreshCw, CheckSquare, Square, ExternalLink, XCircle } from 'lucide-react';
import type { PipelineStep2State, PipelineStep4State, DetailedOutlineChapter, DetailedOutlineRound } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface Step4DetailedOutlineProps {
  step2State: PipelineStep2State | null;
  step4State: PipelineStep4State | null;
  onStep4StateChange: (state: PipelineStep4State) => void;
  onGenerateDetailedOutline: (outline: string, chapterCount: number) => Promise<string>;
  onRefineDetailedOutline: (step4State: PipelineStep4State, round: DetailedOutlineRound, outline: string) => Promise<string>;
  onRefineDetailedOutlineChapter: (step4State: PipelineStep4State, chapterIndices: number[], round: DetailedOutlineRound, outline: string) => Promise<string>;
  onOverwriteOutline: (markdown: string) => void;
  onPreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
  onCancelGeneration?: () => void;
}

const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'warning'): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '5px 12px',
    fontSize: '12px',
    border: '1px solid var(--color-vscode-border)',
    borderRadius: '3px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  };
  if (variant === 'primary') {
    return { ...base, backgroundColor: 'var(--color-vscode-active)', color: 'white', borderColor: 'var(--color-vscode-active)' };
  }
  if (variant === 'danger') {
    return { ...base, backgroundColor: 'var(--color-danger, #dc2626)', color: 'white', borderColor: 'var(--color-danger, #dc2626)' };
  }
  if (variant === 'warning') {
    return { ...base, backgroundColor: 'var(--color-warning, #d97706)', color: 'white', borderColor: 'var(--color-warning, #d97706)' };
  }
  return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-active-text, var(--color-vscode-text))' };
};

const compactInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px',
  fontSize: '13px',
  border: '1px solid var(--color-vscode-border)',
  borderRadius: '3px',
  backgroundColor: 'var(--color-vscode-bg)',
  color: 'var(--color-vscode-text)',
  outline: 'none',
  boxSizing: 'border-box' as const,
  minHeight: '28px',
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: '1.4',
};

function parseChaptersFromText(text: string, _count: number): DetailedOutlineChapter[] {
  const chapters: DetailedOutlineChapter[] = [];
  const sections = text.split(/\n---\n/).filter(s => s.trim());

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    const titleMatch = section.match(/^##\s*第\d+章[：:]\s*(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : `第${i + 1}章`;
    const content = section.replace(/^##\s*第\d+章[：:]\s*.+\n?/, '').trim();
    chapters.push({ index: i, title, content });
  }

  if (chapters.length === 0) {
    chapters.push({ index: 0, title: '第1章', content: text.trim() });
  }

  return chapters;
}

function chaptersToText(chapters: DetailedOutlineChapter[]): string {
  return chapters.map(ch => `## 第${ch.index + 1}章：${ch.title}\n${ch.content}`).join('\n---\n');
}

type ReworkMode = 'all' | 'selected';

export const Step4DetailedOutline: React.FC<Step4DetailedOutlineProps> = ({
  step2State,
  step4State,
  onStep4StateChange,
  onGenerateDetailedOutline,
  onRefineDetailedOutline,
  onRefineDetailedOutlineChapter,
  onOverwriteOutline,
  onPreviewInEditor,
  onCancelGeneration,
}) => {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [chapterCount, setChapterCount] = useState(step4State?.chapterCount || 5);
  const [additions, setAdditions] = useState('');
  const [deletions, setDeletions] = useState('');
  const [modifications, setModifications] = useState('');
  const [reworkMode, setReworkMode] = useState<ReworkMode>('all');
  const [selectedChapterIndices, setSelectedChapterIndices] = useState<number[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [listHeight, setListHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);

  const outlineText = step2State?.currentOutline || '';
  const hasChapters = (step4State?.chapters.length ?? 0) > 0;
  const roundCount = step4State?.rounds.length || 0;

  const handleGenerate = async () => {
    if (!outlineText) {
      setError('没有可用的大纲，请先在第2步生成大纲');
      return;
    }
    setIsWorking(true);
    setError(null);
    try {
      const result = await onGenerateDetailedOutline(outlineText, chapterCount);
      const chapters = parseChaptersFromText(result, chapterCount);
      onStep4StateChange({
        chapterCount,
        chapters,
        rounds: [],
      });
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // 用户主动取消
      } else {
        setError(err instanceof Error ? err.message : '生成细纲失败');
      }
    } finally {
      setIsWorking(false);
    }
  };

  const handleRefine = async () => {
    if (!step4State) return;
    setIsWorking(true);
    setError(null);

    const hasInput = additions.trim() || deletions.trim() || modifications.trim();

    if (!hasInput) {
      try {
        const result = await onGenerateDetailedOutline(outlineText, step4State.chapterCount);
        const chapters = parseChaptersFromText(result, step4State.chapterCount);
        onStep4StateChange({
          ...step4State,
          chapters,
          rounds: [],
        });
      } catch (err) {
        if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
          // 用户主动取消
        } else {
          setError(err instanceof Error ? err.message : '回炉重造失败');
        }
      } finally {
        setIsWorking(false);
      }
      return;
    }

    const currentRound: DetailedOutlineRound = {
      additions: additions.trim(),
      deletions: deletions.trim(),
      modifications: modifications.trim(),
      selectedChapterIndices: reworkMode === 'selected' ? selectedChapterIndices : [],
    };

    try {
      if (reworkMode === 'selected' && selectedChapterIndices.length > 0) {
        const result = await onRefineDetailedOutlineChapter(step4State, selectedChapterIndices, currentRound, outlineText);
        const updatedChapters = parseChaptersFromText(result, step4State.chapterCount);
        const newChapters = [...step4State.chapters];
        for (const updated of updatedChapters) {
          const idx = newChapters.findIndex(ch => ch.index === updated.index);
          if (idx >= 0) {
            newChapters[idx] = updated;
          }
        }
        onStep4StateChange({
          ...step4State,
          chapters: newChapters,
          rounds: [...step4State.rounds, currentRound],
        });
      } else {
        const result = await onRefineDetailedOutline(step4State, currentRound, outlineText);
        const chapters = parseChaptersFromText(result, step4State.chapterCount);
        onStep4StateChange({
          ...step4State,
          chapters,
          rounds: [...step4State.rounds, currentRound],
        });
      }
      setAdditions('');
      setDeletions('');
      setModifications('');
      setSelectedChapterIndices([]);
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // 用户主动取消
      } else {
        setError(err instanceof Error ? err.message : '回炉重造失败');
      }
    } finally {
      setIsWorking(false);
    }
  };

  const handleChapterContentEdit = (index: number, content: string) => {
    if (!step4State) return;
    const newChapters = [...step4State.chapters];
    const chIdx = newChapters.findIndex(ch => ch.index === index);
    if (chIdx >= 0) {
      newChapters[chIdx] = { ...newChapters[chIdx], content };
      onStep4StateChange({ ...step4State, chapters: newChapters });
    }
  };

  const handleChapterTitleEdit = (index: number, title: string) => {
    if (!step4State) return;
    const newChapters = [...step4State.chapters];
    const chIdx = newChapters.findIndex(ch => ch.index === index);
    if (chIdx >= 0) {
      newChapters[chIdx] = { ...newChapters[chIdx], title };
      onStep4StateChange({ ...step4State, chapters: newChapters });
    }
  };

  const toggleChapterSelection = (index: number) => {
    setSelectedChapterIndices(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleCopy = async () => {
    if (!step4State) return;
    const text = chaptersToText(step4State.chapters);
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleOverwrite = () => {
    setShowConfirm(true);
  };

  const confirmOverwrite = () => {
    setShowConfirm(false);
    if (step4State) {
      onOverwriteOutline(chaptersToText(step4State.chapters));
    }
  };

  const handlePreviewInEditor = () => {
    if (onPreviewInEditor && step4State) {
      onPreviewInEditor(
        roundCount > 0 ? `第${roundCount + 1}轮细纲` : '第一轮细纲',
        chaptersToText(step4State.chapters),
        (newContent: string) => {
          const chapters = parseChaptersFromText(newContent, step4State.chapterCount);
          onStep4StateChange({ ...step4State, chapters });
        },
      );
    }
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = listHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(60, Math.min(startHeight + delta, 600));
      setListHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [listHeight]);

  const numberInputStyle: React.CSSProperties = {
    width: '60px',
    padding: '4px 8px',
    fontSize: '13px',
    border: '1px solid var(--color-vscode-border)',
    borderRadius: '3px',
    backgroundColor: 'var(--color-vscode-bg)',
    color: 'var(--color-vscode-text)',
    outline: 'none',
    textAlign: 'center' as const,
  };

  const chapterCardStyle = (isSelected: boolean): React.CSSProperties => ({
    border: `1px solid ${isSelected ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
    borderRadius: '3px',
    marginBottom: '4px',
    backgroundColor: isSelected ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
    overflow: 'hidden',
  });

  const chapterHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--color-vscode-text)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!hasChapters && !isWorking && (
        <div style={{ padding: '16px 12px' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7, marginBottom: '16px' }}>
            根据第2步生成的大纲，生成第一轮细纲
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <label style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.8 }}>
              章节细纲数量：
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={chapterCount}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 100) setChapterCount(v);
              }}
              style={numberInputStyle}
            />
          </div>

          <p style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, marginBottom: '16px' }}>
            建议尽量不要超过 20，效果可能会更好
          </p>

          {!outlineText && (
            <p style={{ fontSize: '12px', color: 'var(--color-danger, #dc2626)', marginBottom: '12px' }}>
              未检测到大纲内容，请先在第2步生成大纲
            </p>
          )}

          <button
            type="button"
            style={{ ...btnStyle('primary'), opacity: outlineText ? 1 : 0.5 }}
            onClick={handleGenerate}
            disabled={!outlineText}
          >
            开始生成细纲
          </button>
        </div>
      )}

      {isWorking && (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Loader2 size={32} style={{ color: 'var(--color-vscode-active)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
            正在{roundCount > 0 ? '回炉重造' : '生成细纲'}，请稍候...
          </p>
          {onCancelGeneration && (
            <button
              type="button"
              style={{ ...btnStyle('danger'), marginTop: '12px' }}
              onClick={onCancelGeneration}
            >
              <XCircle size={13} />
              取消生成
            </button>
          )}
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: '8px 10px',
          margin: '6px 8px',
          backgroundColor: 'var(--color-danger-light, rgba(220, 38, 38, 0.2))',
          border: '1px solid var(--color-danger, #dc2626)',
          borderRadius: '3px',
          fontSize: '12px',
          color: 'var(--color-danger, #dc2626)',
        }}>
          {error}
        </div>
      )}

      {hasChapters && !isWorking && (
        <>
          <div style={{
            padding: '6px 10px',
            borderBottom: '1px solid var(--color-vscode-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
              {roundCount > 0 ? `第${roundCount + 1}轮细纲` : '第一轮细纲'} · 共 {step4State!.chapters.length} 章
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {onPreviewInEditor && (
                <button type="button" style={btnStyle('secondary')} onClick={handlePreviewInEditor} title="在编辑区查看和编辑">
                  <ExternalLink size={13} />
                  编辑区
                </button>
              )}
              <button type="button" style={btnStyle('secondary')} onClick={handleCopy}>
                <Copy size={13} />
                {copySuccess ? '已复制' : '复制'}
              </button>
              <button type="button" style={btnStyle('danger')} onClick={handleOverwrite}>
                <Upload size={13} />
                覆盖
              </button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: listHeight, overflow: 'auto', padding: '6px 10px' }}>
            {step4State!.chapters.map(ch => {
              const isSelected = selectedChapterIndices.includes(ch.index);
              const isExpanded = expandedChapter === ch.index;

              return (
                <div key={ch.index} style={chapterCardStyle(isSelected)}>
                  <div
                    style={chapterHeaderStyle}
                    onClick={() => setExpandedChapter(isExpanded ? null : ch.index)}
                  >
                    {reworkMode === 'selected' && (
                      <span
                        onClick={e => { e.stopPropagation(); toggleChapterSelection(ch.index); }}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        {isSelected
                          ? <CheckSquare size={14} style={{ color: 'var(--color-vscode-active)' }} />
                          : <Square size={14} style={{ opacity: 0.4 }} />
                        }
                      </span>
                    )}
                    <span style={{ fontWeight: 600, flex: 1 }}>
                      第{ch.index + 1}章：{ch.title}
                    </span>
                    <span style={{ fontSize: '11px', opacity: 0.4 }}>
                      {isExpanded ? '收起' : '展开'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '0 10px 8px 10px', borderTop: '1px solid var(--color-vscode-border)' }}>
                      <input
                        type="text"
                        value={ch.title}
                        onChange={e => handleChapterTitleEdit(ch.index, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '4px 8px',
                          fontSize: '13px',
                          border: '1px solid var(--color-vscode-border)',
                          borderRadius: '3px',
                          backgroundColor: 'var(--color-vscode-bg)',
                          color: 'var(--color-vscode-text)',
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                          marginBottom: '4px',
                        }}
                        placeholder="章节标题"
                      />
                      <textarea
                        value={ch.content}
                        onChange={e => handleChapterContentEdit(ch.index, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          fontSize: '13px',
                          border: '1px solid var(--color-vscode-border)',
                          borderRadius: '3px',
                          backgroundColor: 'var(--color-vscode-bg)',
                          color: 'var(--color-vscode-text)',
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                          minHeight: '80px',
                          resize: 'vertical',
                          fontFamily: 'var(--editor-font-family, Consolas, Monaco, "Courier New", monospace)',
                          lineHeight: '1.5',
                        }}
                        spellCheck={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              height: '4px',
              cursor: 'row-resize',
              backgroundColor: isDragging ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)',
              flexShrink: 0,
              transition: isDragging ? 'none' : 'background-color 0.15s',
            }}
            onMouseDown={handleDragStart}
          />

          <div style={{
            padding: '6px 10px 8px 10px',
            borderTop: '1px solid var(--color-vscode-border)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)', opacity: 0.7 }}>
                回炉重造
              </span>
              <button
                type="button"
                style={{
                  padding: '2px 8px',
                  fontSize: '12px',
                  border: `1px solid ${reworkMode === 'all' ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                  backgroundColor: reworkMode === 'all' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))' : 'transparent',
                  color: reworkMode === 'all' ? 'white' : 'var(--color-vscode-text)',
                }}
                onClick={() => { setReworkMode('all'); setSelectedChapterIndices([]); }}
              >
                全部
              </button>
              <button
                type="button"
                style={{
                  padding: '2px 8px',
                  fontSize: '12px',
                  border: `1px solid ${reworkMode === 'selected' ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                  backgroundColor: reworkMode === 'selected' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))' : 'transparent',
                  color: reworkMode === 'selected' ? 'white' : 'var(--color-vscode-text)',
                }}
                onClick={() => setReworkMode('selected')}
              >
                仅选中
              </button>
              {reworkMode === 'selected' && (
                <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  {selectedChapterIndices.length} 个已选中
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '6px' }}>
              <textarea
                style={{ ...compactInputStyle, minHeight: '48px' }}
                placeholder="新增..."
                value={additions}
                onChange={e => setAdditions(e.target.value)}
                rows={2}
              />
              <textarea
                style={{ ...compactInputStyle, minHeight: '48px' }}
                placeholder="删除..."
                value={deletions}
                onChange={e => setDeletions(e.target.value)}
                rows={2}
              />
              <textarea
                style={{ ...compactInputStyle, minHeight: '48px' }}
                placeholder="修改..."
                value={modifications}
                onChange={e => setModifications(e.target.value)}
                rows={2}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                {roundCount > 0 ? `已迭代 ${roundCount} 轮` : '留空则随机重新生成'}
              </span>
              <button
                type="button"
                style={{
                  ...btnStyle('warning'),
                  opacity: isWorking ? 0.5 : 1,
                  cursor: isWorking ? 'not-allowed' : 'pointer',
                }}
                disabled={isWorking}
                onClick={handleRefine}
              >
                {isWorking ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
                回炉重造
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={showConfirm}
        title="覆盖本卷大纲"
        message="是否用细纲内容覆盖本卷大纲？你之前所写的大纲内容会丢失！"
        confirmText="确认覆盖"
        cancelText="取消"
        danger
        onConfirm={confirmOverwrite}
        onCancel={() => setShowConfirm(false)}
      />

      {isWorking && (
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
};

export default Step4DetailedOutline;
