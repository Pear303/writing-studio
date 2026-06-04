import React, { useState, useEffect, useCallback } from 'react';
import { History, Trash2, RotateCcw, ChevronRight, ChevronDown, CheckCircle, AlertCircle, XCircle, SkipForward, Clock, BookOpen } from 'lucide-react';
import type { VibePipelineHistory, PipelineSession } from '../../types';
import { db } from '../../db';

interface PipelineHistoryPanelProps {
  onRestoreManualSession?: (session: PipelineSession) => void;
  onRestoreVibeHistory?: (history: VibePipelineHistory) => void;
  onClose: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle size={14} style={{ color: 'var(--color-success, #5cb85c)' }} />,
  failed: <AlertCircle size={14} style={{ color: 'var(--color-danger, #d9534f)' }} />,
  cancelled: <XCircle size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }} />,
  running: <Clock size={14} style={{ color: 'var(--color-vscode-active)' }} />,
  paused: <Clock size={14} style={{ color: 'var(--color-warning, #f0ad4e)' }} />,
  skipped: <SkipForward size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }} />,
  pending: <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: 'var(--color-vscode-text)', opacity: 0.3 }} />,
};

const STEP_LABELS: Record<string, string> = {
  step1: '选择题材',
  step2: '生成大纲',
  step3: '风格设置',
  step4: '生成细纲',
  step5: '生成正文',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}分${remainSeconds}秒`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}时${remainMinutes}分`;
}

const VibeHistoryItem: React.FC<{
  history: VibePipelineHistory;
  onRestore: () => void;
  onDelete: () => void;
}> = ({ history, onRestore, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const completedSteps = history.steps.filter(s => s.status === 'completed').length;
  const totalSteps = history.steps.length;
  const statusLabel = history.status === 'completed' ? '已完成' : history.status === 'failed' ? '失败' : history.status === 'cancelled' ? '已取消' : history.status;
  const duration = history.finishedAt - history.createdAt;

  return (
    <div
      className="rounded mb-1.5"
      style={{
        border: '1px solid var(--color-vscode-border)',
        backgroundColor: 'var(--color-vscode-sidebar)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {STATUS_ICON[history.status] || STATUS_ICON.pending}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate" style={{ color: 'var(--color-vscode-text)' }}>
            {history.userRequest.slice(0, 60)}{history.userRequest.length > 60 ? '...' : ''}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              {completedSteps}/{totalSteps} 步
            </span>
            <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              {statusLabel}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              {formatDuration(duration)}
            </span>
          </div>
        </div>
        {expanded ? <ChevronDown size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }} /> : <ChevronRight size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }} />}
      </div>

      {expanded && (
        <div className="px-3 pb-2">
          {/* 书籍/卷信息 */}
          <div className="flex items-center gap-1 mb-2 text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
            <BookOpen size={12} />
            {history.bookName || history.bookId}
            {history.volumeName ? ` / ${history.volumeName}` : ''}
          </div>

          {/* 步骤列表 */}
          <div className="mb-2">
            {history.steps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-2 py-0.5">
                {STATUS_ICON[step.status] || STATUS_ICON.pending}
                <span className="text-xs" style={{ color: 'var(--color-vscode-text)' }}>{step.name}</span>
                {step.result && (
                  <span className="text-xs truncate" style={{ color: 'var(--color-vscode-text)', opacity: 0.5, maxWidth: '200px' }}>
                    {step.result.slice(0, 50)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 时间信息 */}
          <div className="text-xs mb-2" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>
            创建：{formatTime(history.createdAt)} · 完成：{formatTime(history.finishedAt)}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              className="text-xs px-2 py-1 rounded flex items-center gap-1"
              style={{
                backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))',
                color: 'var(--color-vscode-active)',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
            >
              <RotateCcw size={12} />
              查看详情
            </button>
            <button
              className="text-xs px-2 py-1 rounded flex items-center gap-1"
              style={{
                backgroundColor: confirmDelete ? 'var(--color-danger-light, rgba(217, 83, 79, 0.2))' : 'transparent',
                color: confirmDelete ? 'var(--color-danger, #d9534f)' : 'var(--color-vscode-text)',
                border: confirmDelete ? '1px solid var(--color-danger, #d9534f)' : '1px solid var(--color-vscode-border)',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (confirmDelete) {
                  onDelete();
                } else {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
            >
              <Trash2 size={12} />
              {confirmDelete ? '确认删除' : '删除'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ManualSessionItem: React.FC<{
  session: PipelineSession;
  bookName?: string;
  volumeName?: string;
  onRestore: () => void;
  onDelete: () => void;
}> = ({ session, bookName, volumeName, onRestore, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stepLabel = STEP_LABELS[session.currentStep] || session.currentStep;
  const stepOrder = ['step1', 'step2', 'step3', 'step4', 'step5'];
  const currentIdx = stepOrder.indexOf(session.currentStep);
  const progress = `${currentIdx + 1}/5`;

  return (
    <div
      className="rounded mb-1.5"
      style={{
        border: '1px solid var(--color-vscode-border)',
        backgroundColor: 'var(--color-vscode-sidebar)',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm" style={{ color: 'var(--color-vscode-text)' }}>
            手动流水线 · {stepLabel}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
              进度：{progress}
            </span>
            {bookName && (
              <span className="text-xs flex items-center gap-0.5" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                <BookOpen size={10} />
                {bookName}{volumeName ? ` / ${volumeName}` : ''}
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>
              {formatTime(session.updatedAt)}
            </span>
          </div>
        </div>

        <button
          className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{
            backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.15))',
            color: 'var(--color-vscode-active)',
            border: 'none',
            cursor: 'pointer',
          }}
          onClick={onRestore}
        >
          <RotateCcw size={12} />
          恢复
        </button>
        <button
          className="text-xs px-2 py-1 rounded flex items-center gap-1"
          style={{
            backgroundColor: confirmDelete ? 'rgba(217, 83, 79, 0.2)' : 'transparent',
            color: confirmDelete ? '#d9534f' : 'var(--color-vscode-text)',
            border: confirmDelete ? '1px solid #d9534f' : '1px solid var(--color-vscode-border)',
            cursor: 'pointer',
          }}
          onClick={() => {
            if (confirmDelete) {
              onDelete();
            } else {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 3000);
            }
          }}
        >
          <Trash2 size={12} />
          {confirmDelete ? '确认' : '删除'}
        </button>
      </div>
    </div>
  );
};

export const PipelineHistoryPanel: React.FC<PipelineHistoryPanelProps> = ({
  onRestoreManualSession,
  onRestoreVibeHistory,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'vibe' | 'manual'>('vibe');
  const [vibeHistories, setVibeHistories] = useState<VibePipelineHistory[]>([]);
  const [manualSessions, setManualSessions] = useState<PipelineSession[]>([]);
  const [bookNames, setBookNames] = useState<Record<string, string>>({});
  const [volumeNames, setVolumeNames] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      // 加载 Vibe Writing 历史
      const vibes = await db.vibePipelineHistory
        .orderBy('finishedAt')
        .reverse()
        .toArray();
      setVibeHistories(vibes);

      // 加载手动流水线会话
      const sessions = await db.pipelineSessions
        .orderBy('updatedAt')
        .reverse()
        .toArray();
      setManualSessions(sessions);

      // 收集所有 bookId 和 volumeId，批量查询名称
      const bookIds = new Set<string>();
      const volumeIds = new Set<string>();
      for (const h of vibes) {
        if (h.bookId) bookIds.add(h.bookId);
        if (h.volumeId) volumeIds.add(h.volumeId);
      }
      for (const s of sessions) {
        if (s.bookId) bookIds.add(s.bookId);
        if (s.volumeId) volumeIds.add(s.volumeId);
      }

      const bn: Record<string, string> = {};
      const vn: Record<string, string> = {};
      for (const id of bookIds) {
        const book = await db.books.get(id);
        if (book) bn[id] = book.name;
      }
      for (const id of volumeIds) {
        const vol = await db.volumes.get(id);
        if (vol) vn[id] = vol.name;
      }
      setBookNames(bn);
      setVolumeNames(vn);
    } catch (err) {
      console.error('加载历史记录失败:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteVibeHistory = async (id: string) => {
    try {
      await db.vibePipelineHistory.delete(id);
      setVibeHistories(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('删除历史记录失败:', err);
    }
  };

  const handleDeleteManualSession = async (id: string) => {
    try {
      await db.pipelineSessions.delete(id);
      setManualSessions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('删除会话失败:', err);
    }
  };

  const handleClearAllVibeHistory = async () => {
    try {
      await db.vibePipelineHistory.clear();
      setVibeHistories([]);
    } catch (err) {
      console.error('清空历史记录失败:', err);
    }
  };

  const handleClearAllManualSessions = async () => {
    try {
      await db.pipelineSessions.clear();
      setManualSessions([]);
    } catch (err) {
      console.error('清空会话失败:', err);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-vscode-border)' }}>
        <div className="flex items-center gap-2">
          <History size={16} style={{ color: 'var(--color-vscode-active)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-vscode-text)' }}>
            流水线历史记录
          </h3>
        </div>
        <button
          className="text-xs px-2 py-1 rounded"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--color-vscode-border)',
            color: 'var(--color-vscode-text)',
            cursor: 'pointer',
          }}
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      {/* Tab Header */}
      <div className="flex" style={{ borderBottom: '1px solid var(--color-vscode-border)' }}>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium"
          style={{
            color: activeTab === 'vibe' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'vibe' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'vibe' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('vibe')}
        >
          Vibe Writing ({vibeHistories.length})
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium"
          style={{
            color: activeTab === 'manual' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            borderBottom: activeTab === 'manual' ? '2px solid var(--color-vscode-active)' : '2px solid transparent',
            backgroundColor: activeTab === 'manual' ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('manual')}
        >
          手动流水线 ({manualSessions.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'vibe' ? (
          <>
            {vibeHistories.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  暂无 Vibe Writing 历史记录
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.3 }}>
                  完成或取消的流水线会自动保存到这里
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-vscode-border)',
                      color: 'var(--color-vscode-text)',
                      cursor: 'pointer',
                      opacity: 0.6,
                    }}
                    onClick={handleClearAllVibeHistory}
                  >
                    清空全部
                  </button>
                </div>
                {vibeHistories.map(h => (
                  <VibeHistoryItem
                    key={h.id}
                    history={{
                      ...h,
                      bookName: h.bookName || bookNames[h.bookId],
                      volumeName: h.volumeName || volumeNames[h.volumeId],
                    }}
                    onRestore={() => onRestoreVibeHistory?.(h)}
                    onDelete={() => handleDeleteVibeHistory(h.id)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {manualSessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                  暂无手动流水线会话
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.3 }}>
                  手动流水线的进度会自动保存
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <button
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-vscode-border)',
                      color: 'var(--color-vscode-text)',
                      cursor: 'pointer',
                      opacity: 0.6,
                    }}
                    onClick={handleClearAllManualSessions}
                  >
                    清空全部
                  </button>
                </div>
                {manualSessions.map(s => (
                  <ManualSessionItem
                    key={s.id}
                    session={s}
                    bookName={bookNames[s.bookId]}
                    volumeName={volumeNames[s.volumeId]}
                    onRestore={() => onRestoreManualSession?.(s)}
                    onDelete={() => handleDeleteManualSession(s.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
