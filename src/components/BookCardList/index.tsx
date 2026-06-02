import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Download, BookOpen, X, Upload, FileUp } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { BookCard } from '../BookCard';
import { ContextMenu } from '../ContextMenu';
import { Toast, type ToastType } from '../Toast';
import { ImportNovelModal } from '../ImportNovelModal';
import type { Book } from '../../types';
import { db, getCurrentUserId } from '../../db';
import { generateId } from '../../utils/helpers';

interface BookCardListProps {
  books: Book[];
  onBookSelect: (book: Book) => void;
  onRefresh: () => void;
}

export const BookCardList = ({ books, onBookSelect, onRefresh }: BookCardListProps) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    book: Book;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  
  const [showImportModal, setShowImportModal] = useState(false);
  
  // 上次导出路径
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  
  // 编辑弹窗状态
  const [editModal, setEditModal] = useState<{
    open: boolean;
    book: Book | null;
  }>({ open: false, book: null });
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    status: 'ongoing' as 'ongoing' | 'finished' | 'abandoned',
    cover: '',
  });
  const [coverInputRef, setCoverInputRef] = useState<HTMLInputElement | null>(null);

  // 初始化编辑表单
  useEffect(() => {
    if (editModal.open && editModal.book) {
      setEditForm({
        name: editModal.book.name,
        description: editModal.book.description || '',
        status: editModal.book.status,
        cover: editModal.book.cover || '',
      });
    }
  }, [editModal.open, editModal.book]);

  // 点击外部关闭弹窗
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editModal.open && modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setEditModal({ open: false, book: null });
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editModal.open]);

  // ESC 关闭弹窗
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (editModal.open && event.key === 'Escape') {
        setEditModal({ open: false, book: null });
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [editModal.open]);

  // 显示Toast
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, book });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 删除确认 - 两步确认
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<{
    step: 1 | 2;
    bookId: string;
    bookName: string;
  }>({ step: 1, bookId: '', bookName: '' });

  const handleDeleteBook = (bookId: string) => {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    setDeleteConfirmStep({ step: 1, bookId, bookName: book.name });
  };

  const handleDeleteConfirmStep1 = () => {
    setDeleteConfirmStep(prev => ({ ...prev, step: 2 }));
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmStep({ step: 1, bookId: '', bookName: '' });
  };

  const executeDelete = async () => {
    const { bookId } = deleteConfirmStep;
    setDeleteConfirmStep({ step: 1, bookId: '', bookName: '' });

    try {
      await db.transaction('rw', [db.books, db.volumes, db.chapters], async () => {
        const chapters = await db.chapters.where('bookId').equals(bookId).toArray();
        await db.chapters.bulkDelete(chapters.map((c) => c.id));

        const volumes = await db.volumes.where('bookId').equals(bookId).toArray();
        await db.volumes.bulkDelete(volumes.map((v) => v.id));

        await db.books.delete(bookId);
      });

      onRefresh();
      showToast('书籍已删除', 'success');
    } catch (error) {
      console.error('删除书籍失败:', error);
      showToast('删除书籍失败，请重试', 'error');
    }
  };

  // 导出书籍
  const handleExportBook = async (book: Book) => {
    try {
      const volumes = await db.volumes.where('bookId').equals(book.id).toArray();
      const chapters = await db.chapters.where('bookId').equals(book.id).toArray();
      
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        book: {
          name: book.name,
          description: book.description,
          cover: book.cover,
          status: book.status,
        },
        volumes: volumes.map(v => ({
          name: v.name,
          order: v.order,
          chapters: chapters
            .filter(c => c.volumeId === v.id)
            .sort((a, b) => a.id.localeCompare(b.id))
            .map(c => ({
              title: c.title,
              content: c.content,
              wordCount: c.wordCount,
            })),
        })),
        drafts: chapters
          .filter(c => !c.volumeId)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(c => ({
            title: c.title,
            content: c.content,
            wordCount: c.wordCount,
          })),
      };

      const content = JSON.stringify(exportData, null, 2);
      
      const defaultPath = lastExportPath || book.lastExportPath || `${book.name}.json`;
      
      const filePath = await save({
        defaultPath: defaultPath,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (!filePath) return;

      await writeTextFile(filePath, content);
      setLastExportPath(filePath);
      
      await db.books.update(book.id, { lastExportPath: filePath });
      
      showToast('书籍导出成功', 'success');
    } catch (error) {
      console.error('导出书籍失败:', error);
      showToast('导出书籍失败，请重试', 'error');
    }
  };

  // 打开编辑弹窗
  const handleEditBook = (book: Book) => {
    setEditModal({ open: true, book });
  };

  // 保存书籍修改
  const handleSaveEdit = async () => {
    if (!editModal.book) return;
    
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      showToast('书名不能为空', 'error');
      return;
    }

    try {
      await db.books.update(editModal.book.id, {
        name: trimmedName,
        description: editForm.description.trim(),
        status: editForm.status,
        cover: editForm.cover.trim() || undefined,
        updatedAt: Date.now(),
      });
      
      setEditModal({ open: false, book: null });
      onRefresh();
      showToast('书籍属性已更新', 'success');
    } catch (error) {
      console.error('更新书籍失败:', error);
      showToast('更新书籍失败，请重试', 'error');
    }
  };

  // 处理封面图片选择
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setEditForm(prev => ({ ...prev, cover: result }));
      }
    };
    reader.readAsDataURL(file);
  };

  // 新建书籍
  const handleCreateBook = async () => {
    const name = prompt('请输入书名:');
    if (!name) return;

    const description = prompt('请输入简介（可选）:') || '';

    const newBook: Book = {
      id: generateId(),
      userId: getCurrentUserId() || undefined,
      name,
      description,
      totalWords: 0,
      status: 'ongoing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await db.books.add(newBook);
      onRefresh();
      showToast('书籍创建成功', 'success');
    } catch (error) {
      console.error('创建书籍失败:', error);
      showToast('创建书籍失败，请重试', 'error');
    }
  };

  return (
    <div className="h-full">
      {/* Toast通知 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 次左侧-顶部-标题栏 */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-2xl font-bold text-vscode-text">我的书架</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-secondary flex items-center space-x-2"
          >
            <FileUp size={18} />
            <span>导入小说</span>
          </button>
          <button
            onClick={handleCreateBook}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>新建书籍</span>
          </button>
        </div>
      </div>

      {/* 次左侧-书架 */}
      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96 text-vscode-text opacity-60">
          <BookOpen size={64} className="mb-4 opacity-50" />
          <p className="text-lg">暂无书籍</p>
          <p className="text-sm mt-2">点击"新建书籍"开始创作</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-4">
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onClick={() => onBookSelect(book)}
              onContextMenu={(e) => handleContextMenu(e, book)}
            />
          ))}
        </div>
      )}

      {/*
          步骤 1: 父组件返回 JSX
            ↓
            <div>
              <BookCard book={book1} onClick={fn1} />
              <BookCard book={book2} onClick={fn2} />
            </div>

          步骤 2: React 解析 JSX，发现子组件 <BookCard />
            ↓
            提取 props: { book: book1, onClick: fn1 }

          步骤 3: React 调用子组件函数
            ↓
            BookCard({ book: book1, onClick: fn1 })
            ↓
            得到返回值（子组件的 JSX 对象）

          步骤 4: React 将子组件的 JSX 插入到父组件的 JSX 中
            ↓
            <div>
              <div className="card">...</div>  BookCard 返回的内容 
              <div className="card">...</div>  第二个 BookCard 返回的内容 
            </div>

          步骤 5: React 将整个 JSX 树转换为真实 DOM
            ↓
            浏览器显示最终页面
      */}

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: '修改属性',
              icon: <Edit size={16} />,
              onClick: () => handleEditBook(contextMenu.book),
            },
            {
              label: '导出全书',
              icon: <Download size={16} />,
              onClick: () => handleExportBook(contextMenu.book),
            },
            {
              label: '删除书籍',
              icon: <Trash2 size={16} />,
              onClick: () => handleDeleteBook(contextMenu.book.id),
              danger: true,
            },
          ]}
          onClose={closeContextMenu}
        />
      )}

      {/* 编辑弹窗 */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            ref={modalRef} 
            className="bg-vscode-sidebar border border-vscode-border w-[480px] max-h-[80vh] overflow-y-auto"
            style={{ borderRadius: 0, boxShadow: 'none' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
              <h3 className="text-lg font-semibold text-vscode-text">修改书籍属性</h3>
              <button
                onClick={() => setEditModal({ open: false, book: null })}
                className="text-vscode-text opacity-60 hover:opacity-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-vscode-text opacity-80 mb-1">书名</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-vscode-border text-vscode-text border border-vscode-border focus:border-vscode-focus"
                  style={{ borderRadius: 0, appearance: 'none', backgroundColor: 'var(--color-vscode-bg, #1e1e1e)', boxShadow: 'none' }}
                />
              </div>
              <div>
                <label className="block text-sm text-vscode-text opacity-80 mb-1">简介</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-vscode-border text-vscode-text border border-vscode-border focus:border-vscode-focus"
                  style={{ borderRadius: 0, appearance: 'none', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', backgroundColor: 'var(--color-vscode-bg, #1e1e1e)', boxShadow: 'none' }}
                />
              </div>
              <div>
                <label className="block text-sm text-vscode-text opacity-80 mb-1">状态</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'ongoing' | 'finished' | 'abandoned' })}
                  className="w-full px-3 py-2 bg-vscode-editor bg-vscode-border text-vscode-text border border-vscode-border focus:border-vscode-focus"
                  style={{ borderRadius: 0 }}
                >
                  <option value="ongoing">连载中</option>
                  <option value="finished">已完结</option>
                  <option value="abandoned">已弃坑</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-vscode-text opacity-80 mb-1">封面</label>
                <div className="flex items-center space-x-3">
                  <div 
                    className="w-20 h-24 bg-vscode-border flex items-center justify-center overflow-hidden"
                    style={{ borderRadius: 0 }}
                  >
                    {editForm.cover ? (
                      <img src={editForm.cover} alt="封面预览" className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen size={24} className="text-vscode-text opacity-40" />
                    )}
                  </div>
                  <button
                    onClick={() => coverInputRef?.click()}
                    className="btn-secondary flex items-center space-x-2"
                  >
                    <Upload size={16} />
                    <span>选择图片</span>
                  </button>
                  <input
                    ref={(el) => setCoverInputRef(el)}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 px-4 py-3 border-t border-vscode-border">
              <button
                onClick={() => setEditModal({ open: false, book: null })}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="btn-primary px-4 py-2"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmStep.bookId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div 
            className="bg-vscode-sidebar border border-vscode-border w-[360px]"
            style={{ borderRadius: 0, boxShadow: 'none' }}
          >
            <div className="p-4 border-b border-vscode-border">
              <h3 className="text-lg font-semibold text-vscode-text">
                {deleteConfirmStep.step === 1 ? '确认删除' : '最终确认'}
              </h3>
            </div>
            <div className="p-4">
              {deleteConfirmStep.step === 1 ? (
                <>
                  <p className="text-vscode-text">
                    确定要删除书籍《{deleteConfirmStep.bookName}》吗？
                  </p>
                  <p className="text-vscode-text opacity-60 text-sm mt-2">
                    此操作将同时删除所有相关的卷和章节，无法恢复。
                  </p>
                </>
              ) : (
                <p className="text-vscode-text">
                  请再次确认：确定要永久删除《{deleteConfirmStep.bookName}》吗？此操作不可恢复！
                </p>
              )}
            </div>
            <div className="flex justify-end space-x-3 px-4 py-3 border-t border-vscode-border">
              <button
                onClick={handleDeleteCancel}
                className="btn-secondary px-4 py-2"
              >
                取消
              </button>
              <button
                onClick={deleteConfirmStep.step === 1 ? handleDeleteConfirmStep1 : executeDelete}
                className="btn-primary px-4 py-2"
                style={{ color: 'var(--color-danger, #ef4444)' }}
              >
                {deleteConfirmStep.step === 1 ? '继续删除' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportNovelModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(bookId) => {
          onRefresh();
          const book = books.find(b => b.id === bookId);
          if (book) onBookSelect(book);
        }}
        showToast={showToast}
      />
    </div>
  );
};

/*
// 定义机器（组件）
const BookCard = (props) => {
  // 输入: props（原材料）
  // 处理: 根据数据生成 UI
  // 输出: JSX（产品）
  return <div>...</div>;
};

// 使用机器（调用组件）
<BookCard book={myBook} onClick={handleClick} />
//     ↑ 启动机器
//           ↑ 放入原材料（props）
//                  ↓ 产出产品（DOM 元素）
*/