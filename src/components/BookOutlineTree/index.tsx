import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Download, FolderPlus, FilePlus, ArrowRight, ArrowUp, ArrowDown, FileText, Clock, ArrowLeft, X, Move, ChevronRight, ChevronDown, BookOpen, Folder, FolderOpen, Hash } from 'lucide-react';
import { TreeNode } from './TreeNode';
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
  onBookDeselect?: () => void;
  onVolumeChange?: () => void;
  activeChapterId?: string | null;
  refreshTrigger?: number;
}

export const BookOutlineTree = ({ book, onChapterSelect, onBookDeselect, onVolumeChange, activeChapterId, refreshTrigger }: BookOutlineTreeProps) => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [autoNumbering, setAutoNumbering] = useState(book.autoNumbering || false);
  const [numberingFormat, setNumberingFormat] = useState<'arabic' | 'chinese'>(book.numberingFormat || 'arabic');
  const [numberingScope, setNumberingScope] = useState<'global' | 'volume'>(book.numberingScope || 'global');
  
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

  const openAutoNumberPanel = () => {
    if (autoNumberBtnRef.current) {
      const rect = autoNumberBtnRef.current.getBoundingClientRect();
      setAutoNumberPanelPos({ top: rect.top, left: rect.right + 4 });
    }
    setShowAutoNumberPanel(true);
  };

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
  useEffect(() => {
    console.log('[BookOutlineTree] useEffect 触发，refreshTrigger:', refreshTrigger);
    loadData();
  }, [book.id, book, refreshTrigger]);

  const loadData = async () => {
    try {
      console.log('[BookOutlineTree] 开始加载数据...');
      // 加载卷
      const allVolumes = await db.volumes
        .where('bookId')
        .equals(book.id)
        .sortBy('order');
      console.log('[BookOutlineTree] 加载了', allVolumes.length, '个卷');

      // 加载所有章节
      const allChapters = await db.chapters
        .where('bookId')
        .equals(book.id)
        .toArray();
      console.log('[BookOutlineTree] 加载了', allChapters.length, '个章节');
      
      setVolumes(allVolumes);
      setChapters(allChapters);

      // 默认展开所有卷
      setExpandedVolumes(new Set(allVolumes.map((v) => v.id)));
      console.log('[BookOutlineTree] 数据加载完成');
    } catch (error) {
      console.error('[BookOutlineTree] 加载大纲数据失败:', error);
    }
  };

  // 切换卷的展开/折叠状态
  const toggleVolume = (volumeId: string) => {
    const newExpanded = new Set(expandedVolumes);
    if (newExpanded.has(volumeId)) {
      newExpanded.delete(volumeId);
    } else {
      newExpanded.add(volumeId);
    }
    setExpandedVolumes(newExpanded);
  };

  // 获取未归入任何卷的章节（草稿箱）
  const draftChapters = chapters.filter((c) => c.volumeId === null);

  // 获取指定卷的章节
  const getVolumeChapters = (volumeId: string) => {
    return chapters
      .filter((c) => c.volumeId === volumeId)
      .sort((a, b) => a.createdAt - b.createdAt);
  };

  // 获取根卷（没有父卷的卷）
  const getRootVolumes = () => {
    return volumes.filter(v => !v.parentId);
  };

  // 获取子卷
  const getChildVolumes = (parentId: string) => {
    return volumes.filter(v => v.parentId === parentId);
  };

  // 递归渲染卷和章节
  const renderVolumeTree = (volume: Volume, level: number = 0, isLast: boolean = false) => {
    const childVolumes = getChildVolumes(volume.id);
    const volumeChapters = getVolumeChapters(volume.id);
    const hasChildren = childVolumes.length > 0 || volumeChapters.length > 0;

    return (
      <div key={volume.id}>
        <TreeNode
          type="volume"
          data={volume}
          level={level}
          isExpanded={expandedVolumes.has(volume.id)}
          hasChildren={hasChildren}
          isLast={isLast}
          onToggle={() => toggleVolume(volume.id)}
          onContextMenu={(e) => handleContextMenu(e, 'volume', volume)}
          onDrop={(e) => handleDrop(e, 'volume', volume.id)}
          onDragOver={handleDragOver}
        />

        {/* 展开时显示子卷和章节 */}
        {expandedVolumes.has(volume.id) && (
          <>
            {/* 递归渲染子卷 */}
            {childVolumes.map((childVolume, index) => 
              renderVolumeTree(
                childVolume, 
                level + 1, 
                index === childVolumes.length - 1 && volumeChapters.length === 0
              )
            )}
            
            {/* 渲染当前卷的章节 */}
            {volumeChapters.map((chapter, index) => (
              <TreeNode
                key={chapter.id}
                type="chapter"
                data={chapter}
                level={level + 1}
                isActive={activeChapterId === chapter.id}
                isLast={index === volumeChapters.length - 1}
                onClick={() => onChapterSelect(chapter)}
                onContextMenu={(e) => handleContextMenu(e, 'chapter', chapter)}
                onDragStart={(e) => handleDragStart(e, 'chapter', chapter.id)}
                onDragEnd={handleDragEnd}
                displayTitle={computeChapterDisplayTitle(chapter, chapters, { ...book, autoNumbering, numberingFormat, numberingScope })}
              />
            ))}
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

  // 新建章节（在指定位置）
  const handleCreateChapter = async (volumeId: string | null = null, position?: 'before' | 'after', referenceChapterId?: string) => {
    const title = prompt('请输入章节标题:');
    if (!title) return;

    let insertOrder = Date.now();
    
    // 如果指定了位置，计算插入顺序
    if (position && referenceChapterId) {
      const refChapter = chapters.find(c => c.id === referenceChapterId);
      if (refChapter) {
        // 简单的顺序计算：before则减1，after则加1
        insertOrder = position === 'before' ? refChapter.createdAt - 1 : refChapter.createdAt + 1;
      }
    }

    const newChapter: Chapter = {
      id: generateId(),
      volumeId,
      bookId: book.id,
      title,
      content: '',
      wordCount: 0,
      createdAt: insertOrder,
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

  // 删除卷
  const handleDeleteVolume = async (volume: Volume) => {
    if (!confirm(`确定要删除卷"${volume.name}"吗？这将同时删除该卷下的所有章节。`)) {
      return;
    }

    try {
      await db.transaction('rw', [db.volumes, db.chapters], async () => {
        // 删除该卷下的所有章节
        const volumeChapters = chapters.filter((c) => c.volumeId === volume.id);
        await db.chapters.bulkDelete(volumeChapters.map((c) => c.id));

        // 删除卷
        await db.volumes.delete(volume.id);
      });

      loadData();
      onVolumeChange?.();
      showToast('卷已删除', 'success');
    } catch (error) {
      console.error('删除卷失败:', error);
      showToast('删除卷失败，请重试', 'error');
    }
  };

  // 删除章节
  const handleDeleteChapter = async (chapter: Chapter) => {
    if (!confirm(`确定要删除章节"${chapter.title}"吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await db.chapters.delete(chapter.id);
      loadData();
      showToast('章节已删除', 'success');
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
      .sort((a, b) => a.createdAt - b.createdAt)
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
        // 根据新顺序更新时间戳
        const baseTime = Date.now();
        for (let i = 0; i < reorderModal.items.length; i++) {
          await db.chapters.update(reorderModal.items[i].id, {
            createdAt: baseTime + i,
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

  // 拖拽开始
  const handleDragStart = (e: React.DragEvent, type: 'volume' | 'chapter', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
  };

  // 拖拽结束
  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // 放置处理
  const handleDrop = async (e: React.DragEvent, targetType: 'volume' | 'chapter', targetId: string) => {
    e.preventDefault();
    
    if (!draggedItem) return;

    try {
      // 章节拖拽到卷
      if (draggedItem.type === 'chapter' && targetType === 'volume') {
        const chapter = chapters.find(c => c.id === draggedItem.id);
        const volume = volumes.find(v => v.id === targetId);
        
        if (chapter && volume && chapter.volumeId !== targetId) {
          await db.chapters.update(chapter.id, {
            volumeId: targetId,
          });
          
          loadData();
          showToast(`已将章节 "${chapter.title}" 移动到卷 "${volume.name}"`, 'success');
        }
      }
      
      setDraggedItem(null);
    } catch (error) {
      console.error('拖拽失败:', error);
      showToast('移动失败，请重试', 'error');
    }
  };

  // 允许放置
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // 获取某个卷的所有后代卷 ID（含自身）
  const getDescendantVolumeIds = (volumeId: string, allVolumes: Volume[]): Set<string> => {
    const result = new Set<string>([volumeId]);
    const children = allVolumes.filter(v => v.parentId === volumeId);
    for (const child of children) {
      const childDescendants = getDescendantVolumeIds(child.id, allVolumes);
      childDescendants.forEach(id => result.add(id));
    }
    return result;
  };

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
            className="flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-700/30 transition-colors rounded group"
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
                backgroundColor: autoNumbering ? '#2563eb' : '#374151',
                border: '3px solid',
                borderColor: autoNumbering ? '#60a5fa' : '#9ca3af',
                boxShadow: autoNumbering ? 'inset 0 2px 4px rgba(0,0,0,0.3), 0 0 0 2px rgba(96,165,250,0.4)' : '0 0 0 2px rgba(156,163,175,0.5)',
                outline: 'none'
              }}
            >
              <span
                className="absolute w-4 h-4 rounded-full shadow-lg transition-transform duration-200"
                style={{
                  top: '2px',
                  left: '2px',
                  transform: autoNumbering ? 'translateX(20px)' : 'translateX(0)',
                  backgroundColor: autoNumbering ? '#ffffff' : '#d1d5db',
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
      <div className="flex-1 overflow-auto py-2 px-2">
        {/* 草稿箱 */}
        {draftChapters.length > 0 && (
          <div className="mb-2">
            <div
              className="px-3 py-1.5 text-xs font-semibold text-vscode-text opacity-60 uppercase tracking-wider"
              onContextMenu={(e) => handleContextMenu(e, 'book')}
            >
              草稿箱
            </div>
            {draftChapters.map((chapter) => (
              <TreeNode
                key={chapter.id}
                type="chapter"
                data={chapter}
                level={1}
                isActive={activeChapterId === chapter.id}
                onClick={() => onChapterSelect(chapter)}
                onContextMenu={(e) => handleContextMenu(e, 'chapter', chapter)}
                onDragStart={(e) => handleDragStart(e, 'chapter', chapter.id)}
                onDragEnd={handleDragEnd}
                displayTitle={computeChapterDisplayTitle(chapter, chapters, { ...book, autoNumbering, numberingFormat, numberingScope })}
              />
            ))}
          </div>
        )}

        {/* 卷和章节 - 使用递归渲染 */}
        {getRootVolumes().map((volume, index, array) => 
          renderVolumeTree(volume, 0, index === array.length - 1)
        )}

        {/* 空状态提示 */}
        {volumes.length === 0 && draftChapters.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-vscode-text opacity-60 px-4 text-center">
            <p className="text-sm mb-2">暂无章节</p>
            <p className="text-xs">点击顶部按钮新建卷或章节</p>
          </div>
        )}
      </div>

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
                className="flex items-center py-2 px-3 cursor-pointer hover:bg-gray-700/30 transition-colors border border-transparent hover:border-vscode-border rounded"
                onClick={() => {
                  if (confirm(`确定将章节移动到草稿箱吗？`)) {
                    handleChapterMoveDraft();
                  }
                }}
              >
                <FileText size={16} className="mr-2 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-vscode-text">草稿箱（不归入任何卷）</span>
              </div>

              {/* 书籍 → 卷 树形结构 */}
              {moveChapterModal.books.map(book => (
                <div key={book.id} className="mt-1">
                  <div
                    className="flex items-center py-2 px-3 cursor-pointer hover:bg-gray-700/30 transition-colors rounded"
                    onClick={() => {
                      const next = new Set(moveChapterModal.expandedBookIds);
                      if (next.has(book.id)) next.delete(book.id); else next.add(book.id);
                      setMoveChapterModal({ ...moveChapterModal, expandedBookIds: next });
                    }}
                  >
                    {moveChapterModal.expandedBookIds.has(book.id) ? (
                      <ChevronDown size={14} className="mr-1 text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="mr-1 text-gray-400" />
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
                  <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-700/30 transition-colors">
                    <div
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => {
                        const next = new Set(moveVolumeModal.expandedBookIds);
                        if (next.has(book.id)) next.delete(book.id); else next.add(book.id);
                        setMoveVolumeModal({ ...moveVolumeModal, expandedBookIds: next });
                      }}
                    >
                      {moveVolumeModal.expandedBookIds.has(book.id) ? (
                        <ChevronDown size={14} className="mr-1 text-gray-400" />
                      ) : (
                        <ChevronRight size={14} className="mr-1 text-gray-400" />
                      )}
                      <BookOpen size={16} className="mr-2 text-blue-400 flex-shrink-0" />
                      <span className="text-sm text-vscode-text font-medium">{book.name}</span>
                    </div>
                    <button
                      className="text-xs px-2 py-1 text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
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
                      className="flex items-center py-2 px-3 rounded hover:bg-gray-700/30 transition-colors border border-transparent hover:border-vscode-border"
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
