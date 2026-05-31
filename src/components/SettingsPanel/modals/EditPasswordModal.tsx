import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { updateUser, verifyPassword, hashPassword } from '../../../db';
import { useUser } from '../../../auth/UserContext';
import { Toast, type ToastType } from '../../Toast';

interface EditPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditPasswordModal = ({ isOpen, onClose }: EditPasswordModalProps) => {
  const { user, refreshUser } = useUser();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  if (!isOpen || !user) return null;

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const handleSave = async () => {
    if (!oldPassword) {
      showToast('请输入旧密码', 'error');
      return;
    }
    if (!newPassword) {
      showToast('请输入新密码', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码至少6位', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次密码输入不一致', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const isValid = await verifyPassword(oldPassword, user.passwordHash);
      if (!isValid) {
        showToast('旧密码错误', 'error');
        setIsSaving(false);
        return;
      }

      const newHash = await hashPassword(newPassword);
      await updateUser(user.id, { passwordHash: newHash });
      await refreshUser();
      showToast('密码修改成功', 'success');
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
          
          <h3 className="text-lg font-semibold text-vscode-text mb-4">修改密码</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-vscode-text opacity-60 mb-2">旧密码</label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入旧密码"
                  className="w-full px-3 py-2 pr-10 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vscode-text opacity-60"
                >
                  {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-vscode-text opacity-60 mb-2">新密码</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                  className="w-full px-3 py-2 pr-10 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vscode-text opacity-60"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm text-vscode-text opacity-60 mb-2">确认新密码</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  className="w-full px-3 py-2 pr-10 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-vscode-text opacity-60"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
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