import { useState, useEffect, useRef } from 'react';
import { Save, ArrowLeft, FileText } from 'lucide-react';
import type { Material, MaterialType } from '../../types';
import { db } from '../../db';

interface MaterialEditorProps {
  material: Material;
  onBack?: () => void;
  onSaved?: (material: Material) => void;
}

const BOOK_LEVEL_TYPES: MaterialType[] = ['character', 'location', 'item', 'plot', 'other'];
const ACCOUNT_LEVEL_TYPES: MaterialType[] = ['writing_rule', 'style_rule'];
const ALL_TYPES: MaterialType[] = [...BOOK_LEVEL_TYPES, ...ACCOUNT_LEVEL_TYPES];

export const MaterialEditor = ({ material, onBack, onSaved }: MaterialEditorProps) => {
  const [name, setName] = useState(material.name);
  const [description, setDescription] = useState(material.description);
  const [type, setType] = useState<MaterialType>(material.type);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(material.name);
    setDescription(material.description);
    setType(material.type);
    setSaveStatus('saved');
  }, [material.id]);

  const getTypeText = (t: MaterialType) => {
    switch (t) {
      case 'character': return '人物';
      case 'location': return '地点';
      case 'item': return '物品';
      case 'plot': return '情节';
      case 'writing_rule': return '写作规则';
      case 'style_rule': return '文风规则';
      case 'other': return '其他';
      default: return '未知';
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaveStatus('saving');
    try {
      const isAccountLevel = ACCOUNT_LEVEL_TYPES.includes(type);
      const updatedMaterial: Material = {
        ...material,
        name: name.trim(),
        description,
        type,
        bookId: isAccountLevel ? undefined : material.bookId,
        updatedAt: Date.now(),
      };
      await db.materials.put(updatedMaterial);
      setSaveStatus('saved');
      if (onSaved) onSaved(updatedMaterial);
    } catch (error) {
      console.error('保存素材失败:', error);
      setSaveStatus('saved');
    }
  };

  const hasChanges = name !== material.name || description !== material.description || type !== material.type;

  return (
    <div className="h-full flex flex-col bg-vscode-bg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-sidebar">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="icon-btn"
              title="返回"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <FileText size={16} style={{ color: 'var(--color-vscode-text)', opacity: 0.7 }} />
          <span className="text-sm font-medium text-vscode-text truncate max-w-[300px]">
            {material.name}
          </span>
          <span className="text-xs px-1.5 py-0.5" style={{
            color: 'var(--color-vscode-text)',
            opacity: 0.5,
            border: '1px solid var(--color-vscode-border)',
          }}>
            {getTypeText(material.type)}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveStatus === 'saving'}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
          style={{
            color: hasChanges ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
            border: '1px solid var(--color-vscode-border)',
          }}
        >
          <Save size={14} />
          <span>{saveStatus === 'saving' ? '保存中...' : '保存'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
            名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaveStatus('saved'); }}
            className="w-full px-3 py-2 text-sm"
            style={{
              backgroundColor: 'var(--color-vscode-bg)',
              color: 'var(--color-vscode-text)',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '2px',
            }}
            placeholder="素材名称"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
            分类
          </label>
          <div style={{ marginBottom: '6px' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>书籍级</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {BOOK_LEVEL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setSaveStatus('saved'); }}
                  className="px-2.5 py-1.5 text-xs transition-colors"
                  style={{
                    backgroundColor: type === t ? 'var(--color-vscode-active)' : 'transparent',
                    color: type === t ? 'white' : 'var(--color-vscode-text)',
                    border: '1px solid var(--color-vscode-border)',
                  }}
                >
                  {getTypeText(t)}
                </button>
              ))}
            </div>
            <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>账号级</div>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_LEVEL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setSaveStatus('saved'); }}
                  className="px-2.5 py-1.5 text-xs transition-colors"
                  style={{
                    backgroundColor: type === t ? 'var(--color-vscode-active)' : 'transparent',
                    color: type === t ? 'white' : 'var(--color-vscode-text)',
                    border: '1px solid var(--color-vscode-border)',
                  }}
                >
                  {getTypeText(t)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
            简介 / 内容
          </label>
          <textarea
            ref={textareaRef}
            value={description}
            onChange={(e) => { setDescription(e.target.value); setSaveStatus('saved'); }}
            className="w-full p-3 text-sm leading-relaxed resize-none"
            style={{
              backgroundColor: 'var(--color-vscode-bg)',
              color: 'var(--color-vscode-text)',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '2px',
              minHeight: '200px',
            }}
            placeholder="在此编辑素材的内容..."
          />
        </div>
      </div>
    </div>
  );
};
