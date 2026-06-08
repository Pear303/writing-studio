import React, { useState, useCallback } from 'react';
import type { ImitationConfig, ImitationCharacter, ImitationStrength, PacingPreference } from '../../types/imitation';
import type { BookDeconstructionResult } from '../../types/book-deconstruction';
import { STRENGTH_LABELS } from '../../types/imitation';

interface ImitationConfigPanelProps {
  deconstruction: BookDeconstructionResult;
  initialConfig?: ImitationConfig;
  onGenerate: (config: ImitationConfig) => void;
  onCancel: () => void;
}

const DEFAULT_CONFIG: ImitationConfig = {
  protagonistName: '',
  protagonistDescription: '',
  coreConflict: '',
  genre: '',
  characters: [],
  strength: 'rhythmic',
  pacingPreference: 'same',
};

export const ImitationConfigPanel: React.FC<ImitationConfigPanelProps> = ({
  deconstruction,
  initialConfig,
  onGenerate,
  onCancel,
}) => {
  const [config, setConfig] = useState<ImitationConfig>(() => {
    // 尝试从 localStorage 恢复草稿
    const saved = localStorage.getItem('imitationConfigDraft');
    if (saved) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch { /* ignore */ }
    }
    return initialConfig || DEFAULT_CONFIG;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // 原书角色列表（用于"对应原书角色"下拉）
  const originalCharacters = deconstruction.crossAnalysis?.characterArcs?.map((a: { characterName: string }) => a.characterName) || [];

  // 保存草稿到 localStorage
  const saveDraft = useCallback((newConfig: ImitationConfig) => {
    localStorage.setItem('imitationConfigDraft', JSON.stringify(newConfig));
  }, []);

  const updateConfig = <K extends keyof ImitationConfig>(key: K, value: ImitationConfig[K]) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    saveDraft(newConfig);
    // 清除对应错误
    if (errors[key]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const addCharacter = () => {
    const newChar: ImitationCharacter = { name: '', role: '', description: '' };
    updateConfig('characters', [...config.characters, newChar]);
  };

  const removeCharacter = (index: number) => {
    const newChars = config.characters.filter((_, i) => i !== index);
    updateConfig('characters', newChars);
  };

  const updateCharacter = (index: number, field: keyof ImitationCharacter, value: string) => {
    const newChars = [...config.characters];
    newChars[index] = { ...newChars[index], [field]: value };
    updateConfig('characters', newChars);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!config.protagonistName.trim()) newErrors.protagonistName = '主角姓名不能为空';
    if (!config.protagonistDescription.trim()) newErrors.protagonistDescription = '主角人设不能为空';
    if (!config.coreConflict.trim()) newErrors.coreConflict = '核心冲突不能为空';
    if (!config.genre.trim()) newErrors.genre = '题材/世界观不能为空';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      // 清除草稿
      localStorage.removeItem('imitationConfigDraft');
      onGenerate(config);
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-sidebar">
        <h3 className="text-vscode-text font-medium text-sm">仿写配置</h3>
        <button
          onClick={onCancel}
          className="text-vscode-text opacity-60 hover:opacity-100 text-xs"
        >
          取消
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 基本信息 */}
        <section className="space-y-3">
          <h4 className="text-vscode-text text-xs font-medium opacity-70">基本信息</h4>

          {/* 新书名（可选） */}
          <label className="block">
            <span className="text-vscode-text text-xs opacity-60">新书名（可选，不填则自动生成）</span>
            <input
              type="text"
              value={config.title || ''}
              onChange={e => updateConfig('title', e.target.value || undefined)}
              placeholder="留空由 AI 自动生成"
              className="input-field mt-1 w-full text-sm"
            />
          </label>

          {/* 主角姓名 */}
          <label className="block">
            <span className="text-vscode-text text-xs opacity-60">主角姓名 *</span>
            <input
              type="text"
              value={config.protagonistName}
              onChange={e => updateConfig('protagonistName', e.target.value)}
              placeholder="输入主角姓名"
              className={`input-field mt-1 w-full text-sm ${errors.protagonistName ? 'border-red-500' : ''}`}
            />
            {errors.protagonistName && <span className="text-red-400 text-xs mt-1">{errors.protagonistName}</span>}
          </label>

          {/* 主角人设 */}
          <label className="block">
            <span className="text-vscode-text text-xs opacity-60">主角人设 *</span>
            <textarea
              value={config.protagonistDescription}
              onChange={e => updateConfig('protagonistDescription', e.target.value)}
              placeholder="描述主角的性格、背景、动机等"
              rows={3}
              className={`input-field mt-1 w-full text-sm resize-none ${errors.protagonistDescription ? 'border-red-500' : ''}`}
            />
            {errors.protagonistDescription && <span className="text-red-400 text-xs mt-1">{errors.protagonistDescription}</span>}
          </label>

          {/* 核心冲突 */}
          <label className="block">
            <span className="text-vscode-text text-xs opacity-60">核心冲突 *</span>
            <textarea
              value={config.coreConflict}
              onChange={e => updateConfig('coreConflict', e.target.value)}
              placeholder="描述新书的核心冲突"
              rows={2}
              className={`input-field mt-1 w-full text-sm resize-none ${errors.coreConflict ? 'border-red-500' : ''}`}
            />
            {errors.coreConflict && <span className="text-red-400 text-xs mt-1">{errors.coreConflict}</span>}
          </label>

          {/* 题材/世界观 */}
          <label className="block">
            <span className="text-vscode-text text-xs opacity-60">题材/世界观 *</span>
            <input
              type="text"
              value={config.genre}
              onChange={e => updateConfig('genre', e.target.value)}
              placeholder="如：仙侠、都市、科幻..."
              className={`input-field mt-1 w-full text-sm ${errors.genre ? 'border-red-500' : ''}`}
            />
            {errors.genre && <span className="text-red-400 text-xs mt-1">{errors.genre}</span>}
          </label>
        </section>

        {/* 仿写强度 */}
        <section className="space-y-2">
          <h4 className="text-vscode-text text-xs font-medium opacity-70">仿写强度</h4>
          <div className="grid grid-cols-3 gap-2">
            {(['strict', 'rhythmic', 'loose'] as ImitationStrength[]).map(s => (
              <button
                key={s}
                onClick={() => updateConfig('strength', s)}
                className={`p-2 rounded border text-xs text-center transition-colors ${
                  config.strength === s
                    ? 'border-vscode-active bg-vscode-active/20 text-vscode-text'
                    : 'border-vscode-border text-vscode-text opacity-60 hover:opacity-80'
                }`}
              >
                <div className="font-medium">{STRENGTH_LABELS[s].label}</div>
                <div className="opacity-60 mt-0.5 text-[10px]">{STRENGTH_LABELS[s].desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 节奏偏好 */}
        <section className="space-y-2">
          <h4 className="text-vscode-text text-xs font-medium opacity-70">节奏偏好</h4>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'tighter' as PacingPreference, label: '更紧凑', desc: '减少过渡章节' },
              { value: 'same' as PacingPreference, label: '与原书一致', desc: '保持原书节奏' },
              { value: 'looser' as PacingPreference, label: '更舒缓', desc: '增加氛围章节' },
            ]).map(p => (
              <button
                key={p.value}
                onClick={() => updateConfig('pacingPreference', p.value)}
                className={`p-2 rounded border text-xs text-center transition-colors ${
                  config.pacingPreference === p.value
                    ? 'border-vscode-active bg-vscode-active/20 text-vscode-text'
                    : 'border-vscode-border text-vscode-text opacity-60 hover:opacity-80'
                }`}
              >
                <div className="font-medium">{p.label}</div>
                <div className="opacity-60 mt-0.5 text-[10px]">{p.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 自定义剧情走向 */}
        <section className="space-y-2">
          <h4 className="text-vscode-text text-xs font-medium opacity-70">自定义剧情走向（可选）</h4>
          <textarea
            value={config.customPlotHint || ''}
            onChange={e => updateConfig('customPlotHint', e.target.value || undefined)}
            placeholder="描述你希望剧情走向的特别要求..."
            rows={2}
            className="input-field w-full text-sm resize-none"
          />
        </section>

        {/* 配角设定 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-vscode-text text-xs font-medium opacity-70">配角设定</h4>
            <button
              onClick={addCharacter}
              className="text-xs text-vscode-active hover:opacity-80"
            >
              + 添加配角
            </button>
          </div>

          {config.characters.length === 0 && (
            <div className="text-vscode-text opacity-40 text-xs py-2">暂无配角，点击上方按钮添加</div>
          )}

          {config.characters.map((char, i) => (
            <div key={i} className="bg-vscode-sidebar border border-vscode-border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-vscode-text text-xs font-medium">配角 {i + 1}</span>
                <button
                  onClick={() => removeCharacter(i)}
                  className="text-vscode-text opacity-40 hover:opacity-80 text-xs"
                >
                  删除
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={char.name}
                  onChange={e => updateCharacter(i, 'name', e.target.value)}
                  placeholder="角色名"
                  className="input-field text-xs"
                />
                <input
                  type="text"
                  value={char.role}
                  onChange={e => updateCharacter(i, 'role', e.target.value)}
                  placeholder="角色定位"
                  className="input-field text-xs"
                />
              </div>
              <input
                type="text"
                value={char.description}
                onChange={e => updateCharacter(i, 'description', e.target.value)}
                placeholder="人设描述"
                className="input-field text-xs w-full"
              />
              {originalCharacters.length > 0 && (
                <select
                  value={char.correspondsTo || ''}
                  onChange={e => updateCharacter(i, 'correspondsTo', e.target.value || '')}
                  className="select-field text-xs w-full"
                >
                  <option value="">对应原书角色（可选）</option>
                  {originalCharacters.map((name: string) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </section>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-vscode-border bg-vscode-sidebar">
        <button
          onClick={handleSubmit}
          className="w-full py-2 bg-vscode-active text-white text-sm rounded hover:opacity-90 transition-colors"
        >
          开始仿写
        </button>
      </div>
    </div>
  );
};
