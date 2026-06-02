import type { ChapterFacts, EntitySnapshot, StateChange, NarrativeEvent, TimelineEntry, HookEntry, ChapterStateCommit } from '../types/fact-extraction';
import { db } from '../db';

interface RawExtractionResult {
  entities?: Array<{
    name: string;
    type: 'character' | 'location' | 'item' | 'faction';
    state: Record<string, string>;
    firstAppearance: number;
    lastSeen: number;
  }>;
  stateChanges?: Array<{
    entityName: string;
    field: string;
    oldValue: string | null;
    newValue: string;
    reason: string;
  }>;
  events?: Array<{
    description: string;
    participants: string[];
    type: string;
    consequence: string;
  }>;
  timeline?: Array<{
    description: string;
    order: number;
    relativeTo: string;
  }>;
  hooks?: Array<{
    description: string;
    type: string;
    relatedEntities: string[];
  }>;
  summary?: string;
}

export class FactExtractor {
  async extractFromChapter(
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<ChapterFacts> {
    const prevState = await this.loadStateCommit(bookId, chapterIndex - 1);
    const previousStateSummary = prevState
      ? this.buildPreviousStateSummary(prevState)
      : '';

    const prompt = this.buildExtractionPrompt(
      chapterIndex,
      chapterTitle,
      chapterContent,
      previousStateSummary,
    );

    const rawResult = await llmCall(prompt);
    const parsed = this.parseRawResult(rawResult);

    const facts: ChapterFacts = {
      entities: this.normalizeEntities(parsed, chapterIndex),
      stateChanges: this.normalizeStateChanges(parsed),
      events: this.normalizeEvents(parsed),
      timeline: this.normalizeTimeline(parsed, chapterIndex),
      hooks: this.normalizeHooks(parsed, chapterIndex),
      summary: parsed.summary || '',
      extractedAt: Date.now(),
    };

    return facts;
  }

  async commitState(
    bookId: string,
    chapterIndex: number,
    facts: ChapterFacts,
  ): Promise<ChapterStateCommit> {
    const prevState = await this.loadStateCommit(bookId, chapterIndex - 1);
    const entityIndex = this.mergeEntities(
      prevState?.entityIndex || {},
      facts.entities,
    );
    const openHooks = this.mergeHooks(
      prevState?.openHooks || [],
      facts.hooks,
    );
    const timeline = [
      ...(prevState?.timeline || []),
      ...facts.timeline,
    ];

    const commit: ChapterStateCommit = {
      id: `${bookId}_ch${chapterIndex}`,
      bookId,
      chapterIndex,
      entityIndex,
      openHooks,
      timeline,
      chapterSummary: facts.summary,
      committedAt: Date.now(),
    };

    await db.chapterStateCommits.put(commit);
    return commit;
  }

  async loadStateCommit(bookId: string, chapterIndex: number): Promise<ChapterStateCommit | undefined> {
    if (chapterIndex < 0) return undefined;
    return db.chapterStateCommits.get(`${bookId}_ch${chapterIndex}`);
  }

  private buildExtractionPrompt(
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
    previousStateSummary: string,
  ): string {
    const sections: string[] = [];

    sections.push(`你是一个小说文本结构化分析专家。`);
    sections.push(`\n请从以下章节正文中提取结构化事实信息。`);

    sections.push(`\n## 章节信息`);
    sections.push(`第${chapterIndex + 1}章：${chapterTitle}`);

    sections.push(`\n## 章节正文`);
    sections.push(chapterContent.slice(0, 8000));

    if (previousStateSummary) {
      sections.push(`\n## 前文已知状态摘要`);
      sections.push(previousStateSummary);
    }

    sections.push(`\n## 输出要求`);
    sections.push(`严格按照以下 JSON 格式输出，不要输出任何其他内容：`);
    sections.push(`\n\`\`\`json`);
    sections.push(JSON.stringify({
      entities: [
        { name: '实体名称', type: 'character|location|item|faction', state: { key: 'value' }, firstAppearance: chapterIndex + 1, lastSeen: chapterIndex + 1 },
      ],
      stateChanges: [
        { entityName: '实体名称', field: '状态字段', oldValue: '旧值或null', newValue: '新值', reason: '变化原因' },
      ],
      events: [
        { description: '事件简述', participants: ['参与者1'], type: 'conflict|discovery|decision|revelation|relationship_change', consequence: '事件后果' },
      ],
      timeline: [
        { description: '时间描述', order: 1, relativeTo: '相对参照' },
      ],
      hooks: [
        { description: '悬念描述', type: 'question|promise|foreshadowing|mystery', relatedEntities: ['相关实体'] },
      ],
      summary: '章节概要（50-100字）',
    }, null, 2));
    sections.push(`\n\`\`\``);

    return sections.join('\n');
  }

  private buildPreviousStateSummary(commit: ChapterStateCommit): string {
    const parts: string[] = [];

    if (commit.chapterSummary) {
      parts.push(`前章概要：${commit.chapterSummary}`);
    }

    const entityNames = Object.keys(commit.entityIndex);
    if (entityNames.length > 0) {
      parts.push('\n已知实体状态：');
      for (const name of entityNames.slice(0, 20)) {
        const entity = commit.entityIndex[name];
        const stateEntries = Object.entries(entity.state)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        parts.push(`- ${name}(${entity.type}): ${stateEntries || '无特殊状态'}`);
      }
    }

    if (commit.openHooks.length > 0) {
      parts.push('\n未解决悬念：');
      for (const hook of commit.openHooks.slice(0, 10)) {
        parts.push(`- [${hook.type}] ${hook.description}`);
      }
    }

    return parts.join('\n');
  }

  private parseRawResult(raw: string): RawExtractionResult {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : raw;

    try {
      return JSON.parse(jsonStr.trim());
    } catch {
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          return JSON.parse(braceMatch[0]);
        } catch {
          return {};
        }
      }
      return {};
    }
  }

  private normalizeEntities(parsed: RawExtractionResult, chapterIndex: number): EntitySnapshot[] {
    if (!parsed.entities?.length) return [];
    return parsed.entities.map(e => ({
      name: e.name || '未知',
      type: e.type || 'character',
      state: e.state || {},
      firstAppearance: e.firstAppearance ?? chapterIndex + 1,
      lastSeen: e.lastSeen ?? chapterIndex + 1,
    }));
  }

  private normalizeStateChanges(parsed: RawExtractionResult): StateChange[] {
    if (!parsed.stateChanges?.length) return [];
    return parsed.stateChanges.map(sc => ({
      entity: sc.entityName || '未知',
      attribute: sc.field || '未知属性',
      from: sc.oldValue ?? undefined,
      to: sc.newValue || '',
      reason: sc.reason || undefined,
    }));
  }

  private normalizeEvents(parsed: RawExtractionResult): NarrativeEvent[] {
    if (!parsed.events?.length) return [];
    return parsed.events.map(e => ({
      description: e.description || '',
      participants: e.participants || [],
      significance: (e.type === 'conflict' || e.type === 'revelation') ? 'major' as const : 'minor' as const,
    }));
  }

  private normalizeTimeline(parsed: RawExtractionResult, chapterIndex: number): TimelineEntry[] {
    if (!parsed.timeline?.length) return [];
    return parsed.timeline.map(t => ({
      chapterIndex,
      timeMarker: t.relativeTo || undefined,
      description: t.description || '',
    }));
  }

  private normalizeHooks(parsed: RawExtractionResult, chapterIndex: number): HookEntry[] {
    if (!parsed.hooks?.length) return [];
    const typeMap: Record<string, HookEntry['type']> = {
      question: 'mystery',
      mystery: 'mystery',
      promise: 'promise',
      foreshadowing: 'revelation',
      revelation: 'revelation',
      crisis: 'crisis',
    };
    return parsed.hooks.map(h => ({
      description: h.description || '',
      type: typeMap[h.type] || 'mystery',
      status: 'open' as const,
      raisedInChapter: chapterIndex + 1,
    }));
  }

  private mergeEntities(
    prevIndex: Record<string, EntitySnapshot>,
    newEntities: EntitySnapshot[],
  ): Record<string, EntitySnapshot> {
    const merged: Record<string, EntitySnapshot> = { ...prevIndex };

    for (const entity of newEntities) {
      const existing = merged[entity.name];
      if (existing) {
        merged[entity.name] = {
          ...existing,
          state: { ...existing.state, ...entity.state },
          lastSeen: entity.lastSeen,
        };
      } else {
        merged[entity.name] = { ...entity };
      }
    }

    return merged;
  }

  private mergeHooks(prevHooks: HookEntry[], newHooks: HookEntry[]): HookEntry[] {
    const stillOpen = prevHooks.filter(h => h.status === 'open');
    return [...stillOpen, ...newHooks];
  }
}

export const factExtractor = new FactExtractor();
