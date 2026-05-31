import React from 'react';
import { Wand2, Settings } from 'lucide-react';
import type { FormattingSettings } from '../../types';
import { clearExtraBlankLines, clearExtraSpaces, convertFullWidthToHalfWidth } from '../../utils/helpers';

interface FormattingToolbarProps {
  onFormat: (settings: FormattingSettings) => void;
  onOpenSettings: () => void;
}

export const FormattingToolbar = ({
  onFormat,
  onOpenSettings,
}: FormattingToolbarProps) => {
  // 加载保存的设置
  const loadSettings = (): FormattingSettings => {
    const saved = localStorage.getItem('formattingSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('加载排版设置失败:', e);
      }
    }
    return {
      paragraphSpacing: '1em',
      firstLineIndent: '2char',
      clearExtraBlankLines: true,
      clearExtraSpaces: true,
      convertPunctuation: false,
    };
  };

  // 一键排版
  const handleFormat = () => {
    const settings = loadSettings();
    onFormat(settings);
  };

  return (
    <div className="flex items-center space-x-2 px-2 py-1 border-b border-vscode-border bg-vscode-bg">
      <button
        onClick={handleFormat}
        className="px-3 py-1.5 text-sm text-vscode-text hover:bg-gray-700 rounded flex items-center space-x-2 transition-colors"
        title="一键排版（使用保存的排版规则）"
      >
        <Wand2 size={16} />
        <span>一键排版</span>
      </button>

      <button
        onClick={onOpenSettings}
        className="px-3 py-1.5 text-sm text-vscode-text hover:bg-gray-700 rounded flex items-center space-x-2 transition-colors"
        title="自定义排版设置"
      >
        <Settings size={16} />
        <span>排版设置</span>
      </button>
    </div>
  );
};
