import { useState } from 'react';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { PasswordRecoveryPage } from './PasswordRecoveryPage';

type AuthMode = 'login' | 'register' | 'recovery';

export const AuthPage = ({ onSuccess }: { onSuccess: () => void }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  // 提升到 AuthPage 层级，切换 mode 时保留
  const [sharedUsername, setSharedUsername] = useState('');

  const handleModeChange = (newMode: AuthMode) => {
    // 从 register 切到 login 时保留用户名
    if (newMode === 'login' && mode === 'register') {
      // sharedUsername 已经通过 RegisterPage 的输入保持
    }
    setMode(newMode);
  };

  return (
    <div>
      {/* 始终挂载但用 hidden 切换，保持表单状态 */}
      <div className={mode === 'login' ? '' : 'hidden'}>
        <LoginPage 
          onSwitchToRegister={() => handleModeChange('register')}
          onSwitchToRecovery={() => handleModeChange('recovery')}
          onSuccess={onSuccess}
          initialUsername={sharedUsername}
          onUsernameChange={setSharedUsername}
        />
      </div>
      <div className={mode === 'register' ? '' : 'hidden'}>
        <RegisterPage 
          onSwitchToLogin={() => handleModeChange('login')}
          onSuccess={onSuccess}
          initialUsername={sharedUsername}
          onUsernameChange={setSharedUsername}
        />
      </div>
      <div className={mode === 'recovery' ? '' : 'hidden'}>
        <PasswordRecoveryPage 
          onSuccess={() => handleModeChange('login')}
        />
      </div>
    </div>
  );
};