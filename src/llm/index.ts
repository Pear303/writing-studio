import type { LLMProvider, LLMProviderType, LLMConfig, DialogueEntry } from '../types';
import {
  GlmProvider,
  QwenProvider,
  DeepSeekProvider,
  GptProvider,
  ClaudeProvider,
  GeminiProvider,
  AzureProvider,
  CustomProvider,
  MiniMaxProvider
} from './provider';

export type { LLMProvider, DialogueEntry };

export enum LlmProviderType {
  GLM = 'glm',
  QWEN = 'qwen',
  DEEPSEEK = 'deepseek',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
  MINIMAX = 'minimax',
  CUSTOM = 'custom',
}

export class LlmProviderFactory {
  static createProvider(config: LLMConfig): LLMProvider {
    const apiKey = this.decodeApiKey(config.apiKey);
    
    switch (config.provider) {
      case 'glm':
        return new GlmProvider(apiKey, config.apiUrl, config.model);
      case 'qwen':
        return new QwenProvider(apiKey, config.apiUrl, config.model);
      case 'deepseek':
        return new DeepSeekProvider(apiKey, config.apiUrl, config.model);
      case 'openai':
        return new GptProvider(apiKey, config.apiUrl, config.model);
      case 'anthropic':
        return new ClaudeProvider(apiKey, config.apiUrl, config.model);
      case 'google':
        return new GeminiProvider(apiKey, config.apiUrl, config.model);
      case 'azure':
        return new AzureProvider(apiKey, config.apiUrl, config.model);
      case 'minimax':
        return new MiniMaxProvider(apiKey, config.apiUrl, config.model);
      case 'custom':
        if (!config.apiUrl || !config.model) {
          throw new Error('Custom provider requires API URL and Model ID');
        }
        return new CustomProvider(apiKey, config.apiUrl, config.model);
      default:
        throw new Error(`Unknown provider type: ${config.provider}`);
    }
  }

  static createProviderByType(
    providerType: LLMProviderType,
    apiKey: string,
    modelId?: string,
    apiUrl?: string
  ): LLMProvider {
    switch (providerType) {
      case LlmProviderType.GLM:
        return new GlmProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.QWEN:
        return new QwenProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.DEEPSEEK:
        return new DeepSeekProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.OPENAI:
        return new GptProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.ANTHROPIC:
        return new ClaudeProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.GOOGLE:
        return new GeminiProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.AZURE:
        return new AzureProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.MINIMAX:
        return new MiniMaxProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.CUSTOM:
        if (!apiUrl || !modelId) {
          throw new Error('Custom provider requires API URL and Model ID');
        }
        return new CustomProvider(apiKey, apiUrl, modelId);
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }

  private static decodeApiKey(encodedKey: string): string {
    try {
      return atob(encodedKey);
    } catch {
      return encodedKey;
    }
  }
}

export class DialogueManager {
  private history: DialogueEntry[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 20) {
    this.maxHistorySize = maxHistorySize;
  }

  addUserMessage(message: string): void {
    this.history.push({ role: 'user', message });
    this.trimHistory();
  }

  addAssistantMessage(message: string): void {
    this.history.push({ role: 'assistant', message });
    this.trimHistory();
  }

  private trimHistory(): void {
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  getHistory(): DialogueEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  getHistoryCount(): number {
    return this.history.length;
  }
}

export async function callLLM(
  config: LLMConfig,
  userMessage: string,
  systemPrompt: string = '',
  dialogueHistory: DialogueEntry[] = []
): Promise<string> {
  const provider = LlmProviderFactory.createProvider(config);
  return await provider.callApi(userMessage, dialogueHistory, systemPrompt);
}

export async function testConnection(
  providerType: LLMProviderType,
  apiKey: string,
  apiUrl: string,
  model: string
): Promise<{ success: boolean; message: string; latency?: number }> {
  const startTime = Date.now();
  
  try {
    const provider = LlmProviderFactory.createProviderByType(providerType, apiKey, model, apiUrl);
    
    if (!provider.validateConfig(apiKey, apiUrl)) {
      return { success: false, message: '配置验证失败：API Key 或 API URL 为空' };
    }

    const response = await provider.callApi('Hello', [], 'Reply with "OK" if you receive this.');
    const latency = Date.now() - startTime;
    
    return { 
      success: true, 
      message: `连接成功！响应: ${response.substring(0, 50)}...`,
      latency 
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    return { 
      success: false, 
      message: error instanceof Error ? error.message : '未知错误',
      latency 
    };
  }
}