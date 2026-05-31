import React from 'react';
import { X, Plus, FileText, Eye, Code, Download } from 'lucide-react';

export interface TabItem {
  id: string;
  title: string;
  content: string;
  mode: 'source' | 'preview';
}

interface TabViewProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onTabChange: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabAdd?: (title: string) => void;
  onModeChange?: (tabId: string, mode: 'source' | 'preview') => void;
  onImport?: (content: string, title: string) => void;
}

export const TabView: React.FC<TabViewProps> = ({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
  onTabAdd,
  onModeChange,
  onImport,
}) => {
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center bg-vscode-sidebar border-b border-vscode-border overflow-x-auto">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-vscode-border min-w-[120px] max-w-[200px] ${
              tab.id === activeTabId
                ? 'bg-vscode-bg text-vscode-text'
                : 'bg-vscode-sidebar text-vscode-text opacity-70 hover:opacity-100'
            }`}
            onClick={() => onTabChange(tab.id)}
          >
            <FileText size={14} />
            <span className="text-sm truncate flex-1">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="p-0.5 hover:bg-vscode-border rounded opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {onTabAdd && (
          <button
            onClick={() => onTabAdd(`新标签页 ${tabs.length + 1}`)}
            className="p-2 hover:bg-vscode-border text-vscode-text opacity-70 hover:opacity-100"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {activeTab && (
        <div className="flex items-center gap-2 px-3 py-1 bg-vscode-sidebar border-b border-vscode-border">
          <button
            onClick={() => onModeChange?.(activeTab.id, 'source')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              activeTab.mode === 'source'
                ? 'bg-vscode-active text-white'
                : 'text-vscode-text opacity-70 hover:opacity-100'
            }`}
          >
            <Code size={12} />
            源码
          </button>
          <button
            onClick={() => onModeChange?.(activeTab.id, 'preview')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              activeTab.mode === 'preview'
                ? 'bg-vscode-active text-white'
                : 'text-vscode-text opacity-70 hover:opacity-100'
            }`}
          >
            <Eye size={12} />
            预览
          </button>
          {onImport && (
            <button
              onClick={() => onImport(activeTab.content, activeTab.title)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-border ml-auto"
              title="一键导入到编辑器"
            >
              <Download size={12} />
              导入
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-vscode-bg">
        {activeTab ? (
          activeTab.mode === 'source' ? (
            <pre className="p-4 text-sm text-vscode-text font-mono whitespace-pre-wrap">
              {activeTab.content}
            </pre>
          ) : (
            <div className="p-4 markdown-preview">
              <MarkdownRenderer content={activeTab.content} />
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-vscode-text opacity-50">
            <div className="text-center">
              <FileText size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无打开的标签页</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  
  const renderLine = (line: string, index: number) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('# ')) {
      return <h1 key={index} className="text-2xl font-bold text-vscode-text mt-6 mb-4">{trimmed.slice(2)}</h1>;
    }
    if (trimmed.startsWith('## ')) {
      return <h2 key={index} className="text-xl font-bold text-vscode-text mt-5 mb-3">{trimmed.slice(3)}</h2>;
    }
    if (trimmed.startsWith('### ')) {
      return <h3 key={index} className="text-lg font-semibold text-vscode-text mt-4 mb-2">{trimmed.slice(4)}</h3>;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return <li key={index} className="ml-4 text-vscode-text">{trimmed.slice(2)}</li>;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      return <li key={index} className="ml-4 text-vscode-text list-decimal">{trimmed.replace(/^\d+\.\s/, '')}</li>;
    }
    if (trimmed.startsWith('```')) {
      return null;
    }
    if (trimmed === '') {
      return <br key={index} />;
    }
    
    let processed = trimmed
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="px-1 bg-vscode-sidebar rounded text-sm">$1</code>');
    
    return (
      <p key={index} className="text-vscode-text mb-2" dangerouslySetInnerHTML={{ __html: processed }} />
    );
  };

  return (
    <div className="prose prose-invert max-w-none">
      {lines.map((line, i) => renderLine(line, i))}
    </div>
  );
};

export default TabView;
