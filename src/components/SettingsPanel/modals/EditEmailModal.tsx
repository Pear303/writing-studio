import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { updateUser, getUserByEmail, createEmailVerification, checkEmailCodeValid } from '../../../db';
import { useUser } from '../../../auth/UserContext';
import { Toast, type ToastType } from '../../Toast';

interface EditEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditEmailModal = ({ isOpen, onClose }: EditEmailModalProps) => {
  const { user, refreshUser } = useUser();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  if (!isOpen || !user) return null;

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSendCode = async () => {
    if (!email) {
      showToast('请输入邮箱地址', 'error');
      return;
    }
    if (!isValidEmail(email)) {
      showToast('邮箱格式不正确', 'error');
      return;
    }

    try {
      const existing = await getUserByEmail(email);
      if (existing && existing.id !== user.id) {
        showToast('该邮箱已被使用', 'error');
        return;
      }

      setIsSending(true);
      const verifyCode = await createEmailVerification(email, user.id, 'email_change');
      console.log('验证码:', verifyCode);
      showToast('验证码已发送（查看控制台）', 'success');
      setStep('code');
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      showToast('发送失败，请重试', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    if (!code) {
      showToast('请输入验证码', 'error');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await checkEmailCodeValid(email, code);
      if (!isValid) {
        showToast('验证码错误或已过期', 'error');
        return;
      }

      await updateUser(user.id, { email: email.trim() });
      await refreshUser();
      showToast('邮箱修改成功', 'success');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      showToast('修改失败，请重试', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setCode('');
    setStep('email');
    setCountdown(0);
    onClose();
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
        <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
        <div className="relative bg-vscode-sidebar border border-vscode-border rounded-lg p-6 w-full max-w-md mx-4">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 text-vscode-text opacity-60 hover:opacity-100"
          >
            <X size={20} />
          </button>
          
          <h3 className="text-lg font-semibold text-vscode-text mb-4">修改邮箱</h3>
          
          <div className="space-y-4">
            {step === 'email' ? (
              <>
                <div>
                  <label className="block text-sm text-vscode-text opacity-60 mb-2">新邮箱地址</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入新邮箱地址"
                    className="w-full px-3 py-2 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                  />
                </div>
                
                <button
                  onClick={handleSendCode}
                  disabled={isSending || countdown > 0}
                  className="w-full px-4 py-2 bg-vscode-active text-white rounded hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {isSending ? '发送中...' : countdown > 0 ? `${countdown}秒后重发` : '发送验证码'}
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-vscode-text opacity-60">
                  已发送验证码到 {email}，请查收
                </div>
                
                <div>
                  <label className="block text-sm text-vscode-text opacity-60 mb-2">验证码</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="请输入6位验证码"
                    className="w-full px-3 py-2 bg-vscode-input border border-vscode-border rounded text-vscode-text focus:outline-none focus:border-vscode-active"
                    maxLength={6}
                  />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('email')}
                    className="flex-1 px-4 py-2 bg-vscode-input text-vscode-text rounded hover:opacity-80"
                  >
                    返回
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="flex-1 px-4 py-2 bg-vscode-active text-white rounded hover:opacity-80 disabled:opacity-50"
                  >
                    {isVerifying ? '验证中...' : '确认'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};