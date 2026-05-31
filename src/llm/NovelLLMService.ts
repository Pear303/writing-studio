import type { WritingStage, WritingContext } from '../hooks';
import { SmartPromptComposer, createComposer } from '../hooks';
import type { PipelineStep1Config, PipelineStep2State, PipelineStep4State, PipelineStep5State, OutlineRound, DetailedOutlineRound, ChapterDraftRound } from '../types';

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
  
  init(prompts: Map<string,string>, config: LLMConfig): void {
    this.composer = createComposer(prompts, { enableCache: true });
    this.config = config;
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
          temperature: 0.7,
          max_tokens: 4000,
        } as LLMRequest),
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      return {
        content,
        usage: data.usage,
      };
    } catch (error) {
      console.error('[NovelLLMService] 生成失败:', error);
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
    const userMessage = await this.composer!.renderTemplate('outline-generate', {
      genres: config.genres.join('、'),
      plotType: config.plotType,
      protagonistIdentity: config.protagonistIdentity,
      tone: config.tone,
      customPrompt: config.customPrompt.trim(),
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
    const userMessage = await this.composer!.renderTemplate('detailed-generate', {
      outline,
      chapterCount,
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
  ): Promise<string> {
    const userMessage = await this.composer!.renderTemplate('chapter-generate', {
      outline,
      chapterIndex: chapterIndex + 1,
      chapterTitle,
      chapterOutline,
      previousChapterContent: previousChapterContent ? previousChapterContent.slice(-2000) : '',
      writingStyle: step3Config.writingStyle,
      storyLength: step3Config.storyLength,
      customRules: step3Config.customRules,
    });

    const result = await this.generate('CHAPTER_WRITING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: `撰写第${chapterIndex + 1}章：${chapterTitle}`,
      chapterNumber: chapterIndex + 1,
      chapterTitle,
    });

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

    const historyLines = chapter.rounds.map((r, i) => {
      const parts: string[] = [];
      if (r.additions.trim()) parts.push(`新增：${r.additions.trim()}`);
      if (r.deletions.trim()) parts.push(`删除：${r.deletions.trim()}`);
      if (r.modifications.trim()) parts.push(`修改：${r.modifications.trim()}`);
      return `第${i + 1}轮：${parts.join(' / ')}`;
    });

    const userMessage = await this.composer!.renderTemplate('chapter-refine', {
      outline,
      chapterContent: chapter.content,
      historyLines: historyLines.length > 0 ? historyLines.join('\n') : '',
      additions: currentRound.additions.trim(),
      deletions: currentRound.deletions.trim(),
      modifications: currentRound.modifications.trim(),
      writingStyle: step3Config.writingStyle,
      storyLength: step3Config.storyLength,
      customRules: step3Config.customRules,
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
}

export const novelLLMService = new NovelLLMService();

export default NovelLLMService;