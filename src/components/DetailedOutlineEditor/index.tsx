import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, ChevronRight } from 'lucide-react';
import type { Chapter } from '../../types';
import { db } from '../../db';

interface DetailedOutlineEditorProps {
  chapter: Chapter;
  onSave?: (chapter: Chapter) => void;
  onBack?: () => void;
}

export const DetailedOutlineEditor = ({ chapter, onSave, onBack }: DetailedOutlineEditorProps) => {
  const [text, setText] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    setText(chapter.detailedOutline || '');
    setSaveStatus('saved');
  }, [chapter.id, chapter.detailedOutline]);

  const persistOutline = useCallback(
    async (content: string) => {
      setSaveStatus('saving');
      try {
        const value = content.trim() || undefined;
        await db.chapters.update(chapter.id, { detailedOutline: value });
        const updated = await db.chapters.get(chapter.id);
        if (updated && onSave) {
          onSave(updated);
        }
        setSaveStatus('saved');
      } catch (error) {
        console.error('保存细纲失败:', error);
        setSaveStatus('unsaved');
      }
    },
    [chapter.id, onSave],
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

  return (
    <div className="h-full flex flex-col bg-vscode-bg">
      <div className="px-4 py-2 border-b border-vscode-border flex items-center justify-between bg-vscode-sidebar">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="icon-btn" title="返回">
              <ChevronRight size={16} className="rotate-180" />
            </button>
          )}
          <h3 className="text-sm font-semibold text-vscode-text truncate">
            细纲：{chapter.title}
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

      <textarea
        value={text}
        onChange={handleChange}
        placeholder="在此编写本章的细纲内容…"
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
};

export default DetailedOutlineEditor;
