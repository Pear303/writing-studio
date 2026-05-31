import type { LLMProvider, DialogueEntry } from '../../types';

export class GlmProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    this.modelId = modelId || 'glm-4-flash';
  }

  getProviderName(): string {
    return 'GLM';
  }

  getModelId(): string {
    return this.modelId;
  }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 2048,
      stream: true
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class QwenProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    this.modelId = modelId || 'qwen-plus';
  }

  getProviderName(): string { return 'Qwen'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 2048,
      stream: true
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class DeepSeekProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;
  private thinkingEnabled: boolean;
  private reasoningEffort: string;

  /** 上一次响应的 reasoning_content（思考链），可在 callApi 后读取 */
  lastReasoningContent: string | null = null;
  /** 上一次响应的 usage 信息 */
  lastUsage: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens?: number } | null = null;

  constructor(
    apiKey: string,
    apiUrl?: string,
    modelId?: string,
    thinkingEnabled?: boolean,
    reasoningEffort?: string
  ) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.deepseek.com/chat/completions';
    this.modelId = modelId || 'deepseek-v4-flash';
    // 官方默认思考模式为 enabled，reasoning_effort 默认 high
    this.thinkingEnabled = thinkingEnabled ?? true;
    this.reasoningEffort = reasoningEffort || 'high';
  }

  getProviderName(): string { return 'DeepSeek'; }
  getModelId(): string { return this.modelId; }

  setThinking(enabled: boolean, effort?: string): void {
    this.thinkingEnabled = enabled;
    if (effort) this.reasoningEffort = effort;
  }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 8192,
      thinking: { type: this.thinkingEnabled ? 'enabled' : 'disabled' },
      reasoning_effort: this.reasoningEffort,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 1,
    });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 8192,
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: this.thinkingEnabled ? 'enabled' : 'disabled' },
      reasoning_effort: this.reasoningEffort,
      frequency_penalty: 0,
      presence_penalty: 0,
      top_p: 1,
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(this.formatErrorMessage(response.status, errorText));
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    this.lastReasoningContent = null;
    this.lastUsage = null;

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);

          // 处理 usage（在 messages 流的最后一个 chunk 中）
          if (parsed.usage && parsed.choices?.length === 0) {
            this.lastUsage = {
              promptTokens: parsed.usage.prompt_tokens ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? 0,
              totalTokens: parsed.usage.total_tokens ?? 0,
              reasoningTokens: parsed.usage.completion_tokens_details?.reasoning_tokens,
            };
            continue;
          }

          // 收集 reasoning_content 增量
          const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content;
          if (reasoningDelta) {
            this.lastReasoningContent = (this.lastReasoningContent || '') + reasoningDelta;
            continue; // 不对外抛出 reasoning chunk，保持回调只收 content
          }

          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(this.formatErrorMessage(response.status, errorText));
    }
    return await response.text();
  }

  /**
   * 格式化 HTTP 错误为可读的中文提示
   */
  private formatErrorMessage(status: number, errorBody: string): string {
    const statusMessages: Record<number, string> = {
      400: '请求格式错误，请检查请求体参数',
      401: '认证失败，请检查 API Key 是否正确',
      402: '账户余额不足，请前往 DeepSeek 平台充值',
      422: '请求参数错误，请根据错误信息修改',
      429: '请求频率过高，请稍后重试',
      500: 'DeepSeek 服务器内部故障，请稍后重试',
      503: 'DeepSeek 服务器繁忙，请稍后重试',
    };
    const hint = statusMessages[status] || `HTTP ${status}`;
    return `DeepSeek API 调用失败 (${status}): ${hint} - ${errorBody.substring(0, 200)}`;
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);

    if (data.error) {
      throw new Error(`DeepSeek API 错误: ${data.error.message || JSON.stringify(data.error)}`);
    }

    if (data.usage) {
      this.lastUsage = {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
        reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
      };
    }

    const choice = data.choices?.[0]?.message;
    if (!choice) throw new Error('API 响应中没有返回内容');

    this.lastReasoningContent = choice.reasoning_content || null;

    const content = choice.content;
    if (!content) throw new Error('API 响应中没有返回内容');

    return content;
  }
}

export class GptProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.openai.com/v1/chat/completions';
    this.modelId = modelId || 'gpt-4o';
  }

  getProviderName(): string { return 'OpenAI'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 2048,
      stream: true
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class ClaudeProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.anthropic.com/v1/messages';
    this.modelId = modelId || 'claude-3-5-sonnet-20241022';
  }

  getProviderName(): string { return 'Claude'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, max_tokens: 2048 });
    const response = await this.sendRequest(body, {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    });
    return this.parseResponse(response);
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role === 'assistant' ? 'assistant' : 'user', content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.content?.[0]?.text;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private modelId: string;

  constructor(apiKey: string, _apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.modelId = modelId || 'gemini-2.0-flash-exp';
  }

  getProviderName(): string { return 'Gemini'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const contents = this.buildContents(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ contents, generationConfig: { temperature: 0.95, maxOutputTokens: 2048 } });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent?key=${this.apiKey}`;
    const response = await this.sendRequest(url, body);
    return this.parseResponse(response);
  }

  validateConfig(apiKey: string, _apiUrl: string): boolean {
    return !!apiKey;
  }

  private buildContents(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const contents: object[] = [];
    if (systemPrompt) contents.push({ role: 'model', parts: [{ text: systemPrompt }] });
    dialogueHistory.forEach(entry => contents.push({ role: entry.role === 'assistant' ? 'model' : 'user', parts: [{ text: entry.message }] }));
    contents.push({ role: 'user', parts: [{ text: userMessage }] });
    return contents;
  }

  private async sendRequest(url: string, body: string): Promise<string> {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class MiniMaxProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.minimax.io/v1/text/chatcompletion_v2';
    this.modelId = modelId || 'MiniMax-M2.5';
  }

  getProviderName(): string { return 'MiniMax'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 2048,
      stream: true
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class AzureProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;
  private apiVersion: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string, apiVersion: string = '2024-02-15-preview') {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || '';
    this.modelId = modelId || 'gpt-4';
    this.apiVersion = apiVersion;
  }

  getProviderName(): string { return 'Azure OpenAI'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    if (!this.apiUrl) throw new Error('Azure API URL is required');
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const url = `${this.apiUrl}?api-version=${this.apiVersion}`;
    const body = JSON.stringify({ messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(url, body, { 'api-key': this.apiKey, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.apiUrl) throw new Error('Azure API URL is required');
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const url = `${this.apiUrl}?api-version=${this.apiVersion}`;
    const body = JSON.stringify({ messages, temperature: 0.95, max_tokens: 2048, stream: true });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(url: string, body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}

export class CustomProvider implements LLMProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl: string, modelId: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.modelId = modelId;
  }

  getProviderName(): string { return 'Custom'; }
  getModelId(): string { return this.modelId; }

  async callApi(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({ model: this.modelId, messages, temperature: 0.95, max_tokens: 2048 });
    const response = await this.sendRequest(body, { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' });
    return this.parseResponse(response);
  }

  async callApiStream(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 2048,
      stream: true
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body,
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) throw new Error('Response body is null');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(userMessage: string, dialogueHistory: DialogueEntry[], systemPrompt: string): object[] {
    const messages: object[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    dialogueHistory.forEach(entry => messages.push({ role: entry.role, content: entry.message }));
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(body: string, headers: Record<string, string>): Promise<string> {
    const response = await fetch(this.apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    if (data.error) throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('API response has no content');
    return content;
  }
}