import { useState } from 'react';
import { X } from 'lucide-react';
import { updateUser } from '../../../db';
import { useUser } from '../../../auth/UserContext';
import { Toast, type ToastType } from '../../Toast';

interface EditNicknameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditNicknameModal = ({ isOpen, onClose }: EditNicknameModalProps) => {
  const { user, refreshUser } = useUser();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  if (!isOpen || !user) return null;

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      showToast('昵称不能为空', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await updateUser(user.id, { nickname: nickname.trim() });
      await refreshUser();
      showToast('昵称修改成功', 'success');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      showToast('修改失败，请重试', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-vscode-sidebar border border-vscode-border rounded-lg p-6 w-full max-w-md mx-4">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-vscode-text opacity-60 hover:opacity-100"
          >
            <X size={20} />
          </button>
          
          <h3 className="text-lg font-semibold text-vscode-text mb-4">修改昵称</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-vscode-text opacity-60 mb-2">新昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="请输入新昵称"
                className="w-full px-3 py-2 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                maxLength={20}
              />
            </div>
            
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-vscode-input text-vscode-text rounded hover:opacity-80"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-vscode-active text-white rounded hover:opacity-80 disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};