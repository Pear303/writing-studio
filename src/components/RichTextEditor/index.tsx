import React, { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Underline from '@tiptap/extension-underline';
import { Selection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export interface RichTextEditorRef {
  editor: Editor | null;
}

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  ref?: React.Ref<RichTextEditorRef>;
  paragraphSpacing?: string;
  paragraphIndent?: string;
  lineHeight?: string;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
  content,
  onChange,
  placeholder: _placeholder = '开始写作...',
  paragraphSpacing,
  paragraphIndent,
  lineHeight,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily,
      Color,
      Underline,
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

  // 添加原生点击事件监听器到容器（使用捕获阶段）
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor) return;

    const handleContainerClick = (e: MouseEvent) => {
      const view = editor.view;
      const { state } = view;
      
      // 获取编辑器的 ProseMirror 元素
      const proseMirrorElement = container.querySelector('.ProseMirror');
      if (!proseMirrorElement) return;
      
      // 获取点击位置相对于编辑器的坐标
      const editorRect = proseMirrorElement.getBoundingClientRect();
      const clickY = e.clientY - editorRect.top;
      
      // 获取所有段落元素
      const paragraphs = proseMirrorElement.querySelectorAll('p');
      if (paragraphs.length === 0) return;
      
      // 获取最后一个段落的位置
      const lastParagraph = paragraphs[paragraphs.length - 1];
      const lastParagraphRect = lastParagraph.getBoundingClientRect();
      const lastParagraphBottom = lastParagraphRect.bottom - editorRect.top;
      
      console.log('容器点击检测:', {
        clickY,
        lastParagraphBottom,
        distanceFromLast: clickY - lastParagraphBottom,
        isBelowLastParagraph: clickY > lastParagraphBottom + 5
      });
      
      // 如果点击位置在最后一个段落下方（留5px缓冲）
      if (clickY > lastParagraphBottom + 5) {
        console.log('✅ 检测到空白区域点击，移动光标到末尾');
        
        // 将光标移动到文档末尾
        const lastPos = state.doc.content.size;
        
        view.dispatch(
          state.tr.setSelection(Selection.near(state.doc.resolve(lastPos)))
        );
        
        // 聚焦编辑器
        setTimeout(() => view.focus(), 0);
        
        // 阻止事件继续传播
        e.stopPropagation();
        e.preventDefault();
      }
    };

    // 使用捕获阶段（第三个参数为 true）确保能捕获所有点击
    container.addEventListener('mousedown', handleContainerClick, true);
    
    return () => {
      container.removeEventListener('mousedown', handleContainerClick, true);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const editorContainerStyle = {
    '--paragraph-spacing': paragraphSpacing || '0px',
    '--paragraph-indent': paragraphIndent || '0px',
    '--line-height': lineHeight || '1.8',
  } as React.CSSProperties;

  return (
    <div className="flex-1 h-full flex flex-col bg-vscode-bg">
      {/* 编辑器内容区 */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto" 
        style={editorContainerStyle}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

RichTextEditor.displayName = 'RichTextEditor';