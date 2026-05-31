import React, { useState, useEffect } from 'react';
import { Search, User, MapPin, Package, Brain, Edit, Trash2, FilePlus, X, BookOpen, Palette } from 'lucide-react';
import { MaterialCard } from '../MaterialCard';
import { ContextMenu, type MenuItem } from '../ContextMenu';
import { Toast, type ToastType } from '../Toast';
import type { Material, MaterialType, Book } from '../../types';
import { db, getCurrentUserId } from '../../db';
import { generateId } from '../../utils/helpers';

const BOOK_LEVEL_TYPES: MaterialType[] = ['character', 'location', 'item', 'plot', 'other'];
const ACCOUNT_LEVEL_TYPES: MaterialType[] = ['writing_rule', 'style_rule'];

interface MaterialPanelProps {
  onInsertMaterial?: (material: Material) => void;
  onMaterialSelect?: (material: Material) => void;
  currentBook?: Book | null;
}

export const MaterialPanel = ({ onInsertMaterial, onMaterialSelect, currentBook }: MaterialPanelProps) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filterType, setFilterType] = useState<MaterialType | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    material: Material;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [editModal, setEditModal] = useState<{
    material: Material;
    name: string;
    type: MaterialType;
    description: string;
  } | null>(null);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    loadMaterials();
  }, [currentBook?.id]);

  const loadMaterials = async () => {
    try {
      const currentUserId = getCurrentUserId();
      let allMaterials = await db.materials.orderBy('updatedAt').reverse().toArray();
      if (currentUserId) {
        allMaterials = allMaterials.filter(m => m.userId === currentUserId);
        if (currentBook?.id) {
          allMaterials = allMaterials.filter(m =>
            !m.bookId || m.bookId === currentBook.id
          );
        } else {
          allMaterials = allMaterials.filter(m => !m.bookId);
        }
      } else {
        allMaterials = [];
      }
      setMaterials(allMaterials);
    } catch (error) {
      console.error('加载素材失败:', error);
    }
  };

  const filteredMaterials = materials.filter((m) => {
    const matchType = filterType === 'all' || m.type === filterType;
    const matchSearch = !searchText || m.name.toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchSearch;
  });

  const handleContextMenu = (e: React.MouseEvent, material: Material) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, material });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleCreateMaterial = async (type: MaterialType) => {
    const name = prompt(`请输入${getTypeText(type)}名称:`);
    if (!name) return;

    const description = prompt('请输入描述（可选）:') || '';
    const isAccountLevel = ACCOUNT_LEVEL_TYPES.includes(type);

    const newMaterial: Material = {
      id: generateId(),
      userId: getCurrentUserId() || undefined,
      bookId: isAccountLevel ? undefined : (currentBook?.id || undefined),
      type,
      name,
      description,
      fields: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await db.materials.add(newMaterial);
      loadMaterials();
    } catch (error) {
      console.error('创建素材失败:', error);
      showToast('创建素材失败，请重试', 'error');
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (!confirm('确定要删除这个素材吗？此操作不可恢复。')) {
      return;
    }

    try {
      await db.materials.delete(materialId);
      loadMaterials();
    } catch (error) {
      console.error('删除素材失败:', error);
      showToast('删除素材失败，请重试', 'error');
    }
  };

  const handleEditMaterial = (material: Material) => {
    setEditModal({
      material,
      name: material.name,
      type: material.type,
      description: material.description,
    });
  };

  const handleSaveEdit = async () => {
    if (!editModal || !editModal.name.trim()) return;
    try {
      const isAccountLevel = ACCOUNT_LEVEL_TYPES.includes(editModal.type);
      const updated: Material = {
        ...editModal.material,
        name: editModal.name.trim(),
        type: editModal.type,
        description: editModal.description,
        bookId: isAccountLevel ? undefined : editModal.material.bookId,
        updatedAt: Date.now(),
      };
      await db.materials.put(updated);
      loadMaterials();
      setEditModal(null);
    } catch (error) {
      console.error('更新素材失败:', error);
      showToast('更新素材失败，请重试', 'error');
    }
  };

  const handleInsertMaterial = (material: Material) => {
    if (onInsertMaterial) {
      onInsertMaterial(material);
    }
  };

  const getTypeText = (type: MaterialType) => {
    switch (type) {
      case 'character':
        return '人物';
      case 'location':
        return '地点';
      case 'item':
        return '物品';
      case 'plot':
        return '情节';
      case 'writing_rule':
        return '写作规则';
      case 'style_rule':
        return '文风规则';
      case 'other':
        return '其他';
      default:
        return '未知';
    }
  };

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="p-3 border-b border-vscode-border">
        <h2 className="text-sm font-semibold text-vscode-text mb-2">素材箱</h2>

        <div className="relative mb-2">
          <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2" style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索素材"
            className="w-full pl-8 pr-2 py-1.5 text-xs text-vscode-text bg-vscode-bg border focus:outline-none focus:border-vscode-active"
            style={{ borderColor: 'var(--color-vscode-border)', borderRadius: '2px' }}
          />
        </div>

        <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>书籍级</div>
        <div className="grid grid-cols-3 gap-1 mb-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'all' ? 'var(--color-vscode-active, #007acc)' : 'transparent',
              color: filterType === 'all' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            全部
          </button>
          <button
            onClick={() => setFilterType('character')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'character' ? '#2563eb' : 'transparent',
              color: filterType === 'character' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            人物
          </button>
          <button
            onClick={() => setFilterType('location')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'location' ? '#16a34a' : 'transparent',
              color: filterType === 'location' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            地点
          </button>
          <button
            onClick={() => setFilterType('item')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'item' ? '#ca8a04' : 'transparent',
              color: filterType === 'item' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            物品
          </button>
          <button
            onClick={() => setFilterType('plot')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'plot' ? '#9333ea' : 'transparent',
              color: filterType === 'plot' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            情节
          </button>
          <button
            onClick={() => setFilterType('other')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'other' ? '#f97316' : 'transparent',
              color: filterType === 'other' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            其他
          </button>
        </div>

        <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>账号级（跨书共享）</div>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => setFilterType('writing_rule')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'writing_rule' ? '#7c3aed' : 'transparent',
              color: filterType === 'writing_rule' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            写作规则
          </button>
          <button
            onClick={() => setFilterType('style_rule')}
            className={`px-2 py-1 text-xs transition-colors`}
            style={{
              backgroundColor: filterType === 'style_rule' ? '#ec4899' : 'transparent',
              color: filterType === 'style_rule' ? 'white' : 'var(--color-vscode-text, #cccccc)',
              border: '1px solid var(--color-vscode-border)',
            }}
          >
            文风规则
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-medium text-vscode-text opacity-70">
            {filterType === 'all' ? '全部素材' : `${getTypeText(filterType as MaterialType)}素材`}
          </span>
          <button
            onClick={() => handleCreateMaterial(filterType === 'all' ? 'other' : filterType as MaterialType)}
            className="icon-btn"
            title={filterType === 'all' ? '新建其他素材' : `新建${getTypeText(filterType as MaterialType)}素材`}
          >
            <FilePlus size={16} />
          </button>
        </div>

        {filteredMaterials.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-gray-500 px-4 text-center">
            <p className="text-sm mb-2">暂无素材</p>
            <p className="text-xs">
              {filterType === 'all'
                ? '点击右上角 + 创建新素材'
                : `点击右上角 + 创建${getTypeText(filterType as MaterialType)}素材`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMaterials.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                onClick={() => onMaterialSelect?.(material)}
                onContextMenu={(e) => handleContextMenu(e, material)}
              />
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: '编辑',
              icon: <Edit size={16} />,
              onClick: () => handleEditMaterial(contextMenu.material),
            },
            {
              label: '插入到章节',
              icon: <FilePlus size={16} />,
              onClick: () => handleInsertMaterial(contextMenu.material),
            },
            { type: 'divider' },
            {
              label: '删除',
              icon: <Trash2 size={16} />,
              onClick: () => handleDeleteMaterial(contextMenu.material.id),
              danger: true,
            },
          ]}
          onClose={closeContextMenu}
        />
      )}

      {editModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-modal-overlay, rgba(0,0,0,0.5))' }}
          onClick={() => setEditModal(null)}
        >
          <div
            className="w-96 p-4"
            style={{
              backgroundColor: 'var(--color-vscode-sidebar)',
              border: '1px solid var(--color-vscode-border)',
              borderRadius: '2px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-vscode-text">编辑素材</h3>
              <button
                onClick={() => setEditModal(null)}
                className="icon-btn"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>名称</label>
              <input
                type="text"
                value={editModal.name}
                onChange={(e) => setEditModal({ ...editModal, name: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm"
                style={{
                  backgroundColor: 'var(--color-vscode-bg)',
                  color: 'var(--color-vscode-text)',
                  border: '1px solid var(--color-vscode-border)',
                }}
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>分类</label>
              <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>书籍级</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {BOOK_LEVEL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditModal({ ...editModal, type: t })}
                    className="px-2.5 py-1 text-xs transition-colors"
                    style={{
                      backgroundColor: editModal.type === t ? 'var(--color-vscode-active)' : 'transparent',
                      color: editModal.type === t ? 'white' : 'var(--color-vscode-text)',
                      border: '1px solid var(--color-vscode-border)',
                    }}
                  >
                    {getTypeText(t)}
                  </button>
                ))}
              </div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.4 }}>账号级（跨书共享）</div>
              <div className="flex flex-wrap gap-1.5">
                {ACCOUNT_LEVEL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditModal({ ...editModal, type: t })}
                    className="px-2.5 py-1 text-xs transition-colors"
                    style={{
                      backgroundColor: editModal.type === t ? 'var(--color-vscode-active)' : 'transparent',
                      color: editModal.type === t ? 'white' : 'var(--color-vscode-text)',
                      border: '1px solid var(--color-vscode-border)',
                    }}
                  >
                    {getTypeText(t)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs mb-1" style={{ color: 'var(--color-vscode-text)', opacity: 0.6 }}>简介</label>
              <textarea
                value={editModal.description}
                onChange={(e) => setEditModal({ ...editModal, description: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm resize-none"
                rows={4}
                style={{
                  backgroundColor: 'var(--color-vscode-bg)',
                  color: 'var(--color-vscode-text)',
                  border: '1px solid var(--color-vscode-border)',
                }}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setEditModal(null)}
                className="px-3 py-1.5 text-xs"
                style={{
                  color: 'var(--color-vscode-text)',
                  border: '1px solid var(--color-vscode-border)',
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'var(--color-vscode-active)',
                  color: 'white',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
