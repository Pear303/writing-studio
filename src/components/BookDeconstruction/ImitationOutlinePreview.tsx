import React, { useState } from 'react';
import type { ImitationOutline, GenerateProgress } from '../../types/imitation';
import { ImitationChaptersTab } from './tabs/ImitationChaptersTab';
import { ImitationPacingTab } from './tabs/ImitationPacingTab';
import { ImitationArcsTab } from './tabs/ImitationArcsTab';
import { ImitationSuspenseTab } from './tabs/ImitationSuspenseTab';

interface ImitationOutlinePreviewProps {
  outline: ImitationOutline;
  progress?: GenerateProgress;
  isGenerating?: boolean;
  onImportToBook: () => void;
  onRegenerate: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onClose: () => void;
}

const tabs = [
  { key: 'chapters', label: '章节大纲' },
  { key: 'suspense', label: '悬念线' },
  { key: 'arcs', label: '角色弧线' },
  { key: 'pacing', label: '节奏曲线' },
] as const;

type TabKey = typeof tabs[number]['key'];

export const ImitationOutlinePreview: React.FC<ImitationOutlinePreviewProps> = ({
  outline,
  progress,
  isGenerating,
  onImportToBook,
  onRegenerate,
  onExportJson,
  onExportMarkdown,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('chapters');

  if (isGenerating) {
    return (
      <div className="h-full flex flex-col bg-vscode-bg">
        <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-sidebar">
          <h3 className="text-vscode-text font-medium text-sm">正在生成仿写大纲...</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-48 h-1.5 bg-vscode-sidebar rounded-full overflow-hidden">
              <div
                className="h-full bg-vscode-active rounded-full transition-all duration-500"
                style={{ width: `${(progress?.progress || 0) * 100}%` }}
              />
            </div>
            <p className="text-vscode-text text-xs opacity-60">
              {progress?.detail || '正在生成...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'chapters':
        return <ImitationChaptersTab outline={outline} />;
      case 'suspense':
        return <ImitationSuspenseTab outline={outline} />;
      case 'arcs':
        return <ImitationArcsTab outline={outline} />;
      case 'pacing':
        return <ImitationPacingTab outline={outline} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-sidebar">
        <h3 className="text-vscode-text font-medium text-sm">
          {outline.title} - 仿写大纲
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onExportMarkdown}
            className="text-xs px-2 py-1 bg-vscode-input border border-vscode-border text-vscode-text hover:opacity-80 rounded"
          >
            导出 Markdown
          </button>
          <button
            onClick={onExportJson}
            className="text-xs px-2 py-1 bg-vscode-input border border-vscode-border text-vscode-text hover:opacity-80 rounded"
          >
            导出 JSON
          </button>
          <button
            onClick={onRegenerate}
            className="text-xs px-2 py-1 bg-vscode-input border border-vscode-border text-vscode-text hover:opacity-80 rounded"
          >
            重新生成
          </button>
          <button
            onClick={onImportToBook}
            className="text-xs px-2 py-1 bg-vscode-active text-white hover:opacity-90 rounded"
          >
            创建新书
          </button>
          <button
            onClick={onClose}
            className="text-vscode-text opacity-60 hover:opacity-100 text-xs"
          >
            关闭
          </button>
        </div>
      </div>

      {/* Info bar */}
      <div className="px-4 py-2 border-b border-vscode-border bg-vscode-sidebar/50 text-xs text-vscode-text opacity-60 flex gap-4">
        <span>题材：{outline.genre}</span>
        <span>核心冲突：{outline.coreConflict}</span>
        <span>主题：{outline.themes.join('、')}</span>
        <span>章节：{outline.chapters.length}章</span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-vscode-border bg-vscode-sidebar overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'text-vscode-text border-b-2 border-vscode-active font-medium'
                : 'text-vscode-text opacity-60 hover:opacity-80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {renderTab()}
      </div>
    </div>
  );
};
