import React, { useState, useEffect } from 'react';
import { Save, FolderOpen, X } from 'lucide-react';
import type { PipelineStep3Config, Material } from '../../types';
import { WRITING_STYLE_PRESETS, STORY_LENGTH_PRESETS, CUSTOM_RULE_TEMPLATES } from './presets';
import { db, getCurrentUserId } from '../../db';
import { generateId } from '../../utils/helpers';

interface Step3StyleProps {
  config: PipelineStep3Config;
  onChange: (config: PipelineStep3Config) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
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
    ? 'white'
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

const smallBtnStyle = (variant: 'primary' | 'secondary'): React.CSSProperties => ({
  padding: '4px 10px',
  fontSize: '11px',
  border: '1px solid var(--color-vscode-border)',
  borderRadius: '3px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  backgroundColor: variant === 'primary' ? 'var(--color-vscode-active)' : 'transparent',
  color: variant === 'primary' ? 'white' : 'var(--color-vscode-text)',
  transition: 'all 0.15s ease',
});

export const Step3Style: React.FC<Step3StyleProps> = ({ config, onChange, showToast }) => {
  const [showRulePicker, setShowRulePicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [ruleMaterials, setRuleMaterials] = useState<Material[]>([]);
  const [styleMaterials, setStyleMaterials] = useState<Material[]>([]);

  const loadMaterialsByType = async (type: 'writing_rule' | 'style_rule') => {
    try {
      const currentUserId = getCurrentUserId();
      let all = await db.materials.where('type').equals(type).reverse().sortBy('updatedAt');
      if (currentUserId) {
        all = all.filter(m => m.userId === currentUserId);
      }
      return all;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (showRulePicker) {
      loadMaterialsByType('writing_rule').then(setRuleMaterials);
    }
  }, [showRulePicker]);

  useEffect(() => {
    if (showStylePicker) {
      loadMaterialsByType('style_rule').then(setStyleMaterials);
    }
  }, [showStylePicker]);

  const toggleRule = (value: string) => {
    const rules = config.customRules
      ? config.customRules.split('\n').filter(r => r.trim())
      : [];
    const next = rules.includes(value)
      ? rules.filter(r => r !== value)
      : [...rules, value];
    onChange({ ...config, customRules: next.join('\n') });
  };

  const isRuleSelected = (value: string) => {
    const rules = config.customRules
      ? config.customRules.split('\n').filter(r => r.trim())
      : [];
    return rules.includes(value);
  };

  const handleSaveRulesAsMaterial = async () => {
    const rules = config.customRules?.trim();
    if (!rules) {
      showToast?.('没有可保存的规则内容', 'warning');
      return;
    }
    const name = prompt('请输入写作规则名称:');
    if (!name) return;

    const newMaterial: Material = {
      id: generateId(),
      userId: getCurrentUserId() || undefined,
      type: 'writing_rule',
      name,
      description: rules,
      fields: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await db.materials.add(newMaterial);
      showToast?.('已保存为写作规则', 'success');
    } catch {
      showToast?.('保存失败，请重试', 'error');
    }
  };

  const handleSaveStyleAsMaterial = async () => {
    const style = config.writingStyle?.trim();
    if (!style) {
      showToast?.('没有可保存的文风内容', 'warning');
      return;
    }
    const name = prompt('请输入文风规则名称:');
    if (!name) return;

    const newMaterial: Material = {
      id: generateId(),
      userId: getCurrentUserId() || undefined,
      type: 'style_rule',
      name,
      description: style,
      fields: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await db.materials.add(newMaterial);
      showToast?.('已保存为文风规则', 'success');
    } catch {
      showToast?.('保存失败，请重试', 'error');
    }
  };

  const handleLoadRule = (material: Material) => {
    const existing = config.customRules?.trim() || '';
    const loaded = material.description?.trim() || '';
    const merged = existing ? `${existing}\n${loaded}` : loaded;
    onChange({ ...config, customRules: merged });
    setShowRulePicker(false);
    showToast?.(`已加载规则：${material.name}`, 'success');
  };

  const handleLoadStyle = (material: Material) => {
    onChange({ ...config, writingStyle: material.description || material.name });
    setShowStylePicker(false);
    showToast?.(`已加载文风：${material.name}`, 'success');
  };

  const pickerOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-modal-overlay, rgba(0,0,0,0.5))',
  };

  const pickerBoxStyle: React.CSSProperties = {
    width: '360px',
    maxHeight: '400px',
    backgroundColor: 'var(--color-vscode-sidebar)',
    border: '1px solid var(--color-vscode-border)',
    borderRadius: '3px',
    display: 'flex',
    flexDirection: 'column',
  };

  const renderPicker = (
    title: string,
    materials: Material[],
    onSelect: (m: Material) => void,
    onClose: () => void,
  ) => (
    <div style={pickerOverlayStyle} onClick={onClose}>
      <div style={pickerBoxStyle} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--color-vscode-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-vscode-text)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-vscode-text)' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          {materials.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-vscode-text)', opacity: 0.5, fontSize: '12px' }}>
              暂无素材，请先在素材箱中创建
            </div>
          ) : (
            materials.map(m => (
              <div
                key={m.id}
                onClick={() => onSelect(m)}
                style={{
                  padding: '8px 10px',
                  marginBottom: '4px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-vscode-active)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-vscode-border)'; }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)', marginBottom: '2px' }}>{m.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.description || '暂无描述'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={sectionStyle}>
        <label style={labelStyle}>文风</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {WRITING_STYLE_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.writingStyle === opt.value)}
              onClick={() => onChange({ ...config, writingStyle: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          style={{ ...inputStyle, marginTop: '8px' }}
          placeholder="或输入自定义文风..."
          value={!WRITING_STYLE_PRESETS.some(p => p.value === config.writingStyle) ? config.writingStyle : ''}
          onChange={e => {
            if (e.target.value) {
              onChange({ ...config, writingStyle: e.target.value });
            }
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
          <button type="button" style={smallBtnStyle('secondary')} onClick={handleSaveStyleAsMaterial}>
            <Save size={11} />
            保存为文风规则
          </button>
          <button type="button" style={smallBtnStyle('secondary')} onClick={() => setShowStylePicker(true)}>
            <FolderOpen size={11} />
            从素材库加载
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>故事长度</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {STORY_LENGTH_PRESETS.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(config.storyLength === opt.value)}
              onClick={() => onChange({ ...config, storyLength: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>自定义额外规则（可多选预设，也可手动输入）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {CUSTOM_RULE_TEMPLATES.map(opt => (
            <button
              key={opt.value}
              type="button"
              style={tagButtonStyle(isRuleSelected(opt.value))}
              onClick={() => toggleRule(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <textarea
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="每行一条规则，例如：&#10;每章结尾必须有悬念&#10;避免使用网络用语"
          value={config.customRules}
          onChange={e => onChange({ ...config, customRules: e.target.value })}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
          <button type="button" style={smallBtnStyle('secondary')} onClick={handleSaveRulesAsMaterial}>
            <Save size={11} />
            保存为写作规则
          </button>
          <button type="button" style={smallBtnStyle('secondary')} onClick={() => setShowRulePicker(true)}>
            <FolderOpen size={11} />
            从素材库加载
          </button>
        </div>
      </div>

      {showRulePicker && renderPicker('选择写作规则', ruleMaterials, handleLoadRule, () => setShowRulePicker(false))}
      {showStylePicker && renderPicker('选择文风规则', styleMaterials, handleLoadStyle, () => setShowStylePicker(false))}
    </div>
  );
};

export default Step3Style;
