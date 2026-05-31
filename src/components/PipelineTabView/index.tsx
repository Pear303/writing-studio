import React, { useState } from 'react';
import { Sparkles, ListChecks } from 'lucide-react';
import { VibeWritingPanel } from '../VibeWritingPanel';
import { PipelineWriting } from '../PipelineWriting';
import type { Book, Volume, PipelineStep1Config, PipelineStep2State, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound, PipelineAutoState } from '../../types';

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
  onPipelineGenerateChapter?: (chapterIndex: number) => Promise<string>;
  onPipelineRefineChapter?: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound) => Promise<string>;
  onPipelineAddChapterToVolume?: (title: string, content: string, detailedOutline?: string) => void;
  onPipelinePreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
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
  onPipelineAddChapterToVolume,
  onPipelinePreviewInEditor,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('vibe');

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      {/* Tab Header */}
      <div className="flex border-b" style={{ borderColor: 'var(--color-vscode-border)' }}>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === 'vibe' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'vibe' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'vibe' ? 'rgba(0, 122, 204, 0.08)' : 'transparent',
          }}
          onClick={() => setActiveTab('vibe')}
        >
          <Sparkles size={14} />
          Vibe Writing
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === 'manual' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'manual' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'manual' ? 'rgba(0, 122, 204, 0.08)' : 'transparent',
          }}
          onClick={() => setActiveTab('manual')}
        >
          <ListChecks size={14} />
          手动流水线
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'vibe' ? (
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
        ) : (
          onPipelineGenerateOutline && onPipelineRefineOutline && onPipelineOverwriteOutline && onPipelineGenerateDetailedOutline && onPipelineRefineDetailedOutline && onPipelineRefineDetailedOutlineChapter && onPipelineGenerateChapter && onPipelineRefineChapter && onPipelineAddChapterToVolume && showToast ? (
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
              onAddChapterToVolume={onPipelineAddChapterToVolume}
              onPreviewInEditor={onPipelinePreviewInEditor}
              showToast={showToast}
            />
          ) : (
            <div className="p-4 text-vscode-text text-center text-sm opacity-60">
              手动流水线功能需要完整配置
            </div>
          )
        )}
      </div>
    </div>
  );
};
