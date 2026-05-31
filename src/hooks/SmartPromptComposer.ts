import type { WritingStage, WritingContext } from './usePrompt';
import { PROMPTS_INDEX, STAGE_TO_PROMPTS, STAGE_NAMES, type PromptCategory } from './prompts-index';
import { buildPromptForStage, getStageName } from './promptBuilders';
import { PROMPT_TEMPLATES } from '../prompts';

export interface ComposerOptions {
  enableCache?: boolean;
  customPrompts?: Map<string, string>;
  userOverrides?: Partial<WritingContext>;
}

export interface CompositionResult {
  systemPrompt: string;
  stage: WritingStage;
  stageName: string;
  loadedPrompts: string[];
  metadata: Array<{ fileName: string; title: string; priority: number }>;
}

export class SmartPromptComposer {
  private prompts: Map<string, string>;
  private cache: Map<string, string>;
  private options: ComposerOptions;
  
  constructor(prompts: Map<string, string>, options: ComposerOptions = {}) {
    this.prompts = prompts;
    this.cache = new Map();
    this.options = {
      enableCache: true,
      ...options,
    };
  }
  
  compose(stage: WritingStage, context?: Partial<WritingContext>): CompositionResult {
    if (stage === 'IDLE') {
      return this.emptyResult(stage);
    }
    
    const cacheKey = this.getCacheKey(stage, context);
    if (this.options.enableCache && this.cache.has(cacheKey)) {
      return this.fromCache(cacheKey, stage);
    }
    
    const mergedContext = { ...this.options.userOverrides, ...context };
    const systemPrompt = buildPromptForStage(stage, mergedContext, this.prompts);
    const stageName = STAGE_NAMES[stage];
    const loadedPrompts = STAGE_TO_PROMPTS[stage] || [];
    const metadata = this.getPromptMetadata(loadedPrompts);
    
    const result: CompositionResult = {
      systemPrompt,
      stage,
      stageName,
      loadedPrompts,
      metadata,
    };
    
    if (this.options.enableCache) {
      this.cache.set(cacheKey, systemPrompt);
    }
    
    return result;
  }
  
  composeForLLM(stage: WritingStage, userMessage: string, context?: Partial<WritingContext>): {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    metadata: CompositionResult;
  } {
    const composition = this.compose(stage, context);
    
    return {
      messages: [
        { role: 'system', content: composition.systemPrompt },
        { role: 'user', content: userMessage },
      ],
      metadata: composition,
    };
  }
  
  private getCacheKey(stage: WritingStage, context?: Partial<WritingContext>): string {
    const ctxKey = context ? JSON.stringify(context) : '';
    return `${stage}:${ctxKey}`;
  }
  
  private fromCache(cacheKey: string, stage: WritingStage): CompositionResult {
    const systemPrompt = this.cache.get(cacheKey) || '';
    const stageName = STAGE_NAMES[stage];
    const loadedPrompts = STAGE_TO_PROMPTS[stage] || [];
    
    return {
      systemPrompt,
      stage,
      stageName,
      loadedPrompts,
      metadata: this.getPromptMetadata(loadedPrompts),
    };
  }
  
  private emptyResult(stage: WritingStage): CompositionResult {
    return {
      systemPrompt: '',
      stage,
      stageName: '空闲',
      loadedPrompts: [],
      metadata: [],
    };
  }
  
  private getPromptMetadata(fileNames: string[]): Array<{ fileName: string; title: string; priority: number }> {
    return fileNames.map(fn => {
      const meta = PROMPTS_INDEX.get(fn);
      return {
        fileName: fn,
        title: meta?.title || fn,
        priority: meta?.priority || 99,
      };
    });
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  updatePrompts(newPrompts: Map<string, string>): void {
    this.prompts = newPrompts;
    this.clearCache();
  }
  
  addCustomPrompt(fileName: string, content: string): void {
    this.prompts.set(fileName, content);
    this.clearCache();
  }

  async loadTemplate(templateId: string): Promise<string> {
    const templateConfig = PROMPT_TEMPLATES[templateId];
    if (!templateConfig) {
      throw new Error(`未找到模板配置: ${templateId}`);
    }

    const userTemplate = await this.loadUserTemplate(templateConfig.file);
    if (userTemplate) {
      return userTemplate;
    }

    return await this.loadBuiltInTemplate(templateConfig.file);
  }

  async renderTemplate(templateId: string, variables: Record<string, any>): Promise<string> {
    const template = await this.loadTemplate(templateId);
    return this.replaceVariables(template, variables);
  }

  private replaceVariables(template: string, variables: Record<string, any>): string {
    template = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
      return variables[varName] ? content.trim() : '';
    });

    template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });

    return template;
  }

  private async loadUserTemplate(filePath: string): Promise<string | null> {
    return null;
  }

  private async loadBuiltInTemplate(filePath: string): Promise<string> {
    const modules = import.meta.glob('../prompts/templates/**/*.md', {
      query: '?raw',
      eager: true,
      import: 'default',
    });

    const normalizedPath = filePath.replace('./templates/', '../prompts/templates/');
    const content = modules[normalizedPath];

    if (typeof content === 'string') {
      return content;
    }

    throw new Error(`未找到模板文件: ${filePath}`);
  }

  clearTemplateCache(templateId?: string): void {
    if (import.meta.hot) {
      if (templateId) {
        const config = PROMPT_TEMPLATES[templateId];
        if (config) {
          const path = config.file.replace('./templates/', '../prompts/templates/');
          import.meta.hot.invalidate(`模板已更新: ${path}`);
        }
      } else {
        import.meta.hot.invalidate('所有模板缓存已清除');
      }
    }
  }
}

export function createComposer(prompts: Map<string, string>, options?: ComposerOptions): SmartPromptComposer {
  return new SmartPromptComposer(prompts, options);
}