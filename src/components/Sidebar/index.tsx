import React, { useState, useEffect } from 'react';
import { BookCardList } from '../BookCardList';
import { BookOutlineTree } from '../BookOutlineTree';
import { MaterialPanel } from '../MaterialPanel';
import { SettingsPanel } from '../SettingsPanel';
import { LlmConfigPanel } from '../LlmConfigPanel';
import { PipelineWriting } from '../PipelineWriting';
import type { ActivityId, Book, Chapter, Material, FormattingSettings, WordCountSettings, PipelineStep1Config, PipelineStep2State, OutlineRound, Volume } from '../../types';
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
  onVolumeChange?: () => void;
  activeChapterId?: string | null;
  onInsertMaterial?: (material: Material) => void;
  onMaterialSelect?: (material: Material) => void;
  formattingSettings?: FormattingSettings;
  onSaveFormattingSettings?: (settings: FormattingSettings) => void;
  wordCountSettings?: WordCountSettings;
  onSaveWordCountSettings?: (settings: WordCountSettings) => void;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  outlineRefreshTrigger?: number;
  width?: number;
  currentOutlineVolume?: Volume | null;
  onVolumeOutlineSelect?: (volume: Volume) => void;
  onPipelineGenerateOutline?: (config: PipelineStep1Config) => Promise<string>;
  onPipelineRefineOutline?: (step2State: PipelineStep2State, round: OutlineRound) => Promise<string>;
  onPipelineOverwriteOutline?: (markdown: string) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

export const Sidebar = ({
  activeActivity,
  isSidebarVisible,
  currentBook,
  onBookSelect,
  onBookDeselect,
  onChapterSelect,
  onVolumeChange,
  activeChapterId,
  onInsertMaterial,
  onMaterialSelect,
  formattingSettings,
  onSaveFormattingSettings,
  wordCountSettings,
  onSaveWordCountSettings,
  theme = 'dark',
  onThemeChange,
  outlineRefreshTrigger = 0,
  width = 300,
  currentOutlineVolume,
  onVolumeOutlineSelect,
  onPipelineGenerateOutline,
  onPipelineRefineOutline,
  onPipelineOverwriteOutline,
  showToast,
}: SidebarProps) => {
  // 使用 useUser hook 获取用户信息
  const { user } = useUser();
  
  const [books, setBooks] = useState<Book[]>([]);

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
                onVolumeChange={onVolumeChange}
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
              />
            ) : null
          ) : activeActivity === 'ai' ? (
            <div className="p-4 text-vscode-text">
              <h2 className="text-lg font-semibold mb-4">AI 助手</h2>
              <LlmConfigPanel />
            </div>
          ) : activeActivity === 'pipeline' ? (
            onPipelineGenerateOutline && onPipelineRefineOutline && onPipelineOverwriteOutline && showToast ? (
              <PipelineWriting
                currentBook={currentBook}
                currentOutlineVolume={currentOutlineVolume ?? null}
                onVolumeSelect={onVolumeOutlineSelect ?? (() => {})}
                onGenerateOutline={onPipelineGenerateOutline}
                onRefineOutline={onPipelineRefineOutline}
                onOverwriteOutline={onPipelineOverwriteOutline}
                showToast={showToast}
              />
            ) : null
          ) : (
            <div className="p-4 text-vscode-text">
              <h2 className="text-lg font-semibold mb-4">AI对话</h2>
               <p className="text-sm text-vscode-text opacity-70">
                 此功能正在开发中...
               </p>
            </div>
          )}
      </div>
    </div>
  );
};

