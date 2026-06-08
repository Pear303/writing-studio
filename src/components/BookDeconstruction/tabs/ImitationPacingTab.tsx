import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import type { ImitationOutline } from '../../../types/imitation';

interface ImitationPacingTabProps {
  outline: ImitationOutline;
}

const paceColors: Record<string, string> = {
  slow: '#60a5fa',
  moderate: '#34d399',
  fast: '#fbbf24',
  explosive: '#f87171',
};

export const ImitationPacingTab: React.FC<ImitationPacingTabProps> = ({ outline }) => {
  if (outline.pacingCurve.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无节奏数据</div>;
  }

  const data = outline.pacingCurve.map((p) => ({
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

      {/* 节奏详情表 */}
      <div className="bg-vscode-sidebar border border-vscode-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-vscode-border">
              <th className="text-left p-2 text-vscode-text opacity-60 font-medium">章节</th>
              <th className="text-left p-2 text-vscode-text opacity-60 font-medium">紧张度</th>
              <th className="text-left p-2 text-vscode-text opacity-60 font-medium">节奏</th>
              <th className="text-left p-2 text-vscode-text opacity-60 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {outline.pacingCurve.map((p) => (
              <tr key={p.chapterIndex} className="border-b border-vscode-border last:border-0">
                <td className="p-2 text-vscode-text">第{p.chapterIndex + 1}章</td>
                <td className="p-2 text-vscode-text">{p.tension}/10</td>
                <td className="p-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px]"
                    style={{ backgroundColor: paceColors[p.pace] + '30', color: paceColors[p.pace] }}
                  >
                    {p.pace}
                  </span>
                </td>
                <td className="p-2 text-vscode-text opacity-70">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
