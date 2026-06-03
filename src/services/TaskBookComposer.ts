import type { WritingTaskBook, TaskBookSources } from '../types/task-book';
import type { EntitySnapshot, HookEntry, TimelineEntry, ChapterStateCommit, AntiPattern } from '../types';
import type { Book, Material } from '../types';
import { db } from '../db';
import { debugLogger } from './DebugLogger';

export class TaskBookComposer {
  async compose(
    bookId: string,
    chapterIndex: number,
    sources: TaskBookSources
  ): Promise<WritingTaskBook> {
    const book = await db.books.get(bookId);
    const materials = await db.materials.where({ bookId }).toArray();
    const prevState = await this.loadStateCommit(bookId, chapterIndex - 1);
    const antiPatterns = await this.loadAntiPatterns(bookId);

    const taskBook = {
      meta: {
        bookId,
        chapterIndex,
        chapterTitle: sources.chapterTitle,
        generatedAt: Date.now(),
      },
      locked: this.buildLockedLayer(book, materials),
      chapterMission: this.buildChapterMission(sources),
      stateContext: this.buildStateContext(prevState),
      warnings: this.buildWarnings(antiPatterns, sources.reviewContract),
      style: this.buildStyleLayer(sources.step3Config),
    };

    // Debug: 记录任务书组装
    debugLogger.log({
      source: 'service',
      category: 'taskbook-compose',
      direction: `TaskBookComposer.compose → book:${bookId} ch:${chapterIndex}`,
      metadata: {
        bookId,
        chapterIndex,
        chapterTitle: sources.chapterTitle,
        hasPrevState: !!prevState,
        antiPatternCount: antiPatterns.length,
        materialCount: materials.length,
        characterCount: materials.filter(m => m.type === 'character').length,
      },
    });

    return taskBook;
  }

  render(taskBook: WritingTaskBook): string {
    const sections: string[] = [];

    const locked = this.renderLockedLayer(taskBook.locked);
    if (locked) sections.push(locked);

    const mission = this.renderChapterMission(taskBook.chapterMission);
    if (mission) sections.push(mission);

    if (taskBook.stateContext) {
      const state = this.renderStateContext(taskBook.stateContext);
      if (state) sections.push(state);
    }

    if (taskBook.warnings) {
      const warnings = this.renderWarnings(taskBook.warnings);
      if (warnings) sections.push(warnings);
    }

    const style = this.renderStyleLayer(taskBook.style);
    if (style) sections.push(style);

    const rendered = sections.join('\n\n');

    // Debug: 记录任务书渲染结果
    debugLogger.log({
      source: 'service',
      category: 'taskbook-compose',
      direction: `TaskBookComposer.render → ${taskBook.meta.chapterTitle}`,
      systemPrompt: rendered,
      metadata: {
        bookId: taskBook.meta.bookId,
        chapterIndex: taskBook.meta.chapterIndex,
        renderedLength: rendered.length,
        sectionCount: sections.length,
      },
    });

    return rendered;
  }

  private buildLockedLayer(
    book: Book | undefined,
    materials: Material[]
  ): WritingTaskBook['locked'] {
    const genre = book?.description || '';
    const coreTone = '';
    const worldRules: string[] = [];

    const characterConstraints = materials
      .filter(m => m.type === 'character')
      .map(m => ({
        name: m.name,
        personality: (m as any).fields?.personalityCore || (m as any).fields?.personality || (m as any).description || '',
        currentGoal: (m as any).fields?.currentGoal || (m as any).fields?.goal || '',
      }));

    return {
      genre,
      coreTone,
      worldRules,
      characterConstraints,
    };
  }

  private buildChapterMission(sources: TaskBookSources): WritingTaskBook['chapterMission'] {
    const plotPoints: string[] = [];
    if (sources.plotPoints) {
      plotPoints.push(...sources.plotPoints);
    } else if (sources.chapterOutline) {
      const lines = sources.chapterOutline.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const trimmed = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.、]\s*/, '').trim();
        if (trimmed) plotPoints.push(trimmed);
      }
    }

    return {
      plotPoints,
      emotionalArc: sources.emotionalArc || '',
      hookRequirement: sources.hookRequirement || '章末设置悬念钩子',
      wordCountTarget: sources.wordCountTarget || 3000,
    };
  }

  private buildStateContext(
    prevState: ChapterStateCommit | null
  ): WritingTaskBook['stateContext'] | undefined {
    if (!prevState) return undefined;

    const activeEntities = Object.values(prevState.entityIndex);
    const openHooks = prevState.openHooks.filter(h => h.status === 'open');
    const recentTimeline = prevState.timeline.slice(-5);

    return {
      activeEntities,
      openHooks,
      recentTimeline,
      previousChapterSummary: prevState.chapterSummary,
    };
  }

  private buildWarnings(
    antiPatterns: AntiPattern[],
    reviewContract?: TaskBookSources['reviewContract']
  ): WritingTaskBook['warnings'] | undefined {
    const apTexts = antiPatterns
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 20)
      .map(ap => ap.text);

    const contractAPs = reviewContract?.antiPatterns || [];
    const allAPs = [...new Set([...apTexts, ...contractAPs])];

    if (allAPs.length === 0 && !reviewContract?.blockingRules?.length && !reviewContract?.genreRisks?.length) {
      return undefined;
    }

    return {
      antiPatterns: allAPs,
      blockingRules: reviewContract?.blockingRules || [],
      genreRisks: reviewContract?.genreRisks || [],
    };
  }

  private buildStyleLayer(
    step3Config?: TaskBookSources['step3Config']
  ): WritingTaskBook['style'] {
    const customRules: string[] = [];
    if (step3Config?.customRules) {
      customRules.push(step3Config.customRules);
    }

    return {
      writingStyle: step3Config?.writingStyle || '',
      customRules,
    };
  }

  private renderLockedLayer(locked: WritingTaskBook['locked']): string {
    const parts: string[] = [];

    if (locked.genre) {
      parts.push(`题材类型：${locked.genre}`);
    }
    if (locked.coreTone) {
      parts.push(`核心调性：${locked.coreTone}`);
    }
    if (locked.worldRules.length > 0) {
      parts.push(`世界观规则：`);
      for (const rule of locked.worldRules) {
        parts.push(`- ${rule}`);
      }
    }
    if (locked.characterConstraints.length > 0) {
      parts.push(`角色约束：`);
      for (const c of locked.characterConstraints) {
        let line = `- **${c.name}**`;
        if (c.personality) line += `：性格${c.personality}`;
        if (c.currentGoal) line += `；当前目标：${c.currentGoal}`;
        parts.push(line);
      }
    }

    if (parts.length === 0) return '';
    return `## 📋 不可变约束\n\n${parts.join('\n')}`;
  }

  private renderChapterMission(mission: WritingTaskBook['chapterMission']): string {
    const parts: string[] = [];

    if (mission.plotPoints.length > 0) {
      parts.push(`必须覆盖的情节点：`);
      for (let i = 0; i < mission.plotPoints.length; i++) {
        parts.push(`${i + 1}. ${mission.plotPoints[i]}`);
      }
    }
    if (mission.emotionalArc) {
      parts.push(`情感弧线：${mission.emotionalArc}`);
    }
    if (mission.hookRequirement) {
      parts.push(`悬念要求：${mission.hookRequirement}`);
    }
    if (mission.wordCountTarget > 0) {
      parts.push(`目标字数：约${mission.wordCountTarget}字`);
    }

    if (parts.length === 0) return '';
    return `## 🎯 本章任务\n\n${parts.join('\n')}`;
  }

  private renderStateContext(ctx: NonNullable<WritingTaskBook['stateContext']>): string {
    const parts: string[] = [];

    if (ctx.activeEntities.length > 0) {
      parts.push(`### 活跃角色/实体`);
      for (const entity of ctx.activeEntities) {
        const stateParts = Object.entries(entity.state)
          .map(([k, v]) => `${k}：${v}`)
          .join('，');
        parts.push(`- **${entity.name}**${stateParts ? '：' + stateParts : ''}`);
      }
    }

    if (ctx.openHooks.length > 0) {
      parts.push(`### 未关闭悬念`);
      const typeIcons: Record<string, string> = {
        mystery: '🔴',
        crisis: '🟡',
        promise: '🟢',
        revelation: '🔵',
      };
      for (let i = 0; i < ctx.openHooks.length; i++) {
        const hook = ctx.openHooks[i];
        const icon = typeIcons[hook.type] || '⚪';
        parts.push(`${i + 1}. ${icon} ${hook.description}（${hook.type} - 第${hook.raisedInChapter + 1}章提出）`);
      }
    }

    if (ctx.recentTimeline.length > 0) {
      parts.push(`### 近期事件`);
      for (const entry of ctx.recentTimeline) {
        const marker = entry.timeMarker ? `[${entry.timeMarker}]` : `[第${entry.chapterIndex + 1}章]`;
        parts.push(`- ${marker} ${entry.description}`);
      }
    }

    if (ctx.previousChapterSummary) {
      parts.push(`### 前章摘要`);
      parts.push(ctx.previousChapterSummary);
    }

    if (parts.length === 0) return '';
    return `## 📖 故事当前状态\n\n${parts.join('\n')}`;
  }

  private renderWarnings(warnings: NonNullable<WritingTaskBook['warnings']>): string {
    const parts: string[] = [];

    if (warnings.antiPatterns.length > 0) {
      parts.push(`### 已知反模式（务必避免）`);
      for (let i = 0; i < warnings.antiPatterns.length; i++) {
        parts.push(`${i + 1}. ${warnings.antiPatterns[i]}`);
      }
    }

    if (warnings.blockingRules.length > 0) {
      parts.push(`### 阻断规则`);
      for (const rule of warnings.blockingRules) {
        parts.push(`- ${rule}`);
      }
    }

    if (warnings.genreRisks.length > 0) {
      parts.push(`### 题材风险`);
      for (const risk of warnings.genreRisks) {
        parts.push(`- ${risk}`);
      }
    }

    if (parts.length === 0) return '';
    return `## ⚠️ 写作禁忌\n\n${parts.join('\n')}`;
  }

  private renderStyleLayer(style: WritingTaskBook['style']): string {
    const parts: string[] = [];

    if (style.writingStyle) {
      parts.push(`写作风格：${style.writingStyle}`);
    }
    if (style.povCharacter) {
      parts.push(`视角角色：${style.povCharacter}`);
    }
    if (style.customRules.length > 0) {
      parts.push(`自定义规则：`);
      for (const rule of style.customRules) {
        if (rule.includes('\n') || rule.length > 50) {
          parts.push(rule);
        } else {
          parts.push(`- ${rule}`);
        }
      }
    }

    if (parts.length === 0) return '';
    return `## ✍️ 风格与偏好\n\n${parts.join('\n')}`;
  }

  private async loadStateCommit(bookId: string, chapterIndex: number): Promise<ChapterStateCommit | null> {
    if (chapterIndex < 0) return null;
    try {
      const commit = await db.table<ChapterStateCommit>('chapterStateCommits')
        .where({ bookId, chapterIndex })
        .first();
      return commit || null;
    } catch {
      return null;
    }
  }

  private async loadAntiPatterns(bookId: string): Promise<AntiPattern[]> {
    try {
      return await db.table<AntiPattern>('antiPatterns')
        .where({ bookId })
        .toArray();
    } catch {
      return [];
    }
  }
}

export const taskBookComposer = new TaskBookComposer();
