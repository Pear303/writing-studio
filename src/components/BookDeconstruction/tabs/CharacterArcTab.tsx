import React, { useState } from 'react';
import type { CrossChapterAnalysis, CharacterArc } from '../../../types/book-deconstruction';

interface CharacterArcTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

const arcTypeLabels: Record<string, string> = {
  growth: '成长',
  fall: '堕落',
  flat: '平坦',
  transformation: '蜕变',
  corruption: '腐化',
};

export const CharacterArcTab: React.FC<CharacterArcTabProps> = ({ crossAnalysis }) => {
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  if (!crossAnalysis || crossAnalysis.characterArcs.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无人物弧线数据</div>;
  }

  const selectedArc = crossAnalysis.characterArcs.find(
    (arc) => arc.characterName === selectedCharacter,
  ) || crossAnalysis.characterArcs[0];

  return (
    <div className="space-y-4">
      {/* 角色选择 */}
      <div className="flex flex-wrap gap-2">
        {crossAnalysis.characterArcs.map((arc) => (
          <button
            key={arc.characterName}
            onClick={() => setSelectedCharacter(arc.characterName)}
            className={`px-3 py-1 text-xs rounded border transition-colors ${
              selectedArc.characterName === arc.characterName
                ? 'bg-vscode-active/20 border-vscode-active text-vscode-text'
                : 'bg-vscode-sidebar border-vscode-border text-vscode-text opacity-60 hover:opacity-80'
            }`}
          >
            {arc.characterName}
            <span className="ml-1 text-[10px] opacity-50">
              ({arcTypeLabels[arc.arcType] || arc.arcType})
            </span>
          </button>
        ))}
      </div>

      {/* 弧线详情 */}
      {selectedArc && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
              <span className="text-vscode-text opacity-50">初始状态</span>
              <p className="text-vscode-text mt-0.5">{selectedArc.startState}</p>
            </div>
            <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
              <span className="text-vscode-text opacity-50">结束状态</span>
              <p className="text-vscode-text mt-0.5">{selectedArc.endState}</p>
            </div>
          </div>

          <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs">
            <span className="text-vscode-text opacity-50">状态演变</span>
            <p className="text-vscode-text mt-0.5">{selectedArc.stateEvolution}</p>
          </div>

          {/* 转折点时间线 */}
          {selectedArc.keyTurningPoints.length > 0 && (
            <div>
              <h5 className="text-vscode-text opacity-50 text-xs mb-2">关键转折点</h5>
              <div className="relative pl-4 border-l-2 border-vscode-border space-y-2">
                {selectedArc.keyTurningPoints.map((tp, i) => (
                  <div key={i} className="relative text-xs">
                    <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-vscode-active" />
                    <div className="text-vscode-text opacity-50">第{tp.chapterIndex + 1}章</div>
                    <div className="text-vscode-text">{tp.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
