import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  PenLine, Loader2, X, CheckSquare, Square, ChevronDown, ChevronRight,
  FileText, BookOpen, Sparkles, Send, BookMarked
} from 'lucide-react';
import type { Book, Chapter, Volume, OutlineItemData } from '../../types';
import { db, getCurrentUserId } from '../../db';
import { outlineToMarkdown, computeChapterDisplayTitle, countWords } from '../../utils/helpers';

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
  onGenerateChapterOutline?: (chapterId: string, chapterTitle: string) => Promise<string>;
  onChapterSelect?: (chapter: Chapter) => void;
  onBookSelect?: (book: Book) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

// 素材选择项
interface MaterialOption {
  id: string;
  name: string;
  type: string;
  description: string;
}

// 章节记忆项：每个章节一个，含全文/大纲切换
interface ChapterMemoryItem {
  chapterId: string;
  title: string;
  displayTitle: string; // 含序号的显示标题
  order: number;
  volumeId: string;
  fullContent: string;
  outlineContent: string;
  wordCount: number;       // 全文字数
  outlineWordCount: number; // 大纲字数
  mode: 'full' | 'outline'; // 当前切换状态
  selected: boolean;
  isCurrentChapter: boolean;
}

// 卷大纲记忆项
interface VolumeMemoryItem {
  volumeId: string;
  volumeName: string;
  outlineContent: string;
  selected: boolean;
  expanded: boolean;
  chapters: ChapterMemoryItem[];
}

// 持久化配置结构
interface ContinueWritingConfig {
  plotHint: string;
  wordCountTarget: number;
  selectedMaterialIds: string[];
  // 章节记忆：chapterId -> { mode, selected }
  chapterMemoryStates: Record<string, { mode: 'full' | 'outline'; selected: boolean }>;
  // 卷大纲选中状态：volumeId -> selected
  volumeOutlineSelected: Record<string, boolean>;
  // 卷展开状态
  expandedVolumes: string[];
  // 选中的书和章节
  selectedBookId?: string;
  selectedChapterId?: string;
  // 已生成的文本
  generatedText?: string;
}

export const ContinueWritingPanel: React.FC<ContinueWritingPanelProps> = ({
  currentBook,
  currentChapter,
  editorContent,
  currentOutlineVolume,
  onContinueWriting,
  onAppendToEditor,
  onGenerateOutline,
  onGenerateChapterOutline,
  onChapterSelect,
  onBookSelect,
  showToast,
}) => {
  // ========== 选书/选章节 ==========
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // ========== 续写参数 ==========
  const [plotHint, setPlotHint] = useState('');
  const [wordCountTarget, setWordCountTarget] = useState(() => {
    const saved = localStorage.getItem('continueWritingWordCountTarget');
    return saved ? parseInt(saved, 10) : 1000;
  });

  // ========== 素材选择 ==========
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  // ========== 前文记忆 ==========
  const [volumeMemoryItems, setVolumeMemoryItems] = useState<VolumeMemoryItem[]>([]);
  const [showMemoryPicker, setShowMemoryPicker] = useState(true);
  const [generatingOutlineId, setGeneratingOutlineId] = useState<string | null>(null);

  // ========== 续写状态 ==========
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const plotHintTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ========== 持久化配置 ==========
  const getConfigStorageKey = useCallback((bookId: string) => `continueWritingConfig_${bookId}`, []);

  const saveConfig = useCallback((bookId: string, config: Partial<ContinueWritingConfig>) => {
    try {
      const existingRaw = localStorage.getItem(getConfigStorageKey(bookId));
      const existing: ContinueWritingConfig = existingRaw ? JSON.parse(existingRaw) : {};
      const merged = { ...existing, ...config };
      localStorage.setItem(getConfigStorageKey(bookId), JSON.stringify(merged));
    } catch { /* 忽略存储失败 */ }
  }, [getConfigStorageKey]);

  const loadConfig = useCallback((bookId: string): ContinueWritingConfig | null => {
    try {
      const raw = localStorage.getItem(getConfigStorageKey(bookId));
      if (raw) return JSON.parse(raw);
    } catch { /* 忽略读取失败 */ }
    return null;
  }, [getConfigStorageKey]);

  // ========== 加载书籍列表 ==========
  useEffect(() => {
    loadBooks();
  }, []);

  // 持久化 textarea 高度
  useEffect(() => {
    const textarea = plotHintTextareaRef.current;
    if (!textarea) return;
    const savedHeight = localStorage.getItem('continuePlotHintHeight');
    if (savedHeight) {
      textarea.style.height = savedHeight + 'px';
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) {
          localStorage.setItem('continuePlotHintHeight', String(Math.round(height)));
        }
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  // 外部 currentBook/currentChapter 变化时同步选中状态
  useEffect(() => {
    if (currentBook?.id && !selectedBookId) {
      setSelectedBookId(currentBook.id);
      setSelectedBook(currentBook);
      if (currentChapter?.id) {
        setSelectedChapterId(currentChapter.id);
        setSelectedChapter(currentChapter);
      }
    }
  }, [currentBook, currentChapter]);

  const loadBooks = async () => {
    try {
      const userId = getCurrentUserId();
      let all = await db.books.orderBy('updatedAt').reverse().toArray();
      if (userId) {
        all = all.filter(b => b.userId === userId);
      }
      setBooks(all);
    } catch (err) {
      console.error('加载书籍列表失败:', err);
    }
  };

  // ========== 选书处理 ==========
  const handleBookSelect = async (bookId: string) => {
    setSelectedBookId(bookId);
    setSelectedChapterId('');
    setSelectedChapter(null);

    const book = books.find(b => b.id === bookId) || null;
    setSelectedBook(book);

    if (book) {
      // 恢复该书的持久化配置
      const config = loadConfig(bookId);
      if (config) {
        setPlotHint(config.plotHint || '');
        setWordCountTarget(config.wordCountTarget || 1000);
        setSelectedMaterialIds(new Set(config.selectedMaterialIds || []));
        if (config.selectedChapterId) {
          setSelectedChapterId(config.selectedChapterId);
          // 从 DB 加载 Chapter 对象，确保 selectedChapter 不为 null
          try {
            const chapter = await db.chapters.get(config.selectedChapterId);
            if (chapter) {
              setSelectedChapter(chapter);
              onChapterSelect?.(chapter);
            }
          } catch { /* 忽略加载失败 */ }
        }
        // 恢复已生成的文本
        if (config.generatedText) {
          setGeneratedText(config.generatedText);
        }
      } else {
        setPlotHint('');
        setWordCountTarget(() => {
          const saved = localStorage.getItem('continueWritingWordCountTarget');
          return saved ? parseInt(saved, 10) : 1000;
        });
        setSelectedMaterialIds(new Set());
        setGeneratedText('');
      }

      // 通知外部
      onBookSelect?.(book);
    }
  };

  // ========== 选章节处理 ==========
  const handleChapterSelect = async (chapterId: string) => {
    setSelectedChapterId(chapterId);

    if (selectedBookId) {
      saveConfig(selectedBookId, { selectedChapterId: chapterId });
    }

    // 从数据库加载章节
    try {
      const chapter = await db.chapters.get(chapterId);
      if (chapter) {
        setSelectedChapter(chapter);
        onChapterSelect?.(chapter);
      }
    } catch (err) {
      console.error('加载章节失败:', err);
    }
  };

  // ========== 加载素材 ==========
  useEffect(() => {
    if (!selectedBookId) {
      setMaterials([]);
      return;
    }
    loadMaterials();
  }, [selectedBookId]);

  const loadMaterials = async () => {
    try {
      const userId = getCurrentUserId();
      let all = await db.materials.orderBy('updatedAt').reverse().toArray();
      if (userId) {
        all = all.filter(m => m.userId === userId);
        if (selectedBookId) {
          all = all.filter(m => !m.bookId || m.bookId === selectedBookId);
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

  // ========== 加载前文记忆（树形结构） ==========
  useEffect(() => {
    if (!selectedBookId || !selectedChapterId) {
      setVolumeMemoryItems([]);
      return;
    }
    loadMemoryTree();
  }, [selectedBookId, selectedChapterId]);

  const loadMemoryTree = async () => {
    if (!selectedBookId || !selectedChapterId || !selectedBook) return;

    try {
      const config = loadConfig(selectedBookId);
      const savedChapterStates = config?.chapterMemoryStates || {};
      const savedVolumeSelected = config?.volumeOutlineSelected || {};
      const savedExpandedVolumes = config?.expandedVolumes || [];

      // 加载该书所有卷和章节
      const [allVolumes, allChapters] = await Promise.all([
        db.volumes.where('bookId').equals(selectedBookId).sortBy('order'),
        db.chapters.where('bookId').equals(selectedBookId).sortBy('order'),
      ]);

      // 按卷分组
      const volumeItems: VolumeMemoryItem[] = [];

      for (const vol of allVolumes) {
        const volChapters = allChapters.filter(c => c.volumeId === vol.id);

        // 卷大纲
        let outlineText = '';
        if (vol.outline && vol.outline.trim()) {
          outlineText = vol.outline;
          try {
            const items: OutlineItemData[] = JSON.parse(vol.outline);
            if (Array.isArray(items) && items.length > 0) {
              outlineText = outlineToMarkdown(items);
            }
          } catch { /* 解析失败则使用原始文本 */ }
        }

        // 章节记忆项
        const chapterItems: ChapterMemoryItem[] = volChapters.map(ch => {
          const isCurrentChapter = ch.id === selectedChapterId;
          const savedState = savedChapterStates[ch.id];
          const displayTitle = computeChapterDisplayTitle(ch, allChapters, selectedBook);

          return {
            chapterId: ch.id,
            title: ch.title,
            displayTitle,
            order: ch.order,
            volumeId: vol.id,
            fullContent: ch.content || '',
            outlineContent: ch.detailedOutline || '',
            wordCount: ch.wordCount || 0,
            outlineWordCount: ch.detailedOutline ? countWords(ch.detailedOutline) : 0,
            mode: savedState?.mode || 'full',
            selected: savedState?.selected ?? (!isCurrentChapter && !!ch.content?.trim()),
            isCurrentChapter,
          };
        });

        volumeItems.push({
          volumeId: vol.id,
          volumeName: vol.name,
          outlineContent: outlineText,
          selected: savedVolumeSelected[vol.id] ?? false,
          expanded: savedExpandedVolumes.includes(vol.id) || volChapters.some(c => c.id === selectedChapterId),
          chapters: chapterItems,
        });
      }

      setVolumeMemoryItems(volumeItems);
    } catch (err) {
      console.error('加载前文记忆失败:', err);
    }
  };

  // ========== 持久化配置变更 ==========
  const persistConfig = useCallback(() => {
    if (!selectedBookId) return;

    const chapterMemoryStates: Record<string, { mode: 'full' | 'outline'; selected: boolean }> = {};
    const volumeOutlineSelected: Record<string, boolean> = {};
    const expandedVolumes: string[] = [];

    for (const vol of volumeMemoryItems) {
      volumeOutlineSelected[vol.volumeId] = vol.selected;
      if (vol.expanded) expandedVolumes.push(vol.volumeId);
      for (const ch of vol.chapters) {
        chapterMemoryStates[ch.chapterId] = { mode: ch.mode, selected: ch.selected };
      }
    }

    saveConfig(selectedBookId, {
      plotHint,
      wordCountTarget,
      selectedMaterialIds: Array.from(selectedMaterialIds),
      chapterMemoryStates,
      volumeOutlineSelected,
      expandedVolumes,
      selectedBookId,
      selectedChapterId,
      generatedText,
    });
  }, [selectedBookId, plotHint, wordCountTarget, selectedMaterialIds, volumeMemoryItems, selectedChapterId, generatedText, saveConfig]);

  // 配置变更时自动持久化
  useEffect(() => {
    persistConfig();
  }, [persistConfig]);

  // ========== 前文记忆操作 ==========
  const toggleVolumeExpanded = (volumeId: string) => {
    setVolumeMemoryItems(prev => prev.map(v =>
      v.volumeId === volumeId ? { ...v, expanded: !v.expanded } : v
    ));
  };

  const toggleVolumeOutlineSelected = (volumeId: string) => {
    setVolumeMemoryItems(prev => prev.map(v =>
      v.volumeId === volumeId ? { ...v, selected: !v.selected } : v
    ));
  };

  const toggleChapterSelected = (volumeId: string, chapterId: string) => {
    setVolumeMemoryItems(prev => prev.map(v =>
      v.volumeId === volumeId ? {
        ...v,
        chapters: v.chapters.map(ch =>
          ch.chapterId === chapterId ? { ...ch, selected: !ch.selected } : ch
        ),
      } : v
    ));
  };

  const toggleChapterMode = (volumeId: string, chapterId: string) => {
    setVolumeMemoryItems(prev => prev.map(v =>
      v.volumeId === volumeId ? {
        ...v,
        chapters: v.chapters.map(ch =>
          ch.chapterId === chapterId ? { ...ch, mode: ch.mode === 'full' ? 'outline' : 'full' } : ch
        ),
      } : v
    ));
  };

  // ========== 生成大纲 ==========
  const handleGenerateOutline = async (volumeId: string) => {
    if (!onGenerateOutline) return;
    setGeneratingOutlineId(volumeId);
    try {
      const vol = volumeMemoryItems.find(v => v.volumeId === volumeId);
      const volumeName = vol?.volumeName || '';
      const outline = await onGenerateOutline(volumeId, volumeName);
      // 更新对应卷的大纲内容
      setVolumeMemoryItems(prev => prev.map(v =>
        v.volumeId === volumeId ? { ...v, outlineContent: outline } : v
      ));
      showToast?.('大纲已生成并保存', 'success');
    } catch (err) {
      console.error('生成大纲失败:', err);
      showToast?.('生成大纲失败', 'error');
    } finally {
      setGeneratingOutlineId(null);
    }
  };

  // ========== 生成章节大纲 ==========
  const handleGenerateChapterOutline = async (volumeId: string, chapterId: string) => {
    if (!onGenerateChapterOutline) return;
    setGeneratingOutlineId(chapterId);
    try {
      const vol = volumeMemoryItems.find(v => v.volumeId === volumeId);
      const ch = vol?.chapters.find(c => c.chapterId === chapterId);
      const chapterTitle = ch?.displayTitle || ch?.title || '';
      const outline = await onGenerateChapterOutline(chapterId, chapterTitle);
      // 更新对应章节的大纲内容
      setVolumeMemoryItems(prev => prev.map(v =>
        v.volumeId === volumeId ? {
          ...v,
          chapters: v.chapters.map(c =>
            c.chapterId === chapterId ? { ...c, outlineContent: outline, outlineWordCount: countWords(outline) } : c
          ),
        } : v
      ));
      showToast?.('章节大纲已生成并保存', 'success');
    } catch (err) {
      console.error('生成章节大纲失败:', err);
      showToast?.('生成章节大纲失败', 'error');
    } finally {
      setGeneratingOutlineId(null);
    }
  };

  // ========== 组装记忆上下文 ==========
  const buildMemoryContext = useCallback((): string => {
    const parts: string[] = [];

    for (const vol of volumeMemoryItems) {
      // 卷大纲
      if (vol.selected && vol.outlineContent) {
        parts.push(`【卷大纲：${vol.volumeName}】\n${vol.outlineContent}`);
      }

      // 章节记忆
      for (const ch of vol.chapters) {
        if (!ch.selected) continue;

        if (ch.mode === 'full' && ch.fullContent && !ch.isCurrentChapter) {
          parts.push(`【章节全文：${ch.displayTitle}】\n${ch.fullContent.slice(-3000)}`);
        } else if (ch.mode === 'outline' && ch.outlineContent && !ch.isCurrentChapter) {
          parts.push(`【章节大纲：${ch.displayTitle}】\n${ch.outlineContent}`);
        }
      }
    }

    return parts.join('\n\n');
  }, [volumeMemoryItems]);

  // ========== 获取编辑器内容 ==========
  const getEffectiveContent = useCallback((): string => {
    // 优先使用外部传入的 editorContent（当前正在编辑的章节）
    // 如果选中的章节就是当前编辑的章节，用 editorContent
    if (selectedChapter?.id === currentChapter?.id && editorContent) {
      return editorContent;
    }
    // 否则用选中章节自身的内容
    return selectedChapter?.content || '';
  }, [selectedChapter, currentChapter, editorContent]);

  // ========== 执行续写 ==========
  const handleStartContinue = async () => {
    const content = getEffectiveContent();
    if (!content.trim()) {
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
          previousText: content,
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

  // 章节列表（用于渲染下拉框）
  const [chapterOptions, setChapterOptions] = useState<Chapter[]>([]);

  useEffect(() => {
    if (!selectedBookId) {
      setChapterOptions([]);
      return;
    }
    db.chapters.where('bookId').equals(selectedBookId).sortBy('order')
      .then(setChapterOptions)
      .catch(() => setChapterOptions([]));
  }, [selectedBookId]);

  // ========== 样式 ==========
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

  const selectStyle: React.CSSProperties = {
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
    cursor: 'pointer',
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

  // ========== 计算选中记忆项数 ==========
  const selectedMemoryCount = useMemo(() => {
    let count = 0;
    for (const vol of volumeMemoryItems) {
      if (vol.selected && vol.outlineContent) count++;
      for (const ch of vol.chapters) {
        if (ch.selected) count++;
      }
    }
    return count;
  }, [volumeMemoryItems]);

  // ========== 渲染 ==========
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
        {selectedChapter && (
          <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, marginLeft: 'auto' }}>
            {selectedChapter.title}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {/* 选书 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitleStyle}>
            <BookMarked size={12} />
            选择书籍
          </div>
          <select
            value={selectedBookId}
            onChange={e => handleBookSelect(e.target.value)}
            style={selectStyle}
          >
            <option value="">请选择书籍</option>
            {books.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* 选章节 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitleStyle}>
            <FileText size={12} />
            目标章节
          </div>
          <select
            value={selectedChapterId}
            onChange={e => handleChapterSelect(e.target.value)}
            style={selectStyle}
            disabled={!selectedBookId}
          >
            <option value="">请选择章节</option>
            {chapterOptions.map(ch => (
              <option key={ch.id} value={ch.id}>
                {selectedBook ? computeChapterDisplayTitle(ch, chapterOptions, selectedBook) : ch.title}
              </option>
            ))}
          </select>
        </div>

        {/* 续写剧情指引 */}
        <div style={{ marginBottom: '12px' }}>
          <div style={sectionTitleStyle}>
            <Sparkles size={12} />
            续写剧情指引
          </div>
          <textarea
            ref={plotHintTextareaRef}
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

        {/* 前文记忆 - 树形结构 */}
        <div style={{ marginBottom: '12px' }}>
          <div
            style={{ ...sectionTitleStyle, cursor: 'pointer' }}
            onClick={() => setShowMemoryPicker(!showMemoryPicker)}
          >
            {showMemoryPicker ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            前文记忆
            {selectedMemoryCount > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-active)', fontWeight: 400 }}>
                已选 {selectedMemoryCount} 项
              </span>
            )}
          </div>
          {showMemoryPicker && (
            <div style={{
              maxHeight: '400px',
              overflow: 'auto',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-vscode-bg)',
            }}>
              {volumeMemoryItems.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  {selectedBookId && selectedChapterId ? '暂无可选的前文记忆' : '请先选择书籍和章节'}
                </div>
              ) : (
                volumeMemoryItems.map(vol => (
                  <div key={vol.volumeId}>
                    {/* 卷节点 */}
                    <div style={{
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-vscode-text)',
                      backgroundColor: 'var(--color-vscode-sidebar)',
                      borderBottom: '1px solid var(--color-vscode-border)',
                    }}
                      onClick={() => toggleVolumeExpanded(vol.volumeId)}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-vscode-sidebar)')}
                    >
                      {vol.expanded
                        ? <ChevronDown size={12} style={{ flexShrink: 0 }} />
                        : <ChevronRight size={12} style={{ flexShrink: 0 }} />
                      }
                      <BookOpen size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{vol.volumeName}</span>
                    </div>

                    {/* 卷大纲行 */}
                    <div style={{
                      padding: '5px 10px 5px 28px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--color-vscode-text)',
                      borderBottom: '1px solid var(--color-vscode-border)',
                      opacity: vol.outlineContent ? 1 : 0.4,
                    }}
                      onClick={() => vol.outlineContent && toggleVolumeOutlineSelected(vol.volumeId)}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {vol.selected
                        ? <CheckSquare size={13} style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }} />
                        : <Square size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                      }
                      <BookOpen size={11} style={{ opacity: 0.4, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>卷大纲</span>
                      {!vol.outlineContent && onGenerateOutline && (
                        <button
                          type="button"
                          style={{
                            ...btnStyle('secondary'),
                            padding: '1px 6px',
                            fontSize: '10px',
                            flexShrink: 0,
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            handleGenerateOutline(vol.volumeId);
                          }}
                          disabled={generatingOutlineId === vol.volumeId}
                        >
                          {generatingOutlineId === vol.volumeId
                            ? <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} />
                            : <Sparkles size={9} />
                          }
                          生成
                        </button>
                      )}
                    </div>

                    {/* 章节点列表 */}
                    {vol.expanded && vol.chapters.map(ch => {
                      const currentModeWordCount = ch.mode === 'full' ? ch.wordCount : ch.outlineWordCount;

                      return (
                        <div
                          key={ch.chapterId}
                          style={{
                            padding: '5px 10px 5px 36px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: 'var(--color-vscode-text)',
                            borderBottom: '1px solid var(--color-vscode-border)',
                            opacity: ch.isCurrentChapter ? 0.6 : 1,
                          }}
                          onClick={() => toggleChapterSelected(vol.volumeId, ch.chapterId)}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-hover-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          {/* 选中框 */}
                          {ch.selected
                            ? <CheckSquare size={13} style={{ color: 'var(--color-vscode-active)', flexShrink: 0 }} />
                            : <Square size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                          }

                          {/* 章节标题 */}
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.displayTitle}
                            {ch.isCurrentChapter && (
                              <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '4px' }}>(当前)</span>
                            )}
                          </span>

                          {/* 全文/大纲切换开关 */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '10px',
                              padding: '1px',
                              cursor: 'pointer',
                              backgroundColor: 'var(--color-vscode-border)',
                              flexShrink: 0,
                              position: 'relative',
                              width: '56px',
                              height: '18px',
                            }}
                            onClick={e => {
                              e.stopPropagation();
                              toggleChapterMode(vol.volumeId, ch.chapterId);
                            }}
                            title={ch.mode === 'full' ? '切换到大纲' : '切换到全文'}
                          >
                            {/* 左标签：全文 */}
                            <span style={{
                              position: 'absolute',
                              left: '6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '9px',
                              fontWeight: ch.mode === 'full' ? 700 : 400,
                              color: ch.mode === 'full' ? 'white' : 'var(--color-vscode-text)',
                              opacity: ch.mode === 'full' ? 1 : 0.5,
                              pointerEvents: 'none',
                              zIndex: 1,
                            }}>
                              全文
                            </span>
                            {/* 右标签：大纲 */}
                            <span style={{
                              position: 'absolute',
                              right: '6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '9px',
                              fontWeight: ch.mode === 'outline' ? 700 : 400,
                              color: ch.mode === 'outline' ? 'white' : 'var(--color-vscode-text)',
                              opacity: ch.mode === 'outline' ? 1 : 0.5,
                              pointerEvents: 'none',
                              zIndex: 1,
                            }}>
                              大纲
                            </span>
                            {/* 滑块 */}
                            <div style={{
                              position: 'absolute',
                              top: '1px',
                              left: ch.mode === 'full' ? '1px' : '29px',
                              width: '26px',
                              height: '16px',
                              borderRadius: '8px',
                              backgroundColor: 'var(--color-vscode-active)',
                              transition: 'left 0.15s ease',
                              zIndex: 0,
                            }} />
                          </div>

                          {/* 字数 */}
                          <span style={{
                            fontSize: '10px',
                            opacity: 0.5,
                            flexShrink: 0,
                            minWidth: '32px',
                            textAlign: 'right',
                          }}>
                            {currentModeWordCount > 0 ? `${currentModeWordCount}字` : '-'}
                          </span>

                          {/* 大纲为空时生成按钮 */}
                          {ch.mode === 'outline' && !ch.outlineContent && onGenerateChapterOutline && (
                            <button
                              type="button"
                              style={{
                                ...btnStyle('secondary'),
                                padding: '1px 5px',
                                fontSize: '9px',
                                flexShrink: 0,
                              }}
                              onClick={e => {
                                e.stopPropagation();
                                handleGenerateChapterOutline(vol.volumeId, ch.chapterId);
                              }}
                              disabled={generatingOutlineId === ch.chapterId}
                            >
                              {generatingOutlineId === ch.chapterId
                                ? <Loader2 size={8} style={{ animation: 'spin 1s linear infinite' }} />
                                : <Sparkles size={8} />
                              }
                              生成
                            </button>
                          )}
                        </div>
                      );
                    })}
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
            disabled={!selectedBookId || !selectedChapterId}
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
