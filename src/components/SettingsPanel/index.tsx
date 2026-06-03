import { useState } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import { Toast, type ToastType } from '../Toast';
import type { FormattingSettings, WordCountSettings } from '../../types';
import { db, exportAllData, importAllData } from '../../db';
import { save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { LlmConfigPanel } from '../LlmConfigPanel';
import { SMTPSettingsPage } from '../Auth/SMTPSettingsPage';
import { useUser } from '../../auth/UserContext';
import { EditNicknameModal } from './modals/EditNicknameModal';
import { EditPasswordModal } from './modals/EditPasswordModal';
import { EditEmailModal } from './modals/EditEmailModal';
import { FontSelector } from '../FontSelector';
import { useFontManager } from '../../hooks/useFontManager';
type Theme = 'dark' | 'light' | 'eye-care';
type SettingsTab = 'general' | 'data' | 'llm' | 'smtp' | 'account';

interface SettingsPanelProps {
  formattingSettings: FormattingSettings;
  onSaveFormattingSettings: (settings: FormattingSettings) => void;
  wordCountSettings?: WordCountSettings;
  onSaveWordCountSettings?: (settings: WordCountSettings) => void;
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  autoSaveInterval?: number;
  onAutoSaveIntervalChange?: (interval: number) => void;
  editorFontSize?: number;
  onEditorFontSizeChange?: (size: number) => void;
}

export const SettingsPanel = ({
  formattingSettings,
  onSaveFormattingSettings,
  wordCountSettings,
  onSaveWordCountSettings,
  theme = 'dark',
  onThemeChange,
  autoSaveInterval: externalAutoSaveInterval,
  onAutoSaveIntervalChange,
  editorFontSize: externalEditorFontSize,
  onEditorFontSizeChange,
}: SettingsPanelProps) => {
  // 使用 useUser hook 获取用户信息
  const { user, logout } = useUser();
  
  // 字体管理
  const {
    settings: fontSettings,
    updateSettings: updateFontSettings,
    getChineseFonts,
    getEnglishFonts,
    addCustomFont,
    removeCustomFont,
  } = useFontManager();
  const allFonts = [...getChineseFonts(), ...getEnglishFonts()];
  
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localAutoSaveInterval, setLocalAutoSaveInterval] = useState(() => {
    return externalAutoSaveInterval ?? 30;
  });
  const [localEditorFontSize, setLocalEditorFontSize] = useState(() => {
    return externalEditorFontSize ?? 16;
  });
  const [startupWindowMode, setStartupWindowMode] = useState<'maximized' | 'fullscreen'>(() => {
    return (localStorage.getItem('startupWindowMode') as 'maximized' | 'fullscreen') || 'maximized';
  });
  const [chapterDetailDisplay, setChapterDetailDisplay] = useState<'nameOnly' | 'nameAndExcerpt' | 'nameAndWordCount' | 'full'>(() => {
    return (localStorage.getItem('chapterDetailDisplay') as 'nameOnly' | 'nameAndExcerpt' | 'nameAndWordCount' | 'full') || 'nameOnly';
  });
  const [volumeDetailInfo, setVolumeDetailInfo] = useState<'none' | 'counts' | 'countsAndWords'>(() => {
    return (localStorage.getItem('volumeDetailInfo') as 'none' | 'counts' | 'countsAndWords') || 'none';
  });
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // 显示Toast
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // 导出数据 - 使用Tauri对话框
  const handleExport = async () => {
    try {
      const data = await exportAllData();
      
      // 检查是否在Tauri环境中
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      
      if (!isTauri) {
        console.warn('不在Tauri环境中，使用浏览器下载方式');
        // 降级到浏览器下载方式
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `novel-ide-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('数据导出成功！（浏览器下载模式）', 'success');
        return;
      }
      
      // 获取上次保存的路径
      const lastPath = localStorage.getItem('lastBackupExportPath') || '';
      const fileName = `novel-ide-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      // 打开保存对话框
      const filePath = await save({
        defaultPath: lastPath ? `${lastPath}\\${fileName}` : fileName,
        filters: [
          {
            name: 'JSON Files',
            extensions: ['json']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });

      if (!filePath) {
        return;
      }

      // 写入文件
      await writeTextFile(filePath, data);
      
      // 保存最后使用的路径
      const lastDir = filePath.substring(0, filePath.lastIndexOf('\\') || filePath.lastIndexOf('/'));
      localStorage.setItem('lastBackupExportPath', lastDir);
      
      showToast('数据导出成功！', 'success');
    } catch (error) {
      console.error('导出失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`导出失败: ${errorMessage}`, 'error');
    }
  };

  // 导入数据 - 使用Tauri对话框
  const handleImport = async () => {
    try {
      // 检查是否在Tauri环境中
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      
      if (!isTauri) {
        console.warn('不在Tauri环境中，使用浏览器文件选择方式');
        // 降级到浏览器文件选择方式
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          
          if (!confirm('导入数据将覆盖当前所有数据，确定要继续吗？')) {
            return;
          }
          
          const text = await file.text();
          await importAllData(text);
          showToast('数据导入成功！页面将刷新...', 'success');
          setTimeout(() => window.location.reload(), 1000);
        };
        input.click();
        return;
      }
      
      // 获取上次打开的路径
      const lastPath = localStorage.getItem('lastBackupImportPath') || '';
      
      // 打开文件选择对话框
      const selected = await open({
        multiple: false,
        directory: false,
        defaultPath: lastPath,
        filters: [
          {
            name: 'JSON Files',
            extensions: ['json']
          },
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      if (!confirm('导入数据将覆盖当前所有数据，确定要继续吗？')) {
        return;
      }

      // 读取文件内容
      const text = await readTextFile(selected);
      await importAllData(text);
      
      // 保存最后使用的路径
      const lastDir = selected.substring(0, selected.lastIndexOf('\\') || selected.lastIndexOf('/'));
      localStorage.setItem('lastBackupImportPath', lastDir);
      
      showToast('数据导入成功！页面将刷新...', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('导入失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(`导入失败: ${errorMessage}`, 'error');
    }
  };

  // 清空数据
  const handleClearData = async () => {
    if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) {
      return;
    }

    if (!confirm('再次确认：这将删除所有书籍、素材和对话历史，确定要继续吗？')) {
      return;
    }

    try {
      await db.books.clear();
      await db.volumes.clear();
      await db.chapters.clear();
      await db.materials.clear();
      await db.aiConversations.clear();
      showToast('数据已清空！页面将刷新...', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('清空失败:', error);
      showToast('清空失败，请重试', 'error');
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar overflow-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="p-4 border-b border-vscode-border">
        <h2 className="text-lg font-semibold text-vscode-text">设置</h2>
      </div>

      <div className="flex flex-wrap border-b border-vscode-border">
        {(['general', 'data', 'llm', 'smtp', 'account'] as const).map((tab) => {
          const isActive = activeTab === tab;
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'var(--color-vscode-active-light)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              className="flex-1 px-2 py-2.5 text-xs font-medium flex items-center justify-center space-x-1 transition-all duration-200 min-w-[5rem]"
              style={{
                color: isActive ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
                borderBottomWidth: isActive ? '2px' : '0px',
                borderBottomColor: isActive ? 'var(--color-vscode-active)' : 'transparent',
                backgroundColor: 'transparent',
              }}
            >
              <span className="truncate">{tab === 'general' ? '通用' : tab === 'data' ? '数据' : tab === 'llm' ? 'LLM' : tab === 'smtp' ? '邮箱' : '账号'}</span>
            </button>
          );
        })}
      </div>

      {/* 设置内容 */}
      <div className="flex-1 p-4 overflow-auto">
        {/* 通用设置 */}
        {activeTab === 'general' && (
          <section className="flex flex-col gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>主题</label>
              <select
                value={theme}
                onChange={(e) => onThemeChange?.(e.target.value as Theme)}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
              >
                <option value="dark">深色主题</option>
                <option value="light">浅色主题</option>
                <option value="eye-care">护眼模式</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>启动窗口模式</label>
              <select
                value={startupWindowMode}
                onChange={(e) => {
                  const mode = e.target.value as 'maximized' | 'fullscreen';
                  setStartupWindowMode(mode);
                  localStorage.setItem('startupWindowMode', mode);
                }}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
              >
                <option value="maximized">窗口全屏（最大化窗口）</option>
                <option value="fullscreen">全屏模式（F11 级别）</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>自动保存间隔（秒）</label>
              <input
                type="number"
                value={localAutoSaveInterval}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLocalAutoSaveInterval(val);
                  onAutoSaveIntervalChange?.(val);
                }}
                min={5}
                max={300}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active input-field"
              />
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>编辑器默认字号</label>
              <select
                value={localEditorFontSize}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLocalEditorFontSize(val);
                  onEditorFontSizeChange?.(val);
                }}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
              >
                <option value={12}>12px</option>
                <option value={14}>14px</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
                <option value={20}>20px</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>详细章节显示</label>
              <select
                value={chapterDetailDisplay}
                onChange={(e) => {
                  const val = e.target.value as 'nameOnly' | 'nameAndExcerpt' | 'nameAndWordCount' | 'full';
                  setChapterDetailDisplay(val);
                  localStorage.setItem('chapterDetailDisplay', val);
                }}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
              >
                <option value="nameOnly">仅章节名</option>
                <option value="nameAndExcerpt">章节名 + 开头摘要</option>
                <option value="nameAndWordCount">章节名 + 字数</option>
                <option value="full">章节名 + 开头摘要 + 字数</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>卷节点详细信息</label>
              <select
                value={volumeDetailInfo}
                onChange={(e) => {
                  const val = e.target.value as 'none' | 'counts' | 'countsAndWords';
                  setVolumeDetailInfo(val);
                  localStorage.setItem('volumeDetailInfo', val);
                }}
                className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
              >
                <option value="none">不显示</option>
                <option value="counts">子卷数 · 章节数</option>
                <option value="countsAndWords">子卷数 · 章节数 · 字数</option>
              </select>
            </div>

            <div className="pt-4 mt-2 border-t border-vscode-border">
              <h3 className="text-sm font-medium text-vscode-text mb-3">字体</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>默认中文字体</label>
                  <FontSelector
                    fonts={allFonts}
                    value={fontSettings.chineseFont}
                    onChange={(family) => updateFontSettings({ chineseFont: family })}
                    onImportFont={addCustomFont}
                    onDeleteFont={(font) => font.id && removeCustomFont(font.id)}
                    applyScope={fontSettings.fontApplyScope}
                    onScopeChange={(scope) => updateFontSettings({ fontApplyScope: scope })}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>字体粗细</label>
                  <select
                    value={fontSettings.fontWeight}
                    onChange={(e) => updateFontSettings({ fontWeight: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
                  >
                    <option value="100">100 - 极细</option>
                    <option value="200">200 - 特细</option>
                    <option value="300">300 - 细体</option>
                    <option value="400">400 - 常规</option>
                    <option value="500">500 - 中等</option>
                    <option value="600">600 - 半粗</option>
                    <option value="700">700 - 粗体</option>
                    <option value="800">800 - 特粗</option>
                    <option value="900">900 - 极粗</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>字体大小</label>
                  <select
                    value={fontSettings.fontSize}
                    onChange={(e) => updateFontSettings({ fontSize: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
                  >
                    <option value="12">12px</option>
                    <option value="13">13px</option>
                    <option value="14">14px</option>
                    <option value="15">15px</option>
                    <option value="16">16px</option>
                    <option value="17">17px</option>
                    <option value="18">18px</option>
                    <option value="20">20px</option>
                    <option value="22">22px</option>
                    <option value="24">24px</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>字间距</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="-2"
                      max="10"
                      step="0.5"
                      value={fontSettings.letterSpacing}
                      onChange={(e) => updateFontSettings({ letterSpacing: e.target.value })}
                      className="flex-1"
                      style={{ accentColor: 'var(--color-vscode-active)' }}
                    />
                    <span className="text-xs text-vscode-text" style={{ minWidth: '36px', textAlign: 'right', opacity: 0.7 }}>
                      {fontSettings.letterSpacing}px
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-2 border-t border-vscode-border">
              <h3 className="text-sm font-medium text-vscode-text mb-3">排版</h3>
              
              <div className="flex flex-col gap-2">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>段间距</label>
                  <select
                    value={formattingSettings.paragraphSpacing}
                    onChange={(e) =>
                      onSaveFormattingSettings({
                        ...formattingSettings,
                        paragraphSpacing: e.target.value as FormattingSettings['paragraphSpacing'],
                      })
                    }
                    className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
                  >
                    <option value="0px">0px（不空行）</option>
                    <option value="0.5em">0.5em（半行）</option>
                    <option value="1em">1em（一行）</option>
                    <option value="1.5em">1.5em（一行半）</option>
                    <option value="2em">2em（两行）</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>首行缩进</label>
                  <select
                    value={formattingSettings.firstLineIndent}
                    onChange={(e) =>
                      onSaveFormattingSettings({
                        ...formattingSettings,
                        firstLineIndent: e.target.value as FormattingSettings['firstLineIndent'],
                      })
                    }
                    className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
                  >
                    <option value="0">无缩进</option>
                    <option value="2char">2字符</option>
                    <option value="4char">4字符</option>
                    <option value="2em">2em</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-vscode-border">
                  <label className="block text-xs mb-2" style={{ color: 'var(--color-vscode-text, #cccccc)', opacity: 0.6 }}>清理选项</label>
                  <div className="flex flex-col">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formattingSettings.clearExtraBlankLines}
                        onChange={(e) =>
                          onSaveFormattingSettings({
                            ...formattingSettings,
                            clearExtraBlankLines: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                      <span className="text-xs text-vscode-text">清除多余空行</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formattingSettings.clearExtraSpaces}
                        onChange={(e) =>
                          onSaveFormattingSettings({
                            ...formattingSettings,
                            clearExtraSpaces: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                      <span className="text-xs text-vscode-text">清除多余空格</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formattingSettings.convertPunctuation}
                        onChange={(e) =>
                          onSaveFormattingSettings({
                            ...formattingSettings,
                            convertPunctuation: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                      <span className="text-xs text-vscode-text">全角标点转半角</span>
                    </label>
                  </div>
                </div>

                {wordCountSettings && onSaveWordCountSettings && (
                  <div className="pt-4 mt-2 border-t border-vscode-border">
                    <h3 className="text-sm font-medium text-vscode-text mb-3">字数统计</h3>
                    <div className="flex flex-col gap-3">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={wordCountSettings.includePunctuation}
                          onChange={(e) =>
                            onSaveWordCountSettings({
                              ...wordCountSettings,
                              includePunctuation: e.target.checked,
                            })
                          }
                          className="mr-2"
                        />
                        <span className="text-xs text-vscode-text">标点符号计入字数</span>
                      </label>

                      <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
                          英文统计方式
                        </label>
                        <select
                          value={wordCountSettings.englishMode}
                          onChange={(e) =>
                            onSaveWordCountSettings({
                              ...wordCountSettings,
                              englishMode: e.target.value as 'word' | 'letter',
                            })
                          }
                          className="w-full px-2 py-1.5 text-sm text-vscode-text focus:outline-none focus:border-vscode-active select-field"
                        >
                          <option value="word">按单词统计</option>
                          <option value="letter">按字母统计</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'data' && (
          <section className="flex flex-col">
            <button
              onClick={handleExport}
              className="w-full px-3 py-2 text-sm rounded flex items-center justify-center space-x-2 transition-colors"
              style={{
                backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))',
                color: 'var(--color-vscode-active, #007acc)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-vscode-active-medium, rgba(0, 122, 204, 0.3))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))';
              }}
            >
              <Download size={16} />
              <span>导出所有数据</span>
            </button>

            <button
              onClick={handleImport}
              className="w-full px-3 py-2 text-sm rounded flex items-center justify-center space-x-2 transition-colors"
              style={{
                backgroundColor: 'var(--color-success-light, rgba(34, 197, 94, 0.2))',
                color: 'var(--color-success, #22c55e)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-success-medium, rgba(34, 197, 94, 0.3))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-success-light, rgba(34, 197, 94, 0.2))';
              }}
            >
              <Upload size={16} />
              <span>导入备份</span>
            </button>

            <button
              onClick={handleClearData}
              className="w-full px-3 py-2 text-sm rounded flex items-center justify-center space-x-2 transition-colors"
              style={{
                backgroundColor: 'var(--color-danger-light, rgba(239, 68, 68, 0.2))',
                color: 'var(--color-danger, #ef4444)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-danger-medium, rgba(239, 68, 68, 0.3))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-danger-light, rgba(239, 68, 68, 0.2))';
              }}
            >
              <Trash2 size={16} />
              <span>清空所有数据</span>
            </button>
          </section>
        )}

        {activeTab === 'llm' && (
          <div className="h-full">
            <LlmConfigPanel />
          </div>
        )}

        {activeTab === 'smtp' && (
          <div className="h-full">
            <SMTPSettingsPage onClose={() => setActiveTab('account')} />
          </div>
        )}

        {activeTab === 'account' && (
          <section className="flex flex-col gap-4">
            {user ? (
              <>
                <div className="p-4 bg-vscode-input rounded-lg">
                  <div className="text-sm text-vscode-text opacity-60 mb-2">当前账号</div>
                  <div className="text-lg font-medium text-vscode-text">{user.nickname || user.username}</div>
                  {user.email && <div className="text-xs text-vscode-text opacity-60 mt-1">{user.email}</div>}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setShowNicknameModal(true)}
                    className="px-2 py-2 rounded transition-colors"
                    style={{
                      backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))',
                      color: 'var(--color-vscode-active, #007acc)',
                      fontSize: '18px',
                    }}
                  >
                    修改昵称
                  </button>
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="px-2 py-2 rounded transition-colors"
                    style={{
                      backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))',
                      color: 'var(--color-vscode-active, #007acc)',
                      fontSize: '18px',
                    }}
                  >
                    修改密码
                  </button>
                  <button
                    onClick={() => setShowEmailModal(true)}
                    className="px-2 py-2 rounded transition-colors"
                    style={{
                      backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))',
                      color: 'var(--color-vscode-active, #007acc)',
                      fontSize: '18px',
                    }}
                  >
                    修改邮箱
                  </button>
                </div>

                <button
                  onClick={logout}
                  className="w-full px-3 py-2 text-sm rounded flex items-center justify-center space-x-2 transition-colors"
                  style={{
                    backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))',
                    color: 'var(--color-vscode-active, #007acc)',
                  }}
                >
                  <span>退出登录</span>
                </button>

                <div className="text-xs text-vscode-text opacity-40 text-center mt-4">
                  点击退出登录返回登录页面，可切换账号
                </div>
              </>
            ) : (
              <div className="p-4 bg-vscode-input rounded-lg">
                <div className="text-sm text-vscode-text mb-2">未登录</div>
                <div className="text-lg font-medium text-vscode-text">请先登录</div>
                <div className="text-xs text-vscode-text opacity-60 mt-2">登录后可管理账号和设置</div>
              </div>
            )}
          </section>
        )}

        <EditNicknameModal isOpen={showNicknameModal} onClose={() => setShowNicknameModal(false)} />
        <EditPasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
        <EditEmailModal isOpen={showEmailModal} onClose={() => setShowEmailModal(false)} />
      </div>
    </div>
  );
};
