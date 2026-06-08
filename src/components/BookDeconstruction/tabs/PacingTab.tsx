import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { CrossChapterAnalysis } from '../../../types/book-deconstruction';

interface PacingTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

const paceColors: Record<string, string> = {
  slow: '#60a5fa',
  moderate: '#34d399',
  fast: '#fbbf24',
  explosive: '#f87171',
};

export const PacingTab: React.FC<PacingTabProps> = ({ crossAnalysis }) => {
  if (!crossAnalysis || crossAnalysis.pacingCurve.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无节奏数据</div>;
  }

  const data = crossAnalysis.pacingCurve.map((p) => ({
    chapter: `${p.chapterIndex + 1}`,
    tension: p.tension,
    pace: p.pace,
    note: p.note,
  }));

  return (
    <div className="space-y-4">
      {/* 节奏曲线图 */}
      <div className="bg-vscode-sidebar border border-vscode-border rounded p-4">
        <h5 className="text-vscode-text text-xs font-medium mb-3">紧张度曲线</h5>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <XAxis
              dataKey="chapter"
              tick={{ fontSize: 10, fill: 'var(--color-vscode-text)' }}
              axisLine={{ stroke: 'var(--color-vscode-border)' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fontSize: 10, fill: 'var(--color-vscode-text)' }}
              axisLine={{ stroke: 'var(--color-vscode-border)' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-vscode-sidebar)',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'var(--color-vscode-text)',
              }}
              formatter={(value: any) => [`${value}/10`, '紧张度']}
              labelFormatter={(label: any) => `第${label}章`}
            />
            <Bar dataKey="tension" radius={[3, 3, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={paceColors[entry.pace] || 'var(--color-vscode-active)'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 图例 */}
      <div className="flex gap-4 text-[10px]">
        {Object.entries(paceColors).map(([pace, color]) => (
          <div key={pace} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-vscode-text opacity-60">
              {pace === 'slow' ? '舒缓' : pace === 'moderate' ? '适中' : pace === 'fast' ? '紧张' : '爆发'}
            </span>
          </div>
        ))}
      </div>

      {/* 章节详情列表 */}
      <div className="space-y-1">
        {crossAnalysis.pacingCurve.map((p) => (
          <div
            key={p.chapterIndex}
            className="flex items-center gap-3 text-xs bg-vscode-sidebar border border-vscode-border rounded px-3 py-1.5"
          >
            <span className="text-vscode-text opacity-50 w-12">第{p.chapterIndex + 1}章</span>
            <div className="w-16 h-1.5 bg-vscode-bg rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${p.tension * 10}%`,
                  backgroundColor: paceColors[p.pace] || 'var(--color-vscode-active)',
                }}
              />
            </div>
            <span className="text-vscode-text opacity-50 w-6 text-right">{p.tension}</span>
            <span className="text-vscode-text opacity-70 flex-1">{p.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
