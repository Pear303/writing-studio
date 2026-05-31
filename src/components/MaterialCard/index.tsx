import React from 'react';
import { User, MapPin, Package, Brain, FileText, BookOpen, Palette } from 'lucide-react';
import type { Material, MaterialType } from '../../types';

interface MaterialCardProps {
  material: Material;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export const MaterialCard = ({ material, onClick, onContextMenu }: MaterialCardProps) => {
  const getTypeIcon = () => {
    switch (material.type) {
      case 'character':
        return <User size={24} style={{ color: '#60a5fa' }} />;
      case 'location':
        return <MapPin size={24} style={{ color: '#4ade80' }} />;
      case 'item':
        return <Package size={24} style={{ color: '#facc15' }} />;
      case 'plot':
        return <Brain size={24} style={{ color: '#c084fc' }} />;
      case 'writing_rule':
        return <BookOpen size={24} style={{ color: '#38bdf8' }} />;
      case 'style_rule':
        return <Palette size={24} style={{ color: '#fb923c' }} />;
      case 'other':
      default:
        return <FileText size={24} style={{ color: '#f97316' }} />;
    }
  };

  const getTypeText = () => {
    switch (material.type) {
      case 'character':
        return '人物';
      case 'location':
        return '地点';
      case 'item':
        return '物品';
      case 'plot':
        return '情节';
      case 'writing_rule':
        return '写作规则';
      case 'style_rule':
        return '文风规则';
      case 'other':
        return '其他';
      default:
        return '未知';
    }
  };

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="bg-vscode-sidebar border border-vscode-border p-3 cursor-pointer hover:border-vscode-active transition-all duration-200 group"
      style={{ borderRadius: '2px' }}
    >
      <div className="flex items-center justify-between mb-2">
        {getTypeIcon()}
        <span className="text-xs" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>{getTypeText()}</span>
      </div>

      <h3
        className="text-vscode-text font-semibold text-sm mb-1 truncate"
        style={{ color: 'var(--color-vscode-text)' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-vscode-active)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-vscode-text)'; }}
      >
        {material.name}
      </h3>

      <p className="text-xs line-clamp-2 h-8" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>
        {material.description || '暂无描述'}
      </p>
    </div>
  );
};
