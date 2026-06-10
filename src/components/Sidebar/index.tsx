import React, { useState, useEffect } from 'react';
import { BookCardList } from '../BookCardList';
import { BookOutlineTree } from '../BookOutlineTree';
import { MaterialPanel } from '../MaterialPanel';
import { SettingsPanel } from '../SettingsPanel';
import { LlmConfigPanel } from '../LlmConfigPanel';
import { PipelineWriting } from '../PipelineWriting';
import { AgentPanel } from '../AgentPanel';
import { VibeWritingPanel } from '../VibeWritingPanel';
import { PipelineTabView } from '../PipelineTabView';
import { ContinueWritingPanel } from '../ContinueWritingPanel';
import { PolishPanel } from '../PolishPanel';
import { RecycleBinPanel } from '../RecycleBinPanel';
import { ImportNovelModal } from '../ImportNovelModal';
import { DeconstructionPanel } from '../BookDeconstruction';
import type { ActivityId, Book, Chapter, Material, FormattingSettings, WordCountSettings, PipelineStep1Config, PipelineStep2State, PipelineStep3Config, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound, Volume, AgentState, PipelineAutoState, PipelineSession, VibePipelineHistory } from '../../types';
import { db } from '../../db';
import { useUser } from '../../auth/UserContext';

type Theme = 'dark' | 'light' | 'eye-care';

interface SidebarProps {
  activeActivity: ActivityId;
  isSidebarVisible: boolean;
  currentBook: Book | null;
  onBookSelect?: (book: Book) => void;
  onBookDeselect?: () => void;
  onChapterSelect?: (chapter: Chapter) => void;
  onChapterDeselect?: () => void;
  onVolumeChange?: () => void;
  onVolumesWithChaptersChange?: (volumeIds: Set<string>) => void;
  chapterWordCountUpdates?: Record<string, number>;
  activeChapterId?: string | null;
  onInsertMaterial?: (material: Material) => void;
  onMaterialSelect?: (material: Material) => void;
  formattingSettings?: FormattingSettings;
  onSaveFormattingSettings?: (settings: FormattingSettings) => void;
  wordCountSettings?: WordCountSettings;
  onSaveWordCountSettings?: (settings: WordCountSettings) => void;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  autoSaveInterval?: number;
  onAutoSaveIntervalChange?: (interval: number) => void;
  editorFontSize?: number;
  onEditorFontSizeChange?: (size: number) => void;
  outlineRefreshTrigger?: number;
  width?: number;
  currentOutlineVolume?: Volume | null;
  onVolumeOutlineSelect?: (volume: Volume) => void;
  onPipelineGenerateOutline?: (config: PipelineStep1Config) => Promise<string>;
  onPipelineRefineOutline?: (step2State: PipelineStep2State, round: OutlineRound) => Promise<string>;
  onPipelineOverwriteOutline?: (markdown: string) => void;
  onPipelineGenerateDetailedOutline?: (outline: string, chapterCount: number) => Promise<string>;
  onPipelineRefineDetailedOutline?: (step4State: PipelineStep4State, round: DetailedOutlineRound, outline: string) => Promise<string>;
  onPipelineRefineDetailedOutlineChapter?: (step4State: PipelineStep4State, chapterIndices: number[], round: DetailedOutlineRound, outline: string) => Promise<string>;
  onPipelinePreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
  onPipelineGenerateChapter?: (chapterIndex: number, context?: { step4State: PipelineStep4State; step2State: PipelineStep2State | null; step3Config: PipelineStep3Config; step5State: PipelineStep5State | null }) => Promise<string>;
  onPipelineRefineChapter?: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<string>;
  onPipelinePolishChapter?: (step5State: PipelineStep5State, chapterIndex: number, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }, materialsText?: string, previousChapterContent?: string) => Promise<string>;
  onPipelineBatchGenerateChapters?: (chapters: Array<{ index: number; title: string; outline: string }>, context?: { step2State: PipelineStep2State | null; step3Config: PipelineStep3Config }) => Promise<Array<{ index: number; title: string; content: string }>>;
  onPipelineAddChapterToVolume?: (title: string, content: string, detailedOutline?: string, volumeId?: string) => void;
  onPipelineExtractFacts?: (chapterIndex: number, chapterTitle: string, chapterContent: string) => Promise<import('../../types/fact-extraction').ChapterFacts | null>;
  onPipelineCancelGeneration?: () => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
  agentState?: AgentState;
  onAgentSendMessage?: (message: string) => void;
  onAgentStopGeneration?: () => void;
  onAgentClearMessages?: () => void;
  onAgentCheckConnection?: () => void;
  onAgentUpdateApiUrl?: (url: string) => void;
  onAgentLoadSessions?: () => void;
  onAgentCreateSession?: (title?: string) => void;
  onAgentSwitchSession?: (sessionId: string) => void;
  onAgentDeleteSession?: (sessionId: string) => void;
  agentApiUrl?: string;
  vibePipelineState?: PipelineAutoState | null;
  vibeLoading?: boolean;
  vibeError?: string | null;
  onVibeStartPipeline?: (bookId: string, volumeId: string, userRequest: string) => void;
  onVibeIntervene?: (type: 'pause' | 'resume' | 'cancel' | 'redirect' | 'skip', message?: string, targetStepIndex?: number) => void;
  onVibeClearPipeline?: () => void;
  onRestoreManualSession?: (session: PipelineSession) => void;
  onRestoreVibeHistory?: (history: VibePipelineHistory) => void;
  forceReloadSessionId?: string;
  // 续写相关
  currentChapter?: Chapter | null;
  editorContent?: string;
  onContinueWriting?: (params: {
    previousText: string;
    customInstruction: string;
    wordCountTarget: number;
    selectedMaterialIds: string[];
  }, onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
  onAppendToEditor?: (content: string) => void;
  onGenerateOutline?: (volumeId: string, volumeName: string) => Promise<string>;
  // 润色相关
  onPolish?: (params: {
    chapterContent: string;
    customInstruction: string;
  }, onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
  onReplaceEditorContent?: (content: string) => void;
  // 拆书相关
  onStartDeconstruction?: (bookId: string, chapters: Array<{ index: number; title: string; content: string }>) => void;
}

export const Sidebar = ({
  activeActivity,
  isSidebarVisible,
  currentBook,
  onBookSelect,
  onBookDeselect,
  onChapterSelect,
  onChapterDeselect,
  onVolumeChange,
  onVolumesWithChaptersChange,
  chapterWordCountUpdates,
  activeChapterId,
  onInsertMaterial,
  onMaterialSelect,
  formattingSettings,
  onSaveFormattingSettings,
  wordCountSettings,
  onSaveWordCountSettings,
  theme = 'dark',
  onThemeChange,
  autoSaveInterval,
  onAutoSaveIntervalChange,
  editorFontSize,
  onEditorFontSizeChange,
  outlineRefreshTrigger = 0,
  width = 300,
  currentOutlineVolume,
  onVolumeOutlineSelect,
  onPipelineGenerateOutline,
  onPipelineRefineOutline,
  onPipelineOverwriteOutline,
  onPipelineGenerateDetailedOutline,
  onPipelineRefineDetailedOutline,
  onPipelineRefineDetailedOutlineChapter,
  onPipelinePreviewInEditor,
  onPipelineGenerateChapter,
  onPipelineRefineChapter,
  onPipelinePolishChapter,
  onPipelineBatchGenerateChapters,
  onPipelineAddChapterToVolume,
  onPipelineExtractFacts,
  onPipelineCancelGeneration,
  showToast,
  agentState,
  onAgentSendMessage,
  onAgentStopGeneration,
  onAgentClearMessages,
  onAgentCheckConnection,
  onAgentUpdateApiUrl,
  onAgentLoadSessions,
  onAgentCreateSession,
  onAgentSwitchSession,
  onAgentDeleteSession,
  agentApiUrl,
  vibePipelineState,
  vibeLoading,
  vibeError,
  onVibeStartPipeline,
  onVibeIntervene,
  onVibeClearPipeline,
  onRestoreManualSession,
  onRestoreVibeHistory,
  forceReloadSessionId,
  currentChapter,
  editorContent,
  onContinueWriting,
  onAppendToEditor,
  onGenerateOutline,
  onPolish,
  onReplaceEditorContent,
  onStartDeconstruction,
}: SidebarProps) => {
  const { user } = useUser();
  
  const [books, setBooks] = useState<Book[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  // 加载书籍列表
  useEffect(() => {
    if (activeActivity === 'books') {
      loadBooks();
    }
  }, [activeActivity]);

  const loadBooks = async () => {
    try {
      const currentUserId = user?.id;
      let allBooks = await db.books.orderBy('updatedAt').reverse().toArray();
      // 严格按 userId 隔离数据
      if (currentUserId) {
        allBooks = allBooks.filter(b => b.userId === currentUserId);
      } else {
        allBooks = [];
      }
      setBooks(allBooks);
    } catch (error) {
      console.error('加载书籍失败:', error);
    }
  };

  const handleRefresh = () => {
    loadBooks();
  };

  return (
    <div
      className="h-full bg-vscode-sidebar border-r border-vscode-border overflow-hidden"
      style={{
        width: width,
        minWidth: width,
        maxWidth: width,
      }}
    >
      <div 
        className="h-full overflow-y-auto overflow-x-hidden"
      >
        {activeActivity === 'books' ? (
            currentBook ? (
              // 显示书籍大纲树
              <BookOutlineTree
                book={currentBook}
                onChapterSelect={(chapter: Chapter) => {
                  if (onChapterSelect) {
                    onChapterSelect(chapter);
                  }
                }}
                onBookDeselect={onBookDeselect}
                onChapterDeselect={onChapterDeselect}
                onVolumeChange={() => {
                  onVolumeChange?.();
                  loadBooks();
                }}
                onVolumesWithChaptersChange={onVolumesWithChaptersChange}
                chapterWordCountUpdates={chapterWordCountUpdates}
                activeChapterId={activeChapterId}
                refreshTrigger={outlineRefreshTrigger}
              />
            ) : (
              // 显示书籍卡片列表
              <BookCardList
                books={books}
                onBookSelect={(book) => {
                  if (onBookSelect) {
                    onBookSelect(book);
                  }
                }}
                onRefresh={handleRefresh}
                onStartDeconstruction={onStartDeconstruction}
              />
            )
          ) : activeActivity === 'materials' ? (
            // 显示素材面板
            <MaterialPanel onInsertMaterial={onInsertMaterial} onMaterialSelect={onMaterialSelect} currentBook={currentBook} />
          ) : activeActivity === 'settings' ? (
            formattingSettings && onSaveFormattingSettings ? (
              <SettingsPanel
                formattingSettings={formattingSettings}
                onSaveFormattingSettings={onSaveFormattingSettings}
                wordCountSettings={wordCountSettings}
                onSaveWordCountSettings={onSaveWordCountSettings}
                theme={theme}
                onThemeChange={onThemeChange}
                autoSaveInterval={autoSaveInterval}
                onAutoSaveIntervalChange={onAutoSaveIntervalChange}
                editorFontSize={editorFontSize}
                onEditorFontSizeChange={onEditorFontSizeChange}
              />
            ) : null
          ) : activeActivity === 'agent' ? (
            agentState && onAgentSendMessage ? (
              <AgentPanel
                state={agentState}
                onSendMessage={onAgentSendMessage}
                onStopGeneration={onAgentStopGeneration || (() => {})}
                onClearMessages={onAgentClearMessages || (() => {})}
                onCheckConnection={onAgentCheckConnection || (() => {})}
                onUpdateApiUrl={onAgentUpdateApiUrl || (() => {})}
                onLoadSessions={onAgentLoadSessions || (() => {})}
                onCreateSession={onAgentCreateSession || (() => {})}
                onSwitchSession={onAgentSwitchSession || (() => {})}
                onDeleteSession={onAgentDeleteSession || (() => {})}
                apiUrl={agentApiUrl || 'http://localhost:8000'}
                onImportNovel={() => setShowImportModal(true)}
              />
            ) : (
              <div className="p-4 text-vscode-text">
                <h2 className="text-lg font-semibold mb-4">Agent</h2>
                <p className="text-sm text-vscode-text opacity-70">Agent 未初始化</p>
              </div>
            )
          ) : activeActivity === 'pipeline' ? (
            <PipelineTabView
              currentBook={currentBook}
              currentOutlineVolume={currentOutlineVolume ?? null}
              vibePipelineState={vibePipelineState ?? null}
              vibeLoading={vibeLoading ?? false}
              vibeError={vibeError ?? null}
              onVibeStartPipeline={onVibeStartPipeline}
              onVibeIntervene={onVibeIntervene}
              onVibeClearPipeline={onVibeClearPipeline}
              onPipelineGenerateOutline={onPipelineGenerateOutline}
              onPipelineRefineOutline={onPipelineRefineOutline}
              onPipelineOverwriteOutline={onPipelineOverwriteOutline}
              onPipelineGenerateDetailedOutline={onPipelineGenerateDetailedOutline}
              onPipelineRefineDetailedOutline={onPipelineRefineDetailedOutline}
              onPipelineRefineDetailedOutlineChapter={onPipelineRefineDetailedOutlineChapter}
              onPipelineGenerateChapter={onPipelineGenerateChapter}
              onPipelineRefineChapter={onPipelineRefineChapter}
              onPipelinePolishChapter={onPipelinePolishChapter}
              onPipelineBatchGenerateChapters={onPipelineBatchGenerateChapters}
              onPipelineAddChapterToVolume={onPipelineAddChapterToVolume}
              onPipelinePreviewInEditor={onPipelinePreviewInEditor}
              onPipelineExtractFacts={onPipelineExtractFacts}
              onPipelineCancelGeneration={onPipelineCancelGeneration}
              showToast={showToast}
              onRestoreManualSession={onRestoreManualSession}
              onRestoreVibeHistory={onRestoreVibeHistory}
              forceReloadSessionId={forceReloadSessionId}
            />
          ) : activeActivity === 'continue' ? (
            <ContinueWritingPanel
              currentBook={currentBook}
              currentChapter={currentChapter ?? null}
              editorContent={editorContent || ''}
              currentOutlineVolume={currentOutlineVolume ?? null}
              onContinueWriting={onContinueWriting || (async () => {})}
              onAppendToEditor={onAppendToEditor}
              onGenerateOutline={onGenerateOutline}
              showToast={showToast}
            />
          ) : activeActivity === 'polish' ? (
            <PolishPanel
              currentBook={currentBook}
              currentChapter={currentChapter ?? null}
              editorContent={editorContent || ''}
              onPolish={onPolish || (async () => {})}
              onReplaceEditorContent={onReplaceEditorContent}
              showToast={showToast}
            />
          ) : activeActivity === 'deconstruction' ? (
            <DeconstructionPanel
              showToast={showToast}
              onBookCreated={async (bookId) => {
                loadBooks();
                const book = books.find(b => b.id === bookId);
                if (book && onBookSelect) onBookSelect(book);
              }}
            />
          ) : activeActivity === 'recycleBin' ? (
            <RecycleBinPanel
              onRestore={() => {
                onVolumeChange?.();
                loadBooks();
              }}
            />
          ) : (
            <div className="p-4 text-vscode-text">
              <h2 className="text-lg font-semibold mb-4">AI对话</h2>
               <p className="text-sm text-vscode-text opacity-70">
                 此功能正在开发中...
               </p>
            </div>
          )}
      </div>

      <ImportNovelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(bookId) => {
          loadBooks();
          const book = books.find(b => b.id === bookId);
          if (book && onBookSelect) onBookSelect(book);
        }}
        onStartDeconstruction={onStartDeconstruction}
        showToast={showToast || ((msg, type) => {})}
      />
    </div>
  );
};

