import React from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import type { Volume, Chapter } from '../../types';

interface TreeNodeProps {
  type: 'volume' | 'chapter';
  data: Volume | Chapter;
  level: number;
  isExpanded?: boolean;
  isActive?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  hasChildren?: boolean;
  isLast?: boolean;
  displayTitle?: string;
}

export const TreeNode = ({
  type,
  data,
  level,
  isExpanded = false,
  isActive = false,
  onToggle,
  onClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  hasChildren = false,
  isLast = false,
  displayTitle,
}: TreeNodeProps) => {
  const paddingLeft = level * 16 + 8;

  return (
    <div className="relative w-full">
      {/* 连接线 */}
      {level > 0 && (
        <>
          {/* 垂直线 */}
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-600 opacity-50"
            style={{ left: `${(level - 1) * 16 + 15}px` }}
          />
          {/* 水平线 */}
          {!isLast && (
            <div
              className="absolute top-1/2 h-px bg-gray-600 opacity-50"
              style={{ 
                left: `${(level - 1) * 16 + 15}px`,
                width: '8px',
              }}
            />
          )}
        </>
      )}

      <div
        className={`flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-150 relative ${
          isActive ? 'bg-blue-600/20' : 'hover:bg-gray-700/30'
        }`}
        style={{ paddingLeft, paddingRight: '12px' }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        draggable={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {/* 展开/折叠图标 */}
        {type === 'volume' && onToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="mr-1 p-0.5 icon-btn z-10"
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        )}

        {/* 占位符（章节不需要展开图标） */}
        {type === 'chapter' && <span className="w-5 mr-1" />}

        {/* 图标 - 区分根卷和子卷 */}
        {type === 'volume' ? (
          level === 0 ? (
            <FolderOpen size={16} className="mr-2 text-yellow-500 flex-shrink-0" />
          ) : (
            <Folder size={16} className="mr-2 text-yellow-600 flex-shrink-0" />
          )
        ) : (
          <FileText size={16} className="mr-2 text-blue-400 flex-shrink-0" />
        )}

        {/* 名称 */}
        <span className="text-sm text-vscode-text truncate min-w-0 flex-1">
          {displayTitle || (type === 'volume' ? (data as Volume).name : (data as Chapter).title)}
        </span>


      </div>
    </div>
  );
};