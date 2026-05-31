import React, { useState } from 'react';
import type { PipelineStep1Config } from '../../types';
import { GENRE_PRESETS, PLOT_TYPE_PRESETS, PROTAGONIST_PRESETS, TONE_PRESETS } from './presets';

interface Step1ConfigProps {
  config: PipelineStep1Config;
  onChange: (config: PipelineStep1Config) => void;
}

const tagButtonStyle = (
  selected: boolean,
): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: '12px',
  border: selected
    ? '1px solid var(--color-vscode-active)'
    : '1px solid var(--color-vscode-border)',
  borderRadius: '3px',
  backgroundColor: selected
    ? 'var(--color-vscode-active-medium, rgba(143, 188, 143, 0.3))'
    : 'transparent',
  color: selected
    ? 'var(--color-vscode-active)'
    : 'var(--color-vscode-text)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap' as const,
});

const sectionStyle: React.CSSProperties = {
  marginBottom: '16px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-vscode-text)',
  marginBottom: '6px',
  opacity: 0.85,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  border: '1px solid var(--color-vscode-border)',
  borderRadius: '3px',
  backgroundColor: 'var(--color-vscode-bg)',
  color: 'var(--color-vscode-text)',
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const customInputStyle: React.CSSProperties = {
  ...inputStyle,
  marginTop: '6px',
};

export const Step1Config: React.FC<Step1ConfigProps> = ({ config, onChange }) => {
  const [customGenre, setCustomGenre] = useState('');
  const [customPlotType, setCustomPlotType] = useState('');
  const [customProtagonist, setCustomProtagonist] = useState('');
  const [customTone, setCustomTone] = useState('');

  const toggleGenre = (value: string) => {
    const next = config.genres.includes(value)
      ? config.genres.filter(g => g !== value)
      : [...config.genres, value];
    onChange({ ...config, genres: next });
  };

  const addCustomGenre = () => {
    const v = customGenre.trim();
    if (v && !config.genres.includes(v)) {
      onChange({ ...config, genres: [...config.genres, v] });
      setCustomGenre('');
    }
  };

  const isPresetPlotType = PLOT_TYPE_PRESETS.some(p => p.value === config.plotType);

  const isPresetProtagonist = PROTAGONIST_PRESETS.some(p => p.value === config.protagonistIdentity);

  const isPresetTone = TONE_PRESETS.some(p => p.value === config.tone);

  return (
    <div>
      <div style={sectionStyle}>
        <label style={labelStyle}>主题题材（可多选）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {GENRE_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.genres.includes(opt.value))}
              onClick={() => toggleGenre(opt.value)}
            >
              {opt.label}
            </button>
          ))}
          {config.genres.filter(g => !GENRE_PRESETS.some(p => p.value === g)).map(g => (
            <button
              key={g}
              type="button"
              style={tagButtonStyle(true)}
              onClick={() => toggleGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <input
            type="text"
            style={{ ...customInputStyle, marginTop: 0, flex: 1 }}
            placeholder="自定义题材，回车添加..."
            value={customGenre}
            onChange={e => setCustomGenre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomGenre(); } }}
          />
          <button
            type="button"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--color-vscode-text)',
              cursor: 'pointer',
            }}
            onClick={addCustomGenre}
          >
            添加
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>剧情类型</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PLOT_TYPE_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.plotType === opt.value)}
              onClick={() => onChange({ ...config, plotType: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          style={customInputStyle}
          placeholder="或输入自定义剧情类型..."
          value={isPresetPlotType ? '' : config.plotType}
          onChange={e => {
            if (e.target.value) {
              onChange({ ...config, plotType: e.target.value });
            }
          }}
          onFocus={() => {
            if (isPresetPlotType) {
              onChange({ ...config, plotType: '' });
            }
          }}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>主角身份</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {PROTAGONIST_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.protagonistIdentity === opt.value)}
              onClick={() => onChange({ ...config, protagonistIdentity: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          style={customInputStyle}
          placeholder="或输入自定义主角身份..."
          value={isPresetProtagonist ? '' : config.protagonistIdentity}
          onChange={e => {
            if (e.target.value) {
              onChange({ ...config, protagonistIdentity: e.target.value });
            }
          }}
          onFocus={() => {
            if (isPresetProtagonist) {
              onChange({ ...config, protagonistIdentity: '' });
            }
          }}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>基调</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {TONE_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.tone === opt.value)}
              onClick={() => onChange({ ...config, tone: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          style={customInputStyle}
          placeholder="或输入自定义基调..."
          value={isPresetTone ? '' : config.tone}
          onChange={e => {
            if (e.target.value) {
              onChange({ ...config, tone: e.target.value });
            }
          }}
          onFocus={() => {
            if (isPresetTone) {
              onChange({ ...config, tone: '' });
            }
          }}
        />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>自定义提示词</label>
        <textarea
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="输入你对故事的额外要求或灵感描述..."
          value={config.customPrompt}
          onChange={e => onChange({ ...config, customPrompt: e.target.value })}
        />
      </div>
    </div>
  );
};

export default Step1Config;
