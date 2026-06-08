import React, { useState, useEffect } from 'react';
import type { BookDeconstructionResult } from '../../types/book-deconstruction';
import type { ImitationConfig, ImitationOutline, ImitationState, GenerateProgress } from '../../types/imitation';
import { INITIAL_IMITATION_STATE, imitationReducer, STRENGTH_LABELS } from '../../types/imitation';
import { DeconstructionProgress } from './DeconstructionProgress';
import { DeconstructionResult } from './DeconstructionResult';
import { ImitationConfigPanel } from './ImitationConfigPanel';
import { ImitationOutlinePreview } from './ImitationOutlinePreview';
import { db, getDefaultLLMConfig, decodeApiKey } from '../../db';
import { bookDeconstructor } from '../../services/BookDeconstructor';
import { novelLLMService } from '../../llm/NovelLLMService';
import { imitationService } from '../../services/ImitationService';
import { deconstructionSeeder } from '../../services/DeconstructionSeeder';
import { ImportNovelModal } from '../ImportNovelModal';
import type { Book } from '../../types';

interface DeconstructionPanelProps {
  showToast?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
  onBookCreated?: (bookId: string) => void;
}

export const DeconstructionPanel: React.FC<DeconstructionPanelProps> = ({
  showToast,
  onBookCreated,
}) => {
  // 确保 LLM 服务已初始化
  const ensureLLMInit = async () => {
    if (novelLLMService.isInitialized) return;
    const defaultConfig = await getDefaultLLMConfig();
    if (!defaultConfig) {
      throw new Error('请先配置 LLM（在 AI 助手中设置）');
    }
    const apiKey = decodeApiKey(defaultConfig.apiKey);
    novelLLMService.init(new Map(), {
      apiKey,
      baseUrl: defaultConfig.apiUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, ''),
      model: defaultConfig.model,
    });
  };

  // 拆书列表
  const [deconstructions, setDeconstructions] = useState<BookDeconstructionResult[]>([]);
  const [selectedDecon, setSelectedDecon] = useState<BookDeconstructionResult | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBookshelfPicker, setShowBookshelfPicker] = useState(false);
  const [bookshelfBooks, setBookshelfBooks] = useState<Book[]>([]);

  // 仿写状态
  const [imitationState, dispatchImitation] = React.useReducer(imitationReducer, INITIAL_IMITATION_STATE);
  const [imitationProgress, setImitationProgress] = useState<GenerateProgress | null>(null);
  const [imitationDeconstruction, setImitationDeconstruction] = useState<BookDeconstructionResult | null>(null);

  // 加载拆书列表
  const loadDeconstructions = async () => {
    const list = await db.bookDeconstructions.orderBy('updatedAt').reverse().toArray();
    setDeconstructions(list);
  };

  useEffect(() => {
    loadDeconstructions();
  }, []);

  // 从书架选择书籍进行拆书
  const handleOpenBookshelfPicker = async () => {
    const books = await db.books.orderBy('updatedAt').reverse().toArray();
    setBookshelfBooks(books);
    setShowBookshelfPicker(true);
  };

  const handleSelectBookFromShelf = async (book: Book) => {
    setShowBookshelfPicker(false);
    const chapters = await db.chapters
      .where('bookId')
      .equals(book.id)
      .sortBy('order');
    const chapterData = chapters
      .filter(ch => ch.content?.trim())
      .map((ch, i) => ({ index: i, title: ch.title, content: ch.content || '' }));

    if (chapterData.length === 0) {
      showToast?.('该书没有章节内容，无法拆书', 'warning');
      return;
    }
    await handleStartDeconstruction(book.id, chapterData, book.name);
  };

  // 刷新选中的拆书结果
  const refreshSelected = async () => {
    if (!selectedDecon) return;
    const updated = await db.bookDeconstructions.get(selectedDecon.id);
    if (updated) setSelectedDecon(updated);
  };

  // 轮询更新进行中的拆书
  useEffect(() => {
    if (!selectedDecon || selectedDecon.status === 'completed' || selectedDecon.status === 'failed') return;
    const timer = setInterval(async () => {
      const updated = await db.bookDeconstructions.get(selectedDecon.id);
      if (updated) {
        setSelectedDecon(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(timer);
          loadDeconstructions();
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [selectedDecon?.id, selectedDecon?.status]);

  // 启动拆书
  const handleStartDeconstruction = async (bookId: string, chapters: Array<{ index: number; title: string; content: string }>, fileName?: string) => {
    const result = await bookDeconstructor.create(
      bookId,
      fileName || chapters[0]?.title || '未知',
      chapters.reduce((sum, ch) => sum + ch.content.length, 0),
      chapters.length,
    );
    setSelectedDecon(result);
    await loadDeconstructions();

    const llmCall = async (prompt: string): Promise<string> => {
      await ensureLLMInit();
      const res = await novelLLMService.generateRaw(prompt, undefined, { maxTokens: 16000 });
      return res.content;
    };

    try {
      const finalResult = await bookDeconstructor.start(result.id, chapters, llmCall);
      setSelectedDecon(finalResult);
      await loadDeconstructions();
      showToast?.('拆书分析完成！', 'success');
    } catch (err) {
      showToast?.(`拆书分析失败：${(err as Error).message}`, 'error');
      const updated = await bookDeconstructor.loadResult(result.id);
      setSelectedDecon(updated);
      await loadDeconstructions();
    }
  };

  // 取消拆书
  const handleCancelDeconstruction = async () => {
    if (!selectedDecon) return;
    await bookDeconstructor.cancel(selectedDecon.id);
  };

  // 重试拆书（从断点续跑）
  const handleRetryDeconstruction = async () => {
    if (!selectedDecon) return;
    // 需要从书籍重新加载章节数据
    const chapters = await db.chapters
      .where('bookId')
      .equals(selectedDecon.bookId)
      .sortBy('order');
    const chapterData = chapters
      .filter(ch => ch.content?.trim())
      .map((ch, i) => ({ index: i, title: ch.title, content: ch.content || '' }));

    if (chapterData.length === 0) {
      showToast?.('未找到章节内容，无法重试', 'error');
      return;
    }

    const llmCall = async (prompt: string): Promise<string> => {
      await ensureLLMInit();
      const res = await novelLLMService.generateRaw(prompt, undefined, { maxTokens: 16000 });
      return res.content;
    };

    try {
      const finalResult = await bookDeconstructor.start(selectedDecon.id, chapterData, llmCall);
      setSelectedDecon(finalResult);
      await loadDeconstructions();
      showToast?.('拆书分析完成！', 'success');
    } catch (err) {
      showToast?.(`拆书分析失败：${(err as Error).message}`, 'error');
      const updated = await bookDeconstructor.loadResult(selectedDecon.id);
      setSelectedDecon(updated);
      await loadDeconstructions();
    }
  };

  // 启动仿写
  const handleStartImitation = () => {
    if (!selectedDecon) return;
    setImitationDeconstruction(selectedDecon);
    dispatchImitation({ type: 'START_CONFIG' });
  };

  // 执行仿写生成
  const handleImitationGenerate = async (config: ImitationConfig) => {
    if (!imitationDeconstruction) return;
    dispatchImitation({ type: 'START_GENERATE', config });
    setImitationProgress(null);

    try {
      const llmCall = async (prompt: string): Promise<string> => {
        await ensureLLMInit();
        const res = await novelLLMService.generateRaw(prompt, undefined, { maxTokens: 16000 });
        return res.content;
      };
      const outline = await imitationService.startGenerate(
        imitationDeconstruction.id,
        config,
        llmCall,
        (progress) => setImitationProgress(progress),
      );
      dispatchImitation({ type: 'GENERATE_SUCCESS', outline });
    } catch (err) {
      dispatchImitation({ type: 'GENERATE_FAIL', error: (err as Error).message });
      showToast?.(`仿写生成失败：${(err as Error).message}`, 'error');
    }
  };

  // 导入到 Pipeline
  const handleSeedToPipeline = async () => {
    if (!selectedDecon) return;
    try {
      await deconstructionSeeder.seed(selectedDecon);
      showToast?.('已导入 Pipeline', 'success');
      onBookCreated?.(selectedDecon.bookId);
    } catch (err) {
      showToast?.(`导入失败：${(err as Error).message}`, 'error');
    }
  };

  // 仿写 → 创建新书
  const handleImportToBook = async () => {
    if (!imitationState.outline) return;
    dispatchImitation({ type: 'START_IMPORT' });
    try {
      const bookId = await imitationService.importToBook(imitationState.outline.id);
      showToast?.('已创建新书', 'success');
      dispatchImitation({ type: 'IMPORT_SUCCESS' });
      onBookCreated?.(bookId);
    } catch (err) {
      showToast?.(`创建失败：${(err as Error).message}`, 'error');
      dispatchImitation({ type: 'GENERATE_SUCCESS', outline: imitationState.outline! });
    }
  };

  // 导出 JSON
  const handleExportJson = (data: object, filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 删除拆书结果
  const handleDeleteDeconstruction = async (id: string) => {
    if (!window.confirm('确定要删除这条拆书记录吗？删除后不可恢复。')) return;
    await db.bookDeconstructions.delete(id);
    // 清理关联的 chapterStateCommits（拆书时以 deconstructionId 作为 bookId 写入）
    await db.chapterStateCommits.where('bookId').equals(id).delete();
    if (selectedDecon?.id === id) setSelectedDecon(null);
    await loadDeconstructions();
  };

  // ============ 仿写面板渲染 ============
  if (imitationState.phase !== 'idle' && imitationDeconstruction) {
    if (imitationState.phase === 'configuring') {
      return (
        <div className="h-full flex flex-col">
          <ImitationConfigPanel
            deconstruction={imitationDeconstruction}
            initialConfig={imitationState.config || undefined}
            onGenerate={handleImitationGenerate}
            onCancel={() => dispatchImitation({ type: 'RESET' })}
          />
        </div>
      );
    }

    if (imitationState.phase === 'generating') {
      const emptyOutline: ImitationOutline = {
        id: '', deconstructionRefs: [], config: imitationState.config!,
        title: '', genre: '', coreConflict: '', themes: [],
        chapters: [], suspenseLines: [], characterArcs: [], pacingCurve: [],
        status: 'generating', createdAt: Date.now(), updatedAt: Date.now(),
      };
      return (
        <div className="h-full flex flex-col">
          <ImitationOutlinePreview
            outline={imitationState.outline || emptyOutline}
            progress={imitationProgress || undefined}
            isGenerating={true}
            onImportToBook={() => {}}
            onRegenerate={() => {}}
            onExportJson={() => {}}
            onExportMarkdown={() => {}}
            onClose={() => dispatchImitation({ type: 'RESET' })}
          />
        </div>
      );
    }

    if (imitationState.phase === 'previewing' && imitationState.outline) {
      return (
        <div className="h-full flex flex-col">
          <ImitationOutlinePreview
            outline={imitationState.outline}
            onImportToBook={handleImportToBook}
            onRegenerate={() => dispatchImitation({ type: 'REGENERATE' })}
            onExportJson={() => handleExportJson(imitationState.outline!, `imitation-${imitationState.outline!.title}.json`)}
            onExportMarkdown={async () => {
              const md = imitationService.exportAsMarkdown(imitationState.outline!);
              const blob = new Blob([md], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `imitation-${imitationState.outline!.title}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            onClose={() => dispatchImitation({ type: 'RESET' })}
          />
        </div>
      );
    }

    if (imitationState.phase === 'importing') {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-vscode-text text-sm opacity-60">正在创建新书...</p>
        </div>
      );
    }
  }

  // ============ 拆书结果详情 ============
  if (selectedDecon) {
    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-vscode-border">
          <button
            onClick={() => { setSelectedDecon(null); loadDeconstructions(); }}
            className="text-vscode-text opacity-60 hover:opacity-100 text-xs"
          >
            ← 返回列表
          </button>
          <span className="text-vscode-text text-xs font-medium truncate">
            {selectedDecon.skeleton?.meta.title || selectedDecon.sourceFileName}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {selectedDecon.status === 'completed' ? (
            <DeconstructionResult
              result={selectedDecon}
              onExportJson={() => handleExportJson(selectedDecon, `deconstruction-${selectedDecon.sourceFileName}.json`)}
              onSeedToPipeline={handleSeedToPipeline}
              onImitate={handleStartImitation}
            />
          ) : (
            <div className="p-4">
              <DeconstructionProgress result={selectedDecon} onCancel={handleCancelDeconstruction} onRetry={handleRetryDeconstruction} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ 拆书列表 ============
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-vscode-border">
        <h3 className="text-vscode-text text-sm font-medium">拆书 / 仿写</h3>
        <button
          onClick={() => setShowImportModal(true)}
          className="text-xs px-2 py-1 bg-vscode-active text-white hover:opacity-90 rounded"
        >
          导入书籍
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {deconstructions.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-vscode-text opacity-50 text-sm">暂无拆书记录</p>
            <p className="text-vscode-text opacity-40 text-xs mt-1">点击"导入书籍"开始拆书分析</p>
          </div>
        ) : (
          <div className="divide-y divide-vscode-border">
            {deconstructions.map(decon => (
              <div
                key={decon.id}
                onClick={() => setSelectedDecon(decon)}
                className="px-3 py-2.5 cursor-pointer hover:bg-vscode-active/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-vscode-text text-xs font-medium truncate">
                    {decon.skeleton?.meta.title || decon.sourceFileName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      decon.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      decon.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {decon.status === 'completed' ? '已完成' :
                       decon.status === 'failed' ? '失败' : '进行中'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteDeconstruction(decon.id); }}
                      className="text-vscode-text opacity-30 hover:opacity-70 text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="text-vscode-text text-[10px] opacity-40 mt-0.5">
                  {decon.totalChapters} 章 · {new Date(decon.updatedAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <ImportNovelModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {}}
          onStartDeconstruction={async (bookId, chapters, fileName) => {
            setShowImportModal(false);
            await handleStartDeconstruction(bookId, chapters, fileName);
          }}
          showToast={showToast || (() => {})}
        />
      )}
    </div>
  );
};
