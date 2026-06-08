import type { BookSkeleton, ChapterSkeleton, SuspenseLine } from '../types/book-deconstruction';
import { debugLogger } from './DebugLogger';
import { parseLlmJson } from '../utils/helpers';

interface SkeletonExtractResult {
  meta: BookSkeleton['meta'];
  coreConflict: string;
  themes: string[];
  chapterSkeletons: ChapterSkeleton[];
  suspenseLines: SuspenseLine[];
  structureType: string;
  structureDescription: string;
}

interface SkeletonMergeResult {
  newChapterSkeletons: ChapterSkeleton[];
  newSuspenseLines: SuspenseLine[];
  resolvedSuspenseLines: Array<{ id: string; resolvedInChapter: number }>;
  metaUpdates: {
    subGenres?: string[];
    themes?: string[];
  };
}

interface SkeletonFinalizeResult {
  suspenseLineUpdates: Array<{ id: string; resolvedInChapter: number }>;
  structureType: string;
  structureDescription: string;
}

export class SkeletonExtractor {
  private readonly BATCH_SIZE = 5;

  async extract(
    chapters: Array<{ index: number; title: string; content: string }>,
    llmCall: (prompt: string) => Promise<string>,
    onProgress: (batch: number, totalBatches: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<BookSkeleton> {
    const totalBatches = Math.ceil(chapters.length / this.BATCH_SIZE);
    let skeleton: Partial<BookSkeleton> = {
      meta: {
        title: '',
        genre: '',
        subGenres: [],
        coreTone: '',
        estimatedWordCount: 0,
      },
      coreConflict: '',
      themes: [],
      chapterSkeletons: [],
      suspenseLines: [],
      structureType: '',
      structureDescription: '',
    };

    for (let batch = 0; batch < totalBatches; batch++) {
      if (abortSignal?.aborted) throw new Error('cancelled');

      const start = batch * this.BATCH_SIZE;
      const end = Math.min(start + this.BATCH_SIZE, chapters.length);
      const batchChapters = chapters.slice(start, end);

      const chapterTexts = batchChapters
        .map(ch => `--- 第${ch.index + 1}章：${ch.title} ---\n${ch.content}`)
        .join('\n\n');

      if (batch === 0) {
        const result = await this.extractFirstBatch(
          start + 1,
          end,
          chapterTexts,
          llmCall,
        );
        skeleton.meta = result.meta;
        skeleton.coreConflict = result.coreConflict;
        skeleton.themes = result.themes;
        skeleton.chapterSkeletons = result.chapterSkeletons;
        skeleton.suspenseLines = result.suspenseLines;
        skeleton.structureType = result.structureType;
        skeleton.structureDescription = result.structureDescription;
      } else {
        const result = await this.extractSubsequentBatch(
          start + 1,
          end,
          chapterTexts,
          JSON.stringify({
            meta: skeleton.meta,
            coreConflict: skeleton.coreConflict,
            themes: skeleton.themes,
            chapterCount: skeleton.chapterSkeletons!.length,
            suspenseLines: skeleton.suspenseLines!.map(s => ({
              id: s.id,
              description: s.description,
              type: s.type,
              status: s.resolvedInChapter != null ? 'resolved' : 'open',
            })),
          }),
          llmCall,
        );

        skeleton.chapterSkeletons!.push(...result.newChapterSkeletons);
        skeleton.suspenseLines!.push(...result.newSuspenseLines);

        for (const resolved of result.resolvedSuspenseLines) {
          const line = skeleton.suspenseLines!.find(s => s.id === resolved.id);
          if (line) line.resolvedInChapter = resolved.resolvedInChapter;
        }

        if (result.metaUpdates.subGenres) {
          const existing = new Set(skeleton.meta!.subGenres);
          for (const sg of result.metaUpdates.subGenres) existing.add(sg);
          skeleton.meta!.subGenres = [...existing];
        }
        if (result.metaUpdates.themes) {
          const existing = new Set(skeleton.themes!);
          for (const t of result.metaUpdates.themes) existing.add(t);
          skeleton.themes = [...existing];
        }
      }

      onProgress(batch + 1, totalBatches);
    }

    // Phase 1 最终整合
    const finalizeResult = await this.finalize(
      skeleton.chapterSkeletons!,
      skeleton.suspenseLines!,
      skeleton.meta!,
      llmCall,
    );

    for (const update of finalizeResult.suspenseLineUpdates) {
      const line = skeleton.suspenseLines!.find(s => s.id === update.id);
      if (line) line.resolvedInChapter = update.resolvedInChapter;
    }
    skeleton.structureType = finalizeResult.structureType;
    skeleton.structureDescription = finalizeResult.structureDescription;

    skeleton.meta!.estimatedWordCount = chapters.reduce(
      (sum, ch) => sum + ch.content.length,
      0,
    );

    return skeleton as BookSkeleton;
  }

  private buildFirstBatchPrompt(batchStart: number, batchEnd: number, chapterTexts: string): string {
    const sections: string[] = [];
    sections.push('你是一个专业的小说结构分析师，擅长从文本中逆向拆解小说的结构骨架。');
    sections.push('\n请从以下小说文本中提取全书结构骨架。');
    sections.push(`\n## 文本内容（第 ${batchStart}-${batchEnd} 章）`);
    sections.push(chapterTexts);
    sections.push('\n## 提取规则');
    sections.push('### 元信息');
    sections.push('- 识别题材类型、核心基调、目标读者');
    sections.push('- 提炼核心冲突（主角想要什么？什么阻止了他？）');
    sections.push('- 提取主题词（2-5个）');
    sections.push('### 章节骨架');
    sections.push('- 每章一句话摘要');
    sections.push('- 章节角色：setup/inciting_incident/rising_action/midpoint/crisis/climax/resolution/falling_action/foreshadowing/revelation/breathing/transition');
    sections.push('- 章节类型：plot_advancing/character_deepening/atmosphere/transition/climax');
    sections.push('- 主要出场角色、核心事件');
    sections.push('### 悬念线');
    sections.push('- 识别已出现的悬念线，标注主线/支线');
    sections.push('- 悬念类型：mystery/crisis/promise/revelation');
    sections.push('\n## ⚡ 输出要求');
    sections.push('严格 JSON 格式，不要输出其他内容：');
    sections.push('```json');
    sections.push(JSON.stringify({
      meta: { title: '书名', author: '作者', genre: '主题材', subGenres: ['子题材'], coreTone: '核心基调', targetAudience: '目标读者', estimatedWordCount: 0 },
      coreConflict: '核心冲突描述',
      themes: ['主题1', '主题2'],
      chapterSkeletons: [{ index: 0, title: '章节标题', oneLineSummary: '一句话摘要', estimatedWordCount: 0, role: 'setup', majorCharacters: ['角色1'], keyEvent: '核心事件', chapterType: 'plot_advancing' }],
      suspenseLines: [{ id: 's1', description: '悬念描述', type: 'main', hookType: 'mystery', raisedInChapter: 1, resolvedInChapter: null, relatedEntities: ['相关实体'] }],
      structureType: '三幕式',
      structureDescription: '结构描述',
    }, null, 2));
    sections.push('```');
    return sections.join('\n');
  }

  private buildMergePrompt(batchStart: number, batchEnd: number, chapterTexts: string, existingSkeleton: string): string {
    const sections: string[] = [];
    sections.push('你是一个专业的小说结构分析师。');
    sections.push('\n## 已有骨架');
    sections.push(existingSkeleton);
    sections.push(`\n## 新增文本（第 ${batchStart}-${batchEnd} 章）`);
    sections.push(chapterTexts);
    sections.push('\n## 任务');
    sections.push('基于已有骨架和新增文本，提取新增章节的骨架和悬念线，保持与已有骨架的一致性。');
    sections.push(`新增章节的索引从 ${batchStart} 开始。`);
    sections.push('如果新增文本中揭示了已有悬念线的结局，更新 resolvedInChapter。');
    sections.push('不要重复输出已有骨架中的章节，只输出新增部分。');
    sections.push('\n## ⚡ 输出要求');
    sections.push('严格 JSON 格式：');
    sections.push('```json');
    sections.push(JSON.stringify({
      newChapterSkeletons: [{ index: 0, title: '章节标题', oneLineSummary: '一句话摘要', estimatedWordCount: 0, role: 'setup', majorCharacters: ['角色1'], keyEvent: '核心事件', chapterType: 'plot_advancing' }],
      newSuspenseLines: [{ id: 's_new_1', description: '悬念描述', type: 'sub', hookType: 'mystery', raisedInChapter: 1, resolvedInChapter: null, relatedEntities: [] }],
      resolvedSuspenseLines: [{ id: 's1', resolvedInChapter: 5 }],
      metaUpdates: { subGenres: ['新增子题材'], themes: ['新增主题'] },
    }, null, 2));
    sections.push('```');
    return sections.join('\n');
  }

  private buildFinalizePrompt(chapterSkeletons: ChapterSkeleton[], suspenseLines: SuspenseLine[], meta: BookSkeleton['meta']): string {
    const sections: string[] = [];
    sections.push('你是一个专业的小说结构分析师，擅长整合分散信息形成完整的全书骨架。');
    sections.push('\n## 已有章节骨架');
    sections.push(JSON.stringify(chapterSkeletons, null, 2));
    sections.push('\n## 已有悬念线');
    sections.push(JSON.stringify(suspenseLines, null, 2));
    sections.push('\n## 元信息');
    sections.push(JSON.stringify(meta, null, 2));
    sections.push('\n## 任务');
    sections.push('基于以上已提取的章节骨架和悬念线，进行最终整合：');
    sections.push('1. 补全悬念线的起止章节');
    sections.push('2. 识别全书的整体结构类型（三幕式、英雄之旅、多线叙事、悬疑结构等）');
    sections.push('3. 描述整体结构特征');
    sections.push('\n## ⚡ 输出要求');
    sections.push('严格 JSON 格式：');
    sections.push('```json');
    sections.push(JSON.stringify({
      suspenseLineUpdates: [{ id: 's1', resolvedInChapter: 10 }],
      structureType: '三幕式',
      structureDescription: '全书采用经典三幕式结构...',
    }, null, 2));
    sections.push('```');
    return sections.join('\n');
  }

  private async extractFirstBatch(
    batchStart: number,
    batchEnd: number,
    chapterTexts: string,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<SkeletonExtractResult> {
    const prompt = this.buildFirstBatchPrompt(batchStart, batchEnd, chapterTexts);

    debugLogger.log({
      source: 'service',
      category: 'deconstruction',
      direction: 'SkeletonExtractor.extractFirstBatch → LLM',
      userMessage: prompt.substring(0, 500),
      metadata: { batchStart, batchEnd },
    });

    const raw = await llmCall(prompt);
    return this.parseResult<SkeletonExtractResult>(raw);
  }

  private async extractSubsequentBatch(
    batchStart: number,
    batchEnd: number,
    chapterTexts: string,
    existingSkeleton: string,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<SkeletonMergeResult> {
    const prompt = this.buildMergePrompt(batchStart, batchEnd, chapterTexts, existingSkeleton);
    const raw = await llmCall(prompt);
    return this.parseResult<SkeletonMergeResult>(raw);
  }

  private async finalize(
    chapterSkeletons: ChapterSkeleton[],
    suspenseLines: SuspenseLine[],
    meta: BookSkeleton['meta'],
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<SkeletonFinalizeResult> {
    const prompt = this.buildFinalizePrompt(chapterSkeletons, suspenseLines, meta);
    const raw = await llmCall(prompt);
    return this.parseResult<SkeletonFinalizeResult>(raw);
  }

  private parseResult<T>(raw: string): T {
    return parseLlmJson<T>(raw);
  }
}
