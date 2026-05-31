import { useState, useEffect } from 'react';
import { clearGuestData, hasGuestData } from '../../auth/guest';

interface GuestMergePageProps {
  onMerge: () => void;
  onSkip: () => void;
  onLoginSuccess: () => void;
}

export const GuestMergePage = ({ onMerge, onSkip, onLoginSuccess }: GuestMergePageProps) => {
  const [isMerging, setIsMerging] = useState(false);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    setHasData(hasGuestData());
  }, []);

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMerge();
      clearGuestData();
      onLoginSuccess();
    } catch (err) {
      console.error('合并失败:', err);
    } finally {
      setIsMerging(false);
    }
  };

  const handleSkip = () => {
    clearGuestData();
    onSkip();
  };

  if (!hasData) {
    handleSkip();
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">检测到游客数据</h1>
          <p className="text-slate-500 mt-2">您之前作为游客有一些未保存的数据</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleMerge}
            disabled={isMerging}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
          >
            {isMerging ? '合并中...' : '合并到我的账号'}
          </button>
          
          <button
            onClick={handleSkip}
            disabled={isMerging}
            className="w-full py-2 text-slate-500 text-sm hover:text-slate-700"
          >
            跳过（数据将被清除）
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-400 text-center">
          合并后您的书籍、章节、素材将保留在账号中
        </p>
      </div>
    </div>
  );
};