import React, { useState } from 'react';
import { FileText, Clock, Target, Timer, Save, Undo2, Redo2, Search, Type, Bot } from 'lucide-react';

interface WritingGoal {
  dailyTarget: number;
  chapterTarget: number;
  enabled: boolean;
}

interface PomodoroState {
  isRunning: boolean;
  timeLeft: number;
  mode: 'work' | 'break';
  workDuration: number;
  breakDuration: number;
  completedSessions: number;
}

interface StatusBarProps {
  wordCount: number;
  totalWords: number;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  cursorPosition?: { line: number; column: number };
  readingTime?: string;
  todayWordCount?: number;
  dailyTarget?: number;
  pomodoroTime?: string;
  pomodoroMode?: 'work' | 'break';
  writingGoal?: WritingGoal;
  todayWordCountState?: number;
  pomodoro?: PomodoroState;
  onTogglePomodoro?: () => void;
  onResetPomodoro?: () => void;
  onSwitchMode?: () => void;
  formatTime?: (seconds: number) => string;
  onShowWritingGoal?: () => void;
  onToggleFullScreen?: () => void;
  isFullScreen?: boolean;
  theme?: 'dark' | 'light' | 'eye-care';
  onThemeChange?: (theme: 'dark' | 'light' | 'eye-care') => void;
  onExport?: (format: 'txt' | 'md' | 'html') => void;
  onFullExport?: () => void;
  onImport?: () => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFindReplace?: () => void;
  onFormat?: () => void;
  onSyncToAgent?: () => void;
  agentSyncing?: boolean;
}

export const StatusBar = ({
  wordCount,
  totalWords,
  saveStatus,
  cursorPosition,
  readingTime,
  todayWordCount,
  dailyTarget,
  pomodoroTime,
  pomodoroMode,
  writingGoal,
  todayWordCountState,
  pomodoro,
  onTogglePomodoro,
  onResetPomodoro,
  onSwitchMode,
  formatTime,
  onShowWritingGoal,
  onToggleFullScreen,
  isFullScreen,
  theme,
  onThemeChange,
  onExport,
  onFullExport,
  onImport,
  onSave,
  onUndo,
  onRedo,
  onFindReplace,
  onFormat,
  onSyncToAgent,
  agentSyncing,
}: StatusBarProps) => {
  const [showDetails, setShowDetails] = useState(false);

  // 计算段落数（简单估算）
  const paragraphCount = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 100)) : 0;

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saved':
        return '已保存';
      case 'saving':
        return '正在保存...';
      case 'unsaved':
        return '未保存';
      default:
        return '';
    }
  };

  const getSaveStatusColor = () => {
    switch (saveStatus) {
      case 'saved':
        return '#16a34a';
      case 'saving':
        return '#ca8a04';
      case 'unsaved':
        return '#dc2626';
      default:
        return 'inherit';
    }
  };

  return (
    <div
      className="h-6 border-t flex items-center px-3 text-xs relative"
      style={{
        backgroundColor: 'var(--color-statusbar-bg)',
        borderColor: 'var(--color-statusbar-border)',
        color: 'var(--color-statusbar-text)',
      }}
    >
      {/* 左侧信息 */}
      <div className="flex items-center space-x-4 flex-1">
        {/* 字数统计 - 可点击显示详情 */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-1 transition-colors"
          style={{ color: 'inherit', opacity: 0.85 }}
          title="点击查看详细统计"
        >
          <FileText size={12} />
          <span>{wordCount.toLocaleString()} / {totalWords.toLocaleString()} 字</span>
        </button>

        {/* ========== 功能7: 写作目标进度 ========== */}
        {todayWordCount !== undefined && dailyTarget && (
          <div className="flex items-center space-x-1" title={`今日目标: ${dailyTarget}字`} style={{ color: 'inherit', opacity: 0.75 }}>
            <Target size={12} className={todayWordCount >= dailyTarget ? 'text-green-400' : 'text-yellow-400'} />
            <span>{todayWordCount.toLocaleString()}/{dailyTarget.toLocaleString()}</span>
            <div className="w-20 h-1.5 bg-black/10 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${todayWordCount >= dailyTarget ? 'bg-green-500' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, (todayWordCount / dailyTarget) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 光标位置 */}
        {cursorPosition && (
        <span style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          行 {cursorPosition.line}, 列 {cursorPosition.column}
        </span>
        )}
      </div>

      {/* 右侧信息 */}
      <div className="flex items-center space-x-4" style={{ color: 'inherit', opacity: 0.75 }}>
        {/* ========== 功能6: 阅读时间估算 ========== */}
        {readingTime && (
          <span className="flex items-center space-x-1" title="预计阅读时间">
            <Clock size={12} />
            <span>{readingTime}</span>
          </span>
        )}

        {/* ========== 功能8: 番茄钟状态 ========== */}
        {pomodoroTime && (
          <span className="flex items-center space-x-1" title={`番茄钟 ${pomodoroMode === 'work' ? '工作中' : '休息中'}`}>
            <Timer 
              size={12} 
              style={{ 
                color: pomodoroMode === 'work' 
                  ? 'var(--color-danger, #ef4444)' 
                  : 'var(--color-success, #22c55e)' 
              }} 
            />
            <span>{pomodoroTime}</span>
          </span>
        )}
        
        {/* 保存状态 */}
        <span style={{ color: getSaveStatusColor() }}>
          {getSaveStatusText()}
        </span>

        {/* 同步到 Agent */}
        {onSyncToAgent && (
          <button
            onClick={onSyncToAgent}
            disabled={agentSyncing}
            className="flex items-center space-x-1 transition-colors hover:opacity-100"
            style={{ color: 'inherit', opacity: agentSyncing ? 0.4 : 0.75 }}
            title={agentSyncing ? '正在同步...' : '同步当前书籍数据到 Agent'}
          >
            <Bot size={12} />
            <span>{agentSyncing ? '同步中' : 'Agent'}</span>
          </button>
        )}
      </div>

      {/* 详细统计弹窗 */}
      {showDetails && (
        <div 
          className="absolute bottom-8 right-4 bg-vscode-sidebar border border-vscode-border p-4 min-w-[200px] z-50"
          style={{ borderRadius: '2px' }}
        >
          <h3 className="text-sm font-semibold text-vscode-text mb-3">详细统计</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>当前章节字数：</span>
              <span className="text-vscode-text">{wordCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>本书总字数：</span>
              <span className="text-vscode-text">{totalWords.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>段落数：</span>
              <span className="text-vscode-text">约 {paragraphCount}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>字符数：</span>
              <span className="text-vscode-text">{(wordCount * 2).toLocaleString()}</span>
            </div>
            {readingTime && (
              <div className="flex justify-between pt-2 border-t border-vscode-border">
                <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>预计阅读时间：</span>
                <span className="text-vscode-text">{readingTime}</span>
              </div>
            )}
            {todayWordCount !== undefined && dailyTarget && (
              <div className="flex justify-between pt-2 border-t border-vscode-border">
                <span style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}>今日字数：</span>
                <span className={`text-vscode-text ${todayWordCount >= dailyTarget ? 'text-green-400' : ''}`}>
                  {todayWordCount.toLocaleString()}/{dailyTarget.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
