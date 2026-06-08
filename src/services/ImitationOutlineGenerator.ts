import type {
  BookDeconstructionResult,
  BookSkeleton,
  CharacterArc,
  PacingPoint,
  SuspenseLine,
  ChapterSkeleton,
} from '../types/book-deconstruction';
import type {
  ImitationConfig,
  ImitationOutline,
  ImitationChapter,
  ImitationSuspenseLine,
  ImitationCharacterArc,
  ImitationPacingPoint,
  ImitationStrength,
  GenerateProgress,
} from '../types/imitation';
import { parseLlmJson } from '../utils/helpers';
import { debugLogger } from './DebugLogger';
import { v4 as uuidv4 } from 'uuid';

// ============ Step 1 结果 ============

interface Step1Result {
  title: string;
  genre: string;
  coreConflict: string;
  themes: string[];
  chapters: ImitationChapter[];
  suspenseLines: ImitationSuspenseLine[];
  characterArcs: ImitationCharacterArc[];
}

// ============ Step 2 结果 ============

interface Step2Result {
  pacingCurve: ImitationPacingPoint[];
}

// ============ 生成器 ============

export class ImitationOutlineGenerator {
  private static MAX_RETRIES = 2;

  async generate(
    deconstruction: BookDeconstructionResult,
    config: ImitationConfig,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: (progress: GenerateProgress) => void,
  ): Promise<ImitationOutline> {
    const skeleton = deconstruction.skeleton;
    if (!skeleton) throw new Error('拆书结果缺少骨架数据');

    // Step 1: 生成章节大纲 + 悬念线 + 角色弧线
    onProgress?.({ step: 'chapters', progress: 0.1, detail: '正在生成章节大纲...' });

    const step1Result = await this.withRetry(
      () => this.generateStep1(skeleton, deconstruction.crossAnalysis, config, llmCall),
      ImitationOutlineGenerator.MAX_RETRIES,
    );

    onProgress?.({ step: 'chapters', progress: 0.6, detail: '章节大纲已生成，正在生成节奏曲线...' });

    // Step 2: 生成节奏曲线（输入摘要化，避免 token 过大）
    const step2Result = await this.withRetry(
      () => this.generateStep2(skeleton, deconstruction.crossAnalysis, step1Result, config, llmCall),
      ImitationOutlineGenerator.MAX_RETRIES,
    );

    onProgress?.({ step: 'pacing', progress: 1.0, detail: '仿写大纲生成完成' });

    return this.assembleResult(deconstruction, config, step1Result, step2Result);
  }

  // ============ Step 1: 章节大纲 + 悬念线 + 角色弧线 ============

  private async generateStep1(
    skeleton: BookSkeleton,
    crossAnalysis: BookDeconstructionResult['crossAnalysis'],
    config: ImitationConfig,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<Step1Result> {
    const strengthDesc = this.getStrengthDescription(config.strength);
    const pacingDesc = this.getPacingDescription(config.pacingPreference);

    // 构建原书结构摘要（避免全量输入）
    const structureSummary = this.buildStructureSummary(skeleton, crossAnalysis);

    const prompt = `你是一位专业的小说结构分析师和仿写顾问。

## 任务
根据原书的结构分析，为新的故事生成仿写大纲。你需要保留原书"怎么讲故事"的技巧，但用全新的"讲什么"来填充。

## 原书结构摘要
${structureSummary}

## 仿写配置
- 仿写强度：${strengthDesc}
- 节奏偏好：${pacingDesc}
- 新主角：${config.protagonistName} — ${config.protagonistDescription}
- 新核心冲突：${config.coreConflict}
- 新题材/世界观：${config.genre}
${config.customPlotHint ? `- 自定义剧情走向：${config.customPlotHint}` : ''}
${config.title ? `- 新书名：${config.title}` : '- 新书名：请根据故事内容自动生成一个合适的书名'}

## 配角设定
${config.characters.map((c, i) => `${i + 1}. ${c.name}（${c.role}）：${c.description}${c.correspondsTo ? ` — 对应原书角色：${c.correspondsTo}` : ''}`).join('\n')}

## 输出要求
请严格按照以下 JSON 格式输出，不要添加任何其他文字：
\`\`\`json
{
  "title": "新书标题",
  "genre": "题材",
  "coreConflict": "核心冲突描述",
  "themes": ["主题1", "主题2"],
  "chapters": [
    {
      "index": 0,
      "title": "章节标题",
      "oneLineSummary": "一句话概括",
      "estimatedWordCount": 3000,
      "role": "setup",
      "majorCharacters": ["角色1", "角色2"],
      "keyEvent": "关键事件",
      "chapterType": "plot_advancing",
      "correspondsToChapter": 0
    }
  ],
  "suspenseLines": [
    {
      "id": "suspense-1",
      "description": "悬念描述",
      "type": "main",
      "hookType": "mystery",
      "raisedInChapter": 0,
      "resolvedInChapter": 5,
      "relatedEntities": ["角色1"],
      "correspondsToSuspenseId": "原书悬念ID（可选）"
    }
  ],
  "characterArcs": [
    {
      "characterName": "角色名",
      "arcType": "growth",
      "startState": "初始状态",
      "endState": "最终状态",
      "keyTurningPoints": [
        { "chapterIndex": 0, "description": "转折描述" }
      ],
      "stateEvolution": "演变过程描述"
    }
  ]
}
\`\`\`

## 重要约束
1. chapters 数组长度${config.strength === 'strict' ? '必须与原书一致（' + skeleton.chapterSkeletons.length + '章）' : config.strength === 'rhythmic' ? '应接近原书（' + skeleton.chapterSkeletons.length + '章左右）' : '可以自由调整，但应保持合理的叙事节奏'}
2. 每个章节的 correspondsToChapter 指向原书对应章节的 index
3. 角色弧线必须包含主角 ${config.protagonistName}
4. 悬念线必须有起有收，至少包含一条主线悬念
5. 所有文本使用中文`;

    debugLogger.log({ source: 'service', category: 'deconstruction', direction: 'imitation-step1-prompt', metadata: { promptLength: prompt.length } });
    const raw = await llmCall(prompt);
    debugLogger.log({ source: 'service', category: 'deconstruction', direction: 'imitation-step1-response', response: raw.substring(0, 500) });

    const parsed = parseLlmJson<Step1Result>(raw);
    this.validateStep1(parsed, config);
    return parsed;
  }

  // ============ Step 2: 节奏曲线 ============

  async generateStep2(
    skeleton: BookSkeleton,
    crossAnalysis: BookDeconstructionResult['crossAnalysis'],
    step1Result: Step1Result,
    config: ImitationConfig,
    llmCall: (prompt: string) => Promise<string>,
  ): Promise<Step2Result> {
    // 输入摘要化：只传原书节奏概要 + 新书章节列表
    const originalPacingSummary = crossAnalysis?.pacingCurve
      ?.map(p => `第${p.chapterIndex}章: 紧张度${p.tension}, 节奏${p.pace}`)
      .join('\n') || '无原书节奏数据';

    const newChaptersSummary = step1Result.chapters
      .map(c => `第${c.index}章 "${c.title}": ${c.oneLineSummary} (${c.chapterType})`)
      .join('\n');

    const prompt = `你是一位专业的小说节奏分析师。

## 任务
为仿写的新书生成节奏曲线。

## 原书节奏概要
${originalPacingSummary}

## 新书章节概要
${newChaptersSummary}

## 仿写配置
- 仿写强度：${this.getStrengthDescription(config.strength)}
- 节奏偏好：${this.getPacingDescription(config.pacingPreference)}

## 输出要求
请严格按照以下 JSON 格式输出，不要添加任何其他文字：
\`\`\`json
{
  "pacingCurve": [
    {
      "chapterIndex": 0,
      "tension": 5,
      "pace": "moderate",
      "note": "节奏说明"
    }
  ]
}
\`\`\`

## 重要约束
1. pacingCurve 数组长度必须与新书章节数一致（${step1Result.chapters.length}章）
2. tension 范围 1-10，1 最低 10 最高
3. pace 只能是: slow, moderate, fast, explosive
4. 整体节奏走势应${config.strength === 'strict' ? '尽量靠近原书' : config.strength === 'rhythmic' ? '参考原书整体走势' : '自由设计，但需有起有伏'}
5. 所有文本使用中文`;

    debugLogger.log({ source: 'service', category: 'deconstruction', direction: 'imitation-step2-prompt', metadata: { promptLength: prompt.length } });
    const raw = await llmCall(prompt);
    const parsed = parseLlmJson<Step2Result>(raw);
    this.validateStep2(parsed, step1Result.chapters.length);
    return parsed;
  }

  // ============ 辅助方法 ============

  private buildStructureSummary(
    skeleton: BookSkeleton,
    crossAnalysis: BookDeconstructionResult['crossAnalysis'],
  ): string {
    const parts: string[] = [];

    // 基本信息
    parts.push(`### 基本信息`);
    parts.push(`书名：${skeleton.meta.title}`);
    parts.push(`类型：${skeleton.meta.genre}（${skeleton.meta.subGenres.join('、')}）`);
    parts.push(`核心冲突：${skeleton.coreConflict}`);
    parts.push(`主题：${skeleton.themes.join('、')}`);
    parts.push(`结构：${skeleton.structureType} — ${skeleton.structureDescription}`);

    // 章节概要（精简版）
    parts.push(`\n### 章节概要（共${skeleton.chapterSkeletons.length}章）`);
    for (const cs of skeleton.chapterSkeletons) {
      parts.push(`第${cs.index + 1}章 "${cs.title}": ${cs.oneLineSummary} [${cs.role}/${cs.chapterType}]`);
    }

    // 悬念线
    if (skeleton.suspenseLines.length > 0) {
      parts.push(`\n### 悬念线`);
      for (const sl of skeleton.suspenseLines) {
        parts.push(`[${sl.type === 'main' ? '主线' : '副线'}] ${sl.description}（第${sl.raisedInChapter + 1}章提出${sl.resolvedInChapter != null ? `，第${sl.resolvedInChapter + 1}章解决` : '，未解决'}）`);
      }
    }

    // 角色弧线（精简版）
    if (crossAnalysis?.characterArcs?.length) {
      parts.push(`\n### 角色弧线`);
      for (const arc of crossAnalysis.characterArcs) {
        parts.push(`${arc.characterName}（${arc.arcType}）：${arc.startState} → ${arc.endState}`);
      }
    }

    return parts.join('\n');
  }

  private getStrengthDescription(strength: ImitationStrength): string {
    switch (strength) {
      case 'strict':
        return '严格复刻 — 章节角色和悬念布局尽量靠近原书';
      case 'rhythmic':
        return '参考节奏 — 保留整体节奏走势，内容自由发挥';
      case 'loose':
        return '自由发挥 — 只参考原书的结构类型和叙事手法';
    }
  }

  private getPacingDescription(pref: ImitationConfig['pacingPreference']): string {
    switch (pref) {
      case 'tighter':
        return '更紧凑 — 减少过渡章节，加快节奏';
      case 'same':
        return '与原书一致';
      case 'looser':
        return '更舒缓 — 增加过渡和氛围章节';
    }
  }

  private validateStep1(result: Step1Result, config: ImitationConfig): void {
    if (!result.chapters?.length) throw new Error('Step 1 结果缺少章节');
    if (!result.suspenseLines?.length) throw new Error('Step 1 结果缺少悬念线');
    if (!result.title) throw new Error('Step 1 结果缺少标题');

    // 检查主角弧线是否存在
    const hasProtagonistArc = result.characterArcs?.some(
      a => a.characterName === config.protagonistName,
    );
    if (!hasProtagonistArc) {
      throw new Error(`Step 1 结果缺少主角「${config.protagonistName}」的弧线数据，请重试`);
    }
  }

  private validateStep2(result: Step2Result, expectedLength: number): void {
    if (!result.pacingCurve?.length) throw new Error('Step 2 结果缺少节奏曲线');
    if (result.pacingCurve.length !== expectedLength) {
      debugLogger.log({ source: 'service', category: 'deconstruction', direction: 'imitation-validate', metadata: { note: `节奏点数(${result.pacingCurve.length})与章节数(${expectedLength})不一致，将补齐` } });
      // 补齐缺失的节奏点
      while (result.pacingCurve.length < expectedLength) {
        const lastPace = result.pacingCurve[result.pacingCurve.length - 1];
        result.pacingCurve.push({
          chapterIndex: result.pacingCurve.length,
          tension: lastPace?.tension || 5,
          pace: lastPace?.pace || 'moderate',
          note: '自动补充',
        });
      }
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        debugLogger.log({ source: 'service', category: 'deconstruction', direction: 'imitation-retry', metadata: { attempt: attempt + 1, error: String(lastError) } });
        if (attempt < maxRetries) {
          // 指数退避：1s, 2s
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }

  private assembleResult(
    deconstruction: BookDeconstructionResult,
    config: ImitationConfig,
    step1: Step1Result,
    step2: Step2Result,
  ): ImitationOutline {
    return {
      id: uuidv4(),
      deconstructionRefs: [{
        deconstructionId: deconstruction.id,
        sourceBookId: deconstruction.bookId,
        sourceBookTitle: deconstruction.skeleton?.meta.title || deconstruction.sourceFileName,
      }],
      config,
      title: step1.title,
      genre: step1.genre,
      coreConflict: step1.coreConflict,
      themes: step1.themes,
      chapters: step1.chapters,
      suspenseLines: step1.suspenseLines,
      characterArcs: step1.characterArcs,
      pacingCurve: step2.pacingCurve,
      status: 'completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}

export const imitationOutlineGenerator = new ImitationOutlineGenerator();
