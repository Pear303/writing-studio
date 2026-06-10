import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, FileText, Folder } from 'lucide-react';
import type { RecycleBinItem, Chapter, Volume } from '../../types';
import { db, adjustBookTotalWords } from '../../db';

interface RecycleBinPanelProps {
  onRestore?: () => void;
}

export const RecycleBinPanel = ({ onRestore }: RecycleBinPanelProps) => {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const allItems = await db.recycleBin.orderBy('deletedAt').reverse().toArray();
      setItems(allItems);
    } catch (error) {
      console.error('加载回收站失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // 恢复章节
  const handleRestoreChapter = async (item: RecycleBinItem) => {
    const chapter = item.data as Chapter;
    try {
      // 检查原卷是否还存在
      let volumeId = chapter.volumeId;
      if (volumeId) {
        const vol = await db.volumes.get(volumeId);
        if (!vol) {
          // 原卷已不存在，尝试放到该书第一个卷下
          const firstVol = await db.volumes.where('bookId').equals(chapter.bookId).first();
          volumeId = firstVol?.id || null;
        }
      } else {
        const firstVol = await db.volumes.where('bookId').equals(chapter.bookId).first();
        volumeId = firstVol?.id || null;
      }

      await db.transaction('rw', [db.chapters, db.recycleBin], async () => {
        // 恢复章节
        await db.chapters.add({
          ...chapter,
          volumeId,
        });

        // 从回收站删除
        await db.recycleBin.delete(item.id);
      });

      // 增量更新书籍总字数
      await adjustBookTotalWords(chapter.bookId, chapter.wordCount || 0);

      loadItems();
      onRestore?.();
    } catch (error) {
      console.error('恢复章节失败:', error);
    }
  };

  // 恢复卷（连同其下的章节）
  const handleRestoreVolume = async (item: RecycleBinItem) => {
    const volume = item.data as Volume;
    const childChapters = item.childChapters || [];
    try {
      await db.transaction('rw', [db.volumes, db.chapters, db.recycleBin], async () => {
        // 恢复卷
        await db.volumes.add(volume);

        // 恢复该卷下的所有章节
        for (const ch of childChapters) {
          await db.chapters.add({ ...ch, volumeId: volume.id });
        }

        // 从回收站删除
        await db.recycleBin.delete(item.id);
      });

      // 增量更新书籍总字数
      const restoredWordCount = childChapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
      await adjustBookTotalWords(volume.bookId, restoredWordCount);

      loadItems();
      onRestore?.();
    } catch (error) {
      console.error('恢复卷失败:', error);
    }
  };

  // 永久删除
  const handlePermanentDelete = async (item: RecycleBinItem) => {
    const typeName = item.itemType === 'chapter' ? '章节' : '卷';
    if (!confirm(`确定要永久删除${typeName}"${item.itemType === 'chapter' ? (item.data as Chapter).title : (item.data as Volume).name}"吗？此操作不可恢复！`)) {
      return;
    }

    try {
      await db.recycleBin.delete(item.id);
      loadItems();
    } catch (error) {
      console.error('永久删除失败:', error);
    }
  };

  // 清空回收站
  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!confirm('确定要清空回收站吗？所有项目将被永久删除，此操作不可恢复！')) {
      return;
    }

    try {
      await db.recycleBin.clear();
      loadItems();
    } catch (error) {
      console.error('清空回收站失败:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4 text-vscode-text opacity-60 text-sm">加载中...</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
        <h2 className="text-sm font-semibold text-vscode-text">回收站</h2>
        {items.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-vscode-text opacity-60 hover:opacity-100 hover:text-red-400 transition-colors"
          >
            清空
          </button>
        )}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-vscode-text opacity-40">
            <Trash2 size={40} className="mb-3" />
            <p className="text-sm">回收站为空</p>
            <p className="text-xs mt-1">删除的章节和卷会出现在这里</p>
          </div>
        ) : (
          <div className="py-1">
            {items.map((item) => {
              const isVolume = item.itemType === 'volume';
              const name = isVolume ? (item.data as Volume).name : (item.data as Chapter).title;
              const wordCount = isVolume
                ? (item.childChapters || []).reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
                : (item.data as Chapter).wordCount;
              const isExpanded = expandedId === item.id;

              return (
                <div key={item.id} className="border-b border-vscode-border last:border-b-0">
                  {/* 主行 */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 hover:bg-vscode-active/10 cursor-pointer group"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <span className="text-vscode-text opacity-50 flex-shrink-0">
                      {isVolume ? <Folder size={14} /> : <FileText size={14} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-vscode-text truncate">{name}</div>
                      <div className="text-xs text-vscode-text opacity-40 flex items-center gap-2">
                        <span>{item.bookName}</span>
                        {item.volumeName && <span>· {item.volumeName}</span>}
                        <span>· {wordCount.toLocaleString()}字</span>
                        <span>· {formatTime(item.deletedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          isVolume ? handleRestoreVolume(item) : handleRestoreChapter(item);
                        }}
                        className="p-1 rounded hover:bg-vscode-active/20 text-vscode-text opacity-60 hover:opacity-100"
                        title="恢复"
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePermanentDelete(item);
                        }}
                        className="p-1 rounded hover:bg-vscode-active/20 text-vscode-text opacity-60 hover:opacity-100 hover:text-red-400"
                        title="永久删除"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="px-3 pb-2 pl-9">
                      {isVolume && item.childChapters && item.childChapters.length > 0 && (
                        <div className="mb-2">
                          <div className="text-xs text-vscode-text opacity-50 mb-1">
                            包含 {item.childChapters.length} 个章节：
                          </div>
                          {item.childChapters.map((ch) => (
                            <div key={ch.id} className="text-xs text-vscode-text opacity-70 flex items-center gap-1 py-0.5">
                              <FileText size={10} />
                              <span className="truncate">{ch.title}</span>
                              <span className="opacity-50">({ch.wordCount.toLocaleString()}字)</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {!isVolume && (item.data as Chapter).content && (
                        <div className="text-xs text-vscode-text opacity-50 line-clamp-3">
                          {((item.data as Chapter).content || '').replace(/<[^>]*>/g, '').slice(0, 200)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
