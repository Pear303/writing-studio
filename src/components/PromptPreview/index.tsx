import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { usePrompt, STAGE_NAMES, STAGE_TO_PROMPTS } from '../../hooks';

interface PromptPreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PromptPreviewPanel: React.FC<PromptPreviewPanelProps> = ({ isOpen, onClose }) => {
  const { loaded, currentStage, buildSystemPrompt, previewPrompts } = usePrompt();
  const [expanded, setExpanded] = useState<Map<string, boolean>>(new Map());
  
  useEffect(() => {
    if (!isOpen && previewPrompts.length > 0) {
      const initial = new Map<string, boolean>();
      previewPrompts.forEach((p) => initial.set(p.fileName, false));
      setExpanded(initial);
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const toggleExpand = (fileName: string) => {
    setExpanded(prev => {
      const next = new Map(prev);
      next.set(fileName, !next.get(fileName));
      return next;
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-vscode-sidebar border border-vscode-border rounded-lg w-[800px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
          <div>
            <h2 className="text-lg font-semibold text-vscode-text">当前写作阶段</h2>
            {loaded ? (
              <span className="text-sm text-green-400 flex items-center gap-1">
                <CheckCircle size={14} />
                {STAGE_NAMES[currentStage] || '空闲中'}
              </span>
            ) : (
              <span className="text-sm text-yellow-400 flex items-center gap-1">
                <AlertCircle size={14} />
                提示词加载中...
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-vscode-active/20 rounded">
            <X size={20} className="text-vscode-text" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {previewPrompts.length === 0 ? (
            <div className="text-center py-12 text-vscode-text opacity-50">
              <FileText size={48} className="mx-auto mb-4" />
              <p>请先选择一个写作阶段</p>
            </div>
          ) : (
            <div className="space-y-3">
              {previewPrompts.map(p => (
                <div key={p.fileName} className="border border-vscode-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleExpand(p.fileName)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-vscode-bg hover:bg-vscode-active/20 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-vscode-active" />
                      <span className="font-medium text-vscode-text">{p.title}</span>
                    </div>
                    {expanded.get(p.fileName) ? (
                      <ChevronUp size={16} className="text-vscode-text" />
                    ) : (
                      <ChevronDown size={16} className="text-vscode-text" />
                    )}
                  </button>
                  
                  {expanded.get(p.fileName) && (
                    <div className="px-4 py-3 border-t border-vscode-border">
                      <pre className="text-sm text-vscode-text whitespace-pre-wrap font-mono bg-vscode-bg p-3 rounded max-h-[400px] overflow-y-auto">
                        {p.fullContent}
                      </pre>
                    </div>
                  )}
                  
                  {!expanded.get(p.fileName) && (
                    <div className="px-4 py-2 border-t border-vscode-border text-sm text-vscode-text opacity-60">
                      {p.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface PromptIndicatorProps {
  onOpenPreview: () => void;
}

export const PromptIndicator: React.FC<PromptIndicatorProps> = ({ onOpenPreview }) => {
  const { loaded, currentStage } = usePrompt();
  
  const stageName = STAGE_NAMES[currentStage] || '空闲';
  const promptCount = STAGE_TO_PROMPTS[currentStage]?.length || 0;
  
  return (
    <button
      onClick={onOpenPreview}
      className="flex items-center gap-1.5 px-2 py-1 text-xs bg-vscode-active/20 hover:bg-vscode-active/30 rounded transition-colors"
      title="点击查看当前使用的提示词"
    >
      <div className={`w-2 h-2 rounded-full ${loaded ? 'bg-green-400' : 'bg-yellow-400'}`} />
      <span className="text-vscode-text">
        {loaded ? `${stageName} (${promptCount})` : '加载中...'}
      </span>
    </button>
  );
};

export default { PromptPreviewPanel, PromptIndicator };