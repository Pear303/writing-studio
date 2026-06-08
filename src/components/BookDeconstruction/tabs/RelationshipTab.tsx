import React, { useMemo } from 'react';
import type { CrossChapterAnalysis, RelationshipNode } from '../../../types/book-deconstruction';

interface RelationshipTabProps {
  crossAnalysis: CrossChapterAnalysis | null;
}

const typeLabels: Record<string, string> = {
  ally: '盟友',
  rival: '对手',
  mentor: '导师',
  lover: '恋人',
  family: '家人',
  enemy: '敌人',
  ambiguous: '暧昧',
};

const typeColors: Record<string, string> = {
  ally: '#34d399',
  rival: '#f87171',
  mentor: '#60a5fa',
  lover: '#f472b6',
  family: '#a78bfa',
  enemy: '#ef4444',
  ambiguous: '#fbbf24',
};

interface NodePosition {
  name: string;
  x: number;
  y: number;
}

export const RelationshipTab: React.FC<RelationshipTabProps> = ({ crossAnalysis }) => {
  const { nodes, edges, svgWidth, svgHeight } = useMemo(() => {
    if (!crossAnalysis || crossAnalysis.relationshipNetwork.length === 0) {
      return { nodes: [], edges: [], svgWidth: 600, svgHeight: 400 };
    }

    // 收集所有角色
    const characterSet = new Set<string>();
    for (const rel of crossAnalysis.relationshipNetwork) {
      characterSet.add(rel.from);
      characterSet.add(rel.to);
    }
    const characters = [...characterSet];

    // 圆形布局
    const centerX = 300;
    const centerY = 200;
    const radius = Math.min(150, characters.length * 25);

    const nodePositions: NodePosition[] = characters.map((name, i) => {
      const angle = (2 * Math.PI * i) / characters.length - Math.PI / 2;
      return {
        name,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    const positionMap = new Map(nodePositions.map((n) => [n.name, n]));

    const edgesData = crossAnalysis.relationshipNetwork.map((rel) => ({
      from: positionMap.get(rel.from)!,
      to: positionMap.get(rel.to)!,
      type: rel.type,
      evolution: rel.evolution,
    }));

    return {
      nodes: nodePositions,
      edges: edgesData,
      svgWidth: 600,
      svgHeight: 400,
    };
  }, [crossAnalysis]);

  if (!crossAnalysis || crossAnalysis.relationshipNetwork.length === 0) {
    return <div className="text-vscode-text opacity-50 text-sm">暂无关系网络数据</div>;
  }

  return (
    <div className="space-y-4">
      {/* 网络图 */}
      <div className="bg-vscode-sidebar border border-vscode-border rounded p-4 flex justify-center">
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          {/* 边 */}
          {edges.map((edge, i) => {
            const midX = (edge.from.x + edge.to.x) / 2;
            const midY = (edge.from.y + edge.to.y) / 2;
            const dx = edge.to.x - edge.from.x;
            const dy = edge.to.y - edge.from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const offset = 10;
            const nx = -dy / len * offset;
            const ny = dx / len * offset;

            return (
              <g key={i}>
                <line
                  x1={edge.from.x}
                  y1={edge.from.y}
                  x2={edge.to.x}
                  y2={edge.to.y}
                  stroke={typeColors[edge.type] || 'var(--color-vscode-border)'}
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                />
                <text
                  x={midX + nx}
                  y={midY + ny}
                  textAnchor="middle"
                  fill={typeColors[edge.type] || 'var(--color-vscode-text)'}
                  fontSize={9}
                  opacity={0.7}
                >
                  {typeLabels[edge.type] || edge.type}
                </text>
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map((node) => (
            <g key={node.name}>
              <circle
                cx={node.x}
                cy={node.y}
                r={18}
                fill="var(--color-vscode-active)"
                fillOpacity={0.2}
                stroke="var(--color-vscode-active)"
                strokeWidth={1.5}
              />
              <text
                x={node.x}
                y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-vscode-text)"
                fontSize={10}
                fontWeight={500}
              >
                {node.name.length > 3 ? node.name.slice(0, 3) + '..' : node.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        {Object.entries(typeLabels).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-2.5 h-0.5 rounded" style={{ backgroundColor: typeColors[type] }} />
            <span className="text-vscode-text opacity-60">{label}</span>
          </div>
        ))}
      </div>

      {/* 关系列表 */}
      <div className="space-y-1">
        {crossAnalysis.relationshipNetwork.map((rel, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs bg-vscode-sidebar border border-vscode-border rounded px-3 py-1.5"
          >
            <span className="text-vscode-text">{rel.from}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
              backgroundColor: typeColors[rel.type] + '20',
              color: typeColors[rel.type],
            }}>
              {typeLabels[rel.type] || rel.type}
            </span>
            <span className="text-vscode-text">{rel.to}</span>
            {rel.evolution.length > 0 && (
              <span className="text-vscode-text opacity-40 text-[10px] ml-auto">
                {rel.evolution[rel.evolution.length - 1].change}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
