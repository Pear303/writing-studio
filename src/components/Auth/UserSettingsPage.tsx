import { useState } from 'react';
import { useUser } from '../../auth/UserContext';
import { updateUser, exportAllData, getLoginLogs, deleteUser } from '../../db';
import { removeToken } from '../../auth/token';
import { deleteUserFolders } from '../../utils/userDataManager';

export const UserSettingsPage = ({ onLogout }: { onLogout: () => void }) => {
  const { user, refreshUser } = useUser();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [message, setMessage] = useState('');

  const handleSaveProfile = async () => {
    if (!user) return;
    try {
      await updateUser(user.id, { nickname: nickname || undefined });
      await refreshUser();
      setIsEditing(false);
      setMessage('保存成功');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      console.error('保存失败:', err);
      setMessage('保存失败');
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const data = await exportAllData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `writing-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('导出成功');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      console.error('导出失败:', err);
      setMessage('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleViewLogs = async () => {
    if (!user) return;
    const logs = await getLoginLogs(user.id, 10);
    setLogs(logs);
    setShowLogs(true);
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirm !== '确认删除') return;
    setIsDeleting(true);
    try {
      await deleteUserFolders(user.id);
      await deleteUser(user.id);
      removeToken();
      onLogout();
    } catch (err) {
      console.error('删除失败:', err);
      setMessage('删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    onLogout();
  };

  if (!user) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">账号设置</h2>

      {message && (
        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-vscode-active-light)', color: 'var(--color-vscode-text)' }}>
          {message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-medium text-slate-800 mb-4">个人资料</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">用户名</label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-600 mb-1">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={!isEditing}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="设置昵称"
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-600 mb-1">邮箱</label>
            <input
              type="email"
              value={user.email || '未设置'}
              disabled
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500"
            />
          </div>
          
          <button
            onClick={isEditing ? handleSaveProfile : () => setIsEditing(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
          >
            {isEditing ? '保存' : '编辑'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-medium text-slate-800 mb-4">数据管理</h3>
        
        <div className="space-y-3">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition disabled:opacity-50"
          >
            {isExporting ? '导出中...' : '导出数据备份'}
          </button>
          
          <button
            onClick={handleViewLogs}
            className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
          >
            查看登录历史
          </button>
        </div>
      </div>

      {showLogs && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-slate-800">登录历史</h3>
            <button onClick={() => setShowLogs(false)} className="text-slate-500">关闭</button>
          </div>
          
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                <span className="text-slate-600">
                  {new Date(log.loginTime).toLocaleString('zh-CN')}
                </span>
                <span className={log.success ? 'text-green-600' : 'text-red-600'}>
                  {log.success ? '成功' : '失败'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h3 className="text-lg font-medium text-slate-800 mb-4">账号安全</h3>
        
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
        >
          退出登录
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
        <h3 className="text-lg font-medium text-red-600 mb-4">危险区域</h3>
        
        <div className="space-y-3">
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="w-full px-4 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition"
            placeholder="输入 确认删除 以确认"
          />
          
          <button
            onClick={handleDeleteAccount}
            disabled={deleteConfirm !== '确认删除' || isDeleting}
            className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '删除中...' : '永久删除账号'}
          </button>
        </div>
      </div>
    </div>
  );
};