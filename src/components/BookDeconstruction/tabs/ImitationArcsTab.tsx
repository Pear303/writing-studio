import React from 'react';
import type { ImitationOutline } from '../../../types/imitation';

interface ImitationArcsTabProps {
  outline: ImitationOutline;
}

const arcTypeLabels: Record<string, string> = {
  growth: '成长',
  fall: '堕落',
  flat: '平稳',
  transformation: '蜕变',
  corruption: '腐化',
};

export const ImitationArcsTab: React.FC<ImitationArcsTabProps> = ({ outline }) => {
  if (outline.characterArcs.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无角色弧线数据</div>;
  }

  return (
    <div className="space-y-3">
      {outline.characterArcs.map((arc, i) => (
        <div
          key={i}
          className="bg-vscode-sidebar border border-vscode-border rounded p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h5 className="text-vscode-text text-sm font-medium">{arc.characterName}</h5>
            <span className="text-[10px] px-1.5 py-0.5 bg-vscode-active/20 text-vscode-text rounded">
              {arcTypeLabels[arc.arcType] || arc.arcType}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-vscode-text opacity-70">
            <span className="bg-vscode-active/10 px-1.5 py-0.5 rounded">{arc.startState}</span>
            <span className="opacity-40">→</span>
            <span className="bg-vscode-active/10 px-1.5 py-0.5 rounded">{arc.endState}</span>
          </div>

          <p className="text-vscode-text text-xs opacity-60">{arc.stateEvolution}</p>

          {arc.keyTurningPoints.length > 0 && (
            <div className="space-y-1">
              <span className="text-vscode-text text-[10px] opacity-50">关键转折</span>
              {arc.keyTurningPoints.map((tp, j) => (
                <div key={j} className="flex items-start gap-2 text-xs text-vscode-text opacity-70">
                  <span className="text-vscode-active shrink-0">第{tp.chapterIndex + 1}章</span>
                  <span>{tp.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
