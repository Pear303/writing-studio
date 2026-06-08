import React, { useState } from 'react';
import { Sparkles, ListChecks, History } from 'lucide-react';
import { VibeWritingPanel } from '../VibeWritingPanel';
import { PipelineWriting } from '../PipelineWriting';
import { PipelineHistoryPanel } from '../PipelineHistoryPanel';
import type { Book, Volume, PipelineStep1Config, PipelineStep2State, PipelineStep3Config, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound, PipelineAutoState, PipelineSession, VibePipelineHistory } from '../../types';
import type { ChapterFacts } from '../../types/fact-extraction';

interface PipelineTabViewProps {
  currentBook: Book | null;
  currentOutlineVolume: Volume | null;
  vibePipelineState: PipelineAutoState | null;
  vibeLoading: boolean;
  vibeError: string | null;
  onVibeStartPipeline?: (bookId: string, volumeId: string, userRequest: string) => void;
  onVibeIntervene?: (type: 'pause' | 'resume' | 'cancel' | 'redirect' | 'skip', message?: string, targetStepIndex?: number) => void;
  onVibeClearPipeline?: () => void;
  onPipelineGenerateOutline?: (config: PipelineStep1Config) => Promise<string>;
  onPipelineRefineOutline?: (step2State: PipelineStep2State, round: OutlineRound) => Promise<string>;
  onPipelineOverwriteOutline?: (markdown: string) => void;
  onPipelineGenerateDetailedOutline?: (outline: string, chapterCount: number) => Promise<string>;
  onPipelineRefineDetailedOutline?: (step4State: PipelineStep4State, round: DetailedOutlineRound, outline: string) => Promise<string>;
  onPipelineRefineDetailedOutlineChapter?: (step4State: PipelineStep4State, chapterIndices: number[], round: DetailedOutlineRound, outline: string) => Promise<string>;
  onPipelineGenerateChapter?: (chapterIndex: number, context?: { step4State: PipelineStep4State; step2State: PipelineStep2State | null; step3Config: PipelineStep3Config; step5State: PipelineStep5State | null }) => Promise<string>;
  onPipelineRefineChapter?: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<string>;
  onPipelinePolishChapter?: (step5State: PipelineStep5State, chapterIndex: number, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }, materialsText?: string, previousChapterContent?: string) => Promise<string>;
  onPipelineBatchGenerateChapters?: (chapters: Array<{ index: number; title: string; outline: string }>, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<Array<{ index: number; title: string; content: string }>>;
  onPipelineAddChapterToVolume?: (title: string, content: string, detailedOutline?: string, volumeId?: string) => void;
  onPipelinePreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
  onPipelineExtractFacts?: (chapterIndex: number, chapterTitle: string, chapterContent: string) => Promise<ChapterFacts | null>;
  onPipelineCancelGeneration?: () => void;
  onRestoreManualSession?: (session: PipelineSession) => void;
  onRestoreVibeHistory?: (history: VibePipelineHistory) => void;
  forceReloadSessionId?: string;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

type TabId = 'vibe' | 'manual';

export const PipelineTabView: React.FC<PipelineTabViewProps> = ({
  currentBook,
  currentOutlineVolume,
  vibePipelineState,
  vibeLoading,
  vibeError,
  onVibeStartPipeline,
  onVibeIntervene,
  onVibeClearPipeline,
  onPipelineGenerateOutline,
  onPipelineRefineOutline,
  onPipelineOverwriteOutline,
  onPipelineGenerateDetailedOutline,
  onPipelineRefineDetailedOutline,
  onPipelineRefineDetailedOutlineChapter,
  onPipelineGenerateChapter,
  onPipelineRefineChapter,
  onPipelinePolishChapter,
  onPipelineBatchGenerateChapters,
  onPipelineAddChapterToVolume,
  onPipelinePreviewInEditor,
  onPipelineExtractFacts,
  onPipelineCancelGeneration,
  onRestoreManualSession,
  onRestoreVibeHistory,
  forceReloadSessionId,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem('pipelineActiveTab');
      if (saved === 'vibe' || saved === 'manual') return saved;
    } catch {}
    return 'vibe';
  });
  const [showHistory, setShowHistory] = useState(false);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    localStorage.setItem('pipelineActiveTab', tab);
  };

  if (showHistory) {
    return (
      <PipelineHistoryPanel
        onRestoreManualSession={(session) => {
          onRestoreManualSession?.(session);
          setActiveTab('manual');
          setShowHistory(false);
        }}
        onRestoreVibeHistory={(history) => {
          onRestoreVibeHistory?.(history);
          setActiveTab('vibe');
          setShowHistory(false);
        }}
        onClose={() => setShowHistory(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      {/* Tab Header */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-vscode-border)' }}>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === 'vibe' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'vibe' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'vibe' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
          }}
          onClick={() => handleTabChange('vibe')}
        >
          <Sparkles size={14} />
          Vibe Writing
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === 'manual' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'manual' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'manual' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
          }}
          onClick={() => handleTabChange('manual')}
        >
          <ListChecks size={14} />
          手动流水线
        </button>
        <button
          className="flex items-center justify-center px-2 py-2 text-xs font-medium transition-colors"
          style={{
            color: 'var(--color-vscode-text)',
            opacity: 0.6,
            border: 'none',
            borderBottom: '2px solid transparent',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          onClick={() => setShowHistory(true)}
          title="历史记录"
        >
          <History size={14} />
        </button>
      </div>

      {/* Tab Content - 使用 display 控制显隐，避免卸载丢失状态 */}
      <div className="flex-1 overflow-hidden relative">
        <div style={{ display: activeTab === 'vibe' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <VibeWritingPanel
            currentBook={currentBook}
            currentVolume={currentOutlineVolume}
            pipelineState={vibePipelineState}
            loading={vibeLoading}
            error={vibeError}
            onStartPipeline={onVibeStartPipeline || (() => {})}
            onIntervene={onVibeIntervene || (() => {})}
            onClearPipeline={onVibeClearPipeline || (() => {})}
          />
        </div>
        <div style={{ display: activeTab === 'manual' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          {onPipelineGenerateOutline && onPipelineRefineOutline && onPipelineOverwriteOutline && onPipelineGenerateDetailedOutline && onPipelineRefineDetailedOutline && onPipelineRefineDetailedOutlineChapter && onPipelineGenerateChapter && onPipelineRefineChapter && onPipelineAddChapterToVolume && showToast ? (
            <PipelineWriting
              currentBook={currentBook}
              currentOutlineVolume={currentOutlineVolume}
              onVolumeSelect={() => {}}
              onGenerateOutline={onPipelineGenerateOutline}
              onRefineOutline={onPipelineRefineOutline}
              onOverwriteOutline={onPipelineOverwriteOutline}
              onGenerateDetailedOutline={onPipelineGenerateDetailedOutline}
              onRefineDetailedOutline={onPipelineRefineDetailedOutline}
              onRefineDetailedOutlineChapter={onPipelineRefineDetailedOutlineChapter}
              onGenerateChapter={onPipelineGenerateChapter}
              onRefineChapter={onPipelineRefineChapter}
              onPolishChapter={onPipelinePolishChapter}
              onBatchGenerateChapters={onPipelineBatchGenerateChapters}
              onAddChapterToVolume={onPipelineAddChapterToVolume}
              onPreviewInEditor={onPipelinePreviewInEditor}
              onExtractFacts={onPipelineExtractFacts}
              onCancelGeneration={onPipelineCancelGeneration}
              forceReloadSessionId={forceReloadSessionId}
              showToast={showToast}
            />
          ) : (
            <div className="p-4 text-vscode-text text-center text-sm opacity-60">
              手动流水线功能需要完整配置
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
