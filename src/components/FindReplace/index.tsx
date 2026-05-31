import React, { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface FindReplaceProps {
  onFind: (searchText: string, caseSensitive?: boolean) => void;
  onReplace: (searchText: string, replaceText: string, caseSensitive?: boolean) => void;
  onReplaceAll: (searchText: string, replaceText: string, caseSensitive?: boolean) => void;
  onClose: () => void;
}

export const FindReplace = ({
  onFind,
  onReplace,
  onReplaceAll,
  onClose,
}: FindReplaceProps) => {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  // ESC 键关闭
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleFind = () => {
    if (searchText) {
      onFind(searchText, caseSensitive);
    }
  };

  const handleReplace = () => {
    if (searchText && replaceText) {
      onReplace(searchText, replaceText, caseSensitive);
    }
  };

  const handleReplaceAll = () => {
    if (searchText && replaceText) {
      onReplaceAll(searchText, replaceText, caseSensitive);
    }
  };

  return (
    <div 
      className="absolute top-0 right-0 bg-vscode-sidebar border-b border-l border-vscode-border p-2 z-50 min-w-[320px]"
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-1.5 icon-btn"
        style={{ color: 'var(--color-vscode-text, #9ca3af)', opacity: 0.6 }}
      >
        <X size={14} />
      </button>

      {/* 搜索框 */}
      <div className="mb-1.5">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFind();
            }
          }}
          placeholder="搜索..."
          className="w-full px-2 py-1 text-sm text-vscode-text focus:outline-none focus:border-vscode-active input-field"
          autoFocus
        />
      </div>

      {/* 替换框 */}
      {showReplace && (
        <div className="mb-1.5">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleReplace();
              }
            }}
            placeholder="替换为..."
            className="w-full px-2 py-1 text-sm text-vscode-text focus:outline-none focus:border-vscode-active input-field"
          />
        </div>
      )}

      {/* 选项和按钮 - 简约设计 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <label className="flex items-center text-xs text-vscode-text cursor-pointer">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="mr-1"
            />
            区分大小写
          </label>
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="text-xs hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-vscode-active, #007acc)' }}
          >
            {showReplace ? '隐藏替换' : '替换'}
          </button>
        </div>

        <div className="flex items-center space-x-1">
          {showReplace ? (
            <>
              <button
                onClick={handleReplace}
                className="px-2 py-0.5 text-xs text-white transition-colors"
                style={{ backgroundColor: 'var(--color-vscode-active, #007acc)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#005a9e';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-vscode-active, #007acc)';
                }}
              >
                替换
              </button>
              <button
                onClick={handleReplaceAll}
                className="px-2 py-0.5 text-xs text-white transition-colors"
                style={{ backgroundColor: 'var(--color-vscode-border, #454545)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-vscode-text, #cccccc)';
                  e.currentTarget.style.color = 'var(--color-vscode-bg, #1e1e1e)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-vscode-border, #454545)';
                  e.currentTarget.style.color = 'white';
                }}
              >
                全部替换
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn p-0.5">
                <ChevronUp size={14} />
              </button>
              <button className="icon-btn p-0.5">
                <ChevronDown size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
