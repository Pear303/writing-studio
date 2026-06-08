import React from 'react';
import type { ImitationOutline } from '../../../types/imitation';

interface ImitationSuspenseTabProps {
  outline: ImitationOutline;
}

export const ImitationSuspenseTab: React.FC<ImitationSuspenseTabProps> = ({ outline }) => {
  if (outline.suspenseLines.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无悬念线数据</div>;
  }

  const mainLines = outline.suspenseLines.filter(s => s.type === 'main');
  const subLines = outline.suspenseLines.filter(s => s.type === 'sub');

  const renderLine = (line: typeof outline.suspenseLines[0]) => {
    const isResolved = line.resolvedInChapter != null;
    return (
      <div
        key={line.id}
        className="bg-vscode-sidebar border border-vscode-border rounded p-3 space-y-1"
      >
        <div className="flex items-center justify-between">
          <h5 className="text-vscode-text text-sm font-medium">{line.description}</h5>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            isResolved
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {isResolved ? '已解决' : '未解决'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-vscode-text opacity-60">
          <span>第{line.raisedInChapter + 1}章提出</span>
          {isResolved && <span>第{line.resolvedInChapter! + 1}章解决</span>}
          <span>钩子类型：{line.hookType}</span>
        </div>
        {line.relatedEntities.length > 0 && (
          <div className="text-[10px] text-vscode-text opacity-50">
            相关实体：{line.relatedEntities.join('、')}
          </div>
        )}
        {line.correspondsToSuspenseId && (
          <div className="text-[10px] text-vscode-text opacity-40">
            对应原书悬念线
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {mainLines.length > 0 && (
        <section>
          <h4 className="text-vscode-text text-xs font-medium opacity-70 mb-2">主线悬念</h4>
          <div className="space-y-2">{mainLines.map(renderLine)}</div>
        </section>
      )}
      {subLines.length > 0 && (
        <section>
          <h4 className="text-vscode-text text-xs font-medium opacity-70 mb-2">副线悬念</h4>
          <div className="space-y-2">{subLines.map(renderLine)}</div>
        </section>
      )}
    </div>
  );
};
