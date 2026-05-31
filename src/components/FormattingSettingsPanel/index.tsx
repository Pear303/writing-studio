import React, { useState, useEffect } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import type { FormattingSettings } from '../../types';

interface FormattingSettingsPanelProps {
  settings: FormattingSettings;
  onSave: (settings: FormattingSettings) => void;
  onClose: () => void;
  onFormat?: (settings: FormattingSettings) => void;
}

const defaultSettings: FormattingSettings = {
  paragraphSpacing: '1em',
  firstLineIndent: '2char',
  clearExtraBlankLines: true,
  clearExtraSpaces: true,
  convertPunctuation: false,
};

export const FormattingSettingsPanel = ({
  settings,
  onSave,
  onClose,
  onFormat,
}: FormattingSettingsPanelProps) => {
  const [localSettings, setLocalSettings] = useState<FormattingSettings>(settings);

  // 从 localStorage 加载设置
  useEffect(() => {
    const saved = localStorage.getItem('formattingSettings');
    if (saved) {
      try {
        setLocalSettings(JSON.parse(saved));
      } catch (e) {
        console.error('加载排版设置失败:', e);
      }
    }
  }, []);

  // 保存设置
  const handleSave = () => {
    localStorage.setItem('formattingSettings', JSON.stringify(localSettings));
    onSave(localSettings);
    onClose();
  };

  // 重置为默认值
  const handleReset = () => {
    setLocalSettings(defaultSettings);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content w-[500px] max-h-[80vh] p-6">
        {/* 标题栏 */}
        <div className="flex items-center justify-between pb-4 border-b border-vscode-border">
          <h2 className="text-lg font-semibold text-vscode-text m-0">自定义排版设置</h2>
          <button
            onClick={onClose}
            className="icon-btn"
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="py-6 space-y-6">
          {/* 段间距 */}
          <div>
            <label className="block text-sm font-medium text-vscode-text mb-2">
              段间距
            </label>
            <div className="flex items-center space-x-2">
              <select
                value={localSettings.paragraphSpacing === '0px' || localSettings.paragraphSpacing === '0.5em' || localSettings.paragraphSpacing === '1em' ? localSettings.paragraphSpacing : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setLocalSettings({
                      ...localSettings,
                      paragraphSpacing: e.target.value as FormattingSettings['paragraphSpacing'],
                    });
                  }
                }}
                className="select-field flex-1"
              >
                <option value="0px">0px（不空行）</option>
                <option value="0.5em">0.5em（半行）</option>
                <option value="1em">1em（一行）</option>
                <option value="custom">自定义...</option>
              </select>
              {localSettings.paragraphSpacing !== '0px' && 
               localSettings.paragraphSpacing !== '0.5em' && 
               localSettings.paragraphSpacing !== '1em' && (
                <input
                  type="text"
                  value={localSettings.paragraphSpacing}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      paragraphSpacing: e.target.value,
                    })
                  }
                  placeholder="如: 1.5em"
                  className="input-field w-24"
                />
              )}
            </div>
            <p className="text-xs text-vscode-text opacity-60 mt-1">
              提示：可输入任意值，如 1.5em、20px 等
            </p>
          </div>

          {/* 首行缩进 */}
          <div>
            <label className="block text-sm font-medium text-vscode-text mb-2">
              首行缩进
            </label>
            <div className="flex items-center space-x-2">
              <select
                value={localSettings.firstLineIndent === '0' || localSettings.firstLineIndent === '2char' || localSettings.firstLineIndent === '2em' ? localSettings.firstLineIndent : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setLocalSettings({
                      ...localSettings,
                      firstLineIndent: e.target.value as FormattingSettings['firstLineIndent'],
                    });
                  }
                }}
                className="select-field flex-1"
              >
                <option value="0">无缩进</option>
                <option value="2char">2字符</option>
                <option value="2em">2em</option>
                <option value="custom">自定义...</option>
              </select>
              {localSettings.firstLineIndent !== '0' && 
               localSettings.firstLineIndent !== '2char' && 
               localSettings.firstLineIndent !== '2em' && (
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    value={parseInt(localSettings.firstLineIndent) || 2}
                    onChange={(e) => {
                      const value = e.target.value;
                      setLocalSettings({
                        ...localSettings,
                        firstLineIndent: `${value}char`,
                      });
                    }}
                    min="0"
                    max="10"
                    className="input-field w-16"
                  />
                  <span className="text-sm text-vscode-text">字符</span>
                </div>
              )}
            </div>
            <p className="text-xs text-vscode-text opacity-60 mt-1">
              提示：选择"自定义"后可输入任意字符数
            </p>
          </div>

          {/* 清理选项 */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-vscode-text">清理选项</label>
            
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.clearExtraBlankLines}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    clearExtraBlankLines: e.target.checked,
                  })
                }
                className="mr-2"
              />
              <span className="text-sm text-vscode-text">清除多余空行（连续空行合并为一个）</span>
            </label>

            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.clearExtraSpaces}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    clearExtraSpaces: e.target.checked,
                  })
                }
                className="mr-2"
              />
              <span className="text-sm text-vscode-text">清除多余空格（连续空格合并为一个）</span>
            </label>

            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.convertPunctuation}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    convertPunctuation: e.target.checked,
                  })
                }
                className="mr-2"
              />
              <span className="text-sm text-vscode-text">全角标点转半角</span>
            </label>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end space-x-2 pt-4 border-t border-vscode-border">
          <button
            onClick={handleReset}
            className="btn-secondary flex items-center space-x-2"
          >
            <RotateCcw size={16} />
            <span>重置默认</span>
          </button>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex items-center space-x-2"
          >
            <Save size={16} />
            <span>保存设置</span>
          </button>
        </div>
      </div>
    </div>
  );
};
