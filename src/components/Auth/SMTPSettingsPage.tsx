import { useState } from 'react';
import { useUser } from '../../auth/UserContext';
import { saveUserSettings, getUserSettings, type SMTPConfig } from '../../db';

const COMMON_SMTP = {
  'qq': { host: 'smtp.qq.com', port: 465, secure: true },
  '163': { host: 'smtp.163.com', port: 465, secure: true },
  '126': { host: 'smtp.126.com', port: 465, secure: true },
  'gmail': { host: 'smtp.gmail.com', port: 465, secure: true },
  'outlook': { host: 'smtp.office365.com', port: 587, secure: false },
};

export const SMTPSettingsPage = ({ onClose }: { onClose: () => void }) => {
  const { user } = useUser();
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState('custom');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(465);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleProviderChange = (p: string) => {
    setProvider(p);
    if (p !== 'custom' && COMMON_SMTP[p as keyof typeof COMMON_SMTP]) {
      const config = COMMON_SMTP[p as keyof typeof COMMON_SMTP];
      setHost(config.host);
      setPort(config.port);
      setSecure(config.secure);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setError('');
    setMessage('');

    try {
      console.log('SMTP配置测试（前端演示）:', {
        host, port, secure, username, email
      });
      setMessage('配置已保存，邮件发送功能需要后端支持');
    } catch (err) {
      setError('测试失败');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setError('');

    try {
      const smtpConfig: SMTPConfig = {
        host,
        port,
        secure,
        username,
        password,
        fromEmail: email,
      };

      const currentSettings = await getUserSettings(user.id);
      await saveUserSettings({
        userId: user.id,
        theme: 'light',
        formattingSettings: currentSettings?.formattingSettings || {},
        smtpConfig,
        updatedAt: Date.now(),
      });

      setMessage('保存成功');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-vscode-text">邮箱设置（未测试）</h2>
        <button onClick={onClose} className="text-vscode-text opacity-60 hover:opacity-100">关闭</button>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-success-light)', color: 'var(--color-success)' }}>{message}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>{error}</div>
      )}

      <div className="bg-vscode-input rounded-xl border border-vscode-border p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">邮箱服务商</label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="w-full px-4 py-2 select-field"
          >
            <option value="custom">自定义</option>
            <option value="qq">QQ邮箱</option>
            <option value="163">163邮箱</option>
            <option value="126">126邮箱</option>
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">SMTP服务器</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="w-full px-4 py-2 input-field"
            placeholder="smtp.example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">端口</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value))}
              className="w-full px-4 py-2 input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">加密</label>
            <select
              value={secure ? 'true' : 'false'}
              onChange={(e) => setSecure(e.target.value === 'true')}
              className="w-full px-4 py-2 select-field"
            >
              <option value="true">SSL/TLS</option>
              <option value="false">无</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">邮箱账号</label>
          <input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 input-field"
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">SMTP用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 input-field"
            placeholder="同邮箱账号"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-vscode-text opacity-60 mb-2">SMTP密码/授权码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 input-field"
            placeholder="SMTP密码或授权码"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="flex-1 px-4 py-2 rounded-lg transition disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-vscode-active-light)',
              color: 'var(--color-vscode-active)',
            }}
          >
            {isTesting ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 rounded-lg transition disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-vscode-active)',
              color: '#ffffff',
            }}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="mt-4 p-4 rounded-lg text-sm text-vscode-text opacity-60" style={{ backgroundColor: 'var(--color-vscode-active-light)' }}>
        <p className="font-medium mb-1">提示：</p>
        <ul className="list-disc list-inside space-y-1">
          <li>QQ邮箱需要使用授权码而非登录密码</li>
          <li>163/126邮箱也需要使用授权码</li>
          <li>Gmail需要开启IMAP/SMTP访问</li>
        </ul>
      </div>
    </div>
  );
};
