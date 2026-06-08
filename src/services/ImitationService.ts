import type { BookDeconstructionResult } from '../types/book-deconstruction';
import type { ImitationConfig, ImitationOutline, GenerateProgress } from '../types/imitation';
import { db } from '../db';
import { imitationOutlineGenerator } from './ImitationOutlineGenerator';
import { bookStructureWriter } from './BookStructureWriter';
import { debugLogger } from './DebugLogger';
import { v4 as uuidv4 } from 'uuid';

export type ImitationProgressCallback = (progress: GenerateProgress) => void;

export class ImitationService {
  private abortControllers = new Map<string, AbortController>();

  /**
   * 启动仿写生成
   */
  async startGenerate(
    deconstructionId: string,
    config: ImitationConfig,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: ImitationProgressCallback,
  ): Promise<ImitationOutline> {
    // 读取拆书结果
    const deconstruction = await db.bookDeconstructions.get(deconstructionId);
    if (!deconstruction) throw new Error('拆书结果不存在');
    if (!deconstruction.skeleton) throw new Error('拆书结果缺少骨架数据');

    // 创建初始记录
    const outlineId = uuidv4();
    const outline: ImitationOutline = {
      id: outlineId,
      deconstructionRefs: [{
        deconstructionId,
        sourceBookId: deconstruction.bookId,
        sourceBookTitle: deconstruction.skeleton.meta.title || deconstruction.sourceFileName,
      }],
      config,
      title: config.title || '',
      genre: config.genre,
      coreConflict: config.coreConflict,
      themes: [],
      chapters: [],
      suspenseLines: [],
      characterArcs: [],
      pacingCurve: [],
      status: 'generating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.imitationOutlines.add(outline);

    try {
      // 调用生成器
      const result = await imitationOutlineGenerator.generate(
        deconstruction,
        config,
        llmCall,
        onProgress,
      );

      // 更新记录
      result.id = outlineId; // 保持 ID 一致
      const completed = {
        ...result,
        id: outlineId,
        status: 'completed' as const,
        updatedAt: Date.now(),
      };
      await db.imitationOutlines.put(completed);

      return completed;
    } catch (err) {
      // 保存失败状态
      const failed = await db.imitationOutlines.get(outlineId);
      if (failed) {
        await db.imitationOutlines.put({
          ...failed,
          status: 'failed' as const,
          error: String(err),
          updatedAt: Date.now(),
        });
      }
      throw err;
    }
  }

  /**
   * 从 Step 1 中间结果恢复（断点续传）
   */
  async resumeFromPartial(
    outlineId: string,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: ImitationProgressCallback,
  ): Promise<ImitationOutline> {
    const outline = await db.imitationOutlines.get(outlineId);
    if (!outline) throw new Error('仿写大纲不存在');
    if (outline.status !== 'failed') throw new Error('只能从失败状态恢复');

    const deconstructionId = outline.deconstructionRefs[0]?.deconstructionId;
    if (!deconstructionId) throw new Error('缺少拆书结果引用');

    const deconstruction = await db.bookDeconstructions.get(deconstructionId);
    if (!deconstruction) throw new Error('拆书结果不存在');

    // 如果有 Step 1 中间结果，直接从 Step 2 开始
    if (outline.partialResult) {
      onProgress?.({ step: 'pacing', progress: 0.6, detail: '从中间结果恢复，正在生成节奏曲线...' });

      const step2Result = await imitationOutlineGenerator.generateStep2(
        deconstruction.skeleton!,
        deconstruction.crossAnalysis,
        {
          ...outline.partialResult,
          title: outline.title,
          genre: outline.genre,
          coreConflict: outline.coreConflict,
          themes: outline.themes,
        },
        outline.config,
        llmCall,
      );

      const updated: ImitationOutline = {
        ...outline,
        pacingCurve: step2Result.pacingCurve,
        chapters: outline.partialResult.chapters,
        suspenseLines: outline.partialResult.suspenseLines,
        characterArcs: outline.partialResult.characterArcs,
        partialResult: undefined,
        status: 'completed',
        error: undefined,
        updatedAt: Date.now(),
      };

      await db.imitationOutlines.put(updated);
      return updated;
    }

    // 否则重新生成
    return this.startGenerate(deconstructionId, outline.config, llmCall, onProgress);
  }

  /**
   * 将仿写大纲导入为书籍
   */
  async importToBook(outlineId: string): Promise<string> {
    const outline = await db.imitationOutlines.get(outlineId);
    if (!outline) throw new Error('仿写大纲不存在');
    if (outline.status !== 'completed') throw new Error('只能导入已完成的仿写大纲');

    const chapters = outline.chapters.map((ch, i) => ({
      title: ch.title,
      detailedOutline: ch.oneLineSummary,
      order: i,
      estimatedWordCount: ch.estimatedWordCount || 0,
    }));

    const bookId = await bookStructureWriter.createBookWithChapters(
      outline.title,
      chapters,
      {
        volumeName: '正文',
        volumeOutline: this.buildVolumeOutline(outline),
      },
    );

    return bookId;
  }

  /**
   * 获取仿写大纲
   */
  async getOutline(outlineId: string): Promise<ImitationOutline | undefined> {
    return db.imitationOutlines.get(outlineId);
  }

  /**
   * 获取某拆书结果的所有仿写大纲
   */
  async getByDeconstruction(deconstructionId: string): Promise<ImitationOutline[]> {
    return db.imitationOutlines
      .filter(o => o.deconstructionRefs.some(r => r.deconstructionId === deconstructionId))
      .toArray();
  }

  /**
   * 删除仿写大纲
   */
  async deleteOutline(outlineId: string): Promise<void> {
    await db.imitationOutlines.delete(outlineId);
  }

  /**
   * 导出为 Markdown 格式
   */
  exportAsMarkdown(outline: ImitationOutline): string {
    const parts: string[] = [];

    parts.push(`# ${outline.title}`);
    parts.push(`**题材**：${outline.genre}`);
    parts.push(`**核心冲突**：${outline.coreConflict}`);
    parts.push(`**主题**：${outline.themes.join('、')}\n`);

    // 章节
    parts.push(`## 章节大纲\n`);
    for (const ch of outline.chapters) {
      parts.push(`### 第${ch.index + 1}章：${ch.title}`);
      parts.push(ch.oneLineSummary);
      parts.push(`角色：${ch.role} | 类型：${ch.chapterType}`);
      parts.push(`关键人物：${ch.majorCharacters.join('、')}`);
      parts.push(`关键事件：${ch.keyEvent}\n`);
    }

    // 悬念线
    if (outline.suspenseLines.length > 0) {
      parts.push(`## 悬念线\n`);
      for (const sl of outline.suspenseLines) {
        parts.push(`- [${sl.type === 'main' ? '主线' : '副线'}] ${sl.description}（第${sl.raisedInChapter + 1}章提出${sl.resolvedInChapter != null ? `，第${sl.resolvedInChapter + 1}章解决` : '，未解决'}）`);
      }
    }

    // 角色弧线
    if (outline.characterArcs.length > 0) {
      parts.push(`\n## 角色弧线\n`);
      for (const arc of outline.characterArcs) {
        parts.push(`### ${arc.characterName}（${arc.arcType}）`);
        parts.push(`${arc.startState} → ${arc.endState}`);
        parts.push(arc.stateEvolution);
      }
    }

    // 节奏曲线
    if (outline.pacingCurve.length > 0) {
      parts.push(`\n## 节奏曲线\n`);
      for (const p of outline.pacingCurve) {
        parts.push(`第${p.chapterIndex + 1}章: 紧张度 ${p.tension}/10, 节奏 ${p.pace} — ${p.note}`);
      }
    }

    return parts.join('\n');
  }

  private buildVolumeOutline(outline: ImitationOutline): string {
    const parts: string[] = [];
    parts.push(`# ${outline.title}\n`);
    parts.push(`**核心冲突**：${outline.coreConflict}`);
    parts.push(`**主题**：${outline.themes.join('、')}\n`);

    for (const ch of outline.chapters) {
      parts.push(`## 第${ch.index + 1}章：${ch.title}`);
      parts.push(ch.oneLineSummary);
      parts.push(`关键事件：${ch.keyEvent}\n`);
    }

    return parts.join('\n');
  }
}

export const imitationService = new ImitationService();
