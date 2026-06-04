import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PROMPTS_INDEX,
  type WritingStage,
  type PromptCategory
} from './prompts-index';
import { buildPromptForStage } from './promptBuilders';

export interface PromptFile {
  fileName: string;
  title: string;
  description: string;
  category: string;
  stages: string[];
  priority: number;
  dependencies: string[];
}

interface PromptResourcesState {
  loaded: boolean;
  prompts: Map<string, string>;
  error: string | null;
}

export interface WritingContext {
  stage: WritingStage;
  novelType?: string;
  protagonistTypes?: string[];
  plotTypes?: string[];
  targetAudience?: string;
  coreIdea?: string;
  inspirationBits?: string;
  avoidElements?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  previousChapterSummary?: string;
  previousHook?: string;
  currentMystery?: string;
  wordCountTarget?: number;
  characterType?: 'protagonist' | 'antagonist' | 'supporting';
  characterName?: string;
  selectedText?: string;
  scene?: string;
  emotion?: string;
  customInstruction?: string;
  /** 任务书文本（请求级传递，替代全局变量 setTaskBookText） */
  taskBookText?: string;
}

const initialState: PromptResourcesState = {
  loaded: false,
  prompts: new Map(),
  error: null,
};

async function loadPromptFile(fileName: string): Promise<string> {
  const modules = import.meta.glob('../references/*.md', { query: '?raw', eager: true, import: 'default' });
  const path = `../references/${fileName}`;
  const content = modules[path];
  
  if (typeof content === 'string') {
    return content;
  }
  throw new Error(`无法加载提示词文件: ${fileName}`);
}

async function loadAllPrompts(): Promise<Map<string, string>> {
  const prompts = new Map<string, string>();
  
  for (const [fileName] of PROMPTS_INDEX) {
    try {
      const content = await loadPromptFile(fileName);
      prompts.set(fileName, content);
    } catch (error) {
      console.warn(`跳过提示词文件 ${fileName}:`, error);
    }
  }
  
  return prompts;
}

export function usePrompt() {
  const [resources, setResources] = useState<PromptResourcesState>(initialState);
  const [currentStage, setCurrentStage] = useState<WritingStage>('IDLE');
  const [context, setContext] = useState<WritingContext | null>(null);

  useEffect(() => {
    let mounted = true;
    
    async function loadPrompts() {
      try {
        const loadedPrompts = await loadAllPrompts();
        if (mounted) {
          setResources({ loaded: true, prompts: loadedPrompts, error: null });
        }
      } catch (error) {
        if (mounted) {
          setResources({
            loaded: false,
            prompts: new Map(),
            error: error instanceof Error ? error.message : '加载提示词失败',
          });
        }
      }
    }
    
    loadPrompts();
    return () => { mounted = false; };
  }, []);

  const getPrompt = useCallback((fileName: string): string | null => {
    return resources.prompts.get(fileName) || null;
  }, [resources.prompts]);

  const getPromptsForStage = useCallback((stage: WritingStage): string[] => {
    const promptFiles: string[] = [];
    for (const [fileName, metadata] of PROMPTS_INDEX) {
      if (metadata.stages.includes(stage)) {
        promptFiles.push(fileName);
      }
    }
    return promptFiles;
  }, []);

  const buildSystemPrompt = useCallback((stage: WritingStage, ctx?: Partial<WritingContext>): string => {
    if (!resources.loaded) return '';
    return buildPromptForStage(stage, ctx ?? {}, resources.prompts);
  }, [resources.loaded, resources.prompts]);

  const setStage = useCallback((stage: WritingStage, ctx?: Partial<WritingContext>) => {
    setCurrentStage(stage);
    setContext(ctx ? { stage, ...ctx } : { stage });
  }, []);

  const getStageMetadata = useCallback((stage: WritingStage): PromptFile[] => {
    const metadata: PromptFile[] = [];
    for (const [fileName, meta] of PROMPTS_INDEX) {
      if (meta.stages.includes(stage)) {
        metadata.push(meta);
      }
    }
    return metadata;
  }, []);

  const qualityCheck = useCallback(async (content: string, chapterContext: Partial<WritingContext>) => {
    const qualityPrompt = buildSystemPrompt('QUALITY_CHECK', {
      ...chapterContext,
      selectedText: content,
    } as WritingContext);
    
    return { score: 0,优点:[],改进点:[],建议:[] };
  }, [buildSystemPrompt]);

  const previewPrompts = useMemo(() => {
    if (!resources.loaded) return [];
    
    const stage = currentStage;
    if (stage === 'IDLE') return [];
    
    const files = getPromptsForStage(stage);
    return files.map(fileName => {
      const meta = PROMPTS_INDEX.get(fileName);
      const content = resources.prompts.get(fileName) || '';
      
      return {
        fileName,
        title: meta?.title || fileName,
        description: meta?.description || '',
        category: meta?.category || 'general',
        content: content.slice(0, 500),
        fullContent: content,
      };
    });
  }, [resources.loaded, currentStage, getPromptsForStage, resources.prompts]);

  return {
    loaded: resources.loaded,
    error: resources.error,
    currentStage,
    context,
    getPrompt,
    getPromptsForStage,
    buildSystemPrompt,
    setStage,
    getStageMetadata,
    qualityCheck,
    previewPrompts,
  };
}

export type { WritingStage };