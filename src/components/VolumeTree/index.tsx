import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Edit3, Wand2 } from 'lucide-react';
import type { Book, Volume } from '../../types';
import { db } from '../../db';
import { ContextMenu, type MenuItem } from '../ContextMenu';

interface VolumeTreeProps {
  book: Book;
  onVolumeSelect: (volume: Volume) => void;
  activeVolumeId?: string | null;
  refreshTrigger?: number;
  volumesWithChapters?: Set<string>;
  onOutlineExtract?: (volume: Volume) => void;
}

export const VolumeTree = ({ book, onVolumeSelect, activeVolumeId, refreshTrigger, volumesWithChapters, onOutlineExtract }: VolumeTreeProps) => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [volumeContextMenu, setVolumeContextMenu] = useState<{
    x: number;
    y: number;
    volume: Volume;
  } | null>(null);

  useEffect(() => {
    loadVolumes();
  }, [book.id, book, refreshTrigger]);

  const loadVolumes = async () => {
    try {
      const allVolumes = await db.volumes
        .where('bookId')
        .equals(book.id)
        .sortBy('order');
      setVolumes(allVolumes);
      setExpandedIds(new Set(allVolumes.map(v => v.id)));
    } catch (error) {
      console.error('[VolumeTree] 加载卷数据失败:', error);
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
  };

  const getRootVolumes = () => volumes.filter(v => !v.parentId);
  const getChildVolumes = (parentId: string) => volumes.filter(v => v.parentId === parentId);

  const handleVolumeContextMenu = (e: React.MouseEvent, volume: Volume) => {
    e.preventDefault();
    setVolumeContextMenu({ x: e.clientX, y: e.clientY, volume });
  };

  const closeVolumeContextMenu = () => {
    setVolumeContextMenu(null);
  };

  const getContextMenuItems = (volume: Volume): MenuItem[] => {
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

  const renderVolume = (volume: Volume, level: number = 0) => {
    const children = getChildVolumes(volume.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(volume.id);
    const isActive = activeVolumeId === volume.id;

    return (
      <div key={volume.id}>
        <div
          className={`flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-150 ${
            isActive
              ? 'bg-blue-600/20 text-vscode-text'
              : 'hover:bg-gray-700/30 text-vscode-text'
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

          {isActive && (
            <span className="flex-shrink-0 mr-1" title="正在编辑大纲">
              <Edit3 size={12} className="text-blue-400" />
            </span>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {children.map(child => renderVolume(child, level + 1))}
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
          右键点击卷节点可提炼大纲
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
          items={getContextMenuItems(volumeContextMenu.volume)}
          onClose={closeVolumeContextMenu}
        />
      )}
    </div>
  );
};

export default VolumeTree;
