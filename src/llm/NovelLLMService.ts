import type { WritingStage, WritingContext } from '../hooks';
import { SmartPromptComposer, createComposer } from '../hooks';
import type { PipelineStep1Config, PipelineStep2State, OutlineRound } from '../types';

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
    const parts: string[] = [];
    if (config.genres.length > 0) {
      parts.push(`主题题材：${config.genres.join('、')}`);
    }
    if (config.plotType) {
      parts.push(`剧情类型：${config.plotType}`);
    }
    if (config.protagonistIdentity) {
      parts.push(`主角身份：${config.protagonistIdentity}`);
    }
    if (config.tone) {
      parts.push(`基调：${config.tone}`);
    }
    if (config.customPrompt.trim()) {
      parts.push(`额外要求：${config.customPrompt.trim()}`);
    }
    const userMessage = parts.length > 0
      ? `请根据以下设定生成小说大纲：\n${parts.join('\n')}`
      : '请帮我生成小说大纲';
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

    const currentParts: string[] = [];
    if (currentRound.additions.trim()) currentParts.push(`新增：${currentRound.additions.trim()}`);
    if (currentRound.deletions.trim()) currentParts.push(`删除：${currentRound.deletions.trim()}`);
    if (currentRound.modifications.trim()) currentParts.push(`修改：${currentRound.modifications.trim()}`);

    const userMessage = `你是一个小说大纲编辑助手。以下是用户的大纲迭代过程：

【原始大纲】
${step2State.originalOutline}

【当前大纲】
${step2State.currentOutline}
${historyLines.length > 0 ? `\n【历史修改记录】\n${historyLines.join('\n')}` : ''}

【本轮修改要求】
${currentParts.join('\n')}

请根据以上信息，在当前大纲基础上生成改进版大纲。只输出改进后的大纲内容，不要额外解释。`;

    const result = await this.generate('PLANNING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: currentParts.join('; '),
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
}

export const novelLLMService = new NovelLLMService();

export default NovelLLMService;