import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getUserByEmail, updateUser, hashPassword, getUserSettings } from '../../db';
import type { SMTPConfig } from '../../db';

type RecoveryStage = 'input' | 'verify' | 'reset';

export const PasswordRecoveryPage = ({ onSuccess }: { onSuccess: () => void }) => {
  const [stage, setStage] = useState<RecoveryStage>('input');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 1. 发送验证码
  const handleSendCode = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      const user = await getUserByEmail(email);
      if (!user) {
        setError('该邮箱未注册');
        setIsLoading(false);
        return;
      }

      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem('recovery_code_' + email, verificationCode);
      localStorage.setItem('recovery_email_' + email, email);
      localStorage.setItem('recovery_expires_' + email, String(Date.now() + 10 * 60 * 1000));

      // 获取用户 SMTP 配置并发送邮件
      const settings = await getUserSettings(user.id);
      if (settings?.smtpConfig) {
        const smtpConfig: SMTPConfig = settings.smtpConfig;
        try {
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
            purpose: 'password_reset',
          });
          setMessage('验证码已发送到您的邮箱');
        } catch (sendError) {
          console.error('邮件发送失败:', sendError);
          setError('邮件发送失败，请检查 SMTP 配置');
          setIsLoading(false);
          return;
        }
      } else {
        // 没有配置 SMTP 时保存验证码但不发送
        console.log('验证码:', verificationCode);
        setMessage('验证码已发送（演示模式：查看控制台）');
      }
      
      setStage('verify');
    } catch (err) {
      setError('发送失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 验证验证码
  const handleVerifyCode = async () => {
    setError('');
    
    const storedCode = localStorage.getItem('recovery_code_' + email);
    const expires = localStorage.getItem('recovery_expires_' + email);
    
    if (!storedCode || !expires) {
      setError('请重新获取验证码');
      return;
    }
    
    if (Date.now() > parseInt(expires)) {
      setError('验证码已过期，请重新获取');
      setStage('input');
      return;
    }
    
    if (code !== storedCode) {
      setError('验证码错误');
      return;
    }
    
    setStage('reset');
  };

  // 3. 重置密码
  const handleResetPassword = async () => {
    setError('');
    
    if (newPassword.length < 6) {
      setError('密码至少需要6位');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const user = await getUserByEmail(email);
      if (!user) {
        setError('用户不存在');
        setIsLoading(false);
        return;
      }
      
      const passwordHash = await hashPassword(newPassword);
      await updateUser(user.id, { passwordHash });
      
      localStorage.removeItem('recovery_code_' + email);
      localStorage.removeItem('recovery_email_' + email);
      localStorage.removeItem('recovery_expires_' + email);
      
      setMessage('密码重置成功');
      setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      setError('重置失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-auth-bg-start to-auth-bg-end">
      <div className="w-full max-w-md p-8 bg-auth-card-bg rounded-2xl shadow-xl border border-auth-card-border">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-auth-text-primary">找回密码</h1>
          <p className="text-auth-text-secondary mt-2">
            {stage === 'input' && '输入注册邮箱'}
            {stage === 'verify' && '输入验证码'}
            {stage === 'reset' && '设置新密码'}
          </p>
        </div>

        {stage === 'input' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-auth-text-primary mb-1">注册邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-auth-input-border rounded-lg focus:ring-2 focus:ring-auth-input-focus focus:border-transparent outline-none transition bg-auth-input-bg text-auth-text-primary"
                placeholder="输入邮箱"
                required
              />
            </div>
            
            {error && (
              <div className="p-3 bg-auth-error-bg text-auth-error-text text-sm rounded-lg">{error}</div>
            )}
            
            {message && (
              <div className="p-3 bg-auth-error-bg text-auth-error-text text-sm rounded-lg" style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>{message}</div>
            )}
            
            <button
              onClick={handleSendCode}
              disabled={isLoading}
              className="w-full py-3 bg-auth-button-bg text-white font-medium rounded-lg hover:bg-auth-button-hover transition disabled:opacity-50"
            >
              {isLoading ? '发送中...' : '发送验证码'}
            </button>
          </div>
        )}

        {stage === 'verify' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-auth-text-primary mb-1">验证码</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-3 border border-auth-input-border rounded-lg focus:ring-2 focus:ring-auth-input-focus focus:border-transparent outline-none transition bg-auth-input-bg text-auth-text-primary"
                placeholder="6位验证码"
                maxLength={6}
                required
              />
            </div>
            
            {error && (
              <div className="p-3 bg-auth-error-bg text-auth-error-text text-sm rounded-lg">{error}</div>
            )}
            
            <button
              onClick={handleVerifyCode}
              className="w-full py-3 bg-auth-button-bg text-white font-medium rounded-lg hover:bg-auth-button-hover transition"
            >
              验证
            </button>
            
            <button
              onClick={() => setStage('input')}
              className="w-full py-2 text-auth-text-secondary text-sm"
            >
              重新获取验证码
            </button>
          </div>
        )}

        {stage === 'reset' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-auth-text-primary mb-1">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border border-auth-input-border rounded-lg focus:ring-2 focus:ring-auth-input-focus focus:border-transparent outline-none transition bg-auth-input-bg text-auth-text-primary"
                placeholder="至少6位"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-auth-text-primary mb-1">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-auth-input-border rounded-lg focus:ring-2 focus:ring-auth-input-focus focus:border-transparent outline-none transition bg-auth-input-bg text-auth-text-primary"
                placeholder="再次输入"
                required
              />
            </div>
            
            {error && (
              <div className="p-3 bg-auth-error-bg text-auth-error-text text-sm rounded-lg">{error}</div>
            )}
            
            <button
              onClick={handleResetPassword}
              disabled={isLoading}
              className="w-full py-3 bg-auth-button-bg text-white font-medium rounded-lg hover:bg-auth-button-hover transition disabled:opacity-50"
            >
              {isLoading ? '重置中...' : '重置密码'}
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button onClick={onSuccess} className="text-auth-link hover:text-auth-link-hover">
            返回登录
          </button>
        </div>
      </div>
    </div>
  );
};