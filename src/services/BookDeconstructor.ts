import { v4 as uuidv4 } from 'uuid';
import type { BookDeconstructionResult, DeconstructionPhase } from '../types/book-deconstruction';
import type { ChapterFacts } from '../types/fact-extraction';
import { db } from '../db';
import { SkeletonExtractor } from './SkeletonExtractor';
import { FactExtractor } from './FactExtractor';
import { CrossChapterAnalyzer } from './CrossChapterAnalyzer';
import { debugLogger } from './DebugLogger';

export type DeconstructionProgressCallback = (
  phase: DeconstructionPhase,
  detail: string,
  progress: number,
) => void;

export class BookDeconstructor {
  private skeletonExtractor = new SkeletonExtractor();
  private factExtractor = new FactExtractor();
  private crossChapterAnalyzer = new CrossChapterAnalyzer();
  private abortControllers = new Map<string, AbortController>();

  async create(
    bookId: string,
    sourceFileName: string,
    sourceFileSize: number,
    totalChapters: number,
  ): Promise<BookDeconstructionResult> {
    const result: BookDeconstructionResult = {
      id: uuidv4(),
      bookId,
      sourceFileName,
      sourceFileSize,
      totalChapters,
      skeleton: null,
      chapterFacts: [],
      crossAnalysis: null,
      status: 'skeleton',
      currentPhase: 1,
      currentChapterIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.bookDeconstructions.add(result);
    return result;
  }

  async start(
    deconstructionId: string,
    chapters: Array<{ index: number; title: string; content: string }>,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: DeconstructionProgressCallback,
  ): Promise<BookDeconstructionResult> {
    const abortController = new AbortController();
    this.abortControllers.set(deconstructionId, abortController);

    try {
      let result = await this.loadResult(deconstructionId);

      // Phase 1: 全书骨架提取
      if (result.currentPhase === 1 || result.status === 'skeleton') {
        result = await this.runPhase1(result, chapters, llmCall, onProgress);
      }

      if (abortController.signal.aborted) throw new Error('cancelled');

      // Phase 2: 逐章细拆
      if (result.currentPhase === 2 || result.status === 'extracting') {
        result = await this.runPhase2(result, chapters, llmCall, onProgress);
      }

      if (abortController.signal.aborted) throw new Error('cancelled');

      // Phase 3: 跨章关联分析
      if (result.currentPhase === 3 || result.status === 'analyzing') {
        result = await this.runPhase3(result, llmCall, onProgress);
      }

      // 完成
      result.status = 'completed';
      result.updatedAt = Date.now();
      await db.bookDeconstructions.update(deconstructionId, {
        status: result.status,
        updatedAt: result.updatedAt,
      });

      onProgress?.(3, '拆书分析完成', 1);
      return result;
    } catch (err) {
      if ((err as Error).message === 'cancelled') {
        await db.bookDeconstructions.update(deconstructionId, {
          status: 'failed',
          error: '用户取消',
          updatedAt: Date.now(),
        });
      } else {
        const errorMsg = (err as Error).message || '未知错误';
        await db.bookDeconstructions.update(deconstructionId, {
          status: 'failed',
          error: errorMsg,
          updatedAt: Date.now(),
        });
      }
      throw err;
    } finally {
      this.abortControllers.delete(deconstructionId);
    }
  }

  async cancel(deconstructionId: string): Promise<void> {
    const controller = this.abortControllers.get(deconstructionId);
    if (controller) {
      controller.abort();
    }
  }

  async loadResult(deconstructionId: string): Promise<BookDeconstructionResult> {
    const result = await db.bookDeconstructions.get(deconstructionId);
    if (!result) throw new Error(`拆书结果不存在: ${deconstructionId}`);
    return result;
  }

  async listByBookId(bookId: string): Promise<BookDeconstructionResult[]> {
    return db.bookDeconstructions.where('bookId').equals(bookId).toArray();
  }

  async delete(deconstructionId: string): Promise<void> {
    await db.bookDeconstructions.delete(deconstructionId);
  }

  async updateResult(deconstructionId: string, updates: Partial<BookDeconstructionResult>): Promise<void> {
    await db.bookDeconstructions.update(deconstructionId, {
      ...updates,
      updatedAt: Date.now(),
    });
  }

  private async runPhase1(
    result: BookDeconstructionResult,
    chapters: Array<{ index: number; title: string; content: string }>,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: DeconstructionProgressCallback,
  ): Promise<BookDeconstructionResult> {
    result.status = 'skeleton';
    result.currentPhase = 1;
    await this.saveProgress(result);

    const abortSignal = this.abortControllers.get(result.id)?.signal;

    const skeleton = await this.skeletonExtractor.extract(
      chapters,
      llmCall,
      (batch, totalBatches) => {
        onProgress?.(1, `骨架提取：批次 ${batch}/${totalBatches}`, batch / totalBatches);
      },
      abortSignal,
    );

    result.skeleton = skeleton;
    result.currentPhase = 2;
    result.status = 'extracting';
    await this.saveProgress(result);

    onProgress?.(1, '骨架提取完成', 1);
    return result;
  }

  private async runPhase2(
    result: BookDeconstructionResult,
    chapters: Array<{ index: number; title: string; content: string }>,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: DeconstructionProgressCallback,
  ): Promise<BookDeconstructionResult> {
    result.status = 'extracting';
    result.currentPhase = 2;

    const startIndex = result.currentChapterIndex;

    for (let i = startIndex; i < chapters.length; i++) {
      const chapter = chapters[i];

      // 检查是否取消
      const controller = this.abortControllers.get(result.id);
      if (controller?.signal.aborted) throw new Error('cancelled');

      try {
        // 使用 deconstructionId 作为 bookId 避免与已有 Pipeline 状态提交冲突
        const facts = await this.factExtractor.extractFromChapter(
          result.id,
          chapter.index,
          chapter.title,
          chapter.content,
          llmCall,
          undefined,
          this.abortControllers.get(result.id)?.signal,
        );

        // 提交状态
        await this.factExtractor.commitState(
          result.id,
          chapter.index,
          facts,
        );

        result.chapterFacts.push(facts);
      } catch (err) {
        debugLogger.log({
          source: 'service',
          category: 'deconstruction',
          direction: `BookDeconstructor.runPhase2 ch:${chapter.index} ERROR`,
          metadata: { chapterIndex: chapter.index, error: (err as Error).message },
        });

        // 单章失败不阻断，用空 facts 填充
        result.chapterFacts.push({
          chapterIndex: chapter.index,
          entities: [],
          stateChanges: [],
          events: [],
          timeline: [],
          hooks: [],
          summary: `（提取失败：${(err as Error).message}）`,
          extractedAt: Date.now(),
          isFailed: true,
        });
      }

      result.currentChapterIndex = i + 1;
      await this.saveProgress(result);

      onProgress?.(2, `逐章细拆：第${chapter.index + 1}章（${i + 1}/${chapters.length}）`, (i + 1) / chapters.length);
    }

    result.currentPhase = 3;
    result.status = 'analyzing';
    await this.saveProgress(result);

    onProgress?.(2, '逐章细拆完成', 1);
    return result;
  }

  private async runPhase3(
    result: BookDeconstructionResult,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: DeconstructionProgressCallback,
  ): Promise<BookDeconstructionResult> {
    if (!result.skeleton) throw new Error('缺少骨架数据，无法进行跨章分析');

    result.status = 'analyzing';
    result.currentPhase = 3;
    await this.saveProgress(result);

    onProgress?.(3, '跨章关联分析中...', 0.5);

    const abortSignal = this.abortControllers.get(result.id)?.signal;

    const crossAnalysis = await this.crossChapterAnalyzer.analyze(
      result.skeleton,
      result.chapterFacts,
      llmCall,
      abortSignal,
    );

    result.crossAnalysis = crossAnalysis;
    await this.saveProgress(result);

    onProgress?.(3, '跨章关联分析完成', 1);
    return result;
  }

  private async saveProgress(result: BookDeconstructionResult): Promise<void> {
    result.updatedAt = Date.now();
    await db.bookDeconstructions.put(result);
  }
}

export const bookDeconstructor = new BookDeconstructor();
