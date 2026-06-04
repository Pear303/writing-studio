import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, X, SkipForward, RotateCcw, MessageSquare, CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { PipelineAutoState, PipelineAutoStep, PipelineIntervention, Book, Volume, VibePreset } from '../../types';
import {
  getVibePresets,
  ensureDefaultVibePresets,
  toggleVibePreset,
  addCustomVibePreset,
  deleteVibePreset,
  getCurrentUserId,
} from '../../db';

interface VibeWritingPanelProps {
  currentBook: Book | null;
  currentVolume: Volume | null;
  pipelineState: PipelineAutoState | null;
  loading: boolean;
  error: string | null;
  onStartPipeline: (bookId: string, volumeId: string, userRequest: string) => void;
  onIntervene: (type: 'pause' | 'resume' | 'cancel' | 'redirect' | 'skip', message?: string, targetStepIndex?: number) => void;
  onClearPipeline: () => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: 'var(--color-vscode-text)', opacity: 0.4 }} />,
  running: <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-vscode-active)' }} />,
  checking: <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-warning, #f0ad4e)' }} />,
  completed: <CheckCircle size={16} style={{ color: 'var(--color-success, #5cb85c)' }} />,
  failed: <AlertCircle size={16} style={{ color: 'var(--color-danger, #d9534f)' }} />,
  skipped: <SkipForward size={16} style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }} />,
};

const StepRow: React.FC<{
  step: PipelineAutoStep;
  index: number;
  isCurrent: boolean;
  onSkip?: () => void;
  onRedirect?: (message: string) => void;
}> = ({ step, index, isCurrent, onSkip, onRedirect }) => {
  const [expanded, setExpanded] = useState(false);
  const [redirectMsg, setRedirectMsg] = useState('');
  const [showRedirect, setShowRedirect] = useState(false);

  return (
    <div
      className="mb-1 rounded"
      style={{
        borderLeft: isCurrent ? '3px solid var(--color-vscode-active)' : '3px solid transparent',
        backgroundColor: isCurrent ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))' : 'transparent',
      }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {STATUS_ICONS[step.status] || STATUS_ICONS.pending}
        <span className="flex-1 text-sm" style={{ color: 'var(--color-vscode-text)' }}>
          {step.name}
        </span>
        {step.retryCount > 0 && (
          <span className="text-xs px-1 rounded" style={{ backgroundColor: 'var(--color-warning-light, rgba(240, 173, 78, 0.2))', color: 'var(--color-warning, #f0ad4e)' }}>
            重试×{step.retryCount}
          </span>
        )}
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </div>

      {expanded && (
        <div className="px-8 pb-2">
          {step.result && (
            <p className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.7 }}>
              {step.result}
            </p>
          )}
          {isCurrent && step.status === 'running' && (
            <div className="flex gap-1 mt-1">
              <button
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-warning-light, rgba(240, 173, 78, 0.2))', color: 'var(--color-warning, #f0ad4e)' }}
                onClick={(e) => { e.stopPropagation(); onSkip?.(); }}
              >
                跳过
              </button>
              <button
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))', color: 'var(--color-vscode-active)' }}
                onClick={(e) => { e.stopPropagation(); setShowRedirect(!showRedirect); }}
              >
                修改方向
              </button>
            </div>
          )}
          {showRedirect && (
            <div className="flex gap-1 mt-1">
              <input
                className="flex-1 text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--color-vscode-input-bg)', color: 'var(--color-vscode-text)', border: '1px solid var(--color-vscode-border)' }}
                placeholder="输入修改方向..."
                value={redirectMsg}
                onChange={(e) => setRedirectMsg(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && redirectMsg.trim()) {
                    onRedirect?.(redirectMsg.trim());
                    setRedirectMsg('');
                    setShowRedirect(false);
                  }
                }}
              />
              <button
                className="text-xs px-2 py-1 rounded"
                style={{ backgroundColor: 'var(--color-vscode-active)', color: '#fff' }}
                onClick={() => {
                  if (redirectMsg.trim()) {
                    onRedirect?.(redirectMsg.trim());
                    setRedirectMsg('');
                    setShowRedirect(false);
                  }
                }}
              >
                发送
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const tagButtonStyle = (selected: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  fontSize: '13px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: selected ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap' as const,
  userSelect: 'none' as const,
  lineHeight: '1.4',
});

export const VibeWritingPanel: React.FC<VibeWritingPanelProps> = ({
  currentBook,
  currentVolume,
  pipelineState,
  loading,
  error,
  onStartPipeline,
  onIntervene,
  onClearPipeline,
}) => {
  const [userRequest, setUserRequest] = useState('');
  const [presets, setPresets] = useState<VibePreset[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetContent, setNewPresetContent] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // 加载预设
  const loadPresets = useCallback(async () => {
    const userId = getCurrentUserId();
    if (!userId) return;
    await ensureDefaultVibePresets(userId);
    const loaded = await getVibePresets(userId);
    setPresets(loaded);
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // 切换预设
  const handleTogglePreset = async (preset: VibePreset) => {
    const newEnabled = !preset.enabled;
    setPresets(prev => prev.map(p => p.id === preset.id ? { ...p, enabled: newEnabled } : p));
    await toggleVibePreset(preset.id, newEnabled);
  };

  // 添加自定义预设
  const handleAddPreset = async () => {
    const userId = getCurrentUserId();
    if (!userId || !newPresetName.trim() || !newPresetContent.trim()) return;
    await addCustomVibePreset(userId, newPresetName.trim(), newPresetContent.trim());
    setNewPresetName('');
    setNewPresetContent('');
    setShowAddForm(false);
    await loadPresets();
  };

  // 删除自定义预设
  const handleDeletePreset = async (preset: VibePreset) => {
    if (preset.builtIn) {
      setPresets(prev => prev.filter(p => p.id !== preset.id));
      return;
    }
    await deleteVibePreset(preset.id);
    await loadPresets();
  };

  const handleStart = () => {
    if (!currentBook || !userRequest.trim()) return;
    const volumeId = currentVolume?.id || '';
    // 将选中的参考指令拼接到 userRequest 中
    const enabledPresets = presets.filter(p => p.enabled);
    let enhancedRequest = userRequest.trim();
    if (enabledPresets.length > 0) {
      const refBlock = enabledPresets.map(p => `[${p.name}]：${p.content}`).join('\n');
      enhancedRequest += `\n\n---\n参考要求：\n${refBlock}`;
    }
    onStartPipeline(currentBook.id, volumeId, enhancedRequest);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleStart();
    }
  };

  const isRunning = pipelineState?.status === 'running';
  const isPaused = pipelineState?.status === 'paused';
  const isCompleted = pipelineState?.status === 'completed';
  const isFailed = pipelineState?.status === 'failed';
  const isCancelled = pipelineState?.status === 'cancelled';

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--color-vscode-bg)' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-vscode-text)' }}>
          ✨ Vibe Writing
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          一句话启动全自动写作
        </p>
      </div>

      {/* Input Area */}
      {!pipelineState || isCompleted || isFailed || isCancelled ? (
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            <textarea
              className="flex-1 text-sm px-3 py-2 rounded resize-y"
              style={{
                backgroundColor: 'var(--color-vscode-input-bg)',
                color: 'var(--color-vscode-text)',
                border: '1px solid var(--color-vscode-border)',
                minHeight: '120px',
                maxHeight: '200px',
              }}
              placeholder={
                currentBook
                  ? `描述你想在「${currentBook.name}」中写什么...`
                  : '请先选择一本书...'
              }
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!currentBook || loading}
              rows={4}
            />
            <button
              className="px-3 py-2 rounded flex items-center gap-1 text-sm font-medium"
              style={{
                backgroundColor: currentBook && userRequest.trim() ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)',
                color: '#fff',
                cursor: currentBook && userRequest.trim() ? 'pointer' : 'not-allowed',
              }}
              onClick={handleStart}
              disabled={!currentBook || !userRequest.trim() || loading}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              开始
            </button>
          </div>
          {!currentBook && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger, #d9534f)' }}>请先在左侧选择一本书</p>
          )}

          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--color-vscode-text)', opacity: 0.7 }}>参考选项</span>
              <button
                className="flex items-center justify-center rounded text-sm font-medium"
                style={{
                  width: '22px', height: '22px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-vscode-border)',
                  color: 'var(--color-vscode-text)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  lineHeight: '1',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-vscode-active)';
                  e.currentTarget.style.color = 'var(--color-vscode-active)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-vscode-border)';
                  e.currentTarget.style.color = 'var(--color-vscode-text)';
                }}
                onClick={() => setShowAddForm(!showAddForm)}
                title="添加自定义参考选项"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <div
                  key={p.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    backgroundColor: p.enabled ? 'var(--color-vscode-active-light, rgba(143, 188, 143, 0.15))' : 'transparent',
                    border: p.enabled ? '1px solid var(--color-vscode-active)' : '1px solid var(--color-vscode-border)',
                    borderRadius: '4px',
                    paddingRight: '3px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <button
                    style={tagButtonStyle(p.enabled)}
                    onClick={() => handleTogglePreset(p)}
                    title={p.content}
                  >
                    {p.name}
                  </button>
                  <button
                    className="flex items-center justify-center rounded text-xs font-medium"
                    style={{
                      width: '16px', height: '16px',
                      backgroundColor: confirmDeleteId === p.id ? 'var(--color-danger)' : 'transparent',
                      border: confirmDeleteId === p.id ? '1px solid var(--color-danger)' : 'none',
                      color: confirmDeleteId === p.id ? '#ffffff' : 'var(--color-vscode-text)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      lineHeight: '1',
                      opacity: confirmDeleteId === p.id ? 1 : 0.5,
                      fontSize: '10px',
                    }}
                    onMouseEnter={(e) => {
                      if (confirmDeleteId !== p.id) {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = 'var(--color-danger)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (confirmDeleteId !== p.id) {
                        e.currentTarget.style.opacity = '0.5';
                        e.currentTarget.style.color = 'var(--color-vscode-text)';
                      }
                    }}
                    onClick={() => {
                      if (confirmDeleteId === p.id) {
                        // 第三次点击：真正删除
                        handleDeletePreset(p);
                        setConfirmDeleteId(null);
                      } else if (p.enabled) {
                        // 第一次点击（已选中）：先取消选中，不进警告
                        handleTogglePreset(p);
                      } else {
                        // 第一次点击（未选中）：进入警告状态
                        setConfirmDeleteId(p.id);
                        setTimeout(() => setConfirmDeleteId(prev => prev === p.id ? null : prev), 3000);
                      }
                    }}
                    title={confirmDeleteId === p.id ? '再次点击确认删除' : '删除此选项'}
                  >
                    {confirmDeleteId === p.id ? '!' : '×'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {showAddForm && (
            <div
              className="mt-2 p-2 rounded"
              style={{
                backgroundColor: 'var(--color-vscode-input-bg)',
                border: '1px solid var(--color-vscode-border)',
              }}
            >
              <input
                className="w-full text-xs px-2 py-1.5 rounded mb-1.5"
                style={{
                  backgroundColor: 'var(--color-vscode-bg)',
                  color: 'var(--color-vscode-text)',
                  border: '1px solid var(--color-vscode-border)',
                  outline: 'none',
                }}
                placeholder="选项名称（如：不需要生成细纲）"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
              />
              <textarea
                className="w-full text-xs px-2 py-1.5 rounded mb-1.5 resize-none"
                style={{
                  backgroundColor: 'var(--color-vscode-bg)',
                  color: 'var(--color-vscode-text)',
                  border: '1px solid var(--color-vscode-border)',
                  outline: 'none',
                  minHeight: '40px',
                }}
                placeholder="指令内容（将注入到提示词中，如：跳过细纲生成步骤，直接基于大纲生成正文。）"
                value={newPresetContent}
                onChange={(e) => setNewPresetContent(e.target.value)}
                rows={2}
              />
              <div className="flex gap-1 justify-end">
                <button
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-vscode-border)',
                    color: 'var(--color-vscode-text)',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setShowAddForm(false);
                    setNewPresetName('');
                    setNewPresetContent('');
                  }}
                >
                  取消
                </button>
                <button
                  className="text-xs px-3 py-1 rounded"
                  style={{
                    backgroundColor: newPresetName.trim() && newPresetContent.trim()
                      ? 'var(--color-vscode-active)' : 'var(--color-vscode-border)',
                    color: 'var(--color-vscode-text)',
                    cursor: newPresetName.trim() && newPresetContent.trim() ? 'pointer' : 'not-allowed',
                    border: 'none',
                  }}
                  disabled={!newPresetName.trim() || !newPresetContent.trim()}
                  onClick={handleAddPreset}
                >
                  添加
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'var(--color-danger-light, rgba(217, 83, 79, 0.15))', color: 'var(--color-danger, #d9534f)' }}>
          {error}
        </div>
      )}

      {/* Pipeline Progress */}
      {pipelineState && (
        <div className="flex-1 overflow-y-auto px-4">
          {/* Status Bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor:
                    isRunning ? 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.2))' :
                    isPaused ? 'var(--color-warning-light, rgba(240, 173, 78, 0.2))' :
                    isCompleted ? 'var(--color-success-light, rgba(92, 184, 92, 0.2))' :
                    isFailed ? 'var(--color-danger-light, rgba(217, 83, 79, 0.2))' :
                    'var(--color-hover-bg, rgba(255,255,255,0.1))',
                  color:
                    isRunning ? 'var(--color-vscode-active)' :
                    isPaused ? 'var(--color-warning, #f0ad4e)' :
                    isCompleted ? 'var(--color-success, #5cb85c)' :
                    isFailed ? 'var(--color-danger, #d9534f)' :
                    'var(--color-vscode-text)',
                }}
              >
                {isRunning ? '运行中' : isPaused ? '已暂停' : isCompleted ? '已完成' : isFailed ? '失败' : isCancelled ? '已取消' : pipelineState.status}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                {pipelineState.steps.filter(s => s.status === 'completed').length}/{pipelineState.steps.length} 步
              </span>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-1">
              {isRunning && (
                <button
                  className="p-1 rounded"
                  style={{ backgroundColor: 'var(--color-warning-light, rgba(240, 173, 78, 0.2))', color: 'var(--color-warning, #f0ad4e)' }}
                  onClick={() => onIntervene('pause')}
                  title="暂停"
                >
                  <Pause size={14} />
                </button>
              )}
              {isPaused && (
                <button
                  className="p-1 rounded"
                  style={{ backgroundColor: 'var(--color-success-light, rgba(92, 184, 92, 0.2))', color: 'var(--color-success, #5cb85c)' }}
                  onClick={() => onIntervene('resume')}
                  title="继续"
                >
                  <Play size={14} />
                </button>
              )}
              {(isRunning || isPaused) && (
                <button
                  className="p-1 rounded"
                  style={{ backgroundColor: 'var(--color-danger-light, rgba(217, 83, 79, 0.2))', color: 'var(--color-danger, #d9534f)' }}
                  onClick={() => onIntervene('cancel')}
                  title="取消"
                >
                  <X size={14} />
                </button>
              )}
              {(isCompleted || isFailed || isCancelled) && (
                <button
                  className="p-1 rounded"
                  style={{ backgroundColor: 'var(--color-hover-bg, rgba(255,255,255,0.1))', color: 'var(--color-vscode-text)' }}
                  onClick={onClearPipeline}
                  title="清除"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>

          {/* User Request */}
          <div className="mb-3 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.08))', border: '1px solid var(--color-vscode-border)' }}>
            <span style={{ color: 'var(--color-vscode-active)' }}>需求：</span>
            <span style={{ color: 'var(--color-vscode-text)' }}>{pipelineState.userRequest}</span>
          </div>

          {/* Steps */}
          <div className="space-y-0">
            {pipelineState.steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                index={i}
                isCurrent={i === pipelineState.currentStepIndex && isRunning}
                onSkip={() => onIntervene('skip', undefined, i)}
                onRedirect={(msg) => onIntervene('redirect', msg, i)}
              />
            ))}
          </div>

          {/* Intervention Alert */}
          {pipelineState.intervention && (
            <div className="mt-3 px-3 py-2 rounded text-xs" style={{ backgroundColor: 'var(--color-warning-light, rgba(240, 173, 78, 0.15))', border: '1px solid var(--color-warning, rgba(240, 173, 78, 0.3))' }}>
              <div className="flex items-center gap-1 mb-1">
                <MessageSquare size={12} style={{ color: 'var(--color-warning, #f0ad4e)' }} />
                <span style={{ color: 'var(--color-warning, #f0ad4e)', fontWeight: 600 }}>干预信号</span>
              </div>
              <p style={{ color: 'var(--color-vscode-text)' }}>
                类型: {pipelineState.intervention.type}
                {pipelineState.intervention.message && ` — ${pipelineState.intervention.message}`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!pipelineState && !loading && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>
            <MessageSquare size={32} className="mx-auto mb-2" />
            <p className="text-sm">输入你的写作需求，一键启动全自动写作</p>
          </div>
        </div>
      )}
    </div>
  );
};
