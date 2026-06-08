import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Loader2, RefreshCw, Check, ExternalLink, BookOpen, Zap, XCircle, BookmarkPlus, X, Sparkles } from 'lucide-react';
import type { PipelineStep2State, PipelineStep4State, PipelineStep5State, PipelineStep3Config, ChapterDraft, ChapterDraftRound } from '../../types';
import type { ChapterFacts } from '../../types/fact-extraction';
import type { Material, MaterialType } from '../../types';
import { db, getCurrentUserId } from '../../db';

interface Step5WriteTextProps {
  volumeId: string | null;
  bookId: string | null;
  step2State: PipelineStep2State | null;
  step4State: PipelineStep4State | null;
  step3Config: PipelineStep3Config;
  step5State: PipelineStep5State | null;
  onStep5StateChange: (state: PipelineStep5State) => void;
  onGenerateChapter: (chapterIndex: number, context?: { step4State: PipelineStep4State; step2State: PipelineStep2State | null; step3Config: PipelineStep3Config; step5State: PipelineStep5State | null }) => Promise<string>;
  onRefineChapter: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<string>;
  onPolishChapter?: (step5State: PipelineStep5State, chapterIndex: number, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }, materialsText?: string, previousChapterContent?: string) => Promise<string>;
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
  resize: 'vertical',
  fontFamily: 'inherit',
  lineHeight: '1.4',
};

export const Step5WriteText: React.FC<Step5WriteTextProps> = ({
  volumeId,
  bookId,
  step2State,
  step4State,
  step3Config,
  step5State,
  onStep5StateChange,
  onGenerateChapter,
  onRefineChapter,
  onPolishChapter,
  onBatchGenerateChapters,
  onAddChapterToVolume,
  onPreviewInEditor,
  onExtractFacts,
  onCancelGeneration,
}) => {
  // 从 step5State 恢复生成状态（重进时保持加载状态）
  const [isWorking, setIsWorking] = useState(() => step5State?.isGenerating ?? false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(() => step5State?.generatingChapterIndex ?? null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [additions, setAdditions] = useState('');
  const [deletions, setDeletions] = useState('');
  const [modifications, setModifications] = useState('');
  const [previewHeight, setPreviewHeight] = useState(200);
  const [isDragging, setIsDragging] = useState(false);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [embeddedMaterialIds, setEmbeddedMaterialIds] = useState<Set<string>>(new Set());
  const [polishMaterialIds, setPolishMaterialIds] = useState<Set<string>>(new Set());
  const [showPolishMaterialPicker, setShowPolishMaterialPicker] = useState(false);
  const [selectedPolishChapters, setSelectedPolishChapters] = useState<Set<number>>(new Set());
  const [isPolishing, setIsPolishing] = useState(() => step5State?.isPolishing ?? false);
  const [polishingIndex, setPolishingIndex] = useState<number | null>(() => step5State?.polishingChapterIndex ?? null);

  // 跟踪组件是否已挂载，用于卸载后仍能保存生成结果到 DB
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const chapters = step4State?.chapters || [];
  const outlineText = step2State?.currentOutline || '';
  const currentIdx = step5State?.currentChapterIndex ?? 0;
  const hasDrafts = (step5State?.chapters.length ?? 0) > 0;
  const currentDraft = step5State?.chapters.find(ch => ch.index === currentIdx) || null;
  const totalChapters = chapters.length;
  const isCompleted = step5State?.completed ?? false;

  // 组件卸载后直接将 step5State 保存到 DB，确保生成结果不丢失
  const saveStep5StateToDB = useCallback(async (newStep5State: PipelineStep5State) => {
    if (!bookId || !volumeId) return;
    const sessionId = `${bookId}_${volumeId}`;
    try {
      const session = await db.pipelineSessions.get(sessionId);
      if (session) {
        await db.pipelineSessions.update(sessionId, { step5State: newStep5State, updatedAt: Date.now() });
      }
    } catch (err) {
      console.error('卸载后保存 step5State 失败:', err);
    }
  }, [bookId, volumeId]);

  // 重进时如果 step5State 标记了正在生成，轮询 DB 等待结果
  useEffect(() => {
    if (!step5State?.isGenerating || !bookId || !volumeId) return;

    const pollInterval = setInterval(async () => {
      const sessionId = `${bookId}_${volumeId}`;
      const session = await db.pipelineSessions.get(sessionId);
      if (session?.step5State && !session.step5State.isGenerating) {
        // 生成已完成，结果已保存到 DB，更新父组件状态并清除本地加载状态
        onStep5StateChange(session.step5State);
        setIsWorking(false);
        setGeneratingIndex(null);
        setIsPolishing(false);
        setPolishingIndex(null);
        clearInterval(pollInterval);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [step5State?.isGenerating, bookId, volumeId, onStep5StateChange]);

  useEffect(() => {
    return () => {
      // cleanup
    };
  }, []);

  // 加载素材列表
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const currentUserId = getCurrentUserId();
        let allMaterials = await db.materials.orderBy('updatedAt').reverse().toArray();
        if (currentUserId) {
          allMaterials = allMaterials.filter(m => m.userId === currentUserId);
          if (bookId) {
            allMaterials = allMaterials.filter(m => !m.bookId || m.bookId === bookId);
          } else {
            allMaterials = allMaterials.filter(m => !m.bookId);
          }
        } else {
          allMaterials = [];
        }
        setMaterials(allMaterials);
      } catch (error) {
        console.error('加载素材失败:', error);
      }
    };
    loadMaterials();
  }, [bookId]);

  const getTypeText = (type: MaterialType) => {
    switch (type) {
      case 'character': return '人物';
      case 'location': return '地点';
      case 'item': return '物品';
      case 'plot': return '情节';
      case 'writing_rule': return '写作规则';
      case 'style_rule': return '文风规则';
      case 'other': return '其他';
      default: return '未知';
    }
  };

  const toggleEmbeddedMaterial = (materialId: string) => {
    setEmbeddedMaterialIds(prev => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  const removeEmbeddedMaterial = (materialId: string) => {
    setEmbeddedMaterialIds(prev => {
      const next = new Set(prev);
      next.delete(materialId);
      return next;
    });
  };

  // 获取已嵌入的素材列表
  const embeddedMaterials = materials.filter(m => embeddedMaterialIds.has(m.id));

  // 获取润色用素材列表
  const polishMaterials = materials.filter(m => polishMaterialIds.has(m.id));

  const togglePolishMaterial = (materialId: string) => {
    setPolishMaterialIds(prev => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const removePolishMaterial = (materialId: string) => {
    setPolishMaterialIds(prev => {
      const next = new Set(prev);
      next.delete(materialId);
      return next;
    });
  };

  const togglePolishChapter = (idx: number) => {
    setSelectedPolishChapters(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handlePolishSingle = async (chapterIndex: number) => {
    if (!step5State || !onPolishChapter) return;
    const draft = step5State.chapters.find(ch => ch.index === chapterIndex);
    if (!draft?.content) return;

    setIsPolishing(true);
    setPolishingIndex(chapterIndex);
    setError(null);
    // 标记润色状态到 step5State
    onStep5StateChange({ ...step5State, isPolishing: true, polishingChapterIndex: chapterIndex });

    try {
      const materialsText = polishMaterials.length > 0
        ? polishMaterials.map(m => `【${getTypeText(m.type)}：${m.name}】\n${m.description}`).join('\n\n')
        : undefined;

      // 获取上一章内容作为文风参考
      let previousChapterContent: string | undefined;
      if (chapterIndex > 0) {
        const prevDraft = step5State.chapters.find(ch => ch.index === chapterIndex - 1);
        if (prevDraft?.content) {
          previousChapterContent = prevDraft.content.slice(0, 500);
        }
      }

      const content = await onPolishChapter(step5State, chapterIndex, { step2State, step3Config }, materialsText, previousChapterContent);
      const newChapters = step5State.chapters.map(ch =>
        ch.index === chapterIndex ? { ...ch, content } : ch
      );
      const newState = { ...step5State, chapters: newChapters, isPolishing: false as const, polishingChapterIndex: undefined as undefined };
      if (mountedRef.current) {
        onStep5StateChange(newState);
      } else {
        saveStep5StateToDB(newState);
      }
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '润色失败');
      }
      if (!mountedRef.current) {
        saveStep5StateToDB({ ...step5State, isPolishing: false, polishingChapterIndex: undefined });
      }
    } finally {
      if (mountedRef.current) {
        setIsPolishing(false);
        setPolishingIndex(null);
      }
    }
  };

  const handleBatchPolish = async () => {
    if (!step5State || !onPolishChapter || selectedPolishChapters.size === 0) return;

    setIsPolishing(true);
    setError(null);
    // 标记润色状态到 step5State
    onStep5StateChange({ ...step5State, isPolishing: true, polishingChapterIndex: Array.from(selectedPolishChapters).sort((a, b) => a - b)[0] });

    const sortedIndices = Array.from(selectedPolishChapters).sort((a, b) => a - b);
    let currentState = step5State;

    try {
      const materialsText = polishMaterials.length > 0
        ? polishMaterials.map(m => `【${getTypeText(m.type)}：${m.name}】\n${m.description}`).join('\n\n')
        : undefined;

      for (let i = 0; i < sortedIndices.length; i++) {
        const chapterIndex = sortedIndices[i];
        const draft = currentState.chapters.find(ch => ch.index === chapterIndex);
        if (!draft?.content) continue;

        if (mountedRef.current) setPolishingIndex(chapterIndex);

        // 获取上一章内容作为文风参考（连续润色时使用已润色的版本）
        let previousChapterContent: string | undefined;
        if (chapterIndex > 0) {
          const prevDraft = currentState.chapters.find(ch => ch.index === chapterIndex - 1);
          if (prevDraft?.content) {
            previousChapterContent = prevDraft.content.slice(0, 500);
          }
        }

        const content = await onPolishChapter(currentState, chapterIndex, { step2State, step3Config }, materialsText, previousChapterContent);

        // 更新 step5State 以便下一章能引用已润色的内容
        const updatedChapters: ChapterDraft[] = currentState.chapters.map(ch =>
          ch.index === chapterIndex ? { ...ch, content } : ch
        );
        currentState = { ...currentState, chapters: updatedChapters };
        if (mountedRef.current) {
          onStep5StateChange(currentState);
        }
      }

      // 批量润色完成，清除标记
      const finalState = { ...currentState, isPolishing: false as const, polishingChapterIndex: undefined as undefined };
      if (mountedRef.current) {
        onStep5StateChange(finalState);
        setSelectedPolishChapters(new Set());
      } else {
        saveStep5StateToDB(finalState);
      }
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '批量润色失败');
      }
      if (!mountedRef.current) {
        saveStep5StateToDB({ ...currentState, isPolishing: false, polishingChapterIndex: undefined });
      }
    } finally {
      if (mountedRef.current) {
        setIsPolishing(false);
        setPolishingIndex(null);
      }
    }
  };

  const ensureStep5State = (): PipelineStep5State => {
    if (step5State) return step5State;
    return {
      chapters: [],
      currentChapterIndex: 0,
      completed: false,
    };
  };

  const handleGenerateCurrent = async () => {
    if (currentIdx >= totalChapters) return;
    setIsWorking(true);
    setGeneratingIndex(currentIdx);
    setError(null);
    // 标记生成状态到 step5State，以便重进时恢复
    const stateBefore = ensureStep5State();
    onStep5StateChange({ ...stateBefore, isGenerating: true, generatingChapterIndex: currentIdx });
    try {
      // 如果有嵌入素材，将其附加到当前章节的细纲中
      let contextStep4State = step4State;
      if (step4State && embeddedMaterials.length > 0) {
        const materialText = embeddedMaterials.map(m =>
          `【${getTypeText(m.type)}：${m.name}】\n${m.description}`
        ).join('\n\n');
        const enhancedChapters = step4State.chapters.map(ch =>
          ch.index === currentIdx
            ? { ...ch, content: ch.content + `\n\n---\n【本章强调素材】\n${materialText}` }
            : ch
        );
        contextStep4State = { ...step4State, chapters: enhancedChapters };
      }
      const content = await onGenerateChapter(currentIdx, contextStep4State ? { step4State: contextStep4State, step2State, step3Config, step5State } : undefined);
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
      const newState = {
        ...state,
        chapters: newChapters,
        currentChapterIndex: currentIdx,
        isGenerating: false,
        generatingChapterIndex: undefined,
      };
      if (mountedRef.current) {
        onStep5StateChange(newState);
      } else {
        // 组件已卸载，直接保存到 DB
        saveStep5StateToDB(newState);
      }

      if (onExtractFacts && content && mountedRef.current) {
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
        // 清除生成标记
        const state = ensureStep5State();
        if (!mountedRef.current) {
          saveStep5StateToDB({ ...state, isGenerating: false, generatingChapterIndex: undefined });
        }
      } else {
        setError(err instanceof Error ? err.message : '生成章节失败');
        // 清除生成标记
        const state = ensureStep5State();
        if (!mountedRef.current) {
          saveStep5StateToDB({ ...state, isGenerating: false, generatingChapterIndex: undefined });
        }
      }
    } finally {
      if (mountedRef.current) {
        setIsWorking(false);
        setGeneratingIndex(null);
      }
    }
  };

  const handleRefine = async () => {
    if (!step5State || !currentDraft) return;
    setIsWorking(true);
    setGeneratingIndex(currentIdx);
    setError(null);
    // 标记生成状态到 step5State
    onStep5StateChange({ ...step5State, isGenerating: true, generatingChapterIndex: currentIdx });

    const hasInput = additions.trim() || deletions.trim() || modifications.trim();

    if (!hasInput) {
      try {
        const content = await onGenerateChapter(currentIdx, step4State ? { step4State, step2State, step3Config, step5State } : undefined);
        const newChapters = step5State.chapters.map(ch =>
          ch.index === currentIdx ? { ...ch, content, rounds: [] } : ch
        );
        const newState = { ...step5State, chapters: newChapters, isGenerating: false as const, generatingChapterIndex: undefined as undefined };
        if (mountedRef.current) {
          onStep5StateChange(newState);
        } else {
          saveStep5StateToDB(newState);
        }
      } catch (err) {
        if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
          // silently ignore
        } else {
          setError(err instanceof Error ? err.message : '回炉重造失败');
        }
        if (!mountedRef.current) {
          saveStep5StateToDB({ ...step5State, isGenerating: false, generatingChapterIndex: undefined });
        }
      } finally {
        if (mountedRef.current) {
          setIsWorking(false);
        }
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
      const newState = { ...step5State, chapters: newChapters, isGenerating: false as const, generatingChapterIndex: undefined as undefined };
      if (mountedRef.current) {
        onStep5StateChange(newState);
        setAdditions('');
        setDeletions('');
        setModifications('');
      } else {
        saveStep5StateToDB(newState);
      }
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '回炉重造失败');
      }
      if (!mountedRef.current) {
        saveStep5StateToDB({ ...step5State, isGenerating: false, generatingChapterIndex: undefined });
      }
    } finally {
      if (mountedRef.current) {
        setIsWorking(false);
        setGeneratingIndex(null);
      }
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

  const handleBatchGenerate = async () => {
    if (!onBatchGenerateChapters || chapters.length === 0) return;
    setIsBatchGenerating(true);
    setIsWorking(true);
    setError(null);
    // 标记生成状态到 step5State
    const stateBefore = ensureStep5State();
    onStep5StateChange({ ...stateBefore, isGenerating: true });

    try {
      const ungeneratedChapters = chapters
        .map((ch, idx) => ({ index: idx, title: ch.title, outline: ch.content }))
        .filter(ch => {
          const draft = step5State?.chapters.find(d => d.index === ch.index);
          return !draft?.content;
        });

      if (ungeneratedChapters.length === 0) {
        setError('所有章节已生成，无需批量生成');
        onStep5StateChange({ ...stateBefore, isGenerating: false });
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

      const newState = {
        ...state,
        chapters: newChapters,
        currentChapterIndex: results.length > 0 ? results[0].index : state.currentChapterIndex,
        isGenerating: false as const,
        generatingChapterIndex: undefined as undefined,
      };
      if (mountedRef.current) {
        onStep5StateChange(newState);
      } else {
        saveStep5StateToDB(newState);
      }
    } catch (err) {
      if (err instanceof Error && (err.message === 'Request aborted' || err.name === 'AbortError')) {
        // silently ignore
      } else {
        setError(err instanceof Error ? err.message : '批量生成失败');
      }
      if (!mountedRef.current) {
        const state = ensureStep5State();
        saveStep5StateToDB({ ...state, isGenerating: false, generatingChapterIndex: undefined });
      }
    } finally {
      if (mountedRef.current) {
        setIsBatchGenerating(false);
        setIsWorking(false);
      }
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
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {onPolishChapter && selectedPolishChapters.size > 0 && (
              <button
                type="button"
                style={{
                  ...btnStyle('success'),
                  fontSize: '11px',
                  padding: '3px 8px',
                }}
                onClick={handleBatchPolish}
                disabled={isPolishing || isWorking}
              >
                {isPolishing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                {isPolishing ? `润色中(${(polishingIndex ?? -1) + 1}章)` : `连续润色(${selectedPolishChapters.size}章)`}
              </button>
            )}
            {onPolishChapter && generatedCount > 0 && (
              <button
                type="button"
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  backgroundColor: selectedPolishChapters.size > 0 ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))' : 'transparent',
                  color: 'var(--color-vscode-text)',
                }}
                onClick={() => {
                  if (selectedPolishChapters.size > 0) {
                    setSelectedPolishChapters(new Set());
                  }
                }}
              >
                {selectedPolishChapters.size > 0 ? '取消多选' : '多选润色'}
              </button>
            )}
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
        </div>

        <div style={{ display: 'flex', gap: '2px', overflow: 'auto', paddingBottom: '4px' }}>
          {chapters.map((ch, idx) => {
            const draft = step5State?.chapters.find(d => d.index === idx);
            const isGenerated = !!draft?.content;
            const isCurrent = idx === currentIdx;
            const isPolishSelected = selectedPolishChapters.has(idx);

            return (
              <button
                key={idx}
                type="button"
                style={{
                  padding: '3px 6px',
                  fontSize: '11px',
                  border: `1px solid ${isPolishSelected ? 'var(--color-vscode-active)' : isCurrent ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                  borderRadius: '2px',
                  cursor: 'pointer',
                  backgroundColor: isPolishSelected
                    ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))'
                    : isCurrent
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
                onClick={() => {
                  if (selectedPolishChapters.size > 0 && isGenerated) {
                    togglePolishChapter(idx);
                  } else {
                    handleGoToChapter(idx);
                  }
                }}
              >
                {isPolishSelected && <Check size={10} style={{ color: 'var(--color-vscode-active)' }} />}
                {!isPolishSelected && isGenerated && <Check size={10} />}
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
              {onPolishChapter && (
                <button
                  type="button"
                  style={{
                    ...btnStyle('secondary'),
                    padding: '3px 8px',
                    opacity: isPolishing && polishingIndex === currentIdx ? 0.5 : 1,
                  }}
                  onClick={() => handlePolishSingle(currentIdx)}
                  disabled={isPolishing || isWorking}
                  title="润色本章"
                >
                  {isPolishing && polishingIndex === currentIdx ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                  润色
                </button>
              )}
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

        {/* 素材嵌入区域 */}
        <div style={{ marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BookmarkPlus size={12} style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }} />
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
                素材嵌入
              </span>
              {embeddedMaterials.length > 0 && (
                <span style={{ fontSize: '10px', color: 'var(--color-vscode-active)', opacity: 0.8 }}>
                  ({embeddedMaterials.length})
                </span>
              )}
            </div>
            <button
              type="button"
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '2px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: 'var(--color-vscode-text)',
                opacity: 0.7,
              }}
              onClick={() => setShowMaterialPicker(!showMaterialPicker)}
            >
              {showMaterialPicker ? '收起' : '选择素材'}
            </button>
          </div>

          {/* 已嵌入的素材标签 */}
          {embeddedMaterials.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
              {embeddedMaterials.map(m => (
                <span
                  key={m.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    border: '1px solid var(--color-vscode-active)',
                    borderRadius: '2px',
                    backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))',
                    color: 'var(--color-vscode-text)',
                  }}
                >
                  {getTypeText(m.type)}：{m.name}
                  <button
                    type="button"
                    onClick={() => removeEmbeddedMaterial(m.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--color-vscode-text)',
                      opacity: 0.5,
                      lineHeight: 1,
                    }}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 素材选择器 */}
          {showMaterialPicker && (
            <div style={{
              marginTop: '4px',
              maxHeight: '160px',
              overflow: 'auto',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '3px',
              backgroundColor: 'var(--color-vscode-bg)',
            }}>
              {materials.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  暂无素材，请在素材箱中添加
                </div>
              ) : (
                materials.map(m => {
                  const isEmbedded = embeddedMaterialIds.has(m.id);
                  return (
                    <div
                      key={m.id}
                      style={{
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: 'var(--color-vscode-text)',
                        borderBottom: '1px solid var(--color-vscode-border)',
                        backgroundColor: isEmbedded ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))' : 'transparent',
                      }}
                      onClick={() => toggleEmbeddedMaterial(m.id)}
                      onMouseEnter={e => { if (!isEmbedded) e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)'; }}
                      onMouseLeave={e => { if (!isEmbedded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span style={{
                        width: '12px',
                        height: '12px',
                        border: `1px solid ${isEmbedded ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                        borderRadius: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        backgroundColor: isEmbedded ? 'var(--color-vscode-active)' : 'transparent',
                      }}>
                        {isEmbedded && <Check size={10} style={{ color: 'white' }} />}
                      </span>
                      <span style={{ opacity: 0.5, flexShrink: 0 }}>{getTypeText(m.type)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.name}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 润色素材注入区域 */}
        {onPolishChapter && currentDraft?.content && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={12} style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }} />
                <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
                  润色素材
                </span>
                {polishMaterials.length > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--color-vscode-active)', opacity: 0.8 }}>
                    ({polishMaterials.length})
                  </span>
                )}
              </div>
              <button
                type="button"
                style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.7,
                }}
                onClick={() => setShowPolishMaterialPicker(!showPolishMaterialPicker)}
              >
                {showPolishMaterialPicker ? '收起' : '选择素材'}
              </button>
            </div>

            {polishMaterials.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {polishMaterials.map(m => (
                  <span
                    key={m.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '1px 6px',
                      fontSize: '10px',
                      border: '1px solid var(--color-vscode-active)',
                      borderRadius: '2px',
                      backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))',
                      color: 'var(--color-vscode-text)',
                    }}
                  >
                    {getTypeText(m.type)}：{m.name}
                    <button
                      type="button"
                      onClick={() => removePolishMaterial(m.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'var(--color-vscode-text)',
                        opacity: 0.5,
                        lineHeight: 1,
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showPolishMaterialPicker && (
              <div style={{
                marginTop: '4px',
                maxHeight: '120px',
                overflow: 'auto',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '3px',
                backgroundColor: 'var(--color-vscode-bg)',
              }}>
                {materials.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                    暂无素材，请在素材箱中添加
                  </div>
                ) : (
                  materials.map(m => {
                    const isSelected = polishMaterialIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        style={{
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: 'var(--color-vscode-text)',
                          borderBottom: '1px solid var(--color-vscode-border)',
                          backgroundColor: isSelected ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))' : 'transparent',
                        }}
                        onClick={() => togglePolishMaterial(m.id)}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <span style={{
                          width: '12px',
                          height: '12px',
                          border: `1px solid ${isSelected ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)'}`,
                          borderRadius: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          backgroundColor: isSelected ? 'var(--color-vscode-active)' : 'transparent',
                        }}>
                          {isSelected && <Check size={10} style={{ color: 'white' }} />}
                        </span>
                        <span style={{ opacity: 0.5, flexShrink: 0 }}>{getTypeText(m.type)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {(isWorking || isPolishing) && (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Loader2 size={32} style={{ color: 'var(--color-vscode-active)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
            {isPolishing
              ? `正在润色第${(polishingIndex ?? currentIdx) + 1}章，请稍候...`
              : `正在生成第${(generatingIndex ?? currentIdx) + 1}章正文，请稍候...`
            }
          </p>
          {(onCancelGeneration || isPolishing) && (
            <button
              type="button"
              style={{ ...btnStyle('danger'), marginTop: '12px' }}
              onClick={() => {
                if (isPolishing) {
                  setIsPolishing(false);
                  setPolishingIndex(null);
                }
                if (onCancelGeneration && isWorking) {
                  onCancelGeneration();
                }
              }}
            >
              <XCircle size={13} />
              取消
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

      {!isWorking && !isPolishing && currentDraft?.content && (
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

      {!isWorking && !isPolishing && (
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
