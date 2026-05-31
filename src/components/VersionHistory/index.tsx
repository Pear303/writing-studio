import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw, X } from 'lucide-react';
import { Toast, type ToastType } from '../Toast';
import type { ChapterVersion } from '../../types';
import { getChapterVersions, restoreChapterVersion } from '../../db';

interface VersionHistoryProps {
  chapterId: string;
  onClose: () => void;
  onRestore: (content: string, wordCount: number) => void;
}

export const VersionHistory = ({
  chapterId,
  onClose,
  onRestore,
}: VersionHistoryProps) => {
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ChapterVersion | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  // 显示Toast
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    loadVersions();
  }, [chapterId]);

  const loadVersions = async () => {
    try {
      const allVersions = await getChapterVersions(chapterId);
      setVersions(allVersions.reverse()); // 最新的在前
    } catch (error) {
      console.error('加载版本失败:', error);
    }
  };

  const handleRestore = async (version: ChapterVersion) => {
    if (!confirm(`确定要恢复到 ${formatDate(version.createdAt)} 的版本吗？\n当前内容将被覆盖。`)) {
      return;
    }

    try {
      await restoreChapterVersion(version.id);
      onRestore(version.content, version.wordCount);
      onClose();
      showToast('版本恢复成功', 'success');
    } catch (error) {
      console.error('恢复版本失败:', error);
      showToast('恢复失败，请重试', 'error');
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div 
        className="bg-vscode-sidebar border border-vscode-border w-[900px] max-h-[85vh] flex flex-col"
        style={{ borderRadius: '2px' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-vscode-border">
          <h2 className="text-lg font-semibold text-vscode-text flex items-center">
            <Clock size={18} className="mr-2" />
            历史版本
          </h2>
          <button onClick={onClose} className="icon-btn">
            <X size={20} />
          </button>

        </div>

        <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(85vh - 80px)' }}>
          <div className="w-[280px] border-r border-vscode-border overflow-auto p-4">
            {versions.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>
                <p>暂无历史版本</p>
                <p className="text-xs mt-2">保存章节时会自动创建版本快照</p>
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className={`p-3 border transition-colors cursor-pointer`}
                    style={{
                      borderColor: selectedVersion?.id === version.id ? 'var(--color-vscode-active, #007acc)' : 'var(--color-vscode-border, #454545)',
                      backgroundColor: selectedVersion?.id === version.id ? 'rgba(0, 122, 204, 0.2)' : 'transparent',
                    }}
                    onClick={() => setSelectedVersion(version)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-vscode-text font-medium">
                        {index === 0 ? '最新版本' : `版本 ${versions.length - index}`}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>
                        {formatDate(version.createdAt)}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>
                      字数: {version.wordCount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedVersion ? (
              <>
                <div className="p-3 border-b border-vscode-border flex items-center justify-between">
                  <div className="text-sm text-vscode-text">
                    <span className="font-medium">{selectedVersion.wordCount.toLocaleString()}</span> 字
                    <span className="mx-2" style={{ opacity: 0.5 }}>|</span>
                    <span style={{ opacity: 0.6 }}>{formatDate(selectedVersion.createdAt)}</span>
                  </div>
                  <button
                    onClick={() => handleRestore(selectedVersion)}
                    className="px-3 py-1.5 text-xs text-white flex items-center space-x-1 transition-colors"
                    style={{ backgroundColor: 'var(--color-vscode-active, #007acc)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#005a9e';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--color-vscode-active, #007acc)';
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>恢复到此版本</span>
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <div 
                    className="prose prose-invert max-w-none text-sm text-vscode-text whitespace-pre-wrap"
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {selectedVersion.content || '(空内容)'}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-vscode-text opacity-60">
                <p>点击左侧版本查看内容预览</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-vscode-border text-xs text-center" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>
          选择版本后可预览内容并恢复
        </div>
      </div>
    </div>
  );
};
