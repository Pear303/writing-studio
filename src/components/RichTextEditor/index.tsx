import React, { useEffect, useImperativeHandle, forwardRef, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import { Selection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { SearchReplaceExtension } from '../../extensions/searchReplace';
import { Loader2, PenLine, X, StopCircle } from 'lucide-react';

export interface RichTextEditorRef {
  editor: Editor | null;
}

export interface ContinuationParams {
  previousText: string;
  cursorPosition: number;
  wordCountTarget: number;
  customInstruction: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  ref?: React.Ref<RichTextEditorRef>;
  paragraphSpacing?: string;
  paragraphIndent?: string;
  lineHeight?: string;
  onContinueWriting?: (params: ContinuationParams, onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
}

// 续写设置弹窗
const ContinuationModal: React.FC<{
  onClose: () => void;
  onConfirm: (wordCount: number, instruction: string) => void;
  onCancel: () => void;
  isWorking: boolean;
}> = ({ onClose, onConfirm, onCancel, isWorking }) => {
  const [wordCount, setWordCount] = useState(() => {
    const saved = localStorage.getItem('continuationWordCount');
    return saved ? parseInt(saved, 10) : 1000;
  });
  const [instruction, setInstruction] = useState('');

  const handleConfirm = () => {
    localStorage.setItem('continuationWordCount', String(wordCount));
    onConfirm(wordCount, instruction);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div
        className="bg-vscode-sidebar border border-vscode-border"
        style={{ width: '400px', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
          <div className="flex items-center gap-2">
            <PenLine size={16} style={{ color: 'var(--color-vscode-active)' }} />
            <span className="text-sm font-semibold text-vscode-text">AI 续写</span>
          </div>
          <button
            onClick={onClose}
            className="text-vscode-text opacity-60 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-vscode-text opacity-70 mb-1">续写字数</label>
            <div className="flex gap-2">
              {[500, 1000, 2000, 3000].map(n => (
                <button
                  key={n}
                  onClick={() => setWordCount(n)}
                  className="px-3 py-1 text-xs border rounded-sm transition-colors"
                  style={{
                    borderColor: wordCount === n ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)',
                    backgroundColor: wordCount === n ? 'rgba(0,122,204,0.15)' : 'transparent',
                    color: wordCount === n ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                  }}
                >
                  {n}字
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-vscode-text opacity-70 mb-1">自定义指令（可选）</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="例如：加入一段打斗描写、推进感情线..."
              rows={3}
              className="w-full px-3 py-2 text-sm resize-none outline-none"
              style={{
                backgroundColor: 'var(--color-vscode-bg)',
                color: 'var(--color-vscode-text)',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-vscode-border">
          {isWorking ? (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs border border-vscode-border text-vscode-text hover:opacity-80 rounded-sm flex items-center gap-1"
              style={{ backgroundColor: 'transparent' }}
            >
              <StopCircle size={12} />
              停止续写
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs border border-vscode-border text-vscode-text hover:opacity-80 rounded-sm"
                style={{ backgroundColor: 'transparent' }}
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1.5 text-xs text-white rounded-sm flex items-center gap-1"
                style={{ backgroundColor: 'var(--color-vscode-active)' }}
              >
                <PenLine size={12} />
                开始续写
              </button>
            </>
          )}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
};

/** 清洗 AI 返回的 Markdown 标记（仅清除行首标题标记和成对格式标记） */
function cleanMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')           // 移除行首 Markdown 标题标记（保留标题文字）
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')  // 移除加粗 **text**（需两侧有非空白字符）
    .replace(/(?<!\*)\*(?!\*)(\S[\s\S]*?\S)\*(?!\*)/g, '$1')  // 移除斜体 *text*（避免误删星号）
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')       // 移除删除线 ~~text~~
    .replace(/`([^`]+)`/g, '$1')            // 移除行内代码 `text`
    .trim();
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
  content,
  onChange,
  placeholder: _placeholder = '开始写作...',
  paragraphSpacing,
  paragraphIndent,
  lineHeight,
  onContinueWriting,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showContinuationModal, setShowContinuationModal] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef<string>('');
  const insertPosRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      Color,
      Underline,
      SearchReplaceExtension,
    ],
    content,
    onCreate: ({ editor }) => {
      editor.commands.setContent(content);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'max-w-none focus:outline-none px-12 py-8 text-lg leading-relaxed min-h-full',
        spellcheck: 'true',
      },
    },
  });

  // 暴露编辑器实例给父组件
  useImperativeHandle(ref, () => ({
    editor,
  }));

  // 当外部 content 变化时，更新编辑器内容
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  // 右键菜单：续写
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor || !onContinueWriting) return;

    const handleContextMenu = (e: MouseEvent) => {
      const proseMirror = container.querySelector('.ProseMirror');
      if (!proseMirror) return;
      if (!proseMirror.contains(e.target as Node)) return;

      e.preventDefault();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    };

    const handleClick = () => {
      setShowContextMenu(false);
    };

    container.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, [editor, onContinueWriting]);

  // 添加原生点击事件监听器到容器（使用捕获阶段）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor) return;

    const handleContainerClick = (e: MouseEvent) => {
      const view = editor.view;
      const { state } = view;

      const proseMirrorElement = container.querySelector('.ProseMirror');
      if (!proseMirrorElement) return;

      const editorRect = proseMirrorElement.getBoundingClientRect();
      const clickY = e.clientY - editorRect.top;

      const paragraphs = proseMirrorElement.querySelectorAll('p');
      if (paragraphs.length === 0) return;

      const lastParagraph = paragraphs[paragraphs.length - 1];
      const lastParagraphRect = lastParagraph.getBoundingClientRect();
      const lastParagraphBottom = lastParagraphRect.bottom - editorRect.top;

      if (clickY > lastParagraphBottom + 5) {
        const lastPos = state.doc.content.size;
        view.dispatch(
          state.tr.setSelection(Selection.near(state.doc.resolve(lastPos)))
        );
        setTimeout(() => view.focus(), 0);
        e.stopPropagation();
        e.preventDefault();
      }
    };

    container.addEventListener('mousedown', handleContainerClick, true);

    return () => {
      container.removeEventListener('mousedown', handleContainerClick, true);
    };
  }, [editor]);

  /** 将流式文本增量插入编辑器 */
  const insertStreamChunk = useCallback((chunk: string) => {
    if (!editor) return;

    streamBufferRef.current += chunk;

    // 按段落分割：遇到双换行时生成一个完整段落
    const buffer = streamBufferRef.current;
    const paragraphBreakIdx = buffer.lastIndexOf('\n\n');

    if (paragraphBreakIdx === -1) return; // 还没有完整段落，继续缓冲

    const completedText = buffer.slice(0, paragraphBreakIdx);
    streamBufferRef.current = buffer.slice(paragraphBreakIdx + 2); // 剩余部分继续缓冲

    const cleaned = cleanMarkdown(completedText);
    if (!cleaned) return;

    const htmlContent = cleaned
      .split(/\n{2,}/)
      .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');

    if (insertPosRef.current !== null) {
      // 在标记位置插入
      editor.chain().focus().insertContentAt(insertPosRef.current, htmlContent).run();
      // 使用 ProseMirror 文档位置重新计算插入点（而非 HTML 字符串长度）
      insertPosRef.current = editor.state.doc.content.size;
    } else {
      editor.chain().focus().insertContent(htmlContent).run();
    }
  }, [editor]);

  /** 刷出缓冲区剩余内容 */
  const flushStreamBuffer = useCallback(() => {
    if (!editor || !streamBufferRef.current) return;

    const cleaned = cleanMarkdown(streamBufferRef.current);
    streamBufferRef.current = '';

    if (!cleaned) return;

    const htmlContent = cleaned
      .split(/\n{2,}/)
      .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');

    if (insertPosRef.current !== null) {
      editor.chain().focus().insertContentAt(insertPosRef.current, htmlContent).run();
    } else {
      editor.chain().focus().insertContent(htmlContent).run();
    }
    insertPosRef.current = null;
  }, [editor]);

  const handleContinuationConfirm = useCallback(async (wordCount: number, instruction: string) => {
    if (!editor || !onContinueWriting) return;

    setIsContinuing(true);
    setContinuationError(null);
    streamBufferRef.current = '';
    insertPosRef.current = null;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const { from } = editor.state.selection;
      const cursorPos = from;
      const previousText = editor.state.doc.textBetween(0, cursorPos, '\n');

      // 记录插入起始位置
      insertPosRef.current = cursorPos;

      await onContinueWriting(
        {
          previousText,
          cursorPosition: cursorPos,
          wordCountTarget: wordCount,
          customInstruction: instruction,
        },
        insertStreamChunk,
        abortController.signal,
      );

      // 流式结束后刷出缓冲区剩余内容
      flushStreamBuffer();
      setShowContinuationModal(false);
    } catch (err) {
      // 用户主动取消不报错
      if (err instanceof Error && err.message === 'Request aborted') {
        flushStreamBuffer(); // 保留已生成的内容
        setShowContinuationModal(false);
      } else {
        setContinuationError(err instanceof Error ? err.message : '续写失败');
      }
    } finally {
      setIsContinuing(false);
      abortControllerRef.current = null;
    }
  }, [editor, onContinueWriting, insertStreamChunk, flushStreamBuffer]);

  const handleCancelContinuation = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  if (!editor) {
    return null;
  }

  const editorContainerStyle = {
    '--paragraph-spacing': paragraphSpacing || '0px',
    '--paragraph-indent': paragraphIndent || '0px',
    '--line-height': lineHeight || '1.8',
  } as React.CSSProperties;

  return (
    <div className="flex-1 h-full flex flex-col bg-vscode-bg overflow-hidden">
      {/* 编辑器内容区 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={editorContainerStyle}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 右键菜单 */}
      {showContextMenu && onContinueWriting && (
        <div
          className="fixed z-50 bg-vscode-sidebar border border-vscode-border py-1"
          style={{
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            minWidth: '160px',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-xs text-vscode-text hover:bg-vscode-active/10 flex items-center gap-2"
            onClick={() => {
              setShowContextMenu(false);
              setShowContinuationModal(true);
            }}
          >
            <PenLine size={13} style={{ color: 'var(--color-vscode-active)' }} />
            AI 续写
          </button>
        </div>
      )}

      {/* 续写设置弹窗 */}
      {showContinuationModal && (
        <ContinuationModal
          onClose={() => {
            if (isContinuing) return; // 续写中不允许关闭弹窗，只能停止
            setShowContinuationModal(false);
            setContinuationError(null);
          }}
          onConfirm={handleContinuationConfirm}
          onCancel={handleCancelContinuation}
          isWorking={isContinuing}
        />
      )}

      {/* 续写错误提示 */}
      {continuationError && !showContinuationModal && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 text-xs"
          style={{
            backgroundColor: 'var(--color-danger, #dc2626)',
            color: 'white',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {continuationError}
          <button
            className="ml-2 underline"
            onClick={() => setContinuationError(null)}
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';
