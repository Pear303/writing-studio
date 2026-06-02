import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Edit3, Wand2, FileText, ListChecks } from 'lucide-react';
import type { Book, Volume, Chapter } from '../../types';
import { db } from '../../db';
import { ContextMenu, type MenuItem } from '../ContextMenu';

interface VolumeTreeProps {
  book: Book;
  onVolumeSelect: (volume: Volume) => void;
  onChapterSelect?: (chapter: Chapter) => void;
  activeVolumeId?: string | null;
  activeChapterId?: string | null;
  refreshTrigger?: number;
  volumesWithChapters?: Set<string>;
  onOutlineExtract?: (volume: Volume) => void;
}

export const VolumeTree = ({ book, onVolumeSelect, onChapterSelect, activeVolumeId, activeChapterId, refreshTrigger, volumesWithChapters, onOutlineExtract }: VolumeTreeProps) => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [volumeContextMenu, setVolumeContextMenu] = useState<{
    x: number;
    y: number;
    volume: Volume;
  } | null>(null);
  const [chapterContextMenu, setChapterContextMenu] = useState<{
    x: number;
    y: number;
    chapter: Chapter;
  } | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);

  const EXPANDED_VOLUMES_KEY = `expanded_volumes_volumetree_${book.id}`;

  const loadExpandedIds = (allVolumes: Volume[]): Set<string> => {
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

  const saveExpandedIds = (expanded: Set<string>) => {
    try {
      localStorage.setItem(EXPANDED_VOLUMES_KEY, JSON.stringify([...expanded]));
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, [book.id, book, refreshTrigger]);

  const loadData = async () => {
    try {
      const allVolumes = await db.volumes
        .where('bookId')
        .equals(book.id)
        .sortBy('order');
      const allChapters = await db.chapters
        .where('bookId')
        .equals(book.id)
        .toArray();
      setVolumes(allVolumes);
      setChapters(allChapters);
      setExpandedIds(loadExpandedIds(allVolumes));
    } catch (error) {
      console.error('[VolumeTree] 加载数据失败:', error);
    }
  };

  const toggleExpand = (volumeId: string) => {
    const next = new Set(expandedIds);
    if (next.has(volumeId)) {
      next.delete(volumeId);
    } else {
      next.add(volumeId);
    }
    setExpandedIds(next);
    saveExpandedIds(next);
  };

  const getRootVolumes = () => volumes.filter(v => !v.parentId);
  const getChildVolumes = (parentId: string) => volumes.filter(v => v.parentId === parentId);
  const getVolumeChapters = (volumeId: string) =>
    chapters.filter(c => c.volumeId === volumeId).sort((a, b) => a.order - b.order);

  const handleVolumeContextMenu = (e: React.MouseEvent, volume: Volume) => {
    e.preventDefault();
    setVolumeContextMenu({ x: e.clientX, y: e.clientY, volume });
  };

  const handleChapterContextMenu = (e: React.MouseEvent, chapter: Chapter) => {
    e.preventDefault();
    setChapterContextMenu({ x: e.clientX, y: e.clientY, chapter });
  };

  const closeContextMenu = () => {
    setVolumeContextMenu(null);
    setChapterContextMenu(null);
  };

  const getVolumeContextMenuItems = (volume: Volume): MenuItem[] => {
    const items: MenuItem[] = [];
    const hasChapters = volumesWithChapters?.has(volume.id) ?? false;

    if (hasChapters && onOutlineExtract) {
      items.push({
        label: '大纲提炼',
        icon: <Wand2 size={16} />,
        onClick: () => onOutlineExtract(volume),
      });
    }

    return items;
  };

  const getChapterContextMenuItems = (chapter: Chapter): MenuItem[] => {
    const items: MenuItem[] = [];

    if (chapter.detailedOutline) {
      items.push({
        label: '查看细纲',
        icon: <ListChecks size={16} />,
        onClick: () => setExpandedChapterId(expandedChapterId === chapter.id ? null : chapter.id),
      });
    }

    return items;
  };

  const renderVolume = (volume: Volume, level: number = 0) => {
    const children = getChildVolumes(volume.id);
    const volumeChapters = getVolumeChapters(volume.id);
    const hasChildren = children.length > 0 || volumeChapters.length > 0;
    const isExpanded = expandedIds.has(volume.id);
    const isActive = activeVolumeId === volume.id;
    const hasOutline = !!volume.outline;

    return (
      <div key={volume.id}>
        <div
          className={`flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-150 ${
            isActive
              ? 'bg-blue-600/20 text-vscode-text'
              : 'hover:bg-vscode-active/10 text-vscode-text'
          }`}
          style={{ paddingLeft: level * 16 + 8 }}
          onClick={() => onVolumeSelect(volume)}
          onContextMenu={(e) => handleVolumeContextMenu(e, volume)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(volume.id);
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

          <span className="text-sm truncate min-w-0 flex-1">{volume.name}</span>

          {hasOutline && (
            <span className="text-xs text-green-400 mr-1 flex-shrink-0" title="已设置大纲">
              大纲
            </span>
          )}

          {isActive && (
            <span className="flex-shrink-0 mr-1" title="正在编辑大纲">
              <Edit3 size={12} className="text-blue-400" />
            </span>
          )}
        </div>

        {isExpanded && (
          <div>
            {children.map(child => renderVolume(child, level + 1))}

            {volumeChapters.map(chapter => {
              const isChapterActive = activeChapterId === chapter.id;
              const hasDetailedOutline = !!chapter.detailedOutline;
              const isChapterExpanded = expandedChapterId === chapter.id;

              return (
                <div key={chapter.id}>
                  <div
                    className={`flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-150 ${
                      isChapterActive
                        ? 'bg-blue-600/15 text-vscode-text'
                        : 'hover:bg-vscode-active/10 text-vscode-text'
                    }`}
                    style={{ paddingLeft: (level + 1) * 16 + 8 }}
                    onClick={() => {
                      onChapterSelect?.(chapter);
                      if (hasDetailedOutline) {
                        setExpandedChapterId(isChapterExpanded ? null : chapter.id);
                      }
                    }}
                    onContextMenu={(e) => handleChapterContextMenu(e, chapter)}
                  >
                    <span className="w-5 mr-1" />
                    <FileText size={14} className="mr-2 text-blue-400 flex-shrink-0" />

                    <span className="text-sm truncate min-w-0 flex-1">{chapter.title}</span>

                    {hasDetailedOutline && (
                      <span className="text-xs text-purple-400 flex-shrink-0" title="已设置细纲">
                        细纲
                      </span>
                    )}
                  </div>

                  {isChapterExpanded && hasDetailedOutline && (
                    <div
                      style={{ paddingLeft: (level + 1) * 16 + 36 }}
                      className="pr-2 pb-2"
                    >
                      <div className="text-xs text-vscode-text bg-vscode-bg border border-vscode-border rounded p-2 whitespace-pre-wrap max-h-32 overflow-auto">
                        {chapter.detailedOutline}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar">
      <div className="p-3 border-b border-vscode-border">
        <h2 className="text-sm font-semibold text-vscode-text truncate" title={book.name}>
          {book.name}
        </h2>
        <p className="text-xs text-vscode-text opacity-60 mt-0.5">
          卷节点可编辑大纲 · 章节点可查看细纲
        </p>
      </div>

      <div className="flex-1 overflow-auto py-2 px-2">
        {getRootVolumes().length > 0 ? (
          getRootVolumes().map(volume => renderVolume(volume, 0))
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-vscode-text opacity-60 px-4 text-center">
            <p className="text-sm mb-2">暂无卷</p>
            <p className="text-xs">请在左侧「书籍」面板中创建卷</p>
          </div>
        )}
      </div>

      {volumeContextMenu && (
        <ContextMenu
          x={volumeContextMenu.x}
          y={volumeContextMenu.y}
          items={getVolumeContextMenuItems(volumeContextMenu.volume)}
          onClose={closeContextMenu}
        />
      )}

      {chapterContextMenu && (
        <ContextMenu
          x={chapterContextMenu.x}
          y={chapterContextMenu.y}
          items={getChapterContextMenuItems(chapterContextMenu.chapter)}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
};

export default VolumeTree;
