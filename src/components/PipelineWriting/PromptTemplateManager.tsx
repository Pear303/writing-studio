import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Edit3, Copy, ChevronDown, ChevronRight, Save, RotateCcw, CheckCircle } from 'lucide-react';
import type { PipelinePromptTemplate } from '../../types';
import { PROMPT_TEMPLATES } from '../../prompts';
import {
  getPipelinePromptTemplates,
  ensureDefaultPipelinePromptTemplates,
  addPipelinePromptTemplate,
  updatePipelinePromptTemplate,
  deletePipelinePromptTemplate,
  getCurrentUserId,
} from '../../db';

interface PromptTemplateManagerProps {
  onClose: () => void;
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
}

const STAGE_LABELS: Record<string, string> = {
  PLANNING: '大纲规划',
  DETAILED_OUTLINE: '细纲生成',
  CHAPTER_WRITING: '正文写作',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '12px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--color-vscode-text)',
  marginBottom: '4px',
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

const btnStyle = (variant: 'primary' | 'secondary' | 'danger' | 'ghost'): React.CSSProperties => {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '11px',
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
    return { ...base, backgroundColor: 'transparent', color: 'var(--color-danger, #dc2626)' };
  }
  if (variant === 'ghost') {
    return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-text)', border: 'none', padding: '2px 6px' };
  }
  return { ...base, backgroundColor: 'transparent', color: 'var(--color-vscode-text)' };
};

export const PromptTemplateManager: React.FC<PromptTemplateManagerProps> = ({ onClose, showToast }) => {
  const [templates, setTemplates] = useState<PipelinePromptTemplate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    description: '',
    builtInId: '',
    content: '',
    stage: 'CHAPTER_WRITING' as 'PLANNING' | 'DETAILED_OUTLINE' | 'CHAPTER_WRITING' | 'CONTINUATION',
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const userId = getCurrentUserId();
    if (!userId) return;
    await ensureDefaultPipelinePromptTemplates(userId);
    const loaded = await getPipelinePromptTemplates(userId);
    setTemplates(loaded);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleStartEdit = (template: PipelinePromptTemplate) => {
    setEditingId(template.id);
    setEditContent(template.content);
    setEditName(template.name);
    setEditDescription(template.description);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async (template: PipelinePromptTemplate) => {
    try {
      const updates: { name?: string; description?: string; content?: string } = {};
      if (!template.builtIn) {
        updates.name = editName.trim();
        updates.description = editDescription.trim();
      }
      updates.content = editContent.trim();
      await updatePipelinePromptTemplate(template.id, updates);
      setEditingId(null);
      await loadTemplates();
      showToast?.('模板已保存', 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const handleResetToDefault = async (template: PipelinePromptTemplate) => {
    try {
      await updatePipelinePromptTemplate(template.id, { content: '' });
      setEditingId(null);
      await loadTemplates();
      showToast?.('已恢复为默认模板', 'success');
    } catch (err) {
      showToast?.('恢复失败', 'error');
    }
  };

  const handleCopyFromBuiltIn = async (template: PipelinePromptTemplate) => {
    const builtInConfig = PROMPT_TEMPLATES[template.builtInId];
    if (!builtInConfig) return;

    try {
      const modules = import.meta.glob('../../prompts/templates/**/*.md', {
        query: '?raw',
        eager: true,
        import: 'default',
      });
      const normalizedPath = builtInConfig.file.replace('./templates/', '../../prompts/templates/');
      const content = modules[normalizedPath];
      if (typeof content === 'string') {
        setEditContent(content);
        showToast?.('已复制默认模板内容', 'success');
      }
    } catch {
      showToast?.('复制默认内容失败', 'error');
    }
  };

  const handleAddFromBuiltIn = (builtInId: string) => {
    const builtInConfig = PROMPT_TEMPLATES[builtInId];
    if (!builtInConfig) return;

    setAddForm({
      name: `${builtInConfig.name}（自定义）`,
      description: builtInConfig.description,
      builtInId,
      content: '',
      stage: builtInConfig.stage,
    });
    setShowAddForm(true);
  };

  const handleLoadBuiltInContent = async () => {
    const builtInConfig = PROMPT_TEMPLATES[addForm.builtInId];
    if (!builtInConfig) return;

    try {
      const modules = import.meta.glob('../../prompts/templates/**/*.md', {
        query: '?raw',
        eager: true,
        import: 'default',
      });
      const normalizedPath = builtInConfig.file.replace('./templates/', '../../prompts/templates/');
      const content = modules[normalizedPath];
      if (typeof content === 'string') {
        setAddForm(prev => ({ ...prev, content }));
      }
    } catch {
      showToast?.('加载默认模板内容失败', 'error');
    }
  };

  const handleAddTemplate = async () => {
    const userId = getCurrentUserId();
    if (!userId || !addForm.name.trim()) return;

    try {
      await addPipelinePromptTemplate(userId, {
        name: addForm.name.trim(),
        description: addForm.description.trim(),
        builtInId: addForm.builtInId,
        content: addForm.content.trim(),
        stage: addForm.stage,
        variables: PROMPT_TEMPLATES[addForm.builtInId]?.variables || [],
      });
      setShowAddForm(false);
      setAddForm({
        name: '',
        description: '',
        builtInId: '',
        content: '',
        stage: 'CHAPTER_WRITING',
      });
      await loadTemplates();
      showToast?.('模板已创建', 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : '创建失败', 'error');
    }
  };

  const handleDelete = async (template: PipelinePromptTemplate) => {
    if (template.builtIn) return;
    try {
      await deletePipelinePromptTemplate(template.id);
      setConfirmDeleteId(null);
      await loadTemplates();
      showToast?.('模板已删除', 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  const handleApplyTemplate = async (template: PipelinePromptTemplate) => {
    if (template.builtIn || !template.content.trim()) return;
    try {
      const builtIn = templates.find(t => t.builtIn && t.builtInId === template.builtInId);
      if (!builtIn) {
        showToast?.('未找到对应的默认模板', 'error');
        return;
      }
      await updatePipelinePromptTemplate(builtIn.id, { content: template.content });
      await loadTemplates();
      showToast?.(`已将「${template.name}」应用到默认模板`, 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : '应用失败', 'error');
    }
  };

  const builtInTemplates = templates.filter(t => t.builtIn);
  const customTemplates = templates.filter(t => !t.builtIn);

  const groupedByStage = (list: PipelinePromptTemplate[]) => {
    const groups: Record<string, PipelinePromptTemplate[]> = {};
    for (const t of list) {
      if (!groups[t.stage]) groups[t.stage] = [];
      groups[t.stage].push(t);
    }
    return groups;
  };

  const renderTemplateItem = (template: PipelinePromptTemplate) => {
    const isExpanded = expandedId === template.id;
    const isEditing = editingId === template.id;
    const builtInConfig = PROMPT_TEMPLATES[template.builtInId];
    const hasCustomContent = !!template.content.trim();

    return (
      <div
        key={template.id}
        style={{
          border: '1px solid var(--color-vscode-border)',
          borderRadius: '3px',
          marginBottom: '4px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            backgroundColor: isExpanded ? 'rgba(0, 122, 204, 0.06)' : 'transparent',
          }}
          onClick={() => setExpandedId(isExpanded ? null : template.id)}
        >
          {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.6, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--color-vscode-text)', opacity: 0.6, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{template.name}</span>
              {template.builtIn && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--color-vscode-active-light, rgba(143, 188, 143, 0.15))',
                  color: 'var(--color-vscode-active)',
                  flexShrink: 0,
                }}>
                  默认
                </span>
              )}
              {hasCustomContent && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  backgroundColor: 'rgba(240, 173, 78, 0.2)',
                  color: '#f0ad4e',
                  flexShrink: 0,
                }}>
                  已自定义
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {template.description}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {!isEditing && !template.builtIn && template.content.trim() && (
              <button
                type="button"
                style={btnStyle('ghost')}
                onClick={() => handleApplyTemplate(template)}
                title="应用此模板到对应的默认模板（流水线将使用此内容）"
              >
                <CheckCircle size={12} style={{ color: 'var(--color-vscode-active)' }} />
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                style={btnStyle('ghost')}
                onClick={() => handleStartEdit(template)}
                title="编辑"
              >
                <Edit3 size={12} />
              </button>
            )}
            {!template.builtIn && (
              <>
                {confirmDeleteId === template.id ? (
                  <button
                    type="button"
                    style={btnStyle('danger')}
                    onClick={() => handleDelete(template)}
                    title="确认删除"
                  >
                    !
                  </button>
                ) : (
                  <button
                    type="button"
                    style={btnStyle('ghost')}
                    onClick={() => {
                      setConfirmDeleteId(template.id);
                      setTimeout(() => setConfirmDeleteId(prev => prev === template.id ? null : prev), 3000);
                    }}
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isExpanded && !isEditing && (
          <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--color-vscode-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.6, marginBottom: '6px' }}>
              阶段：{STAGE_LABELS[template.stage] || template.stage}
              {builtInConfig && ` · 变量：${builtInConfig.variables.join(', ')}`}
              {!template.builtIn && ` · 基于：${builtInConfig?.name || template.builtInId}`}
            </div>
            {hasCustomContent ? (
              <>
                <pre style={{
                  fontSize: '11px',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.8,
                  whiteSpace: 'pre-wrap' as const,
                  wordBreak: 'break-word' as const,
                  maxHeight: '200px',
                  overflow: 'auto',
                  backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
                  padding: '8px',
                  borderRadius: '3px',
                  margin: 0,
                  lineHeight: '1.5',
                }}>
                  {template.content}
                </pre>
                {!template.builtIn && (
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      style={btnStyle('primary')}
                      onClick={() => handleApplyTemplate(template)}
                      title="将此模板内容应用到对应的默认模板，流水线将使用此内容"
                    >
                      <CheckCircle size={11} />
                      应用到流水线
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, fontStyle: 'italic' }}>
                {template.builtIn ? '使用内置默认模板内容' : '暂无内容，请编辑添加'}
              </div>
            )}
          </div>
        )}

        {isExpanded && isEditing && (
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-vscode-border)' }}>
            {!template.builtIn && (
              <>
                <div style={sectionStyle}>
                  <label style={labelStyle}>模板名称</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div style={sectionStyle}>
                  <label style={labelStyle}>模板描述</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                  />
                </div>
              </>
            )}
            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>模板内容</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {template.builtIn && (
                    <button
                      type="button"
                      style={btnStyle('secondary')}
                      onClick={() => handleCopyFromBuiltIn(template)}
                      title="从默认模板复制内容作为基础"
                    >
                      <Copy size={11} />
                      复制默认内容
                    </button>
                  )}
                  {hasCustomContent && (
                    <button
                      type="button"
                      style={btnStyle('secondary')}
                      onClick={() => handleResetToDefault(template)}
                      title="恢复为默认模板"
                    >
                      <RotateCcw size={11} />
                      恢复默认
                    </button>
                  )}
                </div>
              </div>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: '150px',
                  resize: 'vertical' as const,
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  lineHeight: '1.5',
                  fontSize: '11px',
                }}
                placeholder="输入自定义模板内容...&#10;&#10;支持变量：{{variableName}}&#10;支持条件块：{{#if variableName}}...{{/if}}"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
              />
              {builtInConfig && (
                <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.4, marginTop: '4px' }}>
                  可用变量：{builtInConfig.variables.join(', ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button type="button" style={btnStyle('secondary')} onClick={handleCancelEdit}>
                取消
              </button>
              <button type="button" style={btnStyle('primary')} onClick={() => handleSaveEdit(template)}>
                <Save size={11} />
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStageGroup = (title: string, items: PipelinePromptTemplate[]) => {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '12px' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--color-vscode-text)',
          opacity: 0.6,
          marginBottom: '6px',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
        }}>
          {title}
        </div>
        {items.map(renderTemplateItem)}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-modal-overlay, rgba(0,0,0,0.5))',
    }} onClick={onClose}>
      <div
        style={{
          width: '600px',
          maxHeight: '80vh',
          backgroundColor: 'var(--color-vscode-sidebar)',
          border: '1px solid var(--color-vscode-border)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-vscode-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-vscode-text)', margin: 0 }}>
              提示词模板管理
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.5, margin: '2px 0 0' }}>
              管理流水线写作的提示词模板，默认模板不可删除但可自定义内容
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-vscode-text)', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {renderStageGroup('大纲规划', builtInTemplates.filter(t => t.stage === 'PLANNING'))}
          {renderStageGroup('细纲生成', builtInTemplates.filter(t => t.stage === 'DETAILED_OUTLINE'))}
          {renderStageGroup('正文写作', builtInTemplates.filter(t => t.stage === 'CHAPTER_WRITING'))}

          {customTemplates.length > 0 && (
            <>
              <div style={{
                borderTop: '1px solid var(--color-vscode-border)',
                margin: '12px 0',
                paddingTop: '12px',
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-vscode-text)',
                  opacity: 0.6,
                  marginBottom: '6px',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.5px',
                }}>
                  自定义模板
                </div>
              </div>
              {(() => {
                const grouped = groupedByStage(customTemplates);
                return Object.entries(grouped).map(([stage, items]) =>
                  renderStageGroup(STAGE_LABELS[stage] || stage, items)
                );
              })()}
            </>
          )}
        </div>

        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-vscode-border)',
          flexShrink: 0,
        }}>
          {!showAddForm ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
              {Object.entries(PROMPT_TEMPLATES).map(([id, config]) => (
                <button
                  key={id}
                  type="button"
                  style={{
                    ...btnStyle('secondary'),
                    fontSize: '11px',
                    padding: '3px 8px',
                  }}
                  onClick={() => handleAddFromBuiltIn(id)}
                  title={`基于「${config.name}」创建自定义模板`}
                >
                  <Plus size={10} />
                  {config.name}
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '10px',
              backgroundColor: 'var(--color-vscode-input-bg, rgba(0,0,0,0.1))',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '3px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-vscode-text)', marginBottom: '8px' }}>
                基于默认模板「{PROMPT_TEMPLATES[addForm.builtInId]?.name}」创建自定义模板
              </div>
              <div style={sectionStyle}>
                <label style={labelStyle}>模板名称</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={addForm.name}
                  onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div style={sectionStyle}>
                <label style={labelStyle}>模板描述</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={addForm.description}
                  onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>模板内容</label>
                  <button
                    type="button"
                    style={btnStyle('secondary')}
                    onClick={handleLoadBuiltInContent}
                  >
                    <Copy size={11} />
                    加载默认内容
                  </button>
                </div>
                <textarea
                  style={{
                    ...inputStyle,
                    minHeight: '120px',
                    resize: 'vertical' as const,
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    lineHeight: '1.5',
                    fontSize: '11px',
                  }}
                  placeholder="输入自定义模板内容..."
                  value={addForm.content}
                  onChange={e => setAddForm(prev => ({ ...prev, content: e.target.value }))}
                />
                {PROMPT_TEMPLATES[addForm.builtInId] && (
                  <div style={{ fontSize: '10px', color: 'var(--color-vscode-text)', opacity: 0.4, marginTop: '4px' }}>
                    可用变量：{PROMPT_TEMPLATES[addForm.builtInId].variables.join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={btnStyle('secondary')}
                  onClick={() => {
                    setShowAddForm(false);
                    setAddForm({ name: '', description: '', builtInId: '', content: '', stage: 'CHAPTER_WRITING' });
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  style={addForm.name.trim() ? btnStyle('primary') : { ...btnStyle('primary'), opacity: 0.5, cursor: 'not-allowed' }}
                  onClick={addForm.name.trim() ? handleAddTemplate : undefined}
                  disabled={!addForm.name.trim()}
                >
                  <Plus size={11} />
                  创建模板
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PromptTemplateManager;
