import React, { useState, useRef, useEffect } from 'react';
import { FileUp, Loader2, CheckCircle, AlertTriangle, BookOpen, FolderOpen, FileText, X, BookMarked } from 'lucide-react';
import {
  selectNovelFile,
  readNovelFile,
  extractTextSample,
  extractTextFromJson,
  analyzeNovelStructure,
  splitNovelText,
  importSplitResult,
  generatePreviewText,
  type NovelStructureAnalysis,
  type SplitResult,
} from '../../services/novelImportService';
import type { ToastType } from '../Toast';

type ImportStep = 'select' | 'analyzing' | 'preview' | 'importing' | 'done' | 'error';

interface ImportNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (bookId: string) => void;
  onStartDeconstruction?: (bookId: string, chapters: Array<{ index: number; title: string; content: string }>, fileName: string) => void;
  showToast: (message: string, type: ToastType) => void;
}

export const ImportNovelModal = ({ isOpen, onClose, onImportComplete, onStartDeconstruction, showToast }: ImportNovelModalProps) => {
  const [step, setStep] = useState<ImportStep>('select');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [fullText, setFullText] = useState('');
  const [analysis, setAnalysis] = useState<NovelStructureAnalysis | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [bookName, setBookName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [importedBookId, setImportedBookId] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (step === 'done') {
        resetState();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        if (step === 'analyzing' || step === 'importing' || step === 'preview') {
          return;
        }
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, step]);

  const resetState = () => {
    setStep('select');
    setFilePath('');
    setFileName('');
    setFullText('');
    setAnalysis(null);
    setSplitResult(null);
    setBookName('');
    setErrorMessage('');
    setImportedBookId('');
  };

  const handleSelectFile = async () => {
    try {
      const result = await selectNovelFile();
      if (!result) return;

      setFilePath(result.path);
      setFileName(result.name);

      const nameWithoutExt = result.name.replace(/\.(txt|json|md)$/i, '');
      setBookName(nameWithoutExt);

      setStep('analyzing');

      let text = await readNovelFile(result.path);

      if (result.name.toLowerCase().endsWith('.json')) {
        text = extractTextFromJson(text);
      }

      setFullText(text);

      const sample = extractTextSample(text);
      console.log(`[ImportNovelModal] Text loaded: ${text.length} chars, sample: ${sample.length} chars`);

      const analysisResult = await analyzeNovelStructure(sample, result.name, text.length);

      console.log(`[ImportNovelModal] Analysis result:`, analysisResult);

      if (!analysisResult.success) {
        const errMsg = analysisResult.error || 'Agent分析失败，将使用兜底策略进行拆分';
        console.warn(`[ImportNovelModal] Analysis failed: ${errMsg}`);
        setErrorMessage(errMsg);
        setAnalysis({
          ...analysisResult,
          success: true,
          confidence: 'low',
          chapter_pattern: null,
        });
      } else {
        setAnalysis(analysisResult);
      }

      const split = splitNovelText(text, analysisResult.success ? analysisResult : {
        ...analysisResult,
        success: true,
        confidence: 'low',
        chapter_pattern: null,
      });
      setSplitResult(split);
      setStep('preview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '文件读取失败');
      setStep('error');
    }
  };

  const handleConfirmImport = async () => {
    if (!splitResult) return;

    setStep('importing');

    try {
      const result = await importSplitResult(splitResult, bookName);
      setImportedBookId(result.bookId);
      setStep('done');
      showToast(`成功导入「${result.bookName}」：${result.chapterCount}章，${result.totalWords}字`, 'success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '导入失败');
      setStep('error');
      showToast('导入失败，请重试', 'error');
    }
  };

  const handleOpenBook = () => {
    if (importedBookId) {
      onImportComplete(importedBookId);
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderStepContent = () => {
    switch (step) {
      case 'select':
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
            >
              <FileUp size={36} style={{ color: 'var(--color-vscode-active)' }} />
            </div>
            <div className="text-center">
              <p className="text-vscode-text text-base font-medium mb-1">导入小说文本</p>
              <p className="text-vscode-text opacity-60 text-sm">
                支持 TXT、JSON、MD 格式，Agent 将智能识别章节结构
              </p>
            </div>
            <button
              onClick={handleSelectFile}
              className="btn-primary px-6 py-2 text-sm flex items-center gap-2"
              style={{ borderRadius: '6px' }}
            >
              <FileUp size={16} />
              选择文件
            </button>
            {filePath && (
              <p className="text-vscode-text opacity-50 text-xs mt-2">
                已选择：{fileName}
              </p>
            )}
          </div>
        );

      case 'analyzing':
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-vscode-active)' }} />
            <div className="text-center">
              <p className="text-vscode-text text-base font-medium mb-1">正在分析文本结构...</p>
              <p className="text-vscode-text opacity-60 text-sm">
                Agent 正在读取文本样本，识别分卷分章格式
              </p>
            </div>
            {fileName && (
              <p className="text-vscode-text opacity-50 text-xs">
                文件：{fileName}
              </p>
            )}
          </div>
        );

      case 'preview':
        if (!analysis || !splitResult) return null;
        return (
          <div className="flex flex-col gap-4 py-2">
            {errorMessage && splitResult.strategy === 'fallback' && (
              <div
                className="px-3 py-2 rounded-md text-xs"
                style={{
                  backgroundColor: 'var(--color-danger-light)',
                  border: '1px solid var(--color-danger, #ef4444)',
                }}
              >
                <p className="text-vscode-text font-medium mb-1">⚠️ Agent 分析失败</p>
                <p className="text-vscode-text opacity-70">{errorMessage}</p>
                <p className="text-vscode-text opacity-50 mt-1">将使用兜底策略进行拆分</p>
              </div>
            )}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
              style={{
                backgroundColor: splitResult.strategy === 'fallback'
                  ? 'var(--color-danger-light)'
                  : 'var(--color-success-light)',
              }}
            >
              {splitResult.strategy === 'fallback' ? (
                <>
                  <AlertTriangle size={16} style={{ color: 'var(--color-danger)' }} />
                  <span className="text-vscode-text">
                    未能识别章节结构，将按每章上限3万字 + 段落切分
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                  <span className="text-vscode-text">
                    已识别章节结构（置信度：{analysis.confidence === 'high' ? '高' : analysis.confidence === 'medium' ? '中' : '低'}）
                  </span>
                </>
              )}
            </div>

            {analysis.analysis_note && (
              <div
                className="px-3 py-2 rounded-md text-xs text-vscode-text opacity-70"
                style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
              >
                💡 {analysis.analysis_note}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div
                className="px-3 py-2 rounded-md text-center"
                style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
              >
                <p className="text-vscode-text text-lg font-bold">{splitResult.totalChapters}</p>
                <p className="text-vscode-text opacity-60 text-xs">章节</p>
              </div>
              <div
                className="px-3 py-2 rounded-md text-center"
                style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
              >
                <p className="text-vscode-text text-lg font-bold">
                  {splitResult.volumes.length || (splitResult.unassignedChapters.length > 0 ? 1 : 0)}
                </p>
                <p className="text-vscode-text opacity-60 text-xs">卷</p>
              </div>
              <div
                className="px-3 py-2 rounded-md text-center"
                style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
              >
                <p className="text-vscode-text text-lg font-bold">
                  {(splitResult.totalChars / 10000).toFixed(1)}万
                </p>
                <p className="text-vscode-text opacity-60 text-xs">字</p>
              </div>
            </div>

            <div>
              <label className="text-vscode-text text-sm font-medium mb-1 block">书名</label>
              <input
                type="text"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                className="input-field w-full text-sm"
                placeholder="输入书名"
              />
            </div>

            <div
              className="max-h-60 overflow-y-auto rounded-md p-3 text-xs font-mono leading-relaxed"
              style={{
                backgroundColor: 'var(--color-vscode-bg)',
                border: '1px solid var(--color-vscode-border)',
              }}
            >
              <pre className="text-vscode-text whitespace-pre-wrap">{generatePreviewText(splitResult)}</pre>
            </div>

            {splitResult.volumes.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {splitResult.volumes.map((vol, vi) => (
                  <div key={vi} className="mb-2">
                    <div className="flex items-center gap-1.5 text-sm text-vscode-text font-medium">
                      <FolderOpen size={14} style={{ color: 'var(--color-vscode-active)' }} />
                      {vol.title}
                      <span className="text-vscode-text opacity-50 text-xs">（{vol.chapters.length}章）</span>
                    </div>
                    <div className="ml-5 mt-1 space-y-0.5">
                      {vol.chapters.slice(0, 8).map((ch, ci) => (
                        <div key={ci} className="flex items-center gap-1 text-xs text-vscode-text opacity-70">
                          <FileText size={10} />
                          {ch.title}
                          <span className="opacity-50">（{ch.content.length}字）</span>
                        </div>
                      ))}
                      {vol.chapters.length > 8 && (
                        <p className="text-xs text-vscode-text opacity-40 ml-3.5">
                          ... 还有 {vol.chapters.length - 8} 章
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'importing':
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-vscode-active)' }} />
            <div className="text-center">
              <p className="text-vscode-text text-base font-medium mb-1">正在导入...</p>
              <p className="text-vscode-text opacity-60 text-sm">
                正在创建书籍并写入章节内容
              </p>
            </div>
          </div>
        );

      case 'done':
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-success-light)' }}
            >
              <CheckCircle size={36} style={{ color: 'var(--color-success)' }} />
            </div>
            <div className="text-center">
              <p className="text-vscode-text text-base font-medium mb-1">导入成功！</p>
              {splitResult && (
                <p className="text-vscode-text opacity-60 text-sm">
                  「{bookName}」共 {splitResult.totalChapters} 章，{(splitResult.totalChars / 10000).toFixed(1)} 万字
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleOpenBook}
                className="btn-primary px-4 py-2 text-sm flex items-center gap-2"
                style={{ borderRadius: '6px' }}
              >
                <BookOpen size={16} />
                打开书籍
              </button>
              {onStartDeconstruction && splitResult && (
                <button
                  onClick={() => {
                    const chapters: Array<{ index: number; title: string; content: string }> = [];
                    let idx = 0;
                    if (splitResult.volumes.length > 0) {
                      for (const vol of splitResult.volumes) {
                        for (const ch of vol.chapters) {
                          if (ch.content?.trim()) {
                            chapters.push({ index: idx, title: ch.title, content: ch.content });
                          }
                          idx++;
                        }
                      }
                    }
                    for (const ch of splitResult.unassignedChapters) {
                      if (ch.content?.trim()) {
                        chapters.push({ index: idx, title: ch.title, content: ch.content });
                      }
                      idx++;
                    }
                    if (chapters.length === 0) {
                      showToast('未找到有效章节内容，无法进行拆书分析', 'error');
                      return;
                    }
                    onStartDeconstruction(importedBookId, chapters, bookName);
                    onClose();
                  }}
                  className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
                  style={{ borderRadius: '6px' }}
                >
                  <BookMarked size={16} />
                  拆书分析
                </button>
              )}
              <button
                onClick={onClose}
                className="btn-secondary px-4 py-2 text-sm"
                style={{ borderRadius: '6px' }}
              >
                关闭
              </button>
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-danger-light)' }}
            >
              <AlertTriangle size={36} style={{ color: 'var(--color-danger)' }} />
            </div>
            <div className="text-center">
              <p className="text-vscode-text text-base font-medium mb-1">导入失败</p>
              <p className="text-vscode-text opacity-60 text-sm">{errorMessage}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetState}
                className="btn-primary px-4 py-2 text-sm"
                style={{ borderRadius: '6px' }}
              >
                重新选择
              </button>
              <button
                onClick={onClose}
                className="btn-secondary px-4 py-2 text-sm"
                style={{ borderRadius: '6px' }}
              >
                关闭
              </button>
            </div>
          </div>
        );
    }
  };

  const canCloseByOverlay = step === 'select' || step === 'done' || step === 'error';
  const showConfirmBtn = step === 'preview' && splitResult && splitResult.totalChapters > 0;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(2px)' }}
      onClick={canCloseByOverlay ? onClose : undefined}
    >
      <div
        ref={modalRef}
        className="bg-vscode-sidebar border border-vscode-border w-[560px] max-h-[85vh] flex flex-col animate-scale-in"
        style={{ borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-border">
          <h3 className="text-base font-semibold text-vscode-text flex items-center gap-2">
            <BookOpen size={18} style={{ color: 'var(--color-vscode-active)' }} />
            导入小说
          </h3>
          {step !== 'analyzing' && step !== 'importing' && (
            <button
              onClick={onClose}
              className="text-vscode-text opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {renderStepContent()}
        </div>

        {showConfirmBtn && (
          <div className="flex justify-between px-4 py-3 border-t border-vscode-border">
            <button
              onClick={() => { resetState(); }}
              className="btn-secondary px-4 py-1.5 text-sm"
              style={{ borderRadius: '6px' }}
            >
              重新选择
            </button>
            <button
              onClick={handleConfirmImport}
              className="btn-primary px-4 py-1.5 text-sm flex items-center gap-2"
              style={{ borderRadius: '6px' }}
              disabled={!bookName.trim()}
            >
              <FileUp size={14} />
              确认导入
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
