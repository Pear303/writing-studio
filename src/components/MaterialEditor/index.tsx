import { useState, useEffect, useRef, useCallback } from 'react';
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

const AUTO_SAVE_DELAY = 1500;

export const MaterialEditor = ({ material, onBack, onSaved }: MaterialEditorProps) => {
  const [name, setName] = useState(material.name);
  const [description, setDescription] = useState(material.description);
  const [type, setType] = useState<MaterialType>(material.type);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ name, description, type });
  const materialIdRef = useRef(material.id);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<{ name: string; description: string; type: MaterialType } | null>(null);

  // 同步最新值到 ref，供自动保存回调使用
  latestRef.current = { name, description, type };

  useEffect(() => {
    setName(material.name);
    setDescription(material.description);
    setType(material.type);
    setSaveStatus('saved');
    materialIdRef.current = material.id;
  }, [material.id]);

  // 卸载时清除定时器并执行最后一次保存
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        // 如果有未保存的自动保存请求，立即执行
        const { name: n, description: d, type: t } = latestRef.current;
        if (n.trim()) {
          const isAccountLevel = ACCOUNT_LEVEL_TYPES.includes(t);
          const updatedMaterial: Material = {
            ...material,
            name: n.trim(),
            description: d,
            type: t,
            bookId: isAccountLevel ? undefined : material.bookId,
            updatedAt: Date.now(),
          };
          db.materials.put(updatedMaterial).catch(err => {
            console.error('卸载时保存素材失败:', err);
          });
        }
      }
    };
  }, [material]);

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

  const performSave = useCallback(async (saveName: string, saveDesc: string, saveType: MaterialType) => {
    if (!saveName.trim()) return;

    // 如果正在保存，将本次保存请求排队
    if (savingRef.current) {
      pendingSaveRef.current = { name: saveName, description: saveDesc, type: saveType };
      return;
    }

    savingRef.current = true;
    setSaveStatus('saving');
    try {
      const isAccountLevel = ACCOUNT_LEVEL_TYPES.includes(saveType);
      const updatedMaterial: Material = {
        ...material,
        name: saveName.trim(),
        description: saveDesc,
        type: saveType,
        bookId: isAccountLevel ? undefined : material.bookId,
        updatedAt: Date.now(),
      };
      await db.materials.put(updatedMaterial);

      // 验证保存是否真的成功
      const saved = await db.materials.get(material.id);
      if (!saved || saved.name !== saveName.trim() || saved.description !== saveDesc) {
        console.error('保存验证失败：数据未正确写入', { expected: saveName, actual: saved?.name });
        setSaveStatus('unsaved');
        return;
      }

      setSaveStatus('saved');
      if (onSaved) onSaved(updatedMaterial);
    } catch (error) {
      console.error('保存素材失败:', error);
      setSaveStatus('unsaved');
    } finally {
      savingRef.current = false;

      // 处理排队的保存请求
      if (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        // 使用 setTimeout 避免递归调用栈
        setTimeout(() => {
          performSave(pending.name, pending.description, pending.type);
        }, 0);
      }
    }
  }, [material, onSaved]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const { name: n, description: d, type: t } = latestRef.current;
      performSave(n, d, t);
    }, AUTO_SAVE_DELAY);
  }, [performSave]);

  const handleFieldChange = useCallback(() => {
    setSaveStatus('unsaved');
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleSave = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    // 等待之前的保存完成
    while (savingRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await performSave(name, description, type);
  };

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
        <div className="flex items-center gap-2">
          <span
            className={`text-xs ${
              saveStatus === 'saved'
                ? 'text-green-500'
                : saveStatus === 'saving'
                  ? 'text-yellow-500'
                  : 'text-red-500'
            }`}
          >
            {saveStatus === 'saved'
              ? '已保存'
              : saveStatus === 'saving'
                ? '保存中...'
                : '未保存'}
          </span>
          <button
            onClick={handleSave}
            disabled={saveStatus !== 'unsaved'}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs transition-colors disabled:opacity-40"
            style={{
              color: saveStatus === 'unsaved' ? 'var(--color-vscode-active)' : 'var(--color-vscode-text)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            <Save size={14} />
            <span>{saveStatus === 'saving' ? '保存中...' : '保存'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>
            名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); handleFieldChange(); }}
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
                  onClick={() => { setType(t); handleFieldChange(); }}
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
                  onClick={() => { setType(t); handleFieldChange(); }}
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
            onChange={(e) => { setDescription(e.target.value); handleFieldChange(); }}
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
