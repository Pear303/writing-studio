import React, { useState } from 'react';
import { CheckCircle, ClipboardList } from 'lucide-react';
import { QualityCheckPanel } from '../QualityCheckPanel';
import type { Chapter, QARecord } from '../../types';

interface QAPanelProps {
  bookId?: string;
  currentChapter?: Chapter | null;
  onSelectRecord?: (record: QARecord) => void;
}

export const QAPanel: React.FC<QAPanelProps> = ({ bookId, currentChapter, onSelectRecord }) => {
  const [activeTab, setActiveTab] = useState<'checklist' | 'history'>('checklist');

  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-text opacity-50">
        <div className="text-center">
          <CheckCircle size={48} className="mx-auto mb-2 opacity-50" />
          <p>请先选择一本书</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 标签切换 */}
      <div className="flex border-b border-vscode-border bg-vscode-sidebar">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'checklist'
              ? 'text-vscode-active border-b-2 border-vscode-active'
              : 'text-vscode-text opacity-60 hover:opacity-100'
          }`}
        >
          <ClipboardList size={14} />
          质检
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-vscode-active border-b-2 border-vscode-active'
              : 'text-vscode-text opacity-60 hover:opacity-100'
          }`}
        >
          <CheckCircle size={14} />
          历史
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'checklist' ? (
          <QualityCheckPanel
            bookId={bookId}
            currentChapter={currentChapter}
          />
        ) : (
          <QAHistoryPanel
            bookId={bookId}
            onSelectRecord={onSelectRecord}
          />
        )}
      </div>
    </div>
  );
};

const QAHistoryPanel: React.FC<{
  bookId: string;
  onSelectRecord?: (record: QARecord) => void;
}> = ({ bookId, onSelectRecord }) => {
  const [records, setRecords] = useState<QARecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<QARecord | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRecords = async () => {
    const { db } = await import('../../db');
    setLoading(true);
    try {
      const allRecords = await db.qaRecords
        .where('bookId')
        .equals(bookId)
        .reverse()
        .sortBy('createdAt');
      setRecords(allRecords);
    } catch (error) {
      console.error('[QAHistoryPanel] 加载质检记录失败:', error);
      setRecords([]);
    }
    setLoading(false);
  };

  React.useEffect(() => {
    loadRecords();
  }, [bookId]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'error': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDeleteRecord = async (record: QARecord) => {
    if (!confirm('确定要删除这条质检记录吗？')) return;
    try {
      const { db } = await import('../../db');
      await db.qaRecords.delete(record.id);
      loadRecords();
      if (selectedRecord?.id === record.id) {
        setSelectedRecord(null);
      }
    } catch (error) {
      console.error('[QAHistoryPanel] 删除记录失败:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-text">
        <p className="text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-vscode-sidebar">
      <div className="p-3 border-b border-vscode-border">
        <p className="text-xs text-vscode-text opacity-60">{records.length} 条记录</p>
      </div>

      <div className="flex-1 overflow-auto">
        {records.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-vscode-text opacity-50">
            <p className="text-sm">暂无质检记录</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {records.map((record) => (
              <div
                key={record.id}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  selectedRecord?.id === record.id
                    ? 'border-vscode-active bg-vscode-active/10'
                    : 'border-vscode-border hover:bg-vscode-border/50'
                }`}
                onClick={() => setSelectedRecord(record)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-vscode-text truncate flex-1">
                    {record.content.slice(0, 40)}
                  </span>
                  <span className="text-xs text-vscode-text opacity-60 flex-shrink-0 ml-2">
                    {formatDate(record.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-vscode-text opacity-60">
                  <span>{record.issues.length} 个问题</span>
                  {record.score !== undefined && (
                    <span className="text-vscode-active">评分: {record.score}/80</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {onSelectRecord && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRecord(record);
                      }}
                      className="p-1 hover:bg-vscode-border rounded"
                      title="查看详情"
                    >
                      <CheckCircle size={14} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRecord(record);
                    }}
                    className="p-1 hover:bg-vscode-border rounded text-red-500"
                    title="删除"
                  >
                    <CheckCircle size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRecord && (
        <div className="border-t border-vscode-border p-3 max-h-1/2 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-vscode-text">问题详情</h3>
            <button
              onClick={() => setSelectedRecord(null)}
              className="text-xs text-vscode-text opacity-60 hover:opacity-100"
            >
              关闭
            </button>
          </div>
          <div className="space-y-1.5">
            {selectedRecord.issues.map((issue, index) => (
              <div key={index} className="p-2 bg-vscode-bg rounded text-xs">
                <div className={`flex items-center gap-1 mb-0.5 ${getTypeColor(issue.type)}`}>
                  {issue.message}
                </div>
                {issue.location && (
                  <p className="text-vscode-text opacity-60 ml-1">位置: {issue.location}</p>
                )}
                {issue.suggestion && (
                  <p className="text-vscode-active ml-1">建议: {issue.suggestion}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QAPanel;
