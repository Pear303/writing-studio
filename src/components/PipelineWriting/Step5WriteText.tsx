import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Loader2, RefreshCw, Play, Pause, Check, ExternalLink, BookOpen, Zap, XCircle } from 'lucide-react';
import type { PipelineStep2State, PipelineStep4State, PipelineStep5State, PipelineStep3Config, ChapterDraft, ChapterDraftRound } from '../../types';
import type { ChapterFacts } from '../../types/fact-extraction';

interface Step5WriteTextProps {
  volumeId: string | null;
  step2State: PipelineStep2State | null;
  step4State: PipelineStep4State | null;
  step3Config: PipelineStep3Config;
  step5State: PipelineStep5State | null;
  onStep5StateChange: (state: PipelineStep5State) => void;
  onGenerateChapter: (chapterIndex: number, context?: { step4State: PipelineStep4State; step2State: PipelineStep2State | null; step3Config: PipelineStep3Config; step5State: PipelineStep5State | null }) => Promise<string>;
  onRefineChapter: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<string>;
  onBatchGenerateChapters?: (chapters: Array<{ index: number; title: string; outline: string }>, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<Array<{ index: number; title: string; content: string }>>;
  onAddChapterToVolume: (title: string, content: string, detailedOutline?: string, volumeId?: string) => void;
  onPreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
  onExtractFacts?: (chapterIndex: number, chapterTitle: string, chapterContent: string) => Promise<ChapterFacts | null>;
  onCancelGeneration?: () => void;
}

const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'warning' | 'success'): React.CSSProperties => {
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
  if (variant === 'success') {
    return { ...base, backgroundColor: 'var(--color-success, #16a34a)', color: 'white', borderColor: 'var(--color-success, #16a34a)' };
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
  resize: 'none',
  fontFamily: 'inherit',
  lineHeight: '1.4',
};

export const Step5WriteText: React.FC<Step5WriteTextProps> = ({
  volumeId,
  step2State,
  step4State,
  step3Config,
  step5State,
  onStep5StateChange,
  onGenerateChapter,
  onRefineChapter,
  onBatchGenerateChapters,
  onAddChapterToVolume,
  onPreviewInEditor,
  onExtractFacts,
  onCancelGeneration,
}) => {
  const [isWorking, setIsWorking] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [additions, setAdditions] = useState('');
  const [deletions, setDeletions] = useState('');
  const [modifications, setModifications] = useState('');
  const [autoMode, setAutoMode] = useState(step5State?.autoMode ?? false);
  const [previewHeight, setPreviewHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapters = step4State?.chapters || [];
  const outlineText = step2State?.currentOutline || '';
  const currentIdx = step5State?.currentChapterIndex ?? 0;
  const hasDrafts = (step5State?.chapters.length ?? 0) > 0;
  const currentDraft = step5State?.chapters.find(ch => ch.index === currentIdx) || null;
  const totalChapters = chapters.length;
  const isCompleted = step5State?.completed ?? false;

  useEffect(() => {
    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoMode && !isWorking && !isCompleted && currentDraft && !currentDraft.content) {
      autoTimerRef.current = setTimeout(() => {
        handleGenerateCurrent();
      }, 1000);
    }
    if (autoMode && !isWorking && !isCompleted && currentDraft?.content) {
      const nextIdx = findNextUngenerated(currentIdx);
      if (nextIdx !== null) {
        autoTimerRef.current = setTimeout(() => {
          handleGoToChapter(nextIdx);
        }, 1500);
      } else {
        setAutoMode(false);
      }
    }
    if (!autoMode && autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, [autoMode, isWorking, isCompleted, currentDraft?.content, currentIdx]);

  const findNextUngenerated = (fromIdx: number): number | null => {
    for (let i = fromIdx + 1; i < totalChapters; i++) {
      const draft = step5State?.chapters.find(ch => ch.index === i);
      if (!draft?.content) return i;
    }
    return null;
  };

  const ensureStep5State = (): PipelineStep5State => {
    if (step5State) return step5State;
    return {
      chapters: [],
      currentChapterIndex: 0,
      autoMode: false,
      completed: false,
    };
  };

  const handleGenerateCurrent = async () => {
    if (currentIdx >= totalChapters) return;
    setIsWorking(true);
    setGeneratingIndex(currentIdx);
    setError(null);
    try {
      const content = await onGenerateChapter(currentIdx, step4State ? { step4State, step2State, step3Config, step5State } : undefined);
      const state = ensureStep5State();
      const existingIdx = state.chapters.findIndex(ch => ch.index === currentIdx);
      const newDraft: ChapterDraft = {
        index: currentIdx,
        title: chapters[currentIdx].title,
        content,
        rounds: [],
      };
      const newChapters = [...state.chapters];
      if (existingIdx >= 0) {
        newChapters[existingIdx] = newDraft;
      } else {
        newChapters.push(newDraft);
        newChapters.sort((a, b) => a.index - b.index);
      }
      onStep5StateChange({
        ...state,
        chapters: newChapters,
        currentChapterIndex: currentIdx,
      });

      if (onExtractFacts && content) {
        try {
          await onExtractFacts(currentIdx, chapters[currentIdx].title, content);
        } catch {
          // extraction failure is non-blocking
        }
      }
    } catch (err) {
      // 用户主动取消不报错
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '生成章节失败');
      }
      setAutoMode(false);
    } finally {
      setIsWorking(false);
      setGeneratingIndex(null);
    }
  };

  const handleRefine = async () => {
    if (!step5State || !currentDraft) return;
    setIsWorking(true);
    setGeneratingIndex(currentIdx);
    setError(null);

    const hasInput = additions.trim() || deletions.trim() || modifications.trim();

    if (!hasInput) {
      try {
        const content = await onGenerateChapter(currentIdx, step4State ? { step4State, step2State, step3Config, step5State } : undefined);
        const newChapters = step5State.chapters.map(ch =>
          ch.index === currentIdx ? { ...ch, content, rounds: [] } : ch
        );
        onStep5StateChange({ ...step5State, chapters: newChapters });
      } catch (err) {
        if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
          // silently ignore
        } else {
          setError(err instanceof Error ? err.message : '回炉重造失败');
        }
      } finally {
        setIsWorking(false);
      }
      return;
    }

    const currentRound: ChapterDraftRound = {
      additions: additions.trim(),
      deletions: deletions.trim(),
      modifications: modifications.trim(),
    };

    try {
      const content = await onRefineChapter(step5State, currentIdx, currentRound, { step2State, step3Config });
      const newChapters = step5State.chapters.map(ch =>
        ch.index === currentIdx
          ? { ...ch, content, rounds: [...ch.rounds, currentRound] }
          : ch
      );
      onStep5StateChange({ ...step5State, chapters: newChapters });
      setAdditions('');
      setDeletions('');
      setModifications('');
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '回炉重造失败');
      }
    } finally {
      setIsWorking(false);
      setGeneratingIndex(null);
    }
  };

  const handleContentEdit = (content: string) => {
    if (!step5State || !currentDraft) return;
    const newChapters = step5State.chapters.map(ch =>
      ch.index === currentIdx ? { ...ch, content } : ch
    );
    onStep5StateChange({ ...step5State, chapters: newChapters });
  };

  const handleGoToChapter = (idx: number) => {
    if (!step5State) return;
    onStep5StateChange({ ...step5State, currentChapterIndex: idx });
    setAdditions('');
    setDeletions('');
    setModifications('');
    setError(null);
  };

  const handleCopy = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(String(idx));
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(String(idx));
      setTimeout(() => setCopySuccess(null), 2000);
    }
  };

  const handleAddToVolume = (title: string, content: string, detailedOutline?: string) => {
    onAddChapterToVolume(title, content, detailedOutline, volumeId || undefined);
  };

  const handlePreviewInEditor = () => {
    if (onPreviewInEditor && currentDraft) {
      onPreviewInEditor(
        `第${currentIdx + 1}章：${currentDraft.title}`,
        currentDraft.content,
        (newContent: string) => {
          handleContentEdit(newContent);
        },
      );
    }
  };

  const handleToggleAuto = () => {
    const newAuto = !autoMode;
    setAutoMode(newAuto);
    if (step5State) {
      onStep5StateChange({ ...step5State, autoMode: newAuto });
    }
    if (!newAuto && autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  };

  const handleBatchGenerate = async () => {
    if (!onBatchGenerateChapters || chapters.length === 0) return;
    setIsBatchGenerating(true);
    setIsWorking(true);
    setError(null);

    try {
      const ungeneratedChapters = chapters
        .map((ch, idx) => ({ index: idx, title: ch.title, outline: ch.content }))
        .filter(ch => {
          const draft = step5State?.chapters.find(d => d.index === ch.index);
          return !draft?.content;
        });

      if (ungeneratedChapters.length === 0) {
        setError('所有章节已生成，无需批量生成');
        return;
      }

      const results = await onBatchGenerateChapters(ungeneratedChapters, { step2State, step3Config });
      const state = ensureStep5State();
      const newChapters = [...state.chapters];

      for (const result of results) {
        const existingIdx = newChapters.findIndex(ch => ch.index === result.index);
        const newDraft: ChapterDraft = {
          index: result.index,
          title: result.title,
          content: result.content,
          rounds: [],
        };
        if (existingIdx >= 0) {
          newChapters[existingIdx] = newDraft;
        } else {
          newChapters.push(newDraft);
        }
      }
      newChapters.sort((a, b) => a.index - b.index);

      onStep5StateChange({
        ...state,
        chapters: newChapters,
        currentChapterIndex: results.length > 0 ? results[0].index : state.currentChapterIndex,
      });
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '批量生成失败');
      }
    } finally {
      setIsBatchGenerating(false);
      setIsWorking(false);
    }
  };

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startY = e.clientY;
    const startHeight = previewHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientY - startY;
      const newHeight = Math.max(60, Math.min(startHeight + delta, 600));
      setPreviewHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [previewHeight]);

  const generatedCount = step5State?.chapters.filter(ch => ch.content).length || 0;

  if (totalChapters === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先在第4步生成细纲
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid var(--color-vscode-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
            生成正文 · 已完成 {generatedCount}/{totalChapters} 章
          </span>
          <button
            type="button"
            style={{
              ...btnStyle(autoMode ? 'warning' : 'secondary'),
              fontSize: '11px',
              padding: '3px 8px',
            }}
            onClick={handleToggleAuto}
            disabled={isWorking}
          >
            {autoMode ? <Pause size={12} /> : <Play size={12} />}
            {autoMode ? '停止自动' : '自动生成'}
          </button>
          {onBatchGenerateChapters && (
            <button
              type="button"
              style={{
                ...btnStyle('primary'),
                fontSize: '11px',
                padding: '3px 8px',
              }}
              onClick={handleBatchGenerate}
              disabled={isWorking || isBatchGenerating}
            >
              {isBatchGenerating ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
              {isBatchGenerating ? '批量生成中...' : '批量生成'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '2px', overflow: 'auto', paddingBottom: '4px' }}>
          {chapters.map((ch, idx) => {
            const draft = step5State?.chapters.find(d => d.index === idx);
            const isGenerated = !!draft?.content;
            const isCurrent = idx === currentIdx;

            return (
              <button
                key={idx}
                type="button"
                style={{
                  padding: '3px 6px',
                  fontSize: '11px',
                  border: `1px solid ${isCurrent ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  backgroundColor: isCurrent
                    ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))'
                    : isGenerated
                      ? 'var(--color-success-light, rgba(22, 163, 74, 0.08))'
                      : 'transparent',
                  color: isCurrent
                    ? 'white'
                    : isGenerated
                      ? 'var(--color-success, #16a34a)'
                      : 'var(--color-vscode-text)',
                  opacity: isCurrent ? 1 : 0.7,
                  whiteSpace: 'nowrap' as const,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  flexShrink: 0,
                }}
                onClick={() => handleGoToChapter(idx)}
              >
                {isGenerated && <Check size={10} />}
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '8px 10px', flexShrink: 0, borderBottom: '1px solid var(--color-vscode-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>
            第{currentIdx + 1}章：{chapters[currentIdx]?.title || ''}
          </span>
          {currentDraft?.content && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {onPreviewInEditor && (
                <button type="button" style={{ ...btnStyle('secondary'), padding: '3px 8px' }} onClick={handlePreviewInEditor} title="在编辑区查看">
                  <ExternalLink size={12} />
                </button>
              )}
              <button
                type="button"
                style={{ ...btnStyle('secondary'), padding: '3px 8px' }}
                onClick={() => handleCopy(currentDraft.content, currentIdx)}
              >
                <Copy size={12} />
                {copySuccess === String(currentIdx) ? '已复制' : '复制'}
              </button>
              <button
                type="button"
                style={{ ...btnStyle('success'), padding: '3px 8px' }}
                onClick={() => handleAddToVolume(chapters[currentIdx].title, currentDraft.content, chapters[currentIdx].content)}
              >
                <BookOpen size={12} />
                录入本卷
              </button>
            </div>
          )}
        </div>

        {chapters[currentIdx]?.content && (
          <p style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, lineHeight: '1.4' }}>
            细纲：{chapters[currentIdx].content.slice(0, 120)}{chapters[currentIdx].content.length > 120 ? '...' : ''}
          </p>
        )}
      </div>

      {isWorking && (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Loader2 size={32} style={{ color: 'var(--color-vscode-active)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
            正在生成第{(generatingIndex ?? currentIdx) + 1}章正文，请稍候...
          </p>
          {onCancelGeneration && (
            <button
              type="button"
              style={{ ...btnStyle('danger'), marginTop: '12px' }}
              onClick={() => {
                onCancelGeneration();
                setAutoMode(false);
              }}
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
          margin: '6px 10px',
          backgroundColor: 'var(--color-danger-light, rgba(220, 38, 38, 0.2))',
          border: '1px solid var(--color-danger, #dc2626)',
          borderRadius: '3px',
          fontSize: '12px',
          color: 'var(--color-danger, #dc2626)',
        }}>
          {error}
        </div>
      )}

      {!isWorking && currentDraft?.content && (
        <>
          <div style={{ flex: 1, minHeight: previewHeight, maxHeight: previewHeight, overflow: 'auto', padding: '6px 10px' }}>
            <textarea
              value={currentDraft.content}
              onChange={e => handleContentEdit(e.target.value)}
              style={{
                width: '100%',
                height: '100%',
                padding: '8px',
                fontSize: '13px',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '3px',
                backgroundColor: 'var(--color-vscode-bg)',
                color: 'var(--color-vscode-text)',
                outline: 'none',
                boxSizing: 'border-box' as const,
                resize: 'none',
                fontFamily: 'var(--editor-font-family, Consolas, Monaco, "Courier New", monospace)',
                lineHeight: '1.6',
              }}
              spellCheck={false}
            />
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
        </>
      )}

      {!isWorking && (
        <div style={{
          padding: '6px 10px 8px 10px',
          borderTop: '1px solid var(--color-vscode-border)',
          flexShrink: 0,
        }}>
          {currentDraft?.content && (
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)', opacity: 0.7 }}>
                  回炉重造
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  {currentDraft.rounds.length > 0 ? `已迭代 ${currentDraft.rounds.length} 轮` : '留空则随机重新生成'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <div style={{ flex: 1 }}>
                  <textarea
                    style={compactInputStyle}
                    placeholder="新增..."
                    value={additions}
                    onChange={e => setAdditions(e.target.value)}
                    rows={1}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    style={compactInputStyle}
                    placeholder="删除..."
                    value={deletions}
                    onChange={e => setDeletions(e.target.value)}
                    rows={1}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    style={compactInputStyle}
                    placeholder="修改..."
                    value={modifications}
                    onChange={e => setModifications(e.target.value)}
                    rows={1}
                  />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {!currentDraft?.content ? (
                <button
                  type="button"
                  style={btnStyle('primary')}
                  onClick={handleGenerateCurrent}
                  disabled={isWorking}
                >
                  生成本章
                </button>
              ) : (
                <button
                  type="button"
                  style={btnStyle('warning')}
                  onClick={handleRefine}
                  disabled={isWorking}
                >
                  {isWorking ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
                  回炉重造
                </button>
              )}
            </div>

            {currentDraft?.content && currentIdx < totalChapters - 1 && (
              <button
                type="button"
                style={btnStyle('primary')}
                onClick={() => handleGoToChapter(currentIdx + 1)}
              >
                下一章
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Step5WriteText;
