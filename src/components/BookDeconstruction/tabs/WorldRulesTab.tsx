import React from 'react';
import type { CrossChapterAnalysis } from '../../../types/book-deconstruction';

interface WorldRulesTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

export const WorldRulesTab: React.FC<WorldRulesTabProps> = ({ crossAnalysis }) => {
  if (!crossAnalysis || crossAnalysis.worldRules.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无世界观规则数据</div>;
  }

  return (
    <div className="space-y-2">
      {crossAnalysis.worldRules.map((rule, i) => (
        <div
          key={i}
          className="flex items-start gap-3 bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs"
        >
          <span className="text-vscode-active text-[10px] mt-0.5 shrink-0">#{i + 1}</span>
          <p className="text-vscode-text">{rule}</p>
        </div>
      ))}
    </div>
  );
};
