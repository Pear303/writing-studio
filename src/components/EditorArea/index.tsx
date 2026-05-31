import React, { forwardRef } from 'react';
import { RichTextEditor, type RichTextEditorRef } from '../RichTextEditor';
import type { Chapter, Book } from '../../types';

interface EditorAreaProps {
  content: string;
  onContentChange: (content: string) => void;
  title?: string;
  onTitleChange?: (title: string) => void;
  placeholder?: string;
  editorRef?: React.Ref<RichTextEditorRef>;
  paragraphSpacing?: string;
  paragraphIndent?: string;
  lineHeight?: string;
  isFullScreen?: boolean;
  wordCount?: number;
  currentChapter?: Chapter | null;
  currentBook?: Book | null;
}

export const EditorArea = forwardRef<RichTextEditorRef, EditorAreaProps>(({
  content,
  onContentChange,
  title = '',
  onTitleChange,
  placeholder = '开始写作...',
  editorRef,
  paragraphSpacing,
  paragraphIndent,
  lineHeight,
  isFullScreen,
  wordCount,
  currentChapter,
  currentBook,
}, ref) => {
  return (
    <div className="flex-1 h-full flex flex-col bg-vscode-bg">
      {/* 标题编辑区域 */}
      {currentChapter && onTitleChange && (
        <div className="border-b border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-6 py-3">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="输入章节标题..."
            className="w-full text-xl font-semibold text-gray-900 dark:text-gray-100 bg-transparent border-none outline-none placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
      )}
      
      {/* 富文本编辑器（内部包含工具栏） */}
      <RichTextEditor
        ref={ref || editorRef}
        content={content}
        onChange={onContentChange}
        placeholder={placeholder}
        paragraphSpacing={paragraphSpacing}
        paragraphIndent={paragraphIndent}
        lineHeight={lineHeight}
      />
    </div>
  );
});

EditorArea.displayName = 'EditorArea';
