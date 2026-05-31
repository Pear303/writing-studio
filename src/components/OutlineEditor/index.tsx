import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Save, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Volume, OutlineItemData } from '../../types';
import { db } from '../../db';
import { outlineToMarkdown, markdownToOutline } from '../../utils/helpers';

export interface OutlineEditorRef {
  importOutline: (items: OutlineItemData[]) => void;
}

interface OutlineEditorProps {
  volume: Volume;
  onSave?: (volume: Volume) => void;
  onBack?: () => void;
}

export const OutlineEditor = forwardRef<OutlineEditorRef, OutlineEditorProps>(
  ({ volume, onSave, onBack }, ref) => {
    const [text, setText] = useState<string>('');
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [pendingImport, setPendingImport] = useState<OutlineItemData[] | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const textRef = useRef(text);
    textRef.current = text;

    useEffect(() => {
      try {
        const items: OutlineItemData[] = volume.outline
          ? JSON.parse(volume.outline)
          : [];
        setText(outlineToMarkdown(items));
        setSaveStatus('saved');
      } catch {
        setText('');
      }
    }, [volume.outline]);

    const persistOutline = useCallback(
      async (markdown: string) => {
        setSaveStatus('saving');
        try {
          const items = markdownToOutline(markdown);
          const outlineJson = JSON.stringify(items);
          await db.volumes.update(volume.id, { outline: outlineJson });
          const updated = await db.volumes.get(volume.id);
          if (updated && onSave) {
            onSave(updated);
          }
          setSaveStatus('saved');
        } catch (error) {
          console.error('保存大纲失败:', error);
          setSaveStatus('unsaved');
        }
      },
      [volume.id, onSave],
    );

    const scheduleSave = useCallback(
      (value: string) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setSaveStatus('unsaved');
        saveTimerRef.current = setTimeout(() => persistOutline(value), 600);
      },
      [persistOutline],
    );

    useEffect(() => {
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);
      scheduleSave(value);
    };

    const handleManualSave = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      persistOutline(textRef.current);
    };

    const doImport = (items: OutlineItemData[], mode: 'replace' | 'append') => {
      const newMarkdown = outlineToMarkdown(items);
      const current = textRef.current;
      const combined =
        mode === 'replace' || !current.trim()
          ? newMarkdown
          : current + '\n' + newMarkdown;
      setText(combined);
      scheduleSave(combined);
    };

    useImperativeHandle(
      ref,
      () => ({
        importOutline(items: OutlineItemData[]) {
          const hasContent = textRef.current.trim().length > 0;
          if (hasContent) {
            setPendingImport(items);
          } else {
            doImport(items, 'replace');
          }
        },
      }),
      [],
    );

    const confirmImport = (mode: 'replace' | 'append') => {
      if (pendingImport) {
        doImport(pendingImport, mode);
        setPendingImport(null);
      }
    };

    const cancelImport = () => {
      setPendingImport(null);
    };

    return (
      <div className="h-full flex flex-col bg-vscode-bg">
        {/* 标题栏 */}
        <div className="px-4 py-2 border-b border-vscode-border flex items-center justify-between bg-vscode-sidebar">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} className="icon-btn" title="返回">
                <ChevronRight size={16} className="rotate-180" />
              </button>
            )}
            <h3 className="text-sm font-semibold text-vscode-text truncate">
              大纲：{volume.name}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs ${
                saveStatus === 'saved'
                  ? 'text-green-500'
                  : saveStatus === 'saving'
                    ? 'text-yellow-500'
                    : 'text-red-500'
              }`}
            >
              {saveStatus === 'saved'
                ? '已保存'
                : saveStatus === 'saving'
                  ? '保存中...'
                  : '未保存'}
            </span>
            <button onClick={handleManualSave} className="icon-btn" title="保存">
              <Save size={14} />
            </button>
          </div>
        </div>

        {/* 导入确认栏 */}
        {pendingImport && (
          <div
            className="flex items-center gap-3 px-4 py-2.5 border-b"
            style={{
              backgroundColor: 'var(--color-vscode-sidebar)',
              borderColor: 'var(--color-vscode-border)',
              borderLeft: '3px solid var(--color-vscode-active)',
            }}
          >
            <AlertTriangle
              size={16}
              style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }}
            />
            <span
              className="text-sm flex-1"
              style={{ color: 'var(--color-vscode-text)' }}
            >
              大纲编辑区已有内容，如何处理提炼结果？
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => confirmImport('replace')}
                className="px-3 py-1 text-xs transition-colors"
                style={{
                  color: 'white',
                  backgroundColor: 'var(--color-vscode-active)',
                  border: '1px solid var(--color-vscode-active)',
                }}
              >
                覆盖
              </button>
              <button
                onClick={() => confirmImport('append')}
                className="px-3 py-1 text-xs transition-colors hover:brightness-110"
                style={{
                  color: 'var(--color-vscode-text)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-vscode-border)',
                }}
              >
                粘贴在最后
              </button>
              <button
                onClick={cancelImport}
                className="px-3 py-1 text-xs transition-colors hover:brightness-110"
                style={{
                  color: 'var(--color-vscode-text)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-vscode-border)',
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 编辑区 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          placeholder={
            '- 一级条目\n  - 子条目（两个空格缩进）\n  - 另一个子条目\n- 同级条目'
          }
          className="flex-1 w-full resize-none bg-transparent text-sm outline-none border-none p-4 font-mono leading-relaxed"
          style={{
            color: 'var(--color-vscode-text)',
            fontFamily:
              'var(--editor-font-family, Consolas, Monaco, "Courier New", monospace)',
          }}
          spellCheck={false}
        />
      </div>
    );
  },
);

OutlineEditor.displayName = 'OutlineEditor';

export default OutlineEditor;
