import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Edit, Trash2, Download, FolderPlus, FilePlus, ArrowRight, ArrowUp, ArrowDown, FileText, Clock, ArrowLeft, X, Move, ChevronRight, ChevronDown, BookOpen, Folder, FolderOpen, Hash, CornerDownRight, CornerDownLeft } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragStartEvent, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { TreeNode, DragPreview, type DropPosition } from './TreeNode';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { VersionHistory } from '../VersionHistory';
import { Toast, type ToastType } from '../Toast';
import type { Book, Volume, Chapter } from '../../types';
import { db, saveChapterVersion, cleanupOldVersions, updateChapterTitle, updateVolumeName } from '../../db';
import { generateId, countWords, computeChapterDisplayTitle, stripAutoNumberPrefix } from '../../utils/helpers';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

interface BookOutlineTreeProps {
  book: Book;
  onChapterSelect: (chapter: Chapter) => void;
  onChapterDeselect?: () => void;
  onBookDeselect?: () => void;
  onVolumeChange?: () => void;
  activeChapterId?: string | null;
  refreshTrigger?: number;
}

interface SortableTreeNodeProps {
  id: string;
  type: 'volume' | 'chapter';
  data: Volume | Chapter;
  level: number;
  isExpanded?: boolean;
  isActive?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  hasChildren?: boolean;
  isLast?: boolean;
  displayTitle?: string;
  dropTarget?: { id: string; type: 'volume' | 'chapter'; position: DropPosition } | null;
  excerpt?: string;
  chapterWordCount?: number;
  volumeDetail?: string;
}

const SortableTreeNode: React.FC<SortableTreeNodeProps> = ({
  id,
  type,
  data,
  level,
  isExpanded,
  isActive,
  onToggle,
  onClick,
  onContextMenu,
  hasChildren,
  isLast,
  displayTitle,
  dropTarget,
  excerpt,
  chapterWordCount,
  volumeDetail,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id,
    data: { type },
  });

  const isDropTarget = dropTarget?.id === id;
  const dropPosition = isDropTarget ? dropTarget.position : null;

  return (
    <TreeNode
      ref={setNodeRef}
      type={type}
      data={data}
      level={level}
      isExpanded={isExpanded}
      isActive={isActive}
      onToggle={onToggle}
      onClick={onClick}
      onContextMenu={onContextMenu}
      hasChildren={hasChildren}
      isLast={isLast}
      displayTitle={displayTitle}
      isDragging={isDragging}
      dragHandleProps={{ ...listeners, ...attributes }}
      dropPosition={dropPosition}
      isDropTarget={isDropTarget}
      excerpt={excerpt}
      chapterWordCount={chapterWordCount}
      volumeDetail={volumeDetail}
    />
  );
};

export const BookOutlineTree = ({ book, onChapterSelect, onChapterDeselect, onBookDeselect, onVolumeChange, activeChapterId, refreshTrigger }: BookOutlineTreeProps) => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [autoNumbering, setAutoNumbering] = useState(book.autoNumbering || false);
  const [numberingFormat, setNumberingFormat] = useState<'arabic' | 'chinese'>(book.numberingFormat || 'arabic');
  const [numberingScope, setNumberingScope] = useState<'global' | 'volume'>(book.numberingScope || 'global');
  
  // 从 localStorage 读取目录树显示设置
  const chapterDetailDisplay = (() => {
    try {
      const saved = localStorage.getItem('chapterDetailDisplay');
      if (saved === 'nameOnly' || saved === 'nameAndExcerpt' || saved === 'nameAndWordCount' || saved === 'full') return saved;
    } catch {}
    return 'nameOnly' as const;
  })();
  const volumeDetailInfo = (() => {
    try {
      const saved = localStorage.getItem('volumeDetailInfo');
      if (saved === 'none' || saved === 'counts' || saved === 'countsAndWords') return saved;
    } catch {}
    return 'none' as const;
  })();
  
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'book' | 'volume' | 'chapter';
    data?: Volume | Chapter;
  } | null>(null);
  const [draggedItem, setDraggedItem] = useState<{
    type: 'volume' | 'chapter';
    id: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    type: 'volume' | 'chapter';
    position: DropPosition;
  } | null>(null);
  const dragMouseYRef = useRef<number | null>(null);
  const currentOverRef = useRef<{ id: string; type: 'volume' | 'chapter'; rect: { top: number; height: number } } | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    type: 'volume' | 'chapter';
    currentName: string;
    target: Volume | Chapter;
  } | null>(null);

  // 移动到模态框状态（章节）
  const [moveChapterModal, setMoveChapterModal] = useState<{
    chapter: Chapter;
    books: Book[];
    allVolumesMap: Record<string, Volume[]>;
    expandedBookIds: Set<string>;
    expandedVolumeIds: Set<string>;
  } | null>(null);

  // 移动到模态框状态（卷）
  const [moveVolumeModal, setMoveVolumeModal] = useState<{
    volume: Volume;
    books: Book[];
    allVolumesMap: Record<string, Volume[]>;
    expandedBookIds: Set<string>;
    expandedVolumeIds: Set<string>;
    selectedParentId: string | null;
    selectedBookId: string | null;
    moveType: 'root' | 'child' | null;
  } | null>(null);

  // 顺序调整模态框（章节/卷共用）
  const [reorderModal, setReorderModal] = useState<{
    type: 'chapter' | 'volume';
    parentLabel: string;
    items: Array<{ id: string; name: string }>;
  } | null>(null);

  const [showAutoNumberPanel, setShowAutoNumberPanel] = useState(false);
  const [autoNumberPanelPos, setAutoNumberPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const autoNumberPanelRef = useRef<HTMLDivElement>(null);
  const autoNumberBtnRef = useRef<HTMLButtonElement>(null);

  // Sticky breadcrumb 状态
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [stickyVolumes, setStickyVolumes] = useState<Array<{ id: string; name: string; level: number }>>([]);

  const openAutoNumberPanel = () => {
    if (autoNumberBtnRef.current) {
      const rect = autoNumberBtnRef.current.getBoundingClientRect();
      setAutoNumberPanelPos({ top: rect.top, left: rect.right + 4 });
    }
    setShowAutoNumberPanel(true);
  };

  // Sticky breadcrumb: 滚动时计算当前可见区域上方的卷节点链
  const updateStickyBreadcrumb = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const containerRect = container.getBoundingClientRect();

    // 找到所有卷节点 DOM 元素（按 DOM 顺序，即树的实际顺序）
    const volumeNodes = container.querySelectorAll('[data-node-type="volume"]');
    const volumeEntries: Array<{ id: string; name: string; level: number; relativeTop: number }> = [];

    volumeNodes.forEach((node) => {
      const el = node as HTMLElement;
      const id = el.dataset.nodeId!;
      const level = parseInt(el.dataset.nodeLevel || '0', 10);
      const vol = volumes.find(v => v.id === id);
      if (vol) {
        const rect = el.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top + scrollTop;
        volumeEntries.push({
          id,
          name: vol.name,
          level,
          relativeTop,
        });
      }
    });

    // 找到所有已滚出视口上方的卷节点
    const scrolledPast = volumeEntries.filter(v => v.relativeTop + 30 < scrollTop);

    if (scrolledPast.length === 0) {
      setStickyVolumes([]);
      return;
    }

    // 取 DOM 顺序中最后一个已滚过的卷节点（即当前视口最接近的卷）
    const lastScrolled = scrolledPast[scrolledPast.length - 1];

    // 从该卷向上构建祖先链，确保父子关系正确
    const chain: Array<{ id: string; name: string; level: number }> = [];
    let current: Volume | undefined = volumes.find(v => v.id === lastScrolled.id);
    while (current) {
      let lvl = 0;
      let ancestor = current;
      while (ancestor.parentId) {
        lvl++;
        const parent = volumes.find(v => v.id === ancestor.parentId);
        if (!parent) break;
        ancestor = parent;
      }
      chain.unshift({ id: current.id, name: current.name, level: lvl });
      current = current?.parentId ? volumes.find(v => v.id === current?.parentId) : undefined;
    }

    setStickyVolumes(chain);
  }, [volumes]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateStickyBreadcrumb, { passive: true });
    return () => container.removeEventListener('scroll', updateStickyBreadcrumb);
  }, [updateStickyBreadcrumb]);

  // 展开/折叠卷时重新计算 breadcrumb
  useEffect(() => {
    updateStickyBreadcrumb();
  }, [expandedVolumes, updateStickyBreadcrumb]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showAutoNumberPanel) {
        const panel = autoNumberPanelRef.current;
        const btn = autoNumberBtnRef.current;
        const target = e.target as Node;
        if (panel && !panel.contains(target) && (!btn || !btn.contains(target))) {
          setShowAutoNumberPanel(false);
        }
      }
    };
    if (showAutoNumberPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAutoNumberPanel]);

  useEffect(() => {
    setAutoNumbering(book.autoNumbering || false);
    setNumberingFormat(book.numberingFormat || 'arabic');
    setNumberingScope(book.numberingScope || 'global');
  }, [book.autoNumbering, book.numberingFormat, book.numberingScope]);

  // 显示Toast
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // 加载卷和章节数据
  const EXPANDED_VOLUMES_KEY = `expanded_volumes_${book.id}`;

  const loadExpandedVolumes = (allVolumes: Volume[]): Set<string> => {
    try {
      const saved = localStorage.getItem(EXPANDED_VOLUMES_KEY);
      if (saved) {
        const savedIds: string[] = JSON.parse(saved);
        const volumeIds = new Set(allVolumes.map(v => v.id));
        return new Set(savedIds.filter(id => volumeIds.has(id)));
      }
    } catch {}
    return new Set(allVolumes.map(v => v.id));
  };

  const saveExpandedVolumes = (expanded: Set<string>) => {
    try {
      localStorage.setItem(EXPANDED_VOLUMES_KEY, JSON.stringify([...expanded]));
    } catch {}
  };

  useEffect(() => {
    console.log('[BookOutlineTree] useEffect 触发，refreshTrigger:', refreshTrigger);
    loadData();
  }, [book.id, book, refreshTrigger]);

  const loadData = async () => {
    try {
      console.log('[BookOutlineTree] 开始加载数据...');
      const allVolumes = await db.volumes
        .where('bookId')
        .equals(book.id)
        .sortBy('order');
      console.log('[BookOutlineTree] 加载了', allVolumes.length, '个卷');

      const allChapters = await db.chapters
        .where('bookId')
        .equals(book.id)
        .toArray();
      console.log('[BookOutlineTree] 加载了', allChapters.length, '个章节');
      
      setVolumes(allVolumes);
      setChapters(allChapters);

      const restored = loadExpandedVolumes(allVolumes);
      setExpandedVolumes(restored);
      console.log('[BookOutlineTree] 数据加载完成');
    } catch (error) {
      console.error('[BookOutlineTree] 加载大纲数据失败:', error);
    }
  };

  const toggleVolume = (volumeId: string) => {
    const newExpanded = new Set(expandedVolumes);
    if (newExpanded.has(volumeId)) {
      newExpanded.delete(volumeId);
    } else {
      newExpanded.add(volumeId);
    }
    setExpandedVolumes(newExpanded);
    saveExpandedVolumes(newExpanded);
  };

  // 获取未归入任何卷的章节（草稿箱）
  const draftChapters = chapters.filter((c) => c.volumeId === null);

  // 获取指定卷的章节
  const getVolumeChapters = (volumeId: string) => {
    return chapters
      .filter((c) => c.volumeId === volumeId)
      .sort((a, b) => a.order - b.order);
  };

  // 获取根卷（没有父卷的卷）
  const getRootVolumes = () => {
    return volumes.filter(v => !v.parentId);
  };

  // 获取子卷
  const getChildVolumes = (parentId: string) => {
    return volumes.filter(v => v.parentId === parentId);
  };

  // 获取章节开头摘要（前50字）
  const getChapterExcerpt = (chapter: Chapter): string => {
    if (!chapter.content) return '';
    // 去除 HTML 标签
    const text = chapter.content
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 80 ? text.slice(0, 80) + '...' : text;
  };

  // 递归计算卷下所有章节数和字数
  const getVolumeStats = (volumeId: string): { childVolumeCount: number; chapterCount: number; totalWordCount: number } => {
    const childVols = getChildVolumes(volumeId);
    const directChapters = getVolumeChapters(volumeId);
    let chapterCount = directChapters.length;
    let totalWordCount = directChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
    for (const child of childVols) {
      const childStats = getVolumeStats(child.id);
      chapterCount += childStats.chapterCount;
      totalWordCount += childStats.totalWordCount;
    }
    return { childVolumeCount: childVols.length, chapterCount, totalWordCount };
  };

  // 构建卷节点详细信息字符串
  const buildVolumeDetail = (volumeId: string): string | undefined => {
    if (volumeDetailInfo === 'none') return undefined;
    const stats = getVolumeStats(volumeId);
    const parts: string[] = [];
    if (stats.childVolumeCount > 0) parts.push(`${stats.childVolumeCount}子卷`);
    parts.push(`${stats.chapterCount}章`);
    if (volumeDetailInfo === 'countsAndWords') parts.push(`${stats.totalWordCount}字`);
    return parts.join(' · ');
  };

  const renderVolumeTree = (volume: Volume, level: number = 0, isLast: boolean = false) => {
    const childVolumes = getChildVolumes(volume.id);
    const volumeChapters = getVolumeChapters(volume.id);
    const hasChildren = childVolumes.length > 0 || volumeChapters.length > 0;

    return (
      <div key={volume.id}>
        <SortableTreeNode
          id={volume.id}
          type="volume"
          data={volume}
          level={level}
          isExpanded={expandedVolumes.has(volume.id)}
          hasChildren={hasChildren}
          isLast={isLast}
          onToggle={() => toggleVolume(volume.id)}
          onContextMenu={(e) => handleContextMenu(e, 'volume', volume)}
          dropTarget={dropTarget}
          volumeDetail={buildVolumeDetail(volume.id)}
        />

        {expandedVolumes.has(volume.id) && (
          <>
            {(() => {
              // 将子卷和章节按 order 混合排序后渲染
              const volumeItems = childVolumes.map(v => ({ type: 'volume' as const, data: v, order: v.order }));
              const chapterItems = volumeChapters.map(c => ({ type: 'chapter' as const, data: c, order: c.order }));
              const mixed = [...volumeItems, ...chapterItems].sort((a, b) => a.order - b.order);
              const lastIndex = mixed.length - 1;
              return mixed.map((item, index) => {
                const isLastItem = index === lastIndex;
                if (item.type === 'volume') {
                  return renderVolumeTree(item.data, level + 1, isLastItem);
                }
                const chapter = item.data;
                return (
                  <SortableTreeNode
                    key={chapter.id}
                    id={chapter.id}
                    type="chapter"
                    data={chapter}
                    level={level + 1}
                    isActive={activeChapterId === chapter.id}
                    isLast={isLastItem}
                    onClick={() => onChapterSelect(chapter)}
                    onContextMenu={(e) => handleContextMenu(e, 'chapter', chapter)}
                    displayTitle={computeChapterDisplayTitle(chapter, chapters, { ...book, autoNumbering, numberingFormat, numberingScope })}
                    dropTarget={dropTarget}
                    excerpt={(chapterDetailDisplay === 'nameAndExcerpt' || chapterDetailDisplay === 'full') ? getChapterExcerpt(chapter) : undefined}
                    chapterWordCount={(chapterDetailDisplay === 'nameAndWordCount' || chapterDetailDisplay === 'full') ? (chapter.wordCount || 0) : undefined}
                  />
                );
              });
            })()}
          </>
        )}
      </div>
    );
  };

  // 处理右键菜单
  const handleContextMenu = (
    e: React.MouseEvent,
    type: 'book' | 'volume' | 'chapter',
    data?: Volume | Chapter
  ) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type, data });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 新建卷
  const handleCreateVolume = async (parentVolumeId?: string) => {
    const name = prompt('请输入卷名:');
    if (!name) return;

    const newVolume: Volume = {
      id: generateId(),
      bookId: book.id,
      parentId: parentVolumeId || null,
      name,
      order: volumes.length,
    };

    try {
      await db.volumes.add(newVolume);
      setExpandedVolumes((prev) => new Set(prev).add(newVolume.id));
      // 如果有父卷，也要展开父卷
      if (parentVolumeId) {
        setExpandedVolumes((prev) => new Set(prev).add(parentVolumeId));
      }
      loadData();
      onVolumeChange?.();
      showToast('卷创建成功', 'success');
    } catch (error) {
      console.error('创建卷失败:', error);
      showToast('创建卷失败，请重试', 'error');
    }
  };

  // 在章节附近新增卷节点（与章节点同级，即在同一父卷下插入）
  const handleCreateVolumeNearChapter = async (chapter: Chapter, position: 'before' | 'after') => {
    const name = prompt('请输入卷名:');
    if (!name) return;

    // 新卷与章节点同级，parentId 就是章节所属的 volumeId
    const parentId = chapter.volumeId || null;

    // 计算新卷的 order：需要考虑同一父卷下已有的卷和章节
    const siblingVolumes = volumes.filter(v => v.parentId === parentId).sort((a, b) => a.order - b.order);
    const siblingChapters = parentId ? getVolumeChapters(parentId) : [];

    // 找到章节在父卷下的位置
    const chapterIndex = siblingChapters.findIndex(c => c.id === chapter.id);
    if (chapterIndex === -1) {
      // 找不到章节，追加到末尾
      const maxOrder = Math.max(
        siblingVolumes.length > 0 ? siblingVolumes[siblingVolumes.length - 1].order : -1,
        siblingChapters.length > 0 ? siblingChapters[siblingChapters.length - 1].order : -1,
      ) + 1;
      const newVolume: Volume = {
        id: generateId(),
        bookId: book.id,
        parentId,
        name,
        order: maxOrder,
      };
      try {
        await db.volumes.add(newVolume);
        if (parentId) setExpandedVolumes((prev) => new Set(prev).add(parentId));
        loadData();
        onVolumeChange?.();
        showToast('卷创建成功', 'success');
      } catch (error) {
        console.error('创建卷失败:', error);
        showToast('创建卷失败，请重试', 'error');
      }
      return;
    }

    // 在章节之前/之后插入卷
    // order 设为章节的 order（before）或章节的 order + 1（after）
    const insertOrder = position === 'before' ? chapter.order : chapter.order + 1;

    // 后续的卷和章节 order +1
    for (const v of siblingVolumes) {
      if (v.order >= insertOrder) {
        await db.volumes.update(v.id, { order: v.order + 1 });
      }
    }
    for (const c of siblingChapters) {
      if (c.order >= insertOrder) {
        await db.chapters.update(c.id, { order: c.order + 1 });
      }
    }

    const newVolume: Volume = {
      id: generateId(),
      bookId: book.id,
      parentId,
      name,
      order: insertOrder,
    };

    try {
      await db.volumes.add(newVolume);
      if (parentId) setExpandedVolumes((prev) => new Set(prev).add(parentId));
      loadData();
      onVolumeChange?.();
      showToast('卷创建成功', 'success');
    } catch (error) {
      console.error('创建卷失败:', error);
      showToast('创建卷失败，请重试', 'error');
    }
  };

  // 新建章节（在指定位置）
  const handleCreateChapter = async (volumeId: string | null = null, position?: 'before' | 'after', referenceChapterId?: string) => {
    const title = prompt('请输入章节标题:');
    if (!title) return;

    const siblings = chapters.filter(c => c.volumeId === volumeId).sort((a, b) => a.order - b.order);
    let insertOrder = siblings.length;

    if (position && referenceChapterId) {
      const refIndex = siblings.findIndex(c => c.id === referenceChapterId);
      if (refIndex !== -1) {
        if (position === 'before') {
          insertOrder = siblings[refIndex].order;
        } else {
          insertOrder = siblings[refIndex].order + 1;
        }
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i].order >= insertOrder && siblings[i].id !== referenceChapterId) {
            await db.chapters.update(siblings[i].id, { order: siblings[i].order + 1 });
          }
        }
      }
    }

    const newChapter: Chapter = {
      id: generateId(),
      volumeId,
      bookId: book.id,
      title,
      content: '',
      wordCount: 0,
      order: insertOrder,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await db.chapters.add(newChapter);
      loadData();
      // 自动选中新创建的章节
      onChapterSelect(newChapter);
      showToast('章节创建成功', 'success');
    } catch (error) {
      console.error('创建章节失败:', error);
      showToast('创建章节失败，请重试', 'error');
    }
  };

  // 右进：将卷变为其前一个同级卷的子卷
  const handleIndentVolume = async (volume: Volume) => {
    const siblings = volumes
      .filter(v => v.parentId === volume.parentId)
      .sort((a, b) => a.order - b.order);
    const currentIndex = siblings.findIndex(v => v.id === volume.id);
    if (currentIndex <= 0) {
      showToast('没有前一个同级卷，无法右进', 'warning');
      return;
    }
    const prevSibling = siblings[currentIndex - 1];
    // 检查不能移动到自身后代
    const isDescendant = (checkId: string, ancestorId: string): boolean => {
      const children = volumes.filter(v => v.parentId === ancestorId);
      for (const child of children) {
        if (child.id === checkId || isDescendant(checkId, child.id)) return true;
      }
      return false;
    };
    if (isDescendant(prevSibling.id, volume.id)) {
      showToast('不能移动到自身后代卷内', 'warning');
      return;
    }
    // 将卷变为前一个同级卷的最后一个子卷
    const prevChildren = volumes.filter(v => v.parentId === prevSibling.id).sort((a, b) => a.order - b.order);
    const newOrder = prevChildren.length > 0 ? prevChildren[prevChildren.length - 1].order + 1 : 0;
    try {
      await db.volumes.update(volume.id, {
        parentId: prevSibling.id,
        order: newOrder,
      });
      // 展开前一个同级卷
      setExpandedVolumes((prev) => new Set(prev).add(prevSibling.id));
      loadData();
      onVolumeChange?.();
      showToast(`卷「${volume.name}」已右进为「${prevSibling.name}」的子卷`, 'success');
    } catch (error) {
      console.error('右进卷失败:', error);
      showToast('右进卷失败，请重试', 'error');
    }
  };

  // 左进：将卷变为其父卷的同级（提升一层），并将原父卷下该卷之后的章节纳入该卷
  const handleOutdentVolume = async (volume: Volume) => {
    if (!volume.parentId) {
      showToast('已经是根卷，无法左进', 'warning');
      return;
    }
    const parentVolume = volumes.find(v => v.id === volume.parentId);
    if (!parentVolume) {
      showToast('找不到父卷', 'error');
      return;
    }

    // 找到原父卷下，该卷之后的所有章节（order > volume.order）
    const parentChapters = getVolumeChapters(parentVolume.id).sort((a, b) => a.order - b.order);
    const subsequentChapters = parentChapters.filter(c => c.order > volume.order);

    // 将卷变为父卷的同级，放在父卷之后
    const parentSiblings = volumes
      .filter(v => v.parentId === parentVolume.parentId)
      .sort((a, b) => a.order - b.order);
    const parentIndex = parentSiblings.findIndex(v => v.id === parentVolume.id);
    const newOrder = parentIndex >= 0 ? parentSiblings[parentIndex].order + 1 : parentSiblings.length;
    // 后续同级卷 order +1
    for (const sibling of parentSiblings) {
      if (sibling.order >= newOrder && sibling.id !== volume.id) {
        await db.volumes.update(sibling.id, { order: sibling.order + 1 });
      }
    }

    try {
      // 更新卷的 parentId 和 order
      await db.volumes.update(volume.id, {
        parentId: parentVolume.parentId,
        order: newOrder,
      });

      // 将后续章节移入该卷
      for (let i = 0; i < subsequentChapters.length; i++) {
        await db.chapters.update(subsequentChapters[i].id, {
          volumeId: volume.id,
          order: i,
        });
      }

      loadData();
      onVolumeChange?.();
      const msg = subsequentChapters.length > 0
        ? `卷「${volume.name}」已左进，${subsequentChapters.length}个章节已纳入`
        : `卷「${volume.name}」已左进`;
      showToast(msg, 'success');
    } catch (error) {
      console.error('左进卷失败:', error);
      showToast('左进卷失败，请重试', 'error');
    }
  };

  // 重新计算并更新书籍总字数
  const recalcBookTotalWords = async () => {
    const allChapters = await db.chapters.where('bookId').equals(book.id).toArray();
    const totalWords = allChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    await db.books.update(book.id, { totalWords, updatedAt: Date.now() });
  };

  // 删除卷（移入回收站）
  const handleDeleteVolume = async (volume: Volume) => {
    if (!confirm(`确定要删除卷"${volume.name}"吗？该卷及其下所有章节将移入回收站。`)) {
      return;
    }

    try {
      const volumeChapters = chapters.filter((c) => c.volumeId === volume.id);
      const parentVol = volume.parentId ? volumes.find(v => v.id === volume.parentId) : null;

      await db.transaction('rw', [db.volumes, db.chapters, db.recycleBin], async () => {
        // 移入回收站
        await db.recycleBin.add({
          id: generateId(),
          itemType: 'volume',
          bookId: book.id,
          bookName: book.name,
          volumeName: parentVol?.name,
          data: volume,
          childChapters: volumeChapters,
          deletedAt: Date.now(),
        });

        // 删除该卷下的所有章节
        await db.chapters.bulkDelete(volumeChapters.map((c) => c.id));

        // 删除卷
        await db.volumes.delete(volume.id);
      });

      await recalcBookTotalWords();
      loadData();
      onVolumeChange?.();
      // 如果当前正在编辑的章节在被删除的卷中，清除编辑器
      if (activeChapterId && volumeChapters.some(c => c.id === activeChapterId)) {
        onChapterDeselect?.();
      }
      showToast('卷已移入回收站', 'success');
    } catch (error) {
      console.error('删除卷失败:', error);
      showToast('删除卷失败，请重试', 'error');
    }
  };

  // 删除章节（移入回收站）
  const handleDeleteChapter = async (chapter: Chapter) => {
    if (!confirm(`确定要删除章节"${chapter.title}"吗？该章节将移入回收站。`)) {
      return;
    }

    try {
      const parentVol = chapter.volumeId ? volumes.find(v => v.id === chapter.volumeId) : null;

      await db.transaction('rw', [db.chapters, db.recycleBin], async () => {
        // 移入回收站
        await db.recycleBin.add({
          id: generateId(),
          itemType: 'chapter',
          bookId: book.id,
          bookName: book.name,
          volumeId: chapter.volumeId,
          volumeName: parentVol?.name,
          data: chapter,
          deletedAt: Date.now(),
        });

        // 删除章节
        await db.chapters.delete(chapter.id);
      });

      await recalcBookTotalWords();
      loadData();
      onVolumeChange?.();
      // 如果删除的是当前正在编辑的章节，清除编辑器
      if (activeChapterId === chapter.id) {
        onChapterDeselect?.();
      }
      showToast('章节已移入回收站', 'success');
    } catch (error) {
      console.error('删除章节失败:', error);
      showToast('删除章节失败，请重试', 'error');
    }
  };

  const handleRename = (type: 'volume' | 'chapter', target: Volume | Chapter) => {
    setRenameModal({
      isOpen: true,
      type,
      currentName: type === 'volume' ? (target as Volume).name : (target as Chapter).title,
      target,
    });
  };

  const handleRenameConfirm = async () => {
    if (!renameModal) return;
    
    const newName = renameModal.currentName.trim();
    if (!newName) {
      showToast('名称不能为空', 'error');
      return;
    }

    try {
      if (renameModal.type === 'volume') {
        await updateVolumeName(renameModal.target.id, newName);
        showToast('卷重命名成功', 'success');
      } else {
        await updateChapterTitle(renameModal.target.id, newName);
        showToast('章节重命名成功', 'success');
      }
      loadData();
      onVolumeChange?.();
      setRenameModal(null);
    } catch (error) {
      console.error('重命名失败:', error);
      showToast('重命名失败，请重试', 'error');
    }
  };

  const handleToggleAutoNumbering = async (enabled: boolean) => {
    try {
      setAutoNumbering(enabled);
      if (enabled) {
        const allBookChapters = await db.chapters.where('bookId').equals(book.id).toArray();
        for (const ch of allBookChapters) {
          const cleanTitle = stripAutoNumberPrefix(ch.title);
          if (cleanTitle !== ch.title) {
            await db.chapters.update(ch.id, { title: cleanTitle });
          }
        }
      }
      await db.books.update(book.id, {
        autoNumbering: enabled,
        updatedAt: Date.now(),
      });
      loadData();
      showToast(enabled ? '已开启自动序号' : '已关闭自动序号', 'success');
    } catch (error) {
      console.error('切换自动序号失败:', error);
      setAutoNumbering(!enabled);
      showToast('操作失败，请重试', 'error');
    }
  };

  const handleUpdateNumberingFormat = async (format: 'arabic' | 'chinese') => {
    try {
      setNumberingFormat(format);
      await db.books.update(book.id, {
        numberingFormat: format,
        updatedAt: Date.now(),
      });
      loadData();
    } catch (error) {
      console.error('更新序号格式失败:', error);
      setNumberingFormat(format === 'arabic' ? 'chinese' : 'arabic');
    }
  };

  const handleUpdateNumberingScope = async (scope: 'global' | 'volume') => {
    try {
      setNumberingScope(scope);
      await db.books.update(book.id, {
        numberingScope: scope,
        updatedAt: Date.now(),
      });
      loadData();
    } catch (error) {
      console.error('更新序号范围失败:', error);
      setNumberingScope(scope === 'global' ? 'volume' : 'global');
    }
  };

  const handleToggleChapterAutoNumberExclude = async (chapter: Chapter) => {
    try {
      const newExcluded = !chapter.autoNumberExcluded;
      let newTitle = chapter.title;
      if (!newExcluded) {
        newTitle = stripAutoNumberPrefix(chapter.title);
      }
      await db.chapters.update(chapter.id, {
        autoNumberExcluded: newExcluded,
        title: newTitle,
      });
      loadData();
      showToast(newExcluded ? '已排除自动序号' : '已恢复自动序号', 'success');
    } catch (error) {
      console.error('切换章节自动序号排除失败:', error);
      showToast('操作失败，请重试', 'error');
    }
  };

  // 加载所有书籍及其卷（用于移动到模态框）
  const loadAllBooksWithVolumes = async () => {
    const allBooks = await db.books.toArray();
    const allVolumes = await db.volumes.toArray();
    const volumesByBook: Record<string, Volume[]> = {};
    for (const v of allVolumes) {
      if (!volumesByBook[v.bookId]) volumesByBook[v.bookId] = [];
      volumesByBook[v.bookId].push(v);
    }
    return { books: allBooks, volumesByBook };
  };

  // 章节「移动到」：打开选择目标面板
  const handleMoveChapter = async (chapter: Chapter) => {
    try {
      const { books, volumesByBook } = await loadAllBooksWithVolumes();
      setMoveChapterModal({
        chapter,
        books,
        allVolumesMap: volumesByBook,
        expandedBookIds: new Set(books.map(b => b.id)),
        expandedVolumeIds: new Set(Object.values(volumesByBook).flat().map(v => v.id)),
      });
    } catch (error) {
      console.error('加载书籍失败:', error);
      showToast('加载数据失败', 'error');
    }
  };

  // 确认章节移动到目标卷
  const handleChapterMoveConfirm = async (targetVolume: Volume) => {
    if (!moveChapterModal) return;
    const chapter = moveChapterModal.chapter;

    try {
      await db.chapters.update(chapter.id, {
        volumeId: targetVolume.id,
        bookId: targetVolume.bookId,
        updatedAt: Date.now(),
      });
      setMoveChapterModal(null);
      loadData();
      onVolumeChange?.();
      showToast(`章节已移动到卷「${targetVolume.name}」`, 'success');
    } catch (error) {
      console.error('移动章节失败:', error);
      showToast('移动章节失败', 'error');
    }
  };

  // 章节移动到草稿箱（不归入任何卷）
  const handleChapterMoveDraft = async () => {
    if (!moveChapterModal) return;
    const chapter = moveChapterModal.chapter;

    try {
      await db.chapters.update(chapter.id, {
        volumeId: null,
        bookId: chapter.bookId,
        updatedAt: Date.now(),
      });
      setMoveChapterModal(null);
      loadData();
      onVolumeChange?.();
      showToast('章节已移动到草稿箱', 'success');
    } catch (error) {
      console.error('移动章节失败:', error);
      showToast('移动章节失败', 'error');
    }
  };

  // 卷「移动分卷到」：打开选择目标面板
  const handleMoveVolume = async (volume: Volume) => {
    try {
      const { books, volumesByBook } = await loadAllBooksWithVolumes();
      setMoveVolumeModal({
        volume,
        books,
        allVolumesMap: volumesByBook,
        expandedBookIds: new Set(books.map(b => b.id)),
        expandedVolumeIds: new Set(Object.values(volumesByBook).flat().map(v => v.id)),
        selectedParentId: null,
        selectedBookId: null,
        moveType: null,
      });
    } catch (error) {
      console.error('加载书籍失败:', error);
      showToast('加载数据失败', 'error');
    }
  };

  // 卷「移动分卷到」第一步：选择目标书籍
  const handleVolumeMoveSelectBook = (bookId: string) => {
    if (!moveVolumeModal) return;
    setMoveVolumeModal({ ...moveVolumeModal, selectedBookId: bookId, selectedParentId: null, moveType: null });
  };

  // 执行卷移动：作为根卷
  const handleVolumeMoveAsRoot = async () => {
    if (!moveVolumeModal || !moveVolumeModal.selectedBookId) return;
    const { volume, selectedBookId } = moveVolumeModal;

    try {
      await db.volumes.update(volume.id, {
        bookId: selectedBookId,
        parentId: null,
      });
      setMoveVolumeModal(null);
      loadData();
      onVolumeChange?.();
      const targetBook = moveVolumeModal.books.find(b => b.id === selectedBookId);
      showToast(`卷已移动到${targetBook ? targetBook.name : '目标书籍'}的根目录`, 'success');
    } catch (error) {
      console.error('移动卷失败:', error);
      showToast('移动卷失败', 'error');
    }
  };

  // 执行卷移动：作为子卷
  const handleVolumeMoveAsChild = async () => {
    if (!moveVolumeModal || !moveVolumeModal.selectedParentId) return;
    const { volume, selectedParentId } = moveVolumeModal;

    // 查找目标父卷的 bookId
    const allVols = Object.values(moveVolumeModal.allVolumesMap).flat();
    const parentVolume = allVols.find(v => v.id === selectedParentId);
    if (!parentVolume) return;

    try {
      await db.volumes.update(volume.id, {
        parentId: selectedParentId,
        bookId: parentVolume.bookId,
      });
      setMoveVolumeModal(null);
      loadData();
      onVolumeChange?.();
      showToast(`卷已移动到「${parentVolume.name}」下`, 'success');
    } catch (error) {
      console.error('移动卷失败:', error);
      showToast('移动卷失败', 'error');
    }
  };

  // 打开章节顺序调整
  const handleReorderChapter = async (chapter: Chapter) => {
    const siblings = chapters
      .filter(c => c.volumeId === chapter.volumeId && c.bookId === chapter.bookId)
      .sort((a, b) => a.order - b.order)
      .map(c => ({ id: c.id, name: c.title }));
    const parentName = chapter.volumeId
      ? volumes.find(v => v.id === chapter.volumeId)?.name || '当前卷'
      : '草稿箱';
    setReorderModal({ type: 'chapter', parentLabel: parentName, items: siblings });
  };

  // 打开卷顺序调整
  const handleReorderVolume = async (volume: Volume) => {
    const siblings = volumes
      .filter(v => v.parentId === volume.parentId && v.bookId === volume.bookId)
      .sort((a, b) => a.order - b.order)
      .map(v => ({ id: v.id, name: v.name }));
    const parentName = volume.parentId
      ? volumes.find(v => v.id === volume.parentId)?.name || '当前父卷'
      : '根目录';
    setReorderModal({ type: 'volume', parentLabel: parentName, items: siblings });
  };

  // 顺序调整：上移一项
  const handleReorderUp = (index: number) => {
    if (!reorderModal || index === 0) return;
    const items = [...reorderModal.items];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setReorderModal({ ...reorderModal, items });
  };

  // 顺序调整：下移一项
  const handleReorderDown = (index: number) => {
    if (!reorderModal || index >= reorderModal.items.length - 1) return;
    const items = [...reorderModal.items];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setReorderModal({ ...reorderModal, items });
  };

  // 确认顺序调整
  const handleReorderSave = async () => {
    if (!reorderModal) return;
    try {
      if (reorderModal.type === 'chapter') {
        for (let i = 0; i < reorderModal.items.length; i++) {
          await db.chapters.update(reorderModal.items[i].id, {
            order: i,
            updatedAt: Date.now(),
          });
        }
      } else {
        // 卷：更新 order 字段
        for (let i = 0; i < reorderModal.items.length; i++) {
          await db.volumes.update(reorderModal.items[i].id, { order: i });
        }
      }
      setReorderModal(null);
      loadData();
      onVolumeChange?.();
      showToast('顺序已更新', 'success');
    } catch (error) {
      console.error('调整顺序失败:', error);
      showToast('调整顺序失败', 'error');
    }
  };

  // 导出章节
  const handleExportChapter = async (chapter: Chapter) => {
    try {
      const filePath = await save({
        defaultPath: `${chapter.title}.txt`,
        filters: [{
          name: '文本文件',
          extensions: ['txt']
        }, {
          name: 'Markdown',
          extensions: ['md']
        }]
      });
      
      if (!filePath) return;
      
      await writeTextFile(filePath, chapter.content);
      showToast(`章节已导出到: ${filePath}`, 'success');
    } catch (error) {
      console.error('导出章节失败:', error);
      showToast('导出失败，请重试', 'error');
    }
  };

  // 查看历史版本
  const handleViewHistory = (chapter: Chapter) => {
    setShowVersionHistory(chapter.id);
  };

  // 恢复版本后的回调
  const handleVersionRestored = (content: string, wordCount: number) => {
    // 通知父组件更新编辑器内容
    console.log('版本已恢复，需要更新编辑器');
    // TODO: 通过回调通知 App.tsx 更新编辑器
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const getDescendantVolumeIds = (volumeId: string, allVolumes: Volume[]): Set<string> => {
    const result = new Set<string>([volumeId]);
    const children = allVolumes.filter(v => v.parentId === volumeId);
    for (const child of children) {
      const childDescendants = getDescendantVolumeIds(child.id, allVolumes);
      childDescendants.forEach(id => result.add(id));
    }
    return result;
  };

  const computeDropPosition = (overRect: { top: number; height: number }, clientY: number): DropPosition => {
    const midY = overRect.top + overRect.height / 2;
    const threshold = overRect.height * 0.25;
    if (clientY < midY - threshold) return 'before';
    if (clientY > midY + threshold) return 'after';
    return 'inside';
  };

  const handleDndDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data) {
      setDraggedItem({ type: data.type, id: active.id as string });
    }
  };

  const handleDndDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !draggedItem) {
      currentOverRef.current = null;
      setDropTarget(null);
      return;
    }

    const overData = over.data.current;
    if (!overData) {
      currentOverRef.current = null;
      setDropTarget(null);
      return;
    }

    if (draggedItem.type === 'volume' && overData.type === 'chapter') {
      currentOverRef.current = null;
      setDropTarget(null);
      return;
    }

    if (draggedItem.id === over.id as string) {
      currentOverRef.current = null;
      setDropTarget(null);
      return;
    }

    if (draggedItem.type === 'volume' && overData.type === 'volume') {
      const descendants = getDescendantVolumeIds(draggedItem.id, volumes);
      if (descendants.has(over.id as string)) {
        currentOverRef.current = null;
        setDropTarget(null);
        return;
      }
    }

    currentOverRef.current = {
      id: over.id as string,
      type: overData.type,
      rect: { top: over.rect.top, height: over.rect.height },
    };

    const clientY = dragMouseYRef.current ?? over.rect.top + over.rect.height / 2;
    const position = computeDropPosition(over.rect, clientY);

    setDropTarget({
      id: over.id as string,
      type: overData.type,
      position,
    });
  };

  const handleDndDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !draggedItem) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    const overData = over.data.current;
    if (!overData) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    if (draggedItem.id === over.id as string) {
      setDraggedItem(null);
      setDropTarget(null);
      return;
    }

    try {
      if (draggedItem.type === 'chapter') {
        const chapter = chapters.find(c => c.id === draggedItem.id);
        if (!chapter) return;

        if (overData.type === 'volume') {
          const targetVolume = volumes.find(v => v.id === over.id as string);
          if (!targetVolume) return;

          if (dropTarget?.position === 'inside') {
            const targetSiblings = chapters.filter(c => c.volumeId === targetVolume.id).sort((a, b) => a.order - b.order);
            const newOrder = targetSiblings.length > 0 ? targetSiblings[targetSiblings.length - 1].order + 1 : 0;
            await db.chapters.update(chapter.id, {
              volumeId: targetVolume.id,
              order: newOrder,
              updatedAt: Date.now(),
            });
          } else {
            const position = dropTarget?.position || 'after';
            const targetSiblings = chapters.filter(c => c.volumeId === targetVolume.id).sort((a, b) => a.order - b.order);
            const targetIndex = targetSiblings.findIndex(c => c.id === over.id as string);
            let newOrder: number;
            if (targetIndex === -1) {
              newOrder = targetSiblings.length;
            } else {
              newOrder = position === 'before' ? targetSiblings[targetIndex].order : targetSiblings[targetIndex].order + 1;
              for (let i = 0; i < targetSiblings.length; i++) {
                if (targetSiblings[i].order >= newOrder && targetSiblings[i].id !== chapter.id) {
                  await db.chapters.update(targetSiblings[i].id, { order: targetSiblings[i].order + 1 });
                }
              }
            }
            await db.chapters.update(chapter.id, {
              volumeId: targetVolume.id,
              order: newOrder,
              updatedAt: Date.now(),
            });
          }
          showToast(`章节已移动到卷「${targetVolume.name}」`, 'success');
        } else if (overData.type === 'chapter') {
          const targetChapter = chapters.find(c => c.id === over.id as string);
          if (!targetChapter) return;

          const targetVolumeId = targetChapter.volumeId;
          const position = dropTarget?.position || 'after';
          const targetSiblings = chapters.filter(c => c.volumeId === targetVolumeId).sort((a, b) => a.order - b.order);
          const targetIndex = targetSiblings.findIndex(c => c.id === over.id as string);
          let newOrder: number;
          if (targetIndex === -1) {
            newOrder = targetSiblings.length;
          } else {
            newOrder = position === 'before' ? targetSiblings[targetIndex].order : targetSiblings[targetIndex].order + 1;
            for (let i = 0; i < targetSiblings.length; i++) {
              if (targetSiblings[i].order >= newOrder && targetSiblings[i].id !== chapter.id) {
                await db.chapters.update(targetSiblings[i].id, { order: targetSiblings[i].order + 1 });
              }
            }
          }
          await db.chapters.update(chapter.id, {
            volumeId: targetVolumeId,
            order: newOrder,
            updatedAt: Date.now(),
          });
          showToast('章节位置已更新', 'success');
        }
      } else if (draggedItem.type === 'volume') {
        const volume = volumes.find(v => v.id === draggedItem.id);
        if (!volume) return;

        if (overData.type === 'chapter') {
          showToast('卷不能放到章节内', 'error');
        } else if (overData.type === 'volume') {
          const targetVolume = volumes.find(v => v.id === over.id as string);
          if (!targetVolume) return;

          const descendants = getDescendantVolumeIds(volume.id, volumes);
          if (descendants.has(targetVolume.id)) {
            showToast('不能将卷移动到自身或其后代卷内', 'error');
          } else {
            const position = dropTarget?.position || 'after';

            if (position === 'inside') {
              const targetChildren = volumes.filter(v => v.parentId === targetVolume.id).sort((a, b) => a.order - b.order);
              const newOrder = targetChildren.length > 0 ? targetChildren[targetChildren.length - 1].order + 1 : 0;
              await db.volumes.update(volume.id, {
                parentId: targetVolume.id,
                order: newOrder,
              });
              showToast(`卷已移动到「${targetVolume.name}」下`, 'success');
            } else {
              const newParentId = targetVolume.parentId;
              const siblings = volumes.filter(v => v.parentId === newParentId).sort((a, b) => a.order - b.order);
              const targetIndex = siblings.findIndex(v => v.id === over.id as string);
              let newOrder: number;
              if (targetIndex === -1) {
                newOrder = siblings.length;
              } else {
                newOrder = position === 'before' ? siblings[targetIndex].order : siblings[targetIndex].order + 1;
                for (let i = 0; i < siblings.length; i++) {
                  if (siblings[i].order >= newOrder && siblings[i].id !== volume.id) {
                    await db.volumes.update(siblings[i].id, { order: siblings[i].order + 1 });
                  }
                }
              }
              await db.volumes.update(volume.id, {
                parentId: newParentId,
                order: newOrder,
              });
              showToast('卷位置已更新', 'success');
            }
          }
        }
      }

      loadData();
      onVolumeChange?.();
    } catch (error) {
      console.error('拖拽操作失败:', error);
      showToast('移动失败，请重试', 'error');
    } finally {
      setDraggedItem(null);
      setDropTarget(null);
      dragMouseYRef.current = null;
      currentOverRef.current = null;
    }
  };

  const handleDndDragCancel = () => {
    setDraggedItem(null);
    setDropTarget(null);
    dragMouseYRef.current = null;
    currentOverRef.current = null;
  };

  useEffect(() => {
    if (!draggedItem) return;
    const handleMouseMove = (e: MouseEvent) => {
      dragMouseYRef.current = e.clientY;
      const over = currentOverRef.current;
      if (over) {
        const position = computeDropPosition(over.rect, e.clientY);
        setDropTarget(prev => {
          if (prev && prev.id === over.id && prev.position === position) return prev;
          return { id: over.id, type: over.type, position };
        });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [draggedItem]);

  // 递归渲染卷树节点（用于移动到模态框）
  const renderVolumeTreeNodes = (
    rootVolumes: Volume[],
    allVolumes: Volume[],
    expandedIds: Set<string>,
    level: number,
    onToggle: (volumeId: string) => void,
    onClick?: (volume: Volume) => void,
    renderAction?: (volume: Volume) => React.ReactNode
  ): React.ReactNode => {
    return rootVolumes.map(volume => {
      const childVolumes = allVolumes.filter(v => v.parentId === volume.id);
      const hasChildren = childVolumes.length > 0;
      const isExpanded = expandedIds.has(volume.id);
      const paddingLeft = level * 16 + 4;

      return (
        <div key={volume.id}>
          <div
            className="flex items-center py-1.5 px-2 cursor-pointer hover:bg-vscode-active/10 transition-colors rounded group"
            style={{ paddingLeft }}
            onClick={(e) => {
              if (onClick) {
                e.stopPropagation();
                onClick(volume);
              }
            }}
          >
            {/* 展开/折叠 */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(volume.id);
                }}
                className="mr-1 p-0.5 icon-btn"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5 mr-1" />
            )}

            {level === 0 ? (
              <FolderOpen size={16} className="mr-2 text-yellow-500 flex-shrink-0" />
            ) : (
              <Folder size={16} className="mr-2 text-yellow-600 flex-shrink-0" />
            )}

            <span className="text-sm text-vscode-text truncate flex-1 min-w-0">{volume.name}</span>

            {/* 自定义操作按钮（由调用方提供） */}
            {renderAction && (
              <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                {renderAction(volume)}
              </span>
            )}
          </div>

          {isExpanded && hasChildren && (
            <div className="ml-0">
              {renderVolumeTreeNodes(childVolumes, allVolumes, expandedIds, level + 1, onToggle, onClick, renderAction)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar">
      {/* Toast通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 标题栏 - 书名与左边界隔开，字数与右边界隔开 */}
      <div className="p-3 border-b border-vscode-border flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <button
            onClick={onBookDeselect}
            className="icon-btn flex-shrink-0"
            title="返回书籍列表"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-vscode-text truncate" title={book.name}>
            {book.name}
          </h2>
        </div>
        <div className="flex space-x-1">
          <button
            onClick={() => handleCreateVolume()}
            className="icon-btn"
            title="新建卷"
          >
            <FolderPlus size={16} />
          </button>
          <button
            onClick={() => handleCreateChapter(null)}
            className="icon-btn"
            title="新建章节（草稿箱）"
          >
            <FilePlus size={16} />
          </button>
          <div>
            <button
              ref={autoNumberBtnRef}
              onClick={() => showAutoNumberPanel ? setShowAutoNumberPanel(false) : openAutoNumberPanel()}
              className={`icon-btn transition-all duration-200 ${
                autoNumbering 
                  ? 'text-blue-400 bg-blue-500/20 dark:bg-blue-500/30 ring-1 ring-blue-400/50 dark:ring-blue-400/60 shadow-sm' 
                  : 'text-vscode-text hover:bg-vscode-hover'
              }`}
              title="自动序号设置"
            >
              <Hash size={16} />
            </button>
          </div>
        </div>
      </div>

      {showAutoNumberPanel && (
        <div
          ref={autoNumberPanelRef}
          className="fixed bg-vscode-sidebar border border-vscode-border shadow-lg z-[9999] p-3 space-y-3"
          style={{ borderRadius: '2px', top: autoNumberPanelPos.top, left: autoNumberPanelPos.left, width: 240 }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-vscode-text whitespace-nowrap">启用自动序号</span>
            <button
              onClick={() => handleToggleAutoNumbering(!autoNumbering)}
              className="w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0"
              style={{
                backgroundColor: autoNumbering ? 'var(--color-vscode-active, #2563eb)' : 'var(--color-vscode-border, #374151)',
                border: '3px solid',
                borderColor: autoNumbering ? 'var(--color-vscode-active, #60a5fa)' : 'var(--color-vscode-border, #9ca3af)',
                boxShadow: autoNumbering ? 'inset 0 2px 4px rgba(0,0,0,0.3), 0 0 0 2px var(--color-vscode-active-light, rgba(96,165,250,0.4))' : '0 0 0 2px var(--color-vscode-border, rgba(156,163,175,0.5))',
                outline: 'none'
              }}
            >
              <span
                className="absolute w-4 h-4 rounded-full shadow-lg transition-transform duration-200"
                style={{
                  top: '2px',
                  left: '2px',
                  transform: autoNumbering ? 'translateX(20px)' : 'translateX(0)',
                  backgroundColor: autoNumbering ? 'var(--color-vscode-bg, #ffffff)' : 'var(--color-vscode-border, #d1d5db)',
                }}
              />
            </button>
          </div>
          {autoNumbering && (
            <>
              <div className="space-y-1.5">
                <span className="text-xs text-vscode-text opacity-70">序号格式</span>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="numberingFormat"
                      checked={numberingFormat === 'arabic'}
                      onChange={() => handleUpdateNumberingFormat('arabic')}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-vscode-text">阿拉伯数字（第1章）</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="numberingFormat"
                      checked={numberingFormat === 'chinese'}
                      onChange={() => handleUpdateNumberingFormat('chinese')}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-vscode-text">汉字数字（第一章）</span>
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs text-vscode-text opacity-70">序号范围</span>
                <div className="space-y-1">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="numberingScope"
                      checked={numberingScope === 'global'}
                      onChange={() => handleUpdateNumberingScope('global')}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-vscode-text">全局递增</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="numberingScope"
                      checked={numberingScope === 'volume'}
                      onChange={() => handleUpdateNumberingScope('volume')}
                      className="accent-blue-500"
                    />
                    <span className="text-xs text-vscode-text">按卷递增</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 树形列表 - 左右添加 padding */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDndDragStart}
        onDragOver={handleDndDragOver}
        onDragEnd={handleDndDragEnd}
        onDragCancel={handleDndDragCancel}
      >
        <SortableContext
          items={[...volumes.map(v => v.id), ...chapters.map(c => c.id)]}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex-1 relative overflow-hidden">
            {/* Sticky Breadcrumb */}
            {stickyVolumes.length > 0 && (
              <div className="absolute top-0 left-0 right-0 z-30 bg-vscode-sidebar/95 backdrop-blur-sm border-b border-vscode-border px-2 py-1 flex items-center">
                {stickyVolumes.map((vol, idx) => (
                  <React.Fragment key={vol.id}>
                    {idx > 0 && <ChevronRight size={12} className="mx-1 text-vscode-text opacity-30 flex-shrink-0" />}
                    <div className="flex items-center min-w-0">
                      <Folder size={13} className="mr-1 text-yellow-500 flex-shrink-0" />
                      <span className="text-xs text-vscode-text truncate">{vol.name}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div ref={scrollContainerRef} className="h-full overflow-auto py-2 px-2">
              {draftChapters.length > 0 && (
              <div className="mb-2">
                <div
                  className="px-3 py-1.5 text-xs font-semibold text-vscode-text opacity-60 uppercase tracking-wider"
                  onContextMenu={(e) => handleContextMenu(e, 'book')}
                >
                  草稿箱
                </div>
                {draftChapters.map((chapter) => (
                  <SortableTreeNode
                    key={chapter.id}
                    id={chapter.id}
                    type="chapter"
                    data={chapter}
                    level={1}
                    isActive={activeChapterId === chapter.id}
                    onClick={() => onChapterSelect(chapter)}
                    onContextMenu={(e) => handleContextMenu(e, 'chapter', chapter)}
                    displayTitle={computeChapterDisplayTitle(chapter, chapters, { ...book, autoNumbering, numberingFormat, numberingScope })}
                    dropTarget={dropTarget}
                    excerpt={(chapterDetailDisplay === 'nameAndExcerpt' || chapterDetailDisplay === 'full') ? getChapterExcerpt(chapter) : undefined}
                    chapterWordCount={(chapterDetailDisplay === 'nameAndWordCount' || chapterDetailDisplay === 'full') ? (chapter.wordCount || 0) : undefined}
                  />
                ))}
              </div>
            )}

            {getRootVolumes().map((volume, index, array) => 
              renderVolumeTree(volume, 0, index === array.length - 1)
            )}

            {volumes.length === 0 && draftChapters.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-vscode-text opacity-60 px-4 text-center">
                <p className="text-sm mb-2">暂无章节</p>
                <p className="text-xs">点击顶部按钮新建卷或章节</p>
              </div>
            )}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {draggedItem ? (
            <DragPreview
              type={draggedItem.type}
              data={
                draggedItem.type === 'volume'
                  ? volumes.find(v => v.id === draggedItem.id)!
                  : chapters.find(c => c.id === draggedItem.id)!
              }
              displayTitle={
                draggedItem.type === 'volume'
                  ? volumes.find(v => v.id === draggedItem.id)?.name
                  : (() => {
                      const ch = chapters.find(c => c.id === draggedItem.id);
                      return ch ? computeChapterDisplayTitle(ch, chapters, { ...book, autoNumbering, numberingFormat, numberingScope }) : undefined;
                    })()
              }
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={(() => {
            const items: MenuItem[] = [];

            if (contextMenu.type === 'book') {
              items.push(
                {
                  label: '新建卷',
                  icon: <FolderPlus size={16} />,
                  onClick: handleCreateVolume,
                },
                {
                  label: '新建章节',
                  icon: <FilePlus size={16} />,
                  onClick: () => handleCreateChapter(null),
                }
              );
            } else if (contextMenu.type === 'volume' && contextMenu.data) {
              const volume = contextMenu.data as Volume;
              items.push(
                {
                  label: '新建子卷',
                  icon: <FolderPlus size={16} />,
                  onClick: () => handleCreateVolume(volume.id),
                },
                {
                  label: '新建章节',
                  icon: <FilePlus size={16} />,
                  onClick: () => handleCreateChapter(volume.id),
                },
                {
                  label: '重命名',
                  icon: <Edit size={16} />,
                  onClick: () => handleRename('volume', volume),
                },
                {
                  label: '移动卷节点顺序',
                  icon: <Move size={16} />,
                  onClick: () => handleReorderVolume(volume),
                },
                {
                  label: '移动分卷到...',
                  icon: <ArrowRight size={16} />,
                  onClick: () => handleMoveVolume(volume),
                },
                {
                  label: '右进（变为前一个同级卷的子卷）',
                  icon: <CornerDownRight size={16} />,
                  onClick: () => handleIndentVolume(volume),
                },
                {
                  label: '左进（提升为父卷的同级）',
                  icon: <CornerDownLeft size={16} />,
                  onClick: () => handleOutdentVolume(volume),
                },
                {
                  label: '删除卷',
                  icon: <Trash2 size={16} />,
                  onClick: () => handleDeleteVolume(volume),
                  danger: true,
                }
              );
            } else if (contextMenu.type === 'chapter' && contextMenu.data) {
              const chapter = contextMenu.data as Chapter;
              items.push(
                {
                  label: '在上方新建章节',
                  icon: <ArrowUp size={16} />,
                  onClick: () => handleCreateChapter(chapter.volumeId, 'before', chapter.id),
                },
                {
                  label: '在下方新建章节',
                  icon: <ArrowDown size={16} />,
                  onClick: () => handleCreateChapter(chapter.volumeId, 'after', chapter.id),
                },
                {
                  label: '在此之上插入卷',
                  icon: <FolderPlus size={16} />,
                  onClick: () => handleCreateVolumeNearChapter(chapter, 'before'),
                },
                {
                  label: '在此之下插入卷',
                  icon: <FolderPlus size={16} />,
                  onClick: () => handleCreateVolumeNearChapter(chapter, 'after'),
                },
                {
                  label: '重命名',
                  icon: <Edit size={16} />,
                  onClick: () => handleRename('chapter', chapter),
                },
                {
                  label: '移动到...',
                  icon: <ArrowRight size={16} />,
                  onClick: () => handleMoveChapter(chapter),
                },
                {
                  label: '移动章节顺序',
                  icon: <Move size={16} />,
                  onClick: () => handleReorderChapter(chapter),
                },
              );
              if (autoNumbering) {
                items.push({
                  label: chapter.autoNumberExcluded ? '恢复自动序号' : '排除自动序号',
                  icon: chapter.autoNumberExcluded ? <Hash size={16} /> : <X size={16} />,
                  onClick: () => handleToggleChapterAutoNumberExclude(chapter),
                });
              }
              items.push(
                {
                  label: '导出单章',
                  icon: <Download size={16} />,
                  onClick: () => handleExportChapter(chapter),
                },
                {
                  label: '查看历史版本',
                  icon: <Clock size={16} />,
                  onClick: () => handleViewHistory(chapter),
                },
                {
                  label: '删除章节',
                  icon: <Trash2 size={16} />,
                  onClick: () => handleDeleteChapter(chapter),
                  danger: true,
                }
              );
            }

            return items;
          })()}
          onClose={closeContextMenu}
        />
      )}

      {/* 历史版本面板 */}
      {showVersionHistory && (
        <VersionHistory
          chapterId={showVersionHistory}
          onClose={() => setShowVersionHistory(null)}
          onRestore={handleVersionRestored}
        />
      )}

      {/* 重命名模态框 */}
      {renameModal && renameModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            className="bg-vscode-sidebar border border-vscode-border w-[400px] flex flex-col"
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-vscode-border">
              <h2 className="text-lg font-semibold text-vscode-text flex items-center">
                <Edit size={18} className="mr-2" />
                重命名{renameModal.type === 'volume' ? '卷' : '章节'}
              </h2>
              <button onClick={() => setRenameModal(null)} className="icon-btn">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4">
              <label className="block text-sm text-vscode-text mb-2">
                新名称
              </label>
              <input
                type="text"
                value={renameModal.currentName}
                onChange={(e) => setRenameModal({ ...renameModal, currentName: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameConfirm()}
                className="w-full px-3 py-2 bg-vscode-input border border-vscode-border text-vscode-text text-sm focus:outline-none focus:border-vscode-active"
                autoFocus
              />
            </div>
            
            <div className="flex justify-end space-x-2 p-4 border-t border-vscode-border">
              <button
                onClick={() => setRenameModal(null)}
                className="px-4 py-2 text-sm text-vscode-text hover:bg-vscode-active/20 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRenameConfirm}
                className="px-4 py-2 text-sm text-white transition-colors"
                style={{ backgroundColor: 'var(--color-vscode-active, #007acc)' }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 章节：移动到... 模态框 */}
      {moveChapterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            className="bg-vscode-sidebar border border-vscode-border w-[480px] max-h-[70vh] flex flex-col"
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-vscode-border">
              <h2 className="text-lg font-semibold text-vscode-text flex items-center">
                <Move size={18} className="mr-2" />
                选择目标位置
              </h2>
              <button onClick={() => setMoveChapterModal(null)} className="icon-btn">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-2 max-h-[55vh]">
              {/* 草稿箱选项 */}
              <div
                className="flex items-center py-2 px-3 cursor-pointer hover:bg-vscode-active/10 transition-colors border border-transparent hover:border-vscode-border rounded"
                onClick={() => {
                  if (confirm(`确定将章节移动到草稿箱吗？`)) {
                    handleChapterMoveDraft();
                  }
                }}
              >
                <FileText size={16} className="mr-2 text-vscode-text opacity-40 flex-shrink-0" />
                <span className="text-sm text-vscode-text">草稿箱（不归入任何卷）</span>
              </div>

              {/* 书籍 → 卷 树形结构 */}
              {moveChapterModal.books.map(book => (
                <div key={book.id} className="mt-1">
                  <div
                    className="flex items-center py-2 px-3 cursor-pointer hover:bg-vscode-active/10 transition-colors rounded"
                    onClick={() => {
                      const next = new Set(moveChapterModal.expandedBookIds);
                      if (next.has(book.id)) next.delete(book.id); else next.add(book.id);
                      setMoveChapterModal({ ...moveChapterModal, expandedBookIds: next });
                    }}
                  >
                    {moveChapterModal.expandedBookIds.has(book.id) ? (
                      <ChevronDown size={14} className="mr-1 text-vscode-text opacity-40" />
                    ) : (
                      <ChevronRight size={14} className="mr-1 text-vscode-text opacity-40" />
                    )}
                    <BookOpen size={16} className="mr-2 text-blue-400 flex-shrink-0" />
                    <span className="text-sm text-vscode-text font-medium">{book.name}</span>
                  </div>

                  {moveChapterModal.expandedBookIds.has(book.id) && (
                    <div className="ml-4 border-l border-gray-600/50 pl-2">
                      {renderVolumeTreeNodes(
                        moveChapterModal.allVolumesMap[book.id]?.filter(v => !v.parentId) || [],
                        moveChapterModal.allVolumesMap[book.id] || [],
                        moveChapterModal.expandedVolumeIds,
                        0,
                        (volumeId: string) => {
                          const next = new Set(moveChapterModal.expandedVolumeIds);
                          if (next.has(volumeId)) next.delete(volumeId); else next.add(volumeId);
                          setMoveChapterModal({ ...moveChapterModal, expandedVolumeIds: next });
                        },
                        (volume: Volume) => {
                          if (confirm(`确定将章节移动到卷「${volume.name}」吗？`)) {
                            handleChapterMoveConfirm(volume);
                          }
                        }
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 卷：移动分卷到... 模态框 */}
      {moveVolumeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            className="bg-vscode-sidebar border border-vscode-border w-[520px] max-h-[75vh] flex flex-col"
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-vscode-border">
              <h2 className="text-lg font-semibold text-vscode-text flex items-center">
                <Move size={18} className="mr-2" />
                移动分卷
              </h2>
              <button onClick={() => setMoveVolumeModal(null)} className="icon-btn">
                <X size={20} />
              </button>
            </div>

            {/* 操作指南 */}
            <div className="px-4 py-2 border-b border-vscode-border text-xs text-vscode-text opacity-60">
              选择目标位置：点击书籍名称展开查看卷结构
            </div>

            <div className="flex-1 overflow-auto p-2 max-h-[55vh]">
              {moveVolumeModal.books.map(book => (
                <div key={book.id} className="mt-1">
                  <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-vscode-active/10 transition-colors">
                    <div
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => {
                        const next = new Set(moveVolumeModal.expandedBookIds);
                        if (next.has(book.id)) next.delete(book.id); else next.add(book.id);
                        setMoveVolumeModal({ ...moveVolumeModal, expandedBookIds: next });
                      }}
                    >
                      {moveVolumeModal.expandedBookIds.has(book.id) ? (
                        <ChevronDown size={14} className="mr-1 text-vscode-text opacity-40" />
                      ) : (
                        <ChevronRight size={14} className="mr-1 text-vscode-text opacity-40" />
                      )}
                      <BookOpen size={16} className="mr-2 text-blue-400 flex-shrink-0" />
                      <span className="text-sm text-vscode-text font-medium">{book.name}</span>
                    </div>
                    <button
                      className="text-xs px-2 py-1 text-vscode-text hover:bg-vscode-active/20 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVolumeMoveSelectBook(book.id);
                        setMoveVolumeModal(prev => prev ? { ...prev, moveType: 'root' } : null);
                        setTimeout(() => {
                          setMoveVolumeModal(prev => {
                            if (prev && prev.moveType === 'root' && prev.selectedBookId === book.id) {
                              if (confirm(`确定将卷「${prev.volume.name}」移动到「${book.name}」的根目录吗？`)) {
                                handleVolumeMoveAsRoot();
                              }
                            }
                            return prev;
                          });
                        }, 50);
                      }}
                    >
                      作为根卷
                    </button>
                  </div>

                  {moveVolumeModal.expandedBookIds.has(book.id) && (
                    <div className="ml-4 border-l border-gray-600/50 pl-2">
                      {(() => {
                        // 过滤掉被移动的卷及其所有后代，防止移动到自身
                        const excludeIds = getDescendantVolumeIds(
                          moveVolumeModal.volume.id,
                          moveVolumeModal.allVolumesMap[book.id] || []
                        );
                        const filteredAllVolumes = (moveVolumeModal.allVolumesMap[book.id] || [])
                          .filter(v => !excludeIds.has(v.id));
                        const filteredRootVolumes = filteredAllVolumes.filter(v => !v.parentId);
                        return renderVolumeTreeNodes(
                          filteredRootVolumes,
                          filteredAllVolumes,
                          moveVolumeModal.expandedVolumeIds,
                          0,
                          (volumeId: string) => {
                            const next = new Set(moveVolumeModal.expandedVolumeIds);
                            if (next.has(volumeId)) next.delete(volumeId); else next.add(volumeId);
                            setMoveVolumeModal({ ...moveVolumeModal, expandedVolumeIds: next });
                          },
                          (volume: Volume) => {
                            handleVolumeMoveSelectBook(volume.bookId);
                            setMoveVolumeModal(prev => prev ? { ...prev, selectedParentId: volume.id, moveType: 'child' } : null);
                            setTimeout(() => {
                              setMoveVolumeModal(prev => {
                                if (prev && prev.moveType === 'child' && prev.selectedParentId === volume.id) {
                                  if (confirm(`确定将卷「${prev.volume.name}」移动到「${volume.name}」下作为子卷吗？`)) {
                                    handleVolumeMoveAsChild();
                                  }
                                }
                                return prev;
                              });
                            }, 50);
                          }
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 顺序调整模态框 */}
      {reorderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            className="bg-vscode-sidebar border border-vscode-border w-[480px] max-h-[70vh] flex flex-col"
            style={{ borderRadius: '2px' }}
          >
            <div className="flex items-center justify-between p-4 border-b border-vscode-border">
              <h2 className="text-lg font-semibold text-vscode-text flex items-center">
                <Move size={18} className="mr-2" />
                {reorderModal.type === 'chapter' ? '调整章节顺序' : '调整卷顺序'}
              </h2>
              <button onClick={() => setReorderModal(null)} className="icon-btn">
                <X size={20} />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-vscode-border text-xs text-vscode-text opacity-60">
              当前: {reorderModal.parentLabel}（共 {reorderModal.items.length} 项）
            </div>

            <div className="flex-1 overflow-auto p-2 max-h-[55vh]">
              {reorderModal.items.length === 0 ? (
                <div className="text-center py-8 text-vscode-text opacity-60">
                  <p className="text-sm">暂无项目</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {reorderModal.items.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center py-2 px-3 rounded hover:bg-vscode-active/10 transition-colors border border-transparent hover:border-vscode-border"
                    >
                      <span className="text-xs text-vscode-text opacity-50 w-6 flex-shrink-0">{index + 1}.</span>
                      <span className="text-sm text-vscode-text truncate flex-1 min-w-0">{item.name}</span>
                      <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => handleReorderUp(index)}
                          disabled={index === 0}
                          className="icon-btn disabled:opacity-30 disabled:cursor-not-allowed"
                          title="上移"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          onClick={() => handleReorderDown(index)}
                          disabled={index >= reorderModal.items.length - 1}
                          className="icon-btn disabled:opacity-30 disabled:cursor-not-allowed"
                          title="下移"
                        >
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 p-4 border-t border-vscode-border">
              <button
                onClick={() => setReorderModal(null)}
                className="px-4 py-2 text-sm text-vscode-text hover:bg-vscode-active/20 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleReorderSave}
                className="px-4 py-2 text-sm text-white transition-colors"
                style={{ backgroundColor: 'var(--color-vscode-active, #007acc)' }}
              >
                保存顺序
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};
