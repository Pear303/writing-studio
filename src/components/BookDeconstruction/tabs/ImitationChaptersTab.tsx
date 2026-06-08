import React from 'react';
import type { ImitationOutline } from '../../../types/imitation';

interface ImitationChaptersTabProps {
  outline: ImitationOutline;
}

const chapterTypeLabels: Record<string, string> = {
  plot_advancing: '推进剧情',
  character_deepening: '深化人物',
  atmosphere: '氛围营造',
  transition: '过渡',
  climax: '高潮',
};

const roleLabels: Record<string, string> = {
  setup: '铺垫',
  inciting_incident: '触发事件',
  rising_action: '上升行动',
  midpoint: '中点',
  crisis: '危机',
  climax: '高潮',
  resolution: '解决',
  falling_action: '下降行动',
  foreshadowing: '伏笔',
  revelation: '揭示',
  breathing: '喘息',
  transition: '过渡',
};

export const ImitationChaptersTab: React.FC<ImitationChaptersTabProps> = ({ outline }) => {
  if (outline.chapters.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无章节数据</div>;
  }

  return (
    <div className="space-y-3">
      {outline.chapters.map((ch) => (
        <div
          key={ch.index}
          className="bg-vscode-sidebar border border-vscode-border rounded p-3 space-y-1"
        >
          <div className="flex items-center justify-between">
            <h5 className="text-vscode-text text-sm font-medium">
              第{ch.index + 1}章：{ch.title}
            </h5>
            <div className="flex gap-1.5">
              <span className="text-[10px] px-1.5 py-0.5 bg-vscode-active/20 text-vscode-text rounded">
                {roleLabels[ch.role] || ch.role}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-vscode-active/10 text-vscode-text opacity-60 rounded">
                {chapterTypeLabels[ch.chapterType] || ch.chapterType}
              </span>
            </div>
          </div>
          <p className="text-vscode-text text-xs opacity-70">{ch.oneLineSummary}</p>
          <div className="flex items-center gap-3 text-[10px] text-vscode-text opacity-50">
            <span>关键人物：{ch.majorCharacters.join('、')}</span>
            <span>关键事件：{ch.keyEvent}</span>
            {ch.estimatedWordCount > 0 && <span>预估 {ch.estimatedWordCount} 字</span>}
          </div>
          <div className="text-[10px] text-vscode-text opacity-40">
            对应原书第{ch.correspondsToChapter + 1}章
          </div>
        </div>
      ))}
    </div>
  );
};
