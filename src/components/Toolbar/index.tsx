import React, { useState, useEffect, useRef } from 'react';
import { Save, Undo, Redo, Search, Download, Wand2, Settings, Bold, Italic, Underline, Strikethrough, Quote, Type, X, ChevronDown, AlignJustify, MoveVertical, Maximize2, Minimize2 } from 'lucide-react';
import type { FormattingSettings, Book, Chapter } from '../../types';
import type { Editor } from '@tiptap/react';
import { FontSelector } from '../FontSelector';
import { useFontManager } from '../../hooks/useFontManager';

interface ToolbarProps {
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFindReplace: () => void;
  onExport?: (format: 'txt' | 'md' | 'html') => void;
  onFormat?: (settings: FormattingSettings) => void;
  onOpenFormattingSettings?: () => void;
  wordCount?: number;
  editor?: Editor | null;
  theme?: 'dark' | 'light' | 'eye-care';
  currentBook?: Book | null;
  currentChapter?: Chapter | null;
  lineHeight?: string;
  paragraphSpacingValue?: string;
  onLineHeightChange?: (value: string) => void;
  onParagraphSpacingChange?: (value: string) => void;
}

export const Toolbar = ({
  onSave,
  onUndo,
  onRedo,
  onFindReplace,
  onExport,
  onFormat,
  onOpenFormattingSettings,
  wordCount = 0,
  editor,
  theme = 'dark',
  currentBook,
  currentChapter,
  lineHeight: propLineHeight,
  paragraphSpacingValue: propParagraphSpacing,
  onLineHeightChange,
  onParagraphSpacingChange,
}: ToolbarProps) => {
  const [fontSize, setFontSize] = useState('16');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const [showLineHeightDropdown, setShowLineHeightDropdown] = useState(false);
  const [showParaSpacingDropdown, setShowParaSpacingDropdown] = useState(false);
  const fontSizeDropdownRef = useRef<HTMLDivElement>(null);
  const lineHeightDropdownRef = useRef<HTMLDivElement>(null);
  const paraSpacingDropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const showExportMenuRef = useRef(showExportMenu);
  showExportMenuRef.current = showExportMenu;
  const [, forceUpdate] = useState(0);

  // 行间距和段间距本地状态
  const [localLineHeight, setLocalLineHeight] = useState(propLineHeight || '1.8');
  const [localParagraphSpacing, setLocalParagraphSpacing] = useState(propParagraphSpacing || '0px');

  // 同步外部 props 到本地状态
  useEffect(() => {
    if (propLineHeight !== undefined) setLocalLineHeight(propLineHeight);
  }, [propLineHeight]);
  useEffect(() => {
    if (propParagraphSpacing !== undefined) setLocalParagraphSpacing(propParagraphSpacing);
  }, [propParagraphSpacing]);

  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // 如果 Fullscreen API 不可用（如某些 Tauri 配置），静默失败
      });
    } else {
      document.exitFullscreen();
    }
  };

  // F11 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const {
    settings,
    updateSettings,
    getChineseFonts,
    getEnglishFonts,
    addCustomFont,
    removeCustomFont,
  } = useFontManager();
  const chineseFonts = getChineseFonts();
  const englishFonts = getEnglishFonts();
   
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showExportMenuRef.current && exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
      if (showFontSizeDropdown && fontSizeDropdownRef.current && !fontSizeDropdownRef.current.contains(e.target as Node)) {
        setShowFontSizeDropdown(false);
      }
      if (showLineHeightDropdown && lineHeightDropdownRef.current && !lineHeightDropdownRef.current.contains(e.target as Node)) {
        setShowLineHeightDropdown(false);
      }
      if (showParaSpacingDropdown && paraSpacingDropdownRef.current && !paraSpacingDropdownRef.current.contains(e.target as Node)) {
        setShowParaSpacingDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showFontSizeDropdown, showLineHeightDropdown, showParaSpacingDropdown]);

  useEffect(() => {
    if (!editor) return;

    const updateHandler = () => {
      forceUpdate(n => n + 1);
    };

    editor.on('transaction', updateHandler);
    
    return () => {
      editor.off('transaction', updateHandler);
    };
  }, [editor]);

  const loadFormattingSettings = (): FormattingSettings => {
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('bookId');
    console.log('[Toolbar] bookId from URL:', bookId);
    
    if (bookId) {
      const bookSettings = localStorage.getItem(`formattingSettings_${bookId}`);
      console.log('[Toolbar] book-specific settings:', bookSettings);
      if (bookSettings) {
        try {
          return JSON.parse(bookSettings);
        } catch (e) {
          console.error('加载排版设置失败:', e);
        }
      }
    }
    
    const globalSaved = localStorage.getItem('formattingSettings');
    console.log('[Toolbar] global settings:', globalSaved);
    if (globalSaved) {
      try {
        return JSON.parse(globalSaved);
      } catch (e) {
        console.error('加载排版设置失败:', e);
      }
    }
    console.log('[Toolbar] 使用默认设置');
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
    if (onFormat) {
      const settings = loadFormattingSettings();
      onFormat(settings);
    }
  };

  // 处理字体大小变化
  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    if (editor) {
      editor.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run();
    }
  };

  // 处理行间距变化
  const handleLineHeightChange = (value: string) => {
    setLocalLineHeight(value);
    onLineHeightChange?.(value);
  };

  // 处理段间距变化
  const handleParagraphSpacingChange = (value: string) => {
    setLocalParagraphSpacing(value);
    onParagraphSpacingChange?.(value);
  };

  const lineHeightOptions = ['1.0', '1.25', '1.5', '1.75', '2.0', '2.5', '3.0'];
  const paragraphSpacingOptions = ['0px', '0.25em', '0.5em', '0.75em', '1em', '1.5em', '2em'];

  return (
    <div className="h-toolbar bg-vscode-bg border-b border-vscode-border flex items-center px-4 relative">
      <div className="flex items-center space-x-1">
        <button
          onClick={onSave}
          className={`toolbar-btn ${!currentChapter ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={!currentChapter ? "请先选择或创建一个章节" : "保存 (Ctrl+S)"}
          disabled={!currentChapter}
        >
          <Save size={16} />
          <span className="toolbar-btn-text">保存</span>
        </button>
        {onExport && (
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="toolbar-btn"
              title="导出当前书籍"
            >
              <Download size={16} />
              <span className="toolbar-btn-text">导出</span>
            </button>
            
            {showExportMenu && (
              <div 
                ref={exportMenuRef}
                className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border py-1 min-w-[120px] z-50 rounded-sm shadow-lg"
              >
                {(['txt', 'md', 'html'] as const).map((format) => (
                  <button
                    key={format}
                    onClick={() => {
                      onExport(format);
                      setShowExportMenu(false);
                    }}
                    className="w-full px-3 py-2 text-sm text-left text-vscode-text hover:bg-vscode-active/20 transition-colors capitalize"
                  >
                    导出为 {format === 'md' ? 'Markdown' : format.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onFormat && onOpenFormattingSettings && (
          <>
            <div className="w-px h-5 bg-vscode-border mx-1"></div>
            <button
              onClick={handleFormat}
              className="toolbar-btn"
              title="一键排版（使用保存的排版规则）"
            >
              <Wand2 size={16} />
              <span className="toolbar-btn-text">一键排版</span>
            </button>
            <button
              onClick={onOpenFormattingSettings}
              className="toolbar-btn"
              title="自定义排版设置"
            >
              <Settings size={16} />
              <span className="toolbar-btn-text">排版设置</span>
            </button>
          </>
        )}

        
      </div>

      <div className="flex items-center space-x-2 absolute left-1/2 -translate-x-1/2 z-10">
        {editor && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowFontPanel(!showFontPanel);
              }}
              className={`flex items-center space-x-1 px-2 py-1 border border-vscode-border ${
                showFontPanel ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'
              }`}
              title="字体设置"
            >
              <Type size={16} />
              <span className="text-xs">字体</span>
            </button>

{showFontPanel && (
              <div className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border z-50 flex items-center px-2 py-1">
                <div className="flex items-center space-x-2 border-r border-vscode-border pr-2">
                  <Type size={14} className="text-vscode-text opacity-60" />
                  <FontSelector
                    fonts={[...chineseFonts, ...englishFonts]}
                    value={settings.chineseFont}
                    onChange={(family) => {
                      updateSettings({ chineseFont: family });
                    }}
                    onImportFont={addCustomFont}
                    onDeleteFont={(font) => font.id && removeCustomFont(font.id)}
                    applyScope={settings.fontApplyScope}
                    onScopeChange={(scope) => updateSettings({ fontApplyScope: scope })}
                  />
                </div>

                <div className="flex items-center space-x-1 border-r border-vscode-border pr-2 ml-2">
                  <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-1.5 cursor-pointer ${editor.isActive('bold') ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'}`}
                    title="加粗 (Ctrl+B)"
                  >
                    <Bold size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-1.5 cursor-pointer ${editor.isActive('italic') ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'}`}
                    title="斜体 (Ctrl+I)"
                  >
                    <Italic size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={`p-1.5 cursor-pointer ${editor.isActive('underline') ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'}`}
                    title="下划线 (Ctrl+U)"
                  >
                    <Underline size={18} />
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={`p-1.5 cursor-pointer ${editor.isActive('strike') ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'}`}
                    title="删除线"
                  >
                    <Strikethrough size={18} />
                  </button>
                </div>

                <div className="flex items-center space-x-1 border-r border-vscode-border pr-2 ml-2">
                  <Type size={14} className="text-vscode-text opacity-60" />
                  <div ref={fontSizeDropdownRef} className="relative">
                    <button
                      onClick={() => setShowFontSizeDropdown(!showFontSizeDropdown)}
                      className={`font-size-btn flex items-center justify-between text-xs ${
                        showFontSizeDropdown ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'
                      }`}
                      style={{ width: '52px' }}
                    >
                      <span className="text-xs">{fontSize}</span>
                      <ChevronDown size={12} className="shrink-0 ml-1" />
                    </button>
                    {showFontSizeDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border z-50 w-[58px] rounded-sm shadow-lg py-1">
                        {['12', '14', '16', '18', '20', '24'].map((size) => (
                          <button
                            key={size}
                            onClick={() => {
                              handleFontSizeChange(size);
                              setShowFontSizeDropdown(false);
                            }}
                            className={`w-full px-3 py-1 text-xs text-left text-vscode-text hover:bg-vscode-active/20 ${
                              fontSize === size ? 'bg-vscode-active/30 text-white' : ''
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 行间距 */}
                <div className="flex items-center space-x-1 border-r border-vscode-border pr-2 ml-2">
                  <AlignJustify size={14} className="text-vscode-text opacity-60" />
                  <div ref={lineHeightDropdownRef} className="relative">
                    <button
                      onClick={() => setShowLineHeightDropdown(!showLineHeightDropdown)}
                      className={`font-size-btn flex items-center justify-between text-xs ${
                        showLineHeightDropdown ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'
                      }`}
                      style={{ width: '56px' }}
                      title="行间距"
                    >
                      <span className="text-xs">{localLineHeight}</span>
                      <ChevronDown size={12} className="shrink-0 ml-1" />
                    </button>
                    {showLineHeightDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border z-50 w-[64px] rounded-sm shadow-lg py-1">
                        {lineHeightOptions.map((lh) => (
                          <button
                            key={lh}
                            onClick={() => {
                              handleLineHeightChange(lh);
                              setShowLineHeightDropdown(false);
                            }}
                            className={`w-full px-3 py-1 text-xs text-left text-vscode-text hover:bg-vscode-active/20 ${
                              localLineHeight === lh ? 'bg-vscode-active/30 text-white' : ''
                            }`}
                          >
                            {lh}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 段间距 */}
                <div className="flex items-center space-x-1 border-r border-vscode-border pr-2 ml-2">
                  <MoveVertical size={14} className="text-vscode-text opacity-60" />
                  <div ref={paraSpacingDropdownRef} className="relative">
                    <button
                      onClick={() => setShowParaSpacingDropdown(!showParaSpacingDropdown)}
                      className={`font-size-btn flex items-center justify-between text-xs ${
                        showParaSpacingDropdown ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'
                      }`}
                      style={{ width: '62px' }}
                      title="段间距"
                    >
                      <span className="text-xs">{localParagraphSpacing}</span>
                      <ChevronDown size={12} className="shrink-0 ml-1" />
                    </button>
                    {showParaSpacingDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-vscode-sidebar border border-vscode-border z-50 w-[72px] rounded-sm shadow-lg py-1">
                        {paragraphSpacingOptions.map((ps) => (
                          <button
                            key={ps}
                            onClick={() => {
                              handleParagraphSpacingChange(ps);
                              setShowParaSpacingDropdown(false);
                            }}
                            className={`w-full px-3 py-1 text-xs text-left text-vscode-text hover:bg-vscode-active/20 ${
                              localParagraphSpacing === ps ? 'bg-vscode-active/30 text-white' : ''
                            }`}
                          >
                            {ps}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  className={`p-1.5 ml-2 cursor-pointer ${editor.isActive('blockquote') ? 'bg-vscode-active text-white' : 'text-vscode-text hover:bg-gray-700'}`}
                  title="引用"
                >
                  <Quote size={18} />
                </button>

                <button
                  onClick={() => setShowFontPanel(false)}
                  className="p-1.5 ml-2 cursor-pointer text-vscode-text hover:bg-gray-700"
                  title="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        )}
        
        <button
          onClick={onUndo}
          className="icon-btn"
          title="撤销 (Ctrl+Z)"
        >
          <Undo size={18} />
        </button>
        <button
          onClick={onRedo}
          className="icon-btn"
          title="重做 (Ctrl+Y)"
        >
          <Redo size={18} />
        </button>
        <button
          onClick={onFindReplace}
          className="icon-btn"
          title="查找/替换 (Ctrl+F)"
        >
          <Search size={18} />
        </button>
      </div>

      <div className="absolute right-4 flex items-center gap-3">
        <button
          onClick={toggleFullscreen}
          className="icon-btn"
          title={isFullscreen ? '退出全屏 (F11)' : '全屏 (F11)'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <span className="text-sm text-vscode-text min-w-[80px] text-right">字数: {wordCount.toLocaleString()}</span>
      </div>
    </div>
  );
};