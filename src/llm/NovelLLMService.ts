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

  async generatePipelineDetailedOutline(
    outline: string,
    chapterCount: number,
  ): Promise<string> {
    const userMessage = `你是一个小说细纲生成助手。以下是大纲内容：

【大纲】
${outline}

请根据以上大纲，生成 ${chapterCount} 个章节的细纲。每个章节细纲需包含：
1. 章节标题
2. 核心情节点（3-5个）
3. 人物行动与动机
4. 悬念钩子（章末）
5. 与前后章节的关联

请按以下格式输出，每个章节用 "---" 分隔：

## 第1章：[章节标题]
核心情节点：
- ...
人物行动与动机：
- ...
悬念钩子：
- ...
与前后章节关联：
- ...
---
## 第2章：[章节标题]
...

只输出细纲内容，不要额外解释。`;

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

    const currentParts: string[] = [];
    if (currentRound.additions.trim()) currentParts.push(`新增：${currentRound.additions.trim()}`);
    if (currentRound.deletions.trim()) currentParts.push(`删除：${currentRound.deletions.trim()}`);
    if (currentRound.modifications.trim()) currentParts.push(`修改：${currentRound.modifications.trim()}`);

    const chaptersText = step4State.chapters.map(ch =>
      `## 第${ch.index + 1}章：${ch.title}\n${ch.content}`
    ).join('\n---\n');

    const userMessage = `你是一个小说细纲编辑助手。以下是用户的细纲迭代过程：

【原始大纲】
${outline}

【当前细纲】
${chaptersText}
${historyLines.length > 0 ? `\n【历史修改记录】\n${historyLines.join('\n')}` : ''}

【本轮修改要求】
${currentParts.join('\n')}

请根据以上信息，在当前细纲基础上生成改进版细纲。保持原有的格式和章节数量不变。只输出改进后的细纲内容，不要额外解释。`;

    const result = await this.generate('DETAILED_OUTLINE', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: currentParts.join('; '),
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

    const currentParts: string[] = [];
    if (currentRound.additions.trim()) currentParts.push(`新增：${currentRound.additions.trim()}`);
    if (currentRound.deletions.trim()) currentParts.push(`删除：${currentRound.deletions.trim()}`);
    if (currentRound.modifications.trim()) currentParts.push(`修改：${currentRound.modifications.trim()}`);

    const userMessage = `你是一个小说细纲编辑助手。用户只想对选中的章节细纲进行修改，其他章节保持不变。

【原始大纲】
${outline}

【选中的章节细纲（仅对这些章节进行修改）】
${selectedChaptersText}

【修改要求】
${currentParts.join('\n')}

请只输出修改后的选中章节细纲内容，保持原有格式。不要输出未选中的章节。只输出细纲内容，不要额外解释。`;

    const result = await this.generate('DETAILED_OUTLINE', userMessage, {
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

  async generatePipelineChapter(
    chapterIndex: number,
    chapterTitle: string,
    chapterOutline: string,
    previousChapterContent: string | null,
    outline: string,
    step3Config: { writingStyle: string; storyLength: string; customRules: string },
  ): Promise<string> {
    const styleParts: string[] = [];
    if (step3Config.writingStyle) styleParts.push(`写作风格：${step3Config.writingStyle}`);
    if (step3Config.storyLength) styleParts.push(`篇幅要求：${step3Config.storyLength}`);
    if (step3Config.customRules) styleParts.push(`自定义规则：${step3Config.customRules}`);

    const userMessage = `你是一个小说写作助手。请根据以下信息撰写章节正文。

【全书大纲概览】
${outline}

【当前章节细纲】
第${chapterIndex + 1}章：${chapterTitle}
${chapterOutline}
${previousChapterContent ? `\n【上一章正文（用于衔接）】\n${previousChapterContent.slice(-2000)}` : ''}
${styleParts.length > 0 ? `\n【风格与要求】\n${styleParts.join('\n')}` : ''}

请撰写第${chapterIndex + 1}章「${chapterTitle}」的完整正文。要求：
1. 紧扣细纲内容展开，不遗漏关键情节点
2. 与上一章自然衔接（如有）
3. 章末设置悬念钩子
4. 只输出正文内容，不要输出章节标题和额外说明`;

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

    const currentParts: string[] = [];
    if (currentRound.additions.trim()) currentParts.push(`新增：${currentRound.additions.trim()}`);
    if (currentRound.deletions.trim()) currentParts.push(`删除：${currentRound.deletions.trim()}`);
    if (currentRound.modifications.trim()) currentParts.push(`修改：${currentRound.modifications.trim()}`);

    const styleParts: string[] = [];
    if (step3Config.writingStyle) styleParts.push(`写作风格：${step3Config.writingStyle}`);
    if (step3Config.storyLength) styleParts.push(`篇幅要求：${step3Config.storyLength}`);
    if (step3Config.customRules) styleParts.push(`自定义规则：${step3Config.customRules}`);

    const userMessage = `你是一个小说编辑助手。请对以下章节正文进行修改。

【全书大纲概览】
${outline}

【当前章节正文】
${chapter.content}
${historyLines.length > 0 ? `\n【历史修改记录】\n${historyLines.join('\n')}` : ''}

【本轮修改要求】
${currentParts.join('\n')}
${styleParts.length > 0 ? `\n【风格与要求】\n${styleParts.join('\n')}` : ''}

请在当前正文基础上生成修改后的版本。只输出修改后的正文内容，不要额外解释。`;

    const result = await this.generate('CHAPTER_WRITING', userMessage, {
      novelType: '',
      protagonistTypes: [],
      plotTypes: [],
      coreIdea: currentParts.join('; '),
      chapterNumber: chapterIndex + 1,
      chapterTitle: chapter.title,
    });
    return result.content;
  }
}

export const novelLLMService = new NovelLLMService();

export default NovelLLMService;