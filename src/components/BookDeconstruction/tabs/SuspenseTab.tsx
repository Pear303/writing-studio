import React from 'react';
import type { BookSkeleton, CrossChapterAnalysis, SuspenseLine, ChapterRole } from '../../../types/book-deconstruction';

interface SuspenseTabProps {
  skeleton: BookSkeleton;
  crossAnalysis: CrossChapterAnalysis | null;
}

interface MergedSuspenseLine extends SuspenseLine {
  status: 'resolved' | 'open' | 'abandoned';
  resolutionQuality?: 'satisfying' | 'rushed' | 'unresolved' | 'deus_ex_machina';
  chaptersInvolved: number[];
}

const statusLabels: Record<string, string> = {
  resolved: '已解决',
  open: '未解决',
  abandoned: '已放弃',
};

const qualityLabels: Record<string, string> = {
  satisfying: '令人满意',
  rushed: '仓促',
  unresolved: '未解决',
  deus_ex_machina: '机械降神',
};

const statusColors: Record<string, string> = {
  resolved: 'text-green-400',
  open: 'text-yellow-400',
  abandoned: 'text-gray-400',
};

export const SuspenseTab: React.FC<SuspenseTabProps> = ({ skeleton, crossAnalysis }) => {
  const tracking = crossAnalysis?.suspenseTracking || [];

  // 合并骨架悬念线和跨章追踪
  const mergedLines: MergedSuspenseLine[] = skeleton.suspenseLines.map((sl) => {
    const tracked = tracking.find((t) => t.suspenseId === sl.id);
    return {
      ...sl,
      status: tracked?.status || (sl.resolvedInChapter != null ? 'resolved' as const : 'open' as const),
      resolutionQuality: tracked?.resolutionQuality,
      chaptersInvolved: tracked?.chaptersInvolved || [sl.raisedInChapter],
    };
  });

  // 添加跨章追踪中有但骨架中没有的
  for (const t of tracking) {
    if (!mergedLines.find((m) => m.id === t.suspenseId)) {
      mergedLines.push({
        id: t.suspenseId,
        description: t.description,
        type: t.type,
        hookType: 'mystery',
        raisedInChapter: t.chaptersInvolved[0] || 0,
        resolvedInChapter: t.status === 'resolved' ? t.chaptersInvolved[t.chaptersInvolved.length - 1] : undefined,
        relatedEntities: [],
        status: t.status,
        resolutionQuality: t.resolutionQuality,
        chaptersInvolved: t.chaptersInvolved,
      });
    }
  }

  return (
    <div className="space-y-3">
      {mergedLines.length === 0 ? (
        <div className="text-vscode-text opacity-50 text-sm">暂无悬念线数据</div>
      ) : (
        mergedLines.map((line) => (
          <div
            key={line.id}
            className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                line.type === 'main' ? 'bg-vscode-active/20 text-vscode-text' : 'bg-vscode-input text-vscode-text opacity-60'
              }`}>
                {line.type === 'main' ? '主线' : '支线'}
              </span>
              <span className={`text-[10px] ${statusColors[line.status] || 'text-vscode-text'}`}>
                {statusLabels[line.status] || line.status}
              </span>
              {line.resolutionQuality && (
                <span className="text-vscode-text opacity-40 text-[10px]">
                  ({qualityLabels[line.resolutionQuality] || line.resolutionQuality})
                </span>
              )}
            </div>
            <p className="text-vscode-text mb-1">{line.description}</p>
            {line.chaptersInvolved && (
              <div className="text-vscode-text opacity-40 text-[10px]">
                涉及章节：{line.chaptersInvolved.map((c: number) => c + 1).join('、')}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
