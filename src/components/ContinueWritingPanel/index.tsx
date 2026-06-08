import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PenLine, Loader2, X, CheckSquare, Square, ChevronDown, ChevronRight,
  FileText, BookOpen, Sparkles, Send
} from 'lucide-react';
import type { Book, Chapter, Volume, Material, OutlineItemData } from '../../types';
import { db, getCurrentUserId } from '../../db';
import { outlineToMarkdown } from '../../utils/helpers';

interface ContinueWritingPanelProps {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  editorContent: string;
  currentOutlineVolume: Volume | null;
  onContinueWriting: (params: {
    previousText: string;
    customInstruction: string;
    wordCountTarget: number;
    selectedMaterialIds: string[];
  }, onChunk: (chunk: string) => void, signal: AbortSignal) => Promise<void>;
  onAppendToEditor?: (content: string) => void;
  onGenerateOutline?: (volumeId: string, volumeName: string) => Promise<string>;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

// 素材选择项
interface MaterialOption {
  id: string;
  name: string;
  type: string;
  description: string;
}

// 前文记忆选项
interface MemoryOption {
  id: string;
  label: string;
  type: 'chapter_full' | 'chapter_outline' | 'volume_outline';
  content: string;
}

export const ContinueWritingPanel: React.FC<ContinueWritingPanelProps> = ({
  currentBook,
  currentChapter,
  editorContent,
  currentOutlineVolume,
  onContinueWriting,
  onAppendToEditor,
  onGenerateOutline,
  showToast,
}) => {
  // 续写参数
  const [plotHint, setPlotHint] = useState('');
  const [wordCountTarget, setWordCountTarget] = useState(() => {
    const saved = localStorage.getItem('continueWritingWordCountTarget');
    return saved ? parseInt(saved, 10) : 1000;
  });

  // 素材选择
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  // 前文记忆
  const [memoryOptions, setMemoryOptions] = useState<MemoryOption[]>([]);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState<Set<string>>(new Set());
  const [showMemoryPicker, setShowMemoryPicker] = useState(false);
  const [generatingOutlineId, setGeneratingOutlineId] = useState<string | null>(null);

  // 持久化前文记忆选择偏好
  const getMemoryStorageKey = useCallback((bookId: string) => `continueWritingMemory_${bookId}`, []);

  const saveMemorySelection = useCallback((bookId: string, ids: Set<string>) => {
    try {
      localStorage.setItem(getMemoryStorageKey(bookId), JSON.stringify(Array.from(ids)));
    } catch { /* 忽略存储失败 */ }
  }, [getMemoryStorageKey]);

  const loadMemorySelection = useCallback((bookId: string): Set<string> => {
    try {
      const saved = localStorage.getItem(getMemoryStorageKey(bookId));
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch { /* 忽略读取失败 */ }
    return new Set();
  }, [getMemoryStorageKey]);

  // 续写状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 加载素材
  useEffect(() => {
    if (!currentBook?.id) {
      setMaterials([]);
      return;
    }
    loadMaterials();
  }, [currentBook?.id]);

  const loadMaterials = async () => {
    try {
      const userId = getCurrentUserId();
      let all = await db.materials.orderBy('updatedAt').reverse().toArray();
      if (userId) {
        all = all.filter(m => m.userId === userId);
        if (currentBook?.id) {
          all = all.filter(m => !m.bookId || m.bookId === currentBook.id);
        } else {
          all = all.filter(m => !m.bookId);
        }
      }
      setMaterials(all.map(m => ({
        id: m.id,
        name: m.name,
        type: m.type,
        description: m.description,
      })));
    } catch (err) {
      console.error('加载素材失败:', err);
    }
  };

  // 加载前文记忆选项
  useEffect(() => {
    if (!currentBook?.id) {
      setMemoryOptions([]);
      return;
    }
    loadMemoryOptions();
  }, [currentBook?.id, currentOutlineVolume?.id, currentChapter?.volumeId]);

  const loadMemoryOptions = async () => {
    try {
      const options: MemoryOption[] = [];

      // 确定当前卷 ID：优先使用 currentOutlineVolume，否则从 currentChapter 推导
      let volumeId = currentOutlineVolume?.id || currentChapter?.volumeId || null;

      if (volumeId) {
        // 加载当前卷的章节
        const chapters = await db.chapters
          .where('volumeId')
          .equals(volumeId)
          .sortBy('order');

        for (const ch of chapters) {
          // 跳过当前章节的全文（previousText 已包含当前章节正文，避免重复）
          const isCurrentChapter = ch.id === currentChapter?.id;

          // 章节全文（排除当前章节）
          if (!isCurrentChapter && ch.content && ch.content.trim()) {
            options.push({
              id: `chapter_full_${ch.id}`,
              label: `${ch.title} - 全文`,
              type: 'chapter_full',
              content: ch.content,
            });
          }
          // 章节大纲（当前章节也保留，因为大纲是概要信息，与正文不同）
          if (ch.detailedOutline && ch.detailedOutline.trim()) {
            options.push({
              id: `chapter_outline_${ch.id}`,
              label: `${ch.title} - 大纲`,
              type: 'chapter_outline',
              content: ch.detailedOutline,
            });
          }
        }

        // 卷大纲
        const vol = await db.volumes.get(volumeId);
        if (vol?.outline && vol.outline.trim()) {
          // outline 是 JSON 序列化的 OutlineItemData[]，需转为可读文本
          let outlineText = vol.outline;
          try {
            const items: OutlineItemData[] = JSON.parse(vol.outline);
            if (Array.isArray(items) && items.length > 0) {
              outlineText = outlineToMarkdown(items);
            }
          } catch { /* 解析失败则使用原始文本 */ }
          options.push({
            id: `volume_outline_${vol.id}`,
            label: `${vol.name} - 卷大纲`,
            type: 'volume_outline',
            content: outlineText,
          });
        }
      }

      setMemoryOptions(options);

      // 恢复之前保存的选择偏好（与当前可用的 options 取交集）
      if (currentBook?.id) {
        const savedIds = loadMemorySelection(currentBook.id);
        const availableIds = new Set(options.map(o => o.id));
        const restored = new Set([...savedIds].filter(id => availableIds.has(id)));
        setSelectedMemoryIds(restored);
      }
    } catch (err) {
      console.error('加载前文记忆选项失败:', err);
    }
  };

  // 组装记忆上下文
  const buildMemoryContext = useCallback((): string => {
    const parts: string[] = [];
    const selectedOptions = memoryOptions.filter(o => selectedMemoryIds.has(o.id));

    for (const opt of selectedOptions) {
      switch (opt.type) {
        case 'chapter_full':
          parts.push(`【章节全文：${opt.label.replace(' - 全文', '')}】\n${opt.content.slice(-3000)}`);
          break;
        case 'chapter_outline':
          parts.push(`【章节大纲：${opt.label.replace(' - 大纲', '')}】\n${opt.content}`);
          break;
        case 'volume_outline':
          parts.push(`【卷大纲：${opt.label.replace(' - 卷大纲', '')}】\n${opt.content}`);
          break;
      }
    }
    return parts.join('\n\n');
  }, [memoryOptions, selectedMemoryIds]);

  // 生成大纲
  const handleGenerateOutline = async (option: MemoryOption) => {
    const volumeId = currentOutlineVolume?.id || currentChapter?.volumeId || null;
    if (!volumeId || !onGenerateOutline) return;
    setGeneratingOutlineId(option.id);
    try {
      // 获取卷名称
      const vol = await db.volumes.get(volumeId);
      const volumeName = vol?.name || currentOutlineVolume?.name || '';
      const outline = await onGenerateOutline(volumeId, volumeName);
      // 更新对应选项的内容
      setMemoryOptions(prev => prev.map(o =>
        o.id === option.id ? { ...o, content: outline } : o
      ));
      showToast?.('大纲已生成并保存', 'success');
      // 重新加载以获取最新数据
      await loadMemoryOptions();
    } catch (err) {
      console.error('生成大纲失败:', err);
      showToast?.('生成大纲失败', 'error');
    } finally {
      setGeneratingOutlineId(null);
    }
  };

  // 执行续写
  const handleStartContinue = async () => {
    if (!editorContent.trim()) {
      showToast?.('当前章节内容为空，无法续写', 'warning');
      return;
    }

    setIsGenerating(true);
    setGeneratedText('');
    abortRef.current = new AbortController();

    try {
      const memoryContext = buildMemoryContext();
      const customInstruction = [
        plotHint.trim() ? `续写剧情指引：${plotHint.trim()}` : '',
        memoryContext ? `前文记忆：\n${memoryContext}` : '',
      ].filter(Boolean).join('\n\n');

      await onContinueWriting(
        {
          previousText: editorContent,
          customInstruction,
          wordCountTarget,
          selectedMaterialIds: Array.from(selectedMaterialIds),
        },
        (chunk) => {
          setGeneratedText(prev => prev + chunk);
        },
        abortRef.current.signal,
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('续写失败:', err);
        showToast?.('续写失败: ' + (err.message || '未知错误'), 'error');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  // 取消续写
  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // 录入编辑器
  const handleAppend = () => {
    if (generatedText && onAppendToEditor) {
      onAppendToEditor(generatedText);
      setGeneratedText('');
      showToast?.('已录入编辑器', 'success');
    }
  };

  // 切换素材选择
  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 切换记忆选择
  const toggleMemory = (id: string) => {
    setSelectedMemoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // 持久化选择偏好
      if (currentBook?.id) {
        saveMemorySelection(currentBook.id, next);
      }
      return next;
    });
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-vscode-text)',
    opacity: 0.7,
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid var(--color-vscode-border)',
    borderRadius: '3px',
    backgroundColor: 'var(--color-vscode-bg)',
    color: 'var(--color-vscode-text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  };

  const btnStyle = (variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: '6px 12px',
      fontSize: '12px',
      borderRadius: '4px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      border: 'none',
      fontWeight: 500,
    };
    switch (variant) {
      case 'primary':
        return { ...base, backgroundColor: 'var(--color-vscode-active)', color: 'white' };
      case 'secondary':
        return { ...base, backgroundColor: 'var(--color-vscode-input)', color: 'var(--color-vscode-text)', border: '1px solid var(--color-vscode-border)' };
      case 'danger':
        return { ...base, backgroundColor: 'rgba(220,38,38,0.15)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)' };
    }
  };

  if (!currentBook) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先选择一本书籍
        </p>
      </div>
    );
  }

  if (!currentChapter) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先选择一个章节
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 标题 */}
      <div style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--color-vscode-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
      }}>
        <PenLine size={16} style={{ color: 'var(--color-vscode-active)' }} />
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>续写</span>
        <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, marginLeft: 'auto' }}>
          {currentChapter.title}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* 续写剧情 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitleStyle}>
            <Sparkles size={12} />
            续写剧情指引
          </div>
          <textarea
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', lineHeight: '1.5' }}
            placeholder="描述接下来要续写的大致剧情走向..."
            value={plotHint}
            onChange={e => setPlotHint(e.target.value)}
          />
        </div>

        {/* 字数目标 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitleStyle}>
            字数目标
          </div>
          <input
            type="number"
            min={100}
            max={10000}
            value={wordCountTarget}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 100 && v <= 10000) {
                setWordCountTarget(v);
                localStorage.setItem('continueWritingWordCountTarget', String(v));
              }
            }}
            style={{ ...inputStyle, width: '120px' }}
          />
        </div>

        {/* 素材卡牌选择 */}
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{ ...sectionTitleStyle, cursor: 'pointer' }}
            onClick={() => setShowMaterialPicker(!showMaterialPicker)}
          >
            {showMaterialPicker ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            素材卡牌（可选）
            {selectedMaterialIds.size > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-active)', fontWeight: 400 }}>
                已选 {selectedMaterialIds.size} 个
              </span>
            )}
          </div>
          {showMaterialPicker && (
            <div style={{
              maxHeight: '200px',
              overflow: 'auto',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-vscode-bg)',
            }}>
              {materials.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  暂无素材，请在素材箱中添加
                </div>
              ) : (
                materials.map(m => (
                  <div
                    key={m.id}
                    style={{
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--color-vscode-text)',
                      borderBottom: '1px solid var(--color-vscode-border)',
                    }}
                    onClick={() => toggleMaterial(m.id)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {selectedMaterialIds.has(m.id)
                      ? <CheckSquare size={14} style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }} />
                      : <Square size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                    }
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                    <span style={{ opacity: 0.4, fontSize: '11px' }}>{m.type}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 前文记忆 */}
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{ ...sectionTitleStyle, cursor: 'pointer' }}
            onClick={() => setShowMemoryPicker(!showMemoryPicker)}
          >
            {showMemoryPicker ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            前文记忆
            {selectedMemoryIds.size > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-active)', fontWeight: 400 }}>
                已选 {selectedMemoryIds.size} 项
              </span>
            )}
          </div>
          {showMemoryPicker && (
            <div style={{
              maxHeight: '250px',
              overflow: 'auto',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-vscode-bg)',
            }}>
              {memoryOptions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  暂无可选的前文记忆
                </div>
              ) : (
                memoryOptions.map(opt => (
                  <div
                    key={opt.id}
                    style={{
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--color-vscode-text)',
                      borderBottom: '1px solid var(--color-vscode-border)',
                    }}
                    onClick={() => toggleMemory(opt.id)}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {selectedMemoryIds.has(opt.id)
                      ? <CheckSquare size={14} style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }} />
                      : <Square size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                    }
                    {opt.type === 'chapter_full' && <FileText size={12} style={{ opacity: 0.5, flexShrink: 0 }} />}
                    {opt.type === 'chapter_outline' && <FileText size={12} style={{ opacity: 0.5, flexShrink: 0 }} />}
                    {opt.type === 'volume_outline' && <BookOpen size={12} style={{ opacity: 0.5, flexShrink: 0 }} />}
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {/* 如果内容为空，显示生成大纲按钮 */}
                    {!opt.content && opt.type !== 'chapter_full' && onGenerateOutline && (
                      <button
                        type="button"
                        style={{
                          ...btnStyle('secondary'),
                          padding: '2px 6px',
                          fontSize: '11px',
                          flexShrink: 0,
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          handleGenerateOutline(opt);
                        }}
                        disabled={generatingOutlineId === opt.id}
                      >
                        {generatingOutlineId === opt.id
                          ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                          : <Sparkles size={10} />
                        }
                        生成大纲
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 续写结果 */}
        {generatedText && (
          <div style={{ marginBottom: '12px' }}>
            <div style={sectionTitleStyle}>
              续写结果
              <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.5 }}>
                {generatedText.length} 字
              </span>
            </div>
            <div style={{
              padding: '8px 10px',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-vscode-bg)',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--color-vscode-text)',
              maxHeight: '300px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
            }}>
              {generatedText}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <button type="button" style={btnStyle('primary')} onClick={handleAppend}>
                录入编辑器
              </button>
              <button type="button" style={btnStyle('secondary')} onClick={() => setGeneratedText('')}>
                <X size={12} />
                清除
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--color-vscode-border)',
        display: 'flex',
        gap: '8px',
        flexShrink: 0,
      }}>
        {!isGenerating ? (
          <button
            type="button"
            style={{
              ...btnStyle('primary'),
              flex: 1,
              justifyContent: 'center',
              padding: '8px 16px',
            }}
            onClick={handleStartContinue}
          >
            <Send size={14} />
            开始续写
          </button>
        ) : (
          <button
            type="button"
            style={{
              ...btnStyle('danger'),
              flex: 1,
              justifyContent: 'center',
              padding: '8px 16px',
            }}
            onClick={handleCancel}
          >
            <X size={14} />
            取消续写
          </button>
        )}
      </div>

      {isGenerating && (
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
};

export default ContinueWritingPanel;
