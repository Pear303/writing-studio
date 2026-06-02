import React from 'react';
import { Bold, Italic, Underline, Strikethrough, Quote } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface EditorToolbarProps {
  editor: Editor | null;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="flex items-center space-x-1 px-2 py-1 border-b border-vscode-border bg-vscode-bg">
      {/* 加粗 */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive('bold')
            ? 'bg-vscode-active text-white'
            : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
        title="加粗 (Ctrl+B)"
      >
        <Bold size={18} />
      </button>

      {/* 斜体 */}
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive('italic')
            ? 'bg-vscode-active text-white'
            : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
        title="斜体 (Ctrl+I)"
      >
        <Italic size={18} />
      </button>

      {/* 下划线 */}
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive('underline')
            ? 'bg-vscode-active text-white'
            : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
        title="下划线 (Ctrl+U)"
      >
        <Underline size={18} />
      </button>

      {/* 删除线 */}
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive('strike')
            ? 'bg-vscode-active text-white'
            : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
        title="删除线"
      >
        <Strikethrough size={18} />
      </button>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-vscode-border mx-2" />

      {/* 引用 */}
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded transition-colors ${
          editor.isActive('blockquote')
            ? 'bg-vscode-active text-white'
            : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
        title="引用"
      >
        <Quote size={18} />
      </button>
    </div>
  );
};
