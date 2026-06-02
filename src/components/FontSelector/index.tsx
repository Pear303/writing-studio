import React, { useRef, useEffect, useState } from 'react';
import { ChevronDown, Upload, Trash2 } from 'lucide-react';
import type { FontInfo } from '../../types';

interface FontSelectorProps {
  fonts: FontInfo[];
  value: string;
  onChange: (family: string) => void;
  onImportFont?: (file: File) => Promise<unknown>;
  onDeleteFont?: (font: FontInfo) => void;
  applyScope: 'global' | 'editor';
  onScopeChange: (scope: 'global' | 'editor') => void;
}

export const FontSelector: React.FC<FontSelectorProps> = ({
  fonts,
  value,
  onChange,
  onImportFont,
  onDeleteFont,
  applyScope,
  onScopeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportFont) return;
    setIsLoading(true);
    setError('');
    try {
      await onImportFont(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const currentFont = fonts.find((f) => f.family === value);
  const chineseFonts = fonts.filter((f) => f.category === 'chinese');
  const englishFonts = fonts.filter((f) => f.category === 'english');
  const customFonts = fonts.filter((f) => f.isCustom);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`font-selector-btn flex items-center justify-between text-xs ${
          isOpen ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-vscode-active/10'
        }`}
      >
        <span className="font-selector-btn-text" style={{ fontFamily: value, fontSize: '12px' }}>
          {currentFont?.name || value || '选择字体'}
        </span>
        <ChevronDown size={12} className="shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border z-50 w-[180px] rounded-sm shadow-lg">
          <div className="py-1">
            {/* 字体应用范围 */}
            <div className="px-3 py-2 border-b border-vscode-border">
              <div className="text-xs text-vscode-text opacity-50 font-medium mb-1.5">
                应用范围
              </div>
              <label className="flex items-center gap-1.5 text-xs text-vscode-text cursor-pointer py-0.5">
                <input
                  type="radio"
                  name="fontApplyScope"
                  value="global"
                  checked={applyScope === 'global'}
                  onChange={() => onScopeChange('global')}
                  className="accent-[var(--color-vscode-active)]"
                />
                <span>全局 UI</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-vscode-text cursor-pointer py-0.5">
                <input
                  type="radio"
                  name="fontApplyScope"
                  value="editor"
                  checked={applyScope === 'editor'}
                  onChange={() => onScopeChange('editor')}
                  className="accent-[var(--color-vscode-active)]"
                />
                <span>仅写作编辑区</span>
              </label>
            </div>

            <div className="px-3 py-1 text-xs text-vscode-text opacity-50 font-medium">
              中文字体
            </div>
            {chineseFonts.map((font) => (
              <button
                key={font.family}
                onClick={() => {
                  onChange(font.family);
                  setIsOpen(false);
                }}
                className={`font-dropdown-item w-full text-left text-xs hover:bg-vscode-active/20 flex items-center justify-between text-vscode-text ${
                  value === font.family ? 'bg-vscode-active/30 text-white' : ''
                }`}
                style={{ fontFamily: font.family }}
              >
                <span>{font.name}</span>
                {value === font.family && <span className="text-vscode-active shrink-0">✓</span>}
              </button>
            ))}

            <div className="px-3 py-1 mt-1 text-xs text-vscode-text opacity-50 font-medium border-t border-vscode-border">
              英文字体
            </div>
            {englishFonts.map((font) => (
              <button
                key={font.family}
                onClick={() => {
                  onChange(font.family);
                  setIsOpen(false);
                }}
                className={`font-dropdown-item w-full text-left text-xs hover:bg-vscode-active/20 flex items-center justify-between text-vscode-text ${
                  value === font.family ? 'bg-vscode-active/30 text-white' : ''
                }`}
                style={{ fontFamily: font.family }}
              >
                <span>{font.name}</span>
                {value === font.family && <span className="text-vscode-active shrink-0">✓</span>}
              </button>
            ))}

            {customFonts.length > 0 && (
              <>
                <div className="px-3 py-1 mt-1 text-xs text-vscode-text opacity-50 font-medium border-t border-vscode-border">
                  自定义字体
                </div>
                {customFonts.map((font) => (
                  <div
                    key={font.family}
                    className={`font-dropdown-item w-full text-xs flex items-center justify-between text-vscode-text ${
                      value === font.family ? 'bg-vscode-active/30 text-white' : ''
                    }`}
                  >
                    <button
                      onClick={() => {
                        onChange(font.family);
                        setIsOpen(false);
                      }}
                      className="flex-1 text-left hover:text-white"
                      style={{ fontFamily: font.family }}
                    >
                      {font.name}
                    </button>
                    {onDeleteFont && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteFont(font);
                        }}
                        className="p-1 hover:text-red-400 text-vscode-text opacity-50 hover:opacity-100 shrink-0"
                        title="删除字体"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {onImportFont && (
              <>
                <div className="px-3 py-1 mt-1 text-xs text-vscode-text opacity-50 font-medium border-t border-vscode-border">
                  导入
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="font-dropdown-item w-full text-xs text-left text-vscode-text hover:bg-vscode-active/20 flex items-center gap-2 disabled:opacity-50"
                >
                  <Upload size={12} />
                  {isLoading ? '导入中...' : '上传字体文件'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {error && (
                  <div className="px-3 py-1 text-xs text-red-400">{error}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};