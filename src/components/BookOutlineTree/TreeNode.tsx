import React, { forwardRef, CSSProperties } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import type { Volume, Chapter } from '../../types';

export type DropPosition = 'before' | 'after' | 'inside';

interface TreeNodeProps {
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
  isDragging?: boolean;
  dragHandleProps?: Record<string, any>;
  dropPosition?: DropPosition | null;
  isDropTarget?: boolean;
  /** 章节开头摘要（前几句） */
  excerpt?: string;
  /** 章节字数 */
  chapterWordCount?: number;
  /** 卷节点详细信息，如 "3子卷 · 5章 · 12000字" */
  volumeDetail?: string;
}

export const TreeNode = forwardRef<HTMLDivElement, TreeNodeProps>(({
  type,
  data,
  level,
  isExpanded = false,
  isActive = false,
  onToggle,
  onClick,
  onContextMenu,
  hasChildren = false,
  isLast = false,
  displayTitle,
  isDragging = false,
  dragHandleProps,
  dropPosition = null,
  isDropTarget = false,
  excerpt,
  chapterWordCount,
  volumeDetail,
}, ref) => {
  const paddingLeft = level * 16 + 8;

  const nodeTitle = displayTitle || (type === 'volume' ? (data as Volume).name : (data as Chapter).title);

  const bgClass = isActive
    ? 'bg-blue-600/20'
    : isDropTarget && dropPosition === 'inside'
      ? 'bg-blue-500/20 ring-1 ring-blue-400/50'
      : 'hover:bg-vscode-active/10';

  return (
    <div className="relative w-full" ref={ref}
      data-node-type={type}
      data-node-id={data.id}
      data-node-level={level}
    >
      {level > 0 && (
        <>
          <div
            className="absolute top-0 bottom-0 w-px bg-vscode-border opacity-50"
            style={{ left: `${(level - 1) * 16 + 15}px` }}
          />
          {!isLast && (
            <div
              className="absolute top-1/2 h-px bg-vscode-border opacity-50"
              style={{
                left: `${(level - 1) * 16 + 15}px`,
                width: '8px',
              }}
            />
          )}
        </>
      )}

      {dropPosition === 'before' && isDropTarget && (
        <div
          className="absolute left-2 right-2 z-20"
          style={{ top: '-1px' }}
        >
          <div className="h-0.5 bg-blue-500 rounded-full">
            <div className="absolute -left-1 -top-[3px] w-2 h-2 bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      <div
        className={`flex ${type === 'volume' ? 'items-center py-2' : 'items-start py-1.5'} px-2 cursor-pointer transition-colors duration-150 relative group ${
          isDragging ? 'opacity-30' : ''
        } ${bgClass} ${type === 'volume' ? 'border-b border-vscode-border/30' : ''}`}
        style={{ paddingLeft, paddingRight: '12px' }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {dragHandleProps && (
          <span
            className="mr-0.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-grab active:cursor-grabbing flex-shrink-0 transition-opacity"
            {...dragHandleProps}
          >
            <GripVertical size={12} className="text-vscode-text" />
          </span>
        )}

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

        {type === 'chapter' && <span className="w-5 mr-1" />}

        {type === 'volume' ? (
          level === 0 ? (
            <FolderOpen size={18} className="mr-2 text-yellow-500 flex-shrink-0" />
          ) : (
            <Folder size={18} className="mr-2 text-yellow-600 flex-shrink-0" />
          )
        ) : (
          <FileText size={16} className="mr-2 text-blue-400 flex-shrink-0 mt-0.5" />
        )}

        {type === 'volume' ? (
          <div className="min-w-0 flex-1">
            <span className="text-[13px] font-semibold text-vscode-text truncate block">
              {nodeTitle}
              {volumeDetail && (
                <span className="ml-2 text-xs text-vscode-text opacity-40 font-normal whitespace-nowrap">
                  {volumeDetail}
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <span className="text-sm text-vscode-text truncate block">
              {nodeTitle}
            </span>
            {excerpt && (
              <div
                className="text-xs text-vscode-text opacity-40 line-clamp-2"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {excerpt}
              </div>
            )}
            {chapterWordCount !== undefined && (
              <span className="text-xs text-vscode-text opacity-40">
                {chapterWordCount}字
              </span>
            )}
          </div>
        )}
      </div>

      {dropPosition === 'after' && isDropTarget && (
        <div
          className="absolute left-2 right-2 z-20"
          style={{ bottom: '-1px' }}
        >
          <div className="h-0.5 bg-blue-500 rounded-full">
            <div className="absolute -left-1 -top-[3px] w-2 h-2 bg-blue-500 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
});

TreeNode.displayName = 'TreeNode';

export const DragPreview: React.FC<{
  type: 'volume' | 'chapter';
  data: Volume | Chapter;
  displayTitle?: string;
}> = ({ type, data, displayTitle }) => {
  const nodeTitle = displayTitle || (type === 'volume' ? (data as Volume).name : (data as Chapter).title);

  return (
    <div className="flex items-center py-1.5 px-3 bg-vscode-sidebar border border-blue-500/50 rounded shadow-lg opacity-90">
      {type === 'volume' ? (
        <FolderOpen size={16} className="mr-2 text-yellow-500 flex-shrink-0" />
      ) : (
        <FileText size={16} className="mr-2 text-blue-400 flex-shrink-0" />
      )}
      <span className="text-sm text-vscode-text truncate">
        {nodeTitle}
      </span>
    </div>
  );
};
