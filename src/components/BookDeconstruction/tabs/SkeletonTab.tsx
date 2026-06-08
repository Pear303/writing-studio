import React from 'react';
import type { BookSkeleton, ChapterRole } from '../../../types/book-deconstruction';

interface SkeletonTabProps {
  skeleton: BookSkeleton;
}

const roleLabels: Record<ChapterRole, string> = {
  setup: '铺设',
  inciting_incident: '激励事件',
  rising_action: '发展',
  midpoint: '中点转折',
  crisis: '危机',
  climax: '高潮',
  resolution: '解决',
  falling_action: '收束',
  foreshadowing: '伏笔',
  revelation: '揭示',
  breathing: '喘息',
  transition: '过渡',
};

const chapterTypeLabels: Record<string, string> = {
  plot_advancing: '情节推进',
  character_deepening: '人物深化',
  atmosphere: '氛围营造',
  transition: '过渡衔接',
  climax: '高潮',
};

export const SkeletonTab: React.FC<SkeletonTabProps> = ({ skeleton }) => {
  return (
    <div className="space-y-6">
      {/* 元信息 */}
      <section>
        <h4 className="text-vscode-text font-medium text-sm mb-2">元信息</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
            <span className="text-vscode-text opacity-50">题材</span>
            <p className="text-vscode-text mt-0.5">{skeleton.meta.genre}</p>
          </div>
          <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
            <span className="text-vscode-text opacity-50">基调</span>
            <p className="text-vscode-text mt-0.5">{skeleton.meta.coreTone}</p>
          </div>
          <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
            <span className="text-vscode-text opacity-50">子题材</span>
            <p className="text-vscode-text mt-0.5">{skeleton.meta.subGenres.join('、') || '—'}</p>
          </div>
          <div className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2">
            <span className="text-vscode-text opacity-50">结构</span>
            <p className="text-vscode-text mt-0.5">{skeleton.structureType}</p>
          </div>
        </div>
        <div className="mt-2 bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs">
          <span className="text-vscode-text opacity-50">核心冲突</span>
          <p className="text-vscode-text mt-0.5">{skeleton.coreConflict}</p>
        </div>
        <div className="mt-2 bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs">
          <span className="text-vscode-text opacity-50">主题</span>
          <p className="text-vscode-text mt-0.5">{skeleton.themes.join('、')}</p>
        </div>
        {skeleton.structureDescription && (
          <div className="mt-2 bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs">
            <span className="text-vscode-text opacity-50">结构描述</span>
            <p className="text-vscode-text mt-0.5">{skeleton.structureDescription}</p>
          </div>
        )}
      </section>

      {/* 章节骨架表 */}
      <section>
        <h4 className="text-vscode-text font-medium text-sm mb-2">章节骨架</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-vscode-border">
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">#</th>
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">标题</th>
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">摘要</th>
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">角色</th>
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">类型</th>
                <th className="text-left text-vscode-text opacity-50 py-1.5 px-2 font-normal">核心事件</th>
              </tr>
            </thead>
            <tbody>
              {skeleton.chapterSkeletons.map((ch) => (
                <tr key={ch.index} className="border-b border-vscode-border/50 hover:bg-vscode-active/5">
                  <td className="py-1.5 px-2 text-vscode-text opacity-50">{ch.index + 1}</td>
                  <td className="py-1.5 px-2 text-vscode-text">{ch.title || '—'}</td>
                  <td className="py-1.5 px-2 text-vscode-text opacity-80 max-w-[200px] truncate">{ch.oneLineSummary}</td>
                  <td className="py-1.5 px-2">
                    <span className="inline-block px-1.5 py-0.5 bg-vscode-active/10 text-vscode-text rounded text-[10px]">
                      {roleLabels[ch.role] || ch.role}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-vscode-text opacity-60">
                    {chapterTypeLabels[ch.chapterType] || ch.chapterType}
                  </td>
                  <td className="py-1.5 px-2 text-vscode-text opacity-80 max-w-[200px] truncate">{ch.keyEvent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 悬念线 */}
      <section>
        <h4 className="text-vscode-text font-medium text-sm mb-2">悬念线</h4>
        <div className="space-y-2">
          {skeleton.suspenseLines.map((sl) => (
            <div
              key={sl.id}
              className="bg-vscode-sidebar border border-vscode-border rounded px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                  sl.type === 'main' ? 'bg-vscode-active/20 text-vscode-text' : 'bg-vscode-input text-vscode-text opacity-60'
                }`}>
                  {sl.type === 'main' ? '主线' : '支线'}
                </span>
                <span className="text-vscode-text opacity-50">{sl.hookType}</span>
                {sl.resolvedInChapter != null ? (
                  <span className="text-green-400 text-[10px]">已解决(第{sl.resolvedInChapter}章)</span>
                ) : (
                  <span className="text-yellow-400 text-[10px]">未解决</span>
                )}
              </div>
              <p className="text-vscode-text">{sl.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
