import React from 'react';
import type { CrossChapterAnalysis } from '../../../types/book-deconstruction';

interface ForeshadowingTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

const qualityLabels: Record<string, { label: string; color: string }> = {
  tight: { label: '紧密', color: 'text-green-400' },
  good: { label: '良好', color: 'text-blue-400' },
  loose: { label: '松散', color: 'text-yellow-400' },
  orphan: { label: '未回收', color: 'text-red-400' },
};

export const ForeshadowingTab: React.FC<ForeshadowingTabProps> = ({ crossAnalysis }) => {
  if (!crossAnalysis || crossAnalysis.foreshadowingMap.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无伏笔映射数据</div>;
  }

  return (
    <div className="space-y-2">
      {crossAnalysis.foreshadowingMap.map((fp, i) => {
        const quality = qualityLabels[fp.quality] || { label: fp.quality, color: 'text-vscode-text' };

        return (
          <div
            key={i}
            className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] ${quality.color}`}>
                {quality.label}
              </span>
              {fp.distance > 0 && (
                <span className="text-vscode-text opacity-30 text-[10px]">
                  间隔 {fp.distance} 章
                </span>
              )}
            </div>

            <div className="flex items-start gap-3">
              {/* 种下 */}
              <div className="flex-1">
                <div className="text-vscode-text opacity-50 text-[10px] mb-0.5">
                  第{fp.planted.chapterIndex + 1}章 - 种下
                </div>
                <p className="text-vscode-text">{fp.planted.description}</p>
              </div>

              {/* 箭头 */}
              <div className="text-vscode-text opacity-30 self-center mt-3">→</div>

              {/* 回收 */}
              <div className="flex-1">
                {fp.harvested ? (
                  <>
                    <div className="text-vscode-text opacity-50 text-[10px] mb-0.5">
                      第{fp.harvested.chapterIndex + 1}章 - 回收
                    </div>
                    <p className="text-vscode-text">{fp.harvested.description}</p>
                  </>
                ) : (
                  <div className="text-red-400/60 italic">未回收</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
