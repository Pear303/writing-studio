import { useState, useEffect } from 'react';
import { verifyPassword, addLoginLog, getUserByUsername, getUserByEmail, type User } from '../../db';
import { generateToken, saveToken } from '../../auth/token';
import { useUser } from '../../auth/UserContext';

interface LoginPageProps {
  onSwitchToRegister: () => void;
  onSwitchToRecovery: () => void;
  onSuccess: () => void;
  initialUsername?: string;
  onUsernameChange?: (username: string) => void;
}

export const LoginPage = ({ onSwitchToRegister, onSwitchToRecovery, onSuccess, initialUsername, onUsernameChange }: LoginPageProps) => {
  const [identifier, setIdentifier] = useState(initialUsername || '');

  // 从注册页切到登录页时，同步已输入的用户名
  useEffect(() => {
    if (initialUsername) {
      setIdentifier(initialUsername);
    }
  }, [initialUsername]);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const isEmail = identifier.includes('@');
      let user: User | undefined;

      if (isEmail) {
        user = await getUserByEmail(identifier);
      } else {
        user = await getUserByUsername(identifier);
      }

      if (!user) {
        setError('用户不存在');
        setIsLoading(false);
        return;
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        await addLoginLog(user.id, false, navigator.userAgent);
        setError('密码错误');
        setIsLoading(false);
        return;
      }

      await addLoginLog(user.id, true, navigator.userAgent);

      const expiresIn = rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
      const token = generateToken(user.id, expiresIn);
      saveToken(token, rememberMe);
      await login(user, token);

      onSuccess();
    } catch (err) {
      console.error('登录错误:', err);
      setError('登录失败，请重试');
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
              <p className="text-auth-text-secondary mt-1.5 text-sm">欢迎回来</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-auth-text-primary mb-1.5">
                  用户名或邮箱
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    onUsernameChange?.(e.target.value);
                  }}
                  className="w-full h-11 px-3.5 border border-auth-input-border rounded-lg
                    bg-auth-input-bg text-auth-text-primary
                    focus:ring-2 focus:ring-auth-input-focus focus:border-transparent
                    outline-none transition placeholder:text-auth-text-secondary/50"
                  placeholder="输入用户名或邮箱"
                  required
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
                  placeholder="输入密码"
                  required
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-auth-input-border
                      text-auth-checkbox focus:ring-auth-input-focus"
                  />
                  <span className="text-sm text-auth-text-secondary">记住我</span>
                </label>
                <button
                  type="button"
                  onClick={onSwitchToRecovery}
                  className="text-sm text-auth-link hover:text-auth-link-hover transition"
                >
                  忘记密码？
                </button>
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
                {isLoading ? '登录中...' : '登录'}
              </button>
            </form>

            <div className="mt-7 text-center text-sm">
              <span className="text-auth-text-secondary">还没有账号？</span>
              <button
                onClick={onSwitchToRegister}
                className="ml-1 text-auth-link hover:text-auth-link-hover font-medium transition"
              >
                立即注册
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
