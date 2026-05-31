import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FolderPlus, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Book, Volume, PipelineStep, PipelineStep1Config, PipelineStep3Config, PipelineStep2State, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound, PipelineSession } from '../../types';
import { db } from '../../db';
import { Step1Config } from './Step1Config';
import { Step2Outline } from './Step2Outline';
import { Step3Style } from './Step3Style';
import { Step4DetailedOutline } from './Step4DetailedOutline';
import { Step5WriteText } from './Step5WriteText';

interface PipelineWritingProps {
  currentBook: Book | null;
  currentOutlineVolume: Volume | null;
  onVolumeSelect: (volume: Volume) => void;
  onGenerateOutline: (config: PipelineStep1Config) => Promise<string>;
  onRefineOutline: (step2State: PipelineStep2State, round: OutlineRound) => Promise<string>;
  onOverwriteOutline: (markdown: string) => void;
  onGenerateDetailedOutline: (outline: string, chapterCount: number) => Promise<string>;
  onRefineDetailedOutline: (step4State: PipelineStep4State, round: DetailedOutlineRound, outline: string) => Promise<string>;
  onRefineDetailedOutlineChapter: (step4State: PipelineStep4State, chapterIndices: number[], round: DetailedOutlineRound, outline: string) => Promise<string>;
  onGenerateChapter: (chapterIndex: number) => Promise<string>;
  onRefineChapter: (step5State: PipelineStep5State, chapterIndex: number, round: ChapterDraftRound) => Promise<string>;
  onAddChapterToVolume: (title: string, content: string) => void;
  onPreviewInEditor?: (title: string, content: string, onChange: (content: string) => void) => void;
  showToast: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

const defaultStep1Config: PipelineStep1Config = {
  genres: [],
  plotType: '',
  protagonistIdentity: '',
  customPrompt: '',
  tone: '',
};

const defaultStep3Config: PipelineStep3Config = {
  writingStyle: '',
  storyLength: '',
  customRules: '',
};

const STEP_LABELS: Record<PipelineStep, string> = {
  step1: '选择题材',
  step2: '生成大纲',
  step3: '风格设置',
  step4: '生成细纲',
  step5: '生成正文',
};

const STEP_ORDER: PipelineStep[] = ['step1', 'step2', 'step3', 'step4', 'step5'];

export const PipelineWriting: React.FC<PipelineWritingProps> = ({
  currentBook,
  currentOutlineVolume,
  onVolumeSelect,
  onGenerateOutline,
  onRefineOutline,
  onOverwriteOutline,
  onGenerateDetailedOutline,
  onRefineDetailedOutline,
  onRefineDetailedOutlineChapter,
  onGenerateChapter,
  onRefineChapter,
  onAddChapterToVolume,
  onPreviewInEditor,
  showToast,
}) => {
  const [step, setStep] = useState<PipelineStep>('step1');
  const [step1Config, setStep1Config] = useState<PipelineStep1Config>(defaultStep1Config);
  const [step3Config, setStep3Config] = useState<PipelineStep3Config>(defaultStep3Config);
  const [step2State, setStep2State] = useState<PipelineStep2State | null>(null);
  const [step4State, setStep4State] = useState<PipelineStep4State | null>(null);
  const [step5State, setStep5State] = useState<PipelineStep5State | null>(null);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(
    currentOutlineVolume?.id || null,
  );
  const [creatingVolume, setCreatingVolume] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState('');
  const [sessionLoaded, setSessionLoaded] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getSessionId = useCallback(() => {
    if (!currentBook?.id || !selectedVolumeId) return null;
    return `${currentBook.id}_${selectedVolumeId}`;
  }, [currentBook?.id, selectedVolumeId]);

  const saveSession = useCallback(async () => {
    const id = getSessionId();
    if (!id || !currentBook?.id || !selectedVolumeId) return;
    const session: PipelineSession = {
      id,
      bookId: currentBook.id,
      volumeId: selectedVolumeId,
      currentStep: step,
      step1Config,
      step3Config,
      step2State,
      step4State,
      step5State,
      updatedAt: Date.now(),
    };
    try {
      await db.pipelineSessions.put(session);
    } catch (err) {
      console.error('保存流水线会话失败:', err);
    }
  }, [getSessionId, currentBook?.id, selectedVolumeId, step, step1Config, step3Config, step2State, step4State, step5State]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveSession();
    }, 500);
  }, [saveSession]);

  const loadSession = useCallback(async () => {
    const id = getSessionId();
    if (!id) {
      setSessionLoaded(true);
      return;
    }
    try {
      const session = await db.pipelineSessions.get(id);
      if (session) {
        setStep(session.currentStep);
        setStep1Config(session.step1Config);
        setStep3Config(session.step3Config);
        setStep2State(session.step2State);
        setStep4State(session.step4State ?? null);
        setStep5State(session.step5State ?? null);
      } else {
        setStep('step1');
        setStep1Config(defaultStep1Config);
        setStep3Config(defaultStep3Config);
        setStep2State(null);
        setStep4State(null);
        setStep5State(null);
      }
    } catch (err) {
      console.error('加载流水线会话失败:', err);
    }
    setSessionLoaded(true);
  }, [getSessionId]);

  useEffect(() => {
    if (currentBook) {
      loadVolumes();
    }
  }, [currentBook?.id]);

  useEffect(() => {
    if (currentOutlineVolume?.id) {
      setSelectedVolumeId(currentOutlineVolume.id);
    }
  }, [currentOutlineVolume?.id]);

  useEffect(() => {
    if (selectedVolumeId && currentBook?.id) {
      loadSession();
    }
  }, [selectedVolumeId, currentBook?.id, loadSession]);

  useEffect(() => {
    if (sessionLoaded && selectedVolumeId && currentBook?.id) {
      debouncedSave();
    }
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [step, step1Config, step3Config, step2State, step4State, step5State, sessionLoaded, selectedVolumeId, currentBook?.id, debouncedSave]);

  const loadVolumes = async () => {
    if (!currentBook) return;
    const vols = await db.volumes
      .where('bookId')
      .equals(currentBook.id)
      .sortBy('order');
    setVolumes(vols);
  };

  const selectedVolume = volumes.find(v => v.id === selectedVolumeId) || null;

  const handleCreateVolume = async () => {
    if (!currentBook) return;
    const name = newVolumeName.trim() || `第${volumes.length + 1}卷`;
    try {
      const { v4: uuidv4 } = await import('uuid');
      const id = uuidv4();
      await db.volumes.add({
        id,
        bookId: currentBook.id,
        parentId: null,
        name,
        order: volumes.length,
      });
      setNewVolumeName('');
      setCreatingVolume(false);
      await loadVolumes();
      const created = await db.volumes.get(id);
      if (created) {
        setSelectedVolumeId(id);
        onVolumeSelect(created);
      }
      showToast(`卷「${name}」已创建`, 'success');
    } catch (err) {
      showToast('创建卷失败', 'error');
    }
  };

  const canGoNext = (): boolean => {
    if (step === 'step1') {
      return step1Config.genres.length > 0 || !!step1Config.customPrompt.trim();
    }
    if (step === 'step2') {
      return true;
    }
    if (step === 'step3') {
      return true;
    }
    if (step === 'step4') {
      return true;
    }
    return false;
  };

  const handleNext = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]);
    }
  };

  const handlePrev = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      setStep(STEP_ORDER[idx - 1]);
    }
  };

  const handleVolumeSelect = (vol: Volume) => {
    setSelectedVolumeId(vol.id);
    onVolumeSelect(vol);
  };

  const handleStep2StateChange = (newState: PipelineStep2State) => {
    setStep2State(newState);
  };

  const handleStep4StateChange = (newState: PipelineStep4State) => {
    setStep4State(newState);
  };

  const handleStep5StateChange = (newState: PipelineStep5State) => {
    setStep5State(newState);
  };

  const stepIndicatorStyle = (s: PipelineStep): React.CSSProperties => {
    const idx = STEP_ORDER.indexOf(s);
    const currentIdx = STEP_ORDER.indexOf(step);
    const isActive = s === step;
    const isCompleted = idx < currentIdx;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontSize: '11px',
      color: isActive
        ? 'var(--color-vscode-active-text, var(--color-vscode-active))'
        : isCompleted
          ? 'var(--color-vscode-active-text, var(--color-vscode-active))'
          : 'var(--color-vscode-text)',
      opacity: isActive ? 1 : isCompleted ? 0.7 : 0.4,
      fontWeight: isActive ? 600 : 400,
      cursor: 'pointer',
    };
  };

  const dotStyle = (s: PipelineStep): React.CSSProperties => {
    const idx = STEP_ORDER.indexOf(s);
    const currentIdx = STEP_ORDER.indexOf(step);
    const isActive = s === step;
    const isCompleted = idx < currentIdx;
    return {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: isActive
        ? 'var(--color-vscode-active)'
        : isCompleted
          ? 'var(--color-vscode-active)'
          : 'var(--color-vscode-border)',
      flexShrink: 0,
    };
  };

  const navBtnStyle = (variant: 'primary' | 'secondary' | 'disabled'): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: '6px 16px',
      fontSize: '12px',
      border: '1px solid var(--color-vscode-border)',
      borderRadius: '3px',
      cursor: variant === 'disabled' ? 'not-allowed' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      transition: 'all 0.15s ease',
    };
    if (variant === 'primary') {
      return { ...base, backgroundColor: 'var(--color-vscode-active)', color: 'white', borderColor: 'var(--color-vscode-active)' };
    }
    if (variant === 'disabled') {
      return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-text)', opacity: 0.4 };
    }
    return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-text)' };
  };

  if (!currentBook) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.6 }}>
          请先选择一本书籍
        </p>
      </div>
    );
  }

  if (volumes.length === 0 && !creatingVolume) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', opacity: 0.7, marginBottom: '12px' }}>
          当前书籍还没有卷，请先创建第一个卷
        </p>
        <button
          type="button"
          style={navBtnStyle('primary')}
          onClick={() => setCreatingVolume(true)}
        >
          <FolderPlus size={14} />
          创建第一个卷
        </button>
      </div>
    );
  }

  if (creatingVolume) {
    return (
      <div style={{ padding: '24px 16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', marginBottom: '12px', fontWeight: 600 }}>
          创建新卷
        </p>
        <input
          type="text"
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '12px',
            border: '1px solid var(--color-vscode-border)',
            borderRadius: '3px',
            backgroundColor: 'var(--color-vscode-bg)',
            color: 'var(--color-vscode-text)',
            outline: 'none',
            boxSizing: 'border-box' as const,
            marginBottom: '12px',
          }}
          placeholder="输入卷名（留空则自动命名）"
          value={newVolumeName}
          onChange={e => setNewVolumeName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateVolume()}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" style={navBtnStyle('primary')} onClick={handleCreateVolume}>
            确认创建
          </button>
          <button type="button" style={navBtnStyle('secondary')} onClick={() => setCreatingVolume(false)}>
            取消
          </button>
        </div>
      </div>
    );
  }

  if (!selectedVolumeId) {
    return (
      <div style={{ padding: '16px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-vscode-text)', marginBottom: '12px', fontWeight: 600 }}>
          请选择一个卷
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {volumes.map(vol => (
            <button
              key={vol.id}
              type="button"
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                border: '1px solid var(--color-vscode-border)',
                borderRadius: '3px',
                backgroundColor: 'transparent',
                color: 'var(--color-vscode-text)',
                cursor: 'pointer',
                textAlign: 'left' as const,
              }}
              onClick={() => handleVolumeSelect(vol)}
            >
              {vol.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--color-vscode-border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.6, marginBottom: '4px' }}>
          当前卷：{selectedVolume?.name}
          <button
            type="button"
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              color: 'var(--color-vscode-active)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={() => setSelectedVolumeId(null)}
          >
            切换
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {STEP_ORDER.map((s, idx) => (
            <React.Fragment key={s}>
              <button
                type="button"
                style={stepIndicatorStyle(s)}
                onClick={() => {
                  const currentIdx = STEP_ORDER.indexOf(step);
                  if (STEP_ORDER.indexOf(s) <= currentIdx) setStep(s);
                }}
              >
                <span style={dotStyle(s)} />
                {STEP_LABELS[s]}
              </button>
              {idx < STEP_ORDER.length - 1 && (
                <div style={{
                  flex: '0 0 8px',
                  height: '1px',
                  backgroundColor: 'var(--color-vscode-border)',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: (step === 'step2' || step === 'step4' || step === 'step5') ? '0' : '12px' }}>
        {step === 'step1' && (
          <Step1Config config={step1Config} onChange={setStep1Config} />
        )}
        {step === 'step2' && (
          <Step2Outline
            step1Config={step1Config}
            selectedVolume={selectedVolume}
            step2State={step2State}
            onStep2StateChange={handleStep2StateChange}
            onGenerateOutline={onGenerateOutline}
            onRefineOutline={onRefineOutline}
            onOverwriteOutline={onOverwriteOutline}
            onPreviewInEditor={onPreviewInEditor}
          />
        )}
        {step === 'step3' && (
          <Step3Style config={step3Config} onChange={setStep3Config} showToast={showToast} />
        )}
        {step === 'step4' && (
          <Step4DetailedOutline
            step2State={step2State}
            step4State={step4State}
            onStep4StateChange={handleStep4StateChange}
            onGenerateDetailedOutline={onGenerateDetailedOutline}
            onRefineDetailedOutline={onRefineDetailedOutline}
            onRefineDetailedOutlineChapter={onRefineDetailedOutlineChapter}
            onOverwriteOutline={onOverwriteOutline}
            onPreviewInEditor={onPreviewInEditor}
          />
        )}
        {step === 'step5' && (
          <Step5WriteText
            step2State={step2State}
            step4State={step4State}
            step3Config={step3Config}
            step5State={step5State}
            onStep5StateChange={handleStep5StateChange}
            onGenerateChapter={onGenerateChapter}
            onRefineChapter={onRefineChapter}
            onAddChapterToVolume={onAddChapterToVolume}
            onPreviewInEditor={onPreviewInEditor}
          />
        )}
      </div>

      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--color-vscode-border)',
        display: 'flex',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <button
          type="button"
          style={step === 'step1' ? navBtnStyle('disabled') : navBtnStyle('secondary')}
          onClick={handlePrev}
          disabled={step === 'step1'}
        >
          <ChevronLeft size={14} />
          上一步
        </button>
        {step !== 'step5' ? (
          <button
            type="button"
            style={canGoNext() ? navBtnStyle('primary') : navBtnStyle('disabled')}
            onClick={canGoNext() ? handleNext : undefined}
            disabled={!canGoNext()}
          >
            下一步
            <ChevronRight size={14} />
          </button>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, alignSelf: 'center' }}>
            逐章生成正文
          </span>
        )}
      </div>
    </div>
  );
};

export default PipelineWriting;
