import React from 'react';
import type { BookDeconstructionResult, DeconstructionPhase } from '../../types/book-deconstruction';

interface DeconstructionProgressProps {
  result: BookDeconstructionResult;
  onCancel?: () => void;
  onRetry?: () => void;
}

const phaseLabels: Record<DeconstructionPhase, string> = {
  1: '全书骨架提取',
  2: '逐章细拆',
  3: '跨章关联分析',
};

const statusIcons: Record<string, string> = {
  skeleton: '⏳',
  extracting: '⏳',
  analyzing: '⏳',
  completed: '✅',
  failed: '❌',
};

export const DeconstructionProgress: React.FC<DeconstructionProgressProps> = ({
  result,
  onCancel,
  onRetry,
}) => {
  const getPhaseProgress = (phase: DeconstructionPhase): number => {
    if (result.currentPhase > phase) return 1;
    if (result.currentPhase < phase) return 0;

    if (phase === 1) return result.skeleton ? 1 : 0;
    if (phase === 2) {
      return result.totalChapters > 0
        ? result.currentChapterIndex / result.totalChapters
        : 0;
    }
    if (phase === 3) return result.crossAnalysis ? 1 : 0;
    return 0;
  };

  const isRunning = ['skeleton', 'extracting', 'analyzing'].includes(result.status);

  return (
    <div className="bg-vscode-sidebar border border-vscode-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-vscode-text font-medium text-sm">
          拆书分析：{result.sourceFileName}
        </h3>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="text-xs px-2 py-1 bg-vscode-input border border-vscode-border text-vscode-text hover:opacity-80 rounded"
          >
            取消
          </button>
        )}
      </div>

      <div className="space-y-3">
        {([1, 2, 3] as DeconstructionPhase[]).map((phase) => {
          const progress = getPhaseProgress(phase);
          const isCurrentPhase = result.currentPhase === phase;
          const isDone = result.currentPhase > phase || (result.currentPhase === phase && progress === 1);
          const icon = isDone ? '✅' : isCurrentPhase ? '⏳' : '...';

          return (
            <div key={phase}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs">{icon}</span>
                <span className={`text-xs ${isCurrentPhase ? 'text-vscode-text font-medium' : 'text-vscode-text opacity-60'}`}>
                  Phase {phase}：{phaseLabels[phase]}
                </span>
                {phase === 2 && isCurrentPhase && (
                  <span className="text-vscode-text opacity-50 text-xs">
                    ({result.currentChapterIndex}/{result.totalChapters})
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-vscode-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-vscode-active rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {result.status === 'failed' && result.error && (
        <div className="mt-3">
          <div className="text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">
            错误：{result.error}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-xs px-3 py-1.5 bg-vscode-active text-white hover:opacity-90 rounded"
            >
              重试
            </button>
          )}
        </div>
      )}

      {result.status === 'completed' && (
        <div className="mt-3 text-xs text-vscode-text opacity-60">
          分析完成，共 {result.totalChapters} 章
        </div>
      )}
    </div>
  );
};
