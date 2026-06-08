import React, { useState } from 'react';
import type { BookDeconstructionResult } from '../../types/book-deconstruction';
import { SkeletonTab } from './tabs/SkeletonTab';
import { CharacterArcTab } from './tabs/CharacterArcTab';
import { SuspenseTab } from './tabs/SuspenseTab';
import { PlotLineTab } from './tabs/PlotLineTab';
import { ForeshadowingTab } from './tabs/ForeshadowingTab';
import { PacingTab } from './tabs/PacingTab';
import { RelationshipTab } from './tabs/RelationshipTab';
import { WorldRulesTab } from './tabs/WorldRulesTab';

interface DeconstructionResultProps {
  result: BookDeconstructionResult;
  onExportJson?: () => void;
  onSeedToPipeline?: () => void;
  onImitate?: () => void;
}

const tabs = [
  { key: 'skeleton', label: '全书骨架' },
  { key: 'characterArcs', label: '人物弧线' },
  { key: 'suspense', label: '悬念线' },
  { key: 'plotLines', label: '剧情线' },
  { key: 'foreshadowing', label: '伏笔映射' },
  { key: 'pacing', label: '节奏曲线' },
  { key: 'relationships', label: '关系网络' },
  { key: 'worldRules', label: '世界观' },
] as const;

type TabKey = typeof tabs[number]['key'];

export const DeconstructionResult: React.FC<DeconstructionResultProps> = ({
  result,
  onExportJson,
  onSeedToPipeline,
  onImitate,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('skeleton');

  const renderTab = () => {
    if (!result.skeleton) {
      return <div className="text-vscode-text opacity-50 text-sm p-4">骨架数据尚未就绪</div>;
    }

    switch (activeTab) {
      case 'skeleton':
        return <SkeletonTab skeleton={result.skeleton} />;
      case 'characterArcs':
        return <CharacterArcTab crossAnalysis={result.crossAnalysis} />;
      case 'suspense':
        return <SuspenseTab skeleton={result.skeleton} crossAnalysis={result.crossAnalysis} />;
      case 'plotLines':
        return <PlotLineTab crossAnalysis={result.crossAnalysis} />;
      case 'foreshadowing':
        return <ForeshadowingTab crossAnalysis={result.crossAnalysis} />;
      case 'pacing':
        return <PacingTab crossAnalysis={result.crossAnalysis} />;
      case 'relationships':
        return <RelationshipTab crossAnalysis={result.crossAnalysis} />;
      case 'worldRules':
        return <WorldRulesTab crossAnalysis={result.crossAnalysis} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-sidebar">
        <h3 className="text-vscode-text font-medium text-sm">
          {result.skeleton?.meta.title || result.sourceFileName} - 拆书结果
        </h3>
        <div className="flex gap-2">
          {onExportJson && (
            <button
              onClick={onExportJson}
              className="text-xs px-2 py-1 bg-vscode-input border border-vscode-border text-vscode-text hover:opacity-80 rounded"
            >
              导出 JSON
            </button>
          )}
          {onSeedToPipeline && result.status === 'completed' && (
            <button
              onClick={onSeedToPipeline}
              className="text-xs px-2 py-1 bg-vscode-active text-white hover:opacity-90 rounded"
            >
              导入 Pipeline
            </button>
          )}
          {onImitate && result.status === 'completed' && (
            <button
              onClick={onImitate}
              className="text-xs px-2 py-1 bg-vscode-active text-white hover:opacity-90 rounded"
            >
              仿写
            </button>
          )}
        </div>
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
