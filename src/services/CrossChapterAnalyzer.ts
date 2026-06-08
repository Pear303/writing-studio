import type { CrossChapterAnalysis, BookSkeleton, PacingPoint } from '../types/book-deconstruction';
import type { ChapterFacts } from '../types/fact-extraction';
import { debugLogger } from './DebugLogger';
import { parseLlmJson } from '../utils/helpers';

const MAX_FACTS_PER_BATCH = 15;

export class CrossChapterAnalyzer {
  async analyze(
    skeleton: BookSkeleton,
    chapterFacts: ChapterFacts[],
    llmCall: (prompt: string) => Promise<string>,
    abortSignal?: AbortSignal,
  ): Promise<CrossChapterAnalysis> {
    if (abortSignal?.aborted) throw new Error('cancelled');

    const skeletonSummary = this.buildSkeletonSummary(skeleton);
    const validChapterFacts = chapterFacts.filter(f => !f.isFailed);

    // 章节数较少时单次调用
    if (validChapterFacts.length <= MAX_FACTS_PER_BATCH) {
      return this.analyzeSingleBatch(skeletonSummary, validChapterFacts, llmCall, abortSignal);
    }

    // 章节数较多时分批分析后合并
    return this.analyzeMultiBatch(skeletonSummary, validChapterFacts, llmCall, abortSignal);
  }

  private async analyzeSingleBatch(
    skeletonSummary: string,
    chapterFacts: ChapterFacts[],
    llmCall: (prompt: string) => Promise<string>,
    abortSignal?: AbortSignal,
  ): Promise<CrossChapterAnalysis> {
    if (abortSignal?.aborted) throw new Error('cancelled');

    const factsSummary = this.buildFactsSummary(chapterFacts);
    const prompt = this.buildPrompt(skeletonSummary, factsSummary);

    debugLogger.log({
      source: 'service',
      category: 'deconstruction',
      direction: 'CrossChapterAnalyzer.analyze → LLM (single batch)',
      userMessage: prompt.substring(0, 500),
      metadata: { chapterCount: chapterFacts.length, mode: 'single' },
    });

    const raw = await llmCall(prompt);
    return this.parseResult<CrossChapterAnalysis>(raw);
  }

  private async analyzeMultiBatch(
    skeletonSummary: string,
    chapterFacts: ChapterFacts[],
    llmCall: (prompt: string) => Promise<string>,
    abortSignal?: AbortSignal,
  ): Promise<CrossChapterAnalysis> {
    const batches: ChapterFacts[][] = [];
    for (let i = 0; i < chapterFacts.length; i += MAX_FACTS_PER_BATCH) {
      batches.push(chapterFacts.slice(i, i + MAX_FACTS_PER_BATCH));
    }

    // 分批提取跨章分析
    const partialResults: CrossChapterAnalysis[] = [];
    for (let b = 0; b < batches.length; b++) {
      if (abortSignal?.aborted) throw new Error('cancelled');

      const batchFacts = batches[b];
      const batchSummary = this.buildFactsSummary(batchFacts);
      const prompt = this.buildPrompt(skeletonSummary, batchSummary);

      debugLogger.log({
        source: 'service',
        category: 'deconstruction',
        direction: `CrossChapterAnalyzer.analyze → LLM (batch ${b + 1}/${batches.length})`,
        userMessage: prompt.substring(0, 500),
        metadata: { batchIndex: b, totalBatches: batches.length, chapterCount: batchFacts.length, mode: 'multi' },
      });

      const raw = await llmCall(prompt);
      partialResults.push(this.parseResult<CrossChapterAnalysis>(raw));
    }

    // 合并各批次结果
    return this.mergePartialResults(partialResults);
  }

  private mergePartialResults(results: CrossChapterAnalysis[]): CrossChapterAnalysis {
    if (results.length === 0) {
      return {
        characterArcs: [],
        suspenseTracking: [],
        plotLines: [],
        foreshadowingMap: [],
        pacingCurve: [],
        relationshipNetwork: [],
        worldRules: [],
      };
    }
    if (results.length === 1) return results[0];

    const merged: CrossChapterAnalysis = {
      characterArcs: [],
      suspenseTracking: [],
      plotLines: [],
      foreshadowingMap: [],
      pacingCurve: [],
      relationshipNetwork: [],
      worldRules: [],
    };

    // 合并人物弧线：同名角色取最完整的版本
    const arcMap = new Map<string, typeof results[0]['characterArcs'][0]>();
    for (const r of results) {
      for (const arc of r.characterArcs) {
        const existing = arcMap.get(arc.characterName);
        if (!existing || arc.keyTurningPoints.length > existing.keyTurningPoints.length) {
          arcMap.set(arc.characterName, arc);
        }
      }
    }
    merged.characterArcs = [...arcMap.values()];

    // 合并悬念追踪：按 suspenseId 去重，优先取 resolved 状态
    const suspenseMap = new Map<string, typeof results[0]['suspenseTracking'][0]>();
    for (const r of results) {
      for (const st of r.suspenseTracking) {
        const existing = suspenseMap.get(st.suspenseId);
        if (!existing || st.status === 'resolved' || (existing.status !== 'resolved' && st.chaptersInvolved.length > existing.chaptersInvolved.length)) {
          suspenseMap.set(st.suspenseId, st);
        }
      }
    }
    merged.suspenseTracking = [...suspenseMap.values()];

    // 合并剧情线：按 name 去重，合并 chapters
    const plotMap = new Map<string, typeof results[0]['plotLines'][0]>();
    for (const r of results) {
      for (const pl of r.plotLines) {
        const existing = plotMap.get(pl.name);
        if (!existing) {
          plotMap.set(pl.name, pl);
        } else {
          const mergedChapters = [...new Set([...existing.chapters, ...pl.chapters])].sort((a, b) => a - b);
          const mergedInterweave = [...new Set([...existing.interweaveWith, ...pl.interweaveWith])];
          plotMap.set(pl.name, { ...existing, chapters: mergedChapters, interweaveWith: mergedInterweave });
        }
      }
    }
    merged.plotLines = [...plotMap.values()];

    // 合并伏笔映射：按 planted.description 去重
    const foreshadowSeen = new Set<string>();
    for (const r of results) {
      for (const fm of r.foreshadowingMap) {
        const key = `${fm.planted.chapterIndex}:${fm.planted.description}`;
        if (!foreshadowSeen.has(key)) {
          foreshadowSeen.add(key);
          merged.foreshadowingMap.push(fm);
        }
      }
    }

    // 合并节奏曲线：按 chapterIndex 去重
    const pacingSeen = new Set<number>();
    for (const r of results) {
      for (const pp of r.pacingCurve) {
        if (!pacingSeen.has(pp.chapterIndex)) {
          pacingSeen.add(pp.chapterIndex);
          merged.pacingCurve.push(pp);
        }
      }
    }
    merged.pacingCurve.sort((a, b) => a.chapterIndex - b.chapterIndex);

    // 合并关系网络：按 from+to+type 去重，合并 evolution
    const relMap = new Map<string, typeof results[0]['relationshipNetwork'][0]>();
    for (const r of results) {
      for (const rn of r.relationshipNetwork) {
        const key = `${rn.from}->${rn.to}:${rn.type}`;
        const existing = relMap.get(key);
        if (!existing) {
          relMap.set(key, rn);
        } else {
          const mergedEvolution = [...existing.evolution];
          const seenChapters = new Set(existing.evolution.map(e => e.chapterIndex));
          for (const ev of rn.evolution) {
            if (!seenChapters.has(ev.chapterIndex)) {
              mergedEvolution.push(ev);
            }
          }
          mergedEvolution.sort((a, b) => a.chapterIndex - b.chapterIndex);
          relMap.set(key, { ...existing, evolution: mergedEvolution });
        }
      }
    }
    merged.relationshipNetwork = [...relMap.values()];

    // 合并世界观规则：去重
    const rulesSet = new Set<string>();
    for (const r of results) {
      for (const rule of r.worldRules) {
        rulesSet.add(rule);
      }
    }
    merged.worldRules = [...rulesSet];

    return merged;
  }

  private buildSkeletonSummary(skeleton: BookSkeleton): string {
    const parts: string[] = [];
    parts.push(`题材：${skeleton.meta.genre} | 基调：${skeleton.meta.coreTone}`);
    parts.push(`核心冲突：${skeleton.coreConflict}`);
    parts.push(`主题：${skeleton.themes.join('、')}`);
    parts.push(`结构类型：${skeleton.structureType} - ${skeleton.structureDescription}`);
    parts.push('\n章节概览：');
    for (const ch of skeleton.chapterSkeletons) {
      parts.push(`第${ch.index + 1}章 [${ch.role}/${ch.chapterType}] ${ch.title}：${ch.oneLineSummary}`);
    }
    parts.push('\n悬念线：');
    for (const sl of skeleton.suspenseLines) {
      const resolved = sl.resolvedInChapter != null ? `→ 第${sl.resolvedInChapter}章解决` : '（未解决）';
      parts.push(`[${sl.type}/${sl.hookType}] ${sl.description} (第${sl.raisedInChapter}章提出${resolved})`);
    }
    return parts.join('\n');
  }

  private buildFactsSummary(chapterFacts: ChapterFacts[]): string {
    const parts: string[] = [];
    for (const facts of chapterFacts) {
      const lines: string[] = [];
      lines.push(`--- 第${facts.chapterIndex + 1}章 ---`);
      if (facts.summary) lines.push(`摘要：${facts.summary}`);
      if (facts.entities.length > 0) {
        lines.push(`实体：${facts.entities.map(e => `${e.name}(${e.type})`).join(', ')}`);
      }
      if (facts.events.length > 0) {
        lines.push(`事件：${facts.events.map(e => e.description).join('；')}`);
      }
      if (facts.hooks.length > 0) {
        lines.push(`钩子：${facts.hooks.map(h => `[${h.type}]${h.description}`).join('；')}`);
      }
      if (facts.stateChanges.length > 0) {
        lines.push(`状态变更：${facts.stateChanges.map(sc => `${sc.entity}.${sc.attribute}: ${sc.from || '?'}→${sc.to}`).join('；')}`);
      }
      parts.push(lines.join('\n'));
    }
    return parts.join('\n\n');
  }

  private buildPrompt(skeletonSummary: string, factsSummary: string): string {
    const sections: string[] = [];
    sections.push('你是一个专业的小说叙事结构分析师，擅长分析跨章节的叙事脉络、人物弧线、悬念追踪和节奏变化。');
    sections.push('\n## 全书骨架');
    sections.push(skeletonSummary);
    sections.push('\n## 各章事实摘要');
    sections.push(factsSummary);
    sections.push('\n## 任务');
    sections.push('请基于以上结构化数据，进行跨章关联分析：');
    sections.push('\n1. 人物弧线：每个主要角色的状态变化轨迹（arcType: growth/fall/flat/transformation/corruption）');
    sections.push('2. 悬念线追踪：每条悬念线的完整生命周期（status: resolved/open/abandoned）');
    sections.push('3. 剧情线梳理：主线和各支线的交织关系（type: main/sub_a/sub_b/background）');
    sections.push('4. 伏笔-回收映射：前文伏笔在后文的回收点（quality: tight/good/loose/orphan）');
    sections.push('5. 节奏分析：每章紧张度0-10和节奏类型（slow/moderate/fast/explosive）');
    sections.push('6. 关系网络：角色间关系演变（type: ally/rival/mentor/lover/family/enemy/ambiguous）');
    sections.push('7. 世界观规则：从文本中推断的世界规则');
    sections.push('\n## ⚡ 输出要求');
    sections.push('严格 JSON 格式：');
    sections.push('```json');
    sections.push(JSON.stringify({
      characterArcs: [{ characterName: '角色名', arcType: 'growth', startState: '初始', endState: '结束', keyTurningPoints: [{ chapterIndex: 0, description: '转折' }], stateEvolution: '概述' }],
      suspenseTracking: [{ suspenseId: 's1', description: '描述', type: 'main', chaptersInvolved: [1, 3], status: 'resolved', resolutionQuality: 'satisfying' }],
      plotLines: [{ name: '复仇线', type: 'main', chapters: [1, 2], description: '描述', interweaveWith: ['爱情线'] }],
      foreshadowingMap: [{ planted: { chapterIndex: 1, description: '伏笔' }, harvested: { chapterIndex: 8, description: '回收' }, distance: 7, quality: 'good' }],
      pacingCurve: [{ chapterIndex: 0, tension: 5, pace: 'moderate', note: '日常铺设' }],
      relationshipNetwork: [{ from: 'A', to: 'B', type: 'ally', evolution: [{ chapterIndex: 1, change: '建立信任' }] }],
      worldRules: ['规则1'],
    }, null, 2));
    sections.push('```');
    return sections.join('\n');
  }

  private parseResult<T>(raw: string): T {
    return parseLlmJson<T>(raw);
  }
}
