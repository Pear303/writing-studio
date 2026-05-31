import React, { useState } from 'react';
import { Copy, Upload, Loader2, RefreshCw } from 'lucide-react';
import type { PipelineStep1Config, Volume, PipelineStep2State, OutlineRound } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';

interface Step2OutlineProps {
  step1Config: PipelineStep1Config;
  selectedVolume: Volume | null;
  step2State: PipelineStep2State | null;
  onStep2StateChange: (state: PipelineStep2State) => void;
  onGenerateOutline: (config: PipelineStep1Config) => Promise<string>;
  onRefineOutline: (step2State: PipelineStep2State, round: OutlineRound) => Promise<string>;
  onOverwriteOutline: (markdown: string) => void;
}

const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'warning'): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '6px 14px',
    fontSize: '12px',
    border: '1px solid var(--color-vscode-border)',
    borderRadius: '3px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.15s ease',
  };
  if (variant === 'primary') {
    return { ...base, backgroundColor: 'var(--color-vscode-active)', color: 'white', borderColor: 'var(--color-vscode-active)' };
  }
  if (variant === 'danger') {
    return { ...base, backgroundColor: 'var(--color-danger, #dc2626)', color: 'white', borderColor: 'var(--color-danger, #dc2626)' };
  }
  if (variant === 'warning') {
    return { ...base, backgroundColor: '#d97706', color: 'white', borderColor: '#d97706' };
  }
  return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-text)' };
};

const sectionLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--color-vscode-text)',
  marginBottom: '4px',
  opacity: 0.75,
};

const refineTextareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  border: '1px solid var(--color-vscode-border)',
  borderRadius: '3px',
  backgroundColor: 'var(--color-vscode-bg)',
  color: 'var(--color-vscode-text)',
  outline: 'none',
  boxSizing: 'border-box' as const,
  minHeight: '48px',
  resize: 'vertical',
  fontFamily: 'inherit',
};

export const Step2Outline: React.FC<Step2OutlineProps> = ({
  step1Config,
  selectedVolume,
  step2State,
  onStep2StateChange,
  onGenerateOutline,
  onRefineOutline,
  onOverwriteOutline,
}) => {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [additions, setAdditions] = useState('');
  const [deletions, setDeletions] = useState('');
  const [modifications, setModifications] = useState('');

  const outlineText = step2State?.currentOutline || '';
  const hasOutline = !!outlineText;
  const roundCount = step2State?.rounds.length || 0;

  const handleGenerate = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const result = await onGenerateOutline(step1Config);
      onStep2StateChange({
        originalOutline: result,
        currentOutline: result,
        rounds: [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成大纲失败');
    } finally {
      setIsWorking(false);
    }
  };

  const handleRefine = async () => {
    setIsWorking(true);
    setError(null);

    const hasInput = additions.trim() || deletions.trim() || modifications.trim();

    if (!hasInput || !step2State) {
      try {
        const result = await onGenerateOutline(step1Config);
        onStep2StateChange({
          originalOutline: result,
          currentOutline: result,
          rounds: [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : '生成大纲失败');
      } finally {
        setIsWorking(false);
      }
      return;
    }

    const currentRound: OutlineRound = {
      additions: additions.trim(),
      deletions: deletions.trim(),
      modifications: modifications.trim(),
    };
    try {
      const result = await onRefineOutline(step2State, currentRound);
      onStep2StateChange({
        ...step2State,
        currentOutline: result,
        rounds: [...step2State.rounds, currentRound],
      });
      setAdditions('');
      setDeletions('');
      setModifications('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '回炉重造失败');
    } finally {
      setIsWorking(false);
    }
  };

  const handleOutlineEdit = (value: string) => {
    if (step2State) {
      onStep2StateChange({ ...step2State, currentOutline: value });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outlineText);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = outlineText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleOverwrite = () => {
    setShowConfirm(true);
  };

  const confirmOverwrite = () => {
    setShowConfirm(false);
    onOverwriteOutline(outlineText);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!hasOutline && !isWorking && (
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7, marginBottom: '16px' }}>
            根据第1步的配置生成第一轮大纲
          </p>
          <button
            type="button"
            style={btnStyle('primary')}
            onClick={handleGenerate}
          >
            开始生成大纲
          </button>
        </div>
      )}

      {isWorking && (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Loader2 size={32} style={{ color: 'var(--color-vscode-active)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
            正在回炉重造，请稍候...
          </p>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 12px',
          margin: '8px 0',
          backgroundColor: 'var(--color-danger-light, rgba(220, 38, 38, 0.2))',
          border: '1px solid var(--color-danger, #dc2626)',
          borderRadius: '3px',
          fontSize: '12px',
          color: 'var(--color-danger, #dc2626)',
        }}>
          {error}
        </div>
      )}

      {hasOutline && !isWorking && (
        <>
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--color-vscode-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '12px', color: 'var(--color-vscode-text)', opacity: 0.7 }}>
              {roundCount > 0 ? `第${roundCount + 1}轮大纲` : '第一轮大纲'} · 目标卷：{selectedVolume?.name || '未选择'}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" style={btnStyle('secondary')} onClick={handleCopy}>
                <Copy size={12} />
                {copySuccess ? '已复制' : '一键复制'}
              </button>
              <button type="button" style={btnStyle('danger')} onClick={handleOverwrite}>
                <Upload size={12} />
                覆盖本卷大纲
              </button>
            </div>
          </div>

          <textarea
            value={outlineText}
            onChange={e => handleOutlineEdit(e.target.value)}
            style={{
              flex: 1,
              width: '100%',
              resize: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-vscode-text)',
              border: 'none',
              outline: 'none',
              padding: '12px',
              fontSize: '13px',
              fontFamily: 'var(--editor-font-family, Consolas, Monaco, "Courier New", monospace)',
              lineHeight: '1.6',
              boxSizing: 'border-box' as const,
              minHeight: '120px',
            }}
            spellCheck={false}
          />

          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--color-vscode-border)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-vscode-text)', opacity: 0.8, marginBottom: '8px' }}>
              你想要新增/删除/修改的部分
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={sectionLabelStyle}>新增部分</label>
                <textarea
                  style={refineTextareaStyle}
                  placeholder="描述你想在大纲中新增的内容..."
                  value={additions}
                  onChange={e => setAdditions(e.target.value)}
                />
              </div>
              <div>
                <label style={sectionLabelStyle}>删除部分</label>
                <textarea
                  style={refineTextareaStyle}
                  placeholder="描述你想从大纲中删除的内容..."
                  value={deletions}
                  onChange={e => setDeletions(e.target.value)}
                />
              </div>
              <div>
                <label style={sectionLabelStyle}>修改部分</label>
                <textarea
                  style={refineTextareaStyle}
                  placeholder="描述你想在大纲中修改的内容..."
                  value={modifications}
                  onChange={e => setModifications(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5 }}>
                {roundCount > 0 ? `已迭代 ${roundCount} 轮` : '留空回炉重造将随机重新生成'}
              </span>
              <button
                type="button"
                style={{
                  ...btnStyle('warning'),
                  opacity: isWorking ? 0.5 : 1,
                  cursor: isWorking ? 'not-allowed' : 'pointer',
                }}
                disabled={isWorking}
                onClick={handleRefine}
              >
                {isWorking ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                回炉重造
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={showConfirm}
        title="覆盖本卷大纲"
        message="是否覆盖本卷大纲？你之前所写的内容会丢失！"
        confirmText="确认覆盖"
        cancelText="取消"
        danger
        onConfirm={confirmOverwrite}
        onCancel={() => setShowConfirm(false)}
      />

      {isWorking && (
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
};

export default Step2Outline;
