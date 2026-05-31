import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createUser, addLoginLog, getUserSettings } from '../../db';
import { generateToken, saveToken } from '../../auth/token';
import { useUser } from '../../auth/UserContext';
import { createUserFolders } from '../../utils/userDataManager';
import type { SMTPConfig } from '../../db';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
  onSuccess: () => void;
  initialUsername?: string;
  onUsernameChange?: (username: string) => void;
}

export const RegisterPage = ({ onSwitchToLogin, onSuccess, initialUsername, onUsernameChange }: RegisterPageProps) => {
  const [username, setUsername] = useState(initialUsername || '');

  // 从登录页切到注册页时，同步已输入的用户名
  useEffect(() => {
    if (initialUsername) {
      setUsername(initialUsername);
    }
  }, [initialUsername]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('密码至少需要6位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);

    try {
      const user = await createUser(username, password, email || undefined);

      try {
        await createUserFolders(user.id);
      } catch (folderErr) {
        console.warn('创建用户文件夹失败（非阻塞）:', folderErr);
      }

      await addLoginLog(user.id, true, navigator.userAgent);

      if (email) {
        try {
          const settings = await getUserSettings(user.id);
          if (settings?.smtpConfig) {
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
            const smtpConfig: SMTPConfig = settings.smtpConfig;
            await invoke('send_verification_email_command', {
              smtpConfig: {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.secure,
                username: smtpConfig.username,
                password: smtpConfig.password,
                from_email: smtpConfig.fromEmail,
              },
              toEmail: email,
              code: verificationCode,
              purpose: 'register',
            });
          }
        } catch (emailError) {
          console.error('验证邮件发送失败:', emailError);
        }
      }

      const token = generateToken(user.id, 30 * 24 * 60 * 60 * 1000);
      saveToken(token, true);
      await login(user, token);

      onSuccess();
    } catch (err: any) {
      console.error('注册错误:', err);
      setError(err.message || '注册失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-auth-bg-start">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-auth-card-bg rounded-xl border border-auth-card-border shadow-lg">
          <div className="px-8 pt-10 pb-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-auth-text-primary">Writing Studio</h1>
              <p className="text-auth-text-secondary mt-1.5 text-sm">创建你的账号</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-auth-text-primary mb-1.5">
                  用户名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    onUsernameChange?.(e.target.value);
                  }}
                  className="w-full h-11 px-3.5 border border-auth-input-border rounded-lg
                    bg-auth-input-bg text-auth-text-primary
                    focus:ring-2 focus:ring-auth-input-focus focus:border-transparent
                    outline-none transition placeholder:text-auth-text-secondary/50"
                  placeholder="设置用户名"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-auth-text-primary mb-1.5">
                  邮箱 <span className="text-auth-text-secondary font-normal">（可选）</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3.5 border border-auth-input-border rounded-lg
                    bg-auth-input-bg text-auth-text-primary
                    focus:ring-2 focus:ring-auth-input-focus focus:border-transparent
                    outline-none transition placeholder:text-auth-text-secondary/50"
                  placeholder="用于找回密码"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-auth-text-primary mb-1.5">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-3.5 border border-auth-input-border rounded-lg
                    bg-auth-input-bg text-auth-text-primary
                    focus:ring-2 focus:ring-auth-input-focus focus:border-transparent
                    outline-none transition placeholder:text-auth-text-secondary/50"
                  placeholder="至少6位"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-auth-text-primary mb-1.5">
                  确认密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-3.5 border border-auth-input-border rounded-lg
                    bg-auth-input-bg text-auth-text-primary
                    focus:ring-2 focus:ring-auth-input-focus focus:border-transparent
                    outline-none transition placeholder:text-auth-text-secondary/50"
                  placeholder="再次输入密码"
                  required
                />
              </div>

              {error && (
                <div className="px-3.5 py-2.5 bg-auth-error-bg text-auth-error-text text-sm rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-auth-button-bg text-white font-medium rounded-lg
                  hover:bg-auth-button-hover transition
                  focus:ring-2 focus:ring-auth-input-focus focus:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '注册中...' : '注册'}
              </button>
            </form>

            <div className="mt-7 text-center text-sm">
              <span className="text-auth-text-secondary">已有账号？</span>
              <button
                onClick={onSwitchToLogin}
                className="ml-1 text-auth-link hover:text-auth-link-hover font-medium transition"
              >
                立即登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
