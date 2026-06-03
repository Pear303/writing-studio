import type { WritingStage, WritingContext } from '../hooks';
import { SmartPromptComposer, createComposer, setTaskBookText } from '../hooks';
import type { PipelineStep1Config, PipelineStep2State, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound } from '../types';
import { taskBookComposer } from '../services/TaskBookComposer';
import { debugLogger } from '../services/DebugLogger';

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface LLMRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class NovelLLMService {
  private composer: SmartPromptComposer | null = null;
  private config: LLMConfig | null = null;
  private sessionPrefix: string | null = null;

  setSessionPrefix(prefix: string | null): void {
    this.sessionPrefix = prefix;
  }
  
  init(prompts: Map<string,string>, config: LLMConfig): void {
    this.composer = createComposer(prompts, { enableCache: true });
    this.config = config;
  }

  setUserTemplateOverride(templateId: string, content: string): void {
    this.composer?.setUserTemplateOverride(templateId, content);
  }

  removeUserTemplateOverride(templateId: string): void {
    this.composer?.removeUserTemplateOverride(templateId);
  }

  clearUserTemplateOverrides(): void {
    this.composer?.clearUserTemplateOverrides();
  }

  private extractOutlineSummary(outline: string, currentChapterIndex: number, maxChars: number = 1500): string {
    if (!outline || outline.length <= maxChars) return outline;

    const lines = outline.split('\n');
    const headings: string[] = [];
    let currentSection: string[] = [];
    let relevantSection: string[] = [];
    let foundRelevant = false;

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (currentSection.length > 0) {
          headings.push(currentSection.join('\n'));
        }
        currentSection = [line];
      } else {
        currentSection.push(line);
      }

      const chapterMatch = line.match(/第(\d+)[章节]/);
      if (chapterMatch) {
        const chNum = parseInt(chapterMatch[1], 10);
        if (Math.abs(chNum - currentChapterIndex) <= 1) {
          foundRelevant = true;
          relevantSection = [...currentSection];
        } else if (foundRelevant) {
          foundRelevant = false;
        }
      }
    }
    if (currentSection.length > 0) {
      headings.push(currentSection.join('\n'));
    }

    const allHeadings = lines.filter(l => l.trim().startsWith('#')).join('\n');
    const relevantText = relevantSection.join('\n');

    let summary = `【大纲结构】\n${allHeadings}\n\n【当前章节附近大纲】\n${relevantText}`;

    if (summary.length > maxChars) {
      summary = summary.slice(0, maxChars) + '\n...(大纲已截断)';
    }

    return summary;
  }
  
  async generate(
    stage: WritingStage,
    userMessage: string,
    context?: Partial<WritingContext>
  ): Promise<LLMResponse> {
    if (!this.composer || !this.config) {
      throw new Error('LLM服务未初始化');
    }
    
    const { messages, metadata } = this.composer.composeForLLM(stage, userMessage, context);

    // Debug: 记录提示词组装详情
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'prompt-compose',
      direction: `${metadata.stageName} → system prompt`,
      systemPrompt: metadata.systemPrompt,
      userMessage,
      variables: context as Record<string, unknown>,
      metadata: {
        stage,
        loadedPrompts: metadata.loadedPrompts,
        promptMetadata: metadata.metadata,
        model: this.config?.model,
        baseUrl: this.config?.baseUrl,
      },
    });

    const finalMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text: string; cache_control?: { type: string } }> }> = [];

    if (this.sessionPrefix) {
      finalMessages.push({
        role: 'system',
        content: [
          { type: 'text', text: this.sessionPrefix, cache_control: { type: 'ephemeral' } },
        ],
      });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        finalMessages.push({
          role: 'system',
          content: [
            { type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } },
          ],
        });
      } else {
        finalMessages.push(msg);
      }
    }
    
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: finalMessages,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Debug: 记录 LLM 调用结果
      debugLogger.log({
        source: 'manual-pipeline',
        category: 'llm-call',
        direction: `${stage} → ${this.config?.model}`,
        systemPrompt: messages.find(m => m.role === 'system')?.content,
        userMessage,
        fullMessages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
        response: content,
        responseLength: content.length,
        usage: data.usage,
        metadata: {
          stage,
          model: this.config?.model,
          baseUrl: this.config?.baseUrl,
        },
      });

      return {
        content,
        usage: data.usage,
      };
    } catch (error) {
      console.error('[NovelLLMService] 生成失败:', error);

      // Debug: 记录 LLM 调用失败
      debugLogger.log({
        source: 'manual-pipeline',
        category: 'llm-call',
        direction: `${stage} → ${this.config?.model}`,
        systemPrompt: messages.find(m => m.role === 'system')?.content,
        userMessage,
        error: error instanceof Error ? error.message : String(error),
        metadata: { stage, model: this.config?.model },
      });

      throw error;
    }
  }
  
  async generateRaw(prompt: string): Promise<LLMResponse> {
    if (!this.config) {
      throw new Error('LLM服务未初始化');
    }

    // Debug: 记录 generateRaw 调用
    debugLogger.log({
      source: 'service',
      category: 'llm-call',
      direction: `generateRaw → ${this.config.model}`,
      userMessage: prompt,
      metadata: { model: this.config.model, baseUrl: this.config.baseUrl },
    });

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: prompt },
    ];

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Debug: 记录 generateRaw 结果
      debugLogger.log({
        source: 'service',
        category: 'llm-call',
        direction: `generateRaw ← ${this.config.model}`,
        response: content,
        responseLength: content.length,
        usage: data.usage,
        metadata: { model: this.config.model },
      });

      return {
        content,
        usage: data.usage,
      };
    } catch (error) {
      console.error('[NovelLLMService] generateRaw失败:', error);

      // Debug: 记录 generateRaw 失败
      debugLogger.log({
        source: 'service',
        category: 'llm-call',
        direction: `generateRaw → ${this.config.model}`,
        userMessage: prompt,
        error: error instanceof Error ? error.message : String(error),
        metadata: { model: this.config.model },
      });

      throw error;
    }
  }

async generateOutline(project: {
    novelType: string;
    protagonistTypes: string[];
    plotTypes: string[];
    targetAudience: string;
    coreIdea: string;
    inspirationBits?: string;
    avoidElements?: string;
  }): Promise<string> {
    const result = await this.generate('PLANNING', '请帮我生成小说大纲', project);
    return result.content;
  }

  async generatePipelineOutline(config: PipelineStep1Config): Promise<string> {
    const variables = {
      genres: config.genres.join('、'),
      plotType: config.plotType,
      protagonistIdentity: config.protagonistIdentity,
      tone: config.tone,
      customPrompt: config.customPrompt.trim(),
    };
    const userMessage = await this.composer!.renderTemplate('outline-generate', variables);

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'PLANNING → outline-generate',
      templateId: 'outline-generate',
      templateFile: './templates/pipeline/02-outline-generate.md',
      variables,
      userMessage,
    });

    const result = await this.generate('PLANNING', userMessage, {
      novelType: config.genres.join(','),
      protagonistTypes: config.protagonistIdentity ? [config.protagonistIdentity] : [],
      plotTypes: config.plotType ? [config.plotType] : [],
      coreIdea: config.customPrompt.trim(),
    });

    return result.content;
  }

  async refinePipelineOutline(
    step2State: PipelineStep2State,
    currentRound: OutlineRound,
  ): Promise<string> {
    const historyLines = step2State.rounds.map((r, i) => {
      const parts: string[] = [];
      if (r.additions.trim()) parts.push(`新增：${r.additions.trim()}`);
      if (r.deletions.trim()) parts.push(`删除：${r.deletions.trim()}`);
      if (r.modifications.trim()) parts.push(`修改：${r.modifications.trim()}`);
      return `第${i + 1}轮：${parts.join(' / ')}`;
    });

    const userMessage = await this.composer!.renderTemplate('outline-refine', {
      originalOutline: step2State.originalOutline,
      currentOutline: step2State.currentOutline,
      historyLines: historyLines.length > 0 ? historyLines.join('\n') : '',
      additions: currentRound.additions.trim(),
      deletions: currentRound.deletions.trim(),
      modifications: currentRound.modifications.trim(),
    });

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'PLANNING → outline-refine',
      templateId: 'outline-refine',
      templateFile: './templates/pipeline/02-outline-refine.md',
      variables: { roundAdditions: currentRound.additions, roundDeletions: currentRound.deletions, roundModifications: currentRound.modifications },
      userMessage,
    });

    const result = await this.generate('PLANNING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: [
        currentRound.additions,
        currentRound.deletions,
        currentRound.modifications
      ].filter(Boolean).join('; '),
    });

    return result.content;
  }

  async generatePipelineDetailedOutline(
    outline: string,
    chapterCount: number,
  ): Promise<string> {
    const variables = { outline, chapterCount };
    const userMessage = await this.composer!.renderTemplate('detailed-generate', variables);

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'DETAILED_OUTLINE → detailed-generate',
      templateId: 'detailed-generate',
      templateFile: './templates/pipeline/04-detailed-generate.md',
      variables,
      userMessage,
    });

    const result = await this.generate('DETAILED_OUTLINE', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: `根据大纲生成${chapterCount}章细纲`,
    });

    return result.content;
  }

  async refinePipelineDetailedOutline(
    step4State: PipelineStep4State,
    currentRound: DetailedOutlineRound,
    outline: string,
  ): Promise<string> {
    const historyLines = step4State.rounds.map((r, i) => {
      const parts: string[] = [];
      if (r.additions.trim()) parts.push(`新增：${r.additions.trim()}`);
      if (r.deletions.trim()) parts.push(`删除：${r.deletions.trim()}`);
      if (r.modifications.trim()) parts.push(`修改：${r.modifications.trim()}`);
      return `第${i + 1}轮：${parts.join(' / ')}`;
    });

    const chaptersText = step4State.chapters.map(ch =>
      `## 第${ch.index + 1}章：${ch.title}\n${ch.content}`
    ).join('\n---\n');

    const userMessage = await this.composer!.renderTemplate('detailed-refine', {
      outline,
      chaptersText,
      historyLines: historyLines.length > 0 ? historyLines.join('\n') : '',
      additions: currentRound.additions.trim(),
      deletions: currentRound.deletions.trim(),
      modifications: currentRound.modifications.trim(),
    });

    const result = await this.generate('DETAILED_OUTLINE', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: [
        currentRound.additions,
        currentRound.deletions,
        currentRound.modifications
      ].filter(Boolean).join('; '),
    });

    return result.content;
  }

  async refinePipelineDetailedOutlineChapter(
    step4State: PipelineStep4State,
    chapterIndices: number[],
    currentRound: DetailedOutlineRound,
    outline: string,
  ): Promise<string> {
    const selectedChapters = step4State.chapters.filter(ch =>
      chapterIndices.includes(ch.index)
    );

    const selectedChaptersText = selectedChapters.map(ch =>
      `## 第${ch.index + 1}章：${ch.title}\n${ch.content}`
    ).join('\n---\n');

    const userMessage = await this.composer!.renderTemplate('detailed-refine-chapter', {
      outline,
      selectedChaptersText,
      additions: currentRound.additions.trim(),
      deletions: currentRound.deletions.trim(),
      modifications: currentRound.modifications.trim(),
    });

    const result = await this.generate('DETAILED_OUTLINE', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: [
        currentRound.additions,
        currentRound.deletions,
        currentRound.modifications
      ].filter(Boolean).join('; '),
    });

    return result.content;
  }
  
  async generateChapter(
    chapterNumber: number,
    chapterTitle: string,
    previousChapterSummary: string,
    previousHook: string,
    userInstruction?: string
  ): Promise<string> {
    const result = await this.generate(
      'CHAPTER_WRITING',
      userInstruction || `请帮我写第${chapterNumber}章：${chapterTitle}`,
      {
        chapterNumber,
        chapterTitle,
        previousChapterSummary,
        previousHook,
        wordCountTarget: 3000,
      }
    );
    return result.content;
  }

  async optimizeDialogue(
    dialogueText: string,
    scene: string,
    emotion: string
  ): Promise<string> {
    const result = await this.generate(
      'DIALOGUE',
      `请优化以下对话：\n${dialogueText}`,
      { selectedText: dialogueText, scene, emotion }
    );
    return result.content;
  }
  
  async qualityCheck(
    content: string,
    chapterNumber: number,
    previousHook: string
  ): Promise<string> {
    const result = await this.generate(
      'QUALITY_CHECK',
      `请评估以下章节质量：\n${content}`,
      { chapterNumber, previousHook }
    );
    return result.content;
  }
  
  async expandContent(
    content: string,
    targetWordCount: number
  ): Promise<string> {
    const result = await this.generate(
      'CONTENT_EXPANSION',
      `请将以下内容扩充到${targetWordCount}字：\n${content}`,
      { wordCountTarget: targetWordCount }
    );
    return result.content;
  }
  
  getMetadata(stage: WritingStage) {
    return this.composer?.compose(stage);
  }

  async generatePipelineChapter(
    chapterIndex: number,
    chapterTitle: string,
    chapterOutline: string,
    previousChapterContent: string | null,
    outline: string,
    step3Config: { writingStyle: string; storyLength: string; customRules: string },
    bookId?: string,
  ): Promise<string> {
    const outlineSummary = this.extractOutlineSummary(outline, chapterIndex + 1);

    this.sessionPrefix = `【全书大纲摘要（固定参考）】\n${outlineSummary}`;

    let taskBookText = '';
    if (bookId) {
      try {
        const taskBook = await taskBookComposer.compose(bookId, chapterIndex, {
          chapterTitle,
          chapterOutline,
          step3Config,
        });
        taskBookText = taskBookComposer.render(taskBook);
        setTaskBookText(taskBookText);
      } catch {
        setTaskBookText(null);
      }
    }

    const userMessage = await this.composer!.renderTemplate('chapter-generate', {
      taskBook: taskBookText || outlineSummary,
      outlineSummary,
      chapterIndex: chapterIndex + 1,
      chapterTitle,
      chapterOutline,
      previousChapterContent: previousChapterContent ? previousChapterContent.slice(-4000) : '',
      writingStyle: step3Config.writingStyle,
      storyLength: step3Config.storyLength,
      customRules: step3Config.customRules,
    });

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'CHAPTER_WRITING → chapter-generate',
      templateId: 'chapter-generate',
      templateFile: './templates/pipeline/05-chapter-generate.md',
      variables: {
        chapterIndex: chapterIndex + 1,
        chapterTitle,
        hasTaskBook: !!taskBookText,
        hasPreviousChapter: !!previousChapterContent,
        writingStyle: step3Config.writingStyle,
        storyLength: step3Config.storyLength,
      },
      userMessage,
      metadata: { bookId, chapterIndex },
    });

    const result = await this.generate('CHAPTER_WRITING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: `撰写第${chapterIndex + 1}章：${chapterTitle}`,
      chapterNumber: chapterIndex + 1,
      chapterTitle,
    });

    setTaskBookText(null);
    return result.content;
  }

  async refinePipelineChapter(
    step5State: PipelineStep5State,
    chapterIndex: number,
    currentRound: ChapterDraftRound,
    outline: string,
    step3Config: { writingStyle: string; storyLength: string; customRules: string },
  ): Promise<string> {
    const chapter = step5State.chapters.find(ch => ch.index === chapterIndex);
    if (!chapter) throw new Error('未找到章节');

    const outlineSummary = this.extractOutlineSummary(outline, chapterIndex + 1);

    this.sessionPrefix = `【全书大纲摘要（固定参考）】\n${outlineSummary}`;

    const historyLines = chapter.rounds.map((r, i) => {
      const parts: string[] = [];
      if (r.additions.trim()) parts.push(`新增：${r.additions.trim()}`);
      if (r.deletions.trim()) parts.push(`删除：${r.deletions.trim()}`);
      if (r.modifications.trim()) parts.push(`修改：${r.modifications.trim()}`);
      return `第${i + 1}轮：${parts.join(' / ')}`;
    });

    const userMessage = await this.composer!.renderTemplate('chapter-refine', {
      outlineSummary,
      chapterContent: chapter.content,
      historyLines: historyLines.length > 0 ? historyLines.join('\n') : '',
      additions: currentRound.additions.trim(),
      deletions: currentRound.deletions.trim(),
      modifications: currentRound.modifications.trim(),
      writingStyle: step3Config.writingStyle,
      storyLength: step3Config.storyLength,
      customRules: step3Config.customRules,
    });

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'CHAPTER_WRITING → chapter-refine',
      templateId: 'chapter-refine',
      templateFile: './templates/pipeline/05-chapter-refine.md',
      variables: {
        chapterIndex: chapterIndex + 1,
        chapterTitle: chapter.title,
        writingStyle: step3Config.writingStyle,
        storyLength: step3Config.storyLength,
      },
      userMessage,
      metadata: { chapterIndex },
    });

    const result = await this.generate('CHAPTER_WRITING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: [
        currentRound.additions,
        currentRound.deletions,
        currentRound.modifications
      ].filter(Boolean).join('; '),
      chapterNumber: chapterIndex + 1,
      chapterTitle: chapter.title,
    });

    return result.content;
  }

  async generatePipelineChaptersBatch(
    chapters: Array<{ index: number; title: string; outline: string }>,
    outline: string,
    step3Config: { writingStyle: string; storyLength: string; customRules: string },
    bookId?: string,
  ): Promise<Array<{ index: number; title: string; content: string }>> {
    const outlineSummary = this.extractOutlineSummary(outline, 0, 2000);

    this.sessionPrefix = `【全书大纲摘要（固定参考）】\n${outlineSummary}`;

    let taskBookText = '';
    if (bookId && chapters.length > 0) {
      try {
        const taskBook = await taskBookComposer.compose(bookId, chapters[0].index, {
          chapterTitle: chapters.map(ch => ch.title).join('、'),
          step3Config,
        });
        taskBookText = taskBookComposer.render(taskBook);
        setTaskBookText(taskBookText);
      } catch {
        setTaskBookText(null);
      }
    }

    const chaptersOutline = chapters.map(ch =>
      `### 第${ch.index + 1}章：${ch.title}\n${ch.outline}`
    ).join('\n\n');

    const userMessage = await this.composer!.renderTemplate('chapter-batch-generate', {
      taskBook: taskBookText || outlineSummary,
      outlineSummary,
      chaptersOutline,
      writingStyle: step3Config.writingStyle,
      storyLength: step3Config.storyLength,
      customRules: step3Config.customRules,
    });

    // Debug: 记录模板渲染
    debugLogger.log({
      source: 'manual-pipeline',
      category: 'template-render',
      direction: 'CHAPTER_WRITING → chapter-batch-generate',
      templateId: 'chapter-batch-generate',
      templateFile: './templates/pipeline/05-chapter-batch-generate.md',
      variables: {
        chapterCount: chapters.length,
        hasTaskBook: !!taskBookText,
        writingStyle: step3Config.writingStyle,
        storyLength: step3Config.storyLength,
      },
      userMessage,
      metadata: { bookId, chapterCount: chapters.length },
    });

    const result = await this.generate('CHAPTER_WRITING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: `批量撰写${chapters.length}章正文`,
    });

    setTaskBookText(null);
    return this.parseBatchChapters(result.content, chapters);
  }

  private parseBatchChapters(
    rawContent: string,
    chapters: Array<{ index: number; title: string; outline: string }>,
  ): Array<{ index: number; title: string; content: string }> {
    const results: Array<{ index: number; title: string; content: string }> = [];

    const chapterPattern = /---第(\d+)章---\s*([\s\S]*?)===第\1章结束===/g;
    let match: RegExpExecArray | null;

    while ((match = chapterPattern.exec(rawContent)) !== null) {
      const chNum = parseInt(match[1], 10);
      const content = match[2].trim();
      const chapterInfo = chapters.find(ch => ch.index + 1 === chNum);
      if (chapterInfo && content) {
        results.push({
          index: chapterInfo.index,
          title: chapterInfo.title,
          content,
        });
      }
    }

    if (results.length === 0) {
      const sections = rawContent.split(/---第\d+章---/).filter(s => s.trim());
      for (let i = 0; i < sections.length && i < chapters.length; i++) {
        const content = sections[i].replace(/===第\d+章结束===/g, '').trim();
        if (content) {
          results.push({
            index: chapters[i].index,
            title: chapters[i].title,
            content,
          });
        }
      }
    }

    if (results.length === 0 && rawContent.trim()) {
      results.push({
        index: chapters[0].index,
        title: chapters[0].title,
        content: rawContent.trim(),
      });
    }

    return results;
  }
}

export const novelLLMService = new NovelLLMService();

export default NovelLLMService;