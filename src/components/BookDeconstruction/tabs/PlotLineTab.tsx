import React from 'react';
import type { CrossChapterAnalysis } from '../../../types/book-deconstruction';

interface PlotLineTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

const typeLabels: Record<string, string> = {
  main: '主线',
  sub_a: '支线A',
  sub_b: '支线B',
  background: '背景线',
};

export const PlotLineTab: React.FC<PlotLineTabProps> = ({ crossAnalysis }) => {
  if (!crossAnalysis || crossAnalysis.plotLines.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无剧情线数据</div>;
  }

  return (
    <div className="space-y-3">
      {crossAnalysis.plotLines.map((pl, i) => (
        <div
          key={i}
          className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
              pl.type === 'main' ? 'bg-vscode-active/20 text-vscode-text' : 'bg-vscode-input text-vscode-text opacity-60'
            }`}>
              {typeLabels[pl.type] || pl.type}
            </span>
            <span className="text-vscode-text font-medium">{pl.name}</span>
          </div>
          <p className="text-vscode-text opacity-80 mb-1">{pl.description}</p>
          <div className="flex items-center gap-3 text-vscode-text opacity-40 text-[10px]">
            <span>涉及章节：{pl.chapters.map(c => c + 1).join('、')}</span>
            {pl.interweaveWith.length > 0 && (
              <span>交织：{pl.interweaveWith.join('、')}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
